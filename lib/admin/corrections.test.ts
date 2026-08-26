import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  claimManager,
  listDoorManagers,
  resetPin,
  resolveSession,
} from '@/lib/auth/service';
import { characterFor } from '@/lib/character/service';
import { clearClock, setClockSource } from '@/lib/clock';
import { closePool, getDb } from '@/lib/db';
import { resetDatabase } from '@/lib/db/test-helpers';
import {
  adminAuditLogs,
  characterConfigurations,
  collectibles,
  seasonMemberships,
  seasons,
  sessions,
  tokenTransactions,
  users,
  wearableEquips,
} from '@/lib/db/schema';
import { tokenHashFromCookie } from '@/lib/auth/session';

import {
  applyCorrection,
  correctionAvailable,
  correctionOutcome,
  correctionSubject,
  isCorrectionKind,
  listCorrectionSubjects,
  releaseName,
  resetCharacterSelection,
} from './corrections';

/**
 * The commissioner's per-manager corrections, against a real database.
 *
 * These run against Postgres for the same reason the authentication suite does:
 * every question here is about *what is actually stored afterwards*. A mocked
 * database would happily report that a correction left a collection alone while
 * the real one cascaded it away.
 *
 * The suite is organised around the two things that can go wrong with an
 * administrative tool — it does not do what it says, or it does **more** than it
 * says. The second half is the larger one, deliberately.
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
const START = Date.parse('2026-09-08T12:00:00Z');

/** The same advancing clock the auth suite uses, and for the same reason. */
function advancingClock(): void {
  let current = START;
  setClockSource(() => {
    current += 5_000;
    return new Date(current);
  });
}

describe.skipIf(!hasDatabase)('commissioner corrections', () => {
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

  /** Alex the commissioner, Matty the manager, both seated this season. */
  async function league() {
    const [season] = await db!
      .insert(seasons)
      .values({ year: 2026, status: 'DRAFT_PREP' })
      .returning();

    const inserted = await db!
      .insert(users)
      .values([
        { displayName: 'BigJuncer', isAdmin: true },
        { displayName: 'MattyB2317' },
      ])
      .returning();

    const [alex, matty] = inserted as [(typeof inserted)[number], (typeof inserted)[number]];

    await db!.insert(seasonMemberships).values([
      { seasonId: season!.id, userId: alex.id, rosterId: 1 },
      { seasonId: season!.id, userId: matty.id, rosterId: 10 },
    ]);

    return { season: season!, alex, matty };
  }

  /** A saved look, as the customiser would have written it. */
  async function saveALook(userId: string): Promise<void> {
    await db!.insert(characterConfigurations).values({
      userId,
      skin: 2,
      hair: 3,
      hairColour: 1,
      facialHair: 2,
      top: 4,
      topColour: 5,
    });
  }

  /** One owned wearable, worn. The thing a correction must not take away. */
  async function ownAndWear(userId: string): Promise<string> {
    const [item] = await db!
      .insert(collectibles)
      .values({
        userId,
        slug: 'wear_head_pizza_visor',
        rarity: 'common',
        acquiredAt: new Date(START),
      })
      .returning();

    await db!
      .insert(wearableEquips)
      .values({ userId, collectibleId: item!.id, slot: 'head' });

    return item!.id;
  }

  describe('who can be corrected', () => {
    it('lists the door’s managers with the two facts the screen decides on', async () => {
      const { matty } = await league();
      await saveALook(matty.id);
      await claimManager(db!, { userId: matty.id, pin: GOOD_PIN }, CONTEXT);

      const subjects = await listCorrectionSubjects(db!);

      expect(subjects.map((subject) => subject.displayName)).toEqual([
        'BigJuncer',
        'MattyB2317',
      ]);

      const mattyRow = subjects.find((subject) => subject.id === matty.id);
      expect(mattyRow?.claimed).toBe(true);
      expect(mattyRow?.characterChosen).toBe(true);

      const alexRow = subjects.find((subject) => subject.displayName === 'BigJuncer');
      expect(alexRow?.claimed).toBe(false);
      expect(alexRow?.characterChosen).toBe(false);
    });

    /*
     * The door's population, not a second definition of "the league".
     *
     * A manager holding no seat this season is invisible to the door, and the
     * commissioner rule is that they are invisible to every structured surface.
     * A corrections screen that listed them would be a way back in through the
     * office.
     */
    it('does not offer a manager who holds no seat this season', async () => {
      await league();
      const [outsider] = await db!
        .insert(users)
        .values({ displayName: 'Armen' })
        .returning();

      const subjects = await listCorrectionSubjects(db!);
      expect(subjects.some((subject) => subject.id === outsider!.id)).toBe(false);
      expect(await correctionSubject(db!, outsider!.id)).toBeNull();
    });

    it('refuses every correction for somebody the door does not offer', async () => {
      const { alex } = await league();
      const [outsider] = await db!
        .insert(users)
        .values({ displayName: 'Armen' })
        .returning();

      for (const kind of ['release-name', 'reset-character'] as const) {
        const result = await applyCorrection(db!, kind, {
          actorUserId: alex.id,
          subjectUserId: outsider!.id,
        });
        expect(result).toEqual({ ok: false, refusal: 'not-in-league' });
      }

      expect(await db!.select().from(adminAuditLogs)).toHaveLength(0);
    });
  });

  describe('releasing a wrongly-claimed name', () => {
    it('takes the key back, signs them out, and puts the name on the door', async () => {
      const { alex, matty } = await league();
      const claimed = await claimManager(db!, { userId: matty.id, pin: GOOD_PIN }, CONTEXT);
      if (!claimed.ok) expect.unreachable('claim should have succeeded');

      const result = await releaseName(db!, {
        actorUserId: alex.id,
        subjectUserId: matty.id,
      });

      expect(result).toMatchObject({ ok: true, kind: 'release-name', changed: true });

      const [subject] = await db!.select().from(users).where(eq(users.id, matty.id));
      expect(subject!.pinHash).toBeNull();
      expect(subject!.pinUpdatedAt).toBeNull();

      expect(await resolveSession(db!, tokenHashFromCookie(claimed.cookieValue))).toBeNull();

      const managers = await listDoorManagers(db!);
      expect(managers.find((manager) => manager.id === matty.id)?.claimed).toBe(false);
    });

    /*
     * The audit row is what separates this from the key board, because nothing
     * else does. The two operations are deliberately identical underneath — one
     * mechanism, two decisions — so if the reason were not recorded there would
     * be no way, a season later, to tell a forgotten PIN from a launch-night
     * mis-tap.
     */
    it('records the decision, not merely the mechanism', async () => {
      const { alex, matty } = await league();
      await claimManager(db!, { userId: matty.id, pin: GOOD_PIN }, CONTEXT);

      await releaseName(db!, { actorUserId: alex.id, subjectUserId: matty.id });

      const [audit] = await db!.select().from(adminAuditLogs);
      expect(audit!.action).toBe('identity_release');
      expect(audit!.actorUserId).toBe(alex.id);
      expect(audit!.subjectUserId).toBe(matty.id);
      expect(audit!.details).toMatchObject({ reason: 'WRONG_IDENTITY', revokedSessions: true });
      expect(audit!.occurredAt).not.toBeNull();
    });

    it('leaves the key board writing pin_reset, exactly as it always has', async () => {
      const { alex, matty } = await league();
      await claimManager(db!, { userId: matty.id, pin: GOOD_PIN }, CONTEXT);

      await resetPin(db!, { actorUserId: alex.id, subjectUserId: matty.id });

      const [audit] = await db!.select().from(adminAuditLogs);
      expect(audit!.action).toBe('pin_reset');
      expect(audit!.details).toMatchObject({ reason: 'FORGOTTEN_PIN' });
    });

    it('never puts a PIN anywhere a commissioner could read it', async () => {
      const { alex, matty } = await league();
      await claimManager(db!, { userId: matty.id, pin: GOOD_PIN }, CONTEXT);

      await releaseName(db!, { actorUserId: alex.id, subjectUserId: matty.id });

      const [audit] = await db!.select().from(adminAuditLogs);
      expect(JSON.stringify(audit!.details)).not.toContain(GOOD_PIN);
      const [subject] = await db!.select().from(users).where(eq(users.id, matty.id));
      expect(subject!.pinHash).toBeNull();
    });

    it('refuses to release the commissioner’s own name, and writes nothing', async () => {
      const { alex } = await league();
      await claimManager(db!, { userId: alex.id, pin: GOOD_PIN }, CONTEXT);

      const result = await releaseName(db!, {
        actorUserId: alex.id,
        subjectUserId: alex.id,
      });

      expect(result).toEqual({ ok: false, refusal: 'self' });
      const [subject] = await db!.select().from(users).where(eq(users.id, alex.id));
      expect(subject!.pinHash).not.toBeNull();
      expect(await db!.select().from(adminAuditLogs)).toHaveLength(0);
    });

    it('refuses a name nobody is holding, and writes nothing', async () => {
      const { alex, matty } = await league();

      const result = await releaseName(db!, {
        actorUserId: alex.id,
        subjectUserId: matty.id,
      });

      expect(result).toEqual({ ok: false, refusal: 'not-claimed' });
      expect(await db!.select().from(adminAuditLogs)).toHaveLength(0);
    });

    /*
     * The correction the commissioner actually performs on launch night, end to
     * end: the wrong person claims Matty's name, and afterwards the right person
     * can take it.
     */
    it('lets the right manager claim the name afterwards', async () => {
      const { alex, matty } = await league();
      await claimManager(db!, { userId: matty.id, pin: GOOD_PIN }, CONTEXT);

      await releaseName(db!, { actorUserId: alex.id, subjectUserId: matty.id });

      const reclaimed = await claimManager(
        db!,
        { userId: matty.id, pin: '918273' },
        { ...CONTEXT, ipHash: 'a-different-phone' },
      );
      expect(reclaimed.ok).toBe(true);
    });
  });

  describe('resetting a character selection', () => {
    it('puts the manager back in front of first-run character creation', async () => {
      const { alex, matty } = await league();
      await saveALook(matty.id);

      expect((await characterFor(db!, matty.id)).chosen).toBe(true);

      const result = await resetCharacterSelection(db!, {
        actorUserId: alex.id,
        subjectUserId: matty.id,
      });

      expect(result).toMatchObject({ ok: true, kind: 'reset-character', changed: true });
      expect((await characterFor(db!, matty.id)).chosen).toBe(false);
      expect(
        await db!
          .select()
          .from(characterConfigurations)
          .where(eq(characterConfigurations.userId, matty.id)),
      ).toHaveLength(0);
    });

    it('writes the audit row with the actor, the subject and what was cleared', async () => {
      const { alex, matty } = await league();
      await saveALook(matty.id);

      await resetCharacterSelection(db!, { actorUserId: alex.id, subjectUserId: matty.id });

      const [audit] = await db!.select().from(adminAuditLogs);
      expect(audit!.action).toBe('character_reset');
      expect(audit!.actorUserId).toBe(alex.id);
      expect(audit!.subjectUserId).toBe(matty.id);
      expect(audit!.details).toMatchObject({ cleared: true });
    });

    /*
     * `changed: false` is an outcome, not a failure — and it is still recorded.
     * A trail that only logged deletions could not tell "the commissioner
     * corrected something already correct" from "nobody ever pressed it".
     */
    it('is idempotent, and records the run that found nothing to clear', async () => {
      const { alex, matty } = await league();
      await saveALook(matty.id);

      await resetCharacterSelection(db!, { actorUserId: alex.id, subjectUserId: matty.id });
      const second = await resetCharacterSelection(db!, {
        actorUserId: alex.id,
        subjectUserId: matty.id,
      });

      expect(second).toMatchObject({ ok: true, changed: false });

      const audits = await db!.select().from(adminAuditLogs);
      expect(audits).toHaveLength(2);
      expect(audits.map((row) => (row.details as { cleared: boolean }).cleared).sort()).toEqual([
        false,
        true,
      ]);
    });

    /*
     * The launch case that makes the two tools compose: the wrong person claimed
     * a name, dressed a character on it, and the name has since been released.
     * Refusing to touch an unclaimed manager would make the correction
     * impossible exactly when it is wanted.
     */
    it('works on a name that has already been released', async () => {
      const { alex, matty } = await league();
      await claimManager(db!, { userId: matty.id, pin: GOOD_PIN }, CONTEXT);
      await saveALook(matty.id);

      await releaseName(db!, { actorUserId: alex.id, subjectUserId: matty.id });
      const result = await resetCharacterSelection(db!, {
        actorUserId: alex.id,
        subjectUserId: matty.id,
      });

      expect(result).toMatchObject({ ok: true, changed: true });
      expect((await characterFor(db!, matty.id)).chosen).toBe(false);
    });
  });

  /* ---------------------------------------------------------------------- *
   * The half that matters more: what a correction must NOT do.
   * ---------------------------------------------------------------------- */
  describe('blast radius', () => {
    it('a character reset touches nothing they own and nothing they are wearing', async () => {
      const { alex, matty } = await league();
      await saveALook(matty.id);
      const itemId = await ownAndWear(matty.id);

      await resetCharacterSelection(db!, { actorUserId: alex.id, subjectUserId: matty.id });

      const owned = await db!
        .select()
        .from(collectibles)
        .where(eq(collectibles.userId, matty.id));
      expect(owned.map((row) => row.id)).toEqual([itemId]);

      const worn = await db!
        .select()
        .from(wearableEquips)
        .where(eq(wearableEquips.userId, matty.id));
      expect(worn.map((row) => row.collectibleId)).toEqual([itemId]);
    });

    it('a character reset leaves their key, their sessions and their name alone', async () => {
      const { alex, matty } = await league();
      const claimed = await claimManager(db!, { userId: matty.id, pin: GOOD_PIN }, CONTEXT);
      if (!claimed.ok) expect.unreachable('claim should have succeeded');
      await saveALook(matty.id);

      await resetCharacterSelection(db!, { actorUserId: alex.id, subjectUserId: matty.id });

      const [subject] = await db!.select().from(users).where(eq(users.id, matty.id));
      expect(subject!.pinHash).not.toBeNull();
      expect(subject!.displayName).toBe('MattyB2317');
      expect(await resolveSession(db!, tokenHashFromCookie(claimed.cookieValue))).not.toBeNull();
    });

    it('a name release leaves the collection, the wardrobe and the saved look alone', async () => {
      const { alex, matty } = await league();
      await claimManager(db!, { userId: matty.id, pin: GOOD_PIN }, CONTEXT);
      await saveALook(matty.id);
      const itemId = await ownAndWear(matty.id);

      await releaseName(db!, { actorUserId: alex.id, subjectUserId: matty.id });

      expect(
        (await db!.select().from(collectibles).where(eq(collectibles.userId, matty.id))).map(
          (row) => row.id,
        ),
      ).toEqual([itemId]);
      expect(
        await db!.select().from(wearableEquips).where(eq(wearableEquips.userId, matty.id)),
      ).toHaveLength(1);
      expect((await characterFor(db!, matty.id)).chosen).toBe(true);
    });

    /*
     * `CLAUDE.md`: all token movement goes through `apply_token_delta`. No
     * correction has any business writing a ledger row, and the balance a
     * correction leaves behind must be the one it found.
     */
    it('no correction moves a token or writes a ledger row', async () => {
      const { alex, matty, season } = await league();
      await claimManager(db!, { userId: matty.id, pin: GOOD_PIN }, CONTEXT);
      await saveALook(matty.id);

      const before = await db!
        .select({ balance: seasonMemberships.tokenBalance })
        .from(seasonMemberships)
        .where(eq(seasonMemberships.seasonId, season.id));

      await releaseName(db!, { actorUserId: alex.id, subjectUserId: matty.id });
      await resetCharacterSelection(db!, { actorUserId: alex.id, subjectUserId: matty.id });

      const after = await db!
        .select({ balance: seasonMemberships.tokenBalance })
        .from(seasonMemberships)
        .where(eq(seasonMemberships.seasonId, season.id));

      expect(after).toEqual(before);
      expect(await db!.select().from(tokenTransactions)).toHaveLength(0);
    });

    /*
     * One correction, one manager. The wrong-name case at launch is somebody
     * else's mistake, and a tool that reached past its subject would turn one
     * person's mis-tap into everybody's problem — which is the whole reason
     * there is no bulk reset here.
     */
    it('touches exactly one manager, never the league', async () => {
      const { alex, matty } = await league();
      await claimManager(db!, { userId: alex.id, pin: GOOD_PIN }, CONTEXT);
      await claimManager(
        db!,
        { userId: matty.id, pin: '918273' },
        { ...CONTEXT, ipHash: 'a-different-phone' },
      );
      await saveALook(alex.id);
      await saveALook(matty.id);

      await releaseName(db!, { actorUserId: alex.id, subjectUserId: matty.id });
      await resetCharacterSelection(db!, { actorUserId: alex.id, subjectUserId: matty.id });

      const [commissioner] = await db!.select().from(users).where(eq(users.id, alex.id));
      expect(commissioner!.pinHash).not.toBeNull();
      expect((await characterFor(db!, alex.id)).chosen).toBe(true);
      expect(
        await db!.select().from(sessions).where(eq(sessions.userId, alex.id)),
      ).toHaveLength(1);
    });
  });

  describe('what the screen is allowed to offer', () => {
    it('offers a release only for a claimed name that is not your own', async () => {
      const { alex, matty } = await league();
      await claimManager(db!, { userId: matty.id, pin: GOOD_PIN }, CONTEXT);
      await claimManager(
        db!,
        { userId: alex.id, pin: '918273' },
        { ...CONTEXT, ipHash: 'a-different-phone' },
      );

      const subjects = await listCorrectionSubjects(db!);
      const mattyRow = subjects.find((subject) => subject.id === matty.id)!;
      const alexRow = subjects.find((subject) => subject.id === alex.id)!;

      expect(correctionAvailable('release-name', mattyRow, alex.id)).toBe(true);
      expect(correctionAvailable('release-name', alexRow, alex.id)).toBe(false);
    });

    it('offers a character reset only where there is a saved look to clear', async () => {
      const { alex, matty } = await league();
      await saveALook(matty.id);

      const subjects = await listCorrectionSubjects(db!);
      const mattyRow = subjects.find((subject) => subject.id === matty.id)!;
      const alexRow = subjects.find((subject) => subject.id === alex.id)!;

      expect(correctionAvailable('reset-character', mattyRow, alex.id)).toBe(true);
      expect(correctionAvailable('reset-character', alexRow, alex.id)).toBe(false);
    });

    /*
     * The screen's own guard is a convenience, and the services are the
     * authority. A hidden button is not authorization (`09 §9`), so the refusal
     * has to hold for a caller that never saw the screen.
     */
    it('refuses a correction the screen would not have offered', async () => {
      const { alex, matty } = await league();

      expect(
        await releaseName(db!, { actorUserId: alex.id, subjectUserId: matty.id }),
      ).toEqual({ ok: false, refusal: 'not-claimed' });
    });
  });

  describe('the words the office uses', () => {
    it('only accepts the two corrections that exist', () => {
      expect(isCorrectionKind('release-name')).toBe(true);
      expect(isCorrectionKind('reset-character')).toBe(true);
      expect(isCorrectionKind('reset-league')).toBe(false);
      expect(isCorrectionKind('')).toBe(false);
      expect(isCorrectionKind(undefined)).toBe(false);
    });

    it('says what happened rather than that something happened', () => {
      const subject = {
        id: 'x',
        displayName: 'MattyB2317',
        teamName: null,
        claimed: false,
        characterChosen: false,
      };

      const cleared = correctionOutcome(
        { ok: true, kind: 'reset-character', subject, changed: true },
        'MattyB2317',
      );
      const nothing = correctionOutcome(
        { ok: true, kind: 'reset-character', subject, changed: false },
        'MattyB2317',
      );

      expect(cleared).not.toEqual(nothing);
      expect(nothing).toContain('nothing to clear');
      expect(correctionOutcome({ ok: false, refusal: 'self' }, 'MattyB2317')).toContain(
        'sign you out',
      );
    });
  });
});
