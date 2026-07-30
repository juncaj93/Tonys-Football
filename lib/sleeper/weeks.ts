/**
 * Week classification — the single answer to "does this score count?"
 *
 * This module exists because of a specific, verified trap. Sleeper keeps
 * reporting points for a roster after that roster's season is over:
 *
 *   - **Week 18** returns all ten rosters with `matchup_id: null` and non-zero
 *     points in both completed seasons. The league's season ends in week 17.
 *     Those are NFL week-18 player scores accruing on a roster nobody is
 *     managing — not a fantasy result.
 *   - **Weeks 15–17** keep scoring eliminated teams alongside the real playoff
 *     games. In 2025's championship week six of ten rosters are unpaired.
 *   - **Week 15** also contains the top two seeds' **byes**, which are not
 *     losses, not wins, and must not break a streak.
 *
 * Read naively, the league's lowest weekly score ever is 26.50 (2025 week 18)
 * and 37.80 (2024 week 18). Both are fabrications. The true regular-season
 * lows are 62.74 and 70.48. `16 §12` forbids exactly this class of claim, so
 * the rule lives in one place and every statistic asks it rather than
 * re-deriving a `week <= 14` that will eventually be wrong.
 *
 * **Nothing here hardcodes week 15.** All three recorded seasons happen to set
 * `playoff_week_start = 15`, and a league that moves it must not silently
 * reclassify its own history (Technical Lead ruling 2026-07-29 §6).
 */
import { type SleeperBracketMatch, type SleeperLeague } from './types';

export type WeekType =
  /** A regular-season game. The default scope for every record and streak. */
  | 'regular'
  /** A playoff or consolation game. Real, but counted and labelled separately. */
  | 'playoff'
  /** Points exist but no fantasy game was played. Never a result. */
  | 'unscored'
  /** The league's shape is unknown, so no claim can be made. */
  | 'unknown';

/**
 * The week boundaries of one season, derived rather than assumed.
 *
 * `lastScoredWeek` is the final week in which the league actually played. It
 * is what separates a playoff week from the week-18 noise, and Sleeper gives
 * it three different ways depending on how far along the season is.
 */
export interface SeasonWeekShape {
  readonly playoffWeekStart: number | null;
  readonly lastScoredWeek: number | null;
  /** How `lastScoredWeek` was established, for diagnostics. */
  readonly lastScoredSource: 'last_scored_leg' | 'bracket_rounds' | 'none';
}

export const UNKNOWN_WEEK_SHAPE: SeasonWeekShape = {
  playoffWeekStart: null,
  lastScoredWeek: null,
  lastScoredSource: 'none',
};

/**
 * Work out where the regular season ends and where the league stops playing.
 *
 * Preference order matters. `settings.last_scored_leg` is Sleeper's own record
 * of the last week it scored and is present on both completed seasons (17). A
 * league that has not started has no such value, so the bracket's round count
 * stands in: rounds are laid out from `playoff_week_start`, one week each.
 */
export function deriveWeekShape(
  league: Pick<SleeperLeague, 'playoffWeekStart' | 'lastScoredLeg'>,
  winnersBracket: readonly SleeperBracketMatch[] = [],
): SeasonWeekShape {
  const playoffWeekStart = league.playoffWeekStart;

  if (league.lastScoredLeg !== null && league.lastScoredLeg > 0) {
    return {
      playoffWeekStart,
      lastScoredWeek: league.lastScoredLeg,
      lastScoredSource: 'last_scored_leg',
    };
  }

  if (playoffWeekStart !== null && winnersBracket.length > 0) {
    const rounds = Math.max(...winnersBracket.map((match) => match.round));
    if (Number.isFinite(rounds) && rounds > 0) {
      return {
        playoffWeekStart,
        lastScoredWeek: playoffWeekStart + rounds - 1,
        lastScoredSource: 'bracket_rounds',
      };
    }
  }

  return { playoffWeekStart, lastScoredWeek: null, lastScoredSource: 'none' };
}

/**
 * Classify one week.
 *
 * Returns `unknown` rather than guessing when the league shape is unavailable.
 * `isScoredWeek` treats `unknown` as not-scored, so an unclassifiable week can
 * never contribute to a record — the conservative direction, and the only one
 * consistent with "never fabricate".
 */
export function classifyWeek(week: number, shape: SeasonWeekShape): WeekType {
  if (!Number.isInteger(week) || week < 1) return 'unknown';
  if (shape.playoffWeekStart === null) return 'unknown';

  if (week < shape.playoffWeekStart) return 'regular';
  if (shape.lastScoredWeek === null) return 'unknown';
  if (week > shape.lastScoredWeek) return 'unscored';

  return 'playoff';
}

/** Whether a week produced fantasy results at all. */
export function isScoredWeek(type: WeekType): boolean {
  return type === 'regular' || type === 'playoff';
}

/** The minimum a matchup row needs for this module to judge it. */
export interface ScorableEntry {
  readonly rosterId: number;
  readonly matchupId: number | null;
}

/**
 * Whether one roster's row in one week is a fantasy result.
 *
 * Two independent conditions, and both are load-bearing. The week must have
 * been played at all, **and** the row must be paired: an unpaired row in a
 * played week is a bye or an eliminated team still accruing points, and in
 * neither case did a game happen.
 */
export function isScoredEntry(entry: ScorableEntry, type: WeekType): boolean {
  return isScoredWeek(type) && entry.matchupId !== null;
}

/** Why a roster has points but no game. */
export type UnpairedReason =
  /** Earned a first-round bye. Not a win, not a loss, does not break a streak. */
  | 'bye'
  /** Knocked out; the points are real NFL scoring with nothing riding on it. */
  | 'eliminated'
  /** The league had stopped playing. Week 18. */
  | 'season_over'
  | 'unknown';

/**
 * Explain an unpaired roster.
 *
 * `16 §7.4` needs this distinction for the shop — "eliminated managers dim,
 * they do not disappear" — and streak arithmetic needs it so a bye is skipped
 * rather than counted. Both are wrong if every unpaired row looks alike.
 */
export function explainUnpaired(
  rosterId: number,
  type: WeekType,
  context: { readonly byeRosterIds: readonly number[]; readonly playoffWeekStart: number | null },
  week: number,
): UnpairedReason {
  if (type === 'unscored') return 'season_over';
  if (type === 'unknown') return 'unknown';
  if (type === 'regular') return 'unknown';

  const isFirstPlayoffWeek =
    context.playoffWeekStart !== null && week === context.playoffWeekStart;

  if (isFirstPlayoffWeek && context.byeRosterIds.includes(rosterId)) return 'bye';
  return 'eliminated';
}
