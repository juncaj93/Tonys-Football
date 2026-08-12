'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';

import { actAction, dealAction, openHandAction, type TableResponse } from '@/app/actions/blackjack';
import { CardBack, CardFace } from '@/components/casino/card-face';
import { RoomDisplay } from '@/components/scene/room-object';
import type { HandView } from '@/lib/casino/blackjack';
import { TYPE } from '@/lib/design/type';
import { type RoomObjectSpec } from '@/lib/parlor/objects';

/**
 * The blackjack table.
 *
 * ## The server owns the hand; this owns nothing
 *
 * There is no local game state here — no deck, no totals computed in the
 * browser, no optimistic card. Every response *replaces* the hand wholesale,
 * which is what makes a second tab, a refresh and a killed browser all correct
 * for free: they each ask the server what the hand is and render the answer.
 *
 * ## Resume is a read, not a recovery path
 *
 * On mount the component asks for the open hand. A manager who dealt on their
 * phone, locked it, and opened the room on a laptop gets the same hand back
 * because it is the same row. Nothing is restored, because nothing was ever
 * kept here.
 *
 * ## The revision is echoed, never trusted
 *
 * Each action sends the revision this tab last saw. If another tab moved the
 * hand, the server refuses and returns the real state — and this component
 * simply renders it, because *"you were looking at an old hand"* is a thing that
 * happened rather than an error to recover from.
 */

/** Curated refusals, in the room's voice. Never generated (`16 §10`). */
const REFUSALS: Readonly<Record<string, string>> = {
  insufficient_tokens: 'Not enough on your tab for that.',
  wager_not_offered: 'That is not one of the chips.',
  hand_in_progress: 'You already have a hand going.',
  closed: 'The books are shut. Nothing moves down here until the season opens.',
  not_found: 'That hand is not yours.',
  already_settled: 'That hand is already finished.',
  stale: 'Another window moved this hand. Here it is.',
  unavailable: 'The table is not dealing right now.',
};

/** One line per way a hand can end. */
const VERDICTS: Readonly<Record<string, string>> = {
  player_natural: 'Blackjack.',
  dealer_natural: 'Dealer had blackjack.',
  push: 'Push.',
  win: 'You win.',
  loss: 'Dealer takes it.',
  bust: 'Bust.',
};

export function BlackjackTable({
  spec,
  wagers,
  balance,
  live,
  coveredLine,
}: {
  spec: RoomObjectSpec;
  wagers: readonly number[];
  balance: number;
  live: boolean;
  coveredLine: string;
}) {
  const [wager, setWager] = useState<number>(wagers[0] ?? 0);
  const [hand, setHand] = useState<HandView | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** Every response lands here, so there is exactly one place the view changes. */
  const apply = useCallback((response: TableResponse): void => {
    if (response.ok) {
      setHand(response.hand);
      setNote(null);
      return;
    }
    setNote(REFUSALS[response.reason] ?? REFUSALS['unavailable'] ?? null);
    // A stale or already-settled refusal carries the real hand. Render it.
    if (response.hand !== undefined) setHand(response.hand);
  }, []);

  useEffect(() => {
    if (!live) return;
    void openHandAction().then(apply);
  }, [live, apply]);

  const start = (): void => {
    const token = crypto.randomUUID();
    startTransition(() => {
      void dealAction(token, wager).then(apply);
    });
  };

  const play = (action: 'hit' | 'stand'): void => {
    if (hand === null) return;
    const token = crypto.randomUUID();
    const { id, revision } = hand;
    startTransition(() => {
      void actAction(id, action, revision, token).then(apply);
    });
  };

  const open = hand !== null && hand.status === 'OPEN';
  const settled = hand !== null && hand.status === 'SETTLED';

  return (
    <RoomDisplay spec={spec} title="The table" material="enamel">
      {!live ? (
        <p className={`${TYPE.dialogue} text-paper-mid`}>{coveredLine}</p>
      ) : (
        <div className="flex flex-col gap-3" data-blackjack>
          {hand === null ? (
            <p className={`${TYPE.body} text-paper-mid`}>Pick your chips and Tony will deal.</p>
          ) : (
            <>
              <section aria-label="Dealer">
                <p className={`${TYPE.ledgerLabel} text-amber-mid`}>
                  Dealer{hand.dealerTotal === null ? '' : ` · ${String(hand.dealerTotal)}`}
                </p>
                <div className="mt-1 flex flex-wrap gap-1" data-dealer-cards>
                  {hand.dealerCards.map((card, i) => (
                    <CardFace key={`d${String(i)}-${String(card)}`} card={card} />
                  ))}
                  {/* One card down while the hand is live — the server has not sent it. */}
                  {open && <CardBack />}
                </div>
              </section>

              <section aria-label="Your hand">
                <p className={`${TYPE.ledgerLabel} text-amber-mid`}>
                  You · {String(hand.playerTotal)}
                  {hand.playerSoft ? ' (soft)' : ''}
                </p>
                <div className="mt-1 flex flex-wrap gap-1" data-player-cards>
                  {hand.playerCards.map((card, i) => (
                    <CardFace key={`p${String(i)}-${String(card)}`} card={card} />
                  ))}
                </div>
              </section>
            </>
          )}

          {settled && hand.outcome !== null && (
            <p className={`${TYPE.subhead} text-paper-white`} data-blackjack-verdict>
              {VERDICTS[hand.outcome] ?? ''}{' '}
              <span className={TYPE.ledgerValue}>
                {hand.payout !== null && hand.payout > hand.wager
                  ? `+${String(hand.payout - hand.wager)}`
                  : hand.payout === hand.wager
                    ? '±0'
                    : `−${String(hand.wager)}`}
              </span>
            </p>
          )}

          {note !== null && (
            <p className={`${TYPE.body} text-paper-mid`} data-blackjack-note>
              {note}
            </p>
          )}

          {open ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  play('hit');
                }}
                disabled={pending}
                data-blackjack-hit
                className={`${TYPE.action} min-h-11 flex-1 border-2 border-amber-mid bg-amber-mid px-3 text-ink-900 disabled:opacity-60`}
              >
                Hit
              </button>
              <button
                type="button"
                onClick={() => {
                  play('stand');
                }}
                disabled={pending}
                data-blackjack-stand
                className={`${TYPE.action} min-h-11 flex-1 border-2 border-amber-mid px-3 text-paper-mid disabled:opacity-60`}
              >
                Stand
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {wagers.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => {
                      setWager(amount);
                    }}
                    aria-pressed={wager === amount}
                    className={`${TYPE.action} min-h-11 min-w-11 border-2 px-3 ${
                      wager === amount
                        ? 'border-amber-mid bg-amber-mid text-ink-900'
                        : 'border-amber-mid/50 text-paper-mid'
                    }`}
                  >
                    {amount}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={start}
                disabled={pending}
                data-blackjack-deal
                className={`${TYPE.action} min-h-11 border-2 border-amber-mid bg-amber-mid px-4 text-ink-900 disabled:opacity-60`}
              >
                {pending ? 'Dealing…' : `Deal — ${String(wager)}`}
              </button>
            </>
          )}

          {/*
            * The tab as it was when the room rendered. Deliberately not live: the
            * server is the authority on a balance, and nothing here reads it to
            * decide whether a wager is affordable — that is the overdraft CHECK's
            * job, and a client-side affordability test is the read-then-check race
            * in a nicer coat.
            */}
          <p className={`${TYPE.ledgerNote} text-paper-mid/80`}>
            On your tab when you came down: {balance}.
          </p>
        </div>
      )}
    </RoomDisplay>
  );
}
