/* eslint-disable @next/next/no-img-element -- registered pixel sprites must bypass optimizer resampling */
'use client';

import { useEffect, useState, useTransition, type ReactNode } from 'react';

import { blackjackAction, dealBlackjackAction, spinSlotsAction } from '@/app/actions/underground';
import { AssetView } from '@/lib/assets/placeholder';
import { resolveAsset } from '@/lib/assets/registry';
import { TYPE } from '@/lib/design/type';
import { UNDERGROUND_WAGERS, type CasinoView } from '@/lib/underground/model';

type Scene = 'room' | 'slots' | 'blackjack';

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
  const [scene, setScene] = useState<Scene>('room');
  const [wager, setWager] = useState<(typeof UNDERGROUND_WAGERS)[number]>(UNDERGROUND_WAGERS[0]);
  const [slots, setSlots] = useState<Extract<CasinoView, { game: 'SLOTS' }> | null>(null);
  const [blackjack, setBlackjack] = useState<Extract<CasinoView, { game: 'BLACKJACK' }> | null>(null);
  const [message, setMessage] = useState('Pick a game in the room. Tony keeps the books.');
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
      setMessage(result.reason === 'insufficient' ? 'Not enough on the tab for that chip.' : 'The table is closed right now.');
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

  if (scene === 'room') {
    return <UndergroundRoom balance={balance} onEnter={setScene} />;
  }

  if (scene === 'slots') {
    return (
      <GameScreen balance={balance} message={message} onBack={() => setScene('room')} title="Bapple Slots" subtitle="Three reels. Fictional tokens only.">
        <div className="casino-slot-cabinet pixel-edge mx-auto w-full max-w-[360px] border-4 border-ink-900 bg-red-dark p-3 shadow-[5px_5px_0_#281414]">
          <div className="border-4 border-amber-glow bg-ink-900 p-2">
            <div className={`flex justify-center gap-2 ${slotSpinning ? 'slot-machine-running' : ''}`} aria-label="Slot reels">
              {reelSymbols.map((symbol, index) => (
                <span key={index} className={`flex h-20 w-20 items-center justify-center border-4 border-wood-dark bg-paper-mid ${slotSpinning ? 'slot-reel-spinning' : ''}`} style={slotSpinning ? { animationDelay: `${String(index * 46)}ms` } : undefined}>
                  <img src={REEL_ART[symbol]} alt="" className="h-16 w-16 object-contain" style={{ imageRendering: 'pixelated' }} />
                </span>
              ))}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-2 border-ink-900 bg-amber-mid px-3 py-2 text-ink-900">
            <span className={TYPE.eyebrow}>BAPPLE JACKPOT</span><span aria-hidden="true">🍎</span>
          </div>
        </div>
        <WagerTray wager={wager} pending={pending} onWager={setWager} />
        <button type="button" disabled={!canPlay} onClick={spin} className={`pixel-edge mx-auto mt-3 flex min-h-14 w-full max-w-[360px] items-center justify-center border-4 border-ink-900 bg-red-mid px-4 ${TYPE.action} text-paper-mid shadow-[4px_4px_0_#281414] disabled:opacity-50`}>
          {pending ? 'REELS SPINNING…' : `SPIN · ${String(wager)} TOKENS`}
        </button>
      </GameScreen>
    );
  }

  return (
    <GameScreen balance={balance} message={message} onBack={() => setScene('room')} title="Tony’s Blackjack" subtitle="Pull up a chair. Tony deals.">
      <div className="casino-game-dealer pointer-events-none mx-auto h-32 w-32" aria-hidden="true">
        <AssetView resolution={resolveAsset('character_tony_dealer')} className="h-full w-full object-contain object-bottom" />
      </div>
      <div className="casino-felt pixel-edge mx-auto w-full max-w-[390px] border-4 border-wood-dark p-3 shadow-[5px_5px_0_#281414]">
        <CardRow roundId={blackjack?.id ?? 'new'} label="TONY" cards={blackjack?.dealer ?? []} value={blackjack?.dealerValue ?? null} dealing={tableDealing} hidden={blackjack?.dealerValue === null} />
        <div className="my-5 border-t-2 border-dashed border-paper-mid/60" />
        <CardRow roundId={blackjack?.id ?? 'new'} label="YOU" cards={blackjack?.player ?? []} value={blackjack?.playerValue ?? null} dealing={tableDealing} />
        {blackjack?.outcome !== null && blackjack?.outcome !== undefined && <p className={`mt-4 text-center ${TYPE.eyebrow} text-amber-glow`}>{blackjack.outcome}</p>}
      </div>
      {blackjack?.settled === false ? (
        <div className="mx-auto mt-4 grid w-full max-w-[390px] grid-cols-2 gap-3">
          <button type="button" disabled={pending} onClick={() => move('HIT')} className={`pixel-edge min-h-14 border-4 border-ink-900 bg-amber-mid ${TYPE.action} text-ink-900 disabled:opacity-50`}>HIT</button>
          <button type="button" disabled={pending} onClick={() => move('STAND')} className={`pixel-edge min-h-14 border-4 border-ink-900 bg-red-mid ${TYPE.action} text-paper-mid disabled:opacity-50`}>STAND</button>
        </div>
      ) : (
        <>
          <WagerTray wager={wager} pending={pending} onWager={setWager} />
          <button type="button" disabled={!canPlay} onClick={deal} className={`pixel-edge mx-auto mt-3 flex min-h-14 w-full max-w-[390px] items-center justify-center border-4 border-ink-900 bg-amber-mid px-4 ${TYPE.action} text-ink-900 shadow-[4px_4px_0_#281414] disabled:opacity-50`}>
            {pending ? 'TONY DEALS…' : `DEAL · ${String(wager)} TOKENS`}
          </button>
        </>
      )}
    </GameScreen>
  );
}

function UndergroundRoom({ balance, onEnter }: { balance: number | null; onEnter: (scene: Scene) => void }) {
  return (
    <section className="casino-scene-enter pixel-edge relative isolate aspect-[320/569] w-full overflow-hidden border-2 border-wood-dark bg-ink-900" data-casino-floor="">
      <AssetView resolution={resolveAsset('zone_underground_shell')} className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute left-[7%] top-[5%] border-2 border-ink-900 bg-paper-mid px-2 py-1 text-ink-900 shadow-[2px_2px_0_#281414]">
        <p className={TYPE.eyebrow}>TOKENS</p><p className={`${TYPE.action} text-amber-deep`}>{balance === null ? '—' : String(balance)}</p>
      </div>
      <div className="casino-room-tony pointer-events-none absolute left-[38%] top-[31%] h-[22%] w-[25%]" aria-hidden="true">
        <AssetView resolution={resolveAsset('character_tony_blackjack_room')} className="h-full w-full object-contain object-bottom" />
      </div>
      <button type="button" onClick={() => onEnter('slots')} className="casino-room-hotspot absolute left-[1%] top-[29%] h-[31%] w-[29%]" aria-label="Play Bapple Slots">
        <span className={`casino-room-label ${TYPE.eyebrow}`}>BAPPLE SLOTS</span>
      </button>
      <button type="button" onClick={() => onEnter('blackjack')} className="casino-room-hotspot absolute left-[12%] top-[48%] h-[31%] w-[77%]" aria-label="Sit at Tony’s blackjack table">
        <span className={`casino-room-label ${TYPE.eyebrow}`}>SIT AT TABLE</span>
      </button>
      <div className="absolute bottom-[5%] left-1/2 w-[92%] -translate-x-1/2 border-2 border-ink-900 bg-ink-900/90 px-2 py-1 text-center text-paper-mid">
        <p className={TYPE.eyebrow}>TAP THE SLOT MACHINE OR BLACKJACK TABLE</p>
      </div>
    </section>
  );
}

function GameScreen({ balance, message, onBack, title, subtitle, children }: { balance: number | null; message: string; onBack: () => void; title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="casino-scene-enter pixel-edge min-h-[569px] overflow-hidden border-2 border-wood-dark bg-[#5d1e1d] p-3 text-paper-mid" data-casino-floor="">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onBack} className={`pixel-edge min-h-10 border-2 border-ink-900 bg-paper-mid px-2 ${TYPE.eyebrow} text-ink-900 active:translate-y-px`}>← ROOM</button>
        <div className="min-w-0 text-right"><p className={TYPE.boardHero}>{title}</p><p className={`${TYPE.bodyCompact} text-paper-mid/85`}>{subtitle}</p></div>
      </div>
      <p className={`mt-3 border-2 border-ink-900 bg-ink-900/90 px-3 py-2 ${TYPE.bodyCompact} text-paper-mid`} aria-live="polite">{message}</p>
      <div className="mt-5">{children}</div>
      <p className={`mt-5 text-center ${TYPE.eyebrow} text-paper-mid/80`}>{balance === null ? 'TOKEN TAB CLOSED' : `${String(balance)} TOKENS ON HAND`}</p>
    </section>
  );
}

function WagerTray({ wager, pending, onWager }: { wager: (typeof UNDERGROUND_WAGERS)[number]; pending: boolean; onWager: (wager: (typeof UNDERGROUND_WAGERS)[number]) => void }) {
  return <div className="mt-5 flex justify-center gap-2" aria-label="Choose wager">{UNDERGROUND_WAGERS.map((chip) => <button key={chip} type="button" disabled={pending} aria-pressed={wager === chip} onClick={() => onWager(chip)} className={`${CHIP} ${TYPE.action} ${wager === chip ? 'border-amber-glow bg-amber-mid text-ink-900' : 'border-ink-900 bg-paper-mid text-ink-900'}`}>{String(chip)}</button>)}</div>;
}

function CardRow({ roundId, label, cards, value, dealing, hidden = false }: { roundId: string; label: string; cards: readonly string[]; value: number | null; dealing: boolean; hidden?: boolean }) {
  const visible = cards.length === 0 ? ['?', '?'] : hidden ? [cards[0] ?? '?', '??'] : cards;
  return <div><div className="flex items-center justify-between gap-2"><span className={`${TYPE.eyebrow} text-paper-mid`}>{label}{value === null ? '' : ` · ${String(value)}`}</span><div className="flex min-h-12 justify-end gap-1">{visible.map((card, index) => <span key={cardKey(roundId, card, index)} className={`casino-card flex h-11 min-w-9 items-center justify-center border-2 border-ink-900 bg-paper-white px-1 ${TYPE.eyebrow} text-ink-900 ${dealing ? 'casino-card-dealt' : ''}`} style={dealing ? { animationDelay: `${String(index * 72)}ms` } : undefined}>{card}</span>)}</div></div></div>;
}
