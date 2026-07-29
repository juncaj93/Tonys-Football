'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';

import { useArrival } from '@/components/scene/arrival';
import { ROOM, place, reachable, type Hotspot, type Shape } from '@/lib/parlor/hotspots';

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
    // Tony gets light on the counter in front of him, not an outline around
    // him. Two reasons. A rectangle drawn around a person is a button with a
    // man inside it — and any closed shape big enough to contain him is also
    // big enough to sit over his face, the wall logo, and half the back bar,
    // which is exactly the "large ring obscuring the art" the room is trying to
    // avoid. A pool of light where somebody is standing says the same thing and
    // covers nothing that matters.
    //
    // He also lifts two pixels while this is showing; that is on `.tony-mark`
    // in the stylesheet, because it moves the sprite rather than the hotspot.
    return (
      <>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[6%] bottom-0 h-[9%] translate-y-1/2 rounded-[50%]"
          style={{
            background:
              'radial-gradient(closest-side, rgba(255,231,180,0.8), rgba(255,217,138,0.32) 55%, transparent)',
          }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[14%] bottom-0 h-[26%]"
          style={{
            background: 'linear-gradient(to top, rgba(255,217,138,0.22), transparent)',
          }}
        />
      </>
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
      <FocusLabel spot={spot} />
    </span>
  );
}

/**
 * The glint.
 *
 * The room's edges only appear on arrival, on touch, on focus, or on request —
 * which is restrained, and was too restrained: half a minute after walking in,
 * the parlor gave no sign at all of which parts of it were things. This is what
 * a point-and-click game does instead: a few pixels of light that catch on
 * anything you can pick up, slowly, forever.
 *
 * Four pixels, in the object's top-right corner, drifting between barely there
 * and clearly there on a long cycle. Each object is offset from the next so
 * they never blink in unison, which is what would turn a quiet room into an
 * attract screen. Under `prefers-reduced-motion` it holds still at a legible
 * opacity rather than pulsing — the information stays, the movement goes.
 *
 * It sits *outside* the reveal marker on purpose: the marker is a state the
 * room enters and leaves, and this is simply true the whole time.
 */
function Glint({ spot, index }: { spot: Hotspot; index: number }) {
  // Anchored to the *object*, not to the tap box around it. The two differ by
  // up to 10px on the small wall frames, which is enough for the glint to float
  // in the middle of the wallpaper beside the thing it is pointing at.
  const box = reachable(spot.rect);
  const right = ((box.x + box.width - (spot.rect.x + spot.rect.width)) / box.width) * 100;
  // A person's mark sits at the shoulder. On everything else it sits on the
  // top corner, the way a highlight catches the edge of an object.
  const down = spot.shape === 'figure' ? spot.rect.height * 0.34 : 0;
  const top = ((spot.rect.y + down - box.y) / box.height) * 100;

  return (
    <span
      aria-hidden="true"
      className="room-glint pointer-events-none absolute"
      style={{
        right: `calc(${right.toFixed(3)}% - 3px)`,
        top: `calc(${top.toFixed(3)}% - 3px)`,
        // Staggered by object, so the room shimmers rather than flashing.
        animationDelay: `${String(index * 760)}ms`,
      }}
    />
  );
}

/**
 * What this object is, for somebody arriving by keyboard.
 *
 * A pointing device gets to hover and tap and find out; a keyboard gets a ring
 * of light and no idea what is inside it. The name is already on the control
 * for a screen reader, so this is the same information made visible — and only
 * on `:focus-visible`, which means it appears for the keyboard and never for a
 * thumb. Nothing is permanently labelled; the room stays a room.
 */
function FocusLabel({ spot }: { spot: Hotspot }) {
  // Objects on the right of the room hang their label off their right edge, or
  // it would be cut off by the wall.
  const nearRight = spot.rect.x + spot.rect.width / 2 > ROOM.width * 0.7;

  return (
    <span
      className={`pointer-events-none absolute top-full mt-1.5 rounded-[2px] border border-amber-mid/30 bg-ink-900/95 px-1.5 py-1 font-display text-[9px] leading-[1.5] whitespace-nowrap text-paper-mid opacity-0 group-focus-visible:opacity-100 ${
        nearRight ? 'right-0' : 'left-0'
      }`}
    >
      {spot.label}
    </span>
  );
}

export function RoomObject({
  spot,
  index,
  title,
  children,
}: {
  spot: Hotspot;
  /** Position in the room, used only to stagger the glint. */
  index: number;
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
        <Glint spot={spot} index={index} />
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
export function RoomLink({ spot, index }: { spot: Hotspot; index: number }) {
  if (spot.href === undefined) throw new Error(`${spot.id} leads nowhere`);

  return (
    <Link
      href={spot.href}
      aria-label={spot.label}
      className="group absolute z-30 outline-none"
      style={place(reachable(spot.rect))}
    >
      <Marker spot={spot} />
      <Glint spot={spot} index={index} />
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

      {/*
        * The sheet itself, built from the house surfaces rather than from a
        * rounded card with a 30px blurred shadow. Hard top edge, square
        * corners, a stepped bevel — the same material as every panel in the
        * shop, so opening something does not feel like leaving it.
        */}
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className="sheet-rise relative max-h-[76dvh] overflow-y-auto border-t-2 border-wood-dark bg-paper-mid text-ink-900 shadow-[0_-4px_0_rgba(0,0,0,0.45)] outline-none"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}
      >
        {/* The strip of light the counter throws onto whatever you pick up. */}
        <div aria-hidden="true" className="sticky top-0 z-20 h-[2px] bg-amber-mid/45" />

        <div className="sticky top-[2px] z-10 flex items-center justify-between gap-3 border-b-2 border-wood-dark/30 bg-paper-mid px-4 pt-3 pb-2.5">
          <h2
            id={headingId}
            className="font-display text-[10px] leading-[1.6] text-ink-900/80 uppercase"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="pixel-edge flex min-h-[44px] shrink-0 items-center justify-center border-2 border-wood-dark/50 bg-paper-dark/50 px-3.5 font-display text-[10px] leading-[1.6] text-ink-700 uppercase active:translate-y-px"
          >
            Close
          </button>
        </div>

        <div className="px-4 pt-4">{children}</div>
      </div>
    </div>
  );
}
