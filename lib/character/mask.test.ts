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
  pendingKeys,
  validateBuildMask,
  type MaskPlate,
} from './mask';
import { fixtureBuildMask } from './mask.fixture';
import { HOUSE } from './palette';
import { coverage, rasterise, shade } from './sprite';

/** Every plate a delivery can be, so a vocabulary rule is checked on all of them. */
const PLATES: readonly MaskPlate[] = ['build', 'head', 'hair'];

/** Plain Euclidean sRGB, the metric `nearestKey` snaps with. */
const apart = (one: string, other: string): number => {
  const channels = (hex: string): readonly number[] =>
    [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  const [r1, g1, b1] = channels(one) as [number, number, number];
  const [r2, g2, b2] = channels(other) as [number, number, number];
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
};

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
  it('renders only into the locked palette, whatever it is encoded in', () => {
    /*
     * **The encoding colour is unconstrained and the rendered colour is not.**
     *
     * An earlier version of this test asserted that a `pending` key must be
     * encoded in a colour the palette does *not* have. That was never the
     * invariant — it was a coincidence of the first three pending steps, and
     * `Skin highlight` broke it immediately by being encoded in `amber-glow`,
     * which is a locked colour that simply is not the step above `skin-1`.
     *
     * What has to hold is the other direction: whatever a key is *painted* in, it
     * must decode to a tone the renderer can resolve today. `pending` describes a
     * gap in the ramp, not a gap in the palette.
     */
    const legal = new Set<string>(Object.values(HOUSE));

    for (const key of MASK_KEYS) {
      if (key.index === TRANSPARENT_KEY) continue;
      expect(key.tone, `${key.name} must render as something`).not.toBeNull();
    }

    /*
     * Every step the palette *does* have is encoded in the colour it renders as,
     * so a mask stays a readable picture of a real manager.
     *
     * **The hair channel is exempt, and the exemption is the decision rather than
     * an oversight.** Those three keys are green. A hair delivery arrives painted
     * on a head, and the mask is separated from that head by *which key each pixel
     * snapped to* — so a brown hair key beside a brown skin key would put the face
     * into the hairstyle. Legibility is the second of the two properties the
     * module note ranks, and this is the one place it loses to the first. What
     * replaces it as a guarantee is the distance assertion below, which is
     * stronger than the ≥ 20 every other pair gets.
     */
    for (const key of MASK_KEYS) {
      if (key.pending === true || key.index === TRANSPARENT_KEY || key.channel === 'hair') continue;
      expect(legal.has(key.hex), `${key.name} (${key.hex})`).toBe(true);
    }

    expect(pendingKeys().length, 'pending steps are evidence for a palette ruling').toBeGreaterThan(0);
  });

  it('collapses every pending step onto a tone the palette can paint today', () => {
    // The property that lets art be authored deeper than the palette. A pending
    // key that decoded to a tone nothing resolves would render as a hole.
    const renderable = new Set<string>(['outline', 'light', 'base', 'shade']);
    for (const key of pendingKeys()) {
      const tone = String(key.tone).replace(/^skin:/, '').replace(/^fixed:[a-z]+@/i, '');
      expect(renderable.has(tone), `${key.name} decodes to ${String(key.tone)}`).toBe(true);
    }
  });

  it('keeps every pair of keys apart, on each plate', () => {
    /*
     * The conversion step snaps each incoming pixel to its nearest key. Two keys
     * close together would make that snap a coin toss on exactly the pixels an
     * artist was least careful about — and the failure would be invisible,
     * because both answers are legal colours.
     *
     * `denim` and `sole` deliberately stop at two steps for this reason: their
     * third is `ink-900`, which is the outline.
     *
     * **Per plate, because that is what the snap actually offers.** `nearestKey`
     * takes a plate and considers only that plate's keys, so two keys that never
     * appear together cannot be confused whatever their distance. Comparing them
     * anyway is not a stronger check, it is a check of a different claim — and it
     * would refuse a correct vocabulary for a collision that cannot happen. The
     * cross-plate pairs this stops comparing are covered instead by the
     * wrong-plate test below, which is about registration rather than colour.
     */
    for (const plate of PLATES) {
      const keys = paintedKeys(plate);
      for (const one of keys) {
        for (const other of keys) {
          if (one.index >= other.index) continue;
          const distance = apart(one.hex, other.hex);
          expect(
            distance,
            `on a ${plate} plate, ${one.name} and ${other.name} are ${distance.toFixed(1)} apart`,
          ).toBeGreaterThan(20);
        }
      }
    }
  });

  it('keeps hair far enough from skin to be separated from it', () => {
    /*
     * **A much higher bar than ≥ 20, and the reason is that this pair is not
     * merely snapped — it is *partitioned*.** A hairstyle is delivered drawn on a
     * head and `extractHairChannel` keeps the hair pixels and drops the rest, so
     * every ambiguous pixel between the two ramps is a piece of somebody's face
     * moved into their fringe or a piece of their fringe deleted.
     *
     * Round 2's head is the measured precedent: `skin-2` and `wood-pale` are 45
     * apart and a quarter of that head snapped onto boot keys. 45 is therefore
     * known to be too close, and this asks for more than twice it.
     */
    const hair = paintedKeys('hair').filter((key) => key.channel === 'hair');
    const kept = paintedKeys('hair').filter(
      (key) => key.channel !== 'hair' && key.step !== 'outline',
    );
    expect(hair.length, 'the hair plate has a hair channel').toBe(3);
    expect(kept.length, 'and a head under it to be separated from').toBeGreaterThan(3);

    for (const one of hair) {
      for (const other of kept) {
        const distance = apart(one.hex, other.hex);
        expect(distance, `${one.name} and ${other.name} are ${distance.toFixed(1)} apart`).toBeGreaterThan(100);
      }
    }
  });

  it('keeps hair away from ink, because a pixel that snaps to the outline is deleted', () => {
    /*
     * **The other half of the extraction, and the one that fails silently.**
     * `extractHairChannel` discards the delivered outline whole and re-derives it,
     * because the jaw's ink and the fringe's ink are the same colour and choosing
     * between them would be a guess. So a hair pixel that snapped to the outline
     * key is not recoloured — it is gone, and it comes back as a hole in the
     * hairstyle rather than as anything a registration check can name.
     *
     * A dark hairstyle's shade step is where that happens. The house `green-deep`
     * was the obvious encoding for it and sits 64 from `ink-900`; this is why it
     * is not used.
     */
    const outline = MASK_KEYS[1]!;
    for (const key of paintedKeys('hair').filter((one) => one.channel === 'hair')) {
      const distance = apart(key.hex, outline.hex);
      expect(distance, `${key.name} is ${distance.toFixed(1)} from the outline`).toBeGreaterThan(100);
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
    expect([...decodeKeys(encodeMask('avatar_body_starter_04', 'build', keys))]).toEqual([...keys]);
  });

  it('refuses a run list that decodes to the wrong number of cells', () => {
    expect(() =>
      decodeKeys({ slug: 'x', plate: 'build', width: MASK_CANVAS.width, height: MASK_CANVAS.height, rle: '0.10' }),
    ).toThrow(/cells/);
  });

  it('refuses a key the vocabulary does not have', () => {
    expect(() =>
      decodeKeys({ slug: 'x', plate: 'build', width: MASK_CANVAS.width, height: MASK_CANVAS.height, rle: '99.4' }),
    ).toThrow(/unknown key/);
  });

  it('refuses a malformed run', () => {
    expect(() =>
      decodeKeys({ slug: 'x', plate: 'build', width: MASK_CANVAS.width, height: MASK_CANVAS.height, rle: '1.zz' }),
    ).toThrow(/malformed/);
  });

  it('turns keys into the tones the compositor already understands', () => {
    const grid = maskToneGrid(encodeMask('x', 'build', fixtureBuildMask()));
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
    /*
     * Painted below the head-clearance row, so the coverage check is what
     * answers rather than head clearance. Round 1 arrived with a black field and
     * a warm glow behind the figure — an entirely reasonable thing for an image
     * model to add, and it makes every pixel of the canvas opaque.
     */
    const keys = Array.from({ length: canvas }, (_, at) =>
      Math.floor(at / MASK_CANVAS.width) > BUILD_REGISTRATION.headClearBelow ? 4 : TRANSPARENT_KEY,
    );
    expect(failures(keys).join(' ')).toMatch(/is a background, a vignette/);
  });

  /**
   * Shift the fixture down the canvas, keeping its shape.
   *
   * A figure that starts too **high** is caught by head clearance; one that
   * starts too **low** — drawn small, or floating — is what the shoulder band is
   * for. Those are the two ways framing goes wrong and they have two messages.
   */
  const shifted = (by: number): readonly number[] => {
    const source = fixtureBuildMask();
    const out = Array.from({ length: canvas }, () => TRANSPARENT_KEY);
    for (let y = 0; y + by < MASK_CANVAS.height; y++) {
      for (let x = 0; x < MASK_CANVAS.width; x++) {
        out[(y + by) * MASK_CANVAS.width + x] = source[y * MASK_CANVAS.width + x]!;
      }
    }
    return out;
  };

  it('refuses a figure that starts below the shoulders, and says so by name', () => {
    /*
     * **This is the round-1 diagnosis, generalised.** That build was excellent art
     * framed as a standalone portrait — it filled the canvas instead of sitting in
     * the two thirds below the head. Contact row and coverage would each have
     * caught it, but neither *names* the problem, and a refusal that does not name
     * the problem costs a whole generation round to work out.
     */
    expect(failures(shifted(30)).join(' ')).toMatch(/outside the shoulder band/);
  });

  it('tells a frame-filling figure what it actually did wrong', () => {
    // The other direction: too high is head clearance, and the message has to
    // carry the diagnosis rather than just the row number.
    const keys = [...fixtureBuildMask()];
    for (let x = 40; x < 70; x++) keys[12 * MASK_CANVAS.width + x] = 4;
    expect(failures(keys).join(' ')).toMatch(/drawn to fill the frame/);
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
