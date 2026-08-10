/**
 * The colours a character can be painted with — **all of them from
 * `art/palette.json`**, and none of them chosen here.
 *
 * ## The rule this file exists to obey, and the one it corrects
 *
 * `art/palette.json` carries a `skin` ramp whose own role note reads:
 *
 * > *Avatar and character skin. Four steps spanning a usable range. **Managers
 * > select a step; it is not tied to any other palette role.***
 *
 * The system this replaces did the opposite twice over. Its four palettes each
 * bundled a skin tone **with** a hair colour **and** a shirt colour, so choosing
 * a deeper skin also chose black hair and a red shirt and there was no way to
 * take one without the others. And the skin tones it used were not the skin
 * ramp: they were `wood-pale`, `wood-mid`, `paper-mid` and `wood-light`, so
 * every manager's face was painted with the colour of the counter.
 *
 * Both are corrected here, and `palette.test.ts` asserts every value below
 * appears in the locked file — which is what stops the correction being undone
 * by somebody typing a nicer-looking hex.
 *
 * ## Three tones per material, and not one invented colour
 *
 * This file used to carry two — `base` and `shade` — with the reason written
 * down: *"a third, lighter tone per material would need colours the room does
 * not have, and the palette is locked."* The first half of that was never
 * checked and is false. `art/palette.json`'s own `semantic.shadowRule` is
 *
 * > *one step darker within the same ramp — never ink-900, never pure black*
 *
 * and every ramp a character paints with has a step **above** its base as well
 * as below. So `light` is the same rule read upward: one step lighter within
 * the same ramp. Nothing is added to the locked file, and `character.test.ts`
 * still asserts every value below is one of the 32.
 *
 * The second half of the old reason was true and is what changed: at the old
 * `64 × 96` a third step landed on so few pixels it read as noise. At `112 × 168`
 * an arm is ten pixels across instead of six, and a rim one pixel wide on the lit
 * side is the difference between a cylinder and a stripe.
 *
 * ### Two ramps decline the light step, and that is the honest answer
 *
 * `Bottle green` and `Grape` are the two colours whose ramp has no step above
 * them — the palette's green is `green-deep` and `green-neon` with nothing
 * between, and its violet is `violet-deep` and `magenta-neon`. Promoting the
 * neon would put a highlight four times brighter than the garment on the
 * shoulder of a sweater. They carry `light: null`, which draws the base tone
 * where a highlight would go: flatter than the other six, and correct.
 */

/** The locked palette, by name. Every value below is one of these. */
export const HOUSE = Object.freeze({
  'ink-900': '#1A1214',
  'ink-700': '#2E2226',
  'ink-500': '#4A3B3F',
  'ink-300': '#7A6A6E',
  'ink-100': '#B5A8A9',
  'wood-dark': '#4A2E1C',
  'wood-mid': '#7A4A2A',
  'wood-light': '#A9713F',
  'wood-pale': '#C99A63',
  'red-dark': '#8C1F22',
  'red-mid': '#C42B2B',
  'red-light': '#E4534A',
  'paper-white': '#F5EDDC',
  'paper-mid': '#E0D2B8',
  'paper-dark': '#BFAE8E',
  'amber-glow': '#FFD98A',
  'amber-mid': '#F2A94B',
  'amber-deep': '#C97A22',
  'blue-deep': '#14233D',
  'blue-mid': '#2C5A8C',
  'blue-light': '#5C9BD1',
  'blue-neon': '#7FD4F0',
  'green-deep': '#1E4A32',
  'green-neon': '#5FD98A',
  'yellow-cheese': '#F2C94C',
  'yellow-neon': '#FFF07A',
  'violet-deep': '#3B2050',
  'magenta-neon': '#E060B0',
  'skin-1': '#F2C9A0',
  'skin-2': '#D9A173',
  'skin-3': '#9C6640',
  'skin-4': '#5E3A25',
} as const);

export type HouseColour = keyof typeof HOUSE;

/** The ink every outline is drawn in. Warm-biased, so it never reads as black. */
export const OUTLINE: HouseColour = 'ink-900';

export interface Ramp {
  /** The stored integer. Its position in its list, and never re-derived. */
  readonly index: number;
  /** What a manager reads on the control. */
  readonly name: string;
  /**
   * One step lighter within the same ramp — the key light's side.
   *
   * `null` where the ramp has no step above the base that is not a neon. See
   * the module note; two of the twenty do.
   */
  readonly light: HouseColour | null;
  readonly base: HouseColour;
  readonly shade: HouseColour;
}

/**
 * Skin — the palette's four steps, in the palette's order.
 *
 * **Four because the palette says four**, not because four felt right. The
 * deepest step has no darker step to shade with, so it borrows `wood-dark`: a
 * locked colour, the darkest warm brown the room has, and the one the shell's own
 * shadows already use.
 *
 * The lightest step has the mirror-image problem and takes the mirror-image
 * answer: `amber-glow` is `art/palette.json`'s own `semantic.keyLight`, and a
 * warm highlight on the lightest skin is the pendant lamp on a cheek rather
 * than a fifth skin tone nobody chose.
 *
 * The names are the ramp's position and nothing else. Naming a skin tone after a
 * food, a wood or a part of the world is how a neutral control stops being
 * neutral, and this list is chosen from by real people about themselves.
 */
export const SKIN_TONES: readonly Ramp[] = Object.freeze([
  { index: 0, name: 'Tone 1', light: 'amber-glow', base: 'skin-1', shade: 'skin-2' },
  { index: 1, name: 'Tone 2', light: 'skin-1', base: 'skin-2', shade: 'skin-3' },
  { index: 2, name: 'Tone 3', light: 'skin-2', base: 'skin-3', shade: 'skin-4' },
  { index: 3, name: 'Tone 4', light: 'skin-3', base: 'skin-4', shade: 'wood-dark' },
]);

/** Hair colour, independent of everything else. */
export const HAIR_COLOURS: readonly Ramp[] = Object.freeze([
  { index: 0, name: 'Black', light: 'ink-500', base: 'ink-700', shade: 'ink-900' },
  { index: 1, name: 'Dark brown', light: 'wood-mid', base: 'wood-dark', shade: 'ink-700' },
  { index: 2, name: 'Brown', light: 'wood-light', base: 'wood-mid', shade: 'wood-dark' },
  { index: 3, name: 'Sandy', light: 'wood-pale', base: 'wood-light', shade: 'wood-mid' },
  { index: 4, name: 'Blond', light: 'amber-glow', base: 'amber-mid', shade: 'amber-deep' },
  { index: 5, name: 'Ginger', light: 'amber-mid', base: 'amber-deep', shade: 'red-dark' },
  { index: 6, name: 'Grey', light: 'paper-dark', base: 'ink-100', shade: 'ink-300' },
  { index: 7, name: 'White', light: 'paper-white', base: 'paper-mid', shade: 'ink-100' },
]);

/** What the chosen top is dyed. A worn item keeps its own colours (`catalog.ts`). */
export const TOP_COLOURS: readonly Ramp[] = Object.freeze([
  { index: 0, name: 'Sauce red', light: 'red-light', base: 'red-mid', shade: 'red-dark' },
  { index: 1, name: 'Deep blue', light: 'blue-light', base: 'blue-mid', shade: 'blue-deep' },
  { index: 2, name: 'Sky', light: 'blue-neon', base: 'blue-light', shade: 'blue-mid' },
  { index: 3, name: 'Bottle green', light: null, base: 'green-deep', shade: 'blue-deep' },
  { index: 4, name: 'Cream', light: 'paper-white', base: 'paper-mid', shade: 'paper-dark' },
  { index: 5, name: 'Charcoal', light: 'ink-500', base: 'ink-700', shade: 'ink-900' },
  { index: 6, name: 'Amber', light: 'amber-glow', base: 'amber-mid', shade: 'amber-deep' },
  { index: 7, name: 'Grape', light: null, base: 'violet-deep', shade: 'ink-900' },
]);

/**
 * Fixed colours a sprite can name directly, for the parts of an object that are
 * not the manager's to choose — trousers, boots, a pizza peel's blade.
 *
 * **Each one is a three-step ramp, not a colour**, for the same reason the
 * manager's own materials are: this map used to hold single hexes, so every
 * fixed part of every sprite was flat by construction. The trousers — eighteen
 * rows of the figure, on every manager, in every state — were one navy
 * rectangle with a seam down the side, and no amount of care spent on the shirt
 * above them could fix that.
 *
 * Every step is one of the locked 32 and every ramp steps within its own family,
 * which is `art/palette.json`'s `semantic.shadowRule` read in both directions.
 */
export interface FixedRamp {
  readonly light: HouseColour;
  readonly base: HouseColour;
  readonly shade: HouseColour;
}

export const FIXED: Readonly<Record<string, FixedRamp>> = Object.freeze({
  ink: { light: 'ink-700', base: 'ink-900', shade: 'ink-900' },
  inkSoft: { light: 'ink-500', base: 'ink-700', shade: 'ink-900' },
  white: { light: 'paper-white', base: 'paper-white', shade: 'paper-mid' },
  cream: { light: 'paper-white', base: 'paper-mid', shade: 'paper-dark' },
  paper: { light: 'paper-mid', base: 'paper-dark', shade: 'ink-300' },
  red: { light: 'red-light', base: 'red-mid', shade: 'red-dark' },
  redDark: { light: 'red-mid', base: 'red-dark', shade: 'ink-700' },
  blue: { light: 'blue-light', base: 'blue-mid', shade: 'blue-deep' },
  blueDeep: { light: 'blue-mid', base: 'blue-deep', shade: 'ink-900' },
  green: { light: 'green-deep', base: 'green-deep', shade: 'blue-deep' },
  amber: { light: 'amber-glow', base: 'amber-mid', shade: 'amber-deep' },
  amberDeep: { light: 'amber-mid', base: 'amber-deep', shade: 'red-dark' },
  gold: { light: 'yellow-neon', base: 'yellow-cheese', shade: 'amber-deep' },
  wood: { light: 'wood-light', base: 'wood-mid', shade: 'wood-dark' },
  woodDark: { light: 'wood-mid', base: 'wood-dark', shade: 'ink-700' },
  /** Trousers. Dark indigo with a real lit side, rather than one flat navy. */
  denim: { light: 'blue-mid', base: 'blue-deep', shade: 'ink-900' },
  denimShade: { light: 'blue-deep', base: 'ink-900', shade: 'ink-900' },
  /**
   * A boot's upper.
   *
   * Warm and **mid**, not dark. The first version based it on `wood-dark`, which
   * is the same colour the basement's own floor and joists quantize to — the
   * boots disappeared into the room, which is the opposite of the problem this
   * work exists to fix. A manager's feet have to read against the floor they are
   * standing on.
   */
  leather: { light: 'wood-pale', base: 'wood-mid', shade: 'wood-dark' },
  /** The rubber under it. */
  sole: { light: 'ink-500', base: 'ink-700', shade: 'ink-900' },
});

export type FixedKey = keyof typeof FIXED;

/** Which step of a fixed ramp a tone names. */
export type FixedRole = keyof FixedRamp;

const rampAt = (ramps: readonly Ramp[], index: number): Ramp =>
  ramps.find((ramp) => ramp.index === index) ?? ramps[0]!;

/**
 * The three colours a layer paints with, given its material and the manager's
 * choices.
 *
 * Falling back to the first ramp rather than throwing is the same rule the whole
 * character system runs on: **a stored value that no longer names anything shows
 * a character, not an error page.** The customiser is where a manager is told;
 * a page that merely displays them is not.
 */
export interface LayerColours {
  /**
   * The lit side. Equal to `base` on a ramp with no step above it, which is how
   * *"this material has no highlight"* is said without a branch at every call
   * site that draws one.
   */
  readonly light: string;
  readonly base: string;
  readonly shade: string;
  readonly outline: string;
}

const rampColours = (ramp: Ramp): LayerColours => ({
  light: HOUSE[ramp.light ?? ramp.base],
  base: HOUSE[ramp.base],
  shade: HOUSE[ramp.shade],
  outline: HOUSE[OUTLINE],
});

export function skinColours(index: number): LayerColours {
  return rampColours(rampAt(SKIN_TONES, index));
}

export function hairColours(index: number): LayerColours {
  return rampColours(rampAt(HAIR_COLOURS, index));
}

export function topColours(index: number): LayerColours {
  return rampColours(rampAt(TOP_COLOURS, index));
}

/**
 * A worn item's own colours, which no configuration recolours.
 *
 * The catalog names two keys — a base and a shade — and the highlight comes from
 * the base key's own ramp. Twelve items each choosing a third colour by hand is
 * twelve chances to pick one that is not a step of anything.
 */
export function fixedColours(base: FixedKey, shade: FixedKey): LayerColours {
  return {
    light: fixedColour(`${base}@light`),
    base: fixedColour(base),
    shade: fixedColour(shade),
    outline: HOUSE[OUTLINE],
  };
}

/**
 * Resolve a `fixed:<key>` tone, optionally at a named step: `denim@shade`.
 *
 * The step is written into the tone by the shading pass, because a tone grid is
 * cached per slug and computed long before any colour is known — so *which* step
 * of a fixed ramp a pixel is has to travel with the pixel.
 *
 * An unknown key draws ink rather than nothing: a typo should be a visible dark
 * pixel somebody notices, not a transparent hole in a sprite that still looks
 * almost right.
 */
export function fixedColour(spec: string): string {
  const at = spec.indexOf('@');
  const key = at === -1 ? spec : spec.slice(0, at);
  const role = at === -1 ? 'base' : spec.slice(at + 1);

  const ramp: FixedRamp | undefined = FIXED[key];
  if (ramp === undefined) return HOUSE[OUTLINE];
  return HOUSE[role === 'light' || role === 'shade' ? ramp[role] : ramp.base];
}
