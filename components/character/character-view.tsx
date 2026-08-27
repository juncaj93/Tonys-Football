import {
  compositeRuns,
  describeCharacter,
  type Composite,
  type CompositeLayer,
} from '@/lib/character/composite';
import { characterLayerArtPath } from '@/lib/character/art-path';

/**
 * A manager's character, drawn.
 *
 * ## One flattened drawing, not one element per layer
 *
 * Every layer's shading is cached by slug (`lib/character/art/index.ts`), so the
 * composite is flattened into the fewest coloured rectangles that draw it and
 * emitted as one `<svg>`. A character is a couple of hundred `<rect>`s rather
 * than 6,144, and — the part that matters more — **one stacking context instead
 * of eight**, so nothing can half-load, mis-order, or arrive a frame apart.
 *
 * ## Why not a PNG per layer
 *
 * Because there is no PNG. All twenty-nine slugs are `art_status: placeholder`,
 * which here means *there is no file*, not *this is a sign with a slug on it* —
 * the drawing below is the production rendering. The art-swap contract is intact
 * and it is **per layer**: the moment a registry row gains a `path`, that one
 * layer draws its PNG and the rest keep drawing themselves. `art/ASSET_PIPELINE.md`'s
 * *"swapping a placeholder for final art is a registry row, never a code change"*
 * is satisfied without an all-or-nothing switchover.
 *
 * ## Why the size is a scale rather than a width
 *
 * Displayed at a size that does not divide the canvas cleanly, every edge lands
 * between CSS pixels and the character goes soft — the defect recorded against
 * the clipboard on `/profile` (*"art below its display size is worse than no
 * art"*) and against the collectibles' 1.4375× resample. A scale cannot express
 * an arbitrary width, so the mistake is not available.
 *
 * **Half steps are offered and whole ones are not required.** The canvas is
 * `112 × 168` and both numbers are even, so every scale below lands on a whole
 * number of CSS pixels in both directions — which is the property that actually
 * matters. Insisting on integers instead would fix the row avatar at `112 × 168`,
 * which is not an avatar, it is a poster.
 */

/**
 * The four sizes a character is drawn at, as multiples of the `112 × 168` canvas.
 *
 * Every one of them must produce a whole number of CSS pixels on both axes;
 * `checkCharacter` measures the rendered box and fails otherwise.
 */
export const CHARACTER_SCALES = { row: 0.5, card: 1, customiser: 1.5, hero: 1.5 } as const;
export type CharacterScale = keyof typeof CHARACTER_SCALES;

/**
 * How the drawing is sized.
 *
 * `fixed` is the rule above and the default: a whole multiple of the canvas, in
 * CSS pixels, chosen by the caller from a list of four.
 *
 * `container` exists for **rooms**, where a character stands at a coordinate in
 * a scene whose own size is a percentage of the viewport. The parlor shell is a
 * 320-unit image drawn at whatever the phone is wide (`3.66×` at 390, per
 * `docs/HOMEPAGE_CLEANLINESS_BOUNDARY.md`), so a figure standing in it must
 * scale with it or it changes size relative to the furniture between one phone
 * and the next — which is worse than a fractional scale, because it is a
 * *different picture* rather than a softer one.
 *
 * It costs nothing this file was protecting. The rule against fractional scales
 * is about **resampling a raster**, and there is no raster here: the drawing is
 * `<rect>`s in an SVG with `shapeRendering="crispEdges"`, which the browser
 * rasterises directly at whatever size the box turns out to be. The comment on
 * `imageRendering` below already anticipated this case in so many words — *"if a
 * future container ever scales this, it scales without smoothing"*.
 *
 * A layer with real PNG art still draws as an `<img>` with `imageRendering:
 * pixelated`, so when art lands it is the same trade the shell already makes.
 */
export type CharacterFit = 'fixed' | 'container';

export { describeCharacter };

/**
 * A layer whose registry row has real art.
 *
 * Drawn as a plain `<img>`, not `next/image`: the optimizer resamples, and
 * resampling is the one thing pixel art at a fixed integer scale must never have
 * done to it.
 */
function pngLayers(composite: Composite): readonly (CompositeLayer & { path: string })[] {
  return composite.layers.flatMap((layer) => {
    const path = characterLayerArtPath(layer);
    return path === null ? [] : [{ ...layer, path }];
  });
}

export function CharacterView({
  composite,
  scale = 'card',
  fit = 'fixed',
  label,
  className = '',
  idle = false,
}: {
  composite: Composite;
  scale?: CharacterScale;
  /** Fixed pixel size from `scale`, or fill whatever box the caller provides. */
  fit?: CharacterFit;
  /** Overrides the derived description. Use when context already says who this is. */
  label?: string;
  className?: string;
  /**
   * Breathe.
   *
   * One source pixel, twice, over three and a half seconds — which at any scale
   * is a whole number of device pixels and so cannot blur an edge. It is on the
   * customiser's preview and nowhere else: a character idling in a list is
   * movement nobody asked for, and `globals.css` turns this off entirely under
   * `prefers-reduced-motion`.
   */
  idle?: boolean;
}) {
  const factor = CHARACTER_SCALES[scale];
  const { width, height } = composite.canvas;
  const png = pngLayers(composite);
  const drawn = new Set(png.map((layer) => layer.slug));
  const runs = compositeRuns({
    ...composite,
    layers: composite.layers.filter((layer) => !drawn.has(layer.slug)),
  });

  return (
    <div
      role="img"
      aria-label={label ?? describeCharacter(composite)}
      data-character-view=""
      data-character-scale={scale}
      data-character-fit={fit}
      className={`relative shrink-0 ${idle ? 'character-idle' : ''} ${className}`}
      style={{
        ...(fit === 'fixed'
          ? { width: `${String(width * factor)}px`, height: `${String(height * factor)}px` }
          : { width: '100%', height: '100%' }),
        // Belt and braces with `shapeRendering` below: if a future container ever
        // scales this, it scales without smoothing.
        imageRendering: 'pixelated',
      }}
    >
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${String(width)} ${String(height)}`}
        shapeRendering="crispEdges"
        className="absolute inset-0 h-full w-full"
        data-character-runs={runs.length}
      >
        {runs.map((run) => (
          <rect
            key={`${String(run.x)}.${String(run.y)}.${String(run.w)}.${String(run.h)}`}
            x={run.x}
            y={run.y}
            width={run.w}
            height={run.h}
            fill={run.value}
          />
        ))}
      </svg>

      {png.map((layer) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${layer.layer}:${layer.slug}`}
          src={layer.path}
          alt=""
          aria-hidden="true"
          data-character-layer={layer.layer}
          className="absolute inset-0 h-full w-full"
          style={{ imageRendering: 'pixelated' }}
        />
      ))}
    </div>
  );
}
