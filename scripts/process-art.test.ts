import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { loadPalette, nearest } from './process-art';

/**
 * The quantizer, asserted.
 *
 * `art/palette.json` is 32 colours across ten deliberately separated hue
 * families, and the matcher's job is to pick the right family before the right
 * step within it. The metric it uses to do that shipped wrong for two batches:
 * channel weights applied *before* squaring left blue contributing 1.21% of the
 * distance, and blue is the only axis meaningfully separating the warm dark
 * woods from `violet-deep`. Warm brown shadow went violet.
 *
 * Nothing on screen said so. `art:process` reported "100% recoloured" and
 * exited zero, and the defect was only found by counting pixels. So it is
 * counted here, every run.
 */

const ROOT = path.join(__dirname, '..');
const VIOLET_DEEP: [number, number, number] = [0x3b, 0x20, 0x50];

const hex = ([r, g, b]: readonly number[]): string =>
  `#${[r, g, b].map((v) => (v ?? 0).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/** The metric as it was before the ruling, for the fails-then-passes proof. */
function nearestWeighted(
  palette: readonly [number, number, number][],
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  let best = palette[0]!;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const colour of palette) {
    const dr = (r - colour[0]) * 0.3;
    const dg = (g - colour[1]) * 0.59;
    const db = (b - colour[2]) * 0.11;
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = colour;
    }
  }

  return best;
}

const palette = loadPalette();

/** Every colour in a ramp, so a match can be checked by family rather than value. */
function ramp(name: string): Set<string> {
  const raw = JSON.parse(readFileSync(path.join(ROOT, 'art', 'palette.json'), 'utf8')) as {
    ramps: Record<string, { colors: Record<string, string> }>;
  };
  return new Set(Object.values(raw.ramps[name]?.colors ?? {}).map((h) => h.toUpperCase()));
}

const WARM_DARK = new Set([...ramp('ink'), ...ramp('wood'), ...ramp('skin'), ...ramp('red')]);

describe('nearest()', () => {
  /**
   * The colours that broke. Every one is a warm shadow taken from the shell —
   * backsplash tile, doorway recess, carpet — plus the ruling's own probe.
   */
  const WARM_SHADOWS: readonly [string, [number, number, number]][] = [
    ['the ruling probe', [60, 34, 45]],
    ['backsplash tile', [0x50, 0x0e, 0x01]],
    ['backsplash tile, lighter', [0x55, 0x13, 0x02]],
    ['carpet', [0x65, 0x0e, 0x0a]],
    ['doorway recess', [0x3f, 0x22, 0x0c]],
    ['counter shadow', [0x4a, 0x24, 0x10]],
  ];

  it.each(WARM_SHADOWS)('keeps %s out of the violet ramp', (_label, rgb) => {
    const match = nearest(palette, ...rgb);
    expect(match).not.toEqual(VIOLET_DEEP);
    expect(WARM_DARK, `${hex(rgb)} → ${hex(match)}`).toContain(hex(match));
  });

  /**
   * The regression, both ways round.
   *
   * A test that only asserts the fix cannot tell you the fix was needed. This
   * one runs the old metric alongside the new one on the same input, so the
   * defect is on the record rather than in a commit message.
   */
  it('sends the ruling probe to violet under the old metric and to wood under the new one', () => {
    const probe: [number, number, number] = [60, 34, 45];

    expect(hex(nearestWeighted(palette, ...probe)), 'the metric that shipped').toBe('#3B2050');
    expect(hex(nearest(palette, ...probe)), 'plain Euclidean').not.toBe('#3B2050');
    expect(WARM_DARK).toContain(hex(nearest(palette, ...probe)));
  });

  it('weights no channel — blue counts as much as green', () => {
    // Two candidates equidistant in different channels must tie. Under the old
    // metric the blue one won by a factor of 29, which is the whole bug.
    const near = (c: [number, number, number]) => {
      const dr = 0 - c[0], dg = 0 - c[1], db = 0 - c[2];
      return dr * dr + dg * dg + db * db;
    };
    expect(near([10, 0, 0])).toBe(near([0, 0, 10]));
    expect(near([0, 10, 0])).toBe(near([0, 0, 10]));
  });

  it('returns a palette entry and never an interpolation', () => {
    const entries = new Set(palette.map((c) => hex(c)));
    for (let r = 0; r < 256; r += 37)
      for (let g = 0; g < 256; g += 41)
        for (let b = 0; b < 256; b += 43) expect(entries).toContain(hex(nearest(palette, r, g, b)));
  });
});

/**
 * The processed batch.
 *
 * These read `public/assets/`, which is committed, so they assert what actually
 * ships rather than what a fresh run would produce. If somebody reprocesses with
 * a different metric and commits the result, these fail.
 */
describe('the processed batch', () => {
  const OUTPUTS = [
    'public/assets/zone/zone_parlor_shell.png',
    'public/assets/zone/zone_front_counter.png',
    'public/assets/zone/zone_counter_front.png',
    'public/assets/zone/object_newspaper_rack.png',
    'public/assets/character/character_tony_neutral.png',
  ];

  async function pixels(file: string) {
    const { data, info } = await sharp(path.join(ROOT, file))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data, count: info.width * info.height };
  }

  /**
   * Exactly zero, and only for this fixture.
   *
   * The shell is the asset the defect was found in and the one whose source is
   * known to contain no violet at all, so zero is a fact about it rather than a
   * rule for every asset forever. A future asset with a genuinely violet object
   * in it should map pixels to violet-deep, and this assertion deliberately
   * does not stop it.
   */
  it('leaves not one pixel of the shell violet', async () => {
    const { data, count } = await pixels('public/assets/zone/zone_parlor_shell.png');
    let violet = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === 0x3b && data[i + 1] === 0x20 && data[i + 2] === 0x50) violet++;
    }
    expect(violet, `${((violet / count) * 100).toFixed(2)}% of the shell`).toBe(0);
  });

  it.each(OUTPUTS)('closes %s over the palette', async (file) => {
    const entries = new Set(palette.map((c) => hex(c)));
    const { data } = await pixels(file);
    const seen = new Set<string>();

    for (let i = 0; i < data.length; i += 4) {
      // Alpha is hardened to 0 or 255, and a cleared pixel's colour is unused.
      if (data[i + 3] === 0) continue;
      seen.add(hex([data[i]!, data[i + 1]!, data[i + 2]!]));
    }

    for (const colour of seen) expect(entries, `${file} contains ${colour}`).toContain(colour);
  });

  it.each(OUTPUTS)('lets no raw black or white into %s', async (file) => {
    // Neither is in `palette.json`. If one appears it came from somewhere other
    // than the quantizer — a resize artefact, or an alpha-cleared pixel that was
    // not actually cleared.
    const entries = new Set(palette.map((c) => hex(c)));
    const { data } = await pixels(file);

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      const colour = hex([data[i]!, data[i + 1]!, data[i + 2]!]);
      if (colour === '#000000' || colour === '#FFFFFF') {
        expect(entries, `${file} contains raw ${colour}`).toContain(colour);
      }
    }
  });

  it('hardens alpha to nothing between transparent and opaque', async () => {
    const { data } = await pixels('public/assets/character/character_tony_neutral.png');
    for (let i = 3; i < data.length; i += 4) {
      expect([0, 255]).toContain(data[i]);
    }
  });
});

/**
 * The ramp-share report.
 *
 * Deliberately **not** a locked snapshot. Pinning a full distribution to the
 * percentage point makes every future source revision fail a test that has
 * nothing to say about correctness. What is asserted is only what would
 * indicate a real regression: the warm families still carry the room, and no
 * single colour has eaten it.
 */
describe('the shell ramp share', () => {
  it('stays a warm room', async () => {
    const file = path.join(ROOT, 'public/assets/zone/zone_parlor_shell.png');
    if (!existsSync(file)) throw new Error('the shell has not been processed');

    const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
    const total = info.width * info.height;

    const families: Record<string, Set<string>> = {
      ink: ramp('ink'), wood: ramp('wood'), red: ramp('red'), paper: ramp('paper'),
      amber: ramp('amber'), blue: ramp('blue'), green: ramp('green'), yellow: ramp('yellow'),
      violet: ramp('violet'), skin: ramp('skin'),
    };

    const share: Record<string, number> = {};
    for (let i = 0; i < data.length; i += info.channels) {
      const colour = hex([data[i]!, data[i + 1]!, data[i + 2]!]);
      for (const [name, set] of Object.entries(families)) {
        if (set.has(colour)) share[name] = (share[name] ?? 0) + 1;
      }
    }

    const pct = Object.fromEntries(
      Object.entries(share).map(([k, v]) => [k, Number(((v / total) * 100).toFixed(2))]),
    );
    console.log('shell ramp share (%):', JSON.stringify(pct));

    const warm = (pct['wood'] ?? 0) + (pct['red'] ?? 0) + (pct['skin'] ?? 0) + (pct['amber'] ?? 0);
    expect(warm, 'a pizza parlor is mostly wood, red and warm light').toBeGreaterThan(60);
    expect(pct['violet'] ?? 0, 'violet').toBe(0);
    expect(Math.max(...Object.values(pct)), 'no family has eaten the room').toBeLessThan(70);
  });
});
