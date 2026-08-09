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
 * ## Two tones per material, not three
 *
 * `base` and `shade`, plus shared ink for the outline. A third, lighter tone per
 * material would need colours the room does not have, and the palette is locked:
 * *"Do not add, remove, or edit a color without regenerating every affected
 * asset."* Two tones is also the right density for a 64 × 96 figure — a third
 * step lands on so few pixels it reads as noise.
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
 * The names are the ramp's position and nothing else. Naming a skin tone after a
 * food, a wood or a part of the world is how a neutral control stops being
 * neutral, and this list is chosen from by real people about themselves.
 */
export const SKIN_TONES: readonly Ramp[] = Object.freeze([
  { index: 0, name: 'Tone 1', base: 'skin-1', shade: 'skin-2' },
  { index: 1, name: 'Tone 2', base: 'skin-2', shade: 'skin-3' },
  { index: 2, name: 'Tone 3', base: 'skin-3', shade: 'skin-4' },
  { index: 3, name: 'Tone 4', base: 'skin-4', shade: 'wood-dark' },
]);

/** Hair colour, independent of everything else. */
export const HAIR_COLOURS: readonly Ramp[] = Object.freeze([
  { index: 0, name: 'Black', base: 'ink-700', shade: 'ink-900' },
  { index: 1, name: 'Dark brown', base: 'wood-dark', shade: 'ink-700' },
  { index: 2, name: 'Brown', base: 'wood-mid', shade: 'wood-dark' },
  { index: 3, name: 'Sandy', base: 'wood-light', shade: 'wood-mid' },
  { index: 4, name: 'Blond', base: 'amber-mid', shade: 'amber-deep' },
  { index: 5, name: 'Ginger', base: 'amber-deep', shade: 'red-dark' },
  { index: 6, name: 'Grey', base: 'ink-100', shade: 'ink-300' },
  { index: 7, name: 'White', base: 'paper-mid', shade: 'ink-100' },
]);

/** What the chosen top is dyed. A worn item keeps its own colours (`catalog.ts`). */
export const TOP_COLOURS: readonly Ramp[] = Object.freeze([
  { index: 0, name: 'Sauce red', base: 'red-mid', shade: 'red-dark' },
  { index: 1, name: 'Deep blue', base: 'blue-mid', shade: 'blue-deep' },
  { index: 2, name: 'Sky', base: 'blue-light', shade: 'blue-mid' },
  { index: 3, name: 'Bottle green', base: 'green-deep', shade: 'blue-deep' },
  { index: 4, name: 'Cream', base: 'paper-mid', shade: 'paper-dark' },
  { index: 5, name: 'Charcoal', base: 'ink-700', shade: 'ink-900' },
  { index: 6, name: 'Amber', base: 'amber-mid', shade: 'amber-deep' },
  { index: 7, name: 'Grape', base: 'violet-deep', shade: 'ink-900' },
]);

/**
 * Fixed colours a sprite can name directly, for the parts of an object that are
 * not the manager's to choose — a pizza peel's blade, a visor's brim.
 */
export const FIXED: Readonly<Record<string, HouseColour>> = Object.freeze({
  ink: 'ink-900',
  inkSoft: 'ink-700',
  white: 'paper-white',
  cream: 'paper-mid',
  paper: 'paper-dark',
  red: 'red-mid',
  redDark: 'red-dark',
  blue: 'blue-mid',
  blueDeep: 'blue-deep',
  green: 'green-deep',
  amber: 'amber-mid',
  amberDeep: 'amber-deep',
  gold: 'yellow-cheese',
  wood: 'wood-mid',
  woodDark: 'wood-dark',
  denim: 'blue-deep',
  denimShade: 'ink-900',
});

export type FixedKey = keyof typeof FIXED;

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
  readonly base: string;
  readonly shade: string;
  readonly outline: string;
}

export function skinColours(index: number): LayerColours {
  const ramp = rampAt(SKIN_TONES, index);
  return { base: HOUSE[ramp.base], shade: HOUSE[ramp.shade], outline: HOUSE[OUTLINE] };
}

export function hairColours(index: number): LayerColours {
  const ramp = rampAt(HAIR_COLOURS, index);
  return { base: HOUSE[ramp.base], shade: HOUSE[ramp.shade], outline: HOUSE[OUTLINE] };
}

export function topColours(index: number): LayerColours {
  const ramp = rampAt(TOP_COLOURS, index);
  return { base: HOUSE[ramp.base], shade: HOUSE[ramp.shade], outline: HOUSE[OUTLINE] };
}

/** A worn item's own colours, which no configuration recolours. */
export function fixedColours(base: FixedKey, shade: FixedKey): LayerColours {
  return { base: fixedColour(base), shade: fixedColour(shade), outline: HOUSE[OUTLINE] };
}

/**
 * Resolve a `fixed:<key>` tone.
 *
 * An unknown key draws ink rather than nothing: a typo should be a visible dark
 * pixel somebody notices, not a transparent hole in a sprite that still looks
 * almost right.
 */
export function fixedColour(key: string): string {
  const named: HouseColour | undefined = FIXED[key];
  return named === undefined ? HOUSE[OUTLINE] : HOUSE[named];
}
