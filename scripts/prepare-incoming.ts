/**
 * Normalize a generated image into a source the pipeline can actually consume.
 *
 *   npm run art:prepare-incoming -- <file.png> --slug collectible_coffee_mug
 *   npm run art:prepare-incoming -- sheet.png --slug X --crop 164,265,215,207 --key-background
 *
 * ## Why this exists
 *
 * `scripts/process-art.ts` does exactly one thing to geometry: it resizes the
 * **whole source frame** onto the declared canvas with `fit: 'fill'`. It does
 * not trim, does not centre, and does not anchor. That is deliberate — the
 * canvas is authoritative and a silent auto-crop would hide a wrongly-framed
 * source until it appeared on the shelf.
 *
 * The consequence, measured across two batches of generated candidates: **not
 * one arrived usable.** Every one was either non-square against a square target
 * (which `fit: 'fill'` visibly squashes), or left the object floating 3–30% of
 * the frame above the bottom edge, which lands in `validate-collectible.ts` as
 * *"does not touch the bottom row"* — the anchor rule that makes a collectible
 * stand on the tray instead of hovering over it.
 *
 * Asking a generator to produce a pixel-exact bottom-anchored square frame is
 * asking it for the one thing it is worst at. Commissioner, 2026-08-03: *"If
 * `art/process-art.ts` cannot safely normalize common framing issues, improve
 * the preprocessing workflow rather than repeatedly requiring perfectly cropped
 * source generations. Content defects still require editing or regeneration.
 * Framing defects should generally be handled mechanically."*
 *
 * So framing is mechanical and lives here, **before** `art:process`, as a
 * separate committed step rather than a hidden stage inside it. One source, one
 * output, still a pure function — just with an explicit normalization in front.
 *
 * ## What it does, and what it refuses to do
 *
 * It corrects **framing**: crop, background, aspect, centring, anchor, debris.
 * It corrects **nothing about content** — it will not remove text, redraw a
 * silhouette, or fix a wrong subject. Those are regeneration, by design.
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

import { assetRegistry } from '@/lib/assets/registry';

const INCOMING = path.join(process.cwd(), 'art', 'incoming');

/** The pipeline hardens alpha at this threshold; match it so framing agrees. */
const ALPHA_THRESHOLD = 128;

interface Raw {
  readonly data: Buffer;
  readonly width: number;
  readonly height: number;
  readonly channels: number;
}

const at = (raw: Raw, x: number, y: number): number => (y * raw.width + x) * raw.channels;

const luminance = (r: number, g: number, b: number): number => 0.299 * r + 0.587 * g + 0.114 * b;

/** Square-kernel dilate or erode, separable. Shared with `prepare-b0.ts`. */
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

/**
 * Clear a painted backdrop.
 *
 * Connectivity **and** hardness, never colour: the fill spreads inward from the
 * border only through pixels with no steep luminance step, so a highlight inside
 * the object cannot be mistaken for background because it happens to be pale,
 * and a smooth vignette or glow *around* the object is cleared even though it is
 * the object's own hue. Generated sheets put both in the same image.
 */
function keyOutBackground(raw: Raw, edge = 6): number {
  const { width, height, channels } = raw;
  const count = width * height;

  const lum = new Float32Array(count);
  for (let p = 0; p < count; p++) {
    const i = p * channels;
    lum[p] = luminance(raw.data[i]!, raw.data[i + 1]!, raw.data[i + 2]!);
  }

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
      if (steepest > edge) blocked[p] = 1;
      // Already transparent is already background, whatever its colour says.
      if (raw.data[p * channels + 3]! < ALPHA_THRESHOLD) blocked[p] = 0;
    }
  }

  // Seal pin-holes so the fill cannot leak through one soft pixel of outline.
  const sealed = morph(morph(blocked, width, height, 2, 'dilate'), width, height, 1, 'erode');

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

  // Grow one pixel into the blocked ring so no anti-aliased halo survives.
  const grown = morph(reachable, width, height, 1, 'dilate');

  let cleared = 0;
  for (let p = 0; p < count; p++) {
    if (grown[p] === 1 && raw.data[p * channels + 3] !== 0) {
      raw.data[p * channels + 3] = 0;
      cleared++;
    }
  }
  return cleared;
}

/** Labelled connected components over opaque pixels, largest first. */
function componentsBySize(raw: Raw): { pixels: number[]; size: number }[] {
  const { width, height, channels } = raw;
  const seen = new Uint8Array(width * height);
  const found: { pixels: number[]; size: number }[] = [];

  for (let sy = 0; sy < height; sy++) {
    for (let sx = 0; sx < width; sx++) {
      const start = sy * width + sx;
      if (seen[start] === 1) continue;
      if (raw.data[start * channels + 3]! < ALPHA_THRESHOLD) continue;

      const pixels: number[] = [];
      const stack = [sx, sy];
      seen[start] = 1;
      while (stack.length > 0) {
        const y = stack.pop()!;
        const x = stack.pop()!;
        pixels.push(y * width + x);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const p = ny * width + nx;
          if (seen[p] === 1) continue;
          if (raw.data[p * channels + 3]! < ALPHA_THRESHOLD) continue;
          seen[p] = 1;
          stack.push(nx, ny);
        }
      }
      found.push({ pixels, size: pixels.length });
    }
  }

  return found.sort((a, b) => b.size - a.size);
}

/**
 * Drop everything except the largest connected shape.
 *
 * Generators like to add detached embers, sparks and specks around a lit object.
 * At the shipped size a disconnected fleck is not a spark, it is one stray pixel
 * of noise — and `18 §9.4` derives the affordance glow from the overlay's own
 * alpha, so a fleck twenty pixels off the silhouette drags the glow out with it.
 */
function keepLargestComponent(raw: Raw): number {
  const parts = componentsBySize(raw);
  if (parts.length <= 1) return 0;

  let dropped = 0;
  for (const part of parts.slice(1)) {
    for (const p of part.pixels) {
      raw.data[p * raw.channels + 3] = 0;
      dropped++;
    }
  }
  return dropped;
}

/**
 * Remove a cool-toned ground slab or cast shadow from under a warm object.
 *
 * `§2.6` of the collectible brief prohibits a ground plane and a cast shadow
 * outright: a collectible is composited onto the tray, the Collection shelf and
 * the Showcase, and a shadow baked for one of those is wrong on the other two.
 *
 * The separator is **measured, not guessed.** Sampling the two candidates that
 * arrived with slabs:
 *
 * | region | rgb | blue − red |
 * |---|---|---|
 * | sauna slate slab | 79,95,109 | **+30** |
 * | bapple shadow wing | 29,33,42 | **+13** |
 * | pot's own dark outline | 6,2,7 | **+1** |
 * | pot body | 189,83,0 | −189 |
 * | sauna wood | 243,150,22 | −221 |
 *
 * Every slab pixel is cool; every pixel of the object — including the near-black
 * outline, which is the thing most at risk from a naive "remove the dark stuff"
 * rule — is warm or neutral. So `blue − red >= 8` separates them with a wide
 * margin in both directions, and the palette makes that durable rather than
 * lucky: `palette.json` has no cool ink at all, and its shadow rule is *"one
 * step darker within the same ramp — never pure black"*, so a correctly-drawn
 * warm object cannot produce a cool pixel.
 *
 * Restricted to the bottom fraction of the frame, because a cool region higher
 * up is the object (a chimney, a screen, a neon tube) rather than the ground.
 */
function dropCoolBase(raw: Raw, fraction: number): number {
  const { width, height } = raw;
  const from = Math.floor(height * (1 - fraction));

  let removed = 0;
  for (let y = from; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = at(raw, x, y);
      if (raw.data[i + 3]! < ALPHA_THRESHOLD) continue;
      const r = raw.data[i]!;
      const b = raw.data[i + 2]!;
      if (b - r >= 8) {
        raw.data[i + 3] = 0;
        removed++;
      }
    }
  }
  return removed;
}

/** The tightest rectangle containing every opaque pixel. */
function boundingBox(raw: Raw): { left: number; top: number; width: number; height: number } {
  let minX = raw.width;
  let maxX = -1;
  let minY = raw.height;
  let maxY = -1;

  for (let y = 0; y < raw.height; y++) {
    for (let x = 0; x < raw.width; x++) {
      if (raw.data[at(raw, x, y) + 3]! < ALPHA_THRESHOLD) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) throw new Error('the image is fully transparent after cleanup');
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Frame the trimmed object so the *downscaled* result lands where the validator
 * requires: horizontally centred, lowest opaque pixel on the final row, and no
 * more than `maxExtent` of `canvas` on the sides or the top.
 *
 * The arithmetic is done here rather than trusted to the resize, because
 * `process-art.ts` uses `fit: 'fill'` — the source's aspect *is* the output's
 * aspect. A source framed to the target's aspect ratio is the only way the
 * object arrives unsquashed.
 */
function frame(
  raw: Raw,
  box: { left: number; top: number; width: number; height: number },
  canvas: { width: number; height: number },
  maxExtent: number,
): { data: Buffer; width: number; height: number } {
  const aspect = canvas.width / canvas.height;

  // Scale the object down inside the frame until it clears the overshoot rule on
  // whichever axis binds first.
  const room = maxExtent / Math.max(canvas.width, canvas.height);
  const needW = box.width / room;
  const needH = box.height / room;

  let outW = Math.ceil(Math.max(needW, needH * aspect));
  let outH = Math.ceil(outW / aspect);
  if (outH < needH) {
    outH = Math.ceil(needH);
    outW = Math.ceil(outH * aspect);
  }

  const data = Buffer.alloc(outW * outH * 4, 0);
  const offX = Math.round((outW - box.width) / 2);
  const offY = outH - box.height; // the lowest opaque pixel is on the last row

  for (let y = 0; y < box.height; y++) {
    for (let x = 0; x < box.width; x++) {
      const src = at(raw, box.left + x, box.top + y);
      if (raw.data[src + 3]! < ALPHA_THRESHOLD) continue;
      const dst = ((offY + y) * outW + (offX + x)) * 4;
      data[dst] = raw.data[src]!;
      data[dst + 1] = raw.data[src + 1]!;
      data[dst + 2] = raw.data[src + 2]!;
      data[dst + 3] = 255;
    }
  }

  return { data, width: outW, height: outH };
}

function parseCanvas(canvas: string): { width: number; height: number } {
  const [width, height] = canvas.split('x').map(Number);
  if (width === undefined || height === undefined || Number.isNaN(width) || Number.isNaN(height)) {
    throw new Error(`Unreadable canvas "${canvas}".`);
  }
  return { width, height };
}

/** The next free `<slug>_NN.png`, so a second candidate never silently wins. */
function nextCandidate(slug: string): string {
  mkdirSync(INCOMING, { recursive: true });
  const taken = readdirSync(INCOMING).filter((f) => f.startsWith(`${slug}_`));
  const n = taken.length + 1;
  return path.join(INCOMING, `${slug}_${String(n).padStart(2, '0')}.png`);
}

function flag(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : (process.argv[i + 1] ?? null);
}

async function main(): Promise<void> {
  const input = process.argv[2];
  if (input === undefined || input.startsWith('--')) {
    console.error('Usage: npm run art:prepare-incoming -- <file.png> --slug <slug> [options]');
    process.exit(1);
  }
  if (!existsSync(input)) throw new Error(`No such file: ${input}`);

  const slug = flag('slug');
  if (slug === null) throw new Error('--slug is required.');

  const record = assetRegistry.get(slug);
  if (record === undefined) throw new Error(`"${slug}" is not in the registry.`);

  const canvas = parseCanvas(record.canvas);
  const maxExtent = Number(flag('max-extent') ?? 44);
  const coolBase = process.argv.includes('--drop-cool-base');
  const keyBackground = process.argv.includes('--key-background');

  let pipe = sharp(input).ensureAlpha();

  const crop = flag('crop');
  if (crop !== null) {
    const [left, top, width, height] = crop.split(',').map(Number);
    if ([left, top, width, height].some((n) => n === undefined || Number.isNaN(n))) {
      throw new Error(`--crop expects x,y,w,h — got "${crop}"`);
    }
    pipe = pipe.extract({ left: left!, top: top!, width: width!, height: height! });
  }

  const { data, info } = await pipe.raw().toBuffer({ resolveWithObject: true });
  const raw: Raw = {
    data: Buffer.from(data),
    width: info.width,
    height: info.height,
    channels: info.channels,
  };

  const notes: string[] = [];
  if (keyBackground) notes.push(`keyed ${String(keyOutBackground(raw))}px of backdrop`);
  if (coolBase) notes.push(`dropped ${String(dropCoolBase(raw, 0.45))}px of cool ground`);
  const debris = keepLargestComponent(raw);
  if (debris > 0) notes.push(`dropped ${String(debris)}px of detached debris`);

  const box = boundingBox(raw);
  const framed = frame(raw, box, canvas, maxExtent);

  const output = nextCandidate(slug);
  await sharp(framed.data, { raw: { width: framed.width, height: framed.height, channels: 4 } })
    .png()
    .toFile(output);

  console.log(
    `${slug.padEnd(34)} ${String(box.width)}x${String(box.height)} → ` +
      `${String(framed.width)}x${String(framed.height)} (for ${record.canvas})` +
      (notes.length > 0 ? `\n  ${notes.join(' · ')}` : ''),
  );
  console.log(`  → ${path.relative(process.cwd(), output)}`);
}

main().catch((error: unknown) => {
  console.error(`\nPreparation failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
