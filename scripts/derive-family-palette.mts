/**
 * The colours one asset family needs, derived from that family's own art.
 *
 *   npx tsx scripts/derive-family-palette.mts zone 64
 *   npx tsx scripts/derive-family-palette.mts character 16
 *
 * Prints a `familyExtensions` block for `art/palette.json`. Writes nothing.
 *
 * ## Why a family needs its own colours at all
 *
 * The shared 32 were chosen for **collectibles** — 46 x 46 sprites of punchy
 * authored shape, generated in independent batches, where a common palette is
 * what stops batch four looking like a different game from batch one.
 *
 * The homepage is not that. `zone_parlor_shell.png` arrives as a **941 x 1672
 * painting with 153,738 distinct colours** and 2.9% blockiness — a continuous-
 * tone illustration, not pixel art. Tony is 480 x 1315 and 72,004 colours.
 * Snapping either to 32 is not "making it match the world"; it is discarding
 * almost everything the approved art contains, and it is what the commissioner
 * saw as *"compressed, noisy, harsh, and color-distorted"*.
 *
 * So the size of a family's palette is a **measured** property of that family's
 * art rather than a convention. This script measures it.
 *
 * ## The method, and what makes it reproducible
 *
 * Weighted k-means over the family's own source pixels, weighted by area and
 * ranked by how badly the shared palette already serves them — the same
 * `proposeAdditions` the 2026-08-05 study used, so the two are comparable.
 * `proposeAdditions` seeds its centres by spreading them through the sorted
 * pool rather than at random, so the same sources and the same k always give
 * the same colours.
 *
 * The output is **pasted into `palette.json` as literal hexes**. It is not read
 * at build time. A palette that recomputed itself from source art on every run
 * would make every asset a function of whatever happened to be in
 * `art/incoming/`, and the whole point of that directory is that it is an
 * archive rather than an input to production.
 */
import sharp from 'sharp';

import { assetRegistry } from '../lib/assets/registry.ts';
import { downscaled, hex, loadPalette, nearestIndex, proposeAdditions } from './palette-study.mts';

const family = process.argv[2];
const count = Number(process.argv[3] ?? '0');
if (family === undefined || !Number.isInteger(count) || count <= 0) {
  throw new Error('usage: derive-family-palette.mts <family> <count>');
}

/**
 * Every incoming source belonging to the family, at its shipped canvas.
 *
 * Sampled **after** the downscale, because that is where the colours the
 * quantizer actually sees come from — a full-resolution histogram would weight
 * detail the shipped asset cannot hold.
 */
const sources: { file: string; width: number; height: number }[] = [];
for (const record of assetRegistry.byFamily(family as never)) {
  const [w, h] = record.canvas.split('x').map(Number);
  /*
   * The newest revision wins.
   *
   * Sources are archived as `<slug>_NN.png` and the highest N is the approved
   * one — `character_tony_neutral_02` supersedes `_01`. Deriving from an older
   * revision would tune the palette to art that is not on the homepage.
   */
  for (const suffix of ['_02', '_01', '']) {
    const file = `art/incoming/${record.slug}${suffix}.png`;
    try {
      await sharp(file).metadata();
      sources.push({ file, width: w ?? 0, height: h ?? 0 });
      break;
    } catch {
      /* not this revision */
    }
  }
}
if (sources.length === 0) throw new Error(`no incoming sources found for family "${family}"`);

const shared = loadPalette();
const seen = new Map<number, { r: number; g: number; b: number; n: number; err: number }>();

for (const { file, width, height } of sources) {
  const img = await downscaled(file, width, height);
  for (let i = 0; i < img.width * img.height; i += 1) {
    const p = i * 4;
    if ((img.data[p + 3] ?? 0) < 128) continue;
    const r = img.data[p]!;
    const g = img.data[p + 1]!;
    const b = img.data[p + 2]!;
    const key = (r << 16) | (g << 8) | b;
    const existing = seen.get(key);
    if (existing !== undefined) {
      existing.n += 1;
      continue;
    }
    const c = shared[nearestIndex(shared, r, g, b)]!;
    seen.set(key, {
      r,
      g,
      b,
      n: 1,
      err: Math.sqrt((c.r - r) ** 2 + (c.g - g) ** 2 + (c.b - b) ** 2),
    });
  }
}

const samples = [...seen.values()].map((s) => ({
  r: s.r,
  g: s.g,
  b: s.b,
  weight: s.n,
  error: s.err,
}));

const proposed = proposeAdditions(samples, count);

/*
 * Ordered by how much of the family each colour ends up carrying, so the block
 * reads top-down as "the colours this family is mostly made of" and a diff that
 * changes one is legible. Deterministic: ties break on the hex string.
 */
const carried = new Map<string, number>();
for (const s of samples) {
  const k = nearestIndex(proposed, s.r, s.g, s.b);
  const key = hex(proposed[k]!);
  carried.set(key, (carried.get(key) ?? 0) + s.weight);
}
const ordered = [...new Set(proposed.map(hex))].sort((a, b) => {
  const d = (carried.get(b) ?? 0) - (carried.get(a) ?? 0);
  return d !== 0 ? d : a.localeCompare(b);
});

const total = samples.reduce((sum, s) => sum + s.weight, 0);
console.log(`\n// ${family}: ${String(ordered.length)} colours from ${String(sources.length)} source(s), ${String(seen.size)} distinct source colours\n`);
console.log('"colors": {');
ordered.forEach((h, i) => {
  const share = (((carried.get(h) ?? 0) / total) * 100).toFixed(1);
  const comma = i === ordered.length - 1 ? '' : ',';
  console.log(`  "${family}-${String(i + 1).padStart(2, '0')}": "${h.toUpperCase()}"${comma}   // ${share}%`);
});
console.log('}');
