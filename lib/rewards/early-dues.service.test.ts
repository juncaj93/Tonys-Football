import { and, eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearClock, setFixedClock } from '@/lib/clock';
import { PROVISIONAL_ECONOMY, applyTokenDelta, ensureEconomyConfig, wallet } from '@/lib/counter/tokens';
import { closePool, getDb } from '@/lib/db';
import {
  fantasyMatchups,
  seasonMemberships,
  seasons,
  tokenTransactions,
  users,
  weekFinalizations,
} from '@/lib/db/schema';
import { PG_ERROR, expectPgError, resetDatabase } from '@/lib/db/test-helpers';

import { earlyDuesIdempotencyKey } from './early-dues';
import { firstLoginReceipt } from './receipt';
import { awardEarlyDues, awardWeek } from './service';

/**
 * The early-dues thank-you and the receipt it feeds, against a real Postgres.
 *
 * The guarantees this rests on are database guarantees — one payment per manager
 * per season whatever asks, a closed season that cannot pay, a replay that moves
 * nothing, two concurrent runs that between them pay once. A mock cannot show any
 * of them, because in every case what is being tested is what the database does
 * when application code asks for something wrong.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

const AT = new Date('2026-10-06T12:00:00Z');

/** Twice the box price in force. Derived here too, so the test moves with it. */
const THANK_YOU = PROVISIONAL_ECONOMY.standardBoxPriceTokens * 2;

describe.skipIf(!hasDatabase)('the early-dues thank-you', () => {
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
   * A season seated by Sleeper handle.
   *
   * Handles rather than roster numbers, because the handle *is* the eligibility
   * rule here and a fixture that hid it behind an index would be testing
   * something else. `null` is a manager who has never claimed a Sleeper account,
   * which is a real row in this schema.
   */
  async function league(
    year: number,
    handles: readonly (string | null)[],
    options: { readonly inactive?: readonly string[] } = {},
  ) {
    const [season] = await db!.insert(seasons).values({ year }).returning();
    const seats: { userId: string; membershipId: string; handle: string | null; rosterId: number }[] = [];

    for (const [index, handle] of handles.entries()) {
      const rosterId = index + 1;
      const [user] = await db!
        .insert(users)
        .values({
          displayName: handle ?? `Unclaimed ${String(rosterId)}`,
          sleeperUsername: handle,
        })
        .returning();
      const [membership] = await db!
        .insert(seasonMemberships)
        .values({
          seasonId: season!.id,
          userId: user!.id,
          rosterId,
          isActive: !(options.inactive ?? []).includes(handle ?? ''),
        })
        .returning();
      seats.push({ userId: user!.id, membershipId: membership!.id, handle, rosterId });
    }

    const economy = await ensureEconomyConfig(db!, season!.id);
    return { season: season!, seats, economy };
  }

  function seat(
    seats: readonly { userId: string; membershipId: string; handle: string | null }[],
    handle: string,
  ) {
    const found = seats.find((row) => row.handle === handle);
    expect(found, `no seat for ${handle}`).toBeDefined();
    return found!;
  }

  async function balanceOf(userId: string, seasonId: string): Promise<number> {
    return (await wallet(db!, { userId, seasonId }))?.balance ?? -1;
  }

  /* ---------------------------------------------------------------------
   * The happy path
   * ------------------------------------------------------------------ */

  describe('an open 2026 season', () => {
    it('pays the two named managers twice the box price, and nobody else', async () => {
      const { season, seats } = await league(2026, [
        'BigJuncer',
        'NateyDee',
        'jfletcher433',
        'MattyB2317',
      ]);

      const report = await awardEarlyDues(db!, { seasonYear: 2026 });

      expect(report.refusal).toBeNull();
      expect(report.amount).toBe(THANK_YOU);
      expect([...report.paid].sort()).toEqual(['MattyB2317', 'NateyDee']);
      expect(report.tokens).toBe(THANK_YOU * 2);

      expect(await balanceOf(seat(seats, 'NateyDee').userId, season.id)).toBe(THANK_YOU);
      expect(await balanceOf(seat(seats, 'MattyB2317').userId, season.id)).toBe(THANK_YOU);
      expect(await balanceOf(seat(seats, 'BigJuncer').userId, season.id)).toBe(0);
      expect(await balanceOf(seat(seats, 'jfletcher433').userId, season.id)).toBe(0);
    });

    it('files it under its own reason, never as a commissioner adjustment', async () => {
      await league(2026, ['NateyDee']);
      await awardEarlyDues(db!, { seasonYear: 2026 });

      const [row] = await db!.select().from(tokenTransactions);
      expect(row!.reasonCode).toBe('EARLY_DUES_BONUS');
      expect(row!.actorUserId).toBeNull();
      expect(row!.description).toContain('dues in early');
      expect(row!.description).not.toContain('EARLY_DUES_BONUS');
    });

    it('records the economy version the amount was derived from', async () => {
      const { economy } = await league(2026, ['NateyDee']);
      const report = await awardEarlyDues(db!, { seasonYear: 2026 });

      expect(report.economyVersion).toBe(economy.version);
      const [row] = await db!.select().from(tokenTransactions);
      // The one fact the ledger cannot otherwise carry, so `0022` puts it here
      // rather than adding a table to hold it.
      expect(row!.sourceRef).toBe(`economy:${economy.version}`);
    });

    it('matches the handle case-insensitively, as Sleeper does', async () => {
      const { season, seats } = await league(2026, ['nateydee', 'MATTYB2317']);
      const report = await awardEarlyDues(db!, { seasonYear: 2026 });

      expect(report.paid).toHaveLength(2);
      expect(await balanceOf(seats[0]!.userId, season.id)).toBe(THANK_YOU);
      expect(await balanceOf(seats[1]!.userId, season.id)).toBe(THANK_YOU);
    });

    it('keeps the balance equal to the sum of the ledger', async () => {
      const { season, seats } = await league(2026, ['NateyDee']);
      await awardEarlyDues(db!, { seasonYear: 2026 });

      const [summed] = await db!
        .select({ total: sql<number>`coalesce(sum(${tokenTransactions.amount}), 0)::int` })
        .from(tokenTransactions)
        .where(eq(tokenTransactions.seasonMembershipId, seats[0]!.membershipId));

      expect(summed!.total).toBe(await balanceOf(seats[0]!.userId, season.id));
    });
  });

  /* ---------------------------------------------------------------------
   * Idempotency — the guarantee the whole slice rests on
   * ------------------------------------------------------------------ */

  describe('running it more than once', () => {
    it('is a no-op the second time', async () => {
      const { season, seats } = await league(2026, ['NateyDee', 'MattyB2317']);

      const first = await awardEarlyDues(db!, { seasonYear: 2026 });
      const second = await awardEarlyDues(db!, { seasonYear: 2026 });

      expect(first.paid).toHaveLength(2);
      expect(second.paid).toEqual([]);
      expect([...second.alreadyPaid].sort()).toEqual(['MattyB2317', 'NateyDee']);
      expect(second.tokens).toBe(0);
      expect(await balanceOf(seats[0]!.userId, season.id)).toBe(THANK_YOU);
      expect(await db!.select().from(tokenTransactions)).toHaveLength(2);
    });

    it('is a no-op ten times over', async () => {
      const { season, seats } = await league(2026, ['NateyDee']);

      for (let run = 0; run < 10; run++) {
        await awardEarlyDues(db!, { seasonYear: 2026 });
      }

      expect(await balanceOf(seats[0]!.userId, season.id)).toBe(THANK_YOU);
      expect(await db!.select().from(tokenTransactions)).toHaveLength(1);
    });

    it('pays once when two runs race', async () => {
      const { season, seats } = await league(2026, ['NateyDee', 'MattyB2317']);

      /*
       * The case an application-level "have we paid yet" check gets wrong: both
       * reads say no, both proceed, and only `idempotency_key UNIQUE` is in a
       * position to arbitrate. The report may over-count by one here — it is a
       * log line, and the money below is the guarantee.
       */
      await Promise.all([
        awardEarlyDues(db!, { seasonYear: 2026 }),
        awardEarlyDues(db!, { seasonYear: 2026 }),
      ]);

      expect(await db!.select().from(tokenTransactions)).toHaveLength(2);
      expect(await balanceOf(seats[0]!.userId, season.id)).toBe(THANK_YOU);
      expect(await balanceOf(seats[1]!.userId, season.id)).toBe(THANK_YOU);
    });

    it('refuses to re-price a thank-you that has already been paid', async () => {
      const { season, seats } = await league(2026, ['NateyDee']);
      await awardEarlyDues(db!, { seasonYear: 2026 });

      // The rebalance case. The key omits the amount precisely so this raises
      // rather than paying a second time at a second price.
      await expectPgError(
        applyTokenDelta(db!, {
          userId: seats[0]!.userId,
          seasonId: season.id,
          amount: 999,
          reason: 'EARLY_DUES_BONUS',
          description: 'Thanks for getting your 2026 dues in early. Two boxes on the house.',
          idempotencyKey: earlyDuesIdempotencyKey({
            seasonId: season.id,
            userId: seats[0]!.userId,
          }),
        }),
        { code: PG_ERROR.uniqueViolation },
      );

      expect(await balanceOf(seats[0]!.userId, season.id)).toBe(THANK_YOU);
    });
  });

  /* ---------------------------------------------------------------------
   * Refusals — every one an expected state, not a failure
   * ------------------------------------------------------------------ */

  describe('when a season cannot pay', () => {
    it('declines a season that was never imported', async () => {
      const report = await awardEarlyDues(db!, { seasonYear: 2026 });
      expect(report.refusal).toBe('no-season');
      expect(report.tokens).toBe(0);
    });

    it('declines a season nobody is on the roster for, without touching it', async () => {
      const { season, seats } = await league(2030, ['NateyDee', 'MattyB2317']);
      const named = seat(seats, 'NateyDee');

      const report = await awardEarlyDues(db!, { seasonYear: 2030 });

      // The designed resting state of every season but 2026: a thank-you nobody
      // is owed is not a thank-you that failed.
      expect(report.refusal).toBe('nobody-owed');
      expect(report.seasonId).toBe(season.id);
      expect(await balanceOf(named.userId, season.id)).toBe(0);
      expect(await db!.select().from(tokenTransactions)).toHaveLength(0);
    });

    it('declines a finalized season rather than raising from the ledger', async () => {
      const { season } = await league(2026, ['NateyDee']);
      await db!
        .update(seasons)
        .set({ finalizedAt: AT })
        .where(eq(seasons.id, season.id));

      /*
       * `apply_token_delta` refuses a closed season outright, so an ungated
       * caller turns a season whose books are shut into a thrown exception. The
       * gate tests `seasons.finalized_at` — the same condition the ledger tests,
       * never a proxy for it.
       */
      const report = await awardEarlyDues(db!, { seasonYear: 2026 });
      expect(report.refusal).toBe('season-closed');
      expect(await db!.select().from(tokenTransactions)).toHaveLength(0);
    });

    it('declines when the named managers hold no seat this season', async () => {
      await league(2026, ['BigJuncer', 'jfletcher433']);
      const report = await awardEarlyDues(db!, { seasonYear: 2026 });

      expect(report.refusal).toBe('no-eligible-seat');
      expect(await db!.select().from(tokenTransactions)).toHaveLength(0);
    });

    it('skips a named manager whose seat is inactive, and pays the other', async () => {
      const { season, seats } = await league(
        2026,
        ['NateyDee', 'MattyB2317'],
        { inactive: ['NateyDee'] },
      );

      const report = await awardEarlyDues(db!, { seasonYear: 2026 });

      // `is_active` is how the league retires somebody — the same filter
      // `grantSeasonalBoxes` uses, and the only opinion about who is playing.
      expect(report.paid).toEqual(['MattyB2317']);
      expect(await balanceOf(seat(seats, 'NateyDee').userId, season.id)).toBe(0);
      expect(await balanceOf(seat(seats, 'MattyB2317').userId, season.id)).toBe(THANK_YOU);
    });

    it('never pays an unclaimed account, whatever it is called', async () => {
      // `sleeper_username` is null until a manager claims. The display name is a
      // league decision and is deliberately not what this matches on.
      const { season, seats } = await league(2026, [null]);
      await db!
        .update(users)
        .set({ displayName: 'NateyDee' })
        .where(eq(users.id, seats[0]!.userId));

      const report = await awardEarlyDues(db!, { seasonYear: 2026 });
      expect(report.refusal).toBe('no-eligible-seat');
      expect(await balanceOf(seats[0]!.userId, season.id)).toBe(0);
    });

    it('throws rather than guessing when a season has no economy config', async () => {
      const [season] = await db!.insert(seasons).values({ year: 2026 }).returning();
      const [user] = await db!
        .insert(users)
        .values({ displayName: 'Nathan', sleeperUsername: 'NateyDee' })
        .returning();
      await db!
        .insert(seasonMemberships)
        .values({ seasonId: season!.id, userId: user!.id, rosterId: 1 });

      await expect(awardEarlyDues(db!, { seasonYear: 2026 })).rejects.toThrow(
        /no stored economy config/,
      );
      expect(await db!.select().from(tokenTransactions)).toHaveLength(0);
    });
  });

  /* ---------------------------------------------------------------------
   * The seasons are separate facts
   * ------------------------------------------------------------------ */

  describe('across seasons', () => {
    it('pays 2026 and leaves 2027 alone, because dues are paid per season', async () => {
      const { season: y26, seats: s26 } = await league(2026, ['NateyDee']);
      const { season: y27, seats: s27 } = await league(2027, ['NateyDee']);

      const paid = await awardEarlyDues(db!, { seasonYear: 2026 });
      const skipped = await awardEarlyDues(db!, { seasonYear: 2027 });

      expect(paid.paid).toEqual(['NateyDee']);
      expect(skipped.refusal).toBe('nobody-owed');
      expect(await balanceOf(s26[0]!.userId, y26.id)).toBe(THANK_YOU);
      expect(await balanceOf(s27[0]!.userId, y27.id)).toBe(0);
    });
  });

  /* ---------------------------------------------------------------------
   * The receipt — a read model, and nothing else
   * ------------------------------------------------------------------ */

  describe('the first-login receipt', () => {
    /** Two games in a closed week, roster 1 posting the league's best score. */
    async function playedWeek(seasonId: string, week = 5) {
      await db!.insert(fantasyMatchups).values([
        {
          seasonId,
          week,
          weekType: 'regular',
          sleeperMatchupId: 1,
          rosterAId: 1,
          rosterBId: 2,
          pointsACents: 13000,
          pointsBCents: 9000,
          winnerRosterId: 1,
          marginCents: 4000,
        },
        {
          seasonId,
          week,
          weekType: 'regular',
          sleeperMatchupId: 2,
          rosterAId: 3,
          rosterBId: 4,
          pointsACents: 11000,
          pointsBCents: 10000,
          winnerRosterId: 3,
          marginCents: 1000,
        },
      ]);
      await db!
        .insert(weekFinalizations)
        .values({ seasonId, week, games: 2, finalizedAt: AT })
        .onConflictDoNothing();
    }

    it('carries both reward families with the week attached to the weekly ones', async () => {
      const { season, seats } = await league(2026, [
        'NateyDee',
        'BigJuncer',
        'MattyB2317',
        'jfletcher433',
      ]);
      await playedWeek(season.id);
      await awardEarlyDues(db!, { seasonYear: 2026 });
      await awardWeek(db!, { season: 2026, week: 5, at: AT });

      const receipt = await firstLoginReceipt(db!, {
        userId: seat(seats, 'NateyDee').userId,
        seasonYear: 2026,
      });

      expect(receipt).not.toBeNull();
      expect(new Set(receipt!.lines.map((line) => line.reason))).toEqual(
        new Set(['EARLY_DUES_BONUS', 'MATCHUP_WIN', 'WEEKLY_HIGH_SCORE']),
      );

      const high = receipt!.lines.find((line) => line.reason === 'WEEKLY_HIGH_SCORE');
      expect(high!.week).toBe(5);
      expect(high!.pointsCents).toBe(13000);
      expect(high!.amount).toBe(PROVISIONAL_ECONOMY.weeklyHighScoreTokens);

      const thanks = receipt!.lines.find((line) => line.reason === 'EARLY_DUES_BONUS');
      // The gift belongs to no week, and says so rather than inventing one.
      expect(thanks!.week).toBeNull();
      expect(thanks!.pointsCents).toBeNull();
      expect(thanks!.amount).toBe(THANK_YOU);
    });

    it('reads the balance and never re-sums it from the lines', async () => {
      const { season, seats } = await league(2026, ['NateyDee', 'BigJuncer', 'x', 'y']);
      await playedWeek(season.id);
      await awardEarlyDues(db!, { seasonYear: 2026 });
      await awardWeek(db!, { season: 2026, week: 5, at: AT });

      // A spend the receipt does not show, so `credited` and `balance` disagree
      // on purpose: one is what arrived, the other is what is there.
      await applyTokenDelta(db!, {
        userId: seat(seats, 'NateyDee').userId,
        seasonId: season.id,
        amount: -PROVISIONAL_ECONOMY.standardBoxPriceTokens,
        reason: 'BOX_PURCHASE',
        description: 'One pizza box.',
        idempotencyKey: 'test-box-purchase',
      });

      const receipt = await firstLoginReceipt(db!, {
        userId: seat(seats, 'NateyDee').userId,
        seasonYear: 2026,
      });

      const expected =
        THANK_YOU +
        PROVISIONAL_ECONOMY.matchupWinTokens +
        PROVISIONAL_ECONOMY.weeklyHighScoreTokens;

      expect(receipt!.credited).toBe(expected);
      expect(receipt!.balance).toBe(
        expected - PROVISIONAL_ECONOMY.standardBoxPriceTokens,
      );
      expect(receipt!.lines.some((line) => line.amount < 0)).toBe(false);
    });

    it('shows nothing a manager did themselves', async () => {
      const { season, seats } = await league(2026, ['BigJuncer']);
      await applyTokenDelta(db!, {
        userId: seats[0]!.userId,
        seasonId: season.id,
        amount: PROVISIONAL_ECONOMY.seasonStartTokens,
        reason: 'SEASON_START',
        description: 'Opening balance.',
        idempotencyKey: 'test-season-start',
      });
      await applyTokenDelta(db!, {
        userId: seats[0]!.userId,
        seasonId: season.id,
        amount: -10,
        reason: 'STAKE_PLACED',
        description: 'A pick on the line.',
        idempotencyKey: 'test-stake',
      });

      const receipt = await firstLoginReceipt(db!, {
        userId: seats[0]!.userId,
        seasonYear: 2026,
      });

      // Both are deliberate absences documented in `receipt.ts`, not omissions.
      expect(receipt!.lines).toEqual([]);
      expect(receipt!.credited).toBe(0);
      expect(receipt!.balance).toBe(PROVISIONAL_ECONOMY.seasonStartTokens - 10);
    });

    it('narrows to what is new when a caller supplies a cutoff', async () => {
      const { season, seats } = await league(2026, ['NateyDee', 'a', 'b', 'c']);
      await awardEarlyDues(db!, { seasonYear: 2026 });

      setFixedClock('2026-10-13T12:00:00Z');
      await playedWeek(season.id, 6);
      await awardWeek(db!, { season: 2026, week: 6, at: AT });

      const all = await firstLoginReceipt(db!, {
        userId: seat(seats, 'NateyDee').userId,
        seasonYear: 2026,
      });
      const since = await firstLoginReceipt(db!, {
        userId: seat(seats, 'NateyDee').userId,
        seasonYear: 2026,
        since: new Date('2026-10-10T00:00:00Z'),
      });

      expect(all!.lines).toHaveLength(3);
      expect(since!.lines).toHaveLength(2);
      expect(since!.lines.every((line) => line.reason !== 'EARLY_DUES_BONUS')).toBe(true);
      // Newest first: a receipt leads with what just happened.
      expect(since!.lines[0]!.at.getTime()).toBeGreaterThanOrEqual(
        since!.lines[1]!.at.getTime(),
      );
    });

    it('returns null for a manager with no seat that season, rather than an empty one', async () => {
      const { seats } = await league(2026, ['NateyDee']);
      const receipt = await firstLoginReceipt(db!, {
        userId: seats[0]!.userId,
        seasonYear: 2025,
      });

      // "No seat" and "a quiet season" are different answers, exactly as
      // `wallet` keeps them different.
      expect(receipt).toBeNull();
    });

    it('writes nothing', async () => {
      const { season, seats } = await league(2026, ['NateyDee', 'a', 'b', 'c']);
      await playedWeek(season.id);
      await awardEarlyDues(db!, { seasonYear: 2026 });
      await awardWeek(db!, { season: 2026, week: 5, at: AT });

      const before = await db!.select().from(tokenTransactions);
      await firstLoginReceipt(db!, {
        userId: seat(seats, 'NateyDee').userId,
        seasonYear: 2026,
      });
      await firstLoginReceipt(db!, {
        userId: seat(seats, 'NateyDee').userId,
        seasonYear: 2026,
      });
      const after = await db!.select().from(tokenTransactions);

      expect(after).toHaveLength(before.length);
      expect(
        await db!
          .select()
          .from(seasonMemberships)
          .where(
            and(
              eq(seasonMemberships.seasonId, season.id),
              eq(seasonMemberships.userId, seat(seats, 'NateyDee').userId),
            ),
          ),
      ).toHaveLength(1);
    });
  });
});
