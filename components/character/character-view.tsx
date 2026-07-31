import { assetRegistry } from '@/lib/assets/registry';
import { wearable, variantsFor } from '@/lib/character/catalog';
import { type Composite, type CompositeLayer } from '@/lib/character/composite';
import { figureFor, fillColour, FIGURE_CANVAS } from '@/lib/character/figure';

/**
 * A manager's character, drawn.
 *
 * ## One stack, and the registry decides each layer
 *
 * Every layer asks the registry what it is. A layer with **final art** draws its
 * PNG; a layer still on placeholder draws the stand-in figure. That is the whole
 * of the art-swap contract for M3 — `art/ASSET_PIPELINE.md`'s *"swapping a
 * placeholder for final art is a registry row, never a code change"* — and it is
 * per-layer rather than all-or-nothing, so the first delivered hairstyle appears
 * on a character whose body is still a stand-in without anybody touching this.
 *
 * ## Why the size is a scale rather than a width
 *
 * The canvas is `32 × 48`. Displayed at any size that is not a whole multiple of
 * it, every edge lands between device pixels and the character goes soft — which
 * is the exact defect recorded against the clipboard on `/profile` (*"art below
 * its display size is worse than no art"*) and against the collectibles' 1.4375×
 * resample. A scale cannot express a non-integer multiple, so the mistake is not
 * available.
 */

/** Whole multiples of the 32 × 48 canvas. Nothing else is offered. */
export const CHARACTER_SCALES = { row: 2, card: 3, customiser: 4, hero: 5 } as const;
export type CharacterScale = keyof typeof CHARACTER_SCALES;

/**
 * A sentence describing what is being worn, for anybody not looking at it.
 *
 * Built from the same composite the pixels come from, so it cannot describe a
 * character that is not on screen.
 */
export function describeCharacter(composite: Composite): string {
  const parts: string[] = [];

  for (const layer of composite.layers) {
    if (layer.layer === 'base-hair') {
      const name = variantsFor('hair').find((v) => v.slug === layer.slug)?.name;
      if (name !== undefined) parts.push(name.toLowerCase());
      continue;
    }
    if (layer.layer === 'base-body') continue;

    const item = wearable(layer.slug);
    if (item !== null) parts.push(item.name.toLowerCase());
  }

  if (parts.length === 0) return 'A pizza-league manager.';
  return `A pizza-league manager with ${parts.join(', ')}.`;
}

function LayerArt({ layer }: { layer: CompositeLayer }) {
  const resolution = assetRegistry.resolve(layer.slug);

  if (resolution.kind === 'art') {
    return (
      /*
       * A plain `<img>`, not `next/image`. The optimizer resamples, and
       * resampling is the one thing pixel art at a fixed integer scale must
       * never have done to it — the same reason every other asset surface in
       * this product draws its PNG directly.
       */
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolution.path}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
        style={{ imageRendering: 'pixelated' }}
      />
    );
  }

  /*
   * The stand-in. `shapeRendering="crispEdges"` is what keeps a scaled
   * rectangle's edge on a pixel boundary instead of anti-aliasing it into a
   * grey seam — the SVG equivalent of `image-rendering: pixelated`, and needed
   * for the same reason.
   */
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${String(FIGURE_CANVAS.width)} ${String(FIGURE_CANVAS.height)}`}
      shapeRendering="crispEdges"
      className="absolute inset-0 h-full w-full"
      data-character-layer={layer.layer}
      data-character-slug={layer.slug}
    >
      {figureFor(layer.slug).map((shape, index) => (
        <rect
          key={`${String(index)}-${shape.fill}`}
          x={shape.x}
          y={shape.y}
          width={shape.w}
          height={shape.h}
          fill={fillColour(shape.fill, layer.palette)}
        />
      ))}
    </svg>
  );
}

export function CharacterView({
  composite,
  scale = 'card',
  label,
  className = '',
}: {
  composite: Composite;
  scale?: CharacterScale;
  /** Overrides the derived description. Use when context already says who this is. */
  label?: string;
  className?: string;
}) {
  const factor = CHARACTER_SCALES[scale];
  const width = FIGURE_CANVAS.width * factor;
  const height = FIGURE_CANVAS.height * factor;

  return (
    <div
      role="img"
      aria-label={label ?? describeCharacter(composite)}
      data-character-view=""
      data-character-scale={scale}
      className={`relative shrink-0 ${className}`}
      style={{ width: `${String(width)}px`, height: `${String(height)}px` }}
    >
      {composite.layers.map((layer) => (
        <LayerArt key={`${layer.layer}:${layer.slug}`} layer={layer} />
      ))}
    </div>
  );
}
