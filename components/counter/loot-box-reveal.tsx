'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';

import { openBoxAction, type RevealPayload } from '@/app/actions/counter';
import { AssetView } from '@/lib/assets/placeholder';
import { type AssetResolution } from '@/lib/assets/types';
import { TYPE } from '@/lib/design/type';

type Phase = 'ready' | 'opening' | 'revealed' | 'lost';

/**
 * A box opening is its own little game scene. The prize never shares a layout
 * system with the parlor tray, which makes the focal box and the revealed item
 * occupy the exact same centred plinth every time.
 */
export function LootBoxReveal({
  boxId,
  boxAsset,
  preview = null,
}: {
  boxId: string | null;
  boxAsset: AssetResolution;
  preview?: RevealPayload | null;
}) {
  const [phase, setPhase] = useState<Phase>(preview === null ? 'ready' : 'revealed');
  const [reveal, setReveal] = useState<RevealPayload | null>(preview);
  const [beatOver, setBeatOver] = useState(preview !== null);
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (phase === 'opening' && beatOver && reveal !== null) setPhase('revealed');
  }, [beatOver, phase, reveal]);

  const open = (): void => {
    if (phase !== 'ready' || boxId === null) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setPhase('opening');
    setBeatOver(still);
    if (!still) timer.current = setTimeout(() => setBeatOver(true), 920);

    startTransition(async () => {
      const result = await openBoxAction(boxId);
      if (!result.ok) {
        setPhase('lost');
        return;
      }
      if (result.reveal.replayed) setBeatOver(true);
      setReveal(result.reveal);
    });
  };

  const ready = phase === 'ready';
  const opening = phase === 'opening';

  return (
    <main className="loot-reveal" data-lootbox-reveal={phase}>
      <div className="loot-reveal__sign" aria-hidden="true">
        <span className={TYPE.eyebrow}>TONY&apos;S COUNTER</span>
        <span className={TYPE.machine}>BOX ON THE BOARD</span>
      </div>

      <section className="loot-reveal__stage" aria-label="Pizza box opening">
        <span className="loot-reveal__lamp" aria-hidden="true" />
        <span className="loot-reveal__shelf loot-reveal__shelf--left" aria-hidden="true" />
        <span className="loot-reveal__shelf loot-reveal__shelf--right" aria-hidden="true" />
        <span className="loot-reveal__counter" aria-hidden="true" />

        <div className="loot-reveal__plinth">
          {opening && <span className="loot-reveal__glow" aria-hidden="true" />}
          {phase === 'revealed' && reveal !== null ? (
            <>
              <span className={`loot-reveal__burst rarity-${reveal.rarity}`} aria-hidden="true" />
              <span className="loot-reveal__pixels" aria-hidden="true">
                {Array.from({ length: 10 }, (_, index) => <i key={index} />)}
              </span>
              <div className={`loot-reveal__prize rarity-${reveal.rarity}`}>
                <AssetView resolution={reveal.asset} compact placeholder="collectible" />
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={open}
              className={`loot-reveal__box ${opening ? 'loot-reveal__box--opening' : ''}`}
              disabled={!ready}
              aria-label={opening ? 'Pizza box is opening' : 'Open your pizza box'}
            >
              <AssetView resolution={boxAsset} />
              {ready && <span className={`${TYPE.eyebrow} loot-reveal__prompt`}>TAP TO OPEN</span>}
            </button>
          )}
        </div>
      </section>

      {phase === 'revealed' && reveal !== null && <PrizeReceipt reveal={reveal} />}

      {phase === 'lost' && (
        <div role="status" className="loot-reveal__receipt pixel-edge">
          <p className={TYPE.body}>That box is no longer on the tray. Tony has the shelf waiting.</p>
          <Link href="/counter/collection" className={`${TYPE.eyebrow} mt-4 inline-flex min-h-[44px] items-center text-red-dark underline underline-offset-4`}>Look at the shelf</Link>
        </div>
      )}
    </main>
  );
}

function PrizeReceipt({ reveal }: { reveal: RevealPayload }) {
  return (
    <div role="status" className={`loot-reveal__receipt loot-reveal__receipt--${reveal.rarity} pixel-edge`}>
      <p className={`rarity-word ${TYPE.eyebrow}`}>{reveal.rarity}{reveal.salvageTokens !== null ? ' · SPARE' : ''}</p>
      <h1 className={`mt-2 ${TYPE.subhead} text-ink-900`}>{reveal.name}</h1>
      <p className={`mt-2 ${TYPE.bodyCompact} text-ink-700`}>
        {reveal.salvageTokens !== null
          ? `Tony gives you ${String(reveal.salvageTokens)} tokens for the spare.`
          : reveal.distinct === 1
            ? 'Your first thing on the shelf. It stays there.'
            : `${String(reveal.distinct)} of ${String(reveal.total)} collectibles found.`}
      </p>
      {reveal.unlockedWearable !== null && (
        <p className={`mt-2 border-t border-wood/30 pt-2 ${TYPE.bodyCompact} text-ink-900`}>
          Wardrobe unlocked: {reveal.unlockedWearable.name}.
        </p>
      )}
      {reveal.offer !== null && (
        <p className={`mt-3 border-t border-wood/30 pt-2 ${TYPE.bodyCompact} text-ink-700`}>
          <span className={TYPE.eyebrow}>Tony</span> {reveal.offer.line}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/counter/collection" className={`loot-reveal__action ${TYPE.eyebrow}`}>Put it on the shelf</Link>
        {reveal.offer !== null && <Link href="/counter" className={`loot-reveal__action loot-reveal__action--quiet ${TYPE.eyebrow}`}>Another box</Link>}
      </div>
    </div>
  );
}
