import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { findOverclaims } from './scope';
import { tablesAssertedAbsent, UNSUPPORTED_FACTS, unsupportedFact } from './unsupported';

/**
 * The registry, and the guard that stops it becoming a lie.
 *
 * A "known limitations" list has one predictable failure: the limitation is
 * fixed, the list is not updated, and the document goes on describing a product
 * that no longer exists. Nobody notices, because a stale caveat looks exactly
 * like a live one.
 *
 * So the entries that name an absent table are checked against
 * `lib/db/schema.ts` on every run. The day somebody adds `fantasy_transactions`,
 * the trade-revenge entry stops being true and this suite goes red — which is
 * the moment the entry should be rewritten, and the only moment anybody would
 * think to.
 */

const SCHEMA = readFileSync(join(process.cwd(), 'lib/db/schema.ts'), 'utf8');

/**
 * Is this table declared in the schema?
 *
 * The whitespace is not cosmetic. `pgTable('sessions', {` and
 *
 * ```
 * pgTable(
 *   'fantasy_matchups',
 * ```
 *
 * are both used in this file, and the first version of this helper matched only
 * the single-line form — so it reported the multi-line tables as absent and the
 * absence check below passed for the wrong reason. The control test at the end
 * of this suite is what found it, which is the reason the control test is here.
 */
function schemaDeclares(table: string): boolean {
  return new RegExp(`pgTable\\(\\s*'${table}'`).test(SCHEMA);
}

describe('the unsupported-fact registry', () => {
  it('is not empty, and every entry is uniquely addressable', () => {
    expect(UNSUPPORTED_FACTS.length).toBeGreaterThan(0);
    const ids = UNSUPPORTED_FACTS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(unsupportedFact(id)?.id).toBe(id);
    expect(unsupportedFact('no-such-entry')).toBeNull();
  });

  it('covers every story the brief named as tempting and unprovable', () => {
    const ids = new Set(UNSUPPORTED_FACTS.map((entry) => entry.id));
    for (const required of [
      'monday-comeback-historical',
      'trade-revenge',
      'bench-crime',
      'projection-upset',
    ]) {
      expect(ids).toContain(required);
    }
  });

  it('says what would be needed and what to say instead, for every entry', () => {
    for (const entry of UNSUPPORTED_FACTS) {
      expect(entry.claim.length).toBeGreaterThan(0);
      expect(entry.detail.length).toBeGreaterThan(0);
      expect(entry.designedIn).toMatch(/§|`/);
      expect(entry.wouldNeed.length).toBeGreaterThan(0);
      expect(entry.insteadSay.length).toBeGreaterThan(0);
    }
  });

  /**
   * The guard. An entry claiming a table is absent must still be right about it.
   */
  it('names only tables that really are absent from the schema', () => {
    const absent = tablesAssertedAbsent();
    expect(absent).toEqual(['fantasy_lineups', 'fantasy_player_scores', 'fantasy_transactions']);

    for (const table of absent) {
      expect(
        schemaDeclares(table),
        `\`${table}\` now exists in the schema. The registry entry that says it does not is ` +
          'stale — rewrite it rather than deleting this assertion.',
      ).toBe(false);
    }
  });

  it('recognises a table that does exist, so the guard is known to work', () => {
    // Both declaration styles the schema actually uses. Without this, a matcher
    // that recognised nothing would report every table as absent and the
    // assertion above would pass for every string ever written — which is
    // exactly what happened on the first version of it.
    expect(schemaDeclares('fantasy_matchups')).toBe(true);
    expect(schemaDeclares('sessions')).toBe(true);
  });

  it('does not itself overclaim while explaining why overclaiming is refused', () => {
    for (const entry of UNSUPPORTED_FACTS) {
      // `claim` is the sentence being refused, so it is allowed to contain the
      // banned words — that is the point of it. Nothing else is.
      const ours = [entry.detail, entry.insteadSay, ...entry.wouldNeed].join(' ');
      expect(findOverclaims(ours), `${entry.id}: ${ours}`).toEqual([]);
    }
  });

  it('records the Monday-comeback gap as coverage rather than as absent code', () => {
    // The distinction matters: comebacks are implemented and tested. What the
    // archive lacks is photographs, and no amount of code produces one
    // retroactively. Filing it as "unbuilt" would send somebody to build it.
    const entry = unsupportedFact('monday-comeback-historical')!;
    expect(entry.reason).toBe('coverage-starts-later');
    expect(entry.absentTables).toEqual([]);
    expect(entry.detail).toContain('week_snapshots');
  });
});
