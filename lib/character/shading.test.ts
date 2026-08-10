import { describe, expect, it } from 'vitest';

import { toneGrid } from './art';
import { SHORT_SLEEVE_END } from './art/garment';
import {
  ARM,
  AXIS,
  CANVAS,
  EAR,
  FACE,
  HAND,
  HEAD,
  LEG,
  SHOE,
  TORSO,
  mirror,
  mirrorCentre,
} from './art/geometry';
import { compositeRuns, composeCharacter, DEFAULT_CONFIGURATION } from './composite';
import { HAIR_COLOURS, HOUSE, SKIN_TONES, TOP_COLOURS } from './palette';
import { rasterise, shade, type Op, type Tone } from './sprite';

/**
 * The shading engine, held by the properties a picture would show and a unit
 * test would not.
 *
 * ## Why this file exists at all
 *
 * The sprite-quality pass shipped a transposed index in `runDepths`: every depth
 * came back `1`, the edge test fired on every solid pixel, and **the entire
 * figure rendered as outline**. Every one of the seventy-six character tests
 * passed. They had to — each of them asks whether a layer is drawn, inside the
 * canvas, standing on the floor, made of legal colours, and overlapping the
 * layer it must overlap, and a figure painted uniformly in its own outline
 * colour is all of those things.
 *
 * What none of them asked is whether the drawing has any **tonal structure** at
 * all. So that is what is here: the pass must put light where the light is, dark
 * where it is not, and both in quantities that a person would notice.
 */

const canvas = (ops: readonly Op[]) => shade(rasterise(ops, CANVAS.width, CANVAS.height));

const tally = (grid: readonly (readonly (Tone | null)[])[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const row of grid) {
    for (const tone of row) {
      if (tone === null) continue;
      const key = tone.startsWith('fixed:') ? `fixed@${tone.slice(tone.indexOf('@') + 1)}` : tone;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
};

describe('the form pass', () => {
  it('gives a solid block all four tones, in the proportions of a lit form', () => {
    /*
     * The direct regression on the transposed index. A forty-square block has an
     * unambiguous answer: an outline all the way round, a lit rim on the upper
     * left, a shadow band on the lower right, and **most of it base**.
     *
     * The old failure put 100% in `outline` and 0% everywhere else, so the
     * assertion that matters most is the last one.
     */
    const counts = tally(canvas([{ kind: 'rect', x: 20, y: 20, w: 40, h: 40, material: 'main' }]));
    const total = 40 * 40;

    expect(counts['outline']).toBe(40 * 4 - 4);
    expect(counts['light'], 'no lit side').toBeGreaterThan(0);
    expect(counts['shade'], 'no shaded side').toBeGreaterThan(0);
    expect(counts['base'], 'the form is all edge').toBeGreaterThan(total * 0.5);
  });

  it('puts the light up and left of the shadow, on the same block', () => {
    // The direction itself, as the centre of mass of each tone rather than as a
    // spot check: a sign error moves both, and moves them together.
    const grid = canvas([{ kind: 'rect', x: 20, y: 20, w: 40, h: 40, material: 'main' }]);

    const centre = (want: Tone) => {
      let n = 0;
      let sx = 0;
      let sy = 0;
      grid.forEach((row, y) =>
        row.forEach((tone, x) => {
          if (tone !== want) return;
          n++;
          sx += x;
          sy += y;
        }),
      );
      return { x: sx / n, y: sy / n };
    };

    const lit = centre('light');
    const dark = centre('shade');
    expect(lit.x, 'the light is not to the left').toBeLessThan(dark.x);
    expect(lit.y, 'the light is not above').toBeLessThan(dark.y);
  });

  it('scales its bands to the form rather than using a fixed width', () => {
    /*
     * The same constants have to serve a nine-pixel drawstring and a fifty-pixel
     * torso. A fixed band is either invisible on one or the whole of the other.
     */
    const bandOf = (size: number): number => {
      const grid = canvas([{ kind: 'rect', x: 5, y: 5, w: size, h: size, material: 'main' }]);
      const mid = Math.floor(5 + size / 2);
      let shaded = 0;
      for (let x = 5; x < 5 + size; x++) if (grid[mid]?.[x] === 'shade') shaded++;
      return shaded;
    };

    expect(bandOf(50), 'a big form gets no more shadow than a small one').toBeGreaterThan(
      bandOf(12),
    );
  });

  it('leaves a mark too thin to have an interior alone', () => {
    /*
     * The hoodie's drawstrings. Two cream pixels wide, every one of them touching
     * empty, so an unconditional outline claimed the whole cord and painted it
     * `ink-900` — for as long as the hoodie has existed.
     */
    const grid = canvas([{ kind: 'rect', x: 40, y: 20, w: 2, h: 20, material: 'fixed:cream' }]);
    const counts = tally(grid);

    expect(counts['outline'] ?? 0, 'a thin fixed mark was repainted as outline').toBe(0);
    expect(counts['fixed@base']).toBe(40);
  });

  it('still outlines a fixed-colour shape that does have an interior', () => {
    // The other half of the same rule, and the defect it was written against:
    // the beanie's cream pom, un-outlined, was invisible against a cream panel.
    const grid = canvas([
      { kind: 'ellipse', cx: 40, cy: 40, rx: 8, ry: 8, material: 'fixed:cream' },
    ]);
    expect(tally(grid)['outline'] ?? 0).toBeGreaterThan(20);
  });

  it('never lets a manager-coloured silhouette go un-outlined, however thin', () => {
    // The figure's own edge has to hold against a dark basement wall whatever it
    // is made of. Only *fixed* marks are exempt, and only for their own colour.
    const grid = canvas([{ kind: 'rect', x: 40, y: 20, w: 1, h: 20, material: 'main' }]);
    expect(tally(grid)).toEqual({ outline: 20 });
  });
});

describe('the composite passes', () => {
  const runs = compositeRuns(composeCharacter(DEFAULT_CONFIGURATION));

  const painted = (): (string | null)[][] => {
    const grid: (string | null)[][] = Array.from({ length: CANVAS.height }, () =>
      Array.from({ length: CANVAS.width }, () => null),
    );
    for (const run of runs) {
      for (let y = run.y; y < run.y + run.h; y++) {
        for (let x = run.x; x < run.x + run.w; x++) grid[y]![x] = run.value;
      }
    }
    return grid;
  };

  it('draws the figure in more than a handful of colours', () => {
    /*
     * The whole-system version of the form-pass regression. A default character
     * resolves five ramps of three steps plus ink; anything under eight distinct
     * colours means a stage of the pipeline collapsed and the picture is flat.
     */
    const distinct = new Set(runs.map((run) => run.value));
    expect(distinct.size, `only ${String(distinct.size)} colours in the whole figure`)
      .toBeGreaterThan(8);
  });

  it('has no hole in it, on any top', () => {
    /*
     * **The defect this is written against shipped twice in one afternoon and
     * looked like a style choice both times.**
     *
     * The arm's inner edge and the torso's outer edge were authored to *meet*.
     * They did — at the shoulder, where a round cap covers the join. Below it the
     * torso narrows towards the waist and the arm narrows towards the wrist, so
     * the two edges walked apart and left a two-column gap down each side of the
     * figure, from the armpit to the hem, with the room showing through it. In a
     * thumbnail it reads as a deliberate dark seam. It is a hole.
     *
     * Flood-filled from outside rather than asserted per row, because the shape
     * of the next hole is not predictable and a row test would have to be
     * rewritten for it. Anything empty and unreachable from the edge of the
     * canvas is a hole, whatever made it.
     */
    for (let top = 0; top < 6; top++) {
      const grid: boolean[][] = Array.from({ length: CANVAS.height }, () =>
        Array.from({ length: CANVAS.width }, () => false),
      );
      for (const run of compositeRuns(composeCharacter({ ...DEFAULT_CONFIGURATION, top }))) {
        for (let y = run.y; y < run.y + run.h; y++) {
          for (let x = run.x; x < run.x + run.w; x++) grid[y]![x] = true;
        }
      }

      const seen = Array.from({ length: CANVAS.height }, () =>
        Array.from({ length: CANVAS.width }, () => false),
      );
      const queue: [number, number][] = [];
      for (let x = 0; x < CANVAS.width; x++) {
        queue.push([x, 0], [x, CANVAS.height - 1]);
      }
      for (let y = 0; y < CANVAS.height; y++) {
        queue.push([0, y], [CANVAS.width - 1, y]);
      }

      while (queue.length > 0) {
        const [x, y] = queue.pop()!;
        if (x < 0 || y < 0 || x >= CANVAS.width || y >= CANVAS.height) continue;
        if (seen[y]![x] || grid[y]![x]) continue;
        seen[y]![x] = true;
        queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }

      let enclosed = 0;
      for (let y = 0; y < CANVAS.height; y++) {
        for (let x = 0; x < CANVAS.width; x++) {
          if (!grid[y]![x] && !seen[y]![x]) enclosed++;
        }
      }
      expect(enclosed, `top ${String(top)} leaves ${String(enclosed)} pixels of room showing through the figure`)
        .toBe(0);
    }
  });

  it('draws the figure’s outer edge in ink all the way round', () => {
    /*
     * Half of "selective outlines, not blunt uniform ones" — the half that must
     * *not* change. The silhouette is what has to hold up against a dark basement
     * wall, and softening it is the obvious over-correction.
     */
    const grid = painted();
    const ink = HOUSE['ink-900'];
    const empty = (x: number, y: number): boolean =>
      x < 0 || y < 0 || x >= CANVAS.width || y >= CANVAS.height || grid[y]![x] === null;

    let edge = 0;
    let inked = 0;
    for (let y = 0; y < CANVAS.height; y++) {
      for (let x = 0; x < CANVAS.width; x++) {
        if (grid[y]![x] === null) continue;
        if (!(empty(x - 1, y) || empty(x + 1, y) || empty(x, y - 1) || empty(x, y + 1))) continue;
        edge++;
        if (grid[y]![x] === ink) inked++;
      }
    }
    expect(edge).toBeGreaterThan(200);
    expect(inked / edge, 'the figure’s own edge is not ink').toBeGreaterThan(0.98);
  });

  it('draws the hairline seam in the hair’s own shade, not in the silhouette ink', () => {
    /*
     * The other half, as the one seam every manager has. Where hair meets
     * forehead there is an outline pixel that touches nothing empty: it is not
     * the figure's edge, it is a boundary between two layers, and drawn in the
     * same `ink-900` as the silhouette it is what makes a character read as
     * stacked cut-outs.
     *
     * Stated as a colour rather than as a count, because a count would pass on a
     * figure whose seams had all been deleted instead of softened.
     */
    const grid = painted();
    const ramp = HAIR_COLOURS[DEFAULT_CONFIGURATION.hairColour]!;
    const hair = toneGrid(composeCharacter(DEFAULT_CONFIGURATION).layers
      .find((layer) => layer.layer === 'base-hair')!.slug)!;

    let seam: string | null | undefined = null;
    for (let y = CANVAS.height - 1; y >= 0; y--) {
      if (hair[y]?.[AXIS] != null) {
        seam = grid[y]![AXIS];
        break;
      }
    }

    expect(seam, 'no hairline found at all').not.toBeNull();
    expect(seam, 'the hairline is drawn in the silhouette ink').not.toBe(HOUSE['ink-900']);
    expect([HOUSE[ramp.shade], HOUSE[ramp.base]]).toContain(seam);
  });

  it('casts a contact shadow from a layer onto what is under it', () => {
    /*
     * The sleeve on the forearm, the hem on the trousers, the fringe on the brow.
     * None of it is authored; all of it comes from the composite knowing the
     * order.
     *
     * Measured on the **forearm below a short sleeve** — the one place a top
     * changes the body's lighting without covering it. Counting shade across the
     * whole figure instead looks like the same question and is not: a top covers
     * far more skin than it shadows, so the total falls when a shirt goes on and
     * the test fails on a working shadow.
     */
    const shadeColour = HOUSE[SKIN_TONES[DEFAULT_CONFIGURATION.skin]!.shade];

    const forearmShade = (withTop: boolean): number => {
      // Index 3 is the football jersey: short sleeves, so the forearm shows.
      const composite = composeCharacter({ ...DEFAULT_CONFIGURATION, top: 3 });
      const layers = withTop
        ? composite.layers
        : composite.layers.filter((layer) => layer.layer === 'base-body');

      return compositeRuns({ ...composite, layers })
        .filter(
          (run) =>
            run.value === shadeColour &&
            run.y >= SHORT_SLEEVE_END &&
            run.y < SHORT_SLEEVE_END + 4 &&
            run.x < TORSO.left,
        )
        .reduce((total, run) => total + run.w * run.h, 0);
    };

    expect(forearmShade(true), 'a sleeve throws no shadow on the arm below it').toBeGreaterThan(
      forearmShade(false),
    );
  });

  it('paints eyebrows in the hair colour rather than in skin', () => {
    /*
     * They used to be the body's shade tone, which made every manager's eyebrows
     * their own skin one step down — invisible on the pale tones and wrong on all
     * of them. They belong to the hair layer now, so this is a question about
     * which layer owns a feature, not about a colour.
     */
    const grid = painted();
    const ramp = HAIR_COLOURS[DEFAULT_CONFIGURATION.hairColour]!;
    const hairColours = new Set<string>([
      HOUSE[ramp.base],
      HOUSE[ramp.shade],
      HOUSE[ramp.light ?? ramp.base],
    ]);

    let brow = 0;
    for (let y = FACE.browY; y < FACE.browY + 3; y++) {
      for (let x = FACE.eyeLeft; x < FACE.eyeLeft + FACE.eyeWidth; x++) {
        if (hairColours.has(grid[y]![x] ?? '')) brow++;
      }
    }
    expect(brow, 'the eyebrows are not drawn in the hair colour').toBeGreaterThan(0);
  });

  it('gives the trousers their own light and shade, like everything else', () => {
    // Eighteen rows of every manager, on every screen. They were one flat navy
    // rectangle with a seam for as long as fixed colours were single hexes.
    const grid = painted();
    const legRow = LEG.top + 20;
    const distinct = new Set<string>();
    for (let x = LEG.leftX; x < LEG.leftX + LEG.width; x++) {
      const value = grid[legRow]![x];
      if (value != null) distinct.add(value);
    }
    expect(distinct.size, 'the trousers are flat').toBeGreaterThan(2);
  });
});

describe('the figure is symmetric about the axis', () => {
  /*
   * Arithmetic rather than a screenshot, because half a pixel of asymmetry is
   * invisible on a phone and unmissable at the customiser's scale — and because
   * the first pass at this canvas had the head's right edge one column wide of
   * its left, which put the whole face off the body it sits on.
   */
  const columns: readonly (readonly [string, number, number])[] = [
    ['the skull', HEAD.left, HEAD.right],
    ['the eyes', FACE.eyeLeft, FACE.eyeRight + FACE.eyeWidth - 1],
    ['the arms', ARM.leftX, ARM.rightX + ARM.width - 1],
    ['the legs', LEG.leftX, LEG.rightX + LEG.width - 1],
    ['the boots', SHOE.leftX, SHOE.rightX + SHOE.width - 1],
  ];

  const centres: readonly (readonly [string, number, number])[] = [
    ['the ears', EAR.leftCx, EAR.rightCx],
    ['the hands', HAND.leftCx, HAND.rightCx],
  ];

  it.each(columns)('mirrors %s', (_what, left, right) => {
    expect(mirror(left)).toBe(right);
  });

  it.each(centres)('mirrors %s, which are ellipse centres and not columns', (_what, left, right) => {
    expect(mirrorCentre(left)).toBe(right);
  });

  it('centres the torso and the axis on the canvas', () => {
    expect(TORSO.left + TORSO.right).toBe(CANVAS.width);
    expect(AXIS * 2).toBe(CANVAS.width);
  });

  it('draws the base body symmetrically, which is what those numbers are for', () => {
    /*
     * The constants agreeing is necessary and not sufficient: a layer can still
     * be authored off-centre between them. This measures the drawing.
     */
    const grid = toneGrid('avatar_body_base')!;
    let asymmetric = 0;
    for (let y = 0; y < CANVAS.height; y++) {
      for (let x = 0; x < CANVAS.width / 2; x++) {
        const here = grid[y]![x] !== null;
        const there = grid[y]![mirror(x)] !== null;
        if (here !== there) asymmetric++;
      }
    }
    /*
     * Not zero: the nose and the temple shadow are deliberately one-sided,
     * because a face lit from one side is not a mirror of itself. Those are
     * *tone* differences within a symmetric silhouette, so what is counted here
     * is coverage — and a limb in the wrong place would be hundreds.
     */
    expect(asymmetric, 'the body silhouette is not symmetric').toBeLessThan(20);
  });
});

describe('the palette gained a third step without gaining a colour', () => {
  const locked = new Set(Object.keys(HOUSE));

  it.each([
    ['skin', SKIN_TONES],
    ['hair', HAIR_COLOURS],
    ['top', TOP_COLOURS],
  ] as const)('keeps every %s highlight inside the locked 32', (_name, ramps) => {
    for (const ramp of ramps) {
      if (ramp.light === null) continue;
      expect(locked.has(ramp.light), `${ramp.name} highlight`).toBe(true);
    }
  });

  it('declines the highlight on exactly the ramps whose palette family has no step above', () => {
    /*
     * `Bottle green` and `Grape` sit at the dark end of a two-colour family whose
     * other member is a neon. Promoting it would put a highlight four times
     * brighter than the garment on the shoulder of a sweater, so they carry
     * `light: null` and draw flat. Pinned as a decision rather than left to be
     * "fixed" by somebody reaching for `green-neon`.
     */
    const flat = TOP_COLOURS.filter((ramp) => ramp.light === null).map((ramp) => ramp.name);
    expect(flat).toEqual(['Bottle green', 'Grape']);
    expect(SKIN_TONES.every((ramp) => ramp.light !== null)).toBe(true);
    expect(HAIR_COLOURS.every((ramp) => ramp.light !== null)).toBe(true);
  });

  it('never lights a ramp with a colour darker than its own base', () => {
    // A "highlight" one step the wrong way is a shadow, and it would be visible
    // only as the figure looking subtly inside-out.
    const luminance = (name: keyof typeof HOUSE): number => {
      const value = HOUSE[name];
      const r = parseInt(value.slice(1, 3), 16);
      const g = parseInt(value.slice(3, 5), 16);
      const b = parseInt(value.slice(5, 7), 16);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    for (const ramps of [SKIN_TONES, HAIR_COLOURS, TOP_COLOURS]) {
      for (const ramp of ramps) {
        if (ramp.light === null) continue;
        expect(luminance(ramp.light), `${ramp.name} light`).toBeGreaterThan(luminance(ramp.base));
        expect(luminance(ramp.base), `${ramp.name} shade`).toBeGreaterThan(luminance(ramp.shade));
      }
    }
  });
});
