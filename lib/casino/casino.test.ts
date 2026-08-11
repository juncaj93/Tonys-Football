import { describe, expect, it } from 'vitest';

import { CATALOG_SIZE } from '@/lib/counter/catalog';
import { standardRewardTable } from '@/lib/counter/rewards';
import { PROVISIONAL_ECONOMY } from '@/lib/counter/tokens';
import {
  CADENCE,
  blackjackGame,
  playWeek,
  slotsGame,
  uniformRoster,
  type CasinoPolicy,
} from '@/lib/economy/casino-scenario';
import {
  SCORED_WEEKS,
  checkRanges,
  generator,
  salvageFor,
  simulate,
  type SimulationInput,
} from '@/lib/economy/simulate';

import {
  INFINITE_DECK,
  INFINITE_DECK_NATURAL,
  SINGLE_DECK_NATURAL,
  addCard,
  EMPTY_HAND,
  playSingleDeck,
  solveInfiniteDeck,
  strategyKey,
} from './blackjack-model';
import { CANDIDATE_A, CANDIDATE_B, CANDIDATE_C, CANDIDATES, RECOMMENDED } from './candidates';
import { SYMBOLS, analyse, auditPaytable } from './slots-model';

/**
 * The casino analysis, pinned.
 *
 * Nothing here touches a database, a route or an approved economy value —
 * there is no casino in the product yet and this slice does not add one. What
 * these tests protect is the *evidence*: the numbers in
 * `docs/evidence/casino/analysis.md` and `docs/CASINO_BOUNDARY.md` are what the
 * commissioner is being asked to rule on, and a report whose numbers can move
 * without anything going red is not evidence.
 */

/* ------------------------------------------------------- baseline preserved -- */

const BASE: SimulationInput = {
  economy: PROVISIONAL_ECONOMY,
  salvage: salvageFor(PROVISIONAL_ECONOMY.standardBoxPriceTokens),
  grantsPerSeason: 2,
  table: standardRewardTable(),
  seasons: 50,
  managers: 10,
  weeks: SCORED_WEEKS,
  policy: 'specified',
  seed: 20260804,
  catalogSize: CATALOG_SIZE,
};

describe('the approved economy gate is untouched by the casino work', () => {
  /**
   * The figures `docs/ECONOMY_SIMULATION.md` already records, restated here so
   * the casino scenario cannot move them without this going red.
   *
   * This is the whole of `NEXT PHASE §B`'s first requirement — *"existing
   * approved economy evidence without casino must remain unchanged"* — and it is
   * a test rather than a reading because the failure it guards against is
   * silent: a casino draw taken from the shared generator would shift every
   * subsequent football roll and every box outcome, and the gate would still
   * pass, on a different league.
   */
  it('reproduces the recorded release-gate figures exactly', () => {
    const checks = checkRanges(simulate(BASE));
    const measured = (name: string): string =>
      checks.find((c) => c.name.startsWith(name))?.measured ?? 'missing';

    expect(measured('Boxes per manager per season')).toBe('11.0');
    expect(measured('Reward-bearing weeks')).toBe('52.9%');
    expect(measured('Non-weekly reward rate')).toBe('0 rewards');
    expect(measured('Legendary mass, configured')).toBe('2.000%');
    expect(measured('Legendary rate per opening')).toBe('1.98%');
    expect(measured('Legendaries league-wide')).toBe('2.76');

    expect(checks.filter((c) => c.gating).every((c) => c.withinRange)).toBe(true);
  });

  /**
   * The structural half, and the stronger one.
   *
   * A policy in which nobody plays must produce the *identical league* to no
   * policy at all — same boxes, same rolls, same collection, manager by manager
   * and season by season. That can only hold if the casino never draws from the
   * simulation's generator, which is the design and is what this proves.
   */
  it('produces an identical league whether the casino is absent or unplayed', () => {
    const strip = (input: SimulationInput): string =>
      JSON.stringify(
        simulate(input).managers.map((m) => [
          m.profile,
          m.boxesPerSeason,
          m.rewardWeeksPerSeason,
          m.tokensEarned,
          m.tokensSpent,
          m.openings,
          m.legendaries,
          m.duplicates,
          m.salvaged,
          m.owned,
          m.grants,
          m.salvageTokens,
          m.completedInSeason,
        ]),
      );

    const unplayed: CasinoPolicy = {
      archetypes: uniformRoster(BASE.managers, 'none'),
      slots: slotsGame(RECOMMENDED, 10),
      blackjack: blackjackGame(
        { natural: 0.0466, win: 0.3894, push: 0.0845, loss: 0.309, bust: 0.1705 },
        40,
      ),
      slotShare: 0.75,
      reserveTokens: 0,
      seed: 1,
    };

    expect(strip({ ...BASE, casino: unplayed })).toBe(strip(BASE));
  });

  it('leaves the casino counters at zero when no policy is supplied', () => {
    for (const manager of simulate(BASE).managers) {
      expect(manager.casinoArchetype).toBe('none');
      expect(manager.casinoPlays).toBe(0);
      expect(manager.casinoWagered).toBe(0);
      expect(manager.casinoReturned).toBe(0);
    }
  });
});

/* ------------------------------------------------------------------ slots -- */

describe('slots paytables', () => {
  it.each(CANDIDATES)('$id enumerates a complete probability space', (table) => {
    const analysis = analyse(table);
    const total = analysis.lines.reduce((sum, line) => sum + line.probability, 0) + analysis.lossRate;
    // Exact to floating point, not "approximately one": the space is 6³ and
    // every branch is accounted for, so a gap is a missing combination.
    expect(total).toBeCloseTo(1, 12);
    expect(analysis.hitRate + analysis.lossRate).toBeCloseTo(1, 12);
    expect(analysis.moneyBackRate + analysis.winRate).toBeCloseTo(analysis.hitRate, 12);
  });

  /**
   * The return rates, to two decimal places.
   *
   * Deterministic and exactly computable, so they are asserted exactly rather
   * than sampled — the 2026-08-10 gate ruling's own preference: *"assert the
   * configuration exactly and use simulation only for emergent outcomes."*
   */
  it('returns the rates the report quotes', () => {
    expect(analyse(CANDIDATE_A).rtp * 100).toBeCloseTo(85.57, 2);
    expect(analyse(CANDIDATE_B).rtp * 100).toBeCloseTo(85.13, 2);
    expect(analyse(CANDIDATE_C).rtp * 100).toBeCloseTo(85.13, 2);
  });

  it('lands every candidate near R6 target of roughly 85%', () => {
    for (const table of CANDIDATES) {
      expect(analyse(table).rtp).toBeGreaterThan(0.84);
      expect(analyse(table).rtp).toBeLessThan(0.87);
    }
  });

  /**
   * The finding this whole slice turns on, as an assertion.
   *
   * R5's 40-token button and R7's 200-token ceiling together allow no payout
   * above five times the stake, and five integer levels cannot carry six
   * symbols plus a money-back tier. Candidate A is what that produces, and the
   * coherence audit refuses it for the reason a player would: the rarest
   * combination on the machine is not the one that pays most.
   */
  it('refuses candidate A because the cap leaves it with no top prize', () => {
    const problems = auditPaytable(CANDIDATE_A);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(' ')).toContain('no top prize');
  });

  it('accepts the two candidates that give the rarest symbol the largest prize', () => {
    expect(auditPaytable(CANDIDATE_B)).toEqual([]);
    expect(auditPaytable(CANDIDATE_C)).toEqual([]);
    for (const table of [CANDIDATE_B, CANDIDATE_C]) {
      expect(analyse(table).topPrize.label).toBe('three tony');
    }
  });

  it('keeps every payout inside the ceiling the candidate declares', () => {
    for (const table of [CANDIDATE_B, CANDIDATE_C]) {
      expect(analyse(table).capBreaches).toEqual([]);
    }
  });

  /**
   * No combination may return less than the stake.
   *
   * A "win" paying half a wager is a loss wearing a win's animation, and
   * `16 §8` lists near-miss and loss-chasing mechanics among the explicit
   * non-goals. Stated as a property over every symbol of every candidate
   * because it is the rule most likely to be relaxed later to make a return
   * rate come out.
   */
  it('never pays a winning combination less than the stake', () => {
    for (const table of CANDIDATES) {
      for (const symbol of SYMBOLS) {
        for (const pays of [table.pair[symbol], table.triple[symbol]]) {
          expect(Number.isInteger(pays)).toBe(true);
          if (pays > 0) expect(pays).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });
});

/* -------------------------------------------------------------- blackjack -- */

describe('blackjack under the approved rules', () => {
  const solution = solveInfiniteDeck();

  it('is a valid probability distribution over outcomes', () => {
    const { natural, win, push, loss, bust } = solution.outcomes;
    expect(natural + win + push + loss + bust).toBeCloseTo(1, 10);
  });

  it('computes the house edge the report quotes', () => {
    expect(solution.houseEdgePercent).toBeCloseTo(2.5438, 3);
  });

  /**
   * The single deck is measurably better for the player, and the mechanism is
   * the natural.
   *
   * Both figures are closed form — `2·(4/52)·(16/51)` against `2·(1/13)·(4/13)`
   * — so this is arithmetic rather than a measurement, and it is the reason the
   * shipped model cannot be quoted from the infinite-deck solve.
   */
  it('deals more naturals from one deck than from infinitely many', () => {
    expect(SINGLE_DECK_NATURAL).toBeGreaterThan(INFINITE_DECK_NATURAL);
    expect(SINGLE_DECK_NATURAL).toBeCloseTo(0.048265, 6);
    expect(INFINITE_DECK_NATURAL).toBeCloseTo(0.047337, 6);
  });

  it('measures the shipped single-deck model inside its own error band', () => {
    const measured = playSingleDeck(200_000, generator(4242), solution.hitTable);
    // Four sigma of the run's own sample, which is the repository's standing
    // tolerance for a sampled check (`simulate.ts`, LEGENDARY_SIGMA_TOLERANCE).
    expect(Math.abs(measured.ev - -0.0203)).toBeLessThan(4 * measured.standardError + 0.002);
    expect(measured.outcomes.natural).toBeCloseTo(SINGLE_DECK_NATURAL, 2);
  });

  /**
   * Two ends of the strategy table, which are the two nobody should have to
   * think about — and which would silently break the edge if the solve were
   * wrong.
   */
  it('always hits a hand that cannot bust and always stands on hard seventeen', () => {
    for (let up = 0; up < 10; up += 1) {
      expect(solution.hitTable.get(strategyKey(11, false, up))).toBe(true);
      expect(solution.hitTable.get(strategyKey(8, false, up))).toBe(true);
      expect(solution.hitTable.get(strategyKey(17, false, up))).toBe(false);
      expect(solution.hitTable.get(strategyKey(20, false, up))).toBe(false);
    }
  });

  it('treats the ten-value rank as four cards in thirteen', () => {
    expect(INFINITE_DECK[9]).toBeCloseTo(4 / 13, 12);
    expect(INFINITE_DECK.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it('demotes a soft hand exactly once', () => {
    // A, A, 9 is twenty-one, not thirty-one and not eleven.
    const hand = addCard(addCard(addCard(EMPTY_HAND, 0), 0), 8);
    expect(hand.total).toBe(21);
  });
});

/* --------------------------------------------------------- the scenario -- */

describe('the casino scenario', () => {
  /**
   * R4 requires 3:2, and 3:2 of an odd stake is not a whole number of tokens.
   * The refusal is here rather than in a comment because the wager buttons are
   * still provisional and the next person to move them will move them here.
   */
  it('refuses an odd blackjack wager, because 3:2 would not be whole tokens', () => {
    expect(() =>
      blackjackGame({ natural: 0.05, win: 0.39, push: 0.08, loss: 0.31, bust: 0.17 }, 25),
    ).toThrow(/even wagers/);
  });

  it('refuses a slots wager the paytable does not offer as a button', () => {
    expect(() => slotsGame(RECOMMENDED, 40)).toThrow(/does not offer/);
  });

  it('never lets a manager wager below the reserve', () => {
    const policy: CasinoPolicy = {
      archetypes: uniformRoster(1, 'heavy'),
      slots: slotsGame(RECOMMENDED, 10),
      blackjack: blackjackGame(
        { natural: 0.05, win: 0.39, push: 0.08, loss: 0.31, bust: 0.17 },
        40,
      ),
      slotShare: 0.75,
      reserveTokens: 500,
      seed: 3,
    };

    // 505 tokens against a 500 reserve buys nothing at either table.
    expect(playWeek(policy, 'heavy', 505, generator(9))).toEqual({
      plays: 0,
      wagered: 0,
      returned: 0,
    });
  });

  it('plays nothing at all for a manager who does not go down the stairs', () => {
    expect(CADENCE.none).toBe(0);
  });
});
