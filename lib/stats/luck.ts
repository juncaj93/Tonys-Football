import { fromCents } from '@/lib/sleeper/reconcile';

import { countableGames, type TrackedEra } from './era';
import { type HistoricalFactBase, type Support } from './history';
import { scopeOf } from './scope';

/**
 * The play-everyone record — a neutral measurement, and nothing more.
 *
 * ## What it is
 *
 * For each week, each manager's score is compared against **every other score
 * posted that week**. A manager who posted the third-highest score of a ten-team
 * week goes 8–1 for that week whatever their actual game did. Summed over a
 * season it answers one question: *how would the record look if the schedule had
 * not been involved?*
 *
 * `07 §7.5` names it directly as a *"possible measure"* under the heading the
 * commissioner calls **luck or fraud**, alongside the instruction that
 * *"the fact packet must include the metric and calculation"* and that *"the UI
 * or article should not imply the label is an objective truth."*
 *
 * ## What it is deliberately not
 *
 * There is no `fraud` field here, no `luck` score, no `expected wins`, and no
 * ranking of managers by how deserving they were. The task brief is explicit and
 * this file agrees with it: *do not produce a defamatory or subjective
 * `fraud = true`.* What is produced is two records — the actual one and the
 * play-everyone one — over the same games. **Whether the gap between them is
 * funny is not a question this layer can answer**, and an editorial layer that
 * wants to make a joke of it has everything it needs.
 *
 * `expected wins` is additionally banned *as a phrase* by the Slice validator
 * (`lib/slice/validate.ts`, under win-probability language), which is a second
 * reason the number is not called that.
 *
 * ## It is computed, and it is never a league result
 *
 * `docs/DATA_AUDIT.md §6`: *"There are no median/all-play games.
 * `settings.league_average_match = 0` in all three seasons. Every 'all-play'
 * statistic must be labelled as computed by Tony, never as a league result."*
 * This league never played these games. {@link COMPUTED_NOT_PLAYED} is on every
 * fact this file produces and is part of the evidence rather than a footnote.
 *
 * ## A disputed week is dropped whole
 *
 * Every other derivation in `lib/stats` excludes a disputed **game**. That is
 * not enough here, because an all-play tally for one manager depends on *every
 * score in the week* — dropping one game would silently change the denominator
 * for the eight managers who were not in it, and their records would be computed
 * against nine opponents while everybody else's used ten.
 *
 * So a week holding any uncountable game is excluded entire, the excluded weeks
 * are named, and the support drops to `partial`. In the recorded league that
 * costs 2024 weeks 13 and 14 — the two games `16 §12` says the standings and the
 * snapshot disagree about.
 *
 * ## Pure
 *
 * No clock, no randomness, no database.
 */

/** The label that must accompany any play-everyone number, everywhere. */
export const COMPUTED_NOT_PLAYED =
  'computed from stored scores — this league plays no all-play games ' +
  '(`league_average_match = 0`), so this is a measurement and never a league result';

export interface PlayEveryoneLine {
  readonly managerId: string;
  readonly displayName: string;

  /** The record they actually posted, over the same weeks this was measured on. */
  readonly actualWins: number;
  readonly actualLosses: number;
  readonly actualTies: number;

  /** Comparisons won against every other score in each included week. */
  readonly playEveryoneWins: number;
  readonly playEveryoneLosses: number;
  readonly playEveryoneTies: number;

  /**
   * Actual wins minus the wins the same weeks would have produced at the
   * play-everyone rate, to two places.
   *
   * Positive means the schedule was kinder than the scores; negative means it
   * was not. **It is a subtraction, not a verdict** — the sign carries no
   * judgement and this file attaches none.
   */
  readonly scheduleDelta: number;

  readonly pointsFor: number;
  /** Weeks that entered the measurement for this manager. */
  readonly weeksCounted: number;
}

export interface PlayEveryoneRecord extends HistoricalFactBase {
  readonly type: 'play-everyone';
  readonly season: number;
  /** One line per manager who played a counted week, by display name. */
  readonly lines: readonly PlayEveryoneLine[];
  /** Weeks left out because they held an uncountable game. Ascending. */
  readonly excludedWeeks: readonly number[];
  readonly includedWeeks: readonly number[];
  /** Always {@link COMPUTED_NOT_PLAYED}. On the fact so it cannot be dropped. */
  readonly disclaimer: string;
}

/**
 * The play-everyone record for one finalized season.
 *
 * Returns null for a season the era does not hold, or one with no countable
 * regular-season week left after exclusions — which is a real state and must not
 * render as everybody going 0–0.
 */
export function playEveryoneRecord(
  era: TrackedEra,
  input: { readonly season: number },
): PlayEveryoneRecord | null {
  if (!era.seasons.includes(input.season)) return null;

  const regular = era.games.filter(
    (game) => game.season === input.season && game.weekType === 'regular',
  );
  if (regular.length === 0) return null;

  const allWeeks = [...new Set(regular.map((game) => game.week))].sort((a, b) => a - b);
  const spoiled = new Set(regular.filter((game) => !game.countable).map((game) => game.week));

  const includedWeeks = allWeeks.filter((week) => !spoiled.has(week));
  const excludedWeeks = allWeeks.filter((week) => spoiled.has(week));
  if (includedWeeks.length === 0) return null;

  const counted = countableGames(era).filter(
    (game) =>
      game.season === input.season &&
      game.weekType === 'regular' &&
      includedWeeks.includes(game.week),
  );

  interface Tally {
    managerId: string;
    displayName: string;
    actualWins: number;
    actualLosses: number;
    actualTies: number;
    peWins: number;
    peLosses: number;
    peTies: number;
    pointsForCents: number;
    weeks: number;
  }

  const tallies = new Map<string, Tally>();
  const tally = (managerId: string, displayName: string): Tally => {
    const existing = tallies.get(managerId);
    if (existing !== undefined) return existing;
    const fresh: Tally = {
      managerId,
      displayName,
      actualWins: 0,
      actualLosses: 0,
      actualTies: 0,
      peWins: 0,
      peLosses: 0,
      peTies: 0,
      pointsForCents: 0,
      weeks: 0,
    };
    tallies.set(managerId, fresh);
    return fresh;
  };

  for (const week of includedWeeks) {
    const inWeek = counted.filter((game) => game.week === week);
    if (inWeek.length === 0) continue;

    const teamWeeks = inWeek.flatMap((game) => [game.a, game.b]);

    for (const side of teamWeeks) {
      const row = tally(side.managerId!, side.displayName ?? '');
      row.pointsForCents += side.pointsCents;
      row.weeks++;
      for (const other of teamWeeks) {
        if (other.rosterId === side.rosterId) continue;
        if (side.pointsCents > other.pointsCents) row.peWins++;
        else if (side.pointsCents < other.pointsCents) row.peLosses++;
        else row.peTies++;
      }
    }

    for (const game of inWeek) {
      const a = tally(game.a.managerId!, game.a.displayName ?? '');
      const b = tally(game.b.managerId!, game.b.displayName ?? '');
      if (game.tie) {
        a.actualTies++;
        b.actualTies++;
      } else if (game.winner?.managerId === game.a.managerId) {
        a.actualWins++;
        b.actualLosses++;
      } else {
        b.actualWins++;
        a.actualLosses++;
      }
    }
  }

  const lines = [...tallies.values()]
    .map((row): PlayEveryoneLine => {
      const comparisons = row.peWins + row.peLosses + row.peTies;
      /*
       * The play-everyone win *rate*, scaled back to the number of games they
       * actually played, so the two records are on the same axis. Comparing an
       * 8-1-per-week tally against a 14-game season directly would report every
       * manager as wildly under-rewarded.
       */
      const expectedFromRate =
        comparisons === 0
          ? 0
          : ((row.peWins + row.peTies / 2) / comparisons) *
            (row.actualWins + row.actualLosses + row.actualTies);

      return {
        managerId: row.managerId,
        displayName: row.displayName,
        actualWins: row.actualWins,
        actualLosses: row.actualLosses,
        actualTies: row.actualTies,
        playEveryoneWins: row.peWins,
        playEveryoneLosses: row.peLosses,
        playEveryoneTies: row.peTies,
        scheduleDelta: Math.round((row.actualWins - expectedFromRate) * 100) / 100,
        pointsFor: fromCents(row.pointsForCents),
        weeksCounted: row.weeks,
      };
    })
    .sort((x, y) => x.displayName.localeCompare(y.displayName));

  const support: Support = excludedWeeks.length === 0 ? 'verified' : 'partial';

  const scope = scopeOf({
    kind: 'season',
    seasons: [input.season],
    observations: counted.length,
  });

  return {
    id: `play-everyone:${String(input.season)}`,
    type: 'play-everyone',
    season: input.season,
    lines,
    excludedWeeks,
    includedWeeks,
    disclaimer: COMPUTED_NOT_PLAYED,
    managerIds: lines.map((line) => line.managerId),
    sourceGameKeys: counted.map((game) => game.key),
    scope,
    support,
    evidence: [
      COMPUTED_NOT_PLAYED,
      `${String(includedWeeks.length)} regular-season weeks counted ${scope.label}, ` +
        `${String(counted.length)} games, ${String(lines.length)} managers`,
      excludedWeeks.length === 0
        ? 'no weeks excluded'
        : `weeks ${excludedWeeks.join(', ')} excluded whole: each holds a game that cannot be ` +
          'counted, and an all-play tally depends on every score in its week',
      'each score compared against every other score in the same week; a tie in a comparison ' +
        'counts as half a win when the rate is scaled',
      'the actual record is counted over exactly the same weeks, so the two are comparable',
      'no ranking, no label and no verdict is derived from the gap — `07 §7.5`',
    ],
  };
}
