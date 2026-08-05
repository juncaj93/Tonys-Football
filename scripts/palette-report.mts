/**
 * The palette-coverage report — the evidence behind any change to `palette.json`.
 *
 *   npx tsx scripts/palette-report.mts
 *   npx tsx scripts/palette-report.mts --add=2,3,4,5
 *
 * Prints. Writes nothing, changes nothing.
 *
 * The study set is deliberately **not** every asset. It is one asset per
 * material the acceptance criteria name — the room itself, Tony, cream paper,
 * dark wood, a red-heavy object, a blue-heavy object, and an emissive one — so
 * a candidate that fixes the walls by wrecking the neon fails here rather than
 * in review.
 */
import { assetRegistry } from '../lib/assets/registry.ts';

import {
  type PaletteEntry,
  type Rgb,
  downscaled,
  hex,
  loadPalette,
  measure,
  nearestIndex,
  proposeAdditions,
} from './palette-study.mts';

interface StudyAsset {
  readonly label: string;
  readonly file: string;
  readonly slug: string;
  /** What this asset is in the study *for*. A candidate must not break it. */
  readonly guards: string;
}

const STUDY: readonly StudyAsset[] = [
  { label: 'shell', file: 'art/incoming/zone_parlor_shell.png', slug: 'zone_parlor_shell', guards: 'cream walls, ceiling, floor, wood' },
  { label: 'tony', file: 'art/incoming/character_tony_neutral_02.png', slug: 'character_tony_neutral', guards: 'skin, apron cream, blue jersey' },
  { label: 'counter-front', file: 'art/incoming/zone_counter_front_01.png', slug: 'zone_counter_front', guards: 'dark wood, red trim' },
  { label: 'newspaper-rack', file: 'art/incoming/_source_newspaper_rack.png', slug: 'object_newspaper_rack', guards: 'cream paper' },
  { label: 'neon-sign', file: 'art/incoming/collectible_neon_tony_sign_01.png', slug: 'collectible_neon_tony_sign', guards: 'emissive neon' },
  { label: 'signed-jersey', file: 'art/incoming/collectible_signed_jersey_legend_01.png', slug: 'collectible_signed_jersey_legend', guards: 'blue, white' },
  { label: 'burn-barrel', file: 'art/incoming/collectible_burn_barrel_01.png', slug: 'collectible_burn_barrel', guards: 'deep shadow, fire' },
];

function canvasOf(slug: string): { width: number; height: number } {
  const record = assetRegistry.get(slug);
  if (record === undefined) throw new Error(`no registry record for ${slug}`);
  const [w, h] = record.canvas.split('x').map(Number);
  return { width: w ?? 0, height: h ?? 0 };
}

const addArg = process.argv.find((a) => a.startsWith('--add='));
const ADD_COUNTS = addArg === undefined ? [] : addArg.split('=')[1]!.split(',').map(Number);

const base = loadPalette();

/** Load every study asset once; candidates are scored against the same pixels. */
const loaded: { asset: StudyAsset; image: { data: Buffer; width: number; height: number } }[] = [];
for (const asset of STUDY) {
  const { width, height } = canvasOf(asset.slug);
  try {
    loaded.push({ asset, image: await downscaled(asset.file, width, height) });
  } catch {
    console.log(`  (skipped ${asset.label}: ${asset.file} not present)`);
  }
}

function table(palette: readonly PaletteEntry[], title: string): void {
  console.log(`\n  ${title} — ${String(palette.length)} colours`);
  console.log(
    `  ${'asset'.padEnd(16)}${'mean err'.padStart(9)}${'p95'.padStart(7)}` +
      `${'isolated'.padStart(10)}${'paper'.padStart(8)}${'amber'.padStart(8)}${'wood'.padStart(7)}${'red'.padStart(7)}`,
  );
  for (const { asset, image } of loaded) {
    const m = measure(asset.label, image, palette);
    console.log(
      `  ${asset.label.padEnd(16)}` +
        `${m.meanError.toFixed(1).padStart(9)}` +
        `${m.p95Error.toFixed(0).padStart(7)}` +
        `${(`${m.isolatedPct.toFixed(2)}%`).padStart(10)}` +
        `${(`${(m.rampShare['paper'] ?? 0).toFixed(1)}%`).padStart(8)}` +
        `${(`${(m.rampShare['amber'] ?? 0).toFixed(1)}%`).padStart(8)}` +
        `${(`${(m.rampShare['wood'] ?? 0).toFixed(1)}%`).padStart(7)}` +
        `${(`${(m.rampShare['red'] ?? 0).toFixed(1)}%`).padStart(7)}`,
    );
  }
}

table(base, 'CURRENT');

/* --- Where the error actually lives ------------------------------------- */

console.log('\n  The colours the palette serves worst, by error mass');
console.log('  (weight = pixels, error = distance to the nearest palette entry)\n');

const samples: { r: number; g: number; b: number; weight: number; error: number }[] = [];
const buckets = new Map<number, { r: number; g: number; b: number; n: number; err: number; from: string }>();

for (const { asset, image } of loaded) {
  const { data, width, height } = image;
  for (let i = 0; i < width * height; i += 1) {
    const p = i * 4;
    if ((data[p + 3] ?? 0) < 128) continue;
    const r = data[p]!;
    const g = data[p + 1]!;
    const b = data[p + 2]!;
    const k = nearestIndex(base, r, g, b);
    const c = base[k]!;
    const err = Math.sqrt((c.r - r) ** 2 + (c.g - g) ** 2 + (c.b - b) ** 2);
    samples.push({ r, g, b, weight: 1, error: err });

    // 16 levels per channel: coarse enough to group a surface, fine enough to
    // keep a wall and a floor tile apart.
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const acc = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0, err: 0, from: asset.label };
    acc.r += r;
    acc.g += g;
    acc.b += b;
    acc.n += 1;
    acc.err += err;
    buckets.set(key, acc);
  }
}

const ranked = [...buckets.values()].sort((a, b) => b.err - a.err).slice(0, 12);
const totalErr = [...buckets.values()].reduce((n, b) => n + b.err, 0);
for (const b of ranked) {
  const mean = { r: b.r / b.n, g: b.g / b.n, b: b.b / b.n };
  const k = nearestIndex(base, mean.r, mean.g, mean.b);
  console.log(
    `    ${hex(mean)}  ${String(b.n).padStart(6)} px  ` +
      `${((b.err / totalErr) * 100).toFixed(1).padStart(4)}% of all error  ` +
      `→ ${base[k]!.name} ${hex(base[k]!)}  (mean ${(b.err / b.n).toFixed(0)})`,
  );
}

/* --- Candidates ---------------------------------------------------------- */

/*
 * The pool the candidates are drawn from is **warm only**, and that is a
 * correction the first run forced.
 *
 * Unconstrained k-means over all error mass proposed a blue as its very first
 * addition — Tony's jersey and the window — and the resulting palettes swallowed
 * the approved `wood` and `red` ramps almost whole: the shell's wood share fell
 * from 32.8% to 4.3% and its red from 24.6% to 2.1%. That is not "extend the
 * palette with restrained warm neutrals"; it is replacing the world's colour
 * identity as a side effect of minimising an average.
 *
 * So the pool keeps only pixels that are warm (red channel at or above blue) and
 * that the palette currently serves from the warm families. The blue, green and
 * neon families are already well served — they are authored flat in the source —
 * and nothing in the report says otherwise.
 */
const WARM_FAMILIES = new Set(['paper', 'wood', 'amber', 'red', 'yellow', 'skin']);
const warmPool = samples.filter((s) => {
  if (s.r < s.b) return false;
  const family = base[nearestIndex(base, s.r, s.g, s.b)]!.ramp;
  return WARM_FAMILIES.has(family);
});
console.log(
  `\n  Candidate pool: ${String(warmPool.length)} warm pixels of ${String(samples.length)} ` +
    `(${((warmPool.length / samples.length) * 100).toFixed(0)}%)`,
);

for (const k of ADD_COUNTS) {
  const additions = proposeAdditions(warmPool, k);
  const extended: PaletteEntry[] = [
    ...base,
    ...additions.map((c, i) => ({ ...c, ramp: 'neutral', name: `neutral-${String(i + 1)}` })),
  ];
  console.log(`\n  Proposed +${String(k)}: ${additions.map((c: Rgb) => hex(c)).join('  ')}`);
  table(extended, `CANDIDATE +${String(k)}`);
}

console.log(
  '\n  Nothing is approved by this script. A candidate passes on the numbers ' +
    '\n  above *and* on the crops in the fidelity evidence, never on one alone.\n',
);
