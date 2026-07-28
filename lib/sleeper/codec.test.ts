import { describe, expect, it } from 'vitest';

import {
  decodeBracket,
  decodeLeague,
  decodeMatchups,
  decodeRosters,
  decodeState,
  decodeTransactions,
  decodeUsers,
} from './codec';
import { SleeperDecodeError } from './types';

/**
 * The governing rule for these tests (`10 §13`): the adapter tolerates missing
 * fields. A decode that throws on an unfamiliar payload is a 5am Tuesday
 * outage waiting for the first time Sleeper adds a field.
 *
 * So most of these assert that odd input still produces usable output plus a
 * warning. The exceptions — structural failures and missing primary keys —
 * assert a throw, because carrying on there would mean inventing data.
 */

describe('decodeLeague', () => {
  const minimal = { league_id: '1', season: '2025' };

  it('parses the season from Sleeper string form', () => {
    expect(decodeLeague(minimal).value.season).toBe(2025);
  });

  it('defaults everything optional and warns', () => {
    const { value, warnings } = decodeLeague(minimal);

    expect(value.name).toBe('League 1');
    expect(value.status).toBe('unknown');
    expect(value.previousLeagueId).toBeNull();
    expect(value.rosterPositions).toEqual([]);
    expect(warnings).toContain('roster_positions was empty — league shape cannot be verified');
  });

  it('reads nested settings', () => {
    const { value } = decodeLeague({
      ...minimal,
      settings: { playoff_week_start: 15, leg: 17 },
    });

    expect(value.playoffWeekStart).toBe(15);
    expect(value.leg).toBe(17);
  });

  it('ignores unknown fields without complaint', () => {
    const { value } = decodeLeague({ ...minimal, a_brand_new_sleeper_field: { nested: true } });
    expect(value.leagueId).toBe('1');
  });

  it('throws when league_id is missing', () => {
    expect(() => decodeLeague({ season: '2025' })).toThrow(SleeperDecodeError);
  });

  it('throws when handed an array', () => {
    expect(() => decodeLeague([])).toThrow(SleeperDecodeError);
  });
});

describe('decodeUsers', () => {
  it('lifts team_name out of metadata', () => {
    const { value } = decodeUsers([
      { user_id: '7', display_name: 'BigJuncer', metadata: { team_name: "Juncer's Hog Formation" } },
    ]);

    expect(value[0]?.teamName).toBe("Juncer's Hog Formation");
  });

  it('falls back when a manager set no team name', () => {
    const { value } = decodeUsers([{ user_id: '7', display_name: 'BigJuncer' }]);
    expect(value[0]?.teamName).toBeNull();
  });

  it('skips a row with no user_id and warns rather than throwing', () => {
    const { value, warnings } = decodeUsers([{ display_name: 'ghost' }, { user_id: '2' }]);

    expect(value).toHaveLength(1);
    expect(warnings[0]).toContain('no user_id');
  });
});

describe('decodeRosters', () => {
  it('recombines Sleeper split point fields', () => {
    // 1859 + 74/100. Sleeper stores the decimal as hundredths.
    const { value } = decodeRosters([
      {
        roster_id: 1,
        owner_id: 'u1',
        settings: {
          wins: 9,
          losses: 5,
          ties: 0,
          fpts: 1859,
          fpts_decimal: 74,
          fpts_against: 1622,
          fpts_against_decimal: 34,
          ppts: 2075,
          ppts_decimal: 99,
        },
      },
    ]);

    expect(value[0]?.pointsFor).toBe(1859.74);
    expect(value[0]?.pointsAgainst).toBe(1622.34);
    expect(value[0]?.potentialPoints).toBe(2075.99);
  });

  it('treats a single-digit decimal as hundredths, not tenths', () => {
    const { value } = decodeRosters([
      { roster_id: 1, owner_id: 'u1', settings: { fpts: 100, fpts_decimal: 7 } },
    ]);

    expect(value[0]?.pointsFor).toBe(100.07);
  });

  it('reads co_owners, and tolerates the null Sleeper sends when there are none', () => {
    const { value } = decodeRosters([
      { roster_id: 1, owner_id: 'u1', co_owners: ['u9'], settings: {} },
      { roster_id: 2, owner_id: 'u2', co_owners: null, settings: {} },
    ]);

    expect(value[0]?.coOwnerIds).toEqual(['u9']);
    expect(value[1]?.coOwnerIds).toEqual([]);
  });

  it('warns about a vacant seat instead of dropping the roster', () => {
    const { value, warnings } = decodeRosters([{ roster_id: 3, owner_id: null, settings: {} }]);

    expect(value).toHaveLength(1);
    expect(value[0]?.ownerId).toBeNull();
    expect(warnings.some((w) => w.includes('has no owner'))).toBe(true);
  });

  it('sorts by roster id so imports are comparable between runs', () => {
    const { value } = decodeRosters([
      { roster_id: 5, owner_id: 'e', settings: {} },
      { roster_id: 1, owner_id: 'a', settings: {} },
      { roster_id: 3, owner_id: 'c', settings: {} },
    ]);

    expect(value.map((r) => r.rosterId)).toEqual([1, 3, 5]);
  });
});

describe('decodeBracket', () => {
  it('reads placement games', () => {
    const { value } = decodeBracket([{ m: 6, r: 3, p: 1, t1: 6, t2: 10, w: 10, l: 6 }]);

    expect(value[0]).toMatchObject({
      matchId: 6,
      round: 3,
      placement: 1,
      winnerRosterId: 10,
      loserRosterId: 6,
    });
  });

  it('treats an unresolved slot reference as no roster', () => {
    // Before the feeding match is played, Sleeper sends `{ "w": 1 }` — "the
    // winner of match 1" — where a roster ID will later appear.
    const { value } = decodeBracket([{ m: 3, r: 2, t1: 6, t2: { w: 1 }, w: null, l: null }]);

    expect(value[0]?.team1RosterId).toBe(6);
    expect(value[0]?.team2RosterId).toBeNull();
    expect(value[0]?.winnerRosterId).toBeNull();
  });
});

describe('decodeMatchups', () => {
  it('reads a scored entry', () => {
    const { value } = decodeMatchups([
      {
        roster_id: 1,
        matchup_id: 3,
        points: 127.82,
        starters: ['11564'],
        starters_points: [23.22],
        players: ['11564', '10229'],
        players_points: { '11564': 23.22, '10229': 0 },
      },
    ]);

    expect(value[0]).toMatchObject({ rosterId: 1, matchupId: 3, points: 127.82 });
    expect(value[0]?.playerPoints).toEqual({ '11564': 23.22, '10229': 0 });
  });

  it('keeps a null matchup_id as null rather than inventing a matchup', () => {
    // Eliminated rosters keep scoring during the playoffs with no matchup.
    const { value } = decodeMatchups([{ roster_id: 4, matchup_id: null, points: 88.2 }]);
    expect(value[0]?.matchupId).toBeNull();
  });

  it('prefers a commissioner override and flags it', () => {
    const { value, warnings } = decodeMatchups([
      { roster_id: 1, matchup_id: 1, points: 100, custom_points: 120 },
    ]);

    expect(value[0]?.points).toBe(120);
    expect(warnings.some((w) => w.includes('override'))).toBe(true);
  });
});

describe('decodeTransactions', () => {
  const waiver = {
    transaction_id: 'b',
    type: 'waiver',
    status: 'failed',
    leg: 3,
    created: 1758688683849,
    creator: '705813167879553024',
    roster_ids: [6],
    adds: { '12499': 6 },
    drops: null,
    settings: { waiver_bid: 5 },
  };

  it('reads a failed waiver claim — failures are story material, not noise', () => {
    const { value } = decodeTransactions([waiver], 3);

    expect(value[0]).toMatchObject({
      transactionId: 'b',
      type: 'waiver',
      status: 'failed',
      week: 3,
      waiverBid: 5,
    });
    expect(value[0]?.adds).toEqual({ '12499': 6 });
    expect(value[0]?.drops).toEqual({});
  });

  it('falls back to the requested week when leg is absent', () => {
    const { leg: _leg, ...withoutLeg } = waiver;
    const { value } = decodeTransactions([withoutLeg], 9);

    expect(value[0]?.week).toBe(9);
  });

  it('sorts by transaction id so re-imports do not reorder', () => {
    const { value } = decodeTransactions(
      [
        { ...waiver, transaction_id: 'c' },
        { ...waiver, transaction_id: 'a' },
        { ...waiver, transaction_id: 'b' },
      ],
      3,
    );

    expect(value.map((t) => t.transactionId)).toEqual(['a', 'b', 'c']);
  });
});

describe('decodeState', () => {
  it('parses the NFL calendar position', () => {
    const { value } = decodeState({
      week: 0,
      season: '2026',
      season_type: 'pre',
      display_week: 1,
      leg: 0,
    });

    expect(value).toMatchObject({ season: 2026, seasonType: 'pre', week: 0, displayWeek: 1 });
  });
});
