import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ROUTES, driverRoutes, EXEMPT } from './route-coverage';

/**
 * Every route the product serves is either photographed or exempt, by name.
 *
 * ## Why this exists
 *
 * Five v1 routes have shipped without the visual gate ever looking at them, and
 * each was found by somebody eventually wondering rather than by anything
 * failing. `/timeline` was one (#69) and `/door` was another (#75) — **and both
 * turned up a real defect on the first capture**: the Timeline's sign read
 * `CHAMPIONS $ HISTORY`, because Silkscreen's ampersand is a bar through a bowl;
 * the door's PIN label broke `IT` onto its own line at 360.
 *
 * **Never photographed is the quiet failure.** It fails no gate, appears in no
 * report, and the type floor, colour fidelity, tap targets and reduced-motion
 * promise of that page are all simply unverified. The three
 * `driver-coverage.test.ts` files each say this about their own catalog; this
 * says it about the route table, which is the level the omissions actually
 * happened at.
 *
 * ## Exemption is a decision with a reason attached
 *
 * `EXEMPT` is a map rather than a list, and the value is why. A route added to
 * it silently is the failure this file exists to prevent, so the reason is
 * required and the test reads it.
 */

const DRIVER = path.join(process.cwd(), 'scripts', 'visual-qa.mts');

describe('the visual driver and the route table agree', () => {
  it('finds the routes by reading the filesystem, not a list somebody maintains', () => {
    // A hand-kept list of routes is the same class of thing as a hand-kept list
    // of states: it drifts silently, which is the defect.
    expect(ROUTES.length).toBeGreaterThan(10);
    expect(ROUTES).toContain('/');
    expect(ROUTES).toContain('/counter/showcase');
    expect(ROUTES).toContain('/admin/slice/[versionId]');
  });

  it('photographs every route, or names why not', () => {
    const seen = driverRoutes(readFileSync(DRIVER, 'utf8'));
    const missing = ROUTES.filter((route) => !seen.has(route) && !(route in EXEMPT));

    expect(missing, `no visual-QA state reaches: ${missing.join(', ')}`).toEqual([]);
  });

  it('gives every exemption a reason somebody can disagree with', () => {
    for (const [route, why] of Object.entries(EXEMPT)) {
      expect(ROUTES, `${route} is exempt but is not a route`).toContain(route);
      expect(why.length, route).toBeGreaterThan(30);
    }
  });

  it('keeps the exemption list small enough to read', () => {
    /*
     * Not a style rule. An exemption list that grows is a gate being negotiated
     * with, and the whole mechanism stops meaning anything at the point where
     * adding a route to it is easier than adding a state.
     */
    expect(Object.keys(EXEMPT).length).toBeLessThanOrEqual(3);
  });

  it('does not exempt a route that is in fact photographed', () => {
    // A stale exemption is worse than none: it says a page is unverified when it
    // is verified, so the next reader spends the effort twice.
    const seen = driverRoutes(readFileSync(DRIVER, 'utf8'));
    for (const route of Object.keys(EXEMPT)) {
      expect(seen.has(route), `${route} is exempt but the driver reaches it`).toBe(false);
    }
  });
});
