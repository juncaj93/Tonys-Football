import { asc, eq, isNotNull } from 'drizzle-orm';

import { type Queryable } from '@/lib/db';
import { fantasyMatchups, seasonMemberships, seasons, users } from '@/lib/db/schema';
import { fromCents } from '@/lib/sleeper/reconcile';

import {
  type Intensity,
  type SignificancePolicy,
  classify,
  percentileOf,
  standardPolicy,
} from './significance';

/**
 * Typed, evidenced facts about games — the layer everything narrative sits on.
 *
 * `PRODUCT_DELIVERY_MANDATE.md §10`. The contract in one sentence: **a sentence
 * about a game may be rendered only when a fact object here establishes every
 * claim it makes.** Not "the data supports it" — established, field by field,
 * with the evidence recorded alongside.
 *
 * ## Suppression is a result, not a failure
 *
 * A fact that cannot be evidenced is **suppressed with a recorded reason**, and
 * never softened into vaguer prose. Softening is the failure mode this design
 * exists to make impossible: "Matty B had a big week" is not a weaker version of
 * a blowout claim, it is an unevidenced claim wearing a hedge. `derive` returns
 * a discriminated union so a caller cannot accidentally read a fact that was not
 * published — there is no field to read.
 *
 * Four things suppress, and each is a real state rather than an error:
 *
 * - **a tie** — `winnerRosterId` is null, and a fact type that needs a winner
 *   must not pick one
 * - **a disputed game** — `16 §12`: 2024's finalized standings and its weekly
 *   points disagree for four rosters, `reconcile.ts` never resolves it, and a
 *   claim resting on a disagreeing figure is suppressed rather than averaged
 * - **an unfinalized season** — the books are open and the number can still move
 * - **a roster that resolves to nobody** — see below
 *
 * ## Roster ids are seasonal, and this is where that bites hardest
 *
 * `16 §5.1`: roster 4 is Berardo in 2024, Topouzian in 2025 and Zack in 2026.
 * Every fact resolves a roster through **that season's** membership and carries
 * `users.display_name` — the canonical league name, never a Sleeper handle.
 * Getting this wrong attributes a blowout to the wrong person, permanently, and
 * it is the kind of error that reads perfectly until the person named reads it.
 *
 * A roster that cannot be resolved suppresses. There is no fallback to a Sleeper
 * username, because a fallback here is the bug.
 *
 * ## Deterministic
 *
 * No clock, no randomness, stable ordering everywhere. `derive` twice over the
 * same rows returns deep-equal output — asserted in the tests — the same way a
 * box opening is recomputable from its stored roll and table version.
 */

/** What kind of claim this fact supports. */
export type FactType = 'largest-margin' | 'closest-game';

export interface MatchupFact {
  /** `2024-w16-largest-margin`. Stable, derivable, and unique per season/week/type. */
  readonly id: string;
  readonly type: FactType;
  readonly season: number;
  readonly week: number;
  readonly finalized: boolean;
  /** `sleeper-2024-w16-final@2026-07-29T18:04:11.000Z` — which snapshot said so. */
  readonly sourceSnapshot: string;

  readonly winnerManagerId: string;
  readonly winnerDisplayName: string;
  readonly loserManagerId: string;
  readonly loserDisplayName: string;

  readonly winnerPoints: number;
  readonly loserPoints: number;
  /** Exact, from integer cents. Never a float subtraction. */
  readonly margin: number;

  /** 1 is the largest margin of its week. */
  readonly weeklyMarginRank: number;
  readonly seasonMarginPercentile: number | null;
  /** Null where the finalized population is too small to support one. */
  readonly historicalMarginPercentile: number | null;

  readonly intensity: Intensity;
  /** The policy this was classified under. A recalibration writes a new version. */
  readonly policyVersion: string;

  /** Higher is a better story. Deterministic; see `scoreOf`. */
  readonly selectionScore: number;
  readonly reasonSelected: string;
  /** Everything a reader would need to check the claim themselves. */
  readonly evidence: readonly string[];
}

export type SuppressionReason =
  | 'tie'
  | 'disputed'
  | 'season-not-finalized'
  | 'roster-unresolved'
  | 'no-games';

export type FactResult =
  | { readonly published: true; readonly fact: MatchupFact }
  | {
      readonly published: false;
      readonly reason: SuppressionReason;
      /** A sentence a commissioner can act on. Never rendered to a manager. */
      readonly detail: string;
    };

/** One game as stored, plus the season context a fact needs. */
interface StoredGame {
  readonly week: number;
  readonly weekType: string;
  readonly sleeperMatchupId: number;
  readonly rosterAId: number;
  readonly rosterBId: number;
  readonly pointsACents: number;
  readonly pointsBCents: number;
  readonly winnerRosterId: number | null;
  readonly marginCents: number;
  readonly capturedAt: Date | null;
  readonly disputed: boolean;
}

export interface SeasonFacts {
  readonly season: number;
  readonly finalized: boolean;
  /** Published facts, strongest story first. */
  readonly facts: readonly MatchupFact[];
  /** Everything that could not be published, and why. Never rendered. */
  readonly suppressed: readonly { reason: SuppressionReason; detail: string }[];
}

/**
 * Every publishable fact for one season, week by week.
 *
 * `historicalMargins` is the comparison population — every finalized margin in
 * cents the database holds, sorted ascending. Passed in rather than queried here
 * so a caller deriving several seasons queries once, and so a test can hand in a
 * population it controls.
 */
export async function seasonFacts(
  db: Queryable,
  input: {
    readonly year: number;
    readonly historicalMarginsCents: readonly number[];
    readonly policy?: SignificancePolicy;
  },
): Promise<SeasonFacts> {
  const policy = input.policy ?? standardPolicy();

  const [season] = await db
    .select({ id: seasons.id, year: seasons.year, finalizedAt: seasons.finalizedAt })
    .from(seasons)
    .where(eq(seasons.year, input.year))
    .limit(1);

  if (season === undefined) {
    return {
      season: input.year,
      finalized: false,
      facts: [],
      suppressed: [
        { reason: 'no-games', detail: `${String(input.year)} is not in the database.` },
      ],
    };
  }

  const finalized = season.finalizedAt !== null;

  const games = await db
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
      capturedAt: fantasyMatchups.capturedAt,
      disputed: fantasyMatchups.disputed,
    })
    .from(fantasyMatchups)
    .where(eq(fantasyMatchups.seasonId, season.id))
    // Stable ordering, three deep. Two games in a week can share a margin, and
    // a fact id that depended on which arrived first would not be derivable.
    .orderBy(
      asc(fantasyMatchups.week),
      asc(fantasyMatchups.sleeperMatchupId),
      asc(fantasyMatchups.rosterAId),
    );

  if (games.length === 0) {
    return {
      season: input.year,
      finalized,
      facts: [],
      suppressed: [
        {
          reason: 'no-games',
          detail: `${String(input.year)} has no stored games. The season may not have been played.`,
        },
      ],
    };
  }

  const roster = await rosterNames(db, season.id);

  const seasonMargins = [...games.map((game) => game.marginCents)].sort((a, b) => a - b);
  const historical = [...input.historicalMarginsCents].sort((a, b) => a - b);
  const seasonLargest = seasonMargins[seasonMargins.length - 1];

  const facts: MatchupFact[] = [];
  const suppressed: { reason: SuppressionReason; detail: string }[] = [];

  const weeks = [...new Set(games.map((game) => game.week))].sort((a, b) => a - b);

  for (const week of weeks) {
    const inWeek = games.filter((game) => game.week === week);

    // Rank within the week, largest margin first. Ties in margin keep the stable
    // ordering above, so rank is a function of the data rather than of the query
    // plan.
    const ranked = [...inWeek].sort(
      (a, b) =>
        b.marginCents - a.marginCents ||
        a.sleeperMatchupId - b.sleeperMatchupId ||
        a.rosterAId - b.rosterAId,
    );

    for (const [type, game] of [
      ['largest-margin', ranked[0]] as const,
      ['closest-game', ranked[ranked.length - 1]] as const,
    ]) {
      if (game === undefined) continue;
      // A week with one game produces one fact, not the same fact twice under
      // two names — the closest game *is* the largest margin and publishing both
      // would report one result as two stories.
      if (type === 'closest-game' && ranked.length < 2) continue;

      const result = factFor({
        game,
        type,
        year: season.year,
        finalized,
        rank: ranked.indexOf(game) + 1,
        weekSize: ranked.length,
        roster,
        policy,
        seasonMargins,
        historical,
        isSeasonLargest: game.marginCents === seasonLargest,
      });

      if (result.published) facts.push(result.fact);
      else suppressed.push({ reason: result.reason, detail: result.detail });
    }
  }

  facts.sort(
    (a, b) => b.selectionScore - a.selectionScore || a.id.localeCompare(b.id),
  );

  return { season: season.year, finalized, facts, suppressed };
}

/**
 * Build one fact, or say why not.
 *
 * Pure: every input is passed in, so the same arguments produce the same fact on
 * any machine, forever. That is the property that makes a published claim
 * checkable rather than merely trusted.
 */
export function factFor(input: {
  readonly game: StoredGame;
  readonly type: FactType;
  readonly year: number;
  readonly finalized: boolean;
  readonly rank: number;
  /** How many games the week held. Part of the evidence, so it is passed, not guessed. */
  readonly weekSize: number;
  readonly roster: ReadonlyMap<number, { userId: string; displayName: string }>;
  readonly policy: SignificancePolicy;
  readonly seasonMargins: readonly number[];
  readonly historical: readonly number[];
  readonly isSeasonLargest: boolean;
}): FactResult {
  const { game, type, year, roster, policy } = input;
  const where = `${String(year)} week ${String(game.week)} matchup ${String(game.sleeperMatchupId)}`;

  if (!input.finalized) {
    return {
      published: false,
      reason: 'season-not-finalized',
      detail: `${where}: the season's books are open, so its numbers can still move.`,
    };
  }

  if (game.disputed) {
    return {
      published: false,
      reason: 'disputed',
      detail:
        `${where}: the finalized standings and the weekly scoring snapshot disagree about ` +
        'this game. `16 §12` — the disagreement is reported and never resolved, so no claim ' +
        'rests on it.',
    };
  }

  if (game.winnerRosterId === null) {
    return {
      published: false,
      reason: 'tie',
      detail: `${where}: a tie. A fact that needs a winner does not get to pick one.`,
    };
  }

  const loserRosterId =
    game.winnerRosterId === game.rosterAId ? game.rosterBId : game.rosterAId;

  const winner = roster.get(game.winnerRosterId);
  const loser = roster.get(loserRosterId);

  if (winner === undefined || loser === undefined) {
    const missing = winner === undefined ? game.winnerRosterId : loserRosterId;
    return {
      published: false,
      reason: 'roster-unresolved',
      detail:
        `${where}: roster ${String(missing)} has no membership in ${String(year)}, so the game ` +
        'cannot be attributed to a person. Roster ids are seasonal (`16 §5.1`) and there is no ' +
        'fallback to a Sleeper handle — a fallback here is the bug.',
    };
  }

  const winnerCents =
    game.winnerRosterId === game.rosterAId ? game.pointsACents : game.pointsBCents;
  const loserCents =
    game.winnerRosterId === game.rosterAId ? game.pointsBCents : game.pointsACents;

  const margin = fromCents(game.marginCents);

  const seasonPercentile = percentileOf(
    input.seasonMargins,
    game.marginCents,
    policy.minPopulation,
  );
  const historicalPercentile = percentileOf(
    input.historical,
    game.marginCents,
    policy.minPopulation,
  );

  // Historical where the sample supports it, the season's otherwise. Recorded in
  // the evidence either way, so a reader knows which population a tier was
  // judged against rather than having to assume.
  const comparison = historicalPercentile ?? seasonPercentile;
  const comparisonName = historicalPercentile !== null ? 'historical' : 'season';

  const intensity = classify(policy, {
    margin,
    percentile: comparison,
    isSeasonLargest: input.isSeasonLargest,
  });

  const evidence = [
    `stored game ${where}`,
    `${winner.displayName} ${fromCents(winnerCents).toFixed(2)} — ` +
      `${loser.displayName} ${fromCents(loserCents).toFixed(2)}`,
    `margin ${margin.toFixed(2)}, exact from integer cents`,
    `rank ${String(input.rank)} of ${String(input.weekSize)} in its week`,
    comparison === null
      ? `no percentile: the ${comparisonName} population is under ${String(policy.minPopulation)} games, ` +
        'so no tier requiring league context was available'
      : `${ordinal(comparison)} percentile of the ${comparisonName} population ` +
        `(${String(comparisonName === 'historical' ? input.historical.length : input.seasonMargins.length)} finalized games)`,
    `classified ${intensity} under policy ${policy.version}` +
      (policy.provisional ? ' (provisional until the P3 calibration)' : ''),
    input.isSeasonLargest ? `largest finalized margin of ${String(year)}` : '',
  ].filter((line) => line !== '');

  return {
    published: true,
    fact: {
      id: `${String(year)}-w${String(game.week).padStart(2, '0')}-${type}`,
      type,
      season: year,
      week: game.week,
      finalized: input.finalized,
      sourceSnapshot: snapshotLabel(year, game),
      winnerManagerId: winner.userId,
      winnerDisplayName: winner.displayName,
      loserManagerId: loser.userId,
      loserDisplayName: loser.displayName,
      winnerPoints: fromCents(winnerCents),
      loserPoints: fromCents(loserCents),
      margin,
      weeklyMarginRank: input.rank,
      seasonMarginPercentile: seasonPercentile,
      historicalMarginPercentile: historicalPercentile,
      intensity,
      policyVersion: policy.version,
      selectionScore: scoreOf({ type, margin, percentile: comparison, intensity }),
      reasonSelected: reasonFor(type, intensity, input.isSeasonLargest),
      evidence,
    },
  };
}

/**
 * `51st`, `82nd`, `100th`.
 *
 * The evidence lines are read by people, and `51th` in a sentence claiming
 * statistical rigour undermines the claim more than the error costs.
 */
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
 * How good a story this is, as a number.
 *
 * Deterministic and deliberately dull: tier first, then margin, then percentile.
 * A ranked list needs a total order, and a scoring function with any judgement in
 * it would be the interface deciding what a result means — which is the thing
 * `MANDATE §9` gives to Stats and takes away from everyone else.
 */
function scoreOf(input: {
  readonly type: FactType;
  readonly margin: number;
  readonly percentile: number | null;
  readonly intensity: Intensity;
}): number {
  const tierWeight: Record<Intensity, number> = {
    beat: 0,
    edged: 300,
    handled: 400,
    crushed: 600,
    obliterated: 800,
  };

  const raw =
    tierWeight[input.intensity] +
    (input.percentile ?? 0) +
    // Margin breaks ties within a tier. Scaled small so it can never outrank the
    // tier itself: a 140-point win and a 45-point win are both `obliterated`,
    // and the bigger one leads.
    Math.min(input.margin, 200) / 10;

  // Two decimals. The score is only ever compared, so the precision beyond this
  // buys nothing — and a float carried to seventeen places is the kind of value
  // that differs between platforms and makes a "deterministic" test flake.
  return Math.round(raw * 100) / 100;
}

function reasonFor(type: FactType, intensity: Intensity, isSeasonLargest: boolean): string {
  if (type === 'closest-game') {
    return intensity === 'edged'
      ? 'Closest finalized game of the week, and inside the edged threshold'
      : 'Closest finalized game of the week';
  }
  if (isSeasonLargest) return 'Largest finalized margin of the season';
  return `Largest finalized margin of the week, classified ${intensity}`;
}

/**
 * Which snapshot said so.
 *
 * The capture moment is part of the claim, not metadata about it: weekly scoring
 * is mutable upstream, so "what they scored" is only true alongside when we
 * looked. A game with no recorded capture says so rather than implying one.
 */
function snapshotLabel(year: number, game: StoredGame): string {
  const at = game.capturedAt === null ? 'uncaptured' : game.capturedAt.toISOString();
  return `sleeper-${String(year)}-w${String(game.week).padStart(2, '0')}-${game.weekType}@${at}`;
}

/**
 * Roster id → the person who held it *that season*.
 *
 * The single most consequential lookup in this file. See the note at the top.
 */
export async function rosterNames(
  db: Queryable,
  seasonId: string,
): Promise<ReadonlyMap<number, { userId: string; displayName: string }>> {
  const rows = await db
    .select({
      rosterId: seasonMemberships.rosterId,
      userId: users.id,
      displayName: users.displayName,
    })
    .from(seasonMemberships)
    .innerJoin(users, eq(seasonMemberships.userId, users.id))
    .where(eq(seasonMemberships.seasonId, seasonId))
    .orderBy(asc(seasonMemberships.rosterId));

  return new Map(rows.map((row) => [row.rosterId, { userId: row.userId, displayName: row.displayName }]));
}

/**
 * Every finalized margin the database holds, in cents, ascending.
 *
 * The comparison population for a historical percentile. Finalized only —
 * an open season's numbers can still move, and a percentile that shifts under a
 * published fact would make the fact retroactively wrong.
 */
export async function finalizedMarginsCents(db: Queryable): Promise<number[]> {
  const rows = await db
    .select({ marginCents: fantasyMatchups.marginCents })
    .from(fantasyMatchups)
    .innerJoin(seasons, eq(fantasyMatchups.seasonId, seasons.id))
    // Finalized seasons only. `status` is a lifecycle label a commissioner can
    // set; `finalized_at` is the act of closing the books, and it is what the
    // immutability triggers key on. Those are different facts and only the
    // second one makes a margin safe to compare against.
    .where(isNotNull(seasons.finalizedAt))
    .orderBy(asc(fantasyMatchups.marginCents));

  return rows.map((row) => row.marginCents);
}
