import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The tray's fourth phase, and why it is asserted on the source.
 *
 * Opening a box is the one mutation whose failure has three distinguishable
 * outcomes rather than two:
 *
 *   - **`reveal`** — the server answered and here is what was inside
 *   - **`lost`** — the server answered and the box is not there any more
 *   - **`unreachable`** — the server did not answer, and the box is untouched
 *
 * Before this workstream the third collapsed into a rejected promise that
 * unmounted the room. Routing it into `lost` instead would have been worse than
 * the crash in one specific way: `lost` says *"Tony looks at the tray. There's
 * nothing on it"*, which is a false statement about a manager's property, and it
 * sends them to a shelf with nothing new on it.
 *
 * ## Why source assertions rather than a rendered test
 *
 * The suite runs in the `node` environment with no DOM (`vitest.config.ts`), so
 * a phase reached by a click cannot be driven here — and the tray is the one
 * surface this workstream could not drive from its own browser harness either,
 * because the hit region sits under the parlor's overlay stack. The real path is
 * covered by `visual:qa`'s `tray-owned-box` and `tray-reveal`.
 *
 * So this pins the three properties that would regress silently and that no
 * screenshot of a working tray would notice. Each fails on the pre-workstream
 * file.
 */

const SOURCE = readFileSync(
  path.join(process.cwd(), 'components', 'scene', 'counter-tray.tsx'),
  'utf8',
);

/** The body of `openIt`, where the answer is turned into a phase. */
function openHandler(): string {
  const start = SOURCE.indexOf('const openIt');
  expect(start).toBeGreaterThan(-1);
  const end = SOURCE.indexOf('const retry', start);
  expect(end).toBeGreaterThan(start);
  return SOURCE.slice(start, end);
}

describe('the tray when the counter cannot be reached', () => {
  it('has a phase for it, distinct from the box being gone', () => {
    expect(SOURCE).toMatch(/type Phase =[^;]*'unreachable'/);
    expect(SOURCE).toMatch(/type Phase =[^;]*'lost'/);
  });

  it('goes through attempt rather than awaiting the action bare', () => {
    // The general rule is `lib/reliability/call-sites.test.ts`; this is the one
    // call site where choosing the wrong failure phase is a lie rather than a
    // missing message, so it is named here too.
    expect(openHandler()).toMatch(/attempt\(\(\) => openBoxAction\(/);
  });

  it('answers an unreachable server with unreachable, and a missing box with lost', () => {
    const handler = openHandler();
    const unreachableAt = handler.indexOf("setPhase('unreachable')");
    const lostAt = handler.indexOf("setPhase('lost')");

    expect(unreachableAt).toBeGreaterThan(-1);
    expect(lostAt).toBeGreaterThan(-1);
    /*
     * Order is the assertion. `attempt`'s outcome is checked before the server's
     * own answer, so the two cannot be transposed without this moving — and
     * transposed is exactly the shape of the mistake: both are "the box did not
     * open", and only one of them means the box is gone.
     */
    expect(unreachableAt).toBeLessThan(lostAt);
  });

  /**
   * `done` refreshes; `retry` must not.
   *
   * A `router.refresh()` on this path asks the same unreachable server for the
   * page, so the recovery gesture would fail for the reason it is recovering
   * from — and the manager would be left looking at a stale room with no box
   * and no explanation.
   */
  it('puts the box back without asking the server it could not reach', () => {
    const start = SOURCE.indexOf('const retry');
    const end = SOURCE.indexOf('const skip', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const retry = SOURCE.slice(start, end);
    expect(retry).toMatch(/setPhase\('idle'\)/);
    expect(retry).not.toMatch(/router\.refresh/);
  });

  /**
   * The words and the picture have to agree.
   *
   * The plate for this phase says the box is still on the tray. The box overlay
   * renders on a condition that was written when only `idle` and `opening`
   * showed it, so the one screen making a claim about the box was the one screen
   * the box was missing from — shipped in this workstream's first commit and
   * found by reading the diff.
   */
  it('draws the box on the screen that says the box is still there', () => {
    const condition = /\{\(phase === 'idle' \|\| opening \|\| phase === 'unreachable'\) && \(/;
    expect(SOURCE).toMatch(condition);

    // And the sentence that depends on it.
    expect(SOURCE).toMatch(/still on the tray/);
  });
});
