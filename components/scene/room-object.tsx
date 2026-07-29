'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';

import { ROOM, points, type RoomObjectSpec } from '@/lib/parlor/objects';

/**
 * The things in the room, and the shape of each one.
 *
 * ## The hit region is the object, not a box around it
 *
 * Every interactive object is an SVG polygon traced along the thing itself,
 * drawn in the room's own 320 x 569 coordinates over the art. The polygon takes
 * the taps (`pointer-events: fill`) and the element wrapping it does not
 * (`pointer-events: none`), so a tap lands only inside the outline. Tapping the
 * wall an inch from the display case does nothing, which the old rectangles
 * could not manage.
 *
 * That one decision covers three of the ruling's requirements at once: the glow
 * follows the silhouette because it *is* the silhouette, the hit region matches
 * what a person believes they are tapping, and neighbours cannot overlap
 * because polygons do not.
 *
 * No tracing infrastructure was added. The outlines are four to six points each,
 * read off the drawing by eye and checked by `lib/parlor/objects.test.ts` for
 * size, containment and separation — which is simpler than any automated path
 * extraction and, at this number of objects, more accurate.
 *
 * ## Only Doors glow
 *
 * A Door goes somewhere and says so, permanently. A Display is read in place
 * and a Toy answers back; neither advertises, because neither is a way out of
 * the room. Scenery is not here at all.
 */

const VIEW_BOX = `0 0 ${String(ROOM.width)} ${String(ROOM.height)}`;

/*
 * The affordance is a wash inside the shape, a hard dark contour, and a bright
 * edge over both. No blur — a blurred glow beside quantized pixel art is exactly
 * the seam this style exists to avoid. `non-scaling-stroke` keeps the strokes at
 * their authored pixel width however far the room is scaled.
 */

/** An interactive shape: the tap region, and optionally the glow on it. */
function Shape({ spec, glow }: { spec: RoomObjectSpec; glow: boolean }) {
  const d = points(spec);

  return (
    <svg
      aria-hidden="true"
      viewBox={VIEW_BOX}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
    >
      {/*
        * Three passes: the object lights, then a constant dark contour, then the
        * bright edge on top. A warm hairline on its own vanished against the lit
        * glass of the display case — see `globals.css`.
        *
        * A Door carries this permanently. A Display or a Toy carries the same
        * treatment but hidden, and "look around" fades it in for a few seconds —
        * the outlines are identical because they mean the same thing ("this
        * responds"); what differs is whether the room says it unprompted.
        */}
      <g className={glow ? undefined : 'affordance-on-request'}>
        <polygon className="door-wash" points={d} />
        <polygon className="door-shadow" points={d} vectorEffect="non-scaling-stroke" />
        <polygon className="door-edge" points={d} vectorEffect="non-scaling-stroke" />
      </g>
      {/* The hit region. Invisible, exactly the object's shape. */}
      <polygon points={d} fill="transparent" className="pointer-events-auto cursor-pointer" />
    </svg>
  );
}

/**
 * A Door: it goes somewhere, and it is the only kind that advertises.
 *
 * The anchor covers the room but takes no pointer events; the polygon inside it
 * does, and the click bubbles up. Keyboard focus still lands on the anchor —
 * `pointer-events` has no bearing on the tab order — and lights the same glow.
 */
export function RoomDoor({ spec }: { spec: RoomObjectSpec }) {
  if (spec.href === undefined) throw new Error(`${spec.id} is a Door with nowhere to go`);

  return (
    <Link
      href={spec.href}
      aria-label={`${spec.label} — ${spec.destination ?? ''}`.trim()}
      className="room-shape pointer-events-none absolute inset-0 z-30 outline-none"
    >
      <Shape spec={spec} glow />
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
        className="room-shape pointer-events-none absolute inset-0 z-30 outline-none"
      >
        <Shape spec={spec} glow={false} />
      </button>

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
      className="room-shape pointer-events-none absolute inset-0 z-30 outline-none"
    >
      <Shape spec={spec} glow={false} />
    </button>
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
