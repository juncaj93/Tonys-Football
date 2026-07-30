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

  it('cuts above his hands, not through them or flush with them', () => {
    const row = tonyCutRow();

    // Above the hands entirely: his arms descend into the counter mid-sleeve.
    expect(row).toBeLessThan(HANDS.top);

    // Not so high that the cut lands in his torso — he would be a bust on a
    // shelf rather than a man standing behind a counter.
    expect(row).toBeGreaterThan(90);
  });

  it('never lets the cut land within two rows of a hand edge', () => {
    // The specific failure mode: an occluder that stops exactly where a limb
    // stops reads as removal rather than as occlusion. Distance, not order.
    const row = tonyCutRow();
    expect(Math.abs(row - HANDS.top)).toBeGreaterThan(2);
    expect(Math.abs(row - HANDS.bottom)).toBeGreaterThan(2);
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
