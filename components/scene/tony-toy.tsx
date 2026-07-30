'use client';

import { useRef, useState, useTransition } from 'react';

import { anotherLineAction } from '@/app/actions/tony';
import { RoomToy } from '@/components/scene/room-object';
import { SpokenLine } from '@/components/scene/spoken-line';
import type { RoomObjectSpec } from '@/lib/parlor/objects';

/**
 * Tony, as a Toy.
 *
 * Tapping him gets another true line. He leads nowhere and carries no
 * highlight: the ruling reserves persistent affordance for available Doors, and
 * a character who glows like an exit teaches the room's grammar wrong.
 *
 * ## The cooldown
 *
 * Three seconds, on the client. It is pacing rather than protection — every
 * line he can say is true of the person tapping, so the worst outcome of
 * hammering him is reading facts about yourself quickly. What the cooldown
 * actually prevents is the thing that makes a character feel like a vending
 * machine: a queue of half-typed sentences stacking up behind each other.
 *
 * A tap during the cooldown, or while a line is still being fetched, is
 * swallowed rather than queued.
 */

const COOLDOWN_MS = 3000;

export function TonyToy({
  spec,
  greeting,
}: {
  spec: RoomObjectSpec;
  /** The day's Counter Greeting. What he is saying before anybody touches him. */
  greeting: string;
}) {
  const [line, setLine] = useState(greeting);
  // Closing the box hides it; poking him reopens it. Kept here rather than in
  // the panel so a new line can clear it in the same update that sets the text.
  const [dismissed, setDismissed] = useState(false);
  const [pending, startTransition] = useTransition();
  // A ref rather than state: nothing renders differently because the cooldown
  // is running, so re-rendering to record it would be wasted work. `performance`
  // rather than the application clock — this is a UI cadence in the browser, not
  // a fact about the season, so the time machine must not be able to move it.
  const readyAt = useRef(0);

  const poke = (): void => {
    if (pending || performance.now() < readyAt.current) return;
    readyAt.current = performance.now() + COOLDOWN_MS;
    // Whatever he says next, he says it out loud.
    setDismissed(false);

    startTransition(async () => {
      const { text } = await anotherLineAction();
      // Null means he has nothing else true to say, which is a valid outcome
      // (`16 §10`) — he keeps the line he already had rather than going blank.
      if (text !== null) setLine(text);
    });
  };

  return (
    <>
      <RoomToy spec={spec} onTap={poke} />

      {/*
        * What he is saying.
        *
        * ## Why it is small, and off to his side
        *
        * This was a full-width slab across the bottom of the screen with his
        * name over a rule above the line. Three things were wrong with it, and
        * they were all the same thing: it was built like a web component that
        * happens to be dark, so it read as an interface panel sitting in front
        * of a picture of a room rather than as somebody talking in one.
        *
        *   - **Full width** put the box across the whole counter front, which
        *     is the most-drawn part of the shell. A quarter of the room was
        *     paying rent to three lines of text.
        *   - **`TONY` over a divider** is a card header. The stepped tail
        *     already points at the man who is speaking, and the line types at
        *     talking speed — `spoken-line.tsx` makes exactly that argument for
        *     why there is "no ambiguity about who is speaking." A label on top
        *     of that is belt, braces, and a nameplate.
        *   - **20px at 1.35** wrapped a one-sentence greeting onto three lines.
        *
        * So: sized to the words, anchored under him rather than centred on the
        * screen, and the tail lands on his side of the counter. `max-w-[17rem]`
        * keeps it clear of the tray and the doorway on the right; it is a
        * measurement against the room, not a round number.
        *
        * ## Dismissable, which it was not
        *
        * The wrapper was `pointer-events-none` end to end, so the box could not
        * be closed at all — it sat there until the page changed under it. The
        * wrapper still ignores taps so the room behind stays live, and the box
        * itself takes them. Tapping it anywhere closes it, and the small ✕ is
        * there for anyone who does not think to try. Poking Tony brings it back,
        * because a Toy that has been silenced permanently is not a Toy.
        */}
      {/*
        * `fixed`, not `absolute`. The shape has to live inside the room to share
        * its coordinate system, and this box travels with it — but the room is
        * taller than the screen, so an absolutely positioned child pins itself
        * to the bottom of the *drawing*, which is off the bottom of the phone.
        */}
      {!dismissed && (
        <div
          className="tony-line pointer-events-none fixed inset-x-3 z-40 flex justify-start"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
        >
          <div className="pointer-events-auto relative max-w-[17rem]">
            {/* A stepped tail, drawn in pixels rather than rotated. */}
            {/*
              * At 38% the tail lands under Tony's own lane rather than under
              * the left edge of the box. Measured against the room: he stands
              * at logical x 64–136 of 320, the box starts at the screen edge
              * plus a gutter, and 38% of 17rem is where those two meet.
              */}
            <span aria-hidden="true" className="absolute -top-[8px] left-[38%] flex flex-col">
              <span className="ml-[8px] h-[4px] w-[8px] bg-amber-mid/45" />
              <span className="ml-[4px] h-[4px] w-[16px] bg-[#1c1113]" />
            </span>

            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss what Tony said"
              className="pixel-edge relative block w-full border-2 border-wood-dark bg-[#1c1113] py-2 pr-7 pl-3 text-left"
            >
              <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-amber-mid/45" />

              {/*
                * A pixel ✕ rather than an icon set: two bars, crossed, on the
                * grid. It is decoration on a button that is already labelled,
                * so it is `aria-hidden` and the whole box carries the label.
                */}
              <span
                aria-hidden="true"
                className="absolute top-1.5 right-1.5 h-3 w-3 opacity-55"
              >
                <span className="absolute top-1/2 left-0 h-[2px] w-full rotate-45 bg-amber-mid" />
                <span className="absolute top-1/2 left-0 h-[2px] w-full -rotate-45 bg-amber-mid" />
              </span>

              {/*
                * `key` on the line restarts the typing when he says something
                * new. Without it React reuses the element, the effect never
                * re-runs, and a poked line would appear all at once.
                */}
              <span
                aria-live="polite"
                className="block text-[15px] leading-[1.45] text-paper-white"
              >
                <SpokenLine key={line} retypeOnChange>
                  {line}
                </SpokenLine>
              </span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
