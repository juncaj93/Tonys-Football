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
  readonly familyExtensions?: Record<string, { readonly colors?: Record<string, string> }>;
}

/**
 * The palette an asset is quantized against.
 *
 * ## Shared by default, extended only where a gap was measured
 *
 * The 32 shared colours are what make independently generated batches look like
 * one world, and they stay shared. `familyExtensions` adds a handful more to
 * **one family**, because the homepage-fidelity audit found a coverage gap that
 * only one family has.
 *
 * `zone_*` assets are large painterly interiors. Their dominant surfaces — walls,
 * ceiling, floor, counter — sit in a warm mid range the shared palette does not
 * reach: measured on the shell, the `paper` ramp took **0.1%** of the pixels and
 * the `amber` (lamp-glow) ramp took **27.3%**, at a mean error of 35 out of a
 * possible 441. That is why the room rendered orange and speckled while the
 * source and the downscale were both clean.
 *
 * A collectible is 46 x 46 of punchy authored shape and has no such gap. Applied
 * globally the same four colours rewrote all twelve approved Batch B pieces by up
 * to 39% — a re-approval event, not a defect fix. Commissioner decision,
 * 2026-08-05: scope it to `zone`.
 *
 * **The extension is additive and never replaces a shared colour**, so an asset
 * in any other family is byte-identical to what it was before this existed.
 */
export function loadPalette(family?: string): readonly [number, number, number][] {
  const raw = JSON.parse(
    readFileSync(path.join(process.cwd(), 'art', 'palette.json'), 'utf8'),
  ) as PaletteFile;

  const colors: [number, number, number][] = [];
  for (const ramp of Object.values(raw.ramps)) {
    for (const hex of Object.values(ramp.colors)) colors.push(parseHex(hex));
  }

  const extension = family === undefined ? undefined : raw.familyExtensions?.[family];
  for (const hex of Object.values(extension?.colors ?? {})) colors.push(parseHex(hex));

  return colors;
}

/**
 * Nearest palette colour, by plain Euclidean distance in sRGB.
 *
 * ## Why not luma weighting
 *
 * This is not a greyscale matcher. `palette.json` is 32 colours spread across
 * ten deliberately separated hue families — ink, wood, red, paper, amber, blue,
 * green, yellow, violet, skin — and the job here is to pick the right *family*
 * first and the right step within it second. A metric that cannot see hue
 * cannot do the first part.
 *
 * The previous implementation weighted each channel **before** squaring:
 *
 *     const db = (b - colour[2]) * 0.11;   // then db * db
 *
 * Squaring a 0.11 coefficient leaves blue contributing **1.21%** of the
 * distance. That matters because **blue is the axis that separates the warm
 * dark woods from `violet.violet-deep #3B2050`** — the two are close in red and
 * green and far apart only in blue, which is precisely the channel that had
 * been discounted to nothing.
 *
 * The result was a real defect rather than a theoretical one. `zone_parlor_shell`
 * came out with **8.48% of its pixels painted violet**: the checkerboard
 * backsplash, the doorway recess and the carpet, all of which are mid-dark warm
 * brown in the source. It went unnoticed for two batches because the earlier
 * assets' dark areas were near-black and landed on the `ink` ramp under either
 * metric.
 *
 * Worked example — backsplash tile `#500E01`:
 *
 *     candidate               weighted   euclidean
 *     #3B2050 violet-deep           15          84
 *     #4A2E1C wood-dark             19          42   ← correct
 *
 * ## Why plain Euclidean
 *
 * Chosen because it is measured, simple, and carries no tuning constants. Across
 * the shell it maps 0% of pixels to violet-deep, as does a linear-light variant;
 * plain sRGB was ruled the right one because the extra conversion buys nothing
 * measurable here and adds a step to reason about. Any coefficient reintroduced
 * in front of a channel is a thumb on the scale that will eventually pull some
 * other hue across a ramp boundary, silently, in an asset nobody is looking at.
 *
 * **Do not reintroduce luma weighting.** See `art/ASSET_PIPELINE.md §4`.
 */
export function nearest(
  palette: readonly [number, number, number][],
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  let best = palette[0]!;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const colour of palette) {
    const dr = r - colour[0];
    const dg = g - colour[1];
    const db = b - colour[2];
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

/**
 * Which family's palette an incoming file is quantized against.
 *
 * The registry is the authority, exactly as it is for the canvas — deriving the
 * family from the filename prefix would be a second, quietly divergent opinion
 * about what a `zone_` file is.
 */
function familyOf(filename: string): string {
  return assetRegistry.get(slugFromFilename(filename))?.family ?? '';
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

  /*
   * Resolved per asset, because the palette is per family now. Cached, so the
   * file is read once per family rather than once per asset — and so the log can
   * say plainly which family got more than the shared 32.
   */
  const byFamily = new Map<string, readonly [number, number, number][]>();
  const paletteFor = (family: string): readonly [number, number, number][] => {
    const cached = byFamily.get(family);
    if (cached !== undefined) return cached;
    const resolved = loadPalette(family);
    byFamily.set(family, resolved);
    return resolved;
  };

  const shared = loadPalette().length;
  console.log(`Palette: ${String(shared)} shared colours\n`);

  for (const file of files.sort()) {
    await processOne(file, paletteFor(familyOf(file)));
  }

  for (const [family, colours] of [...byFamily].sort()) {
    if (colours.length > shared) {
      console.log(
        `\n${family} used ${String(colours.length - shared)} extra colour(s) from its family extension.`,
      );
    }
  }

  // A signpost, not a stage.
  //
  // `zone_parlor_shell` carries a one-time correction that was applied to its
  // output and cannot be expressed in its source — the Tonight board sits five
  // logical units left of where the championship rail needs it, and five units
  // is 14.7 source pixels. Reprocessing reverts it.
  //
  // Running the correction from here would make it a pipeline stage, and the
  // one-source-one-output property is worth more than the convenience. So this
  // says what happened instead, and the test says it again, louder, if the
  // reverted asset is ever committed.
  if (files.some((file) => slugFromFilename(file) === 'zone_parlor_shell')) {
    console.log(
      `\nzone_parlor_shell was rewritten from source, which reverts the Tonight board.\n` +
        `  Re-apply the correction:  npx tsx scripts/shift-tonight-board.ts`,
    );
  }
}

// Only when run as a command. `nearest` is asserted directly by
// `scripts/process-art.test.ts`, and importing a module must not process the
// art batch as a side effect of loading it.
if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(`\nProcessing failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
