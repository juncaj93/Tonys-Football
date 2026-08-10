import { asc, eq, sql } from 'drizzle-orm';

import { type Queryable } from '@/lib/db';
import { fantasyMatchups, seasons, weekFinalizations } from '@/lib/db/schema';
import { fromCents } from '@/lib/sleeper/reconcile';

import { rosterNames } from './facts';

/**
 * One week of football, resolved to people — the record everything narrative
 * reads from.
 *
 * ## Why this exists alongside `facts.ts` rather than inside it
 *
 * `MatchupFact` answers *"is there a claim here worth publishing"*, one game at a
 * time, and it deliberately emits at most two per week. That is right for the
 * board, where a single fact fills a single socket, and it is wrong for a
 * newspaper: a paper that reports two of five games has not reported the week.
 *
 * So this is the **complete** week — every paired game, every score, both people
 * — with no editorial judgement applied at all. Judgement happens downstream in
 * `stories.ts`, which is the only place allowed to decide what a result means
 * (`MANDATE §9`). Keeping the two apart is what lets the scoreboard print games
 * that were never a story, which is exactly what a scoreboard is for.
 *
 * `facts.ts` is untouched by this file and stays independently verified.
 *
 * ## Suppression is per-game, and it does not silence the week
 *
 * A disputed game (`16 §12`) or a roster that resolves to nobody cannot carry a
 * claim, so it carries `publishable: false` and a reason. It still appears in the
 * record — the caller decides whether a scoreboard line is a claim. It is not:
 * printing two numbers off a stored row asserts nothing about what they meant.
 *
 * ## Deterministic
 *
 * No clock, no randomness, stable ordering. `buildWeek` is pure so a frozen
 * fixture can drive the whole pipeline without a database — which is how the
 * Slice's demo editions work, and why they are the same code path as production
 * rather than a parallel one.
 */

/** `regular` · `playoff` · `consolation` · `unscored`, as stored. */
export type WeekType = string;

/** One team's week, attributed to the person who held the seat that season. */
export interface TeamWeek {
  readonly rosterId: number;
  /** Null when the roster has no membership that season. */
  readonly managerId: string | null;
  /** The canonical league name, never a Sleeper handle. Null with `managerId`. */
  readonly displayName: string | null;
  readonly points: number;
  readonly pointsCents: number;
}

/** Why a game cannot carry a published claim. Never rendered to a manager. */
export type GameSuppression = 'disputed' | 'roster-unresolved' | 'season-not-finalized';

export interface WeekGame {
  /** `2025-w14-m3`. Stable and derivable — the duplicate-story key. */
  readonly key: string;
  readonly season: number;
  readonly week: number;
  readonly weekType: WeekType;
  readonly sleeperMatchupId: number;

  /** Roster A and B as stored, so a swap cannot hide inside a symmetric margin. */
  readonly a: TeamWeek;
  readonly b: TeamWeek;

  /** Null on a tie. A tie is a result, not a missing winner. */
  readonly winner: TeamWeek | null;
  readonly loser: TeamWeek | null;
  readonly tie: boolean;

  readonly marginCents: number;
  /** Exact, from integer cents. Never a float subtraction. */
  readonly margin: number;

  /** False when no claim may rest on this game. `null` reason when true. */
  readonly publishable: boolean;
  readonly suppression: GameSuppression | null;
}

export interface WeekRecord {
  readonly season: number;
  readonly week: number;
  readonly weekType: WeekType;
  /** The season's books are closed and these numbers will not move. */
  readonly finalized: boolean;
  /** Every paired game of the week, in stable order. */
  readonly games: readonly WeekGame[];
}

/** One stored game, plus nothing else. The shape a fixture has to supply. */
export interface StoredWeekGame {
  readonly week: number;
  readonly weekType: WeekType;
  readonly sleeperMatchupId: number;
  readonly rosterAId: number;
  readonly rosterBId: number;
  readonly pointsACents: number;
  readonly pointsBCents: number;
  readonly winnerRosterId: number | null;
  readonly marginCents: number;
  readonly disputed: boolean;
}

/**
 * Build a week from stored rows. Pure.
 *
 * The winner is read from `winnerRosterId` rather than recomputed, because that
 * column is what `independent-verification.test.ts` checks against the raw files
 * — recomputing it here would create a second, unverified opinion about who won.
 */
export function buildWeek(input: {
  readonly season: number;
  readonly week: number;
  readonly finalized: boolean;
  readonly rows: readonly StoredWeekGame[];
  readonly roster: ReadonlyMap<number, { userId: string; displayName: string }>;
}): WeekRecord {
  const rows = [...input.rows]
    .filter((row) => row.week === input.week)
    .sort((x, y) => x.sleeperMatchupId - y.sleeperMatchupId || x.rosterAId - y.rosterAId);

  const team = (rosterId: number, cents: number): TeamWeek => {
    const seat = input.roster.get(rosterId);
    return {
      rosterId,
      managerId: seat?.userId ?? null,
      displayName: seat?.displayName ?? null,
      points: fromCents(cents),
      pointsCents: cents,
    };
  };

  const games = rows.map((row): WeekGame => {
    const a = team(row.rosterAId, row.pointsACents);
    const b = team(row.rosterBId, row.pointsBCents);
    const tie = row.winnerRosterId === null;
    const winner = tie ? null : row.winnerRosterId === row.rosterAId ? a : b;
    const loser = tie ? null : row.winnerRosterId === row.rosterAId ? b : a;

    const suppression: GameSuppression | null = !input.finalized
      ? 'season-not-finalized'
      : row.disputed
        ? 'disputed'
        : a.managerId === null || b.managerId === null
          ? 'roster-unresolved'
          : null;

    return {
      key: `${String(input.season)}-w${String(row.week).padStart(2, '0')}-m${String(row.sleeperMatchupId)}`,
      season: input.season,
      week: row.week,
      weekType: row.weekType,
      sleeperMatchupId: row.sleeperMatchupId,
      a,
      b,
      winner,
      loser,
      tie,
      marginCents: row.marginCents,
      margin: fromCents(row.marginCents),
      publishable: suppression === null,
      suppression,
    };
  });

  return {
    season: input.season,
    week: input.week,
    // The week's own type, taken from its games rather than assumed. A week with
    // no games has none, and callers must not invent one.
    weekType: games[0]?.weekType ?? 'unscored',
    finalized: input.finalized,
    games,
  };
}

/**
 * The same week with every unpublishable game removed.
 *
 * ## Why the boundary is applied *here*, before anything is derived
 *
 * It used to be applied to the finished story list, and that was a real defect
 * rather than a stylistic one. `deriveStories` picks the week's closest game and
 * its widest; if the closest happened to involve a retired manager, the
 * nail-biter candidate was built for that game and then dropped — and no story
 * took its place. 2024 week 7 was decided by 2.82 points and printed a streak
 * instead, because a person who is not in this league had quietly consumed the
 * slot.
 *
 * A boundary that removes a candidate *after* selection changes what gets
 * published. A boundary that removes it before changes only who is eligible,
 * which is what a boundary is for. Everything downstream — stories, scoreboard,
 * allowed names — reads the filtered week, so there is one filter and one place.
 *
 * The games are not deleted from anywhere: this returns a new record and the fact
 * layer, the audit trail and the history are untouched (`lib/league/membership.ts`
 * records why the true fact must survive).
 */
export function publishableWeek(
  week: WeekRecord,
  publishableManagerIds: ReadonlySet<string>,
): WeekRecord {
  const named = (id: string | null): boolean => id !== null && publishableManagerIds.has(id);
  return {
    ...week,
    games: week.games.filter(
      (game) => game.publishable && named(game.a.managerId) && named(game.b.managerId),
    ),
  };
}

/**
 * Every stored game of a season, ascending, with the seats it needs.
 *
 * ## `finalized` and `weekFinalizedAt` answer different questions
 *
 * `finalized` is the **season's** books closing in January. It is the right
 * question for a comparison population — a percentile that shifts under a
 * published fact makes the fact retroactively wrong — and the wrong question
 * for *"may this week be printed"*, which is what `week_finalizations` and
 * `lib/stats/finality.ts` exist to answer. Both are returned so a caller has to
 * pick one rather than inherit whichever this function happened to compute.
 */
export async function seasonWeeks(
  db: Queryable,
  year: number,
): Promise<{
  readonly found: boolean;
  /** The season's books are shut. January, not Tuesday. */
  readonly finalized: boolean;
  readonly seasonFinalizedAt: Date | null;
  /** Week → when the Tuesday job closed it. Empty before the first Tuesday. */
  readonly weekFinalizedAt: ReadonlyMap<number, Date>;
  readonly rows: readonly StoredWeekGame[];
  readonly roster: ReadonlyMap<number, { userId: string; displayName: string }>;
}> {
  const [season] = await db
    .select({ id: seasons.id, finalizedAt: seasons.finalizedAt })
    .from(seasons)
    .where(eq(seasons.year, year))
    .limit(1);

  if (season === undefined) {
    return {
      found: false,
      finalized: false,
      seasonFinalizedAt: null,
      weekFinalizedAt: new Map(),
      rows: [],
      roster: new Map(),
    };
  }

  const rows = await db
    .select({
      week: fantasyMatchups.week,
      weekType: fantasyMatchups.weekType,
      sleeperMatchupId: fantasyMatchups.sleeperMatchupId,
      rosterAId: fantasyMatchups.rosterAId,
      rosterBId: fantasyMatchups.rosterBId,
      pointsACents: fantasyMatchups.pointsACents,
      pointsBCents: fantasyMatchups.pointsBCents,
      winnerRosterId: fantasyMatchups.winnerRosterId,
      marginCents: fantasyMatchups.marginCents,
      disputed: fantasyMatchups.disputed,
    })
    .from(fantasyMatchups)
    .where(eq(fantasyMatchups.seasonId, season.id))
    .orderBy(
      asc(fantasyMatchups.week),
      asc(fantasyMatchups.sleeperMatchupId),
      asc(fantasyMatchups.rosterAId),
    );

  const closed = await db
    .select({ week: weekFinalizations.week, finalizedAt: weekFinalizations.finalizedAt })
    .from(weekFinalizations)
    .where(eq(weekFinalizations.seasonId, season.id));

  return {
    found: true,
    finalized: season.finalizedAt !== null,
    seasonFinalizedAt: season.finalizedAt,
    weekFinalizedAt: new Map(closed.map((row) => [row.week, row.finalizedAt])),
    rows,
    roster: await rosterNames(db, season.id),
  };
}

/**
 * The highest week of a season the Tuesday job has closed. Null before the first.
 *
 * The one honest answer to *"what week is it"* that this product holds. Sleeper's
 * `state.week` rolls over on Tuesday morning — measured, and the reason
 * `lib/sleeper/weekly.ts` refuses to ask it — and the latest *stored* week can be
 * a week whose games are half in. A closed week is a week somebody's job decided
 * was over, which is the same fact the paper on the rack is about.
 *
 * A single aggregate rather than {@link seasonWeeks}, because the homepage asks
 * this on every load and does not need the season's games to answer it.
 */
export async function latestFinalizedWeek(
  db: Queryable,
  seasonId: string,
): Promise<number | null> {
  const [row] = await db
    .select({ week: sql<number | null>`max(${weekFinalizations.week})` })
    .from(weekFinalizations)
    .where(eq(weekFinalizations.seasonId, seasonId));

  const week = row?.week;
  return week === null || week === undefined ? null : Number(week);
}

/**
 * Every finalized team-week score in cents, ascending.
 *
 * The comparison population for *"was that a big score"*, which is a different
 * question from *"was that a big margin"* and needs its own population. Finalized
 * only, for the reason `finalizedMarginsCents` gives: an open season's numbers
 * can still move, and a percentile that shifts under a published fact makes the
 * fact retroactively wrong.
 */
export function teamScoresCents(rows: readonly StoredWeekGame[]): number[] {
  const out: number[] = [];
  for (const row of rows) out.push(row.pointsACents, row.pointsBCents);
  return out.sort((x, y) => x - y);
}
