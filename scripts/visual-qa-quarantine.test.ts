import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { QUARANTINE, QUARANTINE_CEILING, quarantineFor } from './visual-qa-quarantine';

/**
 * What the quarantine is allowed to swallow, and what it must never.
 *
 * A known-flaky allowance is the single most dangerous thing in a test harness:
 * it starts as one honest entry about one measured defect and becomes the place
 * failures go to be forgotten. Everything below is written against that.
 */

const ROOT = process.cwd();

/** The exact text CI printed, twice, on PR #59. */
const REAL =
  'Minified React error #418; visit https://react.dev/errors/418?args[]=HTML&args[]= ' +
  'for the full message or use the non-minified dev environment for full errors and ' +
  'additional helpful warnings.';

describe('the known-defect quarantine', () => {
  it('holds exactly one entry', () => {
    /*
     * **The load-bearing assertion.** A second entry is not a bigger allowance,
     * it is evidence that the gate has stopped being trusted — so adding one has
     * to be a deliberate act that changes this line and explains itself.
     */
    expect(QUARANTINE).toHaveLength(1);
    expect(QUARANTINE[0]?.debt).toBe(12);
  });

  it('tolerates the error that actually fired', () => {
    expect(quarantineFor(REAL)?.debt).toBe(12);
  });

  it('does not tolerate a content mismatch', () => {
    // `args[]=text` is a *different* defect: the sentence changed, not the tree.
    expect(quarantineFor(REAL.replace('args[]=HTML', 'args[]=text'))).toBeUndefined();
  });

  it('does not tolerate a different React error', () => {
    for (const code of [419, 420, 421, 422, 423, 424, 425]) {
      const other = REAL.replace(/418/g, String(code));
      expect(quarantineFor(other), `#${String(code)} is quarantined`).toBeUndefined();
    }
  });

  it('does not tolerate the dev build’s message, which is the one worth having', () => {
    /*
     * The production bundle says `HTML` and names nothing. A dev build prints
     * the element it choked on, and that sighting is the entire recorded next
     * step for visual debt 12 — it has to be as loud as the harness can make it.
     */
    const dev =
      "Hydration failed because the server rendered HTML didn't match the client. " +
      'As a result this tree will be regenerated on the client. <div className="room-shape">';
    expect(quarantineFor(dev)).toBeUndefined();
  });

  it('does not tolerate an unrelated console error', () => {
    expect(quarantineFor('Failed to load resource: the server responded with 500')).toBeUndefined();
    expect(quarantineFor('Refused to execute inline script (CSP)')).toBeUndefined();
  });

  it('sets a ceiling a deterministic mismatch cannot hide under', () => {
    /*
     * The number is the whole design. A newly introduced structural mismatch is
     * deterministic: it fires on every capture of the state it affects, which is
     * once per supported width. So the ceiling has to sit **below** the width
     * count, or a real regression could arrive and be tolerated.
     */
    const driver = readFileSync(path.join(ROOT, 'scripts', 'visual-qa.mts'), 'utf8');
    const widths = /const WIDTHS[^=]*=\s*\[([^\]]*)\]/.exec(driver)?.[1];
    expect(widths, 'could not find WIDTHS in the driver').toBeDefined();

    const count = widths!.split(',').filter((part) => part.trim() !== '').length;
    expect(count).toBeGreaterThan(0);
    expect(QUARANTINE_CEILING).toBeLessThan(count);
  });

  it('is wired into the driver as a count, not as a skip', () => {
    /*
     * Asserted against the driver's source because the alternative — importing
     * it — runs the sweep: `visual-qa.mts` calls `run()` at module top level.
     */
    const driver = readFileSync(path.join(ROOT, 'scripts', 'visual-qa.mts'), 'utf8');

    // It must consult the table…
    expect(driver).toContain('quarantineFor(e.text)');
    // …still fail anything the table does not name…
    expect(driver).toContain('if (known === undefined) fail(');
    // …and fail the run when the count clears the ceiling.
    expect(driver).toContain('quarantined.length > QUARANTINE_CEILING');
    // The artifact keeps them, so a tolerated error stays a recorded one.
    expect(driver).toContain('quarantined,');
  });

  it('is described where the defect is recorded', () => {
    const debt = readFileSync(path.join(ROOT, 'docs', 'VISUAL_DEBT.md'), 'utf8');
    expect(debt).toContain('visual-qa-quarantine.ts');
  });
});
