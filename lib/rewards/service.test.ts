import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearClock, setFixedClock } from '@/lib/clock';
import { applyTokenDelta, ensureEconomyConfig, wallet } from '@/lib/counter/tokens';
import { closePool, getDb } from '@/lib/db';
import {
  fantasyMatchups,
  seasonMemberships,
  seasons,
  tokenTransactions,
  users,
  weekFinalizations,
  weeklyRewards,
} from '@/lib/db/schema';
import { PG_ERROR, expectPgError, resetDatabase } from '@/lib/db/test-helpers';

import { rewardIdempotencyKey } from './derive';
import { awardWeek } from './service';

/**
 * Weekly rewards, against a real Postgres.
 *
 * The guarantees this slice actually rests on are database guarantees — one
 * payment per manager per reason, a closed season that cannot pay, a replay that
 * moves nothing, two concurrent Tuesdays that between them pay once. A mock
 * cannot demonstrate any of them, because in every case the thing being tested is
 * what happens when application code asks for something wrong.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

const AT = new Date('2026-10-06T12:00:00Z');

describe.skipIf(!hasDatabase)('weekly rewards', () => {
  beforeEach(async () => {
    await resetDatabase(db!);
    setFixedClock('2026-10-06T12:00:00Z');
  });

  afterEach(() => {
    clearClock();
  });

  afterAll(async () => {
    if (hasDatabase) await closePool();
  });

  /**
   * A season with four seated, active managers.
   *
   * Eligibility is `activeSeat` — a live seat in the **newest** season, which is
   * the only season these tests create. `isActive: false` is how the league
   * retires somebody (`lib/league/membership.ts`), so that is what `retired`
   * sets rather than a deleted row: `11 §2` keeps the permanent person and the
   * seasonal seat apart, and the history has to survive the retirement.
   */
  async function league(
    year = 2026,
    options: { readonly retired?: readonly number[] } = {},
  ) {
    const [season] = await db!.insert(seasons).values({ year }).returning();
    const seats: { userId: string; membershipId: string; rosterId: number }[] = [];

    for (const rosterId of [1, 2, 3, 4]) {
      const [user] = await db!
        .insert(users)
        .values({ displayName: `Manager ${String(rosterId)}` })
        .returning();
      const [membership] = await db!
        .insert(seasonMemberships)
        .values({
          seasonId: season!.id,
          userId: user!.id,
          rosterId,
          isActive: !(options.retired ?? []).includes(rosterId),
        })
        .returning();
      seats.push({ userId: user!.id, membershipId: membership!.id, rosterId });
    }

    const economy = await ensureEconomyConfig(db!, season!.id);
    return { season: season!, seats, economy };
  }

  /** One paired game. Points are cents; the winner is stored, never computed. */
  async function storeGame(
    seasonId: string,
    input: {
      readonly week?: number;
      readonly matchupId: number;
      readonly a: number;
      readonly b: number;
      readonly aPoints: number;
      readonly bPoints: number;
      readonly weekType?: string;
      readonly disputed?: boolean;
    },
  ) {
    await db!.insert(fantasyMatchups).values({
      seasonId,
      week: input.week ?? 5,
      weekType: input.weekType ?? 'regular',
      sleeperMatchupId: input.matchupId,
      rosterAId: input.a,
      rosterBId: input.b,
      pointsACents: input.aPoints,
      pointsBCents: input.bPoints,
      winnerRosterId:
        input.aPoints === input.bPoints ? null : input.aPoints > input.bPoints ? input.a : input.b,
      marginCents: Math.abs(input.aPoints - input.bPoints),
      disputed: input.disputed ?? false,
    });
  }

  /** Two games, roster 1 posting the week's best score. */
  async function ordinaryWeek(seasonId: string, week = 5) {
    await storeGame(seasonId, { week, matchupId: 1, a: 1, b: 2, aPoints: 13000, bPoints: 9000 });
    await storeGame(seasonId, { week, matchupId: 2, a: 3, b: 4, aPoints: 11000, bPoints: 10000 });
  }

  async function closeWeek(seasonId: string, week = 5, games = 2) {
    await db!
      .insert(weekFinalizations)
      .values({ seasonId, week, games, finalizedAt: AT })
      .onConflictDoNothing();
  }

  async function balanceOf(userId: string, seasonId: string): Promise<number> {
    return (await wallet(db!, { userId, seasonId }))?.balance ?? -1;
  }

  /* ---------------------------------------------------------------------
   * The happy path
   * ------------------------------------------------------------------ */

  describe('a finalized week', () => {
    it('pays wins and the high score, once', async () => {
      const { season, seats } = await league();
      await ordinaryWeek(season.id);
      await closeWeek(season.id);

      const report = await awardWeek(db!, { season: 2026, week: 5, at: AT });

      expect(report.refusal).toBeNull();
      // Roster 1 wins and posts the high score; roster 3 wins. Roster 2 and 4 lost.
      expect(report.tokens).toBe(150 + 400 + 150);
      expect(report.paid).toHaveLength(3);

      expect(await balanceOf(seats[0]!.userId, season.id)).toBe(550);
      expect(await balanceOf(seats[1]!.userId, season.id)).toBe(0);
      expect(await balanceOf(seats[2]!.userId, season.id)).toBe(150);
      expect(await balanceOf(seats[3]!.userId, season.id)).toBe(0);
    });

    it('records the basis and the economy version on every row', async () => {
      const { season, economy } = await league();
      await ordinaryWeek(season.id);
      await closeWeek(season.id);

      await awardWeek(db!, { season: 2026, week: 5, at: AT });

      const rows = await db!
        .select()
        .from(weeklyRewards)
        .where(eq(weeklyRewards.seasonId, season.id));

      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(row.economyVersion).toBe(economy.version);
        expect(row.gameKey).toMatch(/^2026-w05-m\d+$/);
        expect(row.pointsCents).toBeGreaterThan(0);
        expect(row.awardedAt.toISOString()).toBe(AT.toISOString());
      }

      const high = rows.find((row) => row.reason === 'WEEKLY_HIGH_SCORE');
      expect(high?.pointsCents).toBe(13000);
      expect(high?.rosterId).toBe(1);
    });

    it('points every reward at the ledger row that paid it', async () => {
      const { season } = await league();
      await ordinaryWeek(season.id);
      await closeWeek(season.id);
      await awardWeek(db!, { season: 2026, week: 5, at: AT });

      const rows = await db!.select().from(weeklyRewards);
      for (const row of rows) {
        const [ledger] = await db!
          .select()
          .from(tokenTransactions)
          .where(eq(tokenTransactions.id, row.tokenTransactionId));
        expect(ledger?.amount).toBe(row.amount);
        expect(ledger?.reasonCode).toBe(row.reason);
        expect(ledger?.seasonMembershipId).toBe(row.seasonMembershipId);
      }
    });

    it('keeps the balance equal to the sum of the ledger', async () => {
      const { season, seats } = await league();
      await ordinaryWeek(season.id);
      await closeWeek(season.id);
      await awardWeek(db!, { season: 2026, week: 5, at: AT });

      for (const seat of seats) {
        const [summed] = await db!
          .select({ total: sql<number>`coalesce(sum(${tokenTransactions.amount}), 0)::int` })
          .from(tokenTransactions)
          .where(eq(tokenTransactions.seasonMembershipId, seat.membershipId));
        expect(await balanceOf(seat.userId, season.id)).toBe(summed!.total);
      }
    });
  });

  /* ---------------------------------------------------------------------
   * Idempotency — the reason this is a database test
   * ------------------------------------------------------------------ */

  describe('running it more than once', () => {
    it('is a no-op the second time', async () => {
      const { season, seats } = await league();
      await ordinaryWeek(season.id);
      await closeWeek(season.id);

      const first = await awardWeek(db!, { season: 2026, week: 5, at: AT });
      const second = await awardWeek(db!, { season: 2026, week: 5, at: AT });

      expect(first.paid).toHaveLength(3);
      expect(second.paid).toHaveLength(0);
      expect(second.alreadyPaid).toBe(3);
      expect(second.tokens).toBe(0);

      expect(await balanceOf(seats[0]!.userId, season.id)).toBe(550);
      const rows = await db!.select().from(weeklyRewards);
      expect(rows).toHaveLength(3);
    });

    it('is a no-op ten times over', async () => {
      const { season, seats } = await league();
      await ordinaryWeek(season.id);
      await closeWeek(season.id);

      for (let run = 0; run < 10; run += 1) {
        await awardWeek(db!, { season: 2026, week: 5, at: AT });
      }

      expect(await balanceOf(seats[0]!.userId, season.id)).toBe(550);
      expect(await db!.select().from(weeklyRewards)).toHaveLength(3);
    });

    it('pays once when two runs race', async () => {
      const { season, seats } = await league();
      await ordinaryWeek(season.id);
      await closeWeek(season.id);

      // The case an application-level "have we paid yet" check gets wrong: both
      // reads say no, both proceed, and only the unique index is in a position
      // to arbitrate.
      const [a, b] = await Promise.all([
        awardWeek(db!, { season: 2026, week: 5, at: AT }),
        awardWeek(db!, { season: 2026, week: 5, at: AT }),
      ]);

      expect(a.paid.length + b.paid.length).toBe(3);
      expect(await balanceOf(seats[0]!.userId, season.id)).toBe(550);
      expect(await db!.select().from(weeklyRewards)).toHaveLength(3);
    });

    it('refuses to re-price a week that has already been paid', async () => {
      const { season, seats } = await league();
      await ordinaryWeek(season.id);
      await closeWeek(season.id);
      await awardWeek(db!, { season: 2026, week: 5, at: AT });

      /*
       * The rebalance case: the same occasion, a different amount.
       *
       * The key omits the amount precisely so this raises instead of paying a
       * second time at a second price. Both rows would otherwise look
       * legitimate, and the manager would be paid twice for one win.
       */
      await expectPgError(
        applyTokenDelta(db!, {
          userId: seats[0]!.userId,
          seasonId: season.id,
          amount: 999,
          reason: 'MATCHUP_WIN',
          description: 'Won in week 5.',
          idempotencyKey: rewardIdempotencyKey({
            season: 2026,
            week: 5,
            managerId: seats[0]!.userId,
            reason: 'MATCHUP_WIN',
          }),
        }),
        { code: PG_ERROR.uniqueViolation },
      );

      // And the original payment is untouched.
      expect(await balanceOf(seats[0]!.userId, season.id)).toBe(550);
    });
  });

  /* ---------------------------------------------------------------------
   * Refusals — every one an expected state, not a failure
   * ------------------------------------------------------------------ */

  describe('when a week cannot pay', () => {
    it('declines a week that is not finalized', async () => {
      const { season, seats } = await league();
      await ordinaryWeek(season.id);

      const report = await awardWeek(db!, { season: 2026, week: 5, at: AT });

      expect(report.refusal).toBe('not-finalized');
      expect(report.paid).toEqual([]);
      expect(await balanceOf(seats[0]!.userId, season.id)).toBe(0);
      expect(await db!.select().from(weeklyRewards)).toHaveLength(0);
    });

    it('declines a week with no games', async () => {
      // A seated, eligible league with nothing played — the offseason state the
      // product actually launches into.
      await league();
      const report = await awardWeek(db!, { season: 2026, week: 5, at: AT });
      expect(report.refusal).toBe('no-games');
    });

    it('declines a season that was never imported', async () => {
      const report = await awardWeek(db!, { season: 1999, week: 5, at: AT });
      expect(report.refusal).toBe('no-season');
    });

    it('declines a finalized season rather than raising from the ledger', async () => {
      /*
       * The trap this slice had to avoid. Every week of 2024 and 2025 is final
       * by way of the closed season, and `apply_token_delta` refuses a finalized
       * season outright — so without the `season_closed` branch this would throw
       * a Postgres exception from four frames down instead of declining.
       */
      const { season } = await league(2025);
      await ordinaryWeek(season.id);
      await db!
        .update(seasons)
        .set({ finalizedAt: AT, status: 'ARCHIVED' })
        .where(eq(seasons.id, season.id));

      const report = await awardWeek(db!, { season: 2025, week: 5, at: AT });

      expect(report.refusal).toBe('season-closed');
      expect(await db!.select().from(weeklyRewards)).toHaveLength(0);
    });

    it('pays nothing for a finalized week whose only game is disputed', async () => {
      const { season } = await league();
      await storeGame(season.id, {
        matchupId: 1,
        a: 1,
        b: 2,
        aPoints: 13000,
        bPoints: 9000,
        disputed: true,
      });
      await closeWeek(season.id, 5, 1);

      const report = await awardWeek(db!, { season: 2026, week: 5, at: AT });
      expect(report.refusal).toBe('nothing-payable');
      expect(await db!.select().from(weeklyRewards)).toHaveLength(0);
    });

    it('throws rather than guessing when a season has no economy config', async () => {
      const [season] = await db!.insert(seasons).values({ year: 2026 }).returning();
      const [user] = await db!.insert(users).values({ displayName: 'Solo' }).returning();
      await db!
        .insert(seasonMemberships)
        .values({ seasonId: season!.id, userId: user!.id, rosterId: 1 });
      const [other] = await db!.insert(users).values({ displayName: 'Other' }).returning();
      await db!
        .insert(seasonMemberships)
        .values({ seasonId: season!.id, userId: other!.id, rosterId: 2 });
      await storeGame(season!.id, { matchupId: 1, a: 1, b: 2, aPoints: 13000, bPoints: 9000 });
      await closeWeek(season!.id, 5, 1);

      // A silent fallback to the constants would pay real tokens at prices no
      // environment stored. Loud is the correct behaviour.
      await expect(awardWeek(db!, { season: 2026, week: 5, at: AT })).rejects.toThrow(
        /no stored economy config/,
      );
    });
  });

  /* ---------------------------------------------------------------------
   * Who is eligible
   * ------------------------------------------------------------------ */

  describe('eligibility', () => {
    it('excludes a retired manager and their whole game', async () => {
      const { season, seats } = await league(2026, { retired: [2] });
      await ordinaryWeek(season.id);
      await closeWeek(season.id);

      const report = await awardWeek(db!, { season: 2026, week: 5, at: AT });

      // Roster 1 beat the retired roster 2, so that game carries no claim at all
      // — including the high score that was inside it.
      expect(await balanceOf(seats[0]!.userId, season.id)).toBe(0);
      // The remaining game still pays its winner and now holds the high score.
      expect(await balanceOf(seats[2]!.userId, season.id)).toBe(550);
      expect(report.paid).toHaveLength(2);
    });

    it('pays nobody for a bye', async () => {
      const { season, seats } = await league();
      // Only rosters 1 and 2 played. A bye is an absent row, not a zero award.
      await storeGame(season.id, { matchupId: 1, a: 1, b: 2, aPoints: 13000, bPoints: 9000 });
      await closeWeek(season.id, 5, 1);

      await awardWeek(db!, { season: 2026, week: 5, at: AT });

      expect(await balanceOf(seats[2]!.userId, season.id)).toBe(0);
      expect(await balanceOf(seats[3]!.userId, season.id)).toBe(0);
      const rows = await db!.select().from(weeklyRewards);
      expect(rows.every((row) => row.rosterId === 1)).toBe(true);
    });

    it('pays no win for a tie but still pays the high score to both', async () => {
      const { season, seats } = await league();
      await storeGame(season.id, { matchupId: 1, a: 1, b: 2, aPoints: 12000, bPoints: 12000 });
      await storeGame(season.id, { matchupId: 2, a: 3, b: 4, aPoints: 9000, bPoints: 8000 });
      await closeWeek(season.id);

      await awardWeek(db!, { season: 2026, week: 5, at: AT });

      expect(await balanceOf(seats[0]!.userId, season.id)).toBe(400);
      expect(await balanceOf(seats[1]!.userId, season.id)).toBe(400);
      expect(await balanceOf(seats[2]!.userId, season.id)).toBe(150);
    });

    it('pays a playoff week exactly like a regular one', async () => {
      const { season, seats } = await league();
      await storeGame(season.id, {
        matchupId: 1,
        a: 1,
        b: 2,
        aPoints: 13000,
        bPoints: 9000,
        weekType: 'playoff',
      });
      await closeWeek(season.id, 5, 1);

      await awardWeek(db!, { season: 2026, week: 5, at: AT });
      expect(await balanceOf(seats[0]!.userId, season.id)).toBe(550);
    });

    it('pays a consolation week exactly like a regular one', async () => {
      const { season, seats } = await league();
      await storeGame(season.id, {
        matchupId: 1,
        a: 3,
        b: 4,
        aPoints: 11000,
        bPoints: 9000,
        weekType: 'consolation',
      });
      await closeWeek(season.id, 5, 1);

      await awardWeek(db!, { season: 2026, week: 5, at: AT });
      expect(await balanceOf(seats[2]!.userId, season.id)).toBe(550);
    });
  });

  /* ---------------------------------------------------------------------
   * The database's own rules
   * ------------------------------------------------------------------ */

  describe('the table itself', () => {
    it('refuses a second award for the same manager, week and reason', async () => {
      const { season, seats, economy } = await league();
      await ordinaryWeek(season.id);
      await closeWeek(season.id);
      await awardWeek(db!, { season: 2026, week: 5, at: AT });

      const [existing] = await db!
        .select()
        .from(weeklyRewards)
        .where(eq(weeklyRewards.reason, 'WEEKLY_HIGH_SCORE'));

      // Even with a fresh ledger row — so the ledger's key is not what stops it.
      const ledgerId = await applyTokenDelta(db!, {
        userId: seats[0]!.userId,
        seasonId: season.id,
        amount: 5,
        reason: 'COMMISSIONER_ADJUSTMENT',
        description: 'by hand',
        idempotencyKey: 'unrelated-key',
      });

      await expectPgError(
        db!.insert(weeklyRewards).values({
          seasonId: season.id,
          week: 5,
          seasonMembershipId: existing!.seasonMembershipId,
          reason: 'WEEKLY_HIGH_SCORE',
          amount: 400,
          rosterId: 1,
          pointsCents: 13000,
          gameKey: '2026-w05-m1',
          economyVersion: economy.version,
          tokenTransactionId: ledgerId,
          awardedAt: AT,
        }),
        { code: PG_ERROR.uniqueViolation, constraint: 'weekly_rewards_once_per_manager_per_reason' },
      );
    });

    it('is append-only', async () => {
      const { season } = await league();
      await ordinaryWeek(season.id);
      await closeWeek(season.id);
      await awardWeek(db!, { season: 2026, week: 5, at: AT });

      await expectPgError(
        db!.update(weeklyRewards).set({ amount: 1 }),
        { code: PG_ERROR.checkViolation },
      );
      await expectPgError(db!.delete(weeklyRewards), { code: PG_ERROR.checkViolation });
    });

    it('refuses a non-positive amount', async () => {
      const { season, seats, economy } = await league();
      const ledgerId = await applyTokenDelta(db!, {
        userId: seats[0]!.userId,
        seasonId: season.id,
        amount: 5,
        reason: 'COMMISSIONER_ADJUSTMENT',
        description: 'by hand',
        idempotencyKey: 'k',
      });

      await expectPgError(
        db!.insert(weeklyRewards).values({
          seasonId: season.id,
          week: 5,
          seasonMembershipId: seats[0]!.membershipId,
          reason: 'MATCHUP_WIN',
          amount: 0,
          rosterId: 1,
          pointsCents: 13000,
          gameKey: '2026-w05-m1',
          economyVersion: economy.version,
          tokenTransactionId: ledgerId,
          awardedAt: AT,
        }),
        { code: PG_ERROR.checkViolation, constraint: 'weekly_rewards_amount_positive' },
      );
    });
  });

  /* ---------------------------------------------------------------------
   * All or nothing
   * ------------------------------------------------------------------ */

  describe('a partial failure', () => {
    it('leaves no tokens moved and no rows behind', async () => {
      const { season, seats } = await league();
      await ordinaryWeek(season.id);
      await closeWeek(season.id);

      /*
       * Break the *last* write of the run, so the failure lands after several
       * awards have already been applied inside the transaction. If the rollback
       * were not real, roster 1 would keep 550 tokens from the earlier steps.
       *
       * A trigger is the only honest way to inject this: the failure has to come
       * from the database, mid-transaction, exactly as a constraint violation or
       * a lost connection would.
       */
      await db!.execute(sql`
        CREATE FUNCTION fail_third_reward() RETURNS trigger AS $$
        BEGIN
          IF (SELECT count(*) FROM weekly_rewards) >= 2 THEN
            RAISE EXCEPTION 'injected failure' USING ERRCODE = '23514';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER fail_third BEFORE INSERT ON weekly_rewards
          FOR EACH ROW EXECUTE FUNCTION fail_third_reward();
      `);

      await expect(awardWeek(db!, { season: 2026, week: 5, at: AT })).rejects.toThrow();

      await db!.execute(sql`DROP TRIGGER fail_third ON weekly_rewards`);
      await db!.execute(sql`DROP FUNCTION fail_third_reward()`);

      expect(await db!.select().from(weeklyRewards)).toHaveLength(0);
      for (const seat of seats) {
        expect(await balanceOf(seat.userId, season.id)).toBe(0);
      }
      const ledger = await db!
        .select()
        .from(tokenTransactions)
        .where(eq(tokenTransactions.seasonMembershipId, seats[0]!.membershipId));
      expect(ledger).toHaveLength(0);
    });

    it('can be retried cleanly after the failure is cleared', async () => {
      const { season, seats } = await league();
      await ordinaryWeek(season.id);
      await closeWeek(season.id);

      await db!.execute(sql`
        CREATE FUNCTION fail_all_rewards() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'injected failure' USING ERRCODE = '23514';
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER fail_all BEFORE INSERT ON weekly_rewards
          FOR EACH ROW EXECUTE FUNCTION fail_all_rewards();
      `);
      await expect(awardWeek(db!, { season: 2026, week: 5, at: AT })).rejects.toThrow();
      await db!.execute(sql`DROP TRIGGER fail_all ON weekly_rewards`);
      await db!.execute(sql`DROP FUNCTION fail_all_rewards()`);

      const report = await awardWeek(db!, { season: 2026, week: 5, at: AT });

      expect(report.paid).toHaveLength(3);
      expect(await balanceOf(seats[0]!.userId, season.id)).toBe(550);
    });
  });
});
