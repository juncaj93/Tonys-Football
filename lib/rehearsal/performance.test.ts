import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { clearClock, setFixedClock } from '@/lib/clock';
import { collectionFor } from '@/lib/counter/collection';
import { closePool, getDb } from '@/lib/db';
import {
  collectibles,
  fantasyMatchups,
  seasonMemberships,
  tokenTransactions,
} from '@/lib/db/schema';
import { resetDatabase } from '@/lib/db/test-helpers';
import { timeline } from '@/lib/league/timeline';
import { tonightBoard } from '@/lib/parlor/tonight';
import { factPacket } from '@/lib/slice/packet';
import { rackIssue } from '@/lib/slice/publication';

import { playForward, standUpLeague, REHEARSAL_SEASON_YEAR, type RehearsalLeague } from './harness';
import { scoreKey } from './season';

/**
 * How the load-bearing reads behave on the deepest data set the product ever
 * holds before a season closes.
 *
 * ## What "deepest" means here, measured rather than asserted
 *
 * Three finished seasons plus sixteen weeks of a fourth: **two complete
 * historical seasons of games, a third season 16 weeks deep, sixteen weeks of
 * token ledger across ten managers, sixteen Slice versions, and every
 * collectible those weeks handed out.** Week 16 is the high-water mark — week 17
 * adds two games and January adds nothing at all — so if a query is going to
 * fall over on volume, this is where it does.
 *
 * ## Budgets, and why they are loose
 *
 * These are **regression tripwires, not benchmarks.** A shared CI runner is not
 * a quiet machine and a tight bound would fail on a noisy neighbour, which is
 * how a timing test gets deleted. Each budget is roughly an order of magnitude
 * above what the query costs on this data, so the failure it catches is a query
 * that became quadratic — an N+1 introduced in a loop, a population recomputed
 * per story — and not a slow afternoon.
 *
 * The measured numbers are recorded in `docs/PLAYOFF_REHEARSAL.md` so the next
 * session can see whether something moved rather than only whether it broke.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

const NOW = '2026-12-22T12:00:00Z';
const FIRST_TUESDAY = new Date('2026-09-15T09:00:00Z');

/** Generous, for the reason in the header. Milliseconds. */
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

describe.skipIf(!hasDatabase)('the deepest data set the product holds', () => {
  let league: RehearsalLeague;

  beforeAll(async () => {
    setFixedClock(NOW);
    await resetDatabase(db!);
    league = await standUpLeague(db!);
    await playForward(db!, {
      through: 16,
      at: FIRST_TUESDAY,
      options: { scores: new Map([[scoreKey(16, 3), 13097]]) },
    });
  }, 300_000);

  afterAll(async () => {
    clearClock();
    if (hasDatabase) await closePool();
  });

  it('is actually the deep data set it claims to be', async () => {
    /*
     * The measurement's own precondition. A performance test on a thin database
     * is a test that passes for the wrong reason, so the volume is asserted
     * before anything is timed.
     */
    const [games] = await db!
      .select({ total: sql<number>`count(*)::int` })
      .from(fantasyMatchups);
    const [ledger] = await db!
      .select({ total: sql<number>`count(*)::int` })
      .from(tokenTransactions);
    const [items] = await db!.select({ total: sql<number>`count(*)::int` }).from(collectibles);

    // 2024 and 2025 in full, plus sixteen weeks of 2026.
    expect(games?.total).toBeGreaterThan(200);
    /*
     * Sixteen weeks of rewards: five matchup wins a week except week 15, which
     * has two byes and therefore four, plus one weekly high score. Ninety-odd
     * rows, and the bound is deliberately under the exact figure so a rule
     * change that pays slightly differently does not fail a volume check.
     */
    expect(ledger?.total).toBeGreaterThan(90);
    expect(items?.total).toBeGreaterThan(0);
  });

  it('renders the homepage board inside its budget', async () => {
    const { ms } = await timed(() => tonightBoard(db!));
    console.info(`  tonightBoard  ${ms.toFixed(1)}ms`);
    expect(ms, `tonightBoard took ${ms.toFixed(0)}ms`).toBeLessThan(BUDGET.homepage);
  });

  it('builds the semifinal packet inside its budget', async () => {
    /*
     * The most expensive read in the product, and the one most exposed to
     * season length: it derives three weeks of stories, and each derivation
     * walks the whole season's games and both finalized populations.
     */
    const { ms, value } = await timed(() =>
      factPacket(db!, { season: REHEARSAL_SEASON_YEAR, week: 16 }),
    );
    expect(value.refusal).toBeNull();
    console.info(`  factPacket w16  ${ms.toFixed(1)}ms`);
    expect(ms, `factPacket took ${ms.toFixed(0)}ms`).toBeLessThan(BUDGET.slicePacket);
  });

  it('does not get slower as the season gets longer', async () => {
    /*
     * The shape that matters more than the absolute number.
     *
     * `factPacket` re-derives the two previous issues to enforce the no-repeat
     * rule, and each derivation reads `seasonRows` — every game of the season.
     * If the cost per week grew with the week number, week 16 would cost
     * noticeably more than week 4 and week 17 would cost more again. A ratio
     * catches that on any machine; a millisecond bound would not.
     */
    const early = await timed(() => factPacket(db!, { season: REHEARSAL_SEASON_YEAR, week: 4 }));
    const late = await timed(() => factPacket(db!, { season: REHEARSAL_SEASON_YEAR, week: 16 }));
    console.info(`  factPacket w4 ${early.ms.toFixed(1)}ms · w16 ${late.ms.toFixed(1)}ms`);

    expect(
      late.ms,
      `week 4 took ${early.ms.toFixed(0)}ms and week 16 took ${late.ms.toFixed(0)}ms`,
    ).toBeLessThan(Math.max(early.ms * 4, 500));
  });

  it('serves the rack inside its budget', async () => {
    const { ms } = await timed(() =>
      rackIssue(db!, { openSeasonYear: REHEARSAL_SEASON_YEAR }),
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
    const seat = league.seats.get(1);
    expect(seat).toBeDefined();

    const { ms } = await timed(() => collectionFor(db!, seat!.userId));
    console.info(`  collection  ${ms.toFixed(1)}ms`);
    expect(ms, `collection took ${ms.toFixed(0)}ms`).toBeLessThan(BUDGET.collection);
  });

  it('keeps the ledger read bounded to one manager', async () => {
    /*
     * `/counter` shows a statement, and a statement that read the whole league's
     * ledger would grow with the league rather than with the manager. Asserted
     * structurally — the row count for one seat — rather than by timing, because
     * this is a correctness property that happens to have a cost.
     */
    const seat = league.seats.get(1);
    const [mine] = await db!
      .select({ total: sql<number>`count(*)::int` })
      .from(tokenTransactions)
      .innerJoin(
        seasonMemberships,
        eq(seasonMemberships.id, tokenTransactions.seasonMembershipId),
      )
      .where(eq(seasonMemberships.userId, seat!.userId));
    const [all] = await db!
      .select({ total: sql<number>`count(*)::int` })
      .from(tokenTransactions);

    expect(mine!.total).toBeGreaterThan(0);
    expect(mine!.total).toBeLessThan(all!.total);
  });
});
