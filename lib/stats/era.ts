import { asc, eq, isNotNull } from 'drizzle-orm';

import { type Queryable } from '@/lib/db';
import { seasonMemberships, seasons } from '@/lib/db/schema';
import { fromCents } from '@/lib/sleeper/reconcile';

import { rosterNames } from './facts';
import { seasonWeeks, type StoredWeekGame } from './week';

/**
 * The recorded era, resolved to **people** — the one place cross-season history
 * is read from the database.
 *
 * ## Why a separate loader from `week.ts`
 *
 * `seasonWeeks` answers *"what happened in one season"* and hands back roster
 * ids plus that season's seat map. Every question this library exists to answer
 * — has Nick ever beaten Ryan, who holds the highest score, did these two meet
 * in a final — spans seasons, and **a roster id does not.** `16 §5.1`: roster 4
 * is Berardo in 2024, Topouzian in 2025 and Zack in 2026. Aggregating by roster
 * id across seasons would silently merge three people, and it would do so while
 * producing numbers that look entirely reasonable.
 *
 * So this resolves every side of every game to a **permanent manager id** at
 * load, once, and everything downstream of it is manager-keyed. A game whose
 * roster does not resolve to a person is kept — the record is complete — and
 * marked uncountable, exactly as `week.ts` does.
 *
 * ## Finalized seasons only, and that is structural
 *
 * An open season's numbers can still move upstream, and a percentile or a record
 * that shifts under a published claim makes the claim retroactively wrong
 * (`facts.ts` states the same rule for margins). There is no parameter here to
 * include an open season. In August 2026 that means the era is 2024 and 2025.
 *
 * ## Retired managers are in it
 *
 * Berardo played 2024; Shant and Armen were roster 4 in 2025. They are in the
 * era because **they were in the games**, and a head-to-head record that quietly
 * dropped them would be wrong about the past. They are not publishable — the
 * commissioner's 2026-07-30 ruling is absolute — and that is a separate decision
 * applied at the boundary, not here. `lib/stats/history.ts` takes the publishable
 * set as a parameter and `lib/league/membership.ts` records why the true fact
 * must survive the unpublishable one.
 *
 * ## Deterministic
 *
 * No clock, no randomness, stable ordering three deep. Two loads over the same
 * rows produce deep-equal output.
 */

/** One side of one game, attributed to the person who held the seat that season. */
export interface EraSide {
  readonly rosterId: number;
  /** Null when the roster has no membership that season. */
  readonly managerId: string | null;
  /** The canonical league name, never a Sleeper handle. Null with `managerId`. */
  readonly displayName: string | null;
  readonly pointsCents: number;
  readonly points: number;
}

/**
 * What kind of game this was — a finer question than `week_type` can answer.
 *
 * Sleeper keeps every roster playing through the playoff weeks, so a week typed
 * `playoff` holds bracket games *and* consolation games side by side, and the
 * stored `week_type` cannot tell them apart. Both seasons on record store
 * exactly two types (`regular`, `playoff`) and eleven playoff-week games each,
 * of which only some are the bracket.
 *
 * The distinction matters as soon as a claim uses the word *playoff*. A
 * consolation game between the ninth and tenth seeds is a real result and is not
 * a playoff meeting, and `season_memberships.made_playoffs` — derived at import
 * from the bracket itself, never from seed or record — is what separates them.
 */
export type GameStage = 'regular' | 'bracket' | 'consolation' | 'unscored';

/** Why a game cannot carry a counted claim. Null when it can. */
export type Uncountable = 'disputed' | 'roster-unresolved' | 'unscored';

export interface EraGame {
  /** `2024-w07-m3`. The same key `week.ts` builds, so the two are joinable. */
  readonly key: string;
  readonly season: number;
  readonly week: number;
  /** As stored: `regular` · `playoff`. */
  readonly weekType: string;
  readonly stage: GameStage;
  readonly sleeperMatchupId: number;

  /** A and B in stored order, so a swap cannot hide inside a symmetric margin. */
  readonly a: EraSide;
  readonly b: EraSide;
  readonly winner: EraSide | null;
  readonly loser: EraSide | null;
  readonly tie: boolean;

  readonly marginCents: number;
  readonly margin: number;
  readonly disputed: boolean;

  /**
   * Both sides resolve to a person, the week is scored, and no unresolved
   * disagreement rests on it.
   *
   * Every count, record, streak and series in this library is over countable
   * games. The uncountable ones stay in `games` so a report can say how many
   * were set aside and why — a population that silently shrank is the one thing
   * an auditable claim cannot survive.
   */
  readonly countable: boolean;
  readonly uncountableBecause: Uncountable | null;
}

/** A permanent identity, and the seasons it held a seat in. */
export interface EraManager {
  readonly id: string;
  readonly displayName: string;
  /** Ascending. A manager absent for a season is simply not in it. */
  readonly seasons: readonly number[];
}

export interface TrackedEra {
  /** Every finalized season, ascending. Empty before anything closes. */
  readonly seasons: readonly number[];
  /** Every stored game of those seasons, in stable order. */
  readonly games: readonly EraGame[];
  /** Everyone who held a seat in any of them, retired included. */
  readonly managers: ReadonlyMap<string, EraManager>;
  /** Season → the manager who finished first. Only where a bracket decided one. */
  readonly champions: ReadonlyMap<number, string>;
  /** Season → the manager who finished second. */
  readonly runnersUp: ReadonlyMap<number, string>;
  /** Season → manager id → final placement, 1 is first. */
  readonly finalRanks: ReadonlyMap<number, ReadonlyMap<string, number>>;
}

/** The empty era, for a database with nothing finalized in it. */
export const EMPTY_ERA: TrackedEra = Object.freeze({
  seasons: [],
  games: [],
  managers: new Map(),
  champions: new Map(),
  runnersUp: new Map(),
  finalRanks: new Map(),
});

/**
 * Load every finalized season, resolved to people.
 *
 * One pass. The derivations downstream are pure and take this whole object, so a
 * caller answering several questions loads once — and a test can hand in an era
 * it built by hand, which is how the pure fixtures below the database tests
 * work.
 */
export async function loadTrackedEra(db: Queryable): Promise<TrackedEra> {
  const finalized = await db
    .select({ id: seasons.id, year: seasons.year })
    .from(seasons)
    .where(isNotNull(seasons.finalizedAt))
    .orderBy(asc(seasons.year));

  if (finalized.length === 0) return EMPTY_ERA;

  const games: EraGame[] = [];
  const managers = new Map<string, { id: string; displayName: string; seasons: number[] }>();
  const champions = new Map<number, string>();
  const runnersUp = new Map<number, string>();
  const finalRanks = new Map<number, ReadonlyMap<string, number>>();

  for (const season of finalized) {
    const stored = await seasonWeeks(db, season.year);
    // `seasonWeeks` reports finalization independently. A season selected by
    // `finalized_at` that comes back open would mean the two disagree, and
    // building history on the disagreement is worse than building none.
    if (!stored.found || !stored.finalized) continue;

    const roster = await rosterNames(db, season.id);
    const placements = await seasonPlacements(db, season.id);

    for (const seat of roster.values()) {
      const existing = managers.get(seat.userId);
      if (existing === undefined) {
        managers.set(seat.userId, {
          id: seat.userId,
          displayName: seat.displayName,
          seasons: [season.year],
        });
      } else if (!existing.seasons.includes(season.year)) {
        existing.seasons.push(season.year);
      }
    }

    const ranksByManager = new Map<string, number>();
    for (const [rosterId, rank] of placements.finalRanks) {
      const seat = roster.get(rosterId);
      if (seat === undefined) continue;
      ranksByManager.set(seat.userId, rank);
      if (rank === 1) champions.set(season.year, seat.userId);
      if (rank === 2) runnersUp.set(season.year, seat.userId);
    }
    finalRanks.set(season.year, ranksByManager);

    for (const row of stored.rows) {
      games.push(
        buildEraGame({
          season: season.year,
          row,
          roster,
          playoffRosters: placements.playoffRosters,
        }),
      );
    }
  }

  games.sort(
    (x, y) =>
      x.season - y.season ||
      x.week - y.week ||
      x.sleeperMatchupId - y.sleeperMatchupId ||
      x.a.rosterId - y.a.rosterId,
  );

  return {
    seasons: finalized.map((season) => season.year),
    games,
    managers: new Map(
      [...managers.values()].map((manager) => [
        manager.id,
        {
          id: manager.id,
          displayName: manager.displayName,
          seasons: [...manager.seasons].sort((a, b) => a - b),
        },
      ]),
    ),
    champions,
    runnersUp,
    finalRanks,
  };
}

/**
 * One stored row, resolved. Pure, and exported so a fixture can build an era.
 *
 * The winner is read from `winner_roster_id` rather than recomputed, for the
 * reason `week.ts` gives: that column is what `independent-verification.test.ts`
 * checks against the raw Sleeper files, and recomputing it here would create a
 * second, unverified opinion about who won.
 */
export function buildEraGame(input: {
  readonly season: number;
  readonly row: StoredWeekGame;
  readonly roster: ReadonlyMap<number, { userId: string; displayName: string }>;
  readonly playoffRosters: ReadonlySet<number>;
}): EraGame {
  const { row, roster } = input;

  const side = (rosterId: number, cents: number): EraSide => {
    const seat = roster.get(rosterId);
    return {
      rosterId,
      managerId: seat?.userId ?? null,
      displayName: seat?.displayName ?? null,
      pointsCents: cents,
      points: fromCents(cents),
    };
  };

  const a = side(row.rosterAId, row.pointsACents);
  const b = side(row.rosterBId, row.pointsBCents);
  const tie = row.winnerRosterId === null;
  const winner = tie ? null : row.winnerRosterId === row.rosterAId ? a : b;
  const loser = tie ? null : row.winnerRosterId === row.rosterAId ? b : a;

  const stage = stageOf(row.weekType, input.playoffRosters, row.rosterAId, row.rosterBId);

  const uncountableBecause: Uncountable | null =
    stage === 'unscored'
      ? 'unscored'
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
    stage,
    sleeperMatchupId: row.sleeperMatchupId,
    a,
    b,
    winner,
    loser,
    tie,
    marginCents: row.marginCents,
    margin: fromCents(row.marginCents),
    disputed: row.disputed,
    countable: uncountableBecause === null,
    uncountableBecause,
  };
}

/**
 * Bracket or consolation, from who was actually in the bracket.
 *
 * `made_playoffs` is derived at import from the winners bracket itself
 * (`lib/sleeper/placements.ts`) and never inferred from seed or record. A
 * playoff-week game where both sides made the bracket is a bracket game;
 * anything else in that week is the consolation side of the draw.
 */
function stageOf(
  weekType: string,
  playoffRosters: ReadonlySet<number>,
  rosterAId: number,
  rosterBId: number,
): GameStage {
  if (weekType === 'regular') return 'regular';
  if (weekType !== 'playoff' && weekType !== 'consolation') return 'unscored';
  const bothInBracket = playoffRosters.has(rosterAId) && playoffRosters.has(rosterBId);
  return bothInBracket ? 'bracket' : 'consolation';
}

/**
 * What the bracket decided, by roster, for one season.
 *
 * A local query rather than an import from `lib/slice/packet.ts`, which has the
 * same read. `lib/stats` is the layer the Slice sits on; importing upward would
 * invert that and make the fact layer unusable without the newspaper.
 */
async function seasonPlacements(
  db: Queryable,
  seasonId: string,
): Promise<{
  readonly finalRanks: ReadonlyMap<number, number>;
  readonly playoffRosters: ReadonlySet<number>;
}> {
  const rows = await db
    .select({
      rosterId: seasonMemberships.rosterId,
      finalRank: seasonMemberships.finalRank,
      madePlayoffs: seasonMemberships.madePlayoffs,
    })
    .from(seasonMemberships)
    .where(eq(seasonMemberships.seasonId, seasonId))
    .orderBy(asc(seasonMemberships.rosterId));

  return {
    finalRanks: new Map(
      rows
        .filter((row): row is typeof row & { finalRank: number } => row.finalRank !== null)
        .map((row) => [row.rosterId, row.finalRank]),
    ),
    playoffRosters: new Set(rows.filter((row) => row.madePlayoffs).map((row) => row.rosterId)),
  };
}

/** Every countable game of the era, in stable order. */
export function countableGames(era: TrackedEra): readonly EraGame[] {
  return era.games.filter((game) => game.countable);
}

/** The two sides of a game as manager ids, or null when either does not resolve. */
export function participants(game: EraGame): readonly [string, string] | null {
  if (game.a.managerId === null || game.b.managerId === null) return null;
  return [game.a.managerId, game.b.managerId];
}
