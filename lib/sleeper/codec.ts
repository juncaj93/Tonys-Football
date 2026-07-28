/**
 * Tolerant decoders for Sleeper payloads.
 *
 * These are deliberately NOT strict schemas. `10 §13` requires the adapter to
 * "tolerate missing fields", and `16 §15` records the standing risk that the
 * Sleeper API is undocumented and carries no SLA. A strict validator turns any
 * upstream field addition into a failed Tuesday sync at 5am, which is the
 * worst possible trade for a private ten-person league.
 *
 * So the rule here is: read what you recognize, warn about what you don't,
 * never throw for a field. The only hard failures are structural — an object
 * where an array belongs — because those mean the endpoint itself changed and
 * carrying on would invent data.
 *
 * Warnings are returned, not logged, so the caller decides whether an odd
 * field is worth surfacing to the commissioner.
 */
import { curateRosterMetadata } from './metadata';
import {
  type Decoded,
  type FaabTransfer,
  SleeperDecodeError,
  type SleeperBracketMatch,
  type SleeperLeague,
  type SleeperMatchupEntry,
  type SleeperRoster,
  type SleeperState,
  type SleeperTransaction,
  type SleeperUser,
  type TradedDraftPick,
} from './types';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

function num(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  // Sleeper sends `season` as a string and some numeric settings as strings.
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function bool(source: Record<string, unknown>, key: string): boolean {
  return source[key] === true;
}

function strArray(source: Record<string, unknown>, key: string): readonly string[] {
  const value = source[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function numArray(source: Record<string, unknown>, key: string): readonly number[] {
  const value = source[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
}

function numberMap(source: Record<string, unknown>, key: string): Record<string, number> {
  const value = source[key];
  const out: Record<string, number> = {};
  if (!isObject(value)) return out;
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/**
 * Recombine Sleeper's split point fields.
 *
 * Sleeper stores 1859.74 as `fpts: 1859` and `fpts_decimal: 74`. The decimal
 * part is hundredths, so `74` means `.74` and `7` means `.07`.
 */
function points(source: Record<string, unknown>, base: string): number {
  const whole = num(source, base) ?? 0;
  const decimal = num(source, `${base}_decimal`) ?? 0;
  return Math.round((whole + decimal / 100) * 100) / 100;
}

function expectArray(payload: unknown, endpointKey: string): readonly unknown[] {
  if (!Array.isArray(payload)) {
    throw new SleeperDecodeError(
      `expected an array, received ${payload === null ? 'null' : typeof payload}`,
      endpointKey,
    );
  }
  return payload;
}

function expectObject(payload: unknown, endpointKey: string): Record<string, unknown> {
  if (!isObject(payload)) {
    throw new SleeperDecodeError(
      `expected an object, received ${payload === null ? 'null' : typeof payload}`,
      endpointKey,
    );
  }
  return payload;
}

// --------------------------------------------------------------------------
// League
// --------------------------------------------------------------------------

export function decodeLeague(payload: unknown, endpointKey = 'league'): Decoded<SleeperLeague> {
  const raw = expectObject(payload, endpointKey);
  const warnings: string[] = [];

  const leagueId = str(raw, 'league_id');
  if (leagueId === null) {
    throw new SleeperDecodeError('league_id is missing', endpointKey);
  }

  const season = num(raw, 'season');
  if (season === null) {
    throw new SleeperDecodeError('season is missing', endpointKey);
  }

  const settings = isObject(raw['settings']) ? raw['settings'] : {};

  const scoringRaw = raw['scoring_settings'];
  const scoringSettings: Record<string, number> = {};
  if (isObject(scoringRaw)) {
    for (const [key, value] of Object.entries(scoringRaw)) {
      if (typeof value === 'number' && Number.isFinite(value)) scoringSettings[key] = value;
    }
  } else {
    warnings.push('scoring_settings was missing or not an object');
  }

  const rosterPositions = strArray(raw, 'roster_positions');
  if (rosterPositions.length === 0) {
    warnings.push('roster_positions was empty — league shape cannot be verified');
  }

  const totalRosters = num(raw, 'total_rosters');
  if (totalRosters === null) warnings.push('total_rosters was missing');

  return {
    value: {
      leagueId,
      season,
      name: str(raw, 'name') ?? `League ${leagueId}`,
      status: str(raw, 'status') ?? 'unknown',
      totalRosters: totalRosters ?? 0,
      previousLeagueId: str(raw, 'previous_league_id'),
      rosterPositions,
      scoringSettings,
      playoffWeekStart: num(settings, 'playoff_week_start'),
      leg: num(settings, 'leg'),
    },
    warnings,
  };
}

// --------------------------------------------------------------------------
// Users
// --------------------------------------------------------------------------

export function decodeUsers(payload: unknown, endpointKey = 'users'): Decoded<readonly SleeperUser[]> {
  const rows = expectArray(payload, endpointKey);
  const warnings: string[] = [];
  const users: SleeperUser[] = [];

  rows.forEach((row, index) => {
    if (!isObject(row)) {
      warnings.push(`users[${String(index)}] was not an object and was skipped`);
      return;
    }

    const userId = str(row, 'user_id');
    if (userId === null) {
      warnings.push(`users[${String(index)}] had no user_id and was skipped`);
      return;
    }

    const metadata = isObject(row['metadata']) ? row['metadata'] : {};

    users.push({
      userId,
      displayName: str(row, 'display_name') ?? `Manager ${userId}`,
      teamName: str(metadata, 'team_name'),
      avatar: str(row, 'avatar'),
      isOwner: bool(row, 'is_owner'),
      isBot: bool(row, 'is_bot'),
    });
  });

  return { value: users, warnings };
}

// --------------------------------------------------------------------------
// Rosters
// --------------------------------------------------------------------------

export function decodeRosters(
  payload: unknown,
  endpointKey = 'rosters',
): Decoded<readonly SleeperRoster[]> {
  const rows = expectArray(payload, endpointKey);
  const warnings: string[] = [];
  const rosters: SleeperRoster[] = [];

  rows.forEach((row, index) => {
    if (!isObject(row)) {
      warnings.push(`rosters[${String(index)}] was not an object and was skipped`);
      return;
    }

    const rosterId = num(row, 'roster_id');
    if (rosterId === null) {
      warnings.push(`rosters[${String(index)}] had no roster_id and was skipped`);
      return;
    }

    const settings = isObject(row['settings']) ? row['settings'] : {};
    if (!isObject(row['settings'])) {
      warnings.push(`roster ${String(rosterId)} had no settings — record defaults to 0-0-0`);
    }

    const ownerId = str(row, 'owner_id');
    if (ownerId === null) {
      // A real state: a seat vacated mid-season before a replacement claims it.
      warnings.push(`roster ${String(rosterId)} has no owner`);
    }

    rosters.push({
      rosterId,
      ownerId,
      coOwnerIds: strArray(row, 'co_owners'),
      wins: num(settings, 'wins') ?? 0,
      losses: num(settings, 'losses') ?? 0,
      ties: num(settings, 'ties') ?? 0,
      pointsFor: points(settings, 'fpts'),
      pointsAgainst: points(settings, 'fpts_against'),
      potentialPoints: points(settings, 'ppts'),
      players: strArray(row, 'players'),
      starters: strArray(row, 'starters'),
      metadata: curateRosterMetadata(row['metadata']),
    });
  });

  rosters.sort((a, b) => a.rosterId - b.rosterId);
  return { value: rosters, warnings };
}

// --------------------------------------------------------------------------
// Brackets
// --------------------------------------------------------------------------

/**
 * A bracket slot is a roster ID once the feeding match has been played, and an
 * object like `{ "w": 1 }` ("the winner of match 1") before that. Only the
 * resolved form is meaningful to us.
 */
function bracketRosterId(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function decodeBracket(
  payload: unknown,
  endpointKey = 'bracket',
): Decoded<readonly SleeperBracketMatch[]> {
  const rows = expectArray(payload, endpointKey);
  const warnings: string[] = [];
  const matches: SleeperBracketMatch[] = [];

  rows.forEach((row, index) => {
    if (!isObject(row)) {
      warnings.push(`bracket[${String(index)}] was not an object and was skipped`);
      return;
    }

    const matchId = num(row, 'm');
    const round = num(row, 'r');
    if (matchId === null || round === null) {
      warnings.push(`bracket[${String(index)}] had no match or round id and was skipped`);
      return;
    }

    matches.push({
      matchId,
      round,
      placement: num(row, 'p'),
      team1RosterId: bracketRosterId(row['t1']),
      team2RosterId: bracketRosterId(row['t2']),
      winnerRosterId: bracketRosterId(row['w']),
      loserRosterId: bracketRosterId(row['l']),
    });
  });

  matches.sort((a, b) => a.matchId - b.matchId);
  return { value: matches, warnings };
}

// --------------------------------------------------------------------------
// Matchups
// --------------------------------------------------------------------------

export function decodeMatchups(
  payload: unknown,
  endpointKey = 'matchups',
): Decoded<readonly SleeperMatchupEntry[]> {
  const rows = expectArray(payload, endpointKey);
  const warnings: string[] = [];
  const entries: SleeperMatchupEntry[] = [];

  rows.forEach((row, index) => {
    if (!isObject(row)) {
      warnings.push(`matchups[${String(index)}] was not an object and was skipped`);
      return;
    }

    const rosterId = num(row, 'roster_id');
    if (rosterId === null) {
      warnings.push(`matchups[${String(index)}] had no roster_id and was skipped`);
      return;
    }

    // `custom_points` is a commissioner override. When set it IS the score.
    const custom = num(row, 'custom_points');
    const points = custom ?? num(row, 'points') ?? 0;
    if (custom !== null) {
      warnings.push(`roster ${String(rosterId)} has a commissioner points override`);
    }

    entries.push({
      rosterId,
      matchupId: num(row, 'matchup_id'),
      points,
      starters: strArray(row, 'starters'),
      startersPoints: numArray(row, 'starters_points'),
      players: strArray(row, 'players'),
      playerPoints: numberMap(row, 'players_points'),
    });
  });

  entries.sort((a, b) => a.rosterId - b.rosterId);
  return { value: entries, warnings };
}

// --------------------------------------------------------------------------
// Transactions
// --------------------------------------------------------------------------

/** Sleeper writes `adds`/`drops` as player ID → roster ID, or null. */
function playerRosterMap(source: Record<string, unknown>, key: string): Record<string, number> {
  return numberMap(source, key);
}

/** `waiver_budget: [{ amount, sender, receiver }]`, where sender/receiver are roster IDs. */
function faabTransfers(source: Record<string, unknown>): FaabTransfer[] {
  const value = source['waiver_budget'];
  if (!Array.isArray(value)) return [];

  const transfers: FaabTransfer[] = [];
  for (const row of value) {
    if (!isObject(row)) continue;
    const amount = num(row, 'amount');
    const from = num(row, 'sender');
    const to = num(row, 'receiver');
    if (amount === null || from === null || to === null) continue;
    transfers.push({ amount, fromRosterId: from, toRosterId: to });
  }
  return transfers;
}

function draftPicks(source: Record<string, unknown>): TradedDraftPick[] {
  const value = source['draft_picks'];
  if (!Array.isArray(value)) return [];

  const picks: TradedDraftPick[] = [];
  for (const row of value) {
    if (!isObject(row)) continue;
    const round = num(row, 'round');
    if (round === null) continue;
    picks.push({
      season: str(row, 'season') ?? '',
      round,
      originalRosterId: num(row, 'roster_id'),
      fromRosterId: num(row, 'previous_owner_id'),
      toRosterId: num(row, 'owner_id'),
    });
  }
  return picks;
}

export function decodeTransactions(
  payload: unknown,
  week: number,
  endpointKey = 'transactions',
): Decoded<readonly SleeperTransaction[]> {
  const rows = expectArray(payload, endpointKey);
  const warnings: string[] = [];
  const transactions: SleeperTransaction[] = [];

  rows.forEach((row, index) => {
    if (!isObject(row)) {
      warnings.push(`transactions[${String(index)}] was not an object and was skipped`);
      return;
    }

    const transactionId = str(row, 'transaction_id');
    if (transactionId === null) {
      warnings.push(`transactions[${String(index)}] had no transaction_id and was skipped`);
      return;
    }

    const settings = isObject(row['settings']) ? row['settings'] : {};

    transactions.push({
      transactionId,
      type: str(row, 'type') ?? 'unknown',
      status: str(row, 'status') ?? 'unknown',
      // Prefer Sleeper's own leg; fall back to the week we requested.
      week: num(row, 'leg') ?? week,
      createdMs: num(row, 'created'),
      statusUpdatedMs: num(row, 'status_updated'),
      creatorUserId: str(row, 'creator'),
      rosterIds: numArray(row, 'roster_ids'),
      adds: playerRosterMap(row, 'adds'),
      drops: playerRosterMap(row, 'drops'),
      waiverBid: num(settings, 'waiver_bid'),
      faabTransfers: faabTransfers(row),
      draftPicks: draftPicks(row),
      consenterRosterIds: numArray(row, 'consenter_ids'),
    });
  });

  // Stable order: Sleeper returns transactions in no documented order, and an
  // import that reorders between runs produces spurious diffs downstream.
  transactions.sort((a, b) => a.transactionId.localeCompare(b.transactionId));
  return { value: transactions, warnings };
}

// --------------------------------------------------------------------------
// State
// --------------------------------------------------------------------------

export function decodeState(payload: unknown, endpointKey = 'state'): Decoded<SleeperState> {
  const raw = expectObject(payload, endpointKey);
  const warnings: string[] = [];

  const season = num(raw, 'season');
  if (season === null) {
    throw new SleeperDecodeError('season is missing', endpointKey);
  }

  return {
    value: {
      season,
      seasonType: str(raw, 'season_type') ?? 'unknown',
      week: num(raw, 'week') ?? 0,
      displayWeek: num(raw, 'display_week') ?? 0,
      leg: num(raw, 'leg') ?? 0,
    },
    warnings,
  };
}
