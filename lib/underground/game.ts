import { rollBelow } from '@/lib/counter/rng';

/**
 * The deterministic part of the Underground.
 *
 * Randomness enters only while a round is created. The dealt deck/reels are
 * persisted by the service, so every later hit, reload, or audit reads this
 * pure module against the exact same state rather than rolling again.
 */

export type Card = number;

export interface BlackjackState {
  readonly deck: readonly Card[];
  readonly player: readonly Card[];
  readonly dealer: readonly Card[];
}

export const SLOT_SYMBOLS = ['BAPPLE', 'PIZZA', 'FREDDY', 'SAUNA', 'TONY'] as const;
export type SlotSymbol = (typeof SLOT_SYMBOLS)[number];

export interface SlotsState {
  readonly reels: readonly [SlotSymbol, SlotSymbol, SlotSymbol];
}

export type BlackjackOutcome = 'BLACKJACK' | 'WIN' | 'LOSS' | 'PUSH';

export function cardLabel(card: Card): string {
  const rank = card % 13;
  return rank === 0 ? 'A' : rank >= 9 ? ['10', 'J', 'Q', 'K'][rank - 9]! : String(rank + 1);
}

export function handValue(cards: readonly Card[]): number {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    const rank = card % 13;
    if (rank === 0) {
      total += 11;
      aces += 1;
    } else {
      total += Math.min(rank + 1, 10);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

export function isBlackjack(cards: readonly Card[]): boolean {
  return cards.length === 2 && handValue(cards) === 21;
}

function shuffledDeck(): Card[] {
  const deck = Array.from({ length: 52 }, (_, card) => card);
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swap = rollBelow(index + 1);
    [deck[index], deck[swap]] = [deck[swap]!, deck[index]!];
  }
  return deck;
}

function take(deck: readonly Card[], count: number): { drawn: Card[]; deck: Card[] } {
  return { drawn: deck.slice(0, count), deck: deck.slice(count) };
}

export function dealBlackjack(): BlackjackState {
  const deck = shuffledDeck();
  const player = take(deck, 2);
  const dealer = take(player.deck, 2);
  return { deck: dealer.deck, player: player.drawn, dealer: dealer.drawn };
}

export function hit(state: BlackjackState): BlackjackState {
  const next = take(state.deck, 1);
  if (next.drawn.length !== 1) throw new Error('the blackjack deck ran out');
  return { ...state, deck: next.deck, player: [...state.player, next.drawn[0]!] };
}

export function settleBlackjack(state: BlackjackState): { state: BlackjackState; outcome: BlackjackOutcome } {
  const player = handValue(state.player);
  if (player > 21) return { state, outcome: 'LOSS' };

  let deck = [...state.deck];
  let dealer = [...state.dealer];
  while (handValue(dealer) < 17) {
    const next = take(deck, 1);
    if (next.drawn.length !== 1) throw new Error('the blackjack deck ran out');
    deck = next.deck;
    dealer = [...dealer, next.drawn[0]!];
  }

  const dealerValue = handValue(dealer);
  const outcome: BlackjackOutcome =
    dealerValue > 21 || player > dealerValue ? 'WIN' : player === dealerValue ? 'PUSH' : 'LOSS';
  return { state: { deck, player: state.player, dealer }, outcome };
}

/** The ordinary win returns the stake plus an equal profit; a natural pays 3:2. */
export function blackjackPayout(stake: number, outcome: BlackjackOutcome): number {
  if (outcome === 'PUSH') return stake;
  if (outcome === 'WIN') return stake * 2;
  if (outcome === 'BLACKJACK') return Math.floor((stake * 5) / 2);
  return 0;
}

function slotSymbol(): SlotSymbol {
  // Weights are intentionally readable and stable: Bapple is scarce, Tony is
  // common. The actual multiplier lives below, where simulations can inspect it.
  const roll = rollBelow(20);
  if (roll === 0) return 'BAPPLE';
  if (roll < 3) return 'SAUNA';
  if (roll < 7) return 'FREDDY';
  if (roll < 13) return 'PIZZA';
  return 'TONY';
}

export function spinSlots(): SlotsState {
  return { reels: [slotSymbol(), slotSymbol(), slotSymbol()] };
}

export function slotMultiplier(state: SlotsState): number {
  const [first, second, third] = state.reels;
  if (first === second && second === third) {
    return { BAPPLE: 12, SAUNA: 8, FREDDY: 6, PIZZA: 4, TONY: 3 }[first];
  }
  if (first === second || first === third || second === third) return 2;
  return 0;
}
