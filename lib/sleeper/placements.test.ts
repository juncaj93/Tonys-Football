import { describe, expect, it } from 'vitest';

import { traverseChain, type ImportedSeason } from './chain';
import { createFixtureSource } from './fixtures';
import {
  BracketKindError,
  deriveByeRosterIds,
  deriveFullPlacements,
  losersBracket,
  winnersBracket,
} from './placements';
import { type SleeperBracketMatch } from './types';

const LEAGUE_2026 = '1385016656425668608';
const SHAPE = { totalRosters: 10, playoffTeams: 6 };

function match(partial: Partial<SleeperBracketMatch> & { matchId: number }): SleeperBracketMatch {
  return {
    round: 1,
    placement: null,
    team1RosterId: null,
    team2RosterId: null,
    winnerRosterId: null,
    loserRosterId: null,
    ...partial,
  };
}

/** The 2024 winners bracket, as recorded. */
const WINNERS_2024: SleeperBracketMatch[] = [
  match({ matchId: 1, round: 1, team1RosterId: 7, team2RosterId: 6, winnerRosterId: 7, loserRosterId: 6 }),
  match({ matchId: 2, round: 1, team1RosterId: 4, team2RosterId: 2, winnerRosterId: 2, loserRosterId: 4 }),
  match({ matchId: 3, round: 2, team1RosterId: 1, team2RosterId: 7, winnerRosterId: 1, loserRosterId: 7 }),
  match({ matchId: 4, round: 2, team1RosterId: 9, team2RosterId: 2, winnerRosterId: 2, loserRosterId: 9 }),
  match({ matchId: 5, round: 2, placement: 5, team1RosterId: 6, team2RosterId: 4, winnerRosterId: 6, loserRosterId: 4 }),
  match({ matchId: 6, round: 3, placement: 1, team1RosterId: 1, team2RosterId: 2, winnerRosterId: 1, loserRosterId: 2 }),
  match({ matchId: 7, round: 3, placement: 3, team1RosterId: 7, team2RosterId: 9, winnerRosterId: 7, loserRosterId: 9 }),
];

/** The 2024 consolation bracket, as recorded. */
const LOSERS_2024: SleeperBracketMatch[] = [
  match({ matchId: 1, round: 1, team1RosterId: 8, team2RosterId: 5, winnerRosterId: 5, loserRosterId: 8 }),
  match({ matchId: 2, round: 1, team1RosterId: 3, team2RosterId: 10, winnerRosterId: 10, loserRosterId: 3 }),
  match({ matchId: 3, round: 2, placement: 1, team1RosterId: 5, team2RosterId: 10, winnerRosterId: 5, loserRosterId: 10 }),
  match({ matchId: 4, round: 2, placement: 3, team1RosterId: 8, team2RosterId: 3, winnerRosterId: 8, loserRosterId: 3 }),
];

describe('bracket kind discrimination', () => {
  it('refuses a losers bracket handed in as the winners bracket', () => {
    // The whole reason this module exists. Sleeper's `p` is bracket-relative:
    // read this bracket as a championship and it reports the 7th-place
    // finisher as the 2024 champion.
    expect(() =>
      deriveFullPlacements(winnersBracket(WINNERS_2024), losersBracket(WINNERS_2024), SHAPE),
    ).toThrow(BracketKindError);

    expect(() =>
      deriveFullPlacements(losersBracket(LOSERS_2024), losersBracket(LOSERS_2024), SHAPE),
    ).toThrow(BracketKindError);
  });

  it('catches a bracket mislabelled at the source, not merely misplaced', () => {
    // Labelled 'winners' but carrying the consolation matches. The label lies;
    // the shape does not — four entrants where six belong.
    let thrown: unknown;
    try {
      deriveFullPlacements(winnersBracket(LOSERS_2024), losersBracket(LOSERS_2024), SHAPE);
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BracketKindError);
    expect((thrown as Error).message).toContain('should name 6 rosters');
  });

  it('would have named the wrong 2024 champion if the guard were absent', () => {
    // Documents the exact failure being prevented: the consolation bracket's
    // p=1 winner is roster 5, who finished 7th.
    const consolationTop = LOSERS_2024.find((m) => m.placement === 1)?.winnerRosterId;
    const realChampion = WINNERS_2024.find((m) => m.placement === 1)?.winnerRosterId;

    expect(consolationTop).toBe(5);
    expect(realChampion).toBe(1);
    expect(consolationTop).not.toBe(realChampion);
  });
});

describe('deriveByeRosterIds', () => {
  it('finds the seeds that sat out the first round', () => {
    expect(deriveByeRosterIds(winnersBracket(WINNERS_2024))).toEqual([1, 9]);
  });

  it('returns nothing for a consolation bracket, which has no byes', () => {
    expect(deriveByeRosterIds(losersBracket(LOSERS_2024))).toEqual([]);
  });
});

describe('deriveFullPlacements', () => {
  it('derives all ten places from the two 2024 brackets', () => {
    const placements = deriveFullPlacements(
      winnersBracket(WINNERS_2024),
      losersBracket(LOSERS_2024),
      SHAPE,
    );

    expect(placements.isComplete).toBe(true);
    expect(placements.byPosition).toEqual({
      1: 1, 2: 2, 3: 7, 4: 9, 5: 6, 6: 4, 7: 5, 8: 10, 9: 8, 10: 3,
    });
  });

  it('offsets the consolation bracket rather than reading its p as a title', () => {
    const placements = deriveFullPlacements(
      winnersBracket(WINNERS_2024),
      losersBracket(LOSERS_2024),
      SHAPE,
    );

    // Roster 5 won the consolation bracket's p=1 game. That is 7th, not 1st.
    expect(placements.rankByRoster[5]).toBe(7);
    expect(placements.championRosterId).toBe(1);
  });

  it('claims no playoff field from a bracket that has only been drawn', () => {
    // Sleeper publishes next season's bracket during the preseason with slots
    // already filled. Reading that as participation congratulates people on a
    // January they have not reached.
    const drawn = [
      match({ matchId: 1, round: 1, team1RosterId: 5, team2RosterId: 4 }),
      match({ matchId: 2, round: 1, team1RosterId: 10, team2RosterId: 9 }),
      match({ matchId: 3, round: 2, team1RosterId: 8 }),
      match({ matchId: 4, round: 2, team1RosterId: 7 }),
    ];

    const placements = deriveFullPlacements(winnersBracket(drawn), losersBracket([]), SHAPE);

    expect(placements.playoffRosterIds).toEqual([]);
    expect(placements.byeRosterIds).toEqual([]);
    expect(placements.isComplete).toBe(false);
    expect(placements.warnings.join(' ')).toContain('no game has been decided');
  });

  it('reports incompleteness rather than inventing the missing places', () => {
    const placements = deriveFullPlacements(
      winnersBracket(WINNERS_2024),
      losersBracket([]),
      SHAPE,
    );

    expect(placements.isComplete).toBe(false);
    expect(placements.rankByRoster[5]).toBeUndefined();
    expect(placements.warnings.join(' ')).toContain('7, 8, 9, 10');
  });
});

describe('against the recorded league', () => {
  const rank = (season: ImportedSeason, position: number): string => {
    const rosterId = season.fullPlacements.byPosition[position];
    const seat = season.seats.find((candidate) => candidate.rosterId === rosterId);
    const user = season.users.find((candidate) => candidate.userId === seat?.primaryUserId);
    return user?.displayName ?? '?';
  };

  it('derives the verified 2024 and 2025 finishes, all ten places', async () => {
    const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, { includeWeeks: false });

    const expected = {
      2024: [
        'BigJuncer', 'NateyDee', 'imbrickedup22', 'MattLee04', 'RonJonathan',
        'Anthonyberardo', 'SuggMyNick', 'MattyB2317', 'cheeseking', 'jfletcher433',
      ],
      2025: [
        'MattyB2317', 'RonJonathan', 'cheeseking', 'SuggMyNick', 'BigJuncer',
        'Tupaz11', 'NateyDee', 'jfletcher433', 'imbrickedup22', 'MattLee04',
      ],
    } as const;

    for (const year of [2024, 2025] as const) {
      const season = chain.seasons.find((candidate) => candidate.year === year)!;
      expect(season.fullPlacements.isComplete, `${String(year)} should be complete`).toBe(true);

      const derived = Array.from({ length: 10 }, (_, index) => rank(season, index + 1));
      expect(derived).toEqual([...expected[year]]);
    }
  });

  it('gives every roster a finish, where the winners bracket alone gave four of them none', async () => {
    const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, { includeWeeks: false });

    for (const year of [2024, 2025] as const) {
      const season = chain.seasons.find((candidate) => candidate.year === year)!;

      // What the old winners-bracket-only derivation managed.
      expect(Object.keys(season.placements.byPosition)).toHaveLength(6);
      // What both brackets manage.
      expect(Object.keys(season.fullPlacements.byPosition)).toHaveLength(10);

      for (const seat of season.seats) {
        expect(
          season.fullPlacements.rankByRoster[seat.rosterId],
          `roster ${String(seat.rosterId)} in ${String(year)}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('names the six playoff teams and the two byes per season', async () => {
    const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, { includeWeeks: false });

    const s2024 = chain.seasons.find((candidate) => candidate.year === 2024)!;
    expect(s2024.fullPlacements.playoffRosterIds).toEqual([1, 2, 4, 6, 7, 9]);
    expect(s2024.fullPlacements.byeRosterIds).toEqual([1, 9]);

    const s2025 = chain.seasons.find((candidate) => candidate.year === 2025)!;
    expect(s2025.fullPlacements.playoffRosterIds).toEqual([1, 4, 5, 6, 8, 10]);
    expect(s2025.fullPlacements.byeRosterIds).toEqual([5, 6]);
  });

  it('claims nothing for the unplayed 2026 season', async () => {
    const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, { includeWeeks: false });
    const s2026 = chain.seasons.find((candidate) => candidate.year === 2026)!;

    expect(s2026.fullPlacements.playoffRosterIds).toEqual([]);
    expect(s2026.fullPlacements.championRosterId).toBeNull();
    expect(s2026.fullPlacements.isComplete).toBe(false);
  });
});
