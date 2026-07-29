/**
 * Derived assets — the pipeline's second stage.
 *
 *   npm run art:derive
 *
 * `art:process` turns a generated painting into a palette-closed sprite. That
 * is a pure function of the source file, and every asset in the product is
 * exactly that and nothing more.
 *
 * **One asset is not.** `zone_parlor_shell` needs its Tonight board moved five
 * logical units right so the board, the championship rail and the banner row
 * share a centre. The shift cannot happen in the source: 5 logical units is
 * 14.7 source pixels at the shell's 2.9406:1 ratio, and moving a painted board
 * by a fractional pixel then downsampling it resamples the frame's one-pixel
 * bevel into mush. It has to happen after quantization, on the 320 x 569 grid,
 * where a unit is a unit.
 *
 * So this exists, and it runs **as part of `art:process`** rather than beside
 * it. A derived stage that a person has to remember to run is a stage that
 * silently reverts the next time somebody reprocesses the batch.
 *
 * ## The rules this stage plays by
 *
 * 1. **The registered output is still reproducible from the source**, in two
 *    commands instead of one, both committed and both deterministic.
 * 2. **`art/incoming/` is never touched.** The approved painting stays approved.
 * 3. **Idempotent, and it proves it rather than assuming it.** Every transform
 *    measures the asset first and decides from what it finds. Running twice is
 *    a no-op; running against an asset in an unrecognised state is an error,
 *    never a second shift.
 *
 * Rule 3 is the whole design. A blind `copy the block right by 5` run twice
 * smears the board across the wall, and nothing downstream would notice.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

const OUTPUT_ROOT = path.join(process.cwd(), 'public', 'assets');

/** `#RRGGBB`, uppercase, for the wall comparisons below. */
function hexAt(pixels: Buffer, width: number, x: number, y: number): string {
  const i = (y * width + x) * 4;
  return `#${[pixels[i], pixels[i + 1], pixels[i + 2]]
    .map((v) => (v ?? 0).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();
}

/** The board as the shell is painted, and as it must end up. Inclusive. */
const BOARD = { left: 49, right: 180, top: 79, bottom: 179 } as const;

/** 132. A property of the painting; the shift moves the board, never resizes it. */
const BOARD_WIDTH = BOARD.right - BOARD.left + 1;

/**
 * The frame's colour sequence reading inward from its last column, at a row
 * well inside the board. Amber lip, dark bevel, red face, shadow, inner tan.
 *
 * This is the integrity check. The right edge below says *where* the board is;
 * this says the thing found there is actually the board.
 */
const FRAME_PROFILE = [
  '#C97A22',
  '#C97A22',
  '#4A2E1C',
  '#8C1F22',
  '#8C1F22',
  '#5E3A25',
  '#A9713F',
] as const;
const PROFILE_ROW = 128;

/**
 * The last column of the Tonight board's outer frame, measured.
 *
 * ## Why the right edge and not the left
 *
 * A constant would be a claim about the file. This is a question asked of the
 * file, and the answer is what tells us whether the shift has already happened.
 * But only one side can answer it.
 *
 * The board sits between two different materials: a dark panel on its **left**
 * and lit wall (`#F2A94B`) on its **right**. The panel's edge is architecture —
 * it stays put when the board moves, and the vacated strip is filled with wall,
 * so a left-edge scan returns the same number before and after the shift and
 * cannot tell the two states apart. The lit wall on the right has no such
 * problem: it begins where the board ends, so it moves when the board does.
 *
 * Left is then derived from the width, which the transform never changes, and
 * `FRAME_PROFILE` confirms the result is a board rather than a coincidence.
 */
export function locateBoardRightEdge(pixels: Buffer, width: number): number {
  const FIRST_ROW = 85;
  const LAST_ROW = 170;
  const ROWS = LAST_ROW - FIRST_ROW + 1;
  const LIT_WALL = '#F2A94B';
  const SOLID = 0.95;

  // x 195 is lit wall in both states. Walk left while it stays lit wall.
  let right = 195;
  while (right > 0) {
    let n = 0;
    for (let y = FIRST_ROW; y <= LAST_ROW; y++) if (hexAt(pixels, width, right, y) === LIT_WALL) n++;
    if (n / ROWS < SOLID) break;
    right--;
  }
  return right;
}

/** Whether the frame's own colours are where a board's frame should be. */
function looksLikeTheBoard(pixels: Buffer, width: number, right: number): boolean {
  return FRAME_PROFILE.every(
    (colour, i) => hexAt(pixels, width, right - i, PROFILE_ROW) === colour,
  );
}

/**
 * Five, and the arithmetic that fixes it.
 *
 * The rail rod is `x 54-184`. Six banners at width 18 and gap 4 occupy 128
 * units, and they must sit inside the rod and share the board's centre. The
 * board is 132 wide, so its centre is `left + 65.5`; the row's is
 * `first + 63.5`. Setting those equal puts the row two units right of the
 * board's left edge, and the row's own containment in the rod fixes the rest:
 * the only placement where all four attachment nubs land on rod pixels and
 * the row does not overhang the rod's right end is **first = 56**, which needs
 * the board's left edge at 54.
 *
 * `54 - 49 = 5`.
 *
 * **This was recorded as +6 for one day.** The board was measured 130 wide,
 * x 49-178, because the scan stopped at the frame's dark bevel and missed the
 * amber lip at x 179-180 — the same lip it correctly kept at x 49-50 on the
 * other side. The corrected width is 132 and the shift is 5. Every other
 * figure in `art/B2_CHAMPION_BANNER.md` is unchanged by the correction,
 * including all six slots, because they were derived from the rod rather than
 * from the board.
 */
const SHIFT = 5;

/**
 * The wall row the vacated strip is filled from.
 *
 * The dark panel's edge at x 48/49 is a single straight vertical line running
 * from roughly y 60 to y 182 — panel on the left, lit wall on the right — and
 * the board's amber left lip sits flush against it in the same colour as the
 * wall above and below. Filling the vacated columns with *panel* would put a
 * five-unit dark notch in that line for exactly the board's height, which is
 * the one visible way to get this wrong.
 *
 * So the fill comes from directly above the board instead: each vacated pixel
 * takes its own column's colour at the wall row, extending the wall straight
 * down behind where the board used to be.
 */
const WALL_SOURCE_ROW = BOARD.top - 1;

export type DeriveAction = 'applied' | 'already-derived';

/**
 * Move the Tonight board right by `SHIFT`, in place, on a raw RGBA buffer.
 *
 * Returns what it decided to do. Throws if the board is somewhere neither
 * recognised state puts it, because at that point the file is not what this
 * transform was written against and guessing would corrupt it.
 */
export function shiftBoard(pixels: Buffer, width: number): DeriveAction {
  const right = locateBoardRightEdge(pixels, width);
  const left = right - BOARD_WIDTH + 1;

  if (!looksLikeTheBoard(pixels, width, right)) {
    throw new Error(
      `zone_parlor_shell: found a wall edge at x ${String(right)}, but the frame colours ` +
        `there are not the Tonight board's. Refusing to shift — see scripts/derive-art.ts.`,
    );
  }

  if (right === BOARD.right + SHIFT) return 'already-derived';

  if (right !== BOARD.right) {
    throw new Error(
      `zone_parlor_shell: the Tonight board is at x ${String(left)}-${String(right)}, ` +
        `which is neither the painted position (${String(BOARD.left)}-${String(BOARD.right)}) ` +
        `nor the derived one (${String(BOARD.left + SHIFT)}-${String(BOARD.right + SHIFT)}). ` +
        `Refusing to shift — see scripts/derive-art.ts.`,
    );
  }

  const at = (x: number, y: number): number => (y * width + x) * 4;
  const copy = (from: number, to: number): void => {
    pixels[to] = pixels[from]!;
    pixels[to + 1] = pixels[from + 1]!;
    pixels[to + 2] = pixels[from + 2]!;
    pixels[to + 3] = pixels[from + 3]!;
  };

  // Right to left, so the block does not smear over itself.
  for (let y = BOARD.top; y <= BOARD.bottom; y++) {
    for (let x = BOARD.right; x >= BOARD.left; x--) copy(at(x, y), at(x + SHIFT, y));
  }

  // The vacated strip becomes wall, continued downward from above the board.
  for (let y = BOARD.top; y <= BOARD.bottom; y++) {
    for (let x = BOARD.left; x < BOARD.left + SHIFT; x++) copy(at(x, WALL_SOURCE_ROW), at(x, y));
  }

  return 'applied';
}

/** Every derived stage in the product. There is one. */
const DERIVATIONS = [
  {
    slug: 'zone_parlor_shell',
    family: 'zone',
    what: 'Tonight board shifted +5 to co-centre with the championship rail',
    transform: shiftBoard,
  },
] as const;

export async function deriveAll(): Promise<void> {
  for (const derivation of DERIVATIONS) {
    const file = path.join(OUTPUT_ROOT, derivation.family, `${derivation.slug}.png`);
    if (!existsSync(file)) continue;

    const { data, info } = await sharp(file)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = Buffer.from(data);
    const action = derivation.transform(pixels, info.width);

    if (action === 'applied') {
      await sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } })
        .png({ compressionLevel: 9, palette: true })
        .toFile(file);
    }

    console.log(
      `${derivation.slug.padEnd(28)} ${action === 'applied' ? 'derived  ' : 'unchanged'} · ${derivation.what}`,
    );
  }
}

if (require.main === module) {
  deriveAll().catch((error: unknown) => {
    console.error(`\nDerive failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
