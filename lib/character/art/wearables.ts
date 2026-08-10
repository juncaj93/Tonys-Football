import { ellipse, erase, outline, poly, rect, type Op } from '../sprite';

import { SHORT_SLEEVE_END, SLEEVE_END, shell, sleeves } from './garment';
import { ARM, AXIS, FACE, HEAD, HELD, TORSO } from './geometry';

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

/** The width of the skull, which every hat's band is cut to. */
const SKULL = HEAD.right - HEAD.left;

export const WEARABLE_ART: Readonly<Record<string, readonly Op[]>> = Object.freeze({
  // ------------------------------------------------------------------ head --
  /** Tony's Pizza visor — a crown and a brim wider than the head. */
  wear_head_pizza_visor: Object.freeze([
    ellipse(HEAD.cx, HEAD.top + 10, HEAD.rx + 2, 11, 'main'),
    // Everything below the band belongs to the face.
    erase(HEAD.left - 8, HEAD.top + 12, SKULL + 17, 30),
    // The brim, wider than the head, sitting on the cut.
    rect(HEAD.left - 5, HEAD.top + 12, SKULL + 11, 4, 'alt'),
    ellipse(HEAD.cx, HEAD.top + 14, HEAD.rx + 8, 3, 'alt'),
    erase(HEAD.left - 12, HEAD.top + 17, SKULL + 25, 10),
    // A pale panel on the front, where a wordmark would go.
    rect(AXIS - 7, HEAD.top + 4, 14, 5, 'fixed:cream'),
  ]),

  /** Winter beanie — the tallest thing the system draws, pom included. */
  wear_head_beanie_winter: Object.freeze([
    ellipse(HEAD.cx, HEAD.top + 8, HEAD.rx + 2, 15, 'main'),
    erase(HEAD.left - 6, HEAD.top + 16, SKULL + 13, 30),
    // The turned-up band.
    rect(HEAD.left - 3, HEAD.top + 8, SKULL + 7, 8, 'alt'),
    /*
     * The pom, and the tallest thing the system draws. It overlaps the crown
     * rather than sitting on a stalk above it: drawn clear, the outline pass gives
     * it its own closed silhouette and it reads as a balloon on a string.
     */
    rect(AXIS - 3, HEAD.top - 6, 6, 8, 'alt'),
    ellipse(HEAD.cx, HEAD.top - 7, 7, 7, 'fixed:cream'),
  ]),

  /** Folded paper cook's hat — tall, square-ish, with a fold down the middle. */
  wear_head_paper_hat: Object.freeze([
    // The puff — three overlapping circles, so a toque reads as cloth rather
    // than as a lampshade, which is what a straight-sided polygon gave.
    ellipse(AXIS - 10, HEAD.top - 4, 10, 10, 'main'),
    ellipse(AXIS + 10, HEAD.top - 4, 10, 10, 'main'),
    ellipse(AXIS, HEAD.top - 9, 12, 12, 'main'),
    rect(HEAD.left, HEAD.top - 6, SKULL + 1, 15, 'main'),
    // The band it sits on.
    rect(HEAD.left - 3, HEAD.top + 5, SKULL + 7, 8, 'alt'),
  ]),

  // ------------------------------------------------------------------ face --
  /** Sunglasses — two lenses and a bridge, sitting on the eye line. */
  wear_face_shades: Object.freeze([
    rect(HEAD.left + 1, HEAD.cy - 5, 10, 9, 'main'),
    rect(HEAD.right - 11, HEAD.cy - 5, 10, 9, 'main'),
    rect(AXIS - 3, HEAD.cy - 3, 6, 3, 'main'),
    // Arms of the frame, reaching the ears.
    rect(HEAD.left - 2, HEAD.cy - 4, 3, 3, 'alt'),
    rect(HEAD.right - 1, HEAD.cy - 4, 3, 3, 'alt'),
    // A highlight across each lens, which is the only thing that says "glass".
    rect(HEAD.left + 3, HEAD.cy - 3, 4, 2, 'fixed:cream'),
    rect(HEAD.right - 9, HEAD.cy - 3, 4, 2, 'fixed:cream'),
  ]),

  /** Obviously fake moustache — comically wide, with the curl at each end. */
  wear_face_mustache_fake: Object.freeze([
    rect(AXIS - 12, FACE.mouthY - 4, 24, 4, 'main'),
    rect(AXIS - 15, FACE.mouthY - 5, 4, 4, 'main'),
    rect(AXIS + 11, FACE.mouthY - 5, 4, 4, 'main'),
    // The curl at each end, which is the whole joke.
    rect(AXIS - 17, FACE.mouthY - 9, 3, 6, 'main'),
    rect(AXIS + 14, FACE.mouthY - 9, 3, 6, 'main'),
  ]),

  // ------------------------------------------------------------------ body --
  /** Tony's Pizza apron — a bib, a waist tie and a skirt, over whatever is under. */
  wear_body_apron_tony: Object.freeze([
    // Neck strap.
    rect(AXIS - 12, TORSO.top - 2, 3, 11, 'alt'),
    rect(AXIS + 9, TORSO.top - 2, 3, 11, 'alt'),
    // Bib.
    rect(AXIS - 14, TORSO.top + 7, 28, 20, 'main'),
    // Waist tie, running out past the body on both sides.
    rect(TORSO.left, TORSO.top + 26, TORSO.right - TORSO.left, 5, 'alt'),
    // Skirt.
    rect(TORSO.left + 3, TORSO.top + 30, TORSO.right - TORSO.left - 6, 26, 'main'),
    // The pale panel Tony's wordmark sits on.
    rect(AXIS - 9, TORSO.top + 12, 18, 9, 'fixed:cream'),
    rect(AXIS - 5, TORSO.top + 15, 10, 3, 'main'),
  ]),

  /** Blue and silver football jersey — a shoulder yoke and a number panel. */
  wear_body_jersey_blank: Object.freeze([
    ...shell(TORSO.bottom),
    ...sleeves(SHORT_SLEEVE_END),
    poly(
      [
        [AXIS - 11, TORSO.top - 2],
        [AXIS + 11, TORSO.top - 2],
        [AXIS, TORSO.top + 14],
      ],
      'alt',
    ),
    rect(TORSO.left + 4, TORSO.top + 6, TORSO.right - TORSO.left - 8, 3, 'fixed:cream'),
    rect(AXIS - 9, TORSO.top + 19, 18, 16, 'fixed:cream'),
    rect(AXIS - 6, TORSO.top + 22, 4, 10, 'alt'),
    rect(AXIS + 2, TORSO.top + 22, 4, 10, 'alt'),
    rect(ARM.leftX - 1, SHORT_SLEEVE_END - 3, ARM.width + 2, 3, 'fixed:cream'),
    rect(ARM.rightX - 1, SHORT_SLEEVE_END - 3, ARM.width + 2, 3, 'fixed:cream'),
  ]),

  /** Tracksuit — a full zip and a stripe down each sleeve. */
  wear_body_tracksuit: Object.freeze([
    ...shell(TORSO.bottom + 2),
    ...sleeves(SLEEVE_END),
    rect(ARM.leftX, ARM.top + 2, 3, SLEEVE_END - ARM.top - 2, 'fixed:cream'),
    rect(ARM.rightX + ARM.width - 3, ARM.top + 2, 3, SLEEVE_END - ARM.top - 2, 'fixed:cream'),
    // The zip, and a stand collar above it.
    rect(AXIS - 1, TORSO.top, 3, TORSO.bottom - TORSO.top + 2, 'fixed:cream'),
    rect(AXIS - 11, TORSO.top - 5, 22, 8, 'alt'),
    rect(ARM.leftX - 1, SLEEVE_END - 5, ARM.width + 2, 5, 'alt'),
    rect(ARM.rightX - 1, SLEEVE_END - 5, ARM.width + 2, 5, 'alt'),
  ]),

  /** Delivery driver uniform — a collar, a chest pocket and a name patch. */
  wear_body_delivery_uniform: Object.freeze([
    ...shell(TORSO.bottom),
    ...sleeves(SHORT_SLEEVE_END),
    poly(
      [
        [AXIS - 12, TORSO.top - 2],
        [AXIS - 2, TORSO.top - 2],
        [AXIS - 5, TORSO.top + 11],
      ],
      'alt',
    ),
    poly(
      [
        [AXIS + 12, TORSO.top - 2],
        [AXIS + 2, TORSO.top - 2],
        [AXIS + 5, TORSO.top + 11],
      ],
      'alt',
    ),
    rect(AXIS - 2, TORSO.top + 7, 4, TORSO.bottom - TORSO.top - 7, 'alt'),
    ...outline(AXIS + 8, TORSO.top + 14, 12, 10, 'alt'),
    rect(AXIS - 20, TORSO.top + 16, 12, 6, 'fixed:cream'),
    rect(ARM.leftX - 1, SHORT_SLEEVE_END - 3, ARM.width + 2, 3, 'alt'),
    rect(ARM.rightX - 1, SHORT_SLEEVE_END - 3, ARM.width + 2, 3, 'alt'),
  ]),

  // ------------------------------------------------------------------ hand --
  /**
   * Pizza peel — the widest thing the system draws.
   *
   * The blade starts two columns clear of where `avatar_hair_03` falls past the
   * shoulder, so a long-haired manager holding a peel keeps their hairstyle.
   */
  wear_hand_pizza_peel: Object.freeze([
    rect(HOLD_X - 2, HELD.cy - 32, 5, 42, 'main'),
    ellipse(HOLD_X, HELD.cy - 52, 10, 15, 'alt'),
    rect(HOLD_X - 10, HELD.cy - 52, 21, 17, 'alt'),
    // The rim of the blade, so it is a peel rather than a lollipop.
    rect(HOLD_X - 10, HELD.cy - 37, 21, 4, 'main'),
  ]),

  /** Slice of pizza — crust, cheese and one pepperoni. */
  wear_hand_slice: Object.freeze([
    poly(
      [
        [HOLD_X - 4, HELD.cy + 2],
        [HOLD_X + 19, HELD.cy - 14],
        [HOLD_X + 19, HELD.cy + 14],
      ],
      'main',
    ),
    // The crust is the outside edge, which is the end you are not holding.
    rect(HOLD_X + 17, HELD.cy - 14, 5, 29, 'alt'),
    rect(HOLD_X + 7, HELD.cy - 3, 4, 4, 'fixed:red'),
    rect(HOLD_X + 12, HELD.cy + 5, 4, 4, 'fixed:red'),
    rect(HOLD_X + 11, HELD.cy - 8, 4, 4, 'fixed:red'),
  ]),

  /** Small trophy — a cup, a stem and a plinth. */
  wear_hand_trophy_mini: Object.freeze([
    ellipse(HOLD_X + 7, HELD.cy - 14, 9, 9, 'main'),
    erase(HOLD_X - 3, HELD.cy - 25, 21, 7),
    rect(HOLD_X + 1, HELD.cy - 23, 14, 7, 'main'),
    // Handles.
    rect(HOLD_X - 2, HELD.cy - 21, 4, 7, 'alt'),
    rect(HOLD_X + 14, HELD.cy - 21, 4, 7, 'alt'),
    // Stem and plinth.
    rect(HOLD_X + 5, HELD.cy - 7, 5, 7, 'main'),
    rect(HOLD_X + 2, HELD.cy, 12, 5, 'alt'),
  ]),
});
