/**
 * Validate a processed collectible PNG against the slot it has to live in.
 *
 *   npm run art:validate                       # every collectible with a path
 *   npm run art:validate -- collectible_reddiwip
 *
 * ## Why this exists before the art does
 *
 * A batch of sprites is expensive to produce and cheap to get subtly wrong, and
 * every way it can be wrong here is **measurable**: the canvas, the transparency,
 * the palette, the anchor, and whether the thing is still readable when the
 * Showcase draws it at half size. Checking those by looking at them is how a
 * batch of eight becomes a batch of eight that has to be redone.
 *
 * So the pipeline gets a gate at its far end. `art:process` turns a generation
 * into a sprite; this says whether the sprite is one the product can use.
 *
 * ## What it deliberately does not check
 *
 * Whether the drawing is any good. That is the commissioner's call and a
 * screenshot's job. Everything here is arithmetic, and arithmetic is the half
 * that can run unattended forever.
 */
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

import { catalog } from '@/lib/counter/catalog';
import { assetRegistry } from '@/lib/assets/registry';
import { TRAY_REVEAL } from '@/lib/parlor/objects';

import { loadPalette } from './process-art';

/** The Showcase's league row draws every collectible at exactly half. */
const SMALLEST_DISPLAY = 0.5;

/**
 * How much of the canvas a collectible may occupy at most.
 *
 * Not a style preference — the reveal's landing animation overshoots to
 * `scale(1.06)` at its 62% keyframe (`globals.css`). A sprite that already
 * touches all four edges is drawn 6% larger than its slot for ~160ms, which on
 * the tray means it briefly grows past the object beside it. One row of margin
 * on the top and sides absorbs it. The **bottom** is exempt: bottom-centre
 * anchoring means the lowest row is the contact row and must be occupied.
 */
const MAX_SIDE_EXTENT = 44;

export interface Finding {
  readonly slug: string;
  readonly rule: string;
  readonly detail: string;
}

interface Measured {
  readonly width: number;
  readonly height: number;
  /** Tight bounding box of everything not fully transparent. */
  readonly box: { left: number; top: number; right: number; bottom: number } | null;
  readonly partialAlpha: number;
  readonly offPalette: number;
  readonly pureBlackOrWhite: number;
  readonly opaque: number;
}

async function measure(file: string, palette: readonly (readonly [number, number, number])[]) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const known = new Set(palette.map(([r, g, b]) => (r << 16) | (g << 8) | b));

  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  let partialAlpha = 0;
  let offPalette = 0;
  let pureBlackOrWhite = 0;
  let opaque = 0;

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      const a = data[i + 3]!;

      if (a === 0) continue;
      if (a !== 255) partialAlpha++;

      opaque++;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;

      const rgb = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
      if (!known.has(rgb)) offPalette++;
      if (rgb === 0x000000 || rgb === 0xffffff) pureBlackOrWhite++;
    }
  }

  const measured: Measured = {
    width: info.width,
    height: info.height,
    box: right < 0 ? null : { left, top, right, bottom },
    partialAlpha,
    offPalette,
    pureBlackOrWhite,
    opaque,
  };
  return measured;
}

/**
 * Every way this sprite does not fit its slot.
 *
 * Returns findings rather than printing them, so the rules can be tested against
 * deliberately-broken images — a validator nobody has watched fail is a
 * validator nobody knows works.
 */
export async function inspect(slug: string, file: string): Promise<readonly Finding[]> {
  const findings: Finding[] = [];
  const fail = (rule: string, detail: string): void => {
    findings.push({ slug, rule, detail });
  };

  const record = assetRegistry.get(slug);
  if (record === undefined) {
    fail('registry', 'not in art/assets.inventory.json');
    return findings;
  }

  const [, , slotWidth, slotHeight] = TRAY_REVEAL;
  const palette = loadPalette();
  const m = await measure(file, palette);

  // --- The canvas is the slot. ---------------------------------------------
  if (m.width !== slotWidth || m.height !== slotHeight) {
    fail(
      'canvas',
      `${String(m.width)}x${String(m.height)}, but the reveal slot is ` +
        `${String(slotWidth)}x${String(slotHeight)} — any other size is resampled`,
    );
  }

  if (m.box === null) {
    fail('empty', 'every pixel is transparent');
    return findings;
  }

  // --- Transparency is hard, never soft. -----------------------------------
  //
  // A fringe of half-transparent pixels is the single most common way a sprite
  // reads as pasted onto the room rather than standing in it, and it also
  // corrupts the alpha-derived glow — the silhouette is the alpha channel
  // (`ASSET_PIPELINE §5`).
  if (m.partialAlpha > 0) {
    fail(
      'alpha',
      `${String(m.partialAlpha)} pixels are partially transparent; pixel art has no ` +
        `soft edges and the affordance glow is derived from this channel`,
    );
  }

  // --- The palette is closed. ----------------------------------------------
  if (m.offPalette > 0) {
    fail(
      'palette',
      `${String(m.offPalette)} pixels are outside palette.json — run npm run art:process`,
    );
  }
  if (m.pureBlackOrWhite > 0) {
    fail(
      'palette',
      `${String(m.pureBlackOrWhite)} pixels are pure #000000 or #FFFFFF, both prohibited`,
    );
  }

  // --- It stands on the bottom edge. ---------------------------------------
  //
  // Bottom-centre anchoring is what lets a tall replacement grow upward instead
  // of sinking through the tray. A sprite with clear space under it floats, and
  // floats *differently* on each of the three surfaces.
  if (m.box.bottom !== slotHeight - 1) {
    fail(
      'anchor',
      `lowest opaque row is ${String(m.box.bottom)}, not ${String(slotHeight - 1)} — ` +
        `it will float above the tray`,
    );
  }

  // --- It is roughly centred horizontally. ---------------------------------
  const centre = (m.box.left + m.box.right + 1) / 2;
  const drift = Math.abs(centre - slotWidth / 2);
  if (drift > 3) {
    fail(
      'anchor',
      `visual centre is ${centre.toFixed(1)}, ${drift.toFixed(1)} off the slot's ` +
        `${String(slotWidth / 2)} — it will sit off-axis from its own name plate`,
    );
  }

  // --- It leaves room for the landing overshoot. ---------------------------
  const width = m.box.right - m.box.left + 1;
  const height = m.box.bottom - m.box.top + 1;
  if (width > MAX_SIDE_EXTENT || height > MAX_SIDE_EXTENT) {
    fail(
      'overshoot',
      `occupies ${String(width)}x${String(height)}; the reveal scales to 1.06 as it ` +
        `lands, so keep it within ${String(MAX_SIDE_EXTENT)} on the sides and top`,
    );
  }

  // --- It survives the smallest surface. -----------------------------------
  //
  // The Showcase league row is exactly half. A silhouette that dissolves there
  // is one the league never actually sees.
  const half = await sharp(file)
    .resize(Math.round(slotWidth * SMALLEST_DISPLAY), Math.round(slotHeight * SMALLEST_DISPLAY), {
      kernel: 'nearest',
      fit: 'fill',
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let halfOpaque = 0;
  for (let i = 0; i < half.data.length; i += half.info.channels) {
    if (half.data[i + 3]! > 0) halfOpaque++;
  }

  // A quarter of the pixels survive a halving, so the expected ratio is ~1/4.
  // Much less than that and the shape was carried by single-pixel detail that
  // nearest-neighbour throws away.
  const expected = m.opaque / 4;
  if (halfOpaque < expected * 0.6) {
    fail(
      'legibility',
      `halving to the Showcase row keeps ${String(halfOpaque)} of an expected ` +
        `~${String(Math.round(expected))} pixels — the shape depends on detail that ` +
        `disappears at 23px`,
    );
  }

  console.log(
    `${slug.padEnd(34)} ${String(m.width)}x${String(m.height)}  ` +
      `occupies ${String(width)}x${String(height)} at (${String(m.box.left)},${String(m.box.top)})  ` +
      `${String(m.opaque)} opaque px`,
  );

  return findings;
}

async function main(): Promise<void> {
  const only = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
  const slugs = catalog()
    .map((item) => item.slug)
    .filter((slug) => only.length === 0 || only.includes(slug));

  const root = path.join(process.cwd(), 'public', 'assets', 'collectible');
  const present = existsSync(root) ? new Set(readdirSync(root)) : new Set<string>();

  const checked: string[] = [];
  const findings: Finding[] = [];
  for (const slug of slugs) {
    const file = path.join(root, `${slug}.png`);
    if (!present.has(`${slug}.png`)) continue;
    checked.push(slug);
    findings.push(...(await inspect(slug, file)));
  }

  if (checked.length === 0) {
    console.log(
      'No collectible PNGs in public/assets/collectible/ yet.\n' +
        'Drop generated art in art/incoming/ as <slug>_NN.png, run npm run art:process,\n' +
        'then re-run this. See docs/art/BATCH_B_COLLECTIBLES_HANDOFF.md.',
    );
    return;
  }

  console.log(
    `\n${String(checked.length)} of ${String(slugs.length)} collectibles have art.`,
  );

  if (findings.length > 0) {
    console.error(`\n${String(findings.length)} problem(s):\n`);
    for (const f of findings) console.error(`  [${f.rule}] ${f.slug} — ${f.detail}`);
    process.exit(1);
  }

  console.log('Every one of them fits its slot.');
}

// Same guard as `process-art.ts`: these scripts are compiled to CJS, where a
// top-level await is a syntax error rather than a style choice.
if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(
      `\nValidation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
