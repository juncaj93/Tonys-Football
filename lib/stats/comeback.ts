import { type SnapshotEntry, type WeekSnapshotMap } from '@/lib/stats/snapshot';
import { type WeekGame } from '@/lib/stats/week';

/**
 * What Monday did to a game. Pure, deterministic, and nowhere near a sentence.
 *
 * `07 §8` wants the paper to be able to say *"came back on Monday night"*. That
 * claim is only checkable against a **stored pre-Monday score**, which is why
 * `16 §4.3` spends one of its two permitted cron jobs on capturing one. This
 * module is the arithmetic between that photograph and the finalized result, and
 * it is the only place that arithmetic happens.
 *
 * ## It computes; it does not judge
 *
 * No projections, no win probability, no odds, no model. Two scores at one
 * moment, two scores at the end, and subtraction. Every value it returns is
 * recomputable from two stored rows months later, which is the property that
 * makes a published claim answerable rather than merely confident.
 *
 * ## What separates a comeback from an ordinary Monday
 *
 * Almost every game moves on Monday; almost none of them is a story. Two things
 * have to be true at once:
 *
 *   1. **The result flipped.** Whoever was ahead on Sunday night is not the one
 *      who won. This is the event. A leader extending a lead is not a comeback
 *      however many points moved, and calling it one is exactly the *"do not
 *      call every ordinary Monday scoring change a comeback"* failure.
 *   2. **The deficit was real.** Trailing by a tenth of a point and winning is a
 *      coin landing on its edge, not a recovery.
 *
 * The second is a threshold, and this module does **not** own it. It reports the
 * numbers; `lib/stats/stories.ts` scores them against `STORY_GATES` like every
 * other story kind, and `STORY_FLOOR` decides whether the paper prints it. That
 * is deliberate: a threshold living here would be a second, invisible editorial
 * policy sitting under the one that is written down.
 *
 * ## Every outcome is named, including the ones that say nothing
 *
 * A caller that cannot tell *"nobody came back"* from *"we do not know"* will
 * eventually publish the second as the first. So `no-snapshot`, `not-final` and
 * `unpaired` are outcomes rather than nulls, and each one is a different reason
 * the paper must stay quiet.
 */

export type ComebackOutcome =
  /** Trailed at the snapshot, won the game. The story. */
  | 'comeback'
  /** Led at the snapshot, won the game. The ordinary case. */
  | 'held'
  /** Led at the snapshot, lost the game. The other side of a comeback. */
  | 'collapse'
  /** Trailed at the snapshot, lost the game. Nothing happened. */
  | 'never-led'
  /** Level at the snapshot. Nobody came from behind, because nobody was behind. */
  | 'tied-at-snapshot'
  /** The week was never photographed. Not a finding — an absence of evidence. */
  | 'no-snapshot'
  /** The game has no decided result yet, or its result is not publishable. */
  | 'not-final'
  /** A bye, an unpaired roster, or a snapshot whose sides do not match the game. */
  | 'unpaired';

export interface ComebackFact {
  readonly outcome: ComebackOutcome;
  /** Joins this fact to its game. */
  readonly sleeperMatchupId: number;
  /**
   * The manager who ended up winning, and the one who did not.
   *
   * Display names, matching every other `StoryDetail`. Null whenever the outcome
   * is one of the three that say nothing — there is no winner to name.
   */
  readonly winner: string | null;
  readonly loser: string | null;
  /**
   * How far the eventual **winner** was behind at the snapshot, in cents.
   *
   * Positive on a `comeback` and zero otherwise, so a renderer never has to
   * check the sign to know whether there is a deficit worth saying.
   */
  readonly deficitCents: number;
  /** How far the eventual **loser** was ahead at the snapshot. Mirror of the above. */
  readonly blownLeadCents: number;
  /** The margin the game finished on, in cents. Always non-negative. */
  readonly finalMarginCents: number;
  /**
   * How much the game moved between the photograph and the whistle.
   *
   * The signed swing in the eventual winner's favour: `deficit + final margin`
   * on a comeback, and the plain change in margin otherwise. This is the number
   * that says *how big* Monday was.
   */
  readonly swingCents: number;
  /** The side that was ahead at the snapshot is not the side that won. */
  readonly flipped: boolean;
}

/** Nothing can be said about this game, and this is why. */
function silent(sleeperMatchupId: number, outcome: ComebackOutcome): ComebackFact {
  return {
    outcome,
    sleeperMatchupId,
    winner: null,
    loser: null,
    deficitCents: 0,
    blownLeadCents: 0,
    finalMarginCents: 0,
    swingCents: 0,
    flipped: false,
  };
}

/**
 * Does this snapshot describe this game?
 *
 * Rosters can only be compared as a **pair**, because Sleeper's `roster_a` and
 * `roster_b` ordering within a matchup is ours rather than theirs — `buildWeek`
 * sorts, and a snapshot written by a different code path could legitimately have
 * them the other way round. A snapshot naming a roster the game does not is a
 * different game, and using it would attribute one manager's Sunday to another.
 */
function describesTheSameGame(snapshot: SnapshotEntry, game: WeekGame): boolean {
  const shot = [snapshot.rosterAId, snapshot.rosterBId].sort((x, y) => x - y);
  const real = [game.a.rosterId, game.b.rosterId].sort((x, y) => x - y);
  return shot[0] === real[0] && shot[1] === real[1];
}

/** The snapshot's points for one roster, or null when it names neither side. */
function pointsFor(snapshot: SnapshotEntry, rosterId: number): number | null {
  if (snapshot.rosterAId === rosterId) return snapshot.pointsACents;
  if (snapshot.rosterBId === rosterId) return snapshot.pointsBCents;
  return null;
}

/**
 * What Monday did to one game.
 *
 * `game` must be a finalized, publishable game as `buildWeek` produced it. The
 * function refuses rather than guesses on anything else.
 */
export function comebackFor(game: WeekGame, snapshots: WeekSnapshotMap): ComebackFact {
  const id = game.sleeperMatchupId;

  /*
   * A tie is a decided result and not a comeback: nobody came from behind to
   * draw level *and* win, because nobody won. It reports `not-final` rather than
   * a fifth silent outcome, because to this module a game with no winner is a
   * game with no result to have come back to.
   */
  if (!game.publishable || game.winner === null || game.loser === null) {
    return silent(id, 'not-final');
  }

  const snapshot = snapshots.get(id);
  if (snapshot === undefined) return silent(id, 'no-snapshot');
  if (!describesTheSameGame(snapshot, game)) return silent(id, 'unpaired');

  const winnerSide = game.winner;
  const loserSide = game.loser;
  /*
   * A publishable game always has both names — `publishableWeek` has already
   * dropped every game whose managers are unresolved or not active. Checked
   * anyway, because `WeekGame.displayName` is nullable in the type and a fact
   * that quietly names `null` is worse than one that declines.
   */
  if (winnerSide.displayName === null || loserSide.displayName === null) {
    return silent(id, 'unpaired');
  }

  const winnerThen = pointsFor(snapshot, winnerSide.rosterId);
  const loserThen = pointsFor(snapshot, loserSide.rosterId);
  if (winnerThen === null || loserThen === null) return silent(id, 'unpaired');

  const finalMarginCents = game.marginCents;
  const gapThen = winnerThen - loserThen;

  const base = {
    sleeperMatchupId: id,
    winner: winnerSide.displayName,
    loser: loserSide.displayName,
    finalMarginCents,
  } as const;

  if (gapThen === 0) {
    return {
      ...base,
      outcome: 'tied-at-snapshot',
      deficitCents: 0,
      blownLeadCents: 0,
      // Level to a finished margin is the whole of the movement.
      swingCents: finalMarginCents,
      flipped: false,
    };
  }

  if (gapThen < 0) {
    // The eventual winner was behind. The result flipped, by definition.
    const deficitCents = -gapThen;
    return {
      ...base,
      outcome: 'comeback',
      deficitCents,
      blownLeadCents: deficitCents,
      swingCents: deficitCents + finalMarginCents,
      flipped: true,
    };
  }

  // The eventual winner was already ahead. Nothing flipped.
  return {
    ...base,
    outcome: 'held',
    deficitCents: 0,
    blownLeadCents: 0,
    swingCents: finalMarginCents - gapThen,
    flipped: false,
  };
}

/**
 * The same fact from the loser's side of the table.
 *
 * `comebackFor` is written from the winner's point of view because that is whose
 * story it is. A `collapse` is the identical event seen from the other chair,
 * and the paper occasionally wants to lead with that — so it is derived here
 * rather than computed a second time, which is what would let the two disagree.
 */
export function asCollapse(fact: ComebackFact): ComebackFact {
  if (fact.outcome !== 'comeback') {
    return fact.outcome === 'held' ? { ...fact, outcome: 'never-led' } : fact;
  }
  return { ...fact, outcome: 'collapse' };
}

/** Every game of a week, in the week's own order. */
export function comebacksForWeek(
  games: readonly WeekGame[],
  snapshots: WeekSnapshotMap,
): readonly ComebackFact[] {
  return games.map((game) => comebackFor(game, snapshots));
}
