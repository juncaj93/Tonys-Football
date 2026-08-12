import { EMPTY_HAND, addCard, type Hand } from './blackjack-model';

/**
 * A deck of cards, and the one bridge between the shipped game and the
 * mathematics it was approved on.
 *
 * ## Two representations, and why they are not duplication
 *
 * `blackjack-model.ts` works in **rank indices** — ten of them, with every
 * ten-value card collapsed into one — because that is the model the exact
 * solver and the 20-million-hand measurement ran on, and it is the model the
 * approved **2.03% house edge** is a fact about.
 *
 * A player needs to see a queen of hearts. So the product deals **card codes
 * 0–51**, and {@link modelRank} is the single function that maps one onto the
 * other. Every total, every soft-ace demotion and every natural in the shipped
 * game is therefore computed by the *same code* the house edge was measured
 * from — not by a second implementation that agrees today.
 *
 * If that bridge is ever cut, the measured edge stops being a statement about
 * this game. `blackjack-unit.test.ts` asserts the mapping over all fifty-two.
 *
 * ## Nothing here generates randomness, and that is a bundling constraint
 *
 * `components/casino/card-face.tsx` is a **client** component and imports from
 * this module. The shuffle therefore lives next door in `shuffle.ts`: it needs
 * `node:crypto`, which cannot be bundled for a browser, and a card face needs a
 * rank and a colour rather than a source of entropy. Keeping them apart is what
 * lets the client draw a queen of hearts without shipping the dealer.
 */

/** A card, `0`–`51`. `suit = code / 13`, `rank = code % 13`. */
export type Card = number;

export const CARDS_IN_DECK = 52;

/** Ordered so an index is the printed rank. `0` is the ace. */
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

/**
 * Ordered so an index is the suit, and coloured the way a card is.
 *
 * Spades and clubs are the dark pair, hearts and diamonds the red pair —
 * which is the only thing about a suit this game actually uses, since nothing in
 * blackjack cares which suit a card is.
 */
export const SUITS = ['S', 'H', 'D', 'C'] as const;
export type Suit = (typeof SUITS)[number];

export function rankOf(card: Card): (typeof RANKS)[number] {
  const rank = RANKS[card % 13];
  if (rank === undefined) throw new RangeError(`${String(card)} is not a card`);
  return rank;
}

export function suitOf(card: Card): Suit {
  const suit = SUITS[Math.floor(card / 13)];
  if (suit === undefined) throw new RangeError(`${String(card)} is not a card`);
  return suit;
}

/** `H` and `D` print red; `S` and `C` print dark. */
export function isRed(card: Card): boolean {
  const suit = suitOf(card);
  return suit === 'H' || suit === 'D';
}

/**
 * The rank index `blackjack-model.ts` works in.
 *
 * `0` for an ace; `1`–`8` for the two through nine; **`9` for every ten-value
 * card**, which is what makes a ten four times as likely as anything else and is
 * the single most important fact about blackjack's odds.
 */
export function modelRank(card: Card): number {
  if (!Number.isInteger(card) || card < 0 || card >= CARDS_IN_DECK) {
    throw new RangeError(`${String(card)} is not a card`);
  }
  return Math.min(card % 13, 9);
}

/** The running total of a set of cards, and whether an ace is still worth eleven. */
export function totalOf(cards: readonly Card[]): Hand {
  return cards.reduce<Hand>((hand, card) => addCard(hand, modelRank(card)), EMPTY_HAND);
}

/** A two-card twenty-one: an ace and a ten-value card, and nothing else. */
export function isNaturalHand(cards: readonly Card[]): boolean {
  if (cards.length !== 2) return false;
  const [a, b] = cards.map(modelRank);
  return (a === 0 && b === 9) || (a === 9 && b === 0);
}
