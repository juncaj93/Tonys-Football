import { type Database } from '@/lib/db';
import { DEMO_REVIEWS } from '@/lib/demo/apply';
import { demoDraftSource } from '@/lib/demo/draft-fixture';
import { activeLeagueManagers } from '@/lib/league/membership';
import {
  createRehearsal,
  type LifecycleState,
  type Rehearsal,
  type SundayLeg,
} from '@/lib/rehearsal/harness';
import { syncSeasonDraft } from '@/lib/sleeper/persist-draft';
import { draftFacts } from '@/lib/slice/draft-facts';
import { seasonLeagueId } from '@/lib/slice/preseason-desk';
import { saveDraftReview } from '@/lib/slice/preseason-reviews';
import {
  approveVersion,
  publishVersion,
  reviewDetail,
  type ReviewDetail,
} from '@/lib/slice/publication';
import { assembleIssue } from '@/lib/slice/edition';
import { type FactPacket } from '@/lib/slice/packet';
import { type TuesdayReport } from '@/lib/slice/tuesday';
import { type StoryKind } from '@/lib/stats/stories';
import { standingsThrough, type StandingRow } from '@/lib/stats/standings';
import { seasonWeeks } from '@/lib/stats/week';

import { simulationScenario, type SimulationKey, type SimulationScenario } from './scenarios';

/**
 * The Tuesday Slice simulation lab.
 *
 * ## The question
 *
 * The rehearsals answer *"does the chain survive a week."* This answers a
 * different one, and it is the commissioner's: **what does the paper actually
 * say when the league has something to talk about?** Nothing in this repository
 * could show that, because every Slice a person has looked at was either a week
 * of 2024/2025 or a hand-written fixture rendered in memory
 * (`lib/slice/editions.ts`) — never a paper produced by the cron from a season
 * the cron itself played.
 *
 * ## The one rule
 *
 * ```
 *   fake input data  →  REAL derivation  →  REAL drafting rules  →  REAL issue
 * ```
 *
 * The scenarios (`./scenarios.ts`) supply scores, a bracket and ten grades.
 * **Everything after that is the shipping code**, called the way the deployed
 * routes call it: `runSundayJob`, `runTuesday`, `generateDraft`,
 * `generatePreseasonDraft`, `approveVersion`, `publishVersion`. This module
 * composes them and records what came out. It formats nothing, classifies
 * nothing, and never decides what a result meant.
 *
 * **A refusal is a result.** Where the product declines to say something — a
 * story with no evidence behind it, a week that cannot be printed, a wager with
 * no basis — the record keeps the refusal and the report prints it. That is the
 * most useful half of the exercise: *what Tony will not say* is as much a
 * product decision as what he will.
 *
 * ## Isolation
 *
 * Three layers, and none of them is an environment variable:
 *
 * 1. **It only ever runs against a database somebody threw away.**
 *    `scripts/simulate.ts` truncates every league table before it starts and
 *    refuses a hosted `DATABASE_URL`, exactly as `scripts/rehearse.ts` does.
 * 2. **Nothing in `app/` imports it**, so none of it is in a bundle and no route
 *    can reach a simulated fact.
 * 3. **It writes no demo seat and creates no credential.** The commissioner
 *    actor is the league's real Alex row, which is who approves in production —
 *    so the approval path exercised is the production one rather than a
 *    privileged shortcut.
 *
 * The simulated draft is the one exception worth naming, and it carries its own
 * marker: `lib/demo/draft-fixture.ts` stores it under a `demo:` draft id, so a
 * database holding one says so in the row.
 *
 * ## What it must never become
 *
 * A way to make the product look better. If a scenario exposes empty sections,
 * weak hierarchy, a strange selection or a defect, the finding is **recorded**
 * and the product is left alone. A lab that could edit the thing it measures is
 * not a lab.
 */

export interface RunOptions {
  /**
   * Play past the featured week to show what becomes sayable later.
   *
   * Defaults to on, because it is the finding week 16 exists for. It is turned
   * **off** by the screenshot pass, and the reason is a real artefact it caused:
   * playing week 17 moves `currentWeekOf` on, so the stakes band under the paper
   * printed *week 18's* call beside week 16's issue. A photograph of the
   * Tuesday-morning state has to stop where the Tuesday morning stops.
   */
  readonly retrospective?: boolean;
}

/** One Tuesday, and which week of the scenario it was. */
export interface PlayedTuesday {
  readonly week: number;
  readonly report: TuesdayReport;
}

/** What a named person did to the draft, and when. */
export interface PublicationRecord {
  readonly versionId: string;
  readonly approvedBy: string;
  readonly publishedBy: string;
  /** The status the desk reported *before* anybody stamped it. */
  readonly statusBeforeApproval: string;
  readonly statusAfterPublication: string;
}

export interface SimulationRecord {
  readonly scenario: SimulationScenario;
  /** The league the featured Tuesday woke up to. */
  readonly before: LifecycleState;
  /** The table going into the featured Tuesday, from the product's own reader. */
  readonly standingsBefore: readonly StandingRow[];
  /** The table after it. */
  readonly standingsAfter: readonly StandingRow[];
  /** Every Tuesday the scenario played, in order. The last one is the featured week. */
  readonly tuesdays: readonly PlayedTuesday[];
  /** The pre-Monday photograph of the featured week, where the scenario takes one. */
  readonly sunday: SundayLeg | null;
  /**
   * What landed on the press desk — the packet, the candidates, the
   * suppressions, the rendered edition and the validator's verdict, in one read.
   *
   * `reviewDetail` is the **review screen's own** call, so what the report
   * prints is what a commissioner would see rather than a second derivation of
   * it.
   */
  readonly desk: ReviewDetail | null;
  /** Null when the Tuesday job produced no draft. The reason is on the report. */
  readonly publication: PublicationRecord | null;
  readonly after: LifecycleState;
  /** How the draft came to be arranged, for the preseason. Empty otherwise. */
  readonly arrangement: readonly string[];
  /**
   * The featured week, looked at again once the season had finished.
   *
   * Null unless the scenario asked for it. See `SimulationScenario.retrospectiveThrough`.
   */
  readonly retrospective: RetrospectiveLook | null;
}

/**
 * The same week, re-assembled after later weeks were played.
 *
 * It exists to show a **refusal that expires**: a story the paper could not
 * carry on the day, because the fact it rests on had not been recorded yet.
 * Nothing here is published and nothing already published moves.
 */
export interface RetrospectiveLook {
  readonly week: number;
  readonly throughWeek: number;
  /** What led on the day the paper printed. */
  readonly leadOnTheDay: StoryKind | null;
  /** What would lead if the same week were assembled now. */
  readonly leadAfterwards: StoryKind | null;
  /** Every candidate kind on the day, and afterwards. */
  readonly kindsOnTheDay: readonly StoryKind[];
  readonly kindsAfterwards: readonly StoryKind[];
  /** The published issue's headline, re-read after the later weeks. Must not move. */
  readonly publishedHeadlineAfterwards: string | null;
}

/** The commissioner. The league's real seat, not a demo one. */
const COMMISSIONER = 'Alex';

/**
 * Tuesdays, fixed rather than computed from a clock.
 *
 * The same values `lib/sleeper/midseason-season.ts` uses, restated here rather
 * than imported because the preseason Tuesday is not in that sequence: week 1's
 * Monday night game is 14 September 2026, so week 1's Tuesday is the 15th, and
 * the Tuesday *before* the opener is the 8th.
 */
const FIRST_TUESDAY = Date.UTC(2026, 8, 15, 9, 0, 0);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function tuesdayOfWeek(week: number): Date {
  return new Date(FIRST_TUESDAY + (week - 1) * WEEK_MS);
}

/** The Tuesday before the opener — the one with no week behind it. */
export const PRESEASON_TUESDAY = new Date(FIRST_TUESDAY - WEEK_MS);

/** Sunday 23:55 ET of the week being played. `runSundayJob`'s own hour. */
function sundayOfWeek(week: number): Date {
  return new Date(tuesdayOfWeek(week).getTime() - 2 * 24 * 60 * 60 * 1000 - 9 * 60 * 60 * 1000 - 5 * 60 * 1000);
}

/**
 * Play one scenario and record everything it produced.
 *
 * The database is expected to be empty. `scripts/simulate.ts` and
 * `lib/simulation/lab.test.ts` both reset it first; this function does not,
 * deliberately, because a library that truncated tables would be a library that
 * could truncate the wrong ones.
 */
export async function runSimulation(
  db: Database,
  key: SimulationKey,
  options: RunOptions = {},
): Promise<SimulationRecord> {
  const scenario = simulationScenario(key);

  const run: Rehearsal = createRehearsal({
    db,
    script: scenario.script,
    finalizeYears: [2024, 2025],
  });

  await run.seed();

  const arrangement = scenario.draftReview ? await arrangeDraftReview(db, scenario) : [];

  /*
   * Every week before the featured one, through the real cron, in order.
   *
   * Not inserted. The whole reason a midseason paper is worth looking at is what
   * seven earlier Tuesdays left behind — a rolling bounty, an accumulated table,
   * a streak, a comparison population — and rows written directly were never
   * left behind by anything.
   */
  const tuesdays: PlayedTuesday[] = [];
  for (let week = 1; week < scenario.through; week += 1) {
    tuesdays.push({
      week,
      report: await run.tuesday({ played: week, at: tuesdayOfWeek(week) }),
    });
  }

  const before = await run.observe();
  const standingsBefore = await tableThrough(db, scenario, Math.max(0, scenario.through - 1));

  /*
   * Sunday, then Tuesday — the two reads `16 §4.3` sanctions, in order.
   *
   * The photograph is what the board's matchup line is drawn from and what a
   * Monday comeback would have to be measured against. None of these scenarios
   * carries two score lines, so no comeback is derivable from any of them; the
   * leg is still run, because *"the snapshot exists and produced no comeback"*
   * and *"no snapshot was ever taken"* are different states and the report has
   * to be able to tell them apart.
   */
  const sunday =
    scenario.photograph && scenario.featured !== null
      ? await run.sunday({ played: scenario.featured, at: sundayOfWeek(scenario.featured) })
      : null;

  const featuredAt =
    scenario.featured === null ? PRESEASON_TUESDAY : tuesdayOfWeek(scenario.featured);

  const featured = await run.tuesday({
    played: scenario.scheduledWeekOne ? 1 : scenario.through,
    at: featuredAt,
    ...(scenario.scheduledWeekOne ? { scheduledOnly: true } : {}),
  });
  tuesdays.push({ week: scenario.featured ?? 0, report: featured });

  const standingsAfter = await tableThrough(db, scenario, scenario.through);

  /*
   * The human half.
   *
   * The cron ends at `submit`, so what it leaves is a version on the desk with
   * nothing decided about it. The two stamps below are `approveVersion` and
   * `publishVersion` with a named actor — the only path there is, and the one
   * the database enforces: a publication with no recorded approval naming
   * somebody is refused at a constraint rather than by this code.
   */
  const versionId = featured.draft?.versionId ?? null;
  const deskBefore = versionId === null ? null : await reviewDetail(db, versionId);

  let publication: PublicationRecord | null = null;
  if (versionId !== null && deskBefore !== null) {
    const commissioner = await run.managerIdNamed(COMMISSIONER);
    if (commissioner === null) {
      throw new Error(
        `the simulation cannot approve anything: no manager named ${COMMISSIONER} is seated`,
      );
    }

    await approveVersion(db, { versionId, actorUserId: commissioner });
    await publishVersion(db, { versionId, actorUserId: commissioner });

    const stamped = await reviewDetail(db, versionId);
    publication = {
      versionId,
      approvedBy: COMMISSIONER,
      publishedBy: COMMISSIONER,
      statusBeforeApproval: deskBefore.status,
      statusAfterPublication: stamped?.status ?? 'unknown',
    };
  }

  /*
   * Read the desk **after** publication, so the record carries the state the
   * league is actually looking at. The pre-approval status is kept on
   * `publication` rather than being lost, because *"the cron left it waiting"*
   * is the property `16 §9` is about.
   */
  const desk = versionId === null ? null : await reviewDetail(db, versionId);

  /*
   * Observed **after** the stamps and **before** the retrospective look, so the
   * counts describe the state the league is in on the Wednesday morning: one
   * paper published, every earlier week's draft still sitting on the desk.
   */
  const after = await run.observe();

  const retrospective =
    options.retrospective === false
      ? null
      : await lookAgain(db, run, scenario, desk, versionId);

  return {
    scenario,
    before,
    standingsBefore,
    standingsAfter,
    tuesdays,
    sunday,
    desk,
    publication,
    after,
    arrangement,
    retrospective,
  };
}

/**
 * Play the season out and re-assemble the featured week.
 *
 * `assembleIssue` is the **review screen's own** assembly — the same call
 * `generateDraft` makes — so what comes back is what the product would draft
 * today, not a second derivation of it. Nothing is submitted, approved or
 * published: the point is the comparison, and drafting a second version would
 * put a paper on the desk that nobody asked for.
 */
async function lookAgain(
  db: Database,
  run: Rehearsal,
  scenario: SimulationScenario,
  desk: ReviewDetail | null,
  versionId: string | null,
): Promise<RetrospectiveLook | null> {
  const through = scenario.retrospectiveThrough;
  if (through === undefined || scenario.featured === null || desk === null) return null;

  const onTheDay = desk.packet;
  const kindsOnTheDay =
    'kind' in onTheDay && onTheDay.kind === 'preseason'
      ? []
      : candidateKinds(onTheDay as FactPacket);

  for (let week = scenario.featured + 1; week <= through; week += 1) {
    await run.tuesday({ played: week, at: tuesdayOfWeek(week) });
  }

  const again = await assembleIssue(db, {
    season: scenario.script.year,
    week: scenario.featured,
  });

  const printed = versionId === null ? null : await reviewDetail(db, versionId);

  return {
    week: scenario.featured,
    throughWeek: through,
    leadOnTheDay: 'lead' in onTheDay ? (onTheDay.lead?.kind ?? null) : null,
    leadAfterwards: again.packet.lead?.kind ?? null,
    kindsOnTheDay,
    kindsAfterwards: candidateKinds(again.packet),
    publishedHeadlineAfterwards: printed?.edition.headline ?? null,
  };
}

/** Every story kind the packet carried, lead first. Suppressions included. */
function candidateKinds(packet: FactPacket): readonly StoryKind[] {
  return [
    ...(packet.lead === null ? [] : [packet.lead.kind]),
    ...packet.rest.map((entry) => entry.kind),
    ...packet.suppressed.map((entry) => entry.kind),
    ...packet.demoted.map((entry) => entry.kind),
  ];
}

/**
 * The table, from the product's own reader rather than from this file.
 *
 * `MANDATE §9` makes `lib/stats` the sole authority on records and standings, so
 * a lab that counted wins out of its own observation would be a second answer to
 * a question that already has one — and the first time they disagreed the report
 * would be the thing that looked right.
 */
async function tableThrough(
  db: Database,
  scenario: SimulationScenario,
  throughWeek: number,
): Promise<readonly StandingRow[]> {
  if (throughWeek < 1) return [];
  const season = await seasonWeeks(db, scenario.script.year);
  return standingsThrough({ rows: season.rows, throughWeek, roster: season.roster });
}

/* -------------------------------------------------------------------------
 * The preseason arrangement
 * ---------------------------------------------------------------------- */

/**
 * Put a completed draft and ten grades in front of the product.
 *
 * ## Why this is arranged rather than driven
 *
 * The league drafts in late August and grades it by hand. Neither is something a
 * cron produces, so neither can be *driven*: what the simulation supplies is the
 * input a real draft night and a real commissioner would supply, and everything
 * downstream of it is the shipping path.
 *
 * Both halves still go through real code:
 *
 * - the picks are the **recorded 2025 draft re-seated** onto this season's
 *   rosters, served as a Sleeper payload through `syncSeasonDraft` — so the real
 *   decoder decodes them and the real persister stores them, immutably;
 * - the grades are written with `saveDraftReview`, so the length limits, the
 *   banned-term scan and the *"the best pick must be one of theirs"* trigger all
 *   apply exactly as they will when Alex types.
 *
 * ## The grades are fixture editorial and are not Alex's opinions
 *
 * They are `DEMO_REVIEWS` — the same set the draft-board demo states use, reused
 * rather than copied, so there is **one** set of fixture editorial in this
 * repository. A second set would drift, and the day it mattered two screens
 * would print different opinions under one name.
 *
 * **The software still never grades the draft.** No ADP, no projection, no value
 * model, no reach, no steal. `docs/PRESEASON_SLICE_BOUNDARY.md §5` is permanent
 * and nothing here approaches it: the grade is an *input* to this simulation in
 * exactly the way it is an input to the product.
 */
async function arrangeDraftReview(
  db: Database,
  scenario: SimulationScenario,
): Promise<readonly string[]> {
  const notes: string[] = [];

  const leagueId = await seasonLeagueId(db, scenario.script.year);
  if (leagueId === null) {
    throw new Error(`the simulation seeded no ${String(scenario.script.year)} league`);
  }

  const managers = await activeLeagueManagers(db);
  const stored = await syncSeasonDraft(db, {
    source: demoDraftSource(managers.map((manager) => manager.rosterId)),
    seasonYear: scenario.script.year,
    leagueId,
  });

  if (stored.refusal !== null) {
    throw new Error(`the simulated draft would not store: ${stored.refusal}`);
  }
  notes.push(
    `The recorded 2025 draft, re-seated onto this season's rosters and stored through ` +
      `the real decoder: **${String(stored.picksStored)} picks**, status \`${stored.status ?? 'complete'}\`.`,
  );

  const facts = await draftFacts(db, scenario.script.year);
  if (facts.facts === null) {
    throw new Error(`the simulated draft produced no facts: ${facts.refusal ?? 'unknown'}`);
  }

  const commissioner = await commissionerId(db);

  /*
   * Board order — the order the desk lists them in, so *"the first grade"* means
   * the same thing here as it does on the screen.
   */
  const board = [...facts.facts.managers].sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  );

  let written = 0;
  for (const [index, manager] of board.entries()) {
    const review = DEMO_REVIEWS[index % DEMO_REVIEWS.length];
    if (review === undefined) continue;

    const bestPickId =
      review.bestPickRound === undefined
        ? null
        : (manager.picks.find((pick) => pick.round === review.bestPickRound)?.id ?? null);

    await saveDraftReview(db, {
      seasonYear: scenario.script.year,
      userId: manager.userId,
      grade: review.grade,
      take: review.take,
      bestPickId,
      concern: review.concern ?? null,
      actorUserId: commissioner,
    });
    written += 1;
  }

  notes.push(
    `**${String(written)} of ${String(board.length)}** boards graded through \`saveDraftReview\` — ` +
      'fixture editorial, not the commissioner\'s opinions, and never seeded outside a lab. ' +
      'They are assigned in **board order** so the whole grade domain from `A+` to `F` is on ' +
      'one page; a take is not about the manager it lands beside.',
  );

  return notes;
}

async function commissionerId(db: Database): Promise<string> {
  const managers = await activeLeagueManagers(db);
  const found = managers.find((manager) => manager.displayName === COMMISSIONER);
  if (found === undefined) {
    throw new Error(`no manager named ${COMMISSIONER} is seated, so nobody can type a grade`);
  }
  return found.id;
}
