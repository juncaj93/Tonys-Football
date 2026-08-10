import { type Queryable } from '@/lib/db';
import { DemoRefused, assertDemoAllowed } from '@/lib/demo/guard';
import { finalizedMarginsCents } from '@/lib/stats/facts';
import { standardPolicy } from '@/lib/stats/significance';
import { type SnapshotEntry } from '@/lib/stats/snapshot';
import { deriveStories, type StoryKind } from '@/lib/stats/stories';
import { buildWeek, publishableWeek, type StoredWeekGame } from '@/lib/stats/week';

import {
  draftObservations,
  managerDraftFacts,
  pickLabel,
  type DraftFacts,
  type DraftPickFact,
} from './draft-facts';
import { editionFor, latestEdition } from './edition';
import {
  assemblePreseasonPacket,
  renderPreseason,
  validatePreseason,
  type PreseasonTeamFacts,
} from './preseason';
import { type TonyGrade } from './preseason-reviews';
import {
  assemblePacket,
  factPacket,
  finalizedTeamScoresCents,
  type FactPacket,
} from './packet';
import { renderEdition, type Edition } from './render';
import { validateEdition } from './validate';

/**
 * Every state of the Slice, reachable by name.
 *
 * `MANDATE §8`: *"a feature is not demo-ready if showing its states needs
 * hand-edited SQL."* The rack has fifteen states a commissioner would want to
 * look at before September, and thirteen of them will not occur naturally before
 * then — a tie, an unfinished week, a week with nothing worth printing.
 *
 * ## Two sources, one pipeline
 *
 * - **`historical`** — a real week of a finalized season. Fixed data in the
 *   strongest sense available: the season is closed, the rows are immutable by
 *   trigger, and the issue on screen is one the product would really print.
 * - **`fixture`** — a frozen week written here, for states history does not
 *   contain. It is scores and names, nothing more.
 *
 * Both go through **the same** `deriveStories → selectStories → assemblePacket →
 * renderEdition → validateEdition` path, using the real league's margin and score
 * populations so a fixture is classified against the same thresholds a live week
 * would be. A demo with its own assembly would be evidence about the demo.
 *
 * ## Four properties, and none of them is optional
 *
 * 1. **Fixed** — no clock, no randomness, no live season. Same bytes every run.
 * 2. **Reachable by Playwright** — `?edition=<key>`, resolved on the server.
 * 3. **Never in production** — `assertDemoAllowed` refuses outright there, and an
 *    ordinary request without the parameter is untouched.
 * 4. **Writes nothing** — a fixture never reaches the database, so no demo can
 *    contaminate a record, an audit trail or a ledger. That is stronger than the
 *    seat-based isolation the loot demos need, because a newspaper has no state to
 *    isolate.
 */

export const SLICE_EDITIONS = [
  'offseason',
  'preseason',
  'normal-week',
  'blowout',
  'close-finish',
  'record-score',
  'weak-news',
  'incomplete-week',
  'standings-shakeup',
  'playoff-week',
  'championship',
  'historical-recap',
  'no-stories',
  'one-story',
  'competing-stories',
  'monday-comeback',
  'preseason-draft-review',
  'preseason-sparse',
] as const;

export type SliceEditionKey = (typeof SLICE_EDITIONS)[number];

/** How the rack looks when there is no issue on it at all. */
export type RackState = 'offseason' | 'preseason';

export type PreviewEdition =
  | { readonly mode: 'rack'; readonly rack: RackState; readonly issue: Edition | null }
  | {
      readonly mode: 'issue';
      readonly issue: Edition;
      /**
       * What led, as a kind rather than as prose.
       *
       * Carried so a test can pin the *character* of a demo state without pinning
       * its wording — a calibration change that quietly turns the blowout demo
       * into an ordinary week then fails the build rather than the review, and a
       * copy edit does not.
       */
      readonly leadKind: StoryKind | null;
    };

/** One week, written out. Points, in the form a reader sees them. */
interface FixtureGame {
  /** Roster A, roster B — stored order, so a swap cannot hide in a margin. */
  readonly a: string;
  readonly aPoints: number;
  readonly b: string;
  readonly bPoints: number;
  /**
   * What the two sides had before Monday, when the fixture is photographing one.
   *
   * Absent on every other fixture, which is the normal case and the historical
   * one: the snapshot job did not exist for any imported season, so those weeks
   * produce no comeback candidate at all. A fixture that supplies these is
   * declaring *"this week was photographed"*.
   */
  readonly aBefore?: number;
  readonly bBefore?: number;
}

interface FixtureWeek {
  readonly week: number;
  readonly weekType: 'regular' | 'playoff';
  readonly games: readonly FixtureGame[];
}

interface EditionFixture {
  readonly season: number;
  /** Which week to print. Earlier weeks exist only to give it a table. */
  readonly show: number;
  readonly finalized: boolean;
  readonly weeks: readonly FixtureWeek[];
  /** Final placement by manager name, where the fixture has a bracket. */
  readonly finalRanks?: Readonly<Record<string, number>>;
  readonly playoffManagers?: readonly string[];
}

/** A real week of a finalized season, printed exactly as production prints it. */
interface HistoricalEdition {
  readonly season: number;
  readonly week: number;
}

export interface SliceEditionEntry {
  readonly key: SliceEditionKey;
  /** One line, in the room's language rather than the schema's. */
  readonly shows: string;
  readonly source: 'historical' | 'fixture' | 'rack';
}

/*
 * The names are the league's real ones, deliberately.
 *
 * A demo whose managers are called `Manager One` would look correct at every
 * width and tell you nothing: the reason to look at these pages is to see whether
 * *"Matt Lee"* — the longest name in the league — breaks a scoreboard row at 320,
 * and whether *"Matty B"* and *"Matt Lee"* are distinguishable at a glance in the
 * same issue. Both of those are real risks and neither is visible with placeholder
 * names.
 *
 * Nothing here is written anywhere. A fixture is scores in memory, rendered once.
 */
const A = 'Alex';
const B = 'Brandon';
const C = 'Cheese';
const J = 'Joe';
const ML = 'Matt Lee';
const MB = 'Matty B';
const NA = 'Nathan';
const NI = 'Nick';


/** A quiet week: every game ordinary, nothing near any gate. */
const ORDINARY: readonly FixtureGame[] = [
  { a: A, aPoints: 118.44, b: NI, bPoints: 104.9 },
  { a: B, aPoints: 121.06, b: C, bPoints: 108.52 },
  { a: J, aPoints: 112.7, b: ML, bPoints: 99.18 },
  { a: MB, aPoints: 116.34, b: NA, bPoints: 103.6 },
];

const FIXTURES: Readonly<Partial<Record<SliceEditionKey, EditionFixture>>> = {
  /*
   * A record has to be a fixture, and finding that out was worth the trip.
   *
   * The biggest team-week on record is **188.02**, and it belongs to a manager who
   * is retired — so it may never be published, and no publishable score in either
   * finalized season can ever be *"the biggest in the book"*. The same is true of
   * the widest margin, 140.72, for the same reason.
   *
   * That is the layer behaving correctly rather than a gap. The comparison
   * population deliberately includes rows that cannot themselves be printed,
   * because a record measured only against publishable games would announce a
   * record that is not one. The demo therefore supplies a score that really is
   * above the book, which is the only honest way to show the state.
   */
  'record-score': {
    season: 2026,
    show: 4,
    finalized: true,
    weeks: [
      { week: 1, weekType: 'regular', games: ORDINARY },
      { week: 2, weekType: 'regular', games: ORDINARY },
      { week: 3, weekType: 'regular', games: ORDINARY },
      {
        week: 4,
        weekType: 'regular',
        games: [
          { a: MB, aPoints: 195.4, b: NA, bPoints: 141.86 },
          { a: A, aPoints: 118.44, b: NI, bPoints: 104.9 },
          { a: B, aPoints: 121.06, b: C, bPoints: 108.52 },
          { a: J, aPoints: 112.7, b: ML, bPoints: 99.18 },
        ],
      },
    ],
  },

  'incomplete-week': {
    season: 2026,
    show: 3,
    // The books are open. Every claim suppresses and the rack says so — the one
    // state that must never render a result, because a live Sunday can still move
    // one.
    finalized: false,
    weeks: [{ week: 3, weekType: 'regular', games: ORDINARY }],
  },

  'no-stories': {
    season: 2026,
    show: 3,
    finalized: true,
    weeks: [
      { week: 1, weekType: 'regular', games: ORDINARY },
      { week: 2, weekType: 'regular', games: ORDINARY },
      {
        week: 3,
        weekType: 'regular',
        // Nothing clears a gate: no margin near `crushed`, none inside `edged`,
        // no score near either tail. The paper runs quiet and prints the board.
        games: [
          { a: A, aPoints: 119.2, b: NI, bPoints: 100.46 },
          { a: B, aPoints: 124.88, b: C, bPoints: 106.14 },
          { a: J, aPoints: 115.36, b: ML, bPoints: 98.7 },
          { a: MB, aPoints: 113.02, b: NA, bPoints: 97.58 },
        ],
      },
    ],
  },

  'one-story': {
    season: 2026,
    show: 3,
    finalized: true,
    weeks: [
      { week: 1, weekType: 'regular', games: ORDINARY },
      { week: 2, weekType: 'regular', games: ORDINARY },
      {
        week: 3,
        weekType: 'regular',
        // One game inside `edged` and nothing else near a gate.
        games: [
          { a: A, aPoints: 121.4, b: NI, bPoints: 119.06 },
          { a: B, aPoints: 124.88, b: C, bPoints: 106.14 },
          { a: J, aPoints: 115.36, b: ML, bPoints: 98.7 },
          { a: MB, aPoints: 113.02, b: NA, bPoints: 97.58 },
        ],
      },
    ],
  },

  'competing-stories': {
    season: 2026,
    show: 6,
    finalized: true,
    weeks: [
      { week: 1, weekType: 'regular', games: ORDINARY },
      { week: 2, weekType: 'regular', games: ORDINARY },
      { week: 3, weekType: 'regular', games: ORDINARY },
      { week: 4, weekType: 'regular', games: ORDINARY },
      { week: 5, weekType: 'regular', games: ORDINARY },
      {
        week: 6,
        weekType: 'regular',
        // Three different shapes at once, all above the floor: a blowout, a
        // one-point finish and a very large score. The desk has to choose, and
        // the suppression list has to explain what it left out.
        games: [
          { a: A, aPoints: 178.62, b: NI, bPoints: 96.4 },
          { a: B, aPoints: 131.88, b: C, bPoints: 130.92 },
          { a: J, aPoints: 189.74, b: ML, bPoints: 148.3 },
          { a: MB, aPoints: 118.5, b: NA, bPoints: 101.24 },
        ],
      },
    ],
  },

  'standings-shakeup': {
    season: 2026,
    show: 6,
    finalized: true,
    weeks: [
      // Five weeks of a table, then one week that turns it over. Written out
      // rather than asserted: a standings claim is only checkable if the games
      // behind it are on the same page, and they are — the board prints them.
      { week: 1, weekType: 'regular', games: ORDINARY },
      {
        week: 2,
        weekType: 'regular',
        games: [
          { a: NI, aPoints: 120.4, b: A, bPoints: 101.2 },
          { a: C, aPoints: 118.6, b: B, bPoints: 99.4 },
          { a: ML, aPoints: 122.2, b: J, bPoints: 104.8 },
          { a: NA, aPoints: 119.9, b: MB, bPoints: 102.5 },
        ],
      },
      {
        week: 3,
        weekType: 'regular',
        games: [
          { a: NI, aPoints: 124.4, b: A, bPoints: 111.2 },
          { a: C, aPoints: 121.6, b: B, bPoints: 105.4 },
          { a: ML, aPoints: 126.2, b: J, bPoints: 109.8 },
          { a: NA, aPoints: 123.9, b: MB, bPoints: 108.5 },
        ],
      },
      { week: 4, weekType: 'regular', games: ORDINARY },
      { week: 5, weekType: 'regular', games: ORDINARY },
      {
        week: 6,
        weekType: 'regular',
        games: [
          { a: NA, aPoints: 141.2, b: A, bPoints: 96.4 },
          { a: MB, aPoints: 138.8, b: B, bPoints: 94.6 },
          { a: ML, aPoints: 133.4, b: C, bPoints: 118.2 },
          { a: NI, aPoints: 127.6, b: J, bPoints: 112.8 },
        ],
      },
    ],
  },

  /*
   * A week that was photographed before Monday, and moved after it.
   *
   * The only fixture in this file that supplies `aBefore` / `bBefore`, because
   * it is the only state where the paper is allowed to say what somebody was
   * doing on Sunday night. Alex is 35.10 down at the snapshot and wins by 6.66 —
   * a hole deep enough to clear `LEAD_FLOOR` and lead the issue, which is what
   * makes this a demo of the story rather than of a footnote.
   *
   * The other three games move too, and none of them flips. That is the half of
   * the demo that matters: a state showing only the comeback would not prove the
   * paper can tell a recovery from an ordinary Monday, which is the exact failure
   * `docs/SUNDAY_SNAPSHOT_BOUNDARY.md §5` is written against.
   */
  'monday-comeback': {
    season: 2026,
    show: 3,
    finalized: true,
    weeks: [
      { week: 1, weekType: 'regular', games: ORDINARY },
      { week: 2, weekType: 'regular', games: ORDINARY },
      {
        week: 3,
        weekType: 'regular',
        games: [
          // Behind 82.30 to 117.40 before Monday; wins 128.44 to 121.78.
          { a: A, aPoints: 128.44, b: NI, bPoints: 121.78, aBefore: 82.3, bBefore: 117.4 },
          // Ahead and stays ahead. Moves 20 points and is not a story.
          { a: B, aPoints: 131.06, b: C, bPoints: 108.52, aBefore: 111.06, bBefore: 104.52 },
          // Behind and stays behind.
          { a: J, aPoints: 104.7, b: ML, bPoints: 119.18, aBefore: 88.7, bBefore: 112.18 },
          // Level at the snapshot, decided on Monday. Not a comeback: nobody was behind.
          { a: MB, aPoints: 117.2, b: NA, bPoints: 110.86, aBefore: 100, bBefore: 100 },
        ],
      },
    ],
  },
};

const HISTORICAL: Readonly<Partial<Record<SliceEditionKey, HistoricalEdition>>> = {
  // Chosen by reading what the pipeline actually produces for every week of both
  // finalized seasons, not by guessing. `editions.test.ts` pins the character of
  // each one, so a policy change that quietly turns the blowout demo into an
  // ordinary week fails the build instead of the review.
  'normal-week': { season: 2025, week: 7 },
  blowout: { season: 2024, week: 9 },
  'close-finish': { season: 2025, week: 5 },
  'weak-news': { season: 2024, week: 6 },
  'playoff-week': { season: 2024, week: 15 },
  championship: { season: 2024, week: 17 },
  'historical-recap': { season: 2024, week: 12 },
};

const RACK: Readonly<Partial<Record<SliceEditionKey, RackState>>> = {
  offseason: 'offseason',
  preseason: 'preseason',
};

/** One line per state, in the room's language rather than the schema's. */
export const SLICE_EDITION_DESCRIPTIONS: Readonly<Record<SliceEditionKey, string>> = {
  offseason: 'the rack in July, carrying the last issue Tony printed',
  preseason: 'the rack before week one, with nothing on it yet',
  'normal-week': 'an ordinary finalized week with a lead and a board',
  blowout: 'a week the classifier calls obliterated',
  'close-finish': 'a week led by a game decided inside the edged threshold',
  'record-score': 'a week carrying the biggest number in the book',
  'weak-news': 'a week with a lead that only just earned one',
  'incomplete-week': 'a week whose books are open, so every result is withheld',
  'standings-shakeup': 'a week that turns the table over',
  'playoff-week': 'a bracket week',
  championship: 'the title game',
  'historical-recap': 'a week from a season that is already closed',
  'no-stories': 'a week where nothing cleared the bar; the board still prints',
  'one-story': 'an issue carrying exactly one story',
  'competing-stories': 'three strong stories of different shapes, and the desk choosing',
  'monday-comeback': 'a week photographed before Monday, where one game turned over and three did not',
  'preseason-draft-review':
    'the draft-review special, ten teams graded, every optional field supplied',
  'preseason-sparse':
    'the same issue with most of the optional fields empty — the state Tony really files',
};

/**
 * The catalog, for the CLI and for the visual driver's exhaustiveness check.
 *
 * A **function**, not a constant, because it reads the fixture tables and one of
 * them is declared at the foot of this file. A module-level constant evaluated
 * before that declaration threw `Cannot access 'PRESEASON_FIXTURES' before
 * initialization` at import time — which is the kind of failure that takes a
 * whole surface down rather than one state.
 */
export function sliceEditionCatalog(): readonly SliceEditionEntry[] {
  return SLICE_EDITIONS.map(
    (key): SliceEditionEntry => ({
      key,
      shows: SLICE_EDITION_DESCRIPTIONS[key],
      source:
        key in RACK
          ? 'rack'
          : key in PRESEASON_FIXTURES || key in FIXTURES
            ? 'fixture'
            : 'historical',
    }),
  );
}

function isEditionKey(value: string): value is SliceEditionKey {
  return (SLICE_EDITIONS as readonly string[]).includes(value);
}

/**
 * Resolve `?edition=blowout` to something the rack can print, or null.
 *
 * Null is the answer for every ordinary request and for every request in an
 * environment where demos are not allowed — the caller renders the rack exactly
 * as it would have. Anything else would leak that the parameter exists.
 */
export async function previewEdition(
  db: Queryable,
  raw: string | string[] | undefined,
  env: Record<string, string | undefined>,
): Promise<PreviewEdition | null> {
  if (typeof raw !== 'string' || raw === '') return null;

  try {
    assertDemoAllowed(env);
  } catch (error: unknown) {
    if (error instanceof DemoRefused) return null;
    throw error;
  }

  if (!isEditionKey(raw)) return null;
  return resolveEdition(db, raw);
}

/**
 * Build one named edition.
 *
 * Exported without the guard so tests and the CLI can render every state
 * directly. The guard belongs to the **route**, which is where an untrusted
 * request arrives; a test that had to set an environment variable to check its
 * own fixtures would be testing the guard.
 */
export async function resolveEdition(
  db: Queryable,
  key: SliceEditionKey,
): Promise<PreviewEdition> {
  const rack = RACK[key];
  if (rack !== undefined) {
    // The offseason rack carries the last issue Tony really printed; the
    // preseason rack carries nothing, because the season it would report on has
    // not started. Both are real states of this product in July.
    return {
      mode: 'rack',
      rack,
      issue: rack === 'offseason' ? await latestEdition(db) : null,
    };
  }

  const historical = HISTORICAL[key];
  if (historical !== undefined) {
    const packet = await factPacket(db, historical);
    const issue = packet.refusal === null ? await editionFor(db, historical) : null;
    if (issue === null) {
      throw new Error(
        `slice edition "${key}" points at ${String(historical.season)} week ` +
          `${String(historical.week)}, which the validator will not publish. ` +
          'A demo state that cannot be shown is a defect in the state, not in the demo system.',
      );
    }
    return { mode: 'issue', issue, leadKind: packet.lead?.kind ?? null };
  }

  const preseason = PRESEASON_FIXTURES[key];
  if (preseason !== undefined) return renderPreseasonFixture(db, preseason);

  const fixture = FIXTURES[key];
  if (fixture === undefined) {
    /*
     * Exhaustiveness at runtime, not only at compile time.
     *
     * A key added to `SLICE_EDITIONS` and forgotten in all three tables would
     * otherwise resolve to `undefined` and render an empty rack — which
     * photographs cleanly and passes. That exact false green has now happened
     * twice in this repository, in the reveal states and again in the visual
     * driver, so the third time it throws.
     */
    throw new Error(
      `slice edition "${key}" is declared but not implemented — it is in ` +
        'SLICE_EDITIONS and in none of RACK, HISTORICAL, FIXTURES or PRESEASON_FIXTURES.',
    );
  }

  return renderFixture(db, fixture);
}

/**
 * Render a frozen week through the production pipeline.
 *
 * The populations come from the **real** finalized league, so a fixture margin is
 * classified against the same thresholds a live week would be. A fixture with its
 * own population would be able to manufacture a record, and a manufactured record
 * would prove nothing about the page that prints real ones.
 */
async function renderFixture(
  db: Queryable,
  fixture: EditionFixture,
): Promise<PreviewEdition> {
  const names = [
    ...new Set(fixture.weeks.flatMap((week) => week.games.flatMap((game) => [game.a, game.b]))),
  ].sort();

  const roster = new Map(
    names.map((name, index) => [
      index + 1,
      { userId: `demo-slice:${name}`, displayName: name },
    ]),
  );
  const rosterIdOf = new Map(names.map((name, index) => [name, index + 1]));

  const rows: StoredWeekGame[] = fixture.weeks.flatMap((week) =>
    week.games.map((game, index): StoredWeekGame => {
      const aId = rosterIdOf.get(game.a)!;
      const bId = rosterIdOf.get(game.b)!;
      const aCents = Math.round(game.aPoints * 100);
      const bCents = Math.round(game.bPoints * 100);
      return {
        week: week.week,
        weekType: week.weekType,
        sleeperMatchupId: index + 1,
        rosterAId: aId,
        rosterBId: bId,
        pointsACents: aCents,
        pointsBCents: bCents,
        winnerRosterId: aCents === bCents ? null : aCents > bCents ? aId : bId,
        marginCents: Math.abs(aCents - bCents),
        disputed: false,
      };
    }),
  );

  /*
   * The fixture's own pre-Monday photograph, for the one state that has one.
   *
   * Built from the same `sleeperMatchupId` the rows above use, so the snapshot
   * and the game join exactly as they do in production. A fixture that supplies
   * no `aBefore` produces an empty map, and an empty map produces no comeback
   * candidate — which is the behaviour of every other edition here and of every
   * historical week in the archive.
   */
  const shownWeek = fixture.weeks.find((week) => week.week === fixture.show);
  const snapshots: Map<number, SnapshotEntry> = new Map(
    (shownWeek?.games ?? []).flatMap((game, index) =>
      game.aBefore === undefined || game.bBefore === undefined
        ? []
        : [
            [
              index + 1,
              {
                sleeperMatchupId: index + 1,
                rosterAId: rosterIdOf.get(game.a)!,
                rosterBId: rosterIdOf.get(game.b)!,
                pointsACents: Math.round(game.aBefore * 100),
                pointsBCents: Math.round(game.bBefore * 100),
              },
            ] as const,
          ],
    ),
  );

  const raw = buildWeek({
    season: fixture.season,
    week: fixture.show,
    finalized: fixture.finalized,
    rows,
    roster,
  });

  const publishableIds = new Set([...roster.values()].map((seat) => seat.userId));
  const open = publishableWeek(raw, publishableIds);

  const packet: FactPacket = assemblePacket({
    week: open,
    rawWeek: raw,
    candidates: deriveStories({
      week: open,
      seasonRows: rows,
      roster,
      marginPopulationCents: await finalizedMarginsCents(db),
      scorePopulationCents: await finalizedTeamScoresCents(db),
      policy: standardPolicy(),
      finalRanks: new Map(
        Object.entries(fixture.finalRanks ?? {}).map(([name, rank]) => [
          rosterIdOf.get(name) ?? -1,
          rank,
        ]),
      ),
      playoffRosters: new Set(
        (fixture.playoffManagers ?? []).map((name) => rosterIdOf.get(name) ?? -1),
      ),
      snapshots,
    }),
    publishableManagerIds: publishableIds,
  });

  const issue = renderEdition(packet);
  const verdict = validateEdition(issue, packet);
  if (!verdict.publishable) {
    /*
     * A fixture the validator refuses is a broken fixture, and it must not print.
     *
     * The rack drops an unpublishable *real* issue silently, which is right in
     * production — the reader gets an empty rack rather than unchecked prose. A
     * demo doing that would hide the defect behind a page that looks deliberate,
     * so here it is loud.
     */
    throw new Error(
      `slice fixture for ${String(fixture.season)} week ${String(fixture.show)} does not ` +
        `validate: ${verdict.violations.map((v) => `${v.kind} ${v.value}`).join(', ')}`,
    );
  }

  return { mode: 'issue', issue, leadKind: packet.lead?.kind ?? null };
}

/** Every edition, rendered. The one call a test needs to prove the catalog works. */
export async function allEditions(
  db: Queryable,
): Promise<readonly { key: SliceEditionKey; preview: PreviewEdition }[]> {
  const out: { key: SliceEditionKey; preview: PreviewEdition }[] = [];
  for (const key of SLICE_EDITIONS) out.push({ key, preview: await resolveEdition(db, key) });
  return out;
}

/* -------------------------------------------------------------------------- *
 * The draft-review special
 * -------------------------------------------------------------------------- */

/**
 * One manager's draft, written out.
 *
 * Real player names, deliberately, and for the same reason the manager names are
 * real: the reason to look at this page is to find out whether *"Amon-Ra
 * St. Brown"* breaks a row at 360 and whether ten sections of it are readable on
 * a phone. `Player One` would render correctly at every width and tell you
 * nothing.
 *
 * They are also the **validator's** hardest case, and that is not incidental: a
 * name with an apostrophe or a full stop in it scans as three capitalised words,
 * so a fixture full of clean two-word names would pass a check the real draft
 * board would fail. `lib/slice/preseason.ts` splits every stored name into
 * fragments precisely because of these, and this fixture is what proves it.
 */
interface PreseasonFixtureTeam {
  readonly manager: string;
  readonly slot: number;
  readonly grade: TonyGrade;
  readonly take: string;
  /** `[round, player, position]`, in pick order. */
  readonly picks: readonly (readonly [number, string, string])[];
  /** Which of their picks Tony named, by round. Absent when he named none. */
  readonly bestPickRound?: number;
  readonly concern?: string;
}

interface PreseasonFixture {
  readonly season: number;
  readonly rounds: number;
  readonly teams: readonly PreseasonFixtureTeam[];
  readonly champion?: { readonly displayName: string; readonly season: number };
  /** Week one's fixtures, by manager name. Absent when the schedule is not out. */
  readonly weekOne?: readonly (readonly [string, string])[];
}

/**
 * The picks every fixture team shares, as a shape rather than as a roster.
 *
 * Six rounds is enough: the paper prints five and the sixth proves the sixth is
 * not printed. Sixteen would be sixteen times the fixture for no additional
 * question answered.
 */
const DRAFT_2026 = {
  season: 2026,
  rounds: 16,
  champion: { displayName: 'Matty B', season: 2025 },
  weekOne: [
    ['Matt Lee', 'Nick'],
    ['Matty B', 'Joe'],
    ['Cheese', 'Nathan'],
    ['Brandon', 'Ryan'],
    ['Alex', 'Zack'],
  ],
  teams: [
    {
      manager: 'Matt Lee',
      slot: 1,
      grade: 'A+',
      take: 'Took the best receiver alive and then never reached once. Tony has read a hundred boards and this is what one looks like when somebody has a plan.',
      picks: [
        [1, "Ja'Marr Chase", 'WR'],
        [2, 'Brian Thomas', 'WR'],
        [3, 'Kyren Williams', 'RB'],
        [4, 'Ladd McConkey', 'WR'],
        [5, 'Tucker Kraft', 'TE'],
        [14, 'Denver Broncos', 'DEF'],
      ],
      bestPickRound: 3,
      concern: 'One bad Sunday from that receiver room and the whole thing gets quiet.',
    },
    {
      manager: 'Matty B',
      slot: 2,
      grade: 'A-',
      take: 'Back-to-back running backs and then let the board come to him. The defending champion drafted like one.',
      picks: [
        [1, 'Bijan Robinson', 'RB'],
        [2, 'Jonathan Taylor', 'RB'],
        [3, 'A.J. Brown', 'WR'],
        [4, 'Trey McBride', 'TE'],
        [5, 'Jaylen Waddle', 'WR'],
        [15, 'Houston Texans', 'DEF'],
      ],
      bestPickRound: 1,
    },
    {
      manager: 'Cheese',
      slot: 3,
      grade: 'B+',
      take: 'Solid all the way down and nothing that made Tony put the paper down. That is a compliment and it is also the whole review.',
      picks: [
        [1, 'Jahmyr Gibbs', 'RB'],
        [2, "De'Von Achane", 'RB'],
        [3, 'Garrett Wilson', 'WR'],
        [4, 'Courtland Sutton', 'WR'],
        [5, 'Sam LaPorta', 'TE'],
        [13, 'Baltimore Ravens', 'DEF'],
      ],
      concern: 'Two small running backs carrying the whole thing.',
    },
    {
      manager: 'Brandon',
      slot: 4,
      grade: 'B',
      take: 'Receivers, receivers, and then a look around the room to see who else wanted a running back. Nobody did, which is the only reason this works.',
      picks: [
        [1, 'Saquon Barkley', 'RB'],
        [2, 'Drake London', 'WR'],
        [3, 'Chase Brown', 'RB'],
        [4, 'Tee Higgins', 'WR'],
        [5, 'Jerry Jeudy', 'WR'],
        [16, 'Philadelphia Eagles', 'DEF'],
      ],
      bestPickRound: 2,
      concern: 'Thin behind the first running back, and Tony says that every year to somebody.',
    },
    {
      manager: 'Zack',
      slot: 5,
      grade: 'B-',
      take: 'Went early on a tight end and spent the rest of the night catching up. It might work. Tony is not saying it will.',
      picks: [
        [1, 'Malik Nabers', 'WR'],
        [2, 'Brock Bowers', 'TE'],
        [3, 'Kenneth Walker', 'RB'],
        [4, 'Rome Odunze', 'WR'],
        [5, 'Tony Pollard', 'RB'],
        [14, 'Minnesota Vikings', 'DEF'],
      ],
    },
    {
      manager: 'Nathan',
      slot: 6,
      grade: 'C+',
      take: 'A quarterback in the fourth round is a decision, and Tony would like it noted that it was a decision.',
      picks: [
        [1, 'Justin Jefferson', 'WR'],
        [2, 'Bucky Irving', 'RB'],
        [3, 'Omarion Hampton', 'RB'],
        [4, 'Josh Allen', 'QB'],
        [5, 'Jakobi Meyers', 'WR'],
        [15, 'Pittsburgh Steelers', 'DEF'],
      ],
      concern: 'Spent a fourth on a position everybody else waited eight rounds for.',
    },
    {
      manager: 'Joe',
      slot: 7,
      grade: 'C',
      take: 'Nothing wrong with any single pick. Tony read the whole board twice and could not find the plan.',
      picks: [
        [1, 'Ashton Jeanty', 'RB'],
        [2, 'Nico Collins', 'WR'],
        [3, 'Travis Etienne', 'RB'],
        [4, 'Jameson Williams', 'WR'],
        [5, 'Dallas Goedert', 'TE'],
        [16, 'Green Bay Packers', 'DEF'],
      ],
    },
    {
      manager: 'Nick',
      slot: 8,
      grade: 'C-',
      take: 'Three tight ends. Tony counted them twice because he did not believe it the first time.',
      picks: [
        [1, 'Amon-Ra St. Brown', 'WR'],
        [2, 'Josh Jacobs', 'RB'],
        [3, 'James Cook', 'RB'],
        [4, 'Mark Andrews', 'TE'],
        [5, 'Colston Loveland', 'TE'],
        [13, 'Buffalo Bills', 'DEF'],
      ],
      concern: 'Two of those tight ends are going to sit on a bench all year.',
    },
    {
      manager: 'Alex',
      slot: 9,
      grade: 'D+',
      take: 'Waited on a quarterback until the fourteenth round and then acted surprised. The rest of it is fine. That part is not.',
      picks: [
        [1, 'Derrick Henry', 'RB'],
        [2, 'Puka Nacua', 'WR'],
        [3, 'Breece Hall', 'RB'],
        [4, 'DK Metcalf', 'WR'],
        [5, 'David Njoku', 'TE'],
        [14, 'Detroit Lions', 'DEF'],
      ],
      bestPickRound: 2,
    },
    {
      manager: 'Ryan',
      slot: 10,
      grade: 'F',
      take: 'Tony does not hand these out lightly and is handing one out.',
      picks: [
        [1, 'Christian McCaffrey', 'RB'],
        [2, 'Jaxon Smith-Njigba', 'WR'],
        [3, 'Chuba Hubbard', 'RB'],
        [4, 'Khalil Shakir', 'WR'],
        [5, 'Rachaad White', 'RB'],
        [15, 'Los Angeles Chargers', 'DEF'],
      ],
      concern: 'Every one of those running backs is somebody else’s backup by November.',
    },
  ],
} as const satisfies PreseasonFixture;

/**
 * The longest names this league has, borrowed from the weekly board's own
 * stress fixture (`lib/stakes/boards.ts`) rather than invented here.
 *
 * One list, so *"the longest name"* means the same thing on the chalkboard and
 * in the paper. A second set would drift, and the first time it mattered the two
 * screens would disagree about which name is the hard one.
 *
 * **All ten, not the first few.** The scrolled state photographs the *tenth*
 * section, so a list that ran out at five would have put the long names in the
 * half of the paper the camera never reaches and a short one in the half it
 * does.
 */
const LONG_MANAGERS = [
  'Christopher Papadopoulos',
  'MattyB2317Longhand',
  'cheesekingofdetroit',
  'SuggMyNickerbocker',
  'BigJuncerooniiii',
  'Bartholomew Higgs',
  'NicholasAlexander',
  'Topouzianopoulos',
  // Eight is what the board's list holds. The last two are the two shapes that
  // list does not have — a name that is one unbroken word at the limit, and one
  // that wraps only because of where its single space falls — so the ten cover
  // the wrap, the no-wrap and the near-miss rather than eight of one kind.
  'Bartholomewwwwwwwwwwwww',
  'Wilhelmina Featherstonehaugh',
] as const;

/** A take at exactly `TAKE_MAX`, which is the only length worth photographing. */
const LONGEST_TAKE =
  'Tony has looked at this board four times now and he still cannot decide whether it is the ' +
  'bravest thing anybody did on draft night or the one that gets quietly deleted in October, ' +
  'and that is about the nicest thing he can say about a draft.';

/**
 * The same draft with most of the optional fields empty — and the type at its
 * hardest.
 *
 * **This is the state Tony really files.** The commissioner's workload rule is a
 * grade and a take per manager, with the best pick and the concern optional — so
 * the page has to look finished when eight of ten sections carry neither, and
 * the only way to know whether it does is to photograph it.
 *
 * The two teams that keep theirs are deliberate: one keeps only a best pick and
 * one keeps only a concern, so the two asides are each proved to stand alone
 * rather than only as a pair.
 *
 * **It also carries the long names and the longest legal take**, and that
 * pairing is the point rather than a convenience: a 24-character name beside a
 * grade is hardest when there is *nothing else in the section* to push the
 * layout around, which is exactly what a stripped section is. Photographing the
 * two stresses separately would have meant photographing each in the state that
 * makes it easiest.
 */
const DRAFT_2026_SPARSE: PreseasonFixture = {
  ...DRAFT_2026,
  weekOne: [],
  teams: (DRAFT_2026.teams as readonly PreseasonFixtureTeam[]).map((team, index) => {
    const stripped: PreseasonFixtureTeam = {
      manager: LONG_MANAGERS[index] ?? team.manager,
      slot: team.slot,
      grade: team.grade,
      // Every section is at the limit, so the wrap is measured on all ten
      // rather than on whichever one happened to be longest.
      take: LONGEST_TAKE,
      picks: team.picks,
    };
    if (index === 0 && team.bestPickRound !== undefined) {
      return { ...stripped, bestPickRound: team.bestPickRound };
    }
    if (index === 2 && team.concern !== undefined) {
      return { ...stripped, concern: team.concern };
    }
    return stripped;
  }),
};

const PRESEASON_FIXTURES: Readonly<Partial<Record<SliceEditionKey, PreseasonFixture>>> = {
  'preseason-draft-review': DRAFT_2026,
  'preseason-sparse': DRAFT_2026_SPARSE,
};

/**
 * Render a written-out draft through the production pipeline.
 *
 * The same rule the weekly fixtures follow: `managerDraftFacts`,
 * `draftObservations`, `assemblePreseasonPacket`, `renderPreseason` and
 * `validatePreseason` are the **shipping** functions, so what is a fixture is
 * the draft and what is real is everything that happens to it. A preview that
 * ran its own assembly would be evidence about the preview.
 *
 * It writes nothing and never touches the database, which is stronger isolation
 * than the seat-based demos need — a newspaper has no state to isolate.
 */
function renderPreseasonFixture(db: Queryable, fixture: PreseasonFixture): PreviewEdition {
  void db;

  const rosterOf = new Map(fixture.teams.map((team, index) => [team.manager, index + 1] as const));

  /* Every pick, in board order, so the label and the pick number are real. */
  const flat = fixture.teams
    .flatMap((team) =>
      team.picks.map(([round, playerName, position]) => ({
        team,
        round,
        playerName,
        position,
        /*
         * A snake draft: odd rounds run down the board and even rounds run back
         * up it. Written out rather than assumed, because `1.01` next to a slot
         * that could not have made that pick is exactly the kind of small wrong
         * fact this page must not carry.
         */
        indexInRound: round % 2 === 1 ? team.slot : fixture.teams.length + 1 - team.slot,
      })),
    )
    .sort((a, b) => a.round - b.round || a.indexInRound - b.indexInRound);

  const picksById = new Map<string, DraftPickFact & { rosterId: number | null }>();
  flat.forEach((entry, index) => {
    const id = `fixture-${String(index + 1)}`;
    picksById.set(id, {
      id,
      pickNo: index + 1,
      round: entry.round,
      label: pickLabel(entry.round, entry.indexInRound),
      playerName: entry.playerName,
      position: entry.position,
      nflTeam: null,
      isKeeper: false,
      rosterId: rosterOf.get(entry.team.manager) ?? null,
    });
  });

  const ordered = [...picksById.values()];

  const managers = fixture.teams.map((team) => {
    const rosterId = rosterOf.get(team.manager)!;
    return managerDraftFacts({
      userId: `fixture:${team.manager}`,
      displayName: team.manager,
      rosterId,
      draftSlot: team.slot,
      picks: ordered.filter((entry) => entry.rosterId === rosterId),
    });
  });

  const nameByRoster = new Map(
    fixture.teams.map((team) => [rosterOf.get(team.manager)!, team.manager] as const),
  );

  const facts: DraftFacts = {
    season: fixture.season,
    sleeperDraftId: 'fixture',
    status: 'complete',
    type: 'snake',
    rounds: fixture.rounds,
    completedAt: null,
    totalPicks: ordered.length,
    managers: [...managers].sort((a, b) => (a.draftSlot ?? 0) - (b.draftSlot ?? 0)),
    observations: draftObservations(ordered, (rosterId) =>
      rosterId === null ? null : (nameByRoster.get(rosterId) ?? null),
    ),
  };

  const teams: PreseasonTeamFacts[] = fixture.teams.map((team) => {
    const theirs = managers.find((manager) => manager.displayName === team.manager)!;
    return {
      facts: theirs,
      grade: team.grade,
      take: team.take,
      bestPick:
        team.bestPickRound === undefined
          ? null
          : (theirs.picks.find((entry) => entry.round === team.bestPickRound) ?? null),
      concern: team.concern ?? null,
    };
  });

  const packet = assemblePreseasonPacket({
    season: fixture.season,
    facts,
    teams,
    champion: fixture.champion ?? null,
    weekOne: (fixture.weekOne ?? []).map(([left, right]) => ({ left, right })),
    outstanding: [],
    reviewed: teams.length,
    total: teams.length,
    complete: true,
  });

  const issue = renderPreseason(packet);
  if (issue === null) {
    throw new Error('the preseason fixture rendered nothing — a defect in the fixture, not the demo');
  }

  const checked = validatePreseason(issue, packet);
  if (!checked.verdict.publishable) {
    /*
     * A preview the validator refuses is a **defect in the fixture**, and it
     * throws rather than rendering: a demo that quietly printed prose the real
     * gate would refuse is a demo of something this product does not do. It has
     * already caught one — a player name whose apostrophe made the scanner see a
     * proper noun the packet had not declared.
     */
    throw new Error(
      'the preseason fixture does not validate: ' +
        checked.verdict.violations
          .map((violation) => `${violation.kind} ${violation.value}`)
          .join(', '),
    );
  }

  return { mode: 'issue', issue, leadKind: null };
}
