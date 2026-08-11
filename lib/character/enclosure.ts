/**
 * Empty space the figure has closed around, and which of it is a defect.
 *
 * ## Why this rule had to change, and what it must not lose
 *
 * The original guard was **"a composite has zero enclosed empty pixels"**, flood
 * filled from outside the canvas. It was right for a *drawn* figure and it caught
 * two real defects that had both shipped:
 *
 * - a **two-column hole down each side**, armpit to hem, where the arm's inner
 *   edge and the torso's outer edge were authored to meet and walked apart;
 * - **twelve pixels through a collarbone**, on two of six tops, where a collar
 *   band cut a wider hole than the neck behind it.
 *
 * Both read as deliberate dark seams in a thumbnail, which is why looking did not
 * find them.
 *
 * **Commissioner ruling R2, 2026-08-11, gave each painted build its own pose**,
 * and that makes the blanket rule impossible to satisfy: a figure standing with
 * one hand in a pocket and the other arm hanging free encloses empty space under
 * the bent arm and beside the hanging hand **by construction**. Those gaps are
 * outlined, intentional, and they are what makes a pose read as a pose rather
 * than a slab. The accepted T-shirt build has exactly two of them, 55 pixels in
 * total.
 *
 * So the rule is narrowed rather than deleted (ruling, 2026-08-11), and it is
 * narrowed along the axis that actually separates the two historical defects from
 * the two legitimate gaps: **thickness**.
 *
 * | | shape | contains a 3 × 3 empty block |
 * |---|---|---|
 * | armpit-to-hem seam | 2 columns wide, ~50 rows | **no** |
 * | collarbone hole | ~6 columns, 2 rows | **no** |
 * | gap under a bent arm | 5 × 8 | yes |
 * | gap beside a hanging hand | 4 × 19 | yes |
 *
 * A seam is a mistake; a space is a space. Nothing in the accepted build is
 * within a factor of two of the boundary, and neither historical defect is close
 * to it from the other side.
 *
 * ## Drawn layers keep the original rule, unchanged
 *
 * A drawn figure poses no differently from one top to the next — the arms are
 * authored once, in one position, against a shared geometry module — so it has no
 * legitimate enclosed space and the strict rule stays exactly as it was. Which
 * rule applies is decided by whether the top has painted artwork, never by which
 * is more convenient.
 */

export interface EnclosedRegion {
  /** How many pixels the figure has closed around. */
  readonly area: number;
  /** Whether it is thick enough anywhere to be a space rather than a seam. */
  readonly hasRoom: boolean;
  /** Top-left of the region, for a failure message somebody can act on. */
  readonly at: { readonly x: number; readonly y: number };
}

/**
 * The share of the figure that may be enclosed space before something is wrong.
 *
 * **Calibrated against the accepted build, not chosen.** Its two gaps are 55
 * pixels against 4,057 painted — **1.36%** — so 3% is a little over twice the
 * headroom the approved pose needs. It exists for the failure thickness cannot
 * see: a large chunk simply missing from the middle of a figure, which is thick
 * everywhere and is obviously a defect.
 */
export const ENCLOSED_AREA_LIMIT = 0.03;

/** The smallest empty square that makes a region a space rather than a seam. */
const ROOM = 3;

/**
 * How much seam-shaped enclosed space a painted build may carry in total.
 *
 * **Twelve, because twelve is the smallest defect this guard has ever had to
 * catch** — the collarbone hole, on two of six tops. The armpit-to-hem seam was
 * roughly a hundred. Both are still refused with room to spare.
 *
 * It is not zero, and the reason is mechanical rather than generous. Where a
 * painted arm's outline converges on a hip's at a shallow angle, the majority
 * vote that turns 1024 source pixels into 112 leaves a **pinch pocket** of one or
 * two pixels — background, fully ringed by outline, roughly one CSS pixel on a
 * phone and indistinguishable from the outline around it. The accepted build has
 * two, four pixels between them. That is a property of downscaling a painted
 * figure, not something an artist can be asked to avoid, and refusing it would
 * refuse every posed build forever.
 *
 * **A budget rather than a per-region allowance**, so that a real seam cannot
 * arrive as a chain of tolerable specks.
 */
export const SEAM_BUDGET = 12;

/**
 * Every empty region the figure has closed around.
 *
 * Flood filled from outside the canvas rather than asserted per row, because the
 * shape of the next hole is not predictable and a row test would have to be
 * rewritten for it.
 */
export function enclosedRegions(solid: readonly (readonly boolean[])[]): readonly EnclosedRegion[] {
  const height = solid.length;
  const width = solid[0]?.length ?? 0;
  if (height === 0 || width === 0) return [];

  const outside = Array.from({ length: height }, () => Array.from({ length: width }, () => false));
  const queue: [number, number][] = [];
  for (let x = 0; x < width; x++) queue.push([x, 0], [x, height - 1]);
  for (let y = 0; y < height; y++) queue.push([0, y], [width - 1, y]);

  while (queue.length > 0) {
    const [x, y] = queue.pop()!;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    if (outside[y]![x] || solid[y]![x]) continue;
    outside[y]![x] = true;
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  const empty = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && !solid[y]![x];

  const claimed = Array.from({ length: height }, () => Array.from({ length: width }, () => false));
  const parts: Part[] = [];

  for (let y0 = 0; y0 < height; y0++) {
    for (let x0 = 0; x0 < width; x0++) {
      if (solid[y0]![x0] || outside[y0]![x0] || claimed[y0]![x0]) continue;

      let hasRoom = false;
      const pixels: [number, number][] = [];
      const walk: [number, number][] = [[x0, y0]];
      claimed[y0]![x0] = true;

      while (walk.length > 0) {
        const [x, y] = walk.pop()!;
        pixels.push([x, y]);

        /*
         * A `ROOM × ROOM` block of empty anchored anywhere at or above-left of
         * this pixel. Checked per pixel rather than from the bounding box: an
         * L-shaped region can be five wide and five tall and still be two thick
         * everywhere, and a bounding box would call that a space.
         */
        if (!hasRoom) {
          let block = true;
          for (let dy = 0; dy < ROOM && block; dy++) {
            for (let dx = 0; dx < ROOM; dx++) {
              if (!empty(x + dx, y + dy)) {
                block = false;
                break;
              }
            }
          }
          if (block) hasRoom = true;
        }

        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (solid[ny]![nx] || claimed[ny]![nx]) continue;
          claimed[ny]![nx] = true;
          walk.push([nx, ny]);
        }
      }

      parts.push({ pixels, hasRoom, at: { x: x0, y: y0 } });
    }
  }

  return parts.map(({ pixels, hasRoom, at }) => ({ area: pixels.length, hasRoom, at }));
}

interface Part {
  readonly pixels: readonly (readonly [number, number])[];
  readonly hasRoom: boolean;
  readonly at: { readonly x: number; readonly y: number };
}

/**
 * What is wrong with a figure's enclosed space, in words.
 *
 * `painted` selects the rule: a drawn figure may enclose nothing at all, and a
 * painted build may enclose intentional space but not a seam and not a large
 * chunk of itself.
 */
export function enclosureProblems(
  solid: readonly (readonly boolean[])[],
  { painted }: { readonly painted: boolean },
): readonly string[] {
  const regions = enclosedRegions(solid);
  if (regions.length === 0) return [];

  const total = regions.reduce((sum, region) => sum + region.area, 0);

  if (!painted) {
    return [
      `a drawn figure encloses ${String(total)} pixels of room in ${String(regions.length)} ` +
        `place(s), first at (${String(regions[0]!.at.x)}, ${String(regions[0]!.at.y)}). A drawn ` +
        'figure poses identically under every top, so it has no legitimate enclosed space — this ' +
        'is the armpit-to-hem seam or the collarbone hole coming back.',
    ];
  }

  const problems: string[] = [];

  const seams = regions.filter((region) => !region.hasRoom);
  const seamArea = seams.reduce((sum, region) => sum + region.area, 0);
  if (seamArea >= SEAM_BUDGET) {
    problems.push(
      `${String(seamArea)} pixels of enclosed space are nowhere ${String(ROOM)} pixels across, ` +
        `over the ${String(SEAM_BUDGET)}-pixel budget, in ${String(seams.length)} place(s), first ` +
        `at (${String(seams[0]!.at.x)}, ${String(seams[0]!.at.y)}). A pose encloses a *space*; ` +
        'something this thin is two edges that failed to meet, which is exactly the defect that ' +
        'shipped twice.',
    );
  }

  let solidPixels = 0;
  for (const row of solid) for (const cell of row) if (cell) solidPixels++;
  if (solidPixels > 0 && total / solidPixels > ENCLOSED_AREA_LIMIT) {
    problems.push(
      `${String(total)} enclosed pixels is ${((total / solidPixels) * 100).toFixed(1)}% of the ` +
        `figure, over the ${String(ENCLOSED_AREA_LIMIT * 100)}% a pose needs. Thickness cannot ` +
        'see a chunk simply missing from the middle of a figure; this is what does.',
    );
  }

  return problems;
}
