import { grantSeasonalBoxes, type GrantRefusal, type GrantReport } from '@/lib/counter/grants';
import { type Database } from '@/lib/db';
import { featureFlags } from '@/lib/flags';
import { awardWeek, type RewardRefusal, type RewardReport } from '@/lib/rewards/service';
import {
  generateDraft,
  generatePreseasonDraft,
  type DraftResult,
} from '@/lib/slice/publication';
import { preseasonEligibility } from '@/lib/slice/preseason';
import { seasonLeagueId } from '@/lib/slice/preseason-desk';
import {
  DRAFT_SYNC_REFUSALS,
  syncSeasonDraft,
  type DraftSyncReport,
} from '@/lib/sleeper/persist-draft';
import { readSchedule, type SchedulePairing } from '@/lib/sleeper/schedule';
import { type SleeperSource } from '@/lib/sleeper/transport';
import {
  latestStoredWeek,
  syncSeason,
  weekToReadThrough,
  type SyncRefusal,
  type SyncReport,
} from '@/lib/sleeper/weekly';
import { finalizeWeek } from '@/lib/stakes/facts';
import { authorStakesForWeek, settleSeason } from '@/lib/stakes/service';

/**
 * What the commissioner is told when a week paid nothing.
 *
 * One sentence each, because `TuesdayReport.skipped` is the field somebody reads
 * at 8am to find out whether the job ran. "nothing-payable" in a JSON body is a
 * status code; these are answers.
 */
const REWARD_REFUSALS: Record<RewardRefusal, (week: number) => string> = {
  'no-season': () => 'That season has not been imported, so nothing could be paid.',
  'no-games': (week) => `Week ${String(week)} holds no game to pay anybody for.`,
  'not-finalized': (week) =>
    `Week ${String(week)} is not closed, so no rewards were paid.`,
  'season-closed': (week) =>
    `Week ${String(week)} belongs to a finalized season, whose books are shut.`,
  'nothing-payable': (week) => `Week ${String(week)} had nothing the rules pay for.`,
};

/** The same, for the sync. The first step, so the most important one to read. */
const SYNC_REFUSALS: Record<SyncRefusal, (season: number) => string> = {
  'no-season': (season) => `${String(season)} has not been imported, so there was nothing to sync into.`,
  'no-league': (season) =>
    `${String(season)} has no Sleeper league id on record, so there was nothing to read.`,
  'season-closed': (season) => `${String(season)}'s books are shut, so nothing was read.`,
  unreachable: () => 'Sleeper could not be read, so no new results came in. The job will retry.',
  'wrong-season': () =>
    'Sleeper returned a different season than the one being closed. Nothing was imported — check SLEEPER_LEAGUE_ID.',
};

/** The same, for the seasonal boxes. Also one sentence, for the same reason. */
const GRANT_REFUSALS: Record<GrantRefusal, () => string> = {
  'no-season': () => 'That season has not been imported, so no boxes were handed out.',
  'season-closed': () => 'That season is finalized, and a closed season hands out nothing.',
  'no-active-seats': () => 'Nobody holds an active seat that season, so there was nobody to give a box to.',
};

/**
 * The Tuesday job — `16 §4.3`'s second cron, as one operation.
 *
 * ## What it is, and what it deliberately is not
 *
 * `16 §4.3` gives Tuesday a chain: **sync → close the week → settle what was
 * riding on it → author next week's stakes → draft the Slice → notify the
 * commissioner.** Every one of those from `close` rightwards already existed,
 * idempotent and tested, before this file. What did not exist was the
 * *sequence* — and a sequence is a thing with its own failure modes, so it gets
 * its own module rather than living inside a route handler where it could not be
 * tested without HTTP.
 *
 * ## The sync was missing, and it was the step everything else waited on
 *
 * The first version of this file started at `finalize`, and every step below it
 * was correct and **starved**. Nothing else in the deployed application writes
 * `fantasy_matchups`: the deploy seed imports recorded fixtures captured before
 * the season began, and the Sunday cron writes only its photograph. So the first
 * live Tuesday would have found no publishable game, declined, and left the shop
 * in offseason for the whole year — silently, because *"nothing to close"* is a
 * legitimate answer in July and looks identical in October.
 *
 * `lib/sleeper/weekly.ts` is the step. It runs **first** because everything
 * after it reads what it writes, which is the order `16 §4.3` states.
 *
 * It **does not publish.** `16 §9` makes commissioner approval mandatory in
 * season one and `docs/SLICE_REVIEW_BOUNDARY.md` makes it permanent, so the last
 * thing this job does is `submit: true` — the draft lands on the press desk and
 * stops. A cron that could publish would be the approval gate with a timer
 * attached, which is the same thing as not having one.
 *
 * ## Every step is idempotent, and that is load-bearing rather than tidy
 *
 * A cron is retried. Vercel retries on a non-2xx, a deploy can overlap a
 * schedule, and a commissioner can press *"print a draft"* on the desk while the
 * job is mid-flight. So running Tuesday twice on one week has to be the same as
 * running it once, and it is — by five separate mechanisms, every one of them a
 * database constraint rather than a check in this file:
 *
 * | Step | What makes a second run a no-op |
 * |---|---|
 * | `syncSeason` | `persistChain` compares before it writes: an unchanged week reports `unchanged`, a finalized season is refused, and a capture older than the stored one writes nothing |
 * | `finalizeWeek` | `UNIQUE(season_id, week)` plus an append-only trigger. A closed week cannot be reopened |
 * | `settleSeason` | `stake_resolutions.stake_id UNIQUE`, inserted **before** any token moves. Ten parallel settlements pay once |
 * | `awardWeek` | `token_transactions.idempotency_key UNIQUE` on a key derived from the occasion, plus `weekly_rewards_once_per_manager_per_reason` |
 * | `grantSeasonalBoxes` | `loot_boxes.grant_key UNIQUE` on a key naming the season, the milestone and the manager |
 * | `authorStakesForWeek` | reads what already exists for the week and writes only what is missing |
 * | `generateDraft` | `UNIQUE(issue_id, content_hash)`. A retried Tuesday on unchanged facts appends nothing and reads the first draft back |
 *
 * This module adds no sixth mechanism of its own. It has no state.
 *
 * ## The order is not arbitrary
 *
 * Finalize first, because **settlement may only read a finalized week** — that
 * is the contradiction the weekly-stakes slice had to resolve, and running these
 * two the other way round would reintroduce it. Author after settling, so the
 * new week's offers are written against a board with last week's answers on it.
 * Draft last, because the Slice prints results and a result is not printable
 * until the week is closed.
 *
 * ## A step that declines is not a step that failed
 *
 * Five of the six have a legitimate *"nothing to do"*: a week with no
 * publishable game cannot be finalized, a season with no open stakes settles
 * nothing, a week that is not closed pays nobody, and a week whose facts refuse
 * cannot be drafted. None of those is an error and none of them stops the chain —
 * they are recorded in the report and the job carries on, because a Tuesday where
 * the books are still open on one game should still settle the bounty that
 * cleared three weeks ago.
 *
 * **Only a thrown error is a failure.** The route turns that into a non-2xx so
 * the platform retries, which is safe precisely because every step is
 * idempotent.
 *
 * ## The preseason branch, and why it is not a third cron
 *
 * `16 §4.3` allows exactly two scheduled jobs and this is the second. The
 * Tuesday before the opener needs a paper drafted and it is not a recap, so the
 * question was whether that needs a scheduler of its own. It does not: this job
 * already runs on that Tuesday, already holds a Sleeper source, and already
 * ends in *"draft something and put it on the desk"*.
 *
 * So the weekly draft is attempted first and the preseason issue is what happens
 * when it **refuses** — which is the honest test rather than a calendar one.
 * `generateDraft` declines with `no-week` or `not-final` exactly when no week has
 * been played, and `preseasonEligibility` then asks whether the league has
 * actually drafted. A league that has not drafted gets neither paper and the
 * report says so in a sentence.
 *
 * It **still does not publish**, and that is the same `submit: true` the weekly
 * paper gets. `16 §9`'s approval gate does not have a preseason exemption.
 */

export interface TuesdayReport {
  readonly season: number;
  readonly week: number;
  /** What came in from Sleeper, or why nothing did. Null when the step threw. */
  readonly sync: SyncReport | null;
  /**
   * The draft, read and stored. Null when there was no source or the step threw.
   *
   * Cheap — two requests — and checked every week rather than on the one week the
   * draft happens, for the same reason `grantSeasonalBoxes` is: a job that only
   * ran on the right week would silently skip a retry, a redeploy, and a league
   * that drafted on a Wednesday.
   */
  readonly draftSync: DraftSyncReport | null;
  /**
   * Which paper this Tuesday drafted.
   *
   * `weekly` on every ordinary Tuesday. `preseason` on the one before the opener,
   * when there is no week to recap and the league has a completed draft
   * (`lib/slice/preseason.ts`). `none` when neither could be drafted.
   */
  readonly issueKind: 'weekly' | 'preseason' | 'none';
  /** The week was closed by *this* run. False when it was already closed. */
  readonly finalized: boolean;
  /** Publishable games in the week. Zero means it could not be finalized at all. */
  readonly games: number;
  /** Stakes settled by this run, by outcome. */
  readonly settled: Readonly<Record<string, number>>;
  /** What the closed week paid, or why it paid nothing. Null when the step threw. */
  readonly rewards: RewardReport | null;
  /** The season's free boxes, or why none were handed out. Null when the step threw. */
  readonly grants: GrantReport | null;
  /** New offers written for the week ahead. */
  readonly authored: number;
  /** What happened to the draft, in `generateDraft`'s own words. */
  readonly draft: DraftResult | null;
  /**
   * What the job declined to do, and why — one plain sentence per skipped step.
   *
   * Empty on an ordinary Tuesday. This is the field a commissioner reads when
   * the desk is empty and they want to know whether the job ran.
   */
  readonly skipped: readonly string[];
  /**
   * Steps that **threw**, which is a different thing from declining.
   *
   * A declined step had nothing to do. A failed step had something to do and
   * could not — a missing economy config, a database that went away mid-run.
   * The route turns a non-empty list into a 500 so the platform retries.
   */
  readonly failed: readonly { readonly step: string; readonly why: string }[];
}

/**
 * Why the preseason pipeline declined, in one sentence.
 *
 * Keyed by `PreseasonRefusal`, so a reason a commissioner reads at 8am is a
 * sentence rather than a slug. `reviews-incomplete` is the one that will
 * actually happen: the Tuesday job runs, the draft is in, and Tony has graded
 * six of ten.
 */
const PRESEASON_REFUSALS: Readonly<Record<string, string | undefined>> = {
  'no-draft': 'The league has not drafted yet, so there is no draft review to print.',
  'draft-incomplete': 'The draft has not finished, so there is no draft review to print.',
  'no-picks': 'The draft is on record with no picks, so there is nothing to review.',
  'nobody-publishable': 'No manager in the league picked in that draft.',
  'reviews-incomplete':
    'Tony has not graded every draft yet, so the draft review is not ready to print.',
  'season-underway': 'The season has started, so the weekly paper is the paper.',
  'season-closed': 'That season is finalized, so there is no preview to write.',
};

/**
 * Week one's fixtures, when they can be had.
 *
 * The one thing a season preview wants that the database cannot supply, because
 * the sync deliberately refuses to store a drafted-but-unplayed week
 * (`docs/IN_SEASON_SYNC_BOUNDARY.md`). Read here rather than in a render path,
 * and folded into the **snapshot** the version stores, which is what every other
 * published sentence in this product is.
 *
 * Returns an empty object rather than an empty array when there is nothing to
 * read, so the caller spreads nothing and `generatePreseasonDraft` sees the
 * field as absent — the difference between *"no schedule"* and *"a schedule with
 * no games in it"*.
 */
async function weekOneFixtures(
  db: Database,
  seasonYear: number,
  source: SleeperSource | undefined,
): Promise<{ weekOne?: readonly SchedulePairing[] }> {
  if (source === undefined) return {};
  const leagueId = await seasonLeagueId(db, seasonYear);
  if (leagueId === null) return {};

  const weekOne = await readSchedule(source, { leagueId, week: 1 });
  return weekOne.length === 0 ? {} : { weekOne };
}

/**
 * Run one step, and let the chain outlive it.
 *
 * The first version simply awaited each step in order, and the test found what
 * that costs: `authorStakesForWeek` throws on a season with no stored economy
 * config — deliberately, because a silent fallback to hardcoded prices is worse
 * — and a bare `await` meant that throw also cost the league **its paper**. The
 * Slice is drafted after authoring, so a mis-seeded economy would have produced
 * an empty press desk on a Tuesday with no explanation on it beyond a 500 in a
 * log nobody reads on a Tuesday morning.
 *
 * The four steps are independent writes to four different tables. Nothing about
 * one failing makes the next one wrong, so each is attempted, a throw is
 * recorded against the step that threw, and the run still reports a 500 at the
 * end. **Retrying is safe** for exactly the reason the table above gives.
 */
async function attempt<T>(
  step: string,
  failed: { step: string; why: string }[],
  run: () => Promise<T>,
): Promise<T | null> {
  try {
    return await run();
  } catch (error: unknown) {
    // The message, not the stack, and never the cause chain: this ends up in a
    // response body readable by anyone holding the cron secret.
    failed.push({ step, why: error instanceof Error ? error.message : 'unknown failure' });
    return null;
  }
}

/**
 * Run one week's Tuesday.
 *
 * `at` is passed in rather than read from a clock, because `finalizeWeek` stamps
 * it onto the record and this project's one rule about time is that nothing
 * calls `new Date()` where a test cannot reach it (`lib/clock.ts`).
 *
 * `sleeper` is injected for the same reason: the test suite never touches the
 * network, and a job that constructed its own live source could not be run
 * offline. Omitting it is legitimate — the sync is recorded as skipped and the
 * rest of the chain runs against whatever is already stored — but the route
 * always passes one, because a Tuesday that quietly stopped syncing would look
 * exactly like a quiet week.
 *
 * `week` is optional and normally omitted. The week is resolved **after** the
 * sync, because the only honest answer to *"which week just finished"* is *"the
 * latest one we now hold results for"*, and before the sync that answer is a
 * week old. Passing it explicitly is the commissioner's `?week=` override.
 */
export async function runTuesday(
  db: Database,
  input: {
    readonly season: number;
    /** The week to close. Omitted on a scheduled run — resolved after the sync. */
    readonly week?: number;
    readonly at: Date;
    /** Where results come from. Omitted only where a test wants no sync at all. */
    readonly sleeper?: SleeperSource;
    /** The environment, for `tonysLine`. Read once here rather than per step. */
    readonly env?: NodeJS.ProcessEnv;
  },
): Promise<TuesdayReport> {
  const skipped: string[] = [];
  const failed: { step: string; why: string }[] = [];

  // --- 1. Bring the week in ------------------------------------------------
  /*
   * `16 §4.3`'s first step, and the one every other step reads the output of.
   *
   * It reads through `stored + 1` rather than through a week number somebody
   * chose: an unplayed week comes back empty and moves nothing, so the bound is
   * self-limiting. `lib/sleeper/weekly.ts` carries the reasoning and the request
   * budget.
   */
  const sync = input.sleeper === undefined
    ? null
    : await attempt('sync', failed, async () =>
        syncSeason(db, {
          source: input.sleeper!,
          seasonYear: input.season,
          through: weekToReadThrough(await latestStoredWeek(db, input.season)),
        }),
      );

  if (input.sleeper === undefined) {
    skipped.push('No Sleeper source was supplied, so no new results were read.');
  } else if (sync !== null && sync.refusal !== null) {
    skipped.push(SYNC_REFUSALS[sync.refusal](input.season));
  }

  // --- 1b. Bring the draft in ---------------------------------------------
  /*
   * Two requests, every week, and the reason it is every week rather than once
   * is the reason `grantSeasonalBoxes` runs every week: a job that fired only on
   * the week the draft happened would silently skip a retry, a redeploy, a
   * league that drafted on a Wednesday, and an environment seeded afterwards.
   *
   * Idempotent through `UNIQUE(draft_id, pick_no)` and `draft_picks_immutable`,
   * so the fifteen runs after the draft cost fifteen no-ops.
   *
   * It runs **before** the week is resolved because nothing downstream reads it
   * — the draft matters only to the preseason issue, at the end — and putting it
   * beside the other Sleeper read keeps every network call this job makes in one
   * place.
   */
  const draftSync =
    input.sleeper === undefined
      ? null
      : await attempt('draft-sync', failed, async () => {
          const leagueId = await seasonLeagueId(db, input.season);
          if (leagueId === null) return null;
          return syncSeasonDraft(db, {
            source: input.sleeper!,
            seasonYear: input.season,
            leagueId,
          });
        });

  if (draftSync !== null && draftSync !== undefined && draftSync.refusal !== null) {
    skipped.push(DRAFT_SYNC_REFUSALS[draftSync.refusal]);
  }

  /*
   * Which week is being closed.
   *
   * After the sync, so a week that arrived thirty seconds ago is the week this
   * Tuesday is about. Resolving it before would close last week again, every
   * week, for the whole season — the sequence defect this file exists to hold.
   *
   * A season with no stored game at all resolves to week 1, which `finalizeWeek`
   * then declines. That is the right shape for a July Tuesday: it says *"week 1
   * holds no publishable game"* rather than inventing a week number.
   */
  const week = input.week ?? Math.max(1, await latestStoredWeek(db, input.season));

  // --- 2. Close the week ---------------------------------------------------
  const closed = (await attempt('finalize', failed, () =>
    finalizeWeek(db, { season: input.season, week, at: input.at }),
  )) ?? { closed: false, games: 0 };

  if (closed.games === 0 && failed.length === 0) {
    /*
     * No publishable game. `finalizeWeek` refuses, and it is right to: *"nothing
     * happened and we closed it"* is not a finalization.
     *
     * The chain continues anyway. An open week blocks *this* week's settlement,
     * not a bounty from three weeks ago whose window has just run out.
     */
    skipped.push(
      `Week ${String(week)} holds no publishable game, so it was not closed.`,
    );
  }

  // --- 2. Settle what was riding on it -------------------------------------
  const settlements = (await attempt('settle', failed, () => settleSeason(db, input.season))) ?? [];
  const settled: Record<string, number> = {};
  for (const { result } of settlements) {
    settled[result.status] = (settled[result.status] ?? 0) + 1;
  }
  if (settlements.length === 0) {
    skipped.push('Nothing was open, so nothing settled.');
  }

  // --- 3. Pay the week -------------------------------------------------------
  /*
   * `03 §4`'s token sources, for the week that just closed.
   *
   * After settlement rather than before it, for one reason: settlement is the
   * end of the *previous* authoring cycle and is coupled to finalization in a
   * pair that `finalizeWeek`'s own comment explains. Rewards depend on nothing
   * but finality, so they slot in behind that pair rather than between it.
   *
   * Before drafting, because the Slice reads a finalized week and a future
   * edition that prints what the week paid must not race the payment.
   *
   * **Not coupled to approval.** `16 §9` requires a person to approve the
   * *paper*; nothing in the specification makes a manager's 150 tokens wait on
   * an editor. Tying them together would mean an unreviewed Tuesday silently
   * withholds money that a finalized week already earned — and the coupling
   * would be invisible, because the desk would look merely quiet.
   */
  const rewards = await attempt('reward', failed, () =>
    awardWeek(db, { season: input.season, week, at: input.at }),
  );
  if (rewards !== null && rewards.refusal !== null) {
    skipped.push(REWARD_REFUSALS[rewards.refusal](week));
  }

  // --- 4. Hand out the season's free boxes ---------------------------------
  /*
   * The commissioner's two seasonal grants, checked every week rather than on
   * the two weeks they fall due.
   *
   * `milestonesDue` is monotonic, so this is a **catch-up** rather than a
   * schedule: a manager seated in week 9, a Tuesday that failed and was retried
   * on Thursday, and an environment seeded halfway through a season all end with
   * the same two boxes. A job that only granted on weeks 1 and 7 would silently
   * skip every one of those, and the silence is the problem — nothing about a
   * missing box looks like an error.
   *
   * Idempotent through `loot_boxes.grant_key UNIQUE`, like every other grant in
   * the product, so running it fourteen times a season costs fourteen no-ops.
   */
  const grants = await attempt('grant', failed, () =>
    grantSeasonalBoxes(db, { seasonYear: input.season, week }),
  );
  if (grants !== null && grants.refusal !== null) {
    skipped.push(GRANT_REFUSALS[grants.refusal]());
  }

  // --- 5. Author the week ahead --------------------------------------------
  /*
   * `18 §3.4` puts Tony's Line behind a deploy-time flag, and it is shut. The
   * job reads the same flag every surface reads rather than deciding for itself
   * — a cron that authored a market the room will not show is a cron writing
   * rows nobody can act on.
   */
  const flags = featureFlags(input.env ?? process.env);
  const authoring = (await attempt('author', failed, () =>
    authorStakesForWeek(db, {
      season: input.season,
      week: week + 1,
      lineOpen: flags.tonysLine,
    }),
  )) ?? { report: { authored: [], refused: [] }, written: 0 };
  if (authoring.written === 0) {
    skipped.push(
      `Nothing new to put on the board for week ${String(week + 1)}.`,
    );
  }

  // --- 6. Draft the Slice, and stop at the desk ----------------------------
  /*
   * The weekly paper first, always.
   *
   * A Tuesday in October has a week to recap and that is the paper. The
   * preseason branch below is reached only when this one **refuses**, which is
   * the honest test: `generateDraft` declines on `no-week` and `not-final`, and
   * those are exactly the states a season that has not started is in.
   *
   * Ordering it the other way — check the preseason first — would work today and
   * would put a calendar-shaped decision ahead of a data-shaped one.
   */
  let issueKind: TuesdayReport['issueKind'] = 'none';

  let draft = await attempt('draft', failed, () =>
    generateDraft(db, { season: input.season, week, submit: true }),
  );

  if (draft !== null && draft.outcome !== 'refused') {
    issueKind = 'weekly';
  } else {
    /*
     * No week to recap. Is this the Tuesday before the season instead?
     *
     * `preseasonEligibility` answers from product state rather than from the
     * calendar: an open season, a completed draft with picks, no week closed and
     * no result stored. A league that has not drafted is not eligible, and the
     * report then carries *that* sentence rather than the weekly pipeline's —
     * because on the Tuesday before the opener *"the league has not drafted"* is
     * the useful answer and *"no week"* is the obvious one.
     *
     * **It still does not publish.** `submit: true` puts the draft review on the
     * press desk exactly like the weekly paper, and `16 §9`'s approval gate is
     * the same gate — the preseason issue reaches the rack when a person stamps
     * it and not before.
     */
    const eligibility = await preseasonEligibility(db, input.season);

    if (!eligibility.eligible) {
      skipped.push(
        PRESEASON_REFUSALS[eligibility.refusal ?? ''] ??
          `Week ${String(week)} holds no result that may be printed yet.`,
      );
    } else {
      const preseason = await attempt('preseason-draft', failed, async () =>
        generatePreseasonDraft(db, {
          season: input.season,
          ...(await weekOneFixtures(db, input.season, input.sleeper)),
          submit: true,
        }),
      );

      if (preseason !== null) {
        draft = preseason;
        if (preseason.outcome === 'refused') {
          skipped.push(
            PRESEASON_REFUSALS[preseason.refusal ?? ''] ??
              'The draft review could not be printed.',
          );
        } else {
          issueKind = 'preseason';
        }
      }
    }
  }

  return {
    season: input.season,
    week,
    sync,
    draftSync: draftSync ?? null,
    issueKind,
    finalized: closed.closed,
    games: closed.games,
    settled,
    rewards,
    grants,
    authored: authoring.written,
    draft,
    skipped,
    failed,
  };
}
