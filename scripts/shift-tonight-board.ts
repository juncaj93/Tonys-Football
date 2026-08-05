/**
 * A one-time correction to `zone_parlor_shell`, kept for provenance.
 *
 *   npx tsx scripts/shift-tonight-board.ts
 *
 * **This is not a pipeline stage and must not become one.** `art:process` turns
 * a generated painting into a palette-closed sprite, and every asset in the
 * product is a pure function of its source file. That property is worth more
 * than any convenience, so this file deliberately does not generalise: it moves
 * one named board on one named asset, it is not imported by the processor, and
 * there is no registry here for a second entry to be added to.
 *
 * ## What it does, and why it could not be done in the source
 *
 * The Tonight board sits five logical units left of where the championship rail
 * needs it. Five logical units is **14.7 source pixels** at the shell's
 * 2.9406:1 ratio, and moving a painted board by a fractional pixel then
 * downsampling resamples the frame's one-pixel bevel into mush. The correction
 * has to happen after quantization, on the 320 x 569 grid, where a unit is a
 * unit. `art/incoming/zone_parlor_shell.png` is never touched — the approved
 * painting stays approved, and this records what was done to its output.
 *
 * ## The correction is already applied and committed
 *
 * You should not normally need to run this. The one case where you do:
 * reprocessing the shell from source rewrites the output and reverts the board.
 * `art:process` prints a notice when that happens, and
 * `scripts/shift-tonight-board.test.ts` fails, naming this file.
 *
 * ## Why it cannot double-apply
 *
 * It measures before it acts. A blind "copy the block right by five" run twice
 * slides the board ten units into the wall, with no exception and no failed
 * check — just a room that is quietly wrong. So the board's position is a
 * question asked of the file: at 180 it shifts, at 185 it is already done, and
 * anything else is an error rather than a second shift.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

export const SHELL_PATH = 'public/assets/zone/zone_parlor_shell.png';

/** `#RRGGBB`, uppercase, for the wall comparisons below. */
function hexAt(pixels: Buffer, width: number, x: number, y: number): string {
  const i = (y * width + x) * 4;
  return `#${[pixels[i], pixels[i + 1], pixels[i + 2]]
    .map((v) => (v ?? 0).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();
}

/**
 * The lit wall to the board's right — **a set, because the wall has depth now.**
 *
 * It used to be the single value `#F2A94B`, and that was true of a wall painted
 * in one colour by a 32-entry palette with nothing else in range. With the
 * `zone` family's own 64 the same wall renders in three tones across the height
 * of the board, which is what the source painting has, so a scan for one exact
 * colour stops on the first row and reports the board at x 195.
 *
 * Measured on the shipped shell across rows 85–170: columns x 181–195 are these
 * three to within one pixel, and x 180 — the board's amber lip — contains none
 * of them. That is what keeps this a boundary test rather than a guess, and it
 * is why the lip's own tones are deliberately **not** in the set.
 */
const LIT_WALL = new Set(['#F2A94B', '#ECA546', '#E89B3B']);

/** The board as the shell is painted, and as it must end up. Inclusive. */
const BOARD = { left: 49, right: 180, top: 79, bottom: 179 } as const;

/** 132. A property of the painting; the shift moves the board, never resizes it. */
const BOARD_WIDTH = BOARD.right - BOARD.left + 1;

/**
 * The frame's colour sequence reading inward from its last column, at a row
 * well inside the board. Amber lip, ochre, ember bevel, brick face, ember, tan.
 *
 * This is the integrity check. The right edge below says *where* the board is;
 * this says the thing found there is actually the board.
 *
 * ## Re-measured twice, as the `zone` palette grew
 *
 * These are colours of the shell, so they move whenever it is requantized. The
 * sequence has now been measured three times and the history is the argument for
 * the family palette rather than a nuisance:
 *
 * | palette | sequence |
 * |---|---|
 * | shared 32 | `#C97A22 #C97A22 #4A2E1C #8C1F22 #8C1F22 #5E3A25 #A9713F` |
 * | shared + 4 | `#C97A22 #B46110 #661505 #A02F02 #A02F02 #661505 #A9713F` |
 * | shared + 64 | the constant below |
 *
 * The first has **`#5E3A25` — `skin-4`, on a wooden board frame**, and two pairs
 * of repeated colours where the painting has a graded bevel: with nothing in
 * range, a frame's shadow landed on a *skin* colour and its steps collapsed into
 * each other. The second fixed the skin tone and still repeated. The third has
 * seven distinct values, which is what the source painting actually has.
 *
 * Re-measured rather than relaxed, every time. A profile that tolerated any
 * colour would stop being an integrity check the moment it was convenient.
 */
export const FRAME_PROFILE = [
  '#E49232',
  '#B96414',
  '#612902',
  '#873801',
  '#A44102',
  '#7B3201',
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
  const SOLID = 0.95;

  // x 195 is lit wall in both states. Walk left while it stays lit wall.
  let right = 195;
  while (right > 0) {
    let n = 0;
    for (let y = FIRST_ROW; y <= LAST_ROW; y++) {
      if (LIT_WALL.has(hexAt(pixels, width, right, y))) n++;
    }
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

export type CorrectionAction = 'applied' | 'already-corrected';

/**
 * Move the Tonight board right by `SHIFT`, in place, on a raw RGBA buffer.
 *
 * Returns what it decided to do. Throws if the board is somewhere neither
 * recognised state puts it, because at that point the file is not what this
 * transform was written against and guessing would corrupt it.
 */
export function shiftBoard(pixels: Buffer, width: number): CorrectionAction {
  const right = locateBoardRightEdge(pixels, width);
  const left = right - BOARD_WIDTH + 1;

  if (!looksLikeTheBoard(pixels, width, right)) {
    throw new Error(
      `zone_parlor_shell: found a wall edge at x ${String(right)}, but the frame colours ` +
        `there are not the Tonight board's. Refusing to shift — see scripts/shift-tonight-board.ts.`,
    );
  }

  if (right === BOARD.right + SHIFT) return 'already-corrected';

  if (right !== BOARD.right) {
    throw new Error(
      `zone_parlor_shell: the Tonight board is at x ${String(left)}-${String(right)}, ` +
        `which is neither the painted position (${String(BOARD.left)}-${String(BOARD.right)}) ` +
        `nor the derived one (${String(BOARD.left + SHIFT)}-${String(BOARD.right + SHIFT)}). ` +
        `Refusing to shift — see scripts/shift-tonight-board.ts.`,
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

/** Apply the correction to the committed shell, in place. */
async function main(): Promise<void> {
  const file = path.join(process.cwd(), SHELL_PATH);
  if (!existsSync(file)) throw new Error(`${SHELL_PATH} does not exist — run art:process first.`);

  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = Buffer.from(data);
  const action = shiftBoard(pixels, info.width);

  if (action === 'applied') {
    await sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png({ compressionLevel: 9, palette: true })
      .toFile(file);
    console.log(`${SHELL_PATH}\n  Tonight board shifted +${String(SHIFT)} to x 54-185.`);
  } else {
    console.log(`${SHELL_PATH}\n  already corrected — the board is at x 54-185. Nothing to do.`);
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(`\nFailed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
