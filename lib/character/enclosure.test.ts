import { describe, expect, it } from 'vitest';

import { CANVAS } from './art/geometry';
import { ENCLOSED_AREA_LIMIT, SEAM_BUDGET, enclosedRegions, enclosureProblems } from './enclosure';

/**
 * The narrowed enclosed-space rule, with both historical defects and both
 * legitimate gaps run against it.
 *
 * **The rule was weakened on purpose and this file is the price of that.**
 * Commissioner ruling, 2026-08-11: allow the outlined negative space an approved
 * pose creates, keep catching accidental holes, keep the old rule for drawn
 * builds, and cover both directions explicitly. A narrowing with no test for what
 * it still refuses is a deletion with a comment on it.
 */

/** A blank field with a rectangle of figure in it, so gaps can be cut from it. */
function figure(): boolean[][] {
  const solid = Array.from({ length: CANVAS.height }, () =>
    Array.from({ length: CANVAS.width }, () => false),
  );
  for (let y = 40; y < 160; y++) {
    for (let x = 30; x < 82; x++) solid[y]![x] = true;
  }
  return solid;
}

const cut = (solid: boolean[][], x0: number, y0: number, w: number, h: number): void => {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) solid[y]![x] = false;
  }
};

const painted = (solid: boolean[][]): readonly string[] =>
  enclosureProblems(solid, { painted: true });
const drawn = (solid: boolean[][]): readonly string[] =>
  enclosureProblems(solid, { painted: false });

describe('what a painted build is allowed to enclose', () => {
  it('allows the gap under a bent arm', () => {
    // The accepted T-shirt build's larger gap, to size: 5 x 8, outlined, and the
    // whole reason the old rule had to move.
    const solid = figure();
    cut(solid, 42, 79, 5, 8);
    expect(painted(solid)).toEqual([]);
  });

  it('allows the gap beside a hanging hand', () => {
    // The accepted build's other one: narrower and much longer.
    const solid = figure();
    cut(solid, 72, 93, 4, 19);
    expect(painted(solid)).toEqual([]);
  });

  it('allows both at once, which is the shipped case', () => {
    const solid = figure();
    cut(solid, 42, 79, 5, 8);
    cut(solid, 72, 93, 4, 19);
    expect(painted(solid)).toEqual([]);
  });

  it('tolerates the pinch pockets the downscale leaves, and only just', () => {
    /*
     * Two 2-pixel pockets is what the accepted build actually carries, and they
     * are a property of majority-voting 1024 source pixels down to 112 where two
     * outlines converge. The budget is four short of the smallest real defect.
     */
    const solid = figure();
    cut(solid, 70, 85, 1, 2);
    cut(solid, 73, 110, 1, 2);
    expect(painted(solid)).toEqual([]);
  });
});

describe('what it still refuses — both defects that actually shipped', () => {
  it('refuses the armpit-to-hem seam', () => {
    /*
     * Two columns wide, running most of the figure. It read as a deliberate dark
     * seam in a thumbnail, which is why looking never found it, and it is the
     * defect the original guard was written for.
     */
    const solid = figure();
    cut(solid, 44, 70, 2, 50);
    const problems = painted(solid);
    expect(problems.join(' ')).toMatch(/nowhere 3 pixels across/);
  });

  it('refuses the collarbone hole', () => {
    // Twelve pixels, on two of six tops, where a collar band cut wider than the
    // neck behind it. The smallest defect this rule has ever had to catch.
    const solid = figure();
    cut(solid, 50, 62, 6, 2);
    expect(painted(solid).join(' ')).toMatch(/nowhere 3 pixels across/);
  });

  it('refuses a seam delivered as a chain of tolerable specks', () => {
    /*
     * The reason the budget is a total rather than a per-region allowance. Eight
     * separate 2-pixel pockets are individually below anything worth failing and
     * collectively a seam.
     */
    const solid = figure();
    for (let at = 0; at < 8; at++) cut(solid, 45, 70 + at * 4, 1, 2);
    expect(painted(solid).join(' ')).toMatch(/over the 12-pixel budget/);
  });

  it('refuses a chunk missing from the middle of the figure', () => {
    // Thick everywhere, so thickness cannot see it. The area limit is what does.
    const solid = figure();
    cut(solid, 40, 70, 30, 40);
    expect(painted(solid).join(' ')).toMatch(/over the 3% a pose needs/);
  });

  it('names the place, so a failure is actionable', () => {
    const solid = figure();
    cut(solid, 44, 70, 2, 50);
    expect(painted(solid).join(' ')).toMatch(/\(44, 70\)/);
  });
});

describe('a drawn build keeps the rule it always had', () => {
  it('refuses any enclosed space at all, including a legitimate-looking gap', () => {
    /*
     * **The half of the narrowing that must not leak.** A drawn figure is authored
     * once, in one position, against a shared geometry module — it poses no
     * differently from one top to the next, so it has no legitimate enclosed
     * space and the same gap that is correct on a painted build is a defect here.
     */
    const solid = figure();
    cut(solid, 42, 79, 5, 8);
    expect(drawn(solid).join(' ')).toMatch(/a drawn figure encloses 40 pixels/);
  });

  it('is satisfied by a solid figure', () => {
    expect(drawn(figure())).toEqual([]);
    expect(painted(figure())).toEqual([]);
  });
});

describe('the region walk itself', () => {
  it('does not mistake the space around the figure for enclosed space', () => {
    expect(enclosedRegions(figure())).toEqual([]);
  });

  it('reports a gap that reaches the canvas edge as open, not enclosed', () => {
    // The gap between the legs runs off the bottom of the canvas. It is open to
    // the room and the room is what should show through it.
    const solid = figure();
    for (let y = 120; y < CANVAS.height; y++) {
      for (let x = 52; x < 60; x++) solid[y]![x] = false;
    }
    for (let y = 160; y < CANVAS.height; y++) {
      for (let x = 30; x < 82; x++) solid[y]![x] = true;
    }
    for (let y = 120; y < CANVAS.height; y++) {
      for (let x = 52; x < 60; x++) solid[y]![x] = false;
    }
    expect(enclosedRegions(solid)).toEqual([]);
  });

  it('measures thickness from the shape rather than from its bounding box', () => {
    /*
     * An L is five across and five tall and two thick everywhere. A bounding-box
     * test would call it a space; it is a bent seam.
     */
    const solid = figure();
    cut(solid, 45, 70, 2, 6);
    cut(solid, 45, 74, 6, 2);
    const regions = enclosedRegions(solid);
    expect(regions).toHaveLength(1);
    expect(regions[0]!.hasRoom).toBe(false);
  });

  it('carries the two limits it is calibrated against', () => {
    expect(SEAM_BUDGET).toBe(12);
    expect(ENCLOSED_AREA_LIMIT).toBe(0.03);
  });
});
