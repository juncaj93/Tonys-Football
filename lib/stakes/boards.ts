import { type Queryable } from '@/lib/db';
import { DemoRefused, assertDemoAllowed } from '@/lib/demo/guard';
import { economyFor, PROVISIONAL_ECONOMY, type EconomyValues } from '@/lib/counter/tokens';
import { seasons } from '@/lib/db/schema';
import { type StoredWeekGame } from '@/lib/stats/week';
import { desc, isNull } from 'drizzle-orm';

import { authorBounty, authorChalkboard, authorTonysLine, type AuthoredStake } from './author';
import { WAITING } from './copy';
import { buildBasis, buildWeekResult, stakeSeason, type WeekResult } from './facts';
import {
  VARIANTS,
  settlementKeyFor,
  type Evidence,
  type Presentation,
  type Resolution,
  type Side,
  type Stake,
  type Variant,
} from './model';
import { type BoardItem, type Chalkboard } from './chalkboard';
import { renderEntry, renderStake } from './render';
import { resolveStake, settleEntry } from './resolve';
import { presentationOf } from './service';

/**
 * Every state of the weekly-stakes surfaces, reachable by name.
 *
 * `MANDATE §8`: *"a feature is not demo-ready if showing its states needs
 * hand-edited SQL."* The board has sixteen states worth looking at before
 * September and **none of them will occur naturally before then** — there is no
 * 2026 game, so the honest live board is the quiet one, which is exactly one of
 * the sixteen.
 *
 * ## This is `lib/slice/editions.ts`'s design, deliberately
 *
 * The Slice's fifteen editions established the pattern and the reasoning
 * transfers exactly: a board is a **rendering**, and a rendering demo has no
 * state to isolate. So:
 *
 * 1. **Fixed** — no clock, no randomness, no live season. Same bytes every run.
 * 2. **Reachable by Playwright** — `?board=<key>`, resolved on the server.
 * 3. **Never in production** — `assertDemoAllowed` refuses outright, and an
 *    ordinary request without the parameter is untouched.
 * 4. **Writes nothing.** No stake row, no entry, no resolution, no ledger
 *    movement. A demo cannot contaminate a settlement record, which is stronger
 *    than the seat-based isolation the loot demos need.
 *
 * ## What this deliberately does *not* demonstrate
 *
 * Idempotency, transactionality, duplicate-settlement refusal and overdraft.
 * Those are database guarantees and a screenshot cannot show one. They are
 * asserted against a real Postgres in `settlement.test.ts` — ten parallel
 * settlements producing one payout is a test, and pretending a picture of a
 * settled board proved it would be the false green this repository has now
 * shipped three times.
 *
 * ## Both sources go through the production pipeline
 *
 * - **`historical`** — a real week of a finalized season. The strongest fixed
 *   data available: the season is closed and the rows are immutable by trigger.
 * - **`fixture`** — a frozen season written out here, for states history does
 *   not contain (a score landing exactly on the line; a bounty window closing).
 *
 * Both run `buildBasis → authorX → resolveStake → renderStake`, the same four
 * functions production runs. A demo with its own assembly would be evidence
 * about the demo.
 */

export const BOARD_STATES = [
  'quiet',
  'chalkboard-open',
  'chalkboard-hit',
  'chalkboard-missed',
  'line-pending',
  'line-incomplete',
  'line-won',
  'line-lost',
  'line-push',
  'bounty-open',
  'bounty-missed',
  'bounty-claimed',
  'bounty-expired',
  'thin-basis',
  'retired-excluded',
  'long-names',
  'chalkboard-leader',
] as const;

export type BoardStateKey = (typeof BOARD_STATES)[number];

/** What a preview hands the two surfaces. Exactly what a live read hands them. */
export interface BoardPreview {
  readonly board: Chalkboard;
  readonly bounty: BoardItem | null;
}

/**
 * One line per state, in the room's language rather than the schema's.
 *
 * The CLI prints these and `boards.test.ts` asserts the map is total, so a state
 * added without a description fails the build rather than listing blank.
 */
export const BOARD_DESCRIPTIONS: Readonly<Record<BoardStateKey, string>> = {
  quiet: 'the wiped slate — nothing authored, which is what July looks like',
  'chalkboard-open': 'a prediction up, and the week not played',
  'chalkboard-hit': 'Tony called it, with the evidence under it',
  'chalkboard-missed': 'Tony ate one',
  'line-pending': 'the market open, with both sides to take',
  'line-incomplete': "the week played and the books open, so nothing settles",
  'line-won': 'a manager who took a side and had it',
  'line-lost': 'a manager who took a side and did not',
  'line-push': 'a team that landed exactly on the number',
  'bounty-open': 'a bounty on the board, unclaimed',
  'bounty-missed': 'a week where nobody got near it, and it rolls on',
  'bounty-claimed': 'somebody took it off the board',
  'bounty-expired': 'the window closed with nobody near it',
  'thin-basis': 'too little season to set a line from — the board stays quiet',
  'retired-excluded': 'a week whose loudest score belongs to somebody not in this league',
  'long-names': 'the longest names this league has, in every slot at once',
  'chalkboard-leader': 'the table prediction, which only the no-repeat rule reaches',
};

/* -------------------------------------------------------------------------
 * The fixtures
 * ---------------------------------------------------------------------- */

interface HistoricalBoard {
  readonly season: number;
  /** The week the stake is authored for. */
  readonly week: number;
  readonly show: readonly ('chalkboard' | 'line' | 'bounty')[];
  /** Which week to settle against. Null leaves everything open. */
  readonly settleWeek: number | null;
  /** Render as though the week had not been played yet. */
  readonly unplayed?: boolean;
  /** Render as though the season's books were still open. */
  readonly booksOpen?: boolean;
  /** A pick to show on the market, by the side taken. */
  readonly pick?: Side;
  /** What last week's chalkboard used, so the no-repeat rule picks another. */
  readonly lastVariant?: Variant;
}

/**
 * Weeks chosen by reading what the pipeline actually produces, never by guessing.
 *
 * `boards.test.ts` pins the *character* of each one — that `chalkboard-hit`
 * really resolves `hit`, that `line-won` really pays — so a calibration change
 * that quietly turns a state into its opposite fails the build rather than the
 * review. That check exists because the Slice's editions needed it and found two.
 */
const HISTORICAL: Readonly<Partial<Record<BoardStateKey, HistoricalBoard>>> = {
  // 2025 week 9: the record through week 8 is 172.28 and the week's best is
  // 139.02, so the prediction stands. Read off the pipeline, not guessed.
  'chalkboard-open': {
    season: 2025,
    week: 9,
    show: ['chalkboard'],
    settleWeek: null,
    unplayed: true,
  },
  'chalkboard-hit': { season: 2025, week: 9, show: ['chalkboard'], settleWeek: 9 },
  // 2025 week 4: the record through week 3 is 161.36 and somebody puts up 182.52.
  // Tony eats one. The only shape of week that produces `missed` on this variant.
  'chalkboard-missed': { season: 2025, week: 4, show: ['chalkboard'], settleWeek: 4 },
  /*
   * The second prediction shape, and it is only reachable through the no-repeat
   * rule.
   *
   * `nobody-clears-record` is first in priority and can be built in every week
   * with a season behind it, so without `lastVariant` the other two variants
   * would never author — and two of the three shapes Tony can put on the board
   * would be unphotographable. That is worth knowing about the priority design
   * rather than discovering in September.
   */
  'chalkboard-leader': {
    season: 2025,
    week: 9,
    show: ['chalkboard'],
    settleWeek: 9,
    lastVariant: VARIANTS.nobodyClearsRecord,
  },
  'line-pending': {
    season: 2025,
    week: 9,
    show: ['chalkboard', 'line'],
    settleWeek: null,
    unplayed: true,
  },
  'line-incomplete': {
    season: 2025,
    week: 9,
    show: ['chalkboard', 'line'],
    settleWeek: null,
    booksOpen: true,
    pick: 'over',
  },
  /*
   * 2025 week 9, line 127.82, and the first team in stored order is Nick on
   * 124.16 — under. So `under` wins and `over` loses, against the same manager
   * and the same score. The two states differ in exactly one field, which is the
   * comparison a reviewer wants and the one a screenshot can actually settle.
   */
  'line-won': { season: 2025, week: 9, show: ['chalkboard', 'line'], settleWeek: 9, pick: 'under' },
  'line-lost': { season: 2025, week: 9, show: ['chalkboard', 'line'], settleWeek: 9, pick: 'over' },
  /*
   * 2024's bounty is the whole loop in one season: opened in week 6 against
   * Brandon's 171.16, nobody near it for three weeks, taken in week 9 — the last
   * week of its window.
   */
  'bounty-open': { season: 2024, week: 6, show: ['bounty'], settleWeek: null, unplayed: true },
  'bounty-missed': { season: 2024, week: 6, show: ['bounty'], settleWeek: 7 },
  'bounty-claimed': { season: 2024, week: 6, show: ['bounty'], settleWeek: 9 },
  /*
   * 2025's does the opposite, and history really contains it: opened in week 5
   * against Nick's 172.28, which nothing in the rest of that season goes past.
   * The window closes in week 8 with the board wiped.
   */
  'bounty-expired': { season: 2025, week: 5, show: ['bounty'], settleWeek: 8 },
  /*
   * The publication boundary, doing something a manager could notice.
   *
   * 2025 week 4 contains a **182.52** — the biggest number in that season — and
   * the bounty authored for week 5 targets **172.28** instead. The 182.52 was
   * posted in a game against somebody who is not in this league, so
   * `publishableWeek` drops the whole game before any maximum is taken. A bounty
   * that named it would be asking the league to beat a number that is not on any
   * board they can see.
   */
  'retired-excluded': {
    season: 2025,
    week: 5,
    show: ['chalkboard', 'bounty'],
    settleWeek: null,
    unplayed: true,
  },
  // Week one: no basis at all, so every variant refuses and the slate stays wiped.
  'thin-basis': {
    season: 2025,
    week: 1,
    show: ['chalkboard', 'line', 'bounty'],
    settleWeek: null,
    unplayed: true,
  },
};

/** One frozen game. Points as a reader sees them, like the Slice's fixtures. */
interface FixtureGame {
  readonly a: string;
  readonly aPoints: number;
  readonly b: string;
  readonly bPoints: number;
}

interface FixtureWeek {
  readonly week: number;
  readonly games: readonly FixtureGame[];
}

interface BoardFixture {
  readonly season: number;
  readonly week: number;
  readonly show: readonly ('chalkboard' | 'line' | 'bounty')[];
  readonly settleWeek: number | null;
  readonly weeks: readonly FixtureWeek[];
  readonly unplayed?: boolean;
  readonly pick?: Side;
  /** Whose team the manager's pick belongs to. Must be in the fixture. */
  readonly asManager?: string;
}

/*
 * A flat season, deliberately.
 *
 * The basis needs twelve team-weeks before a median exists, so every fixture
 * carries at least three four-game weeks. Scores repeat where the state does not
 * care about them: a fixture that varied everything would make the one number
 * under test harder to find, not more realistic.
 */
const F = ['Ade', 'Bo', 'Cal', 'Dee', 'Eli', 'Fitz', 'Gus', 'Hal'] as const;

const FLAT: readonly FixtureGame[] = [
  { a: F[0], aPoints: 110.0, b: F[1], bPoints: 100.0 },
  { a: F[2], aPoints: 120.0, b: F[3], bPoints: 105.0 },
  { a: F[4], aPoints: 115.0, b: F[5], bPoints: 108.0 },
  { a: F[6], aPoints: 118.0, b: F[7], bPoints: 102.0 },
];

/**
 * The longest names this product can actually be asked to set.
 *
 * Not invented long strings: `content/counter-greetings.md` and the imported
 * league carry real handles, and a layout that survives a fabricated
 * forty-character name while failing on a real seventeen-character one has been
 * tested against the wrong thing. These are the real shapes — a two-word name, a
 * name with a number in it, and the longest single word in the league — set one
 * longer than any of them so the fixture is a ceiling rather than a sample.
 */
const LONG = [
  'Christopher Papadopoulos',
  'MattyB2317Longhand',
  'SuggMyNickerbocker',
  'BigJuncerooniiii',
  'cheesekingofdetroit',
  'Topouzianopoulos',
  'NicholasAlexander',
  'Bartholomew Higgs',
] as const;

const LONG_GAMES: readonly FixtureGame[] = [
  { a: LONG[0], aPoints: 110.0, b: LONG[1], bPoints: 100.0 },
  { a: LONG[2], aPoints: 120.0, b: LONG[3], bPoints: 105.0 },
  { a: LONG[4], aPoints: 115.0, b: LONG[5], bPoints: 108.0 },
  { a: LONG[6], aPoints: 118.0, b: LONG[7], bPoints: 102.0 },
];

const FIXTURES: Readonly<Partial<Record<BoardStateKey, BoardFixture>>> = {
  /*
   * A team landing **exactly** on the line.
   *
   * It has never happened in this league's recorded history and it is a real
   * outcome of a market whose line is a real score to the cent — so it is a
   * fixture, and that is the fact layer being right rather than a gap.
   *
   * Three flat weeks put twenty-four team-weeks in the basis, whose lower median
   * is **108.00** — and `Ade` posts exactly 108.00 in week four. The number is
   * derived by the same code the market uses, so changing a fixture score without
   * re-deriving it breaks `boards.test.ts` rather than quietly turning this into
   * a state that is no longer a push.
   */
  'line-push': {
    season: 2026,
    week: 4,
    show: ['line'],
    settleWeek: 4,
    pick: 'over',
    asManager: F[0],
    weeks: [
      { week: 1, games: FLAT },
      { week: 2, games: FLAT },
      { week: 3, games: FLAT },
      {
        week: 4,
        games: [
          { a: F[0], aPoints: 108.0, b: F[1], bPoints: 99.0 },
          { a: F[2], aPoints: 121.0, b: F[3], bPoints: 104.0 },
          { a: F[4], aPoints: 116.0, b: F[5], bPoints: 107.0 },
          { a: F[6], aPoints: 119.0, b: F[7], bPoints: 101.0 },
        ],
      },
    ],
  },

  /** Every slot carrying the longest string it can be handed. */
  'long-names': {
    season: 2026,
    week: 4,
    show: ['chalkboard', 'line', 'bounty'],
    settleWeek: null,
    unplayed: true,
    weeks: [
      { week: 1, games: LONG_GAMES },
      { week: 2, games: LONG_GAMES },
      { week: 3, games: LONG_GAMES },
    ],
  },
};

/* -------------------------------------------------------------------------
 * Resolution
 * ---------------------------------------------------------------------- */

function isBoardKey(value: string): value is BoardStateKey {
  return (BOARD_STATES as readonly string[]).includes(value);
}

/**
 * Resolve `?board=line-won` to something the surfaces can render, or null.
 *
 * Null is the answer for every ordinary request and for every request in an
 * environment where demos are not allowed — the caller renders the board exactly
 * as it would have. Anything else would leak that the parameter exists.
 */
export async function previewBoard(
  db: Queryable,
  raw: string | string[] | undefined,
  env: Record<string, string | undefined>,
): Promise<BoardPreview | null> {
  if (typeof raw !== 'string' || raw === '') return null;

  try {
    assertDemoAllowed(env);
  } catch (error: unknown) {
    if (error instanceof DemoRefused) return null;
    throw error;
  }

  if (!isBoardKey(raw)) return null;
  return resolveBoard(db, raw);
}

const EMPTY: BoardPreview = {
  board: { prediction: null, market: null, quiet: true },
  bounty: null,
};

/**
 * Build one named board.
 *
 * Exported without the guard so tests and the CLI can render every state
 * directly. The guard belongs to the **route**, which is where an untrusted
 * request arrives; a test that had to set an environment variable to check its
 * own fixtures would be testing the guard.
 */
export async function resolveBoard(db: Queryable, key: BoardStateKey): Promise<BoardPreview> {
  if (key === 'quiet') return EMPTY;

  const fixture = FIXTURES[key];
  if (fixture !== undefined) return renderFixture(fixture);

  const historical = HISTORICAL[key];
  if (historical === undefined) {
    /*
     * Exhaustiveness at runtime, not only at compile time.
     *
     * A key added to `BOARD_STATES` and forgotten in both tables would otherwise
     * resolve to `undefined` and render the quiet slate — which photographs
     * cleanly and passes. That false green has happened three times in this
     * repository, so the fourth throws.
     */
    throw new Error(
      `board state "${key}" is declared but not implemented — it is in ` +
        'BOARD_STATES and in neither HISTORICAL nor FIXTURES.',
    );
  }

  return renderHistorical(db, historical);
}

/**
 * The numbers this deploy would run a market on.
 *
 * Read from the **open** season's stored config, not from the stake's own — a
 * historical board is a preview of what a live one would look like, and 2024 has
 * no `economy_configs` row because nobody ever spent a token in it. Falling back
 * to the constant keeps every board renderable on an unseeded database, which is
 * what a unit test has.
 *
 * Production authoring does not go through here: `authorStakesForWeek` reads the
 * config of the season it is authoring into, which in a live season is the open
 * one and always has a row.
 */
async function economy(db: Queryable): Promise<EconomyValues> {
  const [row] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(isNull(seasons.finalizedAt))
    .orderBy(desc(seasons.year))
    .limit(1);

  if (row === undefined) return PROVISIONAL_ECONOMY;
  try {
    return (await economyFor(db, row.id)).values;
  } catch {
    // An unseeded database is a legitimate state for a fixture to render in.
    return PROVISIONAL_ECONOMY;
  }
}

async function renderHistorical(db: Queryable, spec: HistoricalBoard): Promise<BoardPreview> {
  const season = await stakeSeason(db, spec.season);
  if (!season.found) return EMPTY;

  const basis = buildBasis({ ...season, season: spec.season, week: spec.week });

  /*
   * `unplayed` and `booksOpen` are rendered by **withholding facts**, never by
   * asserting a state.
   *
   * A demo that set `presentation: 'awaiting-week'` directly would be a picture
   * of a string. These build the week the surface would really see — empty, or
   * populated with the books open — and let `presentationOf` reach its own
   * conclusion, which is the thing under review.
   */
  const week = spec.unplayed
    ? emptyWeek(spec.season, spec.week)
    : buildWeekResult({
        ...season,
        season: spec.season,
        week: spec.settleWeek ?? spec.week,
        seasonFinalizedAt: spec.booksOpen === true ? null : season.seasonFinalizedAt,
      });

  const settleAgainst =
    spec.settleWeek === null
      ? null
      : buildWeekResult({ ...season, season: spec.season, week: spec.settleWeek });

  return assemble({
    basis,
    economy: await economy(db),
    show: spec.show,
    presentationWeek: week,
    settleAgainst,
    pick: spec.pick ?? null,
    pickManagerId: pickManagerFrom(settleAgainst ?? week, spec.pick),
    lastVariant: spec.lastVariant ?? null,
  });
}

/**
 * Render a frozen season through the production pipeline.
 *
 * The roster is synthesised the way `editions.ts` synthesises its own, and every
 * seat is publishable — a fixture that needed the retired-manager boundary would
 * be testing the boundary rather than the board, and `retired-excluded` does that
 * against real history where the exclusion is real.
 */
function renderFixture(fixture: BoardFixture): BoardPreview {
  const names = [
    ...new Set(fixture.weeks.flatMap((week) => week.games.flatMap((game) => [game.a, game.b]))),
  ].sort();

  const roster = new Map(
    names.map((name, index) => [index + 1, { userId: `demo-board:${name}`, displayName: name }]),
  );
  const rosterIdOf = new Map(names.map((name, index) => [name, index + 1]));
  const eligibleUserIds = new Set([...roster.values()].map((seat) => seat.userId));

  const rows: StoredWeekGame[] = fixture.weeks.flatMap((week) =>
    week.games.map((game, index): StoredWeekGame => {
      const aId = rosterIdOf.get(game.a) ?? 0;
      const bId = rosterIdOf.get(game.b) ?? 0;
      const aCents = Math.round(game.aPoints * 100);
      const bCents = Math.round(game.bPoints * 100);
      return {
        week: week.week,
        weekType: 'regular',
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

  const shared = {
    rows,
    roster,
    // Frozen weeks are final by construction: they are written out, so nothing
    // about them can move. `line-incomplete` is the state that needs the
    // opposite, and it uses real history where the openness is real.
    seasonFinalizedAt: new Date('2027-01-06T00:00:00Z'),
    weekFinalizedAt: null,
    eligibleUserIds,
  };

  const basis = buildBasis({ ...shared, season: fixture.season, week: fixture.week });

  const week = fixture.unplayed
    ? emptyWeek(fixture.season, fixture.week)
    : buildWeekResult({ ...shared, season: fixture.season, week: fixture.settleWeek ?? fixture.week });

  const settleAgainst =
    fixture.settleWeek === null
      ? null
      : buildWeekResult({ ...shared, season: fixture.season, week: fixture.settleWeek });

  return assemble({
    basis,
    economy: PROVISIONAL_ECONOMY,
    show: fixture.show,
    presentationWeek: week,
    settleAgainst,
    pick: fixture.pick ?? null,
    pickManagerId:
      fixture.asManager === undefined
        ? pickManagerFrom(settleAgainst ?? week, fixture.pick)
        : `demo-board:${fixture.asManager}`,
    lastVariant: null,
  });
}

/** A week nobody has played. What the surface sees before kickoff. */
function emptyWeek(season: number, week: number): WeekResult {
  return {
    season,
    week,
    finality: { final: false, reason: 'no-games', source: null },
    teams: [],
    gameKeys: [],
  };
}

/**
 * Whose pick to show, when the fixture did not name one.
 *
 * The **first team in stored order** — deterministic, and deliberately not "the
 * one that makes the state look good". `line-won` and `line-lost` differ only in
 * the side taken, against the same manager and the same score, which is the
 * comparison a reviewer actually wants.
 */
function pickManagerFrom(week: WeekResult | null, side: Side | undefined): string | null {
  if (side === undefined || week === null) return null;
  return week.teams[0]?.managerId ?? null;
}

/**
 * Turn authored stakes and a week into what the surfaces render.
 *
 * Every step is production's: `authorX` builds the offer, `resolveStake` decides,
 * `settleEntry` scores the pick, `renderStake` writes and validates. Nothing here
 * constructs a sentence, an outcome or a presentation directly.
 */
function assemble(input: {
  readonly basis: ReturnType<typeof buildBasis>;
  readonly economy: EconomyValues;
  readonly show: readonly ('chalkboard' | 'line' | 'bounty')[];
  readonly presentationWeek: WeekResult;
  readonly settleAgainst: WeekResult | null;
  readonly pick: Side | null;
  readonly pickManagerId: string | null;
  readonly lastVariant: Variant | null;
}): BoardPreview {
  const authored = {
    chalkboard: input.show.includes('chalkboard')
      ? authorChalkboard(input.basis, input.economy, input.lastVariant)
      : null,
    line: input.show.includes('line') ? authorTonysLine(input.basis, input.economy) : null,
    bounty: input.show.includes('bounty') ? authorBounty(input.basis, input.economy) : null,
  };

  const build = (draft: AuthoredStake | string | null): BoardItem | null => {
    if (draft === null || typeof draft === 'string') return null;

    const stake = toStake(draft);

    const resolved =
      input.settleAgainst === null
        ? null
        : resolveStake({
            variant: stake.variant,
            factRefs: stake.factRefs,
            week: input.settleAgainst,
            expiresAfterWeek: stake.expiresAfterWeek,
          });

    const resolution: Resolution | null =
      resolved !== null && resolved.settled
        ? {
            outcome: resolved.outcome,
            resolvedWeek: input.settleAgainst?.week ?? stake.week,
            claimedByUserId: null,
            evidence: resolved.evidence as Evidence,
            /* Fixed, because a demo must produce the same bytes on every run. */
            resolvedAt: new Date('2026-01-06T05:00:00Z'),
          }
        : null;

    /*
     * Derived by the **same** function the live surface uses, from a stake whose
     * status has been advanced the way settlement would advance it.
     *
     * A preview that computed its own presentation would be a picture of this
     * file's opinion. `presentationOf` is the thing under review — it is what
     * decides whether a manager is told *"still being counted"* or *"nobody has
     * got there yet"*, and those are the two sentences most likely to be wrong.
     */
    const settledStatus =
      resolution === null ? 'open' : resolution.outcome === 'unclaimed' ? 'expired' : 'resolved';
    const presentation: Presentation = presentationOf(
      { ...stake, status: settledStatus },
      input.presentationWeek,
    );

    const copy = renderStake({ stake, resolution, presentation });
    if (copy === null) return null;

    const entry = entryFor(stake, input, resolution !== null);

    return {
      stakeKey: stake.stakeKey,
      stakeId: `preview:${stake.stakeKey}`,
      kind: stake.kind,
      season: stake.season,
      week: stake.week,
      presentation,
      copy,
      waiting: WAITING[presentation],
      entry,
      canPick:
        stake.kind === 'TONYS_LINE' && entry === null && input.presentationWeek.teams.length === 0,
      stakeTokens: stake.stakeTokens,
    };
  };

  const bounty = build(authored.bounty);

  return {
    board: {
      prediction: build(authored.chalkboard),
      market: build(authored.line),
      quiet: build(authored.chalkboard) === null && build(authored.line) === null,
    },
    bounty,
  };
}

/** The manager's own pick, scored by the same function settlement uses. */
function entryFor(
  stake: Stake,
  input: {
    readonly settleAgainst: WeekResult | null;
    readonly pick: Side | null;
    readonly pickManagerId: string | null;
  },
  settled: boolean,
): BoardItem['entry'] {
  if (
    stake.kind !== 'TONYS_LINE' ||
    input.pick === null ||
    stake.stakeTokens === null ||
    stake.rewardTokens === null
  ) {
    return null;
  }

  if (!settled || input.settleAgainst === null) {
    return { side: input.pick, stakedTokens: stake.stakeTokens, verdict: null };
  }

  const lineCents = Math.round(Number.parseFloat(stake.factRefs.values['line'] ?? '0') * 100);
  const team =
    input.settleAgainst.teams.find((candidate) => candidate.managerId === input.pickManagerId) ??
    null;

  const verdict = settleEntry({
    side: input.pick,
    stakedTokens: stake.stakeTokens,
    rewardTokens: stake.rewardTokens,
    lineCents,
    team,
  });

  return {
    side: input.pick,
    stakedTokens: stake.stakeTokens,
    verdict: renderEntry({
      id: 'preview',
      userId: input.pickManagerId ?? 'preview',
      side: input.pick,
      stakedTokens: stake.stakeTokens,
      outcome: verdict.outcome,
      payoutTokens: verdict.payoutTokens,
    }),
  };
}

/** An authored draft, in the shape a stored row would have had. */
function toStake(draft: AuthoredStake): Stake {
  return {
    id: `preview:${draft.stakeKey}`,
    seasonId: 'preview',
    season: draft.season,
    week: draft.week,
    kind: draft.kind,
    stakeKey: draft.stakeKey,
    status: 'open',
    variant: draft.variant,
    eligibleUserIds: draft.eligibleUserIds,
    factRefs: draft.factRefs,
    allowedNumbers: draft.allowedNumbers,
    allowedNames: draft.allowedNames,
    authorVersion: draft.authorVersion,
    stakeTokens: draft.stakeTokens,
    rewardTokens: draft.rewardTokens,
    expiresAfterWeek: draft.expiresAfterWeek,
    settlementKey: settlementKeyFor(draft.stakeKey),
    voidReason: null,
  };
}

/** Every board, rendered. The one call a test needs to prove the catalog works. */
export async function allBoards(
  db: Queryable,
): Promise<readonly { key: BoardStateKey; preview: BoardPreview }[]> {
  const out: { key: BoardStateKey; preview: BoardPreview }[] = [];
  for (const key of BOARD_STATES) out.push({ key, preview: await resolveBoard(db, key) });
  return out;
}
