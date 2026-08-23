/* eslint-disable @next/next/no-img-element -- registered pixel sprites must bypass optimizer resampling */
'use client';

import { useState, useTransition } from 'react';

import { blackjackAction, dealBlackjackAction, spinSlotsAction } from '@/app/actions/underground';
import { TYPE } from '@/lib/design/type';
import { UNDERGROUND_WAGERS, type CasinoView } from '@/lib/underground/model';

const CHIP = 'pixel-edge min-h-[44px] border-2 px-3 active:translate-y-px';

const REEL_ART = {
  BAPPLE: '/assets/collectible/collectible_bapple_tree.png',
  FREDDY: '/assets/collectible/collectible_freddy_bowl.png',
  SAUNA: '/assets/collectible/collectible_portable_sauna.png',
  PIZZA: '/assets/collectible/collectible_pizza_cutter.png',
  TONY: '/assets/collectible/collectible_neon_tony_sign.png',
} as const;

export function CasinoFloor({ balance }: { balance: number | null }) {
  const [wager, setWager] = useState<(typeof UNDERGROUND_WAGERS)[number]>(UNDERGROUND_WAGERS[0]);
  const [slots, setSlots] = useState<Extract<CasinoView, { game: 'SLOTS' }> | null>(null);
  const [blackjack, setBlackjack] = useState<Extract<CasinoView, { game: 'BLACKJACK' }> | null>(null);
  const [message, setMessage] = useState('Pick a table. Tony keeps the books.');
  const [pending, startTransition] = useTransition();

  const resolve = (result: Awaited<ReturnType<typeof spinSlotsAction>>): void => {
    if (!result.ok) {
      setMessage(
        result.reason === 'insufficient'
          ? 'Not enough on the tab for that chip.'
          : 'The table is closed right now.',
      );
      return;
    }
    if (result.round.game === 'SLOTS') {
      setSlots(result.round);
      setMessage(result.round.payout > 0 ? `The machine pays ${String(result.round.payout)} tokens.` : 'Nothing this time.');
    } else {
      setBlackjack(result.round);
      setMessage(result.round.settled ? result.round.outcome === 'PUSH' ? 'Push. Your chip comes back.' : 'Hand settled.' : 'Your move.');
    }
  };

  const spin = (): void => {
    startTransition(async () => resolve(await spinSlotsAction(wager, crypto.randomUUID())));
  };

  const deal = (): void => {
    startTransition(async () => resolve(await dealBlackjackAction(wager, crypto.randomUUID())));
  };

  const move = (action: 'HIT' | 'STAND'): void => {
    if (blackjack === null || blackjack.settled) return;
    startTransition(async () => resolve(await blackjackAction(blackjack.id, action)));
  };

  const canPlay = balance !== null && !pending;

  return (
    <section data-casino-floor="" className="mt-4 space-y-4">
      <div className="pixel-edge border-2 border-amber-mid bg-ink-900 px-4 py-3 text-paper-mid">
        <p className={TYPE.eyebrow}>Tonight&apos;s chips</p>
        <p className={`mt-1 ${TYPE.boardHero} text-amber-glow`} data-casino-balance={balance ?? 'none'}>
          {balance === null ? 'TAB CLOSED' : `${String(balance)} TOKENS`}
        </p>
        <p className={`mt-2 ${TYPE.bodyCompact} text-paper-mid/80`} aria-live="polite">{message}</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Choose wager">
        {UNDERGROUND_WAGERS.map((chip) => (
          <button
            key={chip}
            type="button"
            disabled={pending}
            aria-pressed={wager === chip}
            onClick={() => setWager(chip)}
            className={`${CHIP} ${TYPE.action} ${wager === chip ? 'border-amber-glow bg-amber-mid text-ink-900' : 'border-ink-500 bg-paper-mid text-ink-700'}`}
          >
            {String(chip)}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <article className="pixel-edge border-2 border-ink-700 bg-paper-mid p-4">
          <p className={TYPE.eyebrow}>Bapple slots</p>
          <div className="mt-3 flex justify-center gap-1 border-2 border-ink-900 bg-ink-900 p-2 text-center text-paper-mid">
            {(slots?.reels ?? ['TONY', 'TONY', 'TONY']).map((symbol, index) => (
              <span key={index} className={`flex h-12 w-12 items-center justify-center border border-ink-500 bg-paper-mid ${TYPE.eyebrow} text-ink-900`}>
                {/* Static registered paths only — no optimizer, no resampling. */}
                <img src={REEL_ART[symbol]} alt="" className="h-[42px] w-[42px] object-contain" style={{ imageRendering: 'pixelated' }} />
              </span>
            ))}
          </div>
          <button type="button" disabled={!canPlay} onClick={spin} className={`mt-4 w-full ${CHIP} ${TYPE.action} border-ink-900 bg-red-mid text-paper-mid disabled:opacity-50`}>
            {pending ? 'SPINNING…' : `SPIN ${String(wager)}`}
          </button>
        </article>

        <article className="pixel-edge border-2 border-ink-700 bg-paper-mid p-4">
          <p className={TYPE.eyebrow}>Blackjack</p>
          <div className={`mt-3 min-h-[82px] border-2 border-ink-900 bg-green-deep p-2 ${TYPE.bodyCompact} text-paper-mid`}>
            {blackjack === null ? (
              <p className="text-paper-mid/80">Dealer waits.</p>
            ) : (
              <>
                <p>DEALER: {blackjack.dealer.join(' · ')} {blackjack.dealerValue === null ? '' : `(${String(blackjack.dealerValue)})`}</p>
                <p className="mt-2">YOU: {blackjack.player.join(' · ')} ({String(blackjack.playerValue)})</p>
                {blackjack.outcome !== null && <p className="mt-2 text-amber-glow">{blackjack.outcome}</p>}
              </>
            )}
          </div>
          {blackjack?.settled === false ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" disabled={pending} onClick={() => move('HIT')} className={`${CHIP} ${TYPE.action} border-ink-900 bg-amber-mid text-ink-900`}>HIT</button>
              <button type="button" disabled={pending} onClick={() => move('STAND')} className={`${CHIP} ${TYPE.action} border-ink-900 bg-red-mid text-paper-mid`}>STAND</button>
            </div>
          ) : (
            <button type="button" disabled={!canPlay} onClick={deal} className={`mt-4 w-full ${CHIP} ${TYPE.action} border-ink-900 bg-amber-mid text-ink-900 disabled:opacity-50`}>
              {pending ? 'DEALING…' : `DEAL ${String(wager)}`}
            </button>
          )}
        </article>
      </div>
    </section>
  );
}
