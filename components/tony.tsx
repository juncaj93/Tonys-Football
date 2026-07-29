import { SceneSurface } from '@/components/scene/fixtures';
import { resolveAsset } from '@/lib/assets/registry';

/**
 * Tony, behind his counter.
 *
 * Just the figure. `17 §3`'s arrival — he steps up, settles, then speaks — is
 * orchestrated one level out in `components/scene/arrival.tsx`, because the
 * order of those three events is a property of the room rather than of the man:
 * his line lives at the bottom of the screen, the interactive objects are
 * scattered across the wall, and one component has to know when each of them is
 * due. Tony's own job is to be drawn correctly.
 *
 * ## He is a figure, not a portrait in a frame
 *
 * `character_tony_neutral` is 88 x 240 and rendered at its own size in CSS
 * pixels, so the only scaling is the device's, which is always a whole number.
 * No filter, no blur, no drop-shadow, no smoothing: everything the pipeline's
 * quantization step guaranteed survives to the glass.
 *
 * Until a mood's sprite exists he is drawn here in CSS instead — a silhouette
 * lit from the pendant above him, cropped at the waist by the counter front.
 */

export type TonyMood = 'neutral' | 'pleased' | 'unimpressed';

export function TonyAtTheCounter({ slug, mood }: { slug: string; mood: TonyMood }) {
  return (
    <SceneSurface slug={drawnAs(slug)} className="relative">
      <TonyFigure mood={mood} />
    </SceneSurface>
  );
}

/**
 * Which sprite to actually draw.
 *
 * The greeting picks a mood and the mood picks a slug, but the moods arrive in
 * batches: `character_tony_neutral` landed in B0 and the other two follow in
 * B1. Until they do, falling all the way back to the CSS stand-in would mean a
 * manager who happens to draw a pleased line sees a drawn silhouette while the
 * manager beside him sees the real sprite — the same shop rendered two
 * different ways depending on the sentence.
 *
 * So an unavailable mood degrades to Tony's real neutral sprite rather than to
 * the placeholder tier. His expression is momentarily wrong; he is still Tony.
 */
function drawnAs(slug: string): string {
  return resolveAsset(slug).kind === 'art' ? slug : 'character_tony_neutral';
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
