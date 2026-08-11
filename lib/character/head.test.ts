import { describe, expect, it } from 'vitest';

import { FACE, HEAD, NECK } from './art/geometry';
import {
  HEAD_REGISTRATION,
  MASK_CANVAS,
  OUTLINE_BUDGET,
  TRANSPARENT_KEY,
  validateHeadPlate,
} from './mask';

/**
 * The head plate's registration, and what it refuses.
 *
 * **A head is checked harder than a build, and the asymmetry is the point.** A
 * build's placement is its own business — nothing else depends on where its knees
 * are. Ten layers are measured off a head: six hairstyles from the skull's curve,
 * four facial-hair pieces from the mouth and jaw, three hats from the brow. A head
 * three rows out is not a head slightly out of place, it is ten assets wrong.
 */

const OUTLINE = 1;
const SKIN_BASE = 8;
const EYE_WHITE = 19;

/** A mechanically valid head plate: skull, jaw, neck to the collar, eyes on the line. */
function plate(
  {
    eyeRow = FACE.eyeY as number,
    neckTo = HEAD_REGISTRATION.bottom as number,
    top = HEAD.top as number,
    skullWidth = (HEAD.right - HEAD.left) as number,
  } = {},
): number[] {
  const { width, height } = MASK_CANVAS;
  const keys = Array.from({ length: width * height }, () => TRANSPARENT_KEY);
  const put = (x: number, y: number, key: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    keys[y * width + x] = key;
  };

  const left = Math.round(56 - skullWidth / 2);
  const right = left + skullWidth - 1;

  for (let y = top; y <= HEAD.bottom; y++) {
    for (let x = left; x <= right; x++) put(x, y, SKIN_BASE);
  }
  for (let y = HEAD.bottom + 1; y <= neckTo; y++) {
    for (let x = NECK.left; x < NECK.left + NECK.width; x++) put(x, y, SKIN_BASE);
  }

  // Eyes, so the eye line is measurable.
  for (let dy = 0; dy < FACE.eyeHeight; dy++) {
    for (let dx = 0; dx < FACE.eyeWidth; dx++) {
      put(FACE.eyeLeft + dx, eyeRow + dy, EYE_WHITE);
      put(FACE.eyeRight + dx, eyeRow + dy, EYE_WHITE);
    }
  }

  // Enclose it, which `ART_SPEC §4` requires of every character.
  const opaque = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && keys[y * width + x] !== TRANSPARENT_KEY;
  const enclosed = [...keys];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!opaque(x, y)) continue;
      if (!opaque(x - 1, y) || !opaque(x + 1, y) || !opaque(x, y - 1) || !opaque(x, y + 1)) {
        enclosed[y * width + x] = OUTLINE;
      }
    }
  }
  return enclosed;
}

const failures = (keys: readonly number[]): readonly string[] =>
  validateHeadPlate(keys)
    .filter((problem) => problem.severity === 'fail')
    .map((problem) => problem.message);

describe('a head plate that registers', () => {
  it('passes', () => {
    expect(failures(plate())).toEqual([]);
  });

  it('allows a neck that runs on behind the shirt', () => {
    /*
     * The head plate is `base-body` and the build is `base-top`, so the shirt is
     * drawn over the neck. A neck that continues past the collar row is hidden,
     * not wrong — and an earlier version of this rule refused it, which would have
     * sent a correct delivery back.
     */
    expect(failures(plate({ neckTo: HEAD_REGISTRATION.bottom + 4 }))).toEqual([]);
  });
});

describe('what it refuses', () => {
  it('refuses an empty plate', () => {
    expect(failures(Array.from({ length: MASK_CANVAS.width * MASK_CANVAS.height }, () => TRANSPARENT_KEY)))
      .toEqual(['the head plate is empty']);
  });

  it('refuses eyes off the line, because beards and hats are measured from them', () => {
    expect(failures(plate({ eyeRow: FACE.eyeY + HEAD_REGISTRATION.eyeTolerance + 1 })).join(' '))
      .toMatch(/rows off the eye line/);
  });

  it('allows the three rows two real deliveries actually landed on', () => {
    /*
     * A drawn head puts the eyes 46% down its skull and a painted one put them at
     * 57%. Three rows, and the tolerance was widened to admit it **after** the
     * head was rendered under all six hairstyles and all four beards — not to let
     * it through. See `HEAD_REGISTRATION.eyeTolerance`.
     */
    expect(failures(plate({ eyeRow: FACE.eyeY + 3 }))).toEqual([]);
  });

  it('allows eyes inside the tolerance', () => {
    expect(failures(plate({ eyeRow: FACE.eyeY + HEAD_REGISTRATION.eyeTolerance }))).toEqual([]);
  });

  it('refuses a head with no eyes painted in the eye-white key', () => {
    const keys = plate();
    for (let at = 0; at < keys.length; at++) if (keys[at] === EYE_WHITE) keys[at] = SKIN_BASE;
    expect(failures(keys).join(' ')).toMatch(/the eye line cannot be measured/);
  });

  it('refuses a neck too short to reach the collar', () => {
    expect(failures(plate({ neckTo: HEAD_REGISTRATION.bottom - 6 })).join(' '))
      .toMatch(/6 rows of room would show through the join/);
  });

  it('refuses a skull that starts on the wrong row', () => {
    expect(failures(plate({ top: HEAD.top + 4 })).join(' ')).toMatch(/the skull starts on row 28/);
  });

  it('refuses a skull too wide for the hair drawn around it', () => {
    expect(failures(plate({ skullWidth: HEAD.right - HEAD.left + 8 })).join(' '))
      .toMatch(/columns across at the eye line/);
  });

  it('refuses paint below the collar that nothing covers', () => {
    const keys = plate();
    keys[(HEAD_REGISTRATION.bottom + 2) * MASK_CANVAS.width + 20] = SKIN_BASE;
    expect(failures(keys).join(' ')).toMatch(/where nothing covers them/);
  });

  it('accepts paint below the collar that the build does cover', () => {
    /*
     * The rule used to guess with the neck's columns and refused a single pixel of
     * a correct delivery — one the shirt was drawn straight over. When the caller
     * can say what the build covers, the composite answers for itself.
     */
    const keys = plate();
    const stray = (HEAD_REGISTRATION.bottom + 2) * MASK_CANVAS.width + 20;
    keys[stray] = SKIN_BASE;
    const covered = (x: number, y: number): boolean =>
      y * MASK_CANVAS.width + x === stray;
    expect(validateHeadPlate(keys, covered).filter((p) => p.severity === 'fail')).toEqual([]);
  });

  it('refuses an unenclosed silhouette', () => {
    const keys = plate();
    let repainted = 0;
    for (let at = 0; at < keys.length && repainted < OUTLINE_BUDGET + 4; at++) {
      if (keys[at] === OUTLINE) {
        keys[at] = SKIN_BASE;
        repainted++;
      }
    }
    expect(failures(keys).join(' ')).toMatch(/without an outline/);
  });
});
