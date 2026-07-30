import { assetRegistry } from '@/lib/assets/registry';

/**
 * The launch catalog.
 *
 * ## It is derived from the asset registry, not written down twice
 *
 * `16` approves "one loot box and a 24-item catalog", and every one of those 24
 * items already exists in `art/assets.inventory.json` with its slug, its rarity
 * and its alt text. Copying that list into a database table or into a constant
 * here would create a second copy of a fact, and a second copy of a fact drifts:
 * the registry would say `epic`, the catalog would say `rare`, both would be
 * committed, and nothing would fail.
 *
 * So the registry is the source of truth for *what exists and how rare it is*,
 * exactly as `ASSET_PIPELINE.md` intends — swapping a placeholder for final art
 * stays a registry row. What the database stores is the **reward table** built
 * from this list, versioned and frozen, because that is a different fact: not
 * "what items exist" but "what could this specific box have produced".
 *
 * ## The name is the registry's alt text
 *
 * A collectible needs a name to show under it. `alt` is already a curated,
 * human-written, per-slug phrase — "Framed signed jersey", "Neon Tony's Pizza
 * sign", "CRT television" — and it reads as an item name because it was written
 * to describe the object. Adding a parallel name list would be a second content
 * system for twenty-four strings, and `16 §5.3` is explicit that there is one
 * content engine and no parallel one.
 *
 * If a name ever needs to differ from the alt text, it becomes a registry field
 * rather than a table here.
 */

export const RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;

export type Rarity = (typeof RARITIES)[number];

export interface CatalogItem {
  readonly slug: string;
  /** Shown under the collectible. The registry's alt text — see above. */
  readonly name: string;
  readonly rarity: Rarity;
}

/**
 * How many items the approved catalog holds.
 *
 * Asserted rather than trusted. `16` says twenty-four; if a registry edit adds a
 * twenty-fifth or drops one to twenty-three, the seed fails loudly instead of
 * quietly shipping a different economy. **Never satisfy this by deleting an
 * approved slug** (`AUTONOMY.md §5`) — if the count is genuinely meant to
 * change, change it here and say so in the pull request.
 */
export const CATALOG_SIZE = 24;

/** `item_championship_ring` is earned, never pulled, so it is not in the box. */
const NOT_IN_BOXES = new Set(['item_championship_ring']);

function isRarity(value: string | undefined): value is Rarity {
  return value !== undefined && (RARITIES as readonly string[]).includes(value);
}

/**
 * The catalog, in a stable order.
 *
 * Sorted by rarity then slug, so the order is a property of the catalog rather
 * than of however the JSON happened to be written. The reward table's version is
 * a hash over this list, and a hash over an unstable order would change every
 * time somebody reformatted the inventory.
 */
export function catalog(): readonly CatalogItem[] {
  const items = assetRegistry
    .byFamily('collectible')
    .filter((record) => !NOT_IN_BOXES.has(record.slug))
    .filter((record) => {
      // A collectible with no rarity is not a catalog entry. `placeholder_pizza_box`
      // is the universal stand-in art, not a thing you can own.
      return isRarity(record.rarity);
    })
    .map((record) => ({
      slug: record.slug,
      name: record.alt,
      rarity: record.rarity as Rarity,
    }));

  return Object.freeze(
    items.sort((a, b) => {
      const byRarity = RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity);
      return byRarity !== 0 ? byRarity : a.slug.localeCompare(b.slug);
    }),
  );
}

/** Look one up. Throws rather than returning a hole — a stored slug must resolve. */
export function catalogItem(slug: string): CatalogItem {
  const found = catalog().find((item) => item.slug === slug);
  if (found === undefined) {
    throw new Error(`no catalog entry for slug ${slug}`);
  }
  return found;
}
