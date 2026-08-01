/**
 * When a week's result is allowed to settle something.
 *
 * ## Why this is one named function rather than a boolean passed around
 *
 * Two systems ask *"is this result final"* — the Slice, which will not print an
 * unfinalized week, and weekly stakes, which will not **pay** on one. The second
 * is the expensive question: a stake settled from a number that later moves has
 * moved tokens on a fact that stopped being true, and `16 §5.1`'s guard against
 * quiet history rewriting is undone from a direction nobody was watching.
 *
 * So the predicate lives in one place, with one definition, in the layer that
 * owns results.
 *
 * ## Two sources, and they are not interchangeable
 *
 * - **A week finalization** (`week_finalizations`) — what the Tuesday job
 *   (`16 §4.3`) writes. Per week, during a live season, append-only.
 * - **A closed season** (`seasons.finalized_at`) — the January close. Every week
 *   of a finalized season is final by construction.
 *
 * A stored resolution records **which one it used**, because *"which of these
 * did we trust"* is the first question anybody asks about a settlement they
 * disagree with.
 *
 * ## Why the first source had to exist
 *
 * The original version of this file had only the second, and stated the
 * consequence honestly: *"during a live season nothing finalizes until the
 * season does."* What it did not notice is that the consequence is not merely
 * slow — it is **impossible**. `apply_token_delta` refuses a finalized season
 * (`03 §6` closes the books), so a stake became settleable at exactly the moment
 * it became unpayable. A database test found it: every payout raised.
 *
 * Neither rule was relaxed. They are about different things, and `16 §4.3`
 * already allowed exactly the job that draws the line between them.
 *
 * ## What is still not inferred
 *
 * *"A later week has games, so this one must be done"* remains the fabrication
 * `16 §12` forbids — an inference dressed as a stored fact, wrong in precisely
 * the case that matters: a stat correction arriving after the next week kicked
 * off. Finality is written down or it does not exist.
 */

/**
 * Why a week cannot settle anything yet. Never `null` when it can.
 *
 *   - `no-games` — the week was never played, or was never imported
 *   - `not-finalized` — the games exist and nothing has closed them
 */
export type NotFinalReason = 'no-games' | 'not-finalized';

/** Which record made it final. Stored on a resolution. */
export type FinalitySource = 'finalized_week' | 'season_closed';

export interface Finality {
  readonly final: boolean;
  readonly reason: NotFinalReason | null;
  readonly source: FinalitySource | null;
}

/**
 * Is this week's result settled?
 *
 * Takes the three facts rather than a database handle, so every caller passes the
 * same three things and a test can construct every answer. `hasGames` is *"were
 * any paired games stored for this week"* — a week with no games is not an early
 * week, it is a week nothing happened in.
 *
 * The week's own finalization is preferred over the season's when both exist,
 * because it is the narrower and earlier claim: it says *this week* was closed on
 * a Tuesday, which is more information than *the season closed in January*.
 */
export function weekFinality(input: {
  readonly seasonFinalizedAt: Date | null;
  readonly weekFinalizedAt: Date | null;
  readonly hasGames: boolean;
}): Finality {
  if (!input.hasGames) return { final: false, reason: 'no-games', source: null };
  if (input.weekFinalizedAt !== null) {
    return { final: true, reason: null, source: 'finalized_week' };
  }
  if (input.seasonFinalizedAt !== null) {
    return { final: true, reason: null, source: 'season_closed' };
  }
  return { final: false, reason: 'not-finalized', source: null };
}
