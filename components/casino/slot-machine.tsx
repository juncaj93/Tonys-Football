'use client';

import { useState, useTransition } from 'react';

import { spinAction, type SpinResponse } from '@/app/actions/casino';
import { RoomDisplay } from '@/components/scene/room-object';
import { TYPE } from '@/lib/design/type';
import { type RoomObjectSpec } from '@/lib/parlor/objects';

/**
 * The machine, and the panel it opens.
 *
 * ## It opens in place
 *
 * `18 §5` caps the Underground at two taps, so a game at its own route would be
 * three. The machine is a Display and the panel is `RoomPanel` — the one the
 * RoomDisplay pass built, with one transient surface up at a time. Same grammar
 * as the counter tray opening a box without navigating.
 *
 * ## Nothing here decides anything
 *
 * The component sends a stake and a token and renders what comes back. It holds
 * no paytable, no strip, no odds and no arithmetic on a payout — `18 §4.3`, and
 * `04 §11`'s *"the client receives only information needed to animate the
 * already-committed outcome."* A reader of this file cannot learn the odds,
 * which is the point.
 *
 * ## The token is minted per attempt, and that is what makes a double tap safe
 *
 * One `crypto.randomUUID()` per pull, held until the pull resolves. A second tap
 * while a pull is in flight sends the **same** token and is therefore the same
 * spin; the next pull mints a new one. The button is also disabled while a
 * transition is pending, but that is the courtesy — the token is the guarantee,
 * and it is the one that survives a slow network.
 */

/** What each refusal says, in the room's voice. Curated, never generated. */
const REFUSALS: Readonly<Record<string, string>> = {
  insufficient_tokens: 'Not enough on your tab for that pull.',
  too_fast: 'Give it a second. The machine is old.',
  stake_not_offered: 'That is not one of the buttons.',
  closed: 'The books are shut. Nothing moves down here until the season opens.',
  unavailable: 'The machine is not taking pulls right now.',
};

/** How a result reads on the plate. Three curated lines, one per shape. */
function verdict(result: Extract<SpinResponse, { ok: true }>): string {
  if (result.line === 'three') return 'Three of a kind.';
  if (result.line === 'pair') return 'Two the same.';
  return 'Nothing doing.';
}

export function SlotMachine({
  spec,
  wagers,
  balance,
  live,
  coveredLine,
}: {
  spec: RoomObjectSpec;
  /** The buttons the stored paytable offers. Resolved on the server. */
  wagers: readonly number[];
  balance: number;
  /** Both flags open. Shut renders the covered machine and takes no wager. */
  live: boolean;
  coveredLine: string;
}) {
  const [stake, setStake] = useState<number>(wagers[1] ?? wagers[0] ?? 0);
  const [result, setResult] = useState<SpinResponse | null>(null);
  const [pending, startTransition] = useTransition();

  const pull = (): void => {
    // Minted per attempt. A retry of *this* pull reuses it; the next pull does not.
    const token = crypto.randomUUID();
    startTransition(() => {
      void spinAction(token, stake).then(setResult);
    });
  };

  return (
    <RoomDisplay spec={spec} title="The machine" material="enamel">
      {!live ? (
        <p className={`${TYPE.dialogue} text-paper-mid`}>{coveredLine}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {/*
            * The reels.
            *
            * Three windows, and they show the last result or three blanks. There
            * is deliberately **no near-miss treatment**: the reels stop on what
            * the server sent, in order, and nothing here can stop one symbol
            * short on purpose. `16 §8` lists near-miss mechanics among the
            * explicit non-goals, and this is where one would be added.
            */}
          <div className="flex justify-center gap-2" data-slot-reels>
            {[0, 1, 2].map((reel) => (
              <span
                key={reel}
                data-slot-reel
                className={`${TYPE.ledgerValue} flex h-14 w-16 items-center justify-center border-2 border-amber-mid bg-ink-900 text-paper-white`}
              >
                {result?.ok === true ? (result.symbols[reel] ?? '').slice(0, 4) : '—'}
              </span>
            ))}
          </div>

          {result !== null && (
            <p className={`${TYPE.body} text-paper-mid`} data-slot-verdict>
              {result.ok
                ? `${verdict(result)} ${result.payout > 0 ? `Pays ${String(result.payout)}.` : ''}`
                : (REFUSALS[result.reason] ?? REFUSALS['unavailable'])}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {wagers.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => {
                  setStake(amount);
                }}
                aria-pressed={stake === amount}
                className={`${TYPE.action} min-h-11 min-w-11 border-2 px-3 ${
                  stake === amount
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
            onClick={pull}
            disabled={pending}
            className={`${TYPE.action} min-h-11 border-2 border-amber-mid bg-amber-mid px-4 text-ink-900 disabled:opacity-60`}
            data-slot-pull
          >
            {pending ? 'Spinning…' : `Pull — ${String(stake)}`}
          </button>

          {/*
            * The tab, as it was when the room rendered.
            *
            * Deliberately **not** live: the server is the authority on a balance
            * and this is a reminder, not a number anything depends on. Nothing in
            * this component reads it to decide whether a pull is affordable —
            * that is the overdraft CHECK's job, and a client-side affordability
            * test is the read-then-check race in a nicer coat.
            */}
            <p className={`${TYPE.ledgerNote} text-paper-mid/80`}>
            On your tab when you came down: {balance}.
          </p>
        </div>
      )}
    </RoomDisplay>
  );
}
