import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { clearClock, setClockSource, setFixedClock } from '@/lib/clock';
import { closePool, getDb } from '@/lib/db';
import { resetDatabase } from '@/lib/db/test-helpers';
import {
  adminAuditLogs,
  authAttempts,
  seasonMemberships,
  seasons,
  sessions,
  users,
} from '@/lib/db/schema';

import {
  claimManager,
  listDevices,
  doorManager,
  listDoorManagers,
  resetPin,
  resolveSession,
  signIn,
  signOut,
  signOutEverywhere,
} from './service';
import { hashToken, SESSION_TTL_DAYS, tokenHashFromCookie } from './session';

/**
 * Authentication against a real database.
 *
 * `17 §7` makes authentication its own PR checkpoint — "security surface,
 * reviewed before anyone can log in" — and these are the assertions that
 * review rests on. They run against real Postgres because the questions are
 * about what is actually stored and what the constraints actually allow.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

const CONTEXT = {
  ipHash: 'test-ip-hash',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) Safari/604.1',
};

const GOOD_PIN = '284917';

const START = Date.parse('2026-07-28T12:00:00Z');

/**
 * A clock that advances a few seconds every time it is read.
 *
 * A frozen clock stamps every login attempt with the identical instant, and
 * "failures since your last success" then has no order to work with. Real time
 * never does that — an argon2 verification alone takes over a hundred
 * milliseconds — so freezing it here would be testing a situation that cannot
 * occur and missing the ones that can.
 */
function advancingClock(): void {
  let current = START;
  setClockSource(() => {
    current += 5_000;
    return new Date(current);
  });
}

describe.skipIf(!hasDatabase)('authentication', () => {
  beforeEach(async () => {
    process.env['SESSION_SECRET'] = 'test-secret-not-a-real-one';
    delete process.env['CLAIM_CODE'];
    advancingClock();

    await resetDatabase(db!);
  });

  afterAll(async () => {
    clearClock();
    delete process.env['SESSION_SECRET'];
    if (hasDatabase) await closePool();
  });

  async function league() {
    const [season] = await db!
      .insert(seasons)
      .values({ year: 2026, status: 'DRAFT_PREP' })
      .returning();

    const inserted = await db!
      .insert(users)
      .values([{ displayName: 'BigJuncer' }, { displayName: 'MattyB2317' }])
      .returning();

    const [alex, matty] = inserted as [(typeof inserted)[number], (typeof inserted)[number]];

    await db!.insert(seasonMemberships).values([
      { seasonId: season!.id, userId: alex.id, rosterId: 1 },
      { seasonId: season!.id, userId: matty.id, rosterId: 10 },
    ]);

    return { season: season!, alex, matty };
  }

  describe('the door', () => {
    it('lists this season’s managers and whether they hold a key', async () => {
      const { alex } = await league();

      let managers = await listDoorManagers(db!);
      expect(managers.map((manager) => manager.displayName)).toEqual([
        'BigJuncer',
        'MattyB2317',
      ]);
      expect(managers.every((manager) => !manager.claimed)).toBe(true);

      await claimManager(db!, { userId: alex.id, pin: GOOD_PIN }, CONTEXT);

      managers = await listDoorManagers(db!);
      expect(managers.find((manager) => manager.id === alex.id)?.claimed).toBe(true);
    });

    /*
     * Ruled twice, and this is the commissioner's version.
     *
     * It first asserted a seatless manager was *absent*. PR #34 inverted it,
     * because keying the door on the current roster put Armen, Berardo and
     * Shant behind a 404 at their own key and that read as a broken site. The
     * commissioner then ruled absolutely: a retired manager never appears in a
     * structured surface — not labelled, not disabled, not behind an alumni
     * page — and their only permitted existence is a name in Tony's dialogue.
     *
     * So it is back, kept as three assertions rather than one, because the
     * failure mode that matters is not "the list is wrong" but "they can still
     * get in another way".
     */
    it('does not offer a manager who holds no seat this season', async () => {
      await league();
      const [departed] = await db!
        .insert(users)
        .values({ displayName: 'Anthonyberardo' })
        .returning();

      const managers = await listDoorManagers(db!);
      expect(managers.some((manager) => manager.id === departed!.id)).toBe(false);
    });

    it('does not let them through their own door either', async () => {
      await league();
      const [departed] = await db!
        .insert(users)
        .values({ displayName: 'Anthonyberardo' })
        .returning();

      // `doorManager` is what `/door/[userId]` and `claimManager` both gate on.
      // Hiding the row from a list is not the rule; being unable to claim is.
      expect(await doorManager(db!, departed!.id)).toBeNull();

      const claimed = await claimManager(db!, { userId: departed!.id, pin: GOOD_PIN }, CONTEXT);
      expect(claimed.ok).toBe(false);
    });

    it('does not offer a manager whose seat was deactivated', async () => {
      const { season } = await league();
      const [former] = await db!.insert(users).values({ displayName: 'Shant' }).returning();
      await db!
        .insert(seasonMemberships)
        .values({ seasonId: season.id, userId: former!.id, rosterId: 9, isActive: false });

      // A row in the current season is not a seat. `is_active` is.
      expect((await listDoorManagers(db!)).some((m) => m.id === former!.id)).toBe(false);
    });
  });

  describe('claiming', () => {
    it('sets a PIN, starts a session, and never stores the PIN', async () => {
      const { alex } = await league();

      const result = await claimManager(db!, { userId: alex.id, pin: GOOD_PIN }, CONTEXT);
      expect(result.ok).toBe(true);

      const [stored] = await db!.select().from(users).where(eq(users.id, alex.id));
      expect(stored!.pinHash).not.toBeNull();
      expect(stored!.pinHash).not.toContain(GOOD_PIN);
      expect(stored!.pinUpdatedAt).not.toBeNull();

      const [session] = await db!.select().from(sessions);
      expect(session!.userId).toBe(alex.id);
      expect(session!.deviceLabel).toBe('iPhone · Safari');
    });

    it('stores the session token’s hash, never the token', async () => {
      const { alex } = await league();
      const result = await claimManager(db!, { userId: alex.id, pin: GOOD_PIN }, CONTEXT);

      if (!result.ok) expect.unreachable('claim should have succeeded');

      const [session] = await db!.select().from(sessions);
      const token = result.cookieValue.slice(0, result.cookieValue.lastIndexOf('.'));

      expect(session!.tokenHash).toBe(hashToken(token));
      expect(session!.tokenHash).not.toBe(token);
      expect(result.cookieValue).not.toContain(session!.tokenHash);
    });

    it('refuses to re-claim an account that already has a PIN', async () => {
      const { alex } = await league();
      await claimManager(db!, { userId: alex.id, pin: GOOD_PIN }, CONTEXT);

      // Not "the button was hidden" — the service refuses (`09 §9`).
      const second = await claimManager(db!, { userId: alex.id, pin: '918273' }, CONTEXT);
      expect(second.ok).toBe(false);

      // And the original PIN still works, so a hijack attempt changes nothing.
      const signedIn = await signIn(db!, { userId: alex.id, pin: GOOD_PIN }, CONTEXT);
      expect(signedIn.ok).toBe(true);
    });

    it('refuses a weak PIN before it is ever hashed', async () => {
      const { alex } = await league();

      expect((await claimManager(db!, { userId: alex.id, pin: '123456' }, CONTEXT)).ok).toBe(
        false,
      );
      expect((await claimManager(db!, { userId: alex.id, pin: '000000' }, CONTEXT)).ok).toBe(
        false,
      );

      const [stored] = await db!.select().from(users).where(eq(users.id, alex.id));
      expect(stored!.pinHash).toBeNull();
    });

    it('honours a claim code when one is configured', async () => {
      const { alex } = await league();
      process.env['CLAIM_CODE'] = 'pepperoni';

      expect(
        (await claimManager(db!, { userId: alex.id, pin: GOOD_PIN, claimCode: 'wrong' }, CONTEXT))
          .ok,
      ).toBe(false);

      expect(
        (
          await claimManager(
            db!,
            { userId: alex.id, pin: GOOD_PIN, claimCode: 'pepperoni' },
            CONTEXT,
          )
        ).ok,
      ).toBe(true);
    });
  });

  describe('signing in', () => {
    it('accepts the right PIN and refuses the wrong one', async () => {
      const { alex } = await league();
      await claimManager(db!, { userId: alex.id, pin: GOOD_PIN }, CONTEXT);

      expect((await signIn(db!, { userId: alex.id, pin: GOOD_PIN }, CONTEXT)).ok).toBe(true);
      expect((await signIn(db!, { userId: alex.id, pin: '000001' }, CONTEXT)).ok).toBe(false);
    });

    it('refuses an unclaimed account without leaking that it exists', async () => {
      const { alex } = await league();
      const unknown = await signIn(
        db!,
        { userId: '00000000-0000-4000-8000-000000000000', pin: GOOD_PIN },
        CONTEXT,
      );
      const unclaimed = await signIn(db!, { userId: alex.id, pin: GOOD_PIN }, CONTEXT);

      expect(unknown.ok).toBe(false);
      expect(unclaimed.ok).toBe(false);
      // The same answer either way.
      expect(unknown.ok || unclaimed.ok).toBe(false);
    });

    it('records every attempt, successful or not', async () => {
      const { alex } = await league();
      await claimManager(db!, { userId: alex.id, pin: GOOD_PIN }, CONTEXT);
      await signIn(db!, { userId: alex.id, pin: '000001' }, CONTEXT);

      const attempts = await db!.select().from(authAttempts);
      expect(attempts.map((attempt) => attempt.outcome).sort()).toEqual([
        'BAD_PIN',
        'SUCCEEDED',
      ]);
      // The address is hashed, never stored.
      expect(attempts.every((attempt) => attempt.ipHash === CONTEXT.ipHash)).toBe(true);
    });
  });

  describe('lockout', () => {
    it('shuts the door after five failures and says for how long', async () => {
      const { alex } = await league();
      await claimManager(db!, { userId: alex.id, pin: GOOD_PIN }, CONTEXT);

      for (let attempt = 0; attempt < 5; attempt++) {
        await signIn(db!, { userId: alex.id, pin: '000001' }, CONTEXT);
      }

      const locked = await signIn(db!, { userId: alex.id, pin: GOOD_PIN }, CONTEXT);
      expect(locked.ok).toBe(false);
      if (!locked.ok) expect(locked.message).toMatch(/locked the door/);
    });

    it('opens again once the wait is served', async () => {
      const { alex } = await league();
      await claimManager(db!, { userId: alex.id, pin: GOOD_PIN }, CONTEXT);

      for (let attempt = 0; attempt < 5; attempt++) {
        await signIn(db!, { userId: alex.id, pin: '000001' }, CONTEXT);
      }

      setFixedClock(new Date(START + 20 * 60_000));
      expect((await signIn(db!, { userId: alex.id, pin: GOOD_PIN }, CONTEXT)).ok).toBe(true);
    });

    it('a correct PIN wipes the slate', async () => {
      const { alex } = await league();
      await claimManager(db!, { userId: alex.id, pin: GOOD_PIN }, CONTEXT);

      // Four failures, then success, then four more: never five in a row.
      for (let attempt = 0; attempt < 4; attempt++) {
        await signIn(db!, { userId: alex.id, pin: '000001' }, CONTEXT);
      }
      expect((await signIn(db!, { userId: alex.id, pin: GOOD_PIN }, CONTEXT)).ok).toBe(true);
      for (let attempt = 0; attempt < 4; attempt++) {
        await signIn(db!, { userId: alex.id, pin: '000001' }, CONTEXT);
      }

      expect((await signIn(db!, { userId: alex.id, pin: GOOD_PIN }, CONTEXT)).ok).toBe(true);
    });

    /**
     * Per-account and per-IP limits defend different things: one stops a single
     * manager's PIN being ground down, the other stops one machine walking the
     * whole roster five guesses at a time.
     */
    it('limits one machine walking the roster, not just one account', async () => {
      const { alex, matty } = await league();
      await claimManager(db!, { userId: alex.id, pin: GOOD_PIN }, CONTEXT);
      await claimManager(db!, { userId: matty.id, pin: '918273' }, CONTEXT);

      for (let attempt = 0; attempt < 3; attempt++) {
        await signIn(db!, { userId: alex.id, pin: '000001' }, CONTEXT);
        await signIn(db!, { userId: matty.id, pin: '000001' }, CONTEXT);
      }

      // Neither account has five failures of its own; the address has six.
      const blocked = await signIn(db!, { userId: alex.id, pin: GOOD_PIN }, CONTEXT);
      expect(blocked.ok).toBe(false);

      // A different address is unaffected.
      const elsewhere = await signIn(
        db!,
        { userId: alex.id, pin: GOOD_PIN },
        { ...CONTEXT, ipHash: 'another-hash' },
      );
      expect(elsewhere.ok).toBe(true);
    });
  });

  describe('sessions', () => {
    async function signedIn() {
      const { alex } = await league();
      const result = await claimManager(db!, { userId: alex.id, pin: GOOD_PIN }, CONTEXT);
      if (!result.ok) expect.unreachable('claim should have succeeded');
      return { alex, cookieValue: result.cookieValue };
    }

    it('resolves a valid cookie to the right person', async () => {
      const { alex, cookieValue } = await signedIn();
      const resolved = await resolveSession(db!, tokenHashFromCookie(cookieValue));
      expect(resolved?.user.id).toBe(alex.id);
    });

    it('rejects a forged cookie', async () => {
      await signedIn();
      expect(await resolveSession(db!, tokenHashFromCookie('forged.signature'))).toBeNull();
      expect(await resolveSession(db!, null)).toBeNull();
    });

    /**
     * `16 §11`: 90 days, refreshed every visit, so a manager who shows up once
     * a week on Tuesday is never signed out.
     */
    it('rolls the window forward on a later visit', async () => {
      const { cookieValue } = await signedIn();
      const tokenHash = tokenHashFromCookie(cookieValue);

      const [before] = await db!.select().from(sessions);
      const firstExpiry = before!.expiresAt.getTime();

      // Two months later — well inside the window, well past the touch
      // interval.
      setFixedClock('2026-09-28T12:00:00Z');
      expect(await resolveSession(db!, tokenHash)).not.toBeNull();

      const [after] = await db!.select().from(sessions);
      expect(after!.expiresAt.getTime()).toBeGreaterThan(firstExpiry);
      expect(after!.lastSeenAt.getTime()).toBeGreaterThan(before!.lastSeenAt.getTime());
    });

    it('does not write a row on every page view', async () => {
      const { cookieValue } = await signedIn();
      const tokenHash = tokenHashFromCookie(cookieValue);

      const [before] = await db!.select().from(sessions);
      // A minute later: a second page view, not a new visit.
      setFixedClock('2026-07-28T12:01:00Z');
      await resolveSession(db!, tokenHash);

      const [after] = await db!.select().from(sessions);
      expect(after!.lastSeenAt.getTime()).toBe(before!.lastSeenAt.getTime());
    });

    it('expires after ninety days away', async () => {
      const { cookieValue } = await signedIn();
      const tokenHash = tokenHashFromCookie(cookieValue);

      setFixedClock(new Date(Date.parse('2026-07-28T12:00:00Z') + (SESSION_TTL_DAYS + 1) * 86_400_000));
      expect(await resolveSession(db!, tokenHash)).toBeNull();
    });

    it('ends on sign-out and records why', async () => {
      const { cookieValue } = await signedIn();
      const tokenHash = tokenHashFromCookie(cookieValue);

      await signOut(db!, tokenHash);

      expect(await resolveSession(db!, tokenHash)).toBeNull();
      const [session] = await db!.select().from(sessions);
      expect(session!.revokedReason).toBe('SIGNED_OUT');
      // Revoked, not deleted: "when was I signed out, and by what" stays
      // answerable.
      expect(session!.revokedAt).not.toBeNull();
    });

    it('signs out every device at once', async () => {
      const { alex, cookieValue } = await signedIn();
      const second = await signIn(db!, { userId: alex.id, pin: GOOD_PIN }, CONTEXT);
      if (!second.ok) expect.unreachable('second sign-in should have succeeded');

      expect(await listDevices(db!, alex.id, 'none')).toHaveLength(2);

      await signOutEverywhere(db!, alex.id);

      expect(await resolveSession(db!, tokenHashFromCookie(cookieValue))).toBeNull();
      expect(await resolveSession(db!, tokenHashFromCookie(second.cookieValue))).toBeNull();
      expect(await listDevices(db!, alex.id, 'none')).toHaveLength(0);
    });
  });

  describe('commissioner reset', () => {
    it('clears the PIN, kills every session, and writes an audit row', async () => {
      const { alex, matty } = await league();
      const claimed = await claimManager(db!, { userId: matty.id, pin: GOOD_PIN }, CONTEXT);
      if (!claimed.ok) expect.unreachable('claim should have succeeded');

      await resetPin(db!, { actorUserId: alex.id, subjectUserId: matty.id });

      const [subject] = await db!.select().from(users).where(eq(users.id, matty.id));
      expect(subject!.pinHash).toBeNull();
      expect(subject!.pinUpdatedAt).toBeNull();

      expect(await resolveSession(db!, tokenHashFromCookie(claimed.cookieValue))).toBeNull();

      const [audit] = await db!.select().from(adminAuditLogs);
      expect(audit!.action).toBe('pin_reset');
      expect(audit!.actorUserId).toBe(alex.id);
      expect(audit!.subjectUserId).toBe(matty.id);
      expect(audit!.occurredAt).not.toBeNull();
    });

    it('leaves the manager able to claim their name again', async () => {
      const { alex, matty } = await league();
      await claimManager(db!, { userId: matty.id, pin: GOOD_PIN }, CONTEXT);
      await resetPin(db!, { actorUserId: alex.id, subjectUserId: matty.id });

      const managers = await listDoorManagers(db!);
      expect(managers.find((manager) => manager.id === matty.id)?.claimed).toBe(false);

      const reclaimed = await claimManager(
        db!,
        { userId: matty.id, pin: '918273' },
        { ...CONTEXT, ipHash: 'fresh-hash' },
      );
      expect(reclaimed.ok).toBe(true);
    });

    it('never lets the commissioner learn the old PIN', async () => {
      const { alex, matty } = await league();
      await claimManager(db!, { userId: matty.id, pin: GOOD_PIN }, CONTEXT);
      await resetPin(db!, { actorUserId: alex.id, subjectUserId: matty.id });

      // A reset clears the hash rather than setting a value the actor chose,
      // so there is nothing for an admin screen to read back (`09 §8.3`).
      const [subject] = await db!.select().from(users).where(eq(users.id, matty.id));
      expect(subject!.pinHash).toBeNull();

      const [audit] = await db!.select().from(adminAuditLogs);
      expect(JSON.stringify(audit!.details)).not.toContain(GOOD_PIN);
    });
  });
});
