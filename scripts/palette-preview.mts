/**
 * Render an asset under a candidate palette, without touching production.
 *
 *   npx tsx scripts/palette-preview.mts --colours=#661505,#b46110 --slug=zone_parlor_shell
 *
 * Writes into `visual-qa/palette-preview/`. The production pipeline is not
 * involved and `public/assets` is never written — a candidate has to be looked
 * at before it is allowed anywhere near an approved asset.
 */
import { mkdir } from 'node:fs/promises';

import sharp from 'sharp';

import { assetRegistry } from '../lib/assets/registry.ts';

import { type PaletteEntry, downscaled, loadPalette, nearestIndex } from './palette-study.mts';

const OUT = 'visual-qa/palette-preview';

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

const SOURCES: Record<string, string> = {
  zone_parlor_shell: 'art/incoming/zone_parlor_shell.png',
  character_tony_neutral: 'art/incoming/character_tony_neutral_02.png',
  zone_counter_front: 'art/incoming/zone_counter_front_01.png',
  object_newspaper_rack: 'art/incoming/_source_newspaper_rack.png',
  collectible_neon_tony_sign: 'art/incoming/collectible_neon_tony_sign_01.png',
  collectible_signed_jersey_legend: 'art/incoming/collectible_signed_jersey_legend_01.png',
  collectible_burn_barrel: 'art/incoming/collectible_burn_barrel_01.png',
};

const slug = arg('slug') ?? 'zone_parlor_shell';
const extra = (arg('colours') ?? '')
  .split(',')
  .filter((s) => s.length > 0)
  .map((s) => ({
    ramp: 'neutral',
    name: s,
    r: parseInt(s.slice(1, 3), 16),
    g: parseInt(s.slice(3, 5), 16),
    b: parseInt(s.slice(5, 7), 16),
  }));

const palette: PaletteEntry[] = [...loadPalette(), ...extra];

const record = assetRegistry.get(slug);
if (record === undefined) throw new Error(`no registry record for ${slug}`);
const [w, h] = record.canvas.split('x').map(Number);
const width = w ?? 0;
const height = h ?? 0;

const file = SOURCES[slug];
if (file === undefined) throw new Error(`no study source registered for ${slug}`);

const image = await downscaled(file, width, height);
const out = Buffer.from(image.data);
for (let i = 0; i < width * height; i += 1) {
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

await mkdir(OUT, { recursive: true });
const tag = extra.length === 0 ? 'current' : `plus${String(extra.length)}`;

await sharp(out, { raw: { width, height, channels: 4 } })
  .png({ compressionLevel: 9, palette: true })
  .toFile(`${OUT}/${slug}-${tag}.png`);

// A 2x nearest view for inspection, beside the 1:1 the acceptance criteria ask
// for. Judging pixel art only from an enlargement is how the last three passes
// each missed something.
await sharp(out, { raw: { width, height, channels: 4 } })
  .resize({ width: width * 2, kernel: 'nearest' })
  .png()
  .toFile(`${OUT}/${slug}-${tag}-2x.png`);

console.log(`  ${slug} · ${String(palette.length)} colours → ${OUT}/${slug}-${tag}.png`);
