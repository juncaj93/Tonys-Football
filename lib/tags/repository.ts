import { eq } from 'drizzle-orm';

import { type Database } from '@/lib/db';
import { seasonMemberships, seasons } from '@/lib/db/schema';

import { deriveTags, type LeagueHistory, type TagSet } from './derive';

/**
 * Loading the history the tags are derived from.
 *
 * Thirty rows across three seasons. There is no cache and no materialized tag
 * table on purpose: a stored tag is a tag that can be stale, and a stale tag is
 * Tony saying something that was true last month. Recomputing costs one query
 * and a loop over thirty rows, which is cheaper than being wrong.
 *
 * When the event spine lands, the source of `madePlayoffs` and the records
 * moves; this function's shape does not.
 */
export async function loadLeagueHistory(db: Database): Promise<LeagueHistory> {
  const rows = await db
    .select({
      year: seasons.year,
      status: seasons.status,
      userId: seasonMemberships.userId,
      rosterId: seasonMemberships.rosterId,
      wins: seasonMemberships.wins,
      losses: seasonMemberships.losses,
      ties: seasonMemberships.ties,
      pointsFor: seasonMemberships.pointsFor,
      pointsAgainst: seasonMemberships.pointsAgainst,
      madePlayoffs: seasonMemberships.madePlayoffs,
      finalRank: seasonMemberships.finalRank,
    })
    .from(seasonMemberships)
    .innerJoin(seasons, eq(seasonMemberships.seasonId, seasons.id));

  const byYear = new Map<number, { isComplete: boolean; seats: LeagueHistory['seasons'][number]['seats'][number][] }>();

  for (const row of rows) {
    const season = byYear.get(row.year) ?? {
      // A season is complete when it was played to its end — the bracket
      // resolved it and the status was archived. Never inferred from the
      // calendar (`16 §12`).
      isComplete: row.status === 'ARCHIVED',
      seats: [],
    };

    season.seats.push({
      userId: row.userId,
      rosterId: row.rosterId,
      wins: row.wins,
      losses: row.losses,
      ties: row.ties,
      pointsFor: row.pointsFor,
      pointsAgainst: row.pointsAgainst,
      madePlayoffs: row.madePlayoffs,
      finalRank: row.finalRank,
    });

    byYear.set(row.year, season);
  }

  return {
    seasons: [...byYear.entries()].map(([year, season]) => ({
      year,
      isComplete: season.isComplete,
      seats: season.seats,
    })),
  };
}

export async function loadTags(db: Database): Promise<ReadonlyMap<string, TagSet>> {
  return deriveTags(await loadLeagueHistory(db));
}
