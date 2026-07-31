import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LOCKABLE, LOCKED_LINES } from './objects';

/**
 * The visual driver photographs every back-hall state, and each one is checked
 * rather than merely reached.
 *
 * The reasoning is `lib/slice/driver-coverage.test.ts`'s and
 * `lib/character/driver-coverage.test.ts`'s, and it is written a third time
 * rather than generalised for the reason the second one gives: the three
 * catalogs are read out of the driver by different patterns, and a shared helper
 * would have to know all of them.
 *
 * **Never photographed is the quiet failure.** It fails no gate, appears in no
 * report, and the first person to notice is whoever eventually looks for a
 * screenshot nobody ever took. This repository has shipped that shape three
 * times, and the two states below are the most exposed to it in the product:
 * nobody will see an open Back Hall for a year, so nobody would notice it
 * looking wrong.
 */

const DRIVER = readFileSync(path.join(process.cwd(), 'scripts', 'visual-qa.mts'), 'utf8');

/** Every `back-hall*` entry in the driver's `ALL_STATES` list. */
function driverBackHallStates(): readonly string[] {
  const list = /const ALL_STATES: readonly StateName\[\] = \[([\s\S]*?)\n\];/.exec(DRIVER);
  if (list === null) throw new Error('could not find ALL_STATES in scripts/visual-qa.mts');
  return [...list[1]!.matchAll(/'(back-hall[a-z-]*)'/g)].map((match) => match[1]!);
}

describe('the visual driver and the back hall agree', () => {
  it('photographs every flag combination the product can honestly produce', () => {
    /*
     * Two, not the three `BACK_HALL_BOUNDARY §5` asks for.
     *
     * `back-hall-both-open` is missing on purpose and this is where the reason
     * lives. `/underground` is **deliberately not a route** — the whole reveal
     * is that you find out what is behind the curtain by being let in — so
     * "Underground open" is not a state the product can be in today. Rendering
     * it would mean a `<Link>` to a page that does not exist, which is the
     * defect the console gate already caught here once. `openTo` throws instead.
     *
     * When the casino lands in P10 it brings its route, and the state becomes
     * photographable in the same change. Until then a screenshot of it would be
     * a screenshot of a 404.
     */
    expect([...driverBackHallStates()].sort()).toEqual(['back-hall', 'back-hall-rooms-open']);
  });

  it('declares a case for each of them', () => {
    // A state in `ALL_STATES` with no `case` photographs whatever page was
    // already open. `reach()` throws for that at runtime; this catches it before
    // a nine-minute workflow does.
    for (const state of driverBackHallStates()) {
      expect(DRIVER, `no case for ${state}`).toContain(`case '${state}'`);
    }
  });

  it('checks which doors are open rather than trusting the URL', () => {
    /*
     * The false green that has happened before: `?open=` is resolved by the
     * **server**, which needs `DEMO_FIXTURES=1`. A server without it answers
     * every request with the ordinary shut hall, and a driver that only
     * navigated would file that under `390-back-hall-both-open.png` and pass.
     *
     * `checkBackHall` reads the doors out of the DOM — an open door is an
     * anchor, a shut one is a button that answers in world — so the missing
     * wiring is a failure rather than a passing screenshot of the wrong room.
     */
    expect(DRIVER).toContain('BACK_HALL_STATES');
    expect(DRIVER).toContain('await checkBackHall(page, width, state)');
  });

  it('has a gate for every state it declares', () => {
    for (const state of driverBackHallStates()) {
      expect(DRIVER, `${state} has no expectation in BACK_HALL_STATES`).toMatch(
        new RegExp(`'${state}':\\s*\\{ rooms:`),
      );
    }
  });

  it('never lets the word for what is behind the curtain reach the page', () => {
    // Asserted in the driver against the rendered DOM, because the unit test can
    // only pin the strings this module owns. `18 §5` is about what a manager can
    // read, wherever it came from.
    expect(DRIVER).toContain('names what is behind the curtain');
  });
});

describe('the shut doors each have a line', () => {
  it('gives every lockable destination something to say', () => {
    // A shut door with no line would be a dead tap — `18 §6.3` requires an
    // answer, and the absence of one is invisible in a screenshot.
    for (const key of LOCKABLE) {
      expect(LOCKED_LINES[key], key).toBeTruthy();
    }
  });

  it('does not give the two doors the same line', () => {
    expect(new Set(Object.values(LOCKED_LINES)).size).toBe(LOCKABLE.length);
  });
});
