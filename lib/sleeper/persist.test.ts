import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { closePool, getDb } from '@/lib/db';
import { seasonMemberships, seasons, syncRuns, users } from '@/lib/db/schema';

import { traverseChain, type ChainResult, type ImportedSeason } from './chain';
import { createFixtureSource } from './fixtures';
import { lastSuccessfulRun, MultipleCoOwnersError, persistChain } from './persist';

/**
 * Integration tests for persisting the imported chain.
 *
 * Run against a real Postgres, because the properties under test are database
 * properties: that a re-import writes nothing, that a conflicting roster is
 * left alone rather than overwritten, and that a failed import still leaves an
 * audit trail after its transaction rolls back. None of that can be observed
 * against a mock.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;
const LEAGUE_2026 = '1385016656425668608';

describe.skipIf(!hasDatabase)('persistChain', () => {
  let chain: ChainResult;

  beforeEach(async () => {
    await db!.delete(seasonMemberships);
    await db!.delete(seasons);
    await db!.delete(users);
    await db!.delete(syncRuns);

    chain = await traverseChain(createFixtureSource(), LEAGUE_2026, { includeWeeks: false });
  });

  afterAll(async () => {
    if (hasDatabase) await closePool();
  });

  const importOnce = () => persistChain(db!, chain, { sourceLabel: 'test' });

  describe('first import', () => {
    it('creates every person exactly once across three seasons', async () => {
      const summary = await importOnce();

      // Ten current managers, plus Berardo and Topouzian from earlier seasons,
      // plus the co-owner — thirteen people, not thirty.
      expect(summary.usersCreated).toBe(13);
      expect(await db!.select().from(users)).toHaveLength(13);
    });

    it('creates three seasons and thirty memberships', async () => {
      await importOnce();

      expect(await db!.select().from(seasons)).toHaveLength(3);
      expect(await db!.select().from(seasonMemberships)).toHaveLength(30);
    });

    it('marks completed seasons historical and the current one not', async () => {
      await importOnce();
      const rows = await db!.select().from(seasons);

      const byYear = new Map(rows.map((row) => [row.year, row]));
      expect(byYear.get(2024)?.isHistorical).toBe(true);
      expect(byYear.get(2025)?.isHistorical).toBe(true);
      // 2026 is being watched live, not reconstructed.
      expect(byYear.get(2026)?.isHistorical).toBe(false);
      expect(byYear.get(2026)?.status).toBe('DRAFT_PREP');
    });

    it('resolves champions to permanent people', async () => {
      const summary = await importOnce();
      const allUsers = await db!.select().from(users);
      const nameOf = (id: string | null) =>
        allUsers.find((user) => user.id === id)?.displayName ?? null;

      const byYear = new Map(summary.seasons.map((season) => [season.year, season]));
      expect(nameOf(byYear.get(2025)?.championUserId ?? null)).toBe('MattyB2317');
      expect(nameOf(byYear.get(2024)?.championUserId ?? null)).toBe('BigJuncer');
      expect(byYear.get(2026)?.championUserId).toBeNull();
    });
  });

  describe('identity across seasons', () => {
    it('gives roster 4 three different people, and roster 7 one', async () => {
      await importOnce();

      const seats = await db!
        .select({
          year: seasons.year,
          rosterId: seasonMemberships.rosterId,
          displayName: users.displayName,
        })
        .from(seasonMemberships)
        .innerJoin(seasons, eq(seasonMemberships.seasonId, seasons.id))
        .innerJoin(users, eq(seasonMemberships.userId, users.id));

      const holders = (rosterId: number) =>
        seats.filter((seat) => seat.rosterId === rosterId).map((seat) => seat.displayName);

      expect(new Set(holders(4))).toEqual(
        new Set(['Anthonyberardo', 'Tupaz11', 'zackstephens54']),
      );
      expect(new Set(holders(7))).toEqual(new Set(['imbrickedup22']));
    });
  });

  describe('co-owners', () => {
    it('records the co-owner on the membership without giving them a seat', async () => {
      await importOnce();

      const rows = await db!
        .select({
          year: seasons.year,
          rosterId: seasonMemberships.rosterId,
          userId: seasonMemberships.userId,
          coOwnerUserId: seasonMemberships.coOwnerUserId,
        })
        .from(seasonMemberships)
        .innerJoin(seasons, eq(seasonMemberships.seasonId, seasons.id));

      const seat = rows.find((row) => row.year === 2025 && row.rosterId === 4);
      expect(seat?.coOwnerUserId).not.toBeNull();

      // The co-owner exists as a person, and holds no membership anywhere.
      const [coOwner] = await db!
        .select()
        .from(users)
        .where(eq(users.sleeperUserId, '604375476017885184'));
      expect(coOwner?.displayName).toBe('topouzzz');
      expect(rows.some((row) => row.userId === coOwner?.id)).toBe(false);
      expect(seat?.coOwnerUserId).toBe(coOwner?.id);
    });

    it('aborts the whole import if a roster ever has two co-owners', async () => {
      // Commissioner decision: fail loudly rather than truncate a person out
      // of league history.
      const mutated: ChainResult = {
        ...chain,
        seasons: chain.seasons.map((season): ImportedSeason => {
          if (season.year !== 2025) return season;
          return {
            ...season,
            seats: season.seats.map((seat) =>
              seat.rosterId === 4 ? { ...seat, coOwnerUserIds: ['a', 'b'] } : seat,
            ),
          };
        }),
      };

      await expect(persistChain(db!, mutated, { sourceLabel: 'test' })).rejects.toThrow(
        MultipleCoOwnersError,
      );

      // Nothing was written — the guard runs before the transaction opens.
      expect(await db!.select().from(users)).toHaveLength(0);
      expect(await db!.select().from(seasons)).toHaveLength(0);
    });
  });

  describe('roster metadata', () => {
    it('preserves manager-written nicknames', async () => {
      await importOnce();

      const rows = await db!
        .select({
          rosterId: seasonMemberships.rosterId,
          metadata: seasonMemberships.sleeperMetadata,
        })
        .from(seasonMemberships)
        .innerJoin(seasons, eq(seasonMemberships.seasonId, seasons.id))
        .where(eq(seasons.year, 2025));

      const total = rows.reduce(
        (sum, row) => sum + Object.keys(row.metadata?.playerNicknames ?? {}).length,
        0,
      );
      // 65 `p_nick_*` keys exist in 2025, but 3 hold an empty string — a
      // cleared nickname, not content. Curation drops those, so a blank never
      // reaches a surface as an empty quote.
      expect(total).toBe(62);

      const withStreak = rows.filter((row) => row.metadata?.streak != null);
      expect(withStreak).toHaveLength(10);
    });

    it('stores no personal notification or contact settings', async () => {
      await importOnce();

      const rows = await db!
        .select({ metadata: seasonMemberships.sleeperMetadata })
        .from(seasonMemberships);

      for (const row of rows) {
        const serialized = JSON.stringify(row.metadata ?? {});
        expect(serialized).not.toContain('allow_');
        expect(serialized).not.toContain('_pn');
      }
    });
  });

  describe('re-import', () => {
    // The `16 §13` P1 gate: re-sync is a no-op.
    it('changes nothing on a second run', async () => {
      await importOnce();
      const second = await importOnce();

      expect(second.usersCreated).toBe(0);
      expect(second.recordsChanged).toBe(0);
      expect(second.recordsSkipped).toBe(0);
      expect(second.status).toBe('SUCCEEDED');

      expect(await db!.select().from(users)).toHaveLength(13);
      expect(await db!.select().from(seasonMemberships)).toHaveLength(30);
    });

    it('does not overwrite a commissioner rename', async () => {
      // `display_name` is Tony's Pizza's, seeded from Sleeper once. A re-sync
      // that reverted a rename would make the field useless.
      await importOnce();
      await db!
        .update(users)
        .set({ displayName: 'Alex' })
        .where(eq(users.sleeperUserId, '450049619838103552'));

      await importOnce();

      const [row] = await db!
        .select()
        .from(users)
        .where(eq(users.sleeperUserId, '450049619838103552'));
      expect(row?.displayName).toBe('Alex');
    });

    it('does not revert a season the commissioner advanced', async () => {
      await importOnce();
      await db!.update(seasons).set({ status: 'ACTIVE' }).where(eq(seasons.year, 2026));

      await importOnce();

      const [row] = await db!.select().from(seasons).where(eq(seasons.year, 2026));
      expect(row?.status).toBe('ACTIVE');
    });

    it('leaves a conflicting roster alone and flags it for review', async () => {
      await importOnce();

      // Pretend we recorded roster 4 in 2026 against the wrong person.
      const [season2026] = await db!.select().from(seasons).where(eq(seasons.year, 2026));
      const [someoneElse] = await db!
        .select()
        .from(users)
        .where(eq(users.sleeperUserId, '604375476017885184'));

      await db!
        .update(seasonMemberships)
        .set({ userId: someoneElse!.id })
        .where(
          and(
            eq(seasonMemberships.seasonId, season2026!.id),
            eq(seasonMemberships.rosterId, 4),
          ),
        );

      const summary = await importOnce();

      expect(summary.status).toBe('NEEDS_REVIEW');
      expect(summary.recordsSkipped).toBeGreaterThan(0);
      expect(summary.warnings.some((w) => w.includes('resolve manually'))).toBe(true);

      // The existing row still stands — nothing was reassigned.
      const rows = await db!
        .select()
        .from(seasonMemberships)
        .where(eq(seasonMemberships.seasonId, season2026!.id));
      expect(rows.find((row) => row.rosterId === 4)?.userId).toBe(someoneElse!.id);
    });
  });

  describe('sync runs', () => {
    it('records a successful run with its source and counts', async () => {
      const summary = await importOnce();

      const [run] = await db!.select().from(syncRuns).where(eq(syncRuns.id, summary.syncRunId));
      expect(run?.status).toBe('SUCCEEDED');
      expect(run?.kind).toBe('HISTORICAL_IMPORT');
      expect(run?.source).toBe('test');
      expect(run?.recordsChanged).toBe(46); // 13 people + 3 seasons + 30 seats
      expect(run?.finishedAt).not.toBeNull();
    });

    it('reports the newest successful run, not the oldest', async () => {
      await importOnce();
      const second = await importOnce();

      const latest = await lastSuccessfulRun(db!);
      expect(latest?.id).toBe(second.syncRunId);
    });

    it('survives a rolled-back import, so the failure is still visible', async () => {
      // The audit record is written outside the transaction precisely so a
      // rollback cannot erase the evidence of what was attempted.
      const broken: ChainResult = {
        ...chain,
        seasons: chain.seasons.map((season): ImportedSeason => {
          if (season.year !== 2024) return season;
          // A year that violates seasons.year's NOT NULL contract downstream.
          return { ...season, year: Number.NaN };
        }),
      };

      await expect(persistChain(db!, broken, { sourceLabel: 'test' })).rejects.toThrow();

      const runs = await db!.select().from(syncRuns);
      expect(runs).toHaveLength(1);
      expect(runs[0]?.status).toBe('FAILED');
      expect(runs[0]?.error).not.toBeNull();

      // And the transaction rolled back cleanly.
      expect(await db!.select().from(users)).toHaveLength(0);
      expect(await db!.select().from(seasons)).toHaveLength(0);
    });
  });
});
