/**
 * The approved blackjack ruleset, as mathematics.
 *
 * **This is an analysis module and nothing plays a hand through it.** No
 * database, no route, no server action, no clock. It exists so the commissioner
 * can see the exact edge of the rules they approved (R2/R4) before any product
 * code is written, which is the checkpoint `NEXT PHASE §C` asks for.
 *
 * ## The rules being modelled, verbatim from R2 and R4
 *
 *   - hit · stand · natural blackjack · bust · dealer draw · push
 *   - **the dealer stands on all 17, including soft 17**
 *   - a natural pays **3:2**; 6:5 is refused
 *   - **no** split, double, surrender or insurance
 *   - one freshly shuffled 52-card deck per hand (`docs/UNDERGROUND_CASINO_INVESTIGATION.md §C`)
 *
 * ## Two models, and why both are needed
 *
 * The shipped game deals from **one 52-card deck**, so the cards a player holds
 * change the odds of the cards still to come. A full composition-dependent
 * enumeration of that is not tractable here — the reachable state space is the
 * deck's own composition, tens of millions of states before the player's hand is
 * even attached — so this module does the honest thing rather than the
 * impressive-sounding one:
 *
 *   1. {@link solveInfiniteDeck} computes the game **exactly**, by full
 *      enumeration, under the infinite-deck (continuous-shuffle) assumption.
 *      Exact means exact: no sampling, no seed, no tolerance. It also produces
 *      the optimal hit/stand table, which is a decision rule rather than an
 *      approximation.
 *   2. {@link playSingleDeck} measures the **shipped** model — one real 52-card
 *      deck — by playing the strategy from (1) many times against a seeded
 *      generator, and reports the standard error alongside the estimate.
 *
 * Reporting both is the point. The difference between them *is* the
 * single-deck correction, measured rather than asserted, and the repository's
 * standing rule (`docs/ECONOMY_SIMULATION.md`, the 2026-08-10 gate ruling) is to
 * assert what can be asserted exactly and to sample only what is genuinely
 * emergent.
 */

/* ------------------------------------------------------------------ cards -- */

/**
 * A rank index.
 *
 * `0` is the ace. `1`–`8` are the two through nine. **`9` is every ten-value
 * card at once** — ten, jack, queen and king are the same card to this game, so
 * collapsing them is not a simplification, it is the correct model, and it is
 * what makes the ten-value rank four times as likely as any other.
 */
export type Rank = number;

export const ACE = 0;
export const TEN = 9;

/** How many of each rank are in one deck. Sixteen tens, four of everything else. */
export const DECK_COUNTS: readonly number[] = [4, 4, 4, 4, 4, 4, 4, 4, 4, 16];

export const CARDS_IN_DECK = DECK_COUNTS.reduce((a, b) => a + b, 0);

/** Infinite-deck probability of each rank. `4/13` for the tens. */
export const INFINITE_DECK: readonly number[] = DECK_COUNTS.map((n) => n / CARDS_IN_DECK);

/** The pip value of a rank, with an ace at eleven. */
export function cardValue(rank: Rank): number {
  if (rank === ACE) return 11;
  if (rank === TEN) return 10;
  return rank + 1;
}

/**
 * A hand, as a total and whether an ace is still counted as eleven.
 *
 * Two numbers are enough because **at most one ace can ever be soft** — a second
 * eleven would be twenty-two on its own. That is why demotion below is a single
 * subtraction rather than a loop, and why a hand needs no card list to be
 * evaluated.
 */
export interface Hand {
  readonly total: number;
  readonly soft: boolean;
}

export const EMPTY_HAND: Hand = { total: 0, soft: false };

export function addCard(hand: Hand, rank: Rank): Hand {
  let total = hand.total + cardValue(rank);
  let soft = hand.soft || rank === ACE;
  if (total > 21 && soft) {
    total -= 10;
    soft = false;
  }
  return { total, soft };
}

/** A two-card twenty-one: an ace and a ten-value card, and nothing else. */
export function isNatural(a: Rank, b: Rank): boolean {
  return (a === ACE && b === TEN) || (a === TEN && b === ACE);
}

/* ----------------------------------------------------------------- dealer -- */

/**
 * What the dealer can finish on. `bust` is an outcome, not an absence of one.
 *
 * Indices 0–4 are the totals seventeen through twenty-one; index 5 is bust.
 * An array rather than a map because this is summed over inside the hot loop of
 * the enumeration.
 */
export type DealerDistribution = readonly number[];

const BUST = 5;

/** `17 → 0`, …, `21 → 4`. */
function slotFor(total: number): number {
  return total > 21 ? BUST : total - 17;
}

/**
 * The dealer's final-total distribution from a given hand, under S17.
 *
 * **Stands on all seventeen**, which is R2's approved rule and is the reason
 * there is no soft-seventeen branch here: a soft seventeen is a seventeen.
 */
function dealerFrom(hand: Hand, memo: Map<number, DealerDistribution>): DealerDistribution {
  if (hand.total > 21) {
    const bust = new Array<number>(6).fill(0);
    bust[BUST] = 1;
    return bust;
  }
  if (hand.total >= 17) {
    const stand = new Array<number>(6).fill(0);
    stand[slotFor(hand.total)] = 1;
    return stand;
  }

  const key = hand.total * 2 + (hand.soft ? 1 : 0);
  const cached = memo.get(key);
  if (cached !== undefined) return cached;

  const out = new Array<number>(6).fill(0);
  for (let rank = 0; rank < 10; rank += 1) {
    const p = INFINITE_DECK[rank] ?? 0;
    const sub = dealerFrom(addCard(hand, rank), memo);
    for (let i = 0; i < 6; i += 1) out[i] = (out[i] ?? 0) + p * (sub[i] ?? 0);
  }

  memo.set(key, out);
  return out;
}

/**
 * The dealer's outcome distribution given an up-card, **conditioned on the
 * dealer not holding a natural**, plus the probability that they do.
 *
 * The conditioning is the fiddly part and it is not optional. With an ace or a
 * ten showing the dealer checks, and a natural ends the hand before the player
 * acts — so the hole card the player is playing against is *known not to be* the
 * complement, and the remaining ranks are re-weighted accordingly. Ignoring that
 * would give the dealer too many twenty-ones and overstate the house edge.
 *
 * There is no insurance in this game (R2), so nothing else depends on the peek.
 */
function dealerGivenUpcard(
  up: Rank,
  memo: Map<number, DealerDistribution>,
): { readonly natural: number; readonly distribution: DealerDistribution } {
  const upHand = addCard(EMPTY_HAND, up);

  // Which hole card would make a natural, if any.
  const complement = up === ACE ? TEN : up === TEN ? ACE : -1;
  const naturalChance = complement === -1 ? 0 : (INFINITE_DECK[complement] ?? 0);

  const out = new Array<number>(6).fill(0);
  const remaining = 1 - naturalChance;

  for (let hole = 0; hole < 10; hole += 1) {
    if (hole === complement) continue;
    const p = (INFINITE_DECK[hole] ?? 0) / remaining;
    const sub = dealerFrom(addCard(upHand, hole), memo);
    for (let i = 0; i < 6; i += 1) out[i] = (out[i] ?? 0) + p * (sub[i] ?? 0);
  }

  return { natural: naturalChance, distribution: out };
}

/* ----------------------------------------------------------------- player -- */

/** What a completed hand paid, in units of the wager. */
export interface OutcomeSpread {
  /** A natural, paid at 3:2. */
  readonly natural: number;
  /** An ordinary win, paid even money. */
  readonly win: number;
  readonly push: number;
  /** Lost by being outdrawn. */
  readonly loss: number;
  /** Lost by going over twenty-one. Separated because it is the player's own doing. */
  readonly bust: number;
}

export interface BlackjackSolution {
  /** Expected value per unit wagered. Negative is the house edge. */
  readonly ev: number;
  /** `-ev`, as a percentage, which is how a house edge is normally quoted. */
  readonly houseEdgePercent: number;
  readonly outcomes: OutcomeSpread;
  /** Standard deviation of the per-hand result, in units of the wager. */
  readonly standardDeviation: number;
  /** `true` where the optimal action is to hit. Indexed `[soft][total][upcard]`. */
  readonly hitTable: ReadonlyMap<string, boolean>;
}

/** The key `hitTable` is stored under. Exported so a caller can read the table. */
export function strategyKey(total: number, soft: boolean, up: Rank): string {
  return `${String(total)}:${soft ? 's' : 'h'}:${String(up)}`;
}

/**
 * Solve the approved ruleset exactly, under the infinite-deck assumption.
 *
 * The player's decision at every node is `max(stand, hit)`, computed from the
 * same enumeration — so the strategy is **derived, not supplied**. That matters
 * for the report: an edge quoted against an assumed strategy is really a
 * statement about the assumption, and the number the commissioner needs is the
 * edge against a player who plays the hand as well as it can be played.
 */
export function solveInfiniteDeck(): BlackjackSolution {
  const dealerMemo = new Map<number, DealerDistribution>();
  const byUpcard = Array.from({ length: 10 }, (_, up) => dealerGivenUpcard(up, dealerMemo));

  /** Expected value of standing, per upcard. */
  const standMemo = new Map<string, number>();
  const evStand = (total: number, up: Rank): number => {
    const key = `${String(total)}:${String(up)}`;
    const cached = standMemo.get(key);
    if (cached !== undefined) return cached;

    const dist = byUpcard[up]?.distribution ?? [];
    let ev = 0;
    for (let i = 0; i < 6; i += 1) {
      const p = dist[i] ?? 0;
      if (p === 0) continue;
      if (i === BUST) ev += p;
      else {
        const dealerTotal = 17 + i;
        ev += p * (total > dealerTotal ? 1 : total === dealerTotal ? 0 : -1);
      }
    }
    standMemo.set(key, ev);
    return ev;
  };

  const hitMemo = new Map<string, number>();
  const hitTable = new Map<string, boolean>();

  const evPlay = (hand: Hand, up: Rank): number => {
    if (hand.total > 21) return -1;
    const stand = evStand(hand.total, up);
    if (hand.total === 21) return stand; // Nobody hits twenty-one.

    const key = strategyKey(hand.total, hand.soft, up);
    const cached = hitMemo.get(key);
    const hit =
      cached ??
      (() => {
        let ev = 0;
        for (let rank = 0; rank < 10; rank += 1) {
          ev += (INFINITE_DECK[rank] ?? 0) * evPlay(addCard(hand, rank), up);
        }
        hitMemo.set(key, ev);
        return ev;
      })();

    hitTable.set(key, hit > stand);
    return Math.max(stand, hit);
  };

  /*
   * Warm the strategy table across every reachable decision node before the
   * outcome enumeration runs. `evPlay` records its decision as a side effect,
   * and a node first visited during the outcome pass would be recorded there
   * instead — which works, but leaves the table's completeness depending on the
   * order the enumeration happens to take.
   */
  for (let up = 0; up < 10; up += 1) {
    for (let total = 4; total <= 21; total += 1) {
      evPlay({ total, soft: false }, up);
      if (total >= 12) evPlay({ total, soft: true }, up);
    }
  }

  /* ---- the outcome enumeration ---- */

  let natural = 0;
  let win = 0;
  let push = 0;
  let loss = 0;
  let bust = 0;
  let ev = 0;
  let evSquared = 0;

  const settle = (p: number, payoff: number, kind: keyof OutcomeSpread): void => {
    ev += p * payoff;
    evSquared += p * payoff * payoff;
    if (kind === 'natural') natural += p;
    else if (kind === 'win') win += p;
    else if (kind === 'push') push += p;
    else if (kind === 'loss') loss += p;
    else bust += p;
  };

  /**
   * Play a non-natural hand to its conclusion and settle every branch.
   *
   * The recursion follows the **strategy table**, not `max(stand, hit)` — the
   * table is already optimal, and re-deciding here would let the outcome pass
   * and the strategy pass disagree about what the player did.
   */
  const resolve = (p: number, hand: Hand, up: Rank): void => {
    if (hand.total > 21) {
      settle(p, -1, 'bust');
      return;
    }

    const shouldHit = hand.total < 21 && (hitTable.get(strategyKey(hand.total, hand.soft, up)) ?? false);
    if (shouldHit) {
      for (let rank = 0; rank < 10; rank += 1) {
        resolve(p * (INFINITE_DECK[rank] ?? 0), addCard(hand, rank), up);
      }
      return;
    }

    const dist = byUpcard[up]?.distribution ?? [];
    for (let i = 0; i < 6; i += 1) {
      const q = dist[i] ?? 0;
      if (q === 0) continue;
      if (i === BUST) settle(p * q, 1, 'win');
      else {
        const dealerTotal = 17 + i;
        if (hand.total > dealerTotal) settle(p * q, 1, 'win');
        else if (hand.total === dealerTotal) settle(p * q, 0, 'push');
        else settle(p * q, -1, 'loss');
      }
    }
  };

  for (let c1 = 0; c1 < 10; c1 += 1) {
    for (let c2 = 0; c2 < 10; c2 += 1) {
      for (let up = 0; up < 10; up += 1) {
        const p = (INFINITE_DECK[c1] ?? 0) * (INFINITE_DECK[c2] ?? 0) * (INFINITE_DECK[up] ?? 0);
        if (p === 0) continue;

        const playerNatural = isNatural(c1, c2);
        const dealerNatural = byUpcard[up]?.natural ?? 0;

        if (dealerNatural > 0) {
          // The dealer checked and had it. The player never acts.
          settle(p * dealerNatural, playerNatural ? 0 : -1, playerNatural ? 'push' : 'loss');
        }

        const live = p * (1 - dealerNatural);
        if (live === 0) continue;

        if (playerNatural) {
          settle(live, 1.5, 'natural');
          continue;
        }

        resolve(live, addCard(addCard(EMPTY_HAND, c1), c2), up);
      }
    }
  }

  return {
    ev,
    houseEdgePercent: -ev * 100,
    outcomes: { natural, win, push, loss, bust },
    standardDeviation: Math.sqrt(evSquared - ev * ev),
    hitTable,
  };
}

/* ------------------------------------------------- the shipped model, sampled -- */

export interface SingleDeckMeasurement {
  readonly hands: number;
  readonly ev: number;
  readonly houseEdgePercent: number;
  /** Standard error of `ev`, from the run's own sample. A 4σ band is ±4× this. */
  readonly standardError: number;
  readonly standardDeviation: number;
  readonly outcomes: OutcomeSpread;
}

/**
 * Play the shipped model — one freshly shuffled 52-card deck per hand.
 *
 * Uses the strategy solved above, which is what a real player would bring to the
 * table: nobody recomputes composition-dependent basic strategy from the two
 * cards in front of them. The estimate is therefore of *this game as it will be
 * played*, not of a theoretical optimum nobody reaches.
 *
 * `random` is injected for the same reason `lib/counter/rng.ts` is: a measurement
 * that cannot be reproduced from a seed is a measurement nobody can check.
 */
export function playSingleDeck(
  hands: number,
  random: () => number,
  hitTable: ReadonlyMap<string, boolean>,
): SingleDeckMeasurement {
  const counts = new Array<number>(10);
  let remaining = 0;

  const shuffle = (): void => {
    for (let i = 0; i < 10; i += 1) counts[i] = DECK_COUNTS[i] ?? 0;
    remaining = CARDS_IN_DECK;
  };

  /** Draw without replacement from the count vector. No array to shuffle. */
  const draw = (): Rank => {
    let pick = Math.floor(random() * remaining);
    for (let rank = 0; rank < 10; rank += 1) {
      const n = counts[rank] ?? 0;
      if (pick < n) {
        counts[rank] = n - 1;
        remaining -= 1;
        return rank;
      }
      pick -= n;
    }
    // Unreachable while `remaining` and `counts` agree; a loud failure beats a
    // silently biased draw.
    throw new Error('the deck disagreed with its own card count');
  };

  let total = 0;
  let squared = 0;
  let natural = 0;
  let win = 0;
  let push = 0;
  let loss = 0;
  let bust = 0;

  for (let n = 0; n < hands; n += 1) {
    shuffle();
    const p1 = draw();
    const up = draw();
    const p2 = draw();
    const hole = draw();

    const playerNatural = isNatural(p1, p2);
    const dealerNatural = isNatural(up, hole);

    let payoff: number;
    let kind: keyof OutcomeSpread;

    if (dealerNatural) {
      payoff = playerNatural ? 0 : -1;
      kind = playerNatural ? 'push' : 'loss';
    } else if (playerNatural) {
      payoff = 1.5;
      kind = 'natural';
    } else {
      let player = addCard(addCard(EMPTY_HAND, p1), p2);
      while (
        player.total < 21 &&
        (hitTable.get(strategyKey(player.total, player.soft, up)) ?? false)
      ) {
        player = addCard(player, draw());
        if (player.total > 21) break;
      }

      if (player.total > 21) {
        payoff = -1;
        kind = 'bust';
      } else {
        let dealer = addCard(addCard(EMPTY_HAND, up), hole);
        while (dealer.total < 17) dealer = addCard(dealer, draw());

        if (dealer.total > 21 || player.total > dealer.total) {
          payoff = 1;
          kind = 'win';
        } else if (player.total === dealer.total) {
          payoff = 0;
          kind = 'push';
        } else {
          payoff = -1;
          kind = 'loss';
        }
      }
    }

    total += payoff;
    squared += payoff * payoff;
    if (kind === 'natural') natural += 1;
    else if (kind === 'win') win += 1;
    else if (kind === 'push') push += 1;
    else if (kind === 'loss') loss += 1;
    else bust += 1;
  }

  const ev = total / hands;
  const variance = squared / hands - ev * ev;
  const sd = Math.sqrt(Math.max(0, variance));

  return {
    hands,
    ev,
    houseEdgePercent: -ev * 100,
    standardError: sd / Math.sqrt(hands),
    standardDeviation: sd,
    outcomes: {
      natural: natural / hands,
      win: win / hands,
      push: push / hands,
      loss: loss / hands,
      bust: bust / hands,
    },
  };
}

/**
 * Exact single-deck probability that a two-card hand is a natural.
 *
 * `2 × (4/52) × (16/51)`. Stated separately because it is the one place the
 * single deck differs from the infinite deck for an *unambiguous* reason — a
 * player who draws an ace has taken one of four, not one of thirteen — and it is
 * the mechanism behind most of the difference between the two models.
 */
export const SINGLE_DECK_NATURAL = (2 * 4 * 16) / (52 * 51);

/** The same probability under the infinite deck: `2 × (1/13) × (4/13)`. */
export const INFINITE_DECK_NATURAL = 2 * (1 / 13) * (4 / 13);
