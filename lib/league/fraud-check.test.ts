import { describe, expect, it } from 'vitest';

import { type PlayEveryoneRecord } from '@/lib/stats/luck';
import { scopeOf } from '@/lib/stats/scope';

import { FRAUD_THRESHOLDS } from './all-play';
import { fraudCheckFrom } from './fraud-check';

/**
 * The presentation adapter over the neutral all-play measurement.
 *
 * The fixture is a **ten-team shape**, and that is load-bearing: five counted
 * weeks is forty-five comparisons per manager, nine a week, and five games
 * played. An earlier version of this file carried fifty-five comparisons over
 * five weeks under a comment claiming nine each — a tally can say anything, and
 * a fixture that cannot happen tests nothing. `all-play.test.ts` builds its
 * cases from whole weeks of stored scores for the same reason.
 */

const FIVE_WEEKS = 5;
const COMPARISONS = FIVE_WEEKS * 9;

const line = (input: {
  managerId: string;
  displayName: string;
  wins: number;
  losses: number;
  allPlayWins: number;
  pointsFor: number;
}) => {
  const allPlayLosses = COMPARISONS - input.allPlayWins;
  const games = input.wins + input.losses;
  const delta = input.wins - (input.allPlayWins / COMPARISONS) * games;
  return {
    managerId: input.managerId,
    displayName: input.displayName,
    actualWins: input.wins,
    actualLosses: input.losses,
    actualTies: 0,
    playEveryoneWins: input.allPlayWins,
    playEveryoneLosses: allPlayLosses,
    playEveryoneTies: 0,
    scheduleDelta: Math.round(delta * 100) / 100,
    pointsFor: input.pointsFor,
    weeksCounted: FIVE_WEEKS,
  };
};

const record: PlayEveryoneRecord = {
  id: 'play-everyone:2026',
  type: 'play-everyone',
  season: 2026,
  lines: [
    // Undefeated on the schedule, fourth from bottom on the scores.
    line({
      managerId: 'alex',
      displayName: 'Alex',
      wins: 5,
      losses: 0,
      allPlayWins: 18,
      pointsFor: 620,
    }),
    // Scores that earned the record, and then some.
    line({
      managerId: 'nathan',
      displayName: 'Nathan',
      wins: 3,
      losses: 2,
      allPlayWins: 28,
      pointsFor: 710,
    }),
    // A poor all-play record and a strong one on the schedule, but the gap
    // stops short of two whole wins.
    line({
      managerId: 'ryan',
      displayName: 'Ryan',
      wins: 4,
      losses: 1,
      allPlayWins: 20,
      pointsFor: 640,
    }),
  ],
  includedWeeks: [1, 2, 3, 4, 5],
  excludedWeeks: [],
  disclaimer: 'computed, not played',
  managerIds: ['alex', 'nathan', 'ryan'],
  sourceGameKeys: [],
  scope: scopeOf({ kind: 'season', seasons: [2026], observations: 25 }),
  support: 'verified',
  evidence: [],
};

const lineFor = (managerId: string) =>
  fraudCheckFrom(record).lines.find((entry) => entry.managerId === managerId);

describe('fraudCheckFrom', () => {
  it('makes the ten-team, nine-opponent all-play record readable without changing it', () => {
    const check = fraudCheckFrom(record);
    const alex = lineFor('alex');

    expect(alex?.officialRecord).toBe('5-0');
    expect(alex?.allPlayRecord).toBe('18-27');
    expect(alex?.allPlayWinPct).toBe('.400');
    expect(alex?.scheduleDelta).toBe('+3.00');
    expect(alex?.expectedRecord).toBe('2.00-3.00');
    expect(alex?.tonyStamp).toBe('FRAUD ALERT');
    expect(check.weeksCounted).toBe(5);
  });

  it('keeps the sticker as an editorial threshold, not an automatic label', () => {
    expect(lineFor('nathan')?.tonyStamp).toBeNull();
    expect(
      lineFor('nathan')?.stamp.conditions.find((entry) => entry.condition === 'all-play-record')
        ?.met,
    ).toBe(false);
  });

  it('withholds the sticker when the gap is real but short of the threshold', () => {
    const ryan = lineFor('ryan');

    expect(ryan?.scheduleDelta).toBe('+1.78');
    expect(ryan?.tonyStamp).toBeNull();
    expect(ryan?.stamp.conditions.find((entry) => entry.condition === 'schedule-gap')?.met).toBe(
      false,
    );
    // Every other condition was met — the gap is the only thing missing.
    expect(
      ryan?.stamp.conditions
        .filter((entry) => entry.condition !== 'schedule-gap')
        .every((entry) => entry.met),
    ).toBe(true);
  });

  it('carries the reason with every line, stamped or not', () => {
    for (const entry of fraudCheckFrom(record).lines) {
      expect(entry.stamp.conditions).toHaveLength(4);
      expect(entry.stamp.caveat).toContain('official record');
      expect(entry.stamp.label).toBe(entry.tonyStamp);
    }
  });

  it('reads the loudest schedule first', () => {
    expect(fraudCheckFrom(record).lines.map((entry) => entry.managerId)).toEqual([
      'alex',
      'ryan',
      'nathan',
    ]);
  });

  it('agrees with the thresholds it is judged against', () => {
    expect(FRAUD_THRESHOLDS.minimumGames).toBe(5);
    expect(FRAUD_THRESHOLDS.minimumScheduleDelta).toBe(2);
  });
});
