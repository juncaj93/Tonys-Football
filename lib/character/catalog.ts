import { type BaseLayer, type WearableSlot } from './layers';

/**
 * Every base variant and every wearable — **by canonical slug**.
 *
 * ## These slugs are not chosen here
 *
 * All twenty of them were already canon in `art/assets.inventory.json` before
 * this file existed (`_avatarLayers_B2`, `_wearables_B2`), with their slots and
 * their `32 × 48` canvas. **Commissioner ruling, 2026-07-31: preserve the exact
 * canonical slugs.** `lib/character/registry.test.ts` fails the build if this
 * list and the registry ever disagree, in either direction.
 *
 * ## Order is the meaning of the stored number
 *
 * A saved configuration is a row of small integers, so *what integer 2 means* has
 * to be a stable reviewed fact rather than a position in a directory listing.
 * **Never reorder; only append.** A stored value pointing at a moved row is
 * unrecoverable and nobody notices for a week. Same rule as
 * `lib/counter/catalog.ts`, same reason.
 *
 * ## Collectibles and wearables are separate systems
 *
 * **Commissioner ruling, 2026-07-31**, settling the contradiction this file used
 * to carry. `_wearables_B2` said *"These ARE part of the 24-item catalog"*; the
 * implemented catalog said otherwise, and **the implemented catalog was right.**
 *
 * | | Family | Slugs | How you get one |
 * |---|---|---|---|
 * | Pizza-box collectibles | `collectible` | 24 × `collectible_*` | the loot box |
 * | Character equipment | `avatar` | 12 × `wear_*` | the character system (M3) |
 *
 * They are two product families and two progression surfaces. A pizza box awards
 * a `collectible_*` and nothing else. **Crossover — a box that could award a
 * wearable, or a mixed reward — is explicitly not approved** and needs a later
 * ruling before anybody implements it.
 *
 * This is not merely a convention: the collectible catalog is
 * `assetRegistry.byFamily('collectible')`, and every wearable is registered
 * `family: "avatar"`, so a wearable cannot reach the reward table without
 * somebody changing a registry family. `separation.test.ts` fails the build in
 * every direction that could undo it, including the inventory comment above.
 */

export interface BaseVariant {
  readonly layer: BaseLayer;
  /** The stored integer. Its position in this list, and never re-derived. */
  readonly index: number;
  readonly slug: string;
  /** Shown in the customiser. The registry's own `alt`, so they cannot drift. */
  readonly name: string;
}

export interface Wearable {
  readonly slug: string;
  readonly slot: WearableSlot;
  readonly name: string;
}

/**
 * Palettes.
 *
 * A palette recolours the **base** layers only. A wearable keeps its authored
 * colours, because a manager who pulled a legendary jersey pulled *that* jersey,
 * and recolouring it to match a character would quietly make every copy different.
 */
export const PALETTES: readonly { readonly index: number; readonly name: string }[] = Object.freeze(
  [
    { index: 0, name: 'Warm' },
    { index: 1, name: 'Deep' },
    { index: 2, name: 'Fair' },
    { index: 3, name: 'Olive' },
  ],
);

/**
 * The free starter layers, from `_avatarLayers_B2`.
 *
 * Two bodies and six hairstyles is a small set, and that is the design: `16 §5.2`
 * asks for constrained and dependable. It grows by appending rows here and in the
 * registry, never by loosening anything.
 */
export const BASE_VARIANTS: readonly BaseVariant[] = Object.freeze([
  { layer: 'body', index: 0, slug: 'avatar_body_starter_02', name: 'Hoodie' },
  { layer: 'body', index: 1, slug: 'avatar_body_starter_03', name: 'Button-up shirt' },

  { layer: 'hair', index: 0, slug: 'avatar_hair_01', name: 'Short hair' },
  { layer: 'hair', index: 1, slug: 'avatar_hair_02', name: 'Buzzed hair' },
  { layer: 'hair', index: 2, slug: 'avatar_hair_03', name: 'Long hair' },
  { layer: 'hair', index: 3, slug: 'avatar_hair_04', name: 'Curly hair' },
  { layer: 'hair', index: 4, slug: 'avatar_hair_05', name: 'Balding' },
  { layer: 'hair', index: 5, slug: 'avatar_hair_06', name: 'Ponytail' },
]);

/** The twelve earned wearables, from `_wearables_B2`. */
export const WEARABLES: readonly Wearable[] = Object.freeze([
  { slug: 'wear_head_pizza_visor', slot: 'head', name: "Tony's Pizza visor" },
  { slug: 'wear_head_beanie_winter', slot: 'head', name: 'Winter beanie' },
  { slug: 'wear_head_paper_hat', slot: 'head', name: "Folded paper cook's hat" },

  { slug: 'wear_body_apron_tony', slot: 'body', name: "Tony's Pizza apron" },
  { slug: 'wear_body_jersey_blank', slot: 'body', name: 'Blue and silver football jersey' },
  { slug: 'wear_body_tracksuit', slot: 'body', name: 'Tracksuit' },
  { slug: 'wear_body_delivery_uniform', slot: 'body', name: 'Delivery driver uniform' },

  { slug: 'wear_face_shades', slot: 'face', name: 'Sunglasses' },
  { slug: 'wear_face_mustache_fake', slot: 'face', name: 'Obviously fake mustache' },

  { slug: 'wear_hand_pizza_peel', slot: 'hand', name: 'Pizza peel' },
  { slug: 'wear_hand_slice', slot: 'hand', name: 'Slice of pizza' },
  { slug: 'wear_hand_trophy_mini', slot: 'hand', name: 'Small trophy' },
]);

/** How many wearables the launch set holds. Asserted, never trusted. */
export const WEARABLE_COUNT = 12;

export function variantsFor(layer: BaseLayer): readonly BaseVariant[] {
  return BASE_VARIANTS.filter((variant) => variant.layer === layer);
}

export function variantSlug(layer: BaseLayer, index: number): string | null {
  return BASE_VARIANTS.find((v) => v.layer === layer && v.index === index)?.slug ?? null;
}

export function wearable(slug: string): Wearable | null {
  return WEARABLES.find((item) => item.slug === slug) ?? null;
}

/** Every slug this system draws. The registry has to hold all of them. */
export function characterSlugs(): readonly string[] {
  return [...BASE_VARIANTS.map((v) => v.slug), ...WEARABLES.map((w) => w.slug)];
}
