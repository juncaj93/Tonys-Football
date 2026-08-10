import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Who may publish, and how that is enforced.
 *
 * ## Two halves, and neither is sufficient
 *
 * **The runtime half** exercises `requireAdmin()` — the single authorization
 * layer `16 §4.2` puts every protected page and action behind — with a real
 * session row and a real cookie, and asserts the three answers it can give. That
 * is where the rule lives.
 *
 * **The structural half** reads `app/actions/publication.ts` and asserts the
 * action *starts there* and never takes an actor from the form. A runtime test
 * of the service cannot see that: a service is exactly as authorized as its
 * callers, and the failure mode being guarded is a new action that forgets. It
 * is the same mechanism `app/actions/use-server-exports.test.ts` uses, for the
 * same reason — a rule about source is checked against source.
 *
 * ## Fail-closed is a property of the identity model, not a branch
 *
 * There is no `is_admin` system of this feature's own. Commissioner authority is
 * `users.is_admin`, and the **only** thing that ever sets it is the deploy
 * seed, from `COMMISSIONER_SLEEPER_USER_ID`. Unset, the seed grants it to
 * nobody, so every seat in the database answers `notFound()` at `requireAdmin()`
 * — the safe outcome is the *default* rather than a case somebody remembered to
 * write. `docs/ACTIVATION.md` still owns setting that variable in production,
 * and nothing here claims it is set.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

/* -------------------------------------------------------------------------- */
/* The structural half                                                        */
/* -------------------------------------------------------------------------- */

describe('the publication action’s authorization, as written', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'app', 'actions', 'publication.ts'),
    'utf8',
  );

  it('derives the actor from the session and never from the form', () => {
    expect(source).toContain('await requireAdmin()');
    expect(source).toContain('actorUserId: admin.user.id');

    /*
     * The failure this exists for: a form field named like an actor.
     *
     * The id on an approval row is the thing `16 §9` is enforced against, so a
     * request that could name its own approver would be a request that could
     * forge one. The form is allowed to say *which kind*, *which item* and
     * *which copy was read* — and nothing else.
     */
    const posted = [...source.matchAll(/formData\.get\('([^']+)'\)/g)].map((match) => match[1]);
    expect(posted.sort()).toEqual(['digest', 'id', 'kind']);
  });

  it('checks authority before it reads anything the request sent', () => {
    const auth = source.indexOf('await requireAdmin()');
    const firstRead = source.indexOf("formData.get('");

    expect(auth).toBeGreaterThan(-1);
    expect(firstRead).toBeGreaterThan(-1);
    expect(auth).toBeLessThan(firstRead);
  });
});

/* -------------------------------------------------------------------------- */
/* The runtime half                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `notFound()` and `redirect()` throw in Next; here they throw something this
 * file can recognise, so "which refusal" is an assertion rather than a guess.
 */
class NotFound extends Error {}
class Redirected extends Error {}

const cookieValue = { current: undefined as string | undefined };

/*
 * The cookie name is a literal because `vi.mock` factories are hoisted above
 * every import in the file. A test below asserts the literal still matches
 * `SESSION_COOKIE`, so a rename cannot leave this quietly reading nothing and
 * passing every refusal assertion for the wrong reason.
 */
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'tonys_session' && cookieValue.current !== undefined
          ? { name, value: cookieValue.current }
          : undefined,
    }),
  headers: () => Promise.resolve(new Headers()),
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new NotFound('not found');
  },
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));

describe.skipIf(!hasDatabase)('requireAdmin', () => {
  const load = async () => ({
    db: (await import('@/lib/db')).getDb(),
    requireAdmin: (await import('@/lib/auth/current-user')).requireAdmin,
    schema: await import('@/lib/db/schema'),
    helpers: await import('@/lib/db/test-helpers'),
    session: await import('@/lib/auth/session'),
    clock: await import('@/lib/clock'),
  });

  type Loaded = Awaited<ReturnType<typeof load>>;
  let mod: Loaded;

  /**
   * The session secret, set by the test rather than by the environment.
   *
   * `mintSession` refuses to sign without one — deliberately, so a deployment
   * cannot ship cookies nobody can invalidate — and `ci.yml` does not set it,
   * because until now nothing in the ordinary suite minted a session. This is
   * the convention `lib/auth/session.test.ts` and `service.test.ts` already
   * follow: the secret belongs to the test, not to the runner, so the suite
   * passes on any machine and no shared workflow file grows a variable for one
   * file's benefit. Restored afterwards, since vitest shares the process.
   */
  const SECRET = 'a-test-secret-not-a-real-one-thirty-two';
  let previousSecret: string | undefined;

  beforeEach(async () => {
    previousSecret = process.env['SESSION_SECRET'];
    process.env['SESSION_SECRET'] = SECRET;

    mod = await load();
    await mod.helpers.resetDatabase(mod.db);
    mod.clock.setFixedClock('2026-08-01T12:00:00Z');
    cookieValue.current = undefined;
  });

  afterEach(() => {
    mod.clock.clearClock();
    if (previousSecret === undefined) delete process.env['SESSION_SECRET'];
    else process.env['SESSION_SECRET'] = previousSecret;
  });

  afterAll(async () => {
    const { closePool } = await import('@/lib/db');
    await closePool();
  });

  /**
   * A seat with a live session, and its cookie.
   *
   * The session row is minted directly rather than driven through `claimManager`
   * — claiming requires a seat in the open season, which is fixture setup for a
   * different subsystem. What is under test is the layer *above* the session:
   * cookie in, authority out. `resolveSession` still does all the real work.
   */
  async function seat(input: { isAdmin: boolean }): Promise<string> {
    const [user] = await mod.db
      .insert(mod.schema.users)
      .values({
        displayName: input.isAdmin ? 'Commissioner' : 'A manager',
        sleeperUserId: input.isAdmin ? 'commish-1' : 'manager-1',
        isAdmin: input.isAdmin,
      })
      .returning({ id: mod.schema.users.id });

    const minted = mod.session.mintSession();
    const at = mod.clock.now();

    await mod.db.insert(mod.schema.sessions).values({
      userId: user!.id,
      tokenHash: minted.tokenHash,
      deviceLabel: 'a test',
      createdAt: at,
      lastSeenAt: at,
      expiresAt: new Date(at.getTime() + 90 * 24 * 60 * 60 * 1000),
    });

    return minted.cookieValue;
  }

  it('sends a signed-out visitor to the door', async () => {
    await expect(mod.requireAdmin()).rejects.toBeInstanceOf(Redirected);
  });

  /**
   * A signed-in manager who is not the commissioner gets a **404**, not a 403.
   *
   * The distinction is the product's, and it is deliberate: a 403 confirms the
   * screen exists. This is the same answer the demo guard and the cron secret
   * give, for the same reason.
   */
  it('answers a signed-in manager with not-found, not forbidden', async () => {
    cookieValue.current = await seat({ isAdmin: false });
    await expect(mod.requireAdmin()).rejects.toBeInstanceOf(NotFound);
  });

  it('lets the commissioner through', async () => {
    cookieValue.current = await seat({ isAdmin: true });
    const resolved = await mod.requireAdmin();
    expect(resolved.user.isAdmin).toBe(true);
  });

  /**
   * Fail-closed, asked of the database rather than of a mock.
   *
   * With no `COMMISSIONER_SLEEPER_USER_ID`, the seed grants `is_admin` to
   * nobody — so this is what every seat in that database looks like, including
   * the person who will eventually be the commissioner.
   */
  it('refuses everybody when no seat carries the commissioner flag', async () => {
    cookieValue.current = await seat({ isAdmin: true });
    await mod.db.update(mod.schema.users).set({ isAdmin: false });
    await expect(mod.requireAdmin()).rejects.toBeInstanceOf(NotFound);
  });

  it('refuses a token nobody issued', async () => {
    cookieValue.current = 'a-token-nobody-issued';
    await expect(mod.requireAdmin()).rejects.toBeInstanceOf(Redirected);
  });

  /**
   * The mock above reads one cookie name, as a literal it cannot import.
   *
   * If the product renames the cookie, every refusal assertion in this file
   * would keep passing — for the wrong reason, because the mock would hand back
   * nothing and everybody would look signed out. This is the assertion that
   * turns that into a failure.
   */
  it('is reading the cookie the product actually sets', () => {
    expect(mod.session.SESSION_COOKIE).toBe('tonys_session');
  });
});
