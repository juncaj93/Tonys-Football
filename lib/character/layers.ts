/**
 * What a manager's character is made of, and the order it is drawn in.
 *
 * `16 §5.2` asks for a character system that is **constrained and dependable**
 * rather than expressive. A fixed layer set is what makes that true: a character
 * becomes a row of small integers plus a handful of equipped rows, recomposable
 * from the database on any device, forever — instead of a saved image nobody can
 * re-render when the art changes.
 *
 * ## A slot has an order; an item does not
 *
 * An item carrying its own z-index is the design that always arrives first and
 * always fails — two items authored months apart pick the same number, and
 * renumbering one breaks every saved configuration that used it.
 *
 * ## Tony is not in this system
 *
 * He is baked into the room's foreground at a fixed scale, guarded by
 * `lib/parlor/tony-scale.test.ts`, and he has no configuration to compose. The
 * compositor is for managers only, which keeps the blast radius of every defect
 * in it inside surfaces Tony is not on.
 */

export { ANCHOR as CHARACTER_ANCHOR, CANVAS as CHARACTER_CANVAS } from './art/geometry';

/**
 * The traits a manager chooses, free, from the moment they claim a seat.
 *
 * Six independent choices. The system this replaces had three — a body, a
 * hairstyle and a *palette*, where the palette bundled skin tone with hair colour
 * and shirt colour, so a manager could not take one without the other two. Four
 * palettes × two bodies × six hairstyles is forty-eight characters for ten
 * managers, and the two who both wanted the deepest skin tone were also both
 * given black hair and a red shirt.
 */
export const BASE_TRAITS = ['skin', 'hair', 'hairColour', 'facialHair', 'top', 'topColour'] as const;
export type BaseTrait = (typeof BASE_TRAITS)[number];

/**
 * The four slots the twelve earned wearables occupy.
 *
 * Unchanged from M3, and deliberately: nothing about the free trait set touches
 * the earned economy, its ownership trigger or its one-per-slot index.
 */
export const WEARABLE_SLOTS = ['body', 'face', 'head', 'hand'] as const;
export type WearableSlot = (typeof WEARABLE_SLOTS)[number];

/** A position in the stack. Worn layers are distinguished from chosen ones. */
export type LayerName =
  | 'base-body'
  | 'base-top'
  | 'worn-body'
  | 'base-facial-hair'
  | 'worn-face'
  | 'base-hair'
  | 'worn-head'
  | 'worn-hand';

/**
 * Back to front. **The order is the contract.**
 *
 * The chosen top sits over the figure; a worn body item — an apron — sits over
 * the chosen top, because that is what an apron does. Facial hair is on the face
 * and under shades, so a pair of sunglasses covers the eyes rather than the
 * moustache covering the glasses. Hair is drawn after the face and before
 * anything worn on the head, so a fringe overlaps the brow and a hat overlaps the
 * fringe. A held object is in front of everything.
 */
export const LAYER_ORDER: Readonly<Record<LayerName, number>> = Object.freeze({
  'base-body': 10,
  'base-top': 20,
  'worn-body': 30,
  'base-facial-hair': 40,
  'worn-face': 50,
  'base-hair': 60,
  'worn-head': 70,
  'worn-hand': 80,
});

/** Where a worn slot draws. */
export const WORN_LAYER: Readonly<Record<WearableSlot, LayerName>> = Object.freeze({
  body: 'worn-body',
  face: 'worn-face',
  head: 'worn-head',
  hand: 'worn-hand',
});

/**
 * Where a chosen trait draws.
 *
 * `hairColour`, `topColour` and `skin` are not here: they are **colours applied
 * to another trait's layer**, not layers. That is the whole point of separating
 * them — six traits, five drawn layers, and no combinatorial art.
 */
export const TRAIT_LAYER: Readonly<Record<'hair' | 'facialHair' | 'top', LayerName>> = Object.freeze(
  {
    top: 'base-top',
    facialHair: 'base-facial-hair',
    hair: 'base-hair',
  },
);

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
