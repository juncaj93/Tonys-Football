import { assetRegistry } from '@/lib/assets/registry';
import {
  compositeRuns,
  describeCharacter,
  type Composite,
  type CompositeLayer,
} from '@/lib/character/composite';

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
 * The canvas is `64 × 96`. Displayed at any size that is not a whole multiple of
 * it, every edge lands between device pixels and the character goes soft — the
 * exact defect recorded against the clipboard on `/profile` (*"art below its
 * display size is worse than no art"*) and against the collectibles' 1.4375×
 * resample. A scale cannot express a non-integer multiple, so the mistake is not
 * available.
 */

/** Whole multiples of the 64 × 96 canvas. Nothing else is offered. */
export const CHARACTER_SCALES = { row: 1, card: 2, customiser: 3, hero: 3 } as const;
export type CharacterScale = keyof typeof CHARACTER_SCALES;

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
    const resolution = assetRegistry.resolve(layer.slug);
    return resolution.kind === 'art' ? [{ ...layer, path: resolution.path }] : [];
  });
}

export function CharacterView({
  composite,
  scale = 'card',
  label,
  className = '',
  idle = false,
}: {
  composite: Composite;
  scale?: CharacterScale;
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
      className={`relative shrink-0 ${idle ? 'character-idle' : ''} ${className}`}
      style={{
        width: `${String(width * factor)}px`,
        height: `${String(height * factor)}px`,
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
