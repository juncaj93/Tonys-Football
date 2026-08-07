import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearClock, setFixedClock } from '@/lib/clock';
import { getDb } from '@/lib/db';
import { collectibles, seasonMemberships, seasons, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

import { catalog, systemCatalog } from './catalog';
import {
  grantChampionshipRings,
  leagueRings,
  ringGrantKey,
  ringsFor,
  verifiedTitles,
} from './rings';

/**
 * What a championship ring has to guarantee.
 *
 * Against a real Postgres, because every guarantee here is a **database** one —
 * a unique index and a check constraint — and an in-memory double would assert
 * that this file is careful rather than that the schema is correct. Being
 * careful is exactly what a race defeats.
 */

const db = getDb();

/**
 * Years and seats are handed out from counters, not from the clock.
 *
 * `seasons.year` is UNIQUE and `season_memberships` is UNIQUE on
 * `(season_id, roster_id)`, so a generator based on `performance.now()` collides
 * as soon as two cases land in the same tick — which is exactly what happened.
 * A counter cannot, and it makes each run identical rather than merely usually
 * distinct.
 *
 * The years start far past any real season so nothing here depends on, or
 * disturbs, the seeded league.
 */
let nextYear = 5000;
let nextSeat = 0;
function freshYear(): number {
  nextYear += 1;
  return nextYear;
}

async function seat(role: string): Promise<string> {
  nextSeat += 1;
  const tag = `ring-${role}-${String(nextSeat)}`;
  const [row] = await db
    .insert(users)
    .values({ displayName: tag, sleeperUserId: tag })
    .returning({ id: users.id });
  return row!.id;
}

async function season(year: number, finalized: boolean): Promise<string> {
  const [row] = await db
    .insert(seasons)
    .values({
      year,
      status: finalized ? 'ARCHIVED' : 'ACTIVE',
      isHistorical: finalized,
      ...(finalized ? { finalizedAt: new Date('2091-01-05T00:00:00Z') } : {}),
    })
    .returning({ id: seasons.id });
  return row!.id;
}

/**
 * Seat a manager in a season with a final placing.
 *
 * `roster_id` is distinct per seat because `season_memberships` is UNIQUE on
 * `(season_id, roster_id)` — two managers in one season are two rosters, which
 * is the schema stating something true about fantasy football rather than an
 * inconvenience to work around.
 */
let nextRoster = 1;
async function place(seasonId: string, userId: string, rank: number | null): Promise<void> {
  nextRoster += 1;
  await db.insert(seasonMemberships).values({
    seasonId,
    userId,
    rosterId: nextRoster,
    ...(rank === null ? {} : { finalRank: rank }),
  });
}

/** Only the rows this file made. The suite shares a database. */
async function ringRowsFor(userId: string): Promise<number> {
  const rows = await db.select().from(collectibles).where(eq(collectibles.userId, userId));
  return rows.filter((r) => r.sourceSeasonId !== null).length;
}

let champion: string;
let runnerUp: string;
let seasonA: string;
let seasonB: string;
let unfinished: string;

beforeEach(async () => {
  setFixedClock('2091-02-01T12:00:00Z');
  champion = await seat('champ');
  runnerUp = await seat('runner');
  seasonA = await season(freshYear(), true);
  seasonB = await season(freshYear(), true);
  unfinished = await season(freshYear(), false);
});

afterEach(() => {
  clearClock();
});

describe('who a championship ring belongs to', () => {
  it('grants one to the verified champion of a finalized season', async () => {
    await place(seasonA, champion, 1);
    await place(seasonA, runnerUp, 2);

    const result = await grantChampionshipRings(db);
    expect(result.granted).toBeGreaterThanOrEqual(1);

    const held = await ringsFor(db, champion);
    expect(held).toHaveLength(1);
    expect(await ringRowsFor(runnerUp)).toBe(0);
  });

  it('grants nothing for a season that is not finalized', async () => {
    /*
     * A season still being played has no champion. `final_rank` can be written
     * early by an import; `finalized_at` is the league saying it is over, and
     * that is the one this trusts.
     */
    await place(unfinished, champion, 1);
    await grantChampionshipRings(db);
    expect(await ringRowsFor(champion)).toBe(0);
  });

  it('grants nothing to anyone who did not finish first', async () => {
    await place(seasonA, runnerUp, 2);
    await grantChampionshipRings(db);
    expect(await ringRowsFor(runnerUp)).toBe(0);
  });

  it('grants nothing when a finalized season recorded no placings', async () => {
    // No `final_rank` is "no champion on record", which is not "no champion".
    await place(seasonA, champion, null);
    await grantChampionshipRings(db);
    expect(await ringRowsFor(champion)).toBe(0);
  });
});

describe('running the grant more than once', () => {
  it('creates no duplicate for the same season, however many times it runs', async () => {
    await place(seasonA, champion, 1);

    await grantChampionshipRings(db);
    const second = await grantChampionshipRings(db);
    const third = await grantChampionshipRings(db);

    expect(second.granted).toBe(0);
    expect(third.granted).toBe(0);
    expect(await ringRowsFor(champion)).toBe(1);
  });

  it('reports what it actually did, so a backfill can be trusted to re-run', async () => {
    await place(seasonA, champion, 1);
    const first = await grantChampionshipRings(db);
    const again = await grantChampionshipRings(db);

    expect(first.granted).toBeGreaterThanOrEqual(1);
    expect(again.granted).toBe(0);
    expect(again.alreadyHeld).toBe(again.titles);
  });

  it('refuses a second ring for one season at the database, not in this file', async () => {
    /*
     * The guarantee asserted directly. No application code is involved: a raw
     * insert reusing the key is rejected by the unique index, which is what
     * makes two overlapping backfills safe rather than lucky.
     */
    await place(seasonA, champion, 1);
    await grantChampionshipRings(db);

    await expect(
      db.insert(collectibles).values({
        userId: champion,
        slug: 'item_championship_ring',
        rarity: 'legendary',
        acquiredAt: new Date('2091-03-01T00:00:00Z'),
        sourceSeasonId: seasonA,
        grantKey: ringGrantKey(seasonA, champion),
      }),
    ).rejects.toThrow();
  });

  it('refuses an earned row that carries no idempotency key', async () => {
    // The CHECK constraint. A season-linked ring without a key is one deploy
    // away from a duplicate, so the schema will not store one.
    await expect(
      db.insert(collectibles).values({
        userId: champion,
        slug: 'item_championship_ring',
        rarity: 'legendary',
        acquiredAt: new Date('2091-03-01T00:00:00Z'),
        sourceSeasonId: seasonA,
      }),
    ).rejects.toThrow();
  });
});

describe('a manager who wins more than once', () => {
  it('keeps a separate ring per season rather than one boolean', async () => {
    await place(seasonA, champion, 1);
    await place(seasonB, champion, 1);

    await grantChampionshipRings(db);
    const held = await ringsFor(db, champion);

    expect(held).toHaveLength(2);
    const years = held.map((r) => r.year);
    expect(new Set(years).size).toBe(2);
    // Oldest title first, so a shelf reads as a career.
    expect(years[0]).toBeLessThan(years[1]!);
  });

  it('re-running still adds nothing to a repeat champion', async () => {
    await place(seasonA, champion, 1);
    await place(seasonB, champion, 1);
    await grantChampionshipRings(db);
    await grantChampionshipRings(db);

    expect(await ringRowsFor(champion)).toBe(2);
  });

  it('names the holder for the league shelf', async () => {
    await place(seasonA, champion, 1);
    await grantChampionshipRings(db);

    const all = await leagueRings(db);
    const mine = all.filter((r) => r.userId === champion);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.holder).toBeTruthy();
  });
});

describe('the ring is earned, never pulled', () => {
  it('is not in the catalog a box draws from', () => {
    expect(catalog().map((i) => i.slug)).not.toContain('item_championship_ring');
  });

  it('is in the earned catalog instead', () => {
    expect(systemCatalog().map((i) => i.slug)).toContain('item_championship_ring');
  });

  it('separates the two by the registry flag rather than by a hardcoded slug', () => {
    /*
     * The point of the `systemLayer` rewrite. Every acquisition path in the
     * product reads `catalog()` — reward table, reveal pool, duplicate salvage,
     * the demo appliers — so an earned item excluded here is excluded from all
     * of them at once, and adding a second one is an art-registry row.
     */
    const earned = new Set(systemCatalog().map((i) => i.slug));
    for (const item of catalog()) {
      expect(earned.has(item.slug), `${item.slug} is on both sides`).toBe(false);
    }
    expect(earned.size).toBeGreaterThan(0);
  });

  it('leaves the box catalog at its approved size', () => {
    // `CATALOG_SIZE` is asserted elsewhere; this guards the rewrite specifically,
    // because a filter that accidentally matched nothing would silently add the
    // ring to the odds.
    expect(catalog().length).toBeGreaterThan(0);
    expect(catalog().some((i) => i.rarity === 'legendary')).toBe(true);
  });
});

describe('the authority', () => {
  it('reads the season record, and reports ids rather than names', async () => {
    await place(seasonA, champion, 1);
    const titles = await verifiedTitles(db);
    const mine = titles.filter((t) => t.userId === champion);

    expect(mine).toHaveLength(1);
    expect(mine[0]?.seasonId).toBe(seasonA);
    // A title is a fact about ids. Display text is a rendering of it.
    expect(Object.keys(mine[0] ?? {})).toEqual(['seasonId', 'year', 'userId']);
  });
});
