import { and, eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearClock, setFixedClock } from '@/lib/clock';
import { applyTokenDelta, ensureEconomyConfig, wallet } from '@/lib/counter/tokens';
import { closePool, getDb } from '@/lib/db';
import {
  fantasyMatchups,
  seasonMemberships,
  seasons,
  stakeEntries,
  stakeResolutions,
  tokenTransactions,
  users,
  weeklyStakes,
} from '@/lib/db/schema';
import { PG_ERROR, expectPgError, expectPgMessage, resetDatabase } from '@/lib/db/test-helpers';

import { finalizeWeek } from './facts';

import { settlementKeyFor, stakeKeyFor, VARIANTS } from './model';
import {
  authorStakesForWeek,
  placeEntry,
  settleSeason,
  settleStake,
  voidStake,
} from './service';

/**
 * Settlement, against a real Postgres.
 *
 * **Every guarantee in this file is a database guarantee**, so none of it can be
 * tested against a mock — which is exactly why the rules live in the database.
 * The requirement list is explicit:
 *
 *   - progress is server-authoritative
 *   - duplicate settlement is impossible
 *   - reward settlement is transactional and idempotent
 *   - audit history explains why it resolved
 *   - later Sleeper mutations cannot rewrite a finalized outcome
 *
 * Each has a test below that asks the database for the wrong thing and requires
 * it to refuse.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

/**
 * A fixed instant, for rows whose timestamp is not what is under test.
 *
 * `new Date()` is a lint error everywhere outside `lib/clock.ts` — the time
 * machine and the season replay depend on one injected clock — and a test is not
 * an exception. A literal is also the better fixture: a row stamped with the wall
 * clock makes an assertion about ordering depend on how fast the suite ran.
 */
const FIXED = new Date('2026-11-10T12:00:00Z');

const cents = (points: number): number => Math.round(points * 100);

/**
 * A small open season with four managers and enough weeks to author from.
 *
 * Written out rather than imported, so a change to the recorded league cannot
 * quietly change what these assertions mean. Open — not finalized — because the
 * token ledger refuses a finalized season outright (`03 §6`), and every test that
 * settles has to finalize it deliberately.
 */
async function league(): Promise<{
  seasonId: string;
  year: number;
  managers: { id: string; rosterId: number }[];
}> {
  const year = 2026;

  const [season] = await db!
    .insert(seasons)
    .values({ year, sleeperLeagueId: `L${String(year)}`, status: 'ACTIVE' })
    .returning({ id: seasons.id });

  const managers: { id: string; rosterId: number }[] = [];
  for (const [index, name] of ['Ada', 'Bo', 'Cal', 'Dee'].entries()) {
    const [user] = await db!
      .insert(users)
      .values({ displayName: name, sleeperUserId: `1000${String(index)}` })
      .returning({ id: users.id });

    await db!.insert(seasonMemberships).values({
      seasonId: season!.id,
      userId: user!.id,
      rosterId: index + 1,
    });

    managers.push({ id: user!.id, rosterId: index + 1 });
  }

  /*
   * Six weeks of two games each, shaped so each test has the case it needs:
   *
   *   - **weeks 1–3** are flat (105 · 110 · 115 · 120), which is twelve
   *     team-weeks — exactly the floor a season median needs — and puts the
   *     lower median at **110.00**
   *   - **week 4** is the market's settling week: roster 1 posts **150.00** and
   *     everybody else lands in the nineties, so `over` and `under` both have a
   *     manager who takes them and is right
   *   - **weeks 5–6** give a bounty something to roll across. A bounty authored
   *     for week 5 targets week 4's 150.00, week 5 gets nowhere near it, and
   *     roster 3 clears it in week 6 — which is what makes "the earliest week
   *     wins" a claim with two weeks to be wrong about
   */
  const score = (week: number, roster: number): number => {
    if (week === 4) return roster === 1 ? cents(150) : cents(90 + roster);
    if (week === 6 && roster === 3) return cents(160);
    return cents(100 + roster * 5);
  };

  for (const week of [1, 2, 3, 4, 5, 6]) {
    for (const [pair, [a, b]] of [
      [1, 2],
      [3, 4],
    ].entries()) {
      const aCents = score(week, a!);
      const bCents = score(week, b!);
      await db!.insert(fantasyMatchups).values({
        seasonId: season!.id,
        week,
        weekType: 'regular',
        sleeperMatchupId: pair + 1,
        rosterAId: a!,
        rosterBId: b!,
        pointsACents: aCents,
        pointsBCents: bCents,
        winnerRosterId: aCents === bCents ? null : aCents > bCents ? a! : b!,
        marginCents: Math.abs(aCents - bCents),
      });
    }
  }

  await ensureEconomyConfig(db!, season!.id);

  for (const manager of managers) {
    await applyTokenDelta(db!, {
      userId: manager.id,
      seasonId: season!.id,
      amount: 250,
      reason: 'SEASON_START',
      description: 'Tony opens a tab.',
      idempotencyKey: `open:${manager.id}`,
    });
  }

  return { seasonId: season!.id, year, managers };
}

/**
 * Close a week, the way the Tuesday job will.
 *
 * **Not** by finalizing the season, which is the trap this whole file exists to
 * keep shut: `apply_token_delta` refuses a finalized season (`03 §6`), so a
 * season-closed test would settle every stake and pay nobody, and would pass its
 * settlement assertions while doing it.
 */
async function closeWeek(season: number, week: number): Promise<void> {
  await finalizeWeek(db!, { season, week, at: new Date('2026-11-10T12:00:00Z') });
}

/** Close every week the fixture has, so a season-wide settlement can run. */
async function closeAllWeeks(season: number): Promise<void> {
  for (const week of [1, 2, 3, 4, 5, 6]) await closeWeek(season, week);
}

async function balanceOf(userId: string, seasonId: string): Promise<number> {
  return (await wallet(db!, { userId, seasonId }))?.balance ?? 0;
}

/**
 * One manager's own Tony's Line, by the seat it belongs to.
 *
 * A week authors **one line per seat** since 2026-08-12, so there is no such
 * thing as "the line" any more — asking for one without saying whose would be
 * asking for whichever row came back first.
 */
async function lineIdFor(season: number, week: number, rosterId: number): Promise<string> {
  return stakeIdFor(stakeKeyFor({ season, week, variant: VARIANTS.seasonMedian, rosterId }));
}

async function stakeIdFor(key: string): Promise<string> {
  const [row] = await db!
    .select({ id: weeklyStakes.id })
    .from(weeklyStakes)
    .where(eq(weeklyStakes.stakeKey, key))
    .limit(1);
  if (row === undefined) throw new Error(`no stake ${key}`);
  return row.id;
}

describe.skipIf(!hasDatabase)('weekly stakes, settled', () => {
  beforeEach(async () => {
    await resetDatabase(db!);
    setFixedClock('2026-11-10T12:00:00Z');
  });

  afterEach(() => {
    clearClock();
  });

  afterAll(async () => {
    if (hasDatabase) await closePool();
  });

  /* ---------------------------------------------------------------- author -- */

  describe('authoring', () => {
    it('writes one stake per variant, and re-running writes nothing', async () => {
      const { year } = await league();

      const first = await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });
      expect(first.written).toBeGreaterThan(0);

      const second = await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });
      // `stake_key` is UNIQUE and the insert is `onConflictDoNothing`, so a second
      // authoring pass is a no-op rather than a second offer to the league.
      expect(second.written).toBe(0);

      const rows = await db!.select({ key: weeklyStakes.stakeKey }).from(weeklyStakes);
      expect(rows).toHaveLength(first.report.authored.length);
    });

    it('authors no market when the flag is shut', async () => {
      const { year } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: false });

      const rows = await db!
        .select({ kind: weeklyStakes.kind })
        .from(weeklyStakes)
        .where(eq(weeklyStakes.kind, 'TONYS_LINE'));
      expect(rows).toHaveLength(0);
    });

    it('snapshots who was eligible rather than querying it later', async () => {
      const { year, managers } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });

      /*
       * Read off the **bounty**, which is offered to the league. A personal line
       * carries a snapshot of exactly one manager — that is Ruling 2 and it is
       * asserted below — so it is the wrong row to ask this question of.
       */
      const [row] = await db!
        .select({ eligible: weeklyStakes.eligibleUserIds })
        .from(weeklyStakes)
        .where(eq(weeklyStakes.kind, 'BOUNTY'))
        .limit(1);

      expect([...row!.eligible].sort()).toEqual(managers.map((m) => m.id).sort());

      /*
       * Eligibility is a fact about the moment the offer was made. A manager who
       * leaves in November was still eligible in September, and recomputing it
       * later would quietly rewrite who was invited.
       */
      await db!
        .update(seasonMemberships)
        .set({ isActive: false })
        .where(eq(seasonMemberships.userId, managers[0]!.id));

      const [after] = await db!
        .select({ eligible: weeklyStakes.eligibleUserIds })
        .from(weeklyStakes)
        .where(eq(weeklyStakes.kind, 'BOUNTY'))
        .limit(1);
      expect(after!.eligible).toEqual(row!.eligible);
    });

    it('writes one line per seat, each offered to exactly one manager', async () => {
      /*
       * Ruling 1 and Ruling 2, at the table. A week authors up to ten
       * `TONYS_LINE` rows and each carries an eligibility snapshot of **one**
       * manager — which is what makes `placeEntry`'s refusal and the trigger
       * below about ownership rather than about presentation.
       */
      const { year, managers } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });

      const lines = await db!
        .select({ key: weeklyStakes.stakeKey, eligible: weeklyStakes.eligibleUserIds })
        .from(weeklyStakes)
        .where(eq(weeklyStakes.kind, 'TONYS_LINE'));

      expect(lines).toHaveLength(managers.length);
      for (const line of lines) expect(line.eligible).toHaveLength(1);
      // One per manager, and no manager offered two.
      expect(new Set(lines.map((line) => line.eligible[0])).size).toBe(managers.length);
      expect(new Set(lines.map((line) => line.key)).size).toBe(managers.length);
    });

    it('sets a different number for a strong manager than for a weak one', async () => {
      /*
       * The fixture's roster 4 outscores roster 1 in every week before the one
       * being priced, so their numbers must differ. A formula that ignored the
       * manager would put the same number on both and pass every other test in
       * this file.
       */
      const { year } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });

      const numberOf = async (rosterId: number): Promise<string> => {
        const [row] = await db!
          .select({ factRefs: weeklyStakes.factRefs })
          .from(weeklyStakes)
          .where(eq(weeklyStakes.id, await lineIdFor(year, 4, rosterId)));
        return (row!.factRefs as { values: Record<string, string> }).values['line']!;
      };

      const weak = Number.parseFloat(await numberOf(1));
      const strong = Number.parseFloat(await numberOf(4));
      expect(strong).toBeGreaterThan(weak);
      // Every line is hung on the half point, so a push on an exact landing is
      // arithmetically impossible.
      for (const value of [weak, strong]) expect(value * 100 % 100).toBe(50);
    });

    it('authors the same numbers again when it is re-run', async () => {
      const { year } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });
      const before = await db!
        .select({ key: weeklyStakes.stakeKey, factRefs: weeklyStakes.factRefs })
        .from(weeklyStakes)
        .orderBy(weeklyStakes.stakeKey);

      const again = await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });
      expect(again.written).toBe(0);

      const after = await db!
        .select({ key: weeklyStakes.stakeKey, factRefs: weeklyStakes.factRefs })
        .from(weeklyStakes)
        .orderBy(weeklyStakes.stakeKey);
      expect(after).toEqual(before);
    });
  });

  /* ----------------------------------------------------------------- picks -- */

  describe('taking a side', () => {
    it('debits the stake and records the pick in one transaction', async () => {
      const { seasonId, year, managers } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });
      const id = await lineIdFor(year, 4, 1);

      const before = await balanceOf(managers[0]!.id, seasonId);
      const result = await placeEntry(db!, { stakeId: id, userId: managers[0]!.id, side: 'over' });

      expect(result.status).toBe('placed');
      expect(await balanceOf(managers[0]!.id, seasonId)).toBe(before - 10);

      const entries = await db!
        .select({ side: stakeEntries.side })
        .from(stakeEntries)
        .where(eq(stakeEntries.stakeId, id));
      expect(entries).toHaveLength(1);
    });

    it('lets a manager take exactly one side, forever', async () => {
      const { seasonId, year, managers } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });
      const id = await lineIdFor(year, 4, 1);

      await placeEntry(db!, { stakeId: id, userId: managers[0]!.id, side: 'over' });
      const again = await placeEntry(db!, { stakeId: id, userId: managers[0]!.id, side: 'under' });

      expect(again).toEqual({ status: 'already_placed', side: 'over' });
      expect(await balanceOf(managers[0]!.id, seasonId)).toBe(240);
    });

    it('collapses ten simultaneous taps into one pick and one debit', async () => {
      /*
       * The double-tap case, and the reason it is safe without a client-minted
       * token: a pick has a **natural key**. `UNIQUE(stake_id, user_id)` and the
       * derived ledger key are the same guarantee stated twice, and either alone
       * would hold.
       */
      const { seasonId, year, managers } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });
      const id = await lineIdFor(year, 4, 1);

      await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          placeEntry(db!, { stakeId: id, userId: managers[0]!.id, side: 'over' }),
        ),
      );

      const entries = await db!
        .select({ id: stakeEntries.id })
        .from(stakeEntries)
        .where(eq(stakeEntries.stakeId, id));
      expect(entries).toHaveLength(1);
      expect(await balanceOf(managers[0]!.id, seasonId)).toBe(240);
    });

    it('refuses a manager who was not on the eligibility snapshot', async () => {
      const { year, managers } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });
      const id = await lineIdFor(year, 4, 1);

      const [outsider] = await db!
        .insert(users)
        .values({ displayName: 'Nobody', sleeperUserId: '99999' })
        .returning({ id: users.id });

      expect(await placeEntry(db!, { stakeId: id, userId: outsider!.id, side: 'over' })).toEqual({
        status: 'not_eligible',
      });
      expect(managers).toHaveLength(4);
    });

    it('refuses a pick the tab cannot cover, and the database is what refuses it', async () => {
      const { seasonId, year, managers } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });
      const id = await lineIdFor(year, 4, 1);

      await applyTokenDelta(db!, {
        userId: managers[0]!.id,
        seasonId,
        amount: -245,
        reason: 'COMMISSIONER_ADJUSTMENT',
        description: 'Spent down for the test.',
        idempotencyKey: 'spend-down',
      });

      const result = await placeEntry(db!, { stakeId: id, userId: managers[0]!.id, side: 'over' });
      expect(result).toEqual({ status: 'insufficient_tokens', price: 10, balance: 5 });
      // The refused pick left nothing behind: no entry, no ledger row.
      expect(await balanceOf(managers[0]!.id, seasonId)).toBe(5);
      const entries = await db!.select({ id: stakeEntries.id }).from(stakeEntries);
      expect(entries).toHaveLength(0);
    });

    it('cannot be changed once placed', async () => {
      const { year, managers } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });
      const id = await lineIdFor(year, 4, 1);
      await placeEntry(db!, { stakeId: id, userId: managers[0]!.id, side: 'over' });

      await expectPgMessage(
        db!.update(stakeEntries).set({ side: 'under' }).where(eq(stakeEntries.stakeId, id)),
        /placed pick; it cannot be changed/,
      );
    });

    it('cannot be deleted', async () => {
      const { year, managers } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });
      const id = await lineIdFor(year, 4, 1);
      await placeEntry(db!, { stakeId: id, userId: managers[0]!.id, side: 'over' });

      await expectPgMessage(
        db!.delete(stakeEntries).where(eq(stakeEntries.stakeId, id)),
        /part of the audit trail/,
      );
    });

    it('lets the manager the line belongs to take a side', async () => {
      const { year, managers } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });

      // Every seat, on their own number. Ownership is not a rule about roster 1.
      for (const [index, manager] of managers.entries()) {
        const own = await lineIdFor(year, 4, index + 1);
        expect(
          (await placeEntry(db!, { stakeId: own, userId: manager.id, side: 'over' })).status,
          `roster ${String(index + 1)}`,
        ).toBe('placed');
      }
    });

    it('refuses a manager taking a side on somebody else’s team total', async () => {
      /*
       * **Ruling 2, and the reason it is a real authorization boundary.** A line
       * is a number set for one manager's own team, and a wager somebody else
       * places on it is a wager on a team they do not play.
       */
      const { seasonId, year, managers } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });
      const notTheirs = await lineIdFor(year, 4, 1);

      expect(await placeEntry(db!, { stakeId: notTheirs, userId: managers[1]!.id, side: 'over' })).toEqual(
        { status: 'not_eligible' },
      );

      // Nothing left behind: no entry, and the tab is untouched.
      expect(await db!.select({ id: stakeEntries.id }).from(stakeEntries)).toHaveLength(0);
      expect(await balanceOf(managers[1]!.id, seasonId)).toBe(250);
    });

    it('refuses it in the database too, whatever holds the connection', async () => {
      /*
       * The service check is not allowed to be the only answer. `stake_entries`
       * can be written by anything with a connection, so the rule lives where the
       * Showcase's does (`0006`): a foreign key can say *"that stake exists"* and
       * cannot say *"that stake is yours"*.
       *
       * The rule is about **eligibility**, not about the kind — *"you may only
       * enter a stake you were offered"* is true of a bounty and a chalkboard
       * too; they simply carry the whole league in the snapshot.
       */
      const { year, managers } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });
      const notTheirs = await lineIdFor(year, 4, 1);

      await expectPgMessage(
        db!.insert(stakeEntries).values({
          stakeId: notTheirs,
          userId: managers[1]!.id,
          side: 'over',
          stakedTokens: 10,
          createdAt: FIXED,
        }),
        /was not offered stake/,
      );
    });
  });

  /* ------------------------------------------------------------ settlement -- */

  describe('settling a market', () => {
    it('pays the winners, records the losers, and writes one resolution', async () => {
      const { seasonId, year, managers } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });
      const id = await lineIdFor(year, 4, 1);

      /*
       * **Two lines, not two picks on one.** Roster 1 posts 150.00 in week 4
       * against their own number and clears it; roster 2 posts 92.00 against
       * theirs and does not. Both took `over`, and one of them was right — which
       * is the whole point of the line being personal, and it is why this test
       * could not be written as two entries on a single stake any more.
       */
      const theirs = await lineIdFor(year, 4, 2);
      await placeEntry(db!, { stakeId: id, userId: managers[0]!.id, side: 'over' });
      await placeEntry(db!, { stakeId: theirs, userId: managers[1]!.id, side: 'over' });

      await closeWeek(year, 4);

      expect((await settleStake(db!, { stakeId: id, season: year, week: 4 })).status).toBe('settled');
      expect((await settleStake(db!, { stakeId: theirs, season: year, week: 4 })).status).toBe(
        'settled',
      );

      const entries = await db!
        .select({
          userId: stakeEntries.userId,
          outcome: stakeEntries.outcome,
          payout: stakeEntries.payoutTokens,
        })
        .from(stakeEntries);

      const byUser = new Map(entries.map((row) => [row.userId, row]));
      expect(byUser.get(managers[0]!.id)?.outcome).toBe('won');
      expect(byUser.get(managers[0]!.id)?.payout).toBe(20);
      expect(byUser.get(managers[1]!.id)?.outcome).toBe('lost');
      expect(byUser.get(managers[1]!.id)?.payout).toBe(0);

      // 250 − 10 + 20, and 250 − 10.
      expect(await balanceOf(managers[0]!.id, seasonId)).toBe(260);
      expect(await balanceOf(managers[1]!.id, seasonId)).toBe(240);
    });

    it('cannot settle twice, however many times it is asked', async () => {
      /*
       * The requirement, stated exactly: *duplicate settlement is impossible*.
       * `stake_resolutions.stake_id` is UNIQUE and the resolution is inserted
       * **first**, so a second attempt collides before any token moves.
       */
      const { seasonId, year, managers } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });
      const id = await lineIdFor(year, 4, 1);
      await placeEntry(db!, { stakeId: id, userId: managers[0]!.id, side: 'over' });
      await closeWeek(year, 4);

      const first = await settleStake(db!, { stakeId: id, season: year, week: 4 });
      expect(first.status).toBe('settled');

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const again = await settleStake(db!, { stakeId: id, season: year, week: 4 });
        expect(again.status).toBe('already_settled');
      }

      expect(await balanceOf(managers[0]!.id, seasonId)).toBe(260);

      const payouts = await db!
        .select({ id: tokenTransactions.id })
        .from(tokenTransactions)
        .where(eq(tokenTransactions.reasonCode, 'STAKE_PAYOUT'));
      expect(payouts).toHaveLength(1);
    });

    it('collapses ten simultaneous settlements into one payout', async () => {
      const { seasonId, year, managers } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });
      const id = await lineIdFor(year, 4, 1);
      await placeEntry(db!, { stakeId: id, userId: managers[0]!.id, side: 'over' });
      await closeWeek(year, 4);

      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () => settleStake(db!, { stakeId: id, season: year, week: 4 })),
      );
      expect(results.every((result) => result.status === 'fulfilled')).toBe(true);

      const resolutions = await db!
        .select({ id: stakeResolutions.id })
        .from(stakeResolutions)
        .where(eq(stakeResolutions.stakeId, id));
      expect(resolutions).toHaveLength(1);
      expect(await balanceOf(managers[0]!.id, seasonId)).toBe(260);
    });

    it('will not settle from a season whose books are open', async () => {
      /*
       * The rule that matters most. A stake settled from a number that later
       * moves has moved tokens on a fact that stopped being true.
       */
      const { year, managers } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });
      const id = await lineIdFor(year, 4, 1);
      await placeEntry(db!, { stakeId: id, userId: managers[0]!.id, side: 'over' });

      const result = await settleStake(db!, { stakeId: id, season: year, week: 4 });
      expect(result).toEqual({ status: 'not_yet', why: 'not-final' });

      const resolutions = await db!.select({ id: stakeResolutions.id }).from(stakeResolutions);
      expect(resolutions).toHaveLength(0);
    });

    it('records why it resolved, as data a manager could recompute', async () => {
      const { year } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });
      const id = await lineIdFor(year, 4, 1);
      await closeWeek(year, 4);
      await settleStake(db!, { stakeId: id, season: year, week: 4 });

      const [row] = await db!
        .select({ evidence: stakeResolutions.evidence, week: stakeResolutions.resolvedWeek })
        .from(stakeResolutions)
        .where(eq(stakeResolutions.stakeId, id));

      const evidence = row!.evidence as {
        statementKey: string;
        statement: string;
        gameKeys: string[];
        values: Record<string, string>;
      };

      expect(row!.week).toBe(4);
      expect(evidence.statementKey).toBe('line-settled');
      // The manager the line belongs to, and what they put up — not a league split.
      expect(evidence.values['subject']).toBeDefined();
      expect(evidence.values['scored']).toMatch(/^\d+\.\d\d$/);
      // The games behind it, so the claim is checkable rather than merely stated.
      expect(evidence.gameKeys.length).toBeGreaterThan(0);
      expect(evidence.values['line']).toMatch(/^\d+\.\d\d$/);
    });
  });

  /* -------------------------------------------------------------- immutable -- */

  describe('a settled stake is history', () => {
    it('refuses to have its resolution rewritten or deleted', async () => {
      const { year } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });
      const id = await lineIdFor(year, 4, 1);
      await closeWeek(year, 4);
      await settleStake(db!, { stakeId: id, season: year, week: 4 });

      await expectPgMessage(
        db!
          .update(stakeResolutions)
          .set({ outcome: 'push' })
          .where(eq(stakeResolutions.stakeId, id)),
        /append-only/,
      );
      await expectPgMessage(
        db!.delete(stakeResolutions).where(eq(stakeResolutions.stakeId, id)),
        /append-only/,
      );
    });

    it('refuses to have its terms changed', async () => {
      // *"Do not allow later Sleeper mutations to rewrite finalized outcomes"* is
      // only true if the terms cannot move either — a line quietly re-derived
      // after a stat correction would settle a different bet from the one taken.
      const { year } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });
      const id = await lineIdFor(year, 4, 1);

      await expectPgMessage(
        db!
          .update(weeklyStakes)
          .set({ factRefs: { basisWeeks: [], gameKeys: [], values: { line: '1.00' } } })
          .where(eq(weeklyStakes.id, id)),
        /published offer; its terms are immutable/,
      );
    });

    it('refuses to be deleted', async () => {
      const { year } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });
      const id = await lineIdFor(year, 4, 1);

      await expectPgMessage(
        db!.delete(weeklyStakes).where(eq(weeklyStakes.id, id)),
        /withdraw it with status void instead/,
      );
    });

    it('refuses a second status transition', async () => {
      const { year } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });
      const id = await lineIdFor(year, 4, 1);
      await closeWeek(year, 4);
      await settleStake(db!, { stakeId: id, season: year, week: 4 });

      await expectPgMessage(
        db!.update(weeklyStakes).set({ status: 'void', voidReason: 'nope' }).where(eq(weeklyStakes.id, id)),
        /a terminal stake does not change state/,
      );
    });
  });

  /* ------------------------------------------------------------- the shape -- */

  describe('the table refuses a stake that does not make sense', () => {
    it('refuses a market that does not pay double', async () => {
      const { seasonId } = await league();
      await expectPgError(
        db!.insert(weeklyStakes).values({
          seasonId,
          week: 4,
          kind: 'TONYS_LINE',
          stakeKey: 'bad-1',
          variant: VARIANTS.seasonMedian,
          eligibleUserIds: [],
          factRefs: {},
          allowedNumbers: [],
          allowedNames: [],
          authorVersion: 'v',
          stakeTokens: 10,
          rewardTokens: 15,
          settlementKey: 'bad-1',
          createdAt: FIXED,
          updatedAt: FIXED,
        }),
        { code: PG_ERROR.checkViolation, constraint: 'weekly_stakes_line_pays_double' },
      );
    });

    it('refuses a prediction carrying money', async () => {
      const { seasonId } = await league();
      await expectPgError(
        db!.insert(weeklyStakes).values({
          seasonId,
          week: 4,
          kind: 'CHALKBOARD',
          stakeKey: 'bad-2',
          variant: VARIANTS.nobodyClearsRecord,
          eligibleUserIds: [],
          factRefs: {},
          allowedNumbers: [],
          allowedNames: [],
          authorVersion: 'v',
          rewardTokens: 100,
          settlementKey: 'bad-2',
          createdAt: FIXED,
          updatedAt: FIXED,
        }),
        { code: PG_ERROR.checkViolation, constraint: 'weekly_stakes_line_pays_double' },
      );
    });

    it('refuses a market or a prediction that rolls', async () => {
      const { seasonId } = await league();
      await expectPgError(
        db!.insert(weeklyStakes).values({
          seasonId,
          week: 4,
          kind: 'CHALKBOARD',
          stakeKey: 'bad-3',
          variant: VARIANTS.nobodyClearsRecord,
          eligibleUserIds: [],
          factRefs: {},
          allowedNumbers: [],
          allowedNames: [],
          authorVersion: 'v',
          expiresAfterWeek: 8,
          settlementKey: 'bad-3',
          createdAt: FIXED,
          updatedAt: FIXED,
        }),
        { code: PG_ERROR.checkViolation, constraint: 'weekly_stakes_only_bounties_roll' },
      );
    });

    it('refuses a void with no reason, and a reason with no void', async () => {
      const { year } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });
      const id = await lineIdFor(year, 4, 1);

      await expectPgError(
        db!.update(weeklyStakes).set({ status: 'void' }).where(eq(weeklyStakes.id, id)),
        { code: PG_ERROR.checkViolation, constraint: 'weekly_stakes_void_has_reason' },
      );

      expect(await voidStake(db!, { stakeId: id, reason: 'The commissioner pulled it.' })).toBe(
        true,
      );
      const [row] = await db!
        .select({ status: weeklyStakes.status, reason: weeklyStakes.voidReason })
        .from(weeklyStakes)
        .where(eq(weeklyStakes.id, id));
      expect(row!.status).toBe('void');
      expect(row!.reason).toBe('The commissioner pulled it.');
    });

    it('refuses an outcome the kind cannot have', async () => {
      const { year } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });
      const id = await lineIdFor(year, 4, 1);

      await expectPgMessage(
        db!.insert(stakeResolutions).values({
          stakeId: id,
          outcome: 'unclaimed',
          resolvedWeek: 4,
          evidence: {},
          resolvedAt: FIXED,
        }),
        /a market settles or it pushes/,
      );
    });

    it('refuses a claimant on anything but a claimed bounty', async () => {
      const { year, managers } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });
      const id = await lineIdFor(year, 4, 1);

      await expectPgMessage(
        db!.insert(stakeResolutions).values({
          stakeId: id,
          outcome: 'settled',
          resolvedWeek: 4,
          claimedByUserId: managers[0]!.id,
          evidence: {},
          resolvedAt: FIXED,
        }),
        /only a claimed bounty has a claimant/,
      );
    });
  });

  /* ---------------------------------------------------------------- season -- */

  describe('settling a whole season', () => {
    it('walks a bounty forward and pays whoever claimed it first', async () => {
      const { seasonId, year, managers } = await league();

      /*
       * The bounty is authored for week 5 against week 4's 150.00. Week 5 gets
       * nowhere near it and roster 3 clears it in week 6, so the settler has to
       * walk two weeks and pick the first that qualifies — which is what makes
       * *"the earliest week wins"* a claim rather than a description of whichever
       * week the settler happened to look at.
       */
      await authorStakesForWeek(db!, { season: year, week: 5, lineOpen: false });
      await closeAllWeeks(year);

      const before = await balanceOf(managers[2]!.id, seasonId);
      const results = await settleSeason(db!, year);

      const bounty = results.find((result) => result.stakeKey.includes('week-score'));
      expect(bounty?.result.status).toBe('settled');

      const [row] = await db!
        .select({
          outcome: stakeResolutions.outcome,
          claimant: stakeResolutions.claimedByUserId,
          week: stakeResolutions.resolvedWeek,
          source: stakeResolutions.resolvedFrom,
        })
        .from(stakeResolutions)
        .innerJoin(weeklyStakes, eq(weeklyStakes.id, stakeResolutions.stakeId))
        .where(eq(weeklyStakes.kind, 'BOUNTY'));

      expect(row!.outcome).toBe('hit');
      expect(row!.claimant).toBe(managers[2]!.id);
      expect(row!.week).toBe(6);
      // The Tuesday job's record, not the season close — and it says so.
      expect(row!.source).toBe('finalized_week');
      expect(await balanceOf(managers[2]!.id, seasonId)).toBe(before + 100);
    });

    it('is safe to run again, and moves nothing the second time', async () => {
      const { seasonId, year, managers } = await league();
      await authorStakesForWeek(db!, { season: year, week: 5, lineOpen: false });
      await closeAllWeeks(year);

      await settleSeason(db!, year);
      const balances = await Promise.all(
        managers.map((manager) => balanceOf(manager.id, seasonId)),
      );
      const resolved = await db!.select({ id: stakeResolutions.id }).from(stakeResolutions);
      expect(resolved.length).toBeGreaterThan(0);

      for (const result of await settleSeason(db!, year)) {
        // Anything still open is open because it *cannot* settle, never because
        // a second pass declined to try.
        expect(result.result.status).toBe('not_yet');
      }

      expect(await db!.select({ id: stakeResolutions.id }).from(stakeResolutions)).toHaveLength(
        resolved.length,
      );
      for (const [index, manager] of managers.entries()) {
        expect(await balanceOf(manager.id, seasonId)).toBe(balances[index]);
      }
    });
  });

  /* --------------------------------------------------------------- ledger -- */

  describe('the ledger', () => {
    it('names a stake movement as its own reason', async () => {
      // A payout that said "adjustment" would be indistinguishable on a manager's
      // own statement from the commissioner correcting something by hand.
      const { year, managers } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });
      const id = await lineIdFor(year, 4, 1);
      await placeEntry(db!, { stakeId: id, userId: managers[0]!.id, side: 'over' });
      await closeWeek(year, 4);
      await settleStake(db!, { stakeId: id, season: year, week: 4 });

      const rows = await db!
        .select({ reason: tokenTransactions.reasonCode, ref: tokenTransactions.sourceRef })
        .from(tokenTransactions)
        .where(sql`${tokenTransactions.reasonCode} in ('STAKE_PLACED','STAKE_PAYOUT')`);

      expect(rows.map((row) => row.reason).sort()).toEqual(['STAKE_PAYOUT', 'STAKE_PLACED']);
      // Every stake movement points back at the stake it came from.
      for (const row of rows) expect(row.ref).toBe(id);
    });

    it('namespaces every key under the stake it settles', async () => {
      const { year, managers } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });
      const id = await lineIdFor(year, 4, 1);
      await placeEntry(db!, { stakeId: id, userId: managers[0]!.id, side: 'over' });
      await closeWeek(year, 4);
      await settleStake(db!, { stakeId: id, season: year, week: 4 });

      const rows = await db!
        .select({ key: tokenTransactions.idempotencyKey })
        .from(tokenTransactions)
        .where(sql`${tokenTransactions.reasonCode} in ('STAKE_PLACED','STAKE_PAYOUT')`);

      const key = stakeKeyFor({ season: year, week: 4, variant: VARIANTS.seasonMedian, rosterId: 1 });
      for (const row of rows) {
        expect(row.key.startsWith(settlementKeyFor(key)), row.key).toBe(true);
      }
    });

    it('writes no ledger row for a losing pick', async () => {
      // A zero-amount transaction is refused by `token_transactions_amount_non_zero`
      // and would mean nothing anyway. The entry row records the settlement; the
      // ledger records movement.
      const { seasonId, year, managers } = await league();
      await authorStakesForWeek(db!, { season: year, week: 4, lineOpen: true });
      const id = await lineIdFor(year, 4, 1);
      /*
       * Roster 1 posts 150.00 against a line of 110.00, so `under` is the losing
       * side. Chosen from the fixture rather than assumed — the first draft used
       * roster 2, who scored 92.00, and `under` was the *winning* side there.
       */
      await placeEntry(db!, { stakeId: id, userId: managers[0]!.id, side: 'under' });
      await closeWeek(year, 4);
      await settleStake(db!, { stakeId: id, season: year, week: 4 });

      const payouts = await db!
        .select({ id: tokenTransactions.id })
        .from(tokenTransactions)
        .where(
          and(
            eq(tokenTransactions.reasonCode, 'STAKE_PAYOUT'),
            eq(tokenTransactions.sourceRef, id),
          ),
        );
      expect(payouts).toHaveLength(0);

      const [entry] = await db!
        .select({ outcome: stakeEntries.outcome, settled: stakeEntries.settledAt })
        .from(stakeEntries)
        .where(eq(stakeEntries.stakeId, id));
      expect(entry!.outcome).toBe('lost');
      expect(entry!.settled).not.toBeNull();
      expect(await balanceOf(managers[0]!.id, seasonId)).toBe(240);
    });
  });
});
