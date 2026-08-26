/**
 * The ten-team all-play calculation, and the one place the Fraud Check stamp is
 * decided.
 *
 * ## What this adds that `lib/stats/luck.ts` does not
 *
 * `playEveryoneRecord` is the approved neutral measurement and this file does
 * not replace it, re-derive it, or disagree with it. It answers *"what are the
 * two records"* over a loaded {@link import('@/lib/stats/era').TrackedEra} and
 * stops there, deliberately — `07 §7.5` and the 2026-08-10 **R2** ruling both
 * say the deterministic layer supplies the measurement and attaches no verdict.
 *
 * What the Fraud Check needs on top of it is four things that measurement does
 * not carry:
 *
 * 1. **The ten-team shape, checked.** A ten-team week is nine comparisons per
 *    manager, every week, and nothing anywhere asserted it. A week missing a
 *    game is a week where some managers were measured against seven opponents
 *    and the absent manager against none — and the resulting table looks
 *    entirely normal. {@link OPPONENTS_PER_WEEK} is the shape and
 *    {@link AllPlayTable.integrity} is the check.
 * 2. **The schedule-neutral win and loss counts**, not just the difference
 *    between them. The rate is already in the neutral layer; the two numbers a
 *    reader compares against a real record are not.
 * 3. **Both rankings**, so *strong real record* and *poor all-play record* are
 *    positions in the league rather than adjectives.
 * 4. **The stamp**, with its conditions named. See below.
 *
 * ## The stamp is editorial, and it lives here rather than in `lib/stats`
 *
 * `lib/stats/luck.ts` states the boundary in its own header: no `fraud` field,
 * no luck score, no ranking by desert. That boundary is intact — this file is
 * `lib/league/`, the editorial side of it, and the numbers it stamps are the
 * neutral layer's numbers unchanged. FRAUD ALERT is Tony's sticker. It is never
 * a league determination, never a claim that anybody deserved a different
 * record, and {@link ALL_PLAY_DISCLAIMER} travels on the table so it cannot be
 * dropped on the way to a screen.
 *
 * ## Only when justified
 *
 * A stamp on a bare schedule gap is not justified: a manager who goes 3–3 while
 * posting the worst scores in the league every week has a large gap and no
 * record worth calling fraudulent. `docs/DATA_AUDIT.md §9` and the R2 ruling
 * both turn on the same point — the all-play number may contrast with a record
 * and may not become a factual claim about it — so the stamp requires the whole
 * shape the joke depends on: **a real record that is genuinely strong, an
 * all-play record that is genuinely poor, a gap that is material, and enough
 * games for any of it to mean something.** {@link FRAUD_THRESHOLDS} is that
 * rule, in one place, as fixed numbers. It is deterministic, it does not move
 * week to week, and changing it is an intentional documented decision — the same
 * standing principle the 2026-08-10 **R1** ruling set for blowout thresholds.
 *
 * ## The phrase this file will not print
 *
 * `expectedWins` and `expectedLosses` are the conventional names for the two
 * schedule-neutral counts and the brief asks for them by those names, so the
 * fields carry them. **The words must never reach reader-facing prose**:
 * `lib/slice/validate.ts` bans `expected wins` outright because it implies a
 * projection model this product does not have, and there is nothing predictive
 * here — these are a rate already observed, scaled onto games already played.
 * Every string this file produces is scanned for that phrase, and for the rest
 * of the banned list, by {@link file://./all-play.test.ts}.
 *
 * ## Pure
 *
 * No clock, no randomness, no database, no I/O. Two calls over the same games
 * produce deep-equal output, and the ordering is stable three deep.
 */

import { fromCents } from '@/lib/sleeper/reconcile';

/** A ten-team league. `CLAUDE.md`: one private ten-person league. */
export const LEAGUE_TEAMS = 10;

/**
 * Nine — every other active team, once per week.
 *
 * This is the number the whole measurement rests on. A manager's all-play
 * record over a fourteen-week season is 126 comparisons, and a table that
 * quietly produced 119 of them would still add up.
 */
export const OPPONENTS_PER_WEEK = LEAGUE_TEAMS - 1;

/** The label that must accompany any all-play number, everywhere. */
export const ALL_PLAY_DISCLAIMER =
  'computed from stored scores — this league plays no all-play games, so this is a measurement ' +
  'beside the standings and never a league result';

/** One side of one stored game. Cents, because a tie is an exact equality. */
export interface AllPlaySide {
  readonly managerId: string;
  readonly displayName: string;
  readonly pointsCents: number;
}

/** One stored game. Both sides, in stored order. */
export interface AllPlayGame {
  readonly week: number;
  readonly a: AllPlaySide;
  readonly b: AllPlaySide;
}

/**
 * Why a week was left out of the measurement entirely.
 *
 * Both are dropped **whole**, for the reason `lib/stats/luck.ts` drops a
 * disputed week whole: an all-play tally depends on every score in its week, so
 * a partial week measures some managers against a smaller field than others and
 * produces a table with nothing visibly wrong with it.
 */
export type WeekExclusion =
  /** Fewer team-weeks than the league has teams. Somebody is missing. */
  | 'short-field'
  /** More team-weeks than the league has teams. */
  | 'over-field'
  /** One manager holds two seats in the same week, so the field is not the league. */
  | 'duplicate-seat';

export interface AllPlayWeek {
  readonly week: number;
  /** Team-weeks found. Ten, in a week that counts. */
  readonly teams: number;
  readonly counted: boolean;
  readonly excludedBecause: WeekExclusion | null;
}

/** One manager's two records over the same counted weeks. */
export interface AllPlayLine {
  readonly managerId: string;
  readonly displayName: string;

  /** The record actually posted, over exactly the weeks measured. */
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly gamesPlayed: number;
  /** Wins plus half a tie, over games played. Zero games reads as zero. */
  readonly winPct: number;

  /** Comparisons against every other active team, week by week. */
  readonly allPlayWins: number;
  readonly allPlayLosses: number;
  readonly allPlayTies: number;
  /** `weeksCounted × OPPONENTS_PER_WEEK` in a sound table. */
  readonly comparisons: number;
  /** All-play wins plus half a tie, over comparisons. */
  readonly allPlayWinPct: number;

  /**
   * The all-play rate scaled onto the games actually played, to two places.
   *
   * Not a projection and not a forecast: it is a rate already observed, over
   * scores already posted, put on the same axis as the real record so the two
   * can sit in one row. See the header on the phrase itself.
   */
  readonly expectedWins: number;
  readonly expectedLosses: number;

  /**
   * Real wins minus {@link expectedWins}, to two places.
   *
   * Positive means the schedule was kinder than the scores. **It is a
   * subtraction, not a verdict** — this field carries no judgement and the sign
   * alone never earns a stamp.
   */
  readonly scheduleDelta: number;

  readonly pointsFor: number;
  readonly weeksCounted: number;

  /** 1 is the best real record. Equal records share a rank. */
  readonly realRank: number;
  /** 1 is the best all-play record. Equal rates share a rank. */
  readonly allPlayRank: number;
  /** All-play rank minus real rank. Positive means the standings flatter them. */
  readonly rankDelta: number;
}

/** Whether the table is the shape a ten-team league produces. */
export interface AllPlayIntegrity {
  /** Every counted week fielded the whole league, once each. */
  readonly fullField: boolean;
  /**
   * Every manager holds exactly `weeksCounted × OPPONENTS_PER_WEEK`
   * comparisons. False is a data fault, not a close season.
   */
  readonly comparisonsExact: boolean;
  /** Managers found. Ten, in a sound table. */
  readonly managers: number;
  /** Plain-language faults, empty when there are none. */
  readonly faults: readonly string[];
}

export interface AllPlayTable {
  readonly leagueTeams: number;
  readonly opponentsPerWeek: number;
  /** One line per manager, best real record first. */
  readonly lines: readonly AllPlayLine[];
  /** Every week seen, ascending, counted or not. */
  readonly weeks: readonly AllPlayWeek[];
  readonly countedWeeks: readonly number[];
  readonly excludedWeeks: readonly number[];
  readonly integrity: AllPlayIntegrity;
  /** Always {@link ALL_PLAY_DISCLAIMER}. On the table so it cannot be dropped. */
  readonly disclaimer: string;
}

export interface AllPlayOptions {
  /** Defaults to {@link LEAGUE_TEAMS}. */
  readonly leagueTeams?: number;
  /** Weeks the caller has already ruled uncountable, dropped whole. */
  readonly excludedWeeks?: readonly number[];
}

/**
 * The all-play table for a set of games already filtered to one season and one
 * kind of week.
 *
 * This function decides nothing about *which* games belong — a caller that
 * wants regular-season games passes regular-season games. It decides only what
 * the ten-team shape requires: a week that does not field the whole league is
 * left out and named, and everything counted is counted for everybody.
 */
export function allPlayTable(
  games: readonly AllPlayGame[],
  options: AllPlayOptions = {},
): AllPlayTable {
  const leagueTeams = options.leagueTeams ?? LEAGUE_TEAMS;
  const opponentsPerWeek = leagueTeams - 1;
  const ruledOut = new Set(options.excludedWeeks ?? []);

  const weekNumbers = [...new Set(games.map((game) => game.week))].sort((a, b) => a - b);

  const weeks: AllPlayWeek[] = weekNumbers.map((week) => {
    const inWeek = games.filter((game) => game.week === week);
    const sides = inWeek.flatMap((game) => [game.a, game.b]);
    const distinct = new Set(sides.map((side) => side.managerId)).size;

    const excludedBecause: WeekExclusion | null =
      distinct < sides.length
        ? 'duplicate-seat'
        : sides.length < leagueTeams
          ? 'short-field'
          : sides.length > leagueTeams
            ? 'over-field'
            : null;

    return {
      week,
      teams: sides.length,
      counted: excludedBecause === null && !ruledOut.has(week),
      excludedBecause,
    };
  });

  const countedWeeks = weeks.filter((week) => week.counted).map((week) => week.week);

  interface Tally {
    managerId: string;
    displayName: string;
    wins: number;
    losses: number;
    ties: number;
    allPlayWins: number;
    allPlayLosses: number;
    allPlayTies: number;
    pointsForCents: number;
    weeks: number;
  }

  const tallies = new Map<string, Tally>();
  const tally = (side: AllPlaySide): Tally => {
    const existing = tallies.get(side.managerId);
    if (existing !== undefined) return existing;
    const fresh: Tally = {
      managerId: side.managerId,
      displayName: side.displayName,
      wins: 0,
      losses: 0,
      ties: 0,
      allPlayWins: 0,
      allPlayLosses: 0,
      allPlayTies: 0,
      pointsForCents: 0,
      weeks: 0,
    };
    tallies.set(side.managerId, fresh);
    return fresh;
  };

  for (const week of countedWeeks) {
    const inWeek = games.filter((game) => game.week === week);
    const sides = inWeek.flatMap((game) => [game.a, game.b]);

    for (const side of sides) {
      const row = tally(side);
      row.pointsForCents += side.pointsCents;
      row.weeks++;
      for (const other of sides) {
        if (other.managerId === side.managerId) continue;
        if (side.pointsCents > other.pointsCents) row.allPlayWins++;
        else if (side.pointsCents < other.pointsCents) row.allPlayLosses++;
        else row.allPlayTies++;
      }
    }

    for (const game of inWeek) {
      const a = tally(game.a);
      const b = tally(game.b);
      if (game.a.pointsCents === game.b.pointsCents) {
        a.ties++;
        b.ties++;
      } else if (game.a.pointsCents > game.b.pointsCents) {
        a.wins++;
        b.losses++;
      } else {
        b.wins++;
        a.losses++;
      }
    }
  }

  const rows = [...tallies.values()];

  const measured = rows.map((row) => {
    const gamesPlayed = row.wins + row.losses + row.ties;
    const comparisons = row.allPlayWins + row.allPlayLosses + row.allPlayTies;
    const winPct = gamesPlayed === 0 ? 0 : (row.wins + row.ties / 2) / gamesPlayed;
    const allPlayWinPct =
      comparisons === 0 ? 0 : (row.allPlayWins + row.allPlayTies / 2) / comparisons;
    const expectedWins = allPlayWinPct * gamesPlayed;
    return { row, gamesPlayed, comparisons, winPct, allPlayWinPct, expectedWins };
  });

  const realRanks = competitionRanks(measured, (item) => [item.winPct, item.row.pointsForCents]);
  const allPlayRanks = competitionRanks(measured, (item) => [
    item.allPlayWinPct,
    item.row.pointsForCents,
  ]);

  const lines = measured
    .map((item): AllPlayLine => {
      const realRank = realRanks.get(item.row.managerId) ?? 0;
      const allPlayRank = allPlayRanks.get(item.row.managerId) ?? 0;
      return {
        managerId: item.row.managerId,
        displayName: item.row.displayName,
        wins: item.row.wins,
        losses: item.row.losses,
        ties: item.row.ties,
        gamesPlayed: item.gamesPlayed,
        winPct: round(item.winPct, 4),
        allPlayWins: item.row.allPlayWins,
        allPlayLosses: item.row.allPlayLosses,
        allPlayTies: item.row.allPlayTies,
        comparisons: item.comparisons,
        allPlayWinPct: round(item.allPlayWinPct, 4),
        expectedWins: round(item.expectedWins, 2),
        expectedLosses: round(item.gamesPlayed - item.expectedWins, 2),
        scheduleDelta: round(item.row.wins - item.expectedWins, 2),
        pointsFor: fromCents(item.row.pointsForCents),
        weeksCounted: item.row.weeks,
        realRank,
        allPlayRank,
        rankDelta: allPlayRank - realRank,
      };
    })
    .sort(
      (left, right) =>
        left.realRank - right.realRank || left.displayName.localeCompare(right.displayName),
    );

  const shortWeeks = weeks.filter((week) => week.excludedBecause !== null);
  const wrongComparisons = lines.filter(
    (line) => line.comparisons !== line.weeksCounted * opponentsPerWeek,
  );

  const faults: string[] = [];
  for (const week of shortWeeks) {
    faults.push(
      `week ${String(week.week)} fielded ${String(week.teams)} of ${String(leagueTeams)} teams ` +
        `(${week.excludedBecause ?? 'unknown'}) and was left out whole`,
    );
  }
  for (const line of wrongComparisons) {
    faults.push(
      `${line.displayName} holds ${String(line.comparisons)} comparisons over ` +
        `${String(line.weeksCounted)} weeks, not ${String(line.weeksCounted * opponentsPerWeek)}`,
    );
  }
  if (lines.length > 0 && lines.length !== leagueTeams) {
    faults.push(
      `${String(lines.length)} managers measured, not ${String(leagueTeams)}`,
    );
  }

  return {
    leagueTeams,
    opponentsPerWeek,
    lines,
    weeks,
    countedWeeks,
    excludedWeeks: weeks.filter((week) => !week.counted).map((week) => week.week),
    integrity: {
      fullField: shortWeeks.length === 0,
      comparisonsExact: wrongComparisons.length === 0,
      managers: lines.length,
      faults,
    },
    disclaimer: ALL_PLAY_DISCLAIMER,
  };
}

/* ------------------------------------------------------------------------- */
/* The stamp                                                                 */
/* ------------------------------------------------------------------------- */

/**
 * The four conditions, as fixed numbers in one place.
 *
 * Deterministic and documented, and not to be moved week to week. Each guards a
 * different way the stamp could be unjustified:
 *
 * - `minimumGames` — a two-game sample can produce any gap at all.
 * - `strongWinPct` — *fraud* is a joke about a good record. A .500 team with a
 *   soft schedule is an anecdote, not a fraud.
 * - `poorAllPlayWinPct` — in an all-play the field averages exactly .500 by
 *   construction, so this is *below the middle of the league by a margin* and
 *   is the half that says the scores did not earn it.
 * - `minimumScheduleDelta` — two whole wins. The gap has to be worth a sign.
 *
 * The first three are not implied by the fourth: a short season can clear the
 * delta on three games, and a poor real record can clear it while nobody would
 * call the record strong.
 */
export const FRAUD_THRESHOLDS = Object.freeze({
  minimumGames: 5,
  strongWinPct: 0.6,
  poorAllPlayWinPct: 0.45,
  minimumScheduleDelta: 2,
});

/** Which of the four conditions this is, so a caller can render one of them. */
export type FraudCondition = 'sample' | 'real-record' | 'all-play-record' | 'schedule-gap';

export interface FraudConditionResult {
  readonly condition: FraudCondition;
  readonly met: boolean;
  /** Plain language, safe for a screen. Carries no banned term. */
  readonly detail: string;
}

/**
 * Tony's sticker, and the whole reason for it.
 *
 * `label` is non-null only when all four conditions are met. `conditions` is
 * always the full four, met or not, so a screen can say why the stamp is absent
 * as easily as why it is there — and so a reader can check the arithmetic.
 */
export interface FraudStamp {
  readonly label: 'FRAUD ALERT' | null;
  readonly materiallyLucky: boolean;
  readonly conditions: readonly FraudConditionResult[];
  /** The subtraction the stamp turns on, to two places. */
  readonly scheduleDelta: number;
  readonly expectedWins: number;
  /** Never a league determination. On the stamp so it cannot be dropped. */
  readonly caveat: string;
}

/** The caveat that travels with every stamp. */
export const FRAUD_CAVEAT =
  'Tony hung the sign, not the league office — the official record is the official record, ' +
  'and this is a comparison of stored scores beside it';

/**
 * The counts a stamp is decided from.
 *
 * Structural rather than an {@link AllPlayLine}, so the neutral layer's own
 * `PlayEveryoneLine` can be stamped without either module importing the other.
 */
export interface FraudInput {
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly allPlayWins: number;
  readonly allPlayLosses: number;
  readonly allPlayTies: number;
}

/**
 * Decide the stamp from two records over the same games.
 *
 * `expectedWins` and `scheduleDelta` are recomputed here from the counts rather
 * than taken on trust, so there is exactly one formula in the product and a
 * caller cannot hand in a delta that disagrees with its own record. The formula
 * is `lib/stats/luck.ts`'s, unchanged, and `all-play.test.ts` pins the two
 * against each other.
 */
export function fraudStamp(input: FraudInput): FraudStamp {
  const gamesPlayed = input.wins + input.losses + input.ties;
  const comparisons = input.allPlayWins + input.allPlayLosses + input.allPlayTies;

  const winPct = gamesPlayed === 0 ? 0 : (input.wins + input.ties / 2) / gamesPlayed;
  const allPlayWinPct =
    comparisons === 0 ? 0 : (input.allPlayWins + input.allPlayTies / 2) / comparisons;

  const expectedWins = round(allPlayWinPct * gamesPlayed, 2);
  const scheduleDelta = round(input.wins - allPlayWinPct * gamesPlayed, 2);

  const conditions: readonly FraudConditionResult[] = [
    {
      condition: 'sample',
      met: gamesPlayed >= FRAUD_THRESHOLDS.minimumGames,
      detail:
        `${String(gamesPlayed)} games played, ` +
        `${String(FRAUD_THRESHOLDS.minimumGames)} needed before Tony says anything`,
    },
    {
      condition: 'real-record',
      met: winPct >= FRAUD_THRESHOLDS.strongWinPct,
      detail:
        `official record ${formatRecord(input.wins, input.losses, input.ties)} ` +
        `(${pct(winPct)}) against the ${pct(FRAUD_THRESHOLDS.strongWinPct)} a strong record needs`,
    },
    {
      condition: 'all-play-record',
      met: allPlayWinPct <= FRAUD_THRESHOLDS.poorAllPlayWinPct,
      detail:
        `all-play ${formatRecord(input.allPlayWins, input.allPlayLosses, input.allPlayTies)} ` +
        `(${pct(allPlayWinPct)}) against the ${pct(FRAUD_THRESHOLDS.poorAllPlayWinPct)} ` +
        'a poor one needs',
    },
    {
      condition: 'schedule-gap',
      met: scheduleDelta >= FRAUD_THRESHOLDS.minimumScheduleDelta,
      detail:
        `${signed(scheduleDelta)} wins against what the same scores took from the whole field, ` +
        `${String(FRAUD_THRESHOLDS.minimumScheduleDelta)} needed`,
    },
  ];

  const materiallyLucky = conditions.every((entry) => entry.met);

  return {
    label: materiallyLucky ? 'FRAUD ALERT' : null,
    materiallyLucky,
    conditions,
    scheduleDelta,
    expectedWins,
    caveat: FRAUD_CAVEAT,
  };
}

/** The stamped table, in the order a board reads: loudest schedule first. */
export function fraudBoard(table: AllPlayTable): readonly (AllPlayLine & {
  readonly stamp: FraudStamp;
})[] {
  return table.lines
    .map((line) => ({ ...line, stamp: fraudStamp(line) }))
    .sort(
      (left, right) =>
        right.scheduleDelta - left.scheduleDelta ||
        left.displayName.localeCompare(right.displayName),
    );
}

/* ------------------------------------------------------------------------- */
/* Formatting                                                                */
/* ------------------------------------------------------------------------- */

/** `9-5`, or `9-5-1` when a tie happened. Exported: one format, everywhere. */
export function formatRecord(wins: number, losses: number, ties: number): string {
  return ties === 0
    ? `${String(wins)}-${String(losses)}`
    : `${String(wins)}-${String(losses)}-${String(ties)}`;
}

/** `+2.60` · `-0.40`. Always signed, always two places. */
export function signed(value: number): string {
  return `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(2)}`;
}

/** `.643` · `1.000`. The three-place football form, without a leading zero. */
export function pct(value: number): string {
  const fixed = value.toFixed(3);
  return fixed.startsWith('0') ? fixed.slice(1) : fixed;
}

/* ------------------------------------------------------------------------- */
/* Internals                                                                 */
/* ------------------------------------------------------------------------- */

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Standard competition ranking — 1, 2, 2, 4 — over a descending score tuple.
 *
 * Two managers share a rank only when every element of the tuple is equal, so
 * the position is a fact about the season rather than about the sort.
 */
function competitionRanks<T extends { readonly row: { readonly managerId: string } }>(
  items: readonly T[],
  score: (item: T) => readonly number[],
): ReadonlyMap<string, number> {
  const ordered = [...items].sort((left, right) => {
    const a = score(left);
    const b = score(right);
    for (let index = 0; index < a.length; index++) {
      const difference = (b[index] ?? 0) - (a[index] ?? 0);
      if (difference !== 0) return difference;
    }
    return left.row.managerId.localeCompare(right.row.managerId);
  });

  const ranks = new Map<string, number>();
  let previous: readonly number[] | null = null;
  let previousRank = 0;

  ordered.forEach((item, index) => {
    const current = score(item);
    const tied =
      previous !== null &&
      current.length === previous.length &&
      current.every((value, at) => value === previous?.[at]);
    const rank = tied ? previousRank : index + 1;
    ranks.set(item.row.managerId, rank);
    previous = current;
    previousRank = rank;
  });

  return ranks;
}
