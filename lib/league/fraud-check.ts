import { loadTrackedEra } from '@/lib/stats/era';
import { weekFinality } from '@/lib/stats/finality';
import { playEveryoneRecord, type PlayEveryoneRecord } from '@/lib/stats/luck';
import { seasonWeeks } from '@/lib/stats/week';
import { type Queryable } from '@/lib/db';

import {
  allPlayTable,
  ALL_PLAY_DISCLAIMER,
  formatRecord,
  fraudStamp,
  FRAUD_THRESHOLDS,
  pct,
  signed,
  type AllPlayGame,
  type AllPlayLine,
  type AllPlayReach,
  type FraudStamp,
} from './all-play';
import { currentSeasonYear } from './membership';

/**
 * A readable presentation of the neutral all-play measurement.
 *
 * The math lives in `lib/stats/luck.ts`; this file deliberately does not
 * re-count a score or invent a second standings table. It picks the latest
 * complete season, formats its fixed values once, and makes Tony's optional
 * editorial stamp explicit as a joke rather than a fact about the manager.
 *
 * The stamp itself is `lib/league/all-play.ts`'s, and that is where the four
 * conditions and their fixed thresholds are documented. It used to be decided
 * inline here on the schedule gap alone, which stamped a manager whose real
 * record nobody would call strong — a gap is large whenever the scores were
 * poor, and a 3-3 season with the worst scores in the league clears it. Nothing
 * about the numbers on the board changed; what changed is when the sign hangs.
 */
export interface FraudCheckLine {
  readonly managerId: string;
  readonly displayName: string;
  readonly officialRecord: string;
  readonly allPlayRecord: string;
  readonly scheduleDelta: string;
  /** The all-play rate, `.400`, and the record it scales onto the real season. */
  readonly allPlayWinPct: string;
  readonly expectedRecord: string;
  /** Tony's editorial sticker. Never an official league determination. */
  readonly tonyStamp: 'FRAUD ALERT' | null;
  /** The whole decision, met conditions and unmet ones alike. */
  readonly stamp: FraudStamp;
}

export interface FraudCheck {
  readonly season: number;
  readonly lines: readonly FraudCheckLine[];
  readonly weeksCounted: number;
  readonly excludedWeeks: readonly number[];
  readonly disclaimer: string;
  /**
   * How far this board reaches, and the wording for it.
   *
   * Null only on the historical path, which is a whole finished season by
   * construction. A live board is always `season-to-date` and always carries
   * the week it reaches.
   */
  readonly reach: AllPlayReach | null;
}

/**
 * The board, live during the season where the season allows it and historical
 * where it does not.
 *
 * ## Why the live board exists
 *
 * The finished-season board is correct and almost never says anything. Measured
 * over the two recorded seasons the stamp fires **once**, and that is not a
 * threshold being strict — every manager who finished 2025 with a strong record
 * also scored well, so there is no fraud in 2025 to find and no relaxation
 * discovers one. `docs/evidence/` carries the sweep: loosening the record
 * condition to .450 or the gap to 0.50 still produces exactly one stamp, and
 * the only knob that adds anybody adds a manager whose all-play record is
 * **76-50**.
 *
 * A whole season is where a soft schedule washes out. Mid-season is where it is
 * visible, and where the question is actually interesting: a 5-1 manager with
 * poor scores is an ordinary week-six state that regresses by week fourteen.
 * The measurement is exactly as true either way — what changes is that a
 * season-to-date claim must **say** it is season-to-date, which is what
 * {@link AllPlayReach} is for.
 *
 * ## What makes it truthful rather than merely early
 *
 * Only weeks that carry **their own finalization** are counted, through
 * `lib/stats/finality.ts` — the predicate weekly rewards and stake settlement
 * have used since they were built. A week still open to correction is not in
 * the measurement, so nothing on this board can move under a reader. This is
 * not the conservatism the old comment described (*"off the public board until
 * it has a finalized score population"*): that rule waited for the **season**,
 * which `finality.ts` records as the mistake that made a stake settleable
 * exactly when it was unpayable.
 *
 * The live board needs {@link FRAUD_THRESHOLDS.minimumGames} finalized weeks
 * before it appears at all — the same five games the stamp already required, so
 * this adds no second opinion about what a sample is. Below that, the
 * historical board stands.
 */
export async function fraudCheck(db: Queryable): Promise<FraudCheck | null> {
  const live = await seasonToDateFraudCheck(db);
  if (live !== null) return live;

  const era = await loadTrackedEra(db);
  const latestSeason = era.seasons.at(-1);
  if (latestSeason === undefined) return null;

  const record = playEveryoneRecord(era, { season: latestSeason });
  if (record === null) return null;

  return fraudCheckFrom(record);
}

/**
 * The current season through its last finalized week, or null when there is not
 * enough of it yet.
 *
 * Returns null — rather than an empty board — for every ordinary early-season
 * state: no season, no games, fewer than five closed weeks. Null is what hands
 * the page back to the historical board, which is the right thing to show in
 * September.
 */
export async function seasonToDateFraudCheck(
  db: Queryable,
  year?: number,
): Promise<FraudCheck | null> {
  const season = year ?? (await currentSeasonYear(db));
  if (season === null) return null;

  return seasonToDateBoard(season, await seasonWeeks(db, season));
}

/** Exactly what {@link seasonToDateBoard} reads out of a loaded season. */
export interface StoredSeason {
  readonly found: boolean;
  readonly finalized: boolean;
  readonly finalizedAt: Date | null;
  readonly weekFinalizedAt: ReadonlyMap<number, Date>;
  readonly rows: readonly {
    readonly week: number;
    readonly weekType: string;
    readonly rosterAId: number;
    readonly rosterBId: number;
    readonly pointsACents: number;
    readonly pointsBCents: number;
    readonly disputed: boolean;
  }[];
  readonly roster: ReadonlyMap<number, { readonly userId: string; readonly displayName: string }>;
}

/**
 * The live board from a loaded season, and no database handle.
 *
 * `lib/stats/finality.ts` states the pattern and the reason: *takes the facts
 * rather than a database handle, so every caller passes the same things and a
 * test can construct every answer*. Every decision worth getting wrong is in
 * here — which weeks are closed, which are unattributable, whether there is
 * enough season — and every one of them is reachable from a fixture.
 *
 * Pure. No clock, no randomness, no I/O.
 */
export function seasonToDateBoard(season: number, stored: StoredSeason): FraudCheck | null {
  if (!stored.found) return null;

  /*
   * A finished season is the historical board's, not this one's.
   *
   * Both would be correct, and the historical path reconciles against
   * `lib/stats/luck.ts` on every run. Two paths answering for one season is how
   * two answers start.
   */
  if (stored.finalized) return null;

  const regular = stored.rows.filter((row) => row.weekType === 'regular');
  const closed = new Set(
    [...new Set(regular.map((row) => row.week))].filter(
      (week) =>
        weekFinality({
          seasonFinalizedAt: stored.finalizedAt,
          weekFinalizedAt: stored.weekFinalizedAt.get(week) ?? null,
          hasGames: true,
        }).final,
    ),
  );
  if (closed.size < FRAUD_THRESHOLDS.minimumGames) return null;

  const games: AllPlayGame[] = [];
  const unresolved = new Set<number>();
  const disputed = new Set<number>();

  for (const row of regular) {
    if (!closed.has(row.week)) continue;
    if (row.disputed) disputed.add(row.week);

    const a = stored.roster.get(row.rosterAId);
    const b = stored.roster.get(row.rosterBId);
    /*
     * A roster with no seat this season cannot be attributed to a person, and
     * `16 §5.1` is why that is fatal rather than cosmetic: roster 4 is a
     * different manager in each of three seasons. The week goes, not the game —
     * an all-play tally depends on every score in its week.
     */
    if (a === undefined || b === undefined) {
      unresolved.add(row.week);
      continue;
    }

    games.push({
      week: row.week,
      a: { managerId: a.userId, displayName: a.displayName, pointsCents: row.pointsACents },
      b: { managerId: b.userId, displayName: b.displayName, pointsCents: row.pointsBCents },
    });
  }

  const table = allPlayTable(games, {
    season,
    seasonFinalized: false,
    excludedWeeks: [...unresolved, ...disputed],
  });

  // The shape can still fail — a short field, a doubled seat — and the same
  // five-week floor applies to what actually counted, not to what was closed.
  if (table.countedWeeks.length < FRAUD_THRESHOLDS.minimumGames) return null;
  if (table.lines.length === 0) return null;

  return {
    season,
    lines: [...table.lines]
      .sort(
        (left, right) =>
          right.scheduleDelta - left.scheduleDelta ||
          left.displayName.localeCompare(right.displayName),
      )
      .map(lineOf),
    weeksCounted: table.countedWeeks.length,
    excludedWeeks: table.excludedWeeks,
    disclaimer: ALL_PLAY_DISCLAIMER,
    reach: table.reach,
  };
}

/** One row of the live board. The historical path formats the same fields. */
function lineOf(line: AllPlayLine): FraudCheckLine {
  const stamp = fraudStamp({
    wins: line.wins,
    losses: line.losses,
    ties: line.ties,
    allPlayWins: line.allPlayWins,
    allPlayLosses: line.allPlayLosses,
    allPlayTies: line.allPlayTies,
  });

  return {
    managerId: line.managerId,
    displayName: line.displayName,
    officialRecord: formatRecord(line.wins, line.losses, line.ties),
    allPlayRecord: formatRecord(line.allPlayWins, line.allPlayLosses, line.allPlayTies),
    scheduleDelta: signed(line.scheduleDelta),
    allPlayWinPct: pct(line.allPlayWinPct),
    expectedRecord: `${line.expectedWins.toFixed(2)}-${line.expectedLosses.toFixed(2)}`,
    tonyStamp: stamp.label,
    stamp,
  };
}

/** Pure presentation adapter, exported for the ten-team boundary tests. */
export function fraudCheckFrom(record: PlayEveryoneRecord): FraudCheck {
  return {
    season: record.season,
    lines: [...record.lines]
      .sort(
        (left, right) =>
          right.scheduleDelta - left.scheduleDelta || left.displayName.localeCompare(right.displayName),
      )
      .map((line): FraudCheckLine => {
        const officialGames = line.actualWins + line.actualLosses + line.actualTies;
        const comparisons =
          line.playEveryoneWins + line.playEveryoneLosses + line.playEveryoneTies;
        const rate =
          comparisons === 0
            ? 0
            : (line.playEveryoneWins + line.playEveryoneTies / 2) / comparisons;
        const stamp = fraudStamp({
          wins: line.actualWins,
          losses: line.actualLosses,
          ties: line.actualTies,
          allPlayWins: line.playEveryoneWins,
          allPlayLosses: line.playEveryoneLosses,
          allPlayTies: line.playEveryoneTies,
        });

        return {
          managerId: line.managerId,
          displayName: line.displayName,
          officialRecord: formatRecord(line.actualWins, line.actualLosses, line.actualTies),
          allPlayRecord: formatRecord(
            line.playEveryoneWins,
            line.playEveryoneLosses,
            line.playEveryoneTies,
          ),
          scheduleDelta: signed(line.scheduleDelta),
          allPlayWinPct: pct(rate),
          expectedRecord: `${stamp.expectedWins.toFixed(2)}-${(
            officialGames - stamp.expectedWins
          ).toFixed(2)}`,
          tonyStamp: stamp.label,
          stamp,
        };
      }),
    weeksCounted: record.includedWeeks.length,
    excludedWeeks: record.excludedWeeks,
    disclaimer: record.disclaimer,
    /*
     * The historical board is a whole finished season by construction — the era
     * loader holds nothing else — so there is no week to reach through and no
     * ambiguity for a label to resolve.
     */
    reach: null,
  };
}
