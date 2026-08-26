import { loadTrackedEra } from '@/lib/stats/era';
import { playEveryoneRecord, type PlayEveryoneRecord } from '@/lib/stats/luck';
import { type Queryable } from '@/lib/db';

import { formatRecord, fraudStamp, pct, signed, type FraudStamp } from './all-play';

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
  };
}
