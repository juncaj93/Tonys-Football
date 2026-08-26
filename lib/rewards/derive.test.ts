import { describe, expect, it } from 'vitest';

import {
  deriveWeeklyAwards,
  rewardIdempotencyKey,
  type WeeklyAward,
} from '@/lib/rewards/derive';
import { buildWeek, publishableWeek, type StoredWeekGame } from '@/lib/stats/week';

/**
 * The rules, without a database.
 *
 * Every case here is built through `buildWeek` rather than by hand-writing a
 * `WeekRecord`, so the fixtures exercise the real Stats boundary — including the
 * parts this file is relying on rather than testing, like a tie being a stored
 * `winner_roster_id IS NULL` instead of a computed comparison.
 */

const ROSTER = new Map([
  [1, { userId: 'u-ann', displayName: 'Ann' }],
  [2, { userId: 'u-ben', displayName: 'Ben' }],
  [3, { userId: 'u-cal', displayName: 'Cal' }],
  [4, { userId: 'u-dee', displayName: 'Dee' }],
]);

const EVERYONE = new Set(['u-ann', 'u-ben', 'u-cal', 'u-dee']);

const PRICES = { matchupWinTokens: 150, weeklyHighScoreTokens: 400 };

function game(over: Partial<StoredWeekGame> = {}): StoredWeekGame {
  const pointsACents = over.pointsACents ?? 12000;
  const pointsBCents = over.pointsBCents ?? 10000;
  return {
    week: 5,
    weekType: 'regular',
    sleeperMatchupId: 1,
    rosterAId: 1,
    rosterBId: 2,
    pointsACents,
    pointsBCents,
    winnerRosterId:
      over.winnerRosterId !== undefined
        ? over.winnerRosterId
        : pointsACents === pointsBCents
          ? null
          : pointsACents > pointsBCents
            ? (over.rosterAId ?? 1)
            : (over.rosterBId ?? 2),
    marginCents: Math.abs(pointsACents - pointsBCents),
    disputed: false,
    ...over,
  };
}

function awards(
  rows: readonly StoredWeekGame[],
  eligible: ReadonlySet<string> = EVERYONE,
): readonly WeeklyAward[] {
  const record = publishableWeek(
    buildWeek({ season: 2026, week: 5, finalized: true, rows, roster: ROSTER }),
    eligible,
  );
  return deriveWeeklyAwards({ week: record, prices: PRICES });
}

describe('deriveWeeklyAwards', () => {
  it('pays the winner and the week high score', () => {
    const result = awards([game()]);

    expect(result).toEqual([
      {
        managerId: 'u-ann',
        displayName: 'Ann',
        rosterId: 1,
        reason: 'MATCHUP_WIN',
        amount: 150,
        pointsCents: 12000,
        gameKey: '2026-w05-m1',
      },
      {
        managerId: 'u-ann',
        displayName: 'Ann',
        rosterId: 1,
        reason: 'WEEKLY_HIGH_SCORE',
        amount: 400,
        pointsCents: 12000,
        gameKey: '2026-w05-m1',
      },
    ]);
  });

  it('gives one manager both reasons as two separate awards', () => {
    // Guards the thing that makes the ledger key format matter: the same manager
    // is paid twice in one week, so a key without the reason in it would collide
    // and silently drop 400 tokens.
    const result = awards([game()]);
    const ann = result.filter((award) => award.managerId === 'u-ann');
    expect(ann).toHaveLength(2);
    expect(new Set(ann.map((award) => award.reason))).toEqual(
      new Set(['MATCHUP_WIN', 'WEEKLY_HIGH_SCORE']),
    );
  });

  it('pays nobody a win for a tied game', () => {
    const result = awards([game({ pointsACents: 11000, pointsBCents: 11000 })]);

    expect(result.filter((award) => award.reason === 'MATCHUP_WIN')).toEqual([]);
    // The tie still posted the week's best score, and both halves of it did.
    expect(result.map((award) => award.managerId)).toEqual(['u-ann', 'u-ben']);
  });

  it('pays every manager who shares the high score, in full', () => {
    const result = awards([
      game({ sleeperMatchupId: 1, pointsACents: 13000, pointsBCents: 9000 }),
      game({
        sleeperMatchupId: 2,
        rosterAId: 3,
        rosterBId: 4,
        pointsACents: 13000,
        pointsBCents: 8000,
      }),
    ]);

    const high = result.filter((award) => award.reason === 'WEEKLY_HIGH_SCORE');
    expect(high.map((award) => award.managerId)).toEqual(['u-ann', 'u-cal']);
    // Full, not halved. `03 §4` gives one number and no rule for splitting it.
    expect(high.every((award) => award.amount === 400)).toBe(true);
  });

  it('measures the high score across the whole week, not inside each game', () => {
    /*
     * The case a per-game implementation gets wrong, and it looks right on a
     * single-game fixture: measure the best score inside each matchup and every
     * winner is also a high scorer, so the week pays four 400s instead of one.
     *
     * Ann beats Ben 130-90 and Cal beats Dee 110-100. Cal won, and posted the
     * third-best score in the league — so Cal is paid 150 and nothing else.
     * There is exactly one high score in a week and it belongs to the league.
     */
    const result = awards([
      game({ sleeperMatchupId: 1, pointsACents: 13000, pointsBCents: 9000 }),
      game({
        sleeperMatchupId: 2,
        rosterAId: 3,
        rosterBId: 4,
        pointsACents: 11000,
        pointsBCents: 10000,
      }),
    ]);

    const high = result.filter((award) => award.reason === 'WEEKLY_HIGH_SCORE');
    expect(high.map((award) => award.managerId)).toEqual(['u-ann']);
    expect(high[0]!.pointsCents).toBe(13000);

    // Cal is a winner and is not a high scorer, which is the whole point.
    const cal = result.filter((award) => award.managerId === 'u-cal');
    expect(cal.map((award) => award.reason)).toEqual(['MATCHUP_WIN']);
  });

  it('pays nothing for a week with no games', () => {
    expect(awards([])).toEqual([]);
  });

  it('never pays a manager who had no game that week', () => {
    // A bye is not a case this code handles — it is a row that does not exist.
    // `fantasy_matchups` stores only paired games, so Cal and Dee are simply
    // absent, and this asserts that stays true rather than becoming a zero award.
    const result = awards([game()]);
    expect(result.some((award) => ['u-cal', 'u-dee'].includes(award.managerId))).toBe(
      false,
    );
  });

  it('drops a disputed game entirely, including its high score', () => {
    const result = awards([
      game({ sleeperMatchupId: 1, pointsACents: 20000, pointsBCents: 9000, disputed: true }),
      game({
        sleeperMatchupId: 2,
        rosterAId: 3,
        rosterBId: 4,
        pointsACents: 11000,
        pointsBCents: 8000,
      }),
    ]);

    expect(result.some((award) => award.managerId === 'u-ann')).toBe(false);
    // The high score is the best of what remains, not the suppressed 200.00.
    const high = result.find((award) => award.reason === 'WEEKLY_HIGH_SCORE');
    expect(high?.pointsCents).toBe(11000);
  });

  it('drops a game whose manager is no longer in the league', () => {
    const result = awards([game()], new Set(['u-cal', 'u-dee']));
    expect(result).toEqual([]);
  });

  it('does not vary the amount by week type', () => {
    // `03 §4` prices a matchup win once and does not qualify it. A playoff
    // multiplier would be an invented rule, so this pins the absence of one.
    const playoff = awards([game({ weekType: 'playoff' })]);
    const consolation = awards([game({ weekType: 'consolation' })]);
    const regular = awards([game()]);

    expect(playoff.map((award) => award.amount)).toEqual([150, 400]);
    expect(consolation.map((award) => award.amount)).toEqual([150, 400]);
    expect(regular.map((award) => award.amount)).toEqual([150, 400]);
  });

  it('orders deterministically regardless of input order', () => {
    const forward = awards([
      game({ sleeperMatchupId: 1 }),
      game({ sleeperMatchupId: 2, rosterAId: 3, rosterBId: 4, pointsACents: 9000 }),
    ]);
    const reversed = awards([
      game({ sleeperMatchupId: 2, rosterAId: 3, rosterBId: 4, pointsACents: 9000 }),
      game({ sleeperMatchupId: 1 }),
    ]);

    expect(forward).toEqual(reversed);
    // Roster 4 wins the second game — A posts 90.00 against B's 100.00.
    expect(forward.map((award) => `${award.reason}:${String(award.rosterId)}`)).toEqual([
      'MATCHUP_WIN:1',
      'MATCHUP_WIN:4',
      'WEEKLY_HIGH_SCORE:1',
    ]);
  });

  it('never derives a zero or negative amount', () => {
    // `apply_token_delta` rejects a zero delta and `weekly_rewards` CHECKs for a
    // positive amount, so a derivation that produced one would raise rather than
    // write. This makes the intent explicit at the layer that decides it.
    for (const award of awards([game()])) expect(award.amount).toBeGreaterThan(0);
  });
});

describe('rewardIdempotencyKey', () => {
  it('names the occasion, not the run', () => {
    const key = rewardIdempotencyKey({
      season: 2026,
      week: 5,
      managerId: 'u-ann',
      reason: 'MATCHUP_WIN',
    });
    expect(key).toBe('weekly-reward:2026:5:u-ann:MATCHUP_WIN');
  });

  it('separates the two reasons for one manager in one week', () => {
    const shared = { season: 2026, week: 5, managerId: 'u-ann' } as const;
    expect(rewardIdempotencyKey({ ...shared, reason: 'MATCHUP_WIN' })).not.toBe(
      rewardIdempotencyKey({ ...shared, reason: 'WEEKLY_HIGH_SCORE' }),
    );
  });

  it('omits the amount, so a re-priced week collides instead of paying twice', () => {
    // The key is the load-bearing half of "a rebalance must not silently repay".
    // If the amount were part of it, two runs at two prices would produce two
    // legitimate-looking payments; without it, `apply_token_delta` raises.
    const key = rewardIdempotencyKey({
      season: 2026,
      week: 5,
      managerId: 'u-ann',
      reason: 'MATCHUP_WIN',
    });
    expect(key).not.toMatch(/150|400/);
  });
});
