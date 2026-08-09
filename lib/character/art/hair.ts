import { ellipse, erase, eraseEllipse, rect, type Op } from '../sprite';

import { AXIS, HEAD, TORSO } from './geometry';

/**
 * Hairstyles — six, drawn over the face and under anything worn on the head.
 *
 * ## Six, and the same six
 *
 * `avatar_hair_01` … `_06` were canon in `art/assets.inventory.json` before any
 * of this existed, and the commissioner ruling of 2026-07-31 is to preserve the
 * exact canonical slugs. So the *set* is inherited and only the drawing is new.
 * A seventh is a row here and a row in the registry; nothing else moves.
 *
 * ## Every style is cut from the same skull
 *
 * Each one starts from an ellipse a little larger than `HEAD` and then removes
 * the face. Authoring the cap freehand per style is how six hairstyles end up
 * sitting at six slightly different heights, which reads as the hair floating on
 * exactly one of them and is invisible until somebody equips a hat.
 *
 * **The forehead line is the trait.** Where the cut lands — high, low, receded —
 * is most of what separates these at 22 pixels of head width, far more than the
 * outline of the top of the hair, which a hat covers anyway.
 */

const HAIR = 'main' as const;

/** The skull, plus the thickness hair adds. Every style grows from this. */
const CAP = (grow: number, lift: number): Op =>
  ellipse(HEAD.cx, HEAD.cy - lift, HEAD.rx + grow, HEAD.ry + grow, HAIR);

/**
 * Take the face back out.
 *
 * `inset` pulls the cut in from the sides, which is what leaves sideburns; `from`
 * is the row the forehead starts at.
 */
const FACE_CUT = (from: number, inset: number): Op =>
  erase(HEAD.left + inset, from, HEAD.right - HEAD.left - inset * 2 + 1, HEAD.bottom - from + 6);

export const HAIR_STYLES: Readonly<Record<string, readonly Op[]>> = Object.freeze({
  /** Short hair — a full cap, cut just above the brow, with sideburns. */
  avatar_hair_01: Object.freeze([
    CAP(1, 1),
    FACE_CUT(HEAD.cy - 5, 2),
    // Sideburns, to the middle of the ear.
    rect(HEAD.left - 1, HEAD.cy - 5, 3, 8, HAIR),
    rect(HEAD.right - 1, HEAD.cy - 5, 3, 8, HAIR),
  ]),

  /** Buzzed — the same cut, hugging the skull, so the head shape shows through. */
  avatar_hair_02: Object.freeze([
    CAP(0, 0),
    FACE_CUT(HEAD.cy - 6, 1),
    rect(HEAD.left, HEAD.cy - 6, 2, 5, HAIR),
    rect(HEAD.right, HEAD.cy - 6, 2, 5, HAIR),
  ]),

  /**
   * Long hair — falls past the shoulder on both sides.
   *
   * It reaches row `TORSO.top + 8`, which is deliberately **above** the sleeve:
   * hair that ends inside the arm merges into it and reads as a cape.
   */
  avatar_hair_03: Object.freeze([
    CAP(1, 1),
    rect(HEAD.left - 2, HEAD.cy - 4, 5, TORSO.top + 8 - (HEAD.cy - 4), HAIR),
    rect(HEAD.right - 2, HEAD.cy - 4, 5, TORSO.top + 8 - (HEAD.cy - 4), HAIR),
    // Rounded ends, so it hangs rather than being cut off square.
    ellipse(HEAD.left, TORSO.top + 7, 2, 2, HAIR),
    ellipse(HEAD.right, TORSO.top + 7, 2, 2, HAIR),
    FACE_CUT(HEAD.cy - 6, 3),
  ]),

  /**
   * Curly — the tallest of the six.
   *
   * Volume made of overlapping circles rather than one big ellipse: a larger
   * ellipse reads as a helmet, and the bumps are the only thing that says curly
   * at this density.
   */
  avatar_hair_04: Object.freeze([
    CAP(2, 3),
    ellipse(AXIS - 8, HEAD.cy - 10, 5, 5, HAIR),
    ellipse(AXIS, HEAD.cy - 13, 6, 5, HAIR),
    ellipse(AXIS + 8, HEAD.cy - 10, 5, 5, HAIR),
    ellipse(HEAD.left - 2, HEAD.cy - 4, 4, 5, HAIR),
    ellipse(HEAD.right + 2, HEAD.cy - 4, 4, 5, HAIR),
    FACE_CUT(HEAD.cy - 5, 3),
  ]),

  /**
   * Balding — a real choice, and it draws.
   *
   * A skipped layer would make *"balding"* and *"the hair failed to load"* the
   * same state, and only one of those is somebody's decision. The crown is taken
   * out with an ellipse rather than a rectangle so the hairline curves the way a
   * receding one does.
   */
  avatar_hair_05: Object.freeze([
    CAP(1, 1),
    eraseEllipse(HEAD.cx, HEAD.cy - 8, HEAD.rx - 1, 8),
    FACE_CUT(HEAD.cy - 2, 2),
    rect(HEAD.left - 1, HEAD.cy - 6, 3, 9, HAIR),
    rect(HEAD.right - 1, HEAD.cy - 6, 3, 9, HAIR),
  ]),

  /**
   * Ponytail — the widest of the six, and the tail hangs on the **left**.
   *
   * Every held item is in the right hand, so a tail on the right is a tail behind
   * a pizza peel. It overlaps the cap's columns rather than merely touching them:
   * drawn a column clear it renders as a detached bar beside the head —
   * geometrically adjacent, visually unattached.
   */
  avatar_hair_06: Object.freeze([
    CAP(1, 1),
    // The band, then the tail, then the cap again on top of the band's shadow.
    ellipse(HEAD.left - 2, HEAD.cy - 2, 3, 3, HAIR),
    rect(HEAD.left - 6, HEAD.cy - 1, 6, 14, HAIR),
    ellipse(HEAD.left - 5, HEAD.cy + 12, 3, 3, HAIR),
    FACE_CUT(HEAD.cy - 5, 2),
    rect(HEAD.left - 1, HEAD.cy - 5, 3, 6, HAIR),
    rect(HEAD.right - 1, HEAD.cy - 5, 3, 6, HAIR),
  ]),
});

/**
 * Facial hair — four, plus the absence of one.
 *
 * *None* is **no layer**, not an empty drawing. `docs/M3_CHARACTER_BOUNDARY.md
 * §3`: an unequipped slot must be representable without a file existing, and the
 * same reasoning applies to a trait a manager has turned off.
 */
export const FACIAL_HAIR: Readonly<Record<string, readonly Op[]>> = Object.freeze({
  /**
   * Stubble — the edge of the jaw only, in the shade tone.
   *
   * A filled jaw in the same tone is a beard, and the set already has one. What
   * separates them at this size is **thickness**: three pixels of growth along
   * the jawline against a shape that changes the silhouette.
   */
  avatar_face_hair_01: Object.freeze([
    ellipse(AXIS, HEAD.bottom - 7, 9, 7, 'alt'),
    eraseEllipse(AXIS, HEAD.bottom - 8, 7, 6),
    erase(AXIS - 9, HEAD.bottom - 14, 18, 5),
    eraseEllipse(AXIS, HEAD.bottom - 5, 3, 2),
  ]),

  /** Moustache — over the lip, under the nose. */
  avatar_face_hair_02: Object.freeze([
    rect(AXIS - 5, HEAD.bottom - 8, 10, 2, 'main'),
    rect(AXIS - 6, HEAD.bottom - 7, 2, 2, 'main'),
    rect(AXIS + 4, HEAD.bottom - 7, 2, 2, 'main'),
  ]),

  /** Goatee — moustache plus chin, with the cheeks left bare. */
  avatar_face_hair_03: Object.freeze([
    rect(AXIS - 5, HEAD.bottom - 8, 10, 2, 'main'),
    rect(AXIS - 6, HEAD.bottom - 7, 2, 2, 'main'),
    rect(AXIS + 4, HEAD.bottom - 7, 2, 2, 'main'),
    rect(AXIS - 4, HEAD.bottom - 4, 8, 4, 'main'),
    rect(AXIS - 3, HEAD.bottom, 6, 2, 'main'),
  ]),

  /** Full beard — jaw, chin and moustache, thick enough to change the outline. */
  avatar_face_hair_04: Object.freeze([
    ellipse(AXIS, HEAD.bottom - 6, 10, 9, 'main'),
    erase(AXIS - 10, HEAD.bottom - 15, 20, 7),
    // The mouth, left open in the beard.
    eraseEllipse(AXIS, HEAD.bottom - 6, 3, 2),
    rect(AXIS - 5, HEAD.bottom - 8, 10, 2, 'main'),
    rect(AXIS - 6, HEAD.bottom - 7, 2, 2, 'main'),
    rect(AXIS + 4, HEAD.bottom - 7, 2, 2, 'main'),
  ]),
});
