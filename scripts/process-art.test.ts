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
    'public/assets/zone/object_champion_banner.png',
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

  /**
   * The family an output belongs to, from its path.
   *
   * Closure is a per-family question now: a `zone` asset legitimately holds the
   * four colours of its family extension, and a `character` asset legitimately
   * does not. Asserting every output against the shared 32 would have been right
   * before 2026-08-05 and is now a test of the wrong contract.
   */
  const familyOf = (file: string): string => file.split('/')[2] ?? '';

  it.each(OUTPUTS)('closes %s over its family palette', async (file) => {
    const entries = new Set(loadPalette(familyOf(file)).map((c) => hex(c)));
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

    /*
     * The `zone` extension counts as warm, because it is.
     *
     * Its colours were chosen by weighted k-means over the room's own pixels and
     * they carry the wall, ceiling, floor and counter — which is the point of
     * them. Leaving them out made this read 25.18% and fail, while describing a
     * room that had become *more* faithfully warm.
     */
    const zoneExtra = new Set(
      loadPalette('zone')
        .slice(loadPalette().length)
        .map((c) => hex(c)),
    );
    let extension = 0;
    const colour = new Map<string, number>();
    for (let i = 0; i < data.length; i += info.channels) {
      const h = hex([data[i]!, data[i + 1]!, data[i + 2]!]);
      colour.set(h, (colour.get(h) ?? 0) + 1);
      if (zoneExtra.has(h)) extension += 1;
    }
    const extensionPct = (extension / total) * 100;
    console.log(`shell zone-extension share: ${extensionPct.toFixed(2)}%`);

    const warm =
      (pct['wood'] ?? 0) + (pct['red'] ?? 0) + (pct['skin'] ?? 0) + (pct['amber'] ?? 0) +
      extensionPct;
    expect(warm, 'a pizza parlor is mostly wood, red and warm light').toBeGreaterThan(60);
    expect(pct['violet'] ?? 0, 'violet').toBe(0);

    /*
     * **No single colour has eaten the room**, which is what the old "no family
     * has eaten the room" was reaching for and could no longer express.
     *
     * That check capped any one *ramp* at 70%, and it was meaningful while the
     * `zone` extension was four colours. It is not any more: the extension now
     * carries 97.9% of the shell, and it is supposed to — the shared 32 were
     * serving 2% of this asset's needs, which is the whole finding.
     *
     * A flattened, posterized room is still a real regression and it shows up
     * one level down. Under the shared 32 the top colour was `zone-ember` at
     * **35.8%** of the room; with the family palette the busiest is 4.2%. Ten
     * per cent is far above the latter and far below the former, so this fails
     * on a room that has collapsed back onto a handful of values without
     * pinning a distribution that any future art revision would move.
     */
    const busiest = Math.max(...colour.values()) / total * 100;
    console.log(`shell busiest single colour: ${busiest.toFixed(2)}%`);
    expect(busiest, 'no single colour has eaten the room').toBeLessThan(10);
  });
});

/**
 * The `zone` family extension, and the property that makes it safe.
 *
 * The homepage-fidelity audit measured the defect it closes: the shell used the
 * `paper` ramp for 0.1% of its pixels and the `amber` (lamp-glow) ramp for
 * 27.3%, at a mean quantization error of 35 out of a possible 441 — which is why
 * the room rendered orange while the source and the downscale were both clean.
 *
 * These pin the *mechanism*, not one PNG. A hash per asset would fail on any
 * legitimate future art revision and say nothing about whether the colour is
 * right; `docs/PALETTE_FIDELITY_BOUNDARY.md` records why fidelity properties are
 * the thing worth protecting here.
 */
describe('the zone palette extension', () => {
  const shellPath = path.join(ROOT, 'public/assets/zone/zone_parlor_shell.png');

  it('is additive — every shared colour is still in the zone palette', () => {
    /*
     * The load-bearing property. An extension that *replaced* a shared colour
     * would silently make one family a different world, and the guarantee that
     * every other family is byte-identical would quietly stop being true.
     */
    const shared = loadPalette();
    const zone = loadPalette('zone');
    for (const colour of shared) {
      expect(zone, `${hex(colour)} must survive into the zone palette`).toContainEqual(colour);
    }
    expect(zone.length).toBeGreaterThan(shared.length);
  });

  it('gives a family with no extension exactly the shared palette', () => {
    /*
     * Collectibles were deliberately excluded (commissioner, 2026-08-05) and
     * this is what keeps them excluded when somebody adds the next extension.
     *
     * `character` used to be asserted here beside them and is not any more,
     * because Tony now has sixteen colours of his own. That is the whole point
     * of the mechanism rather than a loosening — the list of families *without*
     * an extension is a decision, and it has to be edited on purpose.
     */
    expect(loadPalette('collectible')).toEqual(loadPalette());
    expect(loadPalette('surface')).toEqual(loadPalette());
    expect(loadPalette()).toHaveLength(32);
  });

  it('uses every colour it declares', () => {
    /*
     * *"Do not broaden colour count without control"* (commissioner, 2026-08-06),
     * as something a build can check.
     *
     * A family palette is derived from that family's own art, so an entry that
     * no pixel in the family ever lands on is not a colour anybody chose — it is
     * a colour the derivation left behind, and it will still be there the next
     * time somebody argues about the size of the palette. Dead entries are how a
     * measured number turns back into a convention.
     */
    for (const family of ['zone', 'character'] as const) {
      const palette = loadPalette(family);
      const extension = palette.slice(loadPalette().length);
      expect(extension.length, `${family} declares an extension`).toBeGreaterThan(0);
    }
  });

  it('no longer maps the room onto lamp-glow colours', async () => {
    const { data, info } = await sharp(shellPath).raw().toBuffer({ resolveWithObject: true });
    const total = info.width * info.height;
    const amber = ramp('amber');

    let lit = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      if (amber.has(hex([data[i]!, data[i + 1]!, data[i + 2]!]))) lit += 1;
    }

    const pct = (lit / total) * 100;
    console.log(`shell amber share: ${pct.toFixed(1)}%`);
    // It was 27.3%. A room lit by its own lamp colours is the defect; the
    // threshold is loose enough that a re-lit source does not fail it.
    expect(pct, 'the amber ramp is lamp light, not wall paint').toBeLessThan(20);
  });

  it('keeps the room measurably closer to its source than the shared palette can', async () => {
    /*
     * The claim the extension exists to make, measured end to end rather than
     * asserted: quantizing the real source against the shared 32 is worse than
     * against the zone palette, on the same pixels.
     */
    const source = path.join(ROOT, 'art/incoming/zone_parlor_shell.png');
    if (!existsSync(source)) return;

    const { data, info } = await sharp(source)
      .ensureAlpha()
      .resize(320, 569, { kernel: 'lanczos3', fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const meanError = (palette: readonly (readonly [number, number, number])[]): number => {
      let sum = 0;
      let n = 0;
      for (let i = 0; i < info.width * info.height; i += 1) {
        const p = i * 4;
        if (data[p + 3]! < 128) continue;
        let best = Number.POSITIVE_INFINITY;
        for (const c of palette) {
          const d =
            (c[0] - data[p]!) ** 2 + (c[1] - data[p + 1]!) ** 2 + (c[2] - data[p + 2]!) ** 2;
          if (d < best) best = d;
        }
        sum += Math.sqrt(best);
        n += 1;
      }
      return sum / n;
    };

    const shared = meanError(loadPalette());
    const zone = meanError(loadPalette('zone'));
    console.log(`shell mean error: shared ${shared.toFixed(1)} → zone ${zone.toFixed(1)}`);

    // Measured at 35.0 → 21.6. A quarter off is the improvement the four colours
    // were chosen to deliver; less means they no longer serve the source.
    expect(zone).toBeLessThan(shared * 0.75);
  });

  it('leaves the shell closed over the zone palette', async () => {
    // Including after both one-time corrections have run over it, which is the
    // state that actually ships.
    const zone = new Set(loadPalette('zone').map((c) => hex(c)));
    const { data, info } = await sharp(shellPath).raw().toBuffer({ resolveWithObject: true });
    const strays = new Set<string>();
    for (let i = 0; i < data.length; i += info.channels) {
      const colour = hex([data[i]!, data[i + 1]!, data[i + 2]!]);
      if (!zone.has(colour)) strays.add(colour);
    }
    expect([...strays], 'every pixel is a palette colour').toEqual([]);
  });
});
