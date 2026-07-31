/**
 * What a manager's character is made of, and the order it is drawn in.
 *
 * `16 §5.2` asks for a character system that is **constrained and dependable**
 * rather than expressive. A fixed layer set is what makes that true: a character
 * becomes a row of small integers plus a handful of equipped rows, recomposable
 * from the database on any device, forever — instead of a saved image nobody can
 * re-render when the art changes.
 *
 * ## Everything here comes from the registry, not from taste
 *
 * The slots, the canvas and the slugs were already canon in
 * `art/assets.inventory.json` before this file existed — `avatar_hair_01`,
 * `wear_head_pizza_visor`, `32 × 48`. **Commissioner ruling, 2026-07-31:
 * preserve the exact canonical slugs.** A first draft of this file invented
 * `character_hair_short` at `64 × 64` with `back` and `bottoms` slots, none of
 * which exist, and the only thing that caught it was opening the registry.
 *
 * ## Two things from `docs/M3_CHARACTER_BOUNDARY.md` worth restating
 *
 * **Tony is not in this system.** He is baked into the room's foreground at a
 * fixed scale, guarded by `lib/parlor/tony-scale.test.ts`, and he has no
 * configuration to compose.
 *
 * **A slot has an order; an item does not.** An item carrying its own z-index is
 * the design that always arrives first and always fails — two items authored
 * months apart pick the same number, and renumbering one breaks every saved
 * configuration that used it.
 */

/**
 * The two layers a manager configures from the free starter set.
 *
 * `art/assets.inventory.json`, `_avatarLayers_B2`: *"free/starter layers
 * available to every manager at claim time."* There is no base **face** layer —
 * the base body carries one — so `face` below is worn-only.
 */
export const BASE_LAYERS = ['body', 'hair'] as const;
export type BaseLayer = (typeof BASE_LAYERS)[number];

/**
 * The four slots the twelve earned wearables occupy.
 *
 * With `hair` and the base body that is the **five slots** the ruling index
 * names. `body` appears in both lists on purpose: the starter body is the figure,
 * and a worn `body` item — an apron, a jersey — draws over it.
 */
export const WEARABLE_SLOTS = ['body', 'face', 'head', 'hand'] as const;
export type WearableSlot = (typeof WEARABLE_SLOTS)[number];

/** A position in the stack. Worn layers are distinguished from base ones. */
export type LayerName = 'base-body' | 'base-hair' | 'worn-body' | 'worn-face' | 'worn-head' | 'worn-hand';

/**
 * Back to front. **The order is the contract.**
 *
 * A worn body item sits over the figure. Shades sit on the face and **under** the
 * hair, so a fringe overlaps them the way a fringe does. A hat sits over the
 * hair. A held object is in front of everything, which is why `hand` is a slot in
 * the ownership sense and an overlay that includes the hand in the drawing sense
 * — modelling a held object honestly means splitting the body into arm layers,
 * which triples the base art for one class of item.
 */
export const LAYER_ORDER: Readonly<Record<LayerName, number>> = Object.freeze({
  'base-body': 10,
  'worn-body': 20,
  'worn-face': 30,
  'base-hair': 40,
  'worn-head': 50,
  'worn-hand': 60,
});

/** Where a worn slot draws. */
export const WORN_LAYER: Readonly<Record<WearableSlot, LayerName>> = Object.freeze({
  body: 'worn-body',
  face: 'worn-face',
  head: 'worn-head',
  hand: 'worn-hand',
});

/** Where a base layer draws. */
export const BASE_LAYER_POSITION: Readonly<Record<BaseLayer, LayerName>> = Object.freeze({
  body: 'base-body',
  hair: 'base-hair',
});

/**
 * The canvas every layer is authored at.
 *
 * `32 × 48`, from the registry, and not negotiable from this side: every avatar
 * and wearable row already declares it. A layer that has to be resampled to fit
 * is a layer authored wrong, and that is not hypothetical — every collectible was
 * once registered at `32x32` against a `46` slot, a 1.4375× resample that would
 * have blurred a whole batch and was discoverable only after the art existed.
 */
export const CHARACTER_CANVAS = Object.freeze({ width: 32, height: 48 });

/** Bottom-centre, exactly as collectibles anchor. A tall hat grows upward. */
export const CHARACTER_ANCHOR = 'bottom-center';

export function isWearableSlot(value: string): value is WearableSlot {
  return (WEARABLE_SLOTS as readonly string[]).includes(value);
}

/** Sort any set of layers into draw order. Stable, and total. */
export function inDrawOrder<T extends { readonly layer: LayerName }>(
  layers: readonly T[],
): readonly T[] {
  return [...layers].sort(
    (x, y) => LAYER_ORDER[x.layer] - LAYER_ORDER[y.layer] || x.layer.localeCompare(y.layer),
  );
}
