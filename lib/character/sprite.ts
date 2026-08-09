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
 * Three tones come out of one material:
 *
 * - **outline** where a solid pixel touches empty space — the silhouette read
 *   `VISUAL_ACCEPTANCE` asks for, and what lets a hat sit legibly on hair of a
 *   similar value
 * - **shade** on the inner lower/right edge
 * - **base** everywhere else
 *
 * That is a two-tone ramp plus ink, and two tones is deliberate: every colour in
 * `art/palette.json` is a locked value, and a third tone per material would mean
 * inventing colours the room does not have (`lib/character/palette.ts`).
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
  /** The layer's secondary colour. Always the shade tone, never lit. */
  | 'alt'
  /** Forced ink. For eyes, a mouth, a drawn seam. */
  | 'ink'
  /** A fixed colour from the locked palette, by key (`lib/character/palette.ts`). */
  | `fixed:${string}`;

/** A rasterised pixel's final role, after shading. */
export type Tone = 'outline' | 'shade' | 'base' | 'alt' | 'ink' | `fixed:${string}`;

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
export function shade(grid: MaterialGrid): ToneGrid {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;

  const solid = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && grid[y]![x] !== null;

  return grid.map((row, y) =>
    row.map((material, x): Tone | null => {
      if (material === null) return null;

      /*
       * **The silhouette is outlined whatever it is made of.**
       *
       * This used to apply only to `main`, and the cost was a class of defect
       * rather than one instance: a shape in a fixed pale colour had no edge at
       * all, so the winter beanie's cream pom was invisible against the cream
       * panel the customiser draws on. A layer's outline is a property of its
       * shape, not of its material.
       */
      if (!solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1)) {
        return 'outline';
      }

      if (material === 'ink') return 'ink';
      if (material === 'alt') return 'alt';
      if (material !== 'main') return material;

      /*
       * The inner ring on the lower and right sides. One test, applied
       * identically everywhere, is what makes thirty sprites look lit by the
       * same lamp — see the module note.
       */
      if (!solid(x + 1, y + 1) || !solid(x, y + 2) || !solid(x + 2, y)) return 'shade';

      return 'base';
    }),
  );
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
