'use client';

import { useEffect, useRef, useState } from 'react';

import { AssetView } from '@/lib/assets/placeholder';
import { resolveAsset } from '@/lib/assets/registry';

/**
 * Tony at the counter, and his entrance.
 *
 * `17 §3` describes exactly what the manager should experience:
 *
 *   1. Tony is at the counter as the page paints
 *   2. a short entrance — leans in, wipes his hands — ~600ms, **skippable**,
 *      absent under `prefers-reduced-motion`
 *   3. two short lines: a greeting using their name, then one verified fact
 *   4. his expression matches the line's mood
 *
 * ## Why the animation is added after mount rather than rendered with it
 *
 * The server renders the **finished** state — Tony present, line readable. The
 * animation class is added on the client, only when it should play. Three
 * things fall out of that ordering, and all three matter:
 *
 *   - Nothing is ever hidden behind an animation that might not run. If
 *     JavaScript fails, the greeting is already on screen.
 *   - `prefers-reduced-motion` gets a genuine absence rather than a
 *     zero-duration animation of a thing that started invisible.
 *   - It plays once per session. `16 §12` (`02 §12`) bans repeated onboarding
 *     sequences; seeing Tony wipe his hands on every navigation is exactly
 *     that.
 */

const ENTRANCE_MS = 600;
const PLAYED_KEY = 'tonys:entrance-played';

export function TonyCounter({
  slug,
  line,
  name,
}: {
  slug: string;
  line: string | null;
  name: string;
}) {
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    let played = false;
    try {
      played = window.sessionStorage.getItem(PLAYED_KEY) === '1';
    } catch {
      // Private browsing can refuse storage. Playing the entrance again is a
      // far better failure than throwing on the first screen.
    }
    if (played) return;

    setPlaying(true);
    try {
      window.sessionStorage.setItem(PLAYED_KEY, '1');
    } catch {
      // As above.
    }

    timer.current = setTimeout(() => {
      setPlaying(false);
    }, ENTRANCE_MS);

    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  const skip = (): void => {
    if (!playing) return;
    if (timer.current !== null) clearTimeout(timer.current);
    setPlaying(false);
  };

  const resolution = resolveAsset(slug);

  return (
    <div
      className="flex items-start gap-4"
      // Any tap during the entrance ends it. Not a button: it must not sit in
      // the tab order or be announced, because there is nothing to do here
      // once the 600ms has passed.
      onPointerDown={skip}
    >
      <div
        // Wide enough that the placeholder's label — "Tony, unimpressed" —
        // wraps inside its tape rather than running into the edge. When the
        // B1 sprite lands this is a 32×48 tile and the width stops mattering.
        className={`w-24 shrink-0 sm:w-28 ${playing ? 'tony-entrance' : ''}`}
        aria-hidden={line === null ? undefined : 'true'}
      >
        <AssetView resolution={resolution} className="min-h-28" />
      </div>

      <div className="min-w-0 flex-1">
        {line === null ? (
          // "No content" is always a valid outcome (`16 §10`). Tony is simply
          // at the counter, not saying anything — never a placeholder line.
          <p className="text-sm leading-relaxed text-paper-mid/70 italic">
            Tony nods at {name} and goes back to the oven.
          </p>
        ) : (
          <p className="text-[17px] leading-snug font-medium text-paper-white sm:text-lg">
            {line}
          </p>
        )}
      </div>
    </div>
  );
}
