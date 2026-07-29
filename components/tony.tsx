'use client';

import { useEffect, useRef, useState } from 'react';

import { SceneSurface } from '@/components/scene/fixtures';

/**
 * Tony, behind his counter.
 *
 * `17 §3` describes what the manager should experience:
 *
 *   1. Tony is at the counter as the page paints
 *   2. a short entrance — leans in, wipes his hands — ~600ms, **skippable**,
 *      absent under `prefers-reduced-motion`
 *   3. two short lines: a greeting using their name, then one verified fact
 *   4. his expression matches the line's mood
 *
 * ## He is a figure, not a portrait in a frame
 *
 * Until the B1 sprite exists he is drawn here in CSS: a silhouette lit from the
 * pendant above him, rim-lit down one side, cropped at the waist by the counter
 * front. That is what puts him *in* the room. A framed placeholder card would
 * have made him an illustration of Tony hanging on the wall, which is exactly
 * the difference the parlor is being rebuilt to fix.
 *
 * The expression drives the sprite slug, so the drawn stand-in and the eventual
 * art are selected the same way (`SceneSurface`).
 *
 * ## Why the animation is added after mount rather than rendered with it
 *
 * The server renders the **finished** state — Tony present, line readable. The
 * animation class is added on the client, only when it should play:
 *
 *   - nothing is ever hidden behind an animation that might not run
 *   - `prefers-reduced-motion` gets a genuine absence, not a zero-duration
 *     animation of something that started invisible
 *   - it plays once per session; `02 §12` bans repeated onboarding sequences,
 *     and seeing Tony wipe his hands on every navigation is exactly that
 */

const ENTRANCE_MS = 600;
const PLAYED_KEY = 'tonys:entrance-played';

export type TonyMood = 'neutral' | 'pleased' | 'unimpressed';

export function TonyAtTheCounter({
  slug,
  mood,
}: {
  slug: string;
  mood: TonyMood;
}) {
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let played = false;
    try {
      played = window.sessionStorage.getItem(PLAYED_KEY) === '1';
    } catch {
      // Private browsing can refuse storage. Replaying the entrance is a far
      // better failure than throwing on the first screen.
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

  return (
    // Any tap during the entrance ends it. Not a button: there is nothing to
    // do here once the 600ms has passed, so it must not sit in the tab order.
    <div onPointerDown={skip} className={playing ? 'tony-entrance' : undefined}>
      <SceneSurface slug={slug} className="relative h-[8.5rem] w-28">
        <TonyFigure mood={mood} />
      </SceneSurface>
    </div>
  );
}

/**
 * The stand-in figure.
 *
 * Deliberately a silhouette rather than a face: it reads as a person in dim
 * light at any size, it carries the visual canon that matters at this scale
 * (apron, paper hat, the shape of a man leaning on a counter — `12 §3`), and it
 * makes no claim about a face that the real sprite will have to honour.
 */
function TonyFigure({ mood }: { mood: TonyMood }) {
  // The pendant is above and slightly left, so the rim light is on that side
  // and the mood only changes the warmth of it.
  const rim = {
    neutral: 'shadow-[-3px_0_0_rgba(255,217,138,0.35)]',
    pleased: 'shadow-[-3px_0_0_rgba(255,217,138,0.6)]',
    unimpressed: 'shadow-[-3px_0_0_rgba(92,155,209,0.35)]',
  }[mood];

  return (
    <div aria-hidden="true" className="absolute inset-x-0 bottom-0 flex flex-col items-center">
      {/* Paper cook's hat, folded. */}
      <div className="h-3.5 w-9 rounded-t-[7px] bg-paper-mid/95 shadow-[inset_0_-3px_0_rgba(0,0,0,0.16)]" />
      <div className="h-1 w-10 rounded-[1px] bg-paper-white/90" />

      {/* Head. The moustache is the whole silhouette read (`12 §3`). */}
      <div className={`relative h-7 w-7 rounded-[9px] bg-[#6b4630] ${rim}`}>
        <div className="absolute bottom-1.5 left-1/2 h-[3px] w-4 -translate-x-1/2 rounded-full bg-ink-900/85" />
        {/* The cigarette behind one ear. */}
        <div className="absolute top-1.5 -right-1.5 h-[3px] w-2.5 -rotate-12 rounded-sm bg-paper-white/85" />
      </div>

      {/* Shoulders, sloped, and the apron over the jersey. */}
      <div className={`relative -mt-0.5 h-[4.5rem] w-14 rounded-t-[18px] bg-[#3b2a2d] ${rim}`}>
        <div className="absolute inset-x-[0.6rem] top-4 bottom-0 rounded-t-[5px] bg-paper-dark/90 shadow-[inset_0_2px_0_rgba(255,255,255,0.22)]">
          <div className="absolute inset-x-0 top-3 h-px bg-ink-500/25" />
        </div>
        {/* Apron strings over the shoulders. */}
        <div className="absolute top-2 left-3 h-3.5 w-[3px] rotate-8 bg-paper-dark/75" />
        <div className="absolute top-2 right-3 h-3.5 w-[3px] -rotate-8 bg-paper-dark/75" />

        {/*
         * Forearms on the counter. He is leaning on it, which is the pose the
         * entrance animation settles into and the reason he reads as being in
         * the room rather than standing behind a cut-out.
         */}
        <div
          className={`absolute -bottom-0.5 -left-4 h-2.5 w-7 -rotate-12 rounded-full bg-[#6b4630] ${rim}`}
        />
        <div className="absolute -right-4 -bottom-0.5 h-2.5 w-7 rotate-12 rounded-full bg-[#6b4630]" />
      </div>
    </div>
  );
}
