import { afterEach, describe, expect, it } from 'vitest';

import { clearRandomSource, setRandomSource } from '@/lib/counter/rng';

import {
  blackjackPayout,
  cardLabel,
  dealBlackjack,
  handValue,
  hit,
  isBlackjack,
  settleBlackjack,
  slotMultiplier,
  spinSlots,
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
    expect(slotMultiplier({ reels: ['PIZZA', 'PIZZA', 'TONY'] })).toBe(2);
    expect(slotMultiplier({ reels: ['PIZZA', 'FREDDY', 'TONY'] })).toBe(0);

    setRandomSource(() => 0);
    expect(spinSlots().reels).toEqual(['BAPPLE', 'BAPPLE', 'BAPPLE']);
  });
});
