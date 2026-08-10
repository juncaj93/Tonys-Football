import { LEAGUE_2026, WEEK_1_SEATS } from './week-1';
import {
  type ScriptedBracketMatch,
  type ScriptedGame,
  type ScriptedWeek,
  type SeasonScript,
} from './script';

/**
 * The 2026 postseason, written down — week 16 and the two weeks around it.
 *
 * ## Why week 16 is a scenario and not a week number
 *
 * This league's `playoff_week_start` is **15** and its winners bracket is three
 * rounds, so week 16 is the **semifinal**. That much is obvious. What is not is
 * the consequence that shapes every assertion in `week-16.test.ts`:
 *
 * > **Six of the ten final placements settle in week 16, and the four that
 * > decide a championship do not.**
 *
 * Sleeper's six-team draw puts a `p=5` game in round 2 — the two first-round
 * losers playing for fifth — and the consolation bracket's round 2 carries `p=1`
 * and `p=3`, which offset to the league's 7th and 9th. So the Tuesday of week 16
 * legitimately writes `final_rank` for six managers and legitimately writes
 * nothing for the four still alive. A rehearsal that modelled the postseason as
 * one bracket resolving at the end would test none of that.
 *
 * The layout below matches the **recorded** 2026 draw, match id for match id.
 *
 * ## The scoreboard is written, not generated
 *
 * `docs/WEEK_1_REHEARSAL.md §8` says a scenario needing a league that has *been
 * somewhere* should write its scoreboard, and a playoff seeding is the strongest
 * possible case: the bracket is a *consequence* of fourteen weeks, so the table
 * those weeks produce has to be one somebody chose. Weeks 1–14 are a complete
 * round robin plus five, with a standing that separates cleanly into a top six.
 *
 * These numbers are **test data and are never presented as league fact** — the
 * same standing `script.ts` holds.
 *
 * ## What each playoff game is here to exercise
 *
 * | Week | Game | What it is for |
 * |---|---|---|
 * | 15 | Alex v Zack, Cheese v Matty B | Round one. **Joe and Ryan are on byes** — two rosters scoring with no game, which is not a win, not a loss and not a reward |
 * | 15 | Nathan v Nick, Brandon v Matt Lee | The consolation ladder, running beside the bracket and settling nothing yet |
 * | 16 | **Joe v Alex, 0.42** | The close semifinal. A margin small enough that a rounding defect changes who reaches the final |
 * | 16 | **Ryan v Cheese, 41.86** | The clear win, and the week's high score |
 * | 16 | Zack v Matty B | The **fifth-place game** — two teams already out of the title race. Settles 5th and 6th, and must not read as an elimination |
 * | 16 | Nathan v Brandon, Nick v Matt Lee | The consolation finals. Settle 7th–10th, and must never reach a title-track surface |
 * | 17 | Joe v Ryan | The final |
 * | 17 | Alex v Cheese | Third place — the game that proves a semifinal loser is **not** done for the year |
 */

/** Roster → the name Tony uses. The same seats week 1 rehearses. */
export const WEEK_16_SEATS = WEEK_1_SEATS;

/** The league's postseason shape, from the recorded 2026 league payload. */
export const PLAYOFF_WEEK_START = 15;
export const PLAYOFF_TEAMS = 6;
export const CHAMPIONSHIP_WEEK = 17;

/** Week 16 is round two of three. Derived here so no test restates it. */
export const SEMIFINAL_WEEK = 16;

/**
 * The seeding the regular season below produces, best first.
 *
 * Asserted by the rehearsal rather than trusted: the bracket is drawn to these
 * roster ids, so a change to the scoreboard that moved the table would otherwise
 * silently draw a bracket the standings do not justify.
 */
export const SEEDS = [3, 6, 1, 8, 10, 4, 2, 7, 9, 5] as const;

/** The six who reach the bracket, ascending by roster id. */
export const QUALIFIERS = [1, 3, 4, 6, 8, 10] as const;
/** The four who do not, ascending. They play the consolation ladder. */
export const MISSED_OUT = [2, 5, 7, 9] as const;
/** The top two seeds. No round-one game. */
export const BYES = [3, 6] as const;
/** Still playing for the title after week 16. */
export const STILL_IN = [1, 3, 6, 8] as const;

/**
 * What week 16 settles, and what it must leave alone.
 *
 * Written here as the scenario's own expectation so the test reads as a
 * comparison rather than as a second derivation of the bracket.
 */
export const RANKS_AFTER_SEMIFINAL: Readonly<Record<number, number>> = {
  4: 5,
  10: 6,
  2: 7,
  7: 8,
  5: 9,
  9: 10,
};

/** The complete finish, once week 17 has been played. */
export const FINAL_RANKS: Readonly<Record<number, number>> = {
  3: 1,
  6: 2,
  1: 3,
  8: 4,
  ...RANKS_AFTER_SEMIFINAL,
};

/* -------------------------------------------------------------------------
 * The regular season
 * ---------------------------------------------------------------------- */

/**
 * Fourteen weeks, as a complete round robin plus five.
 *
 * Generated from a table of per-roster strengths rather than typed out, because
 * seventy games is not a thing anybody can read and the *outcomes* that matter
 * are the standings rather than any individual afternoon. The playoff weeks
 * below are written by hand, because those are the games the assertions name.
 *
 * The two readings are equal here: nothing in the regular season of this
 * scenario is a Monday comeback, and `07 §8`'s story is week 1's to rehearse.
 */
const STRENGTH: Readonly<Record<number, number>> = {
  3: 10,
  6: 9,
  1: 8,
  8: 7,
  10: 6,
  4: 5,
  2: 3,
  7: 4,
  9: 2,
  5: 1,
};

/** The circle method: ten teams, a nine-week cycle, fourteen weeks of it. */
function regularPairings(week: number): readonly (readonly [number, number])[] {
  const rotating = [2, 3, 4, 5, 6, 7, 8, 9, 10];
  const shift = (week - 1) % rotating.length;
  const order = [1, ...rotating.slice(shift), ...rotating.slice(0, shift)];

  const pairs: (readonly [number, number])[] = [];
  for (let index = 0; index < 5; index++) {
    pairs.push([order[index]!, order[9 - index]!]);
  }
  return pairs;
}

/** Distinct to the cent, in this league's real scoring range, and deterministic. */
function regularScore(rosterId: number, week: number): number {
  const wobble = ((rosterId * 7919 + week * 104729) % 4001) / 100;
  return Math.round((80 + (STRENGTH[rosterId] ?? 5) * 2.1 + wobble) * 100) / 100;
}

const REGULAR_WEEKS: readonly ScriptedWeek[] = Array.from({ length: 14 }, (_, index) => {
  const week = index + 1;
  return {
    week,
    games: regularPairings(week).map(
      ([home, away], slot): ScriptedGame => ({
        matchupId: slot + 1,
        rosters: [home, away],
        preMonday: [regularScore(home, week), regularScore(away, week)],
        final: [regularScore(home, week), regularScore(away, week)],
      }),
    ),
  };
});

/* -------------------------------------------------------------------------
 * The postseason
 * ---------------------------------------------------------------------- */

/** A playoff game, written out. Both readings equal unless a comeback is wanted. */
function game(
  matchupId: number,
  rosters: readonly [number, number],
  final: readonly [number, number],
  preMonday?: readonly [number, number],
): ScriptedGame {
  return { matchupId, rosters, final, preMonday: preMonday ?? final };
}

const POSTSEASON: readonly ScriptedWeek[] = [
  {
    week: 15,
    postseason: true,
    games: [
      // Round one. Joe (seed 1) and Ryan (seed 2) are on byes and appear in no
      // game at all — which is what makes them unpaired rows in the payload.
      game(1, [1, 4], [121.4, 112.61]),
      game(2, [8, 10], [113.49, 109.73]),
      // The consolation ladder, first round.
      game(3, [2, 5], [110.07, 103.38]),
      game(4, [7, 9], [108.02, 102.16]),
    ],
  },
  {
    week: 16,
    postseason: true,
    games: [
      // The close semifinal — 0.42.
      game(1, [3, 1], [130.97, 130.55]),
      // The clear win, and the week's high score — 41.86.
      game(2, [6, 8], [162.38, 120.52]),
      // Fifth place, between the two first-round losers.
      game(3, [4, 10], [119.64, 116.76]),
      // The consolation finals: seventh and ninth.
      game(4, [2, 7], [117.1, 115.05]),
      game(5, [5, 9], [110.41, 109.19]),
    ],
  },
  {
    week: 17,
    postseason: true,
    games: [
      // The final, and third place. Six rosters are unpaired — the league has
      // stopped playing for everybody whose bracket is finished.
      game(1, [3, 6], [138.0, 133.41]),
      game(2, [1, 8], [135.46, 127.55]),
    ],
  },
];

/* -------------------------------------------------------------------------
 * The bracket
 * ---------------------------------------------------------------------- */

/**
 * The winners bracket, laid out exactly as the recorded 2026 draw is.
 *
 * The **byes are drawn slots and the rest are fed** — seeds 1 and 2 (rosters 3
 * and 6) sit in round two from the moment the bracket is published, and every
 * other later slot is `{ fromMatch }` and therefore null until its feeder has
 * been played. That is the recorded shape, and it is what makes a bracket read
 * on the Tuesday of week 15 different from one read a week later.
 */
const WINNERS: readonly ScriptedBracketMatch[] = [
  { round: 1, matchId: 1, week: 15, team1: 1, team2: 4, winner: 1 },
  { round: 1, matchId: 2, week: 15, team1: 8, team2: 10, winner: 8 },
  // Seed 1 waits for the winner of match 1; seed 2 for the winner of match 2.
  {
    round: 2,
    matchId: 3,
    week: 16,
    team1: 3,
    team2: { fromMatch: 1, take: 'winner' },
    winner: 3,
  },
  {
    round: 2,
    matchId: 4,
    week: 16,
    team1: 6,
    team2: { fromMatch: 2, take: 'winner' },
    winner: 6,
  },
  // Fifth place, between the two first-round losers. `p` needs no offset here.
  {
    round: 2,
    matchId: 5,
    week: 16,
    team1: { fromMatch: 1, take: 'loser' },
    team2: { fromMatch: 2, take: 'loser' },
    placement: 5,
    winner: 4,
  },
  {
    round: 3,
    matchId: 6,
    week: 17,
    team1: { fromMatch: 3, take: 'winner' },
    team2: { fromMatch: 4, take: 'winner' },
    placement: 1,
    winner: 3,
  },
  {
    round: 3,
    matchId: 7,
    week: 17,
    team1: { fromMatch: 3, take: 'loser' },
    team2: { fromMatch: 4, take: 'loser' },
    placement: 3,
    winner: 1,
  },
];

const LOSERS: readonly ScriptedBracketMatch[] = [
  { round: 1, matchId: 1, week: 15, team1: 2, team2: 5, winner: 2 },
  { round: 1, matchId: 2, week: 15, team1: 7, team2: 9, winner: 7 },
  // Bracket-relative: `p=1` here is the league's **seventh**, and reading it as a
  // championship is exactly what `lib/sleeper/placements.ts` exists to refuse.
  {
    round: 2,
    matchId: 3,
    week: 16,
    team1: { fromMatch: 1, take: 'winner' },
    team2: { fromMatch: 2, take: 'winner' },
    placement: 1,
    winner: 2,
  },
  {
    round: 2,
    matchId: 4,
    week: 16,
    team1: { fromMatch: 1, take: 'loser' },
    team2: { fromMatch: 2, take: 'loser' },
    placement: 3,
    winner: 5,
  },
];

export const WEEK_16_SCRIPT: SeasonScript = {
  year: 2026,
  leagueId: LEAGUE_2026,
  weeks: [...REGULAR_WEEKS, ...POSTSEASON],
  brackets: { winners: WINNERS, losers: LOSERS },
};
