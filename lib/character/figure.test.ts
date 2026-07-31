import { describe, expect, it } from 'vitest';

import { PALETTES, WEARABLES, variantsFor } from './catalog';
import { composeCharacter, type Equipment } from './composite';
import {
  FIGURES,
  FIGURE_CANVAS,
  boundingBox,
  figureFor,
  figuredSlugs,
  fillColour,
  isConnected,
  rowsOverlap,
  type FigureRect,
} from './figure';
import { BASE_LAYERS, WEARABLE_SLOTS } from './layers';

/**
 * The clipping rules from `docs/M3_CHARACTER_BOUNDARY.md §7`, as arithmetic.
 *
 * The lesson those rules were written from is in `docs/CHECKPOINT.md`: **geometry
 * read off a screenshot is wrong**, and the eye kept confidently reporting it had
 * measured something it had not. Tony shipped cut through the hands twice.
 *
 * Because the placeholder figure is data, these are exact rather than sampled.
 * When real PNGs arrive the same five rules are checked by `art:validate`'s alpha
 * arithmetic against the delivered files — the rules do not change, only where
 * the pixels are read from.
 */

const everySlug = figuredSlugs();

/** Every legal composite. Small enough to enumerate, so it is enumerated. */
function everyCombination(): { configuration: { body: number; hair: number; palette: number }; equipment: Equipment }[] {
  const out: { configuration: { body: number; hair: number; palette: number }; equipment: Equipment }[] = [];
  for (const body of variantsFor('body')) {
    for (const hair of variantsFor('hair')) {
      // One palette per base pair is enough for *geometry*; palette is colour
      // only, and `fillColour` is exhaustively checked separately below.
      out.push({ configuration: { body: body.index, hair: hair.index, palette: 0 }, equipment: {} });
      for (const item of WEARABLES) {
        out.push({
          configuration: { body: body.index, hair: hair.index, palette: 0 },
          equipment: { [item.slot]: item.slug },
        });
      }
    }
  }
  // Every slot filled at once — the case that clips if anything does.
  const fullKit: Record<string, string> = {};
  for (const slot of WEARABLE_SLOTS) {
    const first = WEARABLES.find((item) => item.slot === slot);
    if (first !== undefined) fullKit[slot] = first.slug;
  }
  for (const body of variantsFor('body')) {
    for (const hair of variantsFor('hair')) {
      out.push({ configuration: { body: body.index, hair: hair.index, palette: 0 }, equipment: fullKit });
    }
  }
  return out;
}

/* ------------------------------------------------- the contract -- */

describe('every drawable slug has artwork', () => {
  it('draws every base variant and every wearable', () => {
    for (const slug of everySlug) {
      expect(() => figureFor(slug), `${slug} has no figure`).not.toThrow();
      expect(figureFor(slug).length, `${slug} is empty`).toBeGreaterThan(0);
    }
  });

  it('draws nothing the catalog does not name', () => {
    /*
     * The other direction, and the one that catches the `character_hair_short`
     * mistake — artwork for a slug nobody can select is either a slug that was
     * renamed or a variant somebody forgot to add to the catalog, and both look
     * like "it works" until a manager cannot pick it.
     */
    const known = new Set(everySlug);
    for (const slug of Object.keys(FIGURES)) {
      expect(known.has(slug), `${slug} is drawn but is in no catalog`).toBe(true);
    }
  });

  it('throws for a slug with no artwork rather than drawing nothing', () => {
    expect(() => figureFor('avatar_hair_99')).toThrow(/no placeholder figure/);
  });
});

/* -------------------------------------------------- the geometry -- */

describe('nothing clips', () => {
  it('keeps every rectangle inside the canvas', () => {
    for (const slug of everySlug) {
      for (const shape of figureFor(slug)) {
        expect(shape.x, `${slug} starts left of the canvas`).toBeGreaterThanOrEqual(0);
        expect(shape.y, `${slug} starts above the canvas`).toBeGreaterThanOrEqual(0);
        expect(shape.x + shape.w, `${slug} runs past the right edge`).toBeLessThanOrEqual(
          FIGURE_CANVAS.width,
        );
        expect(shape.y + shape.h, `${slug} runs past the bottom edge`).toBeLessThanOrEqual(
          FIGURE_CANVAS.height,
        );
      }
    }
  });

  it('uses whole units everywhere — this is pixel art', () => {
    /*
     * A fractional rectangle is the seam that appears at one browser zoom and
     * not another, and it is invisible in every screenshot taken at the zoom
     * the author happened to use.
     */
    for (const slug of everySlug) {
      for (const shape of figureFor(slug)) {
        for (const [name, value] of Object.entries(shape) as [string, FigureRect[keyof FigureRect]][]) {
          if (typeof value === 'number') {
            expect(Number.isInteger(value), `${slug} has a fractional ${name}`).toBe(true);
          }
        }
        expect(shape.w, `${slug} has a zero-width rectangle`).toBeGreaterThan(0);
        expect(shape.h, `${slug} has a zero-height rectangle`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps every composite inside the canvas, in every combination', () => {
    for (const { configuration, equipment } of everyCombination()) {
      const composite = composeCharacter(configuration, equipment);
      const shapes = composite.layers.flatMap((layer) => figureFor(layer.slug));
      const box = boundingBox(shapes);
      const label = composite.layers.map((l) => l.slug).join('+');

      expect(box.left, `${label} clips left`).toBeGreaterThanOrEqual(0);
      expect(box.top, `${label} clips at the top`).toBeGreaterThanOrEqual(0);
      expect(box.right, `${label} clips right`).toBeLessThanOrEqual(FIGURE_CANVAS.width);
      expect(box.bottom, `${label} clips at the bottom`).toBeLessThanOrEqual(FIGURE_CANVAS.height);
    }
  });

  it('stands every character on the same floor row', () => {
    /*
     * A hat must not lift somebody off the ground and a long coat must not sink
     * them through it. The contact row is the canvas floor, whatever is worn —
     * which is what makes bottom-centre anchoring mean anything.
     */
    for (const { configuration, equipment } of everyCombination()) {
      const composite = composeCharacter(configuration, equipment);
      const shapes = composite.layers.flatMap((layer) => figureFor(layer.slug));
      expect(
        boundingBox(shapes).bottom,
        `${composite.layers.map((l) => l.slug).join('+')} does not reach the floor`,
      ).toBe(FIGURE_CANVAS.height);
    }
  });
});

describe('nothing floats detached from itself', () => {
  it('draws every layer as one connected piece', () => {
    /*
     * The ponytail shipped as an orange bar **beside** the head: its tail met the
     * cap at a single corner, so it was adjacent to every arithmetic rule here
     * and unattached to the eye. Nothing clipped, the bounding box was right, the
     * contact row was right, and it was only visible at hero scale.
     *
     * Corner contact is exactly the case this excludes. `avatar_hair_05` had the
     * same defect in a subtler place — the strip across the crown met each side
     * patch at a point — and this test is what found it.
     */
    for (const slug of everySlug) {
      expect(isConnected(figureFor(slug)), `${slug} is drawn in more than one piece`).toBe(true);
    }
  });

  it('counts a corner meeting as detached, which is the whole point', () => {
    const corner = [
      { x: 0, y: 0, w: 4, h: 4, fill: 'ink' as const },
      { x: 4, y: 4, w: 4, h: 4, fill: 'ink' as const },
    ];
    const edge = [
      { x: 0, y: 0, w: 4, h: 4, fill: 'ink' as const },
      { x: 4, y: 0, w: 4, h: 4, fill: 'ink' as const },
    ];
    expect(isConnected(corner)).toBe(false);
    expect(isConnected(edge)).toBe(true);
  });
});

describe('what overlaps, overlaps on purpose', () => {
  it('never floats a hat above the hair', () => {
    /*
     * `§7`'s number 5, and the one the boundary document predicted would fail on
     * a *specific pair* rather than systemically — which is why it is a matrix
     * over every combination and not a spot check. `Balding` is the pair that
     * makes it real: its hair sits lower on the skull than every other variant.
     */
    for (const hair of variantsFor('hair')) {
      const hairShapes = figureFor(hair.slug);
      for (const hat of WEARABLES.filter((item) => item.slot === 'head')) {
        expect(
          rowsOverlap(hairShapes, figureFor(hat.slug)),
          `${hat.slug} floats above ${hair.slug}`,
        ).toBe(true);
      }
    }
  });

  it('draws every hairstyle against the head it sits on', () => {
    for (const body of variantsFor('body')) {
      const head = figureFor(body.slug).filter((shape) => shape.fill === 'skin' && shape.h > 5);
      for (const hair of variantsFor('hair')) {
        expect(
          rowsOverlap(head, figureFor(hair.slug)),
          `${hair.slug} floats above ${body.slug}`,
        ).toBe(true);
      }
    }
  });

  it('puts the face wearables on the face', () => {
    for (const body of variantsFor('body')) {
      const eyes = figureFor(body.slug).filter((shape) => shape.fill === 'ink' && shape.y < 20);
      const eyeBox = boundingBox(eyes);
      for (const item of WEARABLES.filter((w) => w.slot === 'face')) {
        const box = boundingBox(figureFor(item.slug));
        expect(box.top, `${item.slug} sits above the face`).toBeGreaterThanOrEqual(eyeBox.top - 2);
        expect(box.bottom, `${item.slug} sits below the face`).toBeLessThanOrEqual(eyeBox.bottom + 4);
      }
    }
  });
});

describe('the extremes the fixtures have to cover', () => {
  /*
   * Named rather than derived. These are the shapes a reviewer should be looking
   * at, and if the artwork changes such that a different item is the extreme,
   * this test says so instead of the fixture quietly photographing the wrong case.
   */
  it('makes the beanie the tallest thing drawn', () => {
    const tops = WEARABLES.map((item) => ({ slug: item.slug, top: boundingBox(figureFor(item.slug)).top }));
    const tallest = tops.reduce((a, b) => (b.top < a.top ? b : a));
    expect(tallest.slug).toBe('wear_head_beanie_winter');
    expect(tallest.top).toBe(0);
  });

  it('makes the pizza peel the widest thing drawn', () => {
    const rights = everySlug.map((slug) => ({ slug, right: boundingBox(figureFor(slug)).right }));
    const widest = rights.reduce((a, b) => (b.right > a.right ? b : a));
    expect(widest.slug).toBe('wear_hand_pizza_peel');
  });

  it('makes the ponytail the widest hairstyle', () => {
    /*
     * Measured as **width**, not as a right edge. The tail hangs on the left so
     * a hand item cannot draw over it, which makes the right edge say nothing
     * about how much room a hairstyle needs.
     */
    const widest = variantsFor('hair')
      .map((v) => {
        const box = boundingBox(figureFor(v.slug));
        return { slug: v.slug, width: box.right - box.left };
      })
      .reduce((a, b) => (b.width > a.width ? b : a));
    expect(widest.slug).toBe('avatar_hair_06');
  });

  it('never draws a hand item over a hairstyle', () => {
    /*
     * The defect this rule was written from: the ponytail hung on the right, the
     * pizza peel is held on the right, `worn-hand` draws last, and a manager who
     * chose both lost their hair entirely. Nothing clipped, nothing failed, and
     * only looking at it showed anything.
     *
     * A rectangle overlap rather than a row overlap — hair and hats *must* share
     * rows (that is the hat-floating rule), so rows alone cannot tell the two
     * cases apart. Columns are what differ.
     */
    const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a): boolean =>
      Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) &&
      Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);

    for (const hair of variantsFor('hair')) {
      for (const item of WEARABLES.filter((w) => w.slot === 'hand')) {
        for (const hairShape of figureFor(hair.slug)) {
          for (const itemShape of figureFor(item.slug)) {
            expect(
              overlaps(hairShape, itemShape),
              `${item.slug} covers part of ${hair.slug}`,
            ).toBe(false);
          }
        }
      }
    }
  });
});

/* ---------------------------------------------------- the colour -- */

describe('colour', () => {
  it('resolves every fill the artwork uses, for every palette', () => {
    for (const slug of everySlug) {
      const isBase = slug.startsWith('avatar_');
      for (const shape of figureFor(slug)) {
        if (isBase) {
          for (const palette of PALETTES) {
            expect(
              () => fillColour(shape.fill, palette.index),
              `${slug} fill ${shape.fill} @${String(palette.index)}`,
            ).not.toThrow();
          }
        } else {
          // A wearable is drawn with `palette: null` — so every fill it uses
          // must be a fixed colour, or the render throws in production.
          expect(() => fillColour(shape.fill, null), `${slug} fill ${shape.fill}`).not.toThrow();
        }
      }
    }
  });

  it('refuses a palette nobody authored rather than drawing something', () => {
    expect(() => fillColour('skin', 99)).toThrow(/palette 99/);
  });

  it('refuses a palette fill on a wearable', () => {
    expect(() => fillColour('skin', null)).toThrow(/needs a palette/);
  });

  it('gives every palette a distinct skin tone', () => {
    const skins = PALETTES.map((palette) => fillColour('skin', palette.index));
    expect(new Set(skins).size).toBe(PALETTES.length);
  });

  it('draws base layers with a palette and wearables without one', () => {
    const composite = composeCharacter(
      { body: 0, hair: 0, palette: 2 },
      { head: 'wear_head_beanie_winter' },
    );
    for (const layer of composite.layers) {
      const base = (BASE_LAYERS as readonly string[]).some((name) => layer.layer === `base-${name}`);
      expect(layer.palette === null, `${layer.slug}`).toBe(!base);
    }
  });
});
