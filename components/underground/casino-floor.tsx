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
const DEAL_BEAT_MS = 180;

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function cardKey(roundId: string, card: string, index: number): string {
  return `${roundId}-${card}-${String(index)}`;
}

/**
 * A local, clearly labelled rehearsal table.
 *
 * It exists so visual/gameplay work can be exercised with an empty tab without
 * minting tokens, changing a production balance, or touching the server's odds.
 * Nothing from this table reaches the ledger or the casino-round audit trail.
 */
function practiceSlots(sequence: number): Extract<CasinoView, { game: 'SLOTS' }> {
  const reels = [0, 1, 2].map((index) => SPIN_SYMBOLS[(sequence * 2 + index) % SPIN_SYMBOLS.length]!) as [keyof typeof REEL_ART, keyof typeof REEL_ART, keyof typeof REEL_ART];
  return { id: crypto.randomUUID(), game: 'SLOTS', wager: 0, settled: true, payout: 0, reels };
}

function practiceHand(): Extract<CasinoView, { game: 'BLACKJACK' }> {
  return {
    id: crypto.randomUUID(), game: 'BLACKJACK', wager: 0, settled: false, payout: null,
    player: ['10', '7'], playerValue: 17, dealer: ['9'], dealerValue: null, outcome: null,
  };
}

export function CasinoFloor({ balance }: { balance: number | null }) {
  const [scene, setScene] = useState<Scene>('room');
  const [wager, setWager] = useState<(typeof UNDERGROUND_WAGERS)[number]>(UNDERGROUND_WAGERS[0]);
  const [slots, setSlots] = useState<Extract<CasinoView, { game: 'SLOTS' }> | null>(null);
  const [blackjack, setBlackjack] = useState<Extract<CasinoView, { game: 'BLACKJACK' }> | null>(null);
  const [message, setMessage] = useState('Pick a game in the room. Tony keeps the books.');
  const [slotSpinning, setSlotSpinning] = useState(false);
  const [tableDealing, setTableDealing] = useState(false);
  const [dealBeat, setDealBeat] = useState(0);
  const [practiceMode, setPracticeMode] = useState(true);
  const [practiceRound, setPracticeRound] = useState(0);
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
        if (practiceMode) {
          await pause(SLOT_SETTLE_MS);
          setSlots(practiceSlots(practiceRound));
          setPracticeRound((round) => round + 1);
          setMessage('Practice spin complete. No tokens were used.');
        } else {
          const [result] = await Promise.all([spinSlotsAction(wager, crypto.randomUUID()), pause(SLOT_SETTLE_MS)]);
          resolve(result);
        }
      } finally {
        setSlotSpinning(false);
      }
    });
  };

  const deal = (): void => {
    setTableDealing(true);
    setDealBeat(1);
    startTransition(async () => {
      try {
        const resultPromise = practiceMode ? null : dealBlackjackAction(wager, crypto.randomUUID());
        await pause(DEAL_BEAT_MS);
        setDealBeat(2);
        await pause(DEAL_BEAT_MS);
        setDealBeat(3);
        await pause(DEAL_BEAT_MS);
        setDealBeat(4);
        if (practiceMode) {
          setBlackjack(practiceHand());
          setMessage('Practice hand dealt. No tokens were used.');
        } else if (resultPromise !== null) {
          resolve(await resultPromise);
        }
      } finally {
        setTableDealing(false);
        setDealBeat(0);
      }
    });
  };

  const move = (action: 'HIT' | 'STAND'): void => {
    if (blackjack === null || blackjack.settled) return;
    setTableDealing(true);
    setDealBeat(action === 'HIT' ? 3 : 4);
    startTransition(async () => {
      try {
        await pause(DEAL_BEAT_MS * 2);
        if (practiceMode) {
          const player = action === 'HIT' ? [...blackjack.player, '3'] : blackjack.player;
          const playerValue = action === 'HIT' ? blackjack.playerValue + 3 : blackjack.playerValue;
          const outcome = playerValue > 21 ? 'LOSS' : action === 'STAND' ? 'WIN' : null;
          setBlackjack({
            ...blackjack,
            player,
            playerValue,
            dealer: outcome === null ? blackjack.dealer : ['9', '7'],
            dealerValue: outcome === null ? null : 16,
            settled: outcome !== null,
            outcome,
            payout: outcome === 'WIN' ? 0 : null,
          });
          setMessage(outcome === null ? 'Practice hit. Your call.' : 'Practice hand complete. No tokens were used.');
        } else {
          resolve(await blackjackAction(blackjack.id, action));
        }
      } finally {
        setTableDealing(false);
        setDealBeat(0);
      }
    });
  };

  const canPlay = (practiceMode || balance !== null) && !pending;
  const reelSymbols = slotSpinning
    ? ([0, 1, 2].map((offset) => SPIN_SYMBOLS[(reelTick * 2 + offset * 3) % SPIN_SYMBOLS.length]!) as readonly (keyof typeof REEL_ART)[])
    : (slots?.reels ?? ['TONY', 'TONY', 'TONY']);

  if (scene === 'room') {
    return <UndergroundRoom balance={balance} practiceMode={practiceMode} onPracticeMode={setPracticeMode} onEnter={setScene} />;
  }

  if (scene === 'slots') {
    return (
      <GameScreen balance={balance} practiceMode={practiceMode} message={message} onBack={() => setScene('room')} title="Bapple Slots" subtitle="Three reels. Fictional tokens only.">
        <div className="casino-slot-cabinet pixel-edge relative mx-auto w-full max-w-[360px] border-4 border-ink-900 bg-red-dark p-3 shadow-[5px_5px_0_var(--color-wood-dark)]">
          <span aria-hidden="true" className="casino-slot-bulb casino-slot-bulb--left" />
          <span aria-hidden="true" className="casino-slot-bulb casino-slot-bulb--right" />
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
        <button type="button" disabled={!canPlay} onClick={spin} className={`pixel-edge mx-auto mt-3 flex min-h-14 w-full max-w-[360px] items-center justify-center border-4 border-ink-900 bg-red-mid px-4 ${TYPE.action} text-paper-mid shadow-[4px_4px_0_var(--color-wood-dark)] disabled:opacity-50`}>
          {pending ? 'REELS SPINNING…' : practiceMode ? 'PRACTICE SPIN · ∞' : `SPIN · ${String(wager)} TOKENS`}
        </button>
      </GameScreen>
    );
  }

  return (
    <GameScreen balance={balance} practiceMode={practiceMode} message={message} onBack={() => setScene('room')} title="Tony’s Blackjack" subtitle="Pull up a chair. Tony deals.">
      <div className="casino-blackjack-table pixel-edge relative mx-auto min-h-[332px] w-full max-w-[390px] overflow-hidden border-4 border-wood-dark p-3 pt-24 shadow-[5px_5px_0_var(--color-wood-dark)]">
        <div className="casino-game-dealer pointer-events-none absolute top-1 left-1/2 z-10 h-28 w-28 -translate-x-1/2" aria-hidden="true">
          <AssetView resolution={resolveAsset('character_tony_dealer')} className="h-full w-full object-contain object-bottom" />
        </div>
        <span aria-hidden="true" className="casino-dealer-plaque absolute top-[89px] left-1/2 z-10 -translate-x-1/2">TONY DEALS</span>
        <div className="casino-table-card-zone relative z-20 pt-2">
          <CardRow roundId={blackjack?.id ?? 'new'} label="TONY" cards={blackjack?.dealer ?? []} value={blackjack?.dealerValue ?? null} dealing={tableDealing} dealBeat={dealBeat} hidden={blackjack?.dealerValue === null} />
          <div className="my-7 border-t-2 border-dashed border-paper-mid/60" />
          <CardRow roundId={blackjack?.id ?? 'new'} label="YOU" cards={blackjack?.player ?? []} value={blackjack?.playerValue ?? null} dealing={tableDealing} dealBeat={dealBeat} />
        </div>
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
          <button type="button" disabled={!canPlay} onClick={deal} className={`pixel-edge mx-auto mt-3 flex min-h-14 w-full max-w-[390px] items-center justify-center border-4 border-ink-900 bg-amber-mid px-4 ${TYPE.action} text-ink-900 shadow-[4px_4px_0_var(--color-wood-dark)] disabled:opacity-50`}>
            {pending ? 'TONY DEALS…' : practiceMode ? 'PRACTICE DEAL · ∞' : `DEAL · ${String(wager)} TOKENS`}
          </button>
        </>
      )}
    </GameScreen>
  );
}

function UndergroundRoom({ balance, practiceMode, onPracticeMode, onEnter }: { balance: number | null; practiceMode: boolean; onPracticeMode: (enabled: boolean) => void; onEnter: (scene: Scene) => void }) {
  return (
    <section className="casino-scene-enter pixel-edge relative isolate aspect-[320/569] w-full overflow-hidden border-2 border-wood-dark bg-ink-900" data-casino-floor="">
      <AssetView resolution={resolveAsset('zone_underground_shell')} className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute left-[7%] top-[5%] border-2 border-ink-900 bg-paper-mid px-2 py-1 text-ink-900 shadow-[2px_2px_0_#281414]">
        <p className={TYPE.eyebrow}>{practiceMode ? 'PRACTICE' : 'TOKENS'}</p><p className={`${TYPE.action} text-amber-deep`}>{practiceMode ? '∞' : balance === null ? '—' : String(balance)}</p>
      </div>
      <div className="casino-room-tony pointer-events-none absolute left-[38%] top-[43%] h-[25%] w-[25%]" aria-hidden="true">
        <AssetView resolution={resolveAsset('character_tony_blackjack_room')} className="h-full w-full object-contain object-bottom" />
      </div>
      <button type="button" onClick={() => onEnter('slots')} className="casino-room-hotspot absolute left-[1%] top-[29%] h-[31%] w-[29%]" aria-label="Play Bapple Slots">
        <span className={`casino-room-label ${TYPE.eyebrow}`}>BAPPLE SLOTS</span>
      </button>
      <button type="button" onClick={() => onEnter('blackjack')} className="casino-room-hotspot absolute left-[30%] top-[48%] h-[31%] w-[59%]" aria-label="Sit at Tony’s blackjack table">
        <span className={`casino-room-label ${TYPE.eyebrow}`}>SIT AT TABLE</span>
      </button>
      <div className="absolute bottom-[5%] left-1/2 w-[92%] -translate-x-1/2 border-2 border-ink-900 bg-ink-900/90 px-2 py-1 text-center text-paper-mid">
        <p className={TYPE.eyebrow}>TAP THE SLOT MACHINE OR BLACKJACK TABLE</p>
      </div>
      <button type="button" onClick={() => onPracticeMode(!practiceMode)} className={`absolute top-[5%] right-[5%] border-2 border-ink-900 bg-paper-mid px-2 py-1 ${TYPE.eyebrow} text-ink-900 shadow-[2px_2px_0_var(--color-wood-dark)]`}>
        PRACTICE {practiceMode ? 'ON' : 'OFF'}
      </button>
    </section>
  );
}

function GameScreen({ balance, practiceMode, message, onBack, title, subtitle, children }: { balance: number | null; practiceMode: boolean; message: string; onBack: () => void; title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="casino-game-room casino-scene-enter pixel-edge min-h-[569px] overflow-hidden border-2 border-wood-dark p-3 text-paper-mid" data-casino-floor="">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onBack} className={`pixel-edge min-h-10 border-2 border-ink-900 bg-paper-mid px-2 ${TYPE.eyebrow} text-ink-900 active:translate-y-px`}>← ROOM</button>
        <div className="min-w-0 text-right"><p className={TYPE.boardHero}>{title}</p><p className={`${TYPE.bodyCompact} text-paper-mid/85`}>{subtitle}</p></div>
      </div>
      <p className={`mt-3 border-2 border-ink-900 bg-ink-900/90 px-3 py-2 ${TYPE.bodyCompact} text-paper-mid`} aria-live="polite">{message}</p>
      <div className="mt-5">{children}</div>
      <p className={`mt-5 text-center ${TYPE.eyebrow} text-paper-mid/80`}>{practiceMode ? 'PRACTICE TABLE · UNLIMITED TEST TOKENS · NOT SAVED' : balance === null ? 'TOKEN TAB CLOSED' : `${String(balance)} TOKENS ON HAND`}</p>
    </section>
  );
}

function WagerTray({ wager, pending, onWager }: { wager: (typeof UNDERGROUND_WAGERS)[number]; pending: boolean; onWager: (wager: (typeof UNDERGROUND_WAGERS)[number]) => void }) {
  return <div className="mt-5 flex justify-center gap-2" aria-label="Choose wager">{UNDERGROUND_WAGERS.map((chip) => <button key={chip} type="button" disabled={pending} aria-pressed={wager === chip} onClick={() => onWager(chip)} className={`${CHIP} ${TYPE.action} ${wager === chip ? 'border-amber-glow bg-amber-mid text-ink-900' : 'border-ink-900 bg-paper-mid text-ink-900'}`}>{String(chip)}</button>)}</div>;
}

function CardRow({ roundId, label, cards, value, dealing, dealBeat, hidden = false }: { roundId: string; label: string; cards: readonly string[]; value: number | null; dealing: boolean; dealBeat: number; hidden?: boolean }) {
  const requiredBeat = label === 'TONY' ? 1 : 2;
  const preview = dealing && dealBeat >= requiredBeat;
  const visible = cards.length === 0 ? preview ? ['?', '?'] : [] : hidden ? [cards[0] ?? '?', '??'] : cards;
  return <div><div className="flex min-h-14 items-center justify-between gap-2"><span className={`${TYPE.eyebrow} text-paper-mid`}>{label}{value === null ? '' : ` · ${String(value)}`}</span><div className="flex min-h-12 justify-end gap-1">{visible.map((card, index) => <span key={cardKey(roundId, card, index)} className={`casino-card flex h-11 min-w-9 items-center justify-center border-2 border-ink-900 bg-paper-white px-1 ${TYPE.eyebrow} text-ink-900 ${dealing ? 'casino-card-dealt' : ''}`} style={dealing ? { animationDelay: `${String(index * 90)}ms` } : undefined}>{card}</span>)}</div></div></div>;
}
