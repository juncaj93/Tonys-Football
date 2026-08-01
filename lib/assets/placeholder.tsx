import { TYPE } from '@/lib/design/type';

import type { AssetResolution } from './types';

/**
 * The universal placeholder: a hand-torn piece of cardboard taped to the wall.
 *
 * Drawn entirely in CSS, so it needs no generated art of its own — it is the
 * fallback beneath the fallback, available before batch B4 exists.
 *
 * `art/prompts/surface.md` explains why the placeholder is in-world rather
 * than a grey box: a grey box reads as broken software, while a taped-up sign
 * reads as a shop held together with tape, which is what this shop is. It lets
 * the product ship with most art unfinished and still look deliberate.
 */
export function PlaceholderSign({
  label,
  slug,
  className = '',
}: {
  label: string;
  slug?: string;
  className?: string;
}) {
  return (
    <div
      className={`relative flex min-h-24 items-center justify-center overflow-hidden rounded-[2px] bg-paper-dark px-4 py-3 text-center shadow-[inset_0_0_0_1px_var(--color-wood-mid)] ${className}`}
      style={{ transform: 'rotate(-0.4deg)' }}
    >
      {/* Masking tape, deliberately crooked. */}
      <span
        aria-hidden="true"
        className="absolute -top-1.5 -left-3 h-5 w-14 rotate-[-24deg] bg-paper-white/50"
      />
      <span
        aria-hidden="true"
        className="absolute -top-1 -right-3 h-5 w-14 rotate-[18deg] bg-paper-white/50"
      />

      <span className="relative z-10">
        <span className={`block ${TYPE.subhead} text-ink-900`}>{label}</span>
        {slug !== undefined && (
          <span className={`mt-1 block ${TYPE.machine} text-ink-500`}>{slug}</span>
        )}
      </span>
    </div>
  );
}

/**
 * The placeholder for a **small object in the room**, rather than a surface.
 *
 * ## Why `PlaceholderSign` could not do this job
 *
 * The taped-up sign is built for a wall: `min-h-24`, padding, a label and the
 * slug. Put it in a 44 × 30 slot and it does not shrink — the min-height wins,
 * the label wraps to four lines, and a 54 × 133 white slab stands on the counter
 * with a developer's slug printed down it. That is not a placeholder for a pizza
 * box; it is broken software wearing tape, and it was the loudest thing in the
 * room the first time it rendered.
 *
 * `object_box_owned` is the first placeholder the product has ever drawn at
 * object scale — every other overlay in the parlor (the rack, the banner, the
 * shell, Tony) already has generated art — so this case had never come up.
 *
 * ## What it draws instead
 *
 * A small closed carton, in five flat rectangles: a base, a lid, the seam
 * between them, and a label mark. Hard edges, square corners, palette colours,
 * no gradients and no text — the same rules every other surface in the shop
 * follows.
 *
 * This follows the precedent `globals.css` sets for the room itself: *"the
 * placeholder treatment itself had to become the room rather than a taped-up
 * sign standing in for one."* A drawn stand-in at the right size reads as a shop
 * whose props are simple. A sign with a slug on it reads as a bug.
 *
 * It fills its container exactly, so the object's geometry lives in
 * `objects.ts` where it belongs and this never has an opinion about size.
 *
 * **On the glow**: an overlay's affordance is `drop-shadow()` on its own alpha
 * (`18 §9.4`). This stand-in is a filled rectangle, so its glow is
 * rectangular — honestly so, because that *is* this shape's silhouette. When the
 * real box art lands with real transparency, the same CSS follows the real
 * outline with no change here. That is the property the mechanism was chosen for.
 */
/** What a compact placeholder is standing in for. */
export type ObjectPlaceholder = 'box' | 'collectible';

export function PlaceholderObject({
  kind = 'box',
  className = '',
}: {
  kind?: ObjectPlaceholder;
  className?: string;
}) {
  if (kind === 'collectible') return <PlaceholderCollectible className={className} />;

  return (
    <span aria-hidden="true" className={`relative block h-full w-full ${className}`}>
      {/* The base of the carton. */}
      <span className="absolute inset-0 border-2 border-wood-dark bg-paper-dark" />
      {/* The lid, catching the light from above. */}
      <span className="absolute inset-x-0 top-0 h-[42%] border-2 border-wood-dark bg-paper-mid" />
      {/* Where the lid meets the base. One hard line, no shadow. */}
      <span className="absolute inset-x-[8%] top-[42%] h-[2px] bg-wood-dark/70" />
      {/* The handwritten label. A mark, not a word — there is no room for a word. */}
      <span className="absolute top-[12%] left-[16%] h-[3px] w-[44%] bg-red-dark/80" />
      <span className="absolute top-[24%] left-[16%] h-[2px] w-[28%] bg-red-dark/55" />
    </span>
  );
}

/**
 * The stand-in for **a collectible**, which is not the stand-in for the box.
 *
 * It was, and that was the defect. `PlaceholderObject` drew one carton and both
 * the unopened box and the thing that came out of it used it, so the whole
 * reveal — the moment the entire milestone is built around — showed a box
 * turning into the same box, and every item in the Collection and the Showcase
 * was that box again. A rare `Can of whipped cream` and a common `Receipt spike`
 * were pixel-identical. The commissioner: *"the collectible is represented
 * primarily by text."* It was, because the picture said nothing.
 *
 * So: a **tagged parcel on the shelf** — a different silhouette from a flat
 * carton at a glance, taller than it is wide, with a tied string and a hanging
 * tag. It says *an object somebody kept*, which is the one thing true of all
 * twenty-four items, and it says nothing about which one.
 *
 * ## It is meant to look temporary
 *
 * `MANDATE`'s art-slot rules forbid *"polished-looking temporary art that may
 * accidentally become canonical"* as firmly as they forbid a broken-image icon.
 * So this is five flat rectangles and a blank tag: no rendering, no gradient, no
 * detail that could be mistaken for a decision about what a whipped-cream can
 * looks like. The **blank tag is the tell** — a thing with a label that has not
 * been written on yet.
 *
 * Every item resolves through the registry, so replacing this is
 * `collectible_can_whipped_cream` landing as a row — never a change here.
 */
function PlaceholderCollectible({ className }: { className: string }) {
  return (
    <span aria-hidden="true" className={`relative block h-full w-full ${className}`}>
      {/* The parcel. Inset on both sides so it is upright, not a box. */}
      <span className="absolute inset-x-[18%] top-[14%] bottom-0 border-2 border-wood-dark bg-paper-dark" />
      {/* Wrapped: one band across, one down. Hard lines, no shadow. */}
      <span className="absolute inset-x-[18%] top-[46%] h-[2px] bg-wood-mid" />
      <span className="absolute top-[14%] bottom-0 left-1/2 w-[2px] -translate-x-1/2 bg-wood-mid" />
      {/* The tag, hanging off the string, deliberately blank. */}
      <span className="absolute top-0 left-[52%] h-[16%] w-[2px] bg-wood-mid" />
      <span className="absolute top-0 left-[56%] h-[13%] w-[26%] border-2 border-wood-dark bg-paper-mid" />
    </span>
  );
}

/**
 * Renders any resolution.
 *
 * `missing` is rendered loudly on purpose — a typo'd slug should be obvious in
 * development, not silently invisible.
 *
 * `compact` picks the object-scale placeholder over the wall-scale one. It is a
 * property of *where the asset is being drawn*, not of the asset, which is why it
 * is a prop here rather than a registry field: the same slug may appear on the
 * counter at 44 units and in a Collection grid at 96.
 */
export function AssetView({
  resolution,
  className = '',
  compact = false,
  placeholder = 'box',
}: {
  resolution: AssetResolution;
  className?: string;
  /** Drawn at object scale — a few dozen units — rather than as a surface. */
  compact?: boolean;
  /**
   * Which compact stand-in to draw while the slug has no art.
   *
   * A property of the *slot*, not of the asset — the same registry row is a
   * sealed box on the counter and a kept object on a shelf, and those are not
   * the same picture. Ignored once real art exists.
   */
  placeholder?: ObjectPlaceholder;
}) {
  if (resolution.kind === 'missing') {
    return (
      <div
        className={`flex min-h-24 items-center justify-center rounded-[2px] border-2 border-dashed border-red-mid px-4 py-3 text-center ${className}`}
      >
        <span className={`${TYPE.machine} text-red-light`}>
          missing asset: {resolution.slug}
        </span>
      </div>
    );
  }

  if (resolution.kind === 'placeholder') {
    return compact ? (
      <PlaceholderObject kind={placeholder} className={className} />
    ) : (
      <PlaceholderSign label={resolution.label} slug={resolution.slug} className={className} />
    );
  }

  // Real art.
  //
  // `image-rendering: pixelated` is not decoration — it is the whole contract.
  // Every file here is authored at its display size in CSS pixels and then
  // rendered two or three times larger by the device's own pixel ratio, so the
  // browser's default smoothing would blur exactly the hard edges the pipeline
  // spent its quantization step guaranteeing.
  //
  // A plain `<img>` rather than `next/image`: the assets are static, tiny, and
  // already at their final dimensions, so there is nothing to optimize and a
  // resizing proxy would only reintroduce interpolation.
  return (
    // eslint-disable-next-line @next/next/no-img-element -- see above
    <img
      src={resolution.path}
      alt={resolution.record.alt}
      width={pixelWidth(resolution.record.canvas)}
      height={pixelHeight(resolution.record.canvas)}
      className={`block h-auto w-full ${className}`}
      style={{ imageRendering: 'pixelated' }}
      draggable={false}
    />
  );
}

/** `"320x228"` → `320`. */
function pixelWidth(canvas: string): number {
  return Number(canvas.split('x')[0] ?? 0);
}

function pixelHeight(canvas: string): number {
  return Number(canvas.split('x')[1] ?? 0);
}
