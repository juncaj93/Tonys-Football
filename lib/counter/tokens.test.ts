import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearClock, setFixedClock } from '@/lib/clock';
import { closePool, getDb } from '@/lib/db';
import {
  economyConfigs,
  seasonMemberships,
  seasons,
  tokenTransactions,
  users,
} from '@/lib/db/schema';
import {
  PG_ERROR,
  expectPgError,
  expectPgMessage,
  resetDatabase,
} from '@/lib/db/test-helpers';

import { ensureRewardTable, purchaseBox } from './boxes';
import {
  PROVISIONAL_ECONOMY,
  applyTokenDelta,
  ensureEconomyConfig,
  openSeason,
  recentTransactions,
  wallet,
} from './tokens';

/**
 * The token ledger, against a real Postgres.
 *
 * Almost every guarantee here is a **database** guarantee — overdraft, the single
 * write path, append-only, idempotency, finalized seasons — so none of it can be
 * tested against a mock. That is the point of putting it in the database: the
 * rules hold even when application code asks for something wrong, and these tests
 * ask for exactly that.
 *
 * `16 §5.4` and the P3 release gate state the two acceptance conditions in so many
 * words: **overdraft impossible; a replayed key is a no-op.** Both are asserted
 * below, and so is the case neither mentions — a key *reused* for a different
 * delta, which must be an error rather than a silent no-op.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

describe.skipIf(!hasDatabase)('the token ledger', () => {
  beforeEach(async () => {
    await resetDatabase(db!);
    setFixedClock('2026-07-30T12:00:00Z');
  });

  afterEach(() => {
    clearClock();
  });

  afterAll(async () => {
    if (hasDatabase) await closePool();
  });

  /** A manager with a seat in an open season — the only shape that has a wallet. */
  async function seatedManager(displayName = 'Alex', year = 2026) {
    const [user] = await db!.insert(users).values({ displayName }).returning();
    const [season] = await db!.insert(seasons).values({ year }).returning();
    await db!
      .insert(seasonMemberships)
      .values({ seasonId: season!.id, userId: user!.id, rosterId: 1 });
    await ensureEconomyConfig(db!, season!.id);
    return { user: user!, season: season! };
  }

  async function balanceOf(userId: string, seasonId: string): Promise<number> {
    const held = await wallet(db!, { userId, seasonId });
    return held?.balance ?? -1;
  }

  describe('the balance follows the ledger', () => {
    it('starts at zero and moves only by transactions', async () => {
      const { user, season } = await seatedManager();
      expect(await balanceOf(user.id, season.id)).toBe(0);

      await applyTokenDelta(db!, {
        userId: user.id,
        seasonId: season.id,
        amount: 250,
        reason: 'SEASON_START',
        description: 'Tony opens a tab.',
        idempotencyKey: 'k1',
      });

      expect(await balanceOf(user.id, season.id)).toBe(250);
    });

    it('sums to the ledger after many movements', async () => {
      const { user, season } = await seatedManager();
      const deltas = [250, -50, -50, 30, -10];

      for (const [index, amount] of deltas.entries()) {
        await applyTokenDelta(db!, {
          userId: user.id,
          seasonId: season.id,
          amount,
          reason: amount > 0 ? 'SEASON_START' : 'BOX_PURCHASE',
          description: 'movement',
          idempotencyKey: `k${String(index)}`,
        });
      }

      const held = await wallet(db!, { userId: user.id, seasonId: season.id });
      const [summed] = await db!
        .select({ total: sql<number>`coalesce(sum(${tokenTransactions.amount}), 0)::int` })
        .from(tokenTransactions)
        .where(eq(tokenTransactions.seasonMembershipId, held!.membershipId));

      expect(held!.balance).toBe(deltas.reduce((a, b) => a + b, 0));
      expect(summed!.total).toBe(held!.balance);
    });
  });

  describe('overdraft is impossible', () => {
    it('refuses a spend larger than the balance', async () => {
      const { user, season } = await seatedManager();
      await applyTokenDelta(db!, {
        userId: user.id,
        seasonId: season.id,
        amount: 40,
        reason: 'SEASON_START',
        description: 'a small tab',
        idempotencyKey: 'top-up',
      });

      await expectPgError(
        applyTokenDelta(db!, {
          userId: user.id,
          seasonId: season.id,
          amount: -50,
          reason: 'BOX_PURCHASE',
          description: 'too much',
          idempotencyKey: 'overdraft',
        }),
        {
          code: PG_ERROR.checkViolation,
          constraint: 'season_memberships_token_balance_non_negative',
        },
      );

      // And the refused transaction left no trace, because the balance update and
      // the ledger insert are one statement's worth of work.
      expect(await balanceOf(user.id, season.id)).toBe(40);
      const rows = await db!.select().from(tokenTransactions);
      expect(rows).toHaveLength(1);
    });

    it('allows a spend down to exactly zero', async () => {
      // The boundary. An off-by-one in the CHECK would show up here and nowhere else.
      const { user, season } = await seatedManager();
      await applyTokenDelta(db!, {
        userId: user.id,
        seasonId: season.id,
        amount: 50,
        reason: 'SEASON_START',
        description: 'exactly enough',
        idempotencyKey: 'a',
      });
      await applyTokenDelta(db!, {
        userId: user.id,
        seasonId: season.id,
        amount: -50,
        reason: 'BOX_PURCHASE',
        description: 'all of it',
        idempotencyKey: 'b',
      });

      expect(await balanceOf(user.id, season.id)).toBe(0);
    });

    it('holds under concurrent spends: ten parallel buys of an eight-box balance', async () => {
      // The reason the check is in the database rather than in a service. A
      // read-then-check would let all ten through.
      const { user, season } = await seatedManager();
      await applyTokenDelta(db!, {
        userId: user.id,
        seasonId: season.id,
        amount: 8 * PROVISIONAL_ECONOMY.standardBoxPriceTokens,
        reason: 'SEASON_START',
        description: 'eight boxes worth',
        idempotencyKey: 'stake',
      });
      await ensureRewardTable(db!);

      const attempts = await Promise.allSettled(
        Array.from({ length: 10 }, (_, i) =>
          purchaseBox(db!, {
            userId: user.id,
            seasonId: season.id,
            idempotencyKey: `buy-${String(i)}`,
          }),
        ),
      );

      const bought = attempts.filter(
        (a) => a.status === 'fulfilled' && a.value.status === 'bought',
      ).length;
      const refused = attempts.filter(
        (a) => a.status === 'fulfilled' && a.value.status === 'insufficient_tokens',
      ).length;

      expect(bought).toBe(8);
      expect(refused).toBe(2);
      expect(await balanceOf(user.id, season.id)).toBe(0);
    });
  });

  describe('idempotency', () => {
    it('replays a key as a no-op and returns the same transaction', async () => {
      const { user, season } = await seatedManager();
      const delta = {
        userId: user.id,
        seasonId: season.id,
        amount: 250,
        reason: 'SEASON_START' as const,
        description: 'Tony opens a tab.',
        idempotencyKey: 'season-start:once',
      };

      const first = await applyTokenDelta(db!, delta);
      const second = await applyTokenDelta(db!, delta);

      expect(second).toBe(first);
      expect(await balanceOf(user.id, season.id)).toBe(250);
      expect(await db!.select().from(tokenTransactions)).toHaveLength(1);
    });

    it('raises when a key is reused for a different delta', async () => {
      // Silently returning the old row would tell the caller it moved tokens that
      // never moved. That is worse than an error.
      const { user, season } = await seatedManager();
      await applyTokenDelta(db!, {
        userId: user.id,
        seasonId: season.id,
        amount: 250,
        reason: 'SEASON_START',
        description: 'a tab',
        idempotencyKey: 'shared',
      });

      await expectPgMessage(
        applyTokenDelta(db!, {
          userId: user.id,
          seasonId: season.id,
          amount: -50,
          reason: 'BOX_PURCHASE',
          description: 'not the same thing at all',
          idempotencyKey: 'shared',
        }),
        /already records a different delta/,
      );
    });
  });

  describe('the balance has exactly one write path', () => {
    it('refuses a direct UPDATE of the balance column', async () => {
      // `16 §5.4`: no feature gets its own balance-writing path. Enforced here,
      // not by convention — this is the statement a well-meaning service or a
      // hand-run fix would issue.
      const { user, season } = await seatedManager();
      const held = await wallet(db!, { userId: user.id, seasonId: season.id });

      await expectPgError(
        db!
          .update(seasonMemberships)
          .set({ tokenBalance: 9999 })
          .where(eq(seasonMemberships.id, held!.membershipId)),
        { code: PG_ERROR.checkViolation },
      );

      expect(await balanceOf(user.id, season.id)).toBe(0);
    });

    it('still allows unrelated updates to the membership row', async () => {
      // The guard must be surgical. A blanket refusal would break the importer,
      // which updates records on every re-sync.
      const { user, season } = await seatedManager();
      const held = await wallet(db!, { userId: user.id, seasonId: season.id });

      await db!
        .update(seasonMemberships)
        .set({ wins: 7, teamName: 'The Regulars' })
        .where(eq(seasonMemberships.id, held!.membershipId));

      const [row] = await db!
        .select()
        .from(seasonMemberships)
        .where(eq(seasonMemberships.id, held!.membershipId));
      expect(row!.wins).toBe(7);
      expect(row!.tokenBalance).toBe(0);
    });
  });

  describe('what the ledger refuses outright', () => {
    it('will not record a zero-amount transaction', async () => {
      const { user, season } = await seatedManager();
      await expectPgMessage(
        applyTokenDelta(db!, {
          userId: user.id,
          seasonId: season.id,
          amount: 0,
          reason: 'COMMISSIONER_ADJUSTMENT',
          description: 'nothing',
          idempotencyKey: 'zero',
        }),
        /zero is not a transaction/,
      );
    });

    it('will not move tokens for a manager with no seat that season', async () => {
      const [outsider] = await db!.insert(users).values({ displayName: 'Outsider' }).returning();
      const { season } = await seatedManager('Alex');

      await expectPgMessage(
        applyTokenDelta(db!, {
          userId: outsider!.id,
          seasonId: season.id,
          amount: 10,
          reason: 'COMMISSIONER_ADJUSTMENT',
          description: 'no seat',
          idempotencyKey: 'nobody',
        }),
        /holds no seat/,
      );
    });

    it('will not move tokens in a finalized season', async () => {
      // `03 §6` closes the books at season end, and 2024/2025 are finalized in
      // every real environment — so this is reachable, not theoretical.
      const { user, season } = await seatedManager('Alex', 2025);
      await db!
        .update(seasons)
        .set({ finalizedAt: new Date('2026-01-15T00:00:00Z') })
        .where(eq(seasons.id, season.id));

      await expectPgMessage(
        applyTokenDelta(db!, {
          userId: user.id,
          seasonId: season.id,
          amount: 10,
          reason: 'COMMISSIONER_ADJUSTMENT',
          description: 'too late',
          idempotencyKey: 'closed',
        }),
        /finalized/,
      );
    });

    it('will not let a ledger row be edited or deleted', async () => {
      const { user, season } = await seatedManager();
      await applyTokenDelta(db!, {
        userId: user.id,
        seasonId: season.id,
        amount: 250,
        reason: 'SEASON_START',
        description: 'a tab',
        idempotencyKey: 'k',
      });

      await expectPgError(
        db!.update(tokenTransactions).set({ amount: 9999 }),
        { code: PG_ERROR.checkViolation },
      );
      await expectPgError(db!.delete(tokenTransactions), { code: PG_ERROR.checkViolation });
    });

    it('will not let a stored economy config be rewritten', async () => {
      const { season } = await seatedManager();
      await expectPgError(
        db!
          .update(economyConfigs)
          .set({ values: { standardBoxPriceTokens: 1, seasonStartTokens: 1 } })
          .where(eq(economyConfigs.seasonId, season.id)),
        { code: PG_ERROR.checkViolation },
      );
    });

    it('still allows a config to be signed off by clearing provisional', async () => {
      const { season } = await seatedManager();
      await db!
        .update(economyConfigs)
        .set({ provisional: false })
        .where(eq(economyConfigs.seasonId, season.id));

      const [row] = await db!
        .select()
        .from(economyConfigs)
        .where(eq(economyConfigs.seasonId, season.id));
      expect(row!.provisional).toBe(false);
    });
  });

  describe('buying a box', () => {
    beforeEach(async () => {
      await ensureRewardTable(db!);
    });

    it('debits the price and puts a box on the tray, in one transaction', async () => {
      const { user, season } = await seatedManager();
      await applyTokenDelta(db!, {
        userId: user.id,
        seasonId: season.id,
        amount: 250,
        reason: 'SEASON_START',
        description: 'a tab',
        idempotencyKey: 'tab',
      });

      const result = await purchaseBox(db!, {
        userId: user.id,
        seasonId: season.id,
        idempotencyKey: 'buy-1',
      });

      expect(result.status).toBe('bought');
      expect(await balanceOf(user.id, season.id)).toBe(
        250 - PROVISIONAL_ECONOMY.standardBoxPriceTokens,
      );
    });

    it('is idempotent: a double-tapped Buy spends once and yields one box', async () => {
      const { user, season } = await seatedManager();
      await applyTokenDelta(db!, {
        userId: user.id,
        seasonId: season.id,
        amount: 250,
        reason: 'SEASON_START',
        description: 'a tab',
        idempotencyKey: 'tab',
      });

      const first = await purchaseBox(db!, {
        userId: user.id,
        seasonId: season.id,
        idempotencyKey: 'same-tap',
      });
      const second = await purchaseBox(db!, {
        userId: user.id,
        seasonId: season.id,
        idempotencyKey: 'same-tap',
      });

      expect(first.status).toBe('bought');
      expect(second.status).toBe('bought');
      if (first.status !== 'bought' || second.status !== 'bought') return;

      expect(second.boxId).toBe(first.boxId);
      expect(await balanceOf(user.id, season.id)).toBe(
        250 - PROVISIONAL_ECONOMY.standardBoxPriceTokens,
      );
    });

    it('creates no box when the manager cannot afford one', async () => {
      // The whole reason the debit goes first: if the money fails, the box is
      // never created, so there is no state where somebody holds an unpaid box.
      const { user, season } = await seatedManager();

      const result = await purchaseBox(db!, {
        userId: user.id,
        seasonId: season.id,
        idempotencyKey: 'broke',
      });

      expect(result.status).toBe('insufficient_tokens');
      expect(await balanceOf(user.id, season.id)).toBe(0);
      const rows = await db!.select().from(tokenTransactions);
      expect(rows).toHaveLength(0);
    });
  });

  describe('reads the surfaces depend on', () => {
    it('returns null for a manager with no seat, rather than a zero', async () => {
      const [outsider] = await db!.insert(users).values({ displayName: 'Outsider' }).returning();
      const { season } = await seatedManager('Alex');
      expect(await wallet(db!, { userId: outsider!.id, seasonId: season.id })).toBeNull();
    });

    it('lists recent movements newest first', async () => {
      const { user, season } = await seatedManager();
      setFixedClock('2026-07-01T00:00:00Z');
      await applyTokenDelta(db!, {
        userId: user.id,
        seasonId: season.id,
        amount: 250,
        reason: 'SEASON_START',
        description: 'Tony opens a tab.',
        idempotencyKey: 'one',
      });
      setFixedClock('2026-07-20T00:00:00Z');
      await applyTokenDelta(db!, {
        userId: user.id,
        seasonId: season.id,
        amount: -50,
        reason: 'BOX_PURCHASE',
        description: 'One standard pizza box.',
        idempotencyKey: 'two',
      });

      const held = await wallet(db!, { userId: user.id, seasonId: season.id });
      const rows = await recentTransactions(db!, held!.membershipId);

      expect(rows.map((r) => r.amount)).toEqual([-50, 250]);
      expect(rows[0]!.description).toBe('One standard pizza box.');
    });

    it('picks the newest unfinalized season as the open one', async () => {
      const [a] = await db!.insert(seasons).values({ year: 2024 }).returning();
      await db!.insert(seasons).values({ year: 2025 });
      await db!.insert(seasons).values({ year: 2026 });
      await db!
        .update(seasons)
        .set({ finalizedAt: new Date('2025-01-01T00:00:00Z') })
        .where(eq(seasons.id, a!.id));

      expect(await openSeason(db!)).toMatchObject({ year: 2026 });
    });

    it('ignores a finalized newest season', async () => {
      const [only] = await db!.insert(seasons).values({ year: 2026 }).returning();
      await db!
        .update(seasons)
        .set({ finalizedAt: new Date('2027-01-01T00:00:00Z') })
        .where(eq(seasons.id, only!.id));

      expect(await openSeason(db!)).toBeNull();
    });
  });

  describe('economy configuration', () => {
    it('stores one row per version however often it is ensured', async () => {
      const { season } = await seatedManager();
      await ensureEconomyConfig(db!, season.id);
      await ensureEconomyConfig(db!, season.id);

      const rows = await db!
        .select()
        .from(economyConfigs)
        .where(eq(economyConfigs.seasonId, season.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.provisional).toBe(true);
      expect(rows[0]!.values).toEqual(PROVISIONAL_ECONOMY);
    });
  });
});
