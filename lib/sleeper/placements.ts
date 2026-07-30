/**
 * Complete final placements, 1 through N.
 *
 * Sleeper splits the postseason across two endpoints and marks placement games
 * with `p` in **both** of them. The critical fact is that **`p` is bracket-
 * relative**: in the winners bracket `p=1` is the championship, and in the
 * losers bracket `p=1` is the top of the consolation round — 7th place in this
 * ten-team, six-team-playoff league.
 *
 * Read the losers bracket as if it were the winners bracket and Sleeper will
 * cheerfully tell you that 2024's champion was Nick, who finished 7th. Nothing
 * in the payload distinguishes them; only the endpoint they came from does. So
 * a bracket is never a bare array here — it is a value that carries which
 * endpoint produced it, and the kind is checked twice:
 *
 *   - by label, via {@link winnersBracket} / {@link losersBracket};
 *   - by **shape**, because a label is only as good as the caller that set it.
 *     A winners bracket in this league has exactly `playoff_teams` entrants and
 *     a losers bracket has the rest. A mislabelled bracket fails that check.
 *
 * Deriving 7th–10th matters beyond tidiness. `losers_bracket` is already
 * fetched and committed, and leaving it unread renders four managers a season
 * as "no finish recorded" when the answer is sitting in the repository.
 */
import { type SleeperBracketMatch } from './types';

export type BracketKind = 'winners' | 'losers';

/** A bracket that remembers which endpoint it came from. */
export interface KindedBracket {
  readonly kind: BracketKind;
  readonly matches: readonly SleeperBracketMatch[];
}

export function winnersBracket(matches: readonly SleeperBracketMatch[]): KindedBracket {
  return { kind: 'winners', matches };
}

export function losersBracket(matches: readonly SleeperBracketMatch[]): KindedBracket {
  return { kind: 'losers', matches };
}

/** A bracket was passed where the other kind belongs. */
export class BracketKindError extends Error {
  constructor(
    readonly expected: BracketKind,
    readonly received: BracketKind,
    detail: string,
  ) {
    super(
      `Expected the ${expected} bracket, received the ${received} bracket. ${detail} ` +
        `Sleeper's placement field is bracket-relative — reading a losers bracket as a ` +
        `championship bracket reports the 7th-place finisher as the champion.`,
    );
    this.name = 'BracketKindError';
  }
}

export interface LeagueBracketShape {
  readonly totalRosters: number;
  readonly playoffTeams: number;
}

export interface FullPlacements {
  /** Placement (1-based) → roster ID, for every position derivable. */
  readonly byPosition: Readonly<Record<number, number>>;
  /** Roster ID → placement. The lookup persistence actually wants. */
  readonly rankByRoster: Readonly<Record<number, number>>;
  readonly championRosterId: number | null;
  readonly runnerUpRosterId: number | null;
  readonly thirdPlaceRosterId: number | null;
  /**
   * Rosters that reached the playoffs.
   *
   * Empty until the bracket has decided something. Sleeper publishes the 2026
   * bracket during the preseason with first-round slots already filled, and
   * reading that as "these six made the playoffs" would congratulate people on
   * a January they have not reached.
   */
  readonly playoffRosterIds: readonly number[];
  /** Playoff entrants with no first-round game. Not wins, not losses. */
  readonly byeRosterIds: readonly number[];
  /** Every position 1..totalRosters is filled exactly once. */
  readonly isComplete: boolean;
  readonly warnings: readonly string[];
}

/** Every roster named as a participant anywhere in a bracket, ascending. */
function entrants(matches: readonly SleeperBracketMatch[]): readonly number[] {
  return [
    ...new Set(
      matches
        .flatMap((match) => [match.team1RosterId, match.team2RosterId])
        .filter((rosterId): rosterId is number => rosterId !== null),
    ),
  ].sort((a, b) => a - b);
}

/** Any match has produced a winner, so the bracket is played and not merely drawn. */
function hasBeenPlayed(matches: readonly SleeperBracketMatch[]): boolean {
  return matches.some((match) => match.winnerRosterId !== null);
}

/**
 * Playoff entrants with no round-1 game.
 *
 * Derived from the bracket rather than from seeding, because a bye is a fact
 * about the draw. Verified against both recorded seasons: 2024 gives rosters
 * 1 and 9, 2025 gives 5 and 6 — exactly the rosters left unpaired in week 15.
 */
export function deriveByeRosterIds(bracket: KindedBracket): readonly number[] {
  if (bracket.kind !== 'winners') return [];

  const firstRound = Math.min(...bracket.matches.map((match) => match.round));
  if (!Number.isFinite(firstRound)) return [];

  const played = new Set(
    bracket.matches
      .filter((match) => match.round === firstRound)
      .flatMap((match) => [match.team1RosterId, match.team2RosterId])
      .filter((rosterId): rosterId is number => rosterId !== null),
  );

  return entrants(bracket.matches).filter((rosterId) => !played.has(rosterId));
}

/**
 * Assert a bracket's shape matches its label.
 *
 * The label is set by whoever fetched it; this checks the claim against the
 * league's own configuration, so a bracket handed to the wrong parameter is
 * rejected even when the label was set wrongly too.
 */
function assertShape(
  bracket: KindedBracket,
  expected: BracketKind,
  shape: LeagueBracketShape,
): void {
  if (bracket.kind !== expected) {
    throw new BracketKindError(expected, bracket.kind, 'The bracket is labelled for the other endpoint.');
  }
  if (bracket.matches.length === 0) return;

  const found = entrants(bracket.matches).length;
  const consolationTeams = shape.totalRosters - shape.playoffTeams;
  const wanted = expected === 'winners' ? shape.playoffTeams : consolationTeams;

  if (found !== wanted) {
    throw new BracketKindError(
      expected,
      expected === 'winners' ? 'losers' : 'winners',
      `The ${expected} bracket should name ${String(wanted)} rosters in a ` +
        `${String(shape.totalRosters)}-team league with ${String(shape.playoffTeams)} playoff ` +
        `teams, but it names ${String(found)}.`,
    );
  }
}

/** Fill placements from one bracket, offsetting the losers bracket's relative `p`. */
function collect(
  matches: readonly SleeperBracketMatch[],
  offset: number,
  byPosition: Record<number, number>,
  warnings: string[],
  label: string,
): void {
  for (const match of matches) {
    if (match.placement === null) continue;

    const position = match.placement + offset;

    if (match.winnerRosterId === null) {
      warnings.push(
        `${label} placement game ${String(match.placement)} (match ${String(match.matchId)}) ` +
          `has no winner recorded — the season may be unfinished.`,
      );
      continue;
    }

    if (byPosition[position] !== undefined && byPosition[position] !== match.winnerRosterId) {
      warnings.push(
        `Placement ${String(position)} was claimed by two different rosters ` +
          `(${String(byPosition[position])} and ${String(match.winnerRosterId)}).`,
      );
      continue;
    }

    byPosition[position] = match.winnerRosterId;
    if (match.loserRosterId !== null) byPosition[position + 1] = match.loserRosterId;
  }
}

/**
 * Derive the complete 1..N finish from both brackets.
 *
 * The winners bracket settles 1..`playoffTeams`; the losers bracket settles the
 * rest, its relative placements shifted by `playoffTeams`. The result is only
 * reported complete when every position is filled exactly once by exactly one
 * roster — a partition, checked rather than assumed, because a silently
 * overlapping bracket would hand someone else's finish to a manager.
 */
export function deriveFullPlacements(
  winners: KindedBracket,
  losers: KindedBracket,
  shape: LeagueBracketShape,
): FullPlacements {
  assertShape(winners, 'winners', shape);
  assertShape(losers, 'losers', shape);

  const byPosition: Record<number, number> = {};
  const warnings: string[] = [];

  collect(winners.matches, 0, byPosition, warnings, 'Winners bracket');
  // The consolation bracket's `p=1` is the best of the teams that missed the
  // playoffs, which is `playoffTeams + 1` overall.
  collect(losers.matches, shape.playoffTeams, byPosition, warnings, 'Consolation bracket');

  const played = hasBeenPlayed(winners.matches);
  const winnersEntrants = entrants(winners.matches);

  if (!played && winnersEntrants.length > 0) {
    warnings.push(
      `The winners bracket names ${String(winnersEntrants.length)} rosters but no game has ` +
        `been decided; playoff participation is not derivable yet and was left unclaimed.`,
    );
  }

  const positions = Object.keys(byPosition).map(Number);
  const filled = new Set(positions);
  const claimants = Object.values(byPosition);

  const missing: number[] = [];
  for (let position = 1; position <= shape.totalRosters; position++) {
    if (!filled.has(position)) missing.push(position);
  }

  const duplicated = claimants.length !== new Set(claimants).size;
  const isComplete = missing.length === 0 && !duplicated && claimants.length === shape.totalRosters;

  if (missing.length > 0 && played) {
    warnings.push(
      `No finish could be derived for position${missing.length === 1 ? '' : 's'} ` +
        `${missing.join(', ')}.`,
    );
  }
  if (duplicated) {
    warnings.push('A roster holds more than one final placement; the brackets do not partition the league.');
  }

  const rankByRoster: Record<number, number> = {};
  for (const [position, rosterId] of Object.entries(byPosition)) {
    rankByRoster[rosterId] = Number(position);
  }

  return {
    byPosition,
    rankByRoster,
    championRosterId: byPosition[1] ?? null,
    runnerUpRosterId: byPosition[2] ?? null,
    thirdPlaceRosterId: byPosition[3] ?? null,
    playoffRosterIds: played ? winnersEntrants : [],
    byeRosterIds: played ? deriveByeRosterIds(winners) : [],
    isComplete,
    warnings,
  };
}
