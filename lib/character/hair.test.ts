import { describe, expect, it } from 'vitest';

import { toneGrid } from './art';
import { coverage } from './sprite';
import { CANVAS, FACE, HEAD, NECK } from './art/geometry';
import { HAIR_STYLE_OPTIONS, FACIAL_HAIR_OPTIONS } from './catalog';
import {
  FACIAL_HAIR_REGISTRATION,
  HAIR_REGISTRATION,
  MASK_CANVAS,
  MASK_KEYS,
  TRANSPARENT_KEY,
  decodeKeys,
  encodeMask,
  extractHairChannel,
  maskToneGrid,
  validateBuildMask,
  validateFacialHairMask,
  validateHairMask,
} from './mask';
import { fixtureBuildMask, fixtureHairDelivery, fixtureHeadMask } from './mask.fixture';

/**
 * The hair plate — six hairstyles and four beards, and the step that separates a
 * layer from the head it was drawn on.
 *
 * **The load-bearing suite here is the first one.** Every registration bound on
 * this plate is derived from what the drawn set already occupies, so the test that
 * matters most is not a hand-built bad plate — it is that all ten shipped styles,
 * expressed as keys, pass. A band tighter than the product's own art would refuse
 * a correct repaint of a style that exists, and nobody would find out until the
 * art came back.
 */

const HAIR_KEYS = [20, 21, 22] as const;
const SKIN_BASE = 8;

/** A drawn layer as hair keys, which is what a repaint of it would decode to. */
function asHairLayer(slug: string): readonly number[] {
  const grid = toneGrid(slug);
  if (grid === null) throw new Error(`${slug} draws nothing`);
  const keys: number[] = [];
  for (let y = 0; y < CANVAS.height; y++) {
    for (let x = 0; x < CANVAS.width; x++) {
      const tone = grid[y]?.[x] ?? null;
      keys.push(
        tone === null
          ? TRANSPARENT_KEY
          : tone === 'outline' || tone === 'ink'
            ? 1
            : tone === 'light'
              ? 20
              : tone === 'shade'
                ? 22
                : 21,
      );
    }
  }
  return keys;
}

const failures = (problems: readonly { severity: string; message: string }[]): readonly string[] =>
  problems.filter((problem) => problem.severity === 'fail').map((problem) => problem.message);

/** A blank canvas with a filled rectangle on it, for the bad-plate cases. */
function block(
  x: number,
  y: number,
  w: number,
  h: number,
  key: number = HAIR_KEYS[1],
): number[] {
  const { width, height } = MASK_CANVAS;
  const keys = Array.from({ length: width * height }, () => TRANSPARENT_KEY);
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const px = x + dx;
      const py = y + dy;
      if (px >= 0 && py >= 0 && px < width && py < height) keys[py * width + px] = key;
    }
  }
  // Enclose it, which every plate requires.
  const opaque = (px: number, py: number): boolean =>
    px >= 0 && py >= 0 && px < width && py < height && keys[py * width + px] !== TRANSPARENT_KEY;
  const out = [...keys];
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      if (!opaque(px, py)) continue;
      if (!opaque(px - 1, py) || !opaque(px + 1, py) || !opaque(px, py - 1) || !opaque(px, py + 1)) {
        out[py * width + px] = 1;
      }
    }
  }
  return out;
}

/* ------------------------------------- the bands admit the shipped art -- */

describe('every style the product already ships registers', () => {
  it.each(HAIR_STYLE_OPTIONS.map((option) => [option.name, option.slug!] as const))(
    '%s passes as a hairstyle',
    (_name, slug) => {
      expect(failures(validateHairMask(asHairLayer(slug)))).toEqual([]);
    },
  );

  it.each(
    FACIAL_HAIR_OPTIONS.filter((option) => option.slug !== null).map(
      (option) => [option.name, option.slug!] as const,
    ),
  )('%s passes as facial hair', (_name, slug) => {
    expect(failures(validateFacialHairMask(asHairLayer(slug)))).toEqual([]);
  });

  it('does not pass a hairstyle as facial hair, or the reverse', () => {
    /*
     * The two validators have to actually differ. If a hairstyle satisfied the
     * beard's rules there would be no reason for two functions, and a beard
     * delivered under a hairstyle's slug would land silently on the forehead.
     */
    expect(failures(validateFacialHairMask(asHairLayer('avatar_hair_04'))).join(' ')).toMatch(
      /above/,
    );
    expect(failures(validateHairMask(asHairLayer('avatar_face_hair_02'))).length).toBeGreaterThan(0);
  });
});

/* --------------------------------------------------- what hair refuses -- */

describe('what a hairstyle refuses', () => {
  it('refuses an empty plate', () => {
    expect(
      failures(validateHairMask(Array.from({ length: 112 * 168 }, () => TRANSPARENT_KEY))),
    ).toEqual(['the hairstyle is empty']);
  });

  it('refuses hair painted over an eye', () => {
    /*
     * **The rule that would have caught a layer drawn at the wrong offset**, and
     * it is not theoretical: all ten drawn layers clear both eye rectangles
     * exactly, so any overlap at all is a placement error rather than a style.
     */
    const keys = [...asHairLayer('avatar_hair_01')];
    keys[(FACE.eyeY + 1) * MASK_CANVAS.width + FACE.eyeLeft + 2] = HAIR_KEYS[1];
    expect(failures(validateHairMask(keys)).join(' ')).toMatch(/painted over an eye/);
  });

  it('refuses a style that begins too far above the skull', () => {
    const keys = block(44, HAIR_REGISTRATION.crown.from - 2, 24, 30);
    expect(failures(validateHairMask(keys)).join(' ')).toMatch(/outside the crown band/);
  });

  it('refuses a style that begins below the skull entirely', () => {
    const keys = block(44, HAIR_REGISTRATION.crown.to + 2, 24, 20);
    expect(failures(validateHairMask(keys)).join(' ')).toMatch(/outside the crown band/);
  });

  it('allows the full range the drawn set actually spans', () => {
    // Curly starts at 11 and Receding at 28; a band that admitted only one of
    // those would refuse a correct repaint of the other.
    const top = Math.min(...HAIR_STYLE_OPTIONS.map((option) => topRow(asHairLayer(option.slug!))));
    const bottom = Math.max(
      ...HAIR_STYLE_OPTIONS.map((option) => bottomRow(asHairLayer(option.slug!))),
    );
    expect(top).toBeGreaterThanOrEqual(HAIR_REGISTRATION.crown.from);
    expect(bottom).toBeLessThanOrEqual(HAIR_REGISTRATION.floor);
  });

  it('refuses hair that hangs to the waist', () => {
    const keys = block(44, HEAD.top, 24, HAIR_REGISTRATION.floor + 8 - HEAD.top);
    expect(failures(validateHairMask(keys)).join(' ')).toMatch(/below the floor/);
  });

  it('refuses a style that floats beside the head', () => {
    /*
     * In the crown band, the right size, enclosed, clear of the eyes — and drawn
     * off to one side. Every other check passes; only the skull overlap catches it.
     */
    const keys = block(4, HEAD.top, 22, 26);
    const problems = failures(validateHairMask(keys)).join(' ');
    expect(problems).toMatch(/pixels sit on the skull/);
  });

  it('refuses a whole figure submitted as a hairstyle', () => {
    /*
     * **What replaces cross-plate colour distance.** The hair keys and the boot
     * keys no longer have to be far apart, because a build and a hairstyle are
     * nowhere near each other *geometrically* — and this is the assertion that
     * turns that sentence into a check.
     */
    const problems = failures(validateHairMask(fixtureBuildMask()));
    expect(problems.length).toBeGreaterThan(1);
    expect(problems.join(' ')).toMatch(/below the floor/);
  });

  it('refuses a hairstyle submitted as a build, in the other direction', () => {
    const problems = failures(validateBuildMask(asHairLayer('avatar_hair_03'))).join(' ');
    expect(problems).toMatch(/contact row/);
  });
});

describe('what facial hair refuses', () => {
  it('refuses an empty plate', () => {
    expect(
      failures(validateFacialHairMask(Array.from({ length: 112 * 168 }, () => TRANSPARENT_KEY))),
    ).toEqual(['the facial hair is empty']);
  });

  it('refuses a beard that reaches the brow', () => {
    const keys = block(46, FACE.browY - 1, 20, 20);
    expect(failures(validateFacialHairMask(keys)).join(' ')).toMatch(/above/);
  });

  it('refuses a beard that runs past the collar', () => {
    const keys = block(46, FACE.mouthY - 2, 20, FACIAL_HAIR_REGISTRATION.floor + 6 - FACE.mouthY);
    expect(failures(validateFacialHairMask(keys)).join(' ')).toMatch(/below/);
  });

  it('refuses sideburns that miss the mouth', () => {
    /*
     * Two narrow strips at the right height and the right width, in the right
     * columns, clear of the eyes — and nothing across the mouth. Only the band
     * check names it, which is what makes the band the beard's real registration.
     */
    const keys = block(FACIAL_HAIR_REGISTRATION.columns.from, FACE.mouthY - 3, 4, 9);
    const problems = failures(validateFacialHairMask(keys)).join(' ');
    expect(problems).toMatch(/across the mouth/);
  });

  it('refuses a beard drawn off the face', () => {
    const keys = block(FACIAL_HAIR_REGISTRATION.columns.from - 8, FACE.mouthY - 3, 14, 10);
    expect(failures(validateFacialHairMask(keys)).join(' ')).toMatch(/outside/);
  });
});

/* ----------------------------------------------------- the extraction -- */

describe('separating the hair from the head it was drawn on', () => {
  const DELIVERY = 'avatar_hair_01';

  it('keeps no pixel of the head', () => {
    const delivered = fixtureHairDelivery(DELIVERY);
    const extracted = extractHairChannel(delivered);

    for (const key of extracted) {
      const entry = MASK_KEYS[key]!;
      expect(entry.channel === 'hair' || entry.step === 'outline' || key === TRANSPARENT_KEY).toBe(
        true,
      );
    }
    // And the head really was in there to begin with, or this proves nothing.
    expect(delivered.filter((key) => key === SKIN_BASE).length).toBeGreaterThan(200);
    expect(extracted.filter((key) => key === SKIN_BASE)).toEqual([]);
  });

  it('keeps every hair-keyed pixel exactly where it was', () => {
    const delivered = fixtureHairDelivery(DELIVERY);
    const extracted = extractHairChannel(delivered);
    for (let at = 0; at < delivered.length; at++) {
      if (MASK_KEYS[delivered[at]!]!.channel !== 'hair') continue;
      expect(extracted[at], `cell ${String(at)} was hair`).not.toBe(TRANSPARENT_KEY);
    }
  });

  it.each(HAIR_STYLE_OPTIONS.map((option) => [option.name, option.slug!] as const))(
    'returns %s at very nearly the size it was delivered',
    (_name, slug) => {
      /*
       * **The number that killed the first implementation.** Discarding the
       * delivered ink outright and re-deriving a silhouette eroded every style by
       * a pixel all round — Long came back 705 against 974, which closes a parting
       * and deletes a two-pixel lock outright. Adjacency instead of erasure holds
       * the round trip inside a handful of pixels.
       *
       * Not exact, and the slack is in one direction each way: an ink pixel of the
       * *head* that happens to touch hair is adopted, and a mark drawn entirely in
       * ink has nothing to be adjacent to and is lost. Both are bounded and neither
       * is silent — see `extractHairChannel`.
       */
      const drawn = coverage(toneGrid(slug)!);
      const extracted = extractHairChannel(fixtureHairDelivery(slug)).filter(
        (key) => key !== TRANSPARENT_KEY,
      ).length;
      expect(Math.abs(extracted - drawn), `${String(drawn)} in, ${String(extracted)} out`).toBeLessThanOrEqual(6);
    },
  );

  it('fails loudly on a delivery painted entirely in ink', () => {
    /*
     * The one unrecoverable case, and the reason it is acceptable: hair drawn with
     * no hair-keyed pixel in it cannot be told from the head's outline, so it is
     * dropped — and what comes out is not a *slightly worse* hairstyle, it is an
     * empty plate that the validator refuses by name.
     */
    const delivered = fixtureHairDelivery(DELIVERY).map((key) =>
      MASK_KEYS[key]!.channel === 'hair' ? 1 : key,
    );
    expect(failures(validateHairMask(extractHairChannel(delivered)))).toEqual([
      'the hairstyle is empty',
    ]);
  });

  it('encloses whatever it returns, whoever drew the ink', () => {
    /*
     * `ART_SPEC §4` as a construction rather than as a question to the artist:
     * every pixel on the result's own silhouette is outline, so a hairstyle
     * cannot come back dissolving into a dark basement wall.
     *
     * **One direction only.** Ink is also *kept* where the delivery put it inside
     * the hair — a parting, a strand — and `compositeRuns` draws a non-silhouette
     * outline in the layer's own shade rather than in ink, so those read as dark
     * lines in the hair instead of as holes. Asserting the reverse implication
     * would forbid an artist drawing one.
     */
    const extracted = extractHairChannel(fixtureHairDelivery(DELIVERY));
    const { width, height } = MASK_CANVAS;
    const solid = (x: number, y: number): boolean =>
      x >= 0 && y >= 0 && x < width && y < height && extracted[y * width + x] !== TRANSPARENT_KEY;

    let outlines = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!solid(x, y)) continue;
        const onEdge =
          !solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1);
        if (!onEdge) continue;
        expect(extracted[y * width + x], `(${String(x)}, ${String(y)}) is on the edge`).toBe(1);
        outlines++;
      }
    }
    expect(outlines).toBeGreaterThan(20);
  });

  it('leaves the head\'s own outline behind', () => {
    /*
     * The half the adjacency rule exists for. A jaw is ink and a fringe is ink;
     * keeping both would print a jawline through every manager's hairstyle. The
     * chin is the furthest point of the head's outline from any hairstyle, so it
     * is the cell that proves the rule fired.
     */
    const delivered = fixtureHairDelivery(DELIVERY);
    const extracted = extractHairChannel(delivered);

    // The bottom of the neck: outline in the delivery, and further from this
    // hairstyle than any other part of the head's own edge.
    const neck = (NECK.bottom - 1) * MASK_CANVAS.width + NECK.left;
    expect(delivered[neck], 'the fixture put an outline here').toBe(1);
    expect(extracted[neck]).toBe(TRANSPARENT_KEY);

    // And it is not one lucky pixel — most of the head's outline goes.
    let dropped = 0;
    for (let at = 0; at < delivered.length; at++) {
      if (delivered[at] === 1 && extracted[at] === TRANSPARENT_KEY) dropped++;
    }
    expect(dropped).toBeGreaterThan(50);
  });

  it('produces something the hairstyle validator then accepts', () => {
    // The end-to-end claim: a delivery goes in, a registered layer comes out.
    expect(failures(validateHairMask(extractHairChannel(fixtureHairDelivery(DELIVERY))))).toEqual(
      [],
    );
  });

  it('leaves a head with no hair on it empty rather than nearly empty', () => {
    // A delivery where the artist drew nothing must fail loudly, not produce a
    // sliver that squeaks past coverage.
    const extracted = extractHairChannel(fixtureHeadMask());
    expect(extracted.every((key) => key === TRANSPARENT_KEY)).toBe(true);
    expect(failures(validateHairMask(extracted))).toEqual(['the hairstyle is empty']);
  });
});

/* ------------------------------------------------------- the encoding -- */

describe('a hair mask through the encoding', () => {
  it('round-trips and refuses a key the plate cannot hold', () => {
    const keys = extractHairChannel(fixtureHairDelivery('avatar_hair_02'));
    const mask = encodeMask('avatar_hair_02', 'hair', keys);
    expect([...decodeKeys(mask)]).toEqual([...keys]);

    // A boot key on a hair plate is a module that was hand-edited or snapped
    // under the wrong plate, and it would render as wood-coloured hair.
    expect(() => decodeKeys({ ...mask, rle: `14.${String(112 * 168)}` })).toThrow(
      /not legal on a hair plate/,
    );
  });

  it('decodes to plain tones, so hairColours resolves them with no prefix to strip', () => {
    /*
     * A build's tones carry a `skin:` prefix because a build holds two of the
     * manager's choices at once. A hair layer holds one, so its tones are plain —
     * and a prefix here would fall through `compositeRuns` to the colour pass,
     * which answers an unrecognised key with ink. That is the defect that rendered
     * every face black; it is the same shape one layer over.
     */
    const mask = encodeMask('avatar_hair_02', 'hair', extractHairChannel(fixtureHairDelivery('avatar_hair_02')));
    const seen = new Set<string>();
    for (const row of maskToneGrid(mask)) for (const tone of row) if (tone !== null) seen.add(tone);

    expect(seen.has('outline')).toBe(true);
    expect([...seen].every((tone) => ['outline', 'light', 'base', 'shade'].includes(tone))).toBe(
      true,
    );
  });
});

function topRow(keys: readonly number[]): number {
  for (let y = 0; y < MASK_CANVAS.height; y++) {
    for (let x = 0; x < MASK_CANVAS.width; x++) {
      if (keys[y * MASK_CANVAS.width + x] !== TRANSPARENT_KEY) return y;
    }
  }
  return MASK_CANVAS.height;
}

function bottomRow(keys: readonly number[]): number {
  for (let y = MASK_CANVAS.height - 1; y >= 0; y--) {
    for (let x = 0; x < MASK_CANVAS.width; x++) {
      if (keys[y * MASK_CANVAS.width + x] !== TRANSPARENT_KEY) return y;
    }
  }
  return -1;
}

