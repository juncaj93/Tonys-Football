import path from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { locateBoardRightEdge, shiftBoard } from './derive-art';

/**
 * The derived stage, asserted.
 *
 * `art:derive` is the one place in the art pipeline where an output is not a
 * pure function of its source file, so it carries a risk nothing else does: run
 * it twice and the board slides ten units instead of five, with no error, no
 * visible failure in the console, and a room that is simply wrong. The guard
 * against that is a measurement, and a measurement deserves a test.
 *
 * There are two things to prove and they are different. **That the committed
 * asset is in the derived state** — otherwise the shipped room is misaligned.
 * And **that the transform refuses to run twice** — otherwise the next person
 * to reprocess the batch breaks it.
 */

const ROOT = path.join(__dirname, '..');
const SHELL = path.join(ROOT, 'public/assets/zone/zone_parlor_shell.png');

/** Inclusive, measured on the registered shell. */
const ROD = { left: 54, right: 184 } as const;
const BOARD_WIDTH = 132;
const DERIVED_RIGHT = 185;
/** From `art/B2_CHAMPION_BANNER.md`. Six banners, width 18, gap 4. */
const SLOTS = [56, 78, 100, 122, 144, 166] as const;
const BANNER_WIDTH = 18;

async function shellPixels(): Promise<{ pixels: Buffer; width: number }> {
  const { data, info } = await sharp(SHELL).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { pixels: Buffer.from(data), width: info.width };
}

describe('the committed shell', () => {
  it('is in the derived state, with the board at x 54-185', async () => {
    const { pixels, width } = await shellPixels();
    const right = locateBoardRightEdge(pixels, width);

    expect(right, 'board right edge').toBe(DERIVED_RIGHT);
    expect(right - BOARD_WIDTH + 1, 'board left edge').toBe(54);
  });

  it('co-centres the board with the banner row, exactly', async () => {
    const { pixels, width } = await shellPixels();
    const right = locateBoardRightEdge(pixels, width);
    const boardCentre = (right - BOARD_WIDTH + 1 + right) / 2;
    const rowCentre = (SLOTS[0] + SLOTS[5] + BANNER_WIDTH - 1) / 2;

    // The entire reason the shift exists. If this drifts, the shift is wrong.
    expect(boardCentre).toBe(rowCentre);
    expect(boardCentre).toBe(119.5);
  });

  it('puts the board and the rail on the same left edge', async () => {
    const { pixels, width } = await shellPixels();
    expect(locateBoardRightEdge(pixels, width) - BOARD_WIDTH + 1).toBe(ROD.left);
  });

  it('keeps every banner body on the rod', () => {
    // Not a property of the shift, but it is the constraint the shift was
    // solved against, and a future edit to either number should fail here.
    expect(SLOTS[0]).toBeGreaterThanOrEqual(ROD.left);
    expect(SLOTS[5] + BANNER_WIDTH - 1).toBeLessThanOrEqual(ROD.right);
  });

  it('will not shift a second time', async () => {
    const { pixels, width } = await shellPixels();
    const before = Buffer.from(pixels);

    expect(shiftBoard(pixels, width)).toBe('already-derived');
    expect(pixels.equals(before), 'the buffer was mutated by a no-op').toBe(true);
  });
});

/**
 * The apply path, on a canvas built to the real coordinates.
 *
 * The committed shell cannot exercise this — it is already derived, which is
 * the point. So the layout is reconstructed: lit wall everywhere, the dark
 * panel where the panel is, and a frame whose colour profile is the one the
 * integrity check looks for.
 */
describe('shiftBoard', () => {
  const WIDTH = 320;
  const HEIGHT = 569;
  const WALL: [number, number, number] = [0xf2, 0xa9, 0x4b];
  const PANEL: [number, number, number] = [0x4a, 0x2e, 0x1c];
  const FIELD: [number, number, number] = [0xf2, 0xc9, 0x4c];
  const PROFILE: [number, number, number][] = [
    [0xc9, 0x7a, 0x22], [0xc9, 0x7a, 0x22], [0x4a, 0x2e, 0x1c], [0x8c, 0x1f, 0x22],
    [0x8c, 0x1f, 0x22], [0x5e, 0x3a, 0x25], [0xa9, 0x71, 0x3f],
  ];

  function canvas(): Buffer {
    const pixels = Buffer.alloc(WIDTH * HEIGHT * 4);
    const put = (x: number, y: number, [r, g, b]: readonly number[]): void => {
      const i = (y * WIDTH + x) * 4;
      pixels[i] = r ?? 0;
      pixels[i + 1] = g ?? 0;
      pixels[i + 2] = b ?? 0;
      pixels[i + 3] = 255;
    };

    for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) put(x, y, WALL);
    for (let y = 60; y <= 182; y++) for (let x = 44; x <= 48; x++) put(x, y, PANEL);

    for (let y = 79; y <= 179; y++) {
      for (let x = 49; x <= 180; x++) {
        const fromRight = 180 - x;
        const fromLeft = x - 49;
        const edge = Math.min(fromRight, fromLeft);
        put(x, y, edge < PROFILE.length ? PROFILE[edge]! : FIELD);
      }
    }
    return pixels;
  }

  const colour = (pixels: Buffer, x: number, y: number): string => {
    const i = (y * WIDTH + x) * 4;
    return [pixels[i], pixels[i + 1], pixels[i + 2]].join(',');
  };

  it('finds an unshifted board and moves it five units right', () => {
    const pixels = canvas();
    expect(locateBoardRightEdge(pixels, WIDTH)).toBe(180);

    expect(shiftBoard(pixels, WIDTH)).toBe('applied');

    expect(locateBoardRightEdge(pixels, WIDTH)).toBe(DERIVED_RIGHT);
    expect(colour(pixels, 185, 128), 'the amber lip landed on the new right edge')
      .toBe(PROFILE[0]!.join(','));
    expect(colour(pixels, 54, 128), 'and on the new left edge').toBe(PROFILE[0]!.join(','));
  });

  it('fills the vacated strip with wall rather than panel', () => {
    const pixels = canvas();
    shiftBoard(pixels, WIDTH);

    // A five-unit dark notch in the panel's edge is the one visible way to get
    // this wrong, so the strip is asserted against the wall row above the board.
    for (let y = 79; y <= 179; y++) {
      for (let x = 49; x <= 53; x++) {
        expect(colour(pixels, x, y), `x ${String(x)} y ${String(y)}`).toBe(colour(pixels, x, 78));
      }
    }
  });

  it('is idempotent — a second run changes nothing', () => {
    const pixels = canvas();
    shiftBoard(pixels, WIDTH);
    const once = Buffer.from(pixels);

    expect(shiftBoard(pixels, WIDTH)).toBe('already-derived');
    expect(pixels.equals(once)).toBe(true);
  });

  it('refuses an asset whose board is somewhere it does not recognise', () => {
    const pixels = canvas();
    shiftBoard(pixels, WIDTH);
    // Nudge the whole image three more units, the way a botched manual edit
    // would: the frame's own colours still check out, but it is at x 57-188 —
    // a position the transform has no correct answer for.
    const moved = Buffer.alloc(WIDTH * HEIGHT * 4);
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const src = ((y * WIDTH + Math.max(0, x - 3)) * 4);
        const dst = (y * WIDTH + x) * 4;
        pixels.copy(moved, dst, src, src + 4);
      }
    }

    expect(() => shiftBoard(moved, WIDTH)).toThrow(/neither the painted position/);
  });

  it('refuses a wall edge that is not a board', () => {
    const pixels = canvas();
    // Wipe the frame's signature but leave the wall boundary where it was.
    for (let y = 79; y <= 179; y++) {
      for (let x = 174; x <= 180; x++) {
        const i = (y * WIDTH + x) * 4;
        pixels[i] = FIELD[0];
        pixels[i + 1] = FIELD[1];
        pixels[i + 2] = FIELD[2];
      }
    }

    expect(() => shiftBoard(pixels, WIDTH)).toThrow(/not the Tonight board/);
  });
});
