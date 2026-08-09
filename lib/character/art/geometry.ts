/**
 * Where the parts of a manager are, on the shared canvas.
 *
 * **Every layer in the system is authored against these numbers.** A hairstyle
 * that knows the top of the skull is at `y = 15` and a beanie that knows the same
 * thing cannot drift apart; two layers that each guessed would, and the drift
 * would only be visible on the one combination nobody photographed.
 *
 * ## The canvas is 64 × 96, and that is a measurement
 *
 * The system this replaces used `32 × 48`. Nothing was ever drawn at that size —
 * all twenty registry rows were `art_status: placeholder` — so raising it cost no
 * art at all, and the old number was never a measurement in the first place.
 *
 * What was measured is Tony. `character_tony_neutral.png` is authored **88 × 240**
 * and renders at 84 CSS px wide on a 375 phone: **0.95 CSS pixels per source
 * pixel**, which is the room's density too (`zone_parlor_shell.png`, 320 wide,
 * drawn at 360–390). His head is **41 × 40 source pixels**.
 *
 * A manager's head here is **22 × 24**. At the customiser's 3× that is 66 × 72 CSS
 * px against Tony's 38 — bigger on screen and built from fewer pixels, which is
 * the honest statement of the compromise: matching Tony's *density* at a
 * comparable on-screen size would need a canvas around 88 × 200, and a set of
 * thirty layers at that size is not authorable by hand.
 *
 * The old canvas gave a **12 × 11** head. Facial hair on it was an 8 × 2 bar and a
 * hairstyle was three rectangles; neither could carry a difference a manager would
 * choose between. 64 × 96 is the smallest canvas on which the trait set is legible
 * — which is the only reason to have picked it.
 *
 * Managers and Tony are never drawn in the same frame in v1 (basements are
 * v1.1), so what has to match is the **pixel language** — hard edges, the locked
 * palette, one light direction — rather than the pixel count.
 */

export const CANVAS = Object.freeze({ width: 64, height: 96 });

/** Bottom-centre, exactly as collectibles anchor. A tall hat grows upward. */
export const ANCHOR = 'bottom-center';

/**
 * The vertical line the figure is symmetric about.
 *
 * `32` on a 64-wide canvas puts the axis on a pixel boundary, so an ellipse
 * centred here comes out with the same number of columns each side. An odd axis
 * is how a face ends up one pixel off-centre, which nobody can name and everybody
 * can see.
 */
export const AXIS = 32;

export const HEAD = Object.freeze({
  /** Centre of the skull. */
  cx: AXIS,
  cy: 27,
  rx: 11,
  ry: 12,
  /** The topmost opaque row of the skull — where a hat's band sits. */
  top: 15,
  /** The lowest row of the jaw. */
  bottom: 39,
  left: 21,
  right: 43,
});

export const FACE = Object.freeze({
  eyeY: 27,
  eyeLeft: 26,
  eyeRight: 36,
  browY: 24,
  noseY: 31,
  mouthY: 34,
});

export const NECK = Object.freeze({ top: 36, bottom: 45, left: AXIS - 4, width: 8 });

export const TORSO = Object.freeze({
  /** Where the shoulders begin. Everything above is neck and head. */
  top: 44,
  /** Where the top ends and the legs begin. */
  bottom: 73,
  left: 16,
  right: 48,
});

export const ARM = Object.freeze({
  top: 47,
  bottom: 74,
  leftX: 11,
  rightX: 47,
  width: 6,
});

export const HAND = Object.freeze({
  leftCx: 14,
  rightCx: 50,
  cy: 76,
  r: 4,
});

export const LEG = Object.freeze({
  top: 71,
  bottom: 90,
  leftX: 22,
  rightX: 34,
  width: 8,
});

export const SHOE = Object.freeze({
  top: 89,
  /** The contact row. Whatever is equipped, the composite ends here. */
  bottom: 96,
  leftX: 20,
  rightX: 33,
  width: 11,
});

/**
 * The hand a held object goes in.
 *
 * **The right, always**, and it is a composition rule rather than a preference:
 * the ponytail hangs on the left for exactly this reason. Drawn on the same side
 * as the peel, a manager who chose a ponytail and picked up a peel simply lost
 * their hairstyle — no clipping, no failing test, visible only by looking.
 */
export const HELD = Object.freeze({ cx: HAND.rightCx, cy: HAND.cy });
