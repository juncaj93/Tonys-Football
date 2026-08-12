import { and, asc, eq, isNotNull } from 'drizzle-orm';

import { now } from '@/lib/clock';
import { type Queryable } from '@/lib/db';
import { collectibles, seasonMemberships, seasons, users } from '@/lib/db/schema';
import { activeSeat, currentSeasonYear } from '@/lib/league/membership';

import { catalog, catalogItem, type Rarity } from './catalog';

/**
 * The Showcase — one item, shown to the league.
 *
 * `16 §5.3`: *"Showcase → `showcase_inventory_id` column, not a feature."* And
 * `18 §4`: *"The one item shown to the league. **No levels, prestige, or clout.**"*
 *
 * Both halves of that matter. It is one column, so it cannot quietly become a
 * table with a rank in it; and it carries no score, so there is nothing to
 * optimise. It answers *what did you pick* and nothing else.
 *
 * ## Why it carries the social weight at launch
 *
 * `16` defers manager basements to v1.1 and says the Showcase carries the social
 * weight until they arrive. This is the whole of it: ten managers, one shelf each,
 * and everybody can see everybody's.
 *
 * ## Authorization is in the database
 *
 * A manager may only show what they own, enforced by a trigger on `users`
 * (`drizzle/0006_showcase.sql`). The service below checks first so a mistake reads
 * as a refusal rather than an exception — but the check that *matters* is the one
 * no caller can skip.
 */

/**
 * The catalog's entry for a slug, or null when the catalog does not carry it.
 *
 * **This module used to call `catalogItem` directly, and a champion could not
 * open the Showcase.** `item_championship_ring` is a real `collectibles` row and
 * is deliberately *outside* the box catalog (`systemLayer` — earned, never
 * pulled), so `catalogItem` threw and `/counter/showcase` answered **500** for
 * every manager who has ever won the league. On a freshly seeded database that
 * is two of the ten, one of them the commissioner. The tests never saw it
 * because they build managers from scratch and no manufactured manager has a
 * ring.
 *
 * `catalogItem` staying strict is right — for the reveal and the Collection a
 * hole *would* be a defect. Here the miss is a legitimate answer, and
 * `lib/rooms/service.ts` had already reached exactly this conclusion for exactly
 * this slug: a surface asking *"is this something to put out?"* is entitled to
 * be told no without the page failing to render.
 */
function catalogEntryOrNull(slug: string): { name: string } | null {
  return catalog().find((item) => item.slug === slug) ?? null;
}

export interface ShowcasedItem {
  readonly collectibleId: string;
  readonly slug: string;
  readonly name: string;
  readonly rarity: Rarity;
  readonly acquiredAt: Date;
}

export interface LeagueShowcase {
  readonly userId: string;
  readonly displayName: string;
  /** Null when this manager has not chosen — an ordinary state, not a gap. */
  readonly item: ShowcasedItem | null;
}

/** What this manager is showing, if anything. */
export async function showcaseFor(
  db: Queryable,
  userId: string,
): Promise<ShowcasedItem | null> {
  const rows = await db
    .select({
      collectibleId: collectibles.id,
      slug: collectibles.slug,
      rarity: collectibles.rarity,
      acquiredAt: collectibles.acquiredAt,
    })
    .from(users)
    .innerJoin(collectibles, eq(collectibles.id, users.showcaseCollectibleId))
    .where(eq(users.id, userId))
    .limit(1);

  const row = rows[0];
  if (row === undefined) return null;

  /*
   * A pick the catalog cannot name reads as *nothing out*, rather than as an
   * exception. This is on the **parlor's** critical path — the receipt says what
   * you have on display — so a throw here is not one screen failing, it is the
   * shop failing.
   */
  const item = catalogEntryOrNull(row.slug);
  if (item === null) return null;

  return {
    collectibleId: row.collectibleId,
    slug: row.slug,
    name: item.name,
    rarity: row.rarity,
    acquiredAt: row.acquiredAt,
  };
}

/**
 * The league's Showcase, in name order.
 *
 * **Retired managers are excluded**, and this comment used to say the opposite.
 * The old reasoning — a departed manager is retired rather than deleted so their
 * history survives, and their shelf is part of that history — is true about
 * *storage* and was wrong about the wall. The commissioner's ruling is absolute:
 * a retired manager is not a browsable identity anywhere in the current product,
 * with or without a label. Their shelf still exists in the database; it is not
 * on this wall.
 *
 * Managers who have chosen nothing are still returned with a null item rather
 * than omitted, so the gaps in the *league* are visible. That distinction
 * survives and is the reason this returns rows at all: omitting somebody who has
 * not picked would make an empty shelf indistinguishable from a person who is
 * not here — which is precisely the confusion the retired-manager ruling exists
 * to prevent, arriving from the other direction.
 */
export async function leagueShowcase(db: Queryable): Promise<LeagueShowcase[]> {
  const year = await currentSeasonYear(db);
  if (year === null) return [];

  const rows = await db
    .select({
      userId: users.id,
      displayName: users.displayName,
      collectibleId: collectibles.id,
      slug: collectibles.slug,
      rarity: collectibles.rarity,
      acquiredAt: collectibles.acquiredAt,
    })
    .from(seasonMemberships)
    .innerJoin(seasons, eq(seasonMemberships.seasonId, seasons.id))
    .innerJoin(users, eq(seasonMemberships.userId, users.id))
    // LEFT join: a manager with no pick is still a manager.
    .leftJoin(collectibles, eq(collectibles.id, users.showcaseCollectibleId))
    /*
     * The wall is the league, and the league is an **active seat**.
     *
     * It selected from `users`, which meant every row that had ever existed —
     * three retired managers and, until the demo boundary landed, every demo
     * seat. The commissioner's ruling is absolute that a retired manager never
     * appears in a structured surface, so this is derived from
     * `lib/league/membership.ts` rather than filtered here.
     */
    .where(activeSeat(year))
    .orderBy(asc(users.displayName));

  return rows.map((row) => {
    const item =
      row.collectibleId === null || row.slug === null || row.rarity === null
        ? null
        : catalogEntryOrNull(row.slug);

    return {
      userId: row.userId,
      displayName: row.displayName,
      // One manager's unnameable pick must not take the whole wall down with it.
      item:
        item === null
          ? null
          : {
              collectibleId: row.collectibleId!,
              slug: row.slug!,
              name: item.name,
              rarity: row.rarity!,
              acquiredAt: row.acquiredAt!,
            },
    };
  });
}

/**
 * What a manager may choose from — one entry per distinct item they hold.
 *
 * Distinct rather than one per copy: showing "the second parmesan shaker" is not a
 * choice anybody wants to make, and two identical options is a worse picker than
 * one. The earliest copy is the one offered, so the pick is stable across
 * re-renders.
 */
export async function showcaseChoices(
  db: Queryable,
  userId: string,
): Promise<ShowcasedItem[]> {
  const owned = await db
    .select({
      id: collectibles.id,
      slug: collectibles.slug,
      rarity: collectibles.rarity,
      acquiredAt: collectibles.acquiredAt,
    })
    .from(collectibles)
    .where(eq(collectibles.userId, userId))
    .orderBy(asc(collectibles.acquiredAt));

  const bySlug = new Map<string, ShowcasedItem>();
  for (const row of owned) {
    if (bySlug.has(row.slug)) continue;
    /*
     * A ring is not something you choose to put out.
     *
     * It is granted rather than pulled, and it already has a place that is
     * *about* having won it — the parlor's banner rail and the basement's
     * championship rail, both derived, neither a slot. `lib/rooms/service.ts`
     * refuses one for the same reason. Offering it here would make the rail's
     * meaning a preference.
     */
    if (catalogEntryOrNull(row.slug) === null) continue;
    bySlug.set(row.slug, {
      collectibleId: row.id,
      slug: row.slug,
      name: catalogItem(row.slug).name,
      rarity: row.rarity,
      acquiredAt: row.acquiredAt,
    });
  }

  return [...bySlug.values()];
}

export type SetShowcaseResult =
  | { readonly status: 'set' }
  | { readonly status: 'cleared' }
  /** Not theirs, or not a collectible. One answer, so probing ids teaches nothing. */
  | { readonly status: 'not_yours' };

/**
 * Choose what to show, or take it back off the shelf.
 *
 * `null` clears it, which is a real thing a manager may want and not an error —
 * so it is a first-class outcome rather than a special case.
 *
 * Ownership is verified here **and** by the trigger. The check here exists so an
 * honest mistake becomes a polite refusal; the trigger exists so a dishonest one
 * is impossible.
 */
export async function setShowcase(
  db: Queryable,
  input: { userId: string; collectibleId: string | null },
): Promise<SetShowcaseResult> {
  if (input.collectibleId === null) {
    await db
      .update(users)
      .set({ showcaseCollectibleId: null, updatedAt: now() })
      .where(eq(users.id, input.userId));
    return { status: 'cleared' };
  }

  const owned = await db
    .select({ id: collectibles.id })
    .from(collectibles)
    .where(
      and(eq(collectibles.id, input.collectibleId), eq(collectibles.userId, input.userId)),
    )
    .limit(1);

  if (owned[0] === undefined) return { status: 'not_yours' };

  await db
    .update(users)
    .set({ showcaseCollectibleId: input.collectibleId, updatedAt: now() })
    .where(eq(users.id, input.userId));

  return { status: 'set' };
}

/** How many managers are showing something. Used for the wall's summary line. */
export async function showcaseCount(db: Queryable): Promise<number> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(isNotNull(users.showcaseCollectibleId));
  return rows.length;
}
