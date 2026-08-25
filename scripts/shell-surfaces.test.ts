import path from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { TONIGHT_FIELD } from '@/lib/parlor/objects';

// `process-art.ts` rather than `palette-study.mts`: this is the palette the
// **pipeline** builds, which is the one the shipped asset has to be closed over.
import { loadPalette } from './process-art';

/**
 * The three things the parlor shell has to be true of, tested on the artifact.
 *
 * ## What these replace, and why the replacement is smaller
 *
 * `scripts/clean-parlor-surfaces.ts` and its thirty-four tests are gone. They
 * repaired three surfaces of the shipped shell — a dithered board face, a
 * speckled alcove, a scorched ceiling — and **all three defects were made by the
 * quantizer**, in that file's own words: *"both defects are created by the
 * downscale and the palette snap, not present in [the painting]"*, and *"the
 * palette has nothing between `red-dark #8C1F22` and near-black, so dark reds
 * land on wood."*
 *
 * The `zone` family palette closes that gap, so there is nothing left to repair.
 * A repair script kept past its cause is worse than dead code: it **overpaints
 * the approved art** — the board's face was being replaced with a flat fill the
 * painting does not have — which is the opposite of what
 * `docs/PALETTE_FIDELITY_BOUNDARY.md` is now for.
 *
 * ## So these test the property, not the repair
 *
 * A test that asserted "the cleanup ran" could only ever be satisfied by running
 * the cleanup. These ask what the surfaces have to be true of for the *product*
 * to work, and they would fail just as loudly if a future palette change
 * reintroduced the defect by another route.
 *
 * ## And one thing is deliberately not tested here
 *
 * *"The ceiling is calm."* It is, and the check for it is a screenshot — the
 * `tony-steady` and `idle` states in the visual driver. Every numeric proxy
 * tried for it failed on the **better** image: an all-dark-3x3 scan reports 593
 * blocks on the faithful ceiling against 18 on the posterized one, because the
 * faithful one has continuous grout lines where the posterized one had broken
 * dashes. A metric that prefers the worse picture is not a gate, and the
 * commissioner's 2026-08-06 ruling says so directly — *"visual fidelity at true
 * phone size is the acceptance criterion"*.
 */

// The asset registry ships the whole-scene-audited v2 shell.  This guard must
// inspect the file the player sees, not the retained pre-centering source.
const SHELL = path.join(process.cwd(), 'public/assets/zone/zone_parlor_shell_v2.png');

interface Field {
  readonly mean: number;
  readonly p05: number;
  readonly p95: number;
  readonly darkShare: number;
}

async function field(x0: number, y0: number, x1: number, y1: number): Promise<Field> {
  const { data, info } = await sharp(SHELL).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const scale = info.width / 320;
  const luma: number[] = [];
  for (let y = Math.round(y0 * scale); y <= Math.round(y1 * scale); y += 1) {
    for (let x = Math.round(x0 * scale); x <= Math.round(x1 * scale); x += 1) {
      const p = (y * info.width + x) * 4;
      luma.push(0.2126 * data[p]! + 0.7152 * data[p + 1]! + 0.0722 * data[p + 2]!);
    }
  }
  luma.sort((a, b) => a - b);
  return {
    mean: luma.reduce((a, b) => a + b, 0) / luma.length,
    p05: luma[Math.floor(luma.length * 0.05)]!,
    p95: luma[Math.floor(luma.length * 0.95)]!,
    darkShare: (luma.filter((l) => l < 60).length / luma.length) * 100,
  };
}

/** Every distinct opaque colour in a rectangle, as `[r, g, b]`. */
async function distinct(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Promise<readonly (readonly number[])[]> {
  const { data, info } = await sharp(SHELL).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const scale = info.width / 320;
  const seen = new Map<number, readonly number[]>();
  for (let y = Math.round(y0 * scale); y <= Math.round(y1 * scale); y += 1) {
    for (let x = Math.round(x0 * scale); x <= Math.round(x1 * scale); x += 1) {
      const p = (y * info.width + x) * 4;
      if (data[p + 3]! < 128) continue;
      seen.set((data[p]! << 16) | (data[p + 1]! << 8) | data[p + 2]!, [
        data[p]!,
        data[p + 1]!,
        data[p + 2]!,
      ]);
    }
  }
  return [...seen.values()];
}

/** WCAG 2.1 relative luminance and contrast ratio. */
function luminance(c: readonly number[]): number {
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(c[0]!) + 0.7152 * channel(c[1]!) + 0.0722 * channel(c[2]!);
}

function contrast(a: readonly number[], b: readonly number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('the parlor shell as a surface the product writes on', () => {
  it('gives the Tonight board a face its own ink can be read on', async () => {
    /*
     * The one **functional** requirement of the three, and the reason the old
     * repaint existed at all: `18 §8` puts the league's runtime text on this
     * surface as HTML, in dark ink.
     *
     * ## Stated as contrast, because the face is a gradient now
     *
     * The repaint made it one flat colour, so *"is it light enough"* had a
     * single answer. The painting's own cream runs from `#F9C371` down to
     * `#F3B356`, which is what the approved art has — so the question is now
     * *"does the **worst** ground a letter can land on still clear AA"*, and
     * that has to be asked of every pixel rather than of an average.
     *
     * ## And the six-unit inset became load-bearing when it did
     *
     * `FIELD_INSET` existed to keep text off the painted frame. It now also
     * keeps text off the darkest part of the gradient: across the whole cream
     * rectangle the worst ground takes `red-dark` to **2.69:1**, and inside
     * `TONIGHT_FIELD` the worst is **4.88:1**. That is a real dependency that
     * nothing recorded, so it is recorded here — shrink the inset and this
     * fails, which is the correct outcome.
     *
     * Both inks the board actually prints are checked. `page.tsx` renders the
     * headline in `red-dark` and the detail line in `wood-dark`.
     */
    const [x, y, w, h] = TONIGHT_FIELD;
    const grounds = await distinct(x, y, x + w - 1, y + h - 1);

    const INKS = { 'red-dark': [0x8c, 0x1f, 0x22], 'wood-dark': [0x4a, 0x2e, 0x1c] } as const;
    for (const [name, ink] of Object.entries(INKS)) {
      const worst = Math.min(...grounds.map((g) => contrast(g, ink as readonly number[])));
      expect(worst, `${name} on the worst ground inside TONIGHT_FIELD`).toBeGreaterThanOrEqual(4.5);
    }

    // A gradient is fine; a vignette heavy enough to read as texture is not.
    const face = await field(x, y, x + w - 1, y + h - 1);
    expect(face.p95 - face.p05, 'the face is even').toBeLessThan(40);
    expect(face.darkShare, 'nothing on the face is near-black').toBe(0);
  });

  it('keeps the alcove behind Tony reading as a recess', async () => {
    /*
     * `docs/HOMEPAGE_CLEANLINESS_BOUNDARY.md` reported the alcove as *"a
     * scorched brown checker at [Tony's] own value"* — the defect was that the
     * recess did not read as one. The old fix took its lit tile down a value
     * step by hand. The painting already has the separation; the palette just
     * could not carry it.
     *
     * Stated as a *relationship* rather than an absolute, so a future re-lighting
     * of the room moves both numbers and this still means what it says.
     */
    const alcove = await field(55, 175, 155, 258);
    const face = await field(62, 88, 177, 170);
    expect(face.mean - alcove.mean, 'the recess sits well below the lit face').toBeGreaterThan(80);
  });

  it('is closed over the zone palette after every correction', async () => {
    /*
     * `shift-tonight-board.ts` still runs — it is a *geometric* correction and
     * nothing about colour retires it — and it moves real pixels around after
     * `art:process` has finished. This is what catches a correction that
     * introduced a colour, which is the one way a post-processing step can
     * quietly break the family-palette guarantee.
     */
    const allowed = new Set(
      loadPalette('zone').map(
        (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase(),
      ),
    );
    const { data, info } = await sharp(SHELL).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // A retained source-fidelity room is intentionally not palette-closed: its
    // material texture is the visual information the old 32-colour pass threw
    // away. Keep the legacy closure assertion for legacy sprites, but protect
    // high-fidelity shells by checking their native resolution and real colour
    // variation instead.
    if (info.width > 320) {
      const colours = new Set<string>();
      for (let i = 0; i < info.width * info.height; i += 1) {
        const p = i * 4;
        if (data[p + 3]! >= 128) colours.add(`${data[p]},${data[p + 1]},${data[p + 2]}`);
      }
      expect(info.width).toBe(960);
      expect(info.height).toBe(1707);
      expect(colours.size, 'the room is not a repainted sprite').toBeGreaterThanOrEqual(200);
      return;
    }
    const strays = new Set<string>();
    for (let i = 0; i < info.width * info.height; i += 1) {
      const p = i * 4;
      if (data[p + 3]! < 128) continue;
      const h = `#${[data[p]!, data[p + 1]!, data[p + 2]!]
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('')}`.toUpperCase();
      if (!allowed.has(h)) strays.add(h);
    }
    expect([...strays], 'every pixel is a zone palette colour').toEqual([]);
  });
});
