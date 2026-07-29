/**
 * The asset processing pipeline (`art/ASSET_PIPELINE.md §4`).
 *
 *   npm run art:process                 # every file in art/incoming/
 *   npm run art:process -- zone_front_counter
 *
 * Image models cannot produce true pixel art at 32px. They produce 1024px
 * approximations *of the look*. This turns one into the other, mechanically:
 *
 *   1. downscale, nearest-neighbor only
 *   2. quantize to palette.json
 *   3. alpha cleanup — no partial alpha
 *   4. trim to the declared canvas
 *   5. emit to public/assets/<family>/
 *
 * **Step 2 is the important one.** Quantization is what makes fifty
 * independently generated images look like one world. Without it every batch
 * drifts a few degrees — individually fine, collectively wrong — and the seams
 * only become visible around batch four, by which point the earlier batches
 * have to be redone. The prompt gets close; this makes it exact.
 *
 * Nothing here writes to the registry. Registration is a reviewed edit to
 * `art/assets.inventory.json`, because flipping an asset live is a decision
 * rather than a build step.
 */
import { readdirSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

import { assetRegistry } from '@/lib/assets/registry';

const INCOMING = path.join(process.cwd(), 'art', 'incoming');
const OUTPUT_ROOT = path.join(process.cwd(), 'public', 'assets');

/** `#RRGGBB` → [r, g, b]. */
function parseHex(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

interface PaletteFile {
  readonly ramps: Record<string, { readonly colors: Record<string, string> }>;
}

function loadPalette(): readonly [number, number, number][] {
  const raw = JSON.parse(
    readFileSync(path.join(process.cwd(), 'art', 'palette.json'), 'utf8'),
  ) as PaletteFile;

  const colors: [number, number, number][] = [];
  for (const ramp of Object.values(raw.ramps)) {
    for (const hex of Object.values(ramp.colors)) colors.push(parseHex(hex));
  }
  return colors;
}

/**
 * Nearest palette colour.
 *
 * Weighted RGB distance rather than plain Euclidean: the eye is far more
 * sensitive to green than to blue, and unweighted matching sends warm browns —
 * most of this palette — to the wrong ramp.
 */
function nearest(
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

/** `"320x200"` → `{ width, height }`. */
function parseCanvas(canvas: string): { width: number; height: number } {
  const [width, height] = canvas.split('x').map(Number);
  if (width === undefined || height === undefined || Number.isNaN(width) || Number.isNaN(height)) {
    throw new Error(`Unreadable canvas "${canvas}".`);
  }
  return { width, height };
}

/** `zone_front_counter_01.png` → `zone_front_counter`. */
function slugFromFilename(filename: string): string {
  return path.basename(filename, path.extname(filename)).replace(/_\d+$/, '');
}

const ALPHA_THRESHOLD = 128;

async function processOne(filename: string, palette: readonly [number, number, number][]) {
  const slug = slugFromFilename(filename);
  const record = assetRegistry.get(slug);

  if (record === undefined) {
    // A file that matches no slug is almost always a typo in the filename, and
    // silently skipping it means the commissioner waits for art that was never
    // going to appear.
    throw new Error(
      `"${filename}" resolves to slug "${slug}", which is not in the registry. ` +
        `Rename it to <slug>_NN.png — see art/GENERATION_HANDOFF.md §5.`,
    );
  }

  const { width, height } = parseCanvas(record.canvas);

  // --- 1. Downscale --------------------------------------------------------
  //
  // `ASSET_PIPELINE.md §4` says nearest-neighbor, and at modest ratios that is
  // right. At the ratios actually in play it is not: Tony arrives 941 × 1672
  // and ships at 32 × 48, a 29:1 reduction, and nearest-neighbor at 29:1 is not
  // sampling — it is picking one pixel in every 841 and discarding the rest. It
  // produced a figure whose face was three unrelated colours.
  //
  // Averaging first and **then quantizing** gets what that rule was protecting:
  // the average is thrown away a step later when every pixel snaps to
  // `palette.json`, and alpha is hardened to 0 or 255, so the output has no
  // intermediate colours and no anti-aliased edge either way. The difference is
  // that each output pixel now represents the 841 it came from.
  //
  // `fit: 'fill'` because the canvas is authoritative; a source with the wrong
  // aspect ratio should be visibly squashed rather than quietly cropped.
  const scaled = sharp(path.join(INCOMING, filename))
    .ensureAlpha()
    .resize(width, height, { kernel: 'lanczos3', fit: 'fill' });

  const { data, info } = await scaled.raw().toBuffer({ resolveWithObject: true });

  // --- 2 & 3. Quantize, and harden alpha ----------------------------------
  const pixels = Buffer.from(data);
  const changed = { quantized: 0, cleared: 0 };

  for (let index = 0; index < pixels.length; index += info.channels) {
    const alpha = info.channels === 4 ? pixels[index + 3]! : 255;

    if (alpha < ALPHA_THRESHOLD) {
      // Fully transparent. Pixel art has no partial alpha except where
      // deliberately authored, and a soft fringe is the single most common way
      // a sprite reads as "pasted on" over a background.
      if (info.channels === 4) pixels[index + 3] = 0;
      changed.cleared++;
      continue;
    }

    if (info.channels === 4) pixels[index + 3] = 255;

    const [r, g, b] = nearest(palette, pixels[index]!, pixels[index + 1]!, pixels[index + 2]!);
    if (r !== pixels[index] || g !== pixels[index + 1] || b !== pixels[index + 2]) {
      changed.quantized++;
    }
    pixels[index] = r;
    pixels[index + 1] = g;
    pixels[index + 2] = b;
  }

  // --- 4 & 5. Emit --------------------------------------------------------
  const outputDir = path.join(OUTPUT_ROOT, record.family);
  mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${slug}.png`);

  await sharp(pixels, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png({ compressionLevel: 9, palette: true })
    .toFile(outputPath);

  const total = (pixels.length / info.channels) | 0;

  console.log(
    `${slug.padEnd(28)} ${record.canvas.padEnd(9)} ` +
      `${String(Math.round((changed.quantized / total) * 100)).padStart(3)}% recoloured · ` +
      `${String(Math.round((changed.cleared / total) * 100)).padStart(3)}% transparent`,
  );

  console.log(
    `  → public/assets/${record.family}/${slug}.png` +
      `\n    registry: set "path": "/assets/${record.family}/${slug}.png", ` +
      `"art_status": "generated"`,
  );
}

async function main(): Promise<void> {
  if (!existsSync(INCOMING)) {
    console.error(
      `No art/incoming/ directory.\n` +
        `Put the generated PNGs there, named <slug>_NN.png, and run this again.`,
    );
    process.exit(1);
  }

  const only = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
  const files = readdirSync(INCOMING)
    .filter((file) => /\.(png|webp)$/i.test(file))
    // `_source_*` are the generated originals, kept for reference and
    // regeneration. They are not assets and match no slug.
    .filter((file) => !file.startsWith('_'))
    .filter((file) => only.length === 0 || only.includes(slugFromFilename(file)));

  if (files.length === 0) {
    console.error('Nothing to process in art/incoming/.');
    process.exit(1);
  }

  const palette = loadPalette();
  console.log(`Palette: ${String(palette.length)} colours\n`);

  for (const file of files.sort()) {
    await processOne(file, palette);
  }
}

main().catch((error: unknown) => {
  console.error(`\nProcessing failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
