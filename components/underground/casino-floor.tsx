/* eslint-disable @next/next/no-img-element -- registered pixel sprites must bypass optimizer resampling */
'use client';

import { useEffect, useState, useTransition } from 'react';

import { blackjackAction, dealBlackjackAction, spinSlotsAction } from '@/app/actions/underground';
import { AssetView } from '@/lib/assets/placeholder';
import { resolveAsset } from '@/lib/assets/registry';
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

const SPIN_SYMBOLS = Object.keys(REEL_ART) as (keyof typeof REEL_ART)[];
const SLOT_SETTLE_MS = 880;
const DEAL_SETTLE_MS = 460;

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function cardKey(roundId: string, card: string, index: number): string {
  return `${roundId}-${card}-${String(index)}`;
}

export function CasinoFloor({ balance }: { balance: number | null }) {
  const [wager, setWager] = useState<(typeof UNDERGROUND_WAGERS)[number]>(UNDERGROUND_WAGERS[0]);
  const [slots, setSlots] = useState<Extract<CasinoView, { game: 'SLOTS' }> | null>(null);
  const [blackjack, setBlackjack] = useState<Extract<CasinoView, { game: 'BLACKJACK' }> | null>(null);
  const [message, setMessage] = useState('Pick a table. Tony keeps the books.');
  const [slotSpinning, setSlotSpinning] = useState(false);
  const [tableDealing, setTableDealing] = useState(false);
  const [reelTick, setReelTick] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!slotSpinning) {
      setReelTick(0);
      return;
    }
    const ticker = window.setInterval(() => setReelTick((tick) => tick + 1), 92);
    return () => window.clearInterval(ticker);
  }, [slotSpinning]);

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
    setSlotSpinning(true);
    startTransition(async () => {
      try {
        const [result] = await Promise.all([spinSlotsAction(wager, crypto.randomUUID()), pause(SLOT_SETTLE_MS)]);
        resolve(result);
      } finally {
        setSlotSpinning(false);
      }
    });
  };

  const deal = (): void => {
    setTableDealing(true);
    startTransition(async () => {
      try {
        const [result] = await Promise.all([dealBlackjackAction(wager, crypto.randomUUID()), pause(DEAL_SETTLE_MS)]);
        resolve(result);
      } finally {
        setTableDealing(false);
      }
    });
  };

  const move = (action: 'HIT' | 'STAND'): void => {
    if (blackjack === null || blackjack.settled) return;
    setTableDealing(true);
    startTransition(async () => {
      try {
        const [result] = await Promise.all([blackjackAction(blackjack.id, action), pause(DEAL_SETTLE_MS)]);
        resolve(result);
      } finally {
        setTableDealing(false);
      }
    });
  };

  const canPlay = balance !== null && !pending;
  const reelSymbols = slotSpinning
    ? ([0, 1, 2].map((offset) => SPIN_SYMBOLS[(reelTick * 2 + offset * 3) % SPIN_SYMBOLS.length]!) as readonly (keyof typeof REEL_ART)[])
    : (slots?.reels ?? ['TONY', 'TONY', 'TONY']);

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
          <div className={`mt-3 flex justify-center gap-1 border-2 border-ink-900 bg-ink-900 p-2 text-center text-paper-mid ${slotSpinning ? 'slot-machine-running' : ''}`}>
            {reelSymbols.map((symbol, index) => (
              <span
                key={index}
                className={`flex h-12 w-12 items-center justify-center border border-ink-500 bg-paper-mid ${TYPE.eyebrow} text-ink-900 ${slotSpinning ? 'slot-reel-spinning' : ''}`}
                style={slotSpinning ? { animationDelay: `${String(index * 46)}ms` } : undefined}
              >
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
          <div className="flex items-end justify-between gap-2">
            <p className={TYPE.eyebrow}>Blackjack</p>
            <div aria-hidden="true" className="casino-dealer flex items-end gap-1">
              {/* Tony is the dealer, not a label on a generic table. */}
              <AssetView resolution={resolveAsset('character_tony_dealer')} className="h-16 w-auto object-contain" />
              <span className={`${TYPE.eyebrow} mb-1 text-ink-700`}>TONY DEALS</span>
            </div>
          </div>
          <div className={`casino-table mt-3 min-h-[118px] border-2 border-ink-900 bg-green-deep p-2 ${TYPE.bodyCompact} text-paper-mid`}>
            {blackjack === null ? (
              <p className="text-paper-mid/80">Tony shuffles, waiting on a chip.</p>
            ) : (
              <>
                <CardRow roundId={blackjack.id} label="TONY" cards={blackjack.dealer} value={blackjack.dealerValue} dealing={tableDealing} hidden={blackjack.dealerValue === null} />
                <CardRow roundId={blackjack.id} label="YOU" cards={blackjack.player} value={blackjack.playerValue} dealing={tableDealing} />
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

function CardRow({
  roundId,
  label,
  cards,
  value,
  dealing,
  hidden = false,
}: {
  roundId: string;
  label: string;
  cards: readonly string[];
  value: number | null;
  dealing: boolean;
  hidden?: boolean;
}) {
  const visible = hidden ? [cards[0] ?? '?', '??'] : cards;

  return (
    <div className="mt-1.5 first:mt-0">
      <div className="flex items-center justify-between gap-2">
        <span className={TYPE.eyebrow}>{label}{value === null ? '' : ` · ${String(value)}`}</span>
        <div className="flex min-h-9 justify-end gap-1">
          {visible.map((card, index) => (
            <span
              key={cardKey(roundId, card, index)}
              className={`casino-card flex h-8 min-w-7 items-center justify-center border border-ink-900 bg-paper-white px-1 ${TYPE.eyebrow} text-ink-900 ${dealing ? 'casino-card-dealt' : ''}`}
              style={dealing ? { animationDelay: `${String(index * 72)}ms` } : undefined}
            >
              {card}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
