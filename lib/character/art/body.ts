import { ellipse, erase, pixels, poly, rect, type Op } from '../sprite';

import { ARM, AXIS, FACE, HAND, HEAD, LEG, NECK, SHOE, TORSO } from './geometry';

/**
 * The figure everybody starts as — head, face, arms, hands, legs, shoes.
 *
 * ## What is here and what is a separate layer
 *
 * The body carries **skin and the parts nobody chooses**: trousers and shoes. It
 * does not carry a shirt. A top is its own layer over the torso, which is what
 * lets six tops and four skin tones be twenty-four looks rather than twenty-four
 * drawings.
 *
 * **Trousers are not a trait, and that is a decision.** At this size, framed in a
 * panel and shown from the front, the legs are eighteen rows of a ninety-six-row
 * figure and a change of colour there is the least visible choice available. It
 * costs a control and buys almost nothing. Recorded so it reads as a decision
 * rather than an omission — the layer position exists and a `bottoms` trait can
 * be appended without moving anything.
 *
 * ## Why the hands are drawn here and not covered
 *
 * Every top is authored to stop at the wrist, so the hands drawn here stay
 * visible without a second pass drawing them back on top. The system this
 * replaces did the opposite and paid for it: the hoodie was authored two columns
 * wider than the shirt, covered the sleeves *and* the hands, and the figure
 * rendered as a head on a slab with no arms at all — visible only at hero scale.
 * A shared geometry module is the fix; both layers now read `ARM` and `HAND`
 * rather than each other.
 */

const SKIN = 'main' as const;
const DENIM = 'fixed:denim' as const;
const DENIM_SHADE = 'fixed:denimShade' as const;
const SHOE_INK = 'fixed:ink' as const;

export const BODY: readonly Op[] = Object.freeze([
  // --- legs and shoes, drawn first so the torso overlaps the waist ----------
  rect(LEG.leftX, LEG.top, LEG.width, LEG.bottom - LEG.top, DENIM),
  rect(LEG.rightX, LEG.top, LEG.width, LEG.bottom - LEG.top, DENIM),
  // The gap between the legs, so they read as two rather than as a skirt.
  erase(AXIS - 2, LEG.top + 4, 4, LEG.bottom - LEG.top - 4),
  // A seam down the outside of each leg — the one bit of shape trousers get.
  rect(LEG.leftX, LEG.top, 1, LEG.bottom - LEG.top, DENIM_SHADE),
  rect(LEG.rightX + LEG.width - 1, LEG.top, 1, LEG.bottom - LEG.top, DENIM_SHADE),

  /*
   * Shoes are wider than the leg and sit slightly forward, which is the whole of
   * the read at this size — a shoe the width of the trouser is a trouser.
   */
  rect(SHOE.leftX, SHOE.top, SHOE.width, SHOE.bottom - SHOE.top - 2, SHOE_INK),
  rect(SHOE.rightX, SHOE.top, SHOE.width, SHOE.bottom - SHOE.top - 2, SHOE_INK),
  // The sole, a shade lighter, so a dark shoe on a dark floor still has a base.
  rect(SHOE.leftX, SHOE.bottom - 2, SHOE.width, 2, 'fixed:inkSoft'),
  rect(SHOE.rightX, SHOE.bottom - 2, SHOE.width, 2, 'fixed:inkSoft'),

  // --- torso -----------------------------------------------------------------
  /*
   * A trapezoid rather than a rectangle: shoulders wider than the waist is the
   * whole of the silhouette read at this size. The top corners are cut by the
   * shoulder ellipses below so the join is round rather than a step.
   */
  poly(
    [
      [TORSO.left + 1, TORSO.top],
      [TORSO.right - 1, TORSO.top],
      [TORSO.right - 3, TORSO.bottom],
      [TORSO.left + 3, TORSO.bottom],
    ],
    SKIN,
  ),
  ellipse(TORSO.left + 5, TORSO.top + 5, 6, 5, SKIN),
  ellipse(TORSO.right - 5, TORSO.top + 5, 6, 5, SKIN),

  // --- arms ------------------------------------------------------------------
  rect(ARM.leftX, ARM.top, ARM.width, ARM.bottom - ARM.top, SKIN),
  rect(ARM.rightX, ARM.top, ARM.width, ARM.bottom - ARM.top, SKIN),
  // Rounded at the shoulder, so the arm grows out of the torso rather than
  // being butted against it — the step that read as a broken join.
  ellipse(ARM.leftX + 3, ARM.top + 2, 3, 3, SKIN),
  ellipse(ARM.rightX + 2, ARM.top + 2, 3, 3, SKIN),
  ellipse(HAND.leftCx, HAND.cy, HAND.r, HAND.r, SKIN),
  ellipse(HAND.rightCx, HAND.cy, HAND.r, HAND.r, SKIN),

  // --- neck ------------------------------------------------------------------
  rect(NECK.left, NECK.top, NECK.width, NECK.bottom - NECK.top, SKIN),
  // The shadow the jaw casts on it. Without this the neck reads as a post.
  rect(NECK.left, NECK.top, NECK.width, 2, 'alt'),

  // --- head ------------------------------------------------------------------
  ellipse(HEAD.cx, HEAD.cy, HEAD.rx, HEAD.ry, SKIN),
  // Ears, one pixel proud of the skull on each side.
  ellipse(HEAD.left, HEAD.cy + 2, 2, 3, SKIN),
  ellipse(HEAD.right, HEAD.cy + 2, 2, 3, SKIN),
  /*
   * The jaw, squared off a little. A perfect ellipse reads as a balloon; two
   * rows of straight edge under the cheeks is what makes it read as a face.
   */
  rect(AXIS - 7, HEAD.bottom - 5, 14, 3, SKIN),

  // --- face ------------------------------------------------------------------
  // Brows. Angled by a pixel so the face has an expression rather than a stare.
  pixels(
    [
      [FACE.eyeLeft - 1, FACE.browY + 1],
      [FACE.eyeLeft, FACE.browY],
      [FACE.eyeLeft + 1, FACE.browY],
      [FACE.eyeLeft + 2, FACE.browY],
      [FACE.eyeRight - 1, FACE.browY],
      [FACE.eyeRight, FACE.browY],
      [FACE.eyeRight + 1, FACE.browY],
      [FACE.eyeRight + 2, FACE.browY + 1],
    ],
    'alt',
  ),

  // Eyes. Two pixels each, with a white catch-light beside them.
  rect(FACE.eyeLeft, FACE.eyeY, 2, 2, 'ink'),
  rect(FACE.eyeRight, FACE.eyeY, 2, 2, 'ink'),
  pixels(
    [
      [FACE.eyeLeft - 1, FACE.eyeY],
      [FACE.eyeRight - 1, FACE.eyeY],
    ],
    'fixed:white',
  ),

  // The nose — a shadow rather than a line, which is all it can be at this size.
  pixels(
    [
      [AXIS - 1, FACE.noseY],
      [AXIS - 1, FACE.noseY + 1],
      [AXIS, FACE.noseY + 1],
    ],
    'alt',
  ),

  // The mouth. Four pixels, corners lifted by one — a neighbourhood pizzeria.
  pixels(
    [
      [AXIS - 3, FACE.mouthY],
      [AXIS - 2, FACE.mouthY + 1],
      [AXIS - 1, FACE.mouthY + 1],
      [AXIS, FACE.mouthY + 1],
      [AXIS + 1, FACE.mouthY + 1],
      [AXIS + 2, FACE.mouthY],
    ],
    'ink',
  ),
]);
