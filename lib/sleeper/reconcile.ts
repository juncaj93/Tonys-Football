/**
 * Finalized standings versus the weekly scoring snapshot.
 *
 * These are two different facts and the product must always know which one it
 * is holding (Technical Lead ruling 2026-07-29 §3).
 *
 *   **Finalized standings** — `rosters[].settings` W/L/T and points-for, with
 *   `rosters[].metadata.record` (a per-week `"WLLWL…"` string) corroborating
 *   it. This is the league's **official** record. The 2024 playoff field and
 *   its seeding follow from it, which is what makes it authoritative: the
 *   bracket that was actually played is the one these standings produced.
 *
 *   **Weekly scoring snapshot** — the `matchups` payloads. This is what the
 *   players scored *as recorded at the moment we fetched it*, and it is
 *   **mutable upstream**: NFL stat corrections keep landing on old weeks long
 *   after a season closes.
 *
 * In 2024 they disagree, and the disagreement is real rather than arithmetic:
 * four managers' records and five point totals differ, and the two disputed
 * games reconcile exactly against the points drift. Sleeper updated the player
 * scores and never recomputed the standings. 2025 is clean to the cent.
 *
 * **This module detects. It never resolves.** No averaging, no picking a
 * winner, no quiet correction. It returns a typed report that persistence
 * turns into an auditable conflict and that analytics consult before making a
 * claim a disputed game would change.
 *
 * All arithmetic is in **integer cents**. Summing fourteen two-decimal floats
 * and comparing the total to another float is how a phantom one-cent conflict
 * gets reported forever.
 */
import { type ImportedPairing } from './chain';
import { type WeekType } from './weeks';

/** Points as an exact integer count of hundredths. */
export function toCents(points: number): number {
  return Math.round(points * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export interface WonLostTied {
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
}

/** One roster's official, finalized season record. */
export interface FinalizedSeat {
  readonly rosterId: number;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly pointsFor: number;
  /** Sleeper's per-week result string, e.g. `"WWWLLWWWWWWWLW"`. Corroboration only. */
  readonly record: string | null;
}

/** One regular-season week of the scoring snapshot. */
export interface SnapshotWeek {
  readonly week: number;
  readonly type: WeekType;
  readonly pairings: readonly ImportedPairing[];
  /** Roster ID → points scored, for every row in the week. */
  readonly pointsByRoster: Readonly<Record<number, number>>;
}

export interface RecordConflict {
  readonly rosterId: number;
  readonly finalized: WonLostTied;
  readonly snapshot: WonLostTied;
}

export interface PointsConflict {
  readonly rosterId: number;
  readonly finalizedPointsFor: number;
  readonly snapshotPointsFor: number;
  /** Snapshot minus finalized, in cents. Signed. */
  readonly deltaCents: number;
}

/**
 * A single game whose recorded result contradicts its current scoring.
 *
 * The most consequential shape of the conflict, because a game — unlike a
 * points total — has a winner, and publishing the wrong one is a false claim
 * about two named people.
 */
export interface DisputedGame {
  readonly week: number;
  readonly rosterAId: number;
  readonly rosterBId: number;
  readonly snapshotPointsA: number;
  readonly snapshotPointsB: number;
  /** Who the snapshot's points say won. Null on a tie. */
  readonly snapshotWinnerRosterId: number | null;
  /** Who the finalized record says won. This is the official result. */
  readonly finalizedWinnerRosterId: number | null;
}

export interface SeasonReconciliation {
  readonly year: number;
  /** When the weekly snapshot was captured. See `ImportedSeason.capturedAt`. */
  readonly capturedAt: Date | null;
  readonly recordConflicts: readonly RecordConflict[];
  readonly pointsConflicts: readonly PointsConflict[];
  readonly disputedGames: readonly DisputedGame[];
  /** Whether per-game adjudication was possible at all. */
  readonly recordSource: 'sleeper_metadata' | 'unavailable';
  readonly isClean: boolean;
  /** Commissioner-facing lines. Never rendered to an ordinary manager. */
  readonly warnings: readonly string[];
}

export const CLEAN_RECONCILIATION: Omit<SeasonReconciliation, 'year' | 'capturedAt'> = {
  recordConflicts: [],
  pointsConflicts: [],
  disputedGames: [],
  recordSource: 'unavailable',
  isClean: true,
  warnings: [],
};

/** The result letter Sleeper recorded for a roster in a given regular-season week. */
function finalizedResult(record: string | null, week: number): 'W' | 'L' | 'T' | null {
  if (record === null) return null;
  const letter = record[week - 1];
  return letter === 'W' || letter === 'L' || letter === 'T' ? letter : null;
}

/**
 * Compare the finalized standings against the weekly snapshot.
 *
 * Regular season only, on both sides. `settings.fpts` is a regular-season
 * total — verified to the cent against weeks 1–14 for all ten rosters in 2025
 * — so comparing it against a sum that included the playoffs would manufacture
 * a conflict on every roster in the league.
 */
export function reconcileSeason(input: {
  readonly year: number;
  readonly capturedAt: Date | null;
  readonly seats: readonly FinalizedSeat[];
  readonly weeks: readonly SnapshotWeek[];
}): SeasonReconciliation {
  const regular = input.weeks
    .filter((week) => week.type === 'regular')
    .sort((a, b) => a.week - b.week);

  const warnings: string[] = [];

  if (regular.length === 0) {
    return {
      year: input.year,
      capturedAt: input.capturedAt,
      ...CLEAN_RECONCILIATION,
      warnings: [
        'No regular-season weeks were imported, so finalized standings could not be ' +
          'reconciled against the scoring snapshot.',
      ],
    };
  }

  const pointsCents = new Map<number, number>();
  const snapshotRecord = new Map<number, { wins: number; losses: number; ties: number }>();
  const disputedGames: DisputedGame[] = [];

  const bump = (rosterId: number, outcome: 'wins' | 'losses' | 'ties'): void => {
    const current = snapshotRecord.get(rosterId) ?? { wins: 0, losses: 0, ties: 0 };
    current[outcome]++;
    snapshotRecord.set(rosterId, current);
  };

  const recordByRoster = new Map(input.seats.map((seat) => [seat.rosterId, seat.record]));
  const anyRecordString = input.seats.some((seat) => seat.record !== null);

  for (const week of regular) {
    for (const [rosterId, points] of Object.entries(week.pointsByRoster)) {
      const id = Number(rosterId);
      pointsCents.set(id, (pointsCents.get(id) ?? 0) + toCents(points));
    }

    for (const pairing of week.pairings) {
      const { rosterAId, rosterBId, pointsA, pointsB } = pairing;
      const centsA = toCents(pointsA);
      const centsB = toCents(pointsB);

      const snapshotWinner =
        centsA === centsB ? null : centsA > centsB ? rosterAId : rosterBId;

      if (snapshotWinner === null) {
        bump(rosterAId, 'ties');
        bump(rosterBId, 'ties');
      } else {
        bump(snapshotWinner, 'wins');
        bump(snapshotWinner === rosterAId ? rosterBId : rosterAId, 'losses');
      }

      const letterA = finalizedResult(recordByRoster.get(rosterAId) ?? null, week.week);
      const letterB = finalizedResult(recordByRoster.get(rosterBId) ?? null, week.week);
      if (letterA === null && letterB === null) continue;

      const finalizedWinner =
        letterA === 'W' ? rosterAId : letterB === 'W' ? rosterBId : letterA === 'T' ? null : null;
      const finalizedIsTie = letterA === 'T' || letterB === 'T';

      const disagrees = finalizedIsTie
        ? snapshotWinner !== null
        : finalizedWinner !== null && finalizedWinner !== snapshotWinner;

      if (disagrees) {
        disputedGames.push({
          week: week.week,
          rosterAId,
          rosterBId,
          snapshotPointsA: pointsA,
          snapshotPointsB: pointsB,
          snapshotWinnerRosterId: snapshotWinner,
          finalizedWinnerRosterId: finalizedWinner,
        });
      }
    }
  }

  const recordConflicts: RecordConflict[] = [];
  const pointsConflicts: PointsConflict[] = [];

  for (const seat of [...input.seats].sort((a, b) => a.rosterId - b.rosterId)) {
    const snapshot = snapshotRecord.get(seat.rosterId) ?? { wins: 0, losses: 0, ties: 0 };
    const finalized = { wins: seat.wins, losses: seat.losses, ties: seat.ties };

    if (
      finalized.wins !== snapshot.wins ||
      finalized.losses !== snapshot.losses ||
      finalized.ties !== snapshot.ties
    ) {
      recordConflicts.push({ rosterId: seat.rosterId, finalized, snapshot });
    }

    const snapshotCents = pointsCents.get(seat.rosterId) ?? 0;
    const finalizedCents = toCents(seat.pointsFor);
    if (snapshotCents !== finalizedCents) {
      pointsConflicts.push({
        rosterId: seat.rosterId,
        finalizedPointsFor: seat.pointsFor,
        snapshotPointsFor: fromCents(snapshotCents),
        deltaCents: snapshotCents - finalizedCents,
      });
    }
  }

  for (const conflict of recordConflicts) {
    warnings.push(
      `${String(input.year)} roster ${String(conflict.rosterId)}: finalized record ` +
        `${String(conflict.finalized.wins)}-${String(conflict.finalized.losses)}-` +
        `${String(conflict.finalized.ties)} does not match the weekly scoring snapshot ` +
        `(${String(conflict.snapshot.wins)}-${String(conflict.snapshot.losses)}-` +
        `${String(conflict.snapshot.ties)}). The finalized record stands.`,
    );
  }
  for (const conflict of pointsConflicts) {
    warnings.push(
      `${String(input.year)} roster ${String(conflict.rosterId)}: finalized points-for ` +
        `${conflict.finalizedPointsFor.toFixed(2)} does not match the weekly scoring snapshot ` +
        `(${conflict.snapshotPointsFor.toFixed(2)}, ` +
        `${conflict.deltaCents > 0 ? '+' : ''}${fromCents(conflict.deltaCents).toFixed(2)}). ` +
        `The finalized total stands.`,
    );
  }
  for (const game of disputedGames) {
    warnings.push(
      `${String(input.year)} week ${String(game.week)}: roster ` +
        `${String(game.rosterAId)} ${game.snapshotPointsA.toFixed(2)} vs roster ` +
        `${String(game.rosterBId)} ${game.snapshotPointsB.toFixed(2)} — the current scoring ` +
        `snapshot makes roster ${String(game.snapshotWinnerRosterId ?? 0)} the winner, but the ` +
        `finalized result records roster ${String(game.finalizedWinnerRosterId ?? 0)}. ` +
        `The finalized result is official; a later stat correction moved the points.`,
    );
  }

  return {
    year: input.year,
    capturedAt: input.capturedAt,
    recordConflicts,
    pointsConflicts,
    disputedGames,
    recordSource: anyRecordString ? 'sleeper_metadata' : 'unavailable',
    isClean:
      recordConflicts.length === 0 && pointsConflicts.length === 0 && disputedGames.length === 0,
    warnings,
  };
}

/**
 * Whether a weekly-scoring claim about a given week is safe to publish.
 *
 * The rule from §4 of the ruling: weekly-score analytics must flag or exclude
 * an affected game when the discrepancy would change the claim. A statistic
 * that ranks or picks a winner within a disputed week must not be published as
 * fact — 2024's closest regular-season game *is* one of the disputed ones.
 */
export function isWeekDisputed(reconciliation: SeasonReconciliation, week: number): boolean {
  return reconciliation.disputedGames.some((game) => game.week === week);
}

/** Whether a specific pairing is one of the disputed games. */
export function isPairingDisputed(
  reconciliation: SeasonReconciliation,
  week: number,
  rosterAId: number,
  rosterBId: number,
): boolean {
  return reconciliation.disputedGames.some(
    (game) =>
      game.week === week &&
      ((game.rosterAId === rosterAId && game.rosterBId === rosterBId) ||
        (game.rosterAId === rosterBId && game.rosterBId === rosterAId)),
  );
}
