import { describe, expect, it } from 'vitest';

import { buildEraGame, type EraGame, type TrackedEra } from './era';
import {
  allSeries,
  championshipMeetings,
  explain,
  headToHead,
  MIN_SERIES_MEETINGS,
  publishableHistory,
  recordBook,
  seasonStreaks,
} from './history';
import { playEveryoneRecord } from './luck';
import { type StoredWeekGame } from './week';

/**
 * The historical layer, over eras this file builds by hand.
 *
 * `history.integration.test.ts` runs the same code against the recorded 2024 and
 * 2025 seasons and pins the real numbers. These are the cases the archive does
 * not contain — a tie, a shared record, a two-meeting series, a consolation game
 * mistaken for a playoff one — and the near-negatives, which are the ones that
 * matter: every derivation here is a min, a max or a count, so the way it fails
 * is by counting the wrong population rather than by arithmetic.
 *
 * Games are built through {@link buildEraGame}, the same function the loader
 * uses, so stage classification and countability are exercised rather than
 * asserted into existence.
 */

/* ------------------------------------------------------------------------- */
/* An era, by hand                                                           */
/* ------------------------------------------------------------------------- */

const SEATS = new Map<number, { userId: string; displayName: string }>([
  [1, { userId: 'alex', displayName: 'Alex' }],
  [2, { userId: 'nathan', displayName: 'Nathan' }],
  [3, { userId: 'ryan', displayName: 'Ryan' }],
  [4, { userId: 'gone', displayName: 'Berardo' }],
]);

interface GameSpec {
  readonly season: number;
  readonly week: number;
  readonly weekType?: 'regular' | 'playoff';
  readonly matchupId?: number;
  readonly a: readonly [number, number];
  readonly b: readonly [number, number];
  readonly disputed?: boolean;
}

function stored(spec: GameSpec): StoredWeekGame {
  const [rosterAId, pointsA] = spec.a;
  const [rosterBId, pointsB] = spec.b;
  const pointsACents = Math.round(pointsA * 100);
  const pointsBCents = Math.round(pointsB * 100);
  return {
    week: spec.week,
    weekType: spec.weekType ?? 'regular',
    sleeperMatchupId: spec.matchupId ?? rosterAId,
    rosterAId,
    rosterBId,
    pointsACents,
    pointsBCents,
    winnerRosterId:
      pointsACents === pointsBCents ? null : pointsACents > pointsBCents ? rosterAId : rosterBId,
    marginCents: Math.abs(pointsACents - pointsBCents),
    disputed: spec.disputed ?? false,
  };
}

function makeEra(input: {
  readonly games: readonly GameSpec[];
  readonly playoffRosters?: readonly number[];
  /** Season → manager id → placement. */
  readonly finalRanks?: Readonly<Record<number, Readonly<Record<string, number>>>>;
  readonly seats?: ReadonlyMap<number, { userId: string; displayName: string }>;
}): TrackedEra {
  const seats = input.seats ?? SEATS;
  const playoffRosters = new Set(input.playoffRosters ?? []);

  const games: EraGame[] = input.games.map((spec) =>
    buildEraGame({ season: spec.season, row: stored(spec), roster: seats, playoffRosters }),
  );

  const seasons = [...new Set(input.games.map((spec) => spec.season))].sort((a, b) => a - b);

  const finalRanks = new Map<number, ReadonlyMap<string, number>>();
  const champions = new Map<number, string>();
  const runnersUp = new Map<number, string>();
  for (const [year, ranks] of Object.entries(input.finalRanks ?? {})) {
    const season = Number(year);
    finalRanks.set(season, new Map(Object.entries(ranks)));
    for (const [managerId, rank] of Object.entries(ranks)) {
      if (rank === 1) champions.set(season, managerId);
      if (rank === 2) runnersUp.set(season, managerId);
    }
  }

  return {
    seasons,
    games: games.sort(
      (x, y) => x.season - y.season || x.week - y.week || x.sleeperMatchupId - y.sleeperMatchupId,
    ),
    managers: new Map(
      [...seats.values()].map((seat) => [
        seat.userId,
        { id: seat.userId, displayName: seat.displayName, seasons },
      ]),
    ),
    champions,
    runnersUp,
    finalRanks,
  };
}

/* ------------------------------------------------------------------------- */
/* Head to head                                                              */
/* ------------------------------------------------------------------------- */

describe('headToHead', () => {
  const era = makeEra({
    games: [
      { season: 2024, week: 1, a: [1, 120], b: [2, 100] },
      { season: 2024, week: 8, a: [1, 90], b: [2, 130] },
      { season: 2025, week: 3, a: [2, 110], b: [1, 115] },
    ],
  });

  it('counts a series and orients it on the manager asked about', () => {
    const alex = headToHead(era, { managerId: 'alex', opponentId: 'nathan' });
    expect(alex?.meetings).toBe(3);
    expect(alex?.wins).toBe(2);
    expect(alex?.losses).toBe(1);
    expect(alex?.ties).toBe(0);
    expect(alex?.pointsFor).toBeCloseTo(325, 6);
    expect(alex?.pointsAgainst).toBeCloseTo(340, 6);
  });

  it('is the same series from either side, under the same id', () => {
    const alex = headToHead(era, { managerId: 'alex', opponentId: 'nathan' })!;
    const nathan = headToHead(era, { managerId: 'nathan', opponentId: 'alex' })!;

    expect(nathan.id).toBe(alex.id);
    expect(nathan.wins).toBe(alex.losses);
    expect(nathan.losses).toBe(alex.wins);
    expect(nathan.sourceGameKeys).toEqual(alex.sourceGameKeys);
  });

  it('returns null when they have never met — which is not a 0-0 record', () => {
    expect(headToHead(era, { managerId: 'alex', opponentId: 'ryan' })).toBeNull();
    expect(headToHead(era, { managerId: 'alex', opponentId: 'alex' })).toBeNull();
  });

  it('carries the era scope, not the seasons they happened to meet in', () => {
    const series = headToHead(era, { managerId: 'alex', opponentId: 'nathan' })!;
    expect(series.scope.kind).toBe('tracked-era');
    expect(series.scope.label).toBe('since 2024');
    expect(series.scope.observations).toBe(3);
  });

  it(`is thin-basis under ${String(MIN_SERIES_MEETINGS)} meetings and verified at it`, () => {
    // The boundary itself, both sides. A change to MIN_SERIES_MEETINGS moves one
    // of these two assertions, which is the point of asserting at the edge.
    const two = makeEra({
      games: [
        { season: 2024, week: 1, a: [1, 120], b: [2, 100] },
        { season: 2024, week: 8, a: [1, 90], b: [2, 130] },
      ],
    });
    expect(headToHead(two, { managerId: 'alex', opponentId: 'nathan' })?.support).toBe(
      'thin-basis',
    );
    expect(headToHead(era, { managerId: 'alex', opponentId: 'nathan' })?.support).toBe('verified');
  });

  it('drops a disputed meeting from the record and reports the count', () => {
    const disputed = makeEra({
      games: [
        { season: 2024, week: 1, a: [1, 120], b: [2, 100] },
        { season: 2024, week: 8, a: [1, 90], b: [2, 130] },
        { season: 2024, week: 13, a: [1, 131], b: [2, 130], disputed: true },
      ],
    });

    const series = headToHead(disputed, { managerId: 'alex', opponentId: 'nathan' })!;
    // 1-1, not 2-1: the disputed win is not counted for anybody.
    expect(series.meetings).toBe(2);
    expect(series.wins).toBe(1);
    expect(series.losses).toBe(1);
    expect(series.disputedMeetings).toBe(1);
    expect(series.support).toBe('partial');
    expect(series.sourceGameKeys).not.toContain('2024-w13-m1');
    expect(series.evidence.join(' ')).toContain('16 §12');
  });

  it('separates a bracket meeting from a consolation game in the same week', () => {
    const playoffs = makeEra({
      games: [
        // Both in the bracket: a real playoff meeting.
        { season: 2024, week: 16, weekType: 'playoff', matchupId: 1, a: [1, 140], b: [2, 120] },
        // Neither in the bracket: the consolation side of the same week.
        { season: 2024, week: 16, weekType: 'playoff', matchupId: 2, a: [3, 100], b: [4, 90] },
      ],
      playoffRosters: [1, 2],
    });

    expect(
      headToHead(playoffs, { managerId: 'alex', opponentId: 'nathan' })?.bracketMeetings,
    ).toBe(1);
    expect(headToHead(playoffs, { managerId: 'ryan', opponentId: 'gone' })?.bracketMeetings).toBe(
      0,
    );
    // Still a counted meeting — it happened. It is just not a playoff one.
    expect(headToHead(playoffs, { managerId: 'ryan', opponentId: 'gone' })?.meetings).toBe(1);
  });

  it('finds the widest, the closest and the most recent meeting', () => {
    const series = headToHead(era, { managerId: 'alex', opponentId: 'nathan' })!;
    expect(series.widest?.margin).toBe(40);
    expect(series.closest?.margin).toBe(5);
    expect(series.mostRecent?.season).toBe(2025);
    expect(series.mostRecent?.week).toBe(3);
  });

  it('counts a tie as a tie in a series', () => {
    const tied = makeEra({
      games: [
        { season: 2024, week: 1, a: [1, 100], b: [2, 100] },
        { season: 2024, week: 2, a: [1, 120], b: [2, 100] },
      ],
    });
    const series = headToHead(tied, { managerId: 'alex', opponentId: 'nathan' })!;
    expect(series.ties).toBe(1);
    expect(series.wins).toBe(1);
    expect(series.losses).toBe(0);
  });

  it('is deterministic — two derivations are deep-equal', () => {
    expect(headToHead(era, { managerId: 'alex', opponentId: 'nathan' })).toEqual(
      headToHead(era, { managerId: 'alex', opponentId: 'nathan' }),
    );
  });
});

describe('allSeries', () => {
  it('emits one entry per pair, never two orientations of the same one', () => {
    const era = makeEra({
      games: [
        { season: 2024, week: 1, a: [1, 120], b: [2, 100] },
        { season: 2024, week: 2, a: [2, 120], b: [1, 100] },
        { season: 2024, week: 3, a: [1, 120], b: [3, 100] },
      ],
    });

    const series = allSeries(era);
    expect(series).toHaveLength(2);
    expect(new Set(series.map((entry) => entry.id)).size).toBe(2);
    // Most meetings leads.
    expect(series[0]?.meetings).toBe(2);
  });
});

/* ------------------------------------------------------------------------- */
/* Championship meetings                                                     */
/* ------------------------------------------------------------------------- */

describe('championshipMeetings', () => {
  const era = makeEra({
    games: [
      { season: 2024, week: 17, weekType: 'playoff', matchupId: 1, a: [1, 160.68], b: [2, 157.92] },
      // Same week, both in the bracket, but third against fourth.
      { season: 2024, week: 17, weekType: 'playoff', matchupId: 2, a: [3, 130], b: [4, 120] },
    ],
    playoffRosters: [1, 2, 3, 4],
    finalRanks: { 2024: { alex: 1, nathan: 2, ryan: 3, gone: 4 } },
  });

  it('finds the game whose two participants finished first and second', () => {
    const finals = championshipMeetings(era);
    expect(finals).toHaveLength(1);
    expect(finals[0]?.championManagerId).toBe('alex');
    expect(finals[0]?.runnerUpManagerId).toBe('nathan');
    expect(finals[0]?.margin).toBeCloseTo(2.76, 6);
    expect(finals[0]?.scope.kind).toBe('season');
  });

  it('does not treat the third-place game as a final', () => {
    expect(championshipMeetings(era).map((final) => final.sourceGameKeys[0])).toEqual([
      '2024-w17-m1',
    ]);
  });

  it('sets previousChampionshipMeeting on the series, and only for the finalists', () => {
    expect(
      headToHead(era, { managerId: 'alex', opponentId: 'nathan' })?.previousChampionshipMeeting,
    ).toBe(true);
    expect(
      headToHead(era, { managerId: 'ryan', opponentId: 'gone' })?.previousChampionshipMeeting,
    ).toBe(false);
  });

  it('finds nothing when the bracket produced no placement', () => {
    const unranked = makeEra({
      games: [
        { season: 2024, week: 17, weekType: 'playoff', a: [1, 160], b: [2, 150] },
      ],
      playoffRosters: [1, 2],
    });
    expect(championshipMeetings(unranked)).toEqual([]);
  });
});

/* ------------------------------------------------------------------------- */
/* The record book                                                           */
/* ------------------------------------------------------------------------- */

describe('recordBook', () => {
  const era = makeEra({
    games: [
      { season: 2024, week: 1, matchupId: 1, a: [1, 150], b: [2, 100] },
      { season: 2024, week: 2, matchupId: 1, a: [1, 90], b: [2, 89.5] },
      { season: 2025, week: 1, matchupId: 1, a: [3, 175.25], b: [4, 60.1] },
      // A bracket game that would hold every record if the stage filter failed.
      { season: 2025, week: 16, weekType: 'playoff', matchupId: 9, a: [1, 210], b: [3, 40] },
    ],
    playoffRosters: [1, 3],
  });

  it('counts the regular season by default and excludes the bracket entirely', () => {
    const book = recordBook(era);
    const high = book.find((record) => record.kind === 'highest-team-week');
    const widest = book.find((record) => record.kind === 'widest-margin');

    expect(high?.value).toBe(175.25);
    expect(widest?.value).toBe(115.15);
    expect(high?.stages).toEqual(['regular']);
    // The 210 and the 170-point bracket margin are nowhere near it.
    expect(book.every((record) => record.value !== 210)).toBe(true);
  });

  it('answers the bracket separately, and labels which population it used', () => {
    const book = recordBook(era, { stages: ['bracket'] });
    expect(book.find((record) => record.kind === 'highest-team-week')?.value).toBe(210);
    expect(book.every((record) => record.stages.includes('bracket'))).toBe(true);
    expect(book.every((record) => record.id.includes('bracket'))).toBe(true);
    // A different id from the regular-season one, so the two cannot collide in a
    // cache and print as each other.
    expect(book[0]?.id).not.toBe(recordBook(era)[0]?.id);
  });

  it('finds the lowest score and the closest game', () => {
    const book = recordBook(era);
    expect(book.find((record) => record.kind === 'lowest-team-week')?.value).toBe(60.1);
    expect(book.find((record) => record.kind === 'closest-game')?.value).toBe(0.5);
  });

  it('reports the runner-up value, so a reader can see how close the record is', () => {
    const high = recordBook(era).find((record) => record.kind === 'highest-team-week');
    expect(high?.runnerUpValue).toBe(150);
  });

  it('names every holder when a record is shared', () => {
    const shared = makeEra({
      games: [
        { season: 2024, week: 1, matchupId: 1, a: [1, 150], b: [2, 100] },
        { season: 2024, week: 2, matchupId: 1, a: [3, 150], b: [4, 100] },
      ],
    });
    const high = recordBook(shared).find((record) => record.kind === 'highest-team-week');
    expect(high?.holders.map((holder) => holder.displayName).sort()).toEqual(['Alex', 'Ryan']);
    expect(high?.runnerUpValue).toBe(100);
  });

  it('excludes a tie from both margin records', () => {
    const tied = makeEra({
      games: [
        { season: 2024, week: 1, matchupId: 1, a: [1, 100], b: [2, 100] },
        { season: 2024, week: 2, matchupId: 1, a: [1, 120], b: [2, 100] },
      ],
    });
    const closest = recordBook(tied).find((record) => record.kind === 'closest-game');
    // 0.00 would be the answer if a tie counted. It is not a game anybody won.
    expect(closest?.value).toBe(20);
    expect(closest?.evidence.join(' ')).toContain('ties excluded');
  });

  it('excludes a disputed game and says so, marking the support partial', () => {
    const disputed = makeEra({
      games: [
        { season: 2024, week: 1, matchupId: 1, a: [1, 150], b: [2, 100] },
        // Closer than anything else, and disputed. It must not become the record.
        { season: 2024, week: 2, matchupId: 1, a: [1, 100.5], b: [2, 100], disputed: true },
        { season: 2024, week: 3, matchupId: 1, a: [1, 120], b: [2, 100] },
      ],
    });
    const closest = recordBook(disputed).find((record) => record.kind === 'closest-game');
    expect(closest?.value).toBe(20);
    expect(closest?.support).toBe('partial');
    expect(closest?.evidence.join(' ')).toContain('disputed');
  });

  it('does not mark a bracket record partial for a regular-season dispute it never touched', () => {
    const disputed = makeEra({
      games: [
        { season: 2024, week: 1, matchupId: 1, a: [1, 150], b: [2, 100] },
        { season: 2024, week: 2, matchupId: 1, a: [1, 100.5], b: [2, 100], disputed: true },
        { season: 2024, week: 16, weekType: 'playoff', matchupId: 9, a: [1, 140], b: [3, 90] },
      ],
      playoffRosters: [1, 3],
    });
    expect(recordBook(disputed, { stages: ['bracket'] }).map((record) => record.support)).toEqual([
      'verified',
      'verified',
      'verified',
      'verified',
    ]);
    expect(recordBook(disputed).every((record) => record.support === 'partial')).toBe(true);
  });

  it('returns nothing rather than a zero when the population is empty', () => {
    expect(recordBook(makeEra({ games: [] }))).toEqual([]);
    expect(recordBook(era, { stages: ['consolation'] })).toEqual([]);
  });

  it('is deterministic', () => {
    expect(recordBook(era)).toEqual(recordBook(era));
  });
});

/* ------------------------------------------------------------------------- */
/* Streaks                                                                   */
/* ------------------------------------------------------------------------- */

describe('seasonStreaks', () => {
  it('counts consecutive regular-season wins and reports the window', () => {
    const era = makeEra({
      games: [
        { season: 2024, week: 1, matchupId: 1, a: [1, 120], b: [2, 100] },
        { season: 2024, week: 2, matchupId: 1, a: [1, 120], b: [2, 100] },
        { season: 2024, week: 3, matchupId: 1, a: [1, 120], b: [2, 100] },
        { season: 2024, week: 4, matchupId: 1, a: [1, 90], b: [2, 100] },
      ],
    });
    const alex = seasonStreaks(era).find((streak) => streak.managerId === 'alex');
    expect(alex?.length).toBe(3);
    expect(alex?.startWeek).toBe(1);
    expect(alex?.endWeek).toBe(3);
    expect(alex?.scope.kind).toBe('season');
  });

  it('resets at a season boundary — `docs/DATA_AUDIT.md §15`', () => {
    const era = makeEra({
      games: [
        { season: 2024, week: 13, matchupId: 1, a: [1, 120], b: [2, 100] },
        { season: 2024, week: 14, matchupId: 1, a: [1, 120], b: [2, 100] },
        { season: 2025, week: 1, matchupId: 1, a: [1, 120], b: [2, 100] },
        { season: 2025, week: 2, matchupId: 1, a: [1, 120], b: [2, 100] },
      ],
    });
    // Two twos, never a four.
    const alex = seasonStreaks(era).filter((streak) => streak.managerId === 'alex');
    expect(alex.map((streak) => streak.length)).toEqual([2, 2]);
    expect(alex.map((streak) => streak.season).sort()).toEqual([2024, 2025]);
  });

  it('ends a run on a tie rather than extending it', () => {
    const era = makeEra({
      games: [
        { season: 2024, week: 1, matchupId: 1, a: [1, 120], b: [2, 100] },
        { season: 2024, week: 2, matchupId: 1, a: [1, 100], b: [2, 100] },
        { season: 2024, week: 3, matchupId: 1, a: [1, 120], b: [2, 100] },
      ],
    });
    expect(seasonStreaks(era).find((streak) => streak.managerId === 'alex')?.length).toBe(1);
  });

  it('skips a week the manager did not play instead of breaking the run', () => {
    const era = makeEra({
      games: [
        { season: 2024, week: 1, matchupId: 1, a: [1, 120], b: [2, 100] },
        // Week 2: Alex has no game at all.
        { season: 2024, week: 2, matchupId: 2, a: [3, 120], b: [4, 100] },
        { season: 2024, week: 3, matchupId: 1, a: [1, 120], b: [2, 100] },
      ],
    });
    expect(seasonStreaks(era).find((streak) => streak.managerId === 'alex')?.length).toBe(2);
  });

  it('ignores bracket games — a bracket run is a different claim', () => {
    const era = makeEra({
      games: [
        { season: 2024, week: 1, matchupId: 1, a: [1, 120], b: [2, 100] },
        { season: 2024, week: 16, weekType: 'playoff', matchupId: 9, a: [1, 120], b: [2, 100] },
        { season: 2024, week: 17, weekType: 'playoff', matchupId: 9, a: [1, 120], b: [2, 100] },
      ],
      playoffRosters: [1, 2],
    });
    expect(seasonStreaks(era).find((streak) => streak.managerId === 'alex')?.length).toBe(1);
  });

  it('emits nothing for a manager who never won', () => {
    const era = makeEra({
      games: [{ season: 2024, week: 1, matchupId: 1, a: [1, 120], b: [2, 100] }],
    });
    expect(seasonStreaks(era).some((streak) => streak.managerId === 'nathan')).toBe(false);
  });
});

/* ------------------------------------------------------------------------- */
/* Play-everyone                                                             */
/* ------------------------------------------------------------------------- */

describe('playEveryoneRecord', () => {
  it('compares every score against every other score in its week', () => {
    const era = makeEra({
      games: [
        { season: 2024, week: 1, matchupId: 1, a: [1, 150], b: [2, 100] },
        { season: 2024, week: 1, matchupId: 2, a: [3, 120], b: [4, 90] },
      ],
    });

    const record = playEveryoneRecord(era, { season: 2024 })!;
    const alex = record.lines.find((line) => line.displayName === 'Alex');
    const berardo = record.lines.find((line) => line.displayName === 'Berardo');

    // Highest of four: 3-0. Lowest of four: 0-3.
    expect([alex?.playEveryoneWins, alex?.playEveryoneLosses]).toEqual([3, 0]);
    expect([berardo?.playEveryoneWins, berardo?.playEveryoneLosses]).toEqual([0, 3]);
    expect(record.support).toBe('verified');
  });

  it('drops a whole week when any game in it cannot be counted', () => {
    const era = makeEra({
      games: [
        { season: 2024, week: 1, matchupId: 1, a: [1, 150], b: [2, 100] },
        { season: 2024, week: 1, matchupId: 2, a: [3, 120], b: [4, 90] },
        { season: 2024, week: 2, matchupId: 1, a: [1, 150], b: [2, 100], disputed: true },
        { season: 2024, week: 2, matchupId: 2, a: [3, 120], b: [4, 90] },
      ],
    });

    const record = playEveryoneRecord(era, { season: 2024 })!;
    // Week 2 goes entirely, including the game that was fine — an all-play tally
    // for Ryan depends on Alex's score, so a nine-score week is not comparable
    // with a ten-score one.
    expect(record.excludedWeeks).toEqual([2]);
    expect(record.includedWeeks).toEqual([1]);
    expect(record.support).toBe('partial');
    expect(record.lines.every((line) => line.weeksCounted === 1)).toBe(true);
  });

  it('counts the actual record over exactly the weeks it measured', () => {
    const era = makeEra({
      games: [
        { season: 2024, week: 1, matchupId: 1, a: [1, 150], b: [2, 100] },
        { season: 2024, week: 2, matchupId: 1, a: [1, 90], b: [2, 100], disputed: true },
      ],
    });
    const alex = playEveryoneRecord(era, { season: 2024 })!.lines.find(
      (line) => line.displayName === 'Alex',
    );
    // 1-0, not 1-1: the disputed loss is outside the population on both axes.
    expect([alex?.actualWins, alex?.actualLosses]).toEqual([1, 0]);
  });

  it('carries the computed-not-played disclaimer on the fact itself', () => {
    const era = makeEra({
      games: [{ season: 2024, week: 1, matchupId: 1, a: [1, 150], b: [2, 100] }],
    });
    const record = playEveryoneRecord(era, { season: 2024 })!;
    expect(record.disclaimer).toContain('never a league result');
    expect(record.evidence[0]).toBe(record.disclaimer);
  });

  it('produces no verdict — there is no luck score and no fraud flag', () => {
    const era = makeEra({
      games: [{ season: 2024, week: 1, matchupId: 1, a: [1, 150], b: [2, 100] }],
    });
    const record = playEveryoneRecord(era, { season: 2024 })!;
    const keys = Object.keys(record.lines[0] ?? {}).join(' ').toLowerCase();
    expect(keys).not.toContain('fraud');
    expect(keys).not.toContain('luck');
    expect(keys).not.toContain('expected');
  });

  it('returns null for a season the era does not hold', () => {
    const era = makeEra({
      games: [{ season: 2024, week: 1, matchupId: 1, a: [1, 150], b: [2, 100] }],
    });
    expect(playEveryoneRecord(era, { season: 2026 })).toBeNull();
  });

  it('returns null rather than a table of zeroes when every week is excluded', () => {
    const era = makeEra({
      games: [{ season: 2024, week: 1, matchupId: 1, a: [1, 150], b: [2, 100], disputed: true }],
    });
    expect(playEveryoneRecord(era, { season: 2024 })).toBeNull();
  });
});

/* ------------------------------------------------------------------------- */
/* The publication boundary                                                  */
/* ------------------------------------------------------------------------- */

describe('publishableHistory', () => {
  const era = makeEra({
    games: [
      { season: 2024, week: 1, matchupId: 1, a: [1, 120], b: [2, 100] },
      { season: 2024, week: 2, matchupId: 2, a: [1, 130], b: [4, 100] },
    ],
  });

  const live = new Set(['alex', 'nathan', 'ryan']);

  it('keeps a fact naming only current managers and drops one naming a retired manager', () => {
    const series = allSeries(era);
    expect(series).toHaveLength(2);

    const open = publishableHistory(series, live);
    expect(open).toHaveLength(1);
    expect(open[0]?.managerIds).toEqual(['alex', 'nathan']);
  });

  it('leaves the record itself untouched — the fact is true, it may not be spoken', () => {
    const before = allSeries(era).length;
    publishableHistory(allSeries(era), live);
    expect(allSeries(era)).toHaveLength(before);
    // Berardo's game is still in the era, still countable, still evidenced.
    expect(era.games.some((game) => game.b.managerId === 'gone' && game.countable)).toBe(true);
  });

  it('drops a record whose holder is retired rather than promoting the runner-up', () => {
    const held = makeEra({
      games: [
        { season: 2024, week: 1, matchupId: 1, a: [4, 200], b: [1, 100] },
        { season: 2024, week: 2, matchupId: 1, a: [1, 150], b: [2, 100] },
      ],
    });
    const high = recordBook(held).filter((record) => record.kind === 'highest-team-week');
    expect(high[0]?.value).toBe(200);
    // Silence, not a substitute. A "record" that is really the best publishable
    // score is a different claim and must not be printed as the record.
    expect(publishableHistory(high, live)).toEqual([]);
  });
});

/* ------------------------------------------------------------------------- */
/* Explainability                                                            */
/* ------------------------------------------------------------------------- */

describe('explain', () => {
  it('answers "why was this flagged" from the fact alone', () => {
    const era = makeEra({
      games: [
        { season: 2024, week: 1, matchupId: 1, a: [1, 150], b: [2, 100] },
        { season: 2024, week: 2, matchupId: 1, a: [1, 120], b: [2, 100] },
      ],
    });
    const record = recordBook(era).find((entry) => entry.kind === 'widest-margin')!;
    const lines = explain(record).join('\n');

    expect(lines).toContain('league-record');
    expect(lines).toContain('since 2024');
    expect(lines).toContain('support: verified');
    expect(lines).toContain('2024-w01-m1');
    expect(lines).toContain('observations');
  });
});
