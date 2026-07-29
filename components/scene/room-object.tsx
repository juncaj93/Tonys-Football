'use client';

import { useEffect, useId, useRef, useState } from 'react';

/**
 * Things in the room you can tap.
 *
 * The parlor is one screen, so it cannot also be a page of stacked cards. What
 * would have been a section is now an **object**: the case, the notice on the
 * wall, the docket on the counter. Tapping one opens its contents over the
 * room, and the room stays where it was.
 *
 * ## Not app chrome
 *
 * A hotspot gets two faint corner ticks and nothing else — no glow, no ring, no
 * floating circle. They read as a mark on a photograph rather than a button
 * pasted over one. The full outline only appears while the object is being
 * pressed or is keyboard-focused, which is when a person is asking "is this a
 * thing?" rather than looking at the room.
 *
 * Every hotspot is a real `<button>` with a real label, so the scene is
 * navigable by keyboard and readable by a screen reader even though its visual
 * affordance is deliberately quiet.
 */

export interface Placement {
  /** Percentages of the room, so the object stays put at every width. */
  readonly left: string;
  readonly top: string;
  readonly width: string;
  readonly height: string;
}

export function RoomObject({
  label,
  placement,
  title,
  children,
  face,
}: {
  /** What tapping it does, for assistive technology. */
  label: string;
  placement: Placement;
  /** Heading inside the opened sheet. */
  title: string;
  children: React.ReactNode;
  /** Optional visible thing sitting in the room, e.g. a docket on the counter. */
  face?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        aria-label={label}
        aria-haspopup="dialog"
        className="group absolute z-30 cursor-pointer"
        style={placement}
      >
        {face}
        <Ticks />
      </button>

      {open && (
        <Sheet
          title={title}
          onClose={() => {
            setOpen(false);
          }}
        >
          {children}
        </Sheet>
      )}
    </>
  );
}

/** Four faint corner ticks. Enough to notice, not enough to be a button. */
export function Ticks() {
  const edge = 'absolute h-2 w-2 border-paper-white/25 transition-colors';
  return (
    <span aria-hidden="true" className="absolute inset-0 group-active:border-amber-glow/60">
      <span className={`${edge} top-0 left-0 border-t border-l group-active:border-amber-glow/70`} />
      <span className={`${edge} top-0 right-0 border-t border-r group-active:border-amber-glow/70`} />
      <span
        className={`${edge} bottom-0 left-0 border-b border-l group-active:border-amber-glow/70`}
      />
      <span
        className={`${edge} right-0 bottom-0 border-r border-b group-active:border-amber-glow/70`}
      />
    </span>
  );
}

/**
 * What an object opens into.
 *
 * A sheet rather than a page: the room does not go away, it slides down behind
 * the thing you picked up. Its contents scroll on their own, which is how a
 * long list of managers or a full receipt can exist without the restaurant
 * itself becoming a scrolling document.
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
        * Tapping the room behind puts the thing down again. Deliberately not a
        * button and not in the tab order: the sheet already has a real Close
        * control and Escape, and a second thing announcing itself as "Close"
        * only makes the dialog noisier to hear.
        */}
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-ink-900/60" />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className="sheet-rise relative max-h-[74dvh] overflow-y-auto rounded-t-xl border-t-2 border-wood-dark bg-paper-mid text-ink-900 shadow-[0_-8px_28px_rgba(0,0,0,0.55)] outline-none"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
      >
        {/* The grab handle, and the only close affordance that needs to be obvious. */}
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-wood-dark/30 bg-paper-mid px-4 pt-3 pb-2">
          <h2
            id={headingId}
            className="font-mono text-[11px] font-bold tracking-[0.2em] text-ink-900 uppercase"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 flex min-h-[44px] min-w-[44px] items-center justify-center text-[13px] font-semibold text-ink-500"
          >
            Close
          </button>
        </div>

        <div className="px-4 pt-3">{children}</div>
      </div>
    </div>
  );
}
