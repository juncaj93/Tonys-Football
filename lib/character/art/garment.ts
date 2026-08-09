import { ellipse, eraseEllipse, poly, type Material, type Op } from '../sprite';

import { ARM, AXIS, HAND, TORSO } from './geometry';

/**
 * The parts every garment shares.
 *
 * A chosen top and a worn apron are the same shape problem, and solving it twice
 * is how two things authored months apart end up sitting at two different
 * shoulder heights. Both read these.
 */

/** Where a long sleeve ends — clear of the hand, so the hand is never covered. */
export const SLEEVE_END = HAND.cy - HAND.r - 1;

/** Where a short sleeve ends. Above the elbow, so the forearm reads as bare. */
export const SHORT_SLEEVE_END = ARM.top + 9;

/** Shoulders, torso and hem. */
export function shell(hem: number, material: Material = 'main'): readonly Op[] {
  return [
    poly(
      [
        [TORSO.left + 1, TORSO.top],
        [TORSO.right - 1, TORSO.top],
        [TORSO.right - 3, hem],
        [TORSO.left + 3, hem],
      ],
      material,
    ),
    ellipse(TORSO.left + 5, TORSO.top + 5, 6, 5, material),
    ellipse(TORSO.right - 5, TORSO.top + 5, 6, 5, material),
  ];
}

export function sleeves(end: number, material: Material = 'main'): readonly Op[] {
  return [
    { kind: 'rect', x: ARM.leftX, y: ARM.top, w: ARM.width, h: end - ARM.top, material },
    { kind: 'rect', x: ARM.rightX, y: ARM.top, w: ARM.width, h: end - ARM.top, material },
    ellipse(ARM.leftX + 3, ARM.top + 2, 3, 3, material),
    ellipse(ARM.rightX + 2, ARM.top + 2, 3, 3, material),
  ];
}

/** A round neck opening, so the neck and collarbone show through. */
export const CREW_NECK: Op = eraseEllipse(AXIS, TORSO.top + 1, 6, 4);
