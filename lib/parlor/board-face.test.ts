import { describe, expect, it } from 'vitest';

import { boardFace } from './tonight';

/**
 * The board's face.
 *
 * Commissioner ruling, 2026-07-30: it should read like `WEEK 5` plus one short
 * fact, elegantly, and it must not carry sentences. These assert the *shape* of
 * what the face may say, because the defect was one of quantity — two sentences at
 * decorative size — rather than of correctness.
 */

describe('the board face', () => {
  it('counts down to week one during the offseason', () => {
    expect(boardFace({ daysUntilKickoff: 42 })).toEqual({
      hero: 'WEEK ONE',
      detail: '42 days out',
    });
  });

  it('says tomorrow rather than "1 days out"', () => {
    // The sort of thing a template writes and a person never says.
    expect(boardFace({ daysUntilKickoff: 1 }).detail).toBe('tomorrow');
  });

  it('names the current week once the season is under way', () => {
    expect(boardFace({ daysUntilKickoff: null, week: 5 }).hero).toBe('WEEK 5');
  });

  it('shows the matchup of the week when Stats supplies one', () => {
    expect(
      boardFace({ daysUntilKickoff: null, week: 5, matchup: 'Matty B v Nathan' }).detail,
    ).toBe('Matty B v Nathan');
  });

  it('shows nothing rather than inventing a detail', () => {
    // SW never decides what a result means (`PRODUCT_DELIVERY_MANDATE.md §9`). With
    // no Stats fact, the field is empty — not filled with prose.
    expect(boardFace({ daysUntilKickoff: null, week: 5 }).detail).toBeNull();
  });

  it('keeps both lines short enough for the field', () => {
    /*
     * The text field is 99 room units — about 121 CSS px at 390. The hero renders
     * at 20px in the display face and the detail at 16px in the body face, so a
     * long string wraps or clips. These caps are what stop the old defect coming
     * back through a copy edit.
     */
    const cases = [
      boardFace({ daysUntilKickoff: 42 }),
      boardFace({ daysUntilKickoff: 1 }),
      boardFace({ daysUntilKickoff: null, week: 18 }),
      boardFace({ daysUntilKickoff: null, week: 5, matchup: 'Matty B v Nathan' }),
    ];

    for (const face of cases) {
      expect(face.hero.length, `hero too long: ${face.hero}`).toBeLessThanOrEqual(10);
      if (face.detail !== null) {
        expect(face.detail.length, `detail too long: ${face.detail}`).toBeLessThanOrEqual(20);
      }
      // A sentence belongs in the panel, never on the face.
      expect(face.detail ?? '').not.toMatch(/\./);
    }
  });
});
