import { grantSeasonalBoxes, type GrantRefusal, type GrantReport } from '@/lib/counter/grants';
import { type Database } from '@/lib/db';
import { featureFlags } from '@/lib/flags';
import { awardWeek, type RewardRefusal, type RewardReport } from '@/lib/rewards/service';
import { generateDraft, type DraftResult } from '@/lib/slice/publication';
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
 * `16 §4.3` gives Tuesday a chain: **close the week → settle what was riding on
 * it → author next week's stakes → draft the Slice → notify the commissioner.**
 * Every one of those already existed, idempotent and tested, before this file.
 * What did not exist was the *sequence* — and a sequence is a thing with its own
 * failure modes, so it gets its own module rather than living inside a route
 * handler where it could not be tested without HTTP.
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
 */

export interface TuesdayReport {
  readonly season: number;
  readonly week: number;
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
 */
export async function runTuesday(
  db: Database,
  input: {
    readonly season: number;
    readonly week: number;
    readonly at: Date;
    /** The environment, for `tonysLine`. Read once here rather than per step. */
    readonly env?: NodeJS.ProcessEnv;
  },
): Promise<TuesdayReport> {
  const skipped: string[] = [];
  const failed: { step: string; why: string }[] = [];

  // --- 1. Close the week ---------------------------------------------------
  const closed = (await attempt('finalize', failed, () =>
    finalizeWeek(db, { season: input.season, week: input.week, at: input.at }),
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
      `Week ${String(input.week)} holds no publishable game, so it was not closed.`,
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
    awardWeek(db, { season: input.season, week: input.week, at: input.at }),
  );
  if (rewards !== null && rewards.refusal !== null) {
    skipped.push(REWARD_REFUSALS[rewards.refusal](input.week));
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
    grantSeasonalBoxes(db, { seasonYear: input.season, week: input.week }),
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
      week: input.week + 1,
      lineOpen: flags.tonysLine,
    }),
  )) ?? { report: { authored: [], refused: [] }, written: 0 };
  if (authoring.written === 0) {
    skipped.push(
      `Nothing new to put on the board for week ${String(input.week + 1)}.`,
    );
  }

  // --- 6. Draft the Slice, and stop at the desk ----------------------------
  const draft = await attempt('draft', failed, () =>
    generateDraft(db, { season: input.season, week: input.week, submit: true }),
  );
  if (draft !== null && draft.outcome === 'refused') {
    skipped.push(
      draft.refusal ??
        `Week ${String(input.week)} holds no result that may be printed yet.`,
    );
  }

  return {
    season: input.season,
    week: input.week,
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
