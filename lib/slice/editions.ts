import { type Queryable } from '@/lib/db';
import { DemoRefused, assertDemoAllowed } from '@/lib/demo/guard';
import { finalizedMarginsCents } from '@/lib/stats/facts';
import { standardPolicy } from '@/lib/stats/significance';
import { deriveStories, type StoryKind } from '@/lib/stats/stories';
import { buildWeek, publishableWeek, type StoredWeekGame } from '@/lib/stats/week';

import { editionFor, latestEdition } from './edition';
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
};

/** The catalog, for the CLI and for the visual driver's exhaustiveness check. */
export const SLICE_EDITION_CATALOG: readonly SliceEditionEntry[] = SLICE_EDITIONS.map(
  (key): SliceEditionEntry => ({
    key,
    shows: SLICE_EDITION_DESCRIPTIONS[key],
    source: key in RACK ? 'rack' : key in FIXTURES ? 'fixture' : 'historical',
  }),
);

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
        'SLICE_EDITIONS and in none of RACK, HISTORICAL or FIXTURES.',
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
