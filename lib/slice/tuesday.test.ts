import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { readManagerNames, seedManagerNames } from '@/lib/content/managers';
import { ensureEconomyConfig } from '@/lib/counter/tokens';
import { closePool, getDb } from '@/lib/db';
import {
  seasons,
  sliceIssueVersions,
  weekFinalizations,
  weeklyRewards,
} from '@/lib/db/schema';
import { resetDatabase } from '@/lib/db/test-helpers';
import { traverseChain } from '@/lib/sleeper/chain';
import { createFixtureSource } from '@/lib/sleeper/fixtures';
import { seasonInProgress } from '@/lib/sleeper/test-source';
import { persistChain } from '@/lib/sleeper/persist';

import { activeLeagueManagers } from '@/lib/league/membership';
import { demoDraftSource } from '@/lib/demo/draft-fixture';

import { saveDraftReview } from './preseason-reviews';
import { runTuesday } from './tuesday';

/**
 * The Tuesday job, against a real Postgres.
 *
 * The job itself owns no state and adds no guarantee of its own — every step it
 * calls is separately tested. What is untested until this file exists is the
 * **sequence**, and a sequence has failure modes its parts do not:
 *
 *   1. **A retried Tuesday must be a read.** A cron is retried — on a non-2xx,
 *      on an overlapping deploy, or because a commissioner pressed *"print a
 *      draft"* while it was mid-flight. If running it twice on one week wrote
 *      twice, the first live Tuesday would double-settle a payout.
 *   2. **A step that declines must not stop the chain.** A week with no
 *      publishable game cannot be closed, and a Tuesday that gave up there would
 *      never settle the bounty whose window ran out three weeks ago.
 *   3. **It must not publish.** `16 §9` makes approval mandatory in season one.
 *      The draft lands on the desk and stops, and the test asserts the *status*
 *      rather than trusting that nobody passed a flag.
 *
 * Against a real database rather than a mock, for the same reason the review
 * chain is: the idempotency being asserted lives in unique constraints and
 * triggers, and a mock would assert that the service remembered to be careful.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

const LEAGUE_2026 = '1385016656425668608';
const SEASON = 2025;
const AT = new Date('2026-08-02T09:00:00Z');

afterAll(async () => {
  if (hasDatabase) await closePool();
});

async function importLeague(finalizeYears: readonly number[] = [2024, 2025]): Promise<void> {
  const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, { includeWeeks: true });
  await persistChain(db!, chain, { sourceLabel: 'test', finalizeYears: [...finalizeYears] });
  await seedManagerNames(db!, readManagerNames());

  /*
   * The economy, because `npm run db:seed` writes it on every deploy and the job
   * runs *after* that. Leaving it out was how the failure path below got found:
   * `authorStakesForWeek` throws without a stored config, deliberately, and the
   * first version of this job let that throw cost the league its paper too.
   */
  for (const season of await db!.select({ id: seasons.id }).from(seasons)) {
    await ensureEconomyConfig(db!, season.id);
  }
}

/**
 * A week the pipeline will actually close and draft.
 *
 * Found rather than named. `slice.test.ts` already asserts every scored week of
 * a finalized season publishes, so any of them works — and hardcoding one that
 * silently stopped being publishable would make every assertion below pass for
 * the wrong reason.
 */
async function playableWeek(): Promise<number> {
  for (let week = 1; week <= 18; week += 1) {
    const report = await runTuesday(db!, { season: SEASON, week, at: AT });
    if (report.games > 0 && report.draft?.outcome === 'created') return week;
  }
  throw new Error('no week of the finalized season could be closed and drafted');
}

describe.skipIf(!hasDatabase)('the Tuesday job', () => {
  beforeEach(async () => {
    await resetDatabase(db!);
    await importLeague();
  });

  it('closes the week, drafts it, and leaves it on the desk', async () => {
    const week = await playableWeek();
    await resetDatabase(db!);
    await importLeague();

    const report = await runTuesday(db!, { season: SEASON, week, at: AT });

    expect(report.finalized).toBe(true);
    expect(report.games).toBeGreaterThan(0);
    expect(report.draft?.outcome).toBe('created');
    expect(report.failed).toEqual([]);

    const [row] = await db!
      .select({ status: sliceIssueVersions.status })
      .from(sliceIssueVersions)
      .where(eq(sliceIssueVersions.id, report.draft!.versionId!));

    // Submitted, never approved and never published. `16 §9` is a gate, not a
    // preference, and a cron that could publish is that gate with a timer on it.
    expect(row?.status).toBe('needs_review');
  });

  it('is a read the second time it runs', async () => {
    const week = await playableWeek();
    await resetDatabase(db!);
    await importLeague();

    const first = await runTuesday(db!, { season: SEASON, week, at: AT });
    const second = await runTuesday(db!, { season: SEASON, week, at: AT });

    // The week is closed by the first run and already closed for the second.
    expect(first.finalized).toBe(true);
    expect(second.finalized).toBe(false);

    // And the draft is the same draft, read back — not a second version of the
    // same week sitting in the queue waiting for a decision nobody can make.
    expect(second.draft?.outcome).not.toBe('created');
    expect(second.draft?.versionId).toBe(first.draft?.versionId);

    const closures = await db!
      .select({ week: weekFinalizations.week })
      .from(weekFinalizations);
    expect(closures.filter((c) => c.week === week)).toHaveLength(1);

    const versions = await db!.select({ id: sliceIssueVersions.id }).from(sliceIssueVersions);
    expect(versions).toHaveLength(1);
  });

  it('carries on when a step declines, and says which one', async () => {
    /*
     * Week 18 of the fixtures holds no publishable game, so `finalizeWeek`
     * refuses it. The chain must still run: settlement and authoring are about
     * the *season*, not about this week, and a Tuesday that stopped here would
     * strand every open stake for as long as one week stayed open.
     */
    const report = await runTuesday(db!, { season: SEASON, week: 18, at: AT });

    expect(report.games).toBe(0);
    expect(report.finalized).toBe(false);
    expect(report.skipped.join(' ')).toContain('no publishable game');
    // It reached the end rather than throwing or returning early.
    expect(report.draft).toBeDefined();
  });

  it('still prints the paper when a step throws, and names the step that did', async () => {
    /*
     * **The finding this job was built around.**
     *
     * `authorStakesForWeek` throws on a season with no stored economy config —
     * deliberately, because silently falling back to hardcoded prices is worse
     * than stopping. The first version of this job simply awaited each step in
     * order, so that throw also cost the league **its paper**: drafting comes
     * after authoring, and a mis-seeded economy would have produced an empty
     * press desk on a Tuesday with nothing on it to explain why.
     *
     * The four steps write to four different tables and nothing about one
     * failing makes the next one wrong. So the throw is recorded against the
     * step that threw, the chain finishes, and the route still answers 500 so
     * the platform retries — which is safe because every step is idempotent.
     */
    const week = await playableWeek();
    await resetDatabase(db!);
    // Deliberately *not* seeding the economy: this is the mis-seeded deploy.
    const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, { includeWeeks: true });
    await persistChain(db!, chain, { sourceLabel: 'test', finalizeYears: [2024, 2025] });
    await seedManagerNames(db!, readManagerNames());

    const report = await runTuesday(db!, { season: SEASON, week, at: AT });

    expect(report.failed.map((f) => f.step)).toEqual(['author']);
    expect(report.failed[0]?.why).toContain('economy');

    // The week still closed and the paper still reached the desk.
    expect(report.finalized).toBe(true);
    expect(report.draft?.outcome).toBe('created');
  });

  it('does nothing at all to a season that does not exist', async () => {
    const report = await runTuesday(db!, { season: 1999, week: 4, at: AT });

    expect(report.finalized).toBe(false);
    expect(report.games).toBe(0);
    expect(report.authored).toBe(0);
    expect(report.draft?.outcome).toBe('refused');

    const closures = await db!.select({ id: weekFinalizations.id }).from(weekFinalizations);
    expect(closures).toHaveLength(0);
  });

  /*
   * Rewards, inside the sequence.
   *
   * `03 §4`'s token sources are paid by the job rather than beside it, so the
   * two things worth asserting here are the two a unit test cannot reach: that
   * a live season actually pays through the whole chain, and that a closed one
   * declines in a sentence instead of raising out of the ledger four frames
   * down and costing the league its paper.
   */
  describe('the reward step', () => {
    it('pays a live season once, and pays nothing the second time', async () => {
      // 2025 left open, so its weeks are closed by the job rather than by the
      // January season close — which is the only state that can pay at all.
      await resetDatabase(db!);
      await importLeague([2024]);

      const first = await runTuesday(db!, { season: SEASON, week: 1, at: AT });

      expect(first.finalized).toBe(true);
      expect(first.rewards?.refusal).toBeNull();
      expect(first.rewards!.paid.length).toBeGreaterThan(0);
      expect(first.rewards!.tokens).toBeGreaterThan(0);
      expect(first.failed).toEqual([]);

      const afterFirst = await db!.select().from(weeklyRewards);
      expect(afterFirst.length).toBe(first.rewards!.paid.length);

      const second = await runTuesday(db!, { season: SEASON, week: 1, at: AT });

      expect(second.rewards?.paid).toEqual([]);
      expect(second.rewards?.tokens).toBe(0);
      expect(second.rewards!.alreadyPaid).toBe(afterFirst.length);
      expect(await db!.select().from(weeklyRewards)).toHaveLength(afterFirst.length);
    });

    it('pays exactly one high score for the week', async () => {
      await resetDatabase(db!);
      await importLeague([2024]);
      await runTuesday(db!, { season: SEASON, week: 1, at: AT });

      const high = (await db!.select().from(weeklyRewards)).filter(
        (row) => row.reason === 'WEEKLY_HIGH_SCORE',
      );
      // One, because the fixture holds no exact-cent tie. If it ever does, this
      // fails loudly rather than the tie rule changing behaviour unnoticed.
      expect(high).toHaveLength(1);
    });

    it('declines a closed season in a sentence, and still prints the paper', async () => {
      const week = await playableWeek();
      await resetDatabase(db!);
      await importLeague();

      const report = await runTuesday(db!, { season: SEASON, week, at: AT });

      // 2025 is finalized here, so every week of it is final by way of the
      // closed season — and `apply_token_delta` refuses a finalized season.
      expect(report.rewards?.refusal).toBe('season-closed');
      expect(report.failed).toEqual([]);
      expect(report.skipped.some((line) => line.includes('books are shut'))).toBe(true);
      // The decline cost the league nothing else.
      expect(report.draft?.outcome).toBe('created');
      expect(await db!.select().from(weeklyRewards)).toHaveLength(0);
    });

    it('does not wait on the commissioner approving the paper', async () => {
      await resetDatabase(db!);
      await importLeague([2024]);

      const report = await runTuesday(db!, { season: SEASON, week: 1, at: AT });

      /*
       * Nothing has been published — on an open season the Slice will not even
       * draft, which is a stronger version of the same point than an unapproved
       * draft would be: the paper is as far from the league's eyes as it gets.
       */
      const versions = await db!
        .select({ status: sliceIssueVersions.status })
        .from(sliceIssueVersions);
      expect(versions.some((version) => version.status === 'published')).toBe(false);

      // And the tokens moved anyway. Nothing in `03` or `16` makes a manager's
      // 150 wait on an editor, and a coupling would be invisible in production
      // because the desk would look merely quiet.
      expect(report.rewards!.tokens).toBeGreaterThan(0);
      expect(await db!.select().from(weeklyRewards)).not.toHaveLength(0);
    });
  });

  it('never closes a week of a season the books are shut on by writing to another', async () => {
    // A guard on the fixture rather than on the product: both seasons are
    // finalized here, so a report claiming to have closed a week of 2024 while
    // asked for 2025 would mean `finalizeWeek` resolved the wrong season.
    const week = await playableWeek();
    await resetDatabase(db!);
    await importLeague();

    await runTuesday(db!, { season: SEASON, week, at: AT });

    const rows = await db!
      .select({ seasonId: weekFinalizations.seasonId, week: weekFinalizations.week })
      .from(weekFinalizations);
    const [target] = await db!
      .select({ id: seasons.id })
      .from(seasons)
      .where(eq(seasons.year, SEASON));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.seasonId).toBe(target?.id);
  });

  describe('the sync step — `16 §4.3`\'s first', () => {
    /*
     * The defect this whole block exists for.
     *
     * Every step from `finalize` rightwards was built, idempotent and tested,
     * and **nothing filled `fantasy_matchups` during a live season.** The deploy
     * seed reads recorded fixtures — the 2026 recording is a preseason
     * photograph with no matchups in it at all — and the Sunday cron writes only
     * its snapshot. So the first live Tuesday would have declined week 1 for
     * want of a game and gone on declining it until January, with no error
     * anywhere: *"holds no publishable game"* is the truth in July and looks
     * exactly the same in October.
     *
     * The season is **2026** in this block rather than the finalized 2025 used
     * above, because a finalized season refuses every write and cannot show a
     * week arriving.
     */
    const OPEN_SEASON = 2026;

    it('closes a week that did not exist in the database when the job started', async () => {
      const before = await runTuesday(db!, { season: OPEN_SEASON, at: AT });
      expect(before.games).toBe(0);
      expect(before.finalized).toBe(false);

      const report = await runTuesday(db!, {
        season: OPEN_SEASON,
        at: AT,
        sleeper: seasonInProgress({ played: 1 }),
      });

      expect(report.sync?.refusal).toBeNull();
      expect(report.week).toBe(1);
      expect(report.games).toBeGreaterThan(0);
      expect(report.finalized).toBe(true);
      expect(report.failed).toEqual([]);
    });

    it('closes the week that just finished, not the one it closed last week', async () => {
      /*
       * The sequence defect the resolution order was moved for. The week used to
       * be chosen in the route from `max(stored week)` **before** the sync, which
       * on the second Tuesday of the season is last week — so week 1 would have
       * been closed every Tuesday until January and no other week ever.
       */
      const first = await runTuesday(db!, {
        season: OPEN_SEASON,
        at: AT,
        sleeper: seasonInProgress({ played: 1 }),
      });
      const second = await runTuesday(db!, {
        season: OPEN_SEASON,
        at: AT,
        sleeper: seasonInProgress({ played: 2 }),
      });

      expect(first.week).toBe(1);
      expect(second.week).toBe(2);
      expect(second.finalized).toBe(true);

      const closed = await db!
        .select({ week: weekFinalizations.week })
        .from(weekFinalizations);
      expect(closed.map((row) => row.week).sort((a, b) => a - b)).toEqual([1, 2]);
    });

    it('pays the week it just brought in', async () => {
      await runTuesday(db!, {
        season: OPEN_SEASON,
        at: AT,
        sleeper: seasonInProgress({ played: 1 }),
      });

      const paid = await db!.select({ amount: weeklyRewards.amount }).from(weeklyRewards);

      // Five games, so five winners, plus one weekly high score.
      expect(paid.length).toBeGreaterThan(0);
    });

    it('is a read the second time it runs', async () => {
      const first = await runTuesday(db!, {
        season: OPEN_SEASON,
        at: AT,
        sleeper: seasonInProgress({ played: 1 }),
      });
      const second = await runTuesday(db!, {
        season: OPEN_SEASON,
        at: AT,
        sleeper: seasonInProgress({ played: 1 }),
      });

      expect(first.finalized).toBe(true);
      expect(second.finalized).toBe(false);
      expect(second.sync?.summary?.recordsChanged).toBe(0);
      expect(second.failed).toEqual([]);

      // And nobody was paid twice for the same week.
      const paid = await db!
        .select({
          seat: weeklyRewards.seasonMembershipId,
          reason: weeklyRewards.reason,
          week: weeklyRewards.week,
        })
        .from(weeklyRewards);
      const distinct = new Set(paid.map((row) => `${row.seat}:${row.reason}:${String(row.week)}`));
      expect(distinct.size).toBe(paid.length);
    });

    it('still prints the paper when Sleeper cannot be reached', async () => {
      /*
       * A Tuesday morning outage must not cost the league everything else the
       * job does. The sync declines in a sentence and the chain runs on against
       * what is already stored.
       */
      await runTuesday(db!, {
        season: OPEN_SEASON,
        at: AT,
        sleeper: seasonInProgress({ played: 1 }),
      });

      const report = await runTuesday(db!, {
        season: OPEN_SEASON,
        at: AT,
        sleeper: {
          label: 'dead',
          fetch: () => Promise.reject(new Error('socket hang up')),
        },
      });

      expect(report.sync?.refusal).toBe('unreachable');
      expect(report.failed).toEqual([]);
      expect(report.skipped.join(' ')).toContain('Sleeper could not be read');
      // And the week it already holds is still the week it reports on.
      expect(report.week).toBe(1);
    });

    it('records the absence when no source is supplied at all', async () => {
      const report = await runTuesday(db!, { season: OPEN_SEASON, at: AT });

      expect(report.sync).toBeNull();
      expect(report.skipped.join(' ')).toContain('No Sleeper source was supplied');
    });

    it('honours an explicit week over the one it would have resolved', async () => {
      await runTuesday(db!, {
        season: OPEN_SEASON,
        at: AT,
        sleeper: seasonInProgress({ played: 3 }),
      });

      // The commissioner catching up a Tuesday that was missed.
      const report = await runTuesday(db!, {
        season: OPEN_SEASON,
        week: 2,
        at: AT,
        sleeper: seasonInProgress({ played: 3 }),
      });

      expect(report.week).toBe(2);
      expect(report.finalized).toBe(true);
    });
  });

  /**
   * The Tuesday before the opener.
   *
   * The one Tuesday in the year with no week behind it. `generateDraft` refuses
   * it — correctly, because nothing has been played — and the whole question is
   * whether the job then reaches for the other kind of paper or leaves the desk
   * empty for the season's first issue.
   */
  describe('the preseason Tuesday', () => {
    const OPEN_SEASON = 2026;

    beforeEach(async () => {
      await importLeague([2024, 2025]);
    });

    /** A source that serves the fixture 2026 draft and no results at all. */
    async function draftOnly() {
      const managers = [...(await activeLeagueManagers(db!))].sort(
        (a, b) => a.rosterId - b.rosterId,
      );
      return demoDraftSource(managers.map((manager) => manager.rosterId));
    }

    it('prints nothing at all before the league drafts', async () => {
      const report = await runTuesday(db!, {
        season: OPEN_SEASON,
        at: AT,
        sleeper: seasonInProgress({ played: 0 }),
      });

      expect(report.issueKind).toBe('none');
      expect(report.draft?.outcome).toBe('refused');
      expect(report.skipped.join(' ')).toContain('has not drafted');
      expect(report.failed).toEqual([]);
    });

    it('draws the draft in, and says so', async () => {
      const report = await runTuesday(db!, {
        season: OPEN_SEASON,
        at: AT,
        sleeper: await draftOnly(),
      });

      expect(report.draftSync?.refusal).toBeNull();
      expect(report.draftSync?.picksStored).toBe(160);
    });

    it('is a read the second time the draft comes in', async () => {
      await runTuesday(db!, { season: OPEN_SEASON, at: AT, sleeper: await draftOnly() });
      const second = await runTuesday(db!, {
        season: OPEN_SEASON,
        at: AT,
        sleeper: await draftOnly(),
      });

      expect(second.draftSync?.picksAdded).toBe(0);
      expect(second.draftSync?.outcome).toBe('unchanged');
    });

    it('still prints nothing while Tony has grades outstanding', async () => {
      const report = await runTuesday(db!, {
        season: OPEN_SEASON,
        at: AT,
        sleeper: await draftOnly(),
      });

      expect(report.issueKind).toBe('none');
      expect(report.skipped.join(' ')).toContain('has not graded every draft');
    });

    it('drafts the review once every grade is in, and stops at the desk', async () => {
      await runTuesday(db!, { season: OPEN_SEASON, at: AT, sleeper: await draftOnly() });

      const managers = await activeLeagueManagers(db!);
      for (const manager of managers) {
        await saveDraftReview(db!, {
          seasonYear: OPEN_SEASON,
          userId: manager.id,
          grade: 'B',
          take: 'Tony has seen worse and has seen better, which is most drafts.',
          actorUserId: manager.id,
        });
      }

      const report = await runTuesday(db!, {
        season: OPEN_SEASON,
        at: AT,
        sleeper: await draftOnly(),
      });

      expect(report.issueKind).toBe('preseason');
      expect(report.draft?.outcome).toBe('created');

      /*
       * The gate, asserted as a *status* rather than trusted. `16 §9` has no
       * preseason exemption and there is no parameter on the job that creates
       * one.
       */
      const [version] = await db!
        .select({ status: sliceIssueVersions.status })
        .from(sliceIssueVersions)
        .where(eq(sliceIssueVersions.id, report.draft!.versionId!));

      expect(version?.status).toBe('needs_review');
    });

    it('goes back to the weekly paper the moment a week is played', async () => {
      /*
       * The transition this whole branch has to get right. A calendar rule would
       * still be printing draft reviews in October.
       */
      await runTuesday(db!, { season: OPEN_SEASON, at: AT, sleeper: await draftOnly() });

      const managers = await activeLeagueManagers(db!);
      for (const manager of managers) {
        await saveDraftReview(db!, {
          seasonYear: OPEN_SEASON,
          userId: manager.id,
          grade: 'B',
          take: 'Tony has seen worse and has seen better, which is most drafts.',
          actorUserId: manager.id,
        });
      }

      const preseason = await runTuesday(db!, {
        season: OPEN_SEASON,
        at: AT,
        sleeper: await draftOnly(),
      });
      expect(preseason.issueKind).toBe('preseason');

      const played = await runTuesday(db!, {
        season: OPEN_SEASON,
        at: AT,
        sleeper: seasonInProgress({ played: 1 }),
      });

      expect(played.issueKind).toBe('weekly');
      expect(played.week).toBe(1);
    });
  });
});
