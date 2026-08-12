/**
 * The slots model, and its exact probability space.
 *
 * **Analysis only.** Nothing spins through this module — no database, no route,
 * no action. It exists so R6's *"prefer exact probability enumeration"* can be
 * satisfied before a line of product code is written.
 *
 * ## The shape, from the approved direction
 *
 * Three reels · one payline · six symbols · fixed wager buttons · no progressive
 * jackpot (R7) · roughly 85% RTP (R6). One **strip**, used on all three reels,
 * so the outcome space is `6³ = 216` combinations and every figure below is a
 * closed-form sum rather than an estimate. There is no Monte Carlo here and
 * there should never be one: a game with 216 outcomes that reports a *sampled*
 * return rate is measuring its own random number generator.
 *
 * ## Two rules that are product decisions, not maths
 *
 *   1. **A winning combination never pays less than the stake.** A "win" that
 *      returns half your wager is a loss wearing a win's animation, and `16 §8`'s
 *      explicit non-goals already refuse near-miss and loss-chasing mechanics.
 *      The lowest tier here returns exactly the stake and is called what it is —
 *      *money back* — rather than being counted as a win.
 *   2. **Rarer must pay more.** A paytable in which a common symbol's triple
 *      out-pays a rare one is incoherent to a player looking at the machine, and
 *      {@link auditPaytable} fails it rather than leaving it to review.
 */

/** The six, as placeholders. **No art is briefed and no final names are set.** */
export const SYMBOLS = ['crust', 'pepperoni', 'mushroom', 'olive', 'slice', 'tony'] as const;
export type Symbol = (typeof SYMBOLS)[number];

/**
 * One reel strip, as a weight per symbol.
 *
 * Integer weights for the same reason `reward_tables` uses them: the spin is an
 * integer roll and the roll is persisted, so a float would make the recorded
 * audit trail irreproducible across platforms.
 */
export type Strip = Readonly<Record<Symbol, number>>;

/**
 * What a combination pays, as a multiple of the stake.
 *
 * `pair` is *exactly two* of a symbol on the payline; `triple` is all three.
 * Multipliers are integers, so every payout is a whole number of tokens at every
 * wager button — the same constraint that forces even wagers on a 3:2 blackjack
 * payout, arrived at from the other direction.
 */
export interface Paytable {
  readonly id: string;
  readonly summary: string;
  readonly strip: Strip;
  readonly pair: Readonly<Record<Symbol, number>>;
  readonly triple: Readonly<Record<Symbol, number>>;
  /** The wager buttons this table is offered at. */
  readonly wagers: readonly number[];
  /** The per-spin token ceiling this table is designed against (R7). */
  readonly capTokens: number;
}

export interface OutcomeLine {
  readonly label: string;
  readonly probability: number;
  readonly multiplier: number;
  /** Contribution to RTP: `probability × multiplier`. */
  readonly returned: number;
}

export interface PaytableAnalysis {
  readonly id: string;
  readonly rtp: number;
  /** Any payout at all, including money-back. */
  readonly hitRate: number;
  /** A payout strictly greater than the stake. The honest "win" rate. */
  readonly winRate: number;
  /** Exactly the stake back. */
  readonly moneyBackRate: number;
  readonly lossRate: number;
  readonly topPrize: { readonly label: string; readonly multiplier: number; readonly probability: number };
  /** Standard deviation of the return per unit staked. */
  readonly volatility: number;
  readonly lines: readonly OutcomeLine[];
  /** Expected token loss per spin, by wager button. */
  readonly expectedLossByWager: ReadonlyMap<number, number>;
  /** Largest single payout at each button, in tokens. */
  readonly maxPayoutByWager: ReadonlyMap<number, number>;
  /** Buttons at which the largest payout exceeds `capTokens`. */
  readonly capBreaches: readonly number[];
}

function probabilities(strip: Strip): ReadonlyMap<Symbol, number> {
  const total = SYMBOLS.reduce((sum, s) => sum + strip[s], 0);
  return new Map(SYMBOLS.map((s) => [s, strip[s] / total]));
}

/**
 * Every payline outcome, enumerated.
 *
 * The three-of-a-kind probability is `p³`; *exactly* two is `3·p²·(1−p)` — three
 * positions for the odd reel out, and the odd reel showing anything else. The
 * two are disjoint and their complement is the loss, which is why
 * `hitRate + lossRate` is exactly one and a test can say so.
 */
export function analyse(table: Paytable): PaytableAnalysis {
  const p = probabilities(table.strip);
  const lines: OutcomeLine[] = [];

  let rtp = 0;
  let secondMoment = 0;
  let hit = 0;
  let win = 0;
  let moneyBack = 0;
  let top = { label: 'nothing', multiplier: 0, probability: 0 };

  const record = (label: string, probability: number, multiplier: number): void => {
    if (multiplier <= 0 || probability <= 0) return;
    const returned = probability * multiplier;
    lines.push({ label, probability, multiplier, returned });
    rtp += returned;
    secondMoment += probability * multiplier * multiplier;
    hit += probability;
    if (multiplier > 1) win += probability;
    else moneyBack += probability;
    if (multiplier > top.multiplier) top = { label, multiplier, probability };
  };

  for (const symbol of SYMBOLS) {
    const q = p.get(symbol) ?? 0;
    record(`three ${symbol}`, q * q * q, table.triple[symbol]);
    record(`two ${symbol}`, 3 * q * q * (1 - q), table.pair[symbol]);
  }

  lines.sort((a, b) => b.multiplier - a.multiplier || b.probability - a.probability);

  /*
   * Variance of the *net* result per unit staked. A losing spin returns nothing
   * and costs one, so its contribution is `(0 − 1)² = 1` weighted by the loss
   * rate; a paying spin nets `multiplier − 1`.
   */
  const lossRate = 1 - hit;
  const meanNet = rtp - 1;
  const secondNet = secondMoment - 2 * rtp + hit + lossRate;
  const volatility = Math.sqrt(Math.max(0, secondNet - meanNet * meanNet));

  const expectedLossByWager = new Map<number, number>();
  const maxPayoutByWager = new Map<number, number>();
  const capBreaches: number[] = [];

  for (const wager of table.wagers) {
    expectedLossByWager.set(wager, wager * (1 - rtp));
    const max = top.multiplier * wager;
    maxPayoutByWager.set(wager, max);
    if (max > table.capTokens) capBreaches.push(wager);
  }

  return {
    id: table.id,
    rtp,
    hitRate: hit,
    winRate: win,
    moneyBackRate: moneyBack,
    lossRate,
    topPrize: top,
    volatility,
    lines,
    expectedLossByWager,
    maxPayoutByWager,
    capBreaches,
  };
}

/**
 * The coherence rules a paytable has to satisfy to be offerable.
 *
 * Returns the failures. An empty array is a table that can go in front of the
 * commissioner; anything else is a table that would confuse a player standing at
 * the machine, whatever its return rate says.
 */
export function auditPaytable(table: Paytable): readonly string[] {
  const problems: string[] = [];
  const p = probabilities(table.strip);

  // Rarest first, so "rarer pays more" is an ordering check on this list.
  const byRarity = [...SYMBOLS].sort((a, b) => (p.get(a) ?? 0) - (p.get(b) ?? 0));

  for (let i = 1; i < byRarity.length; i += 1) {
    const rarer = byRarity[i - 1] as Symbol;
    const commoner = byRarity[i] as Symbol;
    if (table.triple[rarer] < table.triple[commoner]) {
      problems.push(
        `three ${rarer} (${table.triple[rarer]}×) pays less than three ${commoner} (${table.triple[commoner]}×), and ${rarer} is rarer`,
      );
    }
    if (table.pair[rarer] < table.pair[commoner]) {
      problems.push(
        `two ${rarer} (${table.pair[rarer]}×) pays less than two ${commoner} (${table.pair[commoner]}×), and ${rarer} is rarer`,
      );
    }
  }

  for (const symbol of SYMBOLS) {
    if (table.pair[symbol] > 0 && table.pair[symbol] >= table.triple[symbol]) {
      problems.push(
        `two ${symbol} (${table.pair[symbol]}×) pays at least as much as three (${table.triple[symbol]}×)`,
      );
    }
    for (const [kind, value] of [
      ['pair', table.pair[symbol]],
      ['triple', table.triple[symbol]],
    ] as const) {
      if (!Number.isInteger(value)) {
        problems.push(`the ${kind} of ${symbol} pays ${String(value)}×, which is not a whole multiple`);
      }
      if (value > 0 && value < 1) {
        problems.push(`the ${kind} of ${symbol} pays back less than the stake, which is a loss dressed as a win`);
      }
    }
  }

  const analysis = analyse(table);

  /*
   * The rarest symbol's triple must be the **unique** largest payout.
   *
   * This is not pedantry about ordering — it is what the phrase "top prize"
   * means. A machine on which the rarest combination ties with two commoner ones
   * has no top prize, and a player who lands it learns nothing they could not
   * have learned more easily. It is also the check that makes the cost of a low
   * per-spin ceiling visible rather than arguable: compress the multiplier range
   * far enough and this is the first thing that breaks.
   */
  const rarest = byRarity[0] as Symbol;
  const ties = SYMBOLS.filter((s) => s !== rarest && table.triple[s] >= table.triple[rarest]);
  if (ties.length > 0) {
    problems.push(
      `three ${rarest} is the rarest combination but does not pay strictly the most — ` +
        `${ties.map((s) => `three ${s}`).join(', ')} ${ties.length === 1 ? 'matches or beats' : 'match or beat'} it, ` +
        'so the machine has no top prize',
    );
  }

  for (const wager of analysis.capBreaches) {
    problems.push(
      `at the ${String(wager)}-token button the top prize pays ${String(analysis.topPrize.multiplier * wager)} tokens, over the ${String(table.capTokens)} cap`,
    );
  }

  return problems;
}
