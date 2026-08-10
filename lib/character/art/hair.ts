import { ellipse, erase, eraseEllipse, pixels, rect, type Op } from '../sprite';

import { AXIS, EAR, FACE, HEAD, TORSO } from './geometry';

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
 * is most of what separates these, far more than the outline of the top of the
 * hair, which a hat covers anyway.
 *
 * ## The eyebrows live here, and that is why they have a colour
 *
 * They used to be two rows of the *body's* shade tone, which meant every manager
 * had eyebrows the colour of their own skin one step down — invisible on the
 * pale tones and wrong on all of them. They are part of this layer now, so they
 * take the hair colour a manager chose, in the same way facial hair does.
 *
 * They are drawn **after** the face cut. Drawn before it they would be inside the
 * rectangle it removes, which is a silent way to have no eyebrows at all.
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
 *
 * **An oval, not a rectangle.** The old cut was one `erase` rectangle, and at
 * twenty-two pixels of head width the corners of it were lost inside the outline.
 * At forty-four they are not: a rectangular hole in a round cap gives every
 * manager a square face with a straight hairline running from ear to ear, which
 * is the single most conspicuous thing wrong with the first render at this
 * canvas. The oval leaves a hairline that curves down at the temples, which is
 * where a hairline actually is.
 *
 * The rectangle survives *below* the jaw, where hair genuinely stops square and
 * an oval would leave a fringe of it under the chin.
 */
const FACE_CUT = (from: number, inset: number): readonly Op[] => {
  const floor = HEAD.bottom + 4;
  return [
    eraseEllipse(
      HEAD.cx,
      (from + floor) / 2,
      HEAD.rx - inset + 3,
      (floor - from) / 2,
    ),
    erase(
      HEAD.left + inset,
      HEAD.bottom - 2,
      HEAD.right - HEAD.left - inset * 2 + 1,
      16,
    ),
  ];
};

/**
 * A sideburn, running down in front of the ear.
 *
 * **It starts at the temple, not at the crown.** The first pass passed the
 * hairline row straight through from `FACE_CUT`, which on a high hairline is the
 * top of the skull — so `avatar_hair_02` and `_05` grew two coloured spikes off
 * the top corners of the head and every ginger manager appeared to have horns.
 * A sideburn's top is a property of the ear, and the ear is at `EAR.cy`.
 */
const SIDEBURNS = (length: number, width = 4): readonly Op[] => [
  rect(HEAD.left - 1, EAR.cy - 7, width, length, HAIR),
  rect(HEAD.right + 2 - width, EAR.cy - 7, width, length, HAIR),
];

/**
 * The eyebrows, angled up towards the middle of the face.
 *
 * Two rectangles rather than one, offset by a row: a flat bar reads as a frown
 * and is the difference between a face and a warning sign.
 */
const BROWS: readonly Op[] = [
  rect(FACE.eyeLeft - 2, FACE.browY + 1, 3, 3, HAIR),
  rect(FACE.eyeLeft, FACE.browY, FACE.eyeWidth, 3, HAIR),
  rect(FACE.eyeRight, FACE.browY, FACE.eyeWidth, 3, HAIR),
  rect(FACE.eyeRight + FACE.eyeWidth - 1, FACE.browY + 1, 3, 3, HAIR),
];

/**
 * A parting and a couple of strands, in the shade tone.
 *
 * The one thing a cap of hair cannot say by its outline is that it is made of
 * hair. Three marks is enough at this size and four is a hatch pattern.
 */
const STRANDS = (crown: number): readonly Op[] => [
  rect(AXIS - 8, crown, 3, 9, 'alt'),
  pixels(
    [
      [AXIS + 3, crown + 2],
      [AXIS + 4, crown + 3],
      [AXIS + 5, crown + 4],
      [AXIS + 6, crown + 5],
    ],
    'alt',
  ),
];

export const HAIR_STYLES: Readonly<Record<string, readonly Op[]>> = Object.freeze({
  /** Short hair — a full cap, cut just above the brow, with sideburns. */
  avatar_hair_01: Object.freeze([
    CAP(2, 2),
    ...FACE_CUT(HEAD.cy - 11, 4),
    ...SIDEBURNS(15),
    ...STRANDS(HEAD.cy - 14),
    ...BROWS,
  ]),

  /** Buzzed — the same cut, hugging the skull, so the head shape shows through. */
  avatar_hair_02: Object.freeze([
    CAP(0, 0),
    ...FACE_CUT(HEAD.cy - 13, 2),
    ...SIDEBURNS(11, 3),
    ...BROWS,
  ]),

  /**
   * Long hair — falls past the shoulder on both sides.
   *
   * It stops at `TORSO.top + 14`, on the chest rather than on the arm: hair that
   * ends inside the sleeve merges into it and reads as a cape.
   */
  avatar_hair_03: Object.freeze([
    CAP(2, 2),
    rect(HEAD.left - 4, HEAD.cy - 7, 9, TORSO.top + 14 - (HEAD.cy - 7), HAIR),
    rect(HEAD.right - 4, HEAD.cy - 7, 9, TORSO.top + 14 - (HEAD.cy - 7), HAIR),
    // Rounded ends, so it hangs rather than being cut off square.
    ellipse(HEAD.left, TORSO.top + 13, 4, 4, HAIR),
    ellipse(HEAD.right, TORSO.top + 13, 4, 4, HAIR),
    ...FACE_CUT(HEAD.cy - 11, 5),
    ...STRANDS(HEAD.cy - 15),
    // Two long strands falling in front of the shoulder.
    rect(HEAD.left - 2, HEAD.cy + 4, 2, 22, 'alt'),
    rect(HEAD.right + 1, HEAD.cy + 6, 2, 18, 'alt'),
    ...BROWS,
  ]),

  /**
   * Curly — the tallest of the six.
   *
   * Volume made of overlapping circles rather than one big ellipse: a larger
   * ellipse reads as a helmet, and the bumps are the only thing that says curly
   * at this density.
   */
  avatar_hair_04: Object.freeze([
    CAP(2, 4),
    ellipse(AXIS - 11, HEAD.cy - 14, 7, 7, HAIR),
    ellipse(AXIS, HEAD.cy - 18, 8, 8, HAIR),
    ellipse(AXIS + 11, HEAD.cy - 14, 7, 7, HAIR),
    ellipse(HEAD.left - 2, HEAD.cy - 6, 6, 7, HAIR),
    ellipse(HEAD.right + 2, HEAD.cy - 6, 6, 7, HAIR),
    ...FACE_CUT(HEAD.cy - 11, 5),
    // Curls read by their shadows, not their outline.
    pixels(
      [
        [AXIS - 10, HEAD.cy - 12],
        [AXIS - 9, HEAD.cy - 11],
        [AXIS - 1, HEAD.cy - 16],
        [AXIS, HEAD.cy - 15],
        [AXIS + 10, HEAD.cy - 12],
        [AXIS + 11, HEAD.cy - 11],
        [HEAD.left - 1, HEAD.cy - 3],
        [HEAD.right + 1, HEAD.cy - 3],
      ],
      'alt',
    ),
    ...BROWS,
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
    /*
     * The crown comes out **wider than the cap**, so nothing of it survives above
     * the skull. Cut narrower — which is what a receding hairline looks like on
     * paper — it leaves two vertical strips of the cap standing at the temples
     * and above the head, and every balding manager grew a pair of horns.
     */
    eraseEllipse(HEAD.cx, HEAD.cy - 11, HEAD.rx + 2, 14),
    ...FACE_CUT(HEAD.cy - 6, 4),
    ...SIDEBURNS(18),
    ...BROWS,
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
    CAP(2, 2),
    // The band, then the tail, then the cap again over the band's shadow.
    ellipse(HEAD.left - 3, HEAD.cy - 4, 5, 5, HAIR),
    rect(HEAD.left - 11, HEAD.cy - 2, 11, 24, HAIR),
    ellipse(HEAD.left - 9, HEAD.cy + 21, 5, 5, HAIR),
    ...FACE_CUT(HEAD.cy - 11, 4),
    ...SIDEBURNS(12, 3),
    // The gather where the band pulls it in.
    rect(HEAD.left - 4, HEAD.cy - 2, 4, 5, 'alt'),
    ...STRANDS(HEAD.cy - 14),
    ...BROWS,
  ]),
});

/**
 * The moustache the three styles that have one all share.
 *
 * Twelve columns of a twenty-six-column head. The first pass drew eighteen,
 * which is wider than the gap between the ears and read as a bar across the face
 * rather than as hair on a lip.
 */
const MOUSTACHE: readonly Op[] = [
  rect(AXIS - 6, FACE.mouthY - 3, 12, 3, 'main'),
  rect(AXIS - 8, FACE.mouthY - 2, 3, 3, 'main'),
  rect(AXIS + 5, FACE.mouthY - 2, 3, 3, 'main'),
];

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
   * separates them at this size is **thickness**: a few pixels of growth along
   * the jawline against a shape that changes the silhouette.
   */
  avatar_face_hair_01: Object.freeze([
    ellipse(AXIS, HEAD.bottom - 9, 12, 10, 'alt'),
    eraseEllipse(AXIS, HEAD.bottom - 11, 10, 9),
    erase(AXIS - 13, HEAD.bottom - 22, 26, 9),
    eraseEllipse(AXIS, FACE.mouthY + 1, 4, 2),
  ]),

  /** Moustache — over the lip, under the nose. */
  avatar_face_hair_02: Object.freeze([...MOUSTACHE]),

  /** Goatee — moustache plus chin, with the cheeks left bare. */
  avatar_face_hair_03: Object.freeze([
    ...MOUSTACHE,
    rect(AXIS - 5, FACE.mouthY + 3, 10, 5, 'main'),
    rect(AXIS - 3, FACE.mouthY + 8, 6, 2, 'main'),
  ]),

  /** Full beard — jaw, chin and moustache, thick enough to change the outline. */
  avatar_face_hair_04: Object.freeze([
    ellipse(AXIS, HEAD.bottom - 7, 13, 12, 'main'),
    erase(AXIS - 14, HEAD.bottom - 23, 28, 12),
    // The mouth, left open in the beard.
    eraseEllipse(AXIS, FACE.mouthY + 1, 4, 2),
    ...MOUSTACHE,
    // Where the beard turns under the jaw, away from the light.
    pixels(
      [
        [AXIS + 6, HEAD.bottom + 2],
        [AXIS + 7, HEAD.bottom + 1],
        [AXIS + 8, HEAD.bottom],
        [AXIS + 5, HEAD.bottom + 3],
      ],
      'alt',
    ),
  ]),
});
