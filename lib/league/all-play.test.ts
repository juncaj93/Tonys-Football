import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { scanEditorialCopy } from '@/lib/slice/validate';
import { buildEraGame, type EraGame, type TrackedEra } from '@/lib/stats/era';
import { playEveryoneRecord } from '@/lib/stats/luck';
import { type StoredWeekGame } from '@/lib/stats/week';

import {
  allPlayTable,
  ALL_PLAY_DISCLAIMER,
  fraudBoard,
  fraudStamp,
  FRAUD_THRESHOLDS,
  formatRecord,
  LEAGUE_TEAMS,
  OPPONENTS_PER_WEEK,
  pct,
  signed,
  type AllPlayGame,
} from './all-play';

/**
 * The ten-team all-play calculation.
 *
 * Every case here is built from **whole ten-team weeks of stored scores**
 * rather than from tallies typed in by hand, because the two mistakes this
 * layer can actually make are both invisible in a tally: counting a manager
 * against the wrong field, and counting a week for some managers and not
 * others. A fixture that asserts `18-27` proves nothing about either.
 */

/* ------------------------------------------------------------------------- */
/* A ten-team league, by hand                                                */
/* ------------------------------------------------------------------------- */

const SEATS = [
  { managerId: 'alex', displayName: 'Alex' },
  { managerId: 'nathan', displayName: 'Nathan' },
  { managerId: 'ryan', displayName: 'Ryan' },
  { managerId: 'zack', displayName: 'Zack' },
  { managerId: 'nick', displayName: 'Nick' },
  { managerId: 'dan', displayName: 'Dan' },
  { managerId: 'mike', displayName: 'Mike' },
  { managerId: 'joe', displayName: 'Joe' },
  { managerId: 'sam', displayName: 'Sam' },
  { managerId: 'pete', displayName: 'Pete' },
] as const;

/** The default pairing: seat 0 plays seat 1, seat 2 plays seat 3, and so on. */
const DEFAULT_PAIRS: readonly (readonly [number, number])[] = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  [8, 9],
];

/**
 * One week of stored games.
 *
 * `points` is indexed by seat, so a week is written as the ten scores it
 * actually held and the schedule is a separate, visible choice — which is the
 * whole subject of this file.
 */
function week(
  number_: number,
  points: readonly number[],
  pairs: readonly (readonly [number, number])[] = DEFAULT_PAIRS,
): readonly AllPlayGame[] {
  return pairs.map(([left, right]) => ({
    week: number_,
    a: {
      managerId: SEATS[left]?.managerId ?? '',
      displayName: SEATS[left]?.displayName ?? '',
      pointsCents: Math.round((points[left] ?? 0) * 100),
    },
    b: {
      managerId: SEATS[right]?.managerId ?? '',
      displayName: SEATS[right]?.displayName ?? '',
      pointsCents: Math.round((points[right] ?? 0) * 100),
    },
  }));
}

/** Seat 0 lowest, seat 9 highest, ten points apart. */
const ASCENDING = [100, 110, 120, 130, 140, 150, 160, 170, 180, 190];
/** The same week upside down. */
const DESCENDING = [...ASCENDING].reverse();

const lineFor = (table: ReturnType<typeof allPlayTable>, managerId: string) =>
  table.lines.find((line) => line.managerId === managerId);

/* ------------------------------------------------------------------------- */
/* The ten-team shape                                                        */
/* ------------------------------------------------------------------------- */

describe('the ten-team shape', () => {
  it('gives every manager exactly nine comparisons a week', () => {
    const table = allPlayTable([...week(1, ASCENDING), ...week(2, DESCENDING)]);

    expect(OPPONENTS_PER_WEEK).toBe(9);
    expect(LEAGUE_TEAMS).toBe(10);
    expect(table.lines).toHaveLength(10);

    for (const line of table.lines) {
      expect(line.weeksCounted).toBe(2);
      expect(line.comparisons).toBe(2 * OPPONENTS_PER_WEEK);
      expect(line.allPlayWins + line.allPlayLosses + line.allPlayTies).toBe(18);
    }

    expect(table.integrity.fullField).toBe(true);
    expect(table.integrity.comparisonsExact).toBe(true);
    expect(table.integrity.faults).toEqual([]);
  });

  it('counts a score against every other score in its week and nothing else', () => {
    const table = allPlayTable(week(1, ASCENDING));

    // Highest score in the week beats all nine, lowest loses to all nine.
    expect(lineFor(table, 'pete')?.allPlayWins).toBe(9);
    expect(lineFor(table, 'pete')?.allPlayLosses).toBe(0);
    expect(lineFor(table, 'alex')?.allPlayWins).toBe(0);
    expect(lineFor(table, 'alex')?.allPlayLosses).toBe(9);

    // Fifth-lowest of ten beats four and loses to five.
    expect(lineFor(table, 'nick')?.allPlayWins).toBe(4);
    expect(lineFor(table, 'nick')?.allPlayLosses).toBe(5);
  });

  it('reads a matched score as a tie on both sides of the comparison', () => {
    const tied = [140, 140, 120, 130, 100, 150, 160, 170, 180, 190];
    const table = allPlayTable(week(1, tied));

    const alex = lineFor(table, 'alex');
    expect(alex?.allPlayTies).toBe(1);
    expect(alex?.allPlayWins).toBe(3);
    expect(alex?.allPlayLosses).toBe(5);
    // Seats 0 and 1 played each other, so the real game is a tie too.
    expect(formatRecord(alex?.wins ?? 0, alex?.losses ?? 0, alex?.ties ?? 0)).toBe('0-0-1');
    // A tie is half a win on both axes, so nine comparisons still balance.
    expect(alex?.allPlayWinPct).toBeCloseTo(3.5 / 9, 4);
  });

  it('leaves a week that did not field the whole league out whole, and says so', () => {
    const short = week(2, ASCENDING, [
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 7],
    ]);
    const table = allPlayTable([...week(1, ASCENDING), ...short]);

    expect(table.countedWeeks).toEqual([1]);
    expect(table.excludedWeeks).toEqual([2]);
    expect(table.weeks.find((entry) => entry.week === 2)?.excludedBecause).toBe('short-field');
    expect(table.integrity.fullField).toBe(false);
    expect(table.integrity.faults.join(' ')).toContain('week 2 fielded 8 of 10 teams');

    // The eight who did play week 2 are not measured on it either — which is
    // the entire point of dropping the week rather than the game.
    for (const line of table.lines) {
      expect(line.weeksCounted).toBe(1);
      expect(line.comparisons).toBe(OPPONENTS_PER_WEEK);
    }
    expect(table.integrity.comparisonsExact).toBe(true);
  });

  it('refuses a week where one manager holds two seats', () => {
    const doubled = week(1, ASCENDING, [
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 7],
      [8, 0],
    ]);
    const table = allPlayTable(doubled);

    expect(table.weeks[0]?.excludedBecause).toBe('duplicate-seat');
    expect(table.countedWeeks).toEqual([]);
    expect(table.lines).toEqual([]);
  });

  it('drops a week the caller has already ruled uncountable, whole', () => {
    const table = allPlayTable([...week(1, ASCENDING), ...week(2, DESCENDING)], {
      excludedWeeks: [2],
    });

    expect(table.countedWeeks).toEqual([1]);
    expect(table.excludedWeeks).toEqual([2]);
    // Ruled out by the caller, not malformed — so it is not a fault.
    expect(table.integrity.fullField).toBe(true);
    expect(table.integrity.faults).toEqual([]);
    expect(lineFor(table, 'alex')?.comparisons).toBe(OPPONENTS_PER_WEEK);
  });
});

/* ------------------------------------------------------------------------- */
/* The two records                                                           */
/* ------------------------------------------------------------------------- */

describe('the schedule-neutral record', () => {
  /*
   * Alex posts the second-lowest score every single week and is scheduled
   * against the lowest every single week. The schedule says undefeated; the
   * scores say next to last.
   */
  const flattered = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].flatMap((number_) =>
    week(number_, [90, 80, 120, 130, 140, 150, 160, 170, 180, 190]),
  );

  it('scales the all-play rate onto the games actually played', () => {
    const table = allPlayTable(flattered);
    const alex = lineFor(table, 'alex');

    expect(alex?.wins).toBe(10);
    expect(alex?.losses).toBe(0);
    expect(alex?.gamesPlayed).toBe(10);

    // One comparison won a week — the manager scheduled beneath him.
    expect(alex?.allPlayWins).toBe(10);
    expect(alex?.allPlayLosses).toBe(80);
    expect(alex?.allPlayWinPct).toBeCloseTo(10 / 90, 4);

    expect(alex?.expectedWins).toBe(1.11);
    expect(alex?.expectedLosses).toBe(8.89);
    expect((alex?.expectedWins ?? 0) + (alex?.expectedLosses ?? 0)).toBeCloseTo(
      alex?.gamesPlayed ?? 0,
      6,
    );
    expect(alex?.scheduleDelta).toBe(8.89);
  });

  it('ranks the two records separately and reports the gap between the positions', () => {
    const table = allPlayTable(flattered);
    const alex = lineFor(table, 'alex');

    /*
     * Five managers go 10-0 in this fixture — the schedule pairs them off in
     * fixed halves — so the real ranking separates them on points for, and Alex
     * scores least of the five. The all-play ranking puts him ninth of ten.
     */
    expect(alex?.winPct).toBe(1);
    expect(alex?.realRank).toBe(5);
    expect(alex?.allPlayRank).toBe(9);
    expect(alex?.rankDelta).toBe(4);

    // Nathan is last on both counts, and nothing about him is lucky.
    const nathan = lineFor(table, 'nathan');
    expect(nathan?.realRank).toBe(10);
    expect(nathan?.allPlayRank).toBe(10);
    expect(nathan?.scheduleDelta).toBe(0);
  });

  it('shares a rank between managers whose seasons are identical', () => {
    // Two weeks, mirrored, so every seat wins one and loses one and the
    // points-for tiebreak lands on the same total for all ten.
    const table = allPlayTable([...week(1, ASCENDING), ...week(2, DESCENDING)]);

    expect(table.lines.every((line) => line.wins === 1 && line.losses === 1)).toBe(true);
    expect(table.lines.every((line) => line.realRank === 1)).toBe(true);
    expect(table.lines.every((line) => line.allPlayRank === 1)).toBe(true);
  });

  it('is deterministic', () => {
    const games = [...week(1, ASCENDING), ...week(2, DESCENDING)];
    expect(allPlayTable(games)).toEqual(allPlayTable(games));
  });

  it('reaches only as far as its last counted week, and says so', () => {
    const table = allPlayTable([...week(1, ASCENDING), ...week(2, DESCENDING)], { season: 2026 });

    expect(table.reach?.kind).toBe('season-to-date');
    expect(table.reach?.throughWeek).toBe(2);
    expect(table.reach?.label).toBe('in 2026 through week 2');
    expect(table.reach?.finalizedWeeksOnly).toBe(true);
  });

  it('reaches the whole season only when told the books are shut', () => {
    const table = allPlayTable(week(1, ASCENDING), { season: 2024, seasonFinalized: true });

    expect(table.reach?.kind).toBe('season');
    expect(table.reach?.throughWeek).toBeNull();
    expect(table.reach?.label).toBe('in the 2024 season');
  });

  it('reaches the last week it counted, not the last week it saw', () => {
    /*
     * Week 3 is dropped for a short field. A label saying `through week 3`
     * would claim a week that is not in the measurement.
     */
    const short = week(3, ASCENDING, [
      [0, 1],
      [2, 3],
    ]);
    const table = allPlayTable([...week(1, ASCENDING), ...week(2, DESCENDING), ...short], {
      season: 2026,
    });

    expect(table.excludedWeeks).toEqual([3]);
    expect(table.reach?.throughWeek).toBe(2);
  });

  it('says nothing about reach when no season was named', () => {
    expect(allPlayTable(week(1, ASCENDING)).reach).toBeNull();
  });

  it('carries the computed-not-played disclaimer on the table', () => {
    expect(allPlayTable(week(1, ASCENDING)).disclaimer).toBe(ALL_PLAY_DISCLAIMER);
  });

  it('returns an empty table rather than a league of 0-0 records', () => {
    const table = allPlayTable([]);
    expect(table.lines).toEqual([]);
    expect(table.countedWeeks).toEqual([]);
    expect(table.integrity.faults).toEqual([]);
  });
});

/* ------------------------------------------------------------------------- */
/* Agreement with the approved neutral measurement                           */
/* ------------------------------------------------------------------------- */

describe('agreement with lib/stats/luck.ts', () => {
  /*
   * There must not be two all-play answers in this product.
   *
   * `playEveryoneRecord` is the approved derivation over a loaded era and this
   * file's calculation is the same arithmetic over raw games. They are separate
   * code paths on purpose — one is fed by the database, one is pure — so this
   * runs the same ten-team season through both and insists the numbers match.
   * The day the formulas diverge, this goes red rather than the board quietly
   * carrying two different truths.
   */
  const POINTS: readonly (readonly number[])[] = [
    [90, 80, 120, 130, 140, 150, 160, 170, 180, 190],
    [101, 99, 143, 122, 137, 168, 155, 174, 181, 118],
    [112, 88, 131, 150, 129, 146, 163, 109, 177, 192],
  ];

  const games = POINTS.flatMap((points, index) => week(index + 1, points));

  function era(): TrackedEra {
    const seats = new Map(
      SEATS.map((seat, index) => [
        index + 1,
        { userId: seat.managerId, displayName: seat.displayName },
      ]),
    );

    const rows: EraGame[] = games.map((game, index) => {
      const rosterA = SEATS.findIndex((seat) => seat.managerId === game.a.managerId) + 1;
      const rosterB = SEATS.findIndex((seat) => seat.managerId === game.b.managerId) + 1;
      const stored: StoredWeekGame = {
        week: game.week,
        weekType: 'regular',
        sleeperMatchupId: index + 1,
        rosterAId: rosterA,
        rosterBId: rosterB,
        pointsACents: game.a.pointsCents,
        pointsBCents: game.b.pointsCents,
        winnerRosterId:
          game.a.pointsCents === game.b.pointsCents
            ? null
            : game.a.pointsCents > game.b.pointsCents
              ? rosterA
              : rosterB,
        marginCents: Math.abs(game.a.pointsCents - game.b.pointsCents),
        disputed: false,
      };
      return buildEraGame({ season: 2026, row: stored, roster: seats, playoffRosters: new Set() });
    });

    return {
      seasons: [2026],
      games: rows,
      managers: new Map(
        SEATS.map((seat) => [
          seat.managerId,
          { id: seat.managerId, displayName: seat.displayName, seasons: [2026] },
        ]),
      ),
      champions: new Map(),
      runnersUp: new Map(),
      finalRanks: new Map(),
    };
  }

  it('produces the same two records and the same subtraction', () => {
    const neutral = playEveryoneRecord(era(), { season: 2026 });
    const table = allPlayTable(games);

    expect(neutral).not.toBeNull();
    expect(neutral?.lines).toHaveLength(10);

    for (const line of neutral?.lines ?? []) {
      const mine = lineFor(table, line.managerId);
      expect(mine).toBeDefined();
      expect(mine?.wins).toBe(line.actualWins);
      expect(mine?.losses).toBe(line.actualLosses);
      expect(mine?.ties).toBe(line.actualTies);
      expect(mine?.allPlayWins).toBe(line.playEveryoneWins);
      expect(mine?.allPlayLosses).toBe(line.playEveryoneLosses);
      expect(mine?.allPlayTies).toBe(line.playEveryoneTies);
      expect(mine?.scheduleDelta).toBe(line.scheduleDelta);
      expect(mine?.pointsFor).toBeCloseTo(line.pointsFor, 6);
    }
  });

  it('recomputes the same subtraction inside the stamp', () => {
    const neutral = playEveryoneRecord(era(), { season: 2026 });

    for (const line of neutral?.lines ?? []) {
      const stamp = fraudStamp({
        wins: line.actualWins,
        losses: line.actualLosses,
        ties: line.actualTies,
        allPlayWins: line.playEveryoneWins,
        allPlayLosses: line.playEveryoneLosses,
        allPlayTies: line.playEveryoneTies,
      });
      expect(stamp.scheduleDelta).toBe(line.scheduleDelta);
    }
  });
});

/* ------------------------------------------------------------------------- */
/* The stamp                                                                 */
/* ------------------------------------------------------------------------- */

describe('fraudStamp', () => {
  /** 10-0 on the schedule, next to last on the scores. */
  const flattered = {
    wins: 10,
    losses: 0,
    ties: 0,
    allPlayWins: 10,
    allPlayLosses: 80,
    allPlayTies: 0,
  };

  it('hangs the sign when all four conditions are met', () => {
    const stamp = fraudStamp(flattered);

    expect(stamp.label).toBe('FRAUD ALERT');
    expect(stamp.materiallyLucky).toBe(true);
    expect(stamp.conditions.every((entry) => entry.met)).toBe(true);
    expect(stamp.scheduleDelta).toBe(8.89);
    expect(stamp.expectedWins).toBe(1.11);
  });

  /*
   * The case the old inline rule got wrong.
   *
   * A gap is large whenever the scores were poor, so a bare
   * `games >= 5 && delta >= 2` stamps a manager whose record nobody would call
   * strong. Three wins in six games is not fraud, it is a .500 season.
   */
  it('refuses a large gap when the real record is not strong', () => {
    const mediocre = {
      wins: 3,
      losses: 3,
      ties: 0,
      allPlayWins: 3,
      allPlayLosses: 51,
      allPlayTies: 0,
    };
    const stamp = fraudStamp(mediocre);

    // The old rule would have fired: enough games, and a gap over two wins.
    expect(mediocre.wins + mediocre.losses).toBeGreaterThanOrEqual(
      FRAUD_THRESHOLDS.minimumGames,
    );
    expect(stamp.scheduleDelta).toBeGreaterThanOrEqual(FRAUD_THRESHOLDS.minimumScheduleDelta);

    expect(stamp.label).toBeNull();
    expect(stamp.conditions.find((entry) => entry.condition === 'real-record')?.met).toBe(false);
  });

  it('refuses a strong record whose scores earned it', () => {
    const earned = {
      wins: 10,
      losses: 0,
      ties: 0,
      allPlayWins: 80,
      allPlayLosses: 10,
      allPlayTies: 0,
    };
    const stamp = fraudStamp(earned);

    expect(stamp.label).toBeNull();
    expect(stamp.conditions.find((entry) => entry.condition === 'all-play-record')?.met).toBe(
      false,
    );
    expect(stamp.scheduleDelta).toBe(1.11);
  });

  it('refuses a sample too small to mean anything', () => {
    const early = {
      wins: 4,
      losses: 0,
      ties: 0,
      allPlayWins: 4,
      allPlayLosses: 32,
      allPlayTies: 0,
    };
    const stamp = fraudStamp(early);

    expect(stamp.label).toBeNull();
    expect(stamp.conditions.find((entry) => entry.condition === 'sample')?.met).toBe(false);
    // Everything else about the season would have qualified.
    expect(
      stamp.conditions.filter((entry) => entry.condition !== 'sample').every((e) => e.met),
    ).toBe(true);
  });

  it('refuses a gap too small to be worth a sign', () => {
    // A poor all-play record and a modest real one: below the gap threshold.
    const slight = {
      wins: 6,
      losses: 4,
      ties: 0,
      allPlayWins: 40,
      allPlayLosses: 50,
      allPlayTies: 0,
    };
    const stamp = fraudStamp(slight);

    expect(stamp.scheduleDelta).toBeLessThan(FRAUD_THRESHOLDS.minimumScheduleDelta);
    expect(stamp.label).toBeNull();
    expect(stamp.conditions.find((entry) => entry.condition === 'schedule-gap')?.met).toBe(false);
  });

  it('never stamps an empty season', () => {
    const stamp = fraudStamp({
      wins: 0,
      losses: 0,
      ties: 0,
      allPlayWins: 0,
      allPlayLosses: 0,
      allPlayTies: 0,
    });

    expect(stamp.label).toBeNull();
    expect(stamp.scheduleDelta).toBe(0);
    expect(stamp.expectedWins).toBe(0);
  });

  it('always reports all four conditions, met or not', () => {
    for (const input of [flattered, { ...flattered, wins: 1, losses: 9 }]) {
      const stamp = fraudStamp(input);
      expect(stamp.conditions.map((entry) => entry.condition)).toEqual([
        'sample',
        'real-record',
        'all-play-record',
        'schedule-gap',
      ]);
    }
  });
});

describe('fraudBoard', () => {
  it('reads loudest schedule first and stamps only the manager who earned it', () => {
    const games = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].flatMap((number_) =>
      week(number_, [90, 80, 120, 130, 140, 150, 160, 170, 180, 190]),
    );
    const board = fraudBoard(allPlayTable(games));

    expect(board[0]?.managerId).toBe('alex');
    expect(board[0]?.stamp.label).toBe('FRAUD ALERT');

    /*
     * Five managers finish 10-0 here and only two are stamped. Dan is the case
     * that matters: a perfect record and a schedule gap of four and a half
     * wins, and no sign — because his all-play record is a winning one. The gap
     * alone was never the question.
     */
    expect(board.filter((row) => row.stamp.label !== null).map((row) => row.managerId)).toEqual([
      'alex',
      'zack',
    ]);
    const dan = board.find((row) => row.managerId === 'dan');
    expect(dan?.wins).toBe(10);
    expect(dan?.scheduleDelta).toBeGreaterThan(FRAUD_THRESHOLDS.minimumScheduleDelta);
    expect(dan?.stamp.label).toBeNull();
    expect(board.map((row) => row.scheduleDelta)).toEqual(
      [...board.map((row) => row.scheduleDelta)].sort((left, right) => right - left),
    );
  });
});

/* ------------------------------------------------------------------------- */
/* Presentation                                                              */
/* ------------------------------------------------------------------------- */

describe('formatting', () => {
  it('writes a record the way a league writes one', () => {
    expect(formatRecord(9, 5, 0)).toBe('9-5');
    expect(formatRecord(9, 4, 1)).toBe('9-4-1');
  });

  it('always signs the schedule gap, to two places', () => {
    expect(signed(2.6)).toBe('+2.60');
    expect(signed(-0.4)).toBe('-0.40');
    expect(signed(0)).toBe('+0.00');
  });

  it('writes a rate in the three-place football form', () => {
    expect(pct(0.6)).toBe('.600');
    expect(pct(1)).toBe('1.000');
    expect(pct(0)).toBe('.000');
  });
});

/* ------------------------------------------------------------------------- */
/* The words                                                                 */
/* ------------------------------------------------------------------------- */

describe('the words it prints', () => {
  /*
   * `expected wins` is banned prose — `lib/slice/validate.ts` refuses it
   * because it implies a projection model this product does not have. The
   * fields carry the conventional name; the sentences must not. This runs the
   * product's own validator over every string the library can produce, so the
   * ban is enforced by the same scanner the paper uses rather than by anyone
   * remembering.
   */
  function everyString(): readonly string[] {
    const games = [1, 2, 3, 4, 5].flatMap((number_) =>
      week(number_, [90, 80, 120, 130, 140, 150, 160, 170, 180, 190]),
    );
    const short = week(6, ASCENDING, [
      [0, 1],
      [2, 3],
    ]);
    const table = allPlayTable([...games, ...short]);
    const board = fraudBoard(table);

    return [
      table.disclaimer,
      ...table.integrity.faults,
      ...board.flatMap((row) => [
        row.stamp.caveat,
        ...row.stamp.conditions.map((entry) => entry.detail),
      ]),
    ];
  }

  it('produces no sentence the Slice validator would refuse', () => {
    const strings = everyString();
    expect(strings.length).toBeGreaterThan(10);

    for (const text of strings) {
      expect({ text, violations: scanEditorialCopy(text) }).toEqual({ text, violations: [] });
    }
  });

  it('never writes the banned projection phrase, in any casing', () => {
    for (const text of everyString()) {
      expect(text).not.toMatch(/expected wins?/i);
    }
  });
});

/* ------------------------------------------------------------------------- */
/* Calibration, against the recorded league                                  */
/* ------------------------------------------------------------------------- */

/**
 * The thresholds, against the seasons this league actually played.
 *
 * The 2026-08-10 **R1** ruling is the standing principle behind this block: a
 * significance threshold is deterministic, documented, and **calibrated against
 * the actual verified league distribution** — and a word like *fraud* has to
 * identify a meaningfully unusual outcome rather than half the league.
 *
 * So this reads the recorded 2024 and 2025 matchups off disk and runs the real
 * regular seasons through the calculation. It needs no database and no network:
 * `fixtures/sleeper/` is the recorded archive the deploy seed itself reads.
 *
 * It is not a second derivation. `agreement with lib/stats/luck.ts` above pins
 * the arithmetic; this pins the **numbers on the dial**, and it exists so that
 * moving one has to face what it does to two real seasons.
 */
describe('calibration against the recorded seasons', () => {
  const ROOT = path.join(process.cwd(), 'fixtures', 'sleeper', 'league');

  interface RecordedSeason {
    readonly season: number;
    readonly games: readonly AllPlayGame[];
  }

  function recordedSeasons(): readonly RecordedSeason[] {
    const seasons: RecordedSeason[] = [];

    for (const leagueId of readdirSync(ROOT).sort()) {
      const dir = path.join(ROOT, leagueId);
      if (!existsSync(path.join(dir, 'matchups'))) continue;

      const league = JSON.parse(readFileSync(path.join(dir, 'league.json'), 'utf8')) as {
        season: string;
        settings: { playoff_week_start: number };
      };
      const users = JSON.parse(readFileSync(path.join(dir, 'users.json'), 'utf8')) as {
        user_id: string;
        display_name: string;
      }[];
      const rosters = JSON.parse(readFileSync(path.join(dir, 'rosters.json'), 'utf8')) as {
        roster_id: number;
        owner_id: string;
      }[];

      const nameOf = new Map(users.map((user) => [user.user_id, user.display_name]));
      const seat = new Map(
        rosters.map((roster) => [
          roster.roster_id,
          {
            managerId: roster.owner_id,
            displayName: nameOf.get(roster.owner_id) ?? roster.owner_id,
          },
        ]),
      );

      const games: AllPlayGame[] = [];
      for (const file of readdirSync(path.join(dir, 'matchups')).sort()) {
        const weekNumber = Number(file.replace('.json', ''));
        // Regular season only, and never a week nobody has played.
        if (weekNumber >= league.settings.playoff_week_start) continue;
        const rows = JSON.parse(readFileSync(path.join(dir, 'matchups', file), 'utf8')) as {
          matchup_id: number;
          roster_id: number;
          points: number;
        }[];
        if (rows.reduce((sum, row) => sum + (row.points ?? 0), 0) === 0) continue;

        const byMatchup = new Map<number, { roster_id: number; points: number }[]>();
        for (const row of rows) {
          byMatchup.set(row.matchup_id, [...(byMatchup.get(row.matchup_id) ?? []), row]);
        }
        for (const pair of byMatchup.values()) {
          const [left, right] = pair;
          if (left === undefined || right === undefined) continue;
          games.push({
            week: weekNumber,
            a: { ...seat.get(left.roster_id)!, pointsCents: Math.round(left.points * 100) },
            b: { ...seat.get(right.roster_id)!, pointsCents: Math.round(right.points * 100) },
          });
        }
      }

      seasons.push({ season: Number(league.season), games });
    }

    return seasons;
  }

  const seasons = recordedSeasons();

  it('finds two complete recorded seasons to calibrate against', () => {
    expect(seasons.map((entry) => entry.season)).toEqual([2024, 2025]);
  });

  it('holds the ten-team shape on real data', () => {
    for (const { games } of seasons) {
      const table = allPlayTable(games);

      expect(table.integrity.faults).toEqual([]);
      expect(table.integrity.fullField).toBe(true);
      expect(table.integrity.comparisonsExact).toBe(true);
      expect(table.lines).toHaveLength(10);
      expect(table.countedWeeks).toHaveLength(14);

      for (const line of table.lines) {
        expect(line.gamesPlayed).toBe(14);
        expect(line.comparisons).toBe(14 * OPPONENTS_PER_WEEK);
      }
    }
  });

  it('averages exactly .500 across the field, which is why .500 is the threshold', () => {
    for (const { games } of seasons) {
      const table = allPlayTable(games);
      const wins = table.lines.reduce((sum, line) => sum + line.allPlayWins, 0);
      const total = table.lines.reduce((sum, line) => sum + line.comparisons, 0);

      expect(wins * 2).toBe(total);
      expect(FRAUD_THRESHOLDS.poorAllPlayWinPct).toBe(0.5);
    }
  });

  it('stamps one manager across two seasons, and it is the right one', () => {
    const stamped = seasons.flatMap(({ season, games }) =>
      fraudBoard(allPlayTable(games))
        .filter((row) => row.stamp.label !== null)
        .map((row) => ({ season, displayName: row.displayName })),
    );

    // Rare enough to mean something. A sign on half the league is not a joke.
    expect(stamped).toHaveLength(1);
    expect(stamped[0]?.season).toBe(2024);

    const board = fraudBoard(allPlayTable(seasons[0]?.games ?? []));
    const fraud = board.find((row) => row.displayName === stamped[0]?.displayName);

    /*
     * 9-5, with exactly one manager in the league winning more games — and
     * seventh of ten on the scores. That divergence is the whole joke.
     *
     * `realRank` reads 5 rather than 2 because four managers finished 9-5 and
     * the real ranking separates equal records on points for, where this one
     * comes last of the four. The record is what the standings show, so the
     * record is what the assertion is about.
     */
    expect(fraud?.wins).toBe(9);
    expect(fraud?.losses).toBe(5);
    expect(board.filter((row) => row.wins > (fraud?.wins ?? 0))).toHaveLength(1);
    expect(fraud?.allPlayRank).toBe(7);
    expect(fraud?.allPlayWinPct).toBeLessThan(0.5);
    expect(fraud?.realRank).toBe(5);
  });

  it('refuses the season the old rule got wrong', () => {
    /*
     * 2024's 11-3 manager clears the old `games >= 5 && delta >= 2` rule with a
     * schedule gap of 2.56 — and posts an all-play record of 76-50. A winning
     * record against the whole league is not a fraud, and this is the case that
     * moved the decision out of an inline conditional.
     */
    const board = fraudBoard(allPlayTable(seasons[0]?.games ?? []));
    const best = board.find((row) => row.wins === 11);

    expect(best?.allPlayWins).toBe(76);
    expect(best?.allPlayLosses).toBe(50);
    expect(best?.scheduleDelta).toBeGreaterThanOrEqual(FRAUD_THRESHOLDS.minimumScheduleDelta);
    expect(best?.stamp.label).toBeNull();
    expect(best?.stamp.conditions.find((entry) => entry.condition === 'all-play-record')?.met).toBe(
      false,
    );
  });

  it('leaves 2025 unstamped, and the largest gap in it short of the line', () => {
    const board = fraudBoard(allPlayTable(seasons[1]?.games ?? []));

    expect(board.every((row) => row.stamp.label === null)).toBe(true);
    expect(board[0]?.scheduleDelta).toBeLessThan(FRAUD_THRESHOLDS.minimumScheduleDelta);
  });
});
