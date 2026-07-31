import { BASE_VARIANTS, WEARABLES } from './catalog';
import { CHARACTER_CANVAS } from './layers';

/**
 * The placeholder figure — **as data, not as a component.**
 *
 * ## Why a placeholder character had to be drawn rather than signed
 *
 * All twenty character slugs are `art_status: placeholder`, and the universal
 * stand-in is a taped-up cardboard sign. Compositing six of those produces a
 * stack of six identical signs: no silhouette, no visible layer order, and — the
 * part that actually matters — **nothing changes when a manager changes their
 * hair.** A customiser whose preview does not move is not a customiser.
 *
 * So this follows the precedent `PlaceholderObject` set for the pizza box and
 * `PlaceholderCollectible` set for the item on the tray: *a drawn stand-in at the
 * right size reads as a shop whose props are simple; a sign with a slug on it
 * reads as a bug.* Flat rectangles, palette colours, hard edges, no gradients and
 * no text.
 *
 * **It is not pretending to be final art.** Every one of these slugs still
 * resolves `placeholder` through the registry, `art:batch` still owns the
 * ingestion path, and `CharacterView` draws the PNG the moment one exists. This
 * is what the slot looks like while it is empty.
 *
 * ## Why the geometry is data
 *
 * `docs/M3_CHARACTER_BOUNDARY.md §7`: the clipping tests are **arithmetic over
 * the artwork, not screenshots**, because *geometry read off a screenshot is
 * wrong* and the eye kept confidently reporting it had measured something it had
 * not. Alpha-channel arithmetic is how that is done for a PNG. For a drawn
 * stand-in there is something better: the shapes **are** the measurement. A
 * bounding box computed here is exact rather than sampled, and the same array
 * feeds the renderer — so a test cannot pass against geometry the screen does not
 * use.
 *
 * When real PNGs arrive, the tests that read this data are replaced by the alpha
 * arithmetic `art:validate` already performs. The rules being checked do not
 * change; only where the pixels are read from does.
 */

/** A flat rectangle in canvas units. Integers only — this is pixel art. */
export interface FigureRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly fill: FillKey;
}

/**
 * What a rectangle is painted with.
 *
 * The first group is **palette-resolved** — a base layer takes the manager's
 * chosen palette. The second is **fixed**, because a wearable keeps its authored
 * colours: a manager who pulled a blue jersey pulled *that* jersey, and
 * recolouring it per-character would quietly make every copy different
 * (`catalog.ts`).
 */
export type FillKey =
  | 'skin'
  | 'skin-shade'
  | 'hair'
  | 'garment'
  | 'garment-shade'
  | 'ink'
  | 'red'
  | 'red-dark'
  | 'cream'
  | 'paper-dark'
  | 'blue'
  | 'blue-deep'
  | 'green'
  | 'amber'
  | 'amber-deep'
  | 'wood';

/** The four palettes, in `PALETTES` index order. House tokens only. */
const PALETTE_COLOURS: readonly Readonly<Record<'skin' | 'skin-shade' | 'hair' | 'garment' | 'garment-shade', string>>[] =
  Object.freeze([
    // Warm
    { skin: '#c99a63', 'skin-shade': '#a9713f', hair: '#4a2e1c', garment: '#2c5a8c', 'garment-shade': '#14233d' },
    // Deep
    { skin: '#7a4a2a', 'skin-shade': '#4a2e1c', hair: '#1a1214', garment: '#8c1f22', 'garment-shade': '#4a2e1c' },
    // Fair
    { skin: '#e0d2b8', 'skin-shade': '#bfae8e', hair: '#c97a22', garment: '#1e4a32', 'garment-shade': '#14233d' },
    // Olive
    { skin: '#a9713f', 'skin-shade': '#7a4a2a', hair: '#2e2226', garment: '#3b2050', 'garment-shade': '#1a1214' },
  ]);

const FIXED_COLOURS: Readonly<Record<string, string>> = Object.freeze({
  ink: '#1a1214',
  red: '#c42b2b',
  'red-dark': '#8c1f22',
  cream: '#f5eddc',
  'paper-dark': '#bfae8e',
  blue: '#2c5a8c',
  'blue-deep': '#14233d',
  green: '#1e4a32',
  amber: '#f2a94b',
  'amber-deep': '#c97a22',
  wood: '#7a4a2a',
});

/**
 * Resolve a fill to a colour.
 *
 * `palette === null` means a wearable, which has no palette-resolved fills — so a
 * base key arriving with a null palette is a authoring mistake rather than a
 * value to guess at, and it throws.
 */
export function fillColour(fill: FillKey, palette: number | null): string {
  const fixed = FIXED_COLOURS[fill];
  if (fixed !== undefined) return fixed;

  if (palette === null) {
    throw new Error(`fill "${fill}" needs a palette, and this layer has none`);
  }
  const colours = PALETTE_COLOURS[palette];
  if (colours === undefined) throw new Error(`palette ${String(palette)} does not exist`);

  const resolved = (colours as Record<string, string | undefined>)[fill];
  if (resolved === undefined) throw new Error(`fill "${fill}" is not a palette colour`);
  return resolved;
}

const r = (x: number, y: number, w: number, h: number, fill: FillKey): FigureRect =>
  Object.freeze({ x, y, w, h, fill });

/*
 * The figure, in canvas units. 32 wide × 48 tall, bottom-centre anchored, centre
 * line at x = 16.
 *
 *   y 0–7    room for hair and hats
 *   y 7–18   head
 *   y 20–34  torso and arms
 *   y 34–45  legs
 *   y 45–48  shoes — the contact row, so a character stands on the floor
 */

/**
 * Head, face, legs and shoes — everything the garment is drawn **over**.
 *
 * Split from the hands below, and the split is load-bearing. When the hands were
 * in this list the torso drew on top of them, and the hoodie — authored two
 * columns wider than the shirt — covered the sleeves as well, so the figure
 * rendered as a head on a slab with no arms at all. Visible only at hero scale.
 */
const FIGURE_UNDER: readonly FigureRect[] = Object.freeze([
  r(10, 7, 12, 11, 'skin'), // head
  r(14, 17, 4, 3, 'skin-shade'), // neck
  r(12, 12, 2, 2, 'ink'), // left eye
  r(18, 12, 2, 2, 'ink'), // right eye
  r(14, 15, 4, 1, 'ink'), // mouth
  r(10, 34, 5, 11, 'garment-shade'), // left leg
  r(17, 34, 5, 11, 'garment-shade'), // right leg
  r(9, 45, 6, 3, 'ink'), // left shoe
  r(17, 45, 6, 3, 'ink'), // right shoe
]);

/** The hands, which come out of the end of a sleeve rather than under it. */
const FIGURE_OVER: readonly FigureRect[] = Object.freeze([
  r(5, 32, 3, 3, 'skin'),
  r(24, 32, 3, 3, 'skin'),
]);

/**
 * The sleeves.
 *
 * Both bodies are `8..24` wide with the arms **outside** that box, so an arm is a
 * shape rather than an edge of the torso. A body variant differentiates itself by
 * its collar and its detail, never by being wider — width is what ate the arms.
 */
const SLEEVES = (): readonly FigureRect[] => [
  r(5, 21, 3, 11, 'garment'),
  r(24, 21, 3, 11, 'garment'),
];

/**
 * Every slug this system draws, keyed by slug.
 *
 * **Keyed by slug rather than by index** so that appending a variant cannot
 * shift another one's artwork — the same reason `catalog.ts` forbids reordering.
 */
export const FIGURES: Readonly<Record<string, readonly FigureRect[]>> = Object.freeze({
  /* ------------------------------------------------- base bodies -- */

  avatar_body_starter_02: Object.freeze([
    ...FIGURE_UNDER,
    r(8, 20, 16, 14, 'garment'),
    ...SLEEVES(),
    r(9, 17, 14, 4, 'garment-shade'), // the hood, bunched at the neck
    r(12, 27, 8, 4, 'garment-shade'), // pocket
    ...FIGURE_OVER,
  ]),

  avatar_body_starter_03: Object.freeze([
    ...FIGURE_UNDER,
    r(8, 20, 16, 14, 'garment'),
    ...SLEEVES(),
    r(13, 19, 2, 3, 'garment-shade'), // collar, left point
    r(17, 19, 2, 3, 'garment-shade'), // collar, right point
    r(15, 20, 2, 14, 'garment-shade'), // the button placket
    ...FIGURE_OVER,
  ]),

  /* --------------------------------------------------- hairstyles -- */

  avatar_hair_01: Object.freeze([
    r(9, 5, 14, 5, 'hair'),
    r(9, 10, 2, 3, 'hair'),
    r(21, 10, 2, 3, 'hair'),
  ]),

  avatar_hair_02: Object.freeze([r(10, 6, 12, 3, 'hair')]),

  avatar_hair_03: Object.freeze([
    r(9, 5, 14, 5, 'hair'),
    r(8, 10, 3, 14, 'hair'), // falls past the shoulder
    r(21, 10, 3, 14, 'hair'),
  ]),

  avatar_hair_04: Object.freeze([
    r(8, 4, 6, 6, 'hair'),
    r(12, 2, 8, 7, 'hair'), // the tallest of the hairstyles
    r(18, 4, 6, 6, 'hair'),
    r(9, 8, 14, 3, 'hair'),
  ]),

  // Balding is a **choice**, and it draws. A skipped layer would make it and
  // "the hair file failed to load" the same state (`composite.ts`).
  // The strip runs `11..21` rather than `12..20` so it shares a column with each
  // side patch. At `12..20` it met them at a corner apiece — three pieces of
  // hair, none of them touching, which is the ponytail defect in a quieter place.
  avatar_hair_05: Object.freeze([
    r(11, 6, 10, 2, 'hair'),
    r(9, 8, 3, 5, 'hair'),
    r(20, 8, 3, 5, 'hair'),
  ]),

  /*
   * The tail hangs on the **left**, and that is a composition rule rather than a
   * preference: every hand item is held on the right, because the figure's right
   * hand is there. Drawn on the right the tail was completely covered by the
   * pizza peel — which draws later, at `worn-hand` — so a manager who chose a
   * ponytail and picked up a peel simply lost their hairstyle. Nothing clipped
   * and no test failed; it was only visible by looking at it.
   */
  avatar_hair_06: Object.freeze([
    r(9, 5, 14, 5, 'hair'),
    /*
     * The tail overlaps the cap's columns (9–10) rather than merely touching it
     * at a corner. Drawn at `4..8` against a cap starting at `9`, the two shapes
     * shared no column and the tail rendered as a **detached orange bar floating
     * beside the head** — geometrically adjacent, visually unattached. It ends at
     * row 20, above the sleeve, so it falls against the shoulder instead of
     * merging into the arm.
     */
    r(5, 9, 5, 11, 'hair'), // the widest silhouette in the base set
  ]),

  /* ------------------------------------------------------- head -- */

  wear_head_pizza_visor: Object.freeze([
    r(10, 4, 12, 3, 'red'),
    r(7, 7, 18, 2, 'red-dark'), // the brim, wider than the head
  ]),

  wear_head_beanie_winter: Object.freeze([
    r(14, 0, 4, 3, 'cream'), // the pom — the tallest thing the system draws
    r(10, 2, 12, 5, 'blue-deep'),
    r(9, 7, 14, 3, 'blue'),
  ]),

  wear_head_paper_hat: Object.freeze([
    r(8, 1, 16, 7, 'cream'),
    r(15, 2, 2, 6, 'paper-dark'), // the fold
    r(9, 8, 14, 2, 'cream'),
  ]),

  /* ------------------------------------------------------- face -- */

  wear_face_shades: Object.freeze([
    r(11, 11, 4, 3, 'ink'),
    r(17, 11, 4, 3, 'ink'),
    r(15, 12, 2, 1, 'ink'),
  ]),

  wear_face_mustache_fake: Object.freeze([
    r(12, 15, 8, 2, 'ink'),
    r(11, 14, 1, 2, 'ink'),
    r(20, 14, 1, 2, 'ink'),
  ]),

  /* ------------------------------------------------------- body -- */

  wear_body_apron_tony: Object.freeze([
    r(12, 19, 2, 3, 'red'),
    r(18, 19, 2, 3, 'red'),
    r(11, 21, 10, 6, 'red'),
    r(9, 27, 14, 9, 'red'),
    r(9, 27, 14, 1, 'red-dark'), // the waist tie
  ]),

  wear_body_jersey_blank: Object.freeze([
    r(8, 20, 16, 13, 'blue'),
    r(5, 21, 3, 6, 'blue'),
    r(24, 21, 3, 6, 'blue'),
    r(13, 19, 6, 2, 'cream'), // collar
    r(14, 24, 4, 5, 'cream'), // a number, as a mark rather than a numeral
  ]),

  wear_body_tracksuit: Object.freeze([
    r(8, 20, 16, 14, 'green'),
    r(5, 21, 3, 11, 'green'),
    r(24, 21, 3, 11, 'green'),
    r(5, 21, 1, 11, 'cream'),
    r(26, 21, 1, 11, 'cream'),
    r(11, 34, 1, 11, 'cream'),
    r(20, 34, 1, 11, 'cream'),
  ]),

  wear_body_delivery_uniform: Object.freeze([
    r(8, 20, 16, 13, 'amber'),
    r(5, 21, 3, 11, 'amber'),
    r(24, 21, 3, 11, 'amber'),
    r(12, 19, 8, 2, 'amber-deep'), // collar
    r(17, 23, 5, 4, 'amber-deep'), // chest pocket
  ]),

  /* ------------------------------------------------------- hand -- */

  /*
   * The blade starts at column 24, not 23. At 23 it reached one column into
   * where `avatar_hair_03` falls past the shoulder and drew over it — the same
   * defect as the ponytail, one column wide, and completely invisible in a
   * screenshot. The rule caught this one; the eye caught the first.
   */
  wear_hand_pizza_peel: Object.freeze([
    r(26, 16, 2, 18, 'wood'),
    r(24, 8, 7, 8, 'paper-dark'), // the widest thing the system draws
  ]),

  wear_hand_slice: Object.freeze([
    r(24, 28, 7, 4, 'amber'),
    r(24, 32, 7, 3, 'wood'), // crust
    r(26, 29, 2, 2, 'red'),
  ]),

  wear_hand_trophy_mini: Object.freeze([
    r(24, 27, 6, 5, 'amber'),
    r(26, 32, 2, 3, 'amber-deep'),
    r(24, 35, 6, 2, 'amber-deep'),
  ]),
});

/** The rectangles for a slug. Throws — a slug with no artwork is a defect. */
export function figureFor(slug: string): readonly FigureRect[] {
  const shapes = FIGURES[slug];
  if (shapes === undefined) {
    throw new Error(`no placeholder figure for "${slug}"; every character slug needs one`);
  }
  return shapes;
}

export interface BoundingBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** The occupied box of a set of rectangles. Exact, not sampled. */
export function boundingBox(shapes: readonly FigureRect[]): BoundingBox {
  if (shapes.length === 0) throw new Error('an empty layer has no bounding box');
  return {
    left: Math.min(...shapes.map((s) => s.x)),
    top: Math.min(...shapes.map((s) => s.y)),
    right: Math.max(...shapes.map((s) => s.x + s.w)),
    bottom: Math.max(...shapes.map((s) => s.y + s.h)),
  };
}

/**
 * Are two rectangles joined — overlapping, or sharing an edge of real length?
 *
 * **Corner contact does not count.** Two rectangles meeting at a single point are
 * adjacent to arithmetic and detached to the eye, which is exactly how the
 * ponytail shipped as a floating bar beside the head.
 */
function joined(a: FigureRect, b: FigureRect): boolean {
  const dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const dy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return dx >= 0 && dy >= 0 && (dx > 0 || dy > 0);
}

/**
 * Is a layer one piece?
 *
 * A flood fill over {@link joined}. A layer that is two pieces has a fragment
 * floating unattached to the rest of itself — a hairstyle beside a head, a
 * button off a shirt — and no bounding-box or clipping rule can see it, because
 * every part is inside the canvas and inside the silhouette.
 */
export function isConnected(shapes: readonly FigureRect[]): boolean {
  if (shapes.length <= 1) return true;

  const reached = new Set<number>([0]);
  const queue = [0];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (let i = 0; i < shapes.length; i++) {
      if (reached.has(i)) continue;
      if (joined(shapes[current]!, shapes[i]!)) {
        reached.add(i);
        queue.push(i);
      }
    }
  }
  return reached.size === shapes.length;
}

/** Does any row of `a` overlap any row of `b`? The hat-floats check. */
export function rowsOverlap(a: readonly FigureRect[], b: readonly FigureRect[]): boolean {
  const boxA = boundingBox(a);
  const boxB = boundingBox(b);
  return Math.min(boxA.bottom, boxB.bottom) > Math.max(boxA.top, boxB.top);
}

/** Every slug that must have a figure: the base variants and the wearables. */
export function figuredSlugs(): readonly string[] {
  return [...BASE_VARIANTS.map((v) => v.slug), ...WEARABLES.map((w) => w.slug)];
}

export const FIGURE_CANVAS = CHARACTER_CANVAS;
