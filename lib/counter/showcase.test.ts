import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearClock, setFixedClock } from '@/lib/clock';
import { closePool, getDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { PG_ERROR, expectPgError, resetDatabase } from '@/lib/db/test-helpers';

import { ensureRewardTable, grantBox, openBox, ownedBox } from './boxes';
import { clearRandomSource, setFixedRoll } from './rng';
import {
  leagueShowcase,
  setShowcase,
  showcaseChoices,
  showcaseCount,
  showcaseFor,
} from './showcase';

/**
 * The Showcase.
 *
 * The load-bearing rule is **you may only show what you own** (`18 §4` puts the
 * item in front of the whole league), and it is enforced by a trigger — so the
 * tests that matter most ask the database for something dishonest and check that it
 * refuses.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

describe.skipIf(!hasDatabase)('the showcase', () => {
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

  async function manager(displayName: string) {
    const [row] = await db!.insert(users).values({ displayName }).returning();
    return row!;
  }

  /** Open one box with a forced roll and return the collectible id. */
  async function pull(userId: string, roll: number, key: string): Promise<string> {
    await grantBox(db!, { userId, grantKey: key, source: 'test' });
    const box = await ownedBox(db!, userId);
    setFixedRoll(roll);
    const result = await openBox(db!, { userId, boxId: box!.id });
    if (result.status !== 'opened') throw new Error('the test box did not open');
    const choices = await showcaseChoices(db!, userId);
    return choices[choices.length - 1]!.collectibleId;
  }

  it('starts with nothing out, which is an ordinary state', async () => {
    const alex = await manager('Alex');
    expect(await showcaseFor(db!, alex.id)).toBeNull();
    expect(await showcaseCount(db!)).toBe(0);
  });

  it('shows a chosen item with its name and rarity', async () => {
    const alex = await manager('Alex');
    const id = await pull(alex.id, 0, 'a');

    expect(await setShowcase(db!, { userId: alex.id, collectibleId: id })).toEqual({
      status: 'set',
    });

    const shown = await showcaseFor(db!, alex.id);
    expect(shown?.collectibleId).toBe(id);
    expect(shown?.name).toBeTruthy();
    expect(shown?.rarity).toBeTruthy();
    expect(await showcaseCount(db!)).toBe(1);
  });

  it('clears the shelf, and clearing is a first-class outcome', async () => {
    // Taking your item back off is something a manager wants to do. `18 §4` allows
    // no clout, so having nothing out costs nothing and must be reachable.
    const alex = await manager('Alex');
    const id = await pull(alex.id, 0, 'a');
    await setShowcase(db!, { userId: alex.id, collectibleId: id });

    expect(await setShowcase(db!, { userId: alex.id, collectibleId: null })).toEqual({
      status: 'cleared',
    });
    expect(await showcaseFor(db!, alex.id)).toBeNull();
  });

  it('replaces a previous choice rather than accumulating', async () => {
    // One item. The column is the mechanism that makes that structural rather than
    // a rule somebody has to remember.
    const alex = await manager('Alex');
    const first = await pull(alex.id, 0, 'a');
    const second = await pull(alex.id, 3999, 'b');

    await setShowcase(db!, { userId: alex.id, collectibleId: first });
    await setShowcase(db!, { userId: alex.id, collectibleId: second });

    expect((await showcaseFor(db!, alex.id))?.collectibleId).toBe(second);
  });

  describe('you may only show what you own', () => {
    it("refuses another manager's collectible through the service", async () => {
      const alex = await manager('Alex');
      const zack = await manager('Zack');
      const alexItem = await pull(alex.id, 0, 'a');

      expect(await setShowcase(db!, { userId: zack.id, collectibleId: alexItem })).toEqual({
        status: 'not_yours',
      });
      expect(await showcaseFor(db!, zack.id)).toBeNull();
    });

    it('refuses it at the database even when the service is bypassed', async () => {
      // The guard that matters. A future caller, a migration, or a hand-run UPDATE
      // all pass through this.
      const alex = await manager('Alex');
      const zack = await manager('Zack');
      const alexItem = await pull(alex.id, 0, 'a');

      await expectPgError(
        db!
          .update(users)
          .set({ showcaseCollectibleId: alexItem })
          .where(eq(users.id, zack.id)),
        { code: PG_ERROR.checkViolation },
      );
    });

    it('answers the same for a collectible that does not exist', async () => {
      const alex = await manager('Alex');
      expect(
        await setShowcase(db!, {
          userId: alex.id,
          collectibleId: '00000000-0000-0000-0000-000000000000',
        }),
      ).toEqual({ status: 'not_yours' });
    });
  });

  describe('the choices offered', () => {
    it('offers nothing before anything is pulled', async () => {
      const alex = await manager('Alex');
      expect(await showcaseChoices(db!, alex.id)).toEqual([]);
    });

    it('offers one entry per distinct item, not one per copy', async () => {
      // Two identical options is a worse picker than one, and "the second parmesan
      // shaker" is not a choice anybody wants to make.
      const alex = await manager('Alex');
      await pull(alex.id, 0, 'a');
      await pull(alex.id, 0, 'b');

      const choices = await showcaseChoices(db!, alex.id);
      expect(choices).toHaveLength(1);
    });

    it('offers the earliest copy, so the pick is stable', async () => {
      const alex = await manager('Alex');
      setFixedClock('2026-07-01T00:00:00Z');
      const first = await pull(alex.id, 0, 'a');
      setFixedClock('2026-07-20T00:00:00Z');
      await pull(alex.id, 0, 'b');

      const choices = await showcaseChoices(db!, alex.id);
      expect(choices[0]!.collectibleId).toBe(first);
    });
  });

  describe('the league wall', () => {
    it('lists every manager, including those showing nothing', async () => {
      // Omitting them would make "has not picked" look like "is not in this league",
      // and the empty spots are half of what makes the wall worth looking at.
      const alex = await manager('Alex');
      await manager('Zack');
      const id = await pull(alex.id, 0, 'a');
      await setShowcase(db!, { userId: alex.id, collectibleId: id });

      const wall = await leagueShowcase(db!);
      expect(wall).toHaveLength(2);
      expect(wall.find((e) => e.displayName === 'Alex')?.item).not.toBeNull();
      expect(wall.find((e) => e.displayName === 'Zack')?.item).toBeNull();
    });

    it('is ordered by name, so the wall does not reshuffle between visits', async () => {
      await manager('Zack');
      await manager('Alex');
      await manager('Matty B');

      const wall = await leagueShowcase(db!);
      expect(wall.map((e) => e.displayName)).toEqual(['Alex', 'Matty B', 'Zack']);
    });

    it('keeps a retired manager on the wall', async () => {
      // `16 §5.1` retires rather than deletes so history survives, and what somebody
      // was showing when they left is part of that history.
      const gone = await manager('Departed');
      const id = await pull(gone.id, 0, 'a');
      await setShowcase(db!, { userId: gone.id, collectibleId: id });
      await db!.update(users).set({ isRetired: true }).where(eq(users.id, gone.id));

      const wall = await leagueShowcase(db!);
      expect(wall.find((e) => e.displayName === 'Departed')?.item).not.toBeNull();
    });
  });
});
