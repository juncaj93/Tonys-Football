'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';

import { TYPE } from '@/lib/design/type';
import { place, type RoomObjectSpec } from '@/lib/parlor/objects';

/**
 * The things in the room, and how a tap reaches them.
 *
 * ## Nothing here is drawn
 *
 * An earlier version traced each object as an SVG polygon and painted a wash, a
 * contour and a bright edge along it. That is withdrawn (`18 §9.4`), and the
 * replacement is better for a reason worth keeping in view: **an authored
 * outline goes stale the moment the art is regenerated, silently, and nothing
 * fails.** A traced polygon is a second copy of the artwork's shape, maintained
 * by hand, with no mechanism that notices when the two disagree.
 *
 * So the glow is now `filter: drop-shadow()` applied to an **overlay's own
 * alpha channel** — it follows the silhouette because it *is* the silhouette,
 * and it updates itself when a placeholder is swapped for final art. That lives
 * with the overlay, on the page, not here.
 *
 * What is left here is the hit region, and hit regions are invisible. They can
 * be plain rectangles, padded out to a comfortable 44 units, because nobody
 * ever sees their edges. The rule "no visible rectangles around room objects"
 * is about the glow — and the glow no longer comes from this file.
 *
 * ## Which means most of the room never glows, correctly
 *
 * The board, the sign, the receipt, the tray and the doorway are baked into the
 * shell. They have no overlay, so no alpha, so nothing to glow — and in V1 that
 * is exactly right: Displays never glow by rule, and the two baked Doors have
 * nothing to announce yet. A Door glows only when it has something to say.
 */

/**
 * How the object map is counted at runtime.
 *
 * Every interactive object in the room carries `data-room-object` (its id) and
 * `data-room-kind`. `npm run visual:qa`'s `object-map` gate reads these and
 * asserts the rendered set against `ROOM_OBJECTS` — the whole map, not a count
 * of anchors.
 *
 * ## Why not just count `<a href>` like the gate used to
 *
 * Because one Door legitimately stops being an anchor. The tray is a Door, and
 * when a box is owned it **opens at the tray, in place** (`18 §4.1`) rather than
 * navigating — so it renders as a button. Counting anchors would have read that
 * as "a Door went missing", and the obvious way to make the gate pass again
 * would have been to route to `/counter` first, which is the exact defect the
 * ruling names.
 *
 * So the marker is the object's identity rather than its HTML tag. That is also
 * a stronger gate: it catches a Door quietly becoming a Display, an object
 * disappearing, and a ninth object appearing — none of which an anchor count
 * sees.
 *
 * ## Partitioned objects
 *
 * One object may be several targets. The banner rail is a single Display whose
 * row is divided into six real DOM buttons, because "which season is that one?"
 * is a question about a specific banner. Those buttons additionally carry
 * `data-room-partition`, which is how the gate knows six elements sharing one id
 * are one object rather than five duplicates.
 *
 * The distinction is the point: without it, the gate would either reject the rail
 * or have to stop checking for duplicates — and a genuinely duplicated object
 * doubles a tap target invisibly.
 */
export function roomObjectAttributes(
  spec: RoomObjectSpec,
  /** Index within a partitioned object, e.g. a banner slot. */
  partition?: number,
): Record<string, string> {
  return {
    'data-room-object': spec.id,
    'data-room-kind': spec.kind,
    ...(partition === undefined ? {} : { 'data-room-partition': String(partition) }),
  };
}

/**
 * A Door: it goes somewhere.
 *
 * The anchor *is* the hit region — positioned and sized in room units — rather
 * than a full-bleed element with a shape inside it. Keyboard focus lands on it
 * naturally and the focus ring follows the same rectangle.
 */
export function RoomDoor({ spec, children }: { spec: RoomObjectSpec; children?: React.ReactNode }) {
  if (spec.href === undefined) throw new Error(`${spec.id} is a Door with nowhere to go`);

  return (
    <Link
      href={spec.href}
      aria-label={`${spec.label} — ${spec.destination ?? ''}`.trim()}
      style={place(spec.rect)}
      className="room-shape absolute z-30 outline-none"
      {...roomObjectAttributes(spec)}
    >
      {children}
    </Link>
  );
}

/** A Display: read in place, over the room. No route, no glow. */
export function RoomDisplay({
  spec,
  title,
  children,
}: {
  spec: RoomObjectSpec;
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={spec.label}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
        }}
        style={place(spec.rect)}
        className="room-shape absolute z-30 outline-none"
        {...roomObjectAttributes(spec)}
      />

      {open && (
        <Sheet
          title={title}
          onClose={() => {
            setOpen(false);
            trigger.current?.focus();
          }}
        >
          {children}
        </Sheet>
      )}
    </>
  );
}

/** A Toy: it answers. No route, no glow, and it is not a way out of the room. */
export function RoomToy({ spec, onTap }: { spec: RoomObjectSpec; onTap: () => void }) {
  return (
    <button
      type="button"
      aria-label={spec.label}
      onClick={onTap}
      style={place(spec.rect)}
      className="room-shape absolute z-30 outline-none"
      {...roomObjectAttributes(spec)}
    />
  );
}

/**
 * What a Display opens into.
 *
 * ## It was a bottom sheet, and that was the wrong idiom
 *
 * This used to be a full-width cream slab pinned to the bottom edge at
 * `max-h-[76dvh]`, sliding up over the room. Everything about it was competent
 * and none of it belonged: a sheet that spans the viewport and covers
 * three-quarters of the screen is the gesture language of a phone app with a
 * themed background, and it made the parlor into that background. Tapping the
 * receipt should feel like picking a piece of paper off a counter, not like
 * summoning an action sheet.
 *
 * So it is now **a thing lying on the counter, in front of the room**: sized to
 * its contents, centred in the room's own column rather than the viewport's,
 * pixel-bevelled like every other surface in the shop, and never taller than it
 * needs to be. It shares its material with Tony's speech box and the champion
 * panel, so all three transient surfaces read as one shop rather than three
 * component libraries.
 *
 * The room stays visible behind it, dimmed. That is deliberate — a panel you
 * opened is allowed to sit over the art (`18 §7.2.4`); a panel that *replaces*
 * the art has taken the room away.
 */
function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/*
        * Putting the thing down again. Deliberately not a button and not in the
        * tab order: the panel already has a real Close control and Escape.
        */}
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-ink-900/60" />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className="panel-rise pixel-edge relative w-full max-w-[19.5rem] border-2 border-wood-dark bg-paper-mid text-ink-900 outline-none"
      >
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-amber-mid/45" />

        <div className="flex items-start justify-between gap-3 px-3.5 pt-3.5 pb-2.5">
          <h2
            id={headingId}
            className={`${TYPE.eyebrow} text-ink-700`}
          >
            {title}
          </h2>
          {/*
            * A pixel cross, not a labelled button. The panel is small enough
            * that a word-sized `CLOSE` control was the second-loudest thing in
            * it; Escape and the scrim do the same job without the furniture.
            * 44px of hit area around a 12px mark.
            */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-2.5 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center active:translate-y-px"
          >
            <span aria-hidden="true" className="relative block h-3 w-3 opacity-70">
              <span className="absolute top-1/2 left-0 h-[2px] w-full rotate-45 bg-ink-700" />
              <span className="absolute top-1/2 left-0 h-[2px] w-full -rotate-45 bg-ink-700" />
            </span>
          </button>
        </div>

        <div
          className="max-h-[52dvh] overflow-y-auto px-3.5 pb-4"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) * 0.5 + 1rem)' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
