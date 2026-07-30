import { and, asc, eq, isNotNull } from 'drizzle-orm';

import { now } from '@/lib/clock';
import { type Queryable } from '@/lib/db';
import { collectibles, users } from '@/lib/db/schema';
import { notADemoSeat } from '@/lib/demo/boundary';

import { catalogItem, type Rarity } from './catalog';

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

  return {
    collectibleId: row.collectibleId,
    slug: row.slug,
    name: catalogItem(row.slug).name,
    rarity: row.rarity,
    acquiredAt: row.acquiredAt,
  };
}

/**
 * Everybody's Showcase, in league name order.
 *
 * **Retired managers are included.** A departed manager is retired rather than
 * deleted precisely so their history survives (`16 §5.1`), and their shelf is part
 * of that history — the league remembers what somebody was showing when they left.
 *
 * Managers who have chosen nothing are returned with a null item rather than
 * omitted, so the wall shows the whole league and the gaps are visible. Omitting
 * them would make an empty shelf indistinguishable from a manager who is not
 * there.
 */
export async function leagueShowcase(db: Queryable): Promise<LeagueShowcase[]> {
  const rows = await db
    .select({
      userId: users.id,
      displayName: users.displayName,
      collectibleId: collectibles.id,
      slug: collectibles.slug,
      rarity: collectibles.rarity,
      acquiredAt: collectibles.acquiredAt,
    })
    .from(users)
    // LEFT join: a manager with no pick is still a manager.
    .leftJoin(collectibles, eq(collectibles.id, users.showcaseCollectibleId))
    // A demo seat is not a manager. The wall is a claim about who the league is,
    // and `MANDATE §8` keeps the demo system out of those — see
    // `lib/demo/boundary.ts`.
    .where(notADemoSeat())
    .orderBy(asc(users.displayName));

  return rows.map((row) => ({
    userId: row.userId,
    displayName: row.displayName,
    item:
      row.collectibleId === null || row.slug === null || row.rarity === null
        ? null
        : {
            collectibleId: row.collectibleId,
            slug: row.slug,
            name: catalogItem(row.slug).name,
            rarity: row.rarity,
            acquiredAt: row.acquiredAt!,
          },
  }));
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
