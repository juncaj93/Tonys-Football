import { and, count, desc, eq, isNotNull } from 'drizzle-orm';

import { type Database } from '@/lib/db';
import { seasonMemberships, seasons, users } from '@/lib/db/schema';

import { seasonClock } from './season';

/**
 * Tonight at Tony's.
 *
 * `16 §7.1`: what matters now, in **at most four lines, never scrolling**. It
 * answers "what's new" in under five seconds or it has failed, and a fifth line
 * is how a board becomes a feed.
 *
 * ## It is a view, and stays one
 *
 * `16 §4.1` makes the board a view over `league_events` — nothing stores "what
 * the board says now". The spine does not exist yet, so these lines are
 * computed from imported history and the season clock on every load. When the
 * spine lands, the source changes and the surface does not. What must not
 * happen in between is a `tonight_lines` table, because that is the drift the
 * spine exists to prevent.
 *
 * Every line is a curated template filled with a verified value. No generated
 * prose: the Slice is the only place an LLM writes anything (`16 §9`).
 */

export const MAX_TONIGHT_LINES = 4;

export interface TonightLine {
  readonly key: string;
  readonly text: string;
  /** Ordering hint; lower is more important. */
  readonly priority: number;
}

export async function tonightBoard(db: Database): Promise<readonly TonightLine[]> {
  const clock = seasonClock();
  const lines: TonightLine[] = [];

  const [latestSeason] = await db
    .select({ id: seasons.id, year: seasons.year })
    .from(seasons)
    .orderBy(desc(seasons.year))
    .limit(1);

  // --- The season, counted down -------------------------------------------
  if (clock.daysUntilKickoff !== null) {
    lines.push({
      key: 'kickoff',
      text:
        clock.daysUntilKickoff === 1
          ? 'Week one is tomorrow. Tony has been ready since March.'
          : `Week one opens in ${String(clock.daysUntilKickoff)} days.`,
      priority: 10,
    });
  }

  // --- Who still holds the ring -------------------------------------------
  const [champion] = await db
    .select({ name: users.displayName, year: seasons.year })
    .from(seasonMemberships)
    .innerJoin(seasons, eq(seasonMemberships.seasonId, seasons.id))
    .innerJoin(users, eq(seasonMemberships.userId, users.id))
    .where(and(eq(seasonMemberships.finalRank, 1), eq(seasons.status, 'ARCHIVED')))
    .orderBy(desc(seasons.year))
    .limit(1);

  if (champion !== undefined) {
    lines.push({
      key: 'champion',
      text: `${champion.name} still has the ${String(champion.year)} ring. Nobody has taken it off him.`,
      priority: 20,
    });
  }

  // --- Who has picked up their keys ---------------------------------------
  if (latestSeason !== undefined) {
    const [seats] = await db
      .select({ total: count() })
      .from(seasonMemberships)
      .where(eq(seasonMemberships.seasonId, latestSeason.id));

    const [claimed] = await db
      .select({ total: count() })
      .from(seasonMemberships)
      .innerJoin(users, eq(seasonMemberships.userId, users.id))
      .where(
        and(eq(seasonMemberships.seasonId, latestSeason.id), isNotNull(users.pinUpdatedAt)),
      );

    const total = seats?.total ?? 0;
    const inside = claimed?.total ?? 0;

    if (total > 0 && inside < total) {
      lines.push({
        key: 'keys',
        // "1 of 10 managers have" is the sort of thing a template writes and a
        // person never says.
        text:
          inside === 1
            ? `1 of ${String(total)} managers has picked up their key.`
            : `${String(inside)} of ${String(total)} managers have picked up their keys.`,
        priority: 30,
      });
    } else if (total > 0) {
      lines.push({
        key: 'keys',
        text: 'Everybody has a key now. Tony is not sure how he feels about that.',
        priority: 30,
      });
    }
  }

  // --- What is on the books -----------------------------------------------
  const archived = await db
    .select({ year: seasons.year })
    .from(seasons)
    .where(eq(seasons.status, 'ARCHIVED'))
    // Oldest first: the league's history reads forward, the way it happened.
    .orderBy(seasons.year);

  if (archived.length > 0) {
    const years = archived.map((season) => String(season.year));
    /**
     * Two years read as a sentence; five read as a list a machine wrote.
     *
     * `years.join(' and ')` was fine for 2024 and 2025 and became
     * *"2021 and 2022 and 2023 and 2024 and 2025 are on the books"* the moment a
     * third season existed — which it will in January 2027, on its own, with
     * nobody looking. Contiguous history collapses to a range; a gap keeps the
     * years so the sentence never claims a season the league did not play.
     */
    const first = years[0]!;
    const last = years[years.length - 1]!;
    const contiguous = Number(last) - Number(first) + 1 === years.length;

    lines.push({
      key: 'history',
      text:
        years.length === 1
          ? `${first} is on the books, every game of it.`
          : years.length === 2
            ? `${first} and ${last} are on the books, every game of them.`
            : contiguous
              ? `${first} through ${last} are on the books, every game of them.`
              : `${years.join(', ')} are on the books, every game of them.`,
      priority: 40,
    });
  }

  return lines.sort((a, b) => a.priority - b.priority).slice(0, MAX_TONIGHT_LINES);
}
