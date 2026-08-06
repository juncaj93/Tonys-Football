/**
 * What stops the demo tooling from ever touching the league.
 *
 * `MANDATE §8` asks for two things that sound similar and are not: demo tooling
 * must be **unavailable to ordinary production users**, and it must **not alter
 * production data**. A single environment check only gives you the first one,
 * and it gives it badly — one mis-set variable and a demo command rewrites the
 * commissioner's season.
 *
 * So there are two independent guards, and neither is sufficient alone.
 *
 * ## 1. It refuses to run in production at all
 *
 * `VERCEL_ENV === 'production'` is a hard stop, and the opt-in `DEMO_FIXTURES`
 * has to be set on purpose. Both, not either. Absence of an opt-in is not the
 * same as presence of a refusal, and a variable that is unset in the shell you
 * happen to be in is not a safety property.
 *
 * ## 2. It cannot write to a real manager even if guard 1 fails
 *
 * This is the one that actually matters. Every demo state is applied to a
 * **reserved demo seat** — a user whose Sleeper id carries {@link DEMO_PREFIX},
 * which no real manager's ever will, because real ids come from Sleeper and are
 * numeric. The seat is created by the demo tool and only ever written by it.
 *
 * A bug in the environment check therefore costs a wrong-environment *demo
 * manager*, not a corrupted league. That is the difference between a guard and
 * a policy: guard 1 is a policy about where the command may run, guard 2 is a
 * property of what it is able to address.
 *
 * ## 3. It refuses any database that is not local
 *
 * Added for the temporary public-visibility period, and it closes the one hole
 * the first two left. `VERCEL_ENV` is set *by Vercel*; a demo command run from a
 * laptop with `DATABASE_URL` pointed at the production branch has no `VERCEL_ENV`
 * at all, so guard 1 passes and guard 2 dutifully creates a demo seat — in
 * production. Guard 2 keeps that from touching a real manager, which is why it
 * is survivable, but a demo seat in production is a **credential**: it carries a
 * known PIN and can carry `isAdmin`.
 *
 * So the target is now checked directly, not the environment around it. Only an
 * unmistakably local host is allowed and **everything else fails closed** —
 * unknown, malformed, socket-only or unparseable URLs are all treated as remote,
 * because a URL this code cannot understand is not one it may assume is safe.
 *
 * `scripts/dev-db.sh`'s `refuse_remote()` is the repository precedent; this is
 * the same rule where the writes actually happen.
 */

/** Marks a seat as belonging to the demo system. Real Sleeper ids are numeric. */
export const DEMO_PREFIX = 'demo:';

/** Is this a demo seat rather than a manager's? */
export function isDemoSeat(sleeperUserId: string): boolean {
  return sleeperUserId.startsWith(DEMO_PREFIX);
}

export class DemoRefused extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'DemoRefused';
  }
}

/**
 * Throws unless demo tooling is allowed to run here.
 *
 * Takes the environment as a parameter rather than reading `process.env`, so a
 * test can prove the refusals instead of asserting that a string appears in the
 * source. A guard nobody can exercise is a comment.
 */
/**
 * Hosts that are unmistakably a developer's own machine.
 *
 * An allow-list, never a deny-list. A deny-list of known hosting providers is a
 * list that is out of date the moment somebody uses a provider nobody thought
 * of, and the cost of being wrong here is a demo seat in a real league.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/*
 * `0.0.0.0` is deliberately absent. It means "every interface" rather than "this
 * machine", and a rule that has to be explained is a rule that will be wrong
 * eventually — ambiguous is treated as remote, which is the whole policy here.
 */

/**
 * Is this connection string pointing at a local database?
 *
 * Fails closed. Anything unparseable, hostless, or unrecognised is remote.
 */
export function isLocalDatabaseUrl(url: string | undefined): boolean {
  if (url === undefined || url.trim() === '') return false;

  let host: string;
  try {
    // `URL` handles `postgres://user:pass@host:5432/db` and normalises IPv6.
    host = new URL(url).hostname;
  } catch {
    return false;
  }

  if (host === '') return false;

  /*
   * `URL.hostname` returns IPv6 hosts bracketed — `[::1]` — so the brackets are
   * stripped rather than a second spelling being added to the set. One
   * representation, one place to reason about.
   */
  const bare = host.toLowerCase().replace(/^\[|\]$/g, '');
  return LOCAL_HOSTS.has(bare);
}

export function assertDemoAllowed(env: Record<string, string | undefined>): void {
  if (env['VERCEL_ENV'] === 'production') {
    throw new DemoRefused(
      'Demo fixtures never run against production. This is not overridable — ' +
        'if you need a state to look at, use a preview deployment or a local database.',
    );
  }

  if (env['DEMO_FIXTURES'] !== '1') {
    throw new DemoRefused(
      'Demo fixtures are opt-in. Set DEMO_FIXTURES=1 to confirm you know which ' +
        'database DATABASE_URL is pointing at.',
    );
  }
}

/**
 * The same guard, plus: the database must be local.
 *
 * **Separate from `assertDemoAllowed` on purpose**, and the reason is a
 * regression this nearly shipped. Six modules call the guard above, and five of
 * them — the board states, the Slice editions, the character previews, the
 * reveal previews, the empty-desk preview — **write nothing**. They render a
 * throwaway view of real data and are meant to work on a Vercel *preview*
 * deployment, which points at the remote Neon sandbox branch. Requiring a local
 * database there would have broken every preview state the reviewer looks at.
 *
 * Only `lib/demo/apply.ts` creates seats, and a seat is what carries the risk:
 * it has a PIN and it can carry `isAdmin`. So the strict rule guards the write
 * path, and the render path keeps the two checks that were always right for it.
 *
 * This is the guard that still holds when every environment variable is wrong —
 * including when none is set at all, which is precisely the laptop case
 * `VERCEL_ENV` cannot see.
 */
export function assertDemoWritesAllowed(env: Record<string, string | undefined>): void {
  assertDemoAllowed(env);

  if (!isLocalDatabaseUrl(env['DATABASE_URL'])) {
    throw new DemoRefused(
      'Demo fixtures only write to a local database. DATABASE_URL is not ' +
        'localhost, and a demo seat carries a known PIN — creating one anywhere ' +
        'real is creating a credential. Point DATABASE_URL at a local Postgres ' +
        '(npm run db:up) and try again.',
    );
  }
}

/**
 * Throws if a demo state is about to be applied to a real manager.
 *
 * Called with the seat the tool resolved, immediately before it writes. Guard 2
 * of the two above, and the reason a mistake in guard 1 is survivable.
 */
export function assertDemoSeat(sleeperUserId: string): void {
  if (!isDemoSeat(sleeperUserId)) {
    throw new DemoRefused(
      `Refusing to apply a demo state to ${sleeperUserId}: demo fixtures only ever ` +
        `write to a reserved seat prefixed "${DEMO_PREFIX}". A real manager's season is not a fixture.`,
    );
  }
}
