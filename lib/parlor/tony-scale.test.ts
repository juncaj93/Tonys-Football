import { describe, expect, it } from 'vitest';

import { COUNTER_EDGE, TONY, TONY_SPRITE, tonyCutRow } from './objects';

/**
 * Tony's scale, held by the two things that can silently break it.
 *
 * The commissioner reported him "visibly cut incorrectly around the counter".
 * The cause was not a misalignment — it was that his scale put the counter's
 * edge three rows under the bottom of his hands, so hand and occluder ended on
 * the same line and he read as amputated.
 *
 * Two invariants keep that from coming back. Both are arithmetic, so neither
 * needs a screenshot to catch a regression.
 */

/** Skin rows in `character_tony_neutral`, measured by scanning the sprite. */
const HANDS = { top: 106, bottom: 134 } as const;

describe('Tony at the counter', () => {
  it('keeps the sprite aspect, because AssetView draws w-full h-auto', () => {
    // The <img> has no say in its height. If these disagree, `TONY.height` is
    // describing a box that is not the box the browser draws, and every
    // percentage derived from it is quietly wrong.
    const implied = (TONY.width * TONY_SPRITE.height) / TONY_SPRITE.width;
    expect(Math.abs(TONY.height - implied)).toBeLessThan(1);
  });

  it('never cuts through his hands', () => {
    const row = tonyCutRow();
    const throughHands = row > HANDS.top && row < HANDS.bottom;
    expect(throughHands).toBe(false);
  });

  it('leaves real distance between the hand and the counter edge', () => {
    /*
     * The failure the commissioner reported. An occluder that stops within a
     * few pixels of where a limb stops does not read as *behind* — it reads as
     * *severed*, and the eye is unforgiving about it.
     *
     * Five rows is the threshold, not two. At this scale a room unit is roughly
     * 3.7 device pixels, so five rows is about nineteen — enough apron between
     * his hand and the counter for the overlap to be legible as overlap. The
     * shipped-and-wrong value cleared the hand by 2.9 rows and looked amputated.
     */
    const row = tonyCutRow();
    const clearance = row < HANDS.top ? HANDS.top - row : row - HANDS.bottom;
    expect(clearance).toBeGreaterThanOrEqual(5);
  });

  it('keeps him the size he was drawn to be', () => {
    // Commissioner ruling, 2026-07-30: scaling him up to move the cut made him
    // the largest thing in the room. The cut is positioned with `y`, not with
    // scale — this is the guard that stops the easy fix being reached for again.
    expect(TONY.width).toBe(72);
    expect(TONY.height).toBe(197);
  });

  it('leaves him inside the room and under the board', () => {
    expect(TONY.x).toBeGreaterThanOrEqual(0);
    expect(TONY.x + TONY.width).toBeLessThanOrEqual(320);
    // The board's painted frame ends at row 174; his head must start below it.
    expect(TONY.y).toBeGreaterThan(174);
    // And he must actually reach the counter, or he floats.
    expect(TONY.y + TONY.height).toBeGreaterThan(COUNTER_EDGE);
  });
});
