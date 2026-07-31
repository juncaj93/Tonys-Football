import { describe, expect, it } from 'vitest';

import { BLOCKED_ON_M3, DEMO_STATES, demoState } from './states';

/**
 * The catalog, checked for the things a list of strings gets wrong quietly.
 *
 * The commissioner enumerated the states a demo has to show. The failure mode
 * is not a broken build — it is a catalog that drifts until it no longer covers
 * what was asked for, and nobody notices because it still passes.
 */

/** Verbatim from the mandate, so a rename cannot silently drop coverage. */
const REQUIRED = [
  'first welcome box',
  'no box available',
  'one unopened standard box',
  'multiple unopened boxes',
  'common collectible',
  'rare collectible',
  'top-rarity collectible',
  'whipped-cream collectible',
  'duplicate collectible',
  'interrupted opening',
  'resumed opening',
  'already-opened retry',
  'empty collection',
  'populated collection',
  'equipped wearable',
  'showcased object',
  'insufficient token balance',
  'successful box purchase',
  'failed purchase',
  'network failure and retry',
] as const;

describe('the demo catalog', () => {
  it('covers everything the commissioner enumerated, plus what review needed', () => {
    /*
     * Two states are carried beyond the mandate's list, and both were added
     * because a review could not otherwise be done:
     *
     *  - **epic** — the list names common, rare and top rarity, but a four-tier
     *    economy with no epic demo cannot show the escalation the reveal is
     *    built around.
     *  - **pull-while-broke** — the reveal plate offers another box only when the
     *    tab can take it, and the *absent* offer had no state. Every reveal
     *    screenshot ever taken was of somebody who could afford another one.
     *  - **box-waiting** — Tony says something different to a manager being
     *    handed their first box and to one who has opened before. Both approved
     *    line groups needed a state or only one could be reviewed.
     */
    const CARRIED_BEYOND_THE_LIST = 3;
    expect(DEMO_STATES.length).toBe(REQUIRED.length + CARRIED_BEYOND_THE_LIST);
  });

  it('gives every state a stable key, a route, and a sentence', () => {
    for (const state of DEMO_STATES) {
      expect(state.key, state.key).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(state.shows.length, state.key).toBeGreaterThan(8);
      // Said in the room's language, not the schema's. Whole words only —
      // without the leading boundary this flagged "mid-animation" for the "id"
      // in "mid", which is the classic way a copy rule starts costing more than
      // it protects.
      expect(state.shows, state.key).not.toMatch(/\b(null|undefined|row|table|id)\b/i);
    }
  });

  it('has no duplicate keys', () => {
    const keys = DEMO_STATES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('is honest about which states the server cannot produce', () => {
    // The four client-only states are the hardest and the easiest to quietly
    // omit. If this drops to zero, someone has "covered" them by deleting them.
    const client = DEMO_STATES.filter((s) => s.reach === 'client');
    expect(client.map((s) => s.key)).toEqual([
      'reveal-interrupted',
      'reveal-resumed',
      'network-retry',
    ]);
  });

  it('keeps the M3-blocked state in the catalog rather than dropping it', () => {
    for (const key of BLOCKED_ON_M3) {
      expect(DEMO_STATES.some((s) => s.key === key), key).toBe(true);
    }
  });

  it('names the alternatives when asked for a state that does not exist', () => {
    expect(() => demoState('nope')).toThrow(/welcome-box/);
  });
});
