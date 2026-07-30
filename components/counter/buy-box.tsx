'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';

import { buyBoxAction } from '@/app/actions/counter';

/**
 * Buying a box.
 *
 * ## The idempotency token is minted per attempt, on the client, and that is the point
 *
 * One random token is held for as long as the button represents *this* purchase.
 * A double tap, a slow network and an impatient second press all send the same
 * token, so the ledger sees one delta and one box. A **new** token is minted only
 * after a purchase succeeds — so a manager who genuinely wants a second box gets a
 * second purchase.
 *
 * That is the whole reason the key is not derived server-side from, say, the
 * minute: a time-bucketed key would collapse two deliberate purchases into one,
 * and a per-request key would let a double tap spend twice. The client is the only
 * place that knows whether this is "the same attempt" or "another one", so the
 * client names it — and the server namespaces it under the session's user id so a
 * forged name cannot reach anybody else's ledger.
 *
 * ## Insufficient funds is answered, not prevented
 *
 * The button is never disabled on a balance the client read. `CHECK
 * (token_balance >= 0)` in the database is the authority, and a client-side
 * affordability check would be both a race and a second copy of a rule that
 * already exists. So the tap is allowed, the database refuses it, and Tony says
 * so.
 */
export function BuyBox({ price, balance }: { price: number; balance: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [refused, setRefused] = useState<string | null>(null);
  const token = useRef(crypto.randomUUID());

  const buy = (): void => {
    if (pending) return;
    setRefused(null);

    startTransition(async () => {
      const result = await buyBoxAction(token.current);

      if (result.ok) {
        // A different purchase next time.
        token.current = crypto.randomUUID();
        router.refresh();
        return;
      }

      setRefused(
        result.reason === 'insufficient'
          ? `That is ${String(result.price)}, and you have ${String(result.balance)}.`
          : 'Tony can’t sell you one right now.',
      );
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={buy}
        aria-label={`Buy a standard pizza box for ${String(price)} tokens`}
        className="pixel-edge mt-3 flex min-h-[48px] w-full items-center justify-between border-2 border-wood-dark bg-red-dark px-4 font-display text-[12px] text-paper-white uppercase active:translate-y-px disabled:opacity-60"
        disabled={pending}
      >
        <span>{pending ? 'Tony reaches under the counter…' : 'Buy a box'}</span>
        <span aria-hidden="true" className="text-amber-glow">
          {String(price)}
        </span>
      </button>

      {/*
        * The refusal, in the shop's voice. `aria-live` so it is announced rather
        * than only appearing — a manager using a screen reader must be told the
        * tap did nothing and why.
        */}
      {refused !== null && (
        <p aria-live="polite" className="mt-2 text-[17px] leading-[1.4] text-ink-700">
          {refused}
        </p>
      )}

      {/*
        * The balance. 11px rather than the 9px this started at: it is a fact a
        * manager wants, not chrome, and 9px uppercase mono at 70% opacity on cream
        * was hard to read at arm’s length — the same mistake as sizing type to a
        * container.
        */}
      <p className="mt-2 font-display text-[11px] leading-[1.4] tracking-wide text-ink-700/85 uppercase">
        {String(balance)} tokens on your tab
      </p>
    </>
  );
}
