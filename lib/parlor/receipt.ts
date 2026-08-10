import { and, desc, eq, ne } from 'drizzle-orm';

import { type Database } from '@/lib/db';
import { seasonMemberships, seasons } from '@/lib/db/schema';
import { currentSeasonYear } from '@/lib/league/membership';
import { seasonWeeks, type StoredWeekGame } from '@/lib/stats/week';
import { standingsThrough } from '@/lib/stats/standings';

/**
 * The receipt on the counter.
 *
 * `16 §2` puts it in the weekly loop — "your receipt on the counter: result,
 * tokens, streak, standing". Which season it prints depends on whether this one
 * has produced anything yet; see {@link receiptFor}.
 *
 * Everything on it is imported fact. Where a fact does not exist — a manager
 * with no completed season and no finalized week — the receipt says so rather
 * than printing a zero. A zero looks like a result. "No record on file" is the
 * truth (`16 §12`).
 */

export interface Receipt {
  readonly year: number;
  readonly record: string;
  readonly pointsFor: number;
  readonly pointsAgainst: number;
  /**
   * Placement where the bracket produced one.
   *
   * **Always null while a season is in progress.** A placement is a finished
   * fact; a season with eight weeks played has no final rank, and inventing one
   * from the current table would be the inference `16 §12` forbids.
   */
  readonly finalRank: number | null;
  readonly madePlayoffs: boolean;
  /** "Champion", "Runner-up", "4th place", or "3rd through week 8". */
  readonly finish: string;
  readonly rosterId: number;
  /**
   * True when this receipt is the season currently being played.
   *
   * On the slip the year is already printed, so this is not what tells a reader
   * which season they are looking at — it is what tells a *caller* that
   * {@link finalRank} is absent by rule rather than by accident.
   */
  readonly inProgress: boolean;
  /**
   * The last finalized week this record counts, or null on an archived season.
   *
   * The scope of the claim, carried with it. A record of 6–2 means nothing
   * without it once a season is half played.
   */
  readonly throughWeek: number | null;
}

export function describeFinish(finalRank: number | null, madePlayoffs: boolean): string {
  if (finalRank === 1) return 'Champion';
  if (finalRank === 2) return 'Runner-up';
  if (finalRank !== null) return `${ordinal(finalRank)} place`;
  if (madePlayoffs) return 'Made the playoffs';
  return 'Missed the playoffs';
}

/**
 * Where a manager stands **so far**, with the scope in the sentence.
 *
 * Deliberately not `describeFinish`. "4th place" is a claim about how a season
 * ended; this is a claim about a table after a stated number of weeks, and the
 * two must not be able to be mistaken for each other on a slip that carries no
 * other context.
 */
export function describeStanding(rank: number, throughWeek: number): string {
  return `${ordinal(rank)} through week ${String(throughWeek)}`;
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

function writeRecord(wins: number, losses: number, ties: number): string {
  return ties > 0
    ? `${String(wins)}–${String(losses)}–${String(ties)}`
    : `${String(wins)}–${String(losses)}`;
}

/**
 * The manager's receipt — **this** season once it has produced results, and the
 * last finished one until then.
 *
 * ## The rule, and why it changed
 *
 * It used to be *always* the most recent archived season, justified like this:
 *
 * > during the preseason the current season is a row of zeroes, and "0–0, 0.00
 * > points" on a receipt reads as a result rather than as an absence.
 *
 * That is a good reason and it is **preseason-scoped**. Nothing re-evaluated it
 * once the season started, so the midseason rehearsal found every manager's
 * receipt still showing 2025 in week 8 of a 2026 season that was 7–1
 * (`docs/WEEK8_REHEARSAL.md §5.2`). Commissioner ruling, 2026-08-10: show the
 * current season once the current season has finalized game data.
 *
 * So the switch is on the thing the old reason was actually about — *does this
 * season contain a result yet* — rather than on a date:
 *
 * | State | What prints |
 * |---|---|
 * | No finalized week in the current season | The most recent **archived** season |
 * | At least one finalized week | **This** season, through that week |
 * | Neither exists | `null` — "No record on file" |
 *
 * ## Finalized weeks only, and nothing blended
 *
 * The live record is rebuilt from stored games whose week carries a
 * `week_finalizations` row, and from **no other week**. Two things follow, both
 * of them the ruling's:
 *
 *   - *"Do not infer unfinished results."* A week that has been synced but not
 *     closed is not counted. `season_memberships` for an open season mirrors
 *     Sleeper's running standings and **would** include it, which is exactly why
 *     the live record is recomputed here rather than read from there.
 *   - *"Do not blend seasons."* Nothing archived contributes a single point to a
 *     live receipt, and nothing live contributes to an archived one. They are
 *     two different queries with no path between them.
 *
 * `standingsThrough` is the same function the standings surfaces use, so a
 * manager who disagrees with their own receipt can add up the column themselves
 * — the property `MANDATE §10` exists to protect.
 *
 * ## What a live receipt does not claim
 *
 * No `finalRank`, no `madePlayoffs`, no "Champion". The headline is
 * {@link describeStanding} — a rank with the week it is true through, printed
 * next to the year. A season in progress has a standing; it does not have a
 * finish, and this is not a career record.
 */
export async function receiptFor(db: Database, userId: string): Promise<Receipt | null> {
  return (await liveReceiptFor(db, userId)) ?? (await archivedReceiptFor(db, userId));
}

/**
 * This season, if it has finalized anything and this manager holds a seat in it.
 *
 * Null is an ordinary answer and means "fall through to the archive" — the
 * preseason, a manager who is not seated this year, or a season whose first
 * Tuesday has not run.
 */
async function liveReceiptFor(db: Database, userId: string): Promise<Receipt | null> {
  const year = await currentSeasonYear(db);
  if (year === null) return null;

  const season = await seasonWeeks(db, year);
  if (!season.found) return null;

  /*
   * An archived season reached through this path would print a *standing* where
   * it should print a finish, so the live path stops at the season's own close.
   * The archive query below is the one that owns a finished season.
   */
  if (season.finalizedAt !== null) return null;

  const finalized = [...season.weekFinalizedAt.keys()].sort((a, b) => a - b);
  if (finalized.length === 0) return null;

  const seat = [...season.roster.entries()].find(([, held]) => held.userId === userId);
  if (seat === undefined) return null;
  const rosterId = seat[0];

  /*
   * The finalized weeks, and only those.
   *
   * Filtering the rows rather than passing `throughWeek` alone: a week that is
   * stored but unclosed can sit *below* the highest closed week — a Tuesday that
   * declined a week and ran again the following one — and `throughWeek` would
   * sweep it in. This counts closure per week, which is what the rule says.
   */
  const closed = new Set(finalized);
  const rows: readonly StoredWeekGame[] = season.rows.filter((row) => closed.has(row.week));
  const throughWeek = finalized[finalized.length - 1]!;

  const table = standingsThrough({ rows, throughWeek, roster: season.roster });
  const mine = table.find((row) => row.rosterId === rosterId);
  if (mine === undefined) return null;

  // Nothing counted, so nothing to print — the same answer as an unplayed
  // season, reached from the other direction (every closed week was playoffs,
  // say, which `standingsThrough` excludes by design).
  if (mine.wins + mine.losses + mine.ties === 0) return null;

  return {
    year,
    record: writeRecord(mine.wins, mine.losses, mine.ties),
    pointsFor: mine.pointsForCents / 100,
    pointsAgainst: pointsAgainstCents(rows, rosterId) / 100,
    finalRank: null,
    madePlayoffs: false,
    finish: describeStanding(mine.rank, throughWeek),
    rosterId,
    inProgress: true,
    throughWeek,
  };
}

/**
 * Points conceded across the same games the record was built from.
 *
 * `standingsThrough` does not compute it — it is not a standings input — so it
 * is summed here from the identical row set, in integer cents, so the two halves
 * of the slip can never disagree about which games they counted.
 */
function pointsAgainstCents(rows: readonly StoredWeekGame[], rosterId: number): number {
  let total = 0;
  for (const row of rows) {
    if (row.weekType !== 'regular') continue;
    if (row.rosterAId === rosterId) total += row.pointsBCents;
    else if (row.rosterBId === rosterId) total += row.pointsACents;
  }
  return total;
}

/** The most recent finished season, from its official record. */
async function archivedReceiptFor(db: Database, userId: string): Promise<Receipt | null> {
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

  return {
    year: row.year,
    record: writeRecord(row.wins, row.losses, row.ties),
    pointsFor: row.pointsFor,
    pointsAgainst: row.pointsAgainst,
    finalRank: row.finalRank,
    madePlayoffs: row.madePlayoffs,
    finish: describeFinish(row.finalRank, row.madePlayoffs),
    rosterId: row.rosterId,
    inProgress: false,
    throughWeek: null,
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
