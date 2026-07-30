'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';

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
 * A Door: it goes somewhere.
 *
 * The anchor *is* the hit region — positioned and sized in room units — rather
 * than a full-bleed element with a shape inside it. Keyboard focus lands on it
 * naturally and the focus ring follows the same rectangle.
 */
export function RoomDoor({ spec }: { spec: RoomObjectSpec }) {
  if (spec.href === undefined) throw new Error(`${spec.id} is a Door with nowhere to go`);

  return (
    <Link
      href={spec.href}
      aria-label={`${spec.label} — ${spec.destination ?? ''}`.trim()}
      style={place(spec.rect)}
      className="room-shape absolute z-30 outline-none"
    />
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
    />
  );
}

/**
 * What a Display opens into.
 *
 * The room does not go away; it sits behind the thing you picked up, and the
 * contents scroll on their own.
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
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/*
        * Putting the thing down again. Deliberately not a button and not in the
        * tab order: the sheet already has a real Close control and Escape.
        */}
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-ink-900/55" />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className="sheet-rise relative max-h-[76dvh] overflow-y-auto border-t-2 border-wood-dark bg-paper-mid text-ink-900 shadow-[0_-4px_0_rgba(0,0,0,0.45)] outline-none"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}
      >
        <div aria-hidden="true" className="sticky top-0 z-20 h-[2px] bg-amber-mid/45" />

        <div className="sticky top-[2px] z-10 flex items-center justify-between gap-3 border-b-2 border-wood-dark/30 bg-paper-mid px-4 pt-4 pb-3.5">
          <h2 id={headingId} className="font-display text-[15px] leading-[1.4] text-ink-900 uppercase">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="pixel-edge flex min-h-[44px] shrink-0 items-center justify-center border-2 border-wood-dark/50 bg-paper-dark/50 px-3.5 font-display text-[11px] leading-[1.5] text-ink-700 uppercase active:translate-y-px"
          >
            Close
          </button>
        </div>

        <div className="px-4 pt-5">{children}</div>
      </div>
    </div>
  );
}
