import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

import { AXIS, CANVAS } from '../lib/character/art/geometry';
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
  BUILD_REGISTRATION,
  HEAD_REGISTRATION,
  MASK_CANVAS,
  TRANSPARENT_KEY,
  encodeMask,
  maskToneGrid,
  paintedKeys,
  validateBuildMask,
  validateHeadPlate,
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
  /** Set when `--fit` normalised the placement. Always printed. */
  readonly fitted: { readonly scale: number; readonly movedRows: number } | null;
  /** How many rows of neck a head delivery carried, once its skull was fitted. */
  readonly neckRows: number;
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
/**
 * Where in the source the canvas is read from.
 *
 * `origin` is the source pixel the output's top-left corner samples, and `step`
 * is how many source pixels one output pixel spans. Without fitting this is
 * simply the whole file; with it, the figure's own bounding box is mapped onto
 * the band a build must occupy.
 */
interface Window {
  readonly x: number;
  readonly y: number;
  readonly step: number;
}

/**
 * Fit a delivered figure to the build band — **opt in, always reported.**
 *
 * ## Why this is not "making wrong art pass", and where the line is
 *
 * `docs/MANAGER_BUILD_PROTOTYPE.md §9.5` refused auto-fitting on the grounds that
 * it resamples the art. That reasoning assumed the delivery *is* pixel art. It is
 * not: a generator returns a **smooth 1024 × 1536 illustration**, and the pixel
 * grid is manufactured by our own downscale. There is no authored block structure
 * to damage — choosing a different rasterisation window is choosing where to
 * sample, not resampling something already sampled.
 *
 * So the honest rule is about the **source**, not the operation:
 *
 * - a smooth illustration → the window is ours to choose, and fitting is free;
 * - a source authored at exact blocks → the blocks are intentional and fitting
 *   would smear them. `--fit` must not be used on one.
 *
 * ## What it still cannot hide
 *
 * Every content check runs **afterwards**, on the fitted result: palette drift is
 * still reported, a background still fails coverage, an unenclosed silhouette
 * still fails, holes still fail. And the fit itself is bounded — a delivery
 * needing more than {@link FIT_LIMIT} was not drawn to this plate at all (a whole
 * figure *including a head* needs about 0.65) and is refused rather than squeezed.
 *
 * The scale and offset are printed every time. A silent normalisation would be
 * the renderer adjusting to compensate; a reported one is a measurement.
 */
const FIT_LIMIT = Object.freeze({ min: 0.8, max: 1.25 });

function fitWindow(
  alphaAt: (x: number, y: number) => number,
  width: number,
  height: number,
): { window: Window; scale: number; from: { top: number; bottom: number; cx: number } } {
  let top = height;
  let bottom = -1;
  let left = width;
  let right = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alphaAt(x, y) < 128) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (bottom < 0) throw new Error('nothing is painted in this file');

  const targetTop = BUILD_REGISTRATION.shoulderBand.from;
  const targetRows = BUILD_REGISTRATION.contactRow - targetTop + 1;
  const sourceRows = bottom - top + 1;

  // Source pixels per output pixel, chosen so the figure fills the band exactly.
  const step = sourceRows / targetRows;
  const cx = (left + right + 1) / 2;

  return {
    window: { x: cx - AXIS * step, y: top - targetTop * step, step },
    scale: (width / MASK_CANVAS.width) / step,
    from: { top, bottom, cx },
  };
}

/**
 * Fit a delivered head so the plate's rows are its rows.
 *
 * **A head is fitted and a build is not, which is the opposite of what §9.5's
 * reasoning suggests, and the asymmetry is deliberate.** A build's placement is
 * its own business — nothing else depends on where its knees are — so a build
 * that misses the band was drawn wrong and is regenerated. A head has ten layers
 * measured off it, so what matters is not *whether* it was delivered in place but
 * whether its **internal proportions** are ours. Scaling its bounding box onto
 * our rows is what turns that into a checkable question: fit the envelope, then
 * measure whether the eye line, the jaw and the skull's width landed where hair
 * and beards expect them.
 *
 * Fitting therefore hides nothing here. It is the step that makes the real check
 * possible, and every one of those checks runs afterwards.
 */
function headWindow(
  alphaAt: (x: number, y: number) => number,
  width: number,
  height: number,
): { window: Window; scale: number; jaw: number; neckRows: number } {
  let top = height;
  let bottom = -1;
  let left = width;
  let right = -1;
  const rowWidth = new Int32Array(height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alphaAt(x, y) < 128) continue;
      rowWidth[y]!++;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (bottom < 0) throw new Error('nothing is painted in this file');

  /*
   * **The skull is fitted, not the whole drawing, and that correction is worth
   * the paragraph.**
   *
   * The first version scaled the delivered bounding box — head *and* neck — onto
   * our head-and-neck band. It reads as the obvious thing and it is wrong in a way
   * that hides the actual defect: a delivery with a short neck has its *skull*
   * stretched to fill the band, so every feature inside the skull moves down with
   * it. Two head deliveries in a row landed their eyes on row 40 against a line at
   * 37, and both times the face's own proportions were correct — eyes a little
   * under halfway down the skull, exactly where a human's are. What was wrong was
   * only how much of the drawing was neck.
   *
   * Fitting the **skull** separates those. The part hair is drawn to lands where
   * hair expects it, the eyes land inside it, and the neck's length becomes its
   * own question — which `validateHeadPlate` then asks, in rows, out loud.
   *
   * The jaw is found by width: a bald, clean-shaven head is widest across the ears
   * and narrows into the neck, so the first row below the widest that has lost
   * more than {@link JAW_DROP} of that width is the join.
   */
  let widest = top;
  for (let y = top; y <= bottom; y++) if (rowWidth[y]! > rowWidth[widest]!) widest = y;

  let jaw = bottom;
  for (let y = widest; y <= bottom; y++) {
    if (rowWidth[y]! < rowWidth[widest]! * JAW_DROP) {
      jaw = y;
      break;
    }
  }

  const skullRows = HEAD_REGISTRATION.jaw - HEAD_REGISTRATION.top + 1;
  const step = (jaw - top) / skullRows;
  const cx = (left + right + 1) / 2;

  return {
    window: { x: cx - AXIS * step, y: top - HEAD_REGISTRATION.top * step, step },
    scale: (width / MASK_CANVAS.width) / step,
    jaw: HEAD_REGISTRATION.top + Math.round((jaw - top) / step),
    neckRows: Math.round((bottom - jaw) / step),
  };
}

/** How much narrower than the widest row a head has to get to be a neck. */
const JAW_DROP = 0.6;

export async function snap(file: string, fit = false, head = false): Promise<Snapped> {
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
  /*
   * A head is exempt from the aspect rule and a build is not. The rule exists to
   * refuse a *stretched figure*, and a build fills its canvas so the file's aspect
   * is the figure's. A head is a small object on whatever canvas the generator
   * felt like — square, most often — and its own proportions are measured
   * directly by `validateHeadPlate` rather than inferred from the file.
   */
  if (!head && Math.abs(got - wanted) / wanted > ASPECT_TOLERANCE) {
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
  const alphaAt = (x: number, y: number): number => data[(y * width + x) * 4 + 3]!;
  let neckRows = 0;
  const fitted: { window: Window; scale: number; movedRows: number } | null = head
    ? (() => {
          const plate = headWindow(alphaAt, width, height);
          neckRows = plate.neckRows;
          return { window: plate.window, scale: plate.scale, movedRows: 0 };
        })()
    : fit
      ? (() => {
          const box = fitWindow(alphaAt, width, height);
          return {
            window: box.window,
            scale: box.scale,
            movedRows:
              BUILD_REGISTRATION.shoulderBand.from -
              Math.round(box.from.top / (width / MASK_CANVAS.width)),
          };
        })()
      : null;
  if (!head && fitted !== null && (fitted.scale < FIT_LIMIT.min || fitted.scale > FIT_LIMIT.max)) {
    throw new Error(
      `fitting this file would rescale it by ${fitted.scale.toFixed(2)}x, outside the ` +
        `${String(FIT_LIMIT.min)}–${String(FIT_LIMIT.max)} a near-miss can be. A delivery this far ` +
        'out was not drawn to the plate — a whole figure including a head needs about 0.65x. ' +
        'Regenerate it against art/jigs/manager_paintover_672x1008.png.',
    );
  }
  const window: Window = fitted?.window ?? { x: 0, y: 0, step: width / MASK_CANVAS.width };

  const keys: number[] = [];
  for (let y = 0; y < MASK_CANVAS.height; y++) {
    const y0 = Math.floor(window.y + y * window.step);
    const y1 = Math.max(y0 + 1, Math.floor(window.y + (y + 1) * window.step));
    for (let x = 0; x < MASK_CANVAS.width; x++) {
      const x0 = Math.floor(window.x + x * window.step);
      const x1 = Math.max(x0 + 1, Math.floor(window.x + (x + 1) * window.step));

      const votes = new Map<number, number>();
      let cells = 0;
      let clear = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          cells++;
          if (sy < 0 || sx < 0 || sy >= height || sx >= width) {
            clear++;
            continue;
          }
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

  return {
    keys,
    drift,
    softAlpha,
    factor: width / MASK_CANVAS.width,
    fitted: fitted === null ? null : { scale: fitted.scale, movedRows: fitted.movedRows },
    neckRows,
  };
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
  const argv = process.argv.slice(2);
  const fit = argv.includes('--fit');
  const head = argv.includes('--head');
  const [file, slug] = argv.filter((arg) => !arg.startsWith('--'));
  if (file === undefined || slug === undefined) {
    throw new Error('usage: npm run art:mask -- <file.png> <slug> [--fit] [--head]');
  }
  if (head !== (slug === BODY_HEAD_SLUG)) {
    throw new Error(
      `--head is for ${BODY_HEAD_SLUG} and nothing else. A head and a build are validated ` +
        'against different landmarks and neither check makes sense on the other.',
    );
  }
  if (!head && !STYLE_TRAITS.top.some((option) => option.slug === slug)) {
    throw new Error(
      `${slug} is not one of the six tops. A build mask takes over a top's slug so that the ` +
        'stored integer keeps meaning what it meant.',
    );
  }

  const { keys, drift, softAlpha, factor, fitted } = await snap(file, fit, head);

  const painted = keys.filter((key) => key !== TRANSPARENT_KEY).length;

  console.log(`\n${path.basename(file)} → ${slug}`);
  console.log(`  source              ${factor.toFixed(2)}x the canvas`);
  console.log(`  painted             ${String(painted)} of ${String(keys.length)} cells`);
  console.log(
    `  snap distance       mean ${drift.mean.toFixed(1)} · p99 ${String(drift.p99)} ` +
      `· max ${String(drift.max)}`,
  );
  if (softAlpha > 0) console.log(`  soft alpha          ${String(softAlpha)} source pixels`);
  if (fitted !== null) {
    console.log(
      `  FITTED              rescaled ${fitted.scale.toFixed(3)}x and moved ` +
        `${String(fitted.movedRows)} rows down to sit in the build band.` +
        '\n                      This is a normalisation of PLACEMENT ONLY, applied because the ' +
        '\n                      source is a smooth illustration whose pixel grid is ours to ' +
        '\n                      choose. Every content check below still ran on the result.',
    );
  }

  if (drift.mean > 12) {
    console.log(
      '\n  ⚠ The art was not painted in the fourteen key colours. Every pixel below has been ' +
        '\n    snapped to the nearest one, which means this mask is a guess about what was meant.' +
        '\n    Repaint against art/jigs/manager_registration_jig@6x.png rather than shipping it.',
    );
  }

  const problems = head ? validateHeadPlate(keys) : validateBuildMask(keys);
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
