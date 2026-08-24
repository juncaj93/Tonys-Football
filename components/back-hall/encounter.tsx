'use client';

import { useState } from 'react';

import { CharacterView } from '@/components/character/character-view';
import { type Composite } from '@/lib/character/composite';
import { place } from '@/lib/parlor/objects';

/**
 * A manager waiting in the hall.
 *
 * The hall has a job beyond connecting doors: it is where the league runs into
 * itself. This is deliberately one visitor at a time. Two fully opaque figures
 * would make a small phone screen feel crowded, while one changing visitor gives
 * the room a reason to be revisited without turning it into a directory.
 */
export function BackHallEncounter({
  name,
  composite,
  line,
}: {
  name: string;
  composite: Composite;
  line: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open ? (
        <section
          aria-live="polite"
          data-back-hall-dialogue="true"
          className="absolute left-[7%] top-[39%] z-30 w-[86%] border-[3px] border-ink-900 bg-paper px-3 py-2 text-ink-900 shadow-[4px_4px_0_#5b2b1b]"
        >
          <div className="mb-1 flex items-center justify-between border-b-2 border-ink-300 pb-1">
            <span className="font-display text-role-label text-ink-700">{name}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="font-display text-role-label text-ink-500"
              aria-label={`Close ${name}'s dialogue`}
            >
              ×
            </button>
          </div>
          <p className="font-body text-role-body leading-tight">{line}</p>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-expanded={open}
        aria-label={`Talk to ${name}`}
        data-back-hall-encounter={name}
        className="absolute z-20 flex items-end justify-center outline-none focus-visible:ring-4 focus-visible:ring-sun-300"
        style={place([125, 326, 70, 142])}
      >
        <span aria-hidden="true" className="absolute bottom-[4%] h-[11%] w-[68%] rounded-[50%] bg-ink-900/35" />
        <span className="absolute inset-x-[15%] bottom-[8%] top-0">
          <CharacterView composite={composite} fit="container" label={name} />
        </span>
        <span
          aria-hidden="true"
          className="absolute right-[3%] top-[4%] grid h-7 w-7 place-items-center border-2 border-ink-900 bg-paper font-display text-role-label text-ink-900 shadow-[2px_2px_0_#5b2b1b]"
        >
          !
        </span>
      </button>
    </>
  );
}
