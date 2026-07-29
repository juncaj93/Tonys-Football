/**
 * Source preparation for batch B0.
 *
 *   npm run art:prepare
 *
 * Everything here happens **before** `art:process` — it turns the images as
 * generated into the sources the pipeline expects, and it is committed rather
 * than done by hand so the derivation is reproducible and reviewable.
 *
 * Two jobs.
 *
 * ## Cutting the room into tiles
 *
 * The environment was generated as one portrait view of the whole shop. That
 * cannot be used whole — `16 §7.1` requires discrete tiles, and a single
 * background cannot stack on a phone or be replaced a piece at a time. But the
 * pieces cut out of one room share a light direction, a horizon, and a floor
 * angle **by construction**, which is the acceptance criterion in
 * `prompts/zone_tile.md` that is hardest to hit when tiles are generated
 * separately. So one generation yields several tiles that are guaranteed to
 * agree with each other.
 *
 * The cut runs along the counter's top edge, because that is where the scene
 * has to split for Tony to stand *behind* the counter: the back of the shop is
 * drawn, then Tony, then the counter front over the top of him.
 *
 * ## Correcting Tony
 *
 * Two corrections, both agreed with the commissioner:
 *
 * - **The jersey numbers come off.** `prompts/character_tony.md` says "NO
 *   markings, NO numbers, NO logos", and that is not fussiness: a numbered
 *   blue-and-silver jersey moves toward an identifiable real team, which is
 *   the publicity-rights concern in `06 §17`. The cuff stripes and collar stay
 *   — a blue-and-silver jersey is what the spec asks for.
 * - **The background comes out.** It was generated opaque on a grey vignette.
 *   A sprite has to be a cutout or it cannot stand in a room.
 */
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

const INCOMING = path.join(process.cwd(), 'art', 'incoming');

const file = (name: string): string => path.join(INCOMING, name);

// ---------------------------------------------------------------------------
// The room
// ---------------------------------------------------------------------------

/**
 * Measured off the generated image, not guessed.
 *
 * The source is 941 × 1672. The counter's top edge — where the red laminate
 * begins — is at y = 855, and its base meets the floor at y = 1082.
 */
const ROOM = {
  source: '_source_room_portrait.png',
  width: 941,
  /** Ceiling trim, below the fluorescent panels. */
  wallTop: 185,
  /** The near edge of the counter top. Everything above is the back of the shop. */
  counterTop: 855,
  /**
   * The bottom of the counter's wood panelling, just above the base
   * moulding. The strip deliberately stops in wood rather than at the floor,
   * so the CSS surface carrying the dialogue and the receipt continues out of
   * it without a seam.
   */
  counterBase: 1055,
} as const;

async function cutRoom(): Promise<void> {
  const source = file(ROOM.source);

  // The back of the shop: mascot, menu wall, oven, boxes, case, booths, window.
  await sharp(source)
    .extract({
      left: 0,
      top: ROOM.wallTop,
      width: ROOM.width,
      height: ROOM.counterTop - ROOM.wallTop,
    })
    .png()
    .toFile(file('zone_front_counter_01.png'));

  // The counter itself, as a foreground strip drawn over Tony.
  await sharp(source)
    .extract({
      left: 0,
      top: ROOM.counterTop,
      width: ROOM.width,
      height: ROOM.counterBase - ROOM.counterTop,
    })
    .png()
    .toFile(file('zone_counter_front_01.png'));

  console.log(
    `room     → zone_front_counter (${String(ROOM.width)}×${String(ROOM.counterTop - ROOM.wallTop)})` +
      ` · zone_counter_front (${String(ROOM.width)}×${String(ROOM.counterBase - ROOM.counterTop)})`,
  );
}

// ---------------------------------------------------------------------------
// Tony
// ---------------------------------------------------------------------------

const TONY_SOURCE = '_source_tony_neutral.png';

interface Raw {
  readonly data: Buffer;
  readonly width: number;
  readonly height: number;
  readonly channels: number;
}

const at = (raw: Raw, x: number, y: number): number => (y * raw.width + x) * raw.channels;

const luminance = (r: number, g: number, b: number): number =>
  0.299 * r + 0.587 * g + 0.114 * b;

/**
 * Remove the generated backdrop.
 *
 * Connectivity as well as colour: the fill only spreads inward from the border
 * through pixels that pass `isBackdrop`, so a neutral highlight *inside* Tony
 * can never be mistaken for background just because it happens to be grey.
 *
 * A one-pixel halo survives along the anti-aliased edge. That is deliberate —
 * eroding it would eat the outline, and at the shipped canvas of 32 × 48 a
 * pixel of a 941-wide source is well under a tenth of a pixel.
 */
function keyOutBackground(raw: Raw): number {
  const { width, height, channels } = raw;
  const count = width * height;

  const lum = new Float32Array(count);
  for (let p = 0; p < count; p++) {
    const i = p * channels;
    lum[p] = luminance(raw.data[i]!, raw.data[i + 1]!, raw.data[i + 2]!);
  }

  // --- Where the image has a hard edge ------------------------------------
  // The backdrop is smooth everywhere — a grey vignette at the frame edges
  // that warms to brown behind Tony's head. Tony is drawn with an enclosing
  // outline. Smoothness is therefore the only signal that separates them:
  // colour does not, because the brown haze (saturation 51) sits in the same
  // range as his shoes and hair, and the grey (saturation 0-10) sits in the
  // same range as his trousers.
  const blocked = new Uint8Array(count);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const here = lum[p]!;
      let steepest = 0;
      if (x > 0) steepest = Math.max(steepest, Math.abs(here - lum[p - 1]!));
      if (x < width - 1) steepest = Math.max(steepest, Math.abs(here - lum[p + 1]!));
      if (y > 0) steepest = Math.max(steepest, Math.abs(here - lum[p - width]!));
      if (y < height - 1) steepest = Math.max(steepest, Math.abs(here - lum[p + width]!));
      if (steepest > EDGE) blocked[p] = 1;
    }
  }

  // Seal pin-holes where the outline's contrast dips, so the fill cannot leak
  // through a single soft pixel and flood him from the inside.
  const sealed = morph(morph(blocked, width, height, 2, 'dilate'), width, height, 1, 'erode');

  // --- Flood the smooth outside -------------------------------------------
  const reachable = new Uint8Array(count);
  const stack: number[] = [];

  const push = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (reachable[p] === 1 || sealed[p] === 1) return;
    reachable[p] = 1;
    stack.push(x, y);
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }

  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  // The blocked ring itself is background where it touches the reachable side.
  // Grow the cleared region one pixel into it so no smooth halo survives. One,
  // not three: three eats thin features like the welt of a shoe, and at the
  // shipped canvas of 32 x 48 a single pixel of a 941-wide source is invisible
  // either way.
  const grown = morph(reachable, width, height, 1, 'dilate');

  let cleared = 0;
  for (let p = 0; p < count; p++) {
    if (grown[p] === 1) {
      raw.data[p * channels + 3] = 0;
      cleared++;
    }
  }
  return cleared;
}

const EDGE = 6;

/** Square-kernel dilate or erode, separable for speed. */
function morph(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number,
  mode: 'dilate' | 'erode',
): Uint8Array {
  const hit = mode === 'dilate' ? 1 : 0;
  const pass = (input: Uint8Array, horizontal: boolean): Uint8Array => {
    const output = new Uint8Array(input.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let found = false;
        for (let d = -radius; d <= radius && !found; d++) {
          const nx = horizontal ? x + d : x;
          const ny = horizontal ? y : y + d;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (input[ny * width + nx] === hit) found = true;
        }
        output[y * width + x] = found ? hit : 1 - hit;
      }
    }
    return output;
  };

  return pass(pass(mask, true), false);
}

const isJerseyBlue = (r: number, g: number, b: number): boolean =>
  b > 110 && b - r > 45 && b > g;

const isLight = (r: number, g: number, b: number): boolean =>
  Math.min(r, g, b) > 140 && Math.max(r, g, b) - Math.min(r, g, b) < 70;

/**
 * Take the numbers off the jersey, leaving the stripes and collar.
 *
 * Light marks on the jersey are found, grouped, and judged by shape. A number
 * is a compact blob; a cuff stripe is long and thin; the collar is a wide arc.
 * Only blobs are painted out, with the blue immediately around them.
 *
 * Shape is the discriminator rather than position because position would have
 * to be re-measured for every regeneration, and the sleeve and chest numbers
 * sit at different heights.
 */
function removeJerseyNumbers(raw: Raw): number {
  const { width, height } = raw;
  const candidate = new Uint8Array(width * height);

  // A light pixel counts only if it sits in jersey territory — measured by how
  // much blue surrounds it — so the apron and the paper hat are never touched.
  const R = 18;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = at(raw, x, y);
      if (raw.data[i + 3]! === 0) continue;
      if (!isLight(raw.data[i]!, raw.data[i + 1]!, raw.data[i + 2]!)) continue;

      let blue = 0;
      let seen = 0;
      for (let dy = -R; dy <= R; dy += 6) {
        for (let dx = -R; dx <= R; dx += 6) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = at(raw, nx, ny);
          seen++;
          if (isJerseyBlue(raw.data[j]!, raw.data[j + 1]!, raw.data[j + 2]!)) blue++;
        }
      }
      if (seen > 0 && blue / seen > 0.3) candidate[y * width + x] = 1;
    }
  }

  // Group the candidates and judge each group by its shape.
  const seenPixel = new Uint8Array(width * height);
  let painted = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (candidate[start] !== 1 || seenPixel[start] === 1) continue;

      const group: number[] = [];
      const stack = [x, y];
      seenPixel[start] = 1;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;

      while (stack.length > 0) {
        const cy = stack.pop()!;
        const cx = stack.pop()!;
        group.push(cx, cy);
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);

        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const p = ny * width + nx;
          if (candidate[p] !== 1 || seenPixel[p] === 1) continue;
          seenPixel[p] = 1;
          stack.push(nx, ny);
        }
      }

      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      const area = group.length / 2;
      const ratio = w / h;

      // Blobs only. Stripes and the collar are much wider than they are tall.
      const isNumber = area > 300 && area < 60_000 && ratio > 0.25 && ratio < 3.2;
      if (!isNumber) continue;

      // Paint with the blue found just outside the group's box, so the fill
      // matches the shading it lands in rather than a flat swatch.
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let sy = Math.max(0, minY - 6); sy <= Math.min(height - 1, maxY + 6); sy++) {
        for (let sx = Math.max(0, minX - 6); sx <= Math.min(width - 1, maxX + 6); sx++) {
          const j = at(raw, sx, sy);
          if (!isJerseyBlue(raw.data[j]!, raw.data[j + 1]!, raw.data[j + 2]!)) continue;
          r += raw.data[j]!;
          g += raw.data[j + 1]!;
          b += raw.data[j + 2]!;
          n++;
        }
      }
      if (n === 0) continue;

      for (let k = 0; k < group.length; k += 2) {
        const j = at(raw, group[k]!, group[k + 1]!);
        raw.data[j] = Math.round(r / n);
        raw.data[j + 1] = Math.round(g / n);
        raw.data[j + 2] = Math.round(b / n);
      }
      painted++;
    }
  }

  return painted;
}

async function correctTony(): Promise<void> {
  const { data, info } = await sharp(file(TONY_SOURCE))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const raw: Raw = {
    data: Buffer.from(data),
    width: info.width,
    height: info.height,
    channels: info.channels,
  };

  const cleared = keyOutBackground(raw);
  const painted = removeJerseyNumbers(raw);

  await sharp(raw.data, {
    raw: { width: raw.width, height: raw.height, channels: raw.channels as 1 | 2 | 3 | 4 },
  })
    .png()
    .toFile(file('character_tony_neutral_01.png'));

  console.log(
    `tony     → background keyed (${String(Math.round((cleared / (raw.width * raw.height)) * 100))}% cleared)` +
      ` · ${String(painted)} jersey marking${painted === 1 ? '' : 's'} painted out`,
  );
}

// ---------------------------------------------------------------------------

function stashOriginal(generated: string, kept: string): void {
  if (existsSync(file(kept))) return;
  if (!existsSync(file(generated))) {
    throw new Error(`Expected ${generated} in art/incoming/.`);
  }
  renameSync(file(generated), file(kept));
}

async function main(): Promise<void> {
  mkdirSync(INCOMING, { recursive: true });

  // Keep the generated originals under `_source_` names. They are the only copy
  // of the pre-derivation image, and the pipeline skips anything so prefixed.
  stashOriginal('zone_front_counter_01.png', ROOM.source);
  stashOriginal('character_tony_neutral_01.png', TONY_SOURCE);

  await cutRoom();
  await correctTony();

  console.log('\nNow run: npm run art:process');
}

main().catch((error: unknown) => {
  console.error(`\nPreparation failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
