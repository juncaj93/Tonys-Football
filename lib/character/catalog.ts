import { HAIR_COLOURS, SKIN_TONES, TOP_COLOURS, type FixedKey, type Ramp } from './palette';
import { type BaseTrait, type WearableSlot } from './layers';

/**
 * Every choice a manager can make, and every wearable — **by canonical slug**.
 *
 * ## Order is the meaning of the stored number
 *
 * A saved character is a row of small integers, so *what integer 2 means* has to
 * be a stable reviewed fact rather than a position in a directory listing.
 * **Never reorder; only append.** A stored value pointing at a moved row is
 * unrecoverable and nobody notices for a week. Same rule as
 * `lib/counter/catalog.ts`, same reason.
 *
 * The six inherited slugs keep their inherited indices: `avatar_hair_01`…`_06`
 * are hair 0–5 and `avatar_body_starter_02`/`_03` are tops 0–1, exactly as they
 * were, so a configuration saved before this change still means what it meant.
 *
 * ## Collectibles and wearables are separate systems
 *
 * **Commissioner rulings, 2026-07-31 and 2026-08-23.**
 *
 * | | Family | Slugs | How you get one |
 * |---|---|---|---|
 * | Pizza-box collectibles | `collectible` | 24 × `collectible_*` | the loot box |
 * | Character equipment | `avatar` | 12 × `wear_*` | matching lore-pull bonus |
 *
 * A pizza box awards a `collectible_*` and nothing else. A later, explicit ruling
 * approved an idempotent **separate** wardrobe bonus for selected lore pulls;
 * `unlocks.ts` is its single mapping. It is not merely a convention: the
 * collectible catalog is `assetRegistry.byFamily('collectible')` and every
 * wearable is registered `family: "avatar"`, so a wearable cannot reach the reward
 * table without somebody changing a registry family. `separation.test.ts` fails
 * the build in every direction that could undo it.
 */

export interface TraitOption {
  /** The stored integer. Its position in this list, and never re-derived. */
  readonly index: number;
  /** Shown on the control. */
  readonly name: string;
  /**
   * The registry slug this option draws, or `null` for an option that is the
   * **absence** of a layer — clean-shaven. A `null` slug is not a missing asset
   * and must never be reported as one.
   */
  readonly slug: string | null;
}

export interface Wearable {
  readonly slug: string;
  readonly slot: WearableSlot;
  readonly name: string;
  /** A worn item keeps its own colours. Never the manager's (`palette.ts`). */
  readonly base: FixedKey;
  readonly shade: FixedKey;
}

/** Hairstyles. The six canonical slugs, in their canonical order. */
export const HAIR_STYLE_OPTIONS: readonly TraitOption[] = Object.freeze([
  { index: 0, name: 'Short', slug: 'avatar_hair_01' },
  { index: 1, name: 'Buzzed', slug: 'avatar_hair_02' },
  { index: 2, name: 'Long', slug: 'avatar_hair_03' },
  { index: 3, name: 'Curly', slug: 'avatar_hair_04' },
  { index: 4, name: 'Receding', slug: 'avatar_hair_05' },
  { index: 5, name: 'Ponytail', slug: 'avatar_hair_06' },
]);

/**
 * Facial hair. **Index 0 is none, and none draws no layer.**
 *
 * An empty option has to be representable without a file existing — the same rule
 * `docs/M3_CHARACTER_BOUNDARY.md §3` states for an unequipped slot. A transparent
 * placeholder PNG for "clean-shaven" would make a missing asset and a deliberate
 * choice the same state.
 */
export const FACIAL_HAIR_OPTIONS: readonly TraitOption[] = Object.freeze([
  { index: 0, name: 'Clean-shaven', slug: null },
  { index: 1, name: 'Stubble', slug: 'avatar_face_hair_01' },
  { index: 2, name: 'Moustache', slug: 'avatar_face_hair_02' },
  { index: 3, name: 'Goatee', slug: 'avatar_face_hair_03' },
  { index: 4, name: 'Full beard', slug: 'avatar_face_hair_04' },
]);

/** Tops. The two inherited slugs keep indices 0 and 1. */
export const TOP_OPTIONS: readonly TraitOption[] = Object.freeze([
  { index: 0, name: 'Hoodie', slug: 'avatar_body_starter_02' },
  { index: 1, name: 'Button-up', slug: 'avatar_body_starter_03' },
  { index: 2, name: 'T-shirt', slug: 'avatar_body_starter_04' },
  { index: 3, name: 'Jersey', slug: 'avatar_body_starter_05' },
  { index: 4, name: 'Flannel', slug: 'avatar_body_starter_06' },
  { index: 5, name: 'Sweater', slug: 'avatar_body_starter_07' },
]);

/** The one layer nobody chooses the shape of. Skin chooses its colour. */
export const BODY_SLUG = 'avatar_body_base';

/** A colour trait's options, as swatches rather than as drawings. */
export const COLOUR_TRAITS: Readonly<Record<'skin' | 'hairColour' | 'topColour', readonly Ramp[]>> =
  Object.freeze({
    skin: SKIN_TONES,
    hairColour: HAIR_COLOURS,
    topColour: TOP_COLOURS,
  });

/** The twelve earned wearables, with the ramp each one is painted in. */
export const WEARABLES: readonly Wearable[] = Object.freeze([
  { slug: 'wear_head_pizza_visor', slot: 'head', name: "Tony's Pizza visor", base: 'red', shade: 'redDark' },
  { slug: 'wear_head_beanie_winter', slot: 'head', name: 'Winter beanie', base: 'blue', shade: 'blueDeep' },
  { slug: 'wear_head_paper_hat', slot: 'head', name: "Folded paper cook's hat", base: 'white', shade: 'paper' },

  { slug: 'wear_body_apron_tony', slot: 'body', name: "Tony's Pizza apron", base: 'red', shade: 'redDark' },
  { slug: 'wear_body_jersey_blank', slot: 'body', name: 'Blue and silver football jersey', base: 'blue', shade: 'blueDeep' },
  { slug: 'wear_body_tracksuit', slot: 'body', name: 'Tracksuit', base: 'green', shade: 'blueDeep' },
  { slug: 'wear_body_delivery_uniform', slot: 'body', name: 'Delivery driver uniform', base: 'amber', shade: 'amberDeep' },

  { slug: 'wear_face_shades', slot: 'face', name: 'Sunglasses', base: 'inkSoft', shade: 'ink' },
  { slug: 'wear_face_mustache_fake', slot: 'face', name: 'Obviously fake moustache', base: 'inkSoft', shade: 'ink' },

  { slug: 'wear_hand_pizza_peel', slot: 'hand', name: 'Pizza peel', base: 'wood', shade: 'paper' },
  { slug: 'wear_hand_slice', slot: 'hand', name: 'Slice of pizza', base: 'gold', shade: 'amberDeep' },
  { slug: 'wear_hand_trophy_mini', slot: 'hand', name: 'Small trophy', base: 'gold', shade: 'amberDeep' },
]);

/** How many wearables the launch set holds. Asserted, never trusted. */
export const WEARABLE_COUNT = 12;

/** The style options for a trait that draws a layer. */
export const STYLE_TRAITS: Readonly<Record<'hair' | 'facialHair' | 'top', readonly TraitOption[]>> =
  Object.freeze({
    hair: HAIR_STYLE_OPTIONS,
    facialHair: FACIAL_HAIR_OPTIONS,
    top: TOP_OPTIONS,
  });

/** How many options a trait has. The customiser's "3 of 6". */
export function optionCount(trait: BaseTrait): number {
  return trait === 'hair' || trait === 'facialHair' || trait === 'top'
    ? STYLE_TRAITS[trait].length
    : COLOUR_TRAITS[trait].length;
}

/** The name of a trait's option at an index, or `null` if there is no such option. */
export function optionName(trait: BaseTrait, index: number): string | null {
  const options =
    trait === 'hair' || trait === 'facialHair' || trait === 'top'
      ? STYLE_TRAITS[trait]
      : COLOUR_TRAITS[trait];
  return options.find((option) => option.index === index)?.name ?? null;
}

/** The slug a style trait draws at an index. `null` covers both "none" and "unknown". */
export function styleSlug(trait: 'hair' | 'facialHair' | 'top', index: number): string | null {
  return STYLE_TRAITS[trait].find((option) => option.index === index)?.slug ?? null;
}

/** Is this index one the catalog actually offers? */
export function isKnownOption(trait: BaseTrait, index: number): boolean {
  const options =
    trait === 'hair' || trait === 'facialHair' || trait === 'top'
      ? STYLE_TRAITS[trait]
      : COLOUR_TRAITS[trait];
  return options.some((option) => option.index === index);
}

export function wearable(slug: string): Wearable | null {
  return WEARABLES.find((item) => item.slug === slug) ?? null;
}

/** Every slug this system draws. The registry has to hold all of them. */
export function characterSlugs(): readonly string[] {
  return [
    BODY_SLUG,
    ...HAIR_STYLE_OPTIONS.map((option) => option.slug),
    ...FACIAL_HAIR_OPTIONS.map((option) => option.slug),
    ...TOP_OPTIONS.map((option) => option.slug),
    ...WEARABLES.map((item) => item.slug),
  ].filter((slug): slug is string => slug !== null);
}
