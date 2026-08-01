import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEMO_STATES } from '@/lib/demo/states';

/**
 * The visual driver photographs every press-desk state, and each one claims
 * something a picture could not otherwise prove.
 *
 * ## Why this is a test and not a check inside the driver
 *
 * `scripts/visual-qa.mts` imports nothing from `lib/` on purpose — it drives a
 * built server over HTTP and shells out for demo state, so it stays an outside
 * observer. It therefore cannot know what `DEMO_STATES` says, and a press-desk
 * state added to the catalog and forgotten in the driver would simply never be
 * photographed.
 *
 * **Never photographed is the quiet failure.** No gate fails, no report mentions
 * it, and the first person to notice is whoever eventually looks for a
 * screenshot that was never taken. This repository has shipped that exact shape
 * twice.
 *
 * The press desk has a second, sharper version of the same hazard:
 * `requireAdmin()` answers with `notFound()`, so a demo seat that failed to get
 * the commissioner's keys renders a **404** that photographs cleanly and passes
 * every pixel gate in the driver. That is what `DESK_EXPECTATIONS` is for, and
 * this file asserts every state has an entry in it.
 */

const DRIVER = readFileSync(path.join(process.cwd(), 'scripts', 'visual-qa.mts'), 'utf8');

/** The press-desk states the demo catalog declares. */
const DESK_STATES = DEMO_STATES.filter((state) => state.route === '/admin/slice').map(
  (state) => state.key,
);

function driverStates(): readonly string[] {
  const list = /const ALL_STATES: readonly StateName\[\] = \[([\s\S]*?)\n\];/.exec(DRIVER);
  if (list === null) throw new Error('could not find ALL_STATES in scripts/visual-qa.mts');
  return [...list[1]!.matchAll(/'(review-[a-z-]+)'/g)].map((match) => match[1]!);
}

function deskExpectations(): readonly string[] {
  const table = /const DESK_EXPECTATIONS: Record<[\s\S]*?\n> = \{([\s\S]*?)\n\};/.exec(DRIVER);
  if (table === null) {
    throw new Error('could not find DESK_EXPECTATIONS in scripts/visual-qa.mts');
  }
  return [...table[1]!.matchAll(/'(review-[a-z-]+)':/g)].map((match) => match[1]!);
}

describe('the visual driver and the press-desk catalog agree', () => {
  it('declares six press-desk states, one per shape the decision has', () => {
    /*
     * Nothing waiting · something waiting · something the validator refused ·
     * approved and not yet printed · printed · and the press stopped.
     *
     * Pinned as a number so adding a seventh is a deliberate edit that says what
     * seventh shape a decision has.
     */
    expect(DESK_STATES).toHaveLength(6);
  });

  it('photographs every one of them, plus the draft itself', () => {
    /*
     * `review-draft` is not a demo state — it is the *detail* screen, reached by
     * opening the queue's waiting draft. It shares `review-waiting`'s seat, which
     * is why it has no catalog entry of its own and why it is named here rather
     * than derived.
     */
    expect([...driverStates()].sort()).toEqual([...DESK_STATES, 'review-draft'].sort());
  });

  it('declares a case for each of them', () => {
    // A state in `ALL_STATES` with no `case` photographs whatever page was
    // already open. The driver throws at runtime for that; this catches it
    // before a nine-minute workflow does.
    for (const key of [...DESK_STATES, 'review-draft']) {
      expect(DRIVER, key).toContain(`case '${key}':`);
    }
  });

  it('gives every one of them something to prove', () => {
    /*
     * The gate against the 404 that photographs cleanly. A state with no
     * expectation would capture a picture and assert nothing about it, which is
     * the same as not having a gate — and worse, because the screenshot exists.
     */
    expect([...deskExpectations()].sort()).toEqual([...DESK_STATES, 'review-draft'].sort());
  });

  it('marks every press-desk seat as a commissioner', () => {
    // `requireAdmin()` answers `notFound()`. A press-desk state on an ordinary
    // seat renders a 404 under the state's name.
    for (const state of DEMO_STATES.filter((entry) => entry.route === '/admin/slice')) {
      expect(state.commissioner, state.key).toBe(true);
    }
  });

  it('gives the commissioner keys to nothing else', () => {
    for (const state of DEMO_STATES.filter((entry) => entry.route !== '/admin/slice')) {
      expect(state.commissioner, state.key).toBeUndefined();
    }
  });
});
