import type { OutcomeSpread } from '@/lib/casino/blackjack-model';
import { analyse, type Paytable } from '@/lib/casino/slots-model';

/**
 * How a manager plays the casino, as a scenario the economy simulation can run.
 *
 * **Opt-in, and that is the load-bearing property.** `NEXT PHASE §B`: *"existing
 * approved economy evidence without casino must remain unchanged."* So
 * {@link CasinoPolicy} is an optional field on the simulation's input, every
 * casino draw comes from a **separate generator**, and with the field absent not
 * one call into the existing random stream moves. The baseline is preserved by
 * construction rather than by care, and `simulate.test.ts` asserts it against a
 * recorded fingerprint.
 *
 * ## The cadences are an assumption, and they are stated in one place
 *
 * Nothing in the product observes how often anybody gambles, because nobody has
 * yet. {@link CADENCE} is this file's assumption about what *casual*, *regular*
 * and *heavy* mean, and it lives in one object so a reviewer can disagree with
 * it in one place — exactly the role `PROFILES` plays for football in
 * `simulate.ts`. **Do not tune it to make a scenario pass.**
 */

export type CasinoArchetype = 'none' | 'casual' | 'regular' | 'heavy';

export const CASINO_ARCHETYPES: readonly CasinoArchetype[] = ['none', 'casual', 'regular', 'heavy'];

/**
 * Plays per week, per archetype.
 *
 * A "play" is one blackjack hand or one slots spin. The numbers are deliberately
 * blunt and deliberately wide apart:
 *
 *   - **none** — never goes down the stairs. A first-class case: the Underground
 *     is optional and a simulation that assumed everybody plays would be
 *     measuring a product nobody was promised.
 *   - **casual** — one short sitting a week, the length of waiting for a pizza.
 *   - **regular** — a sitting after the Sunday games and another on Tuesday.
 *   - **heavy** — the manager who opens the app to gamble. 150 plays a week is
 *     about twenty minutes a day at a five-second spin, which is roughly the
 *     ceiling a human sustains for a season without it being a job.
 */
export const CADENCE: Readonly<Record<CasinoArchetype, number>> = {
  none: 0,
  casual: 8,
  regular: 40,
  heavy: 150,
};

/**
 * The share of plays that are slots rather than blackjack.
 *
 * Slots is one tap and blackjack is a hand you sit through, so a mixed session
 * is mostly spins. Stated rather than derived; it is an assumption like the
 * cadences.
 */
export const SLOT_SHARE = 0.75;

/** One game, reduced to what the economy cares about: stake in, tokens back. */
export interface CasinoGame {
  readonly name: string;
  readonly wager: number;
  /** Tokens returned. `0` lost the stake; `wager` is a push; more is a win. */
  readonly play: (random: () => number) => number;
}

export interface CasinoPolicy {
  /** Archetype per manager, index-aligned with the simulated league. */
  readonly archetypes: readonly CasinoArchetype[];
  readonly slots: CasinoGame;
  readonly blackjack: CasinoGame;
  readonly slotShare: number;
  /**
   * Tokens a manager refuses to gamble.
   *
   * **Zero by default, and that is the conservative choice.** A manager who
   * holds back the price of a box before playing is strictly less exposed than
   * one who does not, so a reserve of nothing measures the worst case for the
   * question *"can the casino starve a collection"* — which is the question
   * `NEXT PHASE §B` asks. It is a field rather than a constant so the
   * sensitivity can be run rather than argued.
   */
  readonly reserveTokens: number;
  /** Seeds the casino's own generator. Never the simulation's. */
  readonly seed: number;
}

/**
 * A slots game drawn from a paytable's exact enumeration.
 *
 * The cumulative walk is over the **same lines** `analyse()` produces, so the
 * simulated machine and the reported paytable cannot drift apart — there is one
 * distribution and both read it.
 */
export function slotsGame(table: Paytable, wager: number): CasinoGame {
  if (!table.wagers.includes(wager)) {
    throw new Error(`${table.id} does not offer a ${String(wager)}-token button`);
  }

  const analysis = analyse(table);
  const cumulative: { threshold: number; multiplier: number }[] = [];
  let running = 0;
  for (const line of analysis.lines) {
    running += line.probability;
    cumulative.push({ threshold: running, multiplier: line.multiplier });
  }

  return {
    name: `slots ${table.id}`,
    wager,
    play: (random) => {
      const roll = random();
      for (const step of cumulative) {
        if (roll < step.threshold) return step.multiplier * wager;
      }
      return 0;
    },
  };
}

/**
 * A blackjack game drawn from a measured outcome spread.
 *
 * Hands are modelled as independent, which is true of the shipped game in a way
 * it is not true of a real casino: `docs/UNDERGROUND_CASINO_INVESTIGATION.md §C`
 * shuffles a fresh deck for every hand, so there is no shoe to carry information
 * from one hand to the next and nothing to count.
 *
 * A natural returns two and a half times the stake — the stake plus 3:2 (R4).
 */
export function blackjackGame(outcomes: OutcomeSpread, wager: number): CasinoGame {
  if (wager % 2 !== 0) {
    throw new Error(
      `a ${String(wager)}-token blackjack wager cannot pay 3:2 in whole tokens; R4 requires even wagers`,
    );
  }

  const steps: { threshold: number; returned: number }[] = [];
  let running = 0;
  for (const [probability, multiple] of [
    [outcomes.natural, 2.5],
    [outcomes.win, 2],
    [outcomes.push, 1],
    [outcomes.loss, 0],
    [outcomes.bust, 0],
  ] as const) {
    running += probability;
    steps.push({ threshold: running, returned: multiple * wager });
  }

  return {
    name: 'blackjack',
    wager,
    play: (random) => {
      const roll = random();
      for (const step of steps) {
        if (roll < step.threshold) return step.returned;
      }
      return 0;
    },
  };
}

export interface WeekOfPlay {
  readonly plays: number;
  readonly wagered: number;
  readonly returned: number;
}

/**
 * One manager's casino week.
 *
 * Returns what moved rather than mutating a balance, so the caller keeps the one
 * place tokens are added and subtracted. A play is skipped — not shrunk, not
 * deferred — when the tab cannot cover the stake above the reserve, which is
 * what the product's own overdraft `CHECK` does to a wager it refuses.
 */
export function playWeek(
  policy: CasinoPolicy,
  archetype: CasinoArchetype,
  startingBalance: number,
  random: () => number,
): WeekOfPlay {
  const attempts = CADENCE[archetype];
  if (attempts === 0) return { plays: 0, wagered: 0, returned: 0 };

  let balance = startingBalance;
  let plays = 0;
  let wagered = 0;
  let returned = 0;

  for (let i = 0; i < attempts; i += 1) {
    const game = random() < policy.slotShare ? policy.slots : policy.blackjack;
    if (balance - game.wager < policy.reserveTokens) continue;

    balance -= game.wager;
    wagered += game.wager;
    plays += 1;

    const paid = game.play(random);
    balance += paid;
    returned += paid;
  }

  return { plays, wagered, returned };
}

/**
 * A league's archetypes, laid out so a ten-seat league holds one of each extreme.
 *
 * `simulate.ts` assigns football profiles by index — manager 0 is the best
 * manager, manager 1 the worst — so the casino roster is built against those
 * same indices deliberately. Putting the heavy gambler **on the best manager**
 * is the arrangement that answers `NEXT PHASE §B`'s *"whether strong fantasy
 * managers compound casino advantage"*: it is the pairing where compounding, if
 * it exists at all, is loudest.
 */
export function defaultRoster(managers: number): readonly CasinoArchetype[] {
  const roster: CasinoArchetype[] = [];
  for (let i = 0; i < managers; i += 1) {
    if (i === 0) roster.push('heavy');
    else if (i === 1) roster.push('regular');
    else if (i % 3 === 0) roster.push('none');
    else if (i % 3 === 1) roster.push('casual');
    else roster.push('regular');
  }
  return roster;
}

/** Every manager plays the same way. Used for the per-archetype runs. */
export function uniformRoster(managers: number, archetype: CasinoArchetype): readonly CasinoArchetype[] {
  return Array.from({ length: managers }, () => archetype);
}
