/**
 * Normalized Sleeper types.
 *
 * These are Tony's Pizza's shapes, not Sleeper's. The commissioner's approved
 * boundary (2026-07-28):
 *
 *   > Sleeper owns fantasy data. Tony's Pizza owns stories, collectibles,
 *   > rewards, lore, dialogue, reputation, shop changes, and all game systems
 *   > built on top of imported events.
 *
 * So nothing above this layer sees a Sleeper field name. When Sleeper renames
 * `fpts_decimal` or adds a field, the change stops in `codec.ts` and these
 * types do not move.
 *
 * Every decoded value keeps its raw payload alongside it (`raw`), because
 * `04 §23` requires raw payloads be retained for debugging important syncs and
 * `10 §13` requires replay from stored payloads.
 */

/** A person as Sleeper knows them. Not a Tony's Pizza `users` row. */
export interface SleeperUser {
  readonly userId: string;
  readonly displayName: string;
  /** The manager's chosen team name for the season, when they set one. */
  readonly teamName: string | null;
  readonly avatar: string | null;
  readonly isOwner: boolean;
  readonly isBot: boolean;
}

/** League configuration for one season. */
export interface SleeperLeague {
  readonly leagueId: string;
  readonly season: number;
  readonly name: string;
  /** Sleeper lifecycle: `pre_draft` · `drafting` · `in_season` · `complete`. */
  readonly status: string;
  readonly totalRosters: number;
  /** The previous season's league ID. Null ends the chain. */
  readonly previousLeagueId: string | null;
  /** Starting slots plus bench, e.g. `QB RB RB WR WR WR TE FLEX FLEX DEF BN…`. */
  readonly rosterPositions: readonly string[];
  readonly scoringSettings: Readonly<Record<string, number>>;
  readonly playoffWeekStart: number | null;
  /** Sleeper's week counter for the season; 17 on a completed season. */
  readonly leg: number | null;
}

/** One roster slot in one season. */
export interface SleeperRoster {
  readonly rosterId: number;
  /** Null on an orphaned roster — a seat nobody currently holds. */
  readonly ownerId: string | null;
  readonly coOwnerIds: readonly string[];
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  /** Points for, recombined from Sleeper's split integer/decimal fields. */
  readonly pointsFor: number;
  readonly pointsAgainst: number;
  /**
   * Sleeper's "potential points" — the score of a perfect lineup.
   * Retained because bench-decision analysis (`04 §7`) needs it and it cannot
   * be recomputed without full player scores for every week.
   */
  readonly potentialPoints: number;
  readonly players: readonly string[];
  readonly starters: readonly string[];
}

/**
 * One bracket match.
 *
 * `placement` is Sleeper's `p` field, present only on placement games:
 * 1 = championship, 3 = third-place, 5 = fifth-place. It is how a champion is
 * derived rather than entered (`16 §12`).
 */
export interface SleeperBracketMatch {
  readonly matchId: number;
  readonly round: number;
  readonly placement: number | null;
  /** Null while the feeding match is unresolved. */
  readonly team1RosterId: number | null;
  readonly team2RosterId: number | null;
  readonly winnerRosterId: number | null;
  readonly loserRosterId: number | null;
}

/** One roster's side of one weekly matchup. */
export interface SleeperMatchupEntry {
  readonly rosterId: number;
  /** Pairs two entries into a head-to-head. Null on a bye or unplayed week. */
  readonly matchupId: number | null;
  readonly points: number;
  readonly starters: readonly string[];
  readonly startersPoints: readonly number[];
  readonly players: readonly string[];
  readonly playerPoints: Readonly<Record<string, number>>;
}

/** One roster move. */
export interface SleeperTransaction {
  readonly transactionId: string;
  /** `trade` · `waiver` · `free_agent` · `commissioner`. */
  readonly type: string;
  /** `complete` · `failed` · `pending`. Failed waivers are kept — they are story material. */
  readonly status: string;
  readonly week: number;
  /** Sleeper's creation time in epoch milliseconds. */
  readonly createdMs: number | null;
  readonly creatorUserId: string | null;
  readonly rosterIds: readonly number[];
  /** Player ID → roster ID receiving them. */
  readonly adds: Readonly<Record<string, number>>;
  readonly drops: Readonly<Record<string, number>>;
  readonly waiverBid: number | null;
}

/** The NFL's current position in the calendar. */
export interface SleeperState {
  readonly season: number;
  readonly seasonType: string;
  readonly week: number;
  readonly displayWeek: number;
  readonly leg: number;
}

/**
 * A decode that succeeded, possibly with complaints.
 *
 * `10 §13` requires the adapter tolerate missing fields. Decoding therefore
 * does not throw on an unexpected shape — it records a warning and carries on
 * with what it could read. A failed Tuesday sync is worse than a sync that
 * reports two odd fields.
 */
export interface Decoded<T> {
  readonly value: T;
  readonly warnings: readonly string[];
}

/** Where a decode could not proceed at all. */
export class SleeperDecodeError extends Error {
  constructor(
    message: string,
    readonly endpointKey: string,
  ) {
    super(`${endpointKey}: ${message}`);
    this.name = 'SleeperDecodeError';
  }
}
