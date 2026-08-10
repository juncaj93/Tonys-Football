import { eq } from 'drizzle-orm';

import { type Queryable } from '@/lib/db';
import { fantasyMatchups, seasons, weekFinalizations } from '@/lib/db/schema';
import { type SchedulePairing } from '@/lib/sleeper/schedule';

import {
  draftFacts,
  EARLY_ROUNDS,
  type DraftFacts,
  type DraftFactsRefusal,
  type DraftObservation,
  type DraftPickFact,
  type ManagerDraftFacts,
} from './draft-facts';
import {
  capitalise,
  DRAFT_PHRASES,
  ordinal,
  positionWord,
  spell,
} from './draft-vocabulary';
import { mostRecentChampion } from './edition';
import { draftReviewProgress, type DraftReviewRecord, type TonyGrade } from './preseason-reviews';
import {
  COLUMN,
  PHRASES,
  pick,
  PRESEASON,
  type Edition,
  type PreseasonSections,
  type PreseasonTeamSection,
} from './render';
import { scanDerivedProse, scanEditorialCopy, type Verdict, type Violation } from './validate';

/**
 * The preseason special — Draft Review and Season Preview.
 *
 * ## Why the first issue of 2026 cannot be a weekly one
 *
 * `16 §4.3`'s Tuesday chain recaps the week that just closed. On the Tuesday
 * before the opener there is no week: `factPacket` refuses with `no-week`, the
 * press desk stays empty, and the league's first ever issue is the one that
 * never printed. The commissioner's ruling is that the first issue is a **draft
 * review**, which is a different paper about a different thing and gets its own
 * pipeline rather than the weekly one bent around a missing week.
 *
 * ## It is the same architecture, not a second newspaper
 *
 * ```
 * draft facts + Tony's reviews ──► preseason packet ──► renderEdition ──► the SAME
 *                                                                        approval chain
 * ```
 *
 * The output is an `Edition`, stored in `slice_issue_versions`, hashed the same
 * way, approved by a person the same way, published to the same rack. What is
 * new is one packet builder and one renderer; what is emphatically **not** new
 * is a second publication path, a second validator or a second archive. The
 * whole guarantee set from `0011` — immutable content, one published version,
 * mandatory named approval, the manual hold — applies to this issue because it
 * *is* one of those issues.
 *
 * ## Two kinds of prose, checked differently, and that is the interesting part
 *
 * Everything on the page except two fields is **derived**: headlines and body
 * copy from curated templates in `render.ts`, and every fact from a stored
 * draft pick. That half goes through the full scan — every number and proper
 * noun must be in the packet — exactly like a weekly issue.
 *
 * `take` and `concern` are **editorial**. They are Tony's opinion, typed by the
 * commissioner ghost-writing him, and checking them against a fact packet would
 * refuse Tony his own voice: he is allowed to think the running back room is
 * thin, and no packet will ever contain the word thin.
 *
 * So they are checked against the half of the rules that is about the *product*
 * rather than about the renderer: `16 §9`'s banned terms and the quotation-mark
 * ban. The league has no kickers whoever is typing. Win-probability language
 * implies a model that does not exist whoever is typing. Nobody in this league
 * said anything on the record.
 *
 * The number-and-name scan still **runs** on editorial copy — its findings are
 * reported to the commissioner on the review screen as advisories, so *"that
 * name is not in the draft"* is visible — and it does not block, because on this
 * one field the author is the authority. `docs/PRESEASON_SLICE_BOUNDARY.md §5`
 * records the decision and what would have to change to reverse it.
 *
 * ## What the software will never decide
 *
 * The grade. There is no ADP here, no projection, no consensus source and no
 * roster-value model, and the commissioner's ruling is that there will not be
 * one. A grade the software computed would be a fantasy judgement the interface
 * derived for itself, which `MANDATE §9` puts beyond it.
 */

/** Why a preseason issue cannot be drafted. */
export type PreseasonRefusal =
  | DraftFactsRefusal
  /** The season's books are shut. A closed season does not get a preview. */
  | 'season-closed'
  /** A week has been played and closed. The weekly paper owns Tuesdays now. */
  | 'season-underway'
  /** Tony has not graded every active manager yet. */
  | 'reviews-incomplete';

/** One manager's section, before it is phrased. */
export interface PreseasonTeamFacts {
  readonly facts: ManagerDraftFacts;
  readonly grade: TonyGrade;
  readonly take: string;
  /** The pick Tony named, resolved against this manager's own picks. */
  readonly bestPick: DraftPickFact | null;
  readonly concern: string | null;
}

export interface PreseasonPacket {
  /** The discriminator. A weekly `FactPacket` has no `kind`. */
  readonly kind: 'preseason';
  readonly season: number;
  readonly draft: DraftFacts | null;
  readonly teams: readonly PreseasonTeamFacts[];
  /** The defending champion, if there is a publishable one. */
  readonly champion: { readonly displayName: string; readonly season: number } | null;
  /** Week one's fixtures by manager name, when the schedule exists. */
  readonly weekOne: readonly { readonly left: string; readonly right: string }[];
  /** Who Tony still owes a grade. Empty when the issue is ready. */
  readonly outstanding: readonly string[];
  readonly reviewed: number;
  readonly total: number;

  /** Every number a renderer may put in prose about this packet. */
  readonly allowedNumbers: readonly string[];
  /** Every proper noun a renderer may use: managers, and drafted players. */
  readonly allowedNames: readonly string[];

  /**
   * Numbers and names inside **editorial** copy that the draft does not contain.
   *
   * Shown to the commissioner on the review screen and **never blocking** — see
   * the header. Attached by `assemblePreseason` rather than by the packet
   * builder, because they are found by scanning the rendered page, and stored
   * with the version so the advisory a reviewer saw is the advisory that was
   * computed rather than one recomputed by later code.
   */
  readonly advisories?: readonly PreseasonAdvisory[];

  readonly refusal: PreseasonRefusal | null;
}

/** One thing worth mentioning to the commissioner about a take. Never fatal. */
export interface PreseasonAdvisory {
  readonly manager: string;
  readonly violation: Violation;
}

/**
 * Is the league in the state a draft review is *for*?
 *
 * ## Deterministic product state, not a date
 *
 * The commissioner's requirement, and the right one: a calendar rule would
 * publish a draft review on a fixed Tuesday whether or not anybody had drafted,
 * and would keep the preseason mode alive into October if the date arithmetic
 * were wrong by a week.
 *
 * Four conditions, each read from a table that owns it:
 *
 *   1. **the season is open** — `seasons.finalized_at IS NULL`;
 *   2. **the draft is complete and has picks** — `season_drafts.status`, which
 *      is Sleeper's own word for it;
 *   3. **no week has been closed** — `week_finalizations` is empty for the
 *      season, which is the same record `weekFinality` reads;
 *   4. **no result is stored** — `fantasy_matchups` holds nothing for the
 *      season. The sync drops a drafted-but-unplayed week at the write
 *      boundary, so a stored row means a week was really played.
 *
 * 3 and 4 are both checked and neither is redundant. A finalization with no
 * matchups is impossible today and would mean a week closed on nothing; matchups
 * with no finalization is the ordinary state between Sunday and Tuesday, and it
 * is exactly the state where the preseason mode must **not** reappear.
 *
 * The reviews are deliberately not part of this. *"Is this the preseason"* and
 * *"has Tony finished writing"* are different questions with different answers,
 * and the desk has to be able to show the second one — a draft board that said
 * *"not eligible"* because a grade was missing would tell the commissioner
 * nothing about what to do next.
 */
export async function preseasonEligibility(
  db: Queryable,
  seasonYear: number,
): Promise<{ readonly eligible: boolean; readonly refusal: PreseasonRefusal | null }> {
  const [season] = await db
    .select({ id: seasons.id, finalizedAt: seasons.finalizedAt })
    .from(seasons)
    .where(eq(seasons.year, seasonYear))
    .limit(1);

  if (season === undefined) return { eligible: false, refusal: 'no-season' };
  if (season.finalizedAt !== null) return { eligible: false, refusal: 'season-closed' };

  const [closed] = await db
    .select({ week: weekFinalizations.week })
    .from(weekFinalizations)
    .where(eq(weekFinalizations.seasonId, season.id))
    .limit(1);

  if (closed !== undefined) return { eligible: false, refusal: 'season-underway' };

  const [played] = await db
    .select({ week: fantasyMatchups.week })
    .from(fantasyMatchups)
    .where(eq(fantasyMatchups.seasonId, season.id))
    .limit(1);

  if (played !== undefined) return { eligible: false, refusal: 'season-underway' };

  const { facts, refusal } = await draftFacts(db, seasonYear);
  if (facts === null) return { eligible: false, refusal: refusal ?? 'no-draft' };

  return { eligible: true, refusal: null };
}

/**
 * Assemble the preseason packet.
 *
 * `weekOne` is passed in rather than read, because the only place the schedule
 * exists is a Sleeper payload the weekly sync deliberately refuses to store
 * (`lib/sleeper/schedule.ts`). A caller that holds a source supplies it; a
 * caller that does not gets an issue without the preview section, which is the
 * honest outcome rather than an invented one.
 */
export async function preseasonPacket(
  db: Queryable,
  input: {
    readonly season: number;
    readonly weekOne?: readonly SchedulePairing[];
  },
): Promise<PreseasonPacket> {
  const empty = (refusal: PreseasonRefusal): PreseasonPacket => ({
    kind: 'preseason',
    season: input.season,
    draft: null,
    teams: [],
    champion: null,
    weekOne: [],
    outstanding: [],
    reviewed: 0,
    total: 0,
    allowedNumbers: [],
    allowedNames: [],
    refusal,
  });

  const eligibility = await preseasonEligibility(db, input.season);
  if (!eligibility.eligible) return empty(eligibility.refusal ?? 'no-draft');

  const { facts } = await draftFacts(db, input.season);
  if (facts === null) return empty('no-draft');

  const progress = await draftReviewProgress(db, input.season);
  const reviewByUser = new Map(progress.rows.map((row) => [row.userId, row] as const));

  const teams: PreseasonTeamFacts[] = [];
  for (const manager of facts.managers) {
    const review = reviewByUser.get(manager.userId);
    if (review === undefined || review.grade === null || review.take === null) continue;
    teams.push({
      facts: manager,
      grade: review.grade,
      take: review.take,
      bestPick: resolveBestPick(manager, review),
      concern: review.concern,
    });
  }

  const champion = await mostRecentChampion(db);

  const byRoster = new Map(facts.managers.map((m) => [m.rosterId, m.displayName] as const));
  const weekOne = (input.weekOne ?? [])
    .map((pairing) => ({
      left: byRoster.get(pairing.rosterAId) ?? null,
      right: byRoster.get(pairing.rosterBId) ?? null,
    }))
    /*
     * A fixture naming somebody who is not in this league is dropped whole.
     *
     * The publication boundary, applied to a schedule for the same reason it is
     * applied to a scoreboard: half a fixture is not a fixture, and printing
     * *"Alex v"* would be worse than printing nothing.
     */
    .filter((game): game is { left: string; right: string } => game.left !== null && game.right !== null);

  return assemblePreseasonPacket({
    season: input.season,
    facts,
    teams,
    champion,
    weekOne,
    outstanding: progress.outstanding,
    reviewed: progress.reviewed,
    total: progress.total,
    complete: progress.complete,
  });
}

/**
 * Assemble a preseason packet from resolved facts. Pure.
 *
 * Split from {@link preseasonPacket} for the reason `assemblePacket` is split
 * from `factPacket` (`MANDATE §8`): a frozen fixture then drives the **same**
 * allowed sets, the same refusal rule and the same renderer that production
 * does. A demo that ran its own assembly would be evidence about the demo.
 */
export function assemblePreseasonPacket(input: {
  readonly season: number;
  readonly facts: DraftFacts;
  readonly teams: readonly PreseasonTeamFacts[];
  readonly champion: { readonly displayName: string; readonly season: number } | null;
  readonly weekOne: readonly { readonly left: string; readonly right: string }[];
  readonly outstanding: readonly string[];
  readonly reviewed: number;
  readonly total: number;
  readonly complete: boolean;
}): PreseasonPacket {
  return {
    kind: 'preseason',
    season: input.season,
    draft: input.facts,
    teams: input.teams,
    champion: input.champion,
    weekOne: input.weekOne,
    outstanding: input.outstanding,
    reviewed: input.reviewed,
    total: input.total,
    ...allowedValues({
      facts: input.facts,
      teams: input.teams,
      champion: input.champion,
      weekOne: input.weekOne,
      season: input.season,
    }),
    refusal: input.complete ? null : 'reviews-incomplete',
  };
}

/**
 * The pick Tony named, resolved against this manager's own picks.
 *
 * Looked up **inside their own list** rather than fetched by id, which makes
 * *"Tony cannot praise a player they did not draft"* true here as well as in the
 * database. The trigger (`slice_draft_reviews_best_pick_is_theirs`) is the
 * guarantee; this is the same rule expressed where the sentence is built, so a
 * row that somehow got past it still cannot print.
 */
function resolveBestPick(
  manager: ManagerDraftFacts,
  review: DraftReviewRecord,
): DraftPickFact | null {
  if (review.bestPickId === null) return null;
  return manager.picks.find((candidate) => candidate.id === review.bestPickId) ?? null;
}

/**
 * Every number and proper noun the page may carry.
 *
 * ## Why the player names are split as well as whole
 *
 * The validator matches capitalised words with `\b[A-Z][a-z]+\b`, and a real
 * player name is not two clean words: `Ja'Marr Chase` scans as `Ja`, `Marr` and
 * `Chase`, and `De'Von Achane` as `De`, `Von` and `Achane`. Allowing only the
 * whole string would refuse the league's own draft board as a page full of
 * invented names.
 *
 * So each name contributes its whole self **and** every alphabetic fragment of
 * it. Every fragment came out of a stored pick, so nothing is being waved
 * through — the set is still *"names this draft actually contains"*, spelled the
 * way the scanner reads them.
 */
function allowedValues(input: {
  readonly facts: DraftFacts;
  readonly teams: readonly PreseasonTeamFacts[];
  readonly champion: { readonly displayName: string; readonly season: number } | null;
  readonly weekOne: readonly { readonly left: string; readonly right: string }[];
  readonly season: number;
}): { allowedNumbers: readonly string[]; allowedNames: readonly string[] } {
  const numbers = new Set<string>([String(input.season), String(EARLY_ROUNDS)]);
  const names = new Set<string>();

  const addName = (value: string): void => {
    names.add(value);
    for (const fragment of value.split(/[^A-Za-z]+/)) {
      if (fragment !== '') names.add(fragment);
    }
  };

  if (input.facts.rounds !== null) numbers.add(String(input.facts.rounds));
  numbers.add(String(input.facts.totalPicks));

  for (const manager of input.facts.managers) {
    addName(manager.displayName);
    if (manager.draftSlot !== null) numbers.add(String(manager.draftSlot));
    if (manager.quarterbackRound !== null) numbers.add(String(manager.quarterbackRound));
    if (manager.earlyLoad !== null) numbers.add(String(manager.earlyLoad.count));
    numbers.add(String(manager.keepers));

    for (const entry of manager.byPosition) numbers.add(String(entry.count));

    for (const pickFact of manager.picks) {
      addName(pickFact.playerName);
      numbers.add(String(pickFact.round));
      numbers.add(String(pickFact.pickNo));
      /*
       * The board label is itself a number to the scanner — `1.01` matches the
       * decimal form. Declared rather than special-cased, which is the rule this
       * whole mechanism runs on.
       */
      numbers.add(pickFact.label);
    }
  }

  for (const observation of input.facts.observations) {
    if (observation.kind === 'first-pick') addName(observation.playerName);
    if (observation.kind === 'first-pick' || observation.kind === 'first-defense') {
      addName(observation.manager);
    }
    if (observation.kind === 'round-one') numbers.add(String(observation.count));
    if (observation.kind === 'first-defense') numbers.add(String(observation.round));
  }

  for (const team of input.teams) addName(team.facts.displayName);

  if (input.champion !== null) {
    addName(input.champion.displayName);
    numbers.add(String(input.champion.season));
  }

  for (const game of input.weekOne) {
    addName(game.left);
    addName(game.right);
  }

  return {
    allowedNumbers: [...numbers].sort(),
    allowedNames: [...names].sort(),
  };
}

/**
 * The preseason edition, rendered.
 *
 * Deterministic, like the weekly renderer and for the same reasons: the variant
 * is a hash of the season, so the same draft renders the same paper forever —
 * which is what a *published* issue has to do and what a screenshot test needs.
 */
export function renderPreseason(packet: PreseasonPacket): Edition | null {
  if (packet.draft === null || packet.teams.length === 0) return null;

  const seed = `${String(packet.season)}:preseason`;

  const sections: PreseasonSections = {
    board: packet.teams.map((team) => ({
      manager: team.facts.displayName,
      grade: team.grade,
    })),
    snapshot: snapshotOf(packet.draft),
    teams: packet.teams.map(teamSection),
    history:
      packet.champion === null
        ? []
        : [
            {
              label: DRAFT_PHRASES.defendingChampionLabel,
              value: `${packet.champion.displayName} — ${String(packet.champion.season)}`,
            },
          ],
    weekOne: packet.weekOne,
  };

  return {
    season: packet.season,
    /*
     * Week zero — the preseason slot.
     *
     * Never printed: the dateline says `Season 2026 · Preseason` and no surface
     * renders the number. It exists so `slice_issues` can hold both kinds under
     * its existing `UNIQUE(season_id, week)` without the two colliding (`0018`).
     */
    week: 0,
    dateline: `${PHRASES.datelineSeason} ${String(packet.season)} · ${PRESEASON.dateline}`,
    character: 'preseason',
    headline: pick(PRESEASON.headline, `${seed}:headline`),
    deck: pick(PRESEASON.deck, `${seed}:deck`),
    body: pick(PRESEASON.body, `${seed}:body`),
    secondary: [],
    scoreboard: [],
    column: pick(COLUMN.preseason, `${seed}:column`),
    nothingToPrint: null,
    preseason: sections,
  };
}

/** The league-wide facts, phrased. Guarded — an absent observation prints nothing. */
function snapshotOf(facts: DraftFacts): readonly { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];

  if (facts.rounds !== null) {
    rows.push({ label: DRAFT_PHRASES.roundsLabel, value: String(facts.rounds) });
  }

  for (const observation of facts.observations) {
    rows.push(phraseObservation(observation));
  }

  return rows;
}

function phraseObservation(observation: DraftObservation): { label: string; value: string } {
  switch (observation.kind) {
    case 'first-pick':
      return {
        label: DRAFT_PHRASES.firstPickLabel,
        value: `${observation.playerName} — ${observation.manager}`,
      };
    case 'round-one':
      return {
        label: DRAFT_PHRASES.roundOneLabel,
        value: `${capitalise(spell(observation.count))} ${positionWord(observation.position, observation.count)}`,
      };
    case 'first-defense':
      return {
        label: DRAFT_PHRASES.firstDefenseLabel,
        value: `${capitalise(ordinal(observation.round))} round — ${observation.manager}`,
      };
  }
}

/** How many of a manager's picks the paper prints. The rest is depth. */
const PICKS_SHOWN = 5;

function teamSection(team: PreseasonTeamFacts): PreseasonTeamSection {
  const { facts } = team;

  return {
    manager: facts.displayName,
    grade: team.grade,
    slot:
      facts.draftSlot === null
        ? null
        : DRAFT_PHRASES.slot.replace('{o}', ordinal(facts.draftSlot)),
    take: team.take,
    picks: facts.picks.slice(0, PICKS_SHOWN).map((pickFact) => ({
      label: pickFact.label,
      player: pickFact.playerName,
      position: pickFact.position,
    })),
    positions:
      facts.byPosition.length === 0
        ? null
        : facts.byPosition
            .map((entry) => `${entry.position} ${String(entry.count)}`)
            .join(' · '),
    shape: shapeSentences(facts),
    bestPick:
      team.bestPick === null
        ? null
        : `${team.bestPick.label} · ${team.bestPick.playerName}`,
    concern: team.concern,
  };
}

/**
 * Two countable sentences about how somebody drafted, at most.
 *
 * A fixed priority order, so ten managers do not all get the same observation and
 * the interesting one is never crowded out by the obvious one. Every sentence is
 * arithmetic — *"three wide receivers in the first five rounds"* — and none is an
 * evaluation, because an evaluation is Tony's and arrives in his take.
 */
function shapeSentences(facts: ManagerDraftFacts): readonly string[] {
  const sentences: string[] = [];

  if (facts.earlyLoad !== null) {
    sentences.push(
      DRAFT_PHRASES.earlyLoad
        .replace('{n}', capitalise(spell(facts.earlyLoad.count)))
        .replace('{p}', positionWord(facts.earlyLoad.position, facts.earlyLoad.count))
        .replace('{e}', spell(EARLY_ROUNDS)),
    );
  }

  if (facts.quarterbackRound !== null) {
    sentences.push(DRAFT_PHRASES.quarterback.replace('{n}', spell(facts.quarterbackRound)));
  }

  if (facts.keepers > 0 && sentences.length < 2) {
    sentences.push(
      DRAFT_PHRASES.keepers.replace('{n}', capitalise(spell(facts.keepers))),
    );
  }

  return sentences.slice(0, 2);
}

/**
 * Check a preseason edition — the derived half strictly, the editorial half for
 * product rules.
 *
 * Returns both verdicts, because they mean different things to the commissioner:
 * `verdict` blocks publication and `advisories` do not. A name in Tony's take
 * that is not in the draft is worth showing him and is not worth refusing the
 * paper over — he may be talking about a player somebody else drafted, or about
 * a bye week, or about his own oven.
 */
export interface PreseasonVerdict {
  readonly verdict: Verdict;
  /** Unknown numbers and names inside editorial copy. Shown, never blocking. */
  readonly advisories: readonly PreseasonAdvisory[];
}

export function validatePreseason(
  edition: Edition,
  packet: PreseasonPacket,
): PreseasonVerdict {
  const sections = edition.preseason;
  if (sections === undefined) {
    return {
      verdict: {
        publishable: false,
        violations: [
          { kind: 'unknown-name', value: 'preseason' },
        ],
      },
      advisories: [],
    };
  }

  /*
   * Every derived string on the page, enumerated in one place.
   *
   * The same contract `prose()` states for a weekly issue: *"the validator checks
   * the whole page"* is a fact about this list rather than about whoever last
   * edited this function. A field added to `PreseasonSections` and forgotten here
   * would be unchecked prose on a published surface.
   *
   * `take` and `concern` are the two deliberate absences, and they are checked
   * below by different rules.
   */
  const derived: string[] = [
    edition.dateline,
    edition.headline,
    edition.deck ?? '',
    edition.body,
    edition.column,
    ...sections.board.flatMap((row) => [row.manager, row.grade]),
    ...sections.snapshot.flatMap((row) => [row.label, row.value]),
    ...sections.history.flatMap((row) => [row.label, row.value]),
    ...sections.weekOne.flatMap((game) => [game.left, game.right]),
    ...sections.teams.flatMap((team) => [
      team.manager,
      team.grade,
      team.slot ?? '',
      team.positions ?? '',
      team.bestPick ?? '',
      ...team.shape,
      ...team.picks.flatMap((pickFact) => [pickFact.label, pickFact.player, pickFact.position ?? '']),
    ]),
  ];

  const violations = [...scanDerivedProse(derived, packet)];

  /*
   * Editorial copy: banned terms and quotes block, everything else advises.
   */
  const advisories: PreseasonAdvisory[] = [];
  for (const team of sections.teams) {
    const editorial = [team.take, team.concern ?? ''].filter((text) => text !== '');
    for (const text of editorial) {
      violations.push(...scanEditorialCopy(text));
      for (const advisory of scanDerivedProse([text], packet)) {
        if (advisory.kind === 'unknown-number' || advisory.kind === 'unknown-name') {
          advisories.push({ manager: team.manager, violation: advisory });
        }
      }
    }
  }

  return {
    verdict: { publishable: violations.length === 0, violations },
    advisories,
  };
}

/**
 * The whole preseason pipeline, with its working shown.
 *
 * The counterpart of `assembleIssue` for a weekly one, and the same division:
 * a caller that wants *"may this print"* reads `verdict.publishable`; the review
 * screen wants the parts, and gets them.
 */
export interface AssembledPreseason {
  readonly packet: PreseasonPacket;
  readonly edition: Edition | null;
  readonly verdict: Verdict;
  readonly advisories: PreseasonVerdict['advisories'];
}

export async function assemblePreseason(
  db: Queryable,
  input: {
    readonly season: number;
    readonly weekOne?: readonly SchedulePairing[];
  },
): Promise<AssembledPreseason> {
  const packet = await preseasonPacket(db, input);

  /*
   * A refused packet renders nothing.
   *
   * `reviews-incomplete` is the one that matters and it is the one a commissioner
   * meets: nine of ten graded, and the paper does not exist yet. Rendering the
   * nine would put an issue in the queue that is missing a manager, and the
   * missing manager is the one who would notice.
   */
  if (packet.refusal !== null) {
    return { packet, edition: null, verdict: { publishable: false, violations: [] }, advisories: [] };
  }

  const edition = renderPreseason(packet);
  if (edition === null) {
    return { packet, edition: null, verdict: { publishable: false, violations: [] }, advisories: [] };
  }

  const checked = validatePreseason(edition, packet);

  /*
   * The advisories travel **with the packet**, into the stored version.
   *
   * `slice_issue_versions.packet` is what the review screen reads, and a version
   * is immutable once written — so an advisory recorded here is the one the
   * commissioner saw when they approved, rather than one recomputed by whatever
   * the validator looks like a month later.
   */
  return {
    packet: { ...packet, advisories: checked.advisories },
    edition,
    verdict: checked.verdict,
    advisories: checked.advisories,
  };
}

