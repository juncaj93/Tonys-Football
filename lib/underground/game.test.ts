import { afterEach, describe, expect, it } from 'vitest';

import { clearRandomSource, setRandomSource } from '@/lib/counter/rng';

import {
  blackjackPayout,
  cardLabel,
  dealBlackjack,
  handValue,
  hit,
  expectedSlotMultiplier,
  isBlackjack,
  settleBlackjack,
  slotMultiplier,
  spinSlots,
  rouletteColor,
  rouletteMultiplier,
  spinRoulette,
} from './game';

afterEach(() => clearRandomSource());

describe('Underground game rules', () => {
  it('counts a soft ace down only when a hand would otherwise bust', () => {
    expect(handValue([0, 8])).toBe(20);
    expect(handValue([0, 8, 7])).toBe(18);
    expect(isBlackjack([0, 12])).toBe(true);
    expect(cardLabel(0)).toBe('A');
    expect(cardLabel(12)).toBe('K');
  });

  it('draws a persisted deck one card at a time', () => {
    setRandomSource(() => 0);
    const dealt = dealBlackjack();
    const drawn = hit(dealt);
    expect(drawn.player).toHaveLength(3);
    expect(drawn.deck).toHaveLength(47);
  });

  it('settles a player bust without exposing a fresh dealer draw', () => {
    const state = { deck: [1, 2], player: [9, 9, 9], dealer: [1, 2] };
    expect(settleBlackjack(state)).toEqual({ state, outcome: 'LOSS' });
  });

  it('pays a normal win, a push, and a natural deterministically', () => {
    expect(blackjackPayout(20, 'WIN')).toBe(40);
    expect(blackjackPayout(20, 'PUSH')).toBe(20);
    expect(blackjackPayout(20, 'BLACKJACK')).toBe(50);
    expect(blackjackPayout(20, 'LOSS')).toBe(0);
  });

  it('keeps the slot reel outcome and multiplier separate', () => {
    expect(slotMultiplier({ reels: ['BAPPLE', 'BAPPLE', 'BAPPLE'] })).toBe(12);
    expect(slotMultiplier({ reels: ['PIZZA', 'PIZZA', 'TONY'] })).toBe(1);
    expect(slotMultiplier({ reels: ['PIZZA', 'FREDDY', 'TONY'] })).toBe(0);

    setRandomSource(() => 0);
    expect(spinSlots().reels).toEqual(['BAPPLE', 'BAPPLE', 'BAPPLE']);
  });

  it('keeps slots a bounded sink rather than a token source', () => {
    // Exact expectation from the published reel weights, not a flaky Monte Carlo
    // estimate. A returned pair makes the game lively without minting tokens.
    expect(expectedSlotMultiplier()).toBeCloseTo(0.852125, 8);
    expect(expectedSlotMultiplier()).toBeLessThan(0.9);
  });

  it('uses a single-zero wheel with standard colour and straight-up payouts', () => {
    expect(rouletteColor(0)).toBe('GREEN');
    expect(rouletteColor(1)).toBe('RED');
    expect(rouletteColor(2)).toBe('BLACK');
    expect(rouletteMultiplier({ pocket: 32, color: 'RED', bet: { kind: 'COLOR', color: 'RED' } })).toBe(2);
    expect(rouletteMultiplier({ pocket: 32, color: 'RED', bet: { kind: 'NUMBER', number: 32 } })).toBe(36);
    expect(rouletteMultiplier({ pocket: 32, color: 'RED', bet: { kind: 'NUMBER', number: 31 } })).toBe(0);

    setRandomSource(() => 0);
    expect(spinRoulette({ kind: 'COLOR', color: 'RED' })).toEqual({ pocket: 0, color: 'GREEN', bet: { kind: 'COLOR', color: 'RED' } });
  });
});
