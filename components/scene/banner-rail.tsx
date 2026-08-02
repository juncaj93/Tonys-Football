'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';

import { TYPE } from '@/lib/design/type';
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

/**
 * The two-digit year, sized to the pennant rather than to the viewport.
 *
 * ## The one place in the product that is exempt from the type floor
 *
 * `lib/design/type.ts` owns every font size and `TYPE_FLOOR_PX` is 13. This is
 * not a role and it is not 13px, and both of those are deliberate.
 *
 * The year is **painted onto an 18 × 15 unit pennant**. It has to scale with the
 * artwork, so it is set in container-query units derived from `ROOM.height` — a
 * fixed pixel size would make the digits grow relative to the fabric on a wider
 * phone and slide off it. And the fabric caps how large it can be: nine units of
 * a fifteen-unit pennant, under three units of headroom, is **10.1 CSS px at
 * 360** and there is no arrangement of that geometry that reaches thirteen.
 *
 * That is acceptable here and nowhere else, because it is not copy. It is a
 * two-digit mark on a hanging banner, the champion's *name* lives in the panel
 * that opens (see the note above), and `lib/parlor/hotspots.test.ts` guarantees
 * every screen is reachable without reading it.
 *
 * So the exemption is **declared in the DOM** rather than assumed:
 * `data-environmental-type` is what `checkTypeFloor` in `scripts/visual-qa.mts`
 * skips, and the driver fails if a second kind of it ever appears. The static
 * half of the same rule is the `ENVIRONMENTAL` list in
 * `lib/design/typography.test.ts`, which names this file and this reason.
 *
 * Seven units to nine is this slice's one change to it: the same proportion of
 * the same pennant, 8.2px to 10.1px at the narrowest width, still clear of the
 * fabric's taper.
 */
function Year({ label }: { label: string }) {
  return (
    <span
      aria-hidden="true"
      data-environmental-type="banner-year"
      className="pointer-events-none absolute inset-0 flex items-start justify-center font-display text-paper-mid"
      style={{
        // Proportional to the room, so it scales with the art rather than
        // drifting off the fabric on a wider phone.
        fontSize: `${((9 / ROOM.height) * 100).toFixed(3)}cqh`,
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
        className="pixel-edge relative w-full max-w-[300px] border-2 border-amber-mid bg-ink-900 px-5 pt-4 pb-5 text-paper-mid outline-none"
      >
        <h2 id={headingId} className={`${TYPE.eyebrow} text-amber-mid`}>
          {String(banner.year)} season
        </h2>

        <p className={`mt-2 ${TYPE.subhead}`}>
          {banner.champion ?? 'TBD'}
        </p>

        {banner.champion === null && (
          <p className={`mt-2 ${TYPE.bodyCompact} text-paper-mid/70`}>
            {banner.current
              ? 'Still being played. Nobody has won it yet.'
              : 'Not finalized, so there is no champion on record.'}
          </p>
        )}

        <div className="mt-4 flex items-center gap-3">
          <Link
            href={`/timeline#${String(banner.year)}`}
            className={`pixel-edge flex min-h-[44px] items-center border-2 border-amber-mid/60 px-3.5 ${TYPE.action} text-amber-glow active:translate-y-px`}
          >
            View season
          </Link>
          <button
            type="button"
            onClick={onClose}
            className={`flex min-h-[44px] items-center px-2 ${TYPE.action} text-paper-mid/60`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
