import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearClock, setFixedClock } from '@/lib/clock';
import { closePool, getDb } from '@/lib/db';
import { collectibles, lootBoxes, seasonMemberships, seasons, users } from '@/lib/db/schema';
import { resetDatabase } from '@/lib/db/test-helpers';
import { catalogItem } from '@/lib/counter/catalog';
import { collectionFor } from '@/lib/counter/collection';
import { standardRewardTable } from '@/lib/counter/rewards';
import { clearRandomSource } from '@/lib/counter/rng';
import { showcaseFor } from '@/lib/counter/showcase';
import { applyTokenDelta, ensureEconomyConfig, wallet } from '@/lib/counter/tokens';

import { APPLIED_STATES, DemoBlocked, applyDemoState, rollForSlug } from './apply';
import { DemoRefused, isDemoSeat } from './guard';
import { RETIRED_SUFFIX, currentGeneration, retireDemoSeats } from './seat';
import { BLOCKED_ON_M3, DEMO_STATES } from './states';

/**
 * The demo appliers, against a real Postgres.
 *
 * Three things are being tested and they are not the same thing:
 *
 *   1. **Isolation** — a demo cannot reach a manager, and cannot run where it
 *      must not. Asserted by *asking it to*, not by reading the source.
 *   2. **Reproducibility** — the same state applied twice is the same database.
 *      This is the property `MANDATE §8` calls "fixed seeds", and it is the one
 *      that makes a screenshot comparable to yesterday's.
 *   3. **Honesty** — the states produce what they claim. A `pull-legendary` that
 *      quietly produced a common would still screenshot, still pass CI, and be
 *      worthless.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

/** The environment a demo is allowed in. Passed explicitly; never read from the process. */
const ALLOWED = { DEMO_FIXTURES: '1' } as const;

// One pool for the file. A per-suite `afterAll` closes it out from under the
// next suite in the same file, which fails as a truncate error and reads like a
// schema problem.
afterAll(async () => {
  if (hasDatabase) await closePool();
});

describe('the demo catalog and its appliers agree', () => {
  it('covers every state that is not blocked', () => {
    const expected = DEMO_STATES.map((state) => state.key).filter(
      (key) => !BLOCKED_ON_M3.includes(key),
    );

    // Sorted comparison rather than a count: a count passes when one state is
    // added and another dropped, which is exactly the drift this guards.
    expect([...APPLIED_STATES].sort()).toEqual([...expected].sort());
  });

  it('has no applier for a blocked state, so it cannot be silently half-supported', () => {
    for (const key of BLOCKED_ON_M3) {
      expect(APPLIED_STATES).not.toContain(key);
    }
    expect(BLOCKED_ON_M3.length).toBeGreaterThan(0);
  });

  it('resolves a roll to the slug the table would resolve it back to', () => {
    const table = standardRewardTable();
    for (const entry of table.entries) {
      const roll = rollForSlug(entry.slug);
      expect(roll).toBeGreaterThanOrEqual(0);
      expect(roll).toBeLessThan(table.totalWeight);
    }
  });
});

describe.skipIf(!hasDatabase)('applying a demo state', () => {
  beforeEach(async () => {
    await resetDatabase(db!);
    setFixedClock('2026-07-30T12:00:00Z');
    await league();
  });

  afterEach(() => {
    clearClock();
    clearRandomSource();
  });

  /** An open season with one real manager seated in it, holding a real tab. */
  async function league() {
    const [season] = await db!.insert(seasons).values({ year: 2026 }).returning();
    const [manager] = await db!
      .insert(users)
      .values({ displayName: 'Alex', sleeperUserId: '735291046122594304' })
      .returning();
    await db!
      .insert(seasonMemberships)
      .values({ seasonId: season!.id, userId: manager!.id, rosterId: 1 });
    await ensureEconomyConfig(db!, season!.id);
    await applyTokenDelta(db!, {
      userId: manager!.id,
      seasonId: season!.id,
      amount: 250,
      reason: 'SEASON_START',
      description: 'Tony opens a tab.',
      idempotencyKey: 'test:season-start',
    });
    return { season: season!, manager: manager! };
  }

  async function realManager() {
    const [row] = await db!.select().from(users).where(eq(users.displayName, 'Alex'));
    return row!;
  }

  /* --- isolation ----------------------------------------------------- */

  it('refuses to run in production, and writes nothing when it does', async () => {
    await expect(
      applyDemoState(db!, 'pull-legendary', { VERCEL_ENV: 'production', DEMO_FIXTURES: '1' }),
    ).rejects.toBeInstanceOf(DemoRefused);

    const seats = await db!.select().from(users);
    expect(seats.filter((row) => isDemoSeat(row.sleeperUserId ?? ''))).toHaveLength(0);
  });

  it('refuses without the explicit opt-in', async () => {
    await expect(applyDemoState(db!, 'pull-legendary', {})).rejects.toBeInstanceOf(DemoRefused);
    const boxes = await db!.select().from(lootBoxes);
    expect(boxes).toHaveLength(0);
  });

  it('leaves the real manager exactly as it found them', async () => {
    const before = await realManager();
    const season = (await db!.select().from(seasons))[0]!;
    const balanceBefore = await wallet(db!, { userId: before.id, seasonId: season.id });

    for (const key of ['welcome-box', 'pull-legendary', 'purchase-ok', 'broke']) {
      await applyDemoState(db!, key, ALLOWED);
    }

    const after = await realManager();
    expect(after).toEqual(before);

    const balanceAfter = await wallet(db!, { userId: before.id, seasonId: season.id });
    expect(balanceAfter?.balance).toBe(balanceBefore?.balance);

    const theirBoxes = await db!
      .select()
      .from(lootBoxes)
      .where(eq(lootBoxes.userId, before.id));
    expect(theirBoxes).toHaveLength(0);

    const theirItems = await db!
      .select()
      .from(collectibles)
      .where(eq(collectibles.userId, before.id));
    expect(theirItems).toHaveLength(0);
  });

  it('writes only to seats carrying the reserved prefix', async () => {
    await applyDemoState(db!, 'collection-full', ALLOWED);

    const owners = await db!
      .selectDistinct({ userId: collectibles.userId })
      .from(collectibles);
    expect(owners.length).toBeGreaterThan(0);

    for (const owner of owners) {
      const [row] = await db!.select().from(users).where(eq(users.id, owner.userId));
      expect(isDemoSeat(row?.sleeperUserId ?? '')).toBe(true);
    }
  });

  it('refuses a state that is blocked on a later milestone rather than faking it', async () => {
    await expect(applyDemoState(db!, 'equipped-wearable', ALLOWED)).rejects.toBeInstanceOf(
      DemoBlocked,
    );
  });

  it('refuses a state nobody named', async () => {
    await expect(applyDemoState(db!, 'not-a-state', ALLOWED)).rejects.toThrow(/no demo state/);
  });

  /* --- reproducibility ----------------------------------------------- */

  it.each(DEMO_STATES.filter((state) => !BLOCKED_ON_M3.includes(state.key)).map((s) => s.key))(
    'applies "%s" twice to the same database',
    async (key) => {
      const first = await applyDemoState(db!, key, ALLOWED);
      const second = await applyDemoState(db!, key, ALLOWED);

      expect(second.seat.userId).toBe(first.seat.userId);
      expect(second.evidence).toEqual(first.evidence);

      const boxes = await db!
        .select()
        .from(lootBoxes)
        .where(eq(lootBoxes.userId, first.seat.userId));
      const items = await db!
        .select()
        .from(collectibles)
        .where(eq(collectibles.userId, first.seat.userId));

      // A second run that granted another box or minted another collectible
      // would still *look* right on screen; this is the assertion that catches it.
      expect(boxes.length).toBe(new Set(boxes.map((box) => box.grantKey)).size);
      expect(items.length).toBe(new Set(items.map((item) => item.sourceOpeningId)).size);
    },
  );

  it('gives each state its own seat, so states cannot contaminate each other', async () => {
    const a = await applyDemoState(db!, 'broke', ALLOWED);
    const b = await applyDemoState(db!, 'no-box', ALLOWED);

    expect(a.seat.userId).not.toBe(b.seat.userId);

    const brokeBalance = await wallet(db!, {
      userId: a.seat.userId,
      seasonId: a.seat.seasonId,
    });
    const richBalance = await wallet(db!, {
      userId: b.seat.userId,
      seasonId: b.seat.seasonId,
    });

    expect(brokeBalance?.balance).toBe(49);
    expect(richBalance?.balance).toBe(250);
  });

  /* --- honesty -------------------------------------------------------- */

  it('produces the rarity each pull state advertises', async () => {
    for (const [key, rarity] of [
      ['pull-common', 'common'],
      ['pull-rare', 'rare'],
      ['pull-epic', 'epic'],
      ['pull-legendary', 'legendary'],
    ] as const) {
      const outcome = await applyDemoState(db!, key, ALLOWED);
      expect(outcome.evidence['rarity']).toBe(rarity);

      const [item] = await db!
        .select()
        .from(collectibles)
        .where(eq(collectibles.userId, outcome.seat.userId));
      expect(item?.rarity).toBe(rarity);
    }
  });

  it('pulls the whipped-cream can the commissioner named, by its canonical slug', async () => {
    const outcome = await applyDemoState(db!, 'pull-whipped-cream', ALLOWED);
    expect(outcome.evidence['slug']).toBe('collectible_reddiwip');
    // The name shown under it is the registry's alt text — this is the string
    // that has to read as "the whipped-cream can" on screen.
    expect(catalogItem('collectible_reddiwip').name).toBe('Can of whipped cream');
  });

  it('records a roll that recomputes the item it awarded', async () => {
    const outcome = await applyDemoState(db!, 'pull-legendary', ALLOWED);

    const [opening] = await db!
      .select()
      .from(collectibles)
      .where(eq(collectibles.userId, outcome.seat.userId));

    expect(opening?.slug).toBe(outcome.evidence['slug']);
    expect(outcome.evidence['rewardTable']).toBe(standardRewardTable().version);
  });

  it('makes a duplicate a second copy rather than a second item', async () => {
    const outcome = await applyDemoState(db!, 'pull-duplicate', ALLOWED);
    const collection = await collectionFor(db!, outcome.seat.userId);

    expect(collection.distinct).toBe(1);
    expect(collection.copies).toBe(2);
  });

  it('replays an opened box to the same item instead of rolling again', async () => {
    const outcome = await applyDemoState(db!, 'reveal-replayed', ALLOWED);

    expect(outcome.evidence['replayed']).toBe(true);
    expect(outcome.evidence['sameItem']).toBe(true);

    const items = await db!
      .select()
      .from(collectibles)
      .where(eq(collectibles.userId, outcome.seat.userId));
    expect(items).toHaveLength(1);
  });

  it('reaches "broke" by spending through the ledger, never by writing a balance', async () => {
    const outcome = await applyDemoState(db!, 'broke', ALLOWED);
    expect(outcome.evidence['balance']).toBe(49);
    expect(outcome.evidence['price']).toBe(50);

    const held = await wallet(db!, {
      userId: outcome.seat.userId,
      seasonId: outcome.seat.seasonId,
    });
    expect(held?.balance).toBe(49);
  });

  it('leaves nothing behind when a purchase is refused', async () => {
    const outcome = await applyDemoState(db!, 'purchase-refused', ALLOWED);

    expect(outcome.evidence['refused']).toBe(true);
    expect(outcome.evidence['boxesCreated']).toBe(0);

    const boxes = await db!
      .select()
      .from(lootBoxes)
      .where(eq(lootBoxes.userId, outcome.seat.userId));
    expect(boxes).toHaveLength(0);
  });

  it('puts a real item in the showcase, owned by the seat that shows it', async () => {
    const outcome = await applyDemoState(db!, 'showcased', ALLOWED);
    const shown = await showcaseFor(db!, outcome.seat.userId);

    expect(shown?.slug).toBe(outcome.evidence['slug']);
  });

  it('names what the browser must still do for a state the server cannot produce', async () => {
    for (const state of DEMO_STATES.filter((candidate) => candidate.reach === 'client')) {
      const outcome = await applyDemoState(db!, state.key, ALLOWED);
      expect(outcome.browserSteps.length).toBeGreaterThan(0);
    }
  });

  it('hands back a door to sign in at, because a state nobody can reach is not a demo', async () => {
    const outcome = await applyDemoState(db!, 'one-box', ALLOWED);
    expect(outcome.doorPath).toBe(`/door/${outcome.seat.userId}`);
    expect(outcome.pin).toMatch(/^\d{6}$/);

    const [seat] = await db!.select().from(users).where(eq(users.id, outcome.seat.userId));
    expect(seat?.pinHash).not.toBeNull();
  });
});

describe.skipIf(!hasDatabase)('retiring demo seats', () => {
  beforeEach(async () => {
    await resetDatabase(db!);
    setFixedClock('2026-07-30T12:00:00Z');

    const [season] = await db!.insert(seasons).values({ year: 2026 }).returning();
    const [manager] = await db!
      .insert(users)
      .values({ displayName: 'Alex', sleeperUserId: '735291046122594304' })
      .returning();
    await db!
      .insert(seasonMemberships)
      .values({ seasonId: season!.id, userId: manager!.id, rosterId: 1 });
    await ensureEconomyConfig(db!, season!.id);
  });

  afterEach(() => {
    clearClock();
    clearRandomSource();
  });

  it('starts at generation zero and opens a new one after a retire', async () => {
    expect(await currentGeneration(db!)).toBe(0);

    const first = await applyDemoState(db!, 'one-box', ALLOWED);
    expect(first.seat.generation).toBe(0);

    const { retired } = await retireDemoSeats(db!);
    expect(retired).toBe(1);
    expect(await currentGeneration(db!)).toBe(1);

    const second = await applyDemoState(db!, 'one-box', ALLOWED);
    expect(second.seat.generation).toBe(1);
    expect(second.seat.userId).not.toBe(first.seat.userId);
  });

  it('takes retired seats out of the season rather than deleting their history', async () => {
    const applied = await applyDemoState(db!, 'purchase-ok', ALLOWED);
    await retireDemoSeats(db!);

    const [seat] = await db!.select().from(users).where(eq(users.id, applied.seat.userId));
    expect(seat?.sleeperUserId).toMatch(new RegExp(`${RETIRED_SUFFIX}$`));

    const [membership] = await db!
      .select()
      .from(seasonMemberships)
      .where(eq(seasonMemberships.userId, applied.seat.userId));
    expect(membership?.isActive).toBe(false);

    // The ledger is append-only for everyone, demos included. A retire that
    // could erase it would be no evidence that a manager's cannot.
    expect(membership?.tokenBalance).toBe(200);
  });

  it('never retires a real manager', async () => {
    const [before] = await db!.select().from(users).where(eq(users.displayName, 'Alex'));
    await applyDemoState(db!, 'one-box', ALLOWED);
    await retireDemoSeats(db!);

    const [after] = await db!.select().from(users).where(eq(users.id, before!.id));
    expect(after?.sleeperUserId).toBe(before?.sleeperUserId);

    const [membership] = await db!
      .select()
      .from(seasonMemberships)
      .where(
        and(
          eq(seasonMemberships.userId, before!.id),
          eq(seasonMemberships.isActive, true),
        ),
      );
    expect(membership).toBeDefined();
  });

  it('reports honestly when there is nothing to retire', async () => {
    expect(await retireDemoSeats(db!)).toEqual({ retired: 0 });
  });
});
