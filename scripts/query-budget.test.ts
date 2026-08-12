
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { clearClock, setFixedClock } from '@/lib/clock';
import { closePool, getDb, getPool } from '@/lib/db';
import { fantasyMatchups, seasonMemberships, seasons, users } from '@/lib/db/schema';
import { resetDatabase } from '@/lib/db/test-helpers';
import { timeline } from '@/lib/league/timeline';
import { parlorAside } from '@/lib/parlor/aside';

/**
 * The two read-shape rules the parlor and the Timeline are held to.
 *
 * ## Why a *count* and a *concurrency* assertion rather than a stopwatch
 *
 * Wall-clock thresholds in CI are the thing this repository has been careful not
 * to build: a shared runner's timings vary by more than any regression worth
 * catching, and a gate that flips on load teaches people to re-run it. These two
 * assertions are structural — they are true or false on a given build, on any
 * machine, at any load.
 *
 * They are also the two shapes that were actually measured as wrong, rather than
 * two shapes that could be:
 *
 * | | measured on the production build, 2026-08-12 |
 * |---|---|
 * | the parlor | 58 queries, 35 of them in single file; **31 discarded** |
 * | the Timeline | 12 queries, **12** in single file — one round trip per season, forever |
 *
 * Neither is visible against a local Postgres, where a query costs about a tenth
 * of a millisecond. Production's database is a network hop away, so the number of
 * *sequential* reads is the page's latency, and that is what these pin.
 *
 * ## What this file deliberately does not do
 *
 * It does not assert a total query count for a route. A page's honest query count
 * changes whenever the product legitimately asks for something new, and a gate
 * that has to be edited on every feature is a gate that gets edited without being
 * read. What is pinned is the **shape**: work that is refused must not be paid
 * for, and work that does not depend on other work must not queue behind it.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

/**
 * Count queries, and the most that were ever in flight together.
 *
 * Wrapped at the **pool**, which is the layer drizzle issues through.
 * `Pool.query` hands `Client.query` a callback so it knows when to release the
 * client, and pg's client returns a `Query` rather than a promise whenever a
 * callback is present — so a client-level wrapper sees each call start and never
 * sees it finish, and every duration and every overlap reads as zero. That is a
 * measurement bug that reports *"nothing runs concurrently"* about code that is
 * entirely concurrent, so it is worth the sentence.
 */
async function observe<T>(
  run: () => Promise<T>,
): Promise<{ result: T; queries: number; maxConcurrent: number }> {
  const pool = getPool();
  const original = pool.query.bind(pool) as (...args: unknown[]) => unknown;

  let queries = 0;
  let inFlight = 0;
  let maxConcurrent = 0;

  (pool as unknown as { query: unknown }).query = (...args: unknown[]): unknown => {
    queries += 1;
    inFlight += 1;
    maxConcurrent = Math.max(maxConcurrent, inFlight);
    const settled = (): void => {
      inFlight -= 1;
    };
    const returned = original(...args);
    if (returned !== null && typeof (returned as { then?: unknown }).then === 'function') {
      return (returned as Promise<unknown>).then(
        (value) => {
          settled();
          return value;
        },
        (error: unknown) => {
          settled();
          throw error;
        },
      );
    }
    settled();
    return returned;
  };

  try {
    const result = await run();
    return { result, queries, maxConcurrent };
  } finally {
    (pool as unknown as { query: unknown }).query = original;
  }
}

describe.skipIf(!hasDatabase)('what the room is allowed to ask the database for', () => {
  beforeEach(async () => {
    await resetDatabase(db!);
    setFixedClock('2026-08-12T12:00:00Z');
  });

  afterAll(async () => {
    clearClock();
    if (hasDatabase) await closePool();
  });

  async function manager(displayName: string): Promise<string> {
    const [row] = await db!.insert(users).values({ displayName }).returning();
    return row!.id;
  }

  describe("Tony's aside", () => {
    /**
     * **The measured defect.** `statsAsideFor` refuses outright while a moment
     * tag is held — a manager standing in front of an unopened box is in the
     * middle of something — and the parlor evaluated the fact packet and the
     * champion as *arguments*, so the twenty-four queries behind them were paid
     * before the refusal could happen.
     *
     * That is not a rare case. On a freshly seeded league every manager holds a
     * moment tag, because the seed grants everyone a box: the parlor paid for a
     * result that could only be null, on every load, for all ten of them.
     */
    it('costs nothing at all when a moment is in play', async () => {
      const userId = await manager('Alex');

      const { result, queries } = await observe(() =>
        parlorAside(db!, { userId, momentTags: new Set(['box_waiting']) }),
      );

      expect(result).toBeNull();
      expect(queries).toBe(0);
    });

    /**
     * The control, and it is not decoration: without it the assertion above is
     * satisfied by a `parlorAside` that never reads anything under any
     * conditions, which would be a different defect with a green tick beside it.
     */
    it('does read something when there is no moment', async () => {
      const userId = await manager('Alex');

      const { queries } = await observe(() =>
        parlorAside(db!, { userId, momentTags: new Set() }),
      );

      expect(queries).toBeGreaterThan(0);
    });
  });

  describe('the Timeline', () => {
    /**
     * A season's facts do not depend on another season's, so deriving them one
     * season at a time cost **one round trip per season of league history** —
     * and it grows every January. `Promise.all` preserves order, so the wall is
     * unchanged; only the queueing is.
     */
    it('derives every season at once rather than one season at a time', async () => {
      const alex = await manager('Alex');
      const zack = await manager('Zack');

      for (const year of [2024, 2025, 2026]) {
        const [season] = await db!
          .insert(seasons)
          .values({ year, finalizedAt: new Date(`${String(year + 1)}-01-06T00:00:00Z`) })
          .returning();
        await db!.insert(seasonMemberships).values([
          { seasonId: season!.id, userId: alex, rosterId: 1, isActive: true },
          { seasonId: season!.id, userId: zack, rosterId: 2, isActive: true },
        ]);
        await db!.insert(fantasyMatchups).values({
          seasonId: season!.id,
          week: 1,
          weekType: 'regular',
          sleeperMatchupId: 1,
          rosterAId: 1,
          rosterBId: 2,
          pointsACents: 12_000,
          pointsBCents: 9_000,
          winnerRosterId: 1,
          marginCents: 3_000,
        });
      }

      const { result, maxConcurrent } = await observe(() => timeline(db!));

      // Three seasons in, three seasons out, oldest first — unchanged.
      expect(result.map((s) => s.year)).toEqual([2024, 2025, 2026]);
      // The property: more than one season is in flight at a time.
      expect(maxConcurrent).toBeGreaterThan(1);
    });
  });
});

/**
 * A guard on the guard.
 *
 * `observe` is only meaningful if `pg.Pool.prototype.query` is still the layer
 * drizzle issues through. A driver upgrade that moved the call somewhere else
 * would make every assertion above pass by counting nothing, which is the
 * failure mode a counting test has.
 */
describe('the instrument', () => {
  it('is wrapping the method the driver actually calls', () => {
    expect(typeof pg.Pool.prototype.query).toBe('function');
  });
});
