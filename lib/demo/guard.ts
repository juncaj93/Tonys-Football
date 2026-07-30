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
