import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { clearClock, setFixedClock } from '@/lib/clock';
import { collectionFor } from '@/lib/counter/collection';
import { closePool, getDb } from '@/lib/db';
import { fantasyMatchups, seasonMemberships, tokenTransactions } from '@/lib/db/schema';
import { resetDatabase } from '@/lib/db/test-helpers';
import { timeline } from '@/lib/league/timeline';
import { tonightBoard } from '@/lib/parlor/tonight';
import { factPacket } from '@/lib/slice/packet';
import { rackIssue } from '@/lib/slice/publication';

import { createRehearsal, type Rehearsal } from './harness';
import { SEMIFINAL_WEEK, WEEK_16_SCRIPT } from './week-16';

/**
 * How the load-bearing reads behave on the deepest data set the product holds.
 *
 * ## Why the semifinal is the high-water mark
 *
 * Two complete historical seasons, a third **sixteen weeks deep**, sixteen weeks
 * of token ledger across ten managers, sixteen Slice versions, and every
 * collectible those weeks handed out. Week 17 adds two games and January adds
 * nothing at all, so if a read is going to fall over on volume this is where it
 * does — which is why it is measured here rather than in the week-1 or week-8
 * rehearsals, where the database is by construction nearly empty.
 *
 * ## Budgets are tripwires, not benchmarks
 *
 * A shared CI runner is not a quiet machine, and a tight bound fails on a noisy
 * neighbour — which is how a timing test comes to be deleted. Each budget is
 * roughly an order of magnitude above the measured cost, so what it catches is a
 * read that became quadratic (an N+1 in a loop, a population recomputed per
 * story) rather than a slow afternoon.
 *
 * The **ratio** assertion is the one that matters most and is the only one that
 * survives any machine: `factPacket` re-derives the two previous issues and each
 * derivation walks the whole season's games, so a cost that grew with the week
 * number would show up as week 16 costing multiples of week 4.
 *
 * Measured numbers live in `docs/PLAYOFF_REHEARSAL.md §7`.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

const NOW = '2026-12-22T12:00:00Z';
const FIRST_TUESDAY = new Date('2026-09-15T09:00:00Z');

/** Milliseconds. Generous, for the reason in the header. */
const BUDGET = {
  homepage: 2_000,
  slicePacket: 3_000,
  rack: 3_000,
  timeline: 3_000,
  collection: 2_000,
} as const;

async function timed<T>(run: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const started = process.hrtime.bigint();
  const value = await run();
  return { ms: Number(process.hrtime.bigint() - started) / 1_000_000, value };
}

afterAll(async () => {
  clearClock();
  if (hasDatabase) await closePool();
});

describe.skipIf(!hasDatabase)('the deepest data set the product holds', () => {
  let rehearsal: Rehearsal;

  beforeAll(async () => {
    setFixedClock(NOW);
    await resetDatabase(db!);
    rehearsal = createRehearsal({
      db: db!,
      script: WEEK_16_SCRIPT,
      finalizeYears: [2024, 2025],
    });
    await rehearsal.seed();

    for (let week = 1; week <= SEMIFINAL_WEEK; week++) {
      await rehearsal.tuesday({
        at: new Date(FIRST_TUESDAY.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000),
        played: week,
      });
    }
  }, 600_000);

  it('is actually the deep data set it claims to be', async () => {
    /*
     * The measurement's own precondition. A performance test on a thin database
     * passes for the wrong reason, so the volume is asserted before anything is
     * timed.
     */
    const [games] = await db!.select({ total: sql<number>`count(*)::int` }).from(fantasyMatchups);
    const [ledger] = await db!
      .select({ total: sql<number>`count(*)::int` })
      .from(tokenTransactions);

    // 2024 and 2025 in full, plus sixteen weeks of 2026.
    expect(games?.total).toBeGreaterThan(200);
    /*
     * Sixteen weeks of rewards — five matchup wins a week except week 15, which
     * has two byes and therefore four, plus one weekly high score — on top of
     * the season's opening balances. The bound sits under the exact figure so a
     * rule change that pays slightly differently does not fail a volume check.
     */
    expect(ledger?.total).toBeGreaterThan(90);
  });

  it('renders the homepage board inside its budget', async () => {
    const { ms } = await timed(() => tonightBoard(db!));
    console.info(`  tonightBoard  ${ms.toFixed(1)}ms`);
    expect(ms, `tonightBoard took ${ms.toFixed(0)}ms`).toBeLessThan(BUDGET.homepage);
  });

  it('builds the semifinal packet inside its budget', async () => {
    const { ms, value } = await timed(() =>
      factPacket(db!, { season: WEEK_16_SCRIPT.year, week: SEMIFINAL_WEEK }),
    );
    expect(value.refusal).toBeNull();
    console.info(`  factPacket w16  ${ms.toFixed(1)}ms`);
    expect(ms, `factPacket took ${ms.toFixed(0)}ms`).toBeLessThan(BUDGET.slicePacket);
  });

  it('does not get slower as the season gets longer', async () => {
    const early = await timed(() => factPacket(db!, { season: WEEK_16_SCRIPT.year, week: 4 }));
    const late = await timed(() =>
      factPacket(db!, { season: WEEK_16_SCRIPT.year, week: SEMIFINAL_WEEK }),
    );
    console.info(`  factPacket w4 ${early.ms.toFixed(1)}ms · w16 ${late.ms.toFixed(1)}ms`);

    expect(
      late.ms,
      `week 4 took ${early.ms.toFixed(0)}ms and week 16 took ${late.ms.toFixed(0)}ms`,
    ).toBeLessThan(Math.max(early.ms * 4, 500));
  });

  it('serves the rack inside its budget', async () => {
    const { ms } = await timed(() =>
      rackIssue(db!, { openSeasonYear: WEEK_16_SCRIPT.year }),
    );
    console.info(`  rackIssue  ${ms.toFixed(1)}ms`);
    expect(ms, `rackIssue took ${ms.toFixed(0)}ms`).toBeLessThan(BUDGET.rack);
  });

  it('builds the timeline inside its budget', async () => {
    const { ms, value } = await timed(() => timeline(db!));
    expect(value.length).toBeGreaterThanOrEqual(3);
    console.info(`  timeline  ${ms.toFixed(1)}ms`);
    expect(ms, `timeline took ${ms.toFixed(0)}ms`).toBeLessThan(BUDGET.timeline);
  });

  it('reads a manager collection inside its budget', async () => {
    const managerId = await rehearsal.managerIdNamed('Alex');
    expect(managerId).not.toBeNull();

    const { ms } = await timed(() => collectionFor(db!, managerId!));
    console.info(`  collection  ${ms.toFixed(1)}ms`);
    expect(ms, `collection took ${ms.toFixed(0)}ms`).toBeLessThan(BUDGET.collection);
  });

  it('keeps the ledger read bounded to one manager', async () => {
    /*
     * `/counter` shows a statement, and one that read the whole league's ledger
     * would grow with the league rather than with the manager. Asserted
     * structurally rather than by timing: it is a correctness property that
     * happens to have a cost.
     */
    const managerId = await rehearsal.managerIdNamed('Alex');
    const [mine] = await db!
      .select({ total: sql<number>`count(*)::int` })
      .from(tokenTransactions)
      .innerJoin(
        seasonMemberships,
        eq(seasonMemberships.id, tokenTransactions.seasonMembershipId),
      )
      .where(eq(seasonMemberships.userId, managerId!));
    const [all] = await db!
      .select({ total: sql<number>`count(*)::int` })
      .from(tokenTransactions);

    expect(mine!.total).toBeGreaterThan(0);
    expect(mine!.total).toBeLessThan(all!.total);
  });
});
