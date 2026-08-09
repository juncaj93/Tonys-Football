import { and, asc, eq, isNotNull } from 'drizzle-orm';

import { now } from '@/lib/clock';
import { type Queryable } from '@/lib/db';
import { collectibles, roomPlacements, rooms, users } from '@/lib/db/schema';
import { catalog, type CatalogItem, type Rarity } from '@/lib/counter/catalog';
import { ringsFor, type HeldRing } from '@/lib/counter/rings';
import { activeLeagueManagers } from '@/lib/league/membership';

import { SLOTS, type Slot } from './objects';
import { isTheme, themeOrDefault, type Theme } from './themes';

/**
 * The basement, as data.
 *
 * ## What this module is allowed to know
 *
 * A room is **placement and a theme**. It does not own collectibles, it does not
 * grant anything, it does not touch the ledger, and no operation here can create
 * or destroy a thing a manager holds. `16`'s P6 exit criterion is *"inventory ≠
 * placement"*, and the cleanest way to keep that true is that the module which
 * moves things around has no way to mint one.
 *
 * That is also why nothing here is idempotency-keyed the way the box, the ring
 * and the reward paths are. Those record **events**; this records a **current
 * arrangement**. Putting the same item on the same shelf twice is the same room,
 * not a double payment, so the guarantee that matters is *the last write wins
 * and the room is always consistent* — which is what the two unique constraints
 * and the ownership trigger give.
 *
 * ## Ownership is checked here and enforced in the database
 *
 * Same division as the Showcase: the check below turns an honest mistake into a
 * polite refusal, and `room_placements_must_be_owned` makes a dishonest one
 * impossible. If only one of the two could exist it would be the trigger.
 */

/* -------------------------------------------------------------------------
 * Reading a room
 * ---------------------------------------------------------------------- */

/** A collectible sitting somewhere, with everything a surface needs to draw it. */
export interface PlacedItem {
  readonly slot: Slot;
  readonly collectibleId: string;
  readonly slug: string;
  readonly name: string;
  readonly rarity: Rarity;
  readonly placedAt: Date;
}

/** One manager's room, as everything a page needs in one object. */
export interface RoomView {
  readonly userId: string;
  readonly displayName: string;
  readonly theme: Theme;
  /** Slot → what is in it. A slot that is absent is empty, which is ordinary. */
  readonly placed: Readonly<Partial<Record<Slot, PlacedItem>>>;
  /** Verified titles, oldest first. Derived — never placed, never editable. */
  readonly rings: readonly HeldRing[];
  /** Distinct collectibles held. What the corridor's list shows beside a name. */
  readonly holdings: number;
}

/**
 * The room a manager has, creating it on first visit.
 *
 * ## Lazily, rather than by backfill
 *
 * A backfill would have to run for every manager who has ever existed, including
 * the three retired ones who cannot reach a room, and it would have to be
 * re-run for every manager added afterwards. Creating on first read is one
 * `ON CONFLICT DO NOTHING` and covers both.
 *
 * **There is no `SELECT ... WHERE already_exists`.** Two tabs opening `/rooms`
 * at the same instant is an ordinary thing to happen, and a check-then-insert is
 * a race with a comfortable-looking body (`lib/counter/grants.ts` makes the
 * argument at length). `rooms.user_id` is UNIQUE and the conflict clause is the
 * whole mechanism.
 */
export async function ensureRoom(db: Queryable, userId: string): Promise<{ id: string; theme: Theme }> {
  await db
    .insert(rooms)
    .values({ userId, createdAt: now(), updatedAt: now() })
    .onConflictDoNothing({ target: rooms.userId });

  const [row] = await db
    .select({ id: rooms.id, theme: rooms.theme })
    .from(rooms)
    .where(eq(rooms.userId, userId))
    .limit(1);

  if (row === undefined) {
    // Unreachable: the insert above either wrote it or lost to somebody who did.
    throw new Error(`no room for ${userId} after ensuring one`);
  }

  return { id: row.id, theme: themeOrDefault(row.theme) };
}

/**
 * Everything on one manager's room, in one read.
 *
 * Returns `null` for a manager who does not exist — the same single answer for
 * "no such person" and "not a manager", so probing ids from `/rooms/<uuid>`
 * teaches nothing. A *retired* manager is a real person with a real room and is
 * deliberately not special-cased here; whether they are reachable is the
 * corridor's decision, and {@link corridor} makes it.
 */
export async function roomFor(db: Queryable, userId: string): Promise<RoomView | null> {
  const [person] = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (person === undefined) return null;

  const room = await ensureRoom(db, userId);

  const [placements, rings, owned] = await Promise.all([
    db
      .select({
        slot: roomPlacements.slot,
        collectibleId: roomPlacements.collectibleId,
        slug: collectibles.slug,
        rarity: collectibles.rarity,
        placedAt: roomPlacements.placedAt,
      })
      .from(roomPlacements)
      .innerJoin(collectibles, eq(collectibles.id, roomPlacements.collectibleId))
      .where(eq(roomPlacements.roomId, room.id)),
    ringsFor(db, userId),
    db
      .select({ slug: collectibles.slug })
      .from(collectibles)
      .where(eq(collectibles.userId, userId)),
  ]);

  const placed: Partial<Record<Slot, PlacedItem>> = {};
  for (const row of placements) {
    /*
     * A ring reaching a slot would be a defect rather than a display: rings are
     * granted, not chosen, and `placeable` refuses one. It is skipped here as
     * well so a row written by some future path cannot make `catalogItem` throw
     * on a page a manager is looking at — `catalogItem` is strict by design and
     * `item_championship_ring` is deliberately not in the catalog.
     */
    const slot = row.slot as Slot;
    if (!(SLOTS as readonly string[]).includes(slot)) continue;
    const item = catalogEntryOrNull(row.slug);
    if (item === null) continue;

    placed[slot] = {
      slot,
      collectibleId: row.collectibleId,
      slug: row.slug,
      name: item.name,
      rarity: row.rarity,
      placedAt: row.placedAt,
    };
  }

  return {
    userId: person.id,
    displayName: person.displayName,
    theme: room.theme,
    placed,
    rings,
    holdings: new Set(owned.map((row) => row.slug)).size,
  };
}

/**
 * The catalog's entry, or null for a slug the catalog does not carry.
 *
 * Non-throwing on purpose, and it is the only lookup in this module. `catalogItem`
 * is strict by design — a stored slug *must* resolve — and that is right for the
 * reveal and the Collection, where a hole would be a defect. Here the miss is a
 * legitimate answer: `item_championship_ring` is deliberately outside the
 * catalog (`systemLayer`), and a room asking *"is this furniture?"* is entitled
 * to be told no without a page failing to render.
 */
function catalogEntryOrNull(slug: string): CatalogItem | null {
  return catalog().find((item) => item.slug === slug) ?? null;
}

/* -------------------------------------------------------------------------
 * What a manager can put somewhere
 * ---------------------------------------------------------------------- */

/** One thing a manager holds and could put down. */
export interface PlaceableItem {
  readonly collectibleId: string;
  readonly slug: string;
  readonly name: string;
  readonly rarity: Rarity;
  /** The slot it is currently in, if any. Moving it empties that one. */
  readonly placedIn: Slot | null;
}

/**
 * What this manager could put in a slot.
 *
 * ## One entry per distinct item, not per copy
 *
 * The same reasoning the Showcase's picker uses: *"showing the second parmesan
 * shaker"* is not a choice anybody wants to make, and two identical options is a
 * worse picker than one. The earliest copy is the one offered, so the list is
 * stable across re-renders.
 *
 * ## There is no category compatibility, and that is a decision
 *
 * `04 §10` asks each slot to *"validate category compatibility"*. **The shipped
 * catalog has no category axis** — a catalog entry is a slug, a name and a
 * rarity (`lib/counter/catalog.ts`, derived from the art registry) — so
 * implementing that sentence would mean inventing a taxonomy for twenty-four
 * objects and then deciding, for a manager, that their pizza cutter may not go
 * on the floor. That is a product decision with no evidence behind it, and it
 * costs the manager choices in exchange for realism nobody asked for.
 *
 * It is also invisible: every collectible is drawn from the same 46 × 46 sprite,
 * so a poster on the bench and a poster on the wall are the same picture. A rule
 * that cannot be seen and cannot be justified is a rule that only ever generates
 * refusals.
 *
 * Recorded rather than silently skipped. If categories ever exist — as a
 * registry field, which is where they would belong — this is the function that
 * gains a filter and nothing else moves.
 */
export async function placeable(db: Queryable, userId: string): Promise<readonly PlaceableItem[]> {
  const room = await ensureRoom(db, userId);

  const [owned, placements] = await Promise.all([
    db
      .select({
        id: collectibles.id,
        slug: collectibles.slug,
        rarity: collectibles.rarity,
      })
      .from(collectibles)
      .where(eq(collectibles.userId, userId))
      .orderBy(asc(collectibles.acquiredAt)),
    db
      .select({ slot: roomPlacements.slot, collectibleId: roomPlacements.collectibleId })
      .from(roomPlacements)
      .where(eq(roomPlacements.roomId, room.id)),
  ]);

  const slotOf = new Map(placements.map((row) => [row.collectibleId, row.slot as Slot]));

  const bySlug = new Map<string, PlaceableItem>();
  for (const row of owned) {
    const item = catalogEntryOrNull(row.slug);
    // Rings are earned rather than chosen and are not in the catalog. They have
    // their own rail; they are not furniture.
    if (item === null) continue;

    const existing = bySlug.get(row.slug);
    const placedIn = slotOf.get(row.id) ?? null;

    /*
     * The copy that is *already somewhere* wins the slug.
     *
     * Otherwise a manager holding two coffee mugs, one of them on the shelf,
     * sees an option that looks unplaced and putting it on the bench would put a
     * second mug in the room while the first stayed on the shelf. One entry per
     * distinct item has to mean one *object* per distinct item, or the list is
     * telling a different story from the room.
     */
    if (existing === undefined || (existing.placedIn === null && placedIn !== null)) {
      bySlug.set(row.slug, {
        collectibleId: row.id,
        slug: row.slug,
        name: item.name,
        rarity: row.rarity,
        placedIn,
      });
    }
  }

  return [...bySlug.values()];
}

/* -------------------------------------------------------------------------
 * Changing a room
 * ---------------------------------------------------------------------- */

export type PlaceResult =
  /** It is where they asked for it. */
  | { readonly status: 'placed' }
  /** Not theirs, or not a collectible. One answer, so probing ids teaches nothing. */
  | { readonly status: 'not_yours' };

/**
 * Put something in a slot.
 *
 * ## Three writes, one transaction, and the order matters
 *
 * A slot holds one thing and a thing is in one place. Both are database
 * constraints, so "move the mug from the shelf to the bench" is *clear the
 * bench, clear wherever the mug was, then write* — and doing that in three
 * statements outside a transaction leaves a window in which the room has an
 * empty bench and a mug nowhere.
 *
 * The whole operation therefore runs inside the caller's transaction. Callers
 * that are not already in one pass a plain connection and get a three-statement
 * sequence, which is why `app/actions/rooms.ts` wraps it — the action layer is
 * where the transaction belongs, because that is where a manager's tap is one
 * intention.
 */
export async function place(
  db: Queryable,
  input: { userId: string; slot: Slot; collectibleId: string },
): Promise<PlaceResult> {
  const owned = await db
    .select({ id: collectibles.id, slug: collectibles.slug })
    .from(collectibles)
    .where(and(eq(collectibles.id, input.collectibleId), eq(collectibles.userId, input.userId)))
    .limit(1);

  const row = owned[0];
  if (row === undefined) return { status: 'not_yours' };

  /*
   * A ring is not furniture.
   *
   * It has no catalog entry — `item_championship_ring` carries `systemLayer` and
   * is excluded from every acquisition path — and it already has a place in the
   * room that is *about* it having been won. Letting one be moved onto a shelf
   * would make the rail's meaning a preference.
   *
   * Answered as `not_yours` rather than a fourth outcome, for the same reason
   * the whole function has one refusal: a manager cannot reach this through the
   * product, so the only caller who sees it is one probing ids.
   */
  if (catalogEntryOrNull(row.slug) === null) return { status: 'not_yours' };

  const room = await ensureRoom(db, input.userId);

  // Whatever was in the slot comes out, and wherever this was, it leaves.
  await db
    .delete(roomPlacements)
    .where(and(eq(roomPlacements.roomId, room.id), eq(roomPlacements.slot, input.slot)));
  await db
    .delete(roomPlacements)
    .where(
      and(
        eq(roomPlacements.roomId, room.id),
        eq(roomPlacements.collectibleId, input.collectibleId),
      ),
    );

  await db.insert(roomPlacements).values({
    roomId: room.id,
    slot: input.slot,
    collectibleId: input.collectibleId,
    placedAt: now(),
  });

  return { status: 'placed' };
}

/**
 * Take whatever is in a slot back out.
 *
 * Always succeeds, including on a slot that is already empty. There is nothing a
 * manager could usefully do differently on "it was not there", and reporting it
 * would turn a double-tap into an error message.
 */
export async function clearSlot(
  db: Queryable,
  input: { userId: string; slot: Slot },
): Promise<void> {
  const room = await ensureRoom(db, input.userId);
  await db
    .delete(roomPlacements)
    .where(and(eq(roomPlacements.roomId, room.id), eq(roomPlacements.slot, input.slot)));
}

export type ThemeResult = { readonly status: 'set' } | { readonly status: 'unknown_theme' };

/**
 * Change what the room is made of.
 *
 * Refuses a value it does not recognise rather than storing it and repairing on
 * read. That is the writing half of the rule `0016` set for character traits:
 * **reading repairs, writing refuses** — a stored value nobody recognises is a
 * manager who lost a retired option, and an accepted one is a bug that will be
 * repaired invisibly on every future read.
 */
export async function setTheme(
  db: Queryable,
  input: { userId: string; theme: string },
): Promise<ThemeResult> {
  if (!isTheme(input.theme)) return { status: 'unknown_theme' };

  const room = await ensureRoom(db, input.userId);
  await db
    .update(rooms)
    .set({ theme: input.theme, updatedAt: now() })
    .where(eq(rooms.id, room.id));

  return { status: 'set' };
}

/* -------------------------------------------------------------------------
 * The corridor
 * ---------------------------------------------------------------------- */

/** A door in the corridor: somebody else's room, and enough to want to open it. */
export interface CorridorDoor {
  readonly userId: string;
  readonly displayName: string;
  /** How many things are out in their room. `14 §5` — a room is worth visiting. */
  readonly onShow: number;
  readonly titles: number;
}

/**
 * May this room be walked into?
 *
 * ## The ruling this exists for
 *
 * `corridor()` is built from `activeLeagueManagers`, so a retired manager has no
 * door on it — but a URL is not a door. `/rooms/<uuid>` is a linkable address,
 * and without this check the commissioner's absolute ruling that **a retired
 * manager is not a browsable identity anywhere in the current product** would
 * hold on the corridor and fail on the address bar.
 *
 * The same reasoning excludes demo seats, which hold real current-season seats
 * so preview QA can sign in as them and are not people this league has
 * (`lib/league/membership.ts`). `activeSeat` already draws both lines, and this
 * uses it rather than restating either.
 *
 * A manager who is not visitable is reported the same way a manager who does not
 * exist is — `roomFor` returning null, one answer for both — so probing ids
 * teaches nothing about who used to be here.
 */
export async function visitable(db: Queryable, userId: string): Promise<boolean> {
  const managers = await activeLeagueManagers(db);
  return managers.some((manager) => manager.id === userId);
}

/**
 * The other doors down here.
 *
 * ## Built from `activeSeat`, so retired managers are not on it
 *
 * The commissioner's ruling is absolute: **a retired manager is not a browsable
 * identity anywhere in the current product.** Their room still exists in the
 * database — `14 §5` says a basement is permanent and `16 §5.1` retires rather
 * than deletes — and it is not a door in this corridor. That is the same
 * distinction `leagueShowcase` arrived at: their shelf exists, it is not on the
 * wall.
 *
 * ## It counts what is out, and that is the only number on it
 *
 * `18 §4`: **no levels, prestige, or clout.** *"Three things out"* is a fact
 * about a room, not a score — it does not accumulate, it goes down when
 * somebody tidies up, and there is nothing to be top of. It exists so the
 * corridor is a set of rooms rather than a list of names.
 */
export async function corridor(
  db: Queryable,
  /** Whoever is looking. Their own door is not in their own corridor. */
  exceptUserId: string,
): Promise<readonly CorridorDoor[]> {
  const managers = await activeLeagueManagers(db);
  const others = managers.filter((manager) => manager.id !== exceptUserId);
  if (others.length === 0) return [];

  const ids = new Set(others.map((manager) => manager.id));

  /*
   * Two aggregate reads for the whole corridor rather than two per door.
   *
   * Ten managers is small enough that N+1 would work and large enough that it
   * would be twenty round trips on a page load. Counted in the application from
   * two flat selects, because the alternative is a grouped join across three
   * tables for a number that is decoration.
   */
  const [placements, rings] = await Promise.all([
    db
      .select({ userId: rooms.userId, id: roomPlacements.id })
      .from(roomPlacements)
      .innerJoin(rooms, eq(rooms.id, roomPlacements.roomId)),
    db
      .select({ userId: collectibles.userId, id: collectibles.id })
      .from(collectibles)
      // A collectible carrying a season is one that was *earned for* it — a
      // ring. `lib/counter/rings.ts` uses the same definition, by joining.
      .where(isNotNull(collectibles.sourceSeasonId)),
  ]);

  const onShow = new Map<string, number>();
  for (const row of placements) {
    if (!ids.has(row.userId)) continue;
    onShow.set(row.userId, (onShow.get(row.userId) ?? 0) + 1);
  }

  const titles = new Map<string, number>();
  for (const row of rings) {
    if (!ids.has(row.userId)) continue;
    titles.set(row.userId, (titles.get(row.userId) ?? 0) + 1);
  }

  return others.map((manager) => ({
    userId: manager.id,
    displayName: manager.displayName,
    onShow: onShow.get(manager.id) ?? 0,
    titles: titles.get(manager.id) ?? 0,
  }));
}
