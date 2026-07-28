import { and, desc, eq, ne } from 'drizzle-orm';

import { type Database } from '@/lib/db';
import { seasonMemberships, seasons } from '@/lib/db/schema';

/**
 * The receipt on the counter.
 *
 * `16 §2` puts it in the weekly loop — "your receipt on the counter: result,
 * tokens, streak, standing". In the offseason there is no result and no tokens
 * yet, so what the receipt carries is the last real thing that happened to
 * this manager: their finished season.
 *
 * Everything on it is imported fact. Where a fact does not exist — a manager
 * with no completed season — the receipt says so rather than printing a zero.
 * A zero looks like a result. "No record on file" is the truth (`16 §12`).
 */

export interface Receipt {
  readonly year: number;
  readonly record: string;
  readonly pointsFor: number;
  readonly pointsAgainst: number;
  /** Placement where the bracket produced one. */
  readonly finalRank: number | null;
  readonly madePlayoffs: boolean;
  /** "Champion", "Runner-up", "4th", "Missed the playoffs". */
  readonly finish: string;
  readonly rosterId: number;
}

export function describeFinish(finalRank: number | null, madePlayoffs: boolean): string {
  if (finalRank === 1) return 'Champion';
  if (finalRank === 2) return 'Runner-up';
  if (finalRank !== null) return `${ordinal(finalRank)} place`;
  if (madePlayoffs) return 'Made the playoffs';
  return 'Missed the playoffs';
}

function ordinal(value: number): string {
  const suffix =
    value % 100 >= 11 && value % 100 <= 13
      ? 'th'
      : value % 10 === 1
        ? 'st'
        : value % 10 === 2
          ? 'nd'
          : value % 10 === 3
            ? 'rd'
            : 'th';
  return `${String(value)}${suffix}`;
}

/**
 * The manager's most recent finished season.
 *
 * Deliberately the most recent *completed* one rather than the current one:
 * during the preseason the current season is a row of zeroes, and "0–0, 0.00
 * points" on a receipt reads as a result rather than as an absence.
 */
export async function receiptFor(db: Database, userId: string): Promise<Receipt | null> {
  const [row] = await db
    .select({
      year: seasons.year,
      wins: seasonMemberships.wins,
      losses: seasonMemberships.losses,
      ties: seasonMemberships.ties,
      pointsFor: seasonMemberships.pointsFor,
      pointsAgainst: seasonMemberships.pointsAgainst,
      finalRank: seasonMemberships.finalRank,
      madePlayoffs: seasonMemberships.madePlayoffs,
      rosterId: seasonMemberships.rosterId,
    })
    .from(seasonMemberships)
    .innerJoin(seasons, eq(seasonMemberships.seasonId, seasons.id))
    .where(and(eq(seasonMemberships.userId, userId), eq(seasons.status, 'ARCHIVED')))
    .orderBy(desc(seasons.year))
    .limit(1);

  if (row === undefined) return null;

  const record =
    row.ties > 0
      ? `${String(row.wins)}–${String(row.losses)}–${String(row.ties)}`
      : `${String(row.wins)}–${String(row.losses)}`;

  return {
    year: row.year,
    record,
    pointsFor: row.pointsFor,
    pointsAgainst: row.pointsAgainst,
    finalRank: row.finalRank,
    madePlayoffs: row.madePlayoffs,
    finish: describeFinish(row.finalRank, row.madePlayoffs),
    rosterId: row.rosterId,
  };
}

/** Everyone who has ever held this manager's current seat before them. */
export async function previousOccupants(
  db: Database,
  input: { rosterId: number; year: number; userId: string },
): Promise<readonly { year: number; userId: string }[]> {
  const rows = await db
    .select({ year: seasons.year, userId: seasonMemberships.userId })
    .from(seasonMemberships)
    .innerJoin(seasons, eq(seasonMemberships.seasonId, seasons.id))
    .where(
      and(
        eq(seasonMemberships.rosterId, input.rosterId),
        ne(seasonMemberships.userId, input.userId),
      ),
    )
    .orderBy(desc(seasons.year));

  return rows.filter((row) => row.year < input.year);
}
