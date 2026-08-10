import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { closePool, getDb } from '@/lib/db';
import { seasons, sliceIssueVersions, weekSnapshots } from '@/lib/db/schema';
import { resetDatabase } from '@/lib/db/test-helpers';
import { awardWeek } from '@/lib/rewards/service';
import { syncSeason, weekToReadThrough, latestStoredWeek } from '@/lib/sleeper/weekly';
import { comebacksForWeek } from '@/lib/stats/comeback';
import { weekSnapshot } from '@/lib/stats/snapshot';
import { buildWeek } from '@/lib/stats/week';
import { finalizeWeek, stakeSeason } from '@/lib/stakes/facts';

import { abortingCommits, createRehearsal, type Rehearsal } from './harness';
import { scriptedSeason } from './script';
import { WEEK_1_EXPECTED, WEEK_1_SCRIPT, WEEK_1_SEATS } from './week-1';

/**
 * **The Week 1 lifecycle rehearsal.**
 *
 * One question, asked of the whole chain rather than of its parts:
 *
 * > If this were the first real week of the 2026 season, would Tony's get from
 * > Sunday through Tuesday without corrupting data, skipping a manager,
 * > double-paying a reward, publishing something untrue, or leaving the app in a
 * > state that contradicts itself?
 *
 * Every step already has tests. What none of them can answer is the question
 * above, because the failure modes it asks about live **between** the steps: a
 * snapshot that photographs a different week from the one that closes, a reward
 * derived from games the paper did not print, a retry that pays twice because
 * two guarantees each assumed the other one held.
 *
 * ## It drives production code, not a copy of it
 *
 * `runSundayJob` is what `app/api/cron/sunday/route.ts` calls; `runTuesday` is
 * what `app/api/cron/tuesday/route.ts` calls. The only seam is the Sleeper
 * source, which both routes already inject, and the only thing this file
 * supplies is a season somebody wrote down (`./week-1.ts`).
 *
 * `docs/WEEK_1_REHEARSAL.md` is the commissioner-readable account of what it
 * found; `scripts/rehearse.ts` regenerates that document from a real run.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

const SEASON = 2026;
/** Sunday night, after the late game, before Monday. */
const SUNDAY = new Date('2026-09-13T23:55:00Z');
/** Tuesday morning, the scheduled close. */
const TUESDAY = new Date('2026-09-15T09:00:00Z');
const NEXT_TUESDAY = new Date('2026-09-22T09:00:00Z');

afterAll(async () => {
  if (hasDatabase) await closePool();
});

function rehearsal(): Rehearsal {
  return createRehearsal({
    db: db!,
    script: WEEK_1_SCRIPT,
    // 2024 and 2025 are history and their books are shut, exactly as a deploy
    // leaves them. 2026 is open, which is what makes it rehearsable at all.
    finalizeYears: [2024, 2025],
  });
}

/** One ordinary week: Sunday photograph, then Tuesday close. */
async function playWeekOne(run: Rehearsal): Promise<void> {
  await run.sunday({ week: 1, played: 1, at: SUNDAY });
  await run.tuesday({ played: 1, at: TUESDAY });
}

describe.skipIf(!hasDatabase)('the Week 1 lifecycle rehearsal', () => {
  let run: Rehearsal;

  beforeEach(async () => {
    await resetDatabase(db!);
    run = rehearsal();
    await run.seed();
  });

  /* ---------------------------------------------------------------------
   * 1. Preseason — before anything has happened
   * ------------------------------------------------------------------ */

  describe('the state the league starts the week in', () => {
    it('has an open 2026 season with all ten seats mapped to the right managers', async () => {
      const state = await run.observe();

      expect(state.season).toEqual({ year: SEASON, finalized: false });
      expect(state.seats).toHaveLength(10);
      expect(
        Object.fromEntries(state.seats.map((seat) => [seat.rosterId, seat.manager])),
      ).toEqual(WEEK_1_SEATS);
    });

    it('holds no week 1 result, no reward, no closure and no issue', async () => {
      const state = await run.observe();

      // The offseason state a deploy leaves behind. Every one of these being
      // empty is what makes the assertions further down mean anything: a
      // rehearsal starting from a half-played season proves nothing about a
      // league that starts from here.
      expect(state.games.filter((game) => game.week === 1)).toEqual([]);
      expect(state.finalizations).toEqual([]);
      expect(state.rewards).toEqual([]);
      expect(state.snapshots).toEqual([]);
      expect(state.versions).toEqual([]);
    });

    it('renders no fabricated 0–0 record for a week nobody has played', async () => {
      /*
       * `16 §12`'s rule in the direction that cannot be undone. The deploy seed
       * imports the recorded July fixtures, which carry the *schedule* — and a
       * scheduled week is ten rows at zero with nothing in the payload saying
       * "not yet".
       */
      const state = await run.observe();
      const zeroed = state.games.filter((game) => game.pointsA === 0 && game.pointsB === 0);
      expect(zeroed).toEqual([]);
    });

    it('is not already carrying next week, and has not advanced', async () => {
      const state = await run.observe();
      expect(await latestStoredWeek(db!, SEASON)).toBe(0);
      expect(state.stakes.filter((stake) => stake.week > 1)).toEqual([]);
    });
  });

  /* ---------------------------------------------------------------------
   * 2. Sunday — the pre-Monday photograph
   * ------------------------------------------------------------------ */

  describe('the Sunday snapshot', () => {
    it('photographs exactly the five games of week 1, at their Sunday scores', async () => {
      const leg = await run.sunday({ week: 1, played: 1, at: SUNDAY });

      expect(leg.outcome.kind).toBe('ran');
      if (leg.outcome.kind !== 'ran') return;
      expect(leg.outcome.report.games).toBe(5);
      expect(leg.outcome.report.unpaired).toBe(0);
      expect(leg.outcome.report.capture?.captured).toBe(true);
      expect(leg.outcome.report.capture?.written).toBe(5);

      const state = await run.observe();
      expect(state.snapshots).toHaveLength(5);

      // The Sunday scores, not the final ones — which is the entire reason the
      // job exists. Game 1 is 118.40–131.05 before Monday and 145.62–131.05
      // after it; a photograph showing the second is a photograph of nothing.
      const first = state.snapshots.find((row) => row.matchupId === 1);
      expect(first).toEqual({
        week: 1,
        matchupId: 1,
        rosterA: 1,
        rosterB: 2,
        pointsA: 118.4,
        pointsB: 131.05,
      });
    });

    it('reads Sleeper twice and writes once', async () => {
      /*
       * `16 §4.3`: **"No live in-game score sync, ever. It is the fastest route
       * to becoming a worse Sleeper."** This job is the single exception the same
       * section carves out, and the shape of the exception is the guarantee: one
       * `state` read to learn the week, one `matchups` read, one insert. No loop,
       * no schedule of its own, and nothing that could grow into a poller without
       * this number moving.
       */
      const leg = await run.sunday({ played: 1, at: SUNDAY });
      expect(leg.requests).toBe(2);
    });

    it('resolves the week from Sleeper rather than from the database', async () => {
      // No `?week=`. The job asks the upstream which week is being played,
      // because the database's answer is last week's for the whole of this one.
      const leg = await run.sunday({ played: 1, at: SUNDAY });

      expect(leg.outcome.kind).toBe('ran');
      if (leg.outcome.kind !== 'ran') return;
      expect(leg.outcome.report.week).toBe(1);
      expect(leg.outcome.report.season).toBe(SEASON);
    });

    it('declines in July, when Sleeper says no week is being played', async () => {
      // The recorded state fixture genuinely says `week: 0`. Not an error, and
      // not something to retry every few minutes until September.
      const leg = await run.sunday({ played: 0, currentWeek: 0, at: SUNDAY });

      expect(leg.outcome.kind).toBe('nothing-to-do');
      if (leg.outcome.kind !== 'nothing-to-do') return;
      expect(leg.outcome.why).toContain('did not report a current week');
      expect((await run.observe()).snapshots).toEqual([]);
    });

    it('touches no other week', async () => {
      await run.sunday({ week: 1, played: 1, at: SUNDAY });
      const state = await run.observe();
      expect([...new Set(state.snapshots.map((row) => row.week))]).toEqual([1]);
    });

    it('is a read the second time it runs, and keeps the first photograph', async () => {
      await run.sunday({ week: 1, played: 1, at: SUNDAY });

      /*
       * The replay that matters is not "the same request twice" — it is a
       * **later** run, after Monday, whose scores are different. The storage
       * refuses it, because a later capture of the same week is a materially
       * worse photograph rather than a fresher one.
       */
      const later = await run.sunday({
        week: 1,
        played: 1,
        at: new Date('2026-09-15T04:00:00Z'),
      });

      expect(later.outcome.kind).toBe('ran');
      if (later.outcome.kind !== 'ran') return;
      expect(later.outcome.report.capture?.captured).toBe(false);
      expect(later.outcome.report.capture?.written).toBe(0);
      expect(later.outcome.report.skipped.join(' ')).toContain('already photographed');

      const state = await run.observe();
      expect(state.snapshots).toHaveLength(5);
      // Still Sunday's numbers.
      expect(state.snapshots.find((row) => row.matchupId === 1)?.pointsA).toBe(118.4);
    });

    it('cannot be reconstructed after the fact, and does not pretend otherwise', async () => {
      /*
       * **The irreversible failure, rehearsed.**
       *
       * The snapshot is missed — the job did not run on Sunday. Monday happens.
       * The week closes normally on Tuesday, and then somebody tries to take the
       * photograph late.
       *
       * What must not happen is a plausible-looking reconstruction. There is no
       * information anywhere in the system about what the score was before
       * Monday: Sleeper serves the current total and nothing else, and the
       * finalized game is the total *after*. So the correct behaviour is that
       * the week has no snapshot, every comeback fact for it says so, and the
       * paper cannot claim one.
       */
      await run.tuesday({ played: 1, at: TUESDAY });

      const missed = await weekSnapshot(db!, { season: SEASON, week: 1 });
      expect(missed.size).toBe(0);

      const season = await stakeSeason(db!, SEASON);
      const week = buildWeek({
        season: SEASON,
        week: 1,
        finalized: true,
        rows: season.rows,
        roster: season.roster,
      });
      const facts = comebacksForWeek(week.games, missed);

      // Five games, five facts, and every one of them refuses rather than
      // guessing. Not "no comeback happened" — "this cannot be said".
      expect(facts).toHaveLength(5);
      expect(facts.every((fact) => fact.outcome === 'no-snapshot')).toBe(true);

      /*
       * And a late photograph does not become authoritative. It captures the
       * *post-Monday* score, which is exactly the falsehood the append-only
       * storage exists to keep out — so the only thing that makes this safe is
       * that a week which already has a snapshot refuses a second one. Here
       * there is none, so a late run does write, and what it writes is honest
       * about being a Tuesday capture rather than a Sunday one.
       */
      const late = await run.sunday({ week: 1, played: 1, at: NEXT_TUESDAY });
      expect(late.outcome.kind).toBe('ran');
      const rows = await db!
        .select({ capturedAt: weekSnapshots.capturedAt })
        .from(weekSnapshots);
      expect(rows).toHaveLength(5);
      expect(rows.every((row) => row.capturedAt.getTime() === NEXT_TUESDAY.getTime())).toBe(true);
    });
  });

  /* ---------------------------------------------------------------------
   * 3. Tuesday — the close
   * ------------------------------------------------------------------ */

  describe('the Tuesday close', () => {
    it('syncs the week that was played, closes it, and pays it', async () => {
      await run.sunday({ week: 1, played: 1, at: SUNDAY });
      const report = await run.tuesday({ played: 1, at: TUESDAY });

      expect(report.failed).toEqual([]);
      expect(report.sync?.refusal).toBeNull();
      expect(report.week).toBe(1);
      expect(report.games).toBe(5);
      expect(report.finalized).toBe(true);
      expect(report.rewards?.refusal).toBeNull();
    });

    it('resolves the week after the sync, not before it', async () => {
      /*
       * The sequence defect `lib/slice/tuesday.ts` was restructured for. Week 1
       * does not exist in the database when the job starts; if the week were
       * resolved first it would resolve to 1 by the `Math.max(1, …)` floor and
       * *look* right — so the honest form of this assertion is the second
       * Tuesday, where a pre-sync resolution answers 1 and the correct answer
       * is 2.
       */
      await playWeekOne(run);
      const second = await run.tuesday({ played: 2, at: NEXT_TUESDAY });

      expect(second.week).toBe(2);
      expect(second.finalized).toBe(true);
      expect((await run.observe()).finalizations.map((row) => row.week)).toEqual([1, 2]);
    });

    it('stores all five games with the right pairings, scores and winners', async () => {
      await playWeekOne(run);
      const state = await run.observe();
      const week1 = state.games.filter((game) => game.week === 1);

      expect(week1).toHaveLength(5);
      expect(week1.every((game) => game.weekType === 'regular')).toBe(true);
      expect(week1.every((game) => !game.disputed)).toBe(true);

      expect(
        week1.map((game) => [game.matchupId, game.rosterA, game.rosterB, game.pointsA, game.pointsB, game.winner]),
      ).toEqual([
        [1, 1, 2, 145.62, 131.05, 1],
        [2, 3, 4, 101.3, 100.86, 3],
        [3, 5, 6, 88.02, 152.88, 6],
        [4, 7, 8, 124.71, 109.33, 7],
        [5, 9, 10, 133.2, 127.44, 9],
      ]);
      expect(week1.map((game) => game.winner)).toEqual([...WEEK_1_EXPECTED.winners]);
    });

    it('gets the close game right to the cent', async () => {
      await playWeekOne(run);
      const state = await run.observe();
      const close = state.games.find((game) => game.week === 1 && game.matchupId === 2);

      // 0.44 apart. A rounding defect anywhere between Sleeper's float and the
      // stored integer changes who won this game and nothing else.
      expect(close?.winner).toBe(3);
      expect(Math.round((close!.pointsA - close!.pointsB) * 100)).toBe(
        WEEK_1_EXPECTED.closest.marginCents,
      );
    });

    it('says so when it is run with no Sleeper at all', async () => {
      /*
       * A different state from an upstream that refused, and it has to read
       * differently: a job with no source has not *tried*. Both are legitimate —
       * the second is a commissioner re-running a week against what is already
       * stored — and a report that conflated them would make a broken deploy
       * look like a quiet week.
       */
      const report = await run.tuesday({ played: 1, at: TUESDAY, withoutSleeper: true });

      expect(report.sync).toBeNull();
      expect(report.skipped.join(' ')).toContain('No Sleeper source was supplied');
      expect(report.failed).toEqual([]);
      // Nothing arrived, so there was nothing to close.
      expect(report.games).toBe(0);
      expect((await run.observe()).games).toEqual([]);
    });

    it('closes the week exactly once however many times it runs', async () => {
      await playWeekOne(run);

      const second = await run.tuesday({ played: 1, at: TUESDAY });
      const third = await run.tuesday({ played: 1, at: NEXT_TUESDAY });

      expect(second.finalized).toBe(false);
      expect(third.finalized).toBe(false);
      expect(second.failed).toEqual([]);
      expect(third.failed).toEqual([]);

      const state = await run.observe();
      expect(state.finalizations).toEqual([{ week: 1, games: 5 }]);
      // And the winners did not move.
      expect(state.games.filter((g) => g.week === 1).map((g) => g.winner)).toEqual([
        ...WEEK_1_EXPECTED.winners,
      ]);
    });
  });

  /* ---------------------------------------------------------------------
   * 4. The Sunday photograph and the Tuesday result, together
   * ------------------------------------------------------------------ */

  describe('the two readings, as one week', () => {
    it('tells the Monday comeback, and only the one that happened', async () => {
      await playWeekOne(run);

      const season = await stakeSeason(db!, SEASON);
      const week = buildWeek({
        season: SEASON,
        week: 1,
        finalized: true,
        rows: season.rows,
        roster: season.roster,
      });
      const facts = comebacksForWeek(
        week.games,
        await weekSnapshot(db!, { season: SEASON, week: 1 }),
      );

      const comebacks = facts.filter((fact) => fact.outcome === 'comeback');
      expect(comebacks).toHaveLength(1);
      expect(comebacks[0]?.sleeperMatchupId).toBe(WEEK_1_EXPECTED.comeback.matchupId);

      /*
       * Game 5 is the one that has to *not* be a story: Matty B closed from
       * 15.14 down to 5.76 and still lost. A comeback needs the result to have
       * flipped, not merely to have narrowed.
       */
      const near = facts.find((fact) => fact.sleeperMatchupId === 5);
      expect(near?.outcome).not.toBe('comeback');
    });
  });

  /* ---------------------------------------------------------------------
   * 5. Rewards
   * ------------------------------------------------------------------ */

  describe('what the week paid', () => {
    it('pays five wins and one high score, to the right people', async () => {
      await playWeekOne(run);
      const state = await run.observe();

      const wins = state.rewards.filter((row) => row.reason === 'MATCHUP_WIN');
      const high = state.rewards.filter((row) => row.reason === 'WEEKLY_HIGH_SCORE');

      expect(wins.map((row) => row.rosterId)).toEqual([...WEEK_1_EXPECTED.winners]);
      expect(wins.every((row) => row.amount === 150)).toBe(true);

      expect(high).toHaveLength(1);
      expect(high[0]?.manager).toBe(WEEK_1_EXPECTED.highScore.manager);
      expect(high[0]?.amount).toBe(400);
    });

    it('pays nobody who did not win, and nobody who is not in the league', async () => {
      await playWeekOne(run);
      const state = await run.observe();

      // The high score is the only reason a losing seat could appear at all, and
      // it went to roster 6 — who won. So any of these is a real defect.
      const paid = new Set(state.rewards.map((row) => row.rosterId));
      expect([2, 4, 5, 8, 10].filter((rosterId) => paid.has(rosterId))).toEqual([]);

      // And every name that was paid is a seat this league actually holds.
      const league = new Set(Object.values(WEEK_1_SEATS));
      expect(state.rewards.filter((row) => !league.has(row.manager))).toEqual([]);
    });

    it('reconciles the ledger against the balances, exactly', async () => {
      await playWeekOne(run);
      const state = await run.observe();

      const expectedTotal = 5 * 150 + 400;
      const rewardRows = state.ledger.filter(
        (row) => row.reason === 'MATCHUP_WIN' || row.reason === 'WEEKLY_HIGH_SCORE',
      );
      expect(rewardRows.reduce((sum, row) => sum + row.amount, 0)).toBe(expectedTotal);

      /*
       * `03 §5`: the displayed balance reconciles to the ledger. Asserted
       * against the trigger-maintained column rather than against a recomputed
       * number, because the column is what a manager is shown.
       */
      const byManager = new Map<string, number>();
      for (const row of state.ledger) {
        byManager.set(row.manager, (byManager.get(row.manager) ?? 0) + row.amount);
      }
      for (const seat of state.seats) {
        expect(seat.balance).toBe(byManager.get(seat.manager) ?? 0);
        expect(seat.balance).toBeGreaterThanOrEqual(0);
      }
    });

    it('pays exactly once however many Tuesdays run', async () => {
      await playWeekOne(run);
      const before = await run.observe();

      await run.tuesday({ played: 1, at: TUESDAY });
      const second = await run.tuesday({ played: 1, at: NEXT_TUESDAY });

      expect(second.rewards?.paid).toEqual([]);
      expect(second.rewards?.tokens).toBe(0);
      expect(second.rewards?.alreadyPaid).toBe(6);

      const after = await run.observe();
      expect(after.rewards).toEqual(before.rewards);
      expect(after.seats).toEqual(before.seats);
      expect(after.ledger.length).toBe(before.ledger.length);
    });

    it('pays no win for a tied game, and still pays the tie week its high score', async () => {
      /*
       * Week 2 carries a tie by construction. `03 §4` prices a *win*, and both
       * sides of a tie did not win — paying either would be inventing a
       * category. The high score is a different question and is still answered.
       */
      await playWeekOne(run);
      await run.tuesday({ played: 2, at: NEXT_TUESDAY });

      const state = await run.observe();
      const week2 = state.rewards.filter((row) => row.week === 2);
      const wins = week2.filter((row) => row.reason === 'MATCHUP_WIN');

      // Four winners, not five: rosters 1 and 3 tied.
      expect(wins.map((row) => row.rosterId)).toEqual([2, 7, 9, 10]);
      expect(week2.filter((row) => row.reason === 'WEEKLY_HIGH_SCORE')).toHaveLength(1);
    });
  });

  /* ---------------------------------------------------------------------
   * 6. Wagers
   * ------------------------------------------------------------------ */

  describe('wagers', () => {
    it('has nothing settleable in week 1, and says so rather than inventing one', async () => {
      /*
       * **The no-op path, recorded explicitly.**
       *
       * All three stake families are live in the code, and none of them can
       * settle in week 1 — for three separate reasons, none of which this
       * rehearsal is allowed to change:
       *
       *   - **Tony's Line** is flag-gated shut (`18 §3.4`). The line is a season
       *     median and a season median needs a season.
       *   - **A bounty** is authored against a basis of *earlier* weeks, and
       *     week 1 has none. `MIN_BASIS_TEAM_WEEKS` is 12 team-weeks.
       *   - **The chalkboard** is the same: a prediction about week 1 has no
       *     prior week to be a claim against.
       *
       * So week 1 authors for week 2 and settles nothing, and the correct
       * assertion is that no token moved for a stake reason.
       */
      await playWeekOne(run);
      const state = await run.observe();

      expect(state.resolutions).toEqual([]);
      expect(state.ledger.filter((row) => row.reason === 'STAKE_PAYOUT')).toEqual([]);
    });

    it("does not open Tony's Line just because a Tuesday ran", async () => {
      await playWeekOne(run);
      const state = await run.observe();

      // `lib/flags.ts` is the authority and it is shut. A rehearsal that turned
      // it on to have something to settle would be rehearsing a product that
      // does not exist.
      expect(state.stakes.filter((stake) => stake.kind === 'TONYS_LINE')).toEqual([]);
    });
  });

  /* ---------------------------------------------------------------------
   * 7. The Slice
   * ------------------------------------------------------------------ */

  describe('the Slice handoff', () => {
    it('drafts the week onto the press desk and stops there', async () => {
      await playWeekOne(run);

      const state = await run.observe();
      const week1 = state.versions.filter((version) => version.week === 1);

      expect(week1).toHaveLength(1);
      expect(week1[0]?.status).toBe('needs_review');
      expect(week1[0]?.publishable).toBe(true);
      // Nothing anywhere is published. `16 §9` is a gate, not a preference.
      expect(state.versions.some((version) => version.status === 'published')).toBe(false);
    });

    it('drafts with no AI key set, because the draft may never depend on one', async () => {
      // Asserted rather than assumed: the whole suite runs with the key unset,
      // so this states the property the run is evidence for.
      expect(process.env['ANTHROPIC_API_KEY'] ?? '').toBe('');
      await playWeekOne(run);
      expect((await run.observe()).versions).toHaveLength(1);
    });

    it('prints only finalized games', async () => {
      /*
       * Week 2 is played and *not* closed. The second Tuesday is given week 1 as
       * an explicit `?week=` override — a commissioner re-running a Tuesday — so
       * week 2's games arrive through the sync with nothing finalizing them. The
       * paper must not reach for them.
       */
      await playWeekOne(run);
      await run.tuesday({ week: 1, played: 2, at: NEXT_TUESDAY });

      const state = await run.observe();
      expect(state.games.filter((game) => game.week === 2)).toHaveLength(5);
      expect(state.finalizations.map((row) => row.week)).toEqual([1]);
      expect(state.versions.map((version) => version.week)).toEqual([1]);
    });

    it('needs a named person to publish, and the cron is not one', async () => {
      await playWeekOne(run);

      const [version] = await db!
        .select({ id: sliceIssueVersions.id })
        .from(sliceIssueVersions);
      expect(version).toBeDefined();

      // The cron ran twice and the version is still on the desk.
      await run.tuesday({ played: 1, at: NEXT_TUESDAY });
      const stillQueued = await db!
        .select({ status: sliceIssueVersions.status })
        .from(sliceIssueVersions)
        .where(eq(sliceIssueVersions.id, version!.id));
      expect(stillQueued[0]?.status).toBe('needs_review');

      // Publishing an unapproved version is refused by the database, not by a
      // service that remembered to check.
      await expect(
        run.publish({ versionId: version!.id, actorUserId: (await run.managerIdNamed('Alex'))! }),
      ).rejects.toThrow();

      // With a person's approval it publishes, and that person is recorded.
      const commissioner = (await run.managerIdNamed('Alex'))!;
      await run.approve({ versionId: version!.id, actorUserId: commissioner });
      await run.publish({ versionId: version!.id, actorUserId: commissioner });

      const published = await run.observe();
      expect(published.versions.filter((v) => v.status === 'published')).toHaveLength(1);
    });
  });

  /* ---------------------------------------------------------------------
   * 8. The week transition
   * ------------------------------------------------------------------ */

  describe('the transition into week 2', () => {
    it('leaves week 1 final and week 2 the week the board is about', async () => {
      await playWeekOne(run);
      const state = await run.observe();

      expect(state.finalizations).toEqual([{ week: 1, games: 5 }]);
      // Authoring is for the week ahead — the board a manager sees on Wednesday
      // — and never for the week that has just closed.
      expect(state.stakes.filter((stake) => stake.week !== 2)).toEqual([]);
    });

    it('does not let week 1 leak into week 2', async () => {
      await playWeekOne(run);
      await run.tuesday({ played: 2, at: NEXT_TUESDAY });

      const state = await run.observe();

      // Two closures, two weeks of games, and every reward filed under the week
      // that earned it.
      expect(state.finalizations).toEqual([
        { week: 1, games: 5 },
        { week: 2, games: 5 },
      ]);
      expect(state.rewards.filter((row) => row.week === 1)).toHaveLength(6);
      expect(state.rewards.filter((row) => row.week === 2)).toHaveLength(5);
      expect([...new Set(state.games.map((game) => game.week))].sort()).toEqual([1, 2]);
    });

    it('keeps week 1 immutable once it is closed', async () => {
      await playWeekOne(run);
      const before = await run.observe();

      // A later Tuesday re-reads week 1 from Sleeper as part of its 1..N sweep.
      await run.tuesday({ played: 2, at: NEXT_TUESDAY });

      const after = await run.observe();
      expect(after.games.filter((g) => g.week === 1)).toEqual(
        before.games.filter((g) => g.week === 1),
      );
      expect(after.snapshots).toEqual(before.snapshots);
      expect(after.rewards.filter((r) => r.week === 1)).toEqual(before.rewards);
    });
  });

  /* ---------------------------------------------------------------------
   * 9. Failure injections
   * ------------------------------------------------------------------ */

  describe('failure injections', () => {
    it('1. survives Sleeper being unreachable on Tuesday morning', async () => {
      await run.sunday({ week: 1, played: 1, at: SUNDAY });

      const report = await run.tuesday({
        played: 1,
        at: TUESDAY,
        fault: { kind: 'unreachable' },
      });

      expect(report.sync?.refusal).toBe('unreachable');
      expect(report.failed).toEqual([]);
      expect(report.skipped.join(' ')).toContain('Sleeper could not be read');

      // Nothing was invented, and nothing was closed on nothing.
      const state = await run.observe();
      expect(state.games.filter((game) => game.week === 1)).toEqual([]);
      expect(state.finalizations).toEqual([]);
      expect(state.rewards).toEqual([]);

      // And the retry works, because the refusal changed nothing.
      const retry = await run.tuesday({ played: 1, at: TUESDAY });
      expect(retry.finalized).toBe(true);
      expect((await run.observe()).rewards).toHaveLength(6);
    });

    it('2. survives a partial and invalid matchup payload', async () => {
      const report = await run.tuesday({
        played: 1,
        at: TUESDAY,
        fault: { kind: 'malformed-matchups', week: 1 },
      });

      /*
       * The decoder drops what it cannot read and warns; nothing pairs, so
       * nothing is stored. The important half is that the *chain* keeps its
       * shape — no half-week of games, no closure over a partial week.
       */
      expect(report.failed).toEqual([]);
      expect(report.games).toBe(0);
      expect(report.finalized).toBe(false);

      const state = await run.observe();
      expect(state.games.filter((game) => game.week === 1)).toEqual([]);
      expect(state.finalizations).toEqual([]);

      // And a clean payload afterwards closes it properly.
      const retry = await run.tuesday({ played: 1, at: TUESDAY });
      expect(retry.games).toBe(5);
      expect(retry.finalized).toBe(true);
    });

    it('3. is a read when the Tuesday route is invoked twice', async () => {
      await playWeekOne(run);
      const before = await run.observe();

      await run.tuesday({ played: 1, at: TUESDAY });

      const after = await run.observe();
      expect(after.finalizations).toEqual(before.finalizations);
      expect(after.rewards).toEqual(before.rewards);
      expect(after.ledger.length).toBe(before.ledger.length);
      expect(after.versions).toEqual(before.versions);
      expect(after.stakes).toEqual(before.stakes);
      expect(after.resolutions).toEqual(before.resolutions);
      expect(after.boxes).toBe(before.boxes);
    });

    it('4. resumes when the process dies after the sync and before the rewards', async () => {
      /*
       * Staged with the real step, not a mock: `syncSeason` alone is exactly
       * what the job has done at that point, and then nothing else runs.
       */
      const sync = await syncSeason(db!, {
        source: scriptedSeason({
          script: WEEK_1_SCRIPT,
          played: 1,
          phase: 'final',
          capturedAt: TUESDAY,
        }),
        seasonYear: SEASON,
        through: weekToReadThrough(await latestStoredWeek(db!, SEASON)),
      });
      expect(sync.refusal).toBeNull();

      const half = await run.observe();
      expect(half.games.filter((game) => game.week === 1)).toHaveLength(5);
      expect(half.finalizations).toEqual([]);
      expect(half.rewards).toEqual([]);

      // The retry finishes the job, and pays once.
      const report = await run.tuesday({ played: 1, at: TUESDAY });
      expect(report.finalized).toBe(true);
      expect(report.failed).toEqual([]);
      expect((await run.observe()).rewards).toHaveLength(6);
    });

    it('5. resumes when the process dies after the rewards and before the draft', async () => {
      await run.sunday({ week: 1, played: 1, at: SUNDAY });

      // Sync + close + pay, and stop — the state a crash mid-chain leaves.
      await syncSeason(db!, {
        source: scriptedSeason({
          script: WEEK_1_SCRIPT,
          played: 1,
          phase: 'final',
          capturedAt: TUESDAY,
        }),
        seasonYear: SEASON,
        through: 1,
      });
      await finalizeWeek(db!, { season: SEASON, week: 1, at: TUESDAY });
      const paid = await awardWeek(db!, { season: SEASON, week: 1, at: TUESDAY });
      expect(paid.paid).toHaveLength(6);

      const half = await run.observe();
      expect(half.versions).toEqual([]);

      const report = await run.tuesday({ played: 1, at: TUESDAY });
      expect(report.rewards?.paid).toEqual([]);
      expect(report.rewards?.alreadyPaid).toBe(6);
      expect(report.draft?.outcome).toBe('created');
      expect((await run.observe()).rewards).toHaveLength(6);
    });

    it('6. refuses a stale read rather than overwriting the live season with it', async () => {
      /*
       * The July fixtures re-imported over a live October season — which is what
       * a deploy does, every deploy. Without the guard the standings go back to
       * 0–0 and the week's games are rewritten by a payload that predates them.
       */
      await playWeekOne(run);
      const before = await run.observe();

      const stale = await run.tuesday({
        played: 1,
        at: NEXT_TUESDAY,
        capturedAt: new Date('2026-07-01T00:00:00Z'),
      });

      expect(stale.sync?.summary?.recordsChanged).toBe(0);
      const after = await run.observe();
      expect(after.games).toEqual(before.games);
      expect(after.seats).toEqual(before.seats);
    });

    it('7. drops a roster whose owner this league has never seen, and pays the rest', async () => {
      /*
       * Injected at the **seed**, not at the sync: `persistChain` leaves an
       * existing membership alone, so a seat that was created correctly and then
       * went unresolvable keeps its manager and this would prove nothing.
       *
       * Roster 6 is Ryan's seat and holds the week's high score — the most
       * expensive one to lose, which is why it is the one chosen.
       */
      const unowned = { kind: 'unknown-owner', rosters: [6] } as const;

      await resetDatabase(db!);
      run = rehearsal();
      await run.seed({ fault: unowned });

      /*
       * The fault is carried through the sync as well, because it is a fact
       * about the upstream rather than a moment: a Tuesday reading the *real*
       * owner back would repair the seat, and the rehearsal would be a rehearsal
       * of the repair.
       */
      const report = await run.tuesday({ played: 1, at: TUESDAY, fault: unowned });
      expect(report.failed).toEqual([]);

      const state = await run.observe();

      // Nine seats, because the tenth resolved to nobody.
      expect(state.seats).toHaveLength(9);
      expect(state.seats.some((seat) => seat.rosterId === 6)).toBe(false);

      /*
       * The game is stored — it is a real game and the record should hold it —
       * but it carries no claim about a person, so `publishableWeek` suppresses
       * it and **neither side** is paid. Roster 5 losing its win is the cost, and
       * it is the right cost: paying a game whose opponent the product cannot
       * name is worse than paying nothing.
       */
      expect(state.games.filter((game) => game.matchupId === 3)).toHaveLength(1);
      const paidRosters = state.rewards.map((row) => row.rosterId);
      expect(paidRosters).not.toContain(6);
      expect(paidRosters).not.toContain(5);
      expect(paidRosters.filter((id) => id !== 1)).toEqual([3, 7, 9]);

      // And the high score moved to the best score that can be attributed —
      // roster 1's 145.62 — rather than to nobody or to roster 6.
      const high = state.rewards.filter((row) => row.reason === 'WEEKLY_HIGH_SCORE');
      expect(high).toHaveLength(1);
      expect(high[0]?.rosterId).toBe(1);
    });

    it('8. refuses to finalize a week that was scheduled but never played', async () => {
      /*
       * **The unrecoverable one.** Ten rows at zero is what Sleeper serves for
       * every future week from the moment the league drafts. Storing them would
       * make five ties, `finalizeWeek` would close the week on them, and
       * `week_finalizations` is append-only — so week 1's real result could
       * never be recorded afterwards.
       */
      const report = await run.tuesday({ played: 1, at: TUESDAY, scheduledOnly: true });

      expect(report.failed).toEqual([]);
      expect(report.games).toBe(0);
      expect(report.finalized).toBe(false);
      expect(report.skipped.join(' ')).toContain('no publishable game');

      const state = await run.observe();
      expect(state.games).toEqual([]);
      expect(state.finalizations).toEqual([]);
      expect(state.rewards).toEqual([]);

      // And when the week is actually played, it closes for real.
      const played = await run.tuesday({ played: 1, at: TUESDAY });
      expect(played.finalized).toBe(true);
      expect(played.games).toBe(5);
    });

    it('9. leaves nothing behind when the reward transaction cannot commit', async () => {
      /*
       * The failure a single-transaction claim exists to survive: every award is
       * written and the commit is taken away. If rewards were paid outside their
       * transaction, or one transaction per manager, the ledger would keep part
       * of a week nobody was told about.
       */
      // Bring the week in and close it, but do not pay it yet — the two steps
      // before the one being interrupted.
      await syncSeason(db!, {
        source: scriptedSeason({
          script: WEEK_1_SCRIPT,
          played: 1,
          phase: 'final',
          capturedAt: TUESDAY,
        }),
        seasonYear: SEASON,
        through: 1,
      });
      await finalizeWeek(db!, { season: SEASON, week: 1, at: TUESDAY });
      const before = await run.observe();
      expect(before.finalizations).toEqual([{ week: 1, games: 5 }]);

      await expect(
        awardWeek(abortingCommits(db!), { season: SEASON, week: 1, at: TUESDAY }),
      ).rejects.toThrow(/before the commit/);

      /*
       * Not one row, not one token. The whole week or none of it — a half-paid
       * week is the outcome nobody could reason about afterwards, because a
       * retry cannot tell "not yet paid" from "deliberately not paid".
       *
       * Asserted against the state *before* the attempt rather than against
       * zero: a deploy opens every manager a tab (`SEASON_START`), so a balance
       * of nothing would be a claim about the seed rather than about the abort.
       */
      const aborted = await run.observe();
      expect(aborted.rewards).toEqual([]);
      expect(aborted.ledger.filter((row) => row.reason.startsWith('MATCHUP'))).toEqual([]);
      expect(aborted.seats).toEqual(before.seats);
      expect(aborted.ledger.length).toBe(before.ledger.length);

      // And the retry pays it exactly once.
      const report = await run.tuesday({ played: 1, at: TUESDAY });
      expect(report.rewards?.paid).toHaveLength(6);
      const state = await run.observe();
      expect(state.rewards).toHaveLength(6);
      expect(state.seats.every((seat) => seat.balance >= 0)).toBe(true);
    });
  });

  /* ---------------------------------------------------------------------
   * 10. The whole week, once, end to end
   * ------------------------------------------------------------------ */

  it('gets from Sunday to Wednesday with one coherent state at the end', async () => {
    await run.sunday({ played: 1, at: SUNDAY });
    const tuesday = await run.tuesday({ played: 1, at: TUESDAY });

    const commissioner = (await run.managerIdNamed('Alex'))!;
    await run.approve({ versionId: tuesday.draft!.versionId!, actorUserId: commissioner });
    await run.publish({ versionId: tuesday.draft!.versionId!, actorUserId: commissioner });

    const state = await run.observe();

    expect(state.season).toEqual({ year: SEASON, finalized: false });
    expect(state.snapshots).toHaveLength(5);
    expect(state.games).toHaveLength(5);
    expect(state.finalizations).toEqual([{ week: 1, games: 5 }]);
    expect(state.rewards).toHaveLength(6);
    expect(state.versions.filter((version) => version.status === 'published')).toHaveLength(1);
    expect(state.resolutions).toEqual([]);
    expect(state.seats).toHaveLength(10);
    expect(state.seats.reduce((sum, seat) => sum + seat.balance, 0)).toBe(
      state.ledger.reduce((sum, row) => sum + row.amount, 0),
    );

    // The season row was never closed by a cron — that is January's decision and
    // a person's.
    const [season] = await db!
      .select({ finalizedAt: seasons.finalizedAt })
      .from(seasons)
      .where(eq(seasons.year, SEASON));
    expect(season?.finalizedAt).toBeNull();
  });
});
