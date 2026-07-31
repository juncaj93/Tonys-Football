import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SLICE_EDITIONS, SLICE_EDITION_DESCRIPTIONS } from './editions';

/**
 * The visual driver photographs every declared edition, and nothing it cannot
 * reach.
 *
 * ## Why this is a test and not a check inside the driver
 *
 * `scripts/visual-qa.mts` deliberately imports nothing from `lib/` — it drives a
 * built server over HTTP and shells out for demo state, so it stays honest about
 * being an outside observer. That means it *cannot* know what
 * `SLICE_EDITIONS` says, and an edition added to the catalog and forgotten in the
 * driver would simply never be photographed.
 *
 * Never photographed is the quiet failure. It does not fail a gate, it does not
 * appear in a report, and the first person to notice is whoever eventually looks
 * for a screenshot that was never taken. This project has shipped that exact
 * shape twice — the nine reveal states that photographed a calm room, and the
 * `slice` state whose `case` never landed — so the third instance is a build
 * failure.
 *
 * The driver already throws for a state with no `case`, and
 * `resolveEdition` already throws for a key with no implementation. This closes
 * the remaining edge: a key that exists and is implemented and that nobody looks
 * at.
 */

const DRIVER = readFileSync(path.join(process.cwd(), 'scripts', 'visual-qa.mts'), 'utf8');

/** Every `slice-*` entry in the driver's `ALL_STATES` list. */
function driverSliceStates(): readonly string[] {
  const list = /const ALL_STATES: readonly StateName\[\] = \[([\s\S]*?)\n\];/.exec(DRIVER);
  if (list === null) throw new Error('could not find ALL_STATES in scripts/visual-qa.mts');
  return [...list[1]!.matchAll(/'slice-([a-z-]+)'/g)].map((match) => match[1]!);
}

describe('the visual driver and the edition catalog agree', () => {
  it('photographs every declared edition', () => {
    expect([...driverSliceStates()].sort()).toEqual([...SLICE_EDITIONS].sort());
  });

  it('declares a case for each of them', () => {
    // A state in `ALL_STATES` with no `case` photographs whatever page was
    // already open. The driver throws at runtime for that; this catches it
    // before a nine-minute workflow does.
    for (const key of SLICE_EDITIONS) {
      expect(DRIVER, key).toContain(`case 'slice-${key}':`);
    }
  });

  it('describes every edition in the catalog', () => {
    for (const key of SLICE_EDITIONS) {
      expect(SLICE_EDITION_DESCRIPTIONS[key], key).toBeTruthy();
    }
  });
});
