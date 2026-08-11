import { describe, expect, it } from 'vitest';

import { BODY, BODY_BELOW, BODY_HEAD } from './art/body';
import { CANVAS } from './art/geometry';
import {
  BUILD_REGISTRATION,
  MASK_CANVAS,
  MASK_KEYS,
  TRANSPARENT_KEY,
  decodeKeys,
  encodeMask,
  maskToneGrid,
  paintedKeys,
  validateBuildMask,
} from './mask';
import { fixtureBuildMask } from './mask.fixture';
import { HOUSE } from './palette';
import { coverage, rasterise, shade } from './sprite';

/**
 * The role-mask contract, and the fixture that proves it end to end.
 *
 * **Nothing here is artwork.** The fixture below is the *drawn* below-neck figure
 * re-expressed as role keys — a diagnostic, built in memory, never committed and
 * never shown as evidence of anything visual. Its only job is to be a
 * mechanically valid mask so the decode, the validation and the recolouring can
 * be tested before any painted asset exists. The commissioner's prototype
 * authorisation is explicit that a substitute must not be mistaken for the real
 * T-shirt, and building it here rather than committing a PNG is how that is made
 * impossible rather than merely promised.
 */

/* ----------------------------------------------------------- the keys -- */

describe('the mask vocabulary', () => {
  it('paints only in the locked palette', () => {
    // The whole reason a mask can be recoloured at runtime is that its keys are
    // *roles*. A key painted in a colour the palette does not have would be a
    // colour nothing can resolve.
    for (const key of MASK_KEYS) expect(HOUSE[key.colour], key.name).toBeDefined();
  });

  it('keeps every pair of keys apart', () => {
    /*
     * The conversion step snaps each incoming pixel to its nearest key. Two keys
     * close together would make that snap a coin toss on exactly the pixels an
     * artist was least careful about — and the failure would be invisible,
     * because both answers are legal colours.
     *
     * `denim` and `sole` deliberately stop at two steps for this reason: their
     * third is `ink-900`, which is the outline.
     */
    const keys = paintedKeys();
    for (const one of keys) {
      for (const other of keys) {
        if (one.index >= other.index) continue;
        const channels = (hex: string): readonly number[] => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
        const [r1, g1, b1] = channels(one.hex) as [number, number, number];
        const [r2, g2, b2] = channels(other.hex) as [number, number, number];
        const distance = Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
        expect(distance, `${one.name} and ${other.name} are ${distance.toFixed(1)} apart`).toBeGreaterThan(20);
      }
    }
  });

  it('numbers its keys by position, so a stored mask cannot be repainted by a reorder', () => {
    MASK_KEYS.forEach((key, at) => {
      expect(key.index).toBe(at);
    });
  });

  it('is the only key with no tone at index 0', () => {
    expect(MASK_KEYS[TRANSPARENT_KEY]?.tone).toBeNull();
    for (const key of MASK_KEYS.slice(1)) expect(key.tone, key.name).not.toBeNull();
  });

  it('agrees with the sprite canvas', () => {
    expect(MASK_CANVAS).toEqual(CANVAS);
  });
});

/* ------------------------------------------------------- the encoding -- */

describe('encoding', () => {
  it('round-trips a real mask exactly', () => {
    const keys = fixtureBuildMask();
    expect([...decodeKeys(encodeMask('avatar_body_starter_04', keys))]).toEqual([...keys]);
  });

  it('refuses a run list that decodes to the wrong number of cells', () => {
    expect(() =>
      decodeKeys({ slug: 'x', width: MASK_CANVAS.width, height: MASK_CANVAS.height, rle: '0.10' }),
    ).toThrow(/cells/);
  });

  it('refuses a key the vocabulary does not have', () => {
    expect(() =>
      decodeKeys({ slug: 'x', width: MASK_CANVAS.width, height: MASK_CANVAS.height, rle: '99.4' }),
    ).toThrow(/unknown key/);
  });

  it('refuses a malformed run', () => {
    expect(() =>
      decodeKeys({ slug: 'x', width: MASK_CANVAS.width, height: MASK_CANVAS.height, rle: '1.zz' }),
    ).toThrow(/malformed/);
  });

  it('turns keys into the tones the compositor already understands', () => {
    const grid = maskToneGrid(encodeMask('x', fixtureBuildMask()));
    const seen = new Set<string>();
    for (const row of grid) for (const tone of row) if (tone !== null) seen.add(tone);

    expect(seen.has('outline')).toBe(true);
    expect([...seen].some((tone) => tone.startsWith('skin:'))).toBe(true);
    expect([...seen].some((tone) => tone.startsWith('fixed:'))).toBe(true);
    expect(coverage(grid)).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------ registration -- */

describe('validation refuses artwork the renderer would have to be bent around', () => {
  const canvas = MASK_CANVAS.width * MASK_CANVAS.height;
  const failures = (keys: readonly number[]): readonly string[] =>
    validateBuildMask(keys)
      .filter((problem) => problem.severity === 'fail')
      .map((problem) => problem.message);

  it('passes a valid build', () => {
    expect(failures(fixtureBuildMask())).toEqual([]);
  });

  it('refuses an empty plate', () => {
    expect(failures(Array.from({ length: canvas }, () => TRANSPARENT_KEY))).toEqual([
      'the mask is empty',
    ]);
  });

  it('refuses paint in the head plate’s rows', () => {
    const keys = [...fixtureBuildMask()];
    keys[10 * MASK_CANVAS.width + 56] = 3;
    expect(failures(keys).join(' ')).toMatch(/leave rows 0–52 clear/);
  });

  it('refuses a figure that does not stand on the contact row', () => {
    const keys = [...fixtureBuildMask()];
    for (let x = 0; x < MASK_CANVAS.width; x++) {
      keys[BUILD_REGISTRATION.contactRow * MASK_CANVAS.width + x] = TRANSPARENT_KEY;
    }
    expect(failures(keys).join(' ')).toMatch(/lowest painted row is 166/);
  });

  it('refuses a collar that leaves the neck open', () => {
    const keys = [...fixtureBuildMask()];
    for (let x = BUILD_REGISTRATION.neckColumns.from; x <= BUILD_REGISTRATION.neckColumns.to; x++) {
      keys[BUILD_REGISTRATION.neckClosedAtRow * MASK_CANVAS.width + x] = TRANSPARENT_KEY;
    }
    expect(failures(keys).join(' ')).toMatch(/neck is open/);
  });

  it('refuses a silhouette that is not enclosed', () => {
    /*
     * The one check that would pass on a beautiful painting. An unenclosed
     * figure looks fine on a white canvas and dissolves into a dark basement
     * wall, which is the surface it is actually seen on.
     */
    const keys = [...fixtureBuildMask()];
    let repainted = 0;
    for (let at = 0; at < keys.length && repainted < 40; at++) {
      if (keys[at] === 1) {
        keys[at] = 3;
        repainted++;
      }
    }
    expect(failures(keys).join(' ')).toMatch(/without an outline/);
  });

  it('refuses a plate with a background painted behind the figure', () => {
    expect(failures(Array.from({ length: canvas }, () => 3)).join(' ')).toMatch(/is there a background/);
  });

  it('reads its registration off the production geometry, never its own copy', () => {
    // A jig, a validator and a brief that each held their own idea of where the
    // neck is would agree until the day they did not.
    expect(BUILD_REGISTRATION.contactRow).toBe(CANVAS.height - 1);
  });
});

/* ------------------------------------------------------- the body split -- */

describe('splitting the drawn body', () => {
  it('draws exactly what it drew before, in the same order', () => {
    /*
     * The split exists so a painted build can replace the half below the neck.
     * It must cost the unpainted path nothing at all — and "nothing at all"
     * means pixel-identical, because the drawn figure is what every manager
     * still sees.
     */
    expect(BODY).toEqual([...BODY_BELOW, ...BODY_HEAD]);

    const before = shade(rasterise(BODY, CANVAS.width, CANVAS.height));
    const after = shade(
      rasterise([...BODY_BELOW, ...BODY_HEAD], CANVAS.width, CANVAS.height),
    );
    expect(after).toEqual(before);
  });

  it('puts the head above the neck and the figure below it', () => {
    const head = shade(rasterise(BODY_HEAD, CANVAS.width, CANVAS.height));
    const below = shade(rasterise(BODY_BELOW, CANVAS.width, CANVAS.height));

    // The head plate reaches no further down than the neck it carries.
    let headLowest = 0;
    let belowHighest: number = CANVAS.height;
    for (let y = 0; y < CANVAS.height; y++) {
      for (let x = 0; x < CANVAS.width; x++) {
        if (head[y]?.[x] != null) headLowest = Math.max(headLowest, y);
        if (below[y]?.[x] != null) belowHighest = Math.min(belowHighest, y);
      }
    }
    expect(headLowest).toBeLessThan(BUILD_REGISTRATION.neckClosedAtRow + 2);
    expect(belowHighest).toBeGreaterThan(BUILD_REGISTRATION.headClearBelow);
  });
});
