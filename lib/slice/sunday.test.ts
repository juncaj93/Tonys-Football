import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { closePool, getDb } from '@/lib/db';
import { seasons, weekSnapshots } from '@/lib/db/schema';
import { expectPgMessage, resetDatabase } from '@/lib/db/test-helpers';
import { traverseChain } from '@/lib/sleeper/chain';
import { createFixtureSource } from '@/lib/sleeper/fixtures';
import { persistChain } from '@/lib/sleeper/persist';
import { type SleeperMatchupEntry } from '@/lib/sleeper/types';
import { weekIsSnapshotted, weekSnapshot } from '@/lib/stats/snapshot';

import { pairMatchups, runSunday } from './sunday';

/**
 * The Sunday job, against a real Postgres.
 *
 * The guarantee this file exists for is unusual and worth stating plainly: **a
 * second capture of a week must be refused, not merged.**
 *
 * Everywhere else in this schema, idempotency means "a retry is harmless". Here
 * it means something stronger. A snapshot is a photograph of a moment that has
 * passed; a retry an hour later photographs a *different* moment — one that
 * already includes Monday scoring. Merging that in would replace the truth with
 * a plausible-looking falsehood, silently, and leave nothing anywhere to show it
 * had happened. Every comeback claim of that week would become a false
 * statement in a published newspaper.
 *
 * So the refusal lives in a unique constraint and an append-only trigger, and
 * this asserts them against the real database rather than asserting that the
 * service remembered to be careful.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

const LEAGUE_2026 = '1385016656425668608';
const SEASON = 2025;
const SUNDAY = new Date('2025-11-10T04:55:00Z');
const LATER = new Date('2025-11-11T04:55:00Z');

afterAll(async () => {
  if (hasDatabase) await closePool();
});

/** Two rosters in one game, as Sleeper returns them. */
function entry(rosterId: number, matchupId: number | null, points: number): SleeperMatchupEntry {
  return {
    rosterId,
    matchupId,
    points,
    starters: [],
    startersPoints: [],
    players: [],
    playerPoints: {},
  };
}

describe('pairing Sleeper’s rows into games', () => {
  it('pairs two rows that share a matchup id', () => {
    const { games, unpaired } = pairMatchups([entry(4, 7, 82.3), entry(2, 7, 106.4)]);

    expect(unpaired).toBe(0);
    expect(games).toEqual([
      {
        sleeperMatchupId: 7,
        // Ascending roster id, so the same payload always pairs the same way
        // round and a snapshot is comparable to a game either stored either way.
        rosterAId: 2,
        rosterBId: 4,
        pointsACents: 10640,
        pointsBCents: 8230,
      },
    ]);
  });

  it('drops a roster with no matchup id rather than storing a non-game', () => {
    /*
     * Normal once the playoffs start, and true of all ten rosters in week 18.
     * `fantasy_matchups` refuses these for the same reason: a comeback happens
     * inside a game.
     */
    const { games, unpaired } = pairMatchups([entry(1, null, 91.2), entry(2, null, 88.4)]);
    expect(games).toEqual([]);
    expect(unpaired).toBe(2);
  });

  it('drops a matchup id carried by only one roster', () => {
    const { games, unpaired } = pairMatchups([entry(1, 3, 91.2)]);
    expect(games).toEqual([]);
    expect(unpaired).toBe(1);
  });

  it('drops a malformed matchup carried by three rosters', () => {
    // There is no honest way to pick two of three.
    const { games, unpaired } = pairMatchups([
      entry(1, 3, 91.2),
      entry(2, 3, 88.4),
      entry(5, 3, 77.1),
    ]);
    expect(games).toEqual([]);
    expect(unpaired).toBe(3);
  });

  it('converts points to cents without a float drift', () => {
    const { games } = pairMatchups([entry(1, 1, 128.44), entry(2, 1, 121.78)]);
    expect(games[0]?.pointsACents).toBe(12844);
    expect(games[0]?.pointsBCents).toBe(12178);
  });
});

describe.skipIf(!hasDatabase)('photographing a week', () => {
  beforeEach(async () => {
    await resetDatabase(db!);
    const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, { includeWeeks: true });
    await persistChain(db!, chain, { sourceLabel: 'test', finalizeYears: [2024] });
  });

  const rows = [entry(1, 1, 82.3), entry(2, 1, 106.4), entry(3, 2, 118.44), entry(4, 2, 104.9)];

  const run = (at: Date, entries: readonly SleeperMatchupEntry[] = rows) =>
    runSunday(db!, { season: SEASON, week: 10, entries, at, source: 'test' });

  it('captures a week that has never been photographed', async () => {
    const report = await run(SUNDAY);

    expect(report.games).toBe(2);
    expect(report.unpaired).toBe(0);
    expect(report.capture?.captured).toBe(true);
    expect(report.capture?.written).toBe(2);
    expect(report.skipped).toEqual([]);

    const stored = await weekSnapshot(db!, { season: SEASON, week: 10 });
    expect(stored.size).toBe(2);
    expect(stored.get(1)).toMatchObject({ pointsACents: 8230, pointsBCents: 10640 });
  });

  it('refuses a second capture, and keeps the first', async () => {
    /*
     * **The guarantee.** The second run's numbers are what the scores looked
     * like after Monday. If they landed, the paper would go on to say Alex was
     * never behind.
     */
    await run(SUNDAY);
    const after = [entry(1, 1, 128.44), entry(2, 1, 121.78), entry(3, 2, 118.44), entry(4, 2, 104.9)];
    const second = await run(LATER, after);

    expect(second.capture?.captured).toBe(false);
    expect(second.capture?.written).toBe(0);
    expect(second.skipped[0]).toContain('already photographed');

    const stored = await weekSnapshot(db!, { season: SEASON, week: 10 });
    // The Sunday-night numbers, not Monday's.
    expect(stored.get(1)).toMatchObject({ pointsACents: 8230, pointsBCents: 10640 });
  });

  it('is safe when two runs land at the same moment', async () => {
    /*
     * A deploy overlapping the schedule, or the platform retrying a request that
     * had in fact succeeded. Both inserts race the same unique constraint; one
     * wins and the other writes nothing, and neither throws.
     */
    const [first, second] = await Promise.all([run(SUNDAY), run(SUNDAY)]);
    const written = (first.capture?.written ?? 0) + (second.capture?.written ?? 0);

    expect(written).toBe(2);
    expect([first.capture?.captured, second.capture?.captured].filter(Boolean)).toHaveLength(1);

    const [count] = await db!
      .select({ n: sql<number>`count(*)::int` })
      .from(weekSnapshots)
      .where(eq(weekSnapshots.week, 10));
    expect(count?.n).toBe(2);
  });

  it('cannot be edited, even directly', async () => {
    await run(SUNDAY);

    await expectPgMessage(
      db!.update(weekSnapshots).set({ pointsACents: 99999 }).where(eq(weekSnapshots.week, 10)),
      /append-only/,
    );

    await expectPgMessage(
      db!.delete(weekSnapshots).where(eq(weekSnapshots.week, 10)),
      /append-only/,
    );
  });

  it('stores nothing for a week with no paired game', async () => {
    const report = await run(SUNDAY, [entry(1, null, 91.2), entry(2, null, 88.4)]);

    expect(report.games).toBe(0);
    expect(report.capture).toBeNull();
    expect(report.skipped[0]).toContain('no paired game');
    expect(await weekIsSnapshotted(db!, { season: SEASON, week: 10 })).toBe(false);
  });

  it('stores nothing for a season that does not exist', async () => {
    const report = await runSunday(db!, {
      season: 1999,
      week: 10,
      entries: rows,
      at: SUNDAY,
      source: 'test',
    });

    expect(report.capture?.captured).toBe(false);
    expect(report.capture?.written).toBe(0);
  });

  it('records where the numbers came from', async () => {
    await run(SUNDAY);
    const [row] = await db!
      .select({ source: weekSnapshots.source, capturedAt: weekSnapshots.capturedAt })
      .from(weekSnapshots)
      .innerJoin(seasons, eq(seasons.id, weekSnapshots.seasonId))
      .where(and(eq(seasons.year, SEASON), eq(weekSnapshots.week, 10)))
      .limit(1);

    // A claim published in December should be traceable to the thing that was
    // read in October, and "we fetched it" is not traceability.
    expect(row?.source).toBe('test');
    expect(row?.capturedAt?.toISOString()).toBe(SUNDAY.toISOString());
  });

  it('keeps weeks apart', async () => {
    await run(SUNDAY);
    await runSunday(db!, {
      season: SEASON,
      week: 11,
      entries: [entry(1, 1, 55.5), entry(2, 1, 66.6)],
      at: LATER,
      source: 'test',
    });

    expect((await weekSnapshot(db!, { season: SEASON, week: 10 })).size).toBe(2);
    expect((await weekSnapshot(db!, { season: SEASON, week: 11 })).size).toBe(1);
  });

  it('reports an unphotographed week as unphotographed', async () => {
    expect(await weekIsSnapshotted(db!, { season: SEASON, week: 10 })).toBe(false);
    await run(SUNDAY);
    expect(await weekIsSnapshotted(db!, { season: SEASON, week: 10 })).toBe(true);
  });
});
