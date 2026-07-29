import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { closePool, getDb } from '@/lib/db';
import { seasonMemberships, seasons, syncRuns, users } from '@/lib/db/schema';
import { PG_ERROR, expectPgError, resetLeagueTables } from '@/lib/db/test-helpers';

import { traverseChain, type ChainResult, type ImportedSeason } from './chain';
import { loadManagerMappings } from '@/lib/identity/mappings';

import { createFixtureSource } from './fixtures';
import {
  finalizeSeason,
  lastSuccessfulRun,
  MultipleCoOwnersError,
  persistChain,
  unfinalizeSeason,
} from './persist';

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
    await resetLeagueTables(db!);

    // Weeks are needed for reconciliation. They are read and compared here,
    // never persisted — the weekly tables are Phase B.
    chain = await traverseChain(createFixtureSource(), LEAGUE_2026, { includeWeeks: true });
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
      expect(nameOf(byYear.get(2025)?.championUserId ?? null)).toBe('Matty B');
      expect(nameOf(byYear.get(2024)?.championUserId ?? null)).toBe('Alex');
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
        new Set(['Berardo', 'Shant', 'Zack']),
      );
      expect(new Set(holders(7))).toEqual(new Set(['Brandon']));
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
      expect(coOwner?.displayName).toBe('Armen');
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

  // ------------------------------------------------------------------
  // Phase A
  // ------------------------------------------------------------------

  describe('canonical names', () => {
    const nameOf = async (sleeperUserId: string) => {
      const [row] = await db!
        .select()
        .from(users)
        .where(eq(users.sleeperUserId, sleeperUserId));
      return row;
    };

    it('stores the canonical league name, not the Sleeper handle', async () => {
      await importOnce();

      // The four the ruling settled.
      expect((await nameOf('705813167879553024'))?.displayName).toBe('Ryan');
      expect((await nameOf('1251952575964524544'))?.displayName).toBe('Shant');
      expect((await nameOf('1113986962647654400'))?.displayName).toBe('Brandon');
      expect((await nameOf('963870811994046464'))?.displayName).toBe('Joe');
    });

    it('keeps the Sleeper handle as separate provenance', async () => {
      await importOnce();
      const ryan = await nameOf('705813167879553024');

      expect(ryan?.displayName).toBe('Ryan');
      expect(ryan?.sleeperUsername).toBe('RonJonathan');
      expect(ryan?.sleeperUserId).toBe('705813167879553024');
    });

    it('creates exactly one person per Sleeper account, and no second Ron', async () => {
      await importOnce();
      const everyone = await db!.select().from(users);

      expect(everyone).toHaveLength(13);
      expect(everyone.filter((u) => u.displayName === 'Ryan')).toHaveLength(1);
      expect(everyone.some((u) => u.displayName === 'Ron')).toBe(false);
      expect(new Set(everyone.map((u) => u.displayName)).size).toBe(13);
    });

    it('applies a rename from the mapping file on the next import', async () => {
      await importOnce();
      const before = await nameOf('705813167879553024');
      expect(before?.displayName).toBe('Ryan');

      // The mapping file is the rename mechanism, so a change to it lands.
      const file = loadManagerMappings();
      const edited = {
        ...file,
        managers: file.managers.map((m) =>
          m.sleeperUserId === '705813167879553024' ? { ...m, displayName: 'Ryan J' } : m,
        ),
      };

      const summary = await persistChain(db!, chain, { sourceLabel: 'test', mappings: edited });

      expect((await nameOf('705813167879553024'))?.displayName).toBe('Ryan J');
      expect(summary.warnings.some((w) => w.includes('renamed to Ryan J'))).toBe(true);
    });
  });

  describe('retirement', () => {
    const userFor = async (sleeperUserId: string) => {
      const [row] = await db!.select().from(users).where(eq(users.sleeperUserId, sleeperUserId));
      return row;
    };

    it('retires Shant, Armen, and Berardo — and nobody else', async () => {
      await importOnce();
      const retired = (await db!.select().from(users))
        .filter((u) => u.isRetired)
        .map((u) => u.displayName)
        .sort();

      expect(retired).toEqual(['Armen', 'Berardo', 'Shant']);
    });

    it('keeps every scrap of Shant history intact', async () => {
      await importOnce();
      const shant = await userFor('1251952575964524544');
      expect(shant?.isRetired).toBe(true);

      const [membership] = await db!
        .select({
          year: seasons.year,
          rosterId: seasonMemberships.rosterId,
          teamName: seasonMemberships.teamName,
          wins: seasonMemberships.wins,
          losses: seasonMemberships.losses,
          pointsFor: seasonMemberships.pointsFor,
          finalRank: seasonMemberships.finalRank,
          coOwnerUserId: seasonMemberships.coOwnerUserId,
        })
        .from(seasonMemberships)
        .innerJoin(seasons, eq(seasonMemberships.seasonId, seasons.id))
        .where(eq(seasonMemberships.userId, shant!.id));

      // Retirement is not deletion: 2025 roster 4, 'Ceedeez Nuts', 9-5, 6th.
      expect(membership).toMatchObject({
        year: 2025,
        rosterId: 4,
        teamName: 'Ceedeez Nuts',
        wins: 9,
        losses: 5,
        finalRank: 6,
      });
      expect(membership?.pointsFor).toBeCloseTo(1699.36, 2);

      // And the co-owner link to Armen survives.
      const armen = await userFor('604375476017885184');
      expect(membership?.coOwnerUserId).toBe(armen!.id);
    });

    it('keeps Armen a distinct person with his co-owner history, and no seat', async () => {
      await importOnce();
      const armen = await userFor('604375476017885184');
      const shant = await userFor('1251952575964524544');

      expect(armen?.displayName).toBe('Armen');
      expect(armen?.isRetired).toBe(true);
      expect(armen?.id).not.toBe(shant?.id);

      // A co-owner holds no membership — that is what keeps
      // UNIQUE(season_id, roster_id) intact — but he is in history via the link.
      const seats = await db!
        .select()
        .from(seasonMemberships)
        .where(eq(seasonMemberships.userId, armen!.id));
      expect(seats).toHaveLength(0);

      const asCoOwner = await db!
        .select()
        .from(seasonMemberships)
        .where(eq(seasonMemberships.coOwnerUserId, armen!.id));
      expect(asCoOwner).toHaveLength(1);
    });

    it('keeps Berardo whole, and gives none of it to roster 4 later', async () => {
      await importOnce();
      const berardo = await userFor('690209715904417792');
      expect(berardo?.displayName).toBe('Berardo');
      expect(berardo?.isRetired).toBe(true);

      const his = await db!
        .select({ year: seasons.year, rosterId: seasonMemberships.rosterId, rank: seasonMemberships.finalRank })
        .from(seasonMemberships)
        .innerJoin(seasons, eq(seasonMemberships.seasonId, seasons.id))
        .where(eq(seasonMemberships.userId, berardo!.id));

      expect(his).toEqual([{ year: 2024, rosterId: 4, rank: 6 }]);

      // Roster 4's later occupants inherit nothing.
      const slotFour = await db!
        .select({ year: seasons.year, userId: seasonMemberships.userId })
        .from(seasonMemberships)
        .innerJoin(seasons, eq(seasonMemberships.seasonId, seasons.id))
        .where(eq(seasonMemberships.rosterId, 4));

      expect(new Set(slotFour.map((r) => r.userId)).size).toBe(3);
    });
  });

  describe('seasonal team names', () => {
    it('takes the team name from user metadata, for the season it belonged to', async () => {
      await importOnce();

      const rows = await db!
        .select({
          year: seasons.year,
          manager: users.displayName,
          teamName: seasonMemberships.teamName,
        })
        .from(seasonMemberships)
        .innerJoin(seasons, eq(seasonMemberships.seasonId, seasons.id))
        .innerJoin(users, eq(seasonMemberships.userId, users.id));

      const nameIn = (year: number, manager: string) =>
        rows.find((r) => r.year === year && r.manager === manager)?.teamName;

      // Alex ran a different team in each season. Describing 2024 with the
      // 2025 name is the error this field exists to prevent.
      expect(nameIn(2024, 'Alex')).toBe('Cadillac of Novi HR');
      expect(nameIn(2025, 'Alex')).toBe('Juncer’s Hog Formation');
      expect(nameIn(2024, 'Matty B')).toBe('The Coop Kupp Klan');
      expect(nameIn(2025, 'Ryan')).toBe('Fantastic Sloppy');
    });

    it('leaves a manager who set no team name null rather than inventing one', async () => {
      await importOnce();

      const [zack] = await db!
        .select({ teamName: seasonMemberships.teamName })
        .from(seasonMemberships)
        .innerJoin(users, eq(seasonMemberships.userId, users.id))
        .innerJoin(seasons, eq(seasonMemberships.seasonId, seasons.id))
        .where(and(eq(users.displayName, 'Zack'), eq(seasons.year, 2026)));

      expect(zack?.teamName).toBeNull();
    });
  });

  describe('official records and full placements', () => {
    it('persists the finalized standings verbatim, never a recomputed record', async () => {
      await importOnce();

      const rows = await db!
        .select({
          manager: users.displayName,
          wins: seasonMemberships.wins,
          losses: seasonMemberships.losses,
          pointsFor: seasonMemberships.pointsFor,
        })
        .from(seasonMemberships)
        .innerJoin(seasons, eq(seasonMemberships.seasonId, seasons.id))
        .innerJoin(users, eq(seasonMemberships.userId, users.id))
        .where(eq(seasons.year, 2024));

      // The four rosters whose weekly points disagree with the standings keep
      // the OFFICIAL record. This is the ruling in one assertion.
      const record = (manager: string) => {
        const row = rows.find((r) => r.manager === manager);
        return `${String(row?.wins)}-${String(row?.losses)}`;
      };

      expect(record('Nick')).toBe('6-8');
      expect(record('Ryan')).toBe('8-6');
      expect(record('Matt Lee')).toBe('10-4');
      expect(record('Matty B')).toBe('5-9');
    });

    it('gives all ten managers a finish, both seasons', async () => {
      await importOnce();

      for (const year of [2024, 2025]) {
        const ranks = await db!
          .select({ rank: seasonMemberships.finalRank })
          .from(seasonMemberships)
          .innerJoin(seasons, eq(seasonMemberships.seasonId, seasons.id))
          .where(eq(seasons.year, year));

        expect(ranks).toHaveLength(10);
        expect(ranks.every((r) => r.rank !== null)).toBe(true);
        expect(ranks.map((r) => r.rank).sort((a, b) => a! - b!)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      }
    });

    it('records the verified 2025 finish order', async () => {
      await importOnce();

      const rows = await db!
        .select({ manager: users.displayName, rank: seasonMemberships.finalRank })
        .from(seasonMemberships)
        .innerJoin(seasons, eq(seasonMemberships.seasonId, seasons.id))
        .innerJoin(users, eq(seasonMemberships.userId, users.id))
        .where(eq(seasons.year, 2025));

      const order = rows.sort((a, b) => a.rank! - b.rank!).map((r) => r.manager);
      expect(order).toEqual([
        'Matty B', 'Ryan', 'Cheese', 'Nick', 'Alex', 'Shant', 'Nathan', 'Joe', 'Brandon', 'Matt Lee',
      ]);
    });

    it('marks the playoff field without claiming one for an unplayed season', async () => {
      await importOnce();

      const madeIt = async (year: number) =>
        (
          await db!
            .select({ made: seasonMemberships.madePlayoffs })
            .from(seasonMemberships)
            .innerJoin(seasons, eq(seasonMemberships.seasonId, seasons.id))
            .where(eq(seasons.year, year))
        ).filter((r) => r.made).length;

      expect(await madeIt(2024)).toBe(6);
      expect(await madeIt(2025)).toBe(6);
      // 2026's bracket is drawn but undecided.
      expect(await madeIt(2026)).toBe(0);
    });

    it('records when the weekly snapshot was captured', async () => {
      await importOnce();
      const rows = await db!.select().from(seasons);
      for (const row of rows) {
        expect(row.snapshotCapturedAt, String(row.year)).toBeInstanceOf(Date);
      }
    });
  });

  describe('finalized seasons are immutable', () => {
    it('does not finalize from Sleeper status alone', async () => {
      await importOnce();

      // 2024 and 2025 are `complete` on Sleeper. That is not finalization —
      // stat corrections were still landing on 2024 long after it closed.
      const rows = await db!.select().from(seasons);
      expect(rows.every((r) => r.finalizedAt === null)).toBe(true);
    });

    it('freezes only the years explicitly named', async () => {
      const summary = await persistChain(db!, chain, {
        sourceLabel: 'test',
        finalizeYears: [2024],
      });

      expect(summary.seasons.find((s) => s.year === 2024)?.finalized).toBe(true);
      expect(summary.seasons.find((s) => s.year === 2025)?.finalized).toBe(false);

      const [s2024] = await db!.select().from(seasons).where(eq(seasons.year, 2024));
      expect(s2024?.finalizedAt).toBeInstanceOf(Date);
    });

    it('refuses a conflicting re-sync and reports it instead of writing', async () => {
      await importOnce();
      await finalizeSeason(db!, 2024);

      // Sleeper now claims a different record for 2024 — a stat correction
      // arriving after the books were closed.
      const corrected: ChainResult = {
        ...chain,
        seasons: chain.seasons.map((season): ImportedSeason => {
          if (season.year !== 2024) return season;
          return {
            ...season,
            seats: season.seats.map((seat) =>
              seat.rosterId === 9 ? { ...seat, wins: 9, losses: 5 } : seat,
            ),
          };
        }),
      };

      const summary = await persistChain(db!, corrected, { sourceLabel: 'test' });

      expect(summary.status).toBe('NEEDS_REVIEW');
      expect(summary.warnings.some((w) => w.includes('finalized and its official record is immutable'))).toBe(true);
      expect(summary.recordsSkipped).toBeGreaterThan(0);

      // And the record on disk did not move.
      const [row] = await db!
        .select({ wins: seasonMemberships.wins, losses: seasonMemberships.losses })
        .from(seasonMemberships)
        .innerJoin(seasons, eq(seasonMemberships.seasonId, seasons.id))
        .where(and(eq(seasons.year, 2024), eq(seasonMemberships.rosterId, 9)));

      expect(row).toMatchObject({ wins: 10, losses: 4 });
    });

    it('is enforced by the database, not only by the importer', async () => {
      await importOnce();
      await finalizeSeason(db!, 2024);

      const [membership] = await db!
        .select({ id: seasonMemberships.id })
        .from(seasonMemberships)
        .innerJoin(seasons, eq(seasonMemberships.seasonId, seasons.id))
        .where(and(eq(seasons.year, 2024), eq(seasonMemberships.rosterId, 9)));

      // A hand-run UPDATE is exactly the path application discipline misses.
      await expectPgError(
        db!
          .update(seasonMemberships)
          .set({ wins: 99 })
          .where(eq(seasonMemberships.id, membership!.id)),
        { code: PG_ERROR.checkViolation },
      );

      // Deleting and reinserting is the obvious way round an update guard.
      await expectPgError(
        db!.delete(seasonMemberships).where(eq(seasonMemberships.id, membership!.id)),
        { code: PG_ERROR.checkViolation },
      );
    });

    it('still allows annotation that is not the official record', async () => {
      await importOnce();
      await finalizeSeason(db!, 2024);

      const [membership] = await db!
        .select({ id: seasonMemberships.id })
        .from(seasonMemberships)
        .innerJoin(seasons, eq(seasonMemberships.seasonId, seasons.id))
        .where(and(eq(seasons.year, 2024), eq(seasonMemberships.rosterId, 9)));

      // `is_active` is annotation, not result. The commissioner keeps it.
      await expect(
        db!
          .update(seasonMemberships)
          .set({ isActive: false })
          .where(eq(seasonMemberships.id, membership!.id)),
      ).resolves.toBeDefined();
    });

    it('lets an open season keep updating', async () => {
      await importOnce();
      await finalizeSeason(db!, 2024);

      // 2026 is live and unfrozen, so its record advances as it should.
      const advanced: ChainResult = {
        ...chain,
        seasons: chain.seasons.map((season): ImportedSeason => {
          if (season.year !== 2026) return season;
          return {
            ...season,
            seats: season.seats.map((seat) =>
              seat.rosterId === 1 ? { ...seat, wins: 1, pointsFor: 123.45 } : seat,
            ),
          };
        }),
      };

      const summary = await persistChain(db!, advanced, { sourceLabel: 'test' });
      expect(summary.seasons.find((s) => s.year === 2026)?.membershipsUpdated).toBe(1);

      const [row] = await db!
        .select({ wins: seasonMemberships.wins, pointsFor: seasonMemberships.pointsFor })
        .from(seasonMemberships)
        .innerJoin(seasons, eq(seasonMemberships.seasonId, seasons.id))
        .where(and(eq(seasons.year, 2026), eq(seasonMemberships.rosterId, 1)));

      expect(row?.wins).toBe(1);
      expect(row?.pointsFor).toBeCloseTo(123.45, 2);
    });

    it('can be reopened deliberately, which is the only way past the guard', async () => {
      await importOnce();
      await finalizeSeason(db!, 2024);
      expect(await unfinalizeSeason(db!, 2024)).toBe(true);

      const [membership] = await db!
        .select({ id: seasonMemberships.id })
        .from(seasonMemberships)
        .innerJoin(seasons, eq(seasonMemberships.seasonId, seasons.id))
        .where(and(eq(seasons.year, 2024), eq(seasonMemberships.rosterId, 9)));

      await expect(
        db!.update(seasonMemberships).set({ wins: 9 }).where(eq(seasonMemberships.id, membership!.id)),
      ).resolves.toBeDefined();
    });

    it('is safe to call twice', async () => {
      await importOnce();
      expect(await finalizeSeason(db!, 2024)).toBe(true);
      expect(await finalizeSeason(db!, 2024)).toBe(false);
      expect(await finalizeSeason(db!, 1999)).toBe(false);
    });

    it('leaves a finalized season a no-op on re-import', async () => {
      await importOnce();
      await finalizeSeason(db!, 2024);
      await finalizeSeason(db!, 2025);

      const again = await persistChain(db!, chain, { sourceLabel: 'test' });
      expect(again.recordsChanged).toBe(0);
      expect(again.recordsSkipped).toBe(0);
      expect(again.status).toBe('SUCCEEDED');
    });
  });
});
