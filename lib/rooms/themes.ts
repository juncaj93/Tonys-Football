/**
 * The three rooms, as materials.
 *
 * `16`'s P6 row asks for **3 themes**, and that number is itself a resolution:
 * `02 §8` wanted five to ten, `15 §9` wanted one, and `16 §A.4` records the
 * contradiction as settled at three. Three is also the number that can be drawn
 * well — five basements differing by a wall colour is one basement with a swatch
 * picker, which is the failure `MANDATE §6` calls *"deliberate placement"*
 * failing quietly.
 *
 * ## They differ by what the room *is*, not by hue
 *
 * Each one answers *what is this space actually for*, and the palette follows:
 *
 *   - **the storeroom** — what is really under a pizzeria. Brick, a bare bulb,
 *     a concrete floor. Everybody starts here, and it is the one that reads as
 *     *found* rather than *chosen*.
 *   - **the rec room** — somebody put panelling and a carpet in. Warm, lower,
 *     the basement of a house rather than of a business.
 *   - **the cold store** — the walk-in, cleared out. Tile, steel, one cold
 *     strip light. Deliberately the least comfortable of the three, because a
 *     league of ten will contain exactly one person who wants that.
 *
 * ## Nobody earns a theme
 *
 * All three are available from the first visit. `16` removes achievements,
 * levels, clout and prestige from this product, and a cosmetic behind an unlock
 * is that mechanism with a different word on it. There is no cost either: the
 * economy's only sink is the box (`00 §8` lists what tokens buy and room
 * decoration is not on it), and adding one would be an economy change, which
 * `16 §8` puts behind the simulation.
 *
 * ## The colours are the shop's, not new ones
 *
 * Every value below is a token from `art/palette.json`'s shared 32, referenced
 * through Tailwind rather than written as a hex. A basement that introduced its
 * own greys would be a second art system in a product whose whole quantization
 * pipeline exists to prevent one.
 */

export const THEMES = ['storeroom', 'rec_room', 'cold_store'] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = 'storeroom';

export interface ThemeSpec {
  readonly key: Theme;
  /** On the picker, and in the panel that opens on the wall. */
  readonly name: string;
  /** One line, in the shop's voice. Never a feature list. */
  readonly line: string;

  /**
   * The registry slug for this theme's painted shell.
   *
   * **Resolved per theme, independently.** A theme whose shell has landed draws
   * it; a theme whose shell has not draws the geometry below. That is the
   * art-swap contract applied one room at a time, and it is what makes the
   * delivery order of three shells irrelevant — no theme is gated on another,
   * and nothing has to ship all-or-nothing.
   */
  readonly shell: string;

  /* --- What the scene draws with ---------------------------------------- */

  /** The back wall above the rail. */
  readonly wall: string;
  /** The lower wall — panelling, tiling, or more brick. */
  readonly wainscot: string;
  /** The horizontal the two meet on. */
  readonly rail: string;
  /** The floor. */
  readonly floor: string;
  /** The floor's seams. Two of them, drawn at a third and two thirds. */
  readonly seam: string;
  /** The light's own fitting. */
  readonly fitting: string;
  /**
   * The light it throws, as an `rgba` for a radial gradient.
   *
   * A colour rather than a token because it is a gradient stop, and the one
   * place in the room where a token cannot express what is needed: light has an
   * alpha and the palette does not.
   */
  readonly glow: string;
  /** The shelf, the desk and the trims cut from them. */
  readonly timber: string;
  readonly timberDark: string;
  /** The rug the manager stands on, and the border woven into it. */
  readonly rug: string;
  readonly rugEdge: string;
}

/**
 * The three, in the order the picker offers them.
 *
 * `storeroom` first because it is the default and therefore the one a manager is
 * standing in while they read the list.
 */
export const THEME_SPECS: Readonly<Record<Theme, ThemeSpec>> = {
  storeroom: {
    key: 'storeroom',
    name: 'The storeroom',
    line: 'Block walls, one hanging lamp and a concrete floor. What is actually down here.',
    shell: 'zone_room_shell_storeroom',
    wall: 'bg-ink-700',
    wainscot: 'bg-wood-dark',
    rail: 'bg-wood-mid',
    /*
     * Concrete, and **lighter than the walls** — which is the opposite of the
     * first version and the reason it changed. At `ink-900` the floor was
     * near-black and the manager's legs disappeared into it: a figure whose
     * lower half is the same value as the ground reads as cut off, which is the
     * defect the counter's cut taught this product once already. A concrete
     * floor under a warm bulb genuinely is lighter than a brick wall, so the
     * fix and the fiction agree.
     */
    floor: 'bg-ink-500',
    seam: 'bg-ink-700/60',
    fitting: 'bg-wood-light',
    glow: 'rgba(255,217,138,0.40)',
    timber: 'bg-wood-mid',
    timberDark: 'bg-wood-dark',
    rug: 'bg-red-dark',
    rugEdge: 'bg-red-mid/60',
  },

  rec_room: {
    key: 'rec_room',
    name: 'The rec room',
    line: 'Somebody panelled it and put a carpet down. It is warmer than it needs to be.',
    shell: 'zone_room_shell_rec_room',
    wall: 'bg-wood-dark',
    wainscot: 'bg-wood-mid',
    rail: 'bg-wood-light',
    floor: 'bg-red-dark',
    seam: 'bg-red-mid/35',
    fitting: 'bg-amber-deep',
    glow: 'rgba(255,217,138,0.52)',
    timber: 'bg-wood-light',
    timberDark: 'bg-wood-mid',
    /* A woven mat laid on the carpet. Amber here read as a lit slab. */
    rug: 'bg-wood-mid',
    rugEdge: 'bg-wood-dark',
  },

  cold_store: {
    key: 'cold_store',
    name: 'The cold store',
    line: 'The walk-in, cleared out. Tile, steel, and one strip light that hums.',
    shell: 'zone_room_shell_cold_store',
    wall: 'bg-blue-deep',
    wainscot: 'bg-ink-700',
    rail: 'bg-ink-300',
    /* Tile. The lightest floor of the three, and the only one that is cold. */
    floor: 'bg-ink-300',
    seam: 'bg-ink-500/50',
    fitting: 'bg-ink-100',
    glow: 'rgba(127,212,240,0.34)',
    timber: 'bg-ink-500',
    timberDark: 'bg-ink-700',
    rug: 'bg-blue-mid/70',
    rugEdge: 'bg-blue-light/40',
  },
};

export function themeSpec(theme: Theme): ThemeSpec {
  return THEME_SPECS[theme];
}

/**
 * Whether a stored value is still a theme this product offers.
 *
 * **Reading repairs, writing refuses** — the rule `0016` established for
 * character traits and which holds here for the same reason. A theme retired in
 * a later release must cost the manager the theme, not the room: a stored value
 * nobody recognises falls back to the storeroom and everything else about the
 * room survives. A *write* of an unknown theme is a bug and is rejected.
 */
export function isTheme(value: string): value is Theme {
  return (THEMES as readonly string[]).includes(value);
}

/** What to draw for a stored value, repairing rather than throwing. */
export function themeOrDefault(value: string | null | undefined): Theme {
  return value != null && isTheme(value) ? value : DEFAULT_THEME;
}
