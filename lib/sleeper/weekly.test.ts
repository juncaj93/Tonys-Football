import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { closePool, getDb } from '@/lib/db';
import { fantasyMatchups, seasonMemberships, seasons } from '@/lib/db/schema';
import { resetDatabase } from '@/lib/db/test-helpers';

import { traverseChain } from './chain';
import { createFixtureSource } from './fixtures';
import { persistChain } from './persist';
import { type SleeperEndpoint } from './endpoints';
import { seasonInProgress } from './test-source';
import { type SleeperSource } from './transport';
import { LAST_SYNCABLE_WEEK, latestStoredWeek, syncSeason, weekToReadThrough } from './weekly';

/**
 * The in-season sync, against a real Postgres.
 *
 * ## What was broken, and how it would have shown
 *
 * `16 §4.3` specifies the Tuesday chain as **sync → finalize → …** and the sync
 * was never built. Nothing else in the deployed application writes
 * `fantasy_matchups`: the deploy seed imports recorded fixtures, and the 2026
 * recording — taken in July — has **no matchups directory at all**, which is the
 * correct photograph of a season that has not started.
 *
 * So the failure had no error in it. `finalizeWeek` would decline week 1 with
 * *"holds no publishable game"*, which is the right sentence in July and
 * indistinguishable from it in October, and the league would sit in offseason
 * for a year with every downstream system working perfectly on no input.
 *
 * The second defect is its mirror image and is reproducible in four commands:
 * `vercel-build` runs `db:seed` on **every deploy**, and `persistChain` updated
 * an open season's standings from whatever it was handed — so a merge in week 9
 * reset every record to 0–0 from a July fixture and reported it as *"1 records
 * changed"*.
 *
 * Both are asserted here against a source that serves a season *in progress*,
 * because neither is visible against a completed one.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

const LEAGUE_2026 = '1385016656425668608';
const SEASON = 2026;

/** The recording's own moment. Everything the fixtures serve is stamped with it. */
const FIXTURE_CAPTURE = new Date('2026-07-28T14:00:06.435Z');
const WEEK_5_TUESDAY = new Date('2026-10-13T09:00:00Z');

afterAll(async () => {
  if (hasDatabase) await closePool();
});

/** The state a fresh production database is in: three seasons, 2026 unplayed. */
async function importHistory(): Promise<void> {
  const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, { includeWeeks: true });
  await persistChain(db!, chain, { sourceLabel: 'fixtures', finalizeYears: [2024, 2025] });
}

async function standingOf(rosterId: number) {
  const [row] = await db!
    .select({ wins: seasonMemberships.wins, pointsFor: seasonMemberships.pointsFor })
    .from(seasonMemberships)
    .innerJoin(seasons, eq(seasons.id, seasonMemberships.seasonId))
    .where(and(eq(seasons.year, SEASON), eq(seasonMemberships.rosterId, rosterId)));

  return row ?? null;
}

describe.skipIf(!hasDatabase)('the in-season sync', () => {
  beforeEach(async () => {
    await resetDatabase(db!);
    await importHistory();
  });

  describe('the read bound', () => {
    it('asks for week 1 from a standing start', () => {
      expect(weekToReadThrough(0)).toBe(1);
    });

    it('asks for one week past the last one it holds', () => {
      expect(weekToReadThrough(1)).toBe(2);
      expect(weekToReadThrough(13)).toBe(14);
    });

    it('never reads past the last week the league plays', () => {
      expect(weekToReadThrough(LAST_SYNCABLE_WEEK)).toBe(LAST_SYNCABLE_WEEK);
      expect(weekToReadThrough(99)).toBe(LAST_SYNCABLE_WEEK);
    });
  });

  it('brings in a week that exists only upstream', async () => {
    expect(await latestStoredWeek(db!, SEASON)).toBe(0);

    const source = seasonInProgress({ played: 1, capturedAt: WEEK_5_TUESDAY });
    const report = await syncSeason(db!, { source, seasonYear: SEASON, through: 1 });

    expect(report.refusal).toBeNull();
    expect(await latestStoredWeek(db!, SEASON)).toBe(1);

    const games = await db!
      .select({ week: fantasyMatchups.week })
      .from(fantasyMatchups)
      .innerJoin(seasons, eq(seasons.id, fantasyMatchups.seasonId))
      .where(eq(seasons.year, SEASON));

    expect(games).toHaveLength(5);
  });

  it('moves the standings on, which is what the receipt reads', async () => {
    const before = await standingOf(1);
    expect(before?.wins).toBe(0);

    const source = seasonInProgress({ played: 3, capturedAt: WEEK_5_TUESDAY });
    await syncSeason(db!, { source, seasonYear: SEASON, through: 3 });

    const after = await standingOf(1);
    expect(after?.wins).toBeGreaterThan(0);
  });

  it('is a read the second time it runs', async () => {
    const first = seasonInProgress({ played: 2, capturedAt: WEEK_5_TUESDAY });
    await syncSeason(db!, { source: first, seasonYear: SEASON, through: 2 });

    const second = seasonInProgress({ played: 2, capturedAt: WEEK_5_TUESDAY });
    const report = await syncSeason(db!, { source: second, seasonYear: SEASON, through: 2 });

    expect(report.refusal).toBeNull();
    expect(report.summary?.recordsChanged).toBe(0);
    expect(await latestStoredWeek(db!, SEASON)).toBe(2);
  });

  it('does not fetch transactions, which nothing stores and nothing reads', async () => {
    const source = seasonInProgress({ played: 4, capturedAt: WEEK_5_TUESDAY });
    await syncSeason(db!, { source, seasonYear: SEASON, through: 4 });

    expect(source.requests.filter((r) => r.kind === 'transactions')).toHaveLength(0);
    // Four weeks read, and one request each rather than two.
    expect(source.requests.filter((r) => r.kind === 'matchups')).toHaveLength(4);
  });

  it('reads only the season it was asked for, never the whole chain', async () => {
    const source = seasonInProgress({ played: 2, capturedAt: WEEK_5_TUESDAY });
    await syncSeason(db!, { source, seasonYear: SEASON, through: 2 });

    const leagues = new Set(
      source.requests
        .filter((r): r is Extract<SleeperEndpoint, { leagueId: string }> => 'leagueId' in r)
        .map((r) => r.leagueId),
    );

    expect([...leagues]).toEqual([LEAGUE_2026]);
  });

  describe('what it refuses', () => {
    it('refuses a finalized season rather than reporting a conflict per roster', async () => {
      const source = seasonInProgress({ played: 2, capturedAt: WEEK_5_TUESDAY });
      const report = await syncSeason(db!, { source, seasonYear: 2025, through: 2 });

      expect(report.refusal).toBe('season-closed');
      expect(source.requests).toHaveLength(0);
    });

    it('refuses a season this database has never heard of', async () => {
      const source = seasonInProgress({ played: 2, capturedAt: WEEK_5_TUESDAY });
      const report = await syncSeason(db!, { source, seasonYear: 1998, through: 2 });

      expect(report.refusal).toBe('no-season');
    });

    it('refuses a league that is a different season than the one asked for', async () => {
      /*
       * The `SLEEPER_LEAGUE_ID` left over from last year. Without this the 2025
       * league's games would be imported under 2026's roster ids, which is one
       * manager's week attributed to another.
       */
      const LEAGUE_2025 = '1240008879295713280';
      // The id is unique across seasons, so 2025 has to let go of it first.
      await db!
        .update(seasons)
        .set({ sleeperLeagueId: 'retired-2025' })
        .where(eq(seasons.year, 2025));
      await db!
        .update(seasons)
        .set({ sleeperLeagueId: LEAGUE_2025 })
        .where(eq(seasons.year, SEASON));

      const source = seasonInProgress({ played: 2, capturedAt: WEEK_5_TUESDAY });
      const report = await syncSeason(db!, { source, seasonYear: SEASON, through: 2 });

      expect(report.refusal).toBe('wrong-season');
      expect(await latestStoredWeek(db!, SEASON)).toBe(0);
    });

    it('refuses an unreachable Sleeper without throwing, so the rest of Tuesday runs', async () => {
      const dead: SleeperSource = {
        label: 'dead',
        fetch: () => Promise.reject(new Error('socket hang up')),
      };

      const report = await syncSeason(db!, { source: dead, seasonYear: SEASON, through: 1 });

      expect(report.refusal).toBe('unreachable');
      expect(report.warnings.join(' ')).toContain('socket hang up');
    });
  });

  describe('a stale capture never overwrites a fresh one', () => {
    /*
     * The deploy defect, reproduced. `vercel-build` runs `db:seed` on every
     * merge, and the seed reads the July fixtures. Before the guard this took a
     * live 3–0 back to 0–0 and called it progress.
     */
    it('leaves a live standing alone when the deploy seed re-imports July', async () => {
      const live = seasonInProgress({ played: 3, capturedAt: WEEK_5_TUESDAY });
      await syncSeason(db!, { source: live, seasonYear: SEASON, through: 3 });

      const synced = await standingOf(1);
      expect(synced?.wins).toBeGreaterThan(0);

      // Exactly what a deploy does, byte for byte.
      await importHistory();

      const afterDeploy = await standingOf(1);
      expect(afterDeploy?.wins).toBe(synced?.wins);
      expect(afterDeploy?.pointsFor).toBe(synced?.pointsFor);
    });

    it('leaves the games alone too', async () => {
      const live = seasonInProgress({ played: 3, capturedAt: WEEK_5_TUESDAY });
      await syncSeason(db!, { source: live, seasonYear: SEASON, through: 3 });
      expect(await latestStoredWeek(db!, SEASON)).toBe(3);

      await importHistory();

      expect(await latestStoredWeek(db!, SEASON)).toBe(3);
    });

    it('says so out loud rather than skipping in silence', async () => {
      const live = seasonInProgress({ played: 3, capturedAt: WEEK_5_TUESDAY });
      await syncSeason(db!, { source: live, seasonYear: SEASON, through: 3 });

      const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, { includeWeeks: true });
      const summary = await persistChain(db!, chain, { sourceLabel: 'fixtures', finalizeYears: [] });

      expect(summary.status).toBe('NEEDS_REVIEW');
      expect(summary.warnings.join(' ')).toContain('older than');
    });

    it('does not let the stale read move the clock it is judged against', async () => {
      const live = seasonInProgress({ played: 3, capturedAt: WEEK_5_TUESDAY });
      await syncSeason(db!, { source: live, seasonYear: SEASON, through: 3 });

      // Two deploys, because the interesting failure is the second one: a guard
      // that let the stale read stamp its own time would win on the retry.
      await importHistory();
      await importHistory();

      const [row] = await db!
        .select({ capturedAt: seasons.snapshotCapturedAt })
        .from(seasons)
        .where(eq(seasons.year, SEASON));

      expect(row?.capturedAt?.getTime()).toBe(WEEK_5_TUESDAY.getTime());
      expect(await latestStoredWeek(db!, SEASON)).toBe(3);
    });

    it('still lets an equal capture through, so a re-seed stays a no-op', async () => {
      const summary = await (async () => {
        await importHistory();
        const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, {
          includeWeeks: true,
        });
        return persistChain(db!, chain, { sourceLabel: 'fixtures', finalizeYears: [] });
      })();

      expect(summary.warnings.join(' ')).not.toContain('older than');

      const [row] = await db!
        .select({ capturedAt: seasons.snapshotCapturedAt })
        .from(seasons)
        .where(eq(seasons.year, SEASON));

      expect(row?.capturedAt?.getTime()).toBe(FIXTURE_CAPTURE.getTime());
    });

    it('lets a fresher read through, which is the whole point of having a clock', async () => {
      const first = seasonInProgress({ played: 2, capturedAt: WEEK_5_TUESDAY });
      await syncSeason(db!, { source: first, seasonYear: SEASON, through: 2 });

      const later = seasonInProgress({
        played: 3,
        capturedAt: new Date(WEEK_5_TUESDAY.getTime() + 7 * 24 * 3600 * 1000),
      });
      const report = await syncSeason(db!, { source: later, seasonYear: SEASON, through: 3 });

      expect(report.refusal).toBeNull();
      expect(await latestStoredWeek(db!, SEASON)).toBe(3);
    });
  });
  describe('a week that has not been played is not a result', () => {
    /*
     * Sleeper publishes the whole schedule the moment a league drafts, so between
     * the draft and the opener `matchups/1` is ten rows at zero points. The sync
     * asks for one week past what it holds, which during those weeks is week 1 —
     * every Tuesday.
     *
     * Storing them would be unrecoverable rather than merely wrong:
     * `finalizeWeek` would close week 1 on five fabricated ties and
     * `week_finalizations` is append-only, so the real week 1 could never be
     * recorded and the paper would have printed a week that did not happen.
     */
    function scheduleOnly(): SleeperSource {
      const played = seasonInProgress({ played: 1 });
      return {
        label: 'drafted, not played',
        fetch: async (endpoint) => {
          const result = await played.fetch(endpoint);
          if (endpoint.kind !== 'matchups' || result.kind !== 'ok') return result;
          const rows = result.payload as { points: number }[];
          return { ...result, payload: rows.map((row) => ({ ...row, points: 0 })) };
        },
      };
    }

    it('stores nothing for a drafted week nobody has played', async () => {
      const report = await syncSeason(db!, {
        source: scheduleOnly(),
        seasonYear: SEASON,
        through: 1,
      });

      expect(report.refusal).toBeNull();
      expect(await latestStoredWeek(db!, SEASON)).toBe(0);
    });

    it('takes the real result when the week is finally played', async () => {
      await syncSeason(db!, { source: scheduleOnly(), seasonYear: SEASON, through: 1 });
      await syncSeason(db!, {
        source: seasonInProgress({ played: 1 }),
        seasonYear: SEASON,
        through: 1,
      });

      expect(await latestStoredWeek(db!, SEASON)).toBe(1);
    });

    it('has never cost this league a real game', async () => {
      /*
       * The rule's price, measured against the league's own history rather than
       * asserted. A genuine 0.00-0.00 game is indistinguishable from a fixture in
       * this payload; across the 162 recorded games of 2024 and 2025 there is not
       * one, and it would take twenty starters scoring nothing between them.
       */
      const games = await db!
        .select({
          a: fantasyMatchups.pointsACents,
          b: fantasyMatchups.pointsBCents,
        })
        .from(fantasyMatchups);

      expect(games.length).toBeGreaterThan(150);
      expect(games.filter((game) => game.a === 0 && game.b === 0)).toEqual([]);
    });
  });
});
