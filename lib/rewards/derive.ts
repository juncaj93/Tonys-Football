import { type WeekRecord } from '@/lib/stats/week';

/**
 * What a finalized week pays, and to whom.
 *
 * ## This file computes nothing about football
 *
 * `MANDATE §9` puts every fantasy fact behind the Stats layer, and this obeys it
 * literally: the input is a {@link WeekRecord} that `lib/stats/week.ts` already
 * built, already attributed to permanent manager identity, and already filtered
 * to publishable games. Nothing here reads a matchup row, recomputes a winner, or
 * decides what a score meant. It compares integers that Stats handed it and
 * multiplies nothing.
 *
 * That is why it is pure and separate from the service beside it. The service has
 * a database, a clock and a transaction; this has the rules. A rule you can read
 * without a database is a rule the commissioner can check.
 *
 * ## The two reasons, and why only two
 *
 * `03 §4` lists the token sources. Exactly two of them are derivable from one
 * finalized week without inventing anything:
 *
 *   - **matchup win** — 150. Stored `winner_roster_id`, nothing inferred.
 *   - **weekly high score** — 400. The maximum of the week's stored team scores.
 *
 * The others in that list are deliberately absent. "Special fantasy
 * accomplishment" is explicitly *commissioner-configured* and has no mechanism;
 * "championship and season awards" happen at season close, not weekly. Upsets,
 * playoff advancement and consolation placings are **not in `03 §4` at all** —
 * the schema would accept them and that is not a reason to pay them.
 *
 * ## Week type is not a modifier
 *
 * `03 §4` names one price for a matchup win and does not qualify it by week type,
 * so a playoff win and a consolation win each pay 150 and the code contains no
 * branch on `weekType`. Introducing a multiplier would be inventing a reward
 * rule, which is a product decision rather than an implementation one.
 *
 * A **bye** needs no handling either, and that is a property of the data rather
 * than a case that was considered: `fantasy_matchups` stores only *paired* games
 * (`CHECK roster_a_id <> roster_b_id`), so a manager with no game that week never
 * appears in the record and cannot be awarded. The test asserts it stays true.
 */

/** Why one award was paid. Mirrors the `weekly_reward_reason` enum. */
export type WeeklyRewardReason = 'MATCHUP_WIN' | 'WEEKLY_HIGH_SCORE';

/** One manager, one reason, one amount — everything a payment needs. */
export interface WeeklyAward {
  readonly managerId: string;
  readonly displayName: string;
  readonly rosterId: number;
  readonly reason: WeeklyRewardReason;
  readonly amount: number;
  /** What they scored. The number that won a high score; context on a win. */
  readonly pointsCents: number;
  /** `2025-w14-m3` — the game this came out of. */
  readonly gameKey: string;
}

/** The prices this needs. A subset of `EconomyValues`, so a test can supply two. */
export interface RewardPrices {
  readonly matchupWinTokens: number;
  readonly weeklyHighScoreTokens: number;
}

/**
 * Every award a week pays, in a stable order.
 *
 * ## Ties
 *
 * A **tied game** pays no win to anybody. `WeekGame.tie` is a stored result and
 * `03 §4` prices a *win*; paying both sides for not winning would be inventing a
 * category, and paying neither is what the word means.
 *
 * A **tied high score** pays every manager who posted it, in full. `03 §4` gives
 * one number and no rule for splitting it, and the two alternatives are both
 * worse: halving it invents a rounding question the spec never answers, and
 * paying nobody punishes the week's best score for being matched. Exact-cent ties
 * are vanishingly rare — this exists so that when one happens the answer is
 * already decided rather than improvised on a Tuesday.
 *
 * ## Order
 *
 * Sorted by reason, then roster. Nothing downstream depends on the order — each
 * award carries its own idempotency key — but a deterministic list makes a report
 * diffable and a test able to assert on the whole thing rather than on a set.
 */
export function deriveWeeklyAwards(input: {
  readonly week: WeekRecord;
  readonly prices: RewardPrices;
}): readonly WeeklyAward[] {
  const awards: WeeklyAward[] = [];

  /*
   * Both sides of every game, flattened once.
   *
   * `WeekRecord.games` is the publishable set — `publishableWeek` has already
   * dropped disputed games and games whose rosters resolve to nobody — so a
   * manager appearing here is a manager who may be paid. There is no second
   * eligibility check in this file, deliberately: `lib/stats/week.ts` warns that
   * a boundary applied twice is a boundary nobody owns.
   */
  const teams = input.week.games.flatMap((game) =>
    [game.a, game.b]
      .filter((team) => team.managerId !== null && team.displayName !== null)
      .map((team) => ({
        managerId: team.managerId as string,
        displayName: team.displayName as string,
        rosterId: team.rosterId,
        pointsCents: team.pointsCents,
        gameKey: game.key,
        won: game.tie ? null : game.winner?.rosterId === team.rosterId,
      })),
  );

  for (const team of teams) {
    if (team.won !== true) continue;
    awards.push({
      managerId: team.managerId,
      displayName: team.displayName,
      rosterId: team.rosterId,
      reason: 'MATCHUP_WIN',
      amount: input.prices.matchupWinTokens,
      pointsCents: team.pointsCents,
      gameKey: team.gameKey,
    });
  }

  /*
   * The high score.
   *
   * `Math.max` over an empty list is `-Infinity`, which would then match nothing
   * — correct by accident. The explicit length check makes it correct on purpose,
   * because "a week with no publishable games pays nothing" is a rule rather than
   * a floating-point coincidence.
   */
  if (teams.length > 0) {
    const best = Math.max(...teams.map((team) => team.pointsCents));
    for (const team of teams) {
      if (team.pointsCents !== best) continue;
      awards.push({
        managerId: team.managerId,
        displayName: team.displayName,
        rosterId: team.rosterId,
        reason: 'WEEKLY_HIGH_SCORE',
        amount: input.prices.weeklyHighScoreTokens,
        pointsCents: team.pointsCents,
        gameKey: team.gameKey,
      });
    }
  }

  return awards.sort(
    (x, y) => x.reason.localeCompare(y.reason) || x.rosterId - y.rosterId,
  );
}

/**
 * The name this award is filed under, forever.
 *
 * Derived from the occasion rather than from the run, which is the whole point:
 * a retried Tuesday, a manual re-run and two concurrent crons all produce the
 * same string, and `token_transactions.idempotency_key UNIQUE` turns the second
 * one into a no-op.
 *
 * The **amount is not in the key**, and that is load-bearing. If the economy is
 * rebalanced between two runs of the same week, `apply_token_delta` finds the key
 * already recording a different delta and raises — which is the correct outcome:
 * a week that has already been paid must not be quietly re-priced. Putting the
 * amount in the key would instead pay the manager twice, at two prices, and both
 * rows would look legitimate.
 */
export function rewardIdempotencyKey(input: {
  readonly season: number;
  readonly week: number;
  readonly managerId: string;
  readonly reason: WeeklyRewardReason;
}): string {
  return `weekly-reward:${String(input.season)}:${String(input.week)}:${input.managerId}:${input.reason}`;
}

/**
 * What the receipt says. Curated template, never generated.
 *
 * `03 §5` requires a human-readable description on every ledger row and
 * `MANDATE` limits generative text to the Slice, so this is a template with two
 * holes in it. It is a **rendering of** the reward, not the reward: the row in
 * `weekly_rewards` carries the facts, and `0013`'s header records why this string
 * is never the thing anybody audits.
 */
export function rewardDescription(input: {
  readonly week: number;
  readonly reason: WeeklyRewardReason;
}): string {
  return input.reason === 'MATCHUP_WIN'
    ? `Won in week ${String(input.week)}.`
    : `Best score in the league, week ${String(input.week)}.`;
}
