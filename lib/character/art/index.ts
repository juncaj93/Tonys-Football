import { rasterise, shade, type Op, type ToneGrid } from '../sprite';

import { BODY } from './body';
import { CANVAS } from './geometry';
import { FACIAL_HAIR, HAIR_STYLES } from './hair';
import { TOPS } from './tops';
import { WEARABLE_ART } from './wearables';

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
  ...HAIR_STYLES,
  ...FACIAL_HAIR,
  ...TOPS,
  ...WEARABLE_ART,
});

const CACHE = new Map<string, ToneGrid>();

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

  const shapes = LAYER_SHAPES[slug];
  if (shapes === undefined) return null;

  const grid = shade(rasterise(shapes, CANVAS.width, CANVAS.height));
  CACHE.set(slug, grid);
  return grid;
}

/** Every slug the art actually has. For the contract test against the catalog. */
export function drawnSlugs(): readonly string[] {
  return Object.keys(LAYER_SHAPES);
}
