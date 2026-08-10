import { type SeasonScript } from './script';

/**
 * Week 1 of 2026, written down.
 *
 * ## These numbers are test data and are not a claim about football
 *
 * `MANDATE §9` and `16 §12` are unambiguous that every fantasy fact the product
 * states comes from Sleeper or a verified persisted record. Nothing here is ever
 * stated: it exists inside the rehearsal, against a throwaway database, and no
 * production surface can reach it. What it *is* is a season whose outcomes
 * somebody chose, so the assertions can name them — which is the only way to
 * tell "the pipeline paid the right manager" from "the pipeline paid a manager".
 *
 * ## What each game is here to exercise
 *
 * | Game | Managers | What it is for |
 * |---|---|---|
 * | 1 | Alex vs Nathan | **The Monday comeback.** Alex is 12.65 down on Sunday night and wins by 14.57. The only game whose result flips between the two readings, and the only one `07 §8`'s story may be told about |
 * | 2 | Joe vs Zack | **The close game** — 0.44 apart. A margin small enough that a rounding defect anywhere in the cents pipeline changes the winner |
 * | 3 | Nick vs Ryan | **The blowout, and the notable score.** 64.86 apart, and Ryan's 152.88 is the week's high score — the one `WEEKLY_HIGH_SCORE` the week may pay |
 * | 4 | Brandon vs Cheese | An ordinary win, and a lead held through Monday |
 * | 5 | Matt Lee vs Matty B | **The near-comeback.** Matty B closes from 15.14 back to 5.76 and still loses, so it is a comeback story that must *not* be told |
 *
 * Every score is distinct to the cent, so the high score is unambiguous and any
 * off-by-one in the reward derivation lands on a named person rather than
 * disappearing into a tie.
 *
 * ## Week 2 exists so the transition can be rehearsed
 *
 * A week that closes is only half the lifecycle; the other half is whether the
 * league moves on. Week 2 re-pairs the rosters the way a real schedule does, and
 * carries **a tie** (Alex vs Joe, 112.20 each) because the tie rules are stated
 * in `lib/rewards/derive.ts` and were never exercised end to end: a tied game
 * pays no win to anybody, and the week still pays its high score.
 *
 * ## Week 3 is the schedule, not a result
 *
 * Sleeper publishes the whole season the moment a league drafts, so an unplayed
 * week arrives as ordinary rows at `0` on both sides with nothing in the payload
 * saying *"not yet"*. Week 3 is written that way deliberately — it is the input
 * to the rehearsal's eighth failure injection, and the one that would have been
 * unrecoverable: a week finalized on five fabricated ties can never be closed
 * again, because `week_finalizations` is append-only.
 */

/** The 2026 league, as recorded. The rehearsal imports the real fixtures. */
export const LEAGUE_2026 = '1385016656425668608';

/** Roster → the name Tony uses. Asserted by the rehearsal, never assumed. */
export const WEEK_1_SEATS: Readonly<Record<number, string>> = {
  1: 'Alex',
  2: 'Nathan',
  3: 'Joe',
  4: 'Zack',
  5: 'Nick',
  6: 'Ryan',
  7: 'Brandon',
  8: 'Cheese',
  9: 'Matt Lee',
  10: 'Matty B',
};

export const WEEK_1_SCRIPT: SeasonScript = {
  year: 2026,
  leagueId: LEAGUE_2026,
  weeks: [
    {
      week: 1,
      games: [
        {
          matchupId: 1,
          rosters: [1, 2],
          preMonday: [118.4, 131.05],
          final: [145.62, 131.05],
        },
        {
          matchupId: 2,
          rosters: [3, 4],
          preMonday: [96.18, 95.44],
          final: [101.3, 100.86],
        },
        {
          matchupId: 3,
          rosters: [5, 6],
          preMonday: [88.02, 120.15],
          final: [88.02, 152.88],
        },
        {
          matchupId: 4,
          rosters: [7, 8],
          preMonday: [110.55, 104.9],
          final: [124.71, 109.33],
        },
        {
          matchupId: 5,
          rosters: [9, 10],
          preMonday: [133.2, 118.06],
          final: [133.2, 127.44],
        },
      ],
    },
    {
      week: 2,
      games: [
        // The tie. Same number on both sides, to the cent.
        { matchupId: 1, rosters: [1, 3], preMonday: [104.5, 98.2], final: [112.2, 112.2] },
        { matchupId: 2, rosters: [2, 4], preMonday: [131.4, 90.15], final: [140.1, 99.5] },
        { matchupId: 3, rosters: [5, 7], preMonday: [95.3, 118.4], final: [101.0, 130.25] },
        { matchupId: 4, rosters: [6, 9], preMonday: [110.2, 113.6], final: [118.75, 121.0] },
        // The week's high score, on a different seat from week 1's.
        { matchupId: 5, rosters: [8, 10], preMonday: [90.1, 140.2], final: [95.6, 155.4] },
      ],
    },
    {
      // Drafted, scheduled, unplayed. Ten rows of zero on both sides.
      week: 3,
      games: [
        { matchupId: 1, rosters: [1, 4], preMonday: [0, 0], final: [0, 0] },
        { matchupId: 2, rosters: [2, 5], preMonday: [0, 0], final: [0, 0] },
        { matchupId: 3, rosters: [3, 6], preMonday: [0, 0], final: [0, 0] },
        { matchupId: 4, rosters: [7, 9], preMonday: [0, 0], final: [0, 0] },
        { matchupId: 5, rosters: [8, 10], preMonday: [0, 0], final: [0, 0] },
      ],
    },
  ],
};

/** What week 1 is supposed to produce, stated once so the tests share it. */
export const WEEK_1_EXPECTED = {
  /** Roster ids of the five winners. */
  winners: [1, 3, 6, 7, 9] as const,
  /** The one high score, and who posted it. */
  highScore: { rosterId: 6, manager: 'Ryan', points: 152.88 },
  /** The only game whose result flipped after the Sunday photograph. */
  comeback: { matchupId: 1, manager: 'Alex', deficit: 12.65 },
  /** The closest game, to the cent. */
  closest: { matchupId: 2, marginCents: 44 },
} as const;
