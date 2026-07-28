/**
 * The historical-chain adapter.
 *
 * Sleeper mints a new league ID every time a league is renewed, and links the
 * seasons together with `previous_league_id`. Walking that chain backwards is
 * Tier 1 of the import strategy in `16 §12`, and for this league it is
 * sufficient: 2026 → 2025 → 2024, terminating at 2024.
 *
 * Two rules govern everything in this file.
 *
 * **Never fabricate** (`16 §12`). Champions are *derived* from the winners
 * bracket, never entered. Where the data is thin, this module says so in a
 * warning rather than filling the gap — thin history has to stay visible.
 *
 * **Sleeper owns fantasy data; Tony's Pizza owns everything built on top**
 * (commissioner, 2026-07-28). So this module imports and normalizes, and stops
 * there. It produces no stories, no rewards, no tokens, no events. Those are
 * Tony's, and they are built from this output in later slices.
 *
 * Nothing here touches the database or the network directly — it reads through
 * a `SleeperSource`, so the same code path serves live sync and fixture replay.
 */
import {
  decodeBracket,
  decodeLeague,
  decodeMatchups,
  decodeRosters,
  decodeTransactions,
  decodeUsers,
} from './codec';
import { endpointKey, MAX_WEEK, type SleeperEndpoint } from './endpoints';
import { type SleeperSource } from './transport';
import {
  SleeperDecodeError,
  type SleeperBracketMatch,
  type SleeperMatchupEntry,
  type SleeperTransaction,
  type SleeperUser,
} from './types';

// --------------------------------------------------------------------------
// League shape
// --------------------------------------------------------------------------

/**
 * The league's structural facts, verified rather than assumed.
 *
 * `00`, `16`, and `CLAUDE.md` all state the same product rule: **the league
 * uses defenses and has no kickers.** It appears in story templates, in the
 * item catalog, and in lineup analysis. It is also checkable in one line
 * against `roster_positions`, so it should be checked — a silent kicker slot
 * would surface months later as a story engine referring to a position the
 * product says does not exist.
 */
export interface LeagueShapeReport {
  readonly ok: boolean;
  readonly totalRosters: number;
  readonly hasDefense: boolean;
  readonly hasKicker: boolean;
  /** Points per reception. 0.5 is this league's half-PPR setting. */
  readonly receptionPoints: number | null;
  /** Breaks a documented product rule. */
  readonly violations: readonly string[];
  /** Unexpected but not rule-breaking — an expansion, say. */
  readonly notes: readonly string[];
}

export const EXPECTED_TEAM_COUNT = 10;
export const EXPECTED_RECEPTION_POINTS = 0.5;

export function verifyLeagueShape(league: {
  readonly totalRosters: number;
  readonly rosterPositions: readonly string[];
  readonly scoringSettings: Readonly<Record<string, number>>;
}): LeagueShapeReport {
  const positions = league.rosterPositions.map((p) => p.toUpperCase());
  const hasDefense = positions.includes('DEF');
  const hasKicker = positions.includes('K');
  const receptionPoints = league.scoringSettings['rec'] ?? null;

  const violations: string[] = [];
  const notes: string[] = [];

  if (!hasDefense) {
    violations.push('League has no DEF slot, but the product requires defenses.');
  }
  if (hasKicker) {
    violations.push('League has a K slot, but the product requires no kickers.');
  }
  if (league.totalRosters !== EXPECTED_TEAM_COUNT) {
    notes.push(
      `League has ${String(league.totalRosters)} teams; ${String(EXPECTED_TEAM_COUNT)} expected.`,
    );
  }
  if (receptionPoints !== EXPECTED_RECEPTION_POINTS) {
    notes.push(
      `Reception scoring is ${receptionPoints === null ? 'unset' : String(receptionPoints)}; ` +
        `half-PPR (${String(EXPECTED_RECEPTION_POINTS)}) expected.`,
    );
  }

  return {
    ok: violations.length === 0,
    totalRosters: league.totalRosters,
    hasDefense,
    hasKicker,
    receptionPoints,
    violations,
    notes,
  };
}

// --------------------------------------------------------------------------
// Placements
// --------------------------------------------------------------------------

/**
 * Final placements, derived from the winners bracket.
 *
 * `rosters[].settings.rank` is null on every roster in both completed seasons,
 * so the bracket is the only authoritative source. Sleeper marks placement
 * games with `p`: 1 is the championship, 3 the third-place game, 5 the
 * fifth-place game. The winner and loser of each fill two positions.
 *
 * This is what makes championship rings, banners, and Hall-of-Champions
 * entries derivable rather than typed in — the commissioner's requirement on
 * 2026-07-28.
 */
export interface SeasonPlacements {
  readonly championRosterId: number | null;
  readonly runnerUpRosterId: number | null;
  readonly thirdPlaceRosterId: number | null;
  /** Placement position (1-based) → roster ID, for every position derivable. */
  readonly byPosition: Readonly<Record<number, number>>;
  readonly warnings: readonly string[];
}

export function derivePlacements(bracket: readonly SleeperBracketMatch[]): SeasonPlacements {
  const byPosition: Record<number, number> = {};
  const warnings: string[] = [];

  for (const match of bracket) {
    if (match.placement === null) continue;

    if (match.winnerRosterId === null) {
      warnings.push(
        `Placement game ${String(match.placement)} (match ${String(match.matchId)}) has no winner ` +
          `recorded — the season may be unfinished.`,
      );
      continue;
    }

    byPosition[match.placement] = match.winnerRosterId;
    if (match.loserRosterId !== null) {
      byPosition[match.placement + 1] = match.loserRosterId;
    }
  }

  const champion = byPosition[1] ?? null;
  if (champion === null && bracket.length > 0) {
    // Distinguish "the final has not been played" — the ordinary state of a
    // preseason or in-progress league — from "this bracket has no final at
    // all", which would mean the playoff format is not what we assume.
    const hasFinal = bracket.some((match) => match.placement === 1);
    warnings.push(
      hasFinal
        ? 'The championship game has not been played yet; no champion to derive.'
        : 'No championship game (p=1) exists in the winners bracket.',
    );
  }

  return {
    championRosterId: champion,
    runnerUpRosterId: byPosition[2] ?? null,
    thirdPlaceRosterId: byPosition[3] ?? null,
    byPosition,
    warnings,
  };
}

// --------------------------------------------------------------------------
// Seats
// --------------------------------------------------------------------------

/**
 * One roster slot and the people attached to it.
 *
 * Commissioner decision, 2026-07-28 (option (a)): **co-owners are imported as
 * people but hold no membership of their own.** Exactly one primary manager
 * per roster, now and in future seasons unless explicitly reconfigured.
 *
 * This preserves `UNIQUE(season_id, roster_id)` on `season_memberships` — the
 * constraint the identity model exists to enforce — while keeping a real
 * league member (2025's `topouzzz`, co-owner of roster 4) permanently in the
 * league's history rather than discarding them at import.
 *
 * `primaryUserId` is the future `season_memberships.user_id`. `coOwnerUserIds`
 * is reference data hanging off that row, not a second membership.
 */
export interface RosterSeat {
  readonly rosterId: number;
  /** Null on a vacant seat. */
  readonly primaryUserId: string | null;
  readonly coOwnerUserIds: readonly string[];
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly pointsFor: number;
  readonly pointsAgainst: number;
  readonly potentialPoints: number;
}

// --------------------------------------------------------------------------
// Weeks
// --------------------------------------------------------------------------

/**
 * One head-to-head matchup, collapsed from Sleeper's two opposing rows into a
 * single record — the shape `04 §7` asks for ("one matchup record per pair per
 * week, not duplicate opposing rows").
 *
 * Roster A is always the lower roster ID, so a pairing is stable between runs
 * and can be compared across re-imports.
 */
export interface ImportedPairing {
  readonly matchupId: number;
  readonly rosterAId: number;
  readonly rosterBId: number;
  readonly pointsA: number;
  readonly pointsB: number;
  /** Null on a tie. */
  readonly winnerRosterId: number | null;
  readonly margin: number;
}

export interface ImportedWeek {
  readonly week: number;
  readonly entries: readonly SleeperMatchupEntry[];
  readonly pairings: readonly ImportedPairing[];
  /**
   * Rosters that scored points but played no matchup.
   *
   * This is a normal state, not an error. Once the playoffs start, eliminated
   * rosters keep accumulating points with `matchup_id: null` — in this
   * league's 2025 championship week, six of ten rosters are unpaired, and in
   * week 18 all ten are. `16 §7.4` depends on exactly this distinction:
   * "eliminated managers dim — they do not disappear."
   */
  readonly unpairedRosterIds: readonly number[];
  readonly transactions: readonly SleeperTransaction[];
  readonly warnings: readonly string[];
}

export function derivePairings(entries: readonly SleeperMatchupEntry[]): {
  readonly pairings: readonly ImportedPairing[];
  readonly unpairedRosterIds: readonly number[];
  readonly warnings: readonly string[];
} {
  const warnings: string[] = [];
  const unpairedRosterIds: number[] = [];
  const grouped = new Map<number, SleeperMatchupEntry[]>();

  for (const entry of entries) {
    if (entry.matchupId === null) {
      unpairedRosterIds.push(entry.rosterId);
      continue;
    }
    const bucket = grouped.get(entry.matchupId);
    if (bucket === undefined) grouped.set(entry.matchupId, [entry]);
    else bucket.push(entry);
  }

  const pairings: ImportedPairing[] = [];

  for (const [matchupId, bucket] of [...grouped.entries()].sort((a, b) => a[0] - b[0])) {
    if (bucket.length !== 2) {
      warnings.push(
        `Matchup ${String(matchupId)} has ${String(bucket.length)} rosters; expected 2.`,
      );
      continue;
    }

    const sorted = [...bucket].sort((a, b) => a.rosterId - b.rosterId);
    const [a, b] = sorted as [SleeperMatchupEntry, SleeperMatchupEntry];

    pairings.push({
      matchupId,
      rosterAId: a.rosterId,
      rosterBId: b.rosterId,
      pointsA: a.points,
      pointsB: b.points,
      winnerRosterId:
        a.points === b.points ? null : a.points > b.points ? a.rosterId : b.rosterId,
      margin: Math.round(Math.abs(a.points - b.points) * 100) / 100,
    });
  }

  unpairedRosterIds.sort((a, b) => a - b);
  return { pairings, unpairedRosterIds, warnings };
}

// --------------------------------------------------------------------------
// One imported season
// --------------------------------------------------------------------------

export interface ImportedSeason {
  readonly year: number;
  readonly leagueId: string;
  readonly previousLeagueId: string | null;
  readonly name: string;
  readonly status: string;
  readonly isComplete: boolean;
  readonly playoffWeekStart: number | null;
  /** Every person Sleeper lists in the league, roster-holding or not. */
  readonly users: readonly SleeperUser[];
  readonly seats: readonly RosterSeat[];
  /**
   * Users with no seat of their own — co-owners and managers who left without
   * being replaced. They still become `users` rows; they get no membership.
   */
  readonly rosterlessUserIds: readonly string[];
  readonly shape: LeagueShapeReport;
  readonly placements: SeasonPlacements;
  readonly weeks: readonly ImportedWeek[];
  readonly warnings: readonly string[];
}

export interface ImportSeasonOptions {
  /**
   * Import weekly matchups and transactions.
   *
   * Off for a quick chain survey, on for a full import. A completed season is
   * ~34 additional requests.
   */
  readonly includeWeeks?: boolean;
  readonly maxWeek?: number;
}

async function fetchDecoded<T>(
  source: SleeperSource,
  endpoint: SleeperEndpoint,
  decode: (payload: unknown, key: string) => { value: T; warnings: readonly string[] },
  onEmpty: () => T,
): Promise<{ value: T; warnings: readonly string[]; error: string | null }> {
  const key = endpointKey(endpoint);
  const result = await source.fetch(endpoint);

  if (result.kind === 'error') {
    return { value: onEmpty(), warnings: [], error: result.message };
  }
  if (result.kind === 'empty') {
    return { value: onEmpty(), warnings: [], error: null };
  }

  try {
    const decoded = decode(result.payload, key);
    return { value: decoded.value, warnings: decoded.warnings, error: null };
  } catch (error: unknown) {
    const message =
      error instanceof SleeperDecodeError ? error.message : `${key}: ${String(error)}`;
    return { value: onEmpty(), warnings: [], error: message };
  }
}

/** Import one season. Throws only if the league itself cannot be read. */
export async function importSeason(
  source: SleeperSource,
  leagueId: string,
  options: ImportSeasonOptions = {},
): Promise<ImportedSeason> {
  const includeWeeks = options.includeWeeks ?? true;
  const maxWeek = options.maxWeek ?? MAX_WEEK;
  const warnings: string[] = [];

  const leagueResult = await source.fetch({ kind: 'league', leagueId });
  if (leagueResult.kind !== 'ok') {
    throw new Error(
      `Could not read league ${leagueId} from ${source.label}: ` +
        (leagueResult.kind === 'error' ? leagueResult.message : 'the response was empty'),
    );
  }

  const league = decodeLeague(leagueResult.payload, endpointKey({ kind: 'league', leagueId }));
  warnings.push(...league.warnings);

  const shape = verifyLeagueShape(league.value);
  warnings.push(...shape.violations, ...shape.notes);

  const users = await fetchDecoded(
    source,
    { kind: 'users', leagueId },
    (payload, key) => decodeUsers(payload, key),
    () => [] as readonly SleeperUser[],
  );
  warnings.push(...users.warnings);
  if (users.error !== null) warnings.push(users.error);

  const rosters = await fetchDecoded(
    source,
    { kind: 'rosters', leagueId },
    (payload, key) => decodeRosters(payload, key),
    () => [],
  );
  warnings.push(...rosters.warnings);
  if (rosters.error !== null) warnings.push(rosters.error);

  const bracket = await fetchDecoded(
    source,
    { kind: 'winners_bracket', leagueId },
    (payload, key) => decodeBracket(payload, key),
    () => [] as readonly SleeperBracketMatch[],
  );
  warnings.push(...bracket.warnings);
  if (bracket.error !== null) warnings.push(bracket.error);

  const placements = derivePlacements(bracket.value);
  warnings.push(...placements.warnings);

  const seats: RosterSeat[] = rosters.value.map((roster) => ({
    rosterId: roster.rosterId,
    primaryUserId: roster.ownerId,
    coOwnerUserIds: roster.coOwnerIds,
    wins: roster.wins,
    losses: roster.losses,
    ties: roster.ties,
    pointsFor: roster.pointsFor,
    pointsAgainst: roster.pointsAgainst,
    potentialPoints: roster.potentialPoints,
  }));

  const seatedUserIds = new Set(
    seats.map((seat) => seat.primaryUserId).filter((id): id is string => id !== null),
  );
  const rosterlessUserIds = users.value
    .map((user) => user.userId)
    .filter((id) => !seatedUserIds.has(id));

  for (const id of rosterlessUserIds) {
    const isCoOwner = seats.some((seat) => seat.coOwnerUserIds.includes(id));
    const user = users.value.find((candidate) => candidate.userId === id);
    const label = user?.displayName ?? id;
    warnings.push(
      isCoOwner
        ? `${label} is a co-owner with no seat of their own — imported as a person, no membership.`
        : `${label} is in the league with no roster — imported as a person, no membership.`,
    );
  }

  const weeks: ImportedWeek[] = [];

  if (includeWeeks) {
    for (let week = 1; week <= maxWeek; week++) {
      const matchups = await fetchDecoded(
        source,
        { kind: 'matchups', leagueId, week },
        (payload, key) => decodeMatchups(payload, key),
        () => [] as readonly SleeperMatchupEntry[],
      );
      const transactions = await fetchDecoded(
        source,
        { kind: 'transactions', leagueId, week },
        (payload, key) => decodeTransactions(payload, week, key),
        () => [] as readonly SleeperTransaction[],
      );

      // A week with neither matchups nor moves is past the end of the season.
      if (matchups.value.length === 0 && transactions.value.length === 0) continue;

      const {
        pairings,
        unpairedRosterIds,
        warnings: pairingWarnings,
      } = derivePairings(matchups.value);

      const weekWarnings = [
        ...matchups.warnings,
        ...transactions.warnings,
        ...pairingWarnings,
        ...(matchups.error !== null ? [matchups.error] : []),
        ...(transactions.error !== null ? [transactions.error] : []),
      ];

      weeks.push({
        week,
        entries: matchups.value,
        pairings,
        unpairedRosterIds,
        transactions: transactions.value,
        warnings: weekWarnings,
      });
    }
  }

  return {
    year: league.value.season,
    leagueId: league.value.leagueId,
    previousLeagueId: league.value.previousLeagueId,
    name: league.value.name,
    status: league.value.status,
    isComplete: league.value.status === 'complete',
    playoffWeekStart: league.value.playoffWeekStart,
    users: users.value,
    seats,
    rosterlessUserIds,
    shape,
    placements,
    weeks,
    warnings,
  };
}

// --------------------------------------------------------------------------
// Chain traversal
// --------------------------------------------------------------------------

export type ChainTermination = 'chain_end' | 'max_depth' | 'cycle' | 'error';

export interface ChainResult {
  /** Newest season first. */
  readonly seasons: readonly ImportedSeason[];
  readonly terminatedBy: ChainTermination;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export interface TraverseChainOptions extends ImportSeasonOptions {
  /**
   * Hard stop on chain length.
   *
   * A malformed `previous_league_id` that points forward would otherwise walk
   * until the API rate-limits us. The league began in 2024, so the real chain
   * is 3 long and a cap of 25 is generous for a decade of future seasons.
   */
  readonly maxDepth?: number;
}

/**
 * Walk `previous_league_id` backwards from a starting league.
 *
 * Tier 1 of `16 §12`. If the chain breaks partway, traversal stops and reports
 * it: the seasons already imported are returned, and Tier 2 (commissioner-
 * supplied IDs for the missing years) picks up from there. A broken chain is
 * never silently treated as "no more history".
 */
export async function traverseChain(
  source: SleeperSource,
  startLeagueId: string,
  options: TraverseChainOptions = {},
): Promise<ChainResult> {
  const maxDepth = options.maxDepth ?? 25;
  const seasons: ImportedSeason[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const visited = new Set<string>();

  let currentId: string | null = startLeagueId;
  let terminatedBy: ChainTermination = 'chain_end';

  while (currentId !== null) {
    if (visited.has(currentId)) {
      errors.push(
        `Chain revisits league ${currentId}. Sleeper's previous_league_id links form a cycle; ` +
          `traversal stopped to avoid looping.`,
      );
      terminatedBy = 'cycle';
      break;
    }
    if (seasons.length >= maxDepth) {
      errors.push(`Chain exceeded the maximum depth of ${String(maxDepth)} seasons.`);
      terminatedBy = 'max_depth';
      break;
    }

    visited.add(currentId);

    let season: ImportedSeason;
    try {
      season = await importSeason(source, currentId, options);
    } catch (error: unknown) {
      errors.push(error instanceof Error ? error.message : String(error));
      // A break here is Tier 1 failing. `16 §12` routes that to Tier 2 —
      // commissioner-supplied IDs — rather than to an empty history.
      errors.push(
        `Chain broke at league ${currentId}. Earlier seasons need Tier 2 (commissioner-supplied ` +
          `league IDs) to import.`,
      );
      terminatedBy = 'error';
      break;
    }

    warnings.push(...season.warnings.map((w) => `${String(season.year)}: ${w}`));
    seasons.push(season);
    currentId = season.previousLeagueId;
  }

  return { seasons, terminatedBy, errors, warnings };
}

/**
 * The champion of a season as a Sleeper user, not a roster slot.
 *
 * Deliberately returns the *person*: a ring is permanent and belongs to a
 * `users` row, while the roster ID that won it is seasonal and will belong to
 * someone else soon enough (`16 §5.1`).
 */
export function championUserId(season: ImportedSeason): string | null {
  const rosterId = season.placements.championRosterId;
  if (rosterId === null) return null;
  return season.seats.find((seat) => seat.rosterId === rosterId)?.primaryUserId ?? null;
}
