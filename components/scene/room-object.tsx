'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';

import { useArrival } from '@/components/scene/arrival';
import { place, reachable, type Hotspot, type Shape } from '@/lib/parlor/hotspots';

/**
 * Things in the room you can touch.
 *
 * The parlor has no tab bar. You get to the Slice by looking at the poster
 * frame by the window and to your collection by looking in the case on the
 * counter, which only works if a first-time visitor can tell those are things
 * rather than scenery.
 *
 * ## How they announce themselves
 *
 * Three ways, in descending order of how much of the room they cost:
 *
 *   1. **On arrival**, once per session, every interactive object takes a thin
 *      warm edge and breathes twice, then goes quiet. This is the introduction;
 *      it is not a state the room lives in.
 *   2. **On touch or focus**, the same edge appears for as long as the contact
 *      lasts — the answer to "is this a thing?" arrives when the question is
 *      asked.
 *   3. **On request**, a small control by the counter brings the edges back for
 *      a few seconds.
 *
 * Nothing glows, nothing pulses forever, and the edge follows the object: a
 * frame gets a frame, the case gets the case, Tony gets a soft pool of light
 * because a rectangle drawn around a person is a button with a man inside it.
 *
 * ## Underneath, they are ordinary controls
 *
 * Every one is a real `<button>` or `<a>` carrying a real label, in the tab
 * order, with a visible focus treatment. The environmental styling is on top of
 * that, never instead of it.
 */

/** The edge itself. Drawn to the object's shape, never as a web button. */
function Outline({ shape }: { shape: Shape }) {
  if (shape === 'figure') {
    // Tony gets a ring rather than a box: a rectangle drawn around a person is
    // a button with a man inside it. An ellipse hugging his head and shoulders
    // is the shape of the person, and it survives the wall behind him — which a
    // soft warm wash does not, because the wall is already warm.
    return (
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-1.5 -inset-y-1 rounded-[50%]"
        style={{
          border: '1.5px solid rgba(255,231,180,0.9)',
          boxShadow: '0 0 9px rgba(255,217,138,0.5), inset 0 0 16px rgba(255,217,138,0.22)',
        }}
      />
    );
  }

  const radius = {
    frame: 'rounded-[2px]',
    case: 'rounded-[3px]',
    opening: 'rounded-[7px]',
  }[shape];

  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${radius}`}
      style={{
        // A line of warm light sitting on the object's own edge, a breath of it
        // falling outside, and the faintest wash within so that a dark object
        // still reads as picked out rather than merely bordered.
        boxShadow:
          'inset 0 0 0 1.5px rgba(255,217,138,0.85), inset 0 0 7px rgba(255,217,138,0.22), 0 0 6px rgba(255,217,138,0.28)',
        backgroundColor: 'rgba(255,217,138,0.10)',
      }}
    />
  );
}

/**
 * The shared body of every interactive object.
 *
 * ## The outline is on the object, not on the tap area
 *
 * The two are different rectangles on purpose. A picture frame on a wall is
 * about 25px across and a thumb is not, so the region that *responds* is grown
 * to 46px while the region that is *drawn* stays exactly the size of the frame.
 * Lighting the grown box instead would put a glowing rectangle of wall around
 * every small object — which is precisely the "oversized hotspot" look the room
 * is trying not to have.
 *
 * `revealed` is the room-wide introduction; `:focus-visible` and `:active` are
 * the per-object answer. Both use the same edge, so learning it once is enough.
 */
function Marker({ spot }: { spot: Hotspot }) {
  const { revealed } = useArrival();
  const box = reachable(spot.rect);

  return (
    <span
      aria-hidden="true"
      className={`absolute opacity-0 transition-opacity duration-300 group-active:opacity-100 group-focus-visible:opacity-100 ${
        revealed ? 'room-reveal opacity-100' : ''
      }`}
      style={{
        left: `${(((spot.rect.x - box.x) / box.width) * 100).toFixed(3)}%`,
        top: `${(((spot.rect.y - box.y) / box.height) * 100).toFixed(3)}%`,
        width: `${((spot.rect.width / box.width) * 100).toFixed(3)}%`,
        height: `${((spot.rect.height / box.height) * 100).toFixed(3)}%`,
      }}
    >
      <Outline shape={spot.shape} />
    </span>
  );
}

export function RoomObject({
  spot,
  title,
  children,
}: {
  spot: Hotspot;
  /** Heading inside the opened sheet. */
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
        onClick={() => {
          setOpen(true);
        }}
        aria-label={spot.label}
        aria-haspopup="dialog"
        className="group absolute z-30 cursor-pointer outline-none"
        style={place(reachable(spot.rect))}
      >
        <Marker spot={spot} />
      </button>

      {open && (
        <Sheet
          title={title}
          onClose={() => {
            setOpen(false);
            // Back to the object you picked up, not to the top of the room.
            trigger.current?.focus();
          }}
        >
          {children}
        </Sheet>
      )}
    </>
  );
}

/** A part of the room that leads somewhere rather than opening in place. */
export function RoomLink({ spot }: { spot: Hotspot }) {
  if (spot.href === undefined) throw new Error(`${spot.id} leads nowhere`);

  return (
    <Link
      href={spot.href}
      aria-label={spot.label}
      className="group absolute z-30 outline-none"
      style={place(reachable(spot.rect))}
    >
      <Marker spot={spot} />
    </Link>
  );
}

/**
 * What an object opens into.
 *
 * A sheet rather than a page: the room does not go away, it sits behind the
 * thing you picked up. Its contents scroll on their own, which is how a full
 * receipt can exist without the restaurant becoming a scrolling document.
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
        * tab order: the sheet already has a real Close control and Escape, and a
        * second thing announcing itself as "Close" only makes the dialog noisier
        * to hear.
        */}
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-ink-900/55" />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className="sheet-rise relative max-h-[76dvh] overflow-y-auto rounded-t-[10px] border-t-2 border-wood-dark bg-paper-mid text-ink-900 shadow-[0_-10px_30px_rgba(0,0,0,0.55)] outline-none"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-wood-dark/25 bg-paper-mid px-5 pt-3.5 pb-2.5">
          <h2
            id={headingId}
            className="font-mono text-[11px] font-bold tracking-[0.22em] text-ink-900/80 uppercase"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[3px] px-1 text-[13px] font-semibold text-ink-500 active:bg-paper-dark"
          >
            Close
          </button>
        </div>

        <div className="px-5 pt-4">{children}</div>
      </div>
    </div>
  );
}
