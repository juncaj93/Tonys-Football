'use client';

import { useEffect, useRef, useState } from 'react';

import { roomObjectAttributes } from '@/components/scene/room-object';
import { TYPE } from '@/lib/design/type';
import { place, type RoomObjectSpec } from '@/lib/parlor/objects';

/**
 * A door that is shut.
 *
 * ## It is still a Door
 *
 * `18 §6` gives locked destinations three properties and they are all
 * behavioural rather than visual:
 *
 *   1. **Visible.** Never hidden. A manager should know the downstairs exists
 *      before it opens.
 *   2. **Never highlighted.** Glow means *available now*, and that is the whole
 *      thing keeping the affordance honest — so a shut door carries none.
 *   3. **Tappable, and it answers in-world.** Not a route, not a modal, not a
 *      coming-soon badge.
 *
 * So this renders a real control carrying the same `data-room-object` markers an
 * open Door does. The object map does not change when a feature ships; only the
 * element does — the same shape the counter tray already has, where a Door
 * becomes a button when tapping it opens a box in place rather than navigating
 * (`18 §4.1`).
 *
 * ## The answer is a line, not a dialog
 *
 * A modal would be the fourth thing `18 §6.3` rules out, and it would also be
 * wrong for the content: *"Don't worry about it."* is somebody in a doorway
 * saying four words, and putting it behind a titled panel with a close button
 * would make it an interface event. It appears beside the door, it is set like
 * speech, and it goes away on its own or when you tap something else.
 *
 * **No countdown, ever.** `18 §6` is explicit, and the reason is worth keeping
 * in view: the single honest countdown in this product is the end-of-season
 * spend-down. A door that opens "in three days" manufactures urgency. A door
 * that is simply shut does not.
 */

/** How long the line stays up. Long enough to read twice, at 17px. */
const SPEAKS_FOR_MS = 4200;

export function ShutDoor({ spec, line }: { spec: RoomObjectSpec; line: string }) {
  const [saying, setSaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const answer = (): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    setSaying(true);
    timer.current = setTimeout(() => {
      setSaying(false);
    }, SPEAKS_FOR_MS);
  };

  return (
    <>
      <button
        type="button"
        onClick={answer}
        aria-label={spec.label}
        style={place(spec.rect)}
        className="room-shape absolute z-30 outline-none"
        {...roomObjectAttributes(spec)}
      />

      {/*
        * What it says back.
        *
        * `aria-live` rather than focus management: the manager tapped a door and
        * got an answer, which is a status, not a place they have been moved to.
        * The region exists in the DOM at rest so the structure never changes
        * shape mid-render — the defect `spoken-line.tsx` was repaired for.
        */}
      <div
        aria-live="polite"
        className={`pointer-events-none absolute inset-x-3 z-40 flex justify-center transition-opacity duration-200 ${
          saying ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ top: `${(((spec.rect[1] + spec.rect[3] + 8) / 569) * 100).toFixed(3)}%` }}
      >
        <span className={`pixel-edge border-2 border-wood-dark bg-paper-mid px-3 py-2 ${TYPE.bodyCompact} text-ink-900`}>
          {saying ? line : ''}
        </span>
      </div>
    </>
  );
}
