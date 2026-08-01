import path from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import {
  BACKSPLASH,
  FACE,
  FIELD,
  LIT_TILE,
  SHADED_TILE,
  SHADOW,
  SURFACES,
  cleanBoardFace,
  cleanSurfaces,
  despeckle,
  hexAt,
  shadeAlcove,
} from './clean-parlor-surfaces';

/**
 * The parlor's two surface corrections, asserted.
 *
 * Same shape and the same reason as `shift-tonight-board.test.ts`: the
 * correction is deliberately not a pipeline stage, so reprocessing the shell
 * silently reverts it, and this file is what stops a reverted asset shipping.
 *
 * Three things to prove. **That the committed asset is corrected** — otherwise
 * the shipped room has the burnt board back and nothing else would say so.
 * **That it will not run twice into something different** — the transform is
 * idempotent by construction and that construction has to hold. And **that the
 * despeckle cannot erode structure**, which is the mistake the first version of
 * it made and the one that would be least visible in review.
 */

const REAPPLY = 'the shell was reprocessed — run: npx tsx scripts/clean-parlor-surfaces.ts';

const ROOT = path.join(__dirname, '..');
const SHELL = path.join(ROOT, 'public/assets/zone/zone_parlor_shell.png');

async function shellPixels(): Promise<{ pixels: Buffer; width: number }> {
  const { data, info } = await sharp(SHELL)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { pixels: Buffer.from(data), width: info.width };
}

describe('the committed shell', () => {
  it('carries a cream board face and nothing else', async () => {
    const { pixels, width } = await shellPixels();

    const found = new Set<string>();
    for (let y = FACE.top; y <= FACE.bottom; y++) {
      for (let x = FACE.left; x <= FACE.right; x++) found.add(hexAt(pixels, width, x, y));
    }

    expect([...found].sort(), REAPPLY).toEqual([SHADOW, FIELD].sort());
  });

  it('puts the field in the middle and the shadow on the top and left', async () => {
    const { pixels, width } = await shellPixels();

    expect(hexAt(pixels, width, 120, 128), 'the middle of the board').toBe(FIELD);
    expect(hexAt(pixels, width, 120, FACE.top), 'the top inner edge').toBe(SHADOW);
    expect(hexAt(pixels, width, FACE.left, 128), 'the left inner edge').toBe(SHADOW);
    expect(hexAt(pixels, width, 120, FACE.bottom), 'the bottom inner edge').toBe(SHADOW);
    expect(hexAt(pixels, width, FACE.right, 128), 'the right inner edge').toBe(SHADOW);
  });

  it('carries a shaded alcove behind Tony, with no lit tile left in it', async () => {
    const { pixels, width } = await shellPixels();

    let lit = 0;
    let shaded = 0;
    for (let y = BACKSPLASH.top; y <= BACKSPLASH.bottom; y++) {
      for (let x = BACKSPLASH.left; x <= BACKSPLASH.right; x++) {
        const hex = hexAt(pixels, width, x, y);
        if (hex === LIT_TILE) lit++;
        if (hex === SHADED_TILE) shaded++;
      }
    }

    expect(lit, REAPPLY).toBe(0);
    // And the tile is still *there* — a shading that flattened the checker into
    // one tone would pass the assertion above and be a different defect.
    expect(shaded, 'the checker was flattened rather than shaded').toBeGreaterThan(400);
  });

  it('keeps Tony standing against it — the rectangle is the one he occupies', () => {
    /*
     * Not a property of the correction, but the reason it exists. `TONY` is at
     * `64, 177` sized 72 x 197 and the counter cuts him at row 292, so the band
     * of him a manager sees runs rows 177-292 across x 64-135. If the two stop
     * overlapping, the shading is being applied to a wall nobody stands in
     * front of.
     *
     * Not containment: the alcove's left frame is drawn at x 64-65, so the
     * backsplash starts two units inside Tony's box on that side and should.
     * What has to hold is that nearly all of him is against it, and that the
     * whole rectangle is inside the band he is visible in.
     */
    const overlap = Math.min(BACKSPLASH.right, 135) - Math.max(BACKSPLASH.left, 64) + 1;
    expect(overlap / 72).toBeGreaterThan(0.9);
    expect(BACKSPLASH.top).toBeGreaterThanOrEqual(177);
    expect(BACKSPLASH.bottom).toBeLessThanOrEqual(292);
  });

  it('has no lone pixels left in either cleaned surface', async () => {
    const { pixels, width } = await shellPixels();
    for (const surface of SURFACES) {
      expect(despeckle(pixels, width, surface), `${surface.name}: ${REAPPLY}`).toBe(0);
    }
  });

  it('will not correct a second time', async () => {
    const { pixels, width } = await shellPixels();
    const before = Buffer.from(pixels);

    expect(cleanSurfaces(pixels, width).face, REAPPLY).toBe('already-clean');
    expect(pixels.equals(before), 'the buffer was mutated by a no-op').toBe(true);
  });
});

/**
 * The apply path, on a canvas built to the real coordinates.
 *
 * The committed shell cannot exercise it — it is already corrected, which is the
 * point — so the board is reconstructed: the frame ring the integrity check
 * looks for, and a face made of the three amber values the quantizer left.
 */
describe('cleanBoardFace', () => {
  const WIDTH = 320;
  const HEIGHT = 569;
  const AMBER = ['#F2A94B', '#F2C94C', '#FFD98A'] as const;

  function put(pixels: Buffer, x: number, y: number, hex: string): void {
    const i = (y * WIDTH + x) * 4;
    pixels[i] = Number.parseInt(hex.slice(1, 3), 16);
    pixels[i + 1] = Number.parseInt(hex.slice(3, 5), 16);
    pixels[i + 2] = Number.parseInt(hex.slice(5, 7), 16);
    pixels[i + 3] = 255;
  }

  function canvas(): Buffer {
    const pixels = Buffer.alloc(WIDTH * HEIGHT * 4);
    for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) put(pixels, x, y, '#F2A94B');

    // The ring the integrity check reads, one unit outside the face.
    for (let y = FACE.top - 1; y <= FACE.bottom + 1; y++) {
      put(pixels, FACE.left - 1, y, '#A9713F');
      put(pixels, FACE.right + 1, y, '#A9713F');
    }
    for (let x = FACE.left - 1; x <= FACE.right + 1; x++) {
      put(pixels, x, FACE.top - 1, '#4A2E1C');
      put(pixels, x, FACE.bottom + 1, '#C99A63');
    }

    // A dithered vignette: three amber values, deterministically interleaved.
    for (let y = FACE.top; y <= FACE.bottom; y++) {
      for (let x = FACE.left; x <= FACE.right; x++) put(pixels, x, y, AMBER[(x + y) % 3]!);
    }
    return pixels;
  }

  it('paints an amber face cream, and says so', () => {
    const pixels = canvas();
    expect(cleanBoardFace(pixels, WIDTH)).toBe('painted');

    const found = new Set<string>();
    for (let y = FACE.top; y <= FACE.bottom; y++) {
      for (let x = FACE.left; x <= FACE.right; x++) found.add(hexAt(pixels, WIDTH, x, y));
    }
    expect([...found].sort()).toEqual([SHADOW, FIELD].sort());
  });

  it('leaves the frame exactly where it was', () => {
    const pixels = canvas();
    const before = Buffer.from(pixels);
    cleanBoardFace(pixels, WIDTH);

    // Everything outside the face is untouched — the frame is hand-painted and
    // this correction has no business in it.
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const inside =
          x >= FACE.left && x <= FACE.right && y >= FACE.top && y <= FACE.bottom;
        if (inside) continue;
        expect(hexAt(pixels, WIDTH, x, y), `${String(x)},${String(y)}`).toBe(
          hexAt(before, WIDTH, x, y),
        );
      }
    }
  });

  it('is idempotent — a second run changes nothing', () => {
    const pixels = canvas();
    cleanBoardFace(pixels, WIDTH);
    const once = Buffer.from(pixels);

    expect(cleanBoardFace(pixels, WIDTH)).toBe('already-clean');
    expect(pixels.equals(once)).toBe(true);
  });

  it('refuses a rectangle whose frame is not the board', () => {
    const pixels = canvas();
    for (let y = FACE.top - 1; y <= FACE.bottom + 1; y++) put(pixels, FACE.left - 1, y, '#8C1F22');

    expect(() => cleanBoardFace(pixels, WIDTH)).toThrow(/frame colour/);
  });

  it('refuses a face holding something it does not recognise', () => {
    const pixels = canvas();
    // One green pixel is enough: the transform has no correct answer for a face
    // somebody has drawn on, and painting over it would destroy the drawing.
    put(pixels, 120, 128, '#5FD98A');

    expect(() => cleanBoardFace(pixels, WIDTH)).toThrow(/neither the painted amber/);
  });
});

/**
 * The alcove, on a canvas built to the real rectangle.
 *
 * Same reason as the board: the committed shell is already shaded, so the apply
 * path needs a surface that is not.
 */
describe('shadeAlcove', () => {
  const WIDTH = 320;
  const HEIGHT = 569;

  function put(pixels: Buffer, x: number, y: number, hex: string): void {
    const i = (y * WIDTH + x) * 4;
    pixels[i] = Number.parseInt(hex.slice(1, 3), 16);
    pixels[i + 1] = Number.parseInt(hex.slice(3, 5), 16);
    pixels[i + 2] = Number.parseInt(hex.slice(5, 7), 16);
    pixels[i + 3] = 255;
  }

  /** A checker of the dark tile and the lit one, plus a grout line. */
  function canvas(): Buffer {
    const pixels = Buffer.alloc(WIDTH * HEIGHT * 4);
    for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) put(pixels, x, y, '#F2A94B');

    for (let y = BACKSPLASH.top; y <= BACKSPLASH.bottom; y++) {
      for (let x = BACKSPLASH.left; x <= BACKSPLASH.right; x++) {
        const tile = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
        put(pixels, x, y, tile ? LIT_TILE : '#4A2E1C');
      }
    }
    for (let x = BACKSPLASH.left; x <= BACKSPLASH.right; x++) {
      put(pixels, x, BACKSPLASH.top + 10, '#1A1214');
    }
    return pixels;
  }

  it('takes the lit tile down one step and leaves the dark one alone', () => {
    const pixels = canvas();
    expect(shadeAlcove(pixels, WIDTH)).toBe('shaded');

    let shaded = 0;
    let dark = 0;
    for (let y = BACKSPLASH.top; y <= BACKSPLASH.bottom; y++) {
      for (let x = BACKSPLASH.left; x <= BACKSPLASH.right; x++) {
        const hex = hexAt(pixels, WIDTH, x, y);
        expect(hex, 'the lit tile survived').not.toBe(LIT_TILE);
        if (hex === SHADED_TILE) shaded++;
        if (hex === '#4A2E1C') dark++;
      }
    }
    expect(shaded).toBeGreaterThan(0);
    expect(dark).toBeGreaterThan(0);
  });

  it('leaves the grout line drawn', () => {
    const pixels = canvas();
    shadeAlcove(pixels, WIDTH);
    for (let x = BACKSPLASH.left; x <= BACKSPLASH.right; x++) {
      expect(hexAt(pixels, WIDTH, x, BACKSPLASH.top + 10)).toBe('#1A1214');
    }
  });

  it('stays inside the alcove', () => {
    const pixels = canvas();
    // The wall outside is `amber-mid`, and one unit of lit tile just past the
    // rectangle's edge must still be there afterwards.
    put(pixels, BACKSPLASH.right + 1, 200, LIT_TILE);
    shadeAlcove(pixels, WIDTH);
    expect(hexAt(pixels, WIDTH, BACKSPLASH.right + 1, 200)).toBe(LIT_TILE);
  });

  it('is idempotent — a second run changes nothing', () => {
    const pixels = canvas();
    shadeAlcove(pixels, WIDTH);
    const once = Buffer.from(pixels);

    expect(shadeAlcove(pixels, WIDTH)).toBe('already-shaded');
    expect(pixels.equals(once)).toBe(true);
  });

  it('refuses an alcove holding a colour it does not know', () => {
    const pixels = canvas();
    put(pixels, 100, 200, '#5FD98A');

    expect(() => shadeAlcove(pixels, WIDTH)).toThrow(/not one of its tones/);
  });
});

/**
 * The despeckle, and the thing it must never do.
 *
 * The first rule allowed one same-coloured neighbour so that two-pixel scratches
 * would go too. It also took the **end of every one-unit line**, and run to a
 * fixed point it ate the wall's lines from both ends, one unit per pass, without
 * ever converging. This is that regression, made cheap: a line and a speck on
 * the same canvas, and only one of them is allowed to disappear.
 */
describe('despeckle', () => {
  const WIDTH = 64;
  const HEIGHT = 64;
  const GROUND = '#4A2E1C';
  const MARK = '#1A1214';
  const ALL = { name: 'test', x0: 1, y0: 1, x1: WIDTH - 2, y1: HEIGHT - 2 } as const;

  function put(pixels: Buffer, x: number, y: number, hex: string): void {
    const i = (y * WIDTH + x) * 4;
    pixels[i] = Number.parseInt(hex.slice(1, 3), 16);
    pixels[i + 1] = Number.parseInt(hex.slice(3, 5), 16);
    pixels[i + 2] = Number.parseInt(hex.slice(5, 7), 16);
    pixels[i + 3] = 255;
  }

  function ground(): Buffer {
    const pixels = Buffer.alloc(WIDTH * HEIGHT * 4);
    for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) put(pixels, x, y, GROUND);
    return pixels;
  }

  it('removes a lone pixel', () => {
    const pixels = ground();
    put(pixels, 20, 20, MARK);

    expect(despeckle(pixels, WIDTH, ALL)).toBe(1);
    expect(hexAt(pixels, WIDTH, 20, 20)).toBe(GROUND);
  });

  it('leaves a one-unit line standing, end to end', () => {
    const pixels = ground();
    for (let x = 10; x <= 40; x++) put(pixels, x, 30, MARK);

    expect(despeckle(pixels, WIDTH, ALL), 'nothing on this canvas is lonely').toBe(0);
    for (let x = 10; x <= 40; x++) {
      expect(hexAt(pixels, WIDTH, x, 30), `x ${String(x)}`).toBe(MARK);
    }
  });

  it('leaves a two-pixel pair standing, and takes the speck beside it', () => {
    const pixels = ground();
    put(pixels, 12, 12, MARK);
    put(pixels, 13, 12, MARK);
    put(pixels, 40, 40, MARK);

    expect(despeckle(pixels, WIDTH, ALL)).toBe(1);
    expect(hexAt(pixels, WIDTH, 12, 12)).toBe(MARK);
    expect(hexAt(pixels, WIDTH, 13, 12)).toBe(MARK);
    expect(hexAt(pixels, WIDTH, 40, 40)).toBe(GROUND);
  });

  it('stays inside its rectangle', () => {
    const pixels = ground();
    put(pixels, 20, 20, MARK);

    expect(despeckle(pixels, WIDTH, { name: 'elsewhere', x0: 30, y0: 30, x1: 50, y1: 50 })).toBe(0);
    expect(hexAt(pixels, WIDTH, 20, 20)).toBe(MARK);
  });

  it('is idempotent — it runs to a fixed point', () => {
    const pixels = ground();
    // A scattering that takes more than one pass: removing one speck can leave
    // its neighbour lonely.
    for (const [x, y] of [
      [20, 20],
      [22, 20],
      [21, 22],
      [35, 35],
      [36, 36],
    ] as const) {
      put(pixels, x, y, MARK);
    }

    expect(despeckle(pixels, WIDTH, ALL)).toBeGreaterThan(0);
    expect(despeckle(pixels, WIDTH, ALL), 'a second run found something to do').toBe(0);
  });
});
