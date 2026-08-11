import type { Paytable } from './slots-model';

/**
 * The slots candidates, as R6 and R7 asked for — *"candidate paytable(s), not
 * just one unexplained answer."*
 *
 * All three share **one reel strip**, so they differ only in what the
 * combinations pay, at what buttons, under what ceiling. That is deliberate: it
 * makes the comparison a comparison of the *rulings* rather than of three
 * unrelated machines.
 *
 * ## The strip, and why it is skewed
 *
 * `25 · 22 · 19 · 16 · 11 · 7` out of 100. A flat six-symbol strip puts three of
 * a kind at `6 × (1/6)³ = 2.78%` of spins, which is too rare to carry a return
 * rate without enormous multipliers. Skewing concentrates probability and lifts
 * the triple rate to **3.89%**, which is what lets the paytable reach 85% with
 * multipliers a player can read off a card.
 *
 * The skew is also the reason the strip is the same on all three reels: three
 * different strips would let a symbol be common on reel one and rare on reel
 * three, which is how real machines manufacture near misses — and `16 §8` lists
 * near-miss mechanics among the explicit non-goals.
 */
const STRIP = {
  crust: 25,
  pepperoni: 22,
  mushroom: 19,
  olive: 16,
  slice: 11,
  tony: 7,
} as const;

/**
 * **A — what the rulings as written produce.**
 *
 * R5 sets the buttons at 10 / 20 / 40 and R7 caps a single spin at 200 tokens.
 * Those two together mean **no payout may exceed five times the stake**, because
 * `5 × 40 = 200`. Every multiplier in this table is therefore in the range 1–5,
 * and it reaches R6's 85% target — the return rate is not the problem.
 *
 * What it costs is the top prize. With only five integer levels to spend across
 * six symbols *and* a money-back tier, the rarest combination on the machine
 * ties with two commoner ones, and `auditPaytable` refuses it for exactly that.
 * It is included because it is the honest picture of the current rulings, and
 * because *"report alternatives"* is what R7 asks for when the cap makes the
 * table poor.
 */
export const CANDIDATE_A: Paytable = {
  id: 'A · cap 200, buttons 10/20/40',
  summary: 'the rulings exactly as written — a 5× ceiling, and no top prize left',
  strip: STRIP,
  wagers: [10, 20, 40],
  capTokens: 200,
  pair: { crust: 1, pepperoni: 1, mushroom: 2, olive: 2, slice: 3, tony: 4 },
  triple: { crust: 3, pepperoni: 4, mushroom: 4, olive: 5, slice: 5, tony: 5 },
};

/**
 * **B — R5's buttons kept, the ceiling raised to 800.**
 *
 * Keeps 10 / 20 / 40 and asks for the cap instead. A 20× top gives the paytable
 * room to be a paytable: six distinct triple tiers rising 6 → 20, a money-back
 * pair tier on the four common symbols, and a genuine paying pair on the two
 * rare ones.
 *
 * The cost is the absolute ceiling. 800 tokens is **four pizza boxes on one
 * spin**, which is the single-outcome swing the economy simulation has to be
 * asked about rather than argued about.
 */
export const CANDIDATE_B: Paytable = {
  id: 'B · cap 800, buttons 10/20/40',
  summary: "R5's buttons kept; the per-spin ceiling raised to 800 to buy a 20× top prize",
  strip: STRIP,
  wagers: [10, 20, 40],
  capTokens: 800,
  pair: { crust: 1, pepperoni: 1, mushroom: 1, olive: 1, slice: 2, tony: 2 },
  triple: { crust: 6, pepperoni: 9, mushroom: 11, olive: 14, slice: 18, tony: 20 },
};

/**
 * **C — the recommendation. Buttons halved to 5 / 10 / 20, ceiling 400.**
 *
 * The same paytable as B, offered at half the stake. That single change buys
 * back everything the ceiling was costing:
 *
 *   - the top prize is a real 20×, so the rarest symbol pays the most and the
 *     machine has something to chase;
 *   - the largest possible single payout is **400 tokens — two pizza boxes**,
 *     half of B's swing and a ceiling the economy barely notices;
 *   - the *smallest* button drops to 5, which is what makes the top prize's
 *     100-token outcome reachable without committing much;
 *   - slots sits **below** blackjack's 20 / 40 / 80 ladder, which is the right
 *     relationship between the two: slots is the fast, frequent, incidental game
 *     and blackjack is the one you sit down for.
 *
 * It asks the commissioner to move R5's provisional buttons rather than R7's
 * provisional cap, and both rulings explicitly allow that on evidence.
 */
export const CANDIDATE_C: Paytable = {
  id: 'C · cap 400, buttons 5/10/20',
  summary: "the recommendation — B's paytable at half the stake, so the ceiling stops binding",
  strip: STRIP,
  wagers: [5, 10, 20],
  capTokens: 400,
  pair: CANDIDATE_B.pair,
  triple: CANDIDATE_B.triple,
};

export const CANDIDATES: readonly Paytable[] = [CANDIDATE_A, CANDIDATE_B, CANDIDATE_C];

/** The one this investigation recommends. Named so the simulation cannot drift from the report. */
export const RECOMMENDED = CANDIDATE_C;
