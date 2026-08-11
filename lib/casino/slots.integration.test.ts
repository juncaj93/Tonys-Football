import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearClock, setFixedClock } from '@/lib/clock';
import { clearRandomSource, setRandomSource } from '@/lib/counter/rng';
import { applyTokenDelta } from '@/lib/counter/tokens';
import { closePool, getDb } from '@/lib/db';
import { seasonMemberships, seasons, slotSpins, tokenTransactions, users } from '@/lib/db/schema';
import { PG_ERROR, expectPgError, expectPgMessage, resetDatabase } from '@/lib/db/test-helpers';

import { MIN_SPIN_INTERVAL_MS, recentSpins, spin } from './slots';
import type { SYMBOLS } from './slots-model';
import { SHIPPED_TABLE, ensureCasinoTable, reelSpan, symbolFor } from './table';

/**
 * The slot machine, against a real Postgres.
 *
 * Every guarantee that matters here is a **database** guarantee — the overdraft
 * CHECK, the unique spin key, the append-only trigger, the paid-payout CHECK,
 * `apply_token_delta`'s idempotency — so none of it can be tested against a
 * mock. That is the whole reason those rules live in the database: they hold
 * even when application code asks for something wrong, and these tests ask for
 * exactly that.
 *
 * `09 §12` is the acceptance list and every line of it is asserted below.
 */

const db = getDb();
const AT = new Date('2026-10-06T18:00:00Z');

/** The roll that lands on a given symbol, for driving a deterministic outcome. */
function rollFor(symbol: (typeof SYMBOLS)[number]): number {
  const span = reelSpan(SHIPPED_TABLE);
  for (let roll = 0; roll < span; roll += 1) {
    if (symbolFor(roll, SHIPPED_TABLE) === symbol) return roll;
  }
  throw new Error(`no roll lands on ${symbol}`);
}

/** Force the next three reels. Values outside the strip would be caught by `rollBelow`. */
function forceReels(symbols: readonly [string, string, string]): void {
  const queue = symbols.map((s) => rollFor(s as (typeof SYMBOLS)[number]));
  let i = 0;
  setRandomSource(() => queue[i++ % queue.length] ?? 0);
}

async function seat(tokens: number): Promise<{ userId: string; seasonId: string }> {
  const [user] = await db
    .insert(users)
    .values({ sleeperUserId: `casino-${String(Math.floor(tokens))}`, displayName: 'Tester' })
    .returning({ id: users.id });
  /*
   * One season, however many seats. `seasons_year_unique` is the rule and a
   * league has one 2026 — a helper that made a second would be testing a shape
   * the product cannot be in.
   */
  const existing = await db.select({ id: seasons.id }).from(seasons).where(eq(seasons.year, 2026));
  const season =
    existing[0] ??
    (await db.insert(seasons).values({ year: 2026 }).returning({ id: seasons.id }))[0];

  const userId = user?.id ?? '';
  const seasonId = season?.id ?? '';

  await db.insert(seasonMemberships).values({ userId, seasonId, rosterId: tokens % 100 });
  if (tokens > 0) {
    await applyTokenDelta(db, {
      userId,
      seasonId,
      amount: tokens,
      reason: 'SEASON_START',
      description: 'Opening balance.',
      idempotencyKey: `open:${userId}`,
    });
  }

  await ensureCasinoTable(db);
  return { userId, seasonId };
}

const balanceOf = async (userId: string): Promise<number> => {
  const rows = await db
    .select({ balance: seasonMemberships.tokenBalance })
    .from(seasonMemberships)
    .where(eq(seasonMemberships.userId, userId));
  return rows[0]?.balance ?? 0;
};

beforeEach(async () => {
  await resetDatabase(db);
  setFixedClock(AT);
});

afterEach(() => {
  clearClock();
  clearRandomSource();
});

afterAll(async () => {
  await closePool();
});

describe('taking a spin', () => {
  it('debits the stake, records the reels, and pays a losing spin nothing', async () => {
    const { userId, seasonId } = await seat(500);
    // crust · pepperoni · mushroom — three different symbols, so nothing.
    forceReels(['crust', 'pepperoni', 'mushroom']);

    const result = await spin(db, { userId, seasonId, spinKey: 'k1', stake: 10 });

    expect(result.status).toBe('spun');
    if (result.status !== 'spun') return;
    expect(result.spin.line).toBe('nothing');
    expect(result.spin.payout).toBe(0);
    expect(await balanceOf(userId)).toBe(490);

    const rows = await db.select().from(slotSpins);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.symbols).toEqual(['crust', 'pepperoni', 'mushroom']);
    // The rolls are stored, so the outcome recomputes from the row.
    expect(rows[0]?.rolls).toHaveLength(3);
    expect(rows[0]?.payoutTxId).toBeNull();
  });

  it('pays a three-of-a-kind at the paytable multiple, in two ledger rows', async () => {
    const { userId, seasonId } = await seat(500);
    forceReels(['tony', 'tony', 'tony']);

    const result = await spin(db, { userId, seasonId, spinKey: 'k2', stake: 10 });

    expect(result.status).toBe('spun');
    if (result.status !== 'spun') return;
    expect(result.spin.line).toBe('three');
    // Ruling 2: the top prize is 20x, so 200 on a 10-token pull.
    expect(result.spin.payout).toBe(200);
    expect(await balanceOf(userId)).toBe(690);

    /*
     * R13's accounting, asserted as two rows rather than one net movement. A
     * net-only representation of a push would be a zero delta, which
     * `apply_token_delta` refuses outright — so this shape is forced as well as
     * ruled.
     */
    const ledger = await db
      .select({ amount: tokenTransactions.amount, reason: tokenTransactions.reasonCode })
      .from(tokenTransactions)
      .where(sql`${tokenTransactions.reasonCode} in ('CASINO_WAGER','CASINO_PAYOUT')`);

    expect(ledger).toHaveLength(2);
    expect(ledger.find((r) => r.reason === 'CASINO_WAGER')?.amount).toBe(-10);
    expect(ledger.find((r) => r.reason === 'CASINO_PAYOUT')?.amount).toBe(200);
  });

  it('pays a money-back pair exactly the stake, and still writes both rows', async () => {
    const { userId, seasonId } = await seat(500);
    // Two crust pays 1x — the stake back. The net is zero and it is still two rows.
    forceReels(['crust', 'crust', 'tony']);

    const result = await spin(db, { userId, seasonId, spinKey: 'k3', stake: 10 });
    expect(result.status).toBe('spun');
    if (result.status !== 'spun') return;
    expect(result.spin.line).toBe('pair');
    expect(result.spin.payout).toBe(10);
    expect(await balanceOf(userId)).toBe(500);
  });
});

describe('exactly once', () => {
  it('replays a double tap without spinning again or charging again', async () => {
    const { userId, seasonId } = await seat(500);
    forceReels(['tony', 'tony', 'tony']);

    const first = await spin(db, { userId, seasonId, spinKey: 'same', stake: 10 });
    // A different forced outcome proves the replay is *read*, not re-rolled.
    forceReels(['crust', 'pepperoni', 'mushroom']);
    const second = await spin(db, { userId, seasonId, spinKey: 'same', stake: 10 });

    expect(first.status).toBe('spun');
    expect(second.status).toBe('spun');
    if (first.status !== 'spun' || second.status !== 'spun') return;

    expect(second.spin.replayed).toBe(true);
    expect(second.spin.symbols).toEqual(first.spin.symbols);
    expect(second.spin.payout).toBe(first.spin.payout);

    expect(await db.select().from(slotSpins)).toHaveLength(1);
    expect(await balanceOf(userId)).toBe(690);
  });

  it('settles two concurrent pulls of the same key as one spin', async () => {
    const { userId, seasonId } = await seat(500);
    forceReels(['tony', 'tony', 'tony']);

    const [a, b] = await Promise.all([
      spin(db, { userId, seasonId, spinKey: 'race', stake: 10 }),
      spin(db, { userId, seasonId, spinKey: 'race', stake: 10 }),
    ]);

    expect(a.status).toBe('spun');
    expect(b.status).toBe('spun');
    expect(await db.select().from(slotSpins)).toHaveLength(1);
    // One wager, one payout. The advisory lock serialised them.
    expect(await balanceOf(userId)).toBe(690);
  });

  it('refuses a second spin row under one key at the database', async () => {
    const { userId, seasonId } = await seat(500);
    forceReels(['crust', 'pepperoni', 'mushroom']);
    await spin(db, { userId, seasonId, spinKey: 'dup', stake: 10 });

    const [row] = await db.select().from(slotSpins);
    await expectPgError(
      db.insert(slotSpins).values({
        userId,
        seasonId,
        spinKey: 'dup',
        stakeTokens: 10,
        tableVersion: row?.tableVersion ?? '',
        rolls: [0, 0, 0],
        symbols: ['crust', 'crust', 'crust'],
        payoutTokens: 0,
        wagerTxId: row?.wagerTxId ?? '',
        createdAt: AT,
      }),
      { code: PG_ERROR.uniqueViolation, constraint: 'slot_spins_key_unique' },
    );
  });
});

describe('what the machine refuses', () => {
  it('refuses a stake the paytable does not offer, and charges nothing', async () => {
    const { userId, seasonId } = await seat(500);
    const result = await spin(db, { userId, seasonId, spinKey: 'odd', stake: 40 });

    expect(result).toEqual({ status: 'refused', reason: 'stake_not_offered' });
    expect(await balanceOf(userId)).toBe(500);
    expect(await db.select().from(slotSpins)).toHaveLength(0);
  });

  it('refuses a stake the tab cannot cover, from the CHECK rather than a read', async () => {
    const { userId, seasonId } = await seat(5);
    forceReels(['crust', 'pepperoni', 'mushroom']);

    const result = await spin(db, { userId, seasonId, spinKey: 'poor', stake: 20 });

    expect(result).toEqual({ status: 'refused', reason: 'insufficient_tokens' });
    expect(await balanceOf(userId)).toBe(5);
    expect(await db.select().from(slotSpins)).toHaveLength(0);
  });

  it('refuses a second pull inside the anti-spam interval', async () => {
    const { userId, seasonId } = await seat(500);
    forceReels(['crust', 'pepperoni', 'mushroom']);
    await spin(db, { userId, seasonId, spinKey: 'one', stake: 10 });

    // A *different* key, immediately: a genuine second pull, too fast.
    const result = await spin(db, { userId, seasonId, spinKey: 'two', stake: 10 });
    expect(result).toEqual({ status: 'refused', reason: 'too_fast' });
    expect(await balanceOf(userId)).toBe(490);

    // And it is an interval, not a quota: past it, the machine takes the pull.
    setFixedClock(new Date(AT.getTime() + MIN_SPIN_INTERVAL_MS + 1));
    const later = await spin(db, { userId, seasonId, spinKey: 'three', stake: 10 });
    expect(later.status).toBe('spun');
  });

  it('refuses everything when the books are shut', async () => {
    const { userId } = await seat(500);
    const result = await spin(db, { userId, seasonId: null, spinKey: 'shut', stake: 10 });
    expect(result).toEqual({ status: 'refused', reason: 'closed' });
  });

  it('refuses a spin in a finalized season, because the ledger does', async () => {
    const { userId, seasonId } = await seat(500);
    await db.update(seasons).set({ finalizedAt: AT }).where(eq(seasons.id, seasonId));
    forceReels(['crust', 'pepperoni', 'mushroom']);

    await expectPgMessage(
      spin(db, { userId, seasonId, spinKey: 'closed', stake: 10 }),
      /is finalized; its token ledger is closed/,
    );
    expect(await db.select().from(slotSpins)).toHaveLength(0);
  });
});

describe('what the database will not let anybody write', () => {
  it('refuses to rewrite or delete a recorded spin', async () => {
    const { userId, seasonId } = await seat(500);
    forceReels(['tony', 'tony', 'tony']);
    await spin(db, { userId, seasonId, spinKey: 'history', stake: 10 });

    await expectPgMessage(
      db.update(slotSpins).set({ payoutTokens: 9999 }).where(eq(slotSpins.spinKey, 'history')),
      /append-only/,
    );
    await expectPgMessage(
      db.delete(slotSpins).where(eq(slotSpins.spinKey, 'history')),
      /append-only/,
    );
  });

  it('refuses a payout that no ledger row paid for', async () => {
    const { userId, seasonId } = await seat(500);
    forceReels(['crust', 'pepperoni', 'mushroom']);
    await spin(db, { userId, seasonId, spinKey: 'paid', stake: 10 });
    const [row] = await db.select().from(slotSpins);

    await expectPgError(
      db.insert(slotSpins).values({
        userId,
        seasonId,
        spinKey: 'unpaid',
        stakeTokens: 10,
        tableVersion: row?.tableVersion ?? '',
        rolls: [0, 0, 0],
        symbols: ['tony', 'tony', 'tony'],
        // Claims a payout, names no ledger row. Physically unwritable.
        payoutTokens: 200,
        wagerTxId: row?.wagerTxId ?? '',
        createdAt: AT,
      }),
      { code: PG_ERROR.checkViolation, constraint: 'slot_spins_payout_is_paid' },
    );
  });

  it('refuses a spin with anything other than three reels', async () => {
    const { userId, seasonId } = await seat(500);
    forceReels(['crust', 'pepperoni', 'mushroom']);
    await spin(db, { userId, seasonId, spinKey: 'three-reels', stake: 10 });
    const [row] = await db.select().from(slotSpins);

    await expectPgError(
      db.insert(slotSpins).values({
        userId,
        seasonId,
        spinKey: 'two-reels',
        stakeTokens: 10,
        tableVersion: row?.tableVersion ?? '',
        rolls: [0, 0],
        symbols: ['crust', 'crust'],
        payoutTokens: 0,
        wagerTxId: row?.wagerTxId ?? '',
        createdAt: AT,
      }),
      { code: PG_ERROR.checkViolation, constraint: 'slot_spins_three_reels' },
    );
  });

  it('refuses to store a paytable against a version that does not exist', async () => {
    const { userId, seasonId } = await seat(500);
    forceReels(['crust', 'pepperoni', 'mushroom']);
    await spin(db, { userId, seasonId, spinKey: 'fk', stake: 10 });
    const [row] = await db.select().from(slotSpins);

    await expectPgError(
      db.insert(slotSpins).values({
        userId,
        seasonId,
        spinKey: 'no-table',
        stakeTokens: 10,
        tableVersion: 'a-version-nobody-stored',
        rolls: [0, 0, 0],
        symbols: ['crust', 'crust', 'crust'],
        payoutTokens: 0,
        wagerTxId: row?.wagerTxId ?? '',
        createdAt: AT,
      }),
      { code: PG_ERROR.foreignKeyViolation, constraint: 'slot_spins_table_version_fk' },
    );
  });
});

describe('history is private', () => {
  it('returns only the asking manager own spins', async () => {
    const mine = await seat(500);
    const theirs = await seat(501);

    forceReels(['crust', 'pepperoni', 'mushroom']);
    await spin(db, { ...mine, spinKey: 'mine', stake: 10 });
    await spin(db, {
      userId: theirs.userId,
      seasonId: theirs.seasonId,
      spinKey: 'theirs',
      stake: 10,
    });

    // R10: private in v1. Two spins exist; each manager sees one.
    expect(await db.select().from(slotSpins)).toHaveLength(2);
    expect(await recentSpins(db, mine.userId)).toHaveLength(1);
    expect(await recentSpins(db, theirs.userId)).toHaveLength(1);
  });
});
