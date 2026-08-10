import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEMO_STATES } from '@/lib/demo/states';

/**
 * The visual driver photographs every draft-board state, and each one claims
 * something a picture could not otherwise prove.
 *
 * ## The same hazard as the press desk, twice over
 *
 * `scripts/visual-qa.mts` imports nothing from `lib/` on purpose, so it cannot
 * know what `DEMO_STATES` says — a state added to the catalog and forgotten in
 * the driver is simply never photographed, and never photographed is the quiet
 * failure this repository has shipped twice.
 *
 * The draft board adds a second, sharper version: `requireAdmin()` answers with
 * `notFound()`, so a demo seat that failed to get the commissioner's keys
 * renders a **404** that photographs cleanly and passes every pixel gate. That
 * is what `DRAFT_BOARD_EXPECTATIONS` is for, and this file asserts every state
 * has an entry in it.
 *
 * ## And a third: three boards that look the same
 *
 * `0 of 10`, `4 of 10` and `10 of 10` differ by two glyphs at thumbnail size.
 * The three screenshots would look like three screenshots whatever the database
 * held, so the counts are asserted from the DOM — and asserted **exactly**,
 * because a review belongs to a `(season, manager)` pair and these states do not
 * accumulate the way press-desk issues do.
 */

const DRIVER = readFileSync(path.join(process.cwd(), 'scripts', 'visual-qa.mts'), 'utf8');

/** The draft-board states the demo catalog declares. */
const BOARD_STATES = DEMO_STATES.filter((state) => state.route === '/admin/slice/draft').map(
  (state) => state.key,
);

/**
 * The two editor screens, which are not catalog states.
 *
 * They are two rows of `draft-board-partial`'s board, opened from it, so they
 * share its seat and its database. Named here rather than derived, for the same
 * reason `review-draft` is: a state with no catalog entry has to be visible
 * somewhere or it is invisible everywhere.
 */
const EDITOR_STATES = ['draft-editor-blank', 'draft-editor-written'];

function driverStates(): readonly string[] {
  const list = /const ALL_STATES: readonly StateName\[\] = \[([\s\S]*?)\n\];/.exec(DRIVER);
  if (list === null) throw new Error('could not find ALL_STATES in scripts/visual-qa.mts');
  return [...list[1]!.matchAll(/'(draft-[a-z-]+)'/g)].map((match) => match[1]!);
}

function boardExpectations(): readonly string[] {
  const table = /const DRAFT_BOARD_EXPECTATIONS: Record<[\s\S]*?\n> = \{([\s\S]*?)\n\};/.exec(
    DRIVER,
  );
  if (table === null) {
    throw new Error('could not find DRAFT_BOARD_EXPECTATIONS in scripts/visual-qa.mts');
  }
  return [...table[1]!.matchAll(/'(draft-[a-z-]+)':/g)].map((match) => match[1]!);
}

describe('the visual driver and the draft-board catalog agree', () => {
  it('declares three board states, one per shape the work is in', () => {
    /*
     * Nothing read · part-way · finished. Pinned as a number so adding a fourth
     * is a deliberate edit that says what fourth shape the work has.
     */
    expect(BOARD_STATES).toHaveLength(3);
  });

  it('photographs every one of them, plus both editor screens', () => {
    expect([...driverStates()].sort()).toEqual([...BOARD_STATES, ...EDITOR_STATES].sort());
  });

  it('declares a case for each of them', () => {
    // A state in `ALL_STATES` with no `case` photographs whatever page was
    // already open. The driver throws at runtime for that; this catches it
    // before a nine-minute workflow does.
    for (const key of [...BOARD_STATES, ...EDITOR_STATES]) {
      expect(DRIVER, key).toContain(`case '${key}':`);
    }
  });

  it('gives every one of them something to prove', () => {
    expect([...boardExpectations()].sort()).toEqual([...BOARD_STATES, ...EDITOR_STATES].sort());
  });

  it('photographs the issue itself, full and sparse', () => {
    /*
     * Two rack previews, and the second is the one that matters: the optional
     * fields are optional, so the page has to look finished when eight of ten
     * sections carry neither a best pick nor a concern. That is the state Tony
     * really files, and the only way to know whether it holds up is to look.
     */
    for (const key of ['slice-preseason-draft-review', 'slice-preseason-sparse']) {
      expect(DRIVER, key).toContain(`case '${key}':`);
    }
  });

  it('photographs the issue on the desk and on the rack', () => {
    /*
     * The two ends of the approval chain. `preseason-review` proves the special
     * edition needs the same stamp as a weekly one; `preseason-rack` proves it
     * reaches the shelf only after somebody presses it.
     */
    expect(DRIVER).toContain("case 'preseason-review':");
    expect(DRIVER).toContain("case 'preseason-rack':");
  });
});
