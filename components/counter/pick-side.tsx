'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { TYPE } from '@/lib/design/type';
import { pickSideAction } from '@/app/actions/stakes';
import { attempt, UNREACHABLE_LINE } from '@/lib/reliability/attempt';

/**
 * Over or under, and nothing else.
 *
 * ## Two controls, side by side, both real
 *
 * A single toggle would be smaller and would be wrong: the two sides are equally
 * weighted by construction — the line is a median — so a control that made one
 * of them the default state would be the interface having an opinion the product
 * deliberately does not have.
 *
 * Each is 48px tall and half the panel's width, which clears 44 on all three
 * supported phones with room to spare. They sit under the claim rather than
 * beside it, because at 360 two buttons and a sentence on one row is where copy
 * starts being shrunk to fit.
 *
 * ## Nothing is disabled on a balance the client read
 *
 * `buy-box.tsx`'s ruling, and it holds here for the same two reasons: a
 * client-side affordability check is a race, and it is a second copy of a rule
 * the database already enforces with `CHECK (token_balance >= 0)`. So the tap is
 * allowed, the database refuses it, and Tony says so.
 *
 * ## The result comes back as a refresh, not as local state
 *
 * A pick changes what the panel says — the pick line appears, the controls go —
 * and that copy is rendered on the server from the stored row. Reproducing it
 * here would be a second opinion about a settled fact, and it is the kind that
 * survives a refresh looking different.
 */
export function PickSide({
  stakeId,
  stakeTokens,
}: {
  stakeId: string;
  stakeTokens: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [refused, setRefused] = useState<string | null>(null);

  const pick = (side: 'over' | 'under'): void => {
    if (pending) return;
    setRefused(null);

    startTransition(async () => {
      const outcome = await attempt(() => pickSideAction(stakeId, side));

      /*
       * No side was taken and nothing was staked.
       *
       * Retrying is safe without any token of its own: `UNIQUE(stake_id,
       * user_id)` means a manager holds exactly one pick on a market forever, so
       * a request that did commit before the answer was lost comes back as
       * `already` rather than as a second wager. That constraint is the reason
       * this surface never needed the idempotency token the counter mints, and
       * it is unchanged here — nothing about the line, the stake, the payout or
       * eligibility is touched by this file.
       */
      if (!outcome.ok) {
        setRefused(UNREACHABLE_LINE);
        return;
      }
      const result = outcome.value;

      if (result.ok) {
        router.refresh();
        return;
      }

      setRefused(
        result.reason === 'broke'
          ? `That is ${String(stakeTokens)} on your tab, and there isn’t ${String(stakeTokens)} on it.`
          : result.reason === 'already'
            ? 'You already took a side on this one.'
            : result.reason === 'not_eligible'
              ? 'This one isn’t yours to call.'
              : 'Tony has closed the book on this one.',
      );
    });
  };

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        {(['over', 'under'] as const).map((side) => (
          <button
            key={side}
            type="button"
            onClick={() => {
              pick(side);
            }}
            disabled={pending}
            aria-label={`Take the ${side} for ${String(stakeTokens)} tokens`}
            className={`pixel-edge flex min-h-[48px] flex-1 items-center justify-center border-2 border-wood-dark bg-red-dark ${TYPE.action} text-paper-white active:translate-y-px disabled:opacity-60`}
          >
            {side}
          </button>
        ))}
      </div>

      {/*
        * The price, under the controls rather than inside them.
        *
        * `18` and the box offer both landed on the same rule: a number beside a
        * button reads as a store. Tony's shop states what a thing costs in a
        * sentence and lets the control be a control.
        */}
      <p className={`mt-2 ${TYPE.eyebrow} text-ink-700/85`}>
        {pending ? 'Tony writes it down…' : `${String(stakeTokens)} tokens, either way`}
      </p>

      {refused !== null && (
        <p aria-live="polite" className={`mt-2 ${TYPE.bodyCompact} text-ink-700`}>
          {refused}
        </p>
      )}
    </div>
  );
}
