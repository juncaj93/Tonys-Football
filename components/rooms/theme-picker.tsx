'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { setThemeAction } from '@/app/actions/rooms';
import { attempt, UNREACHABLE_LINE } from '@/lib/reliability/attempt';
import { TYPE } from '@/lib/design/type';
import { THEMES, THEME_SPECS, type Theme } from '@/lib/rooms/themes';

/**
 * How the room is fitted out.
 *
 * Three rows, each naming the room and saying what it is in one line. Not
 * swatches: the difference between the storeroom and the rec room is *what the
 * space is*, and a colour chip would present it as a palette choice, which is
 * both less interesting and less true.
 *
 * ## Nothing is locked and nothing costs anything
 *
 * All three are always available. `16` removes achievements, levels, clout and
 * prestige, so there is no unlock, and `00 §8`'s list of what tokens buy does
 * not include decorating a room, so there is no price. A greyed-out third option
 * would be the progression mechanic the product does not have, drawn.
 *
 * ## No optimistic state
 *
 * The theme is part of the room the server draws — the walls, the floor, the
 * light. Painting it in the browser first would mean the picker and the room
 * behind it disagreeing for a beat, on the one surface where they are the same
 * object.
 */
export function ThemePicker({ current }: { current: Theme }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [refused, setRefused] = useState<string | null>(null);

  const choose = (theme: Theme): void => {
    if (pending || theme === current) return;
    setRefused(null);

    startTransition(async () => {
      const outcome = await attempt(() => setThemeAction(theme));
      // Never reached the server, so the walls are still whatever they were.
      if (!outcome.ok) {
        setRefused(UNREACHABLE_LINE);
        return;
      }
      if (!outcome.value.ok) {
        setRefused('Tony can’t fit it out like that.');
        return;
      }
      router.refresh();
    });
  };

  return (
    <>
      <ul className="mt-2 divide-y divide-wood-dark/25">
        {THEMES.map((key) => {
          const spec = THEME_SPECS[key];
          const chosen = key === current;

          return (
            <li key={key}>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  choose(key);
                }}
                aria-pressed={chosen}
                className="flex min-h-[52px] w-full items-start gap-2.5 py-2 text-left active:translate-y-px disabled:opacity-60"
              >
                {/*
                  * A tick rather than a radio. The room behind the panel is the
                  * real feedback; this only has to say which row produced it.
                  */}
                <span
                  aria-hidden="true"
                  className={`mt-[3px] block h-4 w-4 shrink-0 border-2 ${
                    chosen ? 'border-amber-deep bg-amber-mid' : 'border-wood-dark/60 bg-paper-white'
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span className={`block ${TYPE.sectionHeading} text-ink-900`}>{spec.name}</span>
                  <span className={`mt-0.5 block ${TYPE.body} text-ink-700`}>{spec.line}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/*
        * One line for both kinds of no.
        *
        * A refusal and an unreachable server are different sentences and the
        * same gesture, so they share the region rather than stacking two. It is
        * `role="status"` and `aria-live` so a tap that did nothing is announced
        * — the failure this replaces was a tap that did nothing *and said
        * nothing*.
        */}
      {refused !== null && (
        <p className={`mt-3 ${TYPE.body} text-red-dark`} role="status" aria-live="polite">
          {refused}
        </p>
      )}
    </>
  );
}
