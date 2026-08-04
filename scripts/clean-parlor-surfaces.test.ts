import path from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import {
  BACKSPLASH,
  CEILING,
  CEILING_FIELD,
  CEILING_SCORCH,
  CEILING_TONES,
  FACE,
  FIELD,
  LIT_TILE,
  SHADED_TILE,
  SHADOW,
  SURFACES,
  cleanBoardFace,
  cleanSurfaces,
  clearCeilingScorch,
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

  it('leaves the hole alone', () => {
    /*
     * The regression that `shift-tonight-board.test.ts` caught: the back wall's
     * rectangle contains the Tonight board, the board's frame has a one-unit
     * shadow line with a lone pixel in it, and the filter removed it. A test
     * written to catch a reprocess caught a second transform editing the same
     * hand-painted frame.
     */
    const pixels = ground();
    put(pixels, 20, 20, MARK); // inside the hole
    put(pixels, 45, 45, MARK); // outside it

    const surface = {
      name: 'walled',
      x0: 1,
      y0: 1,
      x1: WIDTH - 2,
      y1: HEIGHT - 2,
      except: { left: 15, right: 25, top: 15, bottom: 25 },
    };

    expect(despeckle(pixels, WIDTH, surface)).toBe(1);
    expect(hexAt(pixels, WIDTH, 20, 20), 'the hole was despeckled').toBe(MARK);
    expect(hexAt(pixels, WIDTH, 45, 45)).toBe(GROUND);
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

/* ============================================================== the ceiling == */

/**
 * The ceiling's scorch, and the grid it shares a colour with.
 *
 * This surface had no mechanism for two milestones, on a recorded conclusion that
 * it needed *"a targeted regeneration"*. It does not. The blotches and the tile
 * grid are painted in the same two browns, so no colour rule can separate them —
 * but the grid is one unit wide and the blotches are thick, and a morphological
 * opening separates exactly that.
 *
 * The assertions below are structural rather than photographic on purpose. A
 * screenshot cannot show that the *grid survived*, because a grid with a third of
 * its pixels missing still looks like a grid at 360px; a pixel count can.
 */

/** Every colour the ceiling is allowed to be made of. Anything else is structure. */
function structuralPixels(pixels: Buffer, width: number): Map<string, string> {
  const found = new Map<string, string>();
  for (let y = CEILING.top; y <= CEILING.bottom; y += 1) {
    for (let x = CEILING.left; x <= CEILING.right; x += 1) {
      const hex = hexAt(pixels, width, x, y);
      if (!CEILING_TONES.has(hex)) found.set(`${String(x)},${String(y)}`, hex);
    }
  }
  return found;
}

function scorchCount(pixels: Buffer, width: number): number {
  let n = 0;
  for (let y = CEILING.top; y <= CEILING.bottom; y += 1) {
    for (let x = CEILING.left; x <= CEILING.right; x += 1) {
      if (CEILING_SCORCH.has(hexAt(pixels, width, x, y))) n += 1;
    }
  }
  return n;
}

describe('the committed shell — the ceiling', () => {
  it('has had its scorch cleared', async () => {
    const { pixels, width } = await shellPixels();
    expect(clearCeilingScorch(pixels, width), REAPPLY).toBe('already-clean');
  });

  it('still carries the tile grid', async () => {
    const { pixels, width } = await shellPixels();

    /*
     * The grid is what is *left* in the scorch colours after the opening. The
     * range is wide enough that a legitimate change to the operator does not
     * break it and narrow enough to be a real claim: erasing the grid gives ~0,
     * and skipping the clean entirely gives ~3,973.
     */
    const grid = scorchCount(pixels, width);
    expect(grid, `${REAPPLY} — or the grid was eroded`).toBeGreaterThan(1500);
    expect(grid, 'more brown than the grid alone — is the scorch back?').toBeLessThan(2400);
  });

  it('keeps the beam, the sign and the fittings byte-identical', async () => {
    /*
     * The strongest form of the safeguard, and it needs no coordinates: every
     * pixel inside the ceiling rectangle that is *not* a ceiling tone is
     * structure — the doorway beam, the neon sign, the lights, the pendant — and
     * running the clean again must not move any of them.
     */
    const { pixels, width } = await shellPixels();
    const before = structuralPixels(pixels, width);
    expect(before.size, 'no structure found in the ceiling rect at all').toBeGreaterThan(500);

    clearCeilingScorch(pixels, width);
    expect(structuralPixels(pixels, width)).toEqual(before);
  });

  it('introduces no colour the ceiling did not already have', async () => {
    const { pixels, width } = await shellPixels();
    const before = new Set<string>();
    for (let y = CEILING.top; y <= CEILING.bottom; y += 1) {
      for (let x = CEILING.left; x <= CEILING.right; x += 1) before.add(hexAt(pixels, width, x, y));
    }
    clearCeilingScorch(pixels, width);
    for (let y = CEILING.top; y <= CEILING.bottom; y += 1) {
      for (let x = CEILING.left; x <= CEILING.right; x += 1) {
        expect(before.has(hexAt(pixels, width, x, y))).toBe(true);
      }
    }
  });
});

describe('clearCeilingScorch', () => {
  /*
   * The canvas is the ceiling's real size, like `cleanBoardFace`'s above and for
   * the same reason: the integrity check reads four fixed probe points, and a
   * smaller canvas puts them out of bounds — which the first version of this
   * block did, and the check caught.
   */
  const W = CEILING.right + 1;
  const H = CEILING.bottom + 1;

  /** A canvas of ceiling field, with the probe points the integrity check reads. */
  function canvas(): Buffer {
    const px = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i += 1) {
      px[i * 4] = 0xc9;
      px[i * 4 + 1] = 0x7a;
      px[i * 4 + 2] = 0x22;
      px[i * 4 + 3] = 255;
    }
    return px;
  }

  function set(px: Buffer, x: number, y: number, hex: string): void {
    const i = (y * W + x) * 4;
    px[i] = Number.parseInt(hex.slice(1, 3), 16);
    px[i + 1] = Number.parseInt(hex.slice(3, 5), 16);
    px[i + 2] = Number.parseInt(hex.slice(5, 7), 16);
    px[i + 3] = 255;
  }

  it('removes a thick blob', () => {
    const px = canvas();
    for (let y = 5; y <= 9; y += 1) for (let x = 5; x <= 9; x += 1) set(px, x, y, '#7A4A2A');

    expect(clearCeilingScorch(px, W)).toBe('cleared');
    expect(scorchCount(px, W)).toBe(0);
  });

  it('leaves a one-unit line alone, in every direction', () => {
    const px = canvas();
    for (let x = 2; x <= 30; x += 1) set(px, x, 4, '#7A4A2A'); // horizontal
    for (let y = 6; y <= 18; y += 1) set(px, 20, y, '#7A4A2A'); // vertical
    for (let i = 0; i <= 10; i += 1) set(px, 5 + i, 8 + i, '#7A4A2A'); // diagonal
    for (let i = 0; i <= 8; i += 2) set(px, 30, 2 + i, '#7A4A2A'); // dashed

    const before = Buffer.from(px);
    expect(clearCeilingScorch(px, W)).toBe('already-clean');
    expect(px.equals(before)).toBe(true);
  });

  it('never writes structure, however thick the brown beside it is', () => {
    /*
     * The safeguard the beam depends on — and it is worth being precise about
     * what it does and does not promise.
     *
     * It does **not** promise that brown touching the beam survives. That brown
     * is ceiling scorch lying against a beam and clearing it is the point. What
     * it promises is that no core ever forms *inside* structure, so the beam
     * itself is never written — which is the failure that would be invisible in
     * review and permanent in the asset.
     */
    const px = canvas();
    for (let y = 4; y <= 8; y += 1) for (let x = 4; x <= 7; x += 1) set(px, x, y, '#7A4A2A');
    for (let y = 3; y <= 9; y += 1) set(px, 8, y, '#1A1214'); // the beam's edge

    clearCeilingScorch(px, W);
    for (let y = 3; y <= 9; y += 1) expect(hexAt(px, W, 8, y), 'the beam was written').toBe('#1A1214');
  });

  it('leaves a brown detail enclosed by structure entirely alone', () => {
    /*
     * The "threshold cannot silently expand into structural regions" case, as the
     * asset actually presents it: a **two-unit** brown highlight running along a
     * beam, structure on both sides. Every pixel of it can see the near-black, so
     * no pixel can be a core and the whole run survives at any length.
     *
     * The bound is worth stating rather than implying, because it is the
     * mechanism's one real limit: a brown region three or more units thick in
     * *both* directions has an interior that cannot see the structure around it,
     * and this will treat that interior as a blotch. On this ceiling that is the
     * intended reading — nothing structural here is a solid brown slab, and a
     * solid brown slab is what the defect looks like. A surface where it were not
     * true would need a different mechanism, exactly as this one did.
     */
    const px = canvas();
    for (let y = 4; y <= 14; y += 1) { set(px, 5, y, '#7A4A2A'); set(px, 6, y, '#7A4A2A'); }
    for (let y = 3; y <= 15; y += 1) { set(px, 4, y, '#1A1214'); set(px, 7, y, '#1A1214'); }
    for (const x of [4, 5, 6, 7]) { set(px, x, 3, '#1A1214'); set(px, x, 15, '#1A1214'); }

    const before = Buffer.from(px);
    expect(clearCeilingScorch(px, W)).toBe('already-clean');
    expect(px.equals(before)).toBe(true);
  });

  it('clears scorch that merely sits near structure, without touching it', () => {
    // Two units of clearance: the blob's own neighbourhood is pure ceiling, so it
    // is cleared, and the structure beside it is never written.
    const px = canvas();
    for (let y = 4; y <= 9; y += 1) for (let x = 4; x <= 9; x += 1) set(px, x, y, '#7A4A2A');
    for (let y = 3; y <= 10; y += 1) set(px, 12, y, '#8C1F22'); // the sign

    expect(clearCeilingScorch(px, W)).toBe('cleared');
    for (let y = 3; y <= 10; y += 1) expect(hexAt(px, W, 12, y)).toBe('#8C1F22');
    // The blob's interior went; only its structure-facing edge could remain.
    expect(scorchCount(px, W)).toBeLessThan(8);
  });

  it('is idempotent', () => {
    const px = canvas();
    for (let y = 5; y <= 10; y += 1) for (let x = 5; x <= 12; x += 1) set(px, x, y, '#9C6640');

    expect(clearCeilingScorch(px, W)).toBe('cleared');
    const settled = Buffer.from(px);
    expect(clearCeilingScorch(px, W)).toBe('already-clean');
    expect(px.equals(settled)).toBe(true);
  });

  it('never writes anything but the field colour', () => {
    const px = canvas();
    for (let y = 5; y <= 10; y += 1) for (let x = 5; x <= 12; x += 1) set(px, x, y, '#7A4A2A');
    const before = Buffer.from(px);

    clearCeilingScorch(px, W);
    for (let i = 0; i < px.length; i += 4) {
      if (px[i] === before[i] && px[i + 1] === before[i + 1] && px[i + 2] === before[i + 2]) continue;
      expect(`#${[px[i], px[i + 1], px[i + 2]].map((v) => (v ?? 0).toString(16).padStart(2, '0')).join('')}`.toUpperCase()).toBe(
        CEILING_FIELD,
      );
    }
  });

  it('refuses a surface that is not this ceiling', () => {
    const px = canvas();
    set(px, 55, 2, '#1A1214');
    expect(() => clearCeilingScorch(px, W)).toThrow(/not the shell/);
  });
});
