import { type Queryable } from '@/lib/db';
import { activeManagerIds } from '@/lib/league/membership';
import { seasons, weekFinalizations } from '@/lib/db/schema';
import { fromCents } from '@/lib/sleeper/reconcile';
import { weekFinality, type Finality } from '@/lib/stats/finality';
import { standingsThrough, type StandingRow } from '@/lib/stats/standings';
import {
  buildWeek,
  publishableWeek,
  seasonWeeks,
  type StoredWeekGame,
  type WeekRecord,
} from '@/lib/stats/week';
import { eq } from 'drizzle-orm';

/**
 * The Stats boundary for weekly stakes.
 *
 * **Everything a stake knows about football comes through this file**, and this
 * file computes nothing of its own. It reads `lib/stats/` — the layer that is
 * independently verified against the raw Sleeper fixtures — and reshapes the
 * answers into the two records authoring and resolution need.
 *
 * That is the whole point of it existing. The instruction is explicit: a stake
 * may not independently infer matchup participants, scores, margins, standings,
 * favourites, records, streaks or finalized outcomes. A single module that owns
 * every read makes that a property somebody can check by reading one import
 * list, rather than a habit spread across five files.
 *
 * ## Two records, because the two questions are different
 *
 * - **{@link StakeBasis}** — what was known *before* the week. Everything here
 *   is drawn from weeks **strictly earlier** than the stake's own, which is what
 *   makes a line or a prediction a claim about the future rather than a
 *   restatement of the past. Enforced in `buildBasis`, asserted in the tests.
 * - **{@link WeekResult}** — what the week actually produced, and whether it is
 *   allowed to settle anything (`lib/stats/finality.ts`).
 *
 * ## The publication boundary is applied here, once
 *
 * Retired managers are not participants in this product (`lib/league/membership.ts`),
 * and the fact layer's answer is `publishableWeek`. Applying it here — before a
 * line is computed and before a bounty is offered — means a retired manager
 * cannot be the reason a bounty target is unreachable, cannot appear in a
 * standings-based prediction, and cannot be eligible for a market. Filtering
 * *after* the numbers were computed is the exact defect the Slice already shipped
 * once: a boundary that removes a candidate after selection changes the answer.
 */

/** One team's finalized week, attributed to the person who held the seat. */
export interface TeamResult {
  readonly rosterId: number;
  readonly managerId: string;
  readonly displayName: string;
  readonly pointsCents: number;
  /** Null on a tie — a tie is a result, not a missing winner. */
  readonly won: boolean | null;
}

/**
 * What was known before a week — the only inputs a claim about it may use.
 *
 * `medianTeamScoreCents` and `bestTeamScoreCents` are **order statistics of real
 * team-weeks**, not averages. That matters twice: the median is exact in integer
 * cents with no rounding question, and the line a manager is asked about is a
 * score somebody in this league actually posted.
 */
export interface StakeBasis {
  readonly season: number;
  /** The week the stake is about. Nothing in this record comes from it. */
  readonly week: number;
  readonly basisWeeks: readonly number[];
  readonly gameKeys: readonly string[];
  /** How many team-weeks informed the order statistics. */
  readonly teamWeeks: number;
  /** The lower median team-week score to date. Null below the floor. */
  readonly medianTeamScoreCents: number | null;
  /** The best single team-week to date, and who posted it. */
  readonly bestTeamScoreCents: number | null;
  readonly bestTeamScoreBy: string | null;
  /** The table after the last basis week. Empty before any regular week. */
  readonly standings: readonly StandingRow[];
  /** Managers who may be offered a stake, in stable order. */
  readonly eligibleUserIds: readonly string[];
  /**
   * Each manager's own team-weeks so far, ascending, keyed by user id.
   *
   * **The whole reason Tony's Line can be personal.** The league-wide order
   * statistics above answer *"what does a score look like around here"*; this
   * answers *"what does a score look like from **you**"*, and a line built from
   * the second is a line about that manager's team.
   *
   * Built from exactly the same publishable games the league-wide sample is
   * built from — same weeks, same disputed-game exclusion, same publication
   * boundary — so a manager's own history can never contain a game the league's
   * does not.
   */
  readonly scoresByUser: ReadonlyMap<string, readonly number[]>;
}

/**
 * One publishable game, reduced to what a chalkboard proposition may ask about.
 *
 * The margin and the two ends of it, and nothing else. `WeekResult.teams` is a
 * flat list on purpose — the line and the bounty are about scores — but *"did
 * any game finish inside six points"* is a question about a **pairing**, and a
 * pairing cannot be recovered from a flat list of ten scores.
 *
 * `winner` and `loser` are null together on a tie, exactly as `WeekGame` has
 * them, because a tie is a result rather than a missing winner.
 */
export interface GameResult {
  readonly key: string;
  /** Exact, from integer cents. Zero on a tie. */
  readonly marginCents: number;
  readonly tie: boolean;
  readonly winner: { readonly rosterId: number; readonly displayName: string } | null;
  readonly loser: { readonly rosterId: number; readonly displayName: string } | null;
}

/** A week's finalized result, and whether it is allowed to settle anything. */
export interface WeekResult {
  readonly season: number;
  readonly week: number;
  readonly finality: Finality;
  /** Publishable team-weeks only, in stable order. */
  readonly teams: readonly TeamResult[];
  /** The same games, as pairings. Only those with two nameable managers. */
  readonly games: readonly GameResult[];
  readonly gameKeys: readonly string[];
}

/**
 * The lower median, by index — never an average of two middles.
 *
 * `values[Math.floor((n - 1) / 2)]` of an ascending list. An averaged median of
 * an even count lands between two real scores and introduces a half-cent that
 * nobody ever posted; the lower median **is** one of the season's scores, which
 * is both exactly recomputable and the more honest thing to put on a chalkboard.
 *
 * The cost is that "half above, half below" becomes "at least half above", which
 * is inside `16 §9`'s *"structurally ~50/50"* and is stated rather than implied.
 */
export function lowerMedian(ascending: readonly number[]): number | null {
  if (ascending.length === 0) return null;
  return ascending[Math.floor((ascending.length - 1) / 2)] ?? null;
}

/**
 * The value at a percentile of an ascending sample, in cents.
 *
 * **Nearest-rank on the real sample**, never an interpolation between two
 * scores: `round(f · (n − 1))`, clamped. The number that comes out is therefore
 * a team-week somebody in this league actually posted, which is the same
 * argument {@link lowerMedian} makes and it holds for the same reason — a
 * chalkboard number is read as a score, and the first question anybody asks one
 * is *where did that come from*.
 *
 * This is the **exact** function swept in the investigation
 * (`docs/evidence/line-and-call/report.md`), so the calibrated settings there
 * describe the thresholds this ships. A different percentile convention would
 * quietly invalidate every YES rate in that report.
 */
export function percentileOf(ascending: readonly number[], fraction: number): number | null {
  if (ascending.length === 0) return null;
  const index = Math.min(
    ascending.length - 1,
    Math.max(0, Math.round(fraction * (ascending.length - 1))),
  );
  return ascending[index] ?? null;
}

/**
 * How many team-weeks a season median is allowed to be computed from.
 *
 * Twelve, which is roughly this league's opening fortnight once retired managers
 * are filtered out. One week is not a season median — it is one week, and calling
 * it a median would make the market's central claim false in exactly the weeks
 * where a manager is most likely to look at it.
 */
export const MIN_BASIS_TEAM_WEEKS = 12;

/**
 * How many of a manager's **own** team-weeks a personal line needs.
 *
 * Three, which puts the first line in week 4 — the commissioner's *"available
 * beginning around Week 4"*. Three is defensible only because the line is
 * **shrunk**: at n=3 the manager's own median carries 3/7 of the number and the
 * league's carries the rest, so a thin sample moves the line a little rather
 * than deciding it. Without the shrinkage this floor would be far too low.
 */
export const MIN_OWN_TEAM_WEEKS = 3;

/**
 * The shrinkage weight — how much of the line is *yours*.
 *
 * `n / (n + 4)`, the exact formulation measured in the investigation
 * (`docs/evidence/line-and-call/report.md`) and approved by the commissioner on
 * 2026-08-12. Four is the strength of the pull: at three of your own games the
 * league still carries more than half the number, at eight it is a third, and by
 * the end of a season it is a fifth. Nothing about it is tuned per manager.
 */
const SHRINK_PRIOR = 4;

/**
 * The middle of a sample, averaging the two middles of an even one.
 *
 * **Deliberately not `lowerMedian`.** That function exists so a published number
 * is one the league actually posted, and its own header makes that argument. It
 * does not apply here: a personal line is moved to the half-point below anyway
 * (see {@link onTheHalf}), so it was never going to be a score somebody posted,
 * and the ruling is to ship the formulation that was measured.
 */
function middle(ascending: readonly number[]): number | null {
  if (ascending.length === 0) return null;
  const mid = Math.floor((ascending.length - 1) / 2);
  if (ascending.length % 2 === 1) return ascending[mid] ?? null;
  return Math.round(((ascending[mid] ?? 0) + (ascending[mid + 1] ?? 0)) / 2);
}

/**
 * The half-point hook, in cents.
 *
 * A line on a whole point can be landed on exactly, and a push is a wager with
 * no answer — `weekly_stakes_line_pays_double` would have to pay or refund a
 * result that is neither over nor under. Every line ends on `.50`, so settlement
 * is always strictly one side.
 */
function onTheHalf(cents: number): number {
  return Math.floor(cents / 100) * 100 + 50;
}

/**
 * One manager's personal team-total line, in cents. Null below the floor.
 *
 * The approved formula, whole:
 *
 * ```
 *   weight = n / (n + 4)                       n = that manager's own team-weeks
 *   line   = weight · (their median)
 *          + (1 - weight) · (the league's median)
 *   line   = that, floored to the point and hung on the half
 * ```
 *
 * Deterministic, and every input is a stored finalized team score. No
 * projection, no ADP, no external ranking, no player-level data, no model.
 */
export function personalLineCents(input: {
  /** That manager's own prior team-weeks, ascending. */
  readonly own: readonly number[];
  /** Every eligible manager's prior team-weeks, ascending. */
  readonly league: readonly number[];
}): number | null {
  if (input.own.length < MIN_OWN_TEAM_WEEKS) return null;

  const mine = middle(input.own);
  const theirs = middle(input.league);
  if (mine === null || theirs === null) return null;

  const weight = input.own.length / (input.own.length + SHRINK_PRIOR);
  return onTheHalf(Math.round(weight * mine + (1 - weight) * theirs));
}

/**
 * How often a manager has cleared their own number lately.
 *
 * `{ cleared: 4, of: 6 }` becomes *"You've cleared this number in 4 of your last
 * 6."* The window is the last six of their own scores, or **everything they
 * have** when that is fewer — a truthful shorter window rather than a fabricated
 * six (commissioner, 2026-08-12).
 *
 * The scores arrive ascending from the basis, so the caller supplies them in the
 * order they were played; this counts, it does not order.
 */
export function clearedRecently(input: {
  /** That manager's own prior scores, most recent last. */
  readonly recentFirstToLast: readonly number[];
  readonly lineCents: number;
  readonly window?: number;
}): { readonly cleared: number; readonly of: number } | null {
  const window = input.window ?? 6;
  const recent = input.recentFirstToLast.slice(-window);
  if (recent.length === 0) return null;

  return {
    cleared: recent.filter((cents) => cents > input.lineCents).length,
    of: recent.length,
  };
}

/**
 * Every eligible manager's prior team-weeks, ascending — the league sample.
 *
 * Derived from `scoresByUser` rather than stored a second time, because the two
 * are built from the same loop over the same publishable games and a second copy
 * is a second thing that can disagree.
 */
export function leagueScores(basis: {
  readonly scoresByUser: ReadonlyMap<string, readonly number[]>;
}): readonly number[] {
  return [...basis.scoresByUser.values()].flat().sort((a, b) => a - b);
}

/** Points as a reader sees them. The Slice's formatter, so one form is written. */
export function writePoints(cents: number): string {
  return fromCents(cents).toFixed(2);
}

/**
 * Build the basis from stored weeks. Pure.
 *
 * Split from {@link stakeBasis} so a frozen fixture drives the **same**
 * arithmetic production does (`MANDATE §8`). A demo that ran its own would be
 * evidence about the demo.
 */
export function buildBasis(input: {
  readonly season: number;
  readonly week: number;
  readonly rows: readonly StoredWeekGame[];
  readonly roster: ReadonlyMap<number, { userId: string; displayName: string }>;
  readonly seasonFinalizedAt: Date | null;
  readonly eligibleUserIds: ReadonlySet<string>;
}): StakeBasis {
  const weeksBefore = [...new Set(input.rows.map((row) => row.week))]
    .filter((week) => week < input.week)
    .sort((a, b) => a - b);

  const scores: { cents: number; by: string }[] = [];
  const byUser = new Map<string, number[]>();
  const gameKeys: string[] = [];
  const basisWeeks: number[] = [];

  for (const week of weeksBefore) {
    /*
     * Built through the same two functions the newspaper uses, in the same
     * order: the raw week, then the publication boundary.
     *
     * ## Why `finalized` is passed as true here, and why that is not a loophole
     *
     * The first version passed the season's real state, so an open season's games
     * arrived marked `season-not-finalized` and the basis came out empty. That is
     * correct for the newspaper and **wrong for a market**: `16 §9` sets the line
     * at *"a season median or rolling average"* during a live season, so a basis
     * that refused open seasons would make the feature unbuildable in the only
     * season it will ever run in. A database test caught it — nothing authored,
     * at all, on a live league.
     *
     * The provisional-numbers worry it was written against is real and is
     * answered somewhere better. **The line is frozen the moment it is
     * published**: `weekly_stakes_terms_immutable` refuses to let it move, so a
     * stat correction landing in November cannot change the number managers took
     * a side on in October. And **settlement** — the part that moves tokens — is
     * gated separately and strictly by `lib/stats/finality.ts`.
     *
     * So: authoring reads what is known now, and freezes it. Settling waits for
     * the books to close. Those are different questions and they get different
     * answers. Per-game suppression still applies — a disputed game or a roster
     * that resolves to nobody carries no claim in either direction.
     */
    const raw = buildWeek({
      season: input.season,
      week,
      finalized: true,
      rows: input.rows,
      roster: input.roster,
    });
    const open = publishableWeek(raw, input.eligibleUserIds);
    if (open.games.length === 0) continue;

    basisWeeks.push(week);
    for (const game of open.games) {
      gameKeys.push(game.key);
      for (const team of [game.a, game.b]) {
        if (team.managerId === null || team.displayName === null) continue;
        scores.push({ cents: team.pointsCents, by: team.displayName });
        byUser.set(team.managerId, [...(byUser.get(team.managerId) ?? []), team.pointsCents]);
      }
    }
  }

  const ascending = [...scores].sort((a, b) => a.cents - b.cents);
  const enough = ascending.length >= MIN_BASIS_TEAM_WEEKS;
  const best = ascending.at(-1) ?? null;

  return {
    season: input.season,
    week: input.week,
    basisWeeks,
    gameKeys,
    teamWeeks: ascending.length,
    medianTeamScoreCents: enough ? lowerMedian(ascending.map((score) => score.cents)) : null,
    bestTeamScoreCents: enough ? (best?.cents ?? null) : null,
    bestTeamScoreBy: enough ? (best?.by ?? null) : null,
    /*
     * The table after the last basis week, from `lib/stats/standings.ts`.
     *
     * Rows whose seat resolves to nobody are dropped *after* ranking, never
     * before: `standingsThrough` documents that leaving a roster out silently
     * changes everybody else's rank, so the boundary is applied to what is shown
     * rather than to what is counted.
     */
    standings:
      basisWeeks.length === 0
        ? []
        : standingsThrough({
            rows: input.rows,
            throughWeek: basisWeeks.at(-1) ?? 0,
            roster: input.roster,
          }).filter(
            (row) => row.managerId !== null && input.eligibleUserIds.has(row.managerId),
          ),
    eligibleUserIds: [...input.eligibleUserIds].sort(),
    /*
     * Ascending, so every consumer takes an order statistic off the same
     * ordering rather than sorting it again and possibly differently.
     */
    scoresByUser: new Map(
      [...byUser.entries()].map(([userId, cents]) => [
        userId,
        [...cents].sort((a, b) => a - b),
      ]),
    ),
  };
}

/** Build a week's result from stored rows. Pure, like {@link buildBasis}. */
export function buildWeekResult(input: {
  readonly season: number;
  readonly week: number;
  readonly rows: readonly StoredWeekGame[];
  readonly roster: ReadonlyMap<number, { userId: string; displayName: string }>;
  readonly seasonFinalizedAt: Date | null;
  /** When the Tuesday job closed this week, if it has. */
  readonly weekFinalizedAt?: ReadonlyMap<number, Date> | null;
  readonly eligibleUserIds: ReadonlySet<string>;
}): WeekResult {
  const hasGames = input.rows.some((row) => row.week === input.week);

  const raw: WeekRecord = buildWeek({
    season: input.season,
    week: input.week,
    /*
     * Deliberately optimistic here, and gated by `finality` below.
     *
     * Passing the season's real state would mark every game of an open season
     * `season-not-finalized` and empty the record — so the surface could not
     * tell *"the week has not been played"* from *"the week was played and
     * cannot settle yet"*, which are the two states a manager most needs told
     * apart. The scores are read; the permission to settle on them is a separate
     * answer, and it is the one `resolve.ts` checks.
     */
    finalized: true,
    rows: input.rows,
    roster: input.roster,
  });
  const open = publishableWeek(raw, input.eligibleUserIds);

  const teams: TeamResult[] = [];
  const games: GameResult[] = [];
  for (const game of open.games) {
    for (const team of [game.a, game.b]) {
      if (team.managerId === null || team.displayName === null) continue;
      teams.push({
        rosterId: team.rosterId,
        managerId: team.managerId,
        displayName: team.displayName,
        pointsCents: team.pointsCents,
        won: game.tie ? null : game.winner?.rosterId === team.rosterId,
      });
    }

    /*
     * A pairing is admitted only when **both** ends can be named.
     *
     * The flat `teams` list above drops one unnameable side and keeps the other,
     * which is right for a score. It is wrong for a margin: half a game has no
     * margin, and a proposition settled from one would be measuring a number
     * against a game the league cannot see.
     */
    if (game.a.displayName === null || game.b.displayName === null) continue;
    games.push({
      key: game.key,
      marginCents: game.marginCents,
      tie: game.tie,
      winner:
        game.winner === null || game.winner.displayName === null
          ? null
          : { rosterId: game.winner.rosterId, displayName: game.winner.displayName },
      loser:
        game.loser === null || game.loser.displayName === null
          ? null
          : { rosterId: game.loser.rosterId, displayName: game.loser.displayName },
    });
  }

  return {
    season: input.season,
    week: input.week,
    finality: weekFinality({
      seasonFinalizedAt: input.seasonFinalizedAt,
      weekFinalizedAt: input.weekFinalizedAt?.get(input.week) ?? null,
      hasGames,
    }),
    teams,
    games,
    gameKeys: open.games.map((game) => game.key),
  };
}

/** Everything both records need, read once. */
export async function stakeSeason(
  db: Queryable,
  year: number,
): Promise<{
  readonly found: boolean;
  readonly seasonId: string | null;
  readonly seasonFinalizedAt: Date | null;
  readonly weekFinalizedAt: ReadonlyMap<number, Date>;
  readonly rows: readonly StoredWeekGame[];
  readonly roster: ReadonlyMap<number, { userId: string; displayName: string }>;
  readonly eligibleUserIds: ReadonlySet<string>;
}> {
  const [season] = await db
    .select({ id: seasons.id, finalizedAt: seasons.finalizedAt })
    .from(seasons)
    .where(eq(seasons.year, year))
    .limit(1);

  if (season === undefined) {
    return {
      found: false,
      seasonId: null,
      seasonFinalizedAt: null,
      weekFinalizedAt: new Map(),
      rows: [],
      roster: new Map(),
      eligibleUserIds: new Set(),
    };
  }

  const weeks = await seasonWeeks(db, year);

  const closed = await db
    .select({ week: weekFinalizations.week, finalizedAt: weekFinalizations.finalizedAt })
    .from(weekFinalizations)
    .where(eq(weekFinalizations.seasonId, season.id));

  return {
    found: true,
    seasonId: season.id,
    seasonFinalizedAt: season.finalizedAt,
    weekFinalizedAt: new Map(closed.map((row) => [row.week, row.finalizedAt])),
    rows: weeks.rows,
    roster: weeks.roster,
    eligibleUserIds: await activeManagerIds(db),
  };
}

/**
 * Close a week — the Tuesday job's one write, ahead of the job itself.
 *
 * Idempotent by `UNIQUE(season_id, week)`: running it twice writes once, and the
 * append-only trigger means a closed week cannot be reopened. Refuses a week with
 * no publishable game, because *"nothing happened and we closed it"* is not a
 * finalization — it is a week that has not been played.
 *
 * Exposed here rather than in `lib/stakes/` because finality is a **Stats** fact.
 * Weekly stakes is its first consumer and will not be its last: the Slice will
 * print a live week from the same record.
 */
export async function finalizeWeek(
  db: Queryable,
  input: { readonly season: number; readonly week: number; readonly at: Date },
): Promise<{ readonly closed: boolean; readonly games: number }> {
  const season = await stakeSeason(db, input.season);
  if (!season.found || season.seasonId === null) return { closed: false, games: 0 };

  const week = buildWeekResult({ ...season, season: input.season, week: input.week });
  const games = week.gameKeys.length;
  if (games === 0) return { closed: false, games: 0 };

  const inserted = await db
    .insert(weekFinalizations)
    .values({
      seasonId: season.seasonId,
      week: input.week,
      games,
      finalizedAt: input.at,
    })
    .onConflictDoNothing({ target: [weekFinalizations.seasonId, weekFinalizations.week] })
    .returning({ id: weekFinalizations.id });

  return { closed: inserted.length > 0, games };
}

/** The basis for one week, from the database. */
export async function stakeBasis(
  db: Queryable,
  input: { readonly season: number; readonly week: number },
): Promise<StakeBasis | null> {
  const season = await stakeSeason(db, input.season);
  if (!season.found) return null;
  return buildBasis({ ...season, season: input.season, week: input.week });
}

/** One week's result, from the database. */
export async function weekResult(
  db: Queryable,
  input: { readonly season: number; readonly week: number },
): Promise<WeekResult | null> {
  const season = await stakeSeason(db, input.season);
  if (!season.found) return null;
  return buildWeekResult({ ...season, season: input.season, week: input.week });
}
