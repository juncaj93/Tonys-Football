/**
 * The palette extension, photographed: before and after, from git.
 *
 * ## Why this is a script rather than six `sharp` calls in a shell
 *
 * The evidence in `docs/evidence/` is the part of a slice a reviewer actually
 * looks at, and it is the part most likely to be quietly wrong — a crop taken
 * from a working tree that has moved on, a "before" that is really an after, a
 * rectangle chosen to flatter. All three have to be impossible rather than
 * discouraged.
 *
 * So `before` is read **out of git** at a named commit and never from disk, the
 * rectangles are constants in this file, and running it again on the same two
 * commits produces the same twelve files. If the crops look staged, the fix is
 * to change `CROPS` in a reviewable diff.
 *
 * ## The scale is nearest-neighbour, on purpose
 *
 * Every asset here is pixel art at 320 units wide. Smoothing an enlargement
 * would blur the exact thing being compared — which colour each pixel snapped
 * to — so `kernel: 'nearest'` is not a preference.
 *
 *   npx tsx scripts/palette-evidence.mts [outDir]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

/**
 * The three states of the room, pinned by commit.
 *
 * Pinned rather than computed as `HEAD~1`: this file outlives the branch it was
 * written on, and a relative ref would silently start comparing the wrong pair
 * the first time anything landed on top of it.
 *
 * Three rather than two, because the middle one is the argument. `+4` was a real
 * improvement on every metric the study had — mean error 35.0 to 21.6 — and it
 * was still visibly orange and posterized at phone size. A two-way before/after
 * would let the reader believe the first attempt had simply been too timid; the
 * middle column is what shows that *more of the same* was not the answer, and
 * that the shared palette was the wrong shape rather than the wrong size.
 */
const STAGES = [
  { key: 'before', ref: '4a36244', what: 'the shared 32' },
  { key: 'plus4', ref: 'b4815a1', what: 'the shared 32 + 4' },
  { key: 'after', ref: 'HEAD', what: "the zone family's own 64" },
] as const;

const SHELL = 'public/assets/zone/zone_parlor_shell.png';

interface Crop {
  readonly name: string;
  readonly file: string;
  /**
   * The approved painting this asset comes from, and its shipped canvas.
   *
   * The 2026-08-06 ruling asks for *"Tony source versus old production versus
   * proposed production"* by name, so the benchmark is a **column** here rather
   * than a claim in prose. It is produced by the pipeline's own downscale with
   * the quantizer left out — which is the only honest way to render a 941 × 1672
   * painting at 320 units — so the comparison isolates exactly one step.
   */
  readonly source?: { readonly incoming: string; readonly canvas: readonly [number, number] };
  /** Omitted means the whole asset. In source units, not device pixels. */
  readonly rect?: { left: number; top: number; width: number; height: number };
  readonly scale: number;
}

const TONY = 'public/assets/character/character_tony_neutral.png';
const SHELL_SRC = { incoming: 'art/incoming/zone_parlor_shell.png', canvas: [320, 569] } as const;
const TONY_SRC = {
  incoming: 'art/incoming/character_tony_neutral_02.png',
  canvas: [88, 240],
} as const;

const CROPS: readonly Crop[] = [
  // The headline, at 1:1 — the size the room is actually drawn at.
  { name: 'shell-whole', file: SHELL, source: SHELL_SRC, scale: 1 },
  { name: 'tony-whole', file: TONY, source: TONY_SRC, scale: 2 },
  // His face is the commissioner's named fidelity reference.
  {
    name: 'tony-face',
    file: TONY,
    source: TONY_SRC,
    rect: { left: 13, top: 0, width: 62, height: 68 },
    scale: 6,
  },
  {
    name: 'ceiling',
    file: SHELL,
    source: SHELL_SRC,
    rect: { left: 40, top: 0, width: 200, height: 70 },
    scale: 4,
  },
  {
    name: 'wall-behind-tony',
    file: SHELL,
    source: SHELL_SRC,
    rect: { left: 50, top: 165, width: 110, height: 100 },
    scale: 4,
  },
  {
    name: 'floor',
    file: SHELL,
    source: SHELL_SRC,
    rect: { left: 40, top: 460, width: 200, height: 100 },
    scale: 4,
  },
  {
    name: 'booths',
    file: SHELL,
    source: SHELL_SRC,
    rect: { left: 180, top: 260, width: 140, height: 120 },
    scale: 4,
  },
  {
    name: 'counter-front',
    file: 'public/assets/zone/zone_counter_front.png',
    source: { incoming: 'art/incoming/zone_counter_front_01.png', canvas: [320, 278] },
    scale: 2,
  },
];

const OUT = process.argv[2] ?? 'docs/evidence/palette-fidelity';
mkdirSync(OUT, { recursive: true });

async function write(buf: Buffer, crop: Crop, out: string): Promise<void> {
  const meta = await sharp(buf).metadata();
  const width = crop.rect?.width ?? meta.width ?? 0;
  const height = crop.rect?.height ?? meta.height ?? 0;
  let image = sharp(buf);
  if (crop.rect !== undefined) image = image.extract(crop.rect);
  await image
    .resize(width * crop.scale, height * crop.scale, { kernel: 'nearest' })
    .png()
    .toFile(out);
}

for (const crop of CROPS) {
  if (crop.source !== undefined) {
    const [w, h] = crop.source.canvas;
    const benchmark = await sharp(crop.source.incoming)
      .ensureAlpha()
      .resize(w, h, { kernel: 'lanczos3', fit: 'fill' })
      .png()
      .toBuffer();
    await write(benchmark, crop, path.join(OUT, `${crop.name}-source.png`));
  }

  for (const stage of STAGES) {
    let source: Buffer;
    try {
      source = execFileSync('git', ['show', `${stage.ref}:${crop.file}`], {
        maxBuffer: 64 * 1024 * 1024,
        encoding: 'buffer',
      });
    } catch {
      // An asset that did not exist at that commit. Skipping it is right: an
      // empty frame in a three-way comparison is information, an invented one
      // is not.
      console.log(`  (${crop.name} has no ${stage.key} — not in ${stage.ref})`);
      continue;
    }
    await write(source, crop, path.join(OUT, `${crop.name}-${stage.key}.png`));
  }
  console.log(`${crop.name}  ${crop.scale}x  ->  ${OUT}`);
}
