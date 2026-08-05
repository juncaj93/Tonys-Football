/**
 * What a palette change would do to every production asset, before it does it.
 *
 *   npx tsx scripts/palette-impact.mts --colours=#455806,#661505,#b46110,#a02f02
 *
 * `art/palette.json` carries a standing obligation — *"do not add, remove, or
 * edit a color without regenerating every affected asset"* — and this is how
 * "affected" stops being a guess. It reprocesses every incoming file in memory
 * under both palettes and reports what changes, writing nothing.
 *
 * Stage B of the staged reprocess: prove the extension on a representative set,
 * **inventory the blast radius**, then reprocess production.
 */
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import path from 'node:path';


import { assetRegistry } from '../lib/assets/registry.ts';

import { type PaletteEntry, downscaled, loadPalette, nearestIndex } from './palette-study.mts';

const INCOMING = 'art/incoming';

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

const extra: PaletteEntry[] = (arg('colours') ?? '')
  .split(',')
  .filter((s) => s.length > 0)
  .map((s, i) => ({
    ramp: 'candidate',
    name: `candidate-${String(i + 1)}`,
    r: parseInt(s.slice(1, 3), 16),
    g: parseInt(s.slice(3, 5), 16),
    b: parseInt(s.slice(5, 7), 16),
  }));

const base = loadPalette();
const extended = [...base, ...extra];

/** `zone_front_counter_01.png` → `zone_front_counter`, exactly as the pipeline does. */
const slugOf = (file: string): string =>
  path.basename(file, path.extname(file)).replace(/_\d+$/, '');

function quantize(
  image: { data: Buffer; width: number; height: number },
  palette: readonly PaletteEntry[],
): Buffer {
  const out = Buffer.from(image.data);
  for (let i = 0; i < image.width * image.height; i += 1) {
    const p = i * 4;
    if ((out[p + 3] ?? 0) < 128) {
      out[p + 3] = 0;
      continue;
    }
    out[p + 3] = 255;
    const c = palette[nearestIndex(palette, out[p]!, out[p + 1]!, out[p + 2]!)]!;
    out[p] = c.r;
    out[p + 1] = c.g;
    out[p + 2] = c.b;
  }
  return out;
}

const files = readdirSync(INCOMING)
  .filter((f) => f.endsWith('.png') && !f.startsWith('_'))
  .sort();

console.log(
  `\n  Impact of +${String(extra.length)} colours over ${String(base.length)}: ` +
    `${extra.map((c) => `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`).join(' ')}\n`,
);
console.log(
  `  ${'slug'.padEnd(34)}${'canvas'.padStart(9)}${'changed'.padStart(10)}${'share'.padStart(8)}  effect`,
);

let touched = 0;
let untouched = 0;

for (const file of files) {
  const slug = slugOf(file);
  const record = assetRegistry.get(slug);
  if (record === undefined) continue;
  const [w, h] = record.canvas.split('x').map(Number);
  const width = w ?? 0;
  const height = h ?? 0;

  const image = await downscaled(path.join(INCOMING, file), width, height);
  const before = quantize(image, base);
  const after = quantize(image, extended);

  let changed = 0;
  let opaque = 0;
  for (let i = 0; i < width * height; i += 1) {
    const p = i * 4;
    if (before[p + 3] === 0) continue;
    opaque += 1;
    if (before[p] !== after[p] || before[p + 1] !== after[p + 1] || before[p + 2] !== after[p + 2]) {
      changed += 1;
    }
  }

  const share = opaque === 0 ? 0 : (changed / opaque) * 100;
  if (changed === 0) untouched += 1;
  else touched += 1;

  const effect =
    share === 0
      ? 'unchanged'
      : share < 5
        ? 'incidental'
        : share < 25
          ? 'noticeable'
          : 'substantial';

  console.log(
    `  ${slug.padEnd(34)}${record.canvas.padStart(9)}` +
      `${String(changed).padStart(10)}${(`${share.toFixed(1)}%`).padStart(8)}  ${effect}` +
      `  ${createHash('sha256').update(before).digest('hex').slice(0, 8)}` +
      ` → ${createHash('sha256').update(after).digest('hex').slice(0, 8)}`,
  );
}

console.log(
  `\n  ${String(touched)} assets change, ${String(untouched)} are byte-identical.` +
    '\n  No incoming source is modified by a palette change; only outputs move.\n',
);
