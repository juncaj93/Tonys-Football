/**
 * The sprite engine — how a character layer becomes pixels.
 *
 * ## Why a rasteriser rather than a list of rectangles
 *
 * The system this replaces drew each layer as eight or nine flat `<rect>`s. That
 * is readable as data and it is not pixel art: no outline, no light direction, no
 * curve, and a head that is a literal square. It was honest about being a
 * stand-in, and it is what made the customiser read as a diagram of a character
 * rather than as a character.
 *
 * Authoring the alternative as literal 64-wide ASCII rows was the obvious next
 * step and it is a trap: a mis-typed row is invisible in review and there are
 * roughly thirty layers. So a layer is authored as a handful of **shapes** —
 * ellipses, rectangles, polygons, individual pixels — which are rasterised onto
 * the shared canvas. Curves come out as pixel curves, every layer is authored in
 * the same units, and a typo is a number rather than a silently ragged edge.
 *
 * ## Shading is derived, not authored
 *
 * `MANDATE`-adjacent, and the reason is consistency across a set nobody can hold
 * in their head at once: **one light direction, from the upper left, applied by
 * the same pass to every layer.** An author who has to remember which side the
 * light is on will get it wrong on the twenty-ninth sprite, and the twenty-ninth
 * sprite is the one nobody looks at twice.
 *
 * ## The pass models a form, not an edge
 *
 * The first version of this pass marked a pixel `shade` when it failed
 * `solid(x + 1, y + 1) && solid(x, y + 2) && solid(x + 2, y)` — a one-pixel ring
 * on the lower right, and `base` everywhere else. That is a **rim**, and a rim is
 * what a flat cut-out looks like when you trace its bottom edge: every garment
 * came out one flat colour inside a dark outline, which is exactly what the
 * commissioner named as *too flat* and *too geometric*.
 *
 * What replaces it measures how far a pixel is from the shape's own boundary in
 * each of the four directions, and reads two numbers off that:
 *
 * - **`lit`** — the distance to the boundary in the direction of the light,
 *   `min(up, left)`
 * - **`dark`** — the distance to the boundary away from it, `min(down, right)`
 *
 * Their sum is the local **thickness** of the form under that pixel, and the
 * bands are a fraction of it. So an arm ten pixels across gets a one-pixel rim
 * and a three-pixel shadow, and a torso forty across gets three and six, from the
 * same constants. Nothing is authored per layer and nothing needs a hand-drawn
 * shadow to look round.
 *
 * Four tones come out of one material:
 *
 * - **outline** where a solid pixel touches empty space — the silhouette read
 *   `VISUAL_ACCEPTANCE` asks for, and what lets a hat sit legibly on hair of a
 *   similar value
 * - **light** on the inner upper/left edge, one step up the ramp
 * - **shade** on the inner lower/right region
 * - **base** in between
 *
 * The third tone was previously refused on the grounds that *"a third tone per
 * material would mean inventing colours the room does not have"*. It does not:
 * `lib/character/palette.ts` takes it one step **up** the same ramp the shadow
 * rule already steps down. What was true, and is what changed, is that at
 * `64 × 96` a third step landed on too few pixels to read.
 *
 * ## No partial alpha, ever
 *
 * A pixel is one of the materials or it is empty. `docs/M3_CHARACTER_BOUNDARY.md
 * §3` bans soft edges for the affordance glow's sake, and a rasteriser that
 * antialiased would reintroduce them everywhere at once.
 */

/** What a rasterised pixel is made of. Resolved to a colour at draw time. */
export type Material =
  /** The layer's own colour — skin, hair or garment, per the configuration. */
  | 'main'
  /**
   * The layer's secondary colour. Always the shade tone, never lit.
   *
   * For the shadows that are anatomy rather than geometry — under a jaw, down a
   * temple, where an arm meets a body — which the form pass cannot find because
   * the shape casting them is continuous with the shape receiving them.
   *
   * **There is deliberately no `lit` counterpart.** One was written, and after
   * the layers were drawn nothing used it: every highlight the figure has, the
   * form pass finds on its own. A material with no consumer is the shape of the
   * defect that took every character save down for a month (`docs/CHARACTER_CUSTOMISATION_BOUNDARY.md §0`),
   * and re-adding one is four lines if a layer ever earns it.
   */
  | 'alt'
  /** Forced ink. For eyes, a mouth, a drawn seam. */
  | 'ink'
  /** A fixed colour from the locked palette, by key (`lib/character/palette.ts`). */
  | `fixed:${string}`;

/** A rasterised pixel's final role, after shading. */
export type Tone = 'outline' | 'shade' | 'base' | 'light' | 'ink' | `fixed:${string}`;

/**
 * The three tones the light moves a pixel between, darkest first.
 *
 * `composite.ts` walks this to cast one layer's shadow onto the layer beneath
 * it: a step along this list is the whole of what "in shadow" means, so an
 * occluded highlight becomes a base rather than becoming ink.
 */
export const TONE_RAMP = ['shade', 'base', 'light'] as const;
export type RampTone = (typeof TONE_RAMP)[number];

export function isRampTone(tone: string): tone is RampTone {
  return (TONE_RAMP as readonly string[]).includes(tone);
}

/**
 * One step darker along {@link TONE_RAMP}. `shade` is already the bottom.
 *
 * **A fixed colour steps too**, at its own `key@role` suffix. Leaving it out was
 * the first version's mistake and it cost exactly the shadow that matters most:
 * a shirt hem's shadow falls on the **trousers**, and the trousers are the
 * largest fixed-colour surface on the figure. `outline` and `ink` are deliberate
 * decisions about a pixel and never move.
 */
export function darker(tone: Tone, steps = 1): Tone {
  const step = (role: string): string =>
    TONE_RAMP[Math.max(0, TONE_RAMP.indexOf(role as RampTone) - steps)]!;

  if (isRampTone(tone)) return step(tone) as Tone;

  const at = tone.indexOf('@');
  if (at === -1 || !tone.startsWith('fixed:')) return tone;
  const role = tone.slice(at + 1);
  return isRampTone(role) ? (`${tone.slice(0, at)}@${step(role)}` as Tone) : tone;
}

export interface Shape {
  readonly material: Material;
}

export type Op =
  | (Shape & { readonly kind: 'rect'; readonly x: number; readonly y: number; readonly w: number; readonly h: number })
  | (Shape & { readonly kind: 'ellipse'; readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number })
  | (Shape & { readonly kind: 'poly'; readonly points: readonly (readonly [number, number])[] })
  | (Shape & { readonly kind: 'pixels'; readonly at: readonly (readonly [number, number])[] })
  /** Cut a hole. Used for a collar opening, a sleeve gap, a hand showing through. */
  | { readonly kind: 'erase'; readonly x: number; readonly y: number; readonly w: number; readonly h: number }
  | { readonly kind: 'eraseEllipse'; readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number };

export const rect = (
  x: number, y: number, w: number, h: number, material: Material = 'main',
): Op => ({ kind: 'rect', x, y, w, h, material });

export const ellipse = (
  cx: number, cy: number, rx: number, ry: number, material: Material = 'main',
): Op => ({ kind: 'ellipse', cx, cy, rx, ry, material });

export const poly = (
  points: readonly (readonly [number, number])[], material: Material = 'main',
): Op => ({ kind: 'poly', points, material });

export const pixels = (
  at: readonly (readonly [number, number])[], material: Material = 'ink',
): Op => ({ kind: 'pixels', at, material });

export const erase = (x: number, y: number, w: number, h: number): Op =>
  ({ kind: 'erase', x, y, w, h });

/**
 * A rectangle drawn as four edges rather than as a filled block with a hole in it.
 *
 * `rect` + `erase` is the obvious way to draw a pocket and it is wrong: `erase`
 * removes **this layer's** pixels, so the hole shows whatever is underneath. On a
 * hoodie that is the manager's bare chest, and it shipped in the first render as
 * a skin-coloured slab across the front of every character wearing one.
 */
export const outline = (
  x: number, y: number, w: number, h: number, material: Material = 'alt',
): readonly Op[] => [
  { kind: 'rect', x, y, w, h: 1, material },
  { kind: 'rect', x, y: y + h - 1, w, h: 1, material },
  { kind: 'rect', x, y, w: 1, h, material },
  { kind: 'rect', x: x + w - 1, y, w: 1, h, material },
];

export const eraseEllipse = (cx: number, cy: number, rx: number, ry: number): Op =>
  ({ kind: 'eraseEllipse', cx, cy, rx, ry });

/**
 * A grid of materials, `null` where nothing is drawn.
 *
 * Row-major, `grid[y][x]`. Plain arrays rather than a typed buffer because the
 * values are strings and because this is computed once per layer at module load,
 * never per render.
 */
export type MaterialGrid = readonly (readonly (Material | null)[])[];

/** A grid of final tones. What the renderer actually walks. */
export type ToneGrid = readonly (readonly (Tone | null)[])[];

function inEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number): boolean {
  /*
   * Sampled at the pixel's centre, which is what makes a small ellipse come out
   * symmetric. Sampling at the corner puts an extra pixel on two sides and is
   * exactly the wobble that makes a hand-rasterised head look broken.
   */
  const dx = (x + 0.5 - cx) / rx;
  const dy = (y + 0.5 - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function inPolygon(x: number, y: number, points: readonly (readonly [number, number])[]): boolean {
  const px = x + 0.5;
  const py = y + 0.5;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]!;
    const [xj, yj] = points[j]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Rasterise a layer's shapes onto a fresh grid of the given size. */
export function rasterise(ops: readonly Op[], width: number, height: number): MaterialGrid {
  const grid: (Material | null)[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => null),
  );

  const put = (x: number, y: number, material: Material | null): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    grid[y]![x] = material;
  };

  for (const op of ops) {
    switch (op.kind) {
      case 'rect':
        for (let y = op.y; y < op.y + op.h; y++) {
          for (let x = op.x; x < op.x + op.w; x++) put(x, y, op.material);
        }
        break;

      case 'ellipse':
        for (let y = Math.floor(op.cy - op.ry); y <= Math.ceil(op.cy + op.ry); y++) {
          for (let x = Math.floor(op.cx - op.rx); x <= Math.ceil(op.cx + op.rx); x++) {
            if (inEllipse(x, y, op.cx, op.cy, op.rx, op.ry)) put(x, y, op.material);
          }
        }
        break;

      case 'poly': {
        const xs = op.points.map(([x]) => x);
        const ys = op.points.map(([, y]) => y);
        for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
          for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
            if (inPolygon(x, y, op.points)) put(x, y, op.material);
          }
        }
        break;
      }

      case 'pixels':
        for (const [x, y] of op.at) put(x, y, op.material);
        break;

      case 'erase':
        for (let y = op.y; y < op.y + op.h; y++) {
          for (let x = op.x; x < op.x + op.w; x++) put(x, y, null);
        }
        break;

      case 'eraseEllipse':
        for (let y = Math.floor(op.cy - op.ry); y <= Math.ceil(op.cy + op.ry); y++) {
          for (let x = Math.floor(op.cx - op.rx); x <= Math.ceil(op.cx + op.rx); x++) {
            if (inEllipse(x, y, op.cx, op.cy, op.rx, op.ry)) put(x, y, null);
          }
        }
        break;
    }
  }

  return grid;
}

/**
 * Turn materials into tones — the one place light direction is decided.
 *
 * `main` becomes outline / shade / base; everything else passes through, because
 * a deliberate ink pixel is a decision and a fixed palette colour belongs to the
 * object rather than to the lighting.
 *
 * **Outlining is per layer, on purpose.** A hat outlined against the hair beneath
 * it is how a hat reads as a separate object; outlining only the flattened
 * silhouette would merge every layer of similar value into one blob, which is the
 * failure mode of a system whose whole point is that the parts are swappable.
 */
/**
 * How much of a form the lit rim and the shadow band each take.
 *
 * Fractions rather than pixel counts, because the same layer file draws a
 * six-pixel drawstring and a forty-pixel torso and a constant band cannot serve
 * both: three pixels of shadow on the drawstring is the whole drawstring.
 *
 * **The clamps are doing more work than the fractions, and that is deliberate.**
 * `dark` is `min(down, right)`, so on a torso half a hundred pixels across, the
 * contour where it equals a large number is an L whose corner reads as a
 * **diagonal wedge across the chest** — a fold, not a form. Photographed at
 * `shadeMax: 12` it cut every shirt in half on the bias. Capped at six it is what
 * it should be: a band down the shaded flank and along the hem, the way a shirt
 * is actually lit.
 */
const RIM = Object.freeze({
  lightFraction: 0.14,
  lightMax: 3,
  shadeFraction: 0.22,
  shadeMax: 6,
});

/**
 * Consecutive solid pixels from here in one direction, counting this one.
 *
 * The recurrence reads the neighbour **in the direction being measured** —
 * `up[y][x] = up[y - 1][x] + 1` — and the scan order is chosen so that neighbour
 * is already done. Reading the neighbour on the *other* side instead is a silent
 * catastrophe rather than a wrong number: every depth comes back `1`, the edge
 * test `up === 1` fires on every solid pixel, and the entire figure renders as
 * outline. It looks like a deliberately flat style and it is a transposed sign.
 */
function runDepths(
  grid: MaterialGrid,
  width: number,
  height: number,
  dx: number,
  dy: number,
): Int16Array {
  const out = new Int16Array(width * height);
  const rows = [...Array(height).keys()];
  const cols = [...Array(width).keys()];
  const ys = dy > 0 ? [...rows].reverse() : rows;
  const xs = dx > 0 ? [...cols].reverse() : cols;

  for (const y of ys) {
    for (const x of xs) {
      if (grid[y]![x] === null) continue;
      const py = y + dy;
      const px = x + dx;
      const before =
        px < 0 || py < 0 || px >= width || py >= height ? 0 : out[py * width + px]!;
      out[y * width + x] = before + 1;
    }
  }
  return out;
}

/**
 * Turn materials into tones — the one place light direction is decided.
 *
 * `ink` passes through, because a deliberate ink pixel is a decision. `alt` pins
 * a pixel to the dark end of the ramp for the shadows the geometry cannot see
 * (see {@link Material}).
 *
 * **Outlining is per layer, on purpose.** A hat outlined against the hair beneath
 * it is how a hat reads as a separate object; outlining only the flattened
 * silhouette would merge every layer of similar value into one blob, which is the
 * failure mode of a system whose whole point is that the parts are swappable.
 * Which of those outlines is drawn in *ink* and which in the layer's own shade is
 * a question about the composite, and `composite.ts` answers it there.
 */
export function shade(grid: MaterialGrid): ToneGrid {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;

  const up = runDepths(grid, width, height, 0, -1);
  const down = runDepths(grid, width, height, 0, 1);
  const left = runDepths(grid, width, height, -1, 0);
  const right = runDepths(grid, width, height, 1, 0);

  return grid.map((row, y) =>
    row.map((material, x): Tone | null => {
      if (material === null) return null;
      const at = y * width + x;

      /*
       * A depth of 1 in any direction *is* "the neighbour that way is empty",
       * so the four run lengths already answer the edge test and no second scan
       * is needed.
       */
      const onEdge = up[at] === 1 || down[at] === 1 || left[at] === 1 || right[at] === 1;

      // How thick the shape is under this pixel, each way. A mark thinner than
      // three has no interior, so it has no lit side and no shadow side either.
      const across = Math.min(up[at]! + down[at]!, left[at]! + right[at]!) - 1;
      const solidEnoughToOutline = across >= 3;

      /*
       * **The silhouette is outlined whatever it is made of** — but a fixed
       * colour is an explicit decision about a pixel and a one-pixel mark is
       * *all* edge, so outlining it silently repaints it in ink.
       *
       * Both halves of that are defects this rule has already paid for. The
       * winter beanie's cream pom went un-outlined and was invisible against the
       * cream panel the customiser draws on, which is why outlining stopped being
       * `main`-only. And the hoodie's two cream drawstrings — one pixel wide —
       * have been rendering as `ink-900` ever since, because every pixel of them
       * touches empty. A layer's outline is a property of its shape: the pom has
       * an interior and the drawstring does not.
       *
       * The manager's own materials are never exempt. The figure's edge has to
       * hold against a dark basement wall whatever it is made of.
       */
      const ownMaterial = material === 'main' || material === 'alt' || material === 'ink';
      if (onEdge && (ownMaterial || solidEnoughToOutline)) return 'outline';

      if (material === 'ink') return 'ink';
      if (material === 'alt') return 'shade';

      const role = across < 3 ? 'base' : formRole(up[at]!, down[at]!, left[at]!, right[at]!);

      if (material === 'main') return role;
      // A fixed ramp's step travels with the pixel: the tone grid is cached per
      // slug and computed long before any colour is resolved.
      return `${material}@${role}`;
    }),
  );
}

/**
 * Which step of a ramp a pixel of solid form sits at, given its four depths.
 *
 * ## Four independent bands, not two distances
 *
 * The obvious formulation is `lit = min(up, left)`, `dark = min(down, right)`,
 * and band on those. It is wrong in a way that only a picture shows: the contour
 * where `min(down, right)` equals six is an **L**, and the corner of that L is a
 * clean 45° line running across the middle of any large form. Photographed on a
 * T-shirt it is a diagonal crease from the left hip to the right ribs — the eye
 * reads it as a fold in the fabric, and there is no fold.
 *
 * Each edge gets its own band instead, thickened against the form's extent *in
 * that direction*: a band down the shaded flank, a band along the bottom, and
 * they meet in a **rectangular** corner. Rectangular corners are what pixel art
 * is made of; diagonals in a shading pass are always an artefact.
 *
 * Shadow wins the two contested corners. A pixel that is both near the top and
 * near the shaded flank is on a surface turning away from the light, and the
 * alternative — lighting the bottom-left of every limb, because *left* is small
 * there — is a second light source, which is the one thing a single light
 * direction exists to prevent.
 */
function formRole(up: number, down: number, left: number, right: number): 'light' | 'base' | 'shade' {
  const band = (extent: number, fraction: number, cap: number): number =>
    Math.min(cap, Math.max(1, Math.round(extent * fraction)));

  // How thick the form is under this pixel, each way.
  const vertical = up + down - 1;
  const horizontal = left + right - 1;

  const shaded =
    right - 1 <= band(horizontal, RIM.shadeFraction, RIM.shadeMax) ||
    down - 1 <= band(vertical, RIM.shadeFraction, RIM.shadeMax);
  if (shaded) return 'shade';

  const lit =
    left - 1 <= band(horizontal, RIM.lightFraction, RIM.lightMax) ||
    up - 1 <= band(vertical, RIM.lightFraction, RIM.lightMax);
  return lit ? 'light' : 'base';
}

export interface Run<T extends string> {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly value: T;
}

export type ToneRun = Run<Tone>;

/**
 * A tone grid as the fewest rectangles that draw it.
 *
 * Horizontal run-length first, then identical runs merged downward. A composite
 * is 6,144 pixels and would be 6,144 SVG nodes drawn naively — enough DOM to be
 * felt on a phone, on a page that also draws the room behind it. Measured on the
 * default character this returns a few hundred.
 *
 * **Lossless, and a test says so.** The decomposition is an optimisation of the
 * drawing and never of the picture: expanding the runs must reproduce the grid
 * exactly, including where two tones meet.
 */
export function toRuns<T extends string>(
  grid: readonly (readonly (T | null)[])[],
): readonly Run<T>[] {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;

  // Horizontal runs, per row.
  const rows: Run<T>[][] = grid.map((row, y) => {
    const runs: Run<T>[] = [];
    let x = 0;
    while (x < width) {
      const value = row[x];
      if (value === null || value === undefined) {
        x++;
        continue;
      }
      let end = x;
      while (end + 1 < width && row[end + 1] === value) end++;
      runs.push({ x, y, w: end - x + 1, h: 1, value });
      x = end + 1;
    }
    return runs;
  });

  // Merge a run into the identical run directly above it.
  const out: Run<T>[] = [];
  const open = new Map<string, Run<T>>();

  for (let y = 0; y < height; y++) {
    const nextOpen = new Map<string, Run<T>>();
    for (const run of rows[y] ?? []) {
      const key = `${String(run.x)}:${String(run.w)}:${run.value}`;
      const above = open.get(key);
      if (above !== undefined && above.y + above.h === y) {
        nextOpen.set(key, { ...above, h: above.h + 1 });
        open.delete(key);
      } else {
        nextOpen.set(key, run);
      }
    }
    // Anything not continued this row is finished.
    for (const run of open.values()) out.push(run);
    open.clear();
    for (const [key, run] of nextOpen) open.set(key, run);
  }
  for (const run of open.values()) out.push(run);

  return out;
}

export interface Bounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** The occupied box of a grid, exclusive on the right and bottom. `null` if empty. */
export function bounds(grid: ToneGrid | MaterialGrid): Bounds | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  grid.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell === null) return;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    });
  });

  return left === Infinity ? null : { left, top, right, bottom };
}

/** Draw one grid over another. The later grid wins wherever it is not empty. */
export function over(under: ToneGrid, above: ToneGrid): ToneGrid {
  return under.map((row, y) => row.map((cell, x) => above[y]?.[x] ?? cell));
}

/** How many pixels a grid occupies. For the "is this layer actually drawn" tests. */
export function coverage(grid: ToneGrid | MaterialGrid): number {
  return grid.reduce(
    (total, row) => total + row.reduce((n, cell) => n + (cell === null ? 0 : 1), 0),
    0,
  );
}
