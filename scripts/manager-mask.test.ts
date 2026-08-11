import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';

import { fixtureBuildMask } from '../lib/character/mask.fixture';
import { MASK_CANVAS, MASK_KEYS, TRANSPARENT_KEY, paintedKeys } from '../lib/character/mask';

import { nearestKey, snap } from './manager-mask';

/**
 * The deterministic middle step: a painted image in, role indices out.
 *
 * The claim this file has to earn is **losslessness for art that obeys the
 * brief**. If a correctly painted `672 × 1008` file does not come back as exactly
 * the keys it was painted with, then the conversion is a lossy interpretation and
 * every mask in the product is an approximation of what an artist drew — which
 * would be the "pretending a generative image is mechanically exact" failure the
 * workflow was designed to avoid, reintroduced one layer lower.
 */

const scratch = mkdtempSync(path.join(tmpdir(), 'manager-mask-'));
const written: string[] = [];

/** Paint a key grid at `factor`x, the way a delivered file would arrive. */
async function paint(keys: readonly number[], factor: number, name: string): Promise<string> {
  return paintAt(keys, MASK_CANVAS.width * factor, MASK_CANVAS.height * factor, name);
}

/**
 * Paint a key grid at an arbitrary size, nearest-neighbour.
 *
 * Deliberately **not** a whole multiple in the caller that matters: a generator
 * emits 1024 x 1536 and the cells it produces are 9.14 source pixels wide, so
 * some are nine across and some are ten. That irregularity is the thing the
 * conversion has to survive.
 */
async function paintAt(
  keys: readonly number[],
  width: number,
  height: number,
  name: string,
): Promise<string> {
  const rgba = Buffer.alloc(width * height * 4, 0);
  const colour = new Map<number, readonly [number, number, number]>();
  for (const key of paintedKeys()) {
    colour.set(key.index, [
      parseInt(key.hex.slice(1, 3), 16),
      parseInt(key.hex.slice(3, 5), 16),
      parseInt(key.hex.slice(5, 7), 16),
    ]);
  }

  for (let sy = 0; sy < height; sy++) {
    const y = Math.min(MASK_CANVAS.height - 1, Math.floor((sy * MASK_CANVAS.height) / height));
    for (let sx = 0; sx < width; sx++) {
      const x = Math.min(MASK_CANVAS.width - 1, Math.floor((sx * MASK_CANVAS.width) / width));
      const key = keys[y * MASK_CANVAS.width + x]!;
      if (key === TRANSPARENT_KEY) continue;
      const [r, g, b] = colour.get(key)!;
      const at = (sy * width + sx) * 4;
      rgba[at] = r;
      rgba[at + 1] = g;
      rgba[at + 2] = b;
      rgba[at + 3] = 255;
    }
  }

  const file = path.join(scratch, name);
  await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toFile(file);
  written.push(file);
  return file;
}

afterAll(() => {
  // Nothing to clean up beyond the temp directory the OS will reclaim; the list
  // exists so a failure message can name the file that was under test.
  void written;
});

describe('snapping a delivered file', () => {
  it('is lossless on art painted in the fourteen keys', async () => {
    const keys = fixtureBuildMask();
    const result = await snap(await paint(keys, 6, 'clean.png'));

    expect(result.factor).toBe(6);
    expect([...result.keys]).toEqual([...keys]);
    expect(result.drift).toEqual({ mean: 0, p99: 0, max: 0 });
    expect(result.softAlpha).toBe(0);
  });

  it('survives a stray anti-aliased pixel in a block', async () => {
    /*
     * Block **mode**, not nearest-neighbour, and this is the difference. Nearest
     * samples one pixel per block, so a single soft pixel that happens to land on
     * the sample point takes the whole block with it. A hand-painted file always
     * has some; refusing them all would refuse every real delivery.
     */
    const keys = fixtureBuildMask();
    const file = await paint(keys, 6, 'speckled.png');
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    // One corrupted pixel in every block — a sixth of the whole image.
    for (let y = 0; y < info.height; y += 6) {
      for (let x = 0; x < info.width; x += 6) {
        const at = (y * info.width + x) * 4;
        if (data[at + 3] === 0) continue;
        data[at] = 255;
        data[at + 1] = 0;
        data[at + 2] = 255;
      }
    }
    const speckled = path.join(scratch, 'speckled-out.png');
    await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png()
      .toFile(speckled);

    expect([...(await snap(speckled)).keys]).toEqual([...keys]);
  });

  it('is lossless at a fractional scale a generator actually produces', async () => {
    /*
     * **The rule this replaces was the gate round 1 died on**, before anything
     * about the drawing had been measured. `1024 x 1536` is 9.14x the canvas —
     * not a whole multiple of anything — and the old contract refused it outright.
     *
     * It decodes exactly, because the operator is *mode over snapped indices*
     * rather than an average over colours: no colour between two keys is ever
     * created, so no pixel can snap to a role nobody painted.
     */
    const keys = fixtureBuildMask();
    const file = await paintAt(keys, 1024, 1536, 'native.png');
    const result = await snap(file);

    expect(result.factor).toBeCloseTo(9.14, 1);
    expect([...result.keys]).toEqual([...keys]);
    expect(result.drift.max).toBe(0);
  });

  it('is lossless at 1:1', async () => {
    const keys = fixtureBuildMask();
    expect([...(await snap(await paint(keys, 1, 'exact.png'))).keys]).toEqual([...keys]);
  });

  it('refuses a source smaller than the canvas', async () => {
    const file = path.join(scratch, 'tiny.png');
    await sharp({
      create: { width: 56, height: 84, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toFile(file);

    await expect(snap(file)).rejects.toThrow(/Upscaling invents/);
  });

  it('refuses a source stretched on one axis', async () => {
    const file = path.join(scratch, 'stretched.png');
    await sharp({
      create: {
        width: MASK_CANVAS.width * 6,
        height: MASK_CANVAS.height * 3,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toFile(file);

    await expect(snap(file)).rejects.toThrow(/stretched/);
  });

  it('reports how far the art actually was from the palette', async () => {
    /*
     * The number that tells a reviewer whether the mask is a reading of the art
     * or a guess about it. Art painted in some other palette still *snaps* — every
     * pixel has a nearest key — so without this the pipeline would accept a file
     * it had substantially rewritten and say nothing.
     */
    const keys = fixtureBuildMask();
    const file = await paint(keys, 6, 'offpalette.png');
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let at = 0; at < data.length; at += 4) {
      if (data[at + 3] === 0) continue;
      data[at] = Math.min(255, data[at]! + 40);
    }
    const drifted = path.join(scratch, 'offpalette-out.png');
    await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png()
      .toFile(drifted);

    expect((await snap(drifted)).drift.mean).toBeGreaterThan(5);
  });
});

describe('the snap metric', () => {
  it('sends every key colour to itself, exactly', () => {
    for (const key of paintedKeys()) {
      const r = parseInt(key.hex.slice(1, 3), 16);
      const g = parseInt(key.hex.slice(3, 5), 16);
      const b = parseInt(key.hex.slice(5, 7), 16);
      const { index, distance } = nearestKey(r, g, b);
      expect(index, key.name).toBe(key.index);
      expect(distance).toBe(0);
    }
  });

  it('never answers with the transparent key', () => {
    // Index 0 has no colour of its own; transparency is decided by alpha, and a
    // colour metric that could return it would punch holes in painted art.
    expect(nearestKey(0, 0, 0).index).not.toBe(TRANSPARENT_KEY);
    expect(nearestKey(255, 255, 255).index).not.toBe(TRANSPARENT_KEY);
    expect(MASK_KEYS[nearestKey(120, 90, 60).index]?.tone).not.toBeNull();
  });
});
