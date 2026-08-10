import { ellipse, eraseEllipse, poly, type Material, type Op } from '../sprite';

import { ARM, AXIS, HAND, NECK, TORSO } from './geometry';

/**
 * The parts every garment shares.
 *
 * A chosen top and a worn apron are the same shape problem, and solving it twice
 * is how two things authored months apart end up sitting at two different
 * shoulder heights. Both read these.
 *
 * **The shell traces the body's own shoulder line**, sloped rather than flat —
 * see `body.ts`. A garment cut square across the top of a sloped torso is the
 * failure that makes a shirt look painted onto a signboard, and it is only
 * avoidable because both files read the same six numbers.
 */

/** Where a long sleeve ends — clear of the hand, so the hand is never covered. */
export const SLEEVE_END = HAND.cy - HAND.r - 2;

/** Where a short sleeve ends. Above the elbow, so the forearm reads as bare. */
export const SHORT_SLEEVE_END = ARM.top + 17;

/** Shoulders, torso and hem. */
export function shell(hem: number, material: Material = 'main'): readonly Op[] {
  return [
    poly(
      [
        [TORSO.left + 3, TORSO.top + 5],
        [AXIS - 9, TORSO.top - 2],
        [AXIS + 9, TORSO.top - 2],
        [TORSO.right - 3, TORSO.top + 5],
        [TORSO.right - 2, hem],
        [TORSO.left + 2, hem],
      ],
      material,
    ),
    ellipse(TORSO.left + 9, TORSO.top + 13, 10, 10, material),
    ellipse(TORSO.right - 9, TORSO.top + 13, 10, 10, material),
  ];
}

/**
 * Two sleeves, tapering the way the arm under them does.
 *
 * The taper is the point. A sleeve drawn as a rectangle over an arm drawn as a
 * cone leaves a wedge of bare skin down the outside of the forearm on every
 * long-sleeved top, which is the sort of defect that is invisible in a thumbnail
 * and unmissable in a room.
 */
export function sleeves(end: number, material: Material = 'main'): readonly Op[] {
  const cuff = (outer: number, inner: number): Op =>
    poly(
      [
        [outer, ARM.top + 3],
        [inner, ARM.top],
        [inner, end],
        [outer + (inner > outer ? 2 : -2), end],
      ],
      material,
    );

  const armpit = ARM.top + 10;

  return [
    // The inner edge runs under the shell by `ARM.overlap`, for the reason
    // recorded there: two shapes that must never part have to overlap, not touch.
    cuff(ARM.leftX - 1, ARM.leftX + ARM.width + ARM.overlap),
    cuff(ARM.rightX + ARM.width + 1, ARM.rightX - ARM.overlap),
    ellipse(ARM.leftX + 5, ARM.top + 8, 6, 6, material),
    ellipse(ARM.rightX + ARM.width - 5, ARM.top + 8, 6, 6, material),
    /*
     * The seam where the sleeve meets the body, drawn rather than left as a gap.
     *
     * **The gap was doing this job and should not have been.** With the sleeve
     * and the shell merely touching, the two-column hole between them gave every
     * arm an outline on its inner edge and that is what separated it from the
     * torso. Closing the hole closed the separation too, and every top rendered
     * as one wide blob with hands at the corners.
     *
     * A shadow is what actually separates an arm from a body — the arm is in
     * front, so it casts one. Two pixels of the garment's own shade, from the
     * armpit down, which is the same answer `composite.ts` gives between layers
     * and this one has to give inside a layer.
     */
    { kind: 'rect', x: ARM.leftX + ARM.width, y: armpit, w: 2, h: end - armpit, material: 'alt' },
    { kind: 'rect', x: ARM.rightX - 1, y: armpit, w: 2, h: end - armpit, material: 'alt' },
  ];
}

/**
 * The one hole a crew-necked garment has.
 *
 * **Cut to the neck's own width, read from `NECK` rather than chosen.** Cut any
 * wider and the two top corners of the opening land where there is no neck
 * behind them and no torso yet either — so the erase goes all the way through
 * the figure and the basement shows through a manager's collarbone. Twelve
 * pixels of it, on the T-shirt and the sweater, found by a flood fill and not by
 * looking.
 *
 * Sunk any lower it is a scoop neck, and every crew-necked top in the set was
 * one for exactly one render.
 */
const OPENING = Object.freeze({ cy: TORSO.top - 1, rx: NECK.width / 2, ry: 5 });

/** A round neck opening, so the neck shows through. */
export const CREW_NECK: Op = eraseEllipse(AXIS, OPENING.cy, OPENING.rx, OPENING.ry);

/**
 * A ribbed collar band around that opening — the ring, drawn as one shape.
 *
 * It exists because the T-shirt and the sweater each built their own by drawing
 * an ellipse and cutting a smaller one out of the middle, and **both cut a
 * different hole from `CREW_NECK`'s** — wider than the neck, in the two rows
 * where the torso has not started yet. One definition of where the opening is,
 * so a band and the neckline under it cannot disagree.
 */
export function crewCollar(dx: number, dy: number, material: Material = 'alt'): readonly Op[] {
  return [
    ellipse(AXIS, OPENING.cy, OPENING.rx + dx, OPENING.ry + dy, material),
    CREW_NECK,
  ];
}
