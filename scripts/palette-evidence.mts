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
 * The commit immediately before `art/palette.json` grew `familyExtensions`.
 *
 * Pinned rather than computed as `HEAD~1`: this file outlives the branch it was
 * written on, and a relative ref would silently start comparing the wrong pair
 * the first time anything landed on top of it.
 */
const BEFORE_REF = '4a36244';

const SHELL = 'public/assets/zone/zone_parlor_shell.png';

interface Crop {
  readonly name: string;
  readonly file: string;
  /** Omitted means the whole asset. In source units, not device pixels. */
  readonly rect?: { left: number; top: number; width: number; height: number };
  readonly scale: number;
}

const CROPS: readonly Crop[] = [
  // The headline, at 1:1 — the size the room is actually drawn at.
  { name: 'shell-whole', file: SHELL, scale: 1 },
  { name: 'ceiling', file: SHELL, rect: { left: 40, top: 0, width: 200, height: 70 }, scale: 4 },
  {
    name: 'wall-behind-tony',
    file: SHELL,
    rect: { left: 50, top: 165, width: 110, height: 100 },
    scale: 4,
  },
  { name: 'floor', file: SHELL, rect: { left: 40, top: 460, width: 200, height: 100 }, scale: 4 },
  { name: 'booths', file: SHELL, rect: { left: 180, top: 260, width: 140, height: 120 }, scale: 4 },
  { name: 'counter-front', file: 'public/assets/zone/zone_counter_front.png', scale: 2 },
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
  const before = execFileSync('git', ['show', `${BEFORE_REF}:${crop.file}`], {
    maxBuffer: 64 * 1024 * 1024,
    encoding: 'buffer',
  });
  const after = execFileSync('git', ['show', `HEAD:${crop.file}`], {
    maxBuffer: 64 * 1024 * 1024,
    encoding: 'buffer',
  });
  await write(before, crop, path.join(OUT, `${crop.name}-before.png`));
  await write(after, crop, path.join(OUT, `${crop.name}-after.png`));
  console.log(`${crop.name}  ${crop.scale}x  ->  ${OUT}`);
}
