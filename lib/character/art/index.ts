import { maskToneGrid } from '../mask';
import { bounds, rasterise, shade, type Bounds, type Op, type ToneGrid } from '../sprite';

import { BODY, BODY_HEAD } from './body';
import { CANVAS } from './geometry';
import { FACIAL_HAIR, HAIR_STYLES } from './hair';
import { buildMask } from './masks';
import { TOPS } from './tops';
import { WEARABLE_ART } from './wearables';

export { buildMask, hasBuildMask } from './masks';

/**
 * Every drawable layer, by slug.
 *
 * ## Slug in, pixels out — and nothing in between knows about the manager
 *
 * The shapes are static: a hairstyle is the same shape whatever colour it is, and
 * a top is the same shape on every skin tone. So the expensive half — rasterising
 * and shading — depends only on the slug, and is done **once per slug for the
 * life of the process** rather than once per render. Colour is applied afterwards
 * over the cached tone grid, which is a few thousand array reads.
 *
 * That split is what makes the compositor cheap enough to run inside a server
 * component on every page view without a cache keyed by configuration — and a
 * cache keyed by configuration would have been unbounded, because there are
 * 92,160 of them.
 */

export const LAYER_SHAPES: Readonly<Record<string, readonly Op[]>> = Object.freeze({
  avatar_body_base: BODY,
  avatar_body_head: BODY_HEAD,
  ...HAIR_STYLES,
  ...FACIAL_HAIR,
  ...TOPS,
  ...WEARABLE_ART,
});

const CACHE = new Map<string, ToneGrid>();
const BOXES = new Map<string, Bounds | null>();

/**
 * The tone grid for a slug, or `null` if nothing is drawn under that name.
 *
 * **`null` rather than a throw.** The system this replaces threw — *"no
 * placeholder figure for this slug; every character slug needs one"* — from
 * inside a React component, which turns one unrecognised stored value into a
 * server-side exception on a page a manager was only looking at. A layer the art
 * does not have is a layer that is not drawn, and the customiser is where a
 * manager is told about it.
 */
export function toneGrid(slug: string): ToneGrid | null {
  const cached = CACHE.get(slug);
  if (cached !== undefined) return cached;

  /*
   * **Paint wins over shapes, and the shading pass does not run on it.**
   *
   * A drawn layer's light is derived from its own outline, which is why it can
   * only ever produce a lit rim and a shaded flank — no fold, no cast shadow, no
   * turning cylinder. A painted layer's light was decided by whoever painted it,
   * and re-deriving it would throw away the thing the paint was commissioned for.
   *
   * Cached in the same map and keyed the same way, so nothing downstream — the
   * compositor, the bounds, the contact shadows, the run-length pass — can tell a
   * painted layer from a drawn one.
   */
  const mask = buildMask(slug);
  if (mask !== null) {
    const grid = maskToneGrid(mask);
    CACHE.set(slug, grid);
    return grid;
  }

  const shapes = LAYER_SHAPES[slug];
  if (shapes === undefined) return null;

  const grid = shade(rasterise(shapes, CANVAS.width, CANVAS.height));
  CACHE.set(slug, grid);
  return grid;
}

/**
 * The occupied box of a slug's artwork, or `null` if it draws nothing.
 *
 * Cached beside the tone grid and for the same reason: it depends only on the
 * slug, and `compositeRuns` bounds all three of its passes by it. A layer is
 * rasterised once for the life of the process; measuring its extent every render
 * would put the walk back that the bound exists to remove.
 */
export function layerBounds(slug: string): Bounds | null {
  const cached = BOXES.get(slug);
  if (cached !== undefined) return cached;

  const grid = toneGrid(slug);
  const box = grid === null ? null : bounds(grid);
  BOXES.set(slug, box);
  return box;
}

/** Every slug the art actually has. For the contract test against the catalog. */
export function drawnSlugs(): readonly string[] {
  return Object.keys(LAYER_SHAPES);
}
