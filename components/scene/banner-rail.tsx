'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';

import { roomObjectAttributes } from '@/components/scene/room-object';
import { AssetView } from '@/lib/assets/placeholder';
import { resolveAsset } from '@/lib/assets/registry';
import { type Banner } from '@/lib/parlor/champions';
import { BANNER, ROOM, bannerPartitions, place, roomObject } from '@/lib/parlor/objects';

/**
 * The championship rail.
 *
 * Six fixed slots. **Each occupied banner is its own button** — not one
 * row-wide target — because "which season is that one?" is a question about a
 * specific banner, and a single target that opens a list makes you ask it
 * twice.
 *
 * ## Unoccupied slots render nothing
 *
 * Not a faded banner, not an outline, not a disabled button: **nothing**. An
 * empty button is a thing you can tab to that does not do anything, which is
 * worse than an absence. Slots 4–6 in 2026 are simply bare rail.
 *
 * ## The year is drawn, the name is not
 *
 * The fabric is 18 × 15 logical units. Two digits fit; a name does not, at any
 * size worth reading. So the year is HTML over the pennant and the champion's
 * name lives in the panel — which is also what keeps historical names fixable
 * without regenerating art every January.
 */

/** The two-digit year, sized to the pennant rather than to the viewport. */
function Year({ label }: { label: string }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-start justify-center font-display text-paper-light"
      style={{
        // Proportional to the room, so it scales with the art rather than
        // drifting off the fabric on a wider phone.
        fontSize: `${((7 / ROOM.height) * 100).toFixed(3)}cqh`,
        paddingTop: `${((3 / BANNER.height) * 100).toFixed(1)}%`,
        textShadow: '0 1px 0 rgba(0,0,0,0.55)',
      }}
    >
      {label}
    </span>
  );
}

export function BannerRail({ banners }: { banners: readonly Banner[] }) {
  const [openSlot, setOpenSlot] = useState<number | null>(null);
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);
  const partitions = bannerPartitions();
  const open = openSlot === null ? null : banners[openSlot];
  // The rail's own entry in the object map. Every partition below reports as
  // this one Display.
  const rail = roomObject('banners');

  return (
    <>
      {banners.map((banner, index) => {
        const partition = partitions[index];
        const slot = BANNER.slots[index];
        if (partition === undefined || slot === undefined) return null;

        return (
          <button
            key={banner.year}
            ref={(node) => {
              triggers.current[index] = node;
            }}
            type="button"
            aria-haspopup="dialog"
            aria-label={
              banner.current
                ? `${String(banner.year)} season — still being played`
                : `${String(banner.year)} champion`
            }
            onClick={() => {
              setOpenSlot(index);
            }}
            style={place(partition)}
            className="room-shape absolute z-30 outline-none"
            // The rail is ONE Display in the object map, rendered as one button
            // per occupied slot. `data-room-partition` is what tells the
            // `object-map` gate that these six share an identity on purpose, so
            // it can keep rejecting genuine duplicates.
            {...roomObjectAttributes(rail, index)}
          >
            {/*
              * The pennant itself, inside the hit region. The image carries its
              * own alpha, so the affordance — when there is one — is a
              * drop-shadow on that alpha rather than a box drawn around it.
              */}
            <span
              aria-hidden="true"
              className="absolute"
              style={{
                left: `${(((slot - partition[0]) / partition[2]) * 100).toFixed(3)}%`,
                top: `${(((BANNER.top - partition[1]) / partition[3]) * 100).toFixed(3)}%`,
                width: `${((BANNER.width / partition[2]) * 100).toFixed(3)}%`,
                height: `${((BANNER.height / partition[3]) * 100).toFixed(3)}%`,
              }}
            >
              {/*
                * By slug, never by path. `AssetView` is what knows where the
                * file is and what to draw while it is still a placeholder —
                * swapping the art stays a registry row rather than an edit
                * here.
                */}
              <AssetView resolution={resolveAsset('object_champion_banner')} />
              <Year label={banner.label} />
            </span>
          </button>
        );
      })}

      {open !== undefined && open !== null && (
        <ChampionPanel
          banner={open}
          onClose={() => {
            const index = openSlot;
            setOpenSlot(null);
            if (index !== null) triggers.current[index]?.focus();
          }}
        />
      )}
    </>
  );
}

/**
 * What a banner opens into.
 *
 * The full four-digit season, the champion's canonical name, and a way through
 * to that season. It may cover part of the board while it is up — that is fine,
 * it is transient and dismissible — and it is a rectangular pixel-art panel,
 * which is allowed. The rule about not boxing things applies to objects sitting
 * inert in the room, not to a panel you deliberately opened.
 */
function ChampionPanel({ banner, onClose }: { banner: Banner; onClose: () => void }) {
  const headingId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panel.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-ink-900/55" />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className="pixel-edge relative w-full max-w-[300px] border-2 border-amber-mid bg-ink-900 px-5 pt-4 pb-5 text-paper-light outline-none"
      >
        <h2 id={headingId} className="font-display text-[10px] text-amber-mid uppercase">
          {String(banner.year)} season
        </h2>

        <p className="mt-2 font-display text-[17px] leading-[1.3]">
          {banner.champion ?? 'TBD'}
        </p>

        {banner.champion === null && (
          <p className="mt-1.5 text-[13px] leading-[1.45] text-paper-mid/70">
            {banner.current
              ? 'Still being played. Nobody has won it yet.'
              : 'Not finalized, so there is no champion on record.'}
          </p>
        )}

        <div className="mt-4 flex items-center gap-3">
          <Link
            href={`/timeline#${String(banner.year)}`}
            className="pixel-edge flex min-h-[44px] items-center border-2 border-amber-mid/60 px-3.5 font-display text-[10px] text-amber-light uppercase active:translate-y-px"
          >
            View season
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] items-center px-2 font-display text-[10px] text-paper-mid/60 uppercase"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
