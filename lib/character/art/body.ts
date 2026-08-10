import { ellipse, erase, pixels, poly, rect, type Op } from '../sprite';

import { ARM, AXIS, EAR, FACE, HAND, HEAD, LEG, NECK, SHOE, TORSO } from './geometry';

/**
 * The figure everybody starts as — head, face, arms, hands, legs, boots.
 *
 * ## What is here and what is a separate layer
 *
 * The body carries **skin and the parts nobody chooses**: trousers and boots. It
 * does not carry a shirt. A top is its own layer over the torso, which is what
 * lets six tops and four skin tones be twenty-four looks rather than twenty-four
 * drawings.
 *
 * **Trousers are not a trait, and that is a decision.** Shown from the front, a
 * change of colour there is the least visible choice available; it costs a
 * control and buys almost nothing. Recorded so it reads as a decision rather than
 * an omission — the layer position exists and a `bottoms` trait can be appended
 * without moving anything.
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
 *
 * ## What the canvas raise bought, part by part
 *
 * Nothing here is decoration. Each of these was a specific thing the old figure
 * could not say, listed so the next canvas argument can be had against a list:
 *
 * - **A jaw.** The head was one ellipse, which reads as a balloon. It is now a
 *   cranium with a tapered jaw and a chin, and the taper is four columns — not
 *   expressible at twenty-two pixels of head width.
 * - **Ears that are ears.** See {@link EAR}: they used to stand three columns
 *   proud at exactly eye height and every manager appeared to wear headphones.
 * - **Tapered limbs.** Arms and legs were rectangles. Both now narrow towards
 *   the wrist and the ankle, which is most of what stops a figure reading as a
 *   diagram.
 * - **Boots.** They were two black rectangles with a lighter strip under them.
 *   They now have a toe, a shaft, a warm leather upper and a sole, which is what
 *   makes the figure look like it is standing on the floor rather than ending.
 * - **Hands with a thumb.** Circles at the end of a rectangle have no handedness.
 */

const SKIN = 'main' as const;
const SHADOW = 'alt' as const;
const DENIM = 'fixed:denim' as const;
const LEATHER = 'fixed:leather' as const;
const SOLE = 'fixed:sole' as const;

/**
 * A boot, as a polygon.
 *
 * `toe` is the direction the foot points — the two boots are mirrored so the
 * stance opens very slightly outward, which is the difference between standing
 * and being stood up.
 */
const boot = (x: number, toe: 1 | -1): readonly Op[] => {
  const w = SHOE.width;
  const shaftInset = 2;
  const front = toe === 1 ? x + w : x;
  const back = toe === 1 ? x : x + w;
  const shaftFront = toe === 1 ? x + w - shaftInset : x + shaftInset;

  return [
    // The upper: the ankle shaft, opening out to the toe on the way down.
    poly(
      [
        [back + toe * shaftInset, SHOE.top],
        [shaftFront, SHOE.top],
        [front, SHOE.bottom - 5],
        [front, SHOE.bottom - 3],
        [back, SHOE.bottom - 3],
        [back, SHOE.bottom - 6],
      ],
      LEATHER,
    ),
    // The sole, which is what puts the figure on the floor rather than ending.
    rect(Math.min(front, back), SHOE.bottom - 4, w, 4, SOLE),
  ];
};

/** One leg, narrowing to the ankle. `side` is -1 for the wearer's right. */
const leg = (x: number, side: 1 | -1): Op =>
  poly(
    [
      [x, LEG.top],
      [x + LEG.width, LEG.top],
      [x + LEG.width - (side === 1 ? 1 : 3), LEG.bottom],
      [x + (side === 1 ? 3 : 1), LEG.bottom],
    ],
    DENIM,
  );

/** One arm, narrowing to the wrist, with the shoulder rounded into the torso. */
const arm = (outer: number, inner: number): readonly Op[] => [
  poly(
    [
      [outer, ARM.top + 4],
      [inner, ARM.top + 1],
      [inner, ARM.bottom - 3],
      [outer + (inner > outer ? 3 : -3), ARM.bottom],
      [outer, ARM.bottom - 3],
    ],
    SKIN,
  ),
  /*
   * The deltoid, and it sits **below** the shoulder line rather than on it. Set
   * level with `TORSO.top` it stands proud of the sloped shoulder the torso
   * draws, and the figure grows a step at each shoulder — which was the most
   * mechanical-looking thing about the first render at this canvas.
   */
  ellipse(outer + (inner > outer ? 5 : -5), ARM.top + 7, 5, 5, SKIN),
  /*
   * The seam where the arm meets the torso. Same job, same reason and same
   * treatment as the sleeve's in `garment.ts`: the arm tucks *under* the body so
   * there is no hole between them, and a shadow is what separates the two rather
   * than a gap.
   */
  {
    kind: 'rect',
    x: inner > outer ? inner - ARM.overlap : inner + ARM.overlap - 2,
    y: ARM.top + 10,
    w: 2,
    h: ARM.bottom - ARM.top - 10,
    material: SHADOW,
  },
];

/**
 * One hand — a mitten with a thumb, not a circle.
 *
 * The wrist block is what attaches it. Drawn as an ellipse alone it meets the
 * tapered arm on two pixels, the outline pass closes a silhouette around each,
 * and the result is a ring on a stick: a hand that has visibly come off.
 */
const hand = (cx: number, thumb: 1 | -1): readonly Op[] => [
  rect(cx - 4, HAND.cy - HAND.r - 2, 8, 6, SKIN),
  ellipse(cx, HAND.cy, HAND.r - 1, HAND.r + 1, SKIN),
  rect(cx + thumb * 3, HAND.cy - 4, 2, 5, SKIN),
];

export const BODY: readonly Op[] = Object.freeze([
  // --- legs and boots, drawn first so the torso overlaps the waist -----------
  leg(LEG.leftX, 1),
  leg(LEG.rightX, -1),
  // The gap between them, so they read as two rather than as a skirt. It starts
  // below the hip so the two legs still share a waist.
  erase(AXIS - 4, LEG.top + 6, 8, LEG.bottom - LEG.top - 6),

  ...boot(SHOE.leftX, -1),
  ...boot(SHOE.rightX, 1),

  // --- torso -----------------------------------------------------------------
  /*
   * Shoulders slope. A flat top edge from armpit to armpit is the single
   * clearest tell of a figure assembled from rectangles, and it survives every
   * shirt drawn over it because a garment is authored to this outline.
   */
  poly(
    [
      [TORSO.left + 4, TORSO.top + 5],
      [AXIS - 9, TORSO.top - 1],
      [AXIS + 9, TORSO.top - 1],
      [TORSO.right - 4, TORSO.top + 5],
      [TORSO.right - 3, TORSO.bottom],
      [TORSO.left + 3, TORSO.bottom],
    ],
    SKIN,
  ),
  ellipse(TORSO.left + 9, TORSO.top + 13, 9, 9, SKIN),
  ellipse(TORSO.right - 9, TORSO.top + 13, 9, 9, SKIN),

  // --- arms and hands --------------------------------------------------------
  // The inner edge runs *under* the torso by `ARM.overlap`; see the note there.
  ...arm(ARM.leftX, ARM.leftX + ARM.width + ARM.overlap),
  ...arm(ARM.rightX + ARM.width, ARM.rightX - ARM.overlap),
  ...hand(HAND.leftCx, 1),
  ...hand(HAND.rightCx, -1),

  // --- neck ------------------------------------------------------------------
  rect(NECK.left, NECK.top, NECK.width, NECK.bottom - NECK.top, SKIN),
  // The shadow the jaw casts on it. Without this the neck reads as a post.
  rect(NECK.left, NECK.top, NECK.width, 4, SHADOW),
  // Where the neck meets the shoulders, on the shadowed side only.
  rect(NECK.left + NECK.width - 3, NECK.top + 4, 3, NECK.bottom - NECK.top - 4, SHADOW),

  // --- head ------------------------------------------------------------------
  /*
   * A cranium and a jaw, not one ellipse. The old head was a single ellipse with
   * three rows of straight edge stuck under the cheeks, and it read as a balloon
   * because that is what it was.
   */
  ellipse(HEAD.cx, HEAD.cy - 1, HEAD.rx, HEAD.ry - 1, SKIN),
  poly(
    [
      [HEAD.left + 2, HEAD.bottom - 9],
      [HEAD.right - 2, HEAD.bottom - 9],
      [HEAD.right - 5, HEAD.bottom],
      [HEAD.left + 5, HEAD.bottom],
    ],
    SKIN,
  ),
  // Ears — one column proud of the skull, and no more. See `EAR`.
  ellipse(EAR.leftCx, EAR.cy, EAR.rx, EAR.ry, SKIN),
  ellipse(EAR.rightCx, EAR.cy, EAR.rx, EAR.ry, SKIN),
  // The fold inside each one, or they are lumps.
  pixels(
    [
      [EAR.leftCx, EAR.cy - 1],
      [EAR.leftCx, EAR.cy],
      [EAR.rightCx, EAR.cy - 1],
      [EAR.rightCx, EAR.cy],
    ],
    SHADOW,
  ),

  // --- face ------------------------------------------------------------------
  /*
   * The temple, on the side away from the light. The form pass finds the
   * *silhouette's* shadow by itself; it cannot know that a face is not a flat
   * disc, and this is the one place that shows badly.
   */
  poly(
    [
      [HEAD.right - 6, HEAD.cy - 7],
      [HEAD.right - 2, HEAD.cy - 5],
      [HEAD.right - 3, HEAD.cy + 5],
      [HEAD.right - 6, HEAD.cy + 3],
    ],
    SHADOW,
  ),
  // Under the lower lip, which is what gives the chin its own plane.
  rect(AXIS - 3, FACE.mouthY + 3, 7, 2, SHADOW),

  /*
   * Eyes — a white, a pupil centred in it, and a lash line over the top.
   *
   * The pupil is **odd-width and centred**. The first pass made it two columns
   * of a five-column eye, which is off-centre by construction: both pupils sat
   * hard left and every manager was looking away from whoever was looking at
   * them.
   */
  rect(FACE.eyeLeft, FACE.eyeY, FACE.eyeWidth, FACE.eyeHeight, 'fixed:white'),
  rect(FACE.eyeRight, FACE.eyeY, FACE.eyeWidth, FACE.eyeHeight, 'fixed:white'),
  rect(FACE.eyeLeft + 1, FACE.eyeY, 3, FACE.eyeHeight, 'ink'),
  rect(FACE.eyeRight + 1, FACE.eyeY, 3, FACE.eyeHeight, 'ink'),
  // The lash line, which keeps the eyes from reading as two staring holes.
  rect(FACE.eyeLeft, FACE.eyeY - 1, FACE.eyeWidth, 1, 'ink'),
  rect(FACE.eyeRight, FACE.eyeY - 1, FACE.eyeWidth, 1, 'ink'),
  // A catch-light in each, on the lit side.
  pixels(
    [
      [FACE.eyeLeft + 1, FACE.eyeY],
      [FACE.eyeRight + 1, FACE.eyeY],
    ],
    'fixed:white',
  ),

  // The nose — a bridge in shadow and a tip, which is all it can be here.
  pixels(
    [
      [AXIS, FACE.noseY - 2],
      [AXIS, FACE.noseY - 1],
      [AXIS, FACE.noseY],
      [AXIS + 1, FACE.noseY],
      [AXIS - 1, FACE.noseY + 1],
      [AXIS, FACE.noseY + 1],
      [AXIS + 1, FACE.noseY + 1],
    ],
    SHADOW,
  ),

  /*
   * The mouth. Corners lifted by one — a neighbourhood pizzeria.
   *
   * Seven columns of a twenty-six-column head. The first pass drew nine and it
   * read as a slot: a mouth as wide as the gap between the eyes stops being an
   * expression.
   */
  pixels(
    [
      [AXIS - 4, FACE.mouthY],
      [AXIS - 3, FACE.mouthY + 1],
      [AXIS - 2, FACE.mouthY + 1],
      [AXIS - 1, FACE.mouthY + 1],
      [AXIS, FACE.mouthY + 1],
      [AXIS + 1, FACE.mouthY + 1],
      [AXIS + 2, FACE.mouthY + 1],
      [AXIS + 3, FACE.mouthY],
    ],
    'ink',
  ),
]);
