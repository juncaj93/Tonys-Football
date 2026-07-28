import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { closePool, getDb } from './index';
import { seasonMemberships, seasons, users } from './schema';
import { PG_ERROR, expectPgError } from './test-helpers';

/**
 * Integration tests for the identity model against a real Postgres.
 *
 * These assert DATABASE CONSTRAINTS, not application logic, so they cannot be
 * run against a mock — the whole point is that the database refuses the bad
 * states even if application code asks for them.
 *
 * The scenario under test is manager turnover, which `16 §5.1` calls the most
 * important rule in the data model. Getting it wrong is unrecoverable: a
 * replacement manager would silently inherit the previous occupant's
 * championships, collectibles, rings, and Timeline entries.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

// Never let CI quietly pass because the database was missing.
if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

describe.skipIf(!hasDatabase)('identity model', () => {
  beforeEach(async () => {
    // Children first — the FKs are RESTRICT, by design.
    await db!.delete(seasonMemberships);
    await db!.delete(seasons);
    await db!.delete(users);
  });

  afterAll(async () => {
    if (hasDatabase) await closePool();
  });

  async function makeUser(displayName: string) {
    const [row] = await db!.insert(users).values({ displayName }).returning();
    return row!;
  }

  async function makeSeason(year: number) {
    const [row] = await db!.insert(seasons).values({ year }).returning();
    return row!;
  }

  describe('roster slots are seasonal, people are permanent', () => {
    it('lets two different people hold the same roster_id in different seasons', async () => {
      // The exact turnover case: Zack replaces a departed manager and inherits
      // the vacated Sleeper slot — but none of their history.
      const departed = await makeUser('Departed Manager');
      const zack = await makeUser('Zack');
      const s2025 = await makeSeason(2025);
      const s2026 = await makeSeason(2026);

      await db!.insert(seasonMemberships).values([
        { seasonId: s2025.id, userId: departed.id, rosterId: 7 },
        { seasonId: s2026.id, userId: zack.id, rosterId: 7 },
      ]);

      const rows = await db!.select().from(seasonMemberships);
      expect(rows).toHaveLength(2);

      // Roster 7 in 2025 is not roster 7 in 2026.
      const owners = new Set(rows.map((r) => r.userId));
      expect(owners.size).toBe(2);
    });

    it('lets one person hold different roster_ids across seasons', async () => {
      const alex = await makeUser('Alex');
      const s2025 = await makeSeason(2025);
      const s2026 = await makeSeason(2026);

      await db!.insert(seasonMemberships).values([
        { seasonId: s2025.id, userId: alex.id, rosterId: 3 },
        { seasonId: s2026.id, userId: alex.id, rosterId: 9 },
      ]);

      const rows = await db!
        .select()
        .from(seasonMemberships)
        .where(eq(seasonMemberships.userId, alex.id));

      expect(rows).toHaveLength(2);
      expect(new Set(rows.map((r) => r.rosterId))).toEqual(new Set([3, 9]));
    });
  });

  describe('constraints the database must enforce', () => {
    it('rejects two people sharing one roster slot in the same season', async () => {
      const a = await makeUser('Manager A');
      const b = await makeUser('Manager B');
      const season = await makeSeason(2026);

      await db!.insert(seasonMemberships).values({
        seasonId: season.id,
        userId: a.id,
        rosterId: 4,
      });

      await expectPgError(
        db!.insert(seasonMemberships).values({
          seasonId: season.id,
          userId: b.id,
          rosterId: 4,
        }),
        {
          code: PG_ERROR.uniqueViolation,
          constraint: 'season_memberships_season_roster_unique',
        },
      );
    });

    it('rejects one person holding two seats in the same season', async () => {
      const alex = await makeUser('Alex');
      const season = await makeSeason(2026);

      await db!.insert(seasonMemberships).values({
        seasonId: season.id,
        userId: alex.id,
        rosterId: 1,
      });

      await expectPgError(
        db!.insert(seasonMemberships).values({
          seasonId: season.id,
          userId: alex.id,
          rosterId: 2,
        }),
        {
          code: PG_ERROR.uniqueViolation,
          constraint: 'season_memberships_season_user_unique',
        },
      );
    });

    it('rejects a duplicate season year', async () => {
      await makeSeason(2026);
      await expectPgError(makeSeason(2026), {
        code: PG_ERROR.uniqueViolation,
        constraint: 'seasons_year_unique',
      });
    });

    it('rejects a duplicate sleeper account mapping', async () => {
      await db!.insert(users).values({ displayName: 'Alex', sleeperUserId: 'sleeper-1' });

      await expectPgError(
        db!.insert(users).values({ displayName: 'Impostor', sleeperUserId: 'sleeper-1' }),
        {
          code: PG_ERROR.uniqueViolation,
          constraint: 'users_sleeper_user_id_unique',
        },
      );
    });

    it('allows many users without a sleeper account', async () => {
      // NULL is distinct under a unique constraint — historical managers
      // imported from 2024/2025 may never claim a Sleeper identity.
      await db!.insert(users).values([
        { displayName: 'Berardo' },
        { displayName: 'Topouzian' },
      ]);

      expect(await db!.select().from(users)).toHaveLength(2);
    });
  });

  describe('history is never destroyed', () => {
    it('refuses to delete a user who has played', async () => {
      const alex = await makeUser('Alex');
      const season = await makeSeason(2026);
      await db!.insert(seasonMemberships).values({
        seasonId: season.id,
        userId: alex.id,
        rosterId: 1,
      });

      await expectPgError(db!.delete(users).where(eq(users.id, alex.id)), {
        code: PG_ERROR.foreignKeyViolation,
        constraint: 'season_memberships_user_id_users_id_fk',
      });
    });

    it('refuses to delete a season that has memberships', async () => {
      const alex = await makeUser('Alex');
      const season = await makeSeason(2026);
      await db!.insert(seasonMemberships).values({
        seasonId: season.id,
        userId: alex.id,
        rosterId: 1,
      });

      await expectPgError(db!.delete(seasons).where(eq(seasons.id, season.id)), {
        code: PG_ERROR.foreignKeyViolation,
        constraint: 'season_memberships_season_id_seasons_id_fk',
      });
    });

    it('retires a manager without touching their history', async () => {
      const berardo = await makeUser('Berardo');
      const s2024 = await makeSeason(2024);
      await db!.insert(seasonMemberships).values({
        seasonId: s2024.id,
        userId: berardo.id,
        rosterId: 5,
        finalRank: 4,
      });

      await db!.update(users).set({ isRetired: true }).where(eq(users.id, berardo.id));

      const [retired] = await db!.select().from(users).where(eq(users.id, berardo.id));
      expect(retired!.isRetired).toBe(true);

      const history = await db!
        .select()
        .from(seasonMemberships)
        .where(eq(seasonMemberships.userId, berardo.id));

      expect(history).toHaveLength(1);
      expect(history[0]!.finalRank).toBe(4);
    });
  });

  describe('season defaults', () => {
    it('starts a season in DRAFT_PREP and not historical', async () => {
      const season = await makeSeason(2026);
      expect(season.status).toBe('DRAFT_PREP');
      expect(season.isHistorical).toBe(false);
      expect(season.closedAt).toBeNull();
      expect(season.title).toBeNull();
    });

    it('marks retroactively imported seasons as historical', async () => {
      const [s] = await db!
        .insert(seasons)
        .values({ year: 2024, isHistorical: true, status: 'ARCHIVED' })
        .returning();

      expect(s!.isHistorical).toBe(true);
      expect(s!.status).toBe('ARCHIVED');
    });
  });
});
