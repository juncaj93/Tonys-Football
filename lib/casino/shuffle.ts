import { rollBelow } from '@/lib/counter/rng';

import { CARDS_IN_DECK, type Card } from './cards';

/**
 * Shuffling, kept apart from the cards themselves.
 *
 * **Server only.** `rollBelow` reaches `node:crypto`, which cannot be bundled
 * for a browser — and `components/casino/card-face.tsx` is a client component
 * that legitimately needs to know a card's rank and colour. So the deck's
 * *identity* lives in `cards.ts` and its *order* lives here, which is also the
 * honest division: the client may know what a card is and may never know what
 * the next one will be.
 */

/**
 * A freshly shuffled deck, as a permutation of 0–51.
 *
 * Fisher–Yates, drawing from `rollBelow` — the product's one randomness source,
 * `crypto.randomInt`, injectable exactly like the clock and never
 * `Math.random`. `09 §12` requires a *"cryptographically appropriate random
 * source"* and this is it.
 *
 * The **permutation is stored** on the hand rather than a seed. A seed would be
 * smaller and would make the shuffle algorithm permanent: change either it or
 * the generator and every historical hand re-derives to different cards. A
 * permutation is self-describing and cannot rot.
 */
export function shuffledDeck(): Card[] {
  const deck = Array.from({ length: CARDS_IN_DECK }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = rollBelow(i + 1);
    const a = deck[i] as Card;
    const b = deck[j] as Card;
    deck[i] = b;
    deck[j] = a;
  }
  return deck;
}
