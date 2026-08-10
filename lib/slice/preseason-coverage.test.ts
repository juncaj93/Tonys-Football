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

  it('photographs the type at its hardest, on the sparse issue', async () => {
    /*
     * The two typographic stresses the commissioner asked for, and they are on
     * the **sparse** edition together on purpose.
     *
     * A long name beside a grade is hardest when there is nothing else in the
     * section to push the layout around, which is exactly what a stripped
     * section is — so photographing the long names on the full edition and the
     * long takes on another one would have caught each in the state that makes
     * it easiest. The names come from `lib/stakes/boards.ts`'s own list rather
     * than a second one, so *"the longest name"* means one thing in this
     * product.
     *
     * Asserted through `previewEdition` rather than against the fixture literal
     * because the fixture is rendered by the **shipping** pipeline: a take that
     * survives here is one `renderPreseason` and `validatePreseason` accepted.
     */
    const { previewEdition } = await import('./editions');
    const { TAKE_MAX } = await import('./preseason-reviews');

    const preview = await previewEdition(null as never, 'preseason-sparse', {
      DEMO_FIXTURES: '1',
    });
    // Asserted rather than defaulted: `?? []` would let a preview that stopped
    // resolving pass this as "ten teams of nothing".
    expect(preview?.issue).not.toBeNull();
    const teams = preview?.issue?.preseason?.teams ?? [];

    expect(teams).toHaveLength(10);
    // Every section at the limit, so the wrap is measured on all ten rather
    // than on whichever one happened to be longest.
    for (const team of teams) expect(team.take.length, team.manager).toBe(TAKE_MAX);

    /*
     * **Every** section, not the longest one. The scrolled state photographs
     * the tenth, so a list that ran out part-way would put the stress in the
     * half of the paper the camera never reaches.
     */
    for (const team of teams) expect(team.manager.length, team.manager).toBeGreaterThanOrEqual(16);
    expect(Math.max(...teams.map((team) => team.manager.length))).toBeGreaterThanOrEqual(24);
  });

  it('photographs the body of the paper, not only its masthead', () => {
    /*
     * Captures are viewport-sized, so the two rack states above photograph the
     * top of the issue and nothing else. The draft review's entire body — ten
     * sections, the long names, the grades beside them, the takes at their
     * limit — is below that fold, which is where a wrap or a clipped grade
     * would live and never be seen.
     *
     * The same defect main found on the review screen and fixed the same way
     * (`review-decision`): a state that scrolls, rather than a taller picture.
     */
    expect(DRIVER).toContain("case 'preseason-teams':");
    expect(DRIVER).toContain("'preseason-teams',");
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
