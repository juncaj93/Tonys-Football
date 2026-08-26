import { describe, expect, it } from 'vitest';

import { type PlayEveryoneRecord } from '@/lib/stats/luck';
import { scopeOf } from '@/lib/stats/scope';

import { ALL_PLAY_DISCLAIMER, FRAUD_THRESHOLDS } from './all-play';
import { fraudCheckFrom, seasonToDateBoard, type StoredSeason } from './fraud-check';

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

/* ------------------------------------------------------------------------- */
/* The live, season-to-date board                                            */
/* ------------------------------------------------------------------------- */

/**
 * The board during a season, from a loaded season and no database.
 *
 * This is the half with the decisions in it: which weeks are closed, which are
 * unattributable, whether there is enough season to say anything. Every one of
 * them is reachable from a fixture, which is why `seasonToDateBoard` takes the
 * facts rather than a handle — `lib/stats/finality.ts` states the pattern.
 */

const CLOSED_AT = new Date('2026-10-06T12:00:00Z');

const SEATS_2026 = new Map(
  [
    'alex',
    'nathan',
    'ryan',
    'zack',
    'nick',
    'dan',
    'mike',
    'joe',
    'sam',
    'pete',
  ].map((id, index) => [
    index + 1,
    { userId: id, displayName: id.charAt(0).toUpperCase() + id.slice(1) },
  ]),
);

/** Alex is scheduled beneath the league's worst scorer every single week. */
const FLATTERED = [90, 80, 120, 130, 140, 150, 160, 170, 180, 190];

function storedWeek(week: number, points: readonly number[], disputedWeeks: readonly number[]) {
  const pairs: readonly (readonly [number, number])[] = [
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [9, 10],
  ];
  return pairs.map(([a, b]) => ({
    week,
    weekType: 'regular',
    rosterAId: a,
    rosterBId: b,
    pointsACents: Math.round((points[a - 1] ?? 0) * 100),
    pointsBCents: Math.round((points[b - 1] ?? 0) * 100),
    disputed: disputedWeeks.includes(week),
  }));
}

function season2026(input: {
  readonly weeks: number;
  /** Which of those weeks the Tuesday job has closed. Defaults to all. */
  readonly closed?: readonly number[];
  readonly finalized?: boolean;
  readonly roster?: ReadonlyMap<number, { userId: string; displayName: string }>;
  readonly disputed?: readonly number[];
}): StoredSeason {
  const weeks = Array.from({ length: input.weeks }, (_, index) => index + 1);
  const closed = input.closed ?? weeks;
  return {
    found: true,
    finalized: input.finalized ?? false,
    finalizedAt: input.finalized === true ? CLOSED_AT : null,
    weekFinalizedAt: new Map(closed.map((week) => [week, CLOSED_AT])),
    rows: weeks.flatMap((week) => storedWeek(week, FLATTERED, input.disputed ?? [])),
    roster: input.roster ?? SEATS_2026,
  };
}

describe('seasonToDateBoard', () => {
  it('builds a board once five weeks have closed, and says how far it reaches', () => {
    const board = seasonToDateBoard(2026, season2026({ weeks: 5 }));

    expect(board).not.toBeNull();
    expect(board?.season).toBe(2026);
    expect(board?.weeksCounted).toBe(5);
    expect(board?.reach?.kind).toBe('season-to-date');
    expect(board?.reach?.throughWeek).toBe(5);
    expect(board?.reach?.label).toBe('in 2026 through week 5');
    expect(board?.lines).toHaveLength(10);
  });

  it('stamps the manager the schedule is carrying, mid-season', () => {
    const board = seasonToDateBoard(2026, season2026({ weeks: 5 }));
    const alex = board?.lines.find((line) => line.managerId === 'alex');

    // 5-0 on the schedule, second-worst score in the league every week.
    expect(alex?.officialRecord).toBe('5-0');
    expect(alex?.allPlayRecord).toBe('5-40');
    expect(alex?.tonyStamp).toBe('FRAUD ALERT');
    expect(board?.lines[0]?.managerId).toBe('alex');
  });

  it('counts only the weeks the Tuesday job has closed', () => {
    // Eight weeks played, five closed. Week 6-8 are still open to correction.
    const board = seasonToDateBoard(2026, season2026({ weeks: 8, closed: [1, 2, 3, 4, 5] }));

    expect(board?.weeksCounted).toBe(5);
    expect(board?.reach?.throughWeek).toBe(5);
    expect(board?.lines.find((line) => line.managerId === 'alex')?.officialRecord).toBe('5-0');
  });

  it('waits until there is enough season to say anything', () => {
    expect(seasonToDateBoard(2026, season2026({ weeks: 4 }))).toBeNull();
    expect(seasonToDateBoard(2026, season2026({ weeks: 8, closed: [1, 2, 3, 4] }))).toBeNull();
    // Played but never closed is the ordinary Sunday-to-Tuesday state.
    expect(seasonToDateBoard(2026, season2026({ weeks: 8, closed: [] }))).toBeNull();
  });

  it('hands a finished season back to the historical board', () => {
    /*
     * Both paths would be correct on a closed season, and the historical one
     * reconciles against `lib/stats/luck.ts` on every run. Two paths answering
     * for one season is how two answers start.
     */
    expect(seasonToDateBoard(2026, season2026({ weeks: 14, finalized: true }))).toBeNull();
  });

  it('drops a week whole when a roster resolves to nobody', () => {
    const short = new Map(SEATS_2026);
    short.delete(10);

    const board = seasonToDateBoard(2026, season2026({ weeks: 6, roster: short }));

    // Every week loses its unattributable game, so every week goes.
    expect(board).toBeNull();
  });

  it('drops a disputed week whole rather than the disputed game', () => {
    const board = seasonToDateBoard(2026, season2026({ weeks: 6, disputed: [3] }));

    expect(board?.excludedWeeks).toEqual([3]);
    expect(board?.weeksCounted).toBe(5);
    for (const line of board?.lines ?? []) {
      expect(line.stamp.conditions.find((entry) => entry.condition === 'sample')?.detail).toContain(
        '5 games played',
      );
    }
  });

  it('reports nothing for a season that is not there', () => {
    expect(
      seasonToDateBoard(2026, {
        found: false,
        finalized: false,
        finalizedAt: null,
        weekFinalizedAt: new Map(),
        rows: [],
        roster: new Map(),
      }),
    ).toBeNull();
  });

  it('carries the computed-not-played disclaimer, exactly as the historical board does', () => {
    expect(seasonToDateBoard(2026, season2026({ weeks: 5 }))?.disclaimer).toBe(
      ALL_PLAY_DISCLAIMER,
    );
  });
});
