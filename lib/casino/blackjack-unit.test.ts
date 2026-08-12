import { describe, expect, it } from 'vitest';

import { clearRandomSource, setRandomSource } from '@/lib/counter/rng';

import { EMPTY_HAND, addCard } from './blackjack-model';
import { SHIPPED_RULES, auditRules, payoutFor, rulesVersion } from './blackjack-rules';
import { compare, runDealer } from './blackjack';
import { shuffledDeck } from './shuffle';
import {
  CARDS_IN_DECK,
  RANKS,
  SUITS,
  isNaturalHand,
  isRed,
  modelRank,
  rankOf,
  suitOf,
  totalOf,
  type Card,
} from './cards';

/**
 * The parts of blackjack that need no database.
 *
 * The rules, the deck, the payout arithmetic and — most importantly — the
 * **bridge** between the shipped game and the model the approved 2.03% house
 * edge was measured on. If that bridge is ever cut, the measured edge stops
 * being a statement about this game, and this file is what notices.
 */

const card = (rank: number, suit = 0): Card => suit * 13 + rank;

describe('the deck', () => {
  it('is fifty-two distinct cards, every rank in every suit', () => {
    const seen = new Set<string>();
    for (let c = 0; c < CARDS_IN_DECK; c += 1) seen.add(`${rankOf(c)}${suitOf(c)}`);
    expect(seen.size).toBe(52);
    expect(RANKS).toHaveLength(13);
    expect(SUITS).toHaveLength(4);
  });

  it('prints hearts and diamonds red, spades and clubs dark', () => {
    for (let c = 0; c < CARDS_IN_DECK; c += 1) {
      const suit = suitOf(c);
      expect(isRed(c)).toBe(suit === 'H' || suit === 'D');
    }
  });

  it('shuffles a permutation, never a subset', () => {
    setRandomSource((max) => max - 1);
    try {
      const deck = shuffledDeck();
      expect(deck).toHaveLength(CARDS_IN_DECK);
      expect(new Set(deck).size).toBe(CARDS_IN_DECK);
      expect([...deck].sort((a, b) => a - b)).toEqual(
        Array.from({ length: CARDS_IN_DECK }, (_, i) => i),
      );
    } finally {
      clearRandomSource();
    }
  });

  it('refuses anything that is not a card', () => {
    expect(() => modelRank(52)).toThrow(RangeError);
    expect(() => modelRank(-1)).toThrow(RangeError);
    expect(() => modelRank(1.5)).toThrow(RangeError);
  });
});

/**
 * The one bridge between the shipped game and the mathematics it was approved
 * on.
 *
 * `blackjack-model.ts` collapses every ten-value card into one rank, because
 * that is the model the exact solve and the 20-million-hand measurement ran on.
 * The product deals 0–51 so a player can see a queen. `modelRank` is the only
 * thing joining them, and every total in the shipped game is computed through
 * it — so the measured 2.03% is a fact about *this* game and not about a second
 * implementation that happens to agree.
 */
describe('the bridge to the measured model', () => {
  it('maps every one of the fifty-two onto the rank the model uses', () => {
    for (let c = 0; c < CARDS_IN_DECK; c += 1) {
      const rank = c % 13;
      const expected = rank === 0 ? 0 : rank >= 9 ? 9 : rank;
      expect(modelRank(c), `card ${String(c)} (${rankOf(c)})`).toBe(expected);
    }
  });

  it('makes a ten-value card four times as likely as any other rank', () => {
    const counts = new Map<number, number>();
    for (let c = 0; c < CARDS_IN_DECK; c += 1) {
      const r = modelRank(c);
      counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    expect(counts.get(9)).toBe(16);
    for (const rank of [0, 1, 2, 3, 4, 5, 6, 7, 8]) expect(counts.get(rank)).toBe(4);
  });

  it('totals a hand exactly as the model does', () => {
    // A, A, 9 is twenty-one — one ace soft, one hard. The classic demotion case.
    expect(totalOf([card(0), card(0, 1), card(8)]).total).toBe(21);
    // A, 10 is a soft twenty-one.
    expect(totalOf([card(0), card(9)])).toEqual({ total: 21, soft: true });
    // Face cards are all ten.
    for (const rank of [9, 10, 11, 12]) {
      expect(totalOf([card(rank), card(rank, 1)]).total).toBe(20);
    }
    // And it agrees with the model applied directly.
    const cards = [card(0), card(5), card(12)];
    const viaModel = cards.reduce((h, c) => addCard(h, modelRank(c)), EMPTY_HAND);
    expect(totalOf(cards)).toEqual(viaModel);
  });

  it('recognises a natural only on exactly two cards', () => {
    expect(isNaturalHand([card(0), card(9)])).toBe(true);
    expect(isNaturalHand([card(12), card(0, 2)])).toBe(true);
    expect(isNaturalHand([card(0), card(8)])).toBe(false);
    // Twenty-one on three cards is twenty-one, not a natural.
    expect(isNaturalHand([card(9), card(5), card(4)])).toBe(false);
  });
});

describe('the dealer', () => {
  const deck = Array.from({ length: CARDS_IN_DECK }, (_, i) => i);

  it('stands on all seventeen, hard or soft', () => {
    // Soft 17: A + 6. The approved rule is that the dealer stands.
    const soft = runDealer([card(0), card(5)], deck, 4, SHIPPED_RULES);
    expect(soft.cards).toHaveLength(2);
    expect(totalOf(soft.cards).total).toBe(17);

    // Hard 17: 10 + 7.
    const hard = runDealer([card(9), card(6)], deck, 4, SHIPPED_RULES);
    expect(hard.cards).toHaveLength(2);
  });

  it('draws below seventeen and stops at the first total that reaches it', () => {
    // 2 + 2 = 4, and the deck from position 0 is A,2,3,4,… so it draws until 17+.
    const drawn = runDealer([card(1), card(1, 1)], deck, 0, SHIPPED_RULES);
    expect(totalOf(drawn.cards).total).toBeGreaterThanOrEqual(17);
    expect(drawn.position).toBeGreaterThan(0);
  });

  it('advances the deck position by exactly the cards it took', () => {
    const before = 4;
    const drawn = runDealer([card(1), card(1, 1)], deck, before, SHIPPED_RULES);
    expect(drawn.position - before).toBe(drawn.cards.length - 2);
  });
});

describe('comparing a standing hand', () => {
  it('wins when the dealer busts, whatever the player holds', () => {
    expect(compare(12, 22)).toBe('win');
    expect(compare(21, 30)).toBe('win');
  });

  it('reads the higher total as the winner and equality as a push', () => {
    expect(compare(20, 19)).toBe('win');
    expect(compare(19, 20)).toBe('loss');
    expect(compare(18, 18)).toBe('push');
  });
});

describe('the payout arithmetic', () => {
  /**
   * Gross, not net: the wager left the tab at the deal, so a win returns it
   * *and* the winnings. R13's two distinct movements make this the only correct
   * reading.
   */
  it('returns the wager and the winnings, at every approved button', () => {
    for (const wager of SHIPPED_RULES.wagers) {
      expect(payoutFor('player_natural', wager)).toBe(wager * 2.5);
      expect(payoutFor('win', wager)).toBe(wager * 2);
      expect(payoutFor('push', wager)).toBe(wager);
      expect(payoutFor('loss', wager)).toBe(0);
      expect(payoutFor('bust', wager)).toBe(0);
      expect(payoutFor('dealer_natural', wager)).toBe(0);
    }
  });

  it('pays every approved wager in whole tokens', () => {
    for (const wager of SHIPPED_RULES.wagers) {
      for (const outcome of ['player_natural', 'win', 'push', 'loss', 'bust'] as const) {
        expect(Number.isInteger(payoutFor(outcome, wager))).toBe(true);
      }
    }
    // 20 / 40 / 80 → naturals of 50 / 100 / 200.
    expect(SHIPPED_RULES.wagers.map((w) => payoutFor('player_natural', w))).toEqual([50, 100, 200]);
  });

  /**
   * The reason the buttons must stay even. Rounding a 3:2 payout is how a casino
   * quietly becomes a 6:5 casino, which the commissioner refused by name — so
   * this raises rather than rounds.
   */
  it('refuses to round a fractional natural', () => {
    expect(() => payoutFor('player_natural', 25)).toThrow(/not whole tokens/);
  });
});

describe('the rules configuration', () => {
  it('accepts the shipped rules', () => {
    expect(auditRules(SHIPPED_RULES)).toEqual([]);
  });

  it('refuses an odd wager, because 3:2 of it is not whole tokens', () => {
    const problems = auditRules({ ...SHIPPED_RULES, wagers: [25] });
    expect(problems.join(' ')).toMatch(/whole tokens/);
  });

  it('refuses 6:5, which the commissioner refused by name', () => {
    const problems = auditRules({
      ...SHIPPED_RULES,
      naturalNumerator: 6,
      naturalDenominator: 5,
    });
    expect(problems.join(' ')).toMatch(/less than 3:2/);
  });

  it('refuses a dealer who does not stand on all seventeen', () => {
    expect(auditRules({ ...SHIPPED_RULES, dealerStandsOn: 18 }).join(' ')).toMatch(
      /stand on all 17/,
    );
  });

  it('hashes the rules, and moves when any of them moves', () => {
    const base = rulesVersion(SHIPPED_RULES);
    expect(base).toBe(rulesVersion(SHIPPED_RULES));
    expect(base).toHaveLength(16);
    expect(rulesVersion({ ...SHIPPED_RULES, wagers: [20, 40] })).not.toBe(base);
    expect(rulesVersion({ ...SHIPPED_RULES, naturalNumerator: 2 })).not.toBe(base);
    expect(rulesVersion({ ...SHIPPED_RULES, dealerStandsOn: 18 })).not.toBe(base);
  });

  /** The approved ladder, pinned so a re-tune is a decision rather than an edit. */
  it('ships the wagers the commissioner approved', () => {
    expect(SHIPPED_RULES.wagers).toEqual([20, 40, 80]);
    expect(SHIPPED_RULES.naturalNumerator / SHIPPED_RULES.naturalDenominator).toBe(1.5);
    expect(SHIPPED_RULES.dealerStandsOn).toBe(17);
  });
});
