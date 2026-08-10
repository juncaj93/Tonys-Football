import { type Queryable } from '@/lib/db';
import { seasonMemberships, seasons } from '@/lib/db/schema';
import { activeManagerIds } from '@/lib/league/membership';
import { finalizedMarginsCents } from '@/lib/stats/facts';
import { weekFinality } from '@/lib/stats/finality';
import { standardPolicy } from '@/lib/stats/significance';
import { weekSnapshot, type WeekSnapshotMap } from '@/lib/stats/snapshot';
import { deriveStories, type StoryCandidate } from '@/lib/stats/stories';
import {
  buildWeek,
  publishableWeek,
  seasonWeeks,
  teamScoresCents,
  type WeekRecord,
} from '@/lib/stats/week';
import { eq, isNotNull } from 'drizzle-orm';

import { selectStories, type Demoted, type Selection, type Suppressed } from './select';
import { type StoryKind } from '@/lib/stats/stories';

/**
 * The fact packet — everything one issue of the Slice is allowed to say.
 *
 * `16 §9` draws the pipeline as:
 *
 * ```
 * sync → story detection → scoring → selection → FACT PACKET
 *                                                  ├─→ Template renderer (deterministic, free)
 *                                                  └─→ LLM renderer (optional, per story)
 *                                                        ↓
 *                            deterministic validation → review → publish
 * ```
 *
 * Everything upstream of the packet is `lib/stats`. Everything downstream reads
 * **only** the packet. That boundary is the whole design, and it is what makes
 * `16 §9`'s *"every number and proper noun must match an allowed value in the
 * fact packet"* checkable rather than aspirational: the validator does not need
 * to know what is true, it needs to know what was allowed.
 *
 * ## Why the allowed sets are built here and not in the validator
 *
 * If the validator derived its own allowed values it would be marking its own
 * homework — the same failure `MANDATE §10` names for a narrative layer that
 * calculates and approves its own claims. So the packet states, up front and as
 * data, exactly which numbers and which names may appear in prose about it. A
 * renderer that produces anything else is wrong by construction, whether it is a
 * template or a language model.
 *
 * Each story declares its own allowed values (`lib/stats/stories.ts`) and the
 * packet unions them. A new story kind that forgets to declare a number does not
 * slip past the validator — it gets refused the first time it renders, loudly,
 * which is the only failure mode worth having.
 *
 * ## The publication boundary is applied here, once
 *
 * A fact naming a retired manager is a true fact and stays in the fact layer
 * (`lib/stats/board.ts` records why). It may not be **published**, so it is
 * filtered on the way into the packet — the single place every renderer,
 * template or generated, has to pass through. It applies to the scoreboard as
 * well as to the stories: a results table is as structured a surface as a
 * headline is.
 */

export type PacketRefusal =
  /** The season is not in the database, or holds no stored games. */
  | 'no-season'
  /** That week was never played. */
  | 'no-week'
  /**
   * The games exist and **nothing has closed the week**, so nothing is settled.
   *
   * The week's own finalization, or the season's close — `lib/stats/finality.ts`
   * owns the rule and prefers the first. It used to be the season's alone, which
   * refused every week of a live season; see the note on `isFinal` below.
   */
  | 'not-final'
  /** Every game in the week names somebody who may not be published. */
  | 'nobody-publishable';

/** One line of the results table. Two numbers off a stored row assert nothing. */
export interface ScoreLine {
  readonly key: string;
  readonly winnerName: string | null;
  readonly winnerPoints: number | null;
  readonly loserName: string | null;
  readonly loserPoints: number | null;
  /** Both names, in stored order, for a tie — which has no winner to lead with. */
  readonly tie: boolean;
  readonly tieNames: readonly [string, string] | null;
  readonly tiePoints: number | null;
}

export interface FactPacket {
  readonly season: number;
  readonly week: number;
  /** `regular` · `playoff` · `consolation`. Decides the edition's furniture. */
  readonly weekType: string;
  /** The week's games are final and will not move. */
  readonly finalized: boolean;

  /** The story that leads, or null on a quiet week. */
  readonly lead: StoryCandidate | null;
  /** Everything else that ran, strongest first. */
  readonly rest: readonly StoryCandidate[];
  /** Every publishable game of the week, in stored order. */
  readonly scoreboard: readonly ScoreLine[];
  /** What did not run, and why. Never rendered to a manager. */
  readonly suppressed: readonly Suppressed[];
  /** What novelty pushed down the order, and by how much. Never rendered. */
  readonly demoted: readonly Demoted[];
  /** Nothing cleared the lead floor. The scoreboard still prints. */
  readonly quiet: boolean;

  /**
   * Every number a renderer may put in prose about this packet.
   *
   * Points and margins as they are *written* — the form a reader sees is the form
   * a validator has to compare. Weeks, seasons, ranks and counts as integers.
   */
  readonly allowedNumbers: readonly string[];

  /**
   * Every proper noun a renderer may use.
   *
   * Manager display names only. Not Sleeper handles, not team names — a Slice
   * that calls somebody by their Sleeper username has got the person right and
   * the identity wrong (`16 §4`).
   */
  readonly allowedNames: readonly string[];

  /** Why there is nothing to print, when there is nothing to print. */
  readonly refusal: PacketRefusal | null;
}

/**
 * A score, as a reader sees it. `154.42` → `"154.42"`.
 *
 * **Takes points, not cents.** `fantasy_matchups` stores integer cents so a
 * margin is exact, but the fact layer has already converted — everything
 * downstream of it is in points.
 *
 * This divided by 100 a second time, and the Slice printed *"Matty B obliterated
 * Ryan, 1.84 to 1.10"* — a real matchup with the decimal point two places wrong.
 * **Every test passed.** The packet's allowed-number list and the renderer's
 * prose were produced by this same function, so they agreed with each other
 * perfectly while both were wrong, and the validator confirmed it. That is
 * exactly the failure `MANDATE §10` names — a layer marking its own homework —
 * arriving through a units conversion rather than through a claim.
 *
 * What caught it was looking at the page. What stops it returning is a range
 * assertion over a real week, and recomputation from the raw files — checks the
 * shared-helper symmetry cannot satisfy.
 */
export function points(value: number): string {
  return value.toFixed(2);
}

/**
 * One decimal, which is how a margin is spoken.
 *
 * `50.51` is a measurement; *"beat him by fifty and a half"* is a sentence. The
 * Slice writes margins to one place, so one place is what the validator allows.
 * Points, like `points()` above.
 */
export function margin(value: number): string {
  return value.toFixed(1);
}

const empty = (
  input: { readonly season: number; readonly week: number },
  refusal: PacketRefusal,
): FactPacket => ({
  season: input.season,
  week: input.week,
  weekType: 'unscored',
  finalized: false,
  lead: null,
  rest: [],
  scoreboard: [],
  suppressed: [],
  demoted: [],
  quiet: false,
  allowedNumbers: [],
  allowedNames: [],
  refusal,
});

/**
 * Assemble a packet from a resolved week. Pure.
 *
 * Split from {@link factPacket} so a frozen fixture drives the **same** selection,
 * the same allowed sets and the same publication boundary as production does
 * (`MANDATE §8`). A demo that ran its own assembly would be evidence about the
 * demo.
 */
export function assemblePacket(input: {
  /** Already through `publishableWeek` — see the note there about ordering. */
  readonly week: WeekRecord;
  readonly rawWeek: WeekRecord;
  readonly candidates: readonly StoryCandidate[];
  readonly publishableManagerIds: ReadonlySet<string>;
  readonly recentLeadKinds?: readonly StoryKind[];
}): FactPacket {
  const { week } = input;

  if (input.rawWeek.games.length === 0) return empty(input.rawWeek, 'no-week');
  if (!input.rawWeek.finalized) return empty(input.rawWeek, 'not-final');
  if (week.games.length === 0) return empty(week, 'nobody-publishable');

  /*
   * A last check that nothing unpublishable reached the desk.
   *
   * The filtering happened upstream, in `publishableWeek`, and this is not a
   * second boundary — it is an assertion that the first one ran. A story naming
   * somebody who is not in this league is the single failure on this page that
   * nobody could take back, so it is worth one cheap `filter` to make it
   * structurally impossible rather than merely arranged.
   */
  const publishableKeys = new Set(week.games.map((game) => game.key));
  const candidates = input.candidates.filter(
    (candidate) =>
      candidate.subjects.every((id) => input.publishableManagerIds.has(id)) &&
      (candidate.gameKey === null || publishableKeys.has(candidate.gameKey)),
  );

  const selection: Selection = selectStories(candidates, {
    recentLeadKinds: input.recentLeadKinds ?? [],
  });

  const scoreboard = week.games.map(
    (game): ScoreLine => ({
      key: game.key,
      winnerName: game.winner?.displayName ?? null,
      winnerPoints: game.winner?.points ?? null,
      loserName: game.loser?.displayName ?? null,
      loserPoints: game.loser?.points ?? null,
      tie: game.tie,
      tieNames: game.tie ? [game.a.displayName ?? '', game.b.displayName ?? ''] : null,
      tiePoints: game.tie ? game.a.points : null,
    }),
  );

  const numbers = new Set<string>([String(week.season), String(week.week)]);
  const names = new Set<string>();

  for (const line of scoreboard) {
    if (line.winnerName !== null) names.add(line.winnerName);
    if (line.loserName !== null) names.add(line.loserName);
    if (line.winnerPoints !== null) numbers.add(points(line.winnerPoints));
    if (line.loserPoints !== null) numbers.add(points(line.loserPoints));
    if (line.tieNames !== null) for (const name of line.tieNames) names.add(name);
    if (line.tiePoints !== null) numbers.add(points(line.tiePoints));
  }

  for (const story of [selection.lead, ...selection.rest]) {
    if (story === null) continue;
    for (const value of story.allowedNumbers) numbers.add(value);
    for (const value of story.allowedNames) names.add(value);
  }

  return {
    season: week.season,
    week: week.week,
    weekType: week.weekType,
    finalized: week.finalized,
    lead: selection.lead,
    rest: selection.rest,
    scoreboard,
    suppressed: selection.suppressed,
    demoted: selection.demoted,
    quiet: selection.quiet,
    allowedNumbers: [...numbers].sort(),
    allowedNames: [...names].sort(),
    refusal: null,
  };
}

/**
 * Build the packet for one week, from the database.
 *
 * Returns a packet with `refusal` set rather than throwing or returning null: a
 * week with nothing in it is a real editorial state, and the rack has to be able
 * to say so in the shop's voice (`05 §8.5`).
 */
export async function factPacket(
  db: Queryable,
  input: { readonly season: number; readonly week: number },
): Promise<FactPacket> {
  const season = await seasonWeeks(db, input.season);
  if (!season.found || season.rows.length === 0) return empty(input, 'no-season');

  const placements = await seasonPlacements(db, input.season);

  const context = {
    seasonRows: season.rows,
    roster: season.roster,
    marginPopulationCents: await finalizedMarginsCents(db),
    scorePopulationCents: await finalizedTeamScoresCents(db),
    policy: standardPolicy(),
    finalRanks: placements.finalRanks,
    playoffRosters: placements.playoffRosters,
  };

  const publishable = await activeManagerIds(db);

  /*
   * The pre-Monday photographs, if the Sunday job took any.
   *
   * Read here rather than inside `deriveStories` for the reason every other
   * population in `context` is: derivation is pure and takes what it is given,
   * so a fixture can drive the real pipeline. A week with no snapshot yields an
   * empty map and no comeback candidate, which is every historical week in the
   * archive.
   *
   * **Three weeks, not one.** `recentLeadKinds` re-derives the previous two
   * issues to keep this one from repeating their lead, and it re-derives them
   * with the same inputs they had — so a week whose lead *was* a comeback has to
   * still look like one from here. Reading only the current week would leave
   * `monday-comeback` permanently invisible to the no-repeat rule, and two
   * comebacks in a row would print unreordered.
   */
  const snapshotFor = new Map<number, WeekSnapshotMap>();
  for (const weekNumber of [input.week, input.week - 1, input.week - 2]) {
    if (weekNumber < 1) continue;
    snapshotFor.set(weekNumber, await weekSnapshot(db, { season: input.season, week: weekNumber }));
  }

  /**
   * Whether this particular week may be printed.
   *
   * **This used to read the season's own finality, and that was a defect that
   * would have cost the league every paper of the 2026 season.** `16 §4.3`'s
   * Tuesday job ends by drafting the week that just closed; a season's books do
   * not shut until January; so a packet gated on `seasons.finalized_at` refuses
   * *every* week of a live season with `not-final` — and `not-final` is the
   * truth in July and looks identical in October. The Week 1 lifecycle rehearsal
   * (`lib/rehearsal/`) is what found it, because it is the first thing to run
   * the whole chain against a season that was open.
   *
   * The rule was already written down and already had a home:
   * `lib/stats/finality.ts` says a week is final when **its own** finalization
   * exists, and prefers that over the season's because it is the narrower and
   * earlier claim. Its own header names the Slice as one of the two consumers.
   * Rewards and stake settlement have used it since they were built; this was
   * the one caller still asking the wider question.
   *
   * Nothing is loosened by this. A week with no `week_finalizations` row is
   * still refused, so an in-progress week still cannot be printed — which is
   * what *"a number that can still move must not be printed"* actually requires.
   * The predicate is called rather than restated, so this cannot drift from the
   * rule the ledger and the settler enforce.
   */
  const isFinal = (weekNumber: number): boolean =>
    weekFinality({
      seasonFinalizedAt: season.finalizedAt,
      weekFinalizedAt: season.weekFinalizedAt.get(weekNumber) ?? null,
      hasGames: season.rows.some((row) => row.week === weekNumber),
    }).final;

  const forWeek = (weekNumber: number): { raw: WeekRecord; open: WeekRecord } => {
    const raw = buildWeek({
      season: input.season,
      week: weekNumber,
      finalized: isFinal(weekNumber),
      rows: season.rows,
      roster: season.roster,
    });
    return { raw, open: publishableWeek(raw, publishable) };
  };

  const { raw, open } = forWeek(input.week);

  return assemblePacket({
    week: open,
    rawWeek: raw,
    candidates: deriveStories({
      ...context,
      week: open,
      snapshots: snapshotFor.get(input.week) ?? new Map(),
    }),
    publishableManagerIds: publishable,
    recentLeadKinds: recentLeadKinds(input.week, forWeek, context, snapshotFor),
  });
}

/**
 * What led the previous two issues.
 *
 * Recomputed rather than stored. A published-editions table would be the obvious
 * design and it would make the paper's *content* depend on what a cron job
 * happened to write — so a re-render of week nine after a backfill could differ
 * from the week nine that printed. Derivation from the same stored games keeps an
 * issue reproducible from the season alone, which is the property that makes
 * every other claim on the page checkable.
 *
 * Selection runs with no recency of its own here: knowing what led week seven is
 * enough to keep week eight from repeating it, and chaining the discount back
 * through the whole season would make week fifteen depend on week one.
 */
function recentLeadKinds(
  week: number,
  forWeek: (week: number) => { raw: WeekRecord; open: WeekRecord },
  context: Omit<Parameters<typeof deriveStories>[0], 'week' | 'snapshots'>,
  /**
   * Each week's own photograph.
   *
   * A previous week has to be re-derived with the inputs it actually had. Hand
   * it this week's snapshot and it would report a comeback that never happened;
   * hand it none and `monday-comeback` could never be a recent lead, so the
   * no-repeat rule would never see one.
   */
  snapshotFor: ReadonlyMap<number, WeekSnapshotMap>,
): readonly StoryKind[] {
  const kinds: StoryKind[] = [];
  for (const previous of [week - 1, week - 2]) {
    if (previous < 1) break;
    const { open } = forWeek(previous);
    if (open.games.length === 0) continue;
    const snapshots = snapshotFor.get(previous) ?? new Map();
    const lead = selectStories(deriveStories({ ...context, week: open, snapshots })).lead;
    if (lead !== null) kinds.push(lead.kind);
  }
  return kinds;
}

/**
 * Every finalized team-week score on record, cents, ascending.
 *
 * A **different population** from `finalizedMarginsCents`, and deliberately so:
 * *"was that a big score"* and *"was that a big win"* are different questions and
 * a percentile answers exactly one of them. Sharing a population between them was
 * the first thing that looked like a saving and would have classified a 190-point
 * loss as unremarkable.
 */
export async function finalizedTeamScoresCents(db: Queryable): Promise<number[]> {
  const seasonRows = await db
    .select({ year: seasons.year })
    .from(seasons)
    .where(isNotNull(seasons.finalizedAt));

  const all: number[] = [];
  for (const { year } of seasonRows) {
    const season = await seasonWeeks(db, year);
    if (!season.finalized) continue;
    all.push(...teamScoresCents(season.rows));
  }
  return all.sort((x, y) => x - y);
}

/**
 * What the bracket decided, by roster.
 *
 * Both values are recorded at import from the bracket itself and never inferred
 * — `lib/sleeper/placements.ts` documents what goes wrong when a placement is
 * read off a position instead. The Slice uses `finalRank` to know which game was
 * the title game and `madePlayoffs` to know who was still alive.
 */
export async function seasonPlacements(
  db: Queryable,
  year: number,
): Promise<{
  readonly finalRanks: ReadonlyMap<number, number>;
  readonly playoffRosters: ReadonlySet<number>;
}> {
  const rows = await db
    .select({
      rosterId: seasonMemberships.rosterId,
      finalRank: seasonMemberships.finalRank,
      madePlayoffs: seasonMemberships.madePlayoffs,
    })
    .from(seasonMemberships)
    .innerJoin(seasons, eq(seasons.id, seasonMemberships.seasonId))
    .where(eq(seasons.year, year));

  return {
    finalRanks: new Map(
      rows
        .filter((row): row is typeof row & { finalRank: number } => row.finalRank !== null)
        .map((row) => [row.rosterId, row.finalRank]),
    ),
    playoffRosters: new Set(
      rows.filter((row) => row.madePlayoffs).map((row) => row.rosterId),
    ),
  };
}
