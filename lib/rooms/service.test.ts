import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearClock, now, setFixedClock } from '@/lib/clock';
import { ensureRewardTable, grantBox, openBox, ownedBox } from '@/lib/counter/boxes';
import { catalog } from '@/lib/counter/catalog';
import { clearRandomSource, setFixedRoll } from '@/lib/counter/rng';
import { showcaseChoices } from '@/lib/counter/showcase';
import { closePool, getDb } from '@/lib/db';
import { collectibles, roomPlacements, rooms, seasonMemberships, seasons, users } from '@/lib/db/schema';
import { PG_ERROR, expectPgError, resetDatabase } from '@/lib/db/test-helpers';

import {
  clearSlot,
  corridor,
  ensureRoom,
  place,
  placeable,
  roomFor,
  setTheme,
  visitable,
} from './service';

/**
 * The basement, against a real Postgres.
 *
 * The load-bearing rules are **you may only display what you own**, **one thing
 * per place**, **one place per thing** and **inventory ≠ placement** (`16`'s P6
 * exit criterion). The first three are database constraints, so the tests that
 * matter most ask Postgres for something dishonest and check it refuses; the
 * fourth is tested by taking a room apart and asserting the collection did not
 * move.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

/* No test below fills a tier, so no opening can reach `16 §8`'s salvage. */
const seasonId: string | null = null;

describe.skipIf(!hasDatabase)('a manager’s room', () => {
  let nextRoster = 1;

  beforeEach(async () => {
    await resetDatabase(db!);
    await ensureRewardTable(db!);
    setFixedClock('2026-08-09T12:00:00Z');
    nextRoster = 1;
  });

  afterEach(() => {
    clearClock();
    clearRandomSource();
  });

  afterAll(async () => {
    if (hasDatabase) await closePool();
  });

  /** A manager with a live 2026 seat, because that is what the league is. */
  async function manager(displayName: string, active = true) {
    const [row] = await db!.insert(users).values({ displayName }).returning();
    const [existing] = await db!.select().from(seasons).where(eq(seasons.year, 2026)).limit(1);
    const season = existing ?? (await db!.insert(seasons).values({ year: 2026 }).returning())[0]!;
    await db!.insert(seasonMemberships).values({
      seasonId: season.id,
      userId: row!.id,
      rosterId: nextRoster++,
      isActive: active,
    });
    return row!;
  }

  /** Open one box with a forced roll and return what came out. */
  async function pull(userId: string, roll: number, key: string): Promise<string> {
    await grantBox(db!, { userId, grantKey: key, source: 'test' });
    const box = await ownedBox(db!, userId);
    setFixedRoll(roll);
    const result = await openBox(db!, { userId, boxId: box!.id, seasonId });
    if (result.status !== 'opened') throw new Error('the test box did not open');
    const choices = await showcaseChoices(db!, userId);
    return choices[choices.length - 1]!.collectibleId;
  }

  /* --- The room itself --------------------------------------------------- */

  it('is created on first visit, and only once however many visits arrive', async () => {
    const alex = await manager('Alex');

    // Concurrent, because that is the case the UNIQUE constraint exists for:
    // two tabs opening `/rooms` at the same instant.
    const [a, b, c] = await Promise.all([
      ensureRoom(db!, alex.id),
      ensureRoom(db!, alex.id),
      ensureRoom(db!, alex.id),
    ]);

    expect(a.id).toBe(b.id);
    expect(b.id).toBe(c.id);

    const all = await db!.select().from(rooms).where(eq(rooms.userId, alex.id));
    expect(all).toHaveLength(1);
  });

  it('refuses a second room outright, so the guarantee is not the service’s', async () => {
    const alex = await manager('Alex');
    const room = await ensureRoom(db!, alex.id);
    expect(room.id).toBeTruthy();

    await expectPgError(
      db!.insert(rooms).values({ userId: alex.id, createdAt: now(), updatedAt: now() }),
      { code: PG_ERROR.uniqueViolation, constraint: 'rooms_user_id_unique' },
    );
  });

  it('starts in the storeroom with nothing in it', async () => {
    const alex = await manager('Alex');
    const room = await roomFor(db!, alex.id);

    expect(room?.theme).toBe('storeroom');
    expect(room?.placed).toEqual({});
    expect(room?.rings).toEqual([]);
    expect(room?.holdings).toBe(0);
  });

  it('answers null for somebody who is not a person, so probing ids teaches nothing', async () => {
    expect(await roomFor(db!, '00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  /* --- Placement --------------------------------------------------------- */

  it('puts an owned thing in a place, and reads it back with its name', async () => {
    const alex = await manager('Alex');
    const item = await pull(alex.id, 0, 'a');

    expect(await place(db!, { userId: alex.id, slot: 'shelf_left', collectibleId: item })).toEqual({
      status: 'placed',
    });

    const room = await roomFor(db!, alex.id);
    expect(room?.placed.shelf_left?.collectibleId).toBe(item);
    expect(room?.placed.shelf_left?.name).toBeTruthy();
    expect(room?.placed.shelf_right).toBeUndefined();
  });

  it('refuses somebody else’s collectible, and the database refuses it too', async () => {
    const alex = await manager('Alex');
    const nick = await manager('Nick');
    const nicks = await pull(nick.id, 0, 'n');

    // The service is polite about it.
    expect(await place(db!, { userId: alex.id, slot: 'wall', collectibleId: nicks })).toEqual({
      status: 'not_yours',
    });

    // And the trigger makes it impossible, which is the guarantee that matters:
    // the service check turns a mistake into a refusal, the trigger turns a
    // dishonest caller into an exception.
    const alexRoom = await ensureRoom(db!, alex.id);
    await expectPgError(
      db!.insert(roomPlacements).values({
        roomId: alexRoom.id,
        slot: 'wall',
        collectibleId: nicks,
        placedAt: now(),
      }),
      { code: PG_ERROR.checkViolation },
    );
  });

  it('holds one thing per place', async () => {
    const alex = await manager('Alex');
    const first = await pull(alex.id, 0, 'a');
    const second = await pull(alex.id, 3999, 'b');

    await place(db!, { userId: alex.id, slot: 'bench', collectibleId: first });
    await place(db!, { userId: alex.id, slot: 'bench', collectibleId: second });

    const room = await roomFor(db!, alex.id);
    expect(room?.placed.bench?.collectibleId).toBe(second);

    const rows = await db!
      .select()
      .from(roomPlacements)
      .where(eq(roomPlacements.roomId, (await ensureRoom(db!, alex.id)).id));
    expect(rows).toHaveLength(1);
  });

  it('refuses two things in one place at the database level', async () => {
    const alex = await manager('Alex');
    const first = await pull(alex.id, 0, 'a');
    const second = await pull(alex.id, 3999, 'b');
    const room = await ensureRoom(db!, alex.id);

    await db!.insert(roomPlacements).values({
      roomId: room.id,
      slot: 'wall',
      collectibleId: first,
      placedAt: now(),
    });

    await expectPgError(
      db!.insert(roomPlacements).values({
        roomId: room.id,
        slot: 'wall',
        collectibleId: second,
        placedAt: now(),
      }),
      { code: PG_ERROR.uniqueViolation, constraint: 'room_placements_one_per_slot' },
    );
  });

  it('moves a thing rather than cloning it', async () => {
    /*
     * The failure this pins: a manager with one arcade token putting it on the
     * bench and then on the shelf, and finding two of them. A room made of
     * independent slots allows exactly that, and it reads as a duplicate rather
     * than as a choice.
     */
    const alex = await manager('Alex');
    const item = await pull(alex.id, 0, 'a');

    await place(db!, { userId: alex.id, slot: 'bench', collectibleId: item });
    await place(db!, { userId: alex.id, slot: 'shelf_right', collectibleId: item });

    const room = await roomFor(db!, alex.id);
    expect(room?.placed.bench).toBeUndefined();
    expect(room?.placed.shelf_right?.collectibleId).toBe(item);
  });

  it('refuses one thing in two places at the database level', async () => {
    const alex = await manager('Alex');
    const item = await pull(alex.id, 0, 'a');
    const room = await ensureRoom(db!, alex.id);

    await db!.insert(roomPlacements).values({
      roomId: room.id,
      slot: 'wall',
      collectibleId: item,
      placedAt: now(),
    });

    await expectPgError(
      db!.insert(roomPlacements).values({
        roomId: room.id,
        slot: 'bench',
        collectibleId: item,
        placedAt: now(),
      }),
      { code: PG_ERROR.uniqueViolation, constraint: 'room_placements_one_place_per_item' },
    );
  });

  it('takes a thing down without taking it away — inventory ≠ placement', async () => {
    /*
     * `16`'s P6 exit criterion, as an assertion. Emptying every place in the
     * room must leave the collection exactly as it was: placement is a pointer,
     * ownership is a record of something that happened, and only one of the two
     * is a manager's to undo.
     */
    const alex = await manager('Alex');
    const item = await pull(alex.id, 0, 'a');

    const before = await db!.select().from(collectibles).where(eq(collectibles.userId, alex.id));

    await place(db!, { userId: alex.id, slot: 'wall', collectibleId: item });
    await clearSlot(db!, { userId: alex.id, slot: 'wall' });

    const after = await db!.select().from(collectibles).where(eq(collectibles.userId, alex.id));

    expect(after).toEqual(before);
    expect((await roomFor(db!, alex.id))?.placed.wall).toBeUndefined();
  });

  it('clears a place that is already empty without complaining', async () => {
    // A double tap is not an error, and there is nothing a manager could
    // usefully do differently on "it was not there".
    const alex = await manager('Alex');
    await expect(clearSlot(db!, { userId: alex.id, slot: 'bench' })).resolves.toBeUndefined();
  });

  /* --- What can be placed ------------------------------------------------ */

  it('offers one entry per distinct item, and says where each one is', async () => {
    const alex = await manager('Alex');
    const item = await pull(alex.id, 0, 'a');
    await place(db!, { userId: alex.id, slot: 'shelf_left', collectibleId: item });

    const choices = await placeable(db!, alex.id);
    const slugs = new Set(choices.map((choice) => choice.slug));
    expect(slugs.size).toBe(choices.length);

    const placed = choices.find((choice) => choice.collectibleId === item);
    expect(placed?.placedIn).toBe('shelf_left');
  });

  it('offers nothing to a manager who owns nothing, which is a state and not a gap', async () => {
    const alex = await manager('Alex');
    expect(await placeable(db!, alex.id)).toEqual([]);
  });

  /* --- Rings are not furniture ------------------------------------------ */

  it('never offers a championship ring as something to put on a shelf', async () => {
    /*
     * A ring is granted for a verified title and has its own rail. Letting one
     * be moved onto a shelf would make what it means a preference — and
     * `item_championship_ring` is deliberately outside the catalog, so a room
     * that accepted one would also make `catalogItem` throw on a page somebody
     * is looking at.
     */
    const alex = await manager('Alex');
    const [season] = await db!.select().from(seasons).where(eq(seasons.year, 2026)).limit(1);

    const [ring] = await db!
      .insert(collectibles)
      .values({
        userId: alex.id,
        slug: 'item_championship_ring',
        rarity: 'legendary',
        acquiredAt: now(),
        sourceSeasonId: season!.id,
        grantKey: `ring:${season!.id}:${alex.id}`,
      })
      .returning();

    expect(catalog().some((item) => item.slug === 'item_championship_ring')).toBe(false);
    expect(await placeable(db!, alex.id)).toEqual([]);
    expect(
      await place(db!, { userId: alex.id, slot: 'bench', collectibleId: ring!.id }),
    ).toEqual({ status: 'not_yours' });
  });

  it('shows a ring on the rail, derived from the season it was won for', async () => {
    const alex = await manager('Alex');
    const [season] = await db!.select().from(seasons).where(eq(seasons.year, 2026)).limit(1);

    await db!.insert(collectibles).values({
      userId: alex.id,
      slug: 'item_championship_ring',
      rarity: 'legendary',
      acquiredAt: now(),
      sourceSeasonId: season!.id,
      grantKey: `ring:${season!.id}:${alex.id}`,
    });

    const room = await roomFor(db!, alex.id);
    expect(room?.rings.map((ring) => ring.year)).toEqual([2026]);
  });

  /* --- Themes ------------------------------------------------------------ */

  it('changes what the room is made of', async () => {
    const alex = await manager('Alex');

    expect(await setTheme(db!, { userId: alex.id, theme: 'cold_store' })).toEqual({ status: 'set' });
    expect((await roomFor(db!, alex.id))?.theme).toBe('cold_store');
  });

  it('refuses a theme this product does not have', async () => {
    // Writing refuses; reading repairs. A stored value nobody recognises is a
    // manager who lost a retired option, and an accepted one is a bug that
    // repairs itself invisibly on every future read.
    const alex = await manager('Alex');

    expect(await setTheme(db!, { userId: alex.id, theme: 'dungeon' })).toEqual({
      status: 'unknown_theme',
    });
    expect((await roomFor(db!, alex.id))?.theme).toBe('storeroom');
  });

  it('keeps a room across a change of theme, things and all', async () => {
    const alex = await manager('Alex');
    const item = await pull(alex.id, 0, 'a');
    await place(db!, { userId: alex.id, slot: 'bench', collectibleId: item });

    await setTheme(db!, { userId: alex.id, theme: 'rec_room' });

    const room = await roomFor(db!, alex.id);
    expect(room?.theme).toBe('rec_room');
    expect(room?.placed.bench?.collectibleId).toBe(item);
  });

  /* --- The corridor ------------------------------------------------------ */

  it('lists the league and not the manager standing in it', async () => {
    const alex = await manager('Alex');
    const nick = await manager('Nick');
    const cheese = await manager('Cheese');

    const doors = await corridor(db!, alex.id);
    expect(doors.map((door) => door.userId).sort()).toEqual([cheese.id, nick.id].sort());
  });

  it('counts what is out, and the count goes down when somebody tidies up', async () => {
    /*
     * `18 §4`: no levels, prestige or clout. "Two things out" has to be a fact
     * about a room rather than a score, and the test of that is that it can
     * fall.
     */
    const alex = await manager('Alex');
    const nick = await manager('Nick');
    const first = await pull(nick.id, 0, 'a');
    const second = await pull(nick.id, 3999, 'b');

    await place(db!, { userId: nick.id, slot: 'shelf_left', collectibleId: first });
    await place(db!, { userId: nick.id, slot: 'bench', collectibleId: second });
    expect((await corridor(db!, alex.id))[0]?.onShow).toBe(2);

    await clearSlot(db!, { userId: nick.id, slot: 'bench' });
    expect((await corridor(db!, alex.id))[0]?.onShow).toBe(1);
  });

  it('does not put a retired manager’s door in the corridor', async () => {
    /*
     * The commissioner's ruling is absolute: a retired manager is not a
     * browsable identity anywhere in the current product. Their room still
     * exists — `14 §5` makes a basement permanent — and it is not a door down
     * here.
     */
    const alex = await manager('Alex');
    const gone = await manager('Berardo', false);

    expect((await corridor(db!, alex.id)).map((door) => door.userId)).not.toContain(gone.id);
  });

  it('will not let a retired manager’s room be walked into by address either', async () => {
    // A corridor is a list of doors; a URL is not a door. Without this the
    // ruling would hold on one and fail on the other.
    const gone = await manager('Berardo', false);
    const alex = await manager('Alex');

    expect(await visitable(db!, gone.id)).toBe(false);
    expect(await visitable(db!, alex.id)).toBe(true);
  });

  it('counts titles from verified seasons rather than from anything stored on a door', async () => {
    const alex = await manager('Alex');
    const nick = await manager('Nick');
    const [season] = await db!.select().from(seasons).where(eq(seasons.year, 2026)).limit(1);

    await db!.insert(collectibles).values({
      userId: nick.id,
      slug: 'item_championship_ring',
      rarity: 'legendary',
      acquiredAt: now(),
      sourceSeasonId: season!.id,
      grantKey: `ring:${season!.id}:${nick.id}`,
    });

    const doors = await corridor(db!, alex.id);
    expect(doors.find((door) => door.userId === nick.id)?.titles).toBe(1);
  });
});
