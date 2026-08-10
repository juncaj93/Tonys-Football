/**
 * Where the parts of a manager are, on the shared canvas.
 *
 * **Every layer in the system is authored against these numbers.** A hairstyle
 * that knows the top of the skull is at `y = 24` and a beanie that knows the same
 * thing cannot drift apart; two layers that each guessed would, and the drift
 * would only be visible on the one combination nobody photographed.
 *
 * ## The canvas is 112 × 168, and it is the room's own resolution
 *
 * This is the second time this number has been raised and the first time it was
 * derived from the surface the sprite is actually seen on.
 *
 * The rule the world is built to is `art/ASSET_PIPELINE.md`'s fourth: **one art
 * pixel is one room unit.** A room is `320 × 569` (`lib/parlor/objects.ts`) and
 * everything in it obeys that or beats it:
 *
 * | | authored | drawn into | room units per source pixel |
 * |---|---|---|---|
 * | `zone_room_shell_storeroom` | 320 × 569 | 320 × 569 | **1.00** |
 * | every collectible | 46 × 46 | 46 × 46 | **1.00** |
 * | `character_tony_neutral` | 88 × 240 | 72 × 197 | **0.82** |
 * | the manager, at `64 × 96` | 64 × 96 | 112 × 168 | **1.75** |
 *
 * The manager was the only thing in the world drawn **coarser than the world**,
 * and then magnified into it. That is the measurement under the commissioner's
 * report of 2026-08-10 — *"too simplistic, too flat, too geometric, not
 * convincingly part of the same pixel-art world"* — and it is why the previous
 * canvas could not be drawn out of the problem: at 1.75 every pixel of extra care
 * is still a 1.75-unit block sitting on a 1-unit wall.
 *
 * `112 × 168` is `roomObject('manager').rect`, exactly. One manager pixel is one
 * room unit, so the sprite and the painted shell behind it are now magnified by
 * the same number on every phone, which is the whole of what *"part of the same
 * world"* means geometrically.
 *
 * ### Raising it cost no art, again, and the old objection was about a different system
 *
 * All twenty-nine slugs are still `art_status: placeholder` — there is no PNG at
 * any size to re-cut. `docs/ROOMS_BOUNDARY.md §14.2` records the reason a bigger
 * canvas was thought unavailable: *"a set of thirty layers at that size is not
 * authorable by hand."* True of a system whose layers are pixels. **These layers
 * are shapes** — an ellipse with `rx: 12` costs exactly what one with `rx: 7`
 * costs, and the rasteriser draws the finer curve for free. Resolution is close
 * to free here and detail is not, which is the opposite of the assumption.
 *
 * ## The proportions are the reference's, not the old canvas's × 1.75
 *
 * The approved manager reference is a little over **five heads tall**, measured
 * off it: skull ≈ 17.8% of the standing figure. The old figure was four, which is
 * the proportion of a mascot. This one is 28 rows of skull in a 144-row figure —
 * **5.1 heads** — which keeps a face big enough to carry six traits while losing
 * the bobblehead.
 *
 * Everything else follows from the reference too: shoulders at two head-widths,
 * hands falling at the top of the thigh, legs 43% of the standing height, and a
 * shoe that is wider than the trouser and has a sole under it.
 */

export const CANVAS = Object.freeze({ width: 112, height: 168 });

/** Bottom-centre, exactly as collectibles anchor. A tall hat grows upward. */
export const ANCHOR = 'bottom-center';

/**
 * The vertical line the figure is symmetric about.
 *
 * `56` on a 112-wide canvas puts the axis on the boundary between columns 55 and
 * 56, so an ellipse centred here comes out with the same number of columns each
 * side. An odd axis is how a face ends up one pixel off-centre, which nobody can
 * name and everybody can see.
 *
 * **The mirror of column `x` is `111 - x`**, and every paired constant below
 * satisfies it. `geometry.test.ts` checks the arithmetic rather than trusting
 * it: the first pass at this canvas had the head's right edge one column wide of
 * its left, which put the whole face half a pixel off the body it sits on.
 */
export const AXIS = 56;

/**
 * The mirror of a **column index**, for the pairs below and the test that holds
 * them. Column `0` mirrors to `111`.
 */
export const mirror = (x: number): number => CANVAS.width - 1 - x;

/**
 * The mirror of an **ellipse centre**, which is a different number.
 *
 * `rasterise` samples at the pixel's centre, so an ellipse's `cx` lives on the
 * boundary between columns rather than on a column: `cx = 25` covers `20…29`,
 * whose mirror `82…91` is `cx = 87`, not `86`. Getting these two mixed up is how
 * the first pass at this canvas put the ears one column apart — the left ear
 * proud of the skull and the right one buried in it, on every manager.
 */
export const mirrorCentre = (cx: number): number => CANVAS.width - cx;

export const HEAD = Object.freeze({
  /** Centre of the skull. */
  cx: AXIS,
  cy: 37,
  rx: 13,
  ry: 13,
  /** The topmost opaque row of the skull — where a hat's band sits. */
  top: 24,
  /** The lowest row of the jaw. */
  bottom: 52,
  left: 43,
  right: 68,
});

/**
 * The ear.
 *
 * **Mostly inside the skull**, which is the correction rather than a detail. The
 * old figure set an ear ellipse on `HEAD.left` with a radius of two, so a third
 * of it stood proud of the head on each side and — outlined, in the shade tone,
 * at the exact height of the eyes — every manager appeared to be wearing
 * headphones. One column proud is an ear; three is equipment.
 */
export const EAR = Object.freeze({
  cy: HEAD.cy + 3,
  rx: 2,
  ry: 4,
  /** Centre, inset from the skull's edge so only the outer column shows. */
  leftCx: HEAD.left + 1,
  rightCx: CANVAS.width - (HEAD.left + 1),
});

/**
 * The features, laid out down the twenty-eight rows of the skull.
 *
 * Every one of these has at least one blank row above and below it. That is the
 * whole reason they are named constants rather than offsets from `HEAD.cy`: the
 * first pass put the brow's last row directly against the eyelid's first, and
 * the two merged into a single dark band that read as a scowl on every manager
 * at every hair colour. Features that touch are features that are one feature.
 *
 * Both eyes are symmetric about `AXIS`, which is checked rather than eyeballed —
 * `48…52` and `60…64` mirror across `56`.
 */
export const FACE = Object.freeze({
  browY: 31,
  /** The top row of the eye. The lash line is drawn one row above it. */
  eyeY: 37,
  eyeLeft: 48,
  eyeRight: 59,
  /** Both eyes, and every layer that has to clear them. */
  eyeWidth: 5,
  eyeHeight: 3,
  noseY: 42,
  mouthY: 47,
  /** Where the cheekbone catches the light. */
  cheekY: 40,
});

export const NECK = Object.freeze({ top: 48, bottom: 64, left: 50, width: 12 });

export const TORSO = Object.freeze({
  /** Where the shoulders begin. Everything above is neck and head. */
  top: 61,
  /** Where the top ends and the legs begin. */
  bottom: 112,
  left: 30,
  right: 82,
});

export const ARM = Object.freeze({
  top: 65,
  /** The wrist. A sleeve stops above this; the hand starts at it. */
  bottom: 113,
  leftX: 20,
  rightX: 81,
  width: 11,
  /**
   * How far the arm tucks **under** the torso, in columns.
   *
   * Not decoration. The arm's inner edge and the torso's outer edge were authored
   * to meet exactly, and they did — at the shoulder, where a round cap covers the
   * join. Below it the torso narrows towards the waist and the arm narrows towards
   * the wrist, so the two edges walk apart and leave a **two-column hole down each
   * side of the figure, from the armpit to the hem**, with the room showing
   * through it. It read as a deliberate dark seam and it was a gap.
   *
   * Two shapes that must never part have to overlap, not touch. Same material,
   * same layer, so the union is seamless.
   */
  overlap: 4,
});

export const HAND = Object.freeze({
  leftCx: 25,
  rightCx: 87,
  cy: 116,
  r: 6,
});

export const LEG = Object.freeze({
  top: 110,
  bottom: 156,
  leftX: 35,
  rightX: 59,
  width: 18,
});

export const SHOE = Object.freeze({
  top: 156,
  /** The contact row. Whatever is equipped, the composite ends here. */
  bottom: 168,
  leftX: 32,
  rightX: 58,
  width: 22,
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
