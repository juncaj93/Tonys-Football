import { ellipse, erase, outline, poly, rect, type Op } from '../sprite';

import { SHORT_SLEEVE_END, SLEEVE_END, shell, sleeves } from './garment';
import { ARM, AXIS, HEAD, HELD, TORSO } from './geometry';

/**
 * The twelve earned wearables.
 *
 * ## They keep their own colours
 *
 * `main` and `alt` here resolve to the item's authored ramp, never to the
 * manager's palette — a manager who pulled a blue jersey pulled *that* jersey, and
 * recolouring it per character would quietly make every copy different.
 * `lib/character/catalog.ts` carries the ramp beside the slug.
 *
 * ## Nothing awards one of these, and that is not an omission
 *
 * `16` approves no wearable source, the pizza box awards `collectible_*` only
 * (commissioner ruling, 2026-07-31), and inventing a source here would be
 * absorbing scope from a milestone nobody has written. Every manager's wardrobe
 * is empty today; the customiser says so in one line rather than four.
 *
 * They are drawn anyway because the **preview fixtures** are the geometry cases
 * that could clip — the tallest hat over the tallest hair, the widest held object
 * against the widest hairstyle — and those have to be photographable before an
 * award system exists, not after.
 */

/** A held object is in the right hand, always (`geometry.ts`, `HELD`). */
const HOLD_X = HELD.cx;

export const WEARABLE_ART: Readonly<Record<string, readonly Op[]>> = Object.freeze({
  // ------------------------------------------------------------------ head --
  /** Tony's Pizza visor — a crown and a brim wider than the head. */
  wear_head_pizza_visor: Object.freeze([
    ellipse(HEAD.cx, HEAD.top + 7, HEAD.rx + 1, 7, 'main'),
    erase(HEAD.left - 2, HEAD.top + 8, 26, 12),
    // The brim.
    ellipse(HEAD.cx, HEAD.top + 8, HEAD.rx + 4, 3, 'alt'),
    erase(HEAD.left - 4, HEAD.top + 8, 30, 2),
    // A pale panel on the front, where a wordmark would go.
    rect(AXIS - 4, HEAD.top + 3, 8, 3, 'fixed:cream'),
  ]),

  /** Winter beanie — the tallest thing the system draws, pom included. */
  wear_head_beanie_winter: Object.freeze([
    ellipse(HEAD.cx, HEAD.top + 6, HEAD.rx + 1, 9, 'main'),
    erase(HEAD.left - 2, HEAD.top + 9, 26, 14),
    // The turned-up band.
    rect(HEAD.left - 1, HEAD.top + 5, HEAD.right - HEAD.left + 3, 5, 'alt'),
    /*
     * The pom, and the tallest thing the system draws. It overlaps the crown
     * rather than sitting on a stalk above it: drawn clear, the outline pass gives
     * it its own closed silhouette and it reads as a balloon on a string.
     */
    rect(AXIS - 2, HEAD.top - 3, 4, 4, 'alt'),
    ellipse(HEAD.cx, HEAD.top - 4, 4, 4, 'fixed:cream'),
  ]),

  /** Folded paper cook's hat — tall, square-ish, with a fold down the middle. */
  wear_head_paper_hat: Object.freeze([
    // The puff — three overlapping circles, so a toque reads as cloth rather
    // than as a lampshade, which is what a straight-sided polygon gave.
    ellipse(AXIS - 6, HEAD.top - 3, 6, 6, 'main'),
    ellipse(AXIS + 6, HEAD.top - 3, 6, 6, 'main'),
    ellipse(AXIS, HEAD.top - 6, 7, 7, 'main'),
    rect(HEAD.left, HEAD.top - 4, HEAD.right - HEAD.left + 1, 9, 'main'),
    // The band it sits on.
    rect(HEAD.left - 2, HEAD.top + 3, HEAD.right - HEAD.left + 5, 5, 'alt'),
  ]),

  // ------------------------------------------------------------------ face --
  /** Sunglasses — two lenses and a bridge, sitting on the eye line. */
  wear_face_shades: Object.freeze([
    rect(HEAD.left + 2, HEAD.cy - 4, 8, 5, 'main'),
    rect(HEAD.right - 9, HEAD.cy - 4, 8, 5, 'main'),
    rect(AXIS - 2, HEAD.cy - 3, 4, 2, 'main'),
    // Arms of the frame, reaching the ears.
    rect(HEAD.left, HEAD.cy - 3, 2, 2, 'alt'),
    rect(HEAD.right - 1, HEAD.cy - 3, 2, 2, 'alt'),
    // A highlight on each lens, which is the only thing that says "glass".
    rect(HEAD.left + 3, HEAD.cy - 3, 2, 1, 'fixed:cream'),
    rect(HEAD.right - 8, HEAD.cy - 3, 2, 1, 'fixed:cream'),
  ]),

  /** Obviously fake moustache — comically wide, with the curl at each end. */
  wear_face_mustache_fake: Object.freeze([
    rect(AXIS - 7, HEAD.bottom - 9, 14, 3, 'main'),
    rect(AXIS - 9, HEAD.bottom - 10, 3, 3, 'main'),
    rect(AXIS + 6, HEAD.bottom - 10, 3, 3, 'main'),
    // The curl at each end, which is the whole joke.
    rect(AXIS - 10, HEAD.bottom - 12, 2, 3, 'main'),
    rect(AXIS + 8, HEAD.bottom - 12, 2, 3, 'main'),
  ]),

  // ------------------------------------------------------------------ body --
  /** Tony's Pizza apron — a bib, a waist tie and a skirt, over whatever is under. */
  wear_body_apron_tony: Object.freeze([
    // Neck strap.
    rect(AXIS - 7, TORSO.top - 1, 2, 6, 'alt'),
    rect(AXIS + 5, TORSO.top - 1, 2, 6, 'alt'),
    // Bib.
    rect(AXIS - 8, TORSO.top + 4, 16, 12, 'main'),
    // Waist tie, running out past the body on both sides.
    rect(TORSO.left, TORSO.top + 15, TORSO.right - TORSO.left, 3, 'alt'),
    // Skirt.
    rect(TORSO.left + 2, TORSO.top + 17, TORSO.right - TORSO.left - 4, 16, 'main'),
    // The pale panel Tony's wordmark sits on.
    rect(AXIS - 5, TORSO.top + 7, 10, 5, 'fixed:cream'),
    rect(AXIS - 3, TORSO.top + 9, 6, 1, 'main'),
  ]),

  /** Blue and silver football jersey — a shoulder yoke and a number panel. */
  wear_body_jersey_blank: Object.freeze([
    ...shell(TORSO.bottom),
    ...sleeves(SHORT_SLEEVE_END),
    poly([[AXIS - 6, TORSO.top - 1], [AXIS + 6, TORSO.top - 1], [AXIS, TORSO.top + 8]], 'alt'),
    rect(TORSO.left + 2, TORSO.top + 3, TORSO.right - TORSO.left - 4, 2, 'fixed:cream'),
    rect(AXIS - 5, TORSO.top + 11, 10, 9, 'fixed:cream'),
    rect(AXIS - 3, TORSO.top + 13, 2, 5, 'alt'),
    rect(AXIS + 1, TORSO.top + 13, 2, 5, 'alt'),
    rect(ARM.leftX, SHORT_SLEEVE_END - 2, ARM.width, 2, 'fixed:cream'),
    rect(ARM.rightX, SHORT_SLEEVE_END - 2, ARM.width, 2, 'fixed:cream'),
  ]),

  /** Tracksuit — a full zip and a stripe down each sleeve. */
  wear_body_tracksuit: Object.freeze([
    ...shell(TORSO.bottom + 1),
    ...sleeves(SLEEVE_END),
    rect(ARM.leftX, ARM.top, 2, SLEEVE_END - ARM.top, 'fixed:cream'),
    rect(ARM.rightX + ARM.width - 2, ARM.top, 2, SLEEVE_END - ARM.top, 'fixed:cream'),
    // The zip, and a stand collar above it.
    rect(AXIS - 1, TORSO.top, 2, TORSO.bottom - TORSO.top + 1, 'fixed:cream'),
    rect(AXIS - 6, TORSO.top - 3, 12, 5, 'alt'),
    rect(ARM.leftX, SLEEVE_END - 3, ARM.width, 3, 'alt'),
    rect(ARM.rightX, SLEEVE_END - 3, ARM.width, 3, 'alt'),
  ]),

  /** Delivery driver uniform — a collar, a chest pocket and a name patch. */
  wear_body_delivery_uniform: Object.freeze([
    ...shell(TORSO.bottom),
    ...sleeves(SHORT_SLEEVE_END),
    poly([[AXIS - 7, TORSO.top - 1], [AXIS - 1, TORSO.top - 1], [AXIS - 3, TORSO.top + 6]], 'alt'),
    poly([[AXIS + 7, TORSO.top - 1], [AXIS + 1, TORSO.top - 1], [AXIS + 3, TORSO.top + 6]], 'alt'),
    rect(AXIS - 1, TORSO.top + 4, 3, TORSO.bottom - TORSO.top - 4, 'alt'),
    ...outline(AXIS + 5, TORSO.top + 8, 7, 6, 'alt'),
    rect(AXIS - 12, TORSO.top + 9, 7, 4, 'fixed:cream'),
    rect(ARM.leftX, SHORT_SLEEVE_END - 2, ARM.width, 2, 'alt'),
    rect(ARM.rightX, SHORT_SLEEVE_END - 2, ARM.width, 2, 'alt'),
  ]),

  // ------------------------------------------------------------------ hand --
  /**
   * Pizza peel — the widest thing the system draws.
   *
   * The blade starts a column clear of where `avatar_hair_03` falls past the
   * shoulder, so a long-haired manager holding a peel keeps their hairstyle.
   */
  wear_hand_pizza_peel: Object.freeze([
    rect(HOLD_X - 1, HELD.cy - 18, 3, 24, 'main'),
    ellipse(HOLD_X, HELD.cy - 30, 7, 9, 'alt'),
    rect(HOLD_X - 7, HELD.cy - 30, 15, 10, 'alt'),
    // The rim of the blade, so it is a peel rather than a lollipop.
    rect(HOLD_X - 7, HELD.cy - 21, 15, 2, 'main'),
  ]),

  /** Slice of pizza — crust, cheese and one pepperoni. */
  wear_hand_slice: Object.freeze([
    poly(
      [
        [HOLD_X - 2, HELD.cy + 1],
        [HOLD_X + 11, HELD.cy - 8],
        [HOLD_X + 11, HELD.cy + 8],
      ],
      'main',
    ),
    // The crust is the outside edge, which is the end you are not holding.
    rect(HOLD_X + 10, HELD.cy - 8, 3, 17, 'alt'),
    rect(HOLD_X + 4, HELD.cy - 2, 2, 2, 'fixed:red'),
    rect(HOLD_X + 7, HELD.cy + 3, 2, 2, 'fixed:red'),
    rect(HOLD_X + 6, HELD.cy - 4, 2, 2, 'fixed:red'),
  ]),

  /** Small trophy — a cup, a stem and a plinth. */
  wear_hand_trophy_mini: Object.freeze([
    ellipse(HOLD_X + 4, HELD.cy - 8, 5, 5, 'main'),
    erase(HOLD_X - 1, HELD.cy - 14, 12, 4),
    rect(HOLD_X, HELD.cy - 13, 9, 4, 'main'),
    // Handles.
    rect(HOLD_X - 1, HELD.cy - 12, 2, 4, 'alt'),
    rect(HOLD_X + 8, HELD.cy - 12, 2, 4, 'alt'),
    // Stem and plinth.
    rect(HOLD_X + 3, HELD.cy - 4, 3, 4, 'main'),
    rect(HOLD_X + 1, HELD.cy, 7, 3, 'alt'),
  ]),
});
