import { describe, expect, it } from 'vitest';

import { traverseChain } from './chain';
import { createFixtureSource } from './fixtures';
import {
  classifyWeek,
  deriveWeekShape,
  explainUnpaired,
  isScoredEntry,
  isScoredWeek,
  UNKNOWN_WEEK_SHAPE,
  type SeasonWeekShape,
} from './weeks';

const LEAGUE_2026 = '1385016656425668608';

/** 2024 and 2025 both run weeks 1–14 regular, 15–17 playoff, 18 not a week. */
const COMPLETED: SeasonWeekShape = {
  playoffWeekStart: 15,
  lastScoredWeek: 17,
  lastScoredSource: 'last_scored_leg',
};

describe('classifyWeek', () => {
  it('calls everything before playoff_week_start regular season', () => {
    for (let week = 1; week <= 14; week++) {
      expect(classifyWeek(week, COMPLETED)).toBe('regular');
    }
  });

  it('calls the played postseason weeks playoff', () => {
    expect(classifyWeek(15, COMPLETED)).toBe('playoff');
    expect(classifyWeek(16, COMPLETED)).toBe('playoff');
    expect(classifyWeek(17, COMPLETED)).toBe('playoff');
  });

  it('calls week 18 unscored — the league had stopped playing', () => {
    expect(classifyWeek(18, COMPLETED)).toBe('unscored');
  });

  it('does not hardcode week 15', () => {
    // A league that moved its playoffs must not have its own history
    // reclassified by a constant that happened to fit somebody else.
    const early: SeasonWeekShape = {
      playoffWeekStart: 13,
      lastScoredWeek: 16,
      lastScoredSource: 'last_scored_leg',
    };
    expect(classifyWeek(12, early)).toBe('regular');
    expect(classifyWeek(13, early)).toBe('playoff');
    expect(classifyWeek(15, early)).toBe('playoff');
    expect(classifyWeek(17, early)).toBe('unscored');
  });

  it('says unknown rather than guessing when the league shape is missing', () => {
    expect(classifyWeek(3, UNKNOWN_WEEK_SHAPE)).toBe('unknown');
    expect(isScoredWeek('unknown')).toBe(false);
  });

  it('refuses a week number that is not a week', () => {
    expect(classifyWeek(0, COMPLETED)).toBe('unknown');
    expect(classifyWeek(-1, COMPLETED)).toBe('unknown');
    expect(classifyWeek(1.5, COMPLETED)).toBe('unknown');
  });
});

describe('deriveWeekShape', () => {
  it('prefers Sleeper last_scored_leg', () => {
    const shape = deriveWeekShape({ playoffWeekStart: 15, lastScoredLeg: 17 });
    expect(shape).toMatchObject({ lastScoredWeek: 17, lastScoredSource: 'last_scored_leg' });
  });

  it('falls back to the bracket round count before a season has scored', () => {
    const shape = deriveWeekShape({ playoffWeekStart: 15, lastScoredLeg: null }, [
      { matchId: 1, round: 1, placement: null, team1RosterId: 5, team2RosterId: 4, winnerRosterId: null, loserRosterId: null },
      { matchId: 6, round: 3, placement: 1, team1RosterId: null, team2RosterId: null, winnerRosterId: null, loserRosterId: null },
    ]);
    // Three rounds from week 15 is weeks 15, 16, 17.
    expect(shape).toMatchObject({ lastScoredWeek: 17, lastScoredSource: 'bracket_rounds' });
  });

  it('admits it does not know rather than inventing a boundary', () => {
    const shape = deriveWeekShape({ playoffWeekStart: null, lastScoredLeg: null });
    expect(shape).toMatchObject({ lastScoredWeek: null, lastScoredSource: 'none' });
  });
});

describe('isScoredEntry', () => {
  it('rejects an unpaired row even in a week that was played', () => {
    // A bye, or an eliminated team still accruing NFL points. Neither is a game.
    expect(isScoredEntry({ rosterId: 1, matchupId: null }, 'playoff')).toBe(false);
    expect(isScoredEntry({ rosterId: 1, matchupId: 3 }, 'playoff')).toBe(true);
  });

  it('rejects every row in an unscored week', () => {
    expect(isScoredEntry({ rosterId: 1, matchupId: 3 }, 'unscored')).toBe(false);
  });
});

describe('explainUnpaired', () => {
  const context = { byeRosterIds: [1, 9], playoffWeekStart: 15 };

  it('calls a first-round absence a bye', () => {
    expect(explainUnpaired(1, 'playoff', context, 15)).toBe('bye');
  });

  it('calls a later absence elimination', () => {
    expect(explainUnpaired(3, 'playoff', context, 17)).toBe('eliminated');
    // A bye team unpaired in a later week has been knocked out, not rested.
    expect(explainUnpaired(1, 'playoff', context, 17)).toBe('eliminated');
  });

  it('calls week 18 the season being over', () => {
    expect(explainUnpaired(4, 'unscored', context, 18)).toBe('season_over');
  });
});

describe('against the recorded league', () => {
  it('classifies both completed seasons from their own settings', async () => {
    const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, { includeWeeks: true });

    for (const year of [2024, 2025]) {
      const season = chain.seasons.find((candidate) => candidate.year === year);
      expect(season, `${String(year)} should be in the chain`).toBeDefined();

      expect(season!.weekShape).toMatchObject({
        playoffWeekStart: 15,
        lastScoredWeek: 17,
        lastScoredSource: 'last_scored_leg',
      });

      const byType = (type: string) =>
        season!.weeks.filter((week) => week.type === type).map((week) => week.week);

      expect(byType('regular')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
      expect(byType('playoff')).toEqual([15, 16, 17]);
      expect(byType('unscored')).toEqual([18]);
    }
  });

  it('scores nobody in week 18, though every roster has points', async () => {
    const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, { includeWeeks: true });

    for (const year of [2024, 2025]) {
      const season = chain.seasons.find((candidate) => candidate.year === year)!;
      const week18 = season.weeks.find((week) => week.week === 18)!;

      // The trap in one assertion: ten rosters, ten scores, zero results.
      expect(week18.entries).toHaveLength(10);
      expect(week18.entries.every((entry) => entry.points > 0)).toBe(true);
      expect(week18.scoredRosterIds).toEqual([]);
      expect(week18.pairings).toEqual([]);
      expect(Object.values(week18.unpairedReasons)).toEqual(Array(10).fill('season_over'));
    }
  });

  it('never lets a week-18 score become the league low', async () => {
    const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, { includeWeeks: true });

    // The exact fabrications this module exists to prevent, and the verified
    // regular-season lows that replace them.
    const expected = {
      2024: { fabricated: 37.8, real: 70.48 },
      2025: { fabricated: 26.5, real: 62.74 },
    } as const;

    for (const year of [2024, 2025] as const) {
      const season = chain.seasons.find((candidate) => candidate.year === year)!;

      const naive = Math.min(
        ...season.weeks.flatMap((week) => week.entries.map((entry) => entry.points)),
      );
      expect(naive).toBeCloseTo(expected[year].fabricated, 2);

      const honest = Math.min(
        ...season.weeks
          .filter((week) => week.type === 'regular')
          .flatMap((week) =>
            week.entries
              .filter((entry) => isScoredEntry(entry, week.type))
              .map((entry) => entry.points),
          ),
      );
      expect(honest).toBeCloseTo(expected[year].real, 2);
      expect(honest).not.toBeCloseTo(naive, 2);
    }
  });

  it('tells a playoff bye apart from an elimination', async () => {
    const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, { includeWeeks: true });

    // The top two seeds sit out the first playoff week. They did not lose.
    const byes = { 2024: [1, 9], 2025: [5, 6] } as const;

    for (const year of [2024, 2025] as const) {
      const season = chain.seasons.find((candidate) => candidate.year === year)!;
      const week15 = season.weeks.find((week) => week.week === 15)!;

      expect(week15.unpairedRosterIds).toEqual([...byes[year]].sort((a, b) => a - b));
      for (const rosterId of byes[year]) {
        expect(week15.unpairedReasons[rosterId]).toBe('bye');
      }

      // Week 17 leaves six rosters idle, and none of them is resting.
      const week17 = season.weeks.find((week) => week.week === 17)!;
      expect(week17.unpairedRosterIds).toHaveLength(6);
      expect(Object.values(week17.unpairedReasons)).toEqual(Array(6).fill('eliminated'));
    }
  });
});
