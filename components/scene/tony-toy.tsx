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
  const [pending, startTransition] = useTransition();
  // A ref rather than state: nothing renders differently because the cooldown
  // is running, so re-rendering to record it would be wasted work. `performance`
  // rather than the application clock — this is a UI cadence in the browser, not
  // a fact about the season, so the time machine must not be able to move it.
  const readyAt = useRef(0);

  const poke = (): void => {
    if (pending || performance.now() < readyAt.current) return;
    readyAt.current = performance.now() + COOLDOWN_MS;

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
        * What he is saying, pinned to the bottom of the screen rather than to
        * the room, so it survives whatever the floor does on a short phone and
        * stays clear of the home indicator.
        */}
      {/*
        * `fixed`, not `absolute`. The shape has to live inside the room to share
        * its coordinate system, and this box travels with it — but the room is
        * taller than the screen, so an absolutely positioned child pins itself
        * to the bottom of the *drawing*, which is off the bottom of the phone.
        */}
      <div
        className="tony-line pointer-events-none fixed inset-x-3 z-40 mx-auto max-w-3xl"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
      >
        <div className="relative">
          {/* A stepped tail, drawn in pixels rather than rotated. */}
          <span aria-hidden="true" className="absolute -top-[8px] left-[36%] flex flex-col">
            <span className="ml-[8px] h-[4px] w-[8px] bg-amber-mid/45" />
            <span className="ml-[4px] h-[4px] w-[16px] bg-[#1c1113]" />
          </span>

          <div className="pixel-edge relative border-2 border-wood-dark bg-[#1c1113] px-3.5 pt-2.5 pb-3">
            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-amber-mid/45" />
            <p className="font-display text-[13px] leading-none text-amber-mid uppercase">Tony</p>
            <div
              aria-hidden="true"
              className="mt-2 mb-2 h-px bg-gradient-to-r from-amber-mid/35 to-transparent"
            />
            {/*
              * `key` on the line restarts the typing when he says something
              * new. Without it React reuses the element, the effect never
              * re-runs, and a poked line would appear all at once.
              */}
            <p aria-live="polite" className="text-[20px] leading-[1.35] text-paper-white">
              <SpokenLine key={line} retypeOnChange>
                {line}
              </SpokenLine>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
