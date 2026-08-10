import { and, eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { clearClock, setFixedClock } from '@/lib/clock';
import { grantChampionshipRings, verifiedTitles } from '@/lib/counter/rings';
import { closePool, getDb } from '@/lib/db';
import {
  collectibles,
  seasonMemberships,
  seasons,
  sliceIssueVersions,
  tokenTransactions,
  weekFinalizations,
  weeklyRewards,
} from '@/lib/db/schema';
import { resetDatabase } from '@/lib/db/test-helpers';
import { boardFace, tonightBoard } from '@/lib/parlor/tonight';
import { factPacket } from '@/lib/slice/packet';
import { latestPublishedIssue } from '@/lib/slice/publication';
import { renderEdition } from '@/lib/slice/render';
import { validateEdition } from '@/lib/slice/validate';
import { finalizeSeason } from '@/lib/sleeper/persist';
import { latestFinalizedWeek } from '@/lib/stats/week';

import {
  playForward,
  standUpLeague,
  REHEARSAL_SEASON_YEAR,
  type RehearsalLeague,
} from './harness';
import { rehearsalSeason, scoreKey, REHEARSAL_LEAGUE } from './season';

/**
 * The playoff rehearsal — week 16, and what it must and must not do.
 *
 * ## Why a whole season is played rather than a week fabricated
 *
 * Every question this file asks is about a **boundary**: what a job does when
 * the week it is closing is the semifinal rather than the ninth Sunday of
 * September. A boundary is only real if the thing on the other side of it was
 * arrived at honestly, so the league plays sixteen weeks through the deployed
 * Tuesday job, one week at a time, against a Sleeper that has played exactly
 * that many. Nothing is inserted behind the product's back.
 *
 * It costs about ten seconds. The alternative — hand-writing a week-16 database
 * state — would test a state nobody's code produced.
 *
 * ## The round is derived, never assumed
 *
 * "Week 16" is not a round. This league's `playoff_week_start` is 15 and its
 * bracket is three rounds, so week 16 is the **semifinal** — and, less
 * obviously, the week in which six of the ten final placements are settled: the
 * fifth-place game and both consolation finals all land in it. Only the four
 * seats that decide a championship carry over into week 17. `derivedShape`
 * reads all of that from the recorded league payload rather than restating it.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

/** Late December: after the semifinal, before the books are shut. */
const NOW = '2026-12-22T12:00:00Z';

// One pool for the file. Closing it inside a `describe` would leave every later
// block talking to a pool somebody had already ended.
afterAll(async () => {
  clearClock();
  if (hasDatabase) await closePool();
});

/** The first Tuesday of the rehearsed season. Advances a week per iteration. */
const FIRST_TUESDAY = new Date('2026-09-15T09:00:00Z');

/**
 * Week 16 as the mission specifies it: one close finish, one clear win.
 *
 * Written as **overrides against the generator** rather than as a hand-authored
 * week, so the other nine games of the week and every week before it stay
 * whatever the deterministic season produced. Cents, because everything
 * downstream compares cents.
 */
const WEEK_16 = new Map<string, number>([
  // Semifinal one — 0.42 between them.
  [scoreKey(16, 1), 13055],
  [scoreKey(16, 3), 13097],
  // Semifinal two — 41.86, which is a blowout by the stored policy.
  [scoreKey(16, 6), 16238],
  [scoreKey(16, 8), 12052],
]);

/**
 * The bracket this rehearsal produces, named once.
 *
 * Seeds come out of a fourteen-week regular season the generator plays; these
 * are the roster ids that result, asserted in the first test so a change to the
 * generator shows up as a failing assertion rather than as five confusing ones.
 */
const SEEDS = [3, 6, 1, 8, 10, 4, 2, 7, 9, 5] as const;
const QUALIFIERS = [1, 3, 4, 6, 8, 10] as const;
const MISSED_OUT = [2, 5, 7, 9] as const;
const BYES = [3, 6] as const;

/** After week 16: who is still playing for the title, and who is not. */
const STILL_IN = [1, 3, 6, 8] as const;

describe.skipIf(!hasDatabase)('the week 16 playoff rehearsal', () => {
  let league: RehearsalLeague;

  beforeAll(async () => {
    setFixedClock(NOW);
    await resetDatabase(db!);
    league = await standUpLeague(db!);
    await playForward(db!, {
      through: 16,
      at: FIRST_TUESDAY,
      options: { scores: WEEK_16 },
    });
  }, 300_000);

  /** Everything the season row and its memberships say, in roster order. */
  async function table() {
    return db!
      .select({
        rosterId: seasonMemberships.rosterId,
        wins: seasonMemberships.wins,
        losses: seasonMemberships.losses,
        madePlayoffs: seasonMemberships.madePlayoffs,
        finalRank: seasonMemberships.finalRank,
        tokenBalance: seasonMemberships.tokenBalance,
        isActive: seasonMemberships.isActive,
      })
      .from(seasonMemberships)
      .where(eq(seasonMemberships.seasonId, league.seasonId))
      .orderBy(seasonMemberships.rosterId);
  }

  // ------------------------------------------------------------------
  // Phase 1 — the configuration, derived
  // ------------------------------------------------------------------

  describe('the playoff configuration', () => {
    it('reads the round from the league rather than from the week number', async () => {
      const source = rehearsalSeason({ played: 16 });
      await source.fetch({ kind: 'league', leagueId: REHEARSAL_LEAGUE });

      expect(source.shape).toEqual({
        totalRosters: 10,
        playoffTeams: 6,
        playoffWeekStart: 15,
        lastRegularWeek: 14,
        playoffRounds: 3,
        lastWeek: 17,
        championshipWeek: 17,
      });

      // The whole point of deriving it: week 16 is the second round of three,
      // which is the semifinal — and it is *not* the championship.
      expect(source.shape.championshipWeek).not.toBe(16);
      expect(16 - source.shape.playoffWeekStart + 1).toBe(2);
    });

    it('seeds the bracket from the regular season and gives the top two byes', async () => {
      const source = rehearsalSeason({ played: 16 });
      await source.fetch({ kind: 'league', leagueId: REHEARSAL_LEAGUE });

      expect(source.seeds).toEqual([...SEEDS]);

      const first = source.brackets.winners.filter((match) => match.round === 1);
      const playing = new Set(first.flatMap((match) => [match.team1, match.team2]));
      expect([...playing].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(
        [...QUALIFIERS].filter((roster) => !BYES.includes(roster as never)).sort((a, b) => a - b),
      );
    });
  });

  // ------------------------------------------------------------------
  // Phase 2 — the playoff boundary
  // ------------------------------------------------------------------

  describe('the playoff boundary', () => {
    it('qualifies exactly the six the table produced', async () => {
      const rows = await table();
      const qualified = rows.filter((row) => row.madePlayoffs).map((row) => row.rosterId);
      expect(qualified).toEqual([...QUALIFIERS]);
    });

    it('keeps every eliminated manager in the league', async () => {
      /*
       * `16 §7.4`: eliminated managers dim, they do not disappear. Read here as
       * a data question rather than a visual one — a seat that vanished from the
       * memberships would take a permanent identity, a record and a token
       * balance with it.
       */
      const rows = await table();
      expect(rows).toHaveLength(10);

      for (const rosterId of MISSED_OUT) {
        const row = rows.find((candidate) => candidate.rosterId === rosterId);
        expect(row, `roster ${String(rosterId)} left the league`).toBeDefined();
        expect(row!.isActive).toBe(true);
        expect(row!.wins + row!.losses).toBe(14);
        expect(row!.tokenBalance).toBeGreaterThan(0);
      }
    });

    it('does not hand a final rank to anybody still playing for the title', async () => {
      /*
       * The premature-finish check, and the reason week 16 is interesting.
       *
       * Six placements *are* settled by this week and writing them is correct —
       * the fifth-place game and both consolation finals were played. The four
       * that are not settled are the four that decide a championship, and those
       * rows must still be null.
       */
      const rows = await table();
      const unranked = rows.filter((row) => row.finalRank === null).map((row) => row.rosterId);
      expect(unranked).toEqual([...STILL_IN]);

      const ranked = Object.fromEntries(
        rows.filter((row) => row.finalRank !== null).map((row) => [row.rosterId, row.finalRank]),
      );
      expect(ranked).toEqual({ 4: 5, 10: 6, 2: 7, 7: 8, 5: 9, 9: 10 });
    });

    it('settles the consolation ladder without touching the championship track', async () => {
      // 7th through 10th are final after week 16 and belong to the four rosters
      // that never reached the bracket. A consolation result that had leaked
      // into the title race would show up here as a qualifier holding 7–10.
      const rows = await table();
      const consolationRanks = rows.filter(
        (row) => row.finalRank !== null && row.finalRank >= 7,
      );

      expect(consolationRanks.map((row) => row.rosterId).sort((a, b) => a - b)).toEqual([
        ...MISSED_OUT,
      ]);
      for (const row of consolationRanks) expect(row.madePlayoffs).toBe(false);
    });

    it('grants no championship ring on a semifinal', async () => {
      /*
       * Two independent gates and both are load-bearing. `verifiedTitles` reads
       * `final_rank = 1` **on a finalized season**, and after week 16 neither
       * half is true of 2026: nobody holds rank one, and the books are open.
       */
      const titles = await verifiedTitles(db!);
      expect(titles.map((title) => title.year)).toEqual([2024, 2025]);

      const result = await grantChampionshipRings(db!);
      expect(result.granted).toBe(0);

      const [held] = await db!
        .select({ total: sql<number>`count(*)::int` })
        .from(collectibles)
        .where(eq(collectibles.slug, 'item_championship_ring'));
      expect(held?.total).toBe(2);
    });

    it('gives no manager a second ring from a replayed grant', async () => {
      const first = await grantChampionshipRings(db!);
      const second = await grantChampionshipRings(db!);

      expect(first.granted).toBe(0);
      expect(second.granted).toBe(0);
      expect(second.alreadyHeld).toBe(2);
    });
  });

  // ------------------------------------------------------------------
  // Phase 3 — what the week paid, and what it did not
  // ------------------------------------------------------------------

  describe('the economy at the playoff boundary', () => {
    it('pays a playoff win exactly like a regular one, and nothing extra', async () => {
      const reasons = await db!
        .select({ reason: weeklyRewards.reason, total: sql<number>`count(*)::int` })
        .from(weeklyRewards)
        .where(eq(weeklyRewards.week, 16))
        .groupBy(weeklyRewards.reason);

      const byReason = Object.fromEntries(reasons.map((row) => [row.reason, row.total]));

      // Five games in week 16 — two semifinals, the fifth-place game and both
      // consolation finals — so five wins and one high score. No advancement
      // bonus, no consolation bonus, no seeding bonus: `03 §4` prices two things
      // and a playoff week is not one of them.
      expect(byReason).toEqual({ MATCHUP_WIN: 5, WEEKLY_HIGH_SCORE: 1 });
    });

    it('pays the bye weeks nothing, because a bye is not a win', async () => {
      // Week 15 has four games and two byes. A bye paying 150 would be the
      // product inventing a reward `03 §4` does not name.
      const [row] = await db!
        .select({ total: sql<number>`count(*)::int` })
        .from(weeklyRewards)
        .where(and(eq(weeklyRewards.week, 15), eq(weeklyRewards.reason, 'MATCHUP_WIN')));

      expect(row?.total).toBe(4);
    });

    it('leaves every token balance standing through the postseason', async () => {
      /*
       * `16` defers the silent auction and puts the spend-down in November, and
       * no expiry mechanism exists. This asserts the **absence**: a legacy
       * end-of-season expiry resurrected from the old documents would show up as
       * a balance falling across the playoff weeks.
       */
      const rows = await table();
      for (const row of rows) {
        expect(row.tokenBalance, `roster ${String(row.rosterId)} lost tokens`).toBeGreaterThan(0);
      }

      const [awards] = await db!
        .select({ total: sql<number>`count(*)::int` })
        .from(tokenTransactions)
        .where(eq(tokenTransactions.reasonCode, 'SEASON_AWARD'));
      expect(awards?.total).toBe(0);
    });
  });

  // ------------------------------------------------------------------
  // Phase 4 — the paper and the room
  // ------------------------------------------------------------------

  describe('the Slice, at the semifinal', () => {
    it('prints the week, which it could not do before this session', async () => {
      /*
       * The defect this rehearsal found. `factPacket` asked whether the
       * **season** was finalized, so no week of a live season could ever be
       * printed and every Tuesday from September to January would have refused
       * `not-final` while reporting success. A week is final on the Tuesday the
       * job closes it (`lib/stats/finality.ts`), and that is the question now
       * asked.
       */
      const packet = await factPacket(db!, { season: REHEARSAL_SEASON_YEAR, week: 16 });

      expect(packet.refusal).toBeNull();
      expect(packet.finalized).toBe(true);
      expect(packet.weekType).toBe('playoff');
      expect(packet.scoreboard).toHaveLength(5);
    });

    it('leads with the close semifinal and says nothing about advancing', async () => {
      const packet = await factPacket(db!, { season: REHEARSAL_SEASON_YEAR, week: 16 });
      const edition = renderEdition(packet);

      // 130.97 to 130.55. The lead is the margin, which is a fact; there is no
      // "reaches the final", because the bracket is not stored and the paper may
      // not infer one (`MANDATE §9`).
      expect(packet.lead?.kind).toBe('nail-biter');
      expect(edition.deck).toContain('130.97');
      expect(validateEdition(edition, packet)).toEqual({ publishable: true, violations: [] });
    });

    it('refuses to print a week nobody has played', async () => {
      // Week 17 exists on the calendar and not in the database. The honest
      // answer is a refusal, not an empty edition dressed as a quiet week.
      const packet = await factPacket(db!, { season: REHEARSAL_SEASON_YEAR, week: 17 });
      expect(packet.refusal).toBe('no-week');
      expect(packet.lead).toBeNull();
    });

    it('stops the draft at the desk and publishes nothing', async () => {
      /*
       * `16 §9` makes approval mandatory in season one. Sixteen Tuesdays have
       * run and not one of them published, which is the property that makes the
       * gate real rather than a step somebody remembered to skip.
       */
      const versions = await db!
        .select({ status: sliceIssueVersions.status, total: sql<number>`count(*)::int` })
        .from(sliceIssueVersions)
        .groupBy(sliceIssueVersions.status);

      const byStatus = Object.fromEntries(versions.map((row) => [row.status, row.total]));
      expect(byStatus['published'] ?? 0).toBe(0);
      expect(byStatus['approved'] ?? 0).toBe(0);
      expect(byStatus['needs_review'] ?? 0).toBeGreaterThan(0);

      expect(await latestPublishedIssue(db!)).toBeNull();
    });
  });

  describe('the room, at the semifinal', () => {
    it('names the week on the board instead of saying WEEK ONE in December', async () => {
      /*
       * The homepage's own defect, found by the same rehearsal. `boardFace` has
       * always taken a week and the page never passed one, so the hero fell
       * through to its offseason branch — a false statement on the largest
       * object in the room, on every load, for four months.
       */
      const week = await latestFinalizedWeek(db!, league.seasonId);
      expect(week).toBe(16);

      expect(boardFace({ daysUntilKickoff: null, week }).hero).toBe('WEEK 16');
    });

    it('says nothing about the playoffs, and that is reported rather than invented', async () => {
      /*
       * The mission expected the Tonight board to give playoff elimination a
       * high priority. **It has no playoff line at all** — the five it can emit
       * are the kickoff countdown, the standing champion, the heaviest finalized
       * game, who has picked up their keys, and which seasons are on the books.
       *
       * Pinned as it stands rather than fixed: a playoff line is new curated
       * copy in Tony's voice, which `CLAUDE.md` reserves for the commissioner.
       * The assertion exists so the day one is added, this reads as a change.
       */
      const lines = await tonightBoard(db!);
      const keys = lines.map((line) => line.key);

      expect(keys).not.toContain('playoff');
      expect(keys).not.toContain('elimination');
      expect(keys.every((key) => ['kickoff', 'champion', 'heaviest', 'keys', 'history'].includes(key))).toBe(
        true,
      );
    });
  });

  // ------------------------------------------------------------------
  // Phase 5 — the season transition, which must not happen yet
  // ------------------------------------------------------------------

  describe('the season transition', () => {
    it('does not close the season on a semifinal', async () => {
      const [season] = await db!
        .select({ status: seasons.status, finalizedAt: seasons.finalizedAt })
        .from(seasons)
        .where(eq(seasons.year, REHEARSAL_SEASON_YEAR));

      expect(season?.finalizedAt).toBeNull();
      expect(season?.status).not.toBe('ARCHIVED');
    });

    it('leaves week 17 available to be played', async () => {
      const closed = await db!
        .select({ week: weekFinalizations.week })
        .from(weekFinalizations)
        .where(eq(weekFinalizations.seasonId, league.seasonId))
        .orderBy(weekFinalizations.week);

      expect(closed.map((row) => row.week)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
      ]);
    });
  });
});

/**
 * The failure injections, each on its own league.
 *
 * A fresh database per case, because every one of these is about a *state* the
 * product can find itself in rather than a step in a sequence — sharing one
 * league would make each case depend on the last one's damage.
 */
describe.skipIf(!hasDatabase)('week 16 under injected failure', () => {
  afterEach(() => {
    clearClock();
  });

  async function freshLeague(): Promise<RehearsalLeague> {
    setFixedClock(NOW);
    await resetDatabase(db!);
    return standUpLeague(db!);
  }

  it('claims no placement when the bracket lags the games', async () => {
    /*
     * The brackets are separate endpoints from the matchups and have been seen
     * to lag. A week whose games are in and whose bracket is a round behind must
     * not produce a finish for anybody the bracket has not settled.
     */
    const league = await freshLeague();
    await playForward(db!, {
      through: 16,
      at: FIRST_TUESDAY,
      options: { scores: WEEK_16 },
      perWeek: new Map([[16, { scores: WEEK_16, bracketPlayedThrough: 15 }]]),
    });

    const ranked = await db!
      .select({ rosterId: seasonMemberships.rosterId, finalRank: seasonMemberships.finalRank })
      .from(seasonMemberships)
      .where(
        and(
          eq(seasonMemberships.seasonId, league.seasonId),
          sql`${seasonMemberships.finalRank} is not null`,
        ),
      );

    // The week's five games are stored and finalized; not one placement is.
    expect(ranked).toEqual([]);

    const [closed] = await db!
      .select({ games: weekFinalizations.games })
      .from(weekFinalizations)
      .where(and(eq(weekFinalizations.seasonId, league.seasonId), eq(weekFinalizations.week, 16)));
    expect(closed?.games).toBe(5);
  });

  it('reports a standings payload that lags its own weeks, and does not absorb it', async () => {
    /*
     * The other half of the lag: Sleeper's official record behind its own
     * matchups. This is **observed behaviour rather than a defect**, and it is
     * pinned because the shape of it is surprising in two directions.
     *
     * `reconcileSeason` catches it — a per-roster line naming both records, for
     * all ten. What it does *not* do is raise `sync_runs.status`: reconciliation
     * disagreements are `warnings`, and only `conflicts` make a run
     * `NEEDS_REVIEW`. That is deliberate — 2024's records and its weekly points
     * disagree permanently, and a run that reported NEEDS_REVIEW every week
     * would teach whoever reads it to stop reading — but it does mean a
     * commissioner reading only the status would not see this.
     *
     * And the lagging record **is stored**, because Sleeper's standings are the
     * official record by design (`lib/sleeper/reconcile.ts`). A league whose
     * standings lag on a Tuesday shows last fortnight's table for a week and
     * heals on the next sync. Nothing about the *games* moves.
     */
    await freshLeague();

    /*
     * Lagged to week 12, not to 14. `reconcileSeason` compares the **regular
     * season** on both sides, so a standings payload stopped at week 14 is
     * indistinguishable from one stopped at 16 — the injection would have been a
     * no-op that looked like a passing test.
     */
    const source = rehearsalSeason({ played: 16, scores: WEEK_16, standingsPlayedThrough: 12 });
    const { syncSeason } = await import('@/lib/sleeper/weekly');

    const report = await syncSeason(db!, {
      source,
      seasonYear: REHEARSAL_SEASON_YEAR,
      through: 16,
    });

    expect(report.refusal).toBeNull();

    // Ten rosters, and both halves of the disagreement named for each: the
    // won-lost record and the points-for total.
    const records = report.warnings.filter((warning) =>
      /finalized record .* does not match the weekly scoring snapshot/.test(warning),
    );
    const points = report.warnings.filter((warning) =>
      /finalized points-for .* does not match the weekly scoring snapshot/.test(warning),
    );
    expect(records).toHaveLength(10);
    expect(points).toHaveLength(10);

    // Detected and reported — and the run still reads SUCCEEDED. Recorded as the
    // behaviour it is rather than asserted as the behaviour somebody wanted.
    expect(report.summary?.status).toBe('SUCCEEDED');
  });

  it('changes nothing when the Tuesday job runs twice on the semifinal', async () => {
    const league = await freshLeague();
    await playForward(db!, { through: 16, at: FIRST_TUESDAY, options: { scores: WEEK_16 } });

    const before = await snapshot(league.seasonId);

    // The same Tuesday again, same source, same instant. Vercel retries, deploys
    // overlap schedules, and a commissioner can press the button by hand.
    const [replay] = await playForward(db!, {
      from: 16,
      through: 16,
      at: new Date(FIRST_TUESDAY.getTime() + 15 * 7 * 24 * 60 * 60 * 1000),
      options: { scores: WEEK_16 },
    });

    expect(replay?.report.finalized).toBe(false);
    expect(replay?.report.failed).toEqual([]);
    expect(replay?.report.draft?.outcome).toBe('noop');
    expect(await snapshot(league.seasonId)).toEqual(before);
  });

  async function snapshot(seasonId: string) {
    const [rewards] = await db!
      .select({ total: sql<number>`count(*)::int` })
      .from(weeklyRewards);
    const [ledger] = await db!
      .select({
        total: sql<number>`count(*)::int`,
        sum: sql<number>`coalesce(sum(${tokenTransactions.amount}), 0)::int`,
      })
      .from(tokenTransactions);
    const [closed] = await db!
      .select({ total: sql<number>`count(*)::int` })
      .from(weekFinalizations)
      .where(eq(weekFinalizations.seasonId, seasonId));
    const [versions] = await db!
      .select({ total: sql<number>`count(*)::int` })
      .from(sliceIssueVersions);
    const [rings] = await db!
      .select({ total: sql<number>`count(*)::int` })
      .from(collectibles)
      .where(eq(collectibles.slug, 'item_championship_ring'));

    return { rewards, ledger, closed, versions, rings };
  }
});

/**
 * One synthetic round further, to prove the championship completes.
 *
 * Deliberately the *smallest* extension: week 17 is played, the books are shut
 * by the same call `scripts/seed.ts` makes in January, and rings are granted.
 * No ceremony is built and none is implied — `16` defers that to v1.1 and the
 * entitlement existing has never been a reason to move it.
 */
describe.skipIf(!hasDatabase)('carrying the rehearsal to the championship', () => {
  let league: RehearsalLeague;

  beforeAll(async () => {
    setFixedClock(NOW);
    await resetDatabase(db!);
    league = await standUpLeague(db!);
    await playForward(db!, { through: 17, at: FIRST_TUESDAY, options: { scores: WEEK_16 } });
  }, 300_000);

  it('completes the bracket without closing the books', async () => {
    const rows = await db!
      .select({ rosterId: seasonMemberships.rosterId, finalRank: seasonMemberships.finalRank })
      .from(seasonMemberships)
      .where(eq(seasonMemberships.seasonId, league.seasonId))
      .orderBy(seasonMemberships.finalRank);

    expect(rows.every((row) => row.finalRank !== null)).toBe(true);
    expect(rows.map((row) => row.rosterId)).toEqual([3, 6, 1, 8, 4, 10, 2, 7, 5, 9]);

    // The bracket finishing is not the season closing. That is a person's call
    // and it happens in January (`scripts/seed.ts`'s `FINALIZED_SEASONS`).
    const [season] = await db!
      .select({ finalizedAt: seasons.finalizedAt })
      .from(seasons)
      .where(eq(seasons.year, REHEARSAL_SEASON_YEAR));
    expect(season?.finalizedAt).toBeNull();
  });

  it('still grants no ring while the books are open', async () => {
    const result = await grantChampionshipRings(db!);
    expect(result.granted).toBe(0);
  });

  it('grants exactly one ring when the books are shut, and one on a replay', async () => {
    expect(await finalizeSeason(db!, REHEARSAL_SEASON_YEAR)).toBe(true);

    const first = await grantChampionshipRings(db!);
    expect(first.granted).toBe(1);

    const second = await grantChampionshipRings(db!);
    expect(second.granted).toBe(0);

    const held = await db!
      .select({
        rosterId: seasonMemberships.rosterId,
        total: sql<number>`count(${collectibles.id})::int`,
      })
      .from(seasonMemberships)
      .leftJoin(
        collectibles,
        and(
          eq(collectibles.userId, seasonMemberships.userId),
          eq(collectibles.sourceSeasonId, league.seasonId),
          eq(collectibles.slug, 'item_championship_ring'),
        ),
      )
      .where(eq(seasonMemberships.seasonId, league.seasonId))
      .groupBy(seasonMemberships.rosterId)
      .orderBy(seasonMemberships.rosterId);

    // Roster 3 won it; nobody else holds a 2026 ring, and the champion holds one.
    for (const row of held) {
      expect(row.total, `roster ${String(row.rosterId)}`).toBe(row.rosterId === 3 ? 1 : 0);
    }
  });

  it('marks the closed season as history so the room can read it', async () => {
    /*
     * `status` was seeded from Sleeper on insert and written by nothing ever
     * again, so a season created in the preseason stayed `DRAFT_PREP` through
     * its own finalization — and four surfaces read `ARCHIVED` to mean *"this is
     * history"*. The close now writes both.
     */
    const [season] = await db!
      .select({ status: seasons.status, finalizedAt: seasons.finalizedAt })
      .from(seasons)
      .where(eq(seasons.year, REHEARSAL_SEASON_YEAR));

    expect(season?.finalizedAt).not.toBeNull();
    expect(season?.status).toBe('ARCHIVED');
  });

  it('never lets the ring into the box', async () => {
    /*
     * The ring is `systemLayer` — earned, never pulled. Asserted against the
     * stored reward table rather than the catalog module, because the table is
     * what a roll actually reads.
     */
    const { rewardTables } = await import('@/lib/db/schema');
    const rows = await db!.select({ entries: rewardTables.entries }).from(rewardTables);

    for (const row of rows) {
      const slugs = (row.entries as readonly { slug: string }[]).map((entry) => entry.slug);
      expect(slugs).not.toContain('item_championship_ring');
    }
  });
});
