import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearClock, setFixedClock } from '@/lib/clock';
import { closePool, getDb } from '@/lib/db';
import { seasonMemberships, seasons, users } from '@/lib/db/schema';
import { resetDatabase } from '@/lib/db/test-helpers';

import { ensureRewardTable, grantBox, openBox, ownedBox } from './boxes';
import { CATALOG_SIZE, RARITIES } from './catalog';
import { collectionFor, owns, parseFilter } from './collection';
import { standardRewardTable } from './rewards';
import { clearRandomSource, setFixedRoll } from './rng';

/**
 * The shelf.
 *
 * What matters here is that the view is a **statement about the gap** as well as
 * about what is held — `18 §4` asks for set progress, and a count of owned rows
 * cannot express it. So these assert the shape of the whole catalog, not just the
 * rows that exist.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

describe.skipIf(!hasDatabase)('the collection', () => {
  beforeEach(async () => {
    await resetDatabase(db!);
    await ensureRewardTable(db!);
    setFixedClock('2026-07-30T12:00:00Z');
  });

  afterEach(() => {
    clearClock();
    clearRandomSource();
  });

  afterAll(async () => {
    if (hasDatabase) await closePool();
  });

  async function manager(displayName = 'Alex') {
    const [user] = await db!.insert(users).values({ displayName }).returning();
    const [season] = await db!.insert(seasons).values({ year: 2026 }).returning();
    await db!
      .insert(seasonMemberships)
      .values({ seasonId: season!.id, userId: user!.id, rosterId: 1 });
    return user!;
  }

  /** Open one box with a forced roll, so the pulled item is known. */
  async function pull(userId: string, roll: number, key: string) {
    await grantBox(db!, { userId, grantKey: key, source: 'test' });
    const box = await ownedBox(db!, userId);
    setFixedRoll(roll);
    const result = await openBox(db!, { userId, boxId: box!.id });
    if (result.status !== 'opened') throw new Error('the test box did not open');
    return result.reveal;
  }

  it('shows every catalog item, held or not, so progress is legible', async () => {
    const alex = await manager();
    const collection = await collectionFor(db!, alex.id);

    expect(collection.entries).toHaveLength(CATALOG_SIZE);
    expect(collection.total).toBe(CATALOG_SIZE);
    expect(collection.distinct).toBe(0);
    expect(collection.copies).toBe(0);
    // An empty shelf still describes the whole set — that is the point.
    expect(collection.entries.every((entry) => entry.count === 0)).toBe(true);
    expect(collection.entries.every((entry) => entry.firstAcquiredAt === null)).toBe(true);
  });

  it('counts a pull against the right catalog entry', async () => {
    const alex = await manager();
    const reveal = await pull(alex.id, 0, 'a');

    const collection = await collectionFor(db!, alex.id);
    const entry = collection.entries.find((candidate) => candidate.slug === reveal.slug);

    expect(entry?.count).toBe(1);
    expect(entry?.rarity).toBe(reveal.rarity);
    expect(collection.distinct).toBe(1);
    expect(collection.copies).toBe(1);
  });

  it('counts duplicates as copies without adding to set progress', async () => {
    // `03 §12` defers salvage to after simulation, so a duplicate is a fact about
    // the shelf and nothing more. It must not inflate progress either.
    const alex = await manager();
    await pull(alex.id, 0, 'a');
    await pull(alex.id, 0, 'b');

    const collection = await collectionFor(db!, alex.id);
    expect(collection.distinct).toBe(1);
    expect(collection.copies).toBe(2);
    expect(collection.entries.filter((entry) => entry.count === 2)).toHaveLength(1);
  });

  it('records the earliest acquisition, not the latest', async () => {
    const alex = await manager();
    setFixedClock('2026-07-01T00:00:00Z');
    await pull(alex.id, 0, 'a');
    setFixedClock('2026-07-20T00:00:00Z');
    await pull(alex.id, 0, 'b');

    const collection = await collectionFor(db!, alex.id);
    const held = collection.entries.find((entry) => entry.count === 2);
    expect(held?.firstAcquiredAt?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });

  it('reports per-tier progress whose totals match the catalog', async () => {
    const alex = await manager();
    const collection = await collectionFor(db!, alex.id);
    const table = standardRewardTable();

    for (const rarity of RARITIES) {
      const inCatalog = table.entries.filter((entry) => entry.rarity === rarity).length;
      expect(collection.byRarity[rarity].total).toBe(inCatalog);
      expect(collection.byRarity[rarity].held).toBe(0);
    }

    const tiers = RARITIES.map((rarity) => collection.byRarity[rarity].total);
    expect(tiers.reduce((a, b) => a + b, 0)).toBe(CATALOG_SIZE);
  });

  it('moves the tier a pull belongs to, and only that tier', async () => {
    const alex = await manager();
    const table = standardRewardTable();
    // The top of the range is legendary — asserted in the rewards suite.
    const reveal = await pull(alex.id, table.totalWeight - 1, 'a');
    expect(reveal.rarity).toBe('legendary');

    const collection = await collectionFor(db!, alex.id);
    expect(collection.byRarity.legendary.held).toBe(1);
    expect(collection.byRarity.common.held).toBe(0);
    expect(collection.byRarity.rare.held).toBe(0);
    expect(collection.byRarity.epic.held).toBe(0);
  });

  it("never shows one manager another's shelf", async () => {
    const alex = await manager('Alex');
    const [zack] = await db!.insert(users).values({ displayName: 'Zack' }).returning();
    await pull(alex.id, 0, 'a');

    expect((await collectionFor(db!, zack!.id)).distinct).toBe(0);
    expect((await collectionFor(db!, alex.id)).distinct).toBe(1);
  });

  describe('ownership checks', () => {
    it('answers truthfully for held and unheld slugs', async () => {
      const alex = await manager();
      const reveal = await pull(alex.id, 0, 'a');

      expect(await owns(db!, alex.id, reveal.slug)).toBe(true);
      expect(await owns(db!, alex.id, 'collectible_not_a_thing')).toBe(false);
    });

    it("does not credit one manager with another's item", async () => {
      // The check that authorizes showcasing. Getting it wrong would let a manager
      // display something they never pulled.
      const alex = await manager('Alex');
      const [zack] = await db!.insert(users).values({ displayName: 'Zack' }).returning();
      const reveal = await pull(alex.id, 0, 'a');

      expect(await owns(db!, zack!.id, reveal.slug)).toBe(false);
    });
  });

  describe('the rarity filter', () => {
    it('accepts every rarity and "all"', () => {
      expect(parseFilter('all')).toBe('all');
      for (const rarity of RARITIES) expect(parseFilter(rarity)).toBe(rarity);
    });

    it('treats anything else as everything, rather than erroring', () => {
      // A hand-edited query string must not produce an error page.
      expect(parseFilter(undefined)).toBe('all');
      expect(parseFilter('')).toBe('all');
      expect(parseFilter('mythic')).toBe('all');
      expect(parseFilter('<script>')).toBe('all');
    });
  });

  it('keeps the shelf after the season that bought it is finalized', async () => {
    // `16 §5.1`: collectibles are permanent and hang off the person. Tokens reset;
    // the shelf does not.
    const alex = await manager();
    await pull(alex.id, 0, 'a');
    await db!
      .update(seasons)
      .set({ finalizedAt: new Date('2027-01-15T00:00:00Z') })
      .where(eq(seasons.year, 2026));

    expect((await collectionFor(db!, alex.id)).distinct).toBe(1);
  });
});
