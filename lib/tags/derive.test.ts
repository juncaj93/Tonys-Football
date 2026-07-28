import { describe, expect, it } from 'vitest';

import { deriveTags, tagsFor, type LeagueHistory, type SeatHistory } from './derive';

/**
 * The tags are what make the Counter Greeting true.
 *
 * A wrong tag does not throw and does not fail a build. It makes Tony tell
 * somebody they had the fewest points in the league when they did not, on the
 * first screen they ever see. So these tests assert the real league's real
 * numbers, not a convenient fiction.
 *
 * The 2025 season, from the imported chain:
 *
 *   roster  1  BigJuncer       9-5   1859.74 PF  1622.34 PA  playoffs  5th
 *   roster  2  NateyDee        5-9   1526.16     1560.42
 *   roster  3  jfletcher433    3-11  1568.78     1776.20
 *   roster  4  Tupaz11         9-5   1699.36     1620.86  playoffs  6th
 *   roster  5  SuggMyNick     10-4   1767.04     1681.36  playoffs  4th
 *   roster  6  RonJonathan    11-3   1868.70     1635.74  playoffs  2nd
 *   roster  7  imbrickedup22   4-10  1460.36     1770.00
 *   roster  8  cheeseking      9-5   1797.04     1631.42  playoffs  3rd
 *   roster  9  MattLee04       3-11  1430.34     1638.70
 *   roster 10  MattyB2317      7-7   1651.46     1691.94  playoffs  CHAMPION
 */

function seat(partial: Partial<SeatHistory> & { userId: string; rosterId: number }): SeatHistory {
  return {
    wins: 0,
    losses: 0,
    ties: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    madePlayoffs: false,
    finalRank: null,
    ...partial,
  };
}

const SEASON_2025: readonly SeatHistory[] = [
  seat({ userId: 'alex', rosterId: 1, wins: 9, losses: 5, pointsFor: 1859.74, pointsAgainst: 1622.34, madePlayoffs: true, finalRank: 5 }),
  seat({ userId: 'nate', rosterId: 2, wins: 5, losses: 9, pointsFor: 1526.16, pointsAgainst: 1560.42 }),
  seat({ userId: 'fletch', rosterId: 3, wins: 3, losses: 11, pointsFor: 1568.78, pointsAgainst: 1776.2 }),
  seat({ userId: 'tupaz', rosterId: 4, wins: 9, losses: 5, pointsFor: 1699.36, pointsAgainst: 1620.86, madePlayoffs: true, finalRank: 6 }),
  seat({ userId: 'nick', rosterId: 5, wins: 10, losses: 4, pointsFor: 1767.04, pointsAgainst: 1681.36, madePlayoffs: true, finalRank: 4 }),
  seat({ userId: 'ron', rosterId: 6, wins: 11, losses: 3, pointsFor: 1868.7, pointsAgainst: 1635.74, madePlayoffs: true, finalRank: 2 }),
  seat({ userId: 'bricked', rosterId: 7, wins: 4, losses: 10, pointsFor: 1460.36, pointsAgainst: 1770 }),
  seat({ userId: 'cheese', rosterId: 8, wins: 9, losses: 5, pointsFor: 1797.04, pointsAgainst: 1631.42, madePlayoffs: true, finalRank: 3 }),
  seat({ userId: 'mattlee', rosterId: 9, wins: 3, losses: 11, pointsFor: 1430.34, pointsAgainst: 1638.7 }),
  seat({ userId: 'mattyb', rosterId: 10, wins: 7, losses: 7, pointsFor: 1651.46, pointsAgainst: 1691.94, madePlayoffs: true, finalRank: 1 }),
];

const SEASON_2024: readonly SeatHistory[] = [
  seat({ userId: 'alex', rosterId: 1, wins: 11, losses: 3, pointsFor: 1787.52, pointsAgainst: 1617.94, madePlayoffs: true, finalRank: 1 }),
  seat({ userId: 'nate', rosterId: 2, wins: 9, losses: 5, pointsFor: 1786.99, pointsAgainst: 1598.26, madePlayoffs: true, finalRank: 2 }),
  seat({ userId: 'fletch', rosterId: 3, wins: 5, losses: 9, pointsFor: 1523.7, pointsAgainst: 1700.7 }),
  seat({ userId: 'berardo', rosterId: 4, wins: 6, losses: 8, pointsFor: 1778.94, pointsAgainst: 1758.64, madePlayoffs: true, finalRank: 6 }),
  seat({ userId: 'nick', rosterId: 5, wins: 6, losses: 8, pointsFor: 1743.38, pointsAgainst: 1850.94 }),
  seat({ userId: 'ron', rosterId: 6, wins: 8, losses: 6, pointsFor: 1922.06, pointsAgainst: 1736.88, madePlayoffs: true, finalRank: 5 }),
  seat({ userId: 'bricked', rosterId: 7, wins: 9, losses: 5, pointsFor: 1784.24, pointsAgainst: 1707.54, madePlayoffs: true, finalRank: 3 }),
  seat({ userId: 'cheese', rosterId: 8, wins: 1, losses: 13, pointsFor: 1529.62, pointsAgainst: 1847.72 }),
  seat({ userId: 'mattlee', rosterId: 9, wins: 10, losses: 4, pointsFor: 1693.78, pointsAgainst: 1580.68, madePlayoffs: true, finalRank: 4 }),
  seat({ userId: 'mattyb', rosterId: 10, wins: 5, losses: 9, pointsFor: 1687.48, pointsAgainst: 1838.42 }),
];

/** The 2026 preseason: everyone 0–0, nothing decided, Zack in roster 4. */
const SEASON_2026: readonly SeatHistory[] = [
  seat({ userId: 'alex', rosterId: 1 }),
  seat({ userId: 'nate', rosterId: 2 }),
  seat({ userId: 'fletch', rosterId: 3 }),
  seat({ userId: 'zack', rosterId: 4 }),
  seat({ userId: 'nick', rosterId: 5 }),
  seat({ userId: 'ron', rosterId: 6 }),
  seat({ userId: 'bricked', rosterId: 7 }),
  seat({ userId: 'cheese', rosterId: 8 }),
  seat({ userId: 'mattlee', rosterId: 9 }),
  seat({ userId: 'mattyb', rosterId: 10 }),
];

const LEAGUE: LeagueHistory = {
  seasons: [
    { year: 2024, isComplete: true, seats: SEASON_2024 },
    { year: 2025, isComplete: true, seats: SEASON_2025 },
    { year: 2026, isComplete: false, seats: SEASON_2026 },
  ],
};

const tags = deriveTags(LEAGUE);
const of = (userId: string): ReadonlySet<string> => tagsFor(tags, userId);

describe('championships', () => {
  it('gives the ring to the manager the bracket says won it', () => {
    expect(of('mattyb').has('champion_2025')).toBe(true);
    expect(of('alex').has('champion_2024')).toBe(true);
  });

  it('does not let a champion of one year hold another year', () => {
    expect(of('mattyb').has('champion_2024')).toBe(false);
    expect(of('alex').has('champion_2025')).toBe(false);
  });

  it('marks a title won at .500 or worse, and only then', () => {
    // 7–7 and a ring. The whole joke in A1, derived rather than typed in.
    expect(of('mattyb').has('title_at_500_or_worse')).toBe(true);
    // 11–3 and a ring, one year earlier.
    expect(of('alex').has('title_at_500_or_worse')).toBe(false);
  });

  it('gives never_champion to everyone without a title, and nobody with one', () => {
    expect(of('ron').has('never_champion')).toBe(true);
    expect(of('zack').has('never_champion')).toBe(true);
    expect(of('alex').has('never_champion')).toBe(false);
    expect(of('mattyb').has('never_champion')).toBe(false);
  });

  it('gives the previous champion not_champion_2025 so A5 can land', () => {
    expect(of('alex').has('not_champion_2025')).toBe(true);
    expect(of('mattyb').has('not_champion_2025')).toBe(false);
  });
});

describe('records and scoring', () => {
  it('names the best and worst records', () => {
    expect(of('ron').has('best_record_2025')).toBe(true);
    expect(of('nick').has('best_record_2025')).toBe(false);
  });

  /**
   * Two managers finished 3–11. Both are the worst record in the league,
   * because that is what happened. A tiebreak would make exactly one person
   * hold the tag and make the claim false for the other.
   */
  it('shares a tied worst record rather than inventing a tiebreak', () => {
    expect(of('fletch').has('worst_record_2025')).toBe(true);
    expect(of('mattlee').has('worst_record_2025')).toBe(true);
  });

  it('names the scoring extremes', () => {
    expect(of('ron').has('most_points_2025')).toBe(true);
    expect(of('mattlee').has('fewest_points_2025')).toBe(true);
    expect(of('fletch').has('most_points_against_2025')).toBe(true);
  });

  it('does not confuse fewest points with worst record', () => {
    // Both went 3–11; only one scored the fewest points.
    expect(of('fletch').has('fewest_points_2025')).toBe(false);
    expect(of('mattlee').has('fewest_points_2025')).toBe(true);
  });

  it('gives high_points_low_wins to second in scoring outside the top two records', () => {
    // 1859.74 points — second in the league — at 9–5, third-best record.
    expect(of('alex').has('high_points_low_wins')).toBe(true);
    // Led the league in points AND in wins: a different line entirely.
    expect(of('ron').has('high_points_low_wins')).toBe(false);
  });
});

describe('playoffs', () => {
  it('marks the six who reached the bracket', () => {
    for (const userId of ['alex', 'tupaz', 'nick', 'ron', 'cheese', 'mattyb']) {
      expect(of(userId).has('made_playoffs_2025'), userId).toBe(true);
    }
    for (const userId of ['nate', 'fletch', 'bricked', 'mattlee']) {
      expect(of(userId).has('made_playoffs_2025'), userId).toBe(false);
    }
  });

  it('gives "no January" only to a manager who played both seasons and missed both', () => {
    expect(of('fletch').has('missed_playoffs_both_seasons')).toBe(true);

    // Missed 2025, but made the bracket in 2024.
    expect(of('nate').has('missed_playoffs_both_seasons')).toBe(false);
    expect(of('mattlee').has('missed_playoffs_both_seasons')).toBe(false);
    // Missed 2024, made it in 2025.
    expect(of('cheese').has('missed_playoffs_both_seasons')).toBe(false);
    // Played one season only — "two seasons, no January" would be false.
    expect(of('tupaz').has('missed_playoffs_both_seasons')).toBe(false);
  });
});

describe('the newcomer and the seat he inherited', () => {
  it('calls the manager with no completed season the new one', () => {
    expect(of('zack').has('newest_manager')).toBe(true);
  });

  it('does not call a one-season manager new', () => {
    // Tupaz played 2025. There is a record to talk about, so no.
    expect(of('tupaz').has('newest_manager')).toBe(false);
  });

  it('marks the seat that changed hands, and only that seat', () => {
    // Roster 4: Berardo, then Tupaz, then Zack.
    expect(of('zack').has('inherited_slot')).toBe(true);

    // Everyone else has held the same slot throughout.
    for (const userId of ['alex', 'nate', 'fletch', 'nick', 'ron', 'bricked', 'cheese', 'mattlee', 'mattyb']) {
      expect(of(userId).has('inherited_slot'), userId).toBe(false);
    }
  });

  it('does not give the newcomer two_plus_seasons', () => {
    expect(of('zack').has('two_plus_seasons')).toBe(false);
    expect(of('nate').has('two_plus_seasons')).toBe(true);
  });
});

describe('a season in progress is not history', () => {
  /**
   * The 2026 preseason has ten rosters at 0–0. Counted as a completed season
   * it would hand `worst_record`, `fewest_points`, and a share of every other
   * extreme to all ten managers at once.
   */
  it('derives nothing at all from an unfinished season', () => {
    const preseasonOnly = deriveTags({
      seasons: [{ year: 2026, isComplete: false, seats: SEASON_2026 }],
    });

    for (const [, held] of preseasonOnly) {
      expect([...held].some((tag) => tag.includes('2026'))).toBe(false);
    }
  });

  it('keeps 2026 out of the latest-season tags', () => {
    expect([...of('ron')].some((tag) => tag.endsWith('_2026'))).toBe(false);
    expect(of('ron').has('most_points_2025')).toBe(true);
  });
});

describe('every manager gets at least one true line to stand on', () => {
  /**
   * `17 §3`'s acceptance criterion is that two managers get visibly different
   * greetings that are both true. That only holds if every one of the ten has
   * at least one tag a Group A line keys on — otherwise somebody always falls
   * through to the untagged offseason fallback and the pair looks identical.
   */
  it('leaves nobody in the 2026 league without a distinguishing tag', () => {
    const keyed = new Set([
      'champion_2024',
      'champion_2025',
      'title_at_500_or_worse',
      'best_record_2025',
      'worst_record_2025',
      'most_points_2025',
      'fewest_points_2025',
      'most_points_against_2025',
      'high_points_low_wins',
      'made_playoffs_2025',
      'missed_playoffs_both_seasons',
      'two_plus_seasons',
      'newest_manager',
      'inherited_slot',
    ]);

    for (const roster of SEASON_2026) {
      const held = [...of(roster.userId)].filter((tag) => keyed.has(tag));
      expect(held.length, `${roster.userId} has no distinguishing tag`).toBeGreaterThan(0);
    }
  });
});
