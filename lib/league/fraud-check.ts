import { loadTrackedEra } from '@/lib/stats/era';
import { playEveryoneRecord, type PlayEveryoneRecord } from '@/lib/stats/luck';
import { type Queryable } from '@/lib/db';

/**
 * A readable presentation of the neutral all-play measurement.
 *
 * The math lives in `lib/stats/luck.ts`; this file deliberately does not
 * re-count a score or invent a second standings table. It picks the latest
 * complete season, formats its fixed values once, and makes Tony's optional
 * editorial stamp explicit as a joke rather than a fact about the manager.
 */
export interface FraudCheckLine {
  readonly managerId: string;
  readonly displayName: string;
  readonly officialRecord: string;
  readonly allPlayRecord: string;
  readonly scheduleDelta: string;
  /** Tony's editorial sticker. Never an official league determination. */
  readonly tonyStamp: 'FRAUD ALERT' | null;
}

export interface FraudCheck {
  readonly season: number;
  readonly lines: readonly FraudCheckLine[];
  readonly weeksCounted: number;
  readonly excludedWeeks: readonly number[];
  readonly disclaimer: string;
}

/**
 * Latest completed-season audit.
 *
 * The active season remains off the public board until it has a finalized
 * score population. This is deliberately conservative: a table which calls
 * someone a fraud on a live, incomplete Sunday would be bad football data and
 * worse Tony writing. Once the Tuesday close records a full current season,
 * this same derivation automatically moves forward.
 */
export async function fraudCheck(db: Queryable): Promise<FraudCheck | null> {
  const era = await loadTrackedEra(db);
  const latestSeason = era.seasons.at(-1);
  if (latestSeason === undefined) return null;

  const record = playEveryoneRecord(era, { season: latestSeason });
  if (record === null) return null;

  return fraudCheckFrom(record);
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
        return {
          managerId: line.managerId,
          displayName: line.displayName,
          officialRecord: compactRecord(line.actualWins, line.actualLosses, line.actualTies),
          allPlayRecord: compactRecord(
            line.playEveryoneWins,
            line.playEveryoneLosses,
            line.playEveryoneTies,
          ),
          scheduleDelta: signed(line.scheduleDelta),
          /*
           * Two or more schedule-assisted wins over at least five official
           * games is the point where Tony gets to hang the sign. This is a
           * stable editorial threshold, not a hidden model and not a claim
           * about who deserved what.
           */
          tonyStamp: officialGames >= 5 && line.scheduleDelta >= 2 ? 'FRAUD ALERT' : null,
        };
      }),
    weeksCounted: record.includedWeeks.length,
    excludedWeeks: record.excludedWeeks,
    disclaimer: record.disclaimer,
  };
}

function compactRecord(wins: number, losses: number, ties: number): string {
  return ties === 0
    ? `${String(wins)}-${String(losses)}`
    : `${String(wins)}-${String(losses)}-${String(ties)}`;
}

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}
