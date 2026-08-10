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
import { type RosterMetadata } from './metadata';

export { type RosterMetadata };

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
  /** How many rosters reach the winners bracket. 6 in every recorded season. */
  readonly playoffTeams: number | null;
  readonly playoffWeekStart: number | null;
  /** Sleeper's week counter for the season; 17 on a completed season. */
  readonly leg: number | null;
  /**
   * The last week the league actually scored.
   *
   * 17 on both completed seasons, absent before a season starts. This is what
   * separates a real playoff week from the week-18 points that keep accruing
   * after the league has stopped playing — see `weeks.ts`.
   */
  readonly lastScoredLeg: number | null;
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
  /**
   * League-authored text kept from Sleeper's roster metadata — manager-written
   * player nicknames and the record/streak strings. Personal notification
   * settings are discarded. See `metadata.ts`.
   */
  readonly metadata: RosterMetadata;
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

/** FAAB moving between rosters as part of a trade. */
export interface FaabTransfer {
  readonly amount: number;
  readonly fromRosterId: number;
  readonly toRosterId: number;
}

/** A draft pick changing hands in a trade. */
export interface TradedDraftPick {
  readonly season: string;
  readonly round: number;
  /** The roster whose original pick this is. */
  readonly originalRosterId: number | null;
  readonly fromRosterId: number | null;
  readonly toRosterId: number | null;
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
  /** When the move settled — a waiver claim processes later than it is placed. */
  readonly statusUpdatedMs: number | null;
  readonly creatorUserId: string | null;
  readonly rosterIds: readonly number[];
  /** Player ID → roster ID receiving them. */
  readonly adds: Readonly<Record<string, number>>;
  readonly drops: Readonly<Record<string, number>>;
  /** Winning bid on a waiver claim. */
  readonly waiverBid: number | null;
  /**
   * FAAB sent between rosters in a trade.
   *
   * Not optional detail: 23 of the 41 trades in the recorded seasons move
   * budget, and a trade summarized without it is simply wrong about what was
   * exchanged.
   */
  readonly faabTransfers: readonly FaabTransfer[];
  /**
   * Draft picks traded. Always empty in the recorded seasons — this is a
   * redraft league — but the field exists upstream and a keeper format would
   * populate it, so it is captured rather than silently discarded.
   */
  readonly draftPicks: readonly TradedDraftPick[];
  /** Rosters that agreed to a trade. Empty for non-trades. */
  readonly consenterRosterIds: readonly number[];
}

/**
 * One draft the league has held.
 *
 * Everything here is a fact Sleeper states about the draft itself. Nothing is
 * derived — a draft that has not finished says so in `status`, and the adapter
 * refuses it rather than treating a half-finished board as a completed one.
 */
export interface SleeperDraft {
  readonly draftId: string;
  readonly leagueId: string | null;
  /** `pre_draft` · `drafting` · `complete`. The only one the product acts on is the last. */
  readonly status: string;
  /** `snake` · `linear` · `auction`. Recorded, never assumed. */
  readonly type: string;
  readonly season: number | null;
  /** Rounds the draft was configured for. Null when Sleeper omits it. */
  readonly rounds: number | null;
  /** When the first pick was made, epoch milliseconds. */
  readonly startTimeMs: number | null;
  /** When the last pick was made, epoch milliseconds. The draft's real end. */
  readonly lastPickedMs: number | null;
}

/*
 * There is deliberately no `slotToRosterId` here.
 *
 * Sleeper carries it on `/draft/{id}` and sends `null` for it in
 * `/league/{id}/drafts`, which is the endpoint this adapter reads — so a field
 * would have been permanently empty and would have read as *"this league had no
 * draft order"*.
 *
 * Nothing wants it either. **Which seat picked where is a fact about each
 * pick**, and every pick carries its own `draft_slot`; deriving the board from
 * the picks means the slot beside a player is the slot that took them rather
 * than a second table agreeing with the first. `draft_order` — the other
 * candidate — maps a *user* to a slot, and a user is a person while a slot
 * belongs to a seat (`16 §4`).
 */

/**
 * One pick, as Sleeper records it.
 *
 * The player's name arrives **inside the pick**, in `metadata`, which is the
 * reason this whole feature needs no second lookup: `/players/nfl` is a 14.6 MB
 * response (`lib/sleeper/fixtures.ts`) and a draft review that had to join
 * against it could not be built from a cron. A pick carries who was taken.
 */
export interface SleeperDraftPick {
  readonly draftId: string;
  /** 1..N across the whole draft. The natural key, with `draftId`. */
  readonly pickNo: number;
  readonly round: number;
  readonly draftSlot: number | null;
  readonly rosterId: number | null;
  /** Sleeper's own player id. `"7564"` for a person, `"DEN"` for a defense. */
  readonly playerId: string | null;
  /** As printed: `Ja'Marr Chase`, `Denver Broncos`. Empty when Sleeper sent no name. */
  readonly playerName: string;
  /** `QB` · `RB` · `WR` · `TE` · `DEF`. Never `K` — this league has no kickers. */
  readonly position: string | null;
  /** The NFL team, as an abbreviation. */
  readonly nflTeam: string | null;
  /**
   * A kept player rather than a fresh selection.
   *
   * `max_keepers: 1` is set on the 2026 league, so this is reachable. Recorded
   * rather than flattened, because *"their round-four pick"* and *"the player
   * they kept"* are different claims and printing one as the other would be the
   * kind of quiet falsehood `16 §12` forbids.
   */
  readonly isKeeper: boolean;
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
