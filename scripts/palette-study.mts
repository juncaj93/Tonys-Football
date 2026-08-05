/**
 * Where the palette runs out, measured rather than eyeballed.
 *
 * The homepage-fidelity audit established the first bad stage: the incoming art
 * is clean, the lanczos downscale is clean, and **quantization** is where the
 * room turns orange and speckled. This script answers the next question — *which
 * colours is the palette missing, and how much would adding them buy?*
 *
 *   npx tsx scripts/palette-study.mts              # the current palette
 *   npx tsx scripts/palette-study.mts --add=3      # and candidates with k extras
 *
 * It measures. It changes nothing.
 *
 * ## The method
 *
 * For every asset in the study set the pixels are downscaled exactly as
 * `process-art.ts` would, then each is assigned its nearest palette colour by
 * the same Euclidean sRGB metric. Two things come out of that:
 *
 *   - **error mass** — sum of distance over all pixels, bucketed by source
 *     colour, so the biggest contributors are the colours the palette cannot
 *     represent rather than the ones that merely appear often;
 *   - **isolated pixels** — a pixel whose assigned colour matches none of its
 *     four neighbours. That is the speckle, and it is the number that describes
 *     what the commissioner called "scratchy" and "over-dithered". There is no
 *     dithering step in this pipeline; the noise is a hard per-pixel snap
 *     landing adjacent pixels on different sides of a decision boundary.
 *
 * Candidates are then chosen by **weighted k-means over the worst-served
 * pixels** — not by eye, and not by picking pretty swatches. A colour earns its
 * place by how much error it removes.
 */
import { readFileSync } from 'node:fs';

import sharp from 'sharp';

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface PaletteEntry extends Rgb {
  readonly name: string;
  readonly ramp: string;
}

/** The locked palette, in file order. */
export function loadPalette(): PaletteEntry[] {
  const raw = JSON.parse(readFileSync('art/palette.json', 'utf8')) as {
    ramps: Record<string, { colors: Record<string, string> }>;
  };
  const out: PaletteEntry[] = [];
  for (const [ramp, spec] of Object.entries(raw.ramps)) {
    for (const [name, hex] of Object.entries(spec.colors)) {
      out.push({
        ramp,
        name,
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16),
      });
    }
  }
  return out;
}

export const hex = (c: Rgb): string =>
  `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** The production metric, unchanged. Anything else would measure a different pipeline. */
export function nearestIndex(palette: readonly Rgb[], r: number, g: number, b: number): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [i, c] of palette.entries()) {
    const dr = r - c.r;
    const dg = g - c.g;
    const db = b - c.b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}

/** One asset, downscaled exactly as `process-art.ts` would. */
export async function downscaled(
  file: string,
  width: number,
  height: number,
): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .resize(width, height, { kernel: 'lanczos3', fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export interface Measurement {
  readonly label: string;
  readonly opaque: number;
  readonly meanError: number;
  readonly p95Error: number;
  readonly isolatedPct: number;
  readonly rampShare: Readonly<Record<string, number>>;
}

/** Every number the acceptance criteria are stated in, for one asset. */
export function measure(
  label: string,
  image: { data: Buffer; width: number; height: number },
  palette: readonly PaletteEntry[],
): Measurement {
  const { data, width, height } = image;
  const index = new Int32Array(width * height).fill(-1);
  const errors: number[] = [];
  const rampCount = new Map<string, number>();
  let opaque = 0;
  let total = 0;

  for (let i = 0; i < width * height; i += 1) {
    const p = i * 4;
    if ((data[p + 3] ?? 0) < 128) continue;
    opaque += 1;
    const k = nearestIndex(palette, data[p]!, data[p + 1]!, data[p + 2]!);
    index[i] = k;
    const c = palette[k]!;
    const dr = c.r - data[p]!;
    const dg = c.g - data[p + 1]!;
    const db = c.b - data[p + 2]!;
    const d = Math.sqrt(dr * dr + dg * dg + db * db);
    errors.push(d);
    total += d;
    rampCount.set(c.ramp, (rampCount.get(c.ramp) ?? 0) + 1);
  }

  let isolated = 0;
  let counted = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const k = index[i]!;
      if (k === -1) continue;
      counted += 1;
      if (
        index[i - 1] !== k &&
        index[i + 1] !== k &&
        index[i - width] !== k &&
        index[i + width] !== k
      ) {
        isolated += 1;
      }
    }
  }

  errors.sort((a, b) => a - b);
  const rampShare: Record<string, number> = {};
  for (const [ramp, n] of rampCount) rampShare[ramp] = (n / Math.max(1, opaque)) * 100;

  return {
    label,
    opaque,
    meanError: opaque === 0 ? 0 : total / opaque,
    p95Error: errors[Math.floor(errors.length * 0.95)] ?? 0,
    isolatedPct: counted === 0 ? 0 : (isolated / counted) * 100,
    rampShare,
  };
}

/**
 * The colours the palette serves worst, as candidates.
 *
 * Weighted k-means seeded from the highest-error pixels. Weighted, because a
 * colour that appears on a quarter of the room matters more than one on a
 * doorknob — and the room's dominant surface is exactly what went wrong.
 */
export function proposeAdditions(
  samples: readonly { r: number; g: number; b: number; weight: number; error: number }[],
  k: number,
  rounds = 24,
): Rgb[] {
  const worst = [...samples].sort((a, b) => b.error * b.weight - a.error * a.weight);
  const pool = worst.slice(0, Math.max(k, Math.floor(worst.length * 0.5)));
  if (pool.length === 0) return [];

  // Seeded deterministically by spreading the initial centres through the
  // sorted pool: a k-means that starts from a random seed is a study whose
  // answer changes between runs, which is not a study.
  let centres: Rgb[] = Array.from({ length: k }, (_, i) => {
    const s = pool[Math.floor((i * pool.length) / k)]!;
    return { r: s.r, g: s.g, b: s.b };
  });

  for (let round = 0; round < rounds; round += 1) {
    const sums = centres.map(() => ({ r: 0, g: 0, b: 0, w: 0 }));
    for (const s of pool) {
      const j = nearestIndex(centres, s.r, s.g, s.b);
      const acc = sums[j]!;
      acc.r += s.r * s.weight;
      acc.g += s.g * s.weight;
      acc.b += s.b * s.weight;
      acc.w += s.weight;
    }
    centres = centres.map((c, j) => {
      const acc = sums[j]!;
      return acc.w === 0 ? c : { r: acc.r / acc.w, g: acc.g / acc.w, b: acc.b / acc.w };
    });
  }

  return centres.map((c) => ({ r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) }));
}
