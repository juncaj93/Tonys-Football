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

/** The Phase 2 family. **Superseded by the 2026-08-11 rulings**; kept as the record. */
export const PHASE_2_CANDIDATES: readonly Paytable[] = [CANDIDATE_A, CANDIDATE_B, CANDIDATE_C];

/* ======================================================================== *
 * Phase 3 — the approved wager range, and a return rate that has to rise
 * ======================================================================== */

/**
 * The Phase 3 strip, and the one thing that changed about it.
 *
 * `24 · 21 · 18 · 15 · 12 · 10` out of 100, against Phase 2's
 * `25 · 22 · 19 · 16 · 11 · 7`. **Flatter, and only at the rare end.**
 *
 * The reason is criterion 2 — *"still produces memorable wins."* On the Phase 2
 * strip the top prize landed once in **2,915 spins**. A manager playing at the
 * *regular* cadence spins about 510 times a season, so they would meet it once
 * every **5.7 seasons** — a top prize almost nobody in a ten-person league ever
 * sees, which is a top prize in the paytable and not in the product. Raising
 * `tony` from 7 to 10 makes it **1 in 1,000**, or about once every two seasons
 * per regular player. That is rare enough to be an event and common enough to
 * be one that happens.
 *
 * It costs a little of both paying tiers — triples fall from 3.89% of spins to
 * 3.50% and pairs from 45.2% to 43.8% — which is absorbed in the multipliers
 * below rather than compensated for anywhere else.
 */
const STRIP_P3 = {
  crust: 24,
  pepperoni: 21,
  mushroom: 18,
  olive: 15,
  slice: 12,
  tony: 10,
} as const;

/**
 * The pair tier, identical across all three Phase 3 candidates.
 *
 * **It is structurally mandatory, and that is worth stating once.** With the top
 * prize fixed at 20× (Ruling 2), the entire triple tier can return at most
 * `3.50% × 20 = 70.0%` even if *every* three-of-a-kind paid the maximum. So
 * **no paytable can reach 90% — let alone 92% — without a pair tier**, and the
 * pair tier is therefore not a stylistic choice about feel. Ruling 2 and
 * Ruling 3 together determine that this game pays frequent small wins.
 *
 * Given that, the tier is set to pay *more than the stake* on the three rarer
 * symbols rather than paying the stake back on everything. That is the whole of
 * the difference between "you got your money back" 43.8% of the time and a real
 * win **15.8%** of the time, at no cost in return rate — the money simply moves
 * from the flat tier into the tier a manager will actually notice.
 */
const PAIRS_P3 = {
  crust: 1,
  pepperoni: 1,
  mushroom: 1,
  olive: 2,
  slice: 2,
  tony: 2,
} as const;

const P3 = {
  strip: STRIP_P3,
  pair: PAIRS_P3,
  wagers: [5, 10, 20],
  /** Ruling 2: 20× at the 20-token button is exactly 400. */
  capTokens: 400,
} as const;

/**
 * **D — the low end of the approved band, ≈90%.**
 *
 * The most net-negative of the three and therefore the largest sink. Included
 * because Ruling 3 asked for the band rather than a point, and because *"the
 * casino must remain net-negative overall"* is a criterion in its own right —
 * this is the candidate that satisfies it most comfortably.
 */
export const CANDIDATE_D: Paytable = {
  ...P3,
  id: 'D · ≈90%',
  summary: 'the low end of the band — the largest sink, and the smallest mid-tier wins',
  triple: { crust: 7, pepperoni: 10, mushroom: 11, olive: 13, slice: 16, tony: 20 },
};

/**
 * **E — the middle of the approved band, ≈92%. The recommendation.**
 *
 * Ruling 3's stated target, and the candidate the simulation selects. It is the
 * lowest-complexity table of the three in the sense that matters: same strip,
 * same pair tier, six ascending triple values, no special cases, no second
 * mechanic.
 */
export const CANDIDATE_E: Paytable = {
  ...P3,
  id: 'E · ≈92%',
  summary: "Ruling 3's target — the recommendation",
  triple: { crust: 8, pepperoni: 10, mushroom: 11, olive: 13, slice: 17, tony: 20 },
};

/**
 * **F — the high end of the approved band, ≈93%.**
 *
 * The gentlest on the collection loop and the weakest sink. Included so the
 * tradeoff Ruling 3 asked to see has an upper edge: if F protects progression no
 * better than E, then the extra point of return buys nothing and the sink should
 * keep it.
 */
export const CANDIDATE_F: Paytable = {
  ...P3,
  id: 'F · ≈93%',
  summary: 'the high end — the gentlest on the collection loop, and the weakest sink',
  triple: { crust: 8, pepperoni: 10, mushroom: 12, olive: 14, slice: 17, tony: 20 },
};

export const CANDIDATES: readonly Paytable[] = [CANDIDATE_D, CANDIDATE_E, CANDIDATE_F];

/**
 * The one recommended to the commissioner.
 *
 * Named so the simulation and the report cannot drift apart: every scenario run
 * reads this, so changing the recommendation changes the evidence with it.
 */
export const RECOMMENDED = CANDIDATE_E;
