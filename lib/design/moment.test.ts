import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LEAGUE_ZONE, day, stamp } from './moment';

/**
 * What a printed moment has to guarantee.
 *
 * These are mostly assertions about *determinism*, because the whole reason
 * this module exists rather than an inline `toLocaleString` is that a record
 * whose text depends on the machine is not a record.
 */

const ROOT = process.cwd();

/** 6 August 2026, 19:02 UTC — 3:02 PM in Michigan, inside daylight time. */
const SUMMER = new Date('2026-08-06T19:02:00Z');
/** 14 January 2026, 19:02 UTC — 2:02 PM in Michigan, inside standard time. */
const WINTER = new Date('2026-01-14T19:02:00Z');

describe('printing a moment', () => {
  it('prints the league zone, converted, with the offset named', () => {
    expect(stamp(SUMMER)).toBe('6 Aug 2026, 3:02 PM EDT');
  });

  it('follows the zone across the daylight-saving boundary', () => {
    /*
     * The same wall-clock UTC hour, six months apart, is a different hour in
     * Michigan. A record that printed `19:02` for both, or `EDT` for both,
     * would be wrong in a way nobody notices until they need it.
     */
    expect(stamp(WINTER)).toBe('14 Jan 2026, 2:02 PM EST');
  });

  it('names the month as a word, because 06/08 is two different days', () => {
    // The single most important property for an audit trail read by a human.
    expect(stamp(SUMMER)).toContain('Aug');
    expect(stamp(SUMMER)).not.toMatch(/\b0?6\/0?8\b/);
  });

  it('crosses midnight in the league zone, not in UTC', () => {
    /*
     * 03:30 UTC on the 7th is 11:30 PM on the 6th in Michigan. A stamp built on
     * UTC would file this decision under the wrong day.
     */
    const lateNight = new Date('2026-08-07T03:30:00Z');
    expect(stamp(lateNight)).toBe('6 Aug 2026, 11:30 PM EDT');
    expect(day(lateNight)).toBe('6 Aug 2026');
  });

  it('pads the minute and does not pad the hour', () => {
    // `3:02`, never `3:2`; and `3:02`, never `03:02` — one shape, always.
    expect(stamp(new Date('2026-08-06T13:05:00Z'))).toBe('6 Aug 2026, 9:05 AM EDT');
  });

  it('prints midnight and noon without ambiguity', () => {
    expect(stamp(new Date('2026-08-06T04:00:00Z'))).toBe('6 Aug 2026, 12:00 AM EDT');
    expect(stamp(new Date('2026-08-06T16:00:00Z'))).toBe('6 Aug 2026, 12:00 PM EDT');
  });

  it('is the same string every time it is asked', () => {
    // Cheap, and it is the property the visual gate depends on.
    const once = stamp(SUMMER);
    for (let i = 0; i < 50; i += 1) expect(stamp(SUMMER)).toBe(once);
  });

  it('drops the time when only the day is the fact', () => {
    expect(day(SUMMER)).toBe('6 Aug 2026');
    expect(day(WINTER)).toBe('14 Jan 2026');
  });

  it('agrees with the zone the parlor already counts days in', () => {
    /*
     * Two clocks disagree eventually. `lib/parlor/season.ts` decides when a
     * league *day* turns over; this decides how a *moment* prints. They have to
     * be the same zone or the record and the greeting drift apart.
     */
    const season = readFileSync(path.join(ROOT, 'lib', 'parlor', 'season.ts'), 'utf8');
    expect(season).toContain(LEAGUE_ZONE);
    expect(LEAGUE_ZONE).toBe('America/New_York');
  });

  it('offers no relative time, and that is the decision', () => {
    /*
     * `2 hours ago` is the obvious thing to add and it is wrong twice: it is not
     * deterministic, so the visual gate could never assert it; and it loses the
     * fact, which is the one thing an audit trail may not do.
     *
     * Asserted against the source so that adding one is a deliberate act that
     * has to delete this test, rather than a helpful commit nobody questions.
     */
    const source = readFileSync(path.join(ROOT, 'lib', 'design', 'moment.ts'), 'utf8');
    expect(source).not.toMatch(/RelativeTimeFormat/);

    /*
     * The surface is pinned rather than the prose scanned. A first attempt
     * grepped the file for `ago`, which cannot tell the mechanism from the
     * paragraph explaining why the mechanism is refused — it failed on its own
     * documentation. Naming the exports says the same thing and says it exactly.
     */
    const exported = [...source.matchAll(/^export (?:const|function) (\w+)/gm)].map((m) => m[1]);
    expect(exported.sort()).toEqual(['LEAGUE_ZONE', 'day', 'stamp']);
  });

  it('reads neither the machine’s locale nor the machine’s zone', () => {
    /*
     * The failure this guards is invisible in CI and appears in production: a
     * server in another region printing another calendar. Both are pinned as
     * literals, so the assertion is on the source.
     */
    const source = readFileSync(path.join(ROOT, 'lib', 'design', 'moment.ts'), 'utf8');
    expect(source).toContain("'en-US'");
    expect(source).toContain('timeZone: LEAGUE_ZONE');
    // `toLocaleString` and friends take the host's settings when told nothing.
    expect(source).not.toMatch(/toLocale(Date|Time)?String/);
  });

  it('assembles from parts, so an ICU upgrade cannot change the text', () => {
    /*
     * `format()` with a date and a time inserts a connector — `at`, currently —
     * and that has changed between ICU versions. The text here must depend on
     * this file, not on the Node build.
     */
    const source = readFileSync(path.join(ROOT, 'lib', 'design', 'moment.ts'), 'utf8');
    expect(source).toContain('formatToParts');
    expect(stamp(SUMMER)).not.toContain(' at ');
  });
});
