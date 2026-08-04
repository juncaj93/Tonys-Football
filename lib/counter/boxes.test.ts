import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearClock, setFixedClock } from '@/lib/clock';
import { closePool, getDb } from '@/lib/db';
import {
  boxOpenings,
  collectibles,
  lootBoxes,
  rewardTables,
  seasons,
  users,
} from '@/lib/db/schema';
import { PG_ERROR, expectPgError, resetDatabase } from '@/lib/db/test-helpers';

import { counterState, ensureRewardTable, grantBox, openBox, ownedBox } from './boxes';
import { standardRewardTable } from './rewards';
import { clearRandomSource, setFixedRoll } from './rng';
import { applyTokenDelta, ensureEconomyConfig, wallet } from './tokens';

/**
 * Integration tests for opening a box, against a real Postgres.
 *
 * `18 §4.3` requires opening to be **server-authoritative, transactional,
 * auditable, and idempotent**. Three of those four are properties of the
 * database, so they cannot be tested against a mock: the whole point is that
 * Postgres refuses the bad states even when application code asks for them.
 *
 * The idempotency tests are the ones that matter most. A box that can be opened
 * twice is a duplication bug in a permanent collection, and it is not
 * recoverable by a later fix — the extra item is already somebody's property.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

/*
 * Where a salvage would be paid, if one happened.
 *
 * `null` in these tests on purpose: none of them fills a whole tier, so no
 * opening below can reach `16 §8`'s conversion — and passing a season that is
 * never used would suggest otherwise. The salvage path has its own tests, which
 * build the collection that makes it reachable.
 */
const seasonId: string | null = null;


describe.skipIf(!hasDatabase)('opening a box', () => {
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

  async function makeManager(displayName = 'Alex') {
    const [row] = await db!.insert(users).values({ displayName }).returning();
    return row!;
  }

  async function grantOne(userId: string, key = 'test:box:1') {
    await grantBox(db!, { userId, grantKey: key, source: 'seed' });
    const box = await ownedBox(db!, userId);
    expect(box).not.toBeNull();
    return box!;
  }

  describe('granting', () => {
    it('puts an unopened box on the tray', async () => {
      const alex = await makeManager();
      const result = await grantBox(db!, {
        userId: alex.id,
        grantKey: 'seed:test',
        source: 'seed',
      });

      expect(result.granted).toBe(true);
      expect(await ownedBox(db!, alex.id)).toMatchObject({ kind: 'standard' });
    });

    it('is idempotent: the same grant key never grants twice', async () => {
      // This is what stops the seed becoming a faucet. It runs on every deploy.
      const alex = await makeManager();
      const first = await grantBox(db!, { userId: alex.id, grantKey: 'k', source: 'seed' });
      const second = await grantBox(db!, { userId: alex.id, grantKey: 'k', source: 'seed' });

      expect(first.granted).toBe(true);
      expect(second.granted).toBe(false);

      const rows = await db!.select().from(lootBoxes).where(eq(lootBoxes.userId, alex.id));
      expect(rows).toHaveLength(1);
    });

    it('does not re-grant after the box has been opened', async () => {
      // The case that matters: a re-grant of an opened box would be a reroll
      // dressed up as a deployment.
      const alex = await makeManager();
      const box = await grantOne(alex.id, 'k');
      await openBox(db!, { userId: alex.id, boxId: box.id, seasonId });

      const again = await grantBox(db!, { userId: alex.id, grantKey: 'k', source: 'seed' });
      expect(again.granted).toBe(false);
      expect(await ownedBox(db!, alex.id)).toBeNull();
    });

    it('shows nothing on the tray when nothing is owned', async () => {
      const alex = await makeManager();
      expect(await ownedBox(db!, alex.id)).toBeNull();
    });
  });

  describe('the reward comes from the server', () => {
    it('records the roll, the rarity and the reward table version', async () => {
      const alex = await makeManager();
      const box = await grantOne(alex.id);
      const table = standardRewardTable();

      setFixedRoll(0);
      const result = await openBox(db!, { userId: alex.id, boxId: box.id, seasonId });
      expect(result.status).toBe('opened');

      const [opening] = await db!
        .select()
        .from(boxOpenings)
        .where(eq(boxOpenings.boxId, box.id));

      expect(opening).toBeDefined();
      expect(opening!.roll).toBe(0);
      expect(opening!.rewardTableVersion).toBe(table.version);
      expect(opening!.collectibleSlug).toBe(table.entries[0]!.slug);
      expect(opening!.rarity).toBe(table.entries[0]!.rarity);
    });

    it('is reproducible: the stored roll and version recompute the same item', async () => {
      // The definition of auditable. Without this, "was that legendary real"
      // can only be answered by taking the server's word for it.
      const alex = await makeManager();
      const box = await grantOne(alex.id);

      setFixedRoll(1234);
      const result = await openBox(db!, { userId: alex.id, boxId: box.id, seasonId });

      const [opening] = await db!
        .select()
        .from(boxOpenings)
        .where(eq(boxOpenings.boxId, box.id));

      const table = standardRewardTable();
      expect(opening!.rewardTableVersion).toBe(table.version);
      expect(result.status === 'opened' && result.reveal.slug).toBe(opening!.collectibleSlug);
    });

    it('reaches a legendary when the roll lands there', async () => {
      const alex = await makeManager();
      const box = await grantOne(alex.id);
      const table = standardRewardTable();

      setFixedRoll(table.totalWeight - 1);
      const result = await openBox(db!, { userId: alex.id, boxId: box.id, seasonId });

      expect(result.status === 'opened' && result.reveal.rarity).toBe('legendary');
    });

    it('refuses to roll against a reward table this database has never stored', async () => {
      // `18 §4.3` says the reward is resolved from a *stored* table. Writing one
      // on first use would let the first opening of a deploy silently define the
      // economy.
      /*
       * Start from a database with **no** stored reward table, rather than emptying
       * one afterwards.
       *
       * The earlier version truncated `reward_tables CASCADE`. That stopped working
       * the moment `users.showcase_collectible_id` was added, because the cascade
       * then follows reward_tables → box_openings → collectibles → users → loot_boxes
       * and takes the test's own box with it. Building the state directly is both
       * clearer and immune to the next FK somebody adds.
       */
      await resetDatabase(db!);
      const alex = await makeManager();
      const box = await grantOne(alex.id);

      await expect(openBox(db!, { userId: alex.id, boxId: box.id, seasonId })).rejects.toThrow(
        /not stored/,
      );

      // And the box is untouched, because the whole thing is one transaction.
      expect(await ownedBox(db!, alex.id)).not.toBeNull();
    });
  });

  describe('exactly once, whatever asks', () => {
    it('opening twice yields one collectible and the same item both times', async () => {
      // The acceptance criterion from the issue: a double tap or a refresh
      // mid-reveal must not produce two items or a different item.
      const alex = await makeManager();
      const box = await grantOne(alex.id);

      setFixedRoll(500);
      const first = await openBox(db!, { userId: alex.id, boxId: box.id, seasonId });

      // A second call would roll differently if it rolled at all.
      setFixedRoll(3999);
      const second = await openBox(db!, { userId: alex.id, boxId: box.id, seasonId });

      expect(first.status).toBe('opened');
      expect(second.status).toBe('opened');
      if (first.status !== 'opened' || second.status !== 'opened') return;

      expect(second.reveal.slug).toBe(first.reveal.slug);
      expect(second.reveal.rarity).toBe(first.reveal.rarity);
      expect(first.reveal.replayed).toBe(false);
      // The second look is flagged, so the UI can skip the anticipation beat.
      expect(second.reveal.replayed).toBe(true);

      const owned = await db!.select().from(collectibles).where(eq(collectibles.userId, alex.id));
      expect(owned).toHaveLength(1);

      const openings = await db!.select().from(boxOpenings).where(eq(boxOpenings.boxId, box.id));
      expect(openings).toHaveLength(1);
    });

    it('survives concurrent taps: ten parallel opens produce one collectible', async () => {
      // The row lock is what makes this wait rather than race. Ten is enough to
      // lose reliably if the lock were removed.
      const alex = await makeManager();
      const box = await grantOne(alex.id);

      setFixedRoll(100);
      const results = await Promise.all(
        Array.from({ length: 10 }, () => openBox(db!, { userId: alex.id, boxId: box.id, seasonId })),
      );

      const slugs = new Set(
        results.map((r) => (r.status === 'opened' ? r.reveal.slug : 'not_found')),
      );
      expect(slugs.size).toBe(1);

      const owned = await db!.select().from(collectibles).where(eq(collectibles.userId, alex.id));
      expect(owned).toHaveLength(1);
    });

    it('refuses a second opening row even if the lock is bypassed', async () => {
      // The backstop. A future refactor that forgets the FOR UPDATE must still
      // be unable to mint a second collectible.
      const alex = await makeManager();
      const box = await grantOne(alex.id);
      setFixedRoll(0);
      await openBox(db!, { userId: alex.id, boxId: box.id, seasonId });

      await expectPgError(
        db!.insert(boxOpenings).values({
          boxId: box.id,
          userId: alex.id,
          collectibleSlug: 'collectible_pizza_cutter',
          rarity: 'common',
          rewardTableVersion: standardRewardTable().version,
          roll: 1,
          openedAt: new Date('2026-07-30T12:00:00Z'),
        }),
        { code: PG_ERROR.uniqueViolation, constraint: 'box_openings_box_id_unique' },
      );
    });

    it('refuses two collectibles from one opening', async () => {
      const alex = await makeManager();
      const box = await grantOne(alex.id);
      setFixedRoll(0);
      await openBox(db!, { userId: alex.id, boxId: box.id, seasonId });

      const [opening] = await db!
        .select()
        .from(boxOpenings)
        .where(eq(boxOpenings.boxId, box.id));

      await expectPgError(
        db!.insert(collectibles).values({
          userId: alex.id,
          slug: 'collectible_pizza_cutter',
          rarity: 'common',
          acquiredAt: new Date('2026-07-30T12:00:00Z'),
          sourceOpeningId: opening!.id,
        }),
        { code: PG_ERROR.uniqueViolation, constraint: 'collectibles_source_opening_id_unique' },
      );
    });
  });

  describe('authorization', () => {
    it("will not open somebody else's box", async () => {
      const alex = await makeManager('Alex');
      const zack = await makeManager('Zack');
      const box = await grantOne(alex.id, 'alex');

      const result = await openBox(db!, { userId: zack.id, boxId: box.id, seasonId });

      expect(result.status).toBe('not_found');
      // And Alex still has it.
      expect(await ownedBox(db!, alex.id)).not.toBeNull();
    });

    it('answers the same for a box that does not exist', async () => {
      // Not-found and not-yours are one answer, so probing ids teaches nothing.
      const alex = await makeManager();
      const result = await openBox(db!, {
        userId: alex.id,
        boxId: '00000000-0000-0000-0000-000000000000',
        seasonId,
      });
      expect(result.status).toBe('not_found');
    });
  });

  describe('what the database refuses outright', () => {
    it('will not let a box claim to be opened with no timestamp', async () => {
      const alex = await makeManager();

      await expectPgError(
        db!.insert(lootBoxes).values({
          userId: alex.id,
          state: 'OPENED',
          source: 'test',
          grantedAt: new Date('2026-07-30T12:00:00Z'),
          // openedAt deliberately absent
        }),
        {
          code: PG_ERROR.checkViolation,
          constraint: 'loot_boxes_opened_at_matches_state',
        },
      );
    });

    it('will not let an opening be rewritten', async () => {
      // The audit trail is append-only, and the database is what enforces it.
      const alex = await makeManager();
      const box = await grantOne(alex.id);
      setFixedRoll(0);
      await openBox(db!, { userId: alex.id, boxId: box.id, seasonId });

      await expectPgError(
        db!
          .update(boxOpenings)
          .set({ rarity: 'legendary' })
          .where(eq(boxOpenings.boxId, box.id)),
        { code: PG_ERROR.checkViolation },
      );
    });

    it('will not let a collectible change owner', async () => {
      // `16 §5.1`: a replacement manager must never inherit somebody's shelf.
      const alex = await makeManager('Alex');
      const zack = await makeManager('Zack');
      const box = await grantOne(alex.id);
      setFixedRoll(0);
      await openBox(db!, { userId: alex.id, boxId: box.id, seasonId });

      await expectPgError(
        db!
          .update(collectibles)
          .set({ userId: zack.id })
          .where(eq(collectibles.userId, alex.id)),
        { code: PG_ERROR.checkViolation },
      );
    });

    it('will not let a collectible be deleted', async () => {
      const alex = await makeManager();
      const box = await grantOne(alex.id);
      setFixedRoll(0);
      await openBox(db!, { userId: alex.id, boxId: box.id, seasonId });

      await expectPgError(
        db!.delete(collectibles).where(eq(collectibles.userId, alex.id)),
        { code: PG_ERROR.checkViolation },
      );
    });

    it('will not let a stored reward table be edited', async () => {
      await expectPgError(
        db!.update(rewardTables).set({ entries: [] }),
        { code: PG_ERROR.checkViolation },
      );
    });

    it('still allows a table to be signed off by clearing provisional', async () => {
      // The one legitimate later act on an existing table row (`16 §8`).
      await db!.update(rewardTables).set({ provisional: false });
      const [row] = await db!.select().from(rewardTables);
      expect(row!.provisional).toBe(false);
    });
  });

  describe('the counter tells the truth', () => {
    it('counts unopened boxes and owned collectibles', async () => {
      const alex = await makeManager();
      expect(await counterState(db!, alex.id)).toEqual({
        unopenedBoxes: 0,
        collectiblesOwned: 0,
      });

      const box = await grantOne(alex.id, 'a');
      await grantBox(db!, { userId: alex.id, grantKey: 'b', source: 'seed' });
      expect(await counterState(db!, alex.id)).toEqual({
        unopenedBoxes: 2,
        collectiblesOwned: 0,
      });

      setFixedRoll(0);
      await openBox(db!, { userId: alex.id, boxId: box.id, seasonId });
      expect(await counterState(db!, alex.id)).toEqual({
        unopenedBoxes: 1,
        collectiblesOwned: 1,
      });
    });

    it('opens the oldest box first', async () => {
      const alex = await makeManager();
      setFixedClock('2026-07-01T00:00:00Z');
      await grantBox(db!, { userId: alex.id, grantKey: 'old', source: 'seed' });
      setFixedClock('2026-07-20T00:00:00Z');
      await grantBox(db!, { userId: alex.id, grantKey: 'new', source: 'seed' });

      const first = await ownedBox(db!, alex.id);
      const [oldest] = await db!
        .select()
        .from(lootBoxes)
        .where(eq(lootBoxes.grantKey, 'old'));

      expect(first!.id).toBe(oldest!.id);
    });

    it('never hands over an item the manager already owns', async () => {
      /*
       * This used to assert the opposite — *"keeps duplicate pulls as separate
       * collectibles"* — and it was wrong about the specification the whole
       * time. `16 §8` reads **roll rarity → pick an unowned item in that tier**,
       * so the same roll twice must produce two different commons.
       *
       * Rewritten rather than deleted: the sequence it drives is exactly the one
       * that used to produce a duplicate, so it is the test that would notice if
       * the redirect were ever removed.
       */
      const alex = await makeManager();
      await grantBox(db!, { userId: alex.id, grantKey: 'a', source: 'seed' });
      await grantBox(db!, { userId: alex.id, grantKey: 'b', source: 'seed' });

      setFixedRoll(0);
      const one = await ownedBox(db!, alex.id);
      await openBox(db!, { userId: alex.id, boxId: one!.id, seasonId });
      const two = await ownedBox(db!, alex.id);
      await openBox(db!, { userId: alex.id, boxId: two!.id, seasonId });

      const owned = await db!.select().from(collectibles).where(eq(collectibles.userId, alex.id));
      expect(owned).toHaveLength(2);
      expect(owned[0]!.slug).not.toBe(owned[1]!.slug);
      // Same tier, though: the roll decided the rarity and nothing moved it.
      expect(owned[0]!.rarity).toBe(owned[1]!.rarity);
    });
  });

  /*
   * A manager with no seat this season — Armen, Berardo and Shant in the real
   * league: a co-owner and two people who played 2024 or 2025.
   *
   * `CLAUDE.md` separates **permanent manager identity** from seasonal roster
   * identity, and keeps collectibles permanent while tokens reset. So the split
   * is exact and worth pinning: **they own, they open, they showcase — and they
   * cannot spend.** The failure mode this guards against is the tempting one,
   * which is granting a seatless manager tokens so the surfaces stop looking
   * broken. That would invent a balance nothing awarded.
   */
  describe('a manager with no seat this season', () => {
    it('owns and opens a box, because a box is not seasonal', async () => {
      const departed = await makeManager('Berardo');
      const box = await grantOne(departed.id, 'test:seatless:box');

      setFixedRoll(0);
      const opened = await openBox(db!, { userId: departed.id, boxId: box.id, seasonId });

      expect(opened.status).toBe('opened');
      const owned = await db!
        .select()
        .from(collectibles)
        .where(eq(collectibles.userId, departed.id));
      expect(owned).toHaveLength(1);
    });

    it('has no wallet at all, rather than a wallet reading zero', async () => {
      const departed = await makeManager('Berardo');
      const [season] = await db!.insert(seasons).values({ year: 2026 }).returning();

      // Null, not 0. A zero balance and "no tab" are different facts, and a
      // surface that cannot tell them apart says the wrong thing to somebody.
      expect(await wallet(db!, { userId: departed.id, seasonId: season!.id })).toBeNull();
    });

    it('cannot be given tokens, because there is no seat to give them to', async () => {
      const departed = await makeManager('Berardo');
      const [season] = await db!.insert(seasons).values({ year: 2026 }).returning();
      await ensureEconomyConfig(db!, season!.id);

      // The database refuses at the seat, not a service at the surface. This is
      // what makes "grant them 250 so it looks right" impossible rather than
      // merely discouraged.
      await expect(
        applyTokenDelta(db!, {
          userId: departed.id,
          seasonId: season!.id,
          amount: 250,
          reason: 'SEASON_START',
          description: 'Tony opens a tab.',
          idempotencyKey: 'test:seatless:tab',
        }),
      ).rejects.toThrow();
    });
  });

  describe('the reward table is stored append-only', () => {
    it('stores the current version once, however often it is ensured', async () => {
      await ensureRewardTable(db!);
      await ensureRewardTable(db!);

      const rows = await db!.select().from(rewardTables);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.version).toBe(standardRewardTable().version);
      expect(rows[0]!.provisional).toBe(true);
      expect(rows[0]!.entries).toHaveLength(standardRewardTable().entries.length);
    });
  });
});
