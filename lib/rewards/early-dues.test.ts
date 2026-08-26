import { describe, expect, it } from 'vitest';

import { PROVISIONAL_ECONOMY } from '@/lib/counter/tokens';

import {
  EARLY_DUES_ROSTER,
  earlyDuesAmount,
  earlyDuesDescription,
  earlyDuesHandlesFor,
  earlyDuesIdempotencyKey,
  isEarlyDuesEligible,
} from './early-dues';

/**
 * The early-dues rules, without a database.
 *
 * Everything here is a rule the commissioner could check by reading it: who is
 * owed a thank-you, what it is worth, and what it is filed under. The database
 * guarantees are `service.test.ts`'s, against a real Postgres.
 */

const SEASON = 2026;

describe('the early-dues roster', () => {
  it('names exactly the two managers the commissioner named, for 2026', () => {
    expect([...earlyDuesHandlesFor(SEASON)].sort()).toEqual([
      'mattyb2317',
      'nateydee',
    ]);
  });

  it('requires a recorded source on every entry, like content/manager-mappings.json', () => {
    for (const entry of EARLY_DUES_ROSTER) {
      expect(entry.source.length, `${entry.sleeperUsername} has no source`).toBeGreaterThan(0);
    }
  });

  it('names no season but 2026, so no later season pays for something nobody has done', () => {
    /*
     * **Commissioner ruling, 2026-08-26**: 2026 is the whole of this feature.
     * These two are not a placeholder to be generalised — a future season may
     * reward entirely different managers, and which managers paid early is a
     * fact about one season that this software cannot observe.
     *
     * The defect it stops: a roster keyed only by handle would hand the bonus
     * out again the first time a 2027 season was seeded, paying for dues nobody
     * had paid yet. This goes red the day somebody widens the match, and stays
     * green only for a deliberate, reviewed second row.
     */
    expect(EARLY_DUES_ROSTER.every((entry) => entry.seasonYear === 2026)).toBe(true);
    expect(earlyDuesHandlesFor(2027).size).toBe(0);
    expect(earlyDuesHandlesFor(2025).size).toBe(0);
  });

  it('lists nobody twice for one season', () => {
    const handles = EARLY_DUES_ROSTER.filter((entry) => entry.seasonYear === SEASON).map(
      (entry) => entry.sleeperUsername.toLowerCase(),
    );
    expect(new Set(handles).size).toBe(handles.length);
  });
});

describe('eligibility', () => {
  it('pays the two named handles', () => {
    expect(isEarlyDuesEligible({ sleeperUsername: 'NateyDee', seasonYear: SEASON })).toBe(true);
    expect(isEarlyDuesEligible({ sleeperUsername: 'MattyB2317', seasonYear: SEASON })).toBe(true);
  });

  it('matches case-insensitively, because a Sleeper handle is one account', () => {
    for (const handle of ['nateydee', 'NATEYDEE', 'nAtEyDeE', 'mattyb2317']) {
      expect(isEarlyDuesEligible({ sleeperUsername: handle, seasonYear: SEASON })).toBe(true);
    }
  });

  it('pays nobody else, including the commissioner', () => {
    for (const handle of ['BigJuncer', 'jfletcher433', 'Anthonyberardo', 'NateyDee2']) {
      expect(isEarlyDuesEligible({ sleeperUsername: handle, seasonYear: SEASON })).toBe(false);
    }
  });

  it('does not pay an unclaimed account', () => {
    // `users.sleeper_username` is null until a manager claims. A row that has
    // never been attached to a Sleeper account cannot be one of two named people.
    expect(isEarlyDuesEligible({ sleeperUsername: null, seasonYear: SEASON })).toBe(false);
  });

  it('does not pay a named handle in a season they were not named for', () => {
    expect(isEarlyDuesEligible({ sleeperUsername: 'NateyDee', seasonYear: 2027 })).toBe(false);
    expect(isEarlyDuesEligible({ sleeperUsername: 'NateyDee', seasonYear: 2025 })).toBe(false);
  });

  it('does not match on a substring or a padded handle', () => {
    for (const handle of ['Natey', 'NateyDeee', ' NateyDee', 'NateyDee ']) {
      expect(isEarlyDuesEligible({ sleeperUsername: handle, seasonYear: SEASON })).toBe(false);
    }
  });
});

describe('the amount', () => {
  it('is twice the box price, derived rather than written down', () => {
    expect(earlyDuesAmount({ standardBoxPriceTokens: 200 })).toBe(400);
    expect(earlyDuesAmount({ standardBoxPriceTokens: 50 })).toBe(100);
    expect(earlyDuesAmount({ standardBoxPriceTokens: 175 })).toBe(350);
  });

  it('follows the price when the economy moves', () => {
    /*
     * The 2026-08-04 ruling already moved this number once, 50 -> 200. A literal
     * 400 here would have silently stopped meaning "two boxes" that day, and
     * would be a third number for the P3 simulation to argue with.
     */
    expect(earlyDuesAmount(PROVISIONAL_ECONOMY)).toBe(
      PROVISIONAL_ECONOMY.standardBoxPriceTokens * 2,
    );
  });

  it('changes no economy value', () => {
    // This slice reads the economy and writes none of it. If a rebalance is ever
    // smuggled in beside a reward change, this is where it shows up.
    expect(PROVISIONAL_ECONOMY.standardBoxPriceTokens).toBe(200);
    expect(PROVISIONAL_ECONOMY.matchupWinTokens).toBe(150);
    expect(PROVISIONAL_ECONOMY.weeklyHighScoreTokens).toBe(400);
    expect(PROVISIONAL_ECONOMY.seasonStartTokens).toBe(250);
  });
});

describe('the idempotency key', () => {
  it('names the occasion: this season, this manager', () => {
    expect(earlyDuesIdempotencyKey({ seasonId: 's-1', userId: 'u-1' })).toBe(
      'early-dues:s-1:u-1',
    );
  });

  it('is stable across runs, so a retry is a no-op', () => {
    const once = earlyDuesIdempotencyKey({ seasonId: 's-1', userId: 'u-1' });
    const again = earlyDuesIdempotencyKey({ seasonId: 's-1', userId: 'u-1' });
    expect(once).toBe(again);
  });

  it('separates managers and seasons', () => {
    const keys = new Set([
      earlyDuesIdempotencyKey({ seasonId: 's-1', userId: 'u-1' }),
      earlyDuesIdempotencyKey({ seasonId: 's-1', userId: 'u-2' }),
      earlyDuesIdempotencyKey({ seasonId: 's-2', userId: 'u-1' }),
    ]);
    expect(keys.size).toBe(3);
  });

  it('carries no amount, so a re-priced replay raises instead of paying twice', () => {
    // The rule `rewardIdempotencyKey` states and the reason it states it: with
    // the amount in the key, a rebalance between two runs pays both, at two
    // prices, and both rows look legitimate.
    expect(earlyDuesIdempotencyKey({ seasonId: 's-1', userId: 'u-1' })).not.toMatch(/\d{3}/);
  });
});

describe('the description', () => {
  it('is a curated template with the season in it, not generated text', () => {
    expect(earlyDuesDescription(2026)).toBe(
      'Thanks for getting your 2026 dues in early. Two boxes on the house.',
    );
  });

  it('never names the enum value a manager would have to decode', () => {
    expect(earlyDuesDescription(2026)).not.toContain('EARLY_DUES_BONUS');
  });
});
