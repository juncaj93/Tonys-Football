import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

import { CANVAS } from '../lib/character/art/geometry';
import {
  BODY_HEAD_SLUG,
  STYLE_TRAITS,
} from '../lib/character/catalog';
import {
  composeCharacter,
  compositeRuns,
  type CharacterConfiguration,
} from '../lib/character/composite';
import {
  MASK_CANVAS,
  TRANSPARENT_KEY,
  encodeMask,
  maskToneGrid,
  paintedKeys,
  validateBuildMask,
  type EncodedMask,
} from '../lib/character/mask';
import { SKIN_TONES, TOP_COLOURS } from '../lib/character/palette';

/**
 * Turn delivered manager artwork into a validated role mask — `npm run art:mask`.
 *
 * ```
 * npm run art:mask -- art/incoming/manager_build_tshirt.png avatar_body_starter_04
 * ```
 *
 * ## The honest shape of the workflow
 *
 * An image generator cannot emit an exact machine-readable encoding. Pretending
 * otherwise is how a batch arrives "correct" and is quietly wrong — the failure
 * `art/ASSET_PIPELINE.md §9` catalogues over and over. So the workflow is three
 * steps and the middle one is **deterministic**, not generative:
 *
 * ```
 * painted concept (672 x 1008, 14 colours)
 *      ↓  block mode  — the most common colour in each 6 x 6 block
 *      ↓  snap        — nearest of the fourteen keys, plain Euclidean sRGB
 *   role mask (112 x 168, exactly fourteen colours)
 *      ↓  validate    — registration, outline, coverage, head clearance
 *   lib/character/art/masks/<slug>.ts
 * ```
 *
 * **Block mode rather than nearest-neighbour**, and the difference matters:
 * nearest samples one pixel of each block, so a single stray anti-aliased pixel
 * at the sample point becomes the whole block. Mode takes the majority, which is
 * what makes a hand-painted 6× image survive the trip down.
 *
 * **The snap distance is reported, and it is the honest measure of whether the
 * art was actually painted to the palette.** A file whose pixels average two or
 * three units from a key was painted in the palette; one averaging forty was
 * painted in something else and the mask is this script's guess about what the
 * artist meant. `docs/art/MANAGER_BUILD_TSHIRT_BRIEF.md` says so in the brief,
 * because the number is only useful if somebody is expecting it.
 *
 * ## Nothing is written unless everything passes
 *
 * `ART_SPEC §9`: a layer that does not land on its anchor is regenerated, and the
 * renderer is never adjusted to compensate. A validator that wrote a "mostly
 * fine" mask would be the renderer adjusting to compensate, one step earlier.
 */

const MASKS = path.join(process.cwd(), 'lib', 'character', 'art', 'masks');
const EVIDENCE = path.join(process.cwd(), 'docs', 'evidence', 'manager-build-prototype');

export interface Snapped {
  readonly keys: readonly number[];
  /**
   * How far the delivered pixels sat from the nearest key, over the **source**.
   *
   * A histogram rather than the raw list: a 1024 x 1536 delivery is 1.5M pixels,
   * and the summary is the only part anybody reads. Buckets are integer sRGB
   * distance, so `p99` and `max` are exact rather than estimated.
   */
  readonly drift: { readonly mean: number; readonly p99: number; readonly max: number };
  readonly softAlpha: number;
  readonly factor: number;
}

/** Nearest key by plain Euclidean sRGB — the metric `ASSET_PIPELINE §4` ruled on. */
export function nearestKey(r: number, g: number, b: number): { index: number; distance: number } {
  let best = TRANSPARENT_KEY;
  let bestDistance = Infinity;
  for (const key of paintedKeys()) {
    const kr = parseInt(key.hex.slice(1, 3), 16);
    const kg = parseInt(key.hex.slice(3, 5), 16);
    const kb = parseInt(key.hex.slice(5, 7), 16);
    const distance = (r - kr) ** 2 + (g - kg) ** 2 + (b - kb) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = key.index;
    }
  }
  return { index: best, distance: Math.sqrt(bestDistance) };
}

/**
 * How far the source's aspect may sit from the canvas's before it is a stretch.
 *
 * 1% of `112 : 168`. Generous enough for a generator that rounds its own output
 * to a round number, tight enough that a figure squashed to fit is refused —
 * because unstretching one means resampling it, and a resampled build no longer
 * has one art pixel to one room unit, which is the whole density rule.
 */
const ASPECT_TOLERANCE = 0.01;

/**
 * Read a delivered file into role indices.
 *
 * ## Revision 2 — any source size, because the operator is mode and not average
 *
 * The first version demanded a whole multiple of `112 × 168` and round 1 died on
 * that gate before anything about the drawing was measured. The requirement came
 * from a real fear — resampling blends two key colours into a third, and the snap
 * then invents a role — but it was solving that fear with a rule rather than with
 * the arithmetic.
 *
 * The order of operations is what actually removes it:
 *
 * 1. **Snap first, at source resolution.** Every source pixel becomes a role
 *    index. Nothing is averaged, so no colour between two keys is ever created.
 * 2. **Then take the majority** of the source cell that maps to each output pixel.
 *
 * Mode is the correct operator for indexed data and average is simply wrong for
 * it: averaging skin base with garment base gives a tan that snaps to *boot
 * light*, which would put bootlaces in the middle of a sleeve. With mode, an
 * output pixel is always a role some source pixel actually carried.
 *
 * This is a **strict generalisation** — a correctly painted 6× file still decodes
 * to exactly what it was painted as, byte for byte, because each cell is uniform
 * and the mode of a uniform cell is that value. `manager-mask.test.ts` asserts it
 * at 6×, at 9.14× and at 1×.
 *
 * **It cannot hide a malformed asset.** It changes only how the file is read, and
 * every registration check runs afterwards on the result.
 */
export async function snap(file: string): Promise<Snapped> {
  const image = sharp(file).ensureAlpha();
  const { width, height } = await image.metadata();
  if (width === undefined || height === undefined) throw new Error(`${file}: unreadable`);

  if (width < MASK_CANVAS.width || height < MASK_CANVAS.height) {
    throw new Error(
      `${file} is ${String(width)} x ${String(height)}, smaller than the ` +
        `${String(MASK_CANVAS.width)} x ${String(MASK_CANVAS.height)} canvas. Upscaling invents ` +
        'pixels nobody painted.',
    );
  }

  const wanted = MASK_CANVAS.width / MASK_CANVAS.height;
  const got = width / height;
  if (Math.abs(got - wanted) / wanted > ASPECT_TOLERANCE) {
    throw new Error(
      `${file} is ${String(width)} x ${String(height)}, an aspect of ${got.toFixed(3)} against the ` +
        `canvas's ${wanted.toFixed(3)}. Squeezing it to fit would stretch the figure, and a ` +
        'stretched figure cannot be unstretched. Re-render at that aspect — 672 x 1008 or ' +
        '1024 x 1536 both work.',
    );
  }

  const { data } = await image.raw().toBuffer({ resolveWithObject: true });

  /*
   * Pass 1 — snap every source pixel, memoised. A 1024 × 1536 file is 1.5M
   * pixels against at most a few thousand distinct colours, so the cache turns
   * the expensive part into a rounding error.
   */
  const seen = new Map<number, { index: number; distance: number }>();
  const sourceKey = new Int8Array(width * height);
  const histogram = new Float64Array(442);
  let measured = 0;
  let softAlpha = 0;

  for (let at = 0; at < width * height; at++) {
    const i = at * 4;
    const alpha = data[i + 3]!;
    if (alpha > 0 && alpha < 255) softAlpha++;
    if (alpha < 128) {
      sourceKey[at] = TRANSPARENT_KEY;
      continue;
    }
    const rgb = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
    let hit = seen.get(rgb);
    if (hit === undefined) {
      hit = nearestKey(data[i]!, data[i + 1]!, data[i + 2]!);
      seen.set(rgb, hit);
    }
    sourceKey[at] = hit.index;
    histogram[Math.min(441, Math.round(hit.distance))]! += 1;
    measured++;
  }

  let total = 0;
  let max = 0;
  for (let d = 0; d < histogram.length; d++) {
    total += d * histogram[d]!;
    if (histogram[d]! > 0) max = d;
  }
  let seenSoFar = 0;
  let p99 = 0;
  for (let d = 0; d < histogram.length; d++) {
    seenSoFar += histogram[d]!;
    if (seenSoFar >= measured * 0.99) {
      p99 = d;
      break;
    }
  }
  const drift = { mean: measured === 0 ? 0 : total / measured, p99, max };

  // Pass 2 — the majority role of the source cell under each output pixel.
  const keys: number[] = [];
  for (let y = 0; y < MASK_CANVAS.height; y++) {
    const y0 = Math.floor((y * height) / MASK_CANVAS.height);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / MASK_CANVAS.height));
    for (let x = 0; x < MASK_CANVAS.width; x++) {
      const x0 = Math.floor((x * width) / MASK_CANVAS.width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / MASK_CANVAS.width));

      const votes = new Map<number, number>();
      let cells = 0;
      let clear = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          cells++;
          const key = sourceKey[sy * width + sx]!;
          if (key === TRANSPARENT_KEY) {
            clear++;
            continue;
          }
          votes.set(key, (votes.get(key) ?? 0) + 1);
        }
      }

      // Transparency wins a tie: a figure eroded by one pixel is a smaller
      // figure, and one grown by a pixel has a halo of the wall behind it.
      if (clear * 2 >= cells) {
        keys.push(TRANSPARENT_KEY);
        continue;
      }

      let winner = TRANSPARENT_KEY;
      let most = 0;
      for (const [key, count] of votes) {
        if (count > most) {
          most = count;
          winner = key;
        }
      }
      keys.push(winner);
    }
  }

  return { keys, drift, softAlpha, factor: width / MASK_CANVAS.width };
}

/** A picture of the mask as four real managers, so a person can judge it. */
async function preview(slug: string, mask: EncodedMask): Promise<Buffer> {
  const topIndex = STYLE_TRAITS.top.findIndex((option) => option.slug === slug);
  const shown: CharacterConfiguration[] = [
    { skin: 0, hair: 0, hairColour: 2, facialHair: 0, top: topIndex, topColour: 1 },
    { skin: 1, hair: 2, hairColour: 0, facialHair: 4, top: topIndex, topColour: 0 },
    { skin: 2, hair: 4, hairColour: 6, facialHair: 1, top: topIndex, topColour: 4 },
    { skin: 3, hair: 5, hairColour: 1, facialHair: 3, top: topIndex, topColour: 6 },
  ];

  const scale = 3;
  const { width, height } = CANVAS;
  const tiles = await Promise.all(
    shown.map(async (configuration, at) => {
      const rgba = Buffer.alloc(width * height * 4, 0);
      for (const run of compositeRuns(composeCharacter(configuration))) {
        const r = parseInt(run.value.slice(1, 3), 16);
        const g = parseInt(run.value.slice(3, 5), 16);
        const b = parseInt(run.value.slice(5, 7), 16);
        for (let y = run.y; y < run.y + run.h; y++) {
          for (let x = run.x; x < run.x + run.w; x++) {
            const i = (y * width + x) * 4;
            rgba[i] = r;
            rgba[i + 1] = g;
            rgba[i + 2] = b;
            rgba[i + 3] = 255;
          }
        }
      }
      return {
        input: await sharp(rgba, { raw: { width, height, channels: 4 } })
          .resize(width * scale, height * scale, { kernel: 'nearest' })
          .png()
          .toBuffer(),
        left: at * width * scale,
        top: 0,
      };
    }),
  );

  void mask;
  return sharp({
    create: {
      width: width * shown.length * scale,
      height: height * scale,
      channels: 4,
      background: { r: 46, g: 34, b: 38, alpha: 1 },
    },
  })
    .composite(tiles)
    .png()
    .toBuffer();
}

function moduleSource(slug: string, mask: EncodedMask): string {
  const constant = slug.toUpperCase();
  return `import { type EncodedMask } from '../../mask';

/**
 * GENERATED by \`npm run art:mask\`. **Do not edit.**
 *
 * The painted build for \`${slug}\`, as role indices into \`MASK_KEYS\`. Regenerate
 * from the delivered PNG rather than touching a run: every entry here was checked
 * by the validator, and a hand-edited one has not been.
 */
export const ${constant}: EncodedMask = {
  slug: '${slug}',
  width: ${String(mask.width)},
  height: ${String(mask.height)},
  rle:
    '${mask.rle}',
};
`;
}

async function main(): Promise<void> {
  const [file, slug] = process.argv.slice(2);
  if (file === undefined || slug === undefined) {
    throw new Error('usage: npm run art:mask -- <file.png> <slug>');
  }
  if (slug === BODY_HEAD_SLUG) {
    throw new Error(
      `${BODY_HEAD_SLUG} is the head plate, not a build. It is drawn, and painting it is a ` +
        'separate authorised step — the prototype covers one T-shirt build only.',
    );
  }
  if (!STYLE_TRAITS.top.some((option) => option.slug === slug)) {
    throw new Error(
      `${slug} is not one of the six tops. A build mask takes over a top's slug so that the ` +
        'stored integer keeps meaning what it meant.',
    );
  }

  const { keys, drift, softAlpha, factor } = await snap(file);

  const painted = keys.filter((key) => key !== TRANSPARENT_KEY).length;

  console.log(`\n${path.basename(file)} → ${slug}`);
  console.log(`  source              ${factor.toFixed(2)}x the canvas`);
  console.log(`  painted             ${String(painted)} of ${String(keys.length)} cells`);
  console.log(
    `  snap distance       mean ${drift.mean.toFixed(1)} · p99 ${String(drift.p99)} ` +
      `· max ${String(drift.max)}`,
  );
  if (softAlpha > 0) console.log(`  soft alpha          ${String(softAlpha)} source pixels`);

  if (drift.mean > 12) {
    console.log(
      '\n  ⚠ The art was not painted in the fourteen key colours. Every pixel below has been ' +
        '\n    snapped to the nearest one, which means this mask is a guess about what was meant.' +
        '\n    Repaint against art/jigs/manager_registration_jig@6x.png rather than shipping it.',
    );
  }

  const problems = validateBuildMask(keys);
  for (const problem of problems) {
    console.log(`  ${problem.severity === 'fail' ? '✗' : '⚠'} ${problem.message}`);
  }

  if (problems.some((problem) => problem.severity === 'fail')) {
    throw new Error(
      `${String(problems.filter((problem) => problem.severity === 'fail').length)} registration ` +
        'failures. Nothing was written — regenerate the art; the renderer is never adjusted to ' +
        'compensate (ART_SPEC §9).',
    );
  }

  const mask = encodeMask(slug, keys);
  // Proves the encoding round-trips before it is committed, rather than at import.
  maskToneGrid(mask);

  mkdirSync(MASKS, { recursive: true });
  writeFileSync(path.join(MASKS, `${slug}.ts`), moduleSource(slug, mask));

  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(path.join(EVIDENCE, `${slug}-mask.png`), await preview(slug, mask));

  console.log(`\n  → lib/character/art/masks/${slug}.ts`);
  console.log(`  → docs/evidence/manager-build-prototype/${slug}-mask.png`);
  console.log(
    `\n  Register it: import it into lib/character/art/masks/index.ts and add it to BUILD_MASKS.` +
      `\n  The preview above shows the drawn path until you do — that is the switch working.` +
      `\n  ${String(SKIN_TONES.length)} skin tones x ${String(TOP_COLOURS.length)} top colours all ` +
      'come from this one file.\n',
  );
}

// Only when run as a command. `snap` and `nearestKey` are asserted directly by
// `scripts/manager-mask.test.ts`, and importing this module must not write a
// mask as a side effect of loading it.
if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(`\nMask failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
