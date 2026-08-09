import { ellipse, eraseEllipse, outline, poly, rect, type Op } from '../sprite';

import { CREW_NECK, SHORT_SLEEVE_END, SLEEVE_END, shell, sleeves } from './garment';
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
 */

const SHADE = 'alt' as const;

export const TOPS: Readonly<Record<string, readonly Op[]>> = Object.freeze({
  /** Hoodie — the hood bunched at the neck, a pouch pocket, two drawstrings. */
  avatar_body_starter_02: Object.freeze([
    ...shell(TORSO.bottom),
    ...sleeves(SLEEVE_END),
    // The hood, sitting behind the neck and rising above the shoulder line.
    ellipse(AXIS, TORSO.top + 1, 11, 6, SHADE),
    eraseEllipse(AXIS, TORSO.top - 1, 5, 4),
    // Drawstrings.
    rect(AXIS - 4, TORSO.top + 4, 1, 7, 'fixed:cream'),
    rect(AXIS + 3, TORSO.top + 4, 1, 7, 'fixed:cream'),
    /*
     * The pouch pocket, drawn as four edges. A filled rectangle with `erase`
     * through the middle takes this *layer* away and shows the bare chest
     * underneath — which is what the first render did, on every hoodie.
     */
    ...outline(AXIS - 8, TORSO.bottom - 13, 16, 8, SHADE),
    // Ribbed cuffs and hem, which is what makes it read as a hoodie and not a bag.
    rect(ARM.leftX, SLEEVE_END - 3, ARM.width, 3, SHADE),
    rect(ARM.rightX, SLEEVE_END - 3, ARM.width, 3, SHADE),
    rect(TORSO.left + 3, TORSO.bottom - 3, TORSO.right - TORSO.left - 6, 3, SHADE),
  ]),

  /** Button-up shirt — a pointed collar and a placket down the front. */
  avatar_body_starter_03: Object.freeze([
    ...shell(TORSO.bottom),
    ...sleeves(SLEEVE_END),
    // Collar points, left and right of the neck.
    poly([[AXIS - 7, TORSO.top - 1], [AXIS - 1, TORSO.top - 1], [AXIS - 3, TORSO.top + 6]], SHADE),
    poly([[AXIS + 7, TORSO.top - 1], [AXIS + 1, TORSO.top - 1], [AXIS + 3, TORSO.top + 6]], SHADE),
    // The placket, with buttons on it.
    rect(AXIS - 1, TORSO.top + 4, 3, TORSO.bottom - TORSO.top - 4, SHADE),
    rect(AXIS, TORSO.top + 9, 1, 1, 'fixed:cream'),
    rect(AXIS, TORSO.top + 15, 1, 1, 'fixed:cream'),
    rect(AXIS, TORSO.top + 21, 1, 1, 'fixed:cream'),
    // A breast pocket, on the wearer's left. Edges, not a hole — see the hoodie.
    ...outline(AXIS + 5, TORSO.top + 8, 6, 5, SHADE),
  ]),

  /** T-shirt — a crew neck and short sleeves, so the forearms are bare. */
  avatar_body_starter_04: Object.freeze([
    ...shell(TORSO.bottom),
    ...sleeves(SHORT_SLEEVE_END),
    CREW_NECK,
    // The collar band.
    ellipse(AXIS, TORSO.top + 1, 7, 5, SHADE),
    eraseEllipse(AXIS, TORSO.top + 1, 6, 4),
    // The sleeve hem.
    rect(ARM.leftX, SHORT_SLEEVE_END - 2, ARM.width, 2, SHADE),
    rect(ARM.rightX, SHORT_SLEEVE_END - 2, ARM.width, 2, SHADE),
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
    poly([[AXIS - 6, TORSO.top - 1], [AXIS + 6, TORSO.top - 1], [AXIS, TORSO.top + 8]], SHADE),
    poly([[AXIS - 4, TORSO.top - 1], [AXIS + 4, TORSO.top - 1], [AXIS, TORSO.top + 5]], 'fixed:cream'),
    // Shoulder stripes.
    rect(TORSO.left + 2, TORSO.top + 3, 5, 2, 'fixed:cream'),
    rect(TORSO.right - 7, TORSO.top + 3, 5, 2, 'fixed:cream'),
    // The number panel.
    rect(AXIS - 5, TORSO.top + 11, 10, 9, 'fixed:cream'),
    rect(AXIS - 3, TORSO.top + 13, 2, 5, SHADE),
    rect(AXIS + 1, TORSO.top + 13, 2, 5, SHADE),
    rect(ARM.leftX, SHORT_SLEEVE_END - 2, ARM.width, 2, 'fixed:cream'),
    rect(ARM.rightX, SHORT_SLEEVE_END - 2, ARM.width, 2, 'fixed:cream'),
  ]),

  /**
   * Flannel — worn open over a plain tee.
   *
   * The check is two rows and two columns of the shade tone. A finer check is
   * one pixel wide at this size and turns into noise the moment anything is
   * drawn over it.
   */
  avatar_body_starter_06: Object.freeze([
    ...shell(TORSO.bottom + 1),
    ...sleeves(SLEEVE_END),
    // The check.
    rect(TORSO.left + 2, TORSO.top + 8, TORSO.right - TORSO.left - 4, 2, SHADE),
    rect(TORSO.left + 2, TORSO.top + 18, TORSO.right - TORSO.left - 4, 2, SHADE),
    rect(AXIS - 9, TORSO.top, 2, TORSO.bottom - TORSO.top, SHADE),
    rect(AXIS + 7, TORSO.top, 2, TORSO.bottom - TORSO.top, SHADE),
    // The tee underneath, showing through the open front.
    rect(AXIS - 4, TORSO.top, 8, TORSO.bottom - TORSO.top + 1, 'fixed:cream'),
    eraseEllipse(AXIS, TORSO.top, 5, 4),
    // The two front edges, so the shirt reads as open rather than as a stripe.
    rect(AXIS - 5, TORSO.top, 1, TORSO.bottom - TORSO.top + 1, 'fixed:ink'),
    rect(AXIS + 4, TORSO.top, 1, TORSO.bottom - TORSO.top + 1, 'fixed:ink'),
    rect(ARM.leftX, SLEEVE_END - 3, ARM.width, 3, SHADE),
    rect(ARM.rightX, SLEEVE_END - 3, ARM.width, 3, SHADE),
  ]),

  /** Crew-neck sweater — ribbed collar, cuffs and hem, and nothing else. */
  avatar_body_starter_07: Object.freeze([
    ...shell(TORSO.bottom + 1),
    ...sleeves(SLEEVE_END),
    CREW_NECK,
    ellipse(AXIS, TORSO.top + 1, 8, 5, SHADE),
    eraseEllipse(AXIS, TORSO.top + 1, 6, 4),
    rect(ARM.leftX, SLEEVE_END - 4, ARM.width, 4, SHADE),
    rect(ARM.rightX, SLEEVE_END - 4, ARM.width, 4, SHADE),
    rect(TORSO.left + 3, TORSO.bottom - 3, TORSO.right - TORSO.left - 6, 4, SHADE),
    // A single knit line across the chest, so a plain sweater is not a plain box.
    rect(TORSO.left + 5, TORSO.top + 12, TORSO.right - TORSO.left - 10, 1, SHADE),
  ]),
});

/** The neck opening every top shares, for the test that says the neck shows. */
export const NECK_OPENING = Object.freeze({
  top: NECK.top,
  bottom: TORSO.top + 5,
});
