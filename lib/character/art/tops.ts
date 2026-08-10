import { ellipse, eraseEllipse, outline, poly, rect, type Op } from '../sprite';

import { SHORT_SLEEVE_END, SLEEVE_END, crewCollar, shell, sleeves } from './garment';
import { ARM, AXIS, NECK, TORSO } from './geometry';

/**
 * What a manager is wearing on top — six, dyed to their chosen colour.
 *
 * ## The shirt is a layer, not a body
 *
 * The system this replaces made the *body* the garment: two "bodies", each a
 * whole figure with a shirt baked in, so a hoodie and a button-up were two
 * drawings of a person rather than one person in two shirts. That is why there
 * were two — a third meant redrawing the arms, the hands and the face again.
 *
 * ## Every top stops at the wrist
 *
 * `ARM` and `HAND` are read from the shared geometry rather than guessed, and
 * `SLEEVE_END` is the one number that says where a long sleeve stops. The failure
 * this prevents already happened: a hoodie authored two columns wider than the
 * shirt covered the sleeves *and* the hands, and the figure rendered as a head on
 * a slab with no arms.
 *
 * ## Volume is derived; seams are authored
 *
 * None of these carries a hand-drawn shadow down its side any more — the form
 * pass in `sprite.ts` finds the lit and shaded flanks of a torso from the torso's
 * own outline, and `composite.ts` darkens the arm under a cuff and the trouser
 * under a hem without being told. What is authored here is only what a shape
 * cannot imply: a placket, a pocket's mouth, a rib, a check.
 */

const SHADE = 'alt' as const;

export const TOPS: Readonly<Record<string, readonly Op[]>> = Object.freeze({
  /** Hoodie — the hood bunched at the neck, a pouch pocket, two drawstrings. */
  avatar_body_starter_02: Object.freeze([
    ...shell(TORSO.bottom),
    ...sleeves(SLEEVE_END),
    // The hood, sitting behind the neck and rising above the shoulder line.
    ellipse(AXIS, TORSO.top + 1, 19, 10, SHADE),
    eraseEllipse(AXIS, TORSO.top - 4, 9, 7),
    // Where the hood's roll meets the shoulder, so it reads as bunched fabric.
    rect(AXIS - 19, TORSO.top + 6, 38, 2, SHADE),
    /*
     * Drawstrings, two pixels wide. One pixel used to be the obvious choice and
     * it rendered them in `ink-900`: every pixel of a one-pixel line touches
     * empty, so the outline pass claimed the whole cord. `sprite.ts` now leaves
     * a mark with no interior alone, and two pixels is legible besides.
     */
    rect(AXIS - 7, TORSO.top + 8, 2, 14, 'fixed:cream'),
    rect(AXIS + 5, TORSO.top + 8, 2, 12, 'fixed:cream'),
    /*
     * The pouch pocket, drawn as four edges. A filled rectangle with `erase`
     * through the middle takes this *layer* away and shows the bare chest
     * underneath — which is what the first render did, on every hoodie.
     */
    ...outline(AXIS - 14, TORSO.bottom - 22, 28, 14, SHADE),
    // Ribbed cuffs and hem, which is what makes it read as a hoodie and not a bag.
    rect(ARM.leftX - 1, SLEEVE_END - 5, ARM.width + 2, 5, SHADE),
    rect(ARM.rightX - 1, SLEEVE_END - 5, ARM.width + 2, 5, SHADE),
    rect(TORSO.left + 3, TORSO.bottom - 5, TORSO.right - TORSO.left - 6, 5, SHADE),
  ]),

  /** Button-up shirt — a pointed collar and a placket down the front. */
  avatar_body_starter_03: Object.freeze([
    ...shell(TORSO.bottom),
    ...sleeves(SLEEVE_END),
    // Collar points, left and right of the neck.
    poly(
      [
        [AXIS - 12, TORSO.top - 2],
        [AXIS - 2, TORSO.top - 2],
        [AXIS - 5, TORSO.top + 11],
      ],
      SHADE,
    ),
    poly(
      [
        [AXIS + 12, TORSO.top - 2],
        [AXIS + 2, TORSO.top - 2],
        [AXIS + 5, TORSO.top + 11],
      ],
      SHADE,
    ),
    // The placket, with buttons on it.
    rect(AXIS - 2, TORSO.top + 7, 4, TORSO.bottom - TORSO.top - 7, SHADE),
    rect(AXIS - 1, TORSO.top + 16, 2, 2, 'fixed:cream'),
    rect(AXIS - 1, TORSO.top + 26, 2, 2, 'fixed:cream'),
    rect(AXIS - 1, TORSO.top + 36, 2, 2, 'fixed:cream'),
    // A breast pocket, on the wearer's left. Edges, not a hole — see the hoodie.
    ...outline(AXIS + 8, TORSO.top + 14, 11, 9, SHADE),
    // The cuff, so a sleeve ends in a shirt rather than in a tube.
    rect(ARM.leftX - 1, SLEEVE_END - 4, ARM.width + 2, 4, SHADE),
    rect(ARM.rightX - 1, SLEEVE_END - 4, ARM.width + 2, 4, SHADE),
  ]),

  /** T-shirt — a crew neck and short sleeves, so the forearms are bare. */
  avatar_body_starter_04: Object.freeze([
    ...shell(TORSO.bottom),
    ...sleeves(SHORT_SLEEVE_END),
    // The collar band, and the opening it rings.
    ...crewCollar(5, 2),
    // The sleeve hem.
    rect(ARM.leftX - 1, SHORT_SLEEVE_END - 3, ARM.width + 2, 3, SHADE),
    rect(ARM.rightX - 1, SHORT_SLEEVE_END - 3, ARM.width + 2, 3, SHADE),
    // A fold where the shirt gathers at the waist. One line, on the shaded side.
    rect(AXIS + 2, TORSO.bottom - 9, 14, 2, SHADE),
  ]),

  /**
   * Football jersey — a V-neck, shoulder stripes and a number panel.
   *
   * The number is a **panel rather than a numeral**: two digits in the house
   * pixel face would be four pixels tall here and would read as dirt. `ART_SPEC`
   * bans real-team marks, so the panel carries no club identity either.
   */
  avatar_body_starter_05: Object.freeze([
    ...shell(TORSO.bottom),
    ...sleeves(SHORT_SLEEVE_END),
    // The V.
    poly(
      [
        [AXIS - 11, TORSO.top - 2],
        [AXIS + 11, TORSO.top - 2],
        [AXIS, TORSO.top + 14],
      ],
      SHADE,
    ),
    poly(
      [
        [AXIS - 7, TORSO.top - 2],
        [AXIS + 7, TORSO.top - 2],
        [AXIS, TORSO.top + 9],
      ],
      'fixed:cream',
    ),
    // Shoulder stripes.
    rect(TORSO.left + 4, TORSO.top + 6, 9, 3, 'fixed:cream'),
    rect(TORSO.right - 13, TORSO.top + 6, 9, 3, 'fixed:cream'),
    // The number panel.
    rect(AXIS - 9, TORSO.top + 19, 18, 16, 'fixed:cream'),
    rect(AXIS - 6, TORSO.top + 22, 4, 10, SHADE),
    rect(AXIS + 2, TORSO.top + 22, 4, 10, SHADE),
    rect(ARM.leftX - 1, SHORT_SLEEVE_END - 3, ARM.width + 2, 3, 'fixed:cream'),
    rect(ARM.rightX - 1, SHORT_SLEEVE_END - 3, ARM.width + 2, 3, 'fixed:cream'),
  ]),

  /**
   * Flannel — worn open over a plain tee.
   *
   * The check is two rows and two columns of the shade tone. A finer check is
   * one pixel wide at this size and turns into noise the moment anything is
   * drawn over it.
   */
  avatar_body_starter_06: Object.freeze([
    ...shell(TORSO.bottom + 2),
    ...sleeves(SLEEVE_END),
    // The check.
    rect(TORSO.left + 3, TORSO.top + 14, TORSO.right - TORSO.left - 6, 3, SHADE),
    rect(TORSO.left + 3, TORSO.top + 32, TORSO.right - TORSO.left - 6, 3, SHADE),
    rect(AXIS - 16, TORSO.top, 3, TORSO.bottom - TORSO.top + 2, SHADE),
    rect(AXIS + 13, TORSO.top, 3, TORSO.bottom - TORSO.top + 2, SHADE),
    // The tee underneath, showing through the open front.
    rect(AXIS - 7, TORSO.top, 14, TORSO.bottom - TORSO.top + 2, 'fixed:cream'),
    eraseEllipse(AXIS, TORSO.top - 1, 9, 6),
    // The two front edges, so the shirt reads as open rather than as a stripe.
    rect(AXIS - 9, TORSO.top, 2, TORSO.bottom - TORSO.top + 2, SHADE),
    rect(AXIS + 7, TORSO.top, 2, TORSO.bottom - TORSO.top + 2, SHADE),
    // The collar, folded back over the shoulders.
    poly(
      [
        [AXIS - 13, TORSO.top - 2],
        [AXIS - 3, TORSO.top - 2],
        [AXIS - 7, TORSO.top + 10],
        [AXIS - 13, TORSO.top + 6],
      ],
      SHADE,
    ),
    poly(
      [
        [AXIS + 13, TORSO.top - 2],
        [AXIS + 3, TORSO.top - 2],
        [AXIS + 7, TORSO.top + 10],
        [AXIS + 13, TORSO.top + 6],
      ],
      SHADE,
    ),
    rect(ARM.leftX - 1, SLEEVE_END - 5, ARM.width + 2, 5, SHADE),
    rect(ARM.rightX - 1, SLEEVE_END - 5, ARM.width + 2, 5, SHADE),
  ]),

  /** Crew-neck sweater — ribbed collar, cuffs and hem, and nothing else. */
  avatar_body_starter_07: Object.freeze([
    ...shell(TORSO.bottom + 2),
    ...sleeves(SLEEVE_END),
    ...crewCollar(6, 3),
    rect(ARM.leftX - 1, SLEEVE_END - 7, ARM.width + 2, 7, SHADE),
    rect(ARM.rightX - 1, SLEEVE_END - 7, ARM.width + 2, 7, SHADE),
    rect(TORSO.left + 3, TORSO.bottom - 4, TORSO.right - TORSO.left - 6, 6, SHADE),
    // Two knit lines across the chest, so a plain sweater is not a plain box.
    rect(TORSO.left + 8, TORSO.top + 21, TORSO.right - TORSO.left - 16, 2, SHADE),
    rect(TORSO.left + 8, TORSO.top + 30, TORSO.right - TORSO.left - 16, 2, SHADE),
  ]),
});

/** The neck opening every top shares, for the test that says the neck shows. */
export const NECK_OPENING = Object.freeze({
  top: NECK.top,
  bottom: TORSO.top + 5,
});
