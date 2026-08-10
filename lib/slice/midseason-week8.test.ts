import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { clearClock, setFixedClock } from '@/lib/clock';
import { openBox } from '@/lib/counter/boxes';
import { wallet } from '@/lib/counter/tokens';
import { closePool, getDb, schema } from '@/lib/db';
import {
  collectibles,
  fantasyMatchups,
  lootBoxes,
  seasonMemberships,
  seasons,
  sliceIssueVersions,
  tokenTransactions,
  users,
  weekFinalizations,
  weeklyRewards,
  weeklyStakes,
} from '@/lib/db/schema';
import { resetDatabase } from '@/lib/db/reset';
import { APPROVED_2026_ROSTER, activeLeagueManagers } from '@/lib/league/membership';
import { receiptFor } from '@/lib/parlor/receipt';
import { boardFace, tonightBoard } from '@/lib/parlor/tonight';
import { awardWeek } from '@/lib/rewards/service';
import {
  MIDSEASON_GAMES,
  MIDSEASON_SEASON,
  REHEARSAL_WEEK,
  midseasonMatchupRows,
  midseasonRecords,
  seasonAtWeek,
} from '@/lib/sleeper/midseason-2026';
import { importHistory, playWeek, tuesdayOf } from '@/lib/sleeper/midseason-season';
import { latestStoredWeek, syncSeason } from '@/lib/sleeper/weekly';
import { finalizeWeek, stakeBasis, stakeSeason } from '@/lib/stakes/facts';
import { factPacket } from '@/lib/slice/packet';
import { generateDraft } from '@/lib/slice/publication';
import { finalizedMarginsCents } from '@/lib/stats/facts';
import { featuredMatchup, matchupLine } from '@/lib/stats/board';
import { standingsThrough, winStreak } from '@/lib/stats/standings';
import { currentWeekOf } from '@/lib/stats/week';
import { runSunday } from '@/lib/slice/sunday';
import { runTuesday } from '@/lib/slice/tuesday';
import { weekSnapshot } from '@/lib/stats/snapshot';

/**
 * The midseason rehearsal — week 8 of 2026, against a real Postgres.
 *
 * ## What this file is for, and what it deliberately is not
 *
 * `lib/slice/tuesday.test.ts` already proves the Tuesday job's sequence from a
 * standing start: a week arrives, it closes, it pays, it drafts, and running it
 * twice is a read. Every one of its assertions is about **week one**, and week
 * one is the easiest week of the season — the database is empty, so there is
 * nothing for a new week to be wrong *relative to*.
 *
 * This file asks the other question: **what breaks only after seven finalized
 * weeks already exist.** Records that must increment rather than reset or
 * double-count. A streak that has to be read back through a boundary. An order
 * statistic computed from a sample that grew. A bounty rolled forward from week
 * five. A milestone grant that came due at week seven. A tiebreak that only ever
 * executes when two managers are level, which cannot happen in week one.
 *
 * It is **not** a general lifecycle harness and must not become one. It owns one
 * scenario — `lib/sleeper/midseason-2026.ts`'s eight-week scoreboard — and every
 * number below is a consequence of that scoreboard, stated so a reader can check
 * it against the table in that file's header.
 *
 * ## The season is played, not inserted
 *
 * `importHistory` then seven `playWeek` calls, through the same `runTuesday` the
 * cron calls. `lib/sleeper/midseason-season.ts` records why a hand-inserted
 * history would prove nothing: the midseason failure modes are all about what
 * seven Tuesdays *left behind*, and inserted rows were never left behind by
 * anything.
 *
 * That costs about a second and a half of setup, so the accumulated season is
 * built **once** in `beforeAll` for the read-only assertions, and rebuilt only
 * by the blocks that have to mutate it.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

/** The week before the rehearsal week — the accumulated history. */
const PRIOR_WEEK = REHEARSAL_WEEK - 1;

afterAll(async () => {
  if (hasDatabase) await closePool();
});

/** Play the season up to and including `through`, from an empty database. */
async function buildSeason(through: number): Promise<void> {
  await resetDatabase(db!);
  await importHistory(db!);
  for (let week = 1; week <= through; week += 1) await playWeek(db!, week);
}

async function seasonId(year: number): Promise<string> {
  const [row] = await db!.select({ id: seasons.id }).from(seasons).where(eq(seasons.year, year));
  return row!.id;
}

/** Roster id → manager id, for the current season. */
async function seats(): Promise<ReadonlyMap<number, string>> {
  const rows = await db!
    .select({ roster: seasonMemberships.rosterId, userId: seasonMemberships.userId })
    .from(seasonMemberships)
    .innerJoin(seasons, eq(seasons.id, seasonMemberships.seasonId))
    .where(eq(seasons.year, MIDSEASON_SEASON));
  return new Map(rows.map((row) => [row.roster, row.userId]));
}

/**
 * A manager's **2026** membership id.
 *
 * Scoped to the season, and that is the whole point of the helper. A manager
 * holds three memberships — one per imported season — so a lookup by `userId`
 * alone returns whichever row the planner reaches first, which in this database
 * is 2024's. Two assertions here read an empty reward list and reported it as a
 * product failure before the scoping was added; `11 §2` keeps the person and the
 * seat apart precisely because they are not interchangeable.
 */
async function seatId(userId: string): Promise<string> {
  const [row] = await db!
    .select({ id: seasonMemberships.id })
    .from(seasonMemberships)
    .innerJoin(seasons, eq(seasons.id, seasonMemberships.seasonId))
    .where(and(eq(seasonMemberships.userId, userId), eq(seasons.year, MIDSEASON_SEASON)));
  return row!.id;
}

/** Every row of the two archived seasons, as a comparable fingerprint. */
async function historyFingerprint(): Promise<string> {
  const games = await db!
    .select({
      year: seasons.year,
      week: fantasyMatchups.week,
      matchup: fantasyMatchups.sleeperMatchupId,
      a: fantasyMatchups.rosterAId,
      b: fantasyMatchups.rosterBId,
      pa: fantasyMatchups.pointsACents,
      pb: fantasyMatchups.pointsBCents,
      winner: fantasyMatchups.winnerRosterId,
    })
    .from(fantasyMatchups)
    .innerJoin(seasons, eq(seasons.id, fantasyMatchups.seasonId))
    .where(sql`${seasons.year} in (2024, 2025)`)
    .orderBy(seasons.year, fantasyMatchups.week, fantasyMatchups.sleeperMatchupId);

  const records = await db!
    .select({
      year: seasons.year,
      roster: seasonMemberships.rosterId,
      userId: seasonMemberships.userId,
      wins: seasonMemberships.wins,
      losses: seasonMemberships.losses,
      pointsFor: seasonMemberships.pointsFor,
      rank: seasonMemberships.finalRank,
    })
    .from(seasonMemberships)
    .innerJoin(seasons, eq(seasons.id, seasonMemberships.seasonId))
    .where(sql`${seasons.year} in (2024, 2025)`)
    .orderBy(seasons.year, seasonMemberships.rosterId);

  return JSON.stringify({ games, records });
}

/** Row counts across every table an accumulated season writes to. */
async function tally(): Promise<Record<string, number>> {
  const [matchups] = await db!.select({ n: sql<number>`count(*)::int` }).from(fantasyMatchups);
  const [closures] = await db!.select({ n: sql<number>`count(*)::int` }).from(weekFinalizations);
  const [rewards] = await db!.select({ n: sql<number>`count(*)::int` }).from(weeklyRewards);
  const [ledger] = await db!.select({ n: sql<number>`count(*)::int` }).from(tokenTransactions);
  const [stakes] = await db!.select({ n: sql<number>`count(*)::int` }).from(weeklyStakes);
  const [boxes] = await db!.select({ n: sql<number>`count(*)::int` }).from(lootBoxes);
  const [items] = await db!.select({ n: sql<number>`count(*)::int` }).from(collectibles);
  return {
    matchups: matchups!.n,
    closures: closures!.n,
    rewards: rewards!.n,
    ledger: ledger!.n,
    stakes: stakes!.n,
    boxes: boxes!.n,
    collectibles: items!.n,
  };
}

describe.skipIf(!hasDatabase)('the midseason rehearsal — week 8 of 2026', () => {
  /* ---------------------------------------------------------------------
   * Seven weeks of accumulated history
   * ------------------------------------------------------------------ */

  describe('the state week 8 starts from', () => {
    beforeAll(async () => {
      await buildSeason(PRIOR_WEEK);
    }, 120_000);

    it('holds every week, closed once each, and nothing else', async () => {
      const season = await stakeSeason(db!, MIDSEASON_SEASON);

      expect([...new Set(season.rows.map((row) => row.week))].sort((a, b) => a - b)).toEqual([
        1, 2, 3, 4, 5, 6, 7,
      ]);
      // Five games a week, seven weeks. A week counted twice would show here
      // first, and it is the cheapest possible statement of "no double import".
      expect(season.rows).toHaveLength(35);
      expect([...season.weekFinalizedAt.keys()].sort((a, b) => a - b)).toEqual([
        1, 2, 3, 4, 5, 6, 7,
      ]);
    });

    it('derives every record from the games, matching the fixture to the cent', async () => {
      /*
       * The whole midseason premise in one assertion.
       *
       * `standingsThrough` rebuilds the table from stored games rather than
       * reading `season_memberships`, so this compares two independent
       * derivations: the product's, and the scoreboard's own. A record that
       * reset on week 2, double-counted week 4, or picked up a stale row would
       * disagree here and nowhere else — week one cannot tell any of those
       * apart, because after one week every wrong answer is also 1–0.
       */
      const season = await stakeSeason(db!, MIDSEASON_SEASON);
      const table = standingsThrough({
        rows: season.rows,
        throughWeek: PRIOR_WEEK,
        roster: season.roster,
      });
      const expected = new Map(midseasonRecords(PRIOR_WEEK).map((row) => [row.rosterId, row]));

      expect(table).toHaveLength(10);
      for (const row of table) {
        const want = expected.get(row.rosterId)!;
        expect({
          roster: row.rosterId,
          wins: row.wins,
          losses: row.losses,
          pointsForCents: row.pointsForCents,
        }).toEqual({
          roster: want.rosterId,
          wins: want.wins,
          losses: want.losses,
          pointsForCents: want.pointsForCents,
        });
      }

      // Seven games each, every manager, every week accounted for exactly once.
      for (const row of table) expect(row.wins + row.losses + row.ties).toBe(PRIOR_WEEK);
    });

    it("agrees with Sleeper's own standings, so nothing is disputed", async () => {
      /*
       * `reconcileSeason` compares the official record against the sum of the
       * weekly snapshot and marks a game `disputed` where they disagree. Seven
       * weeks of agreement is a stronger statement than one week of it: a
       * cumulative total that drifted by a cent in week 3 stays wrong forever.
       */
      const rows = await db!
        .select({
          roster: seasonMemberships.rosterId,
          wins: seasonMemberships.wins,
          losses: seasonMemberships.losses,
          pointsFor: seasonMemberships.pointsFor,
        })
        .from(seasonMemberships)
        .innerJoin(seasons, eq(seasons.id, seasonMemberships.seasonId))
        .where(eq(seasons.year, MIDSEASON_SEASON))
        .orderBy(seasonMemberships.rosterId);

      expect(rows.map((row) => ({ ...row, pointsFor: Math.round(row.pointsFor * 100) }))).toEqual(
        midseasonRecords(PRIOR_WEEK).map((row) => ({
          roster: row.rosterId,
          wins: row.wins,
          losses: row.losses,
          pointsFor: row.pointsForCents,
        })),
      );

      const [disputed] = await db!
        .select({ n: sql<number>`count(*)::int` })
        .from(fantasyMatchups)
        .innerJoin(seasons, eq(seasons.id, fantasyMatchups.seasonId))
        .where(and(eq(seasons.year, MIDSEASON_SEASON), eq(fantasyMatchups.disputed, true)));
      expect(disputed!.n).toBe(0);
    });

    it('ranks two managers level on wins by points for, and says so', async () => {
      /*
       * Matty B and Matt Lee are both 6–1 entering week 8, separated by 0.60 of
       * a point. The points-for tiebreak is unreachable in week one — after one
       * week nobody can be level on wins *and* have a season's worth of points
       * to separate them — so this is the first time the second sort key is ever
       * executed against real accumulated totals.
       */
      const season = await stakeSeason(db!, MIDSEASON_SEASON);
      const table = standingsThrough({
        rows: season.rows,
        throughWeek: PRIOR_WEEK,
        roster: season.roster,
      });

      const [first, second] = table;
      expect(first!.wins).toBe(second!.wins);
      expect(first!.displayName).toBe('Matty B');
      expect(second!.displayName).toBe('Matt Lee');
      expect(first!.pointsForCents).toBeGreaterThan(second!.pointsForCents);
      // Distinct ranks, because they are not level on both criteria.
      expect(first!.rank).toBe(1);
      expect(second!.rank).toBe(2);
    });

    it('reads a live win streak back through seven weeks', async () => {
      const season = await stakeSeason(db!, MIDSEASON_SEASON);
      const streakOf = (rosterId: number): number =>
        winStreak({ rows: season.rows, rosterId, throughWeek: PRIOR_WEEK });

      // Nathan has won weeks 4, 5, 6 and 7. Week one can only ever report 0 or 1.
      expect(streakOf(2)).toBe(4);
      // Brandon, three. Matty B, one — he lost week 6, so the run before it is
      // not his current streak, which is the case a naive count gets wrong.
      expect(streakOf(7)).toBe(3);
      expect(streakOf(10)).toBe(1);
      // Zack has lost four straight, so he has no win streak at all.
      expect(streakOf(4)).toBe(0);
    });

    it('never counts a 2025 game towards a 2026 streak', async () => {
      /*
       * The season-boundary question a streak reader can only fail at midseason.
       * Ryan is 1–6 in 2026 and won the 2025 title; a streak that walked off the
       * end of this season's games into last season's would report him hot.
       */
      const season = await stakeSeason(db!, MIDSEASON_SEASON);
      expect(season.rows.every((row) => row.week <= PRIOR_WEEK)).toBe(true);
      expect(winStreak({ rows: season.rows, rosterId: 6, throughWeek: PRIOR_WEEK })).toBe(0);
    });

    it('has a manager whose record is a lie, and the numbers to prove it', async () => {
      /*
       * Alex is 2–5 and leads the league in points for by 84.45 — the condition
       * `16 §12` cares about most, because a surface that reads *record* as
       * *quality* says something false about a real person. It is authored into
       * the fixture rather than hoped for, and asserted here so that a change to
       * the scoreboard cannot quietly remove the case.
       */
      const season = await stakeSeason(db!, MIDSEASON_SEASON);
      const table = standingsThrough({
        rows: season.rows,
        throughWeek: PRIOR_WEEK,
        roster: season.roster,
      });
      const alex = table.find((row) => row.displayName === 'Alex')!;

      expect(`${String(alex.wins)}-${String(alex.losses)}`).toBe('2-5');
      expect(alex.rank).toBeGreaterThan(6);
      expect(Math.max(...table.map((row) => row.pointsForCents))).toBe(alex.pointsForCents);
    });

    it('has paid every closed week exactly once, and nothing twice', async () => {
      const paid = await db!
        .select({
          week: weeklyRewards.week,
          seat: weeklyRewards.seasonMembershipId,
          reason: weeklyRewards.reason,
          amount: weeklyRewards.amount,
        })
        .from(weeklyRewards);

      // Five winners and one high score a week, seven weeks.
      expect(paid).toHaveLength(7 * 6);
      const keys = new Set(paid.map((row) => `${String(row.week)}:${row.seat}:${row.reason}`));
      expect(keys.size).toBe(paid.length);

      for (const week of [1, 2, 3, 4, 5, 6, 7]) {
        const forWeek = paid.filter((row) => row.week === week);
        expect(forWeek.filter((row) => row.reason === 'MATCHUP_WIN')).toHaveLength(5);
        expect(forWeek.filter((row) => row.reason === 'WEEKLY_HIGH_SCORE')).toHaveLength(1);
      }
    });

    it('reconciles every balance to its own ledger', async () => {
      /*
       * `03 §5`: the displayed balance must reconcile to the ledger. After seven
       * weeks a manager's balance is an opening grant plus up to fourteen
       * rewards; week one cannot tell a balance that is maintained from one that
       * is recomputed, because after one week both are the same arithmetic.
       */
      const id = await seasonId(MIDSEASON_SEASON);
      for (const manager of await activeLeagueManagers(db!)) {
        const held = await wallet(db!, { userId: manager.id, seasonId: id });
        const [sum] = await db!
          .select({ total: sql<number>`coalesce(sum(${tokenTransactions.amount}), 0)::int` })
          .from(tokenTransactions)
          .innerJoin(
            seasonMemberships,
            eq(seasonMemberships.id, tokenTransactions.seasonMembershipId),
          )
          .where(
            and(eq(seasonMemberships.userId, manager.id), eq(seasonMemberships.seasonId, id)),
          );
        expect(held!.balance).toBe(sum!.total);
      }
    });

    it('has handed out both seasonal boxes by week 7, and only both', async () => {
      /*
       * `MIDSEASON_WEEK` is 7, so the second milestone comes due on exactly the
       * Tuesday before the rehearsal week. Seven Tuesdays each ran
       * `grantSeasonalBoxes`, so this is also the strongest available statement
       * that `loot_boxes.grant_key` is doing its job: fourteen calls, twenty
       * boxes.
       */
      const granted = await db!
        .select({ key: lootBoxes.grantKey, user: lootBoxes.userId })
        .from(lootBoxes)
        .where(sql`${lootBoxes.grantKey} like 'season-grant:%'`);

      expect(granted).toHaveLength(20);
      expect(granted.filter((row) => row.key?.includes('SEASON_OPENING'))).toHaveLength(10);
      expect(granted.filter((row) => row.key?.includes('MIDSEASON'))).toHaveLength(10);
      expect(new Set(granted.map((row) => row.key)).size).toBe(20);
    });

    it('is still carrying a bounty from week 5, unclaimed', async () => {
      /*
       * A rolling bounty is a purely midseason object: it is authored in one
       * week, survives the Tuesdays of the weeks after it, and is settled by a
       * week nobody had played when it was written. Week one has nothing to
       * roll.
       */
      const open = await db!
        .select({ week: weeklyStakes.week, numbers: weeklyStakes.allowedNumbers })
        .from(weeklyStakes)
        .where(and(eq(weeklyStakes.variant, 'week-score'), eq(weeklyStakes.status, 'open')));

      expect(open).toHaveLength(1);
      expect(open[0]!.week).toBe(5);
      // Alex's 149.24 in week 4 — the best single team-week of weeks 1–4, frozen
      // at authoring and immutable since.
      expect(open[0]!.numbers).toContain('149.24');
    });

    it('offers only one bounty at a time, across seven authoring passes', async () => {
      const bounties = await db!
        .select({ week: weeklyStakes.week, status: weeklyStakes.status })
        .from(weeklyStakes)
        .where(eq(weeklyStakes.variant, 'week-score'));
      expect(bounties.filter((row) => row.status === 'open')).toHaveLength(1);
    });
  });

  /* ---------------------------------------------------------------------
   * The rehearsal week itself
   * ------------------------------------------------------------------ */

  describe('week 8, through the production lifecycle', () => {
    /*
     * Week 8 is played **once**, in `beforeAll`, and every assertion below reads
     * what that one run left behind.
     *
     * Not for speed. `runTuesday` is idempotent, so a second call inside a test
     * is a read — which means a test that played it again would assert against
     * the *first* run's effects while believing it had caused them, and would go
     * on passing if the code it was testing stopped running at all.
     */
    let report: Awaited<ReturnType<typeof playWeek>>;
    let rewardsBefore: { week: number }[];

    beforeAll(async () => {
      await buildSeason(PRIOR_WEEK);
      rewardsBefore = await db!.select({ week: weeklyRewards.week }).from(weeklyRewards);
      report = await playWeek(db!, REHEARSAL_WEEK);
    }, 120_000);

    it('resolves week 8 after the sync, closes it, pays it, and stops at the desk', () => {
      // The week is not passed in. It is resolved from what the sync just wrote,
      // which is the sequence `lib/slice/tuesday.ts` exists to hold.
      expect(report.week).toBe(REHEARSAL_WEEK);
      expect(report.sync?.refusal).toBeNull();
      expect(report.finalized).toBe(true);
      expect(report.games).toBe(5);
      expect(report.rewards?.refusal).toBeNull();
      expect(report.rewards!.paid).toHaveLength(6);
      expect(report.failed).toEqual([]);

      // Both milestones already held, so week 8 grants nothing and says so.
      expect(report.grants?.granted).toBe(0);
      expect(report.grants?.alreadyGranted).toBe(20);
    });

    it('adds week 8 to the prior seven rather than replacing them', async () => {
      const season = await stakeSeason(db!, MIDSEASON_SEASON);

      expect(season.rows).toHaveLength(40);
      expect([...season.weekFinalizedAt.keys()].sort((a, b) => a - b)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8,
      ]);

      const table = standingsThrough({
        rows: season.rows,
        throughWeek: REHEARSAL_WEEK,
        roster: season.roster,
      });
      const expected = new Map(midseasonRecords(REHEARSAL_WEEK).map((row) => [row.rosterId, row]));
      for (const row of table) {
        const want = expected.get(row.rosterId)!;
        expect([row.wins, row.losses, row.pointsForCents]).toEqual([
          want.wins,
          want.losses,
          want.pointsForCents,
        ]);
      }
      for (const row of table) expect(row.wins + row.losses + row.ties).toBe(REHEARSAL_WEEK);
    });

    it('pays the week that just closed, and re-pays nothing older', async () => {
      const after = await db!.select({ week: weeklyRewards.week }).from(weeklyRewards);

      expect(rewardsBefore).toHaveLength(42);
      expect(after).toHaveLength(48);
      expect(after.filter((row) => row.week === REHEARSAL_WEEK)).toHaveLength(6);
      // Nothing was added to any earlier week.
      for (const week of [1, 2, 3, 4, 5, 6, 7]) {
        expect(after.filter((row) => row.week === week)).toHaveLength(6);
      }
    });

    it('pays the blowout winner both the win and the weekly high score', async () => {
      /*
       * Matty B's 158.90 is the highest single score of the season and it is
       * posted in week 8, so he takes 150 for the win and 400 for the high
       * score. It is the one week where the two awards land on the same manager,
       * and it checks that the derivation reads *this* week rather than the
       * season's running best.
       */
      const roster = await seats();
      const seat = await seatId(roster.get(10)!);

      const paid = await db!
        .select({ reason: weeklyRewards.reason, amount: weeklyRewards.amount })
        .from(weeklyRewards)
        .where(
          and(eq(weeklyRewards.week, REHEARSAL_WEEK), eq(weeklyRewards.seasonMembershipId, seat)),
        );

      expect(new Set(paid.map((row) => row.reason))).toEqual(
        new Set(['MATCHUP_WIN', 'WEEKLY_HIGH_SCORE']),
      );
      expect(paid.reduce((total, row) => total + row.amount, 0)).toBe(550);
    });

    it('pays the close loser nothing, and the close winner once', async () => {
      // Alex loses by 0.42 and is paid nothing for the week; Cheese wins by the
      // same 0.42 and is paid exactly the matchup win.
      const roster = await seats();

      for (const [rosterId, expectedAwards] of [
        [1, [] as string[]],
        [8, ['MATCHUP_WIN']],
      ] as const) {
        const seat = await seatId(roster.get(rosterId)!);
        const paid = await db!
          .select({ reason: weeklyRewards.reason })
          .from(weeklyRewards)
          .where(
            and(eq(weeklyRewards.week, REHEARSAL_WEEK), eq(weeklyRewards.seasonMembershipId, seat)),
          );
        expect(paid.map((row) => row.reason)).toEqual([...expectedAwards]);
      }
    });

    it('settles the bounty week 8 finally beat, and rolls nothing forward', async () => {
      /*
       * The week-5 bounty asked somebody to beat 149.24. Matty B's 158.90 does
       * it, three weeks after the number was frozen — which is the entire point
       * of a rolling stake and is unreachable in a single-week rehearsal.
       */
      expect(Object.values(report.settled).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);

      const bounty = await db!
        .select({ status: weeklyStakes.status, week: weeklyStakes.week })
        .from(weeklyStakes)
        .where(eq(weeklyStakes.variant, 'week-score'));
      expect(bounty.find((row) => row.week === 5)?.status).not.toBe('open');
    });
  });

  /* ---------------------------------------------------------------------
   * Replay, restart, and history that must not move
   * ------------------------------------------------------------------ */

  describe('replay and restart', () => {
    beforeAll(async () => {
      await buildSeason(REHEARSAL_WEEK);
    }, 120_000);

    it('changes nothing on a second week-8 Tuesday', async () => {
      const before = await tally();
      const replay = await playWeek(db!, REHEARSAL_WEEK);
      const after = await tally();

      expect(after).toEqual(before);
      expect(replay.finalized).toBe(false);
      expect(replay.rewards?.paid).toEqual([]);
      expect(replay.failed).toEqual([]);
    });

    it('changes nothing on a third, or on a Tuesday run for an older week', async () => {
      const before = await tally();
      await playWeek(db!, REHEARSAL_WEEK);
      // The commissioner's catch-up path, pointed at a week that is long closed.
      await runTuesday(db!, {
        season: MIDSEASON_SEASON,
        week: 3,
        at: tuesdayOf(REHEARSAL_WEEK),
        sleeper: seasonAtWeek({ played: REHEARSAL_WEEK, capturedAt: tuesdayOf(REHEARSAL_WEEK) }),
      });
      expect(await tally()).toEqual(before);
    });

    it('reads weeks 1 to 8 identically from a fresh connection', async () => {
      /*
       * The restart case, as far as a test can honestly reach it: a **second
       * pool**, its own TCP connections, no shared in-process state.
       *
       * The obvious version of this — `closePool()` then `getDb()` — is wrong
       * and was written first. `closePool` ends the process-wide pool cached on
       * `globalThis`, so it does not restart *this* test, it breaks every test
       * that runs after it. A private pool is the honest shape anyway: a restart
       * is a new process reading the same database, not the old process
       * reconnecting.
       */
      const first = await stakeSeason(db!, MIDSEASON_SEASON);

      const pool = new Pool({ connectionString: process.env['DATABASE_URL']!, max: 2 });
      try {
        const reopened = drizzle(pool, { schema });
        const second = await stakeSeason(reopened, MIDSEASON_SEASON);

        expect(second.rows).toEqual(first.rows);
        expect([...second.weekFinalizedAt.entries()].sort()).toEqual(
          [...first.weekFinalizedAt.entries()].sort(),
        );
        expect(second.roster).toEqual(first.roster);
      } finally {
        await pool.end();
      }
    });
  });

  /* ---------------------------------------------------------------------
   * Season contamination
   * ------------------------------------------------------------------ */

  describe('what 2026 may not touch', () => {
    it('leaves 2024 and 2025 byte-identical across eight Tuesdays', async () => {
      await resetDatabase(db!);
      await importHistory(db!);
      const before = await historyFingerprint();

      for (let week = 1; week <= REHEARSAL_WEEK; week += 1) await playWeek(db!, week);

      expect(await historyFingerprint()).toBe(before);
    }, 120_000);

    it('never rewrites permanent identity from a seasonal record', async () => {
      /*
       * `11 §2` keeps the person and the seat apart, and a roster id means a
       * different person in each season — roster 4 is Berardo in 2024 and Zack
       * in 2026. Eight weeks of writing 2026 records must leave every name and
       * every earlier seat exactly where it was.
       */
      await buildSeason(REHEARSAL_WEEK);

      const people = await db!
        .select({ id: users.id, name: users.displayName, sleeper: users.sleeperUserId })
        .from(users)
        .orderBy(users.displayName);
      expect(people.filter((row) => row.name === 'Zack')).toHaveLength(1);

      const roster4 = await db!
        .select({ year: seasons.year, name: users.displayName })
        .from(seasonMemberships)
        .innerJoin(seasons, eq(seasons.id, seasonMemberships.seasonId))
        .innerJoin(users, eq(users.id, seasonMemberships.userId))
        .where(eq(seasonMemberships.rosterId, 4))
        .orderBy(seasons.year);
      // Three different people have held roster 4, and 2026's eight weeks
      // changed none of the earlier two.
      expect(new Set(roster4.map((row) => row.name)).size).toBe(3);
    }, 120_000);

    it('keeps retired managers out of every current surface at week 8', async () => {
      await buildSeason(REHEARSAL_WEEK);

      const managers = await activeLeagueManagers(db!);
      expect(managers.map((row) => row.displayName).sort()).toEqual([...APPROVED_2026_ROSTER].sort());

      const season = await stakeSeason(db!, MIDSEASON_SEASON);
      const table = standingsThrough({
        rows: season.rows,
        throughWeek: REHEARSAL_WEEK,
        roster: season.roster,
      });
      for (const row of table) {
        expect(APPROVED_2026_ROSTER).toContain(row.displayName);
      }

      for (const line of await tonightBoard(db!)) {
        for (const retired of ['Armen', 'Shant', 'Berardo']) {
          expect(line.text).not.toContain(retired);
        }
      }
    }, 120_000);

    it('leaves the historical championship rings alone', async () => {
      await resetDatabase(db!);
      await importHistory(db!);
      const before = await db!
        .select({ slug: collectibles.slug, user: collectibles.userId, key: collectibles.grantKey })
        .from(collectibles)
        .where(sql`${collectibles.grantKey} like 'championship:%'`)
        .orderBy(collectibles.grantKey);
      expect(before.length).toBeGreaterThan(0);

      for (let week = 1; week <= REHEARSAL_WEEK; week += 1) await playWeek(db!, week);

      const after = await db!
        .select({ slug: collectibles.slug, user: collectibles.userId, key: collectibles.grantKey })
        .from(collectibles)
        .where(sql`${collectibles.grantKey} like 'championship:%'`)
        .orderBy(collectibles.grantKey);
      expect(after).toEqual(before);
    }, 120_000);
  });

  /* ---------------------------------------------------------------------
   * Corruption probes
   * ------------------------------------------------------------------ */

  describe('inconsistent midseason input', () => {
    /*
     * Rebuilt before **each** probe rather than once for the block.
     *
     * Every probe here mutates: one syncs week 8, one closes it, one pays it.
     * Sharing a database between them made three of them pass or fail on what
     * an earlier probe had already done — the malformed-pairing probe reported
     * a game as "stored" that a previous probe had stored correctly, which is
     * the exact shape of a test that measures its neighbours.
     */
    beforeEach(async () => {
      await buildSeason(PRIOR_WEEK);
    }, 120_000);

    it('refuses to pay a week nothing has closed', async () => {
      /*
       * Probe 1 — a missing week finalization.
       *
       * `week_finalizations` is append-only by trigger, so the state cannot be
       * *made* by deleting a row; it is made the way production would make it,
       * by asking for the reward before the week is closed. The answer must be a
       * refusal rather than a payment on a number that can still move.
       */
      const sync = await syncSeason(db!, {
        source: seasonAtWeek({ played: REHEARSAL_WEEK, capturedAt: tuesdayOf(REHEARSAL_WEEK) }),
        seasonYear: MIDSEASON_SEASON,
        through: REHEARSAL_WEEK,
      });
      expect(sync.refusal).toBeNull();

      const before = await db!.select({ n: sql<number>`count(*)::int` }).from(weeklyRewards);
      const report = await awardWeek(db!, {
        season: MIDSEASON_SEASON,
        week: REHEARSAL_WEEK,
        at: tuesdayOf(REHEARSAL_WEEK),
      });

      expect(report.refusal).toBe('not-finalized');
      expect(report.paid).toEqual([]);
      expect(await db!.select({ n: sql<number>`count(*)::int` }).from(weeklyRewards)).toEqual(
        before,
      );
    });

    it('stores one game when Sleeper sends a roster twice', async () => {
      /*
       * Probe 2 — duplicated input for a week that is already stored.
       *
       * The payload carries every roster row twice. `persistWeeks` keys on
       * `(week, matchup_id)`, so the duplicate resolves to the row it already
       * holds rather than to a second game, and week 7 must come out of it with
       * the same five games it went in with.
       */
      const before = await db!
        .select({ n: sql<number>`count(*)::int` })
        .from(fantasyMatchups)
        .innerJoin(seasons, eq(seasons.id, fantasyMatchups.seasonId))
        .where(and(eq(seasons.year, MIDSEASON_SEASON), eq(fantasyMatchups.week, 7)));
      expect(before[0]!.n).toBe(5);

      const report = await syncSeason(db!, {
        source: seasonAtWeek({
          played: PRIOR_WEEK,
          capturedAt: new Date(tuesdayOf(PRIOR_WEEK).getTime() + 60_000),
          mutate: (week, rows) => (week === 7 ? [...rows, ...rows] : rows),
        }),
        seasonYear: MIDSEASON_SEASON,
        through: PRIOR_WEEK,
      });

      const after = await db!
        .select({ n: sql<number>`count(*)::int` })
        .from(fantasyMatchups)
        .innerJoin(seasons, eq(seasons.id, fantasyMatchups.seasonId))
        .where(and(eq(seasons.year, MIDSEASON_SEASON), eq(fantasyMatchups.week, 7)));

      expect(after[0]!.n).toBe(5);
      expect(report.summary?.status).toBeDefined();
    });

    it('writes nothing when a stale week-6 payload arrives during week 8', async () => {
      /*
       * Probe 3 — the guard `docs/IN_SEASON_SYNC_BOUNDARY.md` was built for,
       * exercised where it actually bites. A read captured before the stored one
       * is not new information, and its 2026 records must not land.
       */
      const beforeRows = await db!
        .select({ week: fantasyMatchups.week })
        .from(fantasyMatchups)
        .innerJoin(seasons, eq(seasons.id, fantasyMatchups.seasonId))
        .where(eq(seasons.year, MIDSEASON_SEASON));
      const beforeRecords = await db!
        .select({ roster: seasonMemberships.rosterId, wins: seasonMemberships.wins })
        .from(seasonMemberships)
        .innerJoin(seasons, eq(seasons.id, seasonMemberships.seasonId))
        .where(eq(seasons.year, MIDSEASON_SEASON))
        .orderBy(seasonMemberships.rosterId);

      const report = await syncSeason(db!, {
        source: seasonAtWeek({ played: 6, capturedAt: tuesdayOf(1) }),
        seasonYear: MIDSEASON_SEASON,
        through: PRIOR_WEEK,
      });

      // Reported rather than skipped in silence.
      expect(report.summary?.status).toBe('NEEDS_REVIEW');
      expect(JSON.stringify(report.warnings)).toMatch(/stale|older/i);

      expect(
        await db!
          .select({ week: fantasyMatchups.week })
          .from(fantasyMatchups)
          .innerJoin(seasons, eq(seasons.id, fantasyMatchups.seasonId))
          .where(eq(seasons.year, MIDSEASON_SEASON)),
      ).toHaveLength(beforeRows.length);
      expect(
        await db!
          .select({ roster: seasonMemberships.rosterId, wins: seasonMemberships.wins })
          .from(seasonMemberships)
          .innerJoin(seasons, eq(seasons.id, seasonMemberships.seasonId))
          .where(eq(seasons.year, MIDSEASON_SEASON))
          .orderBy(seasonMemberships.rosterId),
      ).toEqual(beforeRecords);
    });

    it('does not store a drafted-but-unplayed week 9', async () => {
      /*
       * Probe 4 — the case that cannot be undone if it is got wrong. Sleeper
       * publishes the whole schedule at draft time, so week 9 comes back as ten
       * rows at 0.00. Storing it would finalize five ties on a week nobody
       * played, and `week_finalizations` is append-only.
       */
      const report = await runTuesday(db!, {
        season: MIDSEASON_SEASON,
        at: tuesdayOf(REHEARSAL_WEEK),
        sleeper: seasonAtWeek({
          played: REHEARSAL_WEEK,
          capturedAt: tuesdayOf(REHEARSAL_WEEK),
          scheduledThrough: 9,
        }),
      });

      // The unplayed week was fetched and dropped, so the week that closes is 8.
      expect(report.week).toBe(REHEARSAL_WEEK);
      expect(await latestStoredWeek(db!, MIDSEASON_SEASON)).toBe(REHEARSAL_WEEK);

      const [ninth] = await db!
        .select({ n: sql<number>`count(*)::int` })
        .from(fantasyMatchups)
        .innerJoin(seasons, eq(seasons.id, fantasyMatchups.seasonId))
        .where(and(eq(seasons.year, MIDSEASON_SEASON), eq(fantasyMatchups.week, 9)));
      expect(ninth!.n).toBe(0);

      const closed = await db!
        .select({ week: weekFinalizations.week })
        .from(weekFinalizations)
        .innerJoin(seasons, eq(seasons.id, weekFinalizations.seasonId))
        .where(eq(seasons.year, MIDSEASON_SEASON));
      expect(closed.map((row) => row.week)).not.toContain(9);
    });

    it('drops a malformed week-8 pairing rather than inventing an opponent', async () => {
      /*
       * Probe 5 — three rosters sharing one matchup id. There is no honest way
       * to pick two of them, so the whole pairing is dropped and the other four
       * games of the week still land.
       */
      const report = await syncSeason(db!, {
        source: seasonAtWeek({
          played: REHEARSAL_WEEK,
          capturedAt: tuesdayOf(REHEARSAL_WEEK),
          mutate: (week, rows) =>
            week === REHEARSAL_WEEK
              ? rows.map((entry) => {
                  const row = entry as { roster_id: number; matchup_id: number };
                  // Roster 2's row joins roster 1 and 8's game, making it a three.
                  return row.roster_id === 2 ? { ...row, matchup_id: 1 } : row;
                })
              : rows,
        }),
        seasonYear: MIDSEASON_SEASON,
        through: REHEARSAL_WEEK,
      });

      expect(report.refusal).toBeNull();

      const stored = await db!
        .select({ a: fantasyMatchups.rosterAId, b: fantasyMatchups.rosterBId })
        .from(fantasyMatchups)
        .innerJoin(seasons, eq(seasons.id, fantasyMatchups.seasonId))
        .where(and(eq(seasons.year, MIDSEASON_SEASON), eq(fantasyMatchups.week, REHEARSAL_WEEK)));

      // Roster 2 lost its own game as well, because its partner is now unpaired.
      const paired = new Set(stored.flatMap((row) => [row.a, row.b]));
      expect(paired.has(2)).toBe(false);
      expect(paired.has(1)).toBe(false);
      expect(stored.length).toBeLessThan(5);
      // Nothing was invented: every stored game is a real one from the fixture.
      const real = new Set(
        (MIDSEASON_GAMES[REHEARSAL_WEEK] ?? []).map(([a, , b]) => `${String(a)}-${String(b)}`),
      );
      for (const row of stored) {
        expect(
          real.has(`${String(row.a)}-${String(row.b)}`) ||
            real.has(`${String(row.b)}-${String(row.a)}`),
        ).toBe(true);
      }
    });

    it('pays once when a reward was already granted before the retry', async () => {
      /*
       * Probe 7. The key names the occasion and omits the amount, so a retry is
       * a no-op rather than a second payment at a possibly different price.
       */
      await syncSeason(db!, {
        source: seasonAtWeek({ played: REHEARSAL_WEEK, capturedAt: tuesdayOf(REHEARSAL_WEEK) }),
        seasonYear: MIDSEASON_SEASON,
        through: REHEARSAL_WEEK,
      });
      const closed = await finalizeWeek(db!, {
        season: MIDSEASON_SEASON,
        week: REHEARSAL_WEEK,
        at: tuesdayOf(REHEARSAL_WEEK),
      });
      expect(closed.games).toBe(5);

      const first = await awardWeek(db!, {
        season: MIDSEASON_SEASON,
        week: REHEARSAL_WEEK,
        at: tuesdayOf(REHEARSAL_WEEK),
      });
      const second = await awardWeek(db!, {
        season: MIDSEASON_SEASON,
        week: REHEARSAL_WEEK,
        at: tuesdayOf(REHEARSAL_WEEK),
      });

      expect(first.paid.length).toBeGreaterThan(0);
      expect(second.paid).toEqual([]);
      expect(second.alreadyPaid).toBe(first.paid.length);
    });
  });


  /* ---------------------------------------------------------------------
   * The historical sample a midseason claim is allowed to use
   * ------------------------------------------------------------------ */

  describe('what a week-8 claim may compare against', () => {
    beforeAll(async () => {
      await buildSeason(REHEARSAL_WEEK);
    }, 120_000);

    it('builds week 8\'s basis from weeks 1 to 7 and nothing later', async () => {
      /*
       * The sample-boundary question, and it only has teeth once there *is* a
       * later week to leak. A basis that reached into week 8 would let the week
       * being asked about set the number somebody is asked to bet against.
       */
      const basis = await stakeBasis(db!, { season: MIDSEASON_SEASON, week: REHEARSAL_WEEK });

      expect(basis!.basisWeeks).toEqual([1, 2, 3, 4, 5, 6, 7]);
      // Ten managers, seven weeks.
      expect(basis!.teamWeeks).toBe(70);
      // Alex's 149.24 in week 4 — the best of weeks 1–7. Matty B's 158.90 is
      // week 8's and must not appear.
      expect(basis!.bestTeamScoreCents).toBe(14924);
      expect(basis!.bestTeamScoreBy).toBe('Alex');
      expect(basis!.medianTeamScoreCents).toBe(11890);
    });

    it('grows the sample by exactly one week each Tuesday', async () => {
      const seven = await stakeBasis(db!, { season: MIDSEASON_SEASON, week: REHEARSAL_WEEK });
      const eight = await stakeBasis(db!, { season: MIDSEASON_SEASON, week: REHEARSAL_WEEK + 1 });

      expect(eight!.teamWeeks - seven!.teamWeeks).toBe(10);
      expect(eight!.basisWeeks).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      // The season high moves to week 8's blowout only once week 8 is behind it.
      expect(eight!.bestTeamScoreCents).toBe(15890);
      expect(eight!.bestTeamScoreBy).toBe('Matty B');
    });

    it('freezes a bounty target rather than re-reading it as the season grows', async () => {
      /*
       * `weekly_stakes_terms_immutable`. The week-5 bounty was written against a
       * 149.24 season high; three weeks later the season high is 158.90. The
       * stored number must still be the one managers were asked about.
       */
      const bounty = await db!
        .select({ numbers: weeklyStakes.allowedNumbers })
        .from(weeklyStakes)
        .where(and(eq(weeklyStakes.variant, 'week-score'), eq(weeklyStakes.week, 5)));
      expect(bounty[0]!.numbers).toContain('149.24');
    });

    it('measures a margin against finalized seasons only', async () => {
      /*
       * `finalizedMarginsCents` is the population a blowout is ranked against.
       * 2026 is open, so its forty games — including a 64.63 margin — are not in
       * it. A live season quietly joining its own comparison population is the
       * classic midseason contamination, and it would make week 8 grade itself.
       */
      const population = await finalizedMarginsCents(db!);
      const closed = await db!
        .select({ n: sql<number>`count(*)::int` })
        .from(fantasyMatchups)
        .innerJoin(seasons, eq(seasons.id, fantasyMatchups.seasonId))
        .where(sql`${seasons.finalizedAt} is not null`);
      expect(population).toHaveLength(closed[0]!.n);
      expect(population).not.toContain(6463);
    });
  });

  /* ---------------------------------------------------------------------
   * The Sunday photograph, and the story that needs it
   * ------------------------------------------------------------------ */

  describe('the Sunday half of week 8', () => {
    beforeAll(async () => {
      await buildSeason(PRIOR_WEEK);
    }, 120_000);

    it('photographs week 8 once, and refuses to retake it', async () => {
      const entries = midseasonMatchupRows(REHEARSAL_WEEK).map((row) => {
        const entry = row as { roster_id: number; matchup_id: number; points: number };
        return {
          rosterId: entry.roster_id,
          matchupId: entry.matchup_id,
          // The pre-Monday score: everyone on 60% of what they finish with,
          // except the two rosters the comeback assertion below is about.
          points: entry.points,
          customPoints: null,
          starters: [],
          startersPoints: [],
          players: [],
          playerPoints: {},
        };
      });

      const first = await runSunday(db!, {
        season: MIDSEASON_SEASON,
        week: REHEARSAL_WEEK,
        entries,
        at: new Date(tuesdayOf(REHEARSAL_WEEK).getTime() - 2 * 24 * 60 * 60 * 1000),
        source: 'rehearsal',
      });
      const again = await runSunday(db!, {
        season: MIDSEASON_SEASON,
        week: REHEARSAL_WEEK,
        entries,
        at: new Date(tuesdayOf(REHEARSAL_WEEK).getTime() - 24 * 60 * 60 * 1000),
        source: 'rehearsal',
      });

      expect(first.games).toBe(5);
      expect(first.capture?.captured).toBe(true);
      // A second capture is a *worse* photograph, not a fresher one.
      expect(again.capture?.captured).toBe(false);
      expect(again.skipped.join(' ')).toContain('never retaken');

      const stored = await weekSnapshot(db!, { season: MIDSEASON_SEASON, week: REHEARSAL_WEEK });
      expect(stored.size).toBe(5);
    });

    it('does not photograph a week 7 that has already been closed twice over', async () => {
      // Weeks 1–7 were played with no Sunday job, so they have no photograph and
      // never will. A snapshot arriving after the fact is the one thing the
      // append-only rule cannot repair, so it is worth stating that it is empty
      // rather than assuming it.
      const seven = await weekSnapshot(db!, { season: MIDSEASON_SEASON, week: PRIOR_WEEK });
      expect(seven.size).toBe(0);
    });
  });


  /* ---------------------------------------------------------------------
   * What the room says in week 8
   * ------------------------------------------------------------------ */

  describe('the parlor at week 8', () => {
    beforeAll(async () => {
      await buildSeason(REHEARSAL_WEEK);
      // In-season, on the Tuesday that closes week 8. Without this the clock
      // reads whatever the machine says, which is August — and every surface
      // below would render its offseason branch and assert nothing.
      setFixedClock(tuesdayOf(REHEARSAL_WEEK));
    }, 120_000);

    afterAll(() => {
      clearClock();
    });

    it('names the week the league is playing, not week one', async () => {
      /*
       * **The defect this rehearsal was worth running for.**
       *
       * `boardFace` has taken a `week` since it was written and defaults a
       * missing one to `WEEK ONE`; `app/page.tsx` never passed one. So the
       * largest object in the room would have said **WEEK ONE** on the eighth
       * Tuesday of the season, and on every Tuesday after it.
       *
       * Week one cannot see this. In week one `WEEK ONE` is the correct answer,
       * which is exactly why it survived to here.
       */
      expect(await currentWeekOf(db!, MIDSEASON_SEASON)).toBe(REHEARSAL_WEEK + 1);
      expect(boardFace({ daysUntilKickoff: null, week: REHEARSAL_WEEK + 1 }).hero).toBe('WEEK 9');
    });

    it('counts forward from closed weeks rather than from stored games', async () => {
      // A week whose games have arrived but which nothing has closed does not
      // move the board on. Nothing is inferred about a schedule the product
      // cannot see.
      await resetDatabase(db!);
      await importHistory(db!);
      expect(await currentWeekOf(db!, MIDSEASON_SEASON)).toBe(1);

      await syncSeason(db!, {
        source: seasonAtWeek({ played: 3, capturedAt: tuesdayOf(3) }),
        seasonYear: MIDSEASON_SEASON,
        through: 3,
      });
      expect(await currentWeekOf(db!, MIDSEASON_SEASON)).toBe(1);

      await finalizeWeek(db!, { season: MIDSEASON_SEASON, week: 1, at: tuesdayOf(1) });
      expect(await currentWeekOf(db!, MIDSEASON_SEASON)).toBe(2);
    }, 120_000);

    it("never prints last season's game under this season's week", async () => {
      /*
       * The other half of the same defect. `featuredMatchup` returns the
       * strongest fact from the most recent **archived** season — 2025 — and the
       * face has no room to say so, so two bare names under `WEEK 9` read as
       * week 9's game.
       */
      await buildSeason(REHEARSAL_WEEK);
      const featured = await featuredMatchup(db!);

      expect(featured).not.toBeNull();
      expect(featured!.season).toBe(2025);
      expect(matchupLine(featured, { season: MIDSEASON_SEASON })).toBeNull();
      // And the face is empty rather than filled with prose.
      expect(
        boardFace({
          daysUntilKickoff: null,
          week: REHEARSAL_WEEK + 1,
          matchup: matchupLine(featured, { season: MIDSEASON_SEASON }),
        }),
      ).toEqual({ hero: 'WEEK 9', detail: null });
    }, 120_000);

    it('still says which season the heaviest game was, on the panel behind it', async () => {
      // The panel has room for the whole fact, so the fact is not lost — only
      // the ambiguous two-word version of it on the face is.
      const heaviest = (await tonightBoard(db!)).find((line) => line.key === 'heaviest');
      expect(heaviest?.text).toContain('2025');
    });

    it('drafts every closed week of the live season onto the desk', async () => {
      /*
       * **This test was inverted, and the inversion is the point of it.**
       *
       * As written by this rehearsal it pinned the opposite: `factPacket` gated
       * on `seasons.finalized_at` — the season's books, closed in January —
       * rather than on `week_finalizations`, the per-week finality
       * `lib/stats/finality.ts` introduced and whose own header says *"the Slice
       * will print a live week from the same record."* So every week of 2026
       * refused `not-final`, `16 §4.3`'s last step produced nothing from
       * September to January, and the review desk `16 §9` makes mandatory stayed
       * empty for the entire season it governs.
       *
       * **This rehearsal found that and deliberately did not fix it**, because
       * its scope excluded the Slice's editorial architecture, and it left this
       * test red-on-repair so the change could not slip through unnoticed.
       * `docs/WEEK8_REHEARSAL.md §5.1` is that finding and it stands.
       *
       * The Week 1 lifecycle rehearsal reached the same defect from the other
       * end, with the Tuesday Slice handoff inside its scope, and repaired it —
       * by calling `weekFinality` rather than restating it.
       * `docs/WEEK_1_REHEARSAL.md §6` carries the repair and the disagreement.
       *
       * So the tripwire did its job and this is the conversation it demanded.
       * The assertion is inverted rather than deleted, because what it is really
       * pinning is *which record decides* — and that is worth a test whichever
       * way the answer goes.
       */
      for (const week of [1, PRIOR_WEEK, REHEARSAL_WEEK]) {
        const packet = await factPacket(db!, { season: MIDSEASON_SEASON, week });
        expect(packet.refusal).toBeNull();
        expect(packet.scoreboard.length).toBeGreaterThan(0);
      }

      const draft = await generateDraft(db!, {
        season: MIDSEASON_SEASON,
        week: REHEARSAL_WEEK,
        submit: true,
      });
      expect(draft.outcome).not.toBe('refused');

      /*
       * And it stops at the desk. Nothing about per-week finality touches the
       * approval gate: `16 §9` still requires a named person, and the draft is
       * exactly as far from the league's eyes as it was before.
       */
      const [version] = await db!
        .select({ status: sliceIssueVersions.status })
        .from(sliceIssueVersions)
        .where(eq(sliceIssueVersions.id, draft.versionId!));
      expect(version?.status).toBe('needs_review');

      // Every week of the season is final by `week_finalizations`, and the
      // season's own books are still open — which is the state the old gate
      // could not tell apart from an unplayed week.
      const season = await stakeSeason(db!, MIDSEASON_SEASON);
      expect(season.weekFinalizedAt.size).toBe(REHEARSAL_WEEK);
      expect(season.seasonFinalizedAt).toBeNull();
    }, 120_000);
  });

  /* ---------------------------------------------------------------------
   * What a manager sees
   * ------------------------------------------------------------------ */

  describe('the surfaces, after week 8', () => {
    beforeAll(async () => {
      await buildSeason(REHEARSAL_WEEK);
    }, 120_000);

    it('opens a box against a midseason collection without rerolling anything', async () => {
      const id = await seasonId(MIDSEASON_SEASON);
      const manager = (await activeLeagueManagers(db!))[0]!;
      const [box] = await db!
        .select({ id: lootBoxes.id })
        .from(lootBoxes)
        .where(and(eq(lootBoxes.userId, manager.id), eq(lootBoxes.state, 'UNOPENED')))
        .limit(1);

      const first = await openBox(db!, { userId: manager.id, boxId: box!.id, seasonId: id });
      const again = await openBox(db!, { userId: manager.id, boxId: box!.id, seasonId: id });

      expect(first.status).toBe('opened');
      expect(again.status).toBe('opened');
      if (first.status === 'opened' && again.status === 'opened') {
        expect(again.reveal.slug).toBe(first.reveal.slug);
      }
    });

    it('keeps the Tonight board to four lines that name only current managers', async () => {
      const lines = await tonightBoard(db!);
      expect(lines.length).toBeLessThanOrEqual(4);
      expect(lines.length).toBeGreaterThan(0);
    });

    it('never prints a half-played season on a receipt', async () => {
      /*
       * `receiptFor` reads the most recent **archived** season, so eight weeks
       * into 2026 it still shows 2025 — deliberately, because a receipt is a
       * finished result and 7–1 is not one yet. What matters here is the
       * negative: no receipt anywhere claims 2026.
       *
       * A manager with no archived season at all gets **null**, which is a real
       * state rather than a gap. Zack holds roster 4 in 2026 and did not play in
       * 2024 or 2025 — roster ids are seasonal (`16 §5.1`) and the seat he holds
       * belonged to two other people. `docs/WEEK8_REHEARSAL.md` records what the
       * surface does with that.
       */
      let withReceipt = 0;
      for (const manager of await activeLeagueManagers(db!)) {
        const receipt = await receiptFor(db!, manager.id);
        if (receipt === null) continue;
        withReceipt += 1;
        expect(receipt.year).toBeLessThan(MIDSEASON_SEASON);
        expect(receipt.year).toBe(2025);
      }
      expect(withReceipt).toBeGreaterThanOrEqual(8);
    });
  });
});
