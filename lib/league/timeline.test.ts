import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { closePool, getDb } from '@/lib/db';
import { resetDatabase } from '@/lib/db/test-helpers';
import { createFixtureSource } from '@/lib/sleeper/fixtures';
import { persistChain } from '@/lib/sleeper/persist';
import { traverseChain } from '@/lib/sleeper/chain';

import { timeline } from './timeline';

/**
 * The Timeline, against the recorded seasons.
 *
 * Run against a real database rather than a stub, for the reason every other
 * derivation test in this repository is: the facts come from `lib/stats`, which
 * queries, ranks and **suppresses**, and a stub would be asserting that the stub
 * works. The 2024 and 2025 fixtures are the league's actual history.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

/** The recorded league. Same id the Stats tests import their chain from. */
const LEAGUE_2026 = '1385016656425668608';

describe.skipIf(!hasDatabase)('the league timeline', () => {
  afterAll(async () => {
    if (hasDatabase) await closePool();
  });

  /*
   * This test owns its data, and the first version did not.
   *
   * It read whatever the shared development database happened to hold and
   * passed against a freshly seeded one — then failed in the full suite,
   * because the integration tests that run alongside it call `resetDatabase`
   * and leave no seasons behind. A test that depends on another file's leftovers
   * is asserting the order the runner happened to pick.
   *
   * Same import the Stats tests use, so the seasons here are the league's real
   * recorded 2024 and 2025 rather than numbers written to make an assertion
   * pass.
   */
  beforeEach(async () => {
    await resetDatabase(db!);
    const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, { includeWeeks: true });
    await persistChain(db!, chain, { sourceLabel: 'test', finalizeYears: [2024, 2025] });
  });

  it('returns every season the league has, oldest first', async () => {
    const rows = await timeline(db!);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    const years = rows.map((r) => r.year);
    expect([...years].sort((a, b) => a - b)).toEqual(years);
  });

  it('carries a champion for a finalized season and none for the current one', async () => {
    const rows = await timeline(db!);
    const finalized = rows.filter((r) => r.finalized);
    expect(finalized.length).toBeGreaterThan(0);
    for (const season of finalized) expect(season.champion).not.toBeNull();

    const current = rows.find((r) => r.current);
    expect(current?.champion ?? null).toBeNull();
  });

  it('shows one of each kind rather than two of the loudest', async () => {
    /*
     * The defect this file was written after.
     *
     * Taking the top two by selection score returns **two blowouts** for both
     * recorded seasons and no close game at all, because a margin outranks a
     * nail-biter in `scoreOf`. Every fact was true and the page told one half of
     * the story twice — invisible without real data, which is why this assertion
     * is here and not in a unit test over a fixture somebody wrote by hand.
     */
    for (const season of await timeline(db!)) {
      if (season.facts.length < 2) continue;
      const kinds = season.facts.map((f) => f.kind);
      expect(new Set(kinds).size, `${String(season.year)} shows ${kinds.join(' + ')}`).toBe(
        kinds.length,
      );
    }
  });

  it('never publishes more facts than it admits to holding', async () => {
    // The cap has to be honest: shown + more is the whole publishable set.
    for (const season of await timeline(db!)) {
      expect(season.moreFacts).toBeGreaterThanOrEqual(0);
      if (season.facts.length === 0) expect(season.moreFacts).toBe(0);
    }
  });

  it('explains a quiet season instead of rendering an empty one', async () => {
    const rows = await timeline(db!);
    for (const season of rows) {
      if (season.facts.length === 0) {
        expect(season.quietBecause, `${String(season.year)} is silent about being empty`).not.toBeNull();
      } else {
        // A season with something to show has nothing to excuse.
        expect(season.quietBecause).toBeNull();
      }
    }
  });

  it('hands the page strings, formatted once, beside the derivation', async () => {
    /*
     * The boundary, asserted from the data side.
     * `components/league/presentation.test.tsx` asserts it from the component
     * side; this is what makes that assertion satisfiable — a component cannot
     * avoid formatting a number it was handed as a number.
     *
     * Two decimal places, and the winner's score is never below the loser's.
     * Both are properties of what `lib/stats` derived, restated here so a
     * formatting change cannot quietly reverse a result.
     */
    for (const season of await timeline(db!)) {
      for (const fact of season.facts) {
        expect(fact.winnerPoints).toMatch(/^\d+\.\d{2}$/);
        expect(fact.loserPoints).toMatch(/^\d+\.\d{2}$/);
        expect(Number(fact.winnerPoints)).toBeGreaterThanOrEqual(Number(fact.loserPoints));
        expect(fact.week).toMatch(/^\d+$/);
      }
    }
  });
});
