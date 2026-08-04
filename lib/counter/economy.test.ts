import { and, eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearClock, setFixedClock } from '@/lib/clock';
import { closePool, getDb } from '@/lib/db';
import {
  boxOpenings,
  collectibles,
  lootBoxes,
  seasonMemberships,
  seasons,
  tokenTransactions,
  users,
} from '@/lib/db/schema';
import { PG_ERROR, expectPgError, resetDatabase } from '@/lib/db/test-helpers';

import { ensureRewardTable, grantBox, openBox, purchaseBox } from './boxes';
import { catalog } from './catalog';
import { grantKeyFor, grantSeasonalBoxes, milestonesDue, MIDSEASON_WEEK } from './grants';
import { standardRewardTable } from './rewards';
import { clearRandomSource, setFixedRoll } from './rng';
import { applyTokenDelta, ensureEconomyConfig, salvageValue, wallet } from './tokens';

/**
 * The 2026-08-04 economy ruling, against a real Postgres.
 *
 * Three things landed together and they are tested together because they are one
 * economy: the box costs **200**, every active seat is given **two free boxes a
 * season**, and a spare from a completed tier **converts to tokens**.
 *
 * Every guarantee below is a database guarantee — a unique grant key, a check
 * constraint, an advisory lock, a trigger. None of them can be demonstrated
 * against a mock, because in each case what is being tested is what happens when
 * application code asks for something wrong.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

describe.skipIf(!hasDatabase)('the economy ruling', () => {
  beforeEach(async () => {
    await resetDatabase(db!);
    await ensureRewardTable(db!);
    setFixedClock('2026-09-15T12:00:00Z');
  });

  afterEach(() => {
    clearClock();
    clearRandomSource();
  });

  afterAll(async () => {
    if (hasDatabase) await closePool();
  });

  /** A season with `rosters` seated managers, and its stored economy. */
  async function league(
    input: { year?: number; rosters?: number; retired?: readonly number[] } = {},
  ) {
    const [season] = await db!
      .insert(seasons)
      .values({ year: input.year ?? 2026 })
      .returning();

    const seats: { userId: string; membershipId: string; rosterId: number }[] = [];
    for (let rosterId = 1; rosterId <= (input.rosters ?? 3); rosterId += 1) {
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
          isActive: !(input.retired ?? []).includes(rosterId),
        })
        .returning();
      seats.push({ userId: user!.id, membershipId: membership!.id, rosterId });
    }

    const economy = await ensureEconomyConfig(db!, season!.id);
    return { season: season!, seats, economy };
  }

  /** Put tokens on a seat's tab, through the one write path there is. */
  async function fund(userId: string, seasonId: string, amount: number, key: string) {
    await applyTokenDelta(db!, {
      userId,
      seasonId,
      amount,
      reason: 'SEASON_START',
      description: 'Tony opens a tab.',
      idempotencyKey: key,
    });
  }

  /** The lowest roll that resolves to `slug`. */
  function rollFor(slug: string): number {
    const table = standardRewardTable();
    let cursor = 0;
    for (const entry of table.entries) {
      if (entry.slug === slug) return cursor;
      cursor += entry.weight;
    }
    throw new Error(`no entry for ${slug}`);
  }

  const tier = (rarity: string): readonly string[] =>
    catalog().filter((item) => item.rarity === rarity).map((item) => item.slug);

  /** Open one forced box, granting it first. Returns what came out. */
  async function pull(
    userId: string,
    seasonId: string | null,
    slug: string,
    key: string,
  ) {
    await grantBox(db!, { userId, grantKey: key, source: 'test' });
    const [box] = await db!
      .select({ id: lootBoxes.id })
      .from(lootBoxes)
      .where(eq(lootBoxes.grantKey, key));

    setFixedRoll(rollFor(slug));
    try {
      return await openBox(db!, { userId, boxId: box!.id, seasonId });
    } finally {
      clearRandomSource();
    }
  }

  /* --- §2. The price -------------------------------------------------- */

  describe('the box price', () => {
    it('is 200, and comes from the stored config rather than a constant', async () => {
      const { season, seats, economy } = await league();
      expect(economy.values.standardBoxPriceTokens).toBe(200);

      await fund(seats[0]!.userId, season.id, 250, 'open:0');
      const bought = await purchaseBox(db!, {
        userId: seats[0]!.userId,
        seasonId: season.id,
        idempotencyKey: 'buy:1',
      });

      expect(bought).toMatchObject({ status: 'bought', spent: 200 });
      expect((await wallet(db!, { userId: seats[0]!.userId, seasonId: season.id }))?.balance).toBe(50);
    });

    it('refuses a second purchase out of an opening balance, which 50 allowed', async () => {
      /*
       * The ruling's whole point, as an observable fact. At 50 an opening
       * balance bought five boxes; at 200 it buys one, which is what moved the
       * simulation from 31.5 boxes a season into the 6–12 range.
       */
      const { season, seats } = await league();
      await fund(seats[0]!.userId, season.id, 250, 'open:0');

      await purchaseBox(db!, {
        userId: seats[0]!.userId,
        seasonId: season.id,
        idempotencyKey: 'buy:1',
      });
      const second = await purchaseBox(db!, {
        userId: seats[0]!.userId,
        seasonId: season.id,
        idempotencyKey: 'buy:2',
      });

      expect(second).toMatchObject({ status: 'insufficient_tokens', price: 200, balance: 50 });
    });

    it('lets two concurrent purchases overdraw nothing, whatever the timing', async () => {
      /*
       * Exactly enough for one box, and two requests arriving together. The
       * balance check is `CHECK (token_balance >= 0)` evaluated inside the
       * statement that moves the balance, so the loser fails at the database
       * rather than at a read-then-decide in application code.
       */
      const { season, seats } = await league();
      await fund(seats[0]!.userId, season.id, 200, 'open:0');

      const results = await Promise.all(
        [1, 2].map((n) =>
          purchaseBox(db!, {
            userId: seats[0]!.userId,
            seasonId: season.id,
            idempotencyKey: `buy:${String(n)}`,
          }),
        ),
      );

      expect(results.filter((r) => r.status === 'bought')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'insufficient_tokens')).toHaveLength(1);
      expect((await wallet(db!, { userId: seats[0]!.userId, seasonId: season.id }))?.balance).toBe(0);
    });
  });

  /* --- §3. The seasonal grants ---------------------------------------- */

  describe('the two seasonal grants', () => {
    it('gives every active seat the opening box before a ball is thrown', async () => {
      const { season, seats } = await league();
      const report = await grantSeasonalBoxes(db!, { seasonYear: 2026, week: 0 });

      expect(report).toMatchObject({ seasonId: season.id, seats: 3, granted: 3, refusal: null });
      expect(report.milestones).toEqual(['SEASON_OPENING']);

      for (const seat of seats) {
        const boxes = await db!
          .select()
          .from(lootBoxes)
          .where(eq(lootBoxes.userId, seat.userId));
        expect(boxes).toHaveLength(1);
        expect(boxes[0]!.source).toBe('season_grant:SEASON_OPENING');
      }
    });

    it('adds the midseason box at the halfway week, and only then', async () => {
      await league();
      await grantSeasonalBoxes(db!, { seasonYear: 2026, week: MIDSEASON_WEEK - 1 });
      const before = await db!.select({ n: sql<number>`count(*)::int` }).from(lootBoxes);
      expect(before[0]!.n).toBe(3);

      await grantSeasonalBoxes(db!, { seasonYear: 2026, week: MIDSEASON_WEEK });
      const after = await db!.select({ n: sql<number>`count(*)::int` }).from(lootBoxes);
      expect(after[0]!.n).toBe(6);
    });

    it('is exactly two a season however many times it runs', async () => {
      /*
       * The Tuesday job calls this every week. Fourteen calls must leave two
       * boxes per manager, and the mechanism is `loot_boxes.grant_key UNIQUE`
       * rather than a check in the service — there is no `already_granted` read
       * anywhere in `grants.ts`.
       */
      const { seats } = await league();
      for (let week = 1; week <= 14; week += 1) {
        await grantSeasonalBoxes(db!, { seasonYear: 2026, week });
      }

      for (const seat of seats) {
        const boxes = await db!
          .select()
          .from(lootBoxes)
          .where(eq(lootBoxes.userId, seat.userId));
        expect(boxes).toHaveLength(2);
      }
    });

    it('does not re-grant a box that has already been opened', async () => {
      // The case that matters: a re-grant of an opened box is a reroll dressed
      // up as a schedule.
      const { season, seats } = await league({ rosters: 1 });
      await grantSeasonalBoxes(db!, { seasonYear: 2026, week: 0 });

      const [box] = await db!
        .select()
        .from(lootBoxes)
        .where(eq(lootBoxes.userId, seats[0]!.userId));
      setFixedRoll(0);
      await openBox(db!, { userId: seats[0]!.userId, boxId: box!.id, seasonId: season.id });

      const again = await grantSeasonalBoxes(db!, { seasonYear: 2026, week: 0 });
      expect(again.granted).toBe(0);
      expect(again.alreadyGranted).toBe(1);

      const boxes = await db!
        .select()
        .from(lootBoxes)
        .where(eq(lootBoxes.userId, seats[0]!.userId));
      expect(boxes).toHaveLength(1);
      expect(boxes[0]!.state).toBe('OPENED');
    });

    it('skips a retired seat entirely', async () => {
      const { seats } = await league({ rosters: 3, retired: [2] });
      const report = await grantSeasonalBoxes(db!, { seasonYear: 2026, week: 14 });

      expect(report.seats).toBe(2);
      expect(report.granted).toBe(4);

      const retired = await db!
        .select()
        .from(lootBoxes)
        .where(eq(lootBoxes.userId, seats[1]!.userId));
      expect(retired).toHaveLength(0);
    });

    it('gives a late-joining manager both boxes the first time it runs', async () => {
      /*
       * A replacement seated in week 9 has not missed anything: the grants are
       * keyed to the milestone, not to the week they were noticed, and
       * `milestonesDue` is monotonic so a catch-up settles the whole season.
       */
      const { season } = await league({ rosters: 1 });
      await grantSeasonalBoxes(db!, { seasonYear: 2026, week: 9 });

      const [latecomer] = await db!.insert(users).values({ displayName: 'Replacement' }).returning();
      await db!
        .insert(seasonMemberships)
        .values({ seasonId: season.id, userId: latecomer!.id, rosterId: 9 });

      const report = await grantSeasonalBoxes(db!, { seasonYear: 2026, week: 9 });
      expect(report.granted).toBe(2);

      const boxes = await db!
        .select()
        .from(lootBoxes)
        .where(eq(lootBoxes.userId, latecomer!.id));
      expect(boxes.map((box) => box.source).sort()).toEqual([
        'season_grant:MIDSEASON',
        'season_grant:SEASON_OPENING',
      ]);
    });

    it('is scoped to the season, so a new season grants two more', async () => {
      const { seats } = await league({ year: 2026, rosters: 1 });
      await grantSeasonalBoxes(db!, { seasonYear: 2026, week: 14 });

      const [next] = await db!.insert(seasons).values({ year: 2027 }).returning();
      await db!
        .insert(seasonMemberships)
        .values({ seasonId: next!.id, userId: seats[0]!.userId, rosterId: 1 });
      await ensureEconomyConfig(db!, next!.id);

      const report = await grantSeasonalBoxes(db!, { seasonYear: 2027, week: 14 });
      expect(report.granted).toBe(2);

      const boxes = await db!
        .select()
        .from(lootBoxes)
        .where(eq(lootBoxes.userId, seats[0]!.userId));
      expect(boxes).toHaveLength(4);
    });

    it('refuses a finalized season rather than writing a dated event into it', async () => {
      const { season } = await league({ year: 2025 });
      await db!
        .update(seasons)
        .set({ finalizedAt: new Date('2026-01-15T00:00:00Z') })
        .where(eq(seasons.id, season.id));

      const report = await grantSeasonalBoxes(db!, { seasonYear: 2025, week: 14 });
      expect(report).toMatchObject({ refusal: 'season-closed', granted: 0 });
      expect((await db!.select({ n: sql<number>`count(*)::int` }).from(lootBoxes))[0]!.n).toBe(0);
    });

    it('refuses a season that does not exist', async () => {
      expect(await grantSeasonalBoxes(db!, { seasonYear: 1999, week: 3 })).toMatchObject({
        refusal: 'no-season',
      });
    });

    it('grants once when two runs race, because the key is the lock', async () => {
      const { seats } = await league({ rosters: 2 });
      const [a, b] = await Promise.all([
        grantSeasonalBoxes(db!, { seasonYear: 2026, week: 14 }),
        grantSeasonalBoxes(db!, { seasonYear: 2026, week: 14 }),
      ]);

      expect(a.granted + b.granted).toBe(4);
      for (const seat of seats) {
        const boxes = await db!
          .select()
          .from(lootBoxes)
          .where(eq(lootBoxes.userId, seat.userId));
        expect(boxes).toHaveLength(2);
      }
    });

    it('names the occasion, so the key is readable and stable', () => {
      expect(milestonesDue(0)).toEqual(['SEASON_OPENING']);
      expect(milestonesDue(MIDSEASON_WEEK)).toEqual(['SEASON_OPENING', 'MIDSEASON']);
      expect(grantKeyFor({ seasonId: 's', milestone: 'MIDSEASON', userId: 'u' })).toBe(
        'season-grant:s:MIDSEASON:u',
      );
    });
  });

  /* --- §5. Duplicate salvage ------------------------------------------ */

  describe('a spare from a completed tier', () => {
    /** Own every legendary, the smallest tier — two boxes. */
    async function completeLegendaries(userId: string, seasonId: string) {
      const legendaries = tier('legendary');
      for (const [index, slug] of legendaries.entries()) {
        const result = await pull(userId, seasonId, slug, `leg:${String(index)}:${userId}`);
        expect(result.status).toBe('opened');
      }
      return legendaries;
    }

    it('converts to tokens instead of handing over a second copy', async () => {
      const { season, seats } = await league({ rosters: 1 });
      const userId = seats[0]!.userId;
      await fund(userId, season.id, 250, 'open:0');

      const legendaries = await completeLegendaries(userId, season.id);
      const before = (await wallet(db!, { userId, seasonId: season.id }))!.balance;

      const spare = await pull(userId, season.id, legendaries[0]!, `spare:${userId}`);

      expect(spare).toMatchObject({
        status: 'opened',
        reveal: { rarity: 'legendary', salvageTokens: 120, slug: legendaries[0] },
      });
      expect((await wallet(db!, { userId, seasonId: season.id }))!.balance).toBe(before + 120);

      // And nothing new was added to the shelf.
      const owned = await db!.select().from(collectibles).where(eq(collectibles.userId, userId));
      expect(owned).toHaveLength(2);
    });

    it('pays what the stored economy says, by rarity', async () => {
      const { economy } = await league({ rosters: 1 });
      expect(salvageValue(economy.values, 'common')).toBe(20);
      expect(salvageValue(economy.values, 'rare')).toBe(40);
      expect(salvageValue(economy.values, 'epic')).toBe(70);
      expect(salvageValue(economy.values, 'legendary')).toBe(120);
    });

    it('records the payment on the opening, and the ledger reason with it', async () => {
      const { season, seats } = await league({ rosters: 1 });
      const userId = seats[0]!.userId;
      const legendaries = await completeLegendaries(userId, season.id);
      await pull(userId, season.id, legendaries[0]!, `spare:${userId}`);

      const [salvaged] = await db!
        .select()
        .from(boxOpenings)
        .where(and(eq(boxOpenings.userId, userId), eq(boxOpenings.outcome, 'SALVAGE')));

      expect(salvaged!.salvageTokens).toBe(120);
      expect(salvaged!.tokenTransactionId).not.toBeNull();

      const [payment] = await db!
        .select()
        .from(tokenTransactions)
        .where(eq(tokenTransactions.id, salvaged!.tokenTransactionId!));
      expect(payment!.reasonCode).toBe('DUPLICATE_SALVAGE');
      expect(payment!.amount).toBe(120);
    });

    it('pays once when the same box is opened twice', async () => {
      /*
       * The ruling: a duplicate reveal must never award twice.
       * `box_openings.box_id UNIQUE` plus the ledger's key on the box id, and the
       * replay reads the recorded payment back rather than recomputing it.
       */
      const { season, seats } = await league({ rosters: 1 });
      const userId = seats[0]!.userId;
      const legendaries = await completeLegendaries(userId, season.id);

      await grantBox(db!, { userId, grantKey: 'spare-box', source: 'test' });
      const [box] = await db!
        .select({ id: lootBoxes.id })
        .from(lootBoxes)
        .where(eq(lootBoxes.grantKey, 'spare-box'));

      setFixedRoll(rollFor(legendaries[0]!));
      const first = await openBox(db!, { userId, boxId: box!.id, seasonId: season.id });
      const second = await openBox(db!, { userId, boxId: box!.id, seasonId: season.id });
      clearRandomSource();

      expect(first).toMatchObject({ reveal: { salvageTokens: 120, replayed: false } });
      expect(second).toMatchObject({ reveal: { salvageTokens: 120, replayed: true } });

      const payments = await db!
        .select()
        .from(tokenTransactions)
        .where(eq(tokenTransactions.reasonCode, 'DUPLICATE_SALVAGE'));
      expect(payments).toHaveLength(1);
    });

    it('pays once when the same box is opened concurrently', async () => {
      const { season, seats } = await league({ rosters: 1 });
      const userId = seats[0]!.userId;
      const legendaries = await completeLegendaries(userId, season.id);

      await grantBox(db!, { userId, grantKey: 'spare-box', source: 'test' });
      const [box] = await db!
        .select({ id: lootBoxes.id })
        .from(lootBoxes)
        .where(eq(lootBoxes.grantKey, 'spare-box'));

      setFixedRoll(rollFor(legendaries[0]!));
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          openBox(db!, { userId, boxId: box!.id, seasonId: season.id }),
        ),
      );
      clearRandomSource();

      expect(results.every((r) => r.status === 'opened')).toBe(true);
      const payments = await db!
        .select()
        .from(tokenTransactions)
        .where(eq(tokenTransactions.reasonCode, 'DUPLICATE_SALVAGE'));
      expect(payments).toHaveLength(1);
    });

    it('leaves the box unopened when there is nowhere to pay the salvage', async () => {
      /*
       * A manager with no seat this season. The alternatives are handing over a
       * duplicate the rules forbid, or opening the box for nothing — and the
       * ruling's own wording is that a duplicate reveal must never silently
       * disappear. So the box stays on the tray.
       */
      const [departed] = await db!.insert(users).values({ displayName: 'Berardo' }).returning();
      const legendaries = tier('legendary');
      for (const [index, slug] of legendaries.entries()) {
        await pull(departed!.id, null, slug, `leg:${String(index)}`);
      }

      const result = await pull(departed!.id, null, legendaries[0]!, 'spare');
      expect(result.status).toBe('salvage_unavailable');

      const [box] = await db!
        .select()
        .from(lootBoxes)
        .where(eq(lootBoxes.grantKey, 'spare'));
      expect(box!.state).toBe('UNOPENED');
      expect(box!.openedAt).toBeNull();
    });

    it('completes a collection without ever repeating an item', async () => {
      /*
       * Twenty-four boxes, every roll forced to the same common. Under the old
       * behaviour that is twenty-four squeeze bottles; under `16 §8` it fills the
       * common tier and then salvages, and no other tier is touched.
       */
      const { season, seats } = await league({ rosters: 1 });
      const userId = seats[0]!.userId;
      const commons = tier('common');

      for (let n = 0; n < commons.length + 2; n += 1) {
        await pull(userId, season.id, commons[0]!, `many:${String(n)}`);
      }

      const owned = await db!.select().from(collectibles).where(eq(collectibles.userId, userId));
      expect(owned).toHaveLength(commons.length);
      expect(new Set(owned.map((row) => row.slug)).size).toBe(commons.length);

      const salvaged = await db!
        .select()
        .from(boxOpenings)
        .where(and(eq(boxOpenings.userId, userId), eq(boxOpenings.outcome, 'SALVAGE')));
      expect(salvaged).toHaveLength(2);
      expect(salvaged.every((row) => row.rarity === 'common')).toBe(true);
    });

    it('never hands the same item to two boxes opened at once', async () => {
      /*
       * The race the advisory lock exists for. Both boxes roll the same common;
       * without a manager-scoped lock both would read the same empty collection,
       * both would find the rolled item unowned, and the manager would end with
       * two copies of it.
       */
      const { season, seats } = await league({ rosters: 1 });
      const userId = seats[0]!.userId;
      const common = tier('common')[0]!;

      for (const key of ['race:a', 'race:b']) {
        await grantBox(db!, { userId, grantKey: key, source: 'test' });
      }
      const boxes = await db!
        .select({ id: lootBoxes.id })
        .from(lootBoxes)
        .where(eq(lootBoxes.userId, userId));

      setFixedRoll(rollFor(common));
      await Promise.all(
        boxes.map((box) => openBox(db!, { userId, boxId: box.id, seasonId: season.id })),
      );
      clearRandomSource();

      const owned = await db!.select().from(collectibles).where(eq(collectibles.userId, userId));
      expect(owned).toHaveLength(2);
      expect(new Set(owned.map((row) => row.slug)).size).toBe(2);
    });
  });

  /* --- What the database refuses outright ----------------------------- */

  describe('what the database refuses outright', () => {
    it('refuses a salvage row that paid nothing', async () => {
      const { season, seats } = await league({ rosters: 1 });
      const userId = seats[0]!.userId;
      await grantBox(db!, { userId, grantKey: 'k', source: 'test' });
      const [box] = await db!
        .select({ id: lootBoxes.id })
        .from(lootBoxes)
        .where(eq(lootBoxes.grantKey, 'k'));

      await expectPgError(
        db!.insert(boxOpenings).values({
          boxId: box!.id,
          userId,
          collectibleSlug: tier('common')[0]!,
          rarity: 'common',
          rewardTableVersion: standardRewardTable().version,
          roll: 0,
          outcome: 'SALVAGE',
          salvageTokens: 20,
          // No transaction. The whole failure the constraint exists for.
          openedAt: new Date('2026-09-15T12:00:00Z'),
        }),
        { code: PG_ERROR.checkViolation, constraint: 'box_openings_salvage_is_paid' },
      );
      // The season is referenced so the fixture is not silently unused.
      expect(season.year).toBe(2026);
    });

    it('refuses tokens recorded against an opening that kept its item', async () => {
      const { season, seats } = await league({ rosters: 1 });
      const userId = seats[0]!.userId;
      await fund(userId, season.id, 100, 'open:0');
      await grantBox(db!, { userId, grantKey: 'k', source: 'test' });
      const [box] = await db!
        .select({ id: lootBoxes.id })
        .from(lootBoxes)
        .where(eq(lootBoxes.grantKey, 'k'));

      await expectPgError(
        db!.insert(boxOpenings).values({
          boxId: box!.id,
          userId,
          collectibleSlug: tier('common')[0]!,
          rarity: 'common',
          rewardTableVersion: standardRewardTable().version,
          roll: 0,
          outcome: 'ITEM',
          salvageTokens: 20,
          openedAt: new Date('2026-09-15T12:00:00Z'),
        }),
        { code: PG_ERROR.checkViolation, constraint: 'box_openings_salvage_pays_tokens' },
      );
    });

    it('refuses a collectible minted from a salvaged opening', async () => {
      const { season, seats } = await league({ rosters: 1 });
      const userId = seats[0]!.userId;
      const legendaries = await completeTier(userId, season.id, 'legendary');
      await pull(userId, season.id, legendaries[0]!, 'spare');

      const [salvaged] = await db!
        .select()
        .from(boxOpenings)
        .where(and(eq(boxOpenings.userId, userId), eq(boxOpenings.outcome, 'SALVAGE')));

      await expectPgError(
        db!.insert(collectibles).values({
          userId,
          slug: legendaries[0]!,
          rarity: 'legendary',
          acquiredAt: new Date('2026-09-15T12:00:00Z'),
          sourceOpeningId: salvaged!.id,
        }),
        { code: PG_ERROR.checkViolation },
      );
    });

    it('keeps an opening append-only even now that it carries a payment', async () => {
      const { season, seats } = await league({ rosters: 1 });
      const userId = seats[0]!.userId;
      await pull(userId, season.id, tier('common')[0]!, 'k');

      const [opening] = await db!
        .select()
        .from(boxOpenings)
        .where(eq(boxOpenings.userId, userId));

      await expectPgError(
        db!
          .update(boxOpenings)
          .set({ salvageTokens: 9999 })
          .where(eq(boxOpenings.id, opening!.id)),
        { code: PG_ERROR.checkViolation },
      );
    });
  });

  /** Own every item of a rarity. Returns the tier's slugs in table order. */
  async function completeTier(userId: string, seasonId: string, rarity: string) {
    const slugs = tier(rarity);
    for (const [index, slug] of slugs.entries()) {
      await pull(userId, seasonId, slug, `${rarity}:${String(index)}:${userId}`);
    }
    return slugs;
  }
});
