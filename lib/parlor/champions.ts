import { asc, eq } from 'drizzle-orm';

import { type Database } from '@/lib/db';
import { seasonMemberships, seasons, users } from '@/lib/db/schema';

/**
 * Who is on the wall.
 *
 * The championship rail carries **completed seasons plus the current one**, in
 * six fixed slots filled from the left, oldest first. A banner never moves
 * between visits — a banner that shifted because a season ended would be one
 * you have to find again.
 *
 * ## Why the current season is on the rail at all
 *
 * Because the rail is the room's strongest content at launch and an empty slot
 * says nothing. The current season hangs with its year on it like any other and
 * reveals **`TBD`** when tapped, which is honest: the season is real, it is
 * happening, and nobody has won it yet. That is different from a placeholder,
 * which claims a season exists that does not.
 *
 * ## Where the name comes from, and where it does not
 *
 * `final_rank = 1` on a **finalized** season, and nothing else. Sleeper marks a
 * season complete the moment the last game ends, but stat corrections keep
 * landing for weeks — so an unfinalized season has no champion here even if
 * Sleeper thinks it does. Naming the wrong person on the wall is the single
 * worst failure this feature has available to it.
 */

export interface Banner {
  readonly year: number;
  /** The two digits painted on the fabric. */
  readonly label: string;
  /** The canonical display name, or null while the season is unfinished. */
  readonly champion: string | null;
  /** True for the season currently being played — reveals `TBD`. */
  readonly current: boolean;
}

/** Six slots. At season seven the window shifts left once; banners never resize. */
export const RAIL_CAPACITY = 6;

export async function championBanners(db: Database): Promise<readonly Banner[]> {
  const rows = await db
    .select({
      year: seasons.year,
      finalizedAt: seasons.finalizedAt,
      status: seasons.status,
      finalRank: seasonMemberships.finalRank,
      displayName: users.displayName,
    })
    .from(seasons)
    .leftJoin(seasonMemberships, eq(seasonMemberships.seasonId, seasons.id))
    .leftJoin(users, eq(users.id, seasonMemberships.userId))
    .orderBy(asc(seasons.year));

  const byYear = new Map<number, { champion: string | null; finalized: boolean }>();

  for (const row of rows) {
    const entry = byYear.get(row.year) ?? { champion: null, finalized: row.finalizedAt !== null };
    // Only a finalized season names a champion. See the note above.
    if (row.finalizedAt !== null && row.finalRank === 1 && row.displayName !== null) {
      entry.champion = row.displayName;
    }
    entry.finalized = row.finalizedAt !== null;
    byYear.set(row.year, entry);
  }

  const latest = Math.max(...byYear.keys());

  const banners = [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, entry]) => ({
      year,
      label: String(year).slice(-2),
      champion: entry.champion,
      // **Not simply `!finalized`.** A 2024 season that is archived but has not
      // been through `--finalize` has no champion on record, and saying "still
      // being played" about it would be plainly false. Only the newest season
      // can be the one in progress; anything older without a champion is a gap
      // in the record, and the panel says so instead.
      current: year === latest && !entry.finalized,
    }));

  // At season seven the six-season window shifts left once and shows the six
  // most recent. Before that it is every season there has ever been.
  return banners.slice(-RAIL_CAPACITY);
}
