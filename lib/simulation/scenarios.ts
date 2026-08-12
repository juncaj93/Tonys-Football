import {
  MIDSEASON_GAMES,
  MIDSEASON_SEATS,
  type MidseasonGame,
} from '@/lib/sleeper/midseason-2026';
import { LEAGUE_2026, WEEK_1_SEATS } from '@/lib/rehearsal/week-1';
import { WEEK_16_SCRIPT, WEEK_16_SEATS } from '@/lib/rehearsal/week-16';
import { type ScriptedWeek, type SeasonScript } from '@/lib/rehearsal/script';

/**
 * The three league situations the simulation lab plays, as data.
 *
 * ## What this module is, and what it deliberately is not
 *
 * It is **input**. Every scenario below is a written-down season — scores,
 * pairings, a bracket — and nothing else. What Tony *says* about any of it is
 * decided downstream by the shipping code, and no scenario here may reach in and
 * choose a headline, a lead story, a grade or a sentence.
 *
 * That is the whole discipline of the lab. The commissioner's question is *"what
 * will the Slice feel like when this league has stories"*, and the only honest
 * way to answer it is to manipulate the **facts** and let the real selector,
 * renderer and validator decide what survives. A scenario that nudged the prose
 * would be evidence about the scenario.
 *
 * ## Nothing here is a new scoreboard
 *
 * All three reuse a scoreboard that already exists and is already the canonical
 * one for its shape:
 *
 * | Scenario | Comes from | Owned by |
 * |---|---|---|
 * | preseason | the recorded 2025 draft, re-seated (`lib/demo/draft-fixture.ts`) | `docs/PRESEASON_SLICE_BOUNDARY.md` |
 * | week 4 | `MIDSEASON_GAMES`, stopped early — the same frozen scoreboard | `docs/WEEK8_REHEARSAL.md §11` |
 * | week 8 | `MIDSEASON_GAMES` — forty games, eighty scores, frozen | `docs/WEEK8_REHEARSAL.md §11` |
 * | week 16 | `WEEK_16_SCRIPT` — fourteen weeks and a bracket that advances | `docs/PLAYOFF_REHEARSAL.md` |
 *
 * `WEEK8_REHEARSAL.md §11` says the scoreboard is that file's deliverable and
 * the plumbing around it is not, so the lab consumes it rather than writing a
 * second one. A midseason league with a different set of forty games would be a
 * second answer to *"what does week 8 look like"*, and the first time the two
 * disagreed nobody would know which was the product.
 *
 * ## These numbers are test data
 *
 * The same standing `lib/rehearsal/script.ts` holds. They exist inside a
 * throwaway local database, no production surface can reach them, and nothing
 * here is a claim about football. Sleeper remains the source of truth in
 * production.
 */

export const SIMULATION_KEYS = ['preseason', 'week-4', 'week-8', 'week-16'] as const;

export type SimulationKey = (typeof SIMULATION_KEYS)[number];

export interface SimulationScenario {
  readonly key: SimulationKey;
  /** What the commissioner selects. Short, and it is what the evidence is filed under. */
  readonly title: string;
  /** One line: the league situation being staged, not the paper it produces. */
  readonly premise: string;
  /** The season, written down. Empty of played weeks for the preseason. */
  readonly script: SeasonScript;
  /** Roster id → the name Tony uses. Provenance for the report only. */
  readonly seats: Readonly<Record<number, string>>;
  /**
   * Weeks played before the Tuesday under inspection. `0` for the preseason.
   *
   * Every one of them is played through the real cron, in order, one Tuesday
   * each — not inserted. The midseason failure modes are all about what earlier
   * Tuesdays *left behind*, and inserted rows were never left behind by
   * anything.
   */
  readonly through: number;
  /**
   * The week the Slice under inspection is about, or `null` for the preseason
   * issue — which is week zero, a slot and never a printed number
   * (`docs/PRESEASON_SLICE_BOUNDARY.md §2`).
   */
  readonly featured: number | null;
  /**
   * Arrange a completed draft and Tony's ten grades before the Tuesday runs.
   *
   * Only the preseason scenario needs it, and it is the one piece of *editorial*
   * input in this file. See `lib/simulation/lab.ts` for why it is arranged
   * rather than driven.
   */
  readonly draftReview: boolean;
  /**
   * Photograph the featured week before Monday night.
   *
   * True only where the scenario's scoreboard actually carries two readings. All
   * three of these carry one score line per game, so the Sunday leg is run for
   * the featured week — the snapshot is what the board's matchup line reads —
   * and **no Monday comeback is derivable from any of them**, which is a
   * property of the input rather than a limitation of the product. Week 1's
   * rehearsal is where the comeback lives (`docs/WEEK_1_REHEARSAL.md §3`).
   */
  readonly photograph: boolean;
  /**
   * Serve week one as Sleeper serves a drafted-but-unplayed week — every row at
   * zero — on the featured Tuesday.
   *
   * The preseason's real state, and it is load-bearing rather than decorative.
   * From the moment a league drafts, Sleeper answers week one with ordinary
   * matchup rows at `0` on both sides; the sync **refuses to store them**
   * (`docs/IN_SEASON_SYNC_BOUNDARY.md`) and the preseason issue reads the same
   * payload for its *pairings* only (`lib/sleeper/schedule.ts`). Without it the
   * paper's `Week one` section is empty, which is true of a league that has not
   * drawn a schedule and is not true of this one.
   */
  readonly scheduledWeekOne: boolean;
  /**
   * Play the season out to this week and look at the featured week **again**.
   *
   * Only week 16 sets it, and it is there for one finding rather than for
   * completeness. Several playoff facts are **retrospective by design**:
   * `elimination` fires on `season_memberships.final_rank`, which is written
   * from the bracket's own placement games, and ranks one and two do not exist
   * until the final has been played. So the paper printed on the Tuesday of the
   * semifinal *cannot* carry the story, and the same week re-assembled a week
   * later *can*.
   *
   * That is a product decision (`docs/OPEN_ITEMS.md` **G5** declines persisting
   * playoff structure for v1), and the honest way to show it is to show both
   * renderings side by side rather than to describe one of them.
   *
   * **It changes nothing that was published.** A published version's content is
   * immutable by trigger; re-assembling reads, and the record notes that the
   * printed issue is untouched.
   */
  readonly retrospectiveThrough?: number;
}

/* -------------------------------------------------------------------------
 * Week 8 — the midseason scoreboard, as a script
 * ---------------------------------------------------------------------- */

/**
 * `MIDSEASON_GAMES` in the shape the rehearsal harness reads.
 *
 * A pure re-shaping, and it is worth being precise about what is *not* being
 * added: the fixture carries **one** score line per game, so `preMonday` and
 * `final` are equal and every Sunday photograph of a week matches its Tuesday
 * close exactly. That is the honest translation. Inventing a Sunday number to
 * make a comeback possible would be inventing football.
 *
 * Position in the week's array is the `matchup_id`, which is the same rule the
 * fixture's own header states.
 */
function midseasonWeeks(through: number): readonly ScriptedWeek[] {
  return Object.entries(MIDSEASON_GAMES)
    .map(([week, games]) => ({ week: Number(week), games: games as readonly MidseasonGame[] }))
    .filter((entry) => entry.week <= through)
    .sort((left, right) => left.week - right.week)
    .map(
      ({ week, games }): ScriptedWeek => ({
        week,
        games: games.map(([rosterA, pointsA, rosterB, pointsB], index) => ({
          matchupId: index + 1,
          rosters: [rosterA, rosterB] as const,
          preMonday: [pointsA, pointsB] as const,
          final: [pointsA, pointsB] as const,
        })),
      }),
    );
}

const WEEK_8_SCRIPT: SeasonScript = {
  year: 2026,
  leagueId: LEAGUE_2026,
  weeks: midseasonWeeks(8),
};

/**
 * The same season, stopped at the earliest week a personal line can exist.
 *
 * `MIN_OWN_TEAM_WEEKS` is three, so the Tuesday that closes week three is the
 * first one that can price anybody — and **week four is the first week the
 * league can take a side**, which is the commissioner's *"available beginning
 * around Week 4"* landing exactly.
 *
 * **Not a new scoreboard.** It is `MIDSEASON_GAMES` stopped early, which is the
 * same discipline the week-8 scenario applies for the same reason: a second set
 * of early-season scores would be a second answer to *"what does October look
 * like"*, and the first time the two disagreed nobody would know which was the
 * product.
 */
const WEEK_4_SCRIPT: SeasonScript = {
  year: 2026,
  leagueId: LEAGUE_2026,
  weeks: midseasonWeeks(4),
};

/* -------------------------------------------------------------------------
 * The scenarios
 * ---------------------------------------------------------------------- */

export const SIMULATION_SCENARIOS: Readonly<Record<SimulationKey, SimulationScenario>> = {
  preseason: {
    key: 'preseason',
    title: 'Preseason — the draft-review special',
    premise:
      'The league has drafted and nobody has played. Tony has graded all ten boards, ' +
      'and the Tuesday before the opener has no week to recap.',
    /*
     * Week one exists in the script and is played by nobody. It is served at
     * zero on the featured Tuesday, which is the payload the schedule is read
     * from and the payload the sync drops. Its pairings are the recorded
     * midseason week one's, so the fixtures on the paper are a real draw rather
     * than an invented one.
     */
    script: { year: 2026, leagueId: LEAGUE_2026, weeks: midseasonWeeks(1) },
    seats: WEEK_1_SEATS,
    through: 0,
    featured: null,
    draftReview: true,
    photograph: false,
    scheduledWeekOne: true,
  },

  'week-4': {
    key: 'week-4',
    title: 'Week 4 — the first line',
    premise:
      'The Tuesday that closed week three set the first ten lines — three of each ' +
      'manager’s own team-weeks is the floor, and that is where they reach it. Week four ' +
      'is the first week the league has ever been able to take a side, and Tony has had ' +
      'a question on the chalkboard since week two.',
    script: WEEK_4_SCRIPT,
    seats: MIDSEASON_SEATS,
    through: 4,
    featured: 4,
    draftReview: false,
    photograph: true,
    scheduledWeekOne: false,
  },

  'week-8': {
    key: 'week-8',
    title: 'Week 8 — midseason',
    premise:
      'Seven Tuesdays are behind it. Two managers are level on wins and separated by ' +
      '0.60 of a point, the league’s highest scorer is 2–5, one manager is on a ' +
      'four-game win streak and two are on four-game losing streaks, and a bounty ' +
      'authored in week 5 is still open.',
    script: WEEK_8_SCRIPT,
    seats: MIDSEASON_SEATS,
    through: 8,
    featured: 8,
    draftReview: false,
    photograph: true,
    scheduledWeekOne: false,
  },

  'week-16': {
    key: 'week-16',
    title: 'Week 16 — the semifinal',
    premise:
      'Fourteen regular-season weeks and a bracket that has advanced. Week 16 is round ' +
      'two of three: two semifinals, the fifth-place game and both consolation finals. ' +
      'Six of the ten placements settle here and the four deciding a championship do not.',
    script: WEEK_16_SCRIPT,
    seats: WEEK_16_SEATS,
    through: 16,
    featured: 16,
    draftReview: false,
    photograph: true,
    scheduledWeekOne: false,
    retrospectiveThrough: 17,
  },
};

export function simulationScenario(key: string): SimulationScenario {
  const found = (SIMULATION_SCENARIOS as Record<string, SimulationScenario | undefined>)[key];
  if (found === undefined) {
    throw new Error(
      `no simulation scenario named "${key}". Known: ${SIMULATION_KEYS.join(', ')}`,
    );
  }
  return found;
}
