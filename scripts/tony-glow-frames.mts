/**
 * Every frame of the fade, measured against the settled room.
 *
 * `tony-glow-probe.mts` records the compositor's own frames across the moment
 * the glow ends. This asks the one question that matters of each of them:
 * **does Tony occupy different pixels than he does once everything has
 * settled?**
 *
 * The glow is additive light outside his alpha, so a frame mid-fade is expected
 * to differ *around* him and nowhere else. A difference **inside** his
 * silhouette is the sprite moving, being clipped, or being covered — the three
 * things the commissioner's report distinguishes between, and the diff map says
 * which.
 *
 *   npx tsx scripts/tony-glow-frames.mts
 */
import { readdir, readFile } from 'node:fs/promises';

import sharp from 'sharp';

const OUT = 'visual-qa/glow-probe';
const WIDTHS = [390, 375, 360];

interface Raw {
  readonly data: Buffer;
  readonly width: number;
  readonly height: number;
}

async function raw(path: string): Promise<Raw> {
  const { data, info } = await sharp(await readFile(path))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * The test: **a glow can only add light.**
 *
 * `drop-shadow` composites a blurred copy of the alpha *behind* the element, so
 * every pixel it touches gets brighter and none gets darker. That makes the
 * discriminator exact and needs no authored mask:
 *
 *   - a pixel **brighter** than the settled frame is the glow, and expected;
 *   - a pixel **darker** than the settled frame cannot be the glow. It is the
 *     sprite covering something it does not cover once the room has settled —
 *     which is the sprite having moved, or been clipped differently, or been
 *     drawn at a different rasterization.
 *
 * An earlier version of this file masked by "pixels the first frame changed",
 * and the first screencast frame turned out not to be representative of the
 * whole glowing period, so the mask leaked and reported hundreds of differing
 * pixels that were only glow. This test has no such freedom.
 */
interface Region {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Perceived lightness, cheap and monotonic — enough to say "darker". */
function luma(data: Buffer, p: number): number {
  return 0.299 * data[p]! + 0.587 * data[p + 1]! + 0.114 * data[p + 2]!;
}

async function inspect(width: number): Promise<boolean> {
  const report = JSON.parse(
    await readFile(`${OUT}/${String(width)}-report.json`, 'utf8'),
  ) as { sprite: { x: number; y: number; width: number; height: number; counterTop: number } };

  const dir = `${OUT}/cast-${String(width)}`;
  const names = (await readdir(dir)).filter((n) => n.endsWith('.png')).sort();
  if (names.length === 0) {
    console.log(`  @${String(width)} no screencast frames`);
    return false;
  }

  const frames: Raw[] = [];
  for (const name of names) frames.push(await raw(`${dir}/${name}`));
  const settled = frames.at(-1)!;

  /*
   * The sprite's rectangle, widened by the glow's reach, in cast coordinates.
   * The cast is captured at the viewport's own scale rather than the device's,
   * so the ratio comes from the frame instead of an assumed constant.
   */
  const scale = settled.width / width;
  const reach = 12;
  const sprite: Region = {
    left: Math.max(0, Math.floor((report.sprite.x - reach) * scale)),
    top: Math.max(0, Math.floor((report.sprite.y - reach) * scale)),
    right: Math.min(settled.width, Math.ceil((report.sprite.x + report.sprite.width + reach) * scale)),
    bottom: Math.min(
      settled.height,
      Math.ceil((report.sprite.y + report.sprite.height + reach) * scale),
    ),
  };

  let worstFrame = -1;
  let worstCount = 0;
  let worstDrop = 0;
  let brightestFrame = 0;

  for (const [index, frame] of frames.entries()) {
    if (frame.width !== settled.width || frame.height !== settled.height) continue;
    let darker = 0;
    let drop = 0;
    let brighter = 0;

    for (let y = sprite.top; y < sprite.bottom; y += 1) {
      for (let x = sprite.left; x < sprite.right; x += 1) {
        const p = (y * settled.width + x) * 4;
        const delta = luma(frame.data, p) - luma(settled.data, p);
        // 8 of 255 is well above PNG-through-compositor noise and well below a
        // one-pixel edge move on this art, which swings by 100 or more.
        if (delta < -8) {
          darker += 1;
          drop = Math.max(drop, -delta);
        } else if (delta > 8) {
          brighter += 1;
        }
      }
    }

    if (brighter > brightestFrame) brightestFrame = brighter;
    if (darker > worstCount) {
      worstCount = darker;
      worstFrame = index;
      worstDrop = Math.round(drop);
    }
  }

  console.log(
    `  @${String(width)}  ${String(frames.length)} frames · brightest frame lit ${String(brightestFrame)} px · ` +
      (worstCount === 0
        ? 'no frame is darker anywhere — the glow only ever added light'
        : `frame ${String(worstFrame)} is darker at ${String(worstCount)} px (max drop ${String(worstDrop)})`),
  );

  return worstCount === 0;
}

let clean = true;
for (const width of WIDTHS) {
  clean = (await inspect(width)) && clean;
}

console.log(
  clean
    ? '\n  Tony holds still through the whole fade.\n'
    : '\n  Tony does NOT hold still through the fade — see the worst frames above.\n',
);
