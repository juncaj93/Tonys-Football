import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';

import { TRAY_REVEAL } from '@/lib/parlor/objects';

import { loadPalette } from './process-art';
import { inspect } from './validate-collectible';

/**
 * The art validator, tested against art that is deliberately wrong.
 *
 * **A validator nobody has watched fail is a validator nobody knows works.** This
 * one is going to be the thing standing between a commissioner-generated batch
 * and a shelf full of sprites that do not fit, and it will be run by somebody who
 * did not write it, on files nobody has seen yet. Its rules are worth more than
 * its output.
 *
 * Every image below is built pixel by pixel rather than checked in, so what each
 * test asserts is visible in the test itself.
 */

const [, , W, H] = TRAY_REVEAL;
const SLUG = 'collectible_reddiwip';

const dir = mkdtempSync(path.join(tmpdir(), 'collectible-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** The first palette colour, so a "correct" fixture is palette-closed by construction. */
const INK = loadPalette()[0]!;

interface Shape {
  readonly width?: number;
  readonly height?: number;
  /** Occupied box, inclusive. Defaults to a plausible bottom-anchored object. */
  readonly left?: number;
  readonly right?: number;
  readonly top?: number;
  readonly bottom?: number;
  readonly colour?: readonly [number, number, number];
  readonly alpha?: number;
}

/** A solid rectangle in an otherwise transparent canvas. */
async function sprite(name: string, shape: Shape = {}): Promise<string> {
  const width = shape.width ?? W;
  const height = shape.height ?? H;
  const left = shape.left ?? 14;
  const right = shape.right ?? 31;
  const top = shape.top ?? 10;
  const bottom = shape.bottom ?? height - 1;
  const [r, g, b] = shape.colour ?? INK;
  const alpha = shape.alpha ?? 255;

  const buffer = Buffer.alloc(width * height * 4, 0);
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const i = (y * width + x) * 4;
      buffer[i] = r;
      buffer[i + 1] = g;
      buffer[i + 2] = b;
      buffer[i + 3] = alpha;
    }
  }

  const file = path.join(dir, `${name}.png`);
  await sharp(buffer, { raw: { width, height, channels: 4 } }).png().toFile(file);
  return file;
}

const rules = (findings: readonly { rule: string }[]) => findings.map((f) => f.rule);

describe('a collectible that fits its slot', () => {
  it('passes clean', async () => {
    expect(await inspect(SLUG, await sprite('good'))).toEqual([]);
  });
});

describe('a collectible that does not', () => {
  it('catches the wrong canvas — the defect that survived a whole milestone', async () => {
    // 32 × 32 is what `ART_SPEC` and the prompt template both said until
    // 2026-07-31. A batch drawn to it would be resampled at 1.4375×.
    const file = await sprite('small', { width: 32, height: 32, right: 24, bottom: 31 });
    expect(rules(await inspect(SLUG, file))).toContain('canvas');
  });

  it('catches a floating object, which is what bottom-centre anchoring is for', async () => {
    const file = await sprite('floating', { bottom: H - 6 });
    expect(rules(await inspect(SLUG, file))).toContain('anchor');
  });

  it('catches an object pushed off the horizontal centre', async () => {
    const file = await sprite('offcentre', { left: 30, right: 45 });
    expect(rules(await inspect(SLUG, file))).toContain('anchor');
  });

  it('catches a soft edge, because the glow is derived from the alpha channel', async () => {
    const file = await sprite('fringe', { alpha: 128 });
    expect(rules(await inspect(SLUG, file))).toContain('alpha');
  });

  it('catches colour outside the palette', async () => {
    const file = await sprite('offpalette', { colour: [17, 251, 133] });
    expect(rules(await inspect(SLUG, file))).toContain('palette');
  });

  it('catches pure black, which the palette prohibits outright', async () => {
    const file = await sprite('black', { colour: [0, 0, 0] });
    expect(rules(await inspect(SLUG, file))).toContain('palette');
  });

  it('catches an object with no room for the landing overshoot', async () => {
    // The reveal scales to 1.06 as it settles. A sprite already touching every
    // edge is briefly drawn larger than its slot.
    const file = await sprite('edge-to-edge', { left: 0, right: W - 1, top: 0 });
    expect(rules(await inspect(SLUG, file))).toContain('overshoot');
  });

  it('catches an empty canvas', async () => {
    const buffer = Buffer.alloc(W * H * 4, 0);
    const file = path.join(dir, 'empty.png');
    await sharp(buffer, { raw: { width: W, height: H, channels: 4 } }).png().toFile(file);
    expect(rules(await inspect(SLUG, file))).toContain('empty');
  });

  it('catches a shape that dissolves when the Showcase halves it', async () => {
    // A one-pixel comb: every other column, so nearest-neighbour halving throws
    // away either all of it or half of it. This is the failure mode the detail
    // budget exists to prevent, and the only one that is invisible at full size.
    const buffer = Buffer.alloc(W * H * 4, 0);
    for (let y = 8; y < H; y++) {
      for (let x = 14; x < 32; x += 2) {
        const i = (y * W + x) * 4;
        buffer[i] = INK[0];
        buffer[i + 1] = INK[1];
        buffer[i + 2] = INK[2];
        buffer[i + 3] = 255;
      }
    }
    const file = path.join(dir, 'comb.png');
    await sharp(buffer, { raw: { width: W, height: H, channels: 4 } }).png().toFile(file);

    expect(rules(await inspect(SLUG, file))).toContain('legibility');
  });

  it('names a slug the registry does not know', async () => {
    const findings = await inspect('collectible_not_a_thing', await sprite('unknown'));
    expect(rules(findings)).toEqual(['registry']);
  });
});
