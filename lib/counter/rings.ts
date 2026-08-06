import { and, eq, isNotNull, sql } from 'drizzle-orm';

import { now } from '@/lib/clock';
import { type Queryable } from '@/lib/db';
import { collectibles, seasonMemberships, seasons, users } from '@/lib/db/schema';

import { systemCatalog } from './catalog';

/**
 * Championship rings.
 *
 * `16 §58` puts rings in v1 and `16 §368` grants historical ones to the verified
 * champions *"once their seasons are verified through any tier"*. The catalog
 * has carried `item_championship_ring` since M2, deliberately excluded from the
 * only acquisition path there was — **earned, never pulled** — with nothing
 * anywhere to earn it. It was an item that could not be obtained. This is the
 * earning, and nothing else about the item changes.
 *
 * ## The authority is the season record, and there is only one
 *
 * A champion is `season_memberships.final_rank = 1` on a season with
 * `finalized_at` set. That is the same source `lib/parlor/champions.ts` reads
 * for the banners on the wall, and reading it again here is deliberate: a second
 * championship authority is exactly the duplication `MANDATE §9` forbids, and
 * the failure mode is a wall that disagrees with a Collection.
 *
 * **Nothing here reads display text.** Not the banner's label, not a Timeline
 * card, not an imported name. Those are renderings of the fact; this grants
 * against the fact.
 *
 * ## Idempotency is the unique index, and nothing else
 *
 * `collectibles.grant_key` is UNIQUE and the key names the **occasion** —
 * `championship:<seasonId>:<userId>`. `lib/counter/grants.ts` makes the argument
 * for the seasonal free boxes and it holds here without amendment: there is no
 * `SELECT ... WHERE already_granted` below, because that check is a race with a
 * comfortable-looking body. A backfill run twice, a deploy overlapping the
 * Tuesday job, two seeds — all of them insert nothing the second time, and the
 * database is what makes that true rather than this file being careful.
 *
 * ## A repeat champion holds two rings
 *
 * The key carries the **season**, so 2024's title and 2025's are different
 * occasions and a manager who wins both receives both. Nothing collapses to a
 * boolean: `source_season_id` keeps each ring attached to the year it was won,
 * because a product built to remember a league cannot round two championships
 * down to one.
 *
 * ## What this is not
 *
 * Not a ceremony. `16 §62` defers the presentation — the wheel, the portrait,
 * the speech — to v1.1, and a later ceremony may celebrate an entitlement this
 * already established. It must never become the thing that grants it, or the
 * ring stops being a fact about a season and becomes a fact about whether
 * somebody watched an animation.
 */

/** The ring's catalog entry, read from the earned side of the registry. */
function ringItem(): ReturnType<typeof systemCatalog>[number] {
  const earned = systemCatalog();
  const ring = earned.find((item) => item.slug === 'item_championship_ring');
  if (ring === undefined) {
    /*
     * A hard failure rather than a silent skip. If the ring loses its
     * `systemLayer` flag it lands back in the box odds, and a legendary that is
     * meant to be unpullable quietly entering the reward table is a far worse
     * outcome than a backfill that refuses to run.
     */
    throw new Error(
      'item_championship_ring is not in the system catalog — check systemLayer in art/assets.inventory.json',
    );
  }
  return ring;
}

/** One verified title: who won what, by id, never by name. */
export interface VerifiedTitle {
  readonly seasonId: string;
  readonly year: number;
  readonly userId: string;
}

/**
 * Every championship the stored record actually verifies.
 *
 * Finalized seasons only. An unfinished season has no champion, and a season
 * whose `final_rank` was never written has no champion *on record* — which is
 * not the same as having none, and is not something to guess at.
 */
export async function verifiedTitles(db: Queryable): Promise<readonly VerifiedTitle[]> {
  const rows = await db
    .select({
      seasonId: seasons.id,
      year: seasons.year,
      userId: seasonMemberships.userId,
    })
    .from(seasonMemberships)
    .innerJoin(seasons, eq(seasonMemberships.seasonId, seasons.id))
    .where(and(eq(seasonMemberships.finalRank, 1), isNotNull(seasons.finalizedAt)))
    .orderBy(seasons.year);

  return rows;
}

/** What a grant run did, for the caller that wants to say so out loud. */
export interface RingGrantResult {
  readonly titles: number;
  readonly granted: number;
  readonly alreadyHeld: number;
}

/** The occasion's name, which is also its idempotency key. */
export function ringGrantKey(seasonId: string, userId: string): string {
  return `championship:${seasonId}:${userId}`;
}

/**
 * Grant every verified champion their ring. Safe to run as often as you like.
 *
 * One statement per title rather than one big insert, because the interesting
 * number — how many were actually new — is what `ON CONFLICT DO NOTHING` reports
 * per row, and a backfill that cannot say whether it did anything is a backfill
 * nobody trusts to re-run.
 */
export async function grantChampionshipRings(db: Queryable): Promise<RingGrantResult> {
  const ring = ringItem();
  const titles = await verifiedTitles(db);
  const at = now();

  let granted = 0;
  for (const title of titles) {
    const inserted = await db
      .insert(collectibles)
      .values({
        userId: title.userId,
        slug: ring.slug,
        rarity: ring.rarity,
        acquiredAt: at,
        sourceSeasonId: title.seasonId,
        grantKey: ringGrantKey(title.seasonId, title.userId),
      })
      .onConflictDoNothing({ target: collectibles.grantKey })
      .returning({ id: collectibles.id });

    granted += inserted.length;
  }

  return { titles: titles.length, granted, alreadyHeld: titles.length - granted };
}

/** A ring a manager holds, with the year it was won. */
export interface HeldRing {
  readonly year: number;
  readonly slug: string;
  readonly acquiredAt: Date;
}

/**
 * The rings one manager holds, oldest title first.
 *
 * Joined to `seasons` rather than trusting anything stored beside the ring: the
 * year is the season's, and there is one place that knows it.
 */
export async function ringsFor(db: Queryable, userId: string): Promise<readonly HeldRing[]> {
  const rows = await db
    .select({
      year: seasons.year,
      slug: collectibles.slug,
      acquiredAt: collectibles.acquiredAt,
    })
    .from(collectibles)
    .innerJoin(seasons, eq(collectibles.sourceSeasonId, seasons.id))
    .where(eq(collectibles.userId, userId))
    .orderBy(seasons.year);

  return rows;
}

/**
 * Every ring in the league, for the Collection's earned shelf.
 *
 * Carries the holder's display name because a championship is a league fact
 * rather than a private one — the wall already names them.
 */
export interface LeagueRing extends HeldRing {
  readonly holder: string;
  readonly userId: string;
}

export async function leagueRings(db: Queryable): Promise<readonly LeagueRing[]> {
  const rows = await db
    .select({
      year: seasons.year,
      slug: collectibles.slug,
      acquiredAt: collectibles.acquiredAt,
      holder: users.displayName,
      userId: collectibles.userId,
    })
    .from(collectibles)
    .innerJoin(seasons, eq(collectibles.sourceSeasonId, seasons.id))
    .innerJoin(users, eq(collectibles.userId, users.id))
    .orderBy(sql`${seasons.year} DESC`);

  return rows;
}
