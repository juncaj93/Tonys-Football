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
     *  - **character-empty** — the list names *"equipped wearable"* and nothing
     *    for the manager who owns none, which is **every manager today** because
     *    nothing awards a wearable yet. A feature reviewed only in its
     *    fully-stocked state is a feature reviewed in the state nobody is in, and
     *    this one caught a third of the page repeating the same sentence.
     *  - **character-dressed** — one item per slot cannot show whether a *row of
     *    choices with one of them selected* reads at 360. Two per slot can.
     */
    const CARRIED_BEYOND_THE_LIST = 5;

    /*
     * The press desk, added with the review chain (`16 §9`, `08 §22`).
     *
     * The mandate's list predates the approval gate, so it names none of them —
     * and the review screen is the one surface in the product where a person
     * makes a decision the whole league then reads as true. Six, because the
     * decision has six distinct shapes and each one is a different screen:
     * nothing waiting · something waiting · something the validator refused ·
     * approved and not yet printed · printed · and the press stopped.
     *
     * `review-empty` is the one that matters most, for the reason
     * `demo-tray-empty` did: it is **what a commissioner meets today**, and a
     * feature reviewed only in its busy state is a feature reviewed in the state
     * nobody is in.
     */
    const PRESS_DESK = 6;

    /*
     * Championship rings, added when the ring stopped being unobtainable.
     *
     * The mandate's list predates the grant: `item_championship_ring` sat in the
     * registry excluded from the only acquisition path there was, so there was
     * nothing to demo. Three, because the shelf has three genuinely different
     * shapes and the middle one does not imply the third:
     *
     *  - **none** — what almost every manager sees, and the state a shelf is
     *    most often reviewed *without*. It has to say the right thing about a
     *    thing you cannot chase.
     *  - **one** — a single title, where the year has to read as the name of the
     *    thing rather than as metadata.
     *  - **many** — a repeat champion. One ring asset serves every championship
     *    forever, so two titles are distinguishable *only* by their years, and
     *    this is the state that proves they are.
     */
    const CHAMPIONSHIPS = 3;

    /*
     * The office queue, added with the generalized commissioner review path.
     *
     * The press desk's six are about **one draft and the decision on it**. These
     * four are about the screen that answers a different question — *"is there
     * anything for me at all"* — which is the question `16 §9`'s approval gate is
     * actually found through, and which has four distinct answers:
     *
     *  - **nothing waiting** — `office`, which is what a commissioner meets
     *    today, and the state a queue is most often reviewed *without*.
     *  - **one paper ready** — the row a stamp is about to be pressed on, and
     *    the only place *"facts verified"* is printed.
     *  - **something the check refused** — a decision that is wanted and cannot
     *    be completed, which has to say why on the row rather than be a quiet
     *    grey line.
     *  - **the whole desk** — ready, stamped and printed together, where the
     *    priority order is the thing being reviewed.
     *
     * Plus recently-printed on its own, so the archive's row style is looked at
     * rather than only ever seen under three louder ones.
     */
    const OFFICE_QUEUE = 4;

    /*
     * The draft review, added with the preseason issue
     * (`docs/PRESEASON_SLICE_BOUNDARY.md`).
     *
     * The mandate's list predates it. Five, because the feature has five
     * genuinely different screens and no two of them imply each other:
     *
     *  - **the board at zero** — what a commissioner meets on the Sunday after
     *    draft night, and the state the whole editor exists to move out of. A
     *    progress line only ever photographed healthy is a progress line nobody
     *    has checked.
     *  - **the board part-way** — four of ten, which is what a real session
     *    looks like when it is interrupted, and the only state where the board
     *    holds both a written row and a blank one.
     *  - **the board complete** — where the print control appears. Its
     *    *absence* in the two above is what makes its presence here mean
     *    something.
     *  - **on the desk** — the issue drafted and waiting on a stamp, which is
     *    the proof that the preseason paper goes through the same approval gate.
     *  - **on the rack** — printed, which is the only one a manager ever sees.
     *
     * The two editor screens are not in this count: they are two rows of the
     * part-way board and share its seat, photographed from one database so the
     * pair proves more than either would alone.
     */
    const PRESEASON = 5;

    expect(DEMO_STATES.length).toBe(
      REQUIRED.length +
        CARRIED_BEYOND_THE_LIST +
        PRESS_DESK +
        CHAMPIONSHIPS +
        OFFICE_QUEUE +
        PRESEASON,
    );
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
