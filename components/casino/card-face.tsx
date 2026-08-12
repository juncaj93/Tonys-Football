import { isRed, rankOf, suitOf, type Card } from '@/lib/casino/cards';
import { TYPE } from '@/lib/design/type';

/**
 * A playing card, drawn from the type system.
 *
 * ## Fifty-two assets was never a viable batch
 *
 * It would be more files than every collectible, wearable and room shell in this
 * project combined, for content that is **two glyphs and a colour**. And a card
 * has to stay legible at 360px, which is the one thing a 46 × 46 sprite is worst
 * at. So a card is a bordered surface with a rank and a suit set in the room's
 * own display face — the same shapes-not-pixels decision the manager sprite
 * reached from the other direction.
 *
 * Every string here is a `TYPE` role, so `checkTypeFloor` measures it like any
 * other text in the product and a card that shrank to fit a row would fail the
 * gate rather than ship.
 */

const PIPS: Readonly<Record<string, string>> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣',
};

/** A dealt card, face up. */
export function CardFace({ card }: { card: Card }) {
  const rank = rankOf(card);
  const suit = suitOf(card);

  return (
    <span
      data-card={`${rank}${suit}`}
      className={`${TYPE.score} flex min-w-11 flex-col items-center justify-center border-2 border-ink-700 bg-paper-white px-1 py-1 ${
        isRed(card) ? 'text-red-dark' : 'text-ink-900'
      }`}
    >
      <span>{rank}</span>
      <span aria-hidden="true">{PIPS[suit] ?? ''}</span>
      <span className="sr-only">{` of ${suit}`}</span>
    </span>
  );
}

/**
 * The dealer's hole card, face down.
 *
 * Present rather than absent while the hand is open, because a dealer showing
 * one card reads as a dealer who was dealt one. The **server** decides this —
 * `HandView` withholds the hole card entirely until the hand settles, so there
 * is nothing here to reveal even to somebody reading the network tab.
 */
export function CardBack() {
  return (
    <span
      data-card="back"
      aria-label="The dealer's face-down card"
      className={`${TYPE.score} flex min-w-11 flex-col items-center justify-center border-2 border-ink-700 bg-ink-700 px-1 py-1 text-amber-mid`}
    >
      <span aria-hidden="true">?</span>
      <span aria-hidden="true">·</span>
    </span>
  );
}
