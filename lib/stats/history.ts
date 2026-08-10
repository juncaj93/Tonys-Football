import { fromCents } from '@/lib/sleeper/reconcile';

import {
  countableGames,
  participants,
  type EraGame,
  type GameStage,
  type TrackedEra,
} from './era';
import { scopeOf, type HistoricalScope } from './scope';

/**
 * What the league has actually done, across seasons — the deterministic half of
 * every historical story.
 *
 * ## The division this file is one side of
 *
 * > **Deterministic layer:** what actually happened.
 * > **Editorial layer:** why it is interesting, and how Tony says it.
 *
 * Nothing here writes a sentence, chooses a verb, or knows that Tony exists. It
 * answers questions with numbers, names the games the numbers came from, and
 * states how far back it looked. `MANDATE §9` makes Stats the sole authority for
 * *"records · rankings · streaks · historical comparisons"*, and `MANDATE §10`
 * requires each of those to arrive as a typed fact carrying its own evidence.
 *
 * ## Everything is keyed on permanent manager identity
 *
 * Never a roster id, never a display name, never a Sleeper handle. `lib/stats/
 * era.ts` resolves each side of each game once at load and this file only ever
 * sees the result. A comparison keyed on anything else merges Berardo, Topouzian
 * and Zack into "roster 4" and reports the merge as a rivalry.
 *
 * ## Retired managers are counted and not published
 *
 * They played the games, so they are in the record. They may not appear in the
 * product (`lib/league/membership.ts`, commissioner ruling 2026-07-30), so every
 * fact carries {@link HistoricalFact.managerIds} and
 * {@link publishableHistory} filters on them at the boundary — the same shape
 * `publishableWeek` uses, applied *before* anything is selected rather than
 * after, for the reason recorded there.
 *
 * ## No invented relationships
 *
 * There is no `rivalry`, no `revenge`, no `grudge` and no `nemesis` in this
 * file, and their absence is a decision rather than an omission. `07 §7.4`:
 * *"The engine cannot invent a rivalry because two teams happened to play."*
 * What is derivable is a **series record** and whether two managers have
 * previously met in a final — {@link HeadToHead.previousChampionshipMeeting} —
 * and those are measurements. Whether a series is a rivalry is editorial, and
 * the editorial layer is welcome to it.
 *
 * ## Pure
 *
 * No clock, no randomness, no database. Same era, same facts, same order.
 */

/* ------------------------------------------------------------------------- */
/* The shared shape                                                          */
/* ------------------------------------------------------------------------- */

export type HistoricalFactType =
  | 'head-to-head'
  | 'championship-meeting'
  | 'league-record'
  | 'season-streak'
  /** `lib/stats/luck.ts`. Declared here so every fact shares one type union. */
  | 'play-everyone';

/**
 * How much the population supports the claim.
 *
 * Not a probability and not a score. Three states, each meaning something a
 * caller can act on.
 */
export type Support =
  /** The whole population was available and nothing was set aside. */
  | 'verified'
  /** Real, and something was excluded — the evidence names what and why. */
  | 'partial'
  /** True, and measured over too little to be worth a claim. See {@link MIN_SERIES_MEETINGS}. */
  | 'thin-basis';

/**
 * The fields every historical fact carries, whatever it is about.
 *
 * `MANDATE §10`'s list for a matchup fact, lifted to a claim that spans seasons:
 * a stable id, a type, the people, the games it rests on, the numbers, the
 * baseline it was compared against, **the scope**, and the support. What is
 * deliberately absent is prose — `MANDATE §9` puts wording downstream of this,
 * and a `headline` field here would be the fact layer quietly acquiring an
 * opinion.
 */
export interface HistoricalFactBase {
  /** `h2h:<a>:<b>` · `record:highest-team-week`. Stable and derivable. */
  readonly id: string;
  readonly type: HistoricalFactType;
  /** Everyone the claim names. The publication boundary reads this. */
  readonly managerIds: readonly string[];
  /** Every game the claim rests on, as `EraGame.key`. */
  readonly sourceGameKeys: readonly string[];
  readonly scope: HistoricalScope;
  readonly support: Support;
  /** Everything a reader needs to check the claim themselves. Never rendered. */
  readonly evidence: readonly string[];
}

/* ------------------------------------------------------------------------- */
/* Head to head                                                              */
/* ------------------------------------------------------------------------- */

/**
 * Meetings below this and a series record is a coincidence.
 *
 * `docs/DATA_AUDIT.md §9` row 8, which scoped a rivalry summary and noted it
 * *"needs ≥3 meetings to be interesting"*. Below it the fact is still emitted
 * and still true — it is marked `thin-basis` so a consumer can decline it,
 * rather than suppressed, because *"they have played once"* is a real answer to
 * *"have these two ever played"*.
 */
export const MIN_SERIES_MEETINGS = 3;

/** One meeting, reduced to what a series needs. */
export interface Meeting {
  readonly gameKey: string;
  readonly season: number;
  readonly week: number;
  readonly stage: GameStage;
  /** Null on a tie. */
  readonly winnerManagerId: string | null;
  readonly margin: number;
  readonly marginCents: number;
  /** Points scored by the manager the series is oriented on. */
  readonly points: number;
  readonly opponentPoints: number;
}

export interface HeadToHead extends HistoricalFactBase {
  readonly type: 'head-to-head';
  /** The manager the record is oriented on. `wins` are theirs. */
  readonly managerId: string;
  readonly opponentId: string;

  readonly meetings: number;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;

  /** Regular-season meetings only. The bracket is counted separately. */
  readonly regularMeetings: number;
  /** Winners-bracket meetings — never a consolation game. See {@link GameStage}. */
  readonly bracketMeetings: number;

  readonly pointsFor: number;
  readonly pointsAgainst: number;

  /** Widest margin in the series, from whichever side won it. Null with no meetings. */
  readonly widest: Meeting | null;
  readonly closest: Meeting | null;
  readonly mostRecent: Meeting | null;

  /**
   * They have met in a game the bracket decided first place in.
   *
   * **A measurement, not a narrative.** `07 §7.4` allows a championship rematch
   * as a signal and forbids the engine inventing the relationship around it, so
   * this is exposed as a boolean and the word *revenge* appears nowhere. An
   * editorial layer may call it whatever it likes; this layer knows only that
   * the two of them were in a final together.
   */
  readonly previousChampionshipMeeting: boolean;
  readonly championshipMeetings: readonly Meeting[];

  /**
   * Meetings excluded because the game is disputed.
   *
   * `16 §12`: 2024's finalized standings and its weekly points disagree about
   * two games, `reconcile.ts` reports it and never resolves it. A series record
   * that counted one of them would be asserting a winner the official record
   * contradicts, so they are dropped from every tally here and reported in the
   * count — dropping them silently would make a 7–6 series read as 7–5.
   */
  readonly disputedMeetings: number;

  /** Every meeting counted, oldest first. */
  readonly history: readonly Meeting[];
}

/**
 * The series between two managers, across every finalized season.
 *
 * Returns null when they have never met at all — which is a different answer
 * from a 0–0 record and must not be rendered as one.
 *
 * Order matters only for orientation: `headToHead(era, a, b)` and
 * `headToHead(era, b, a)` describe the same games with `wins` and `losses`
 * swapped, and both carry the same `id`, so a caller cannot accidentally cache
 * two contradictory versions of one series.
 */
export function headToHead(
  era: TrackedEra,
  input: { readonly managerId: string; readonly opponentId: string },
): HeadToHead | null {
  const { managerId, opponentId } = input;
  if (managerId === opponentId) return null;

  const between = era.games.filter((game) => {
    const pair = participants(game);
    return (
      pair !== null &&
      ((pair[0] === managerId && pair[1] === opponentId) ||
        (pair[0] === opponentId && pair[1] === managerId))
    );
  });

  if (between.length === 0) return null;

  const disputedMeetings = between.filter((game) => game.disputed).length;
  const counted = between.filter((game) => game.countable);

  const history = counted.map((game) => meetingOf(game, managerId));

  let wins = 0;
  let losses = 0;
  let ties = 0;
  let pointsForCents = 0;
  let pointsAgainstCents = 0;

  for (const game of counted) {
    const mine = game.a.managerId === managerId ? game.a : game.b;
    const theirs = game.a.managerId === managerId ? game.b : game.a;
    pointsForCents += mine.pointsCents;
    pointsAgainstCents += theirs.pointsCents;
    if (game.tie) ties++;
    else if (game.winner?.managerId === managerId) wins++;
    else losses++;
  }

  const byMargin = [...history].sort(
    (x, y) => y.marginCents - x.marginCents || x.gameKey.localeCompare(y.gameKey),
  );
  const byRecency = [...history].sort(
    (x, y) => y.season - x.season || y.week - x.week || y.gameKey.localeCompare(x.gameKey),
  );

  const championshipMeetings = counted
    .filter((game) => isChampionshipGame(era, game))
    .map((game) => meetingOf(game, managerId));

  const support: Support =
    disputedMeetings > 0
      ? 'partial'
      : counted.length < MIN_SERIES_MEETINGS
        ? 'thin-basis'
        : 'verified';

  const scope = scopeOf({
    kind: 'tracked-era',
    seasons: era.seasons,
    observations: counted.length,
  });

  const name = (id: string): string => era.managers.get(id)?.displayName ?? id;

  return {
    id: seriesId(managerId, opponentId),
    type: 'head-to-head',
    managerId,
    opponentId,
    managerIds: [managerId, opponentId],
    sourceGameKeys: counted.map((game) => game.key),
    scope,
    support,
    evidence: [
      `${name(managerId)} against ${name(opponentId)}, every finalized season ${scope.label}`,
      `${String(counted.length)} counted meetings: ${String(wins)}-${String(losses)}-${String(ties)} to ${name(managerId)}`,
      `${String(history.filter((meeting) => meeting.stage === 'regular').length)} regular season, ` +
        `${String(history.filter((meeting) => meeting.stage === 'bracket').length)} in the bracket, ` +
        `${String(history.filter((meeting) => meeting.stage === 'consolation').length)} consolation`,
      `points ${fromCents(pointsForCents).toFixed(2)} to ${fromCents(pointsAgainstCents).toFixed(2)}, summed from integer cents`,
      disputedMeetings === 0
        ? 'no disputed meetings'
        : `${String(disputedMeetings)} meeting(s) excluded as disputed — \`16 §12\`, the finalized standings ` +
          'and the weekly snapshot disagree and the disagreement is never resolved',
      counted.length < MIN_SERIES_MEETINGS
        ? `under ${String(MIN_SERIES_MEETINGS)} meetings, so the series is reported as thin-basis`
        : '',
      championshipMeetings.length === 0
        ? 'they have not met in a game that decided first place'
        : `${String(championshipMeetings.length)} meeting(s) decided first place: ` +
          championshipMeetings.map((meeting) => meeting.gameKey).join(', '),
    ].filter((line) => line !== ''),

    meetings: counted.length,
    wins,
    losses,
    ties,
    regularMeetings: history.filter((meeting) => meeting.stage === 'regular').length,
    bracketMeetings: history.filter((meeting) => meeting.stage === 'bracket').length,
    pointsFor: fromCents(pointsForCents),
    pointsAgainst: fromCents(pointsAgainstCents),
    widest: byMargin[0] ?? null,
    closest: byMargin[byMargin.length - 1] ?? null,
    mostRecent: byRecency[0] ?? null,
    previousChampionshipMeeting: championshipMeetings.length > 0,
    championshipMeetings,
    disputedMeetings,
    history,
  };
}

/**
 * Every series in the era, one per pair, strongest basis first.
 *
 * One entry per unordered pair — oriented on whichever manager id sorts first,
 * so the set is stable and a pair cannot appear twice under two orientations.
 */
export function allSeries(era: TrackedEra): readonly HeadToHead[] {
  const seen = new Set<string>();
  const out: HeadToHead[] = [];

  for (const game of era.games) {
    const pair = participants(game);
    if (pair === null) continue;
    const [first, second] = [...pair].sort();
    const id = seriesId(first!, second!);
    if (seen.has(id)) continue;
    seen.add(id);
    const series = headToHead(era, { managerId: first!, opponentId: second! });
    if (series !== null) out.push(series);
  }

  return out.sort((x, y) => y.meetings - x.meetings || x.id.localeCompare(y.id));
}

/** `h2h:<lower>:<higher>`. Orientation-independent by construction. */
function seriesId(a: string, b: string): string {
  const [first, second] = [a, b].sort();
  return `h2h:${first ?? ''}:${second ?? ''}`;
}

function meetingOf(game: EraGame, orientedOn: string): Meeting {
  const mine = game.a.managerId === orientedOn ? game.a : game.b;
  const theirs = game.a.managerId === orientedOn ? game.b : game.a;
  return {
    gameKey: game.key,
    season: game.season,
    week: game.week,
    stage: game.stage,
    winnerManagerId: game.winner?.managerId ?? null,
    margin: game.margin,
    marginCents: game.marginCents,
    points: mine.points,
    opponentPoints: theirs.points,
  };
}

/**
 * Did this game decide first place?
 *
 * The title game is the one whose two participants finished **first and
 * second**, read from the placement the bracket produced. `stories.ts` derives
 * it the same way and for the same reason: `lib/sleeper/placements.ts` records
 * what goes wrong when a placement is inferred from a matchup's position instead
 * of read from the bracket.
 */
function isChampionshipGame(era: TrackedEra, game: EraGame): boolean {
  if (game.stage !== 'bracket') return false;
  if (game.winner === null || game.loser === null) return false;
  const ranks = era.finalRanks.get(game.season);
  if (ranks === undefined) return false;
  const winnerId = game.winner.managerId;
  const loserId = game.loser.managerId;
  if (winnerId === null || loserId === null) return false;
  return ranks.get(winnerId) === 1 && ranks.get(loserId) === 2;
}

/* ------------------------------------------------------------------------- */
/* Championship meetings                                                     */
/* ------------------------------------------------------------------------- */

export interface ChampionshipMeeting extends HistoricalFactBase {
  readonly type: 'championship-meeting';
  readonly season: number;
  readonly week: number;
  readonly championManagerId: string;
  readonly runnerUpManagerId: string;
  readonly championPoints: number;
  readonly runnerUpPoints: number;
  readonly margin: number;
}

/**
 * Every game that decided a title, oldest first.
 *
 * The whole of what this product can say about finals. It is a short list — two
 * entries as of 2026 — and that is the honest size of it.
 */
export function championshipMeetings(era: TrackedEra): readonly ChampionshipMeeting[] {
  return countableGames(era)
    .filter((game) => isChampionshipGame(era, game))
    .map((game): ChampionshipMeeting => {
      const champion = game.winner!;
      const runnerUp = game.loser!;
      const scope = scopeOf({ kind: 'season', seasons: [game.season], observations: 1 });
      return {
        id: `championship:${String(game.season)}`,
        type: 'championship-meeting',
        season: game.season,
        week: game.week,
        championManagerId: champion.managerId!,
        runnerUpManagerId: runnerUp.managerId!,
        championPoints: champion.points,
        runnerUpPoints: runnerUp.points,
        margin: game.margin,
        managerIds: [champion.managerId!, runnerUp.managerId!],
        sourceGameKeys: [game.key],
        scope,
        support: 'verified',
        evidence: [
          `stored game ${game.key}`,
          `${champion.displayName ?? ''} ${champion.points.toFixed(2)} — ${runnerUp.displayName ?? ''} ${runnerUp.points.toFixed(2)}`,
          `margin ${game.margin.toFixed(2)}, exact from integer cents`,
          'the two finalists by recorded placement — first against second, read from the bracket',
        ],
      };
    })
    .sort((x, y) => x.season - y.season);
}

/* ------------------------------------------------------------------------- */
/* The record book                                                           */
/* ------------------------------------------------------------------------- */

export type RecordKind =
  | 'highest-team-week'
  | 'lowest-team-week'
  | 'widest-margin'
  | 'closest-game';

/** One holder of one record. Several where the value is shared. */
export interface RecordHolder {
  readonly managerId: string;
  readonly displayName: string;
  readonly gameKey: string;
  readonly season: number;
  readonly week: number;
  /** Who they were playing. Null on a record about the game rather than a team. */
  readonly opponentManagerId: string | null;
}

export interface LeagueRecord extends HistoricalFactBase {
  readonly type: 'league-record';
  readonly kind: RecordKind;
  /** Points for a score record, margin for a margin record. */
  readonly value: number;
  readonly valueCents: number;
  /** Everyone who holds it. More than one only on an exact tie. */
  readonly holders: readonly RecordHolder[];
  /** The next value down (or up), so a reader can see how close the record is. */
  readonly runnerUpValue: number | null;
  /** Which stages the population covered. */
  readonly stages: readonly GameStage[];
}

/**
 * Stages the record book counts by default.
 *
 * **Regular season only**, which is `docs/DATA_AUDIT.md §15`'s encoded policy:
 * *"record books default to the regular season; playoff records are separate and
 * labelled."* A bracket game is played by the best half of the league in a
 * three-week window and mixing it into a season-long population makes the
 * ordinary look unusual.
 *
 * Pass `stages` to {@link recordBook} to ask a different question. The stages
 * are carried on the answer, so a caller cannot receive a playoff-inclusive
 * record and print it as a regular-season one.
 */
export const DEFAULT_RECORD_STAGES: readonly GameStage[] = Object.freeze(['regular']);

/**
 * The four records this product can prove, over whichever stages are asked for.
 *
 * Every one is a min or a max over stored rows, with the population size on the
 * answer. There is no threshold, no tier and no judgement in this function —
 * `significance.ts` owns what a margin *means* and is deliberately not consulted
 * here, because *"the widest margin recorded"* is true regardless of which tier
 * it lands in.
 *
 * A record with no population returns nothing rather than a zero.
 */
export function recordBook(
  era: TrackedEra,
  input: { readonly stages?: readonly GameStage[] } = {},
): readonly LeagueRecord[] {
  const stages = input.stages ?? DEFAULT_RECORD_STAGES;
  const stageSet = new Set(stages);

  const games = countableGames(era).filter((game) => stageSet.has(game.stage));
  if (games.length === 0) return [];

  const seasons = [...new Set(games.map((game) => game.season))];
  const stageLabel = [...stages].sort().join(' + ');

  /*
   * Disputed games **inside this population**, not in the era.
   *
   * The first version asked whether the era held any dispute at all, which
   * marked a bracket-only record `partial` because two regular-season games in
   * 2024 disagree with the standings — games that were never in the population.
   * A support flag that is pessimistic about data the claim did not touch is
   * noise, and noise in a support flag is how a real `partial` stops being read.
   */
  const disputedHere = era.games.filter(
    (game) => stageSet.has(game.stage) && game.disputed,
  );
  const support: Support = disputedHere.length === 0 ? 'verified' : 'partial';
  const disputeNote =
    disputedHere.length === 0
      ? 'no disputed games in the population'
      : `${String(disputedHere.length)} disputed game(s) excluded — \`16 §12\`, the finalized ` +
        'standings and the weekly snapshot disagree and the disagreement is never resolved. ' +
        "The closest recorded 2024 regular-season game is one of them, which is why it is not " +
        'the record';

  /** Every side of every game, as a team-week. Two per game. */
  const teamWeeks = games.flatMap((game) => [
    { game, side: game.a, other: game.b },
    { game, side: game.b, other: game.a },
  ]);

  const scoreScope = scopeOf({
    kind: 'tracked-era',
    seasons,
    observations: teamWeeks.length,
  });
  const marginScope = scopeOf({
    kind: 'tracked-era',
    seasons,
    observations: games.length,
  });

  const out: LeagueRecord[] = [];

  for (const [kind, pick] of [
    ['highest-team-week', 'max'],
    ['lowest-team-week', 'min'],
  ] as const) {
    const values = teamWeeks.map((entry) => entry.side.pointsCents);
    const best = extremeOf(values, pick);
    if (best === null) continue;
    const holding = teamWeeks
      .filter((entry) => entry.side.pointsCents === best)
      .sort((x, y) => x.game.key.localeCompare(y.game.key));
    const runnerUp = extremeOf(
      values.filter((value) => value !== best),
      pick,
    );

    out.push({
      id: `record:${kind}:${stageLabel}`,
      type: 'league-record',
      kind,
      value: fromCents(best),
      valueCents: best,
      holders: holding.map((entry) => ({
        managerId: entry.side.managerId!,
        displayName: entry.side.displayName ?? '',
        gameKey: entry.game.key,
        season: entry.game.season,
        week: entry.game.week,
        opponentManagerId: entry.other.managerId,
      })),
      runnerUpValue: runnerUp === null ? null : fromCents(runnerUp),
      stages,
      managerIds: holding.map((entry) => entry.side.managerId!),
      sourceGameKeys: holding.map((entry) => entry.game.key),
      scope: scoreScope,
      support,
      evidence: [
        `${pick === 'max' ? 'highest' : 'lowest'} team-week score ${scoreScope.label}, ${stageLabel} only`,
        `${fromCents(best).toFixed(2)}, from ${String(teamWeeks.length)} finalized team-weeks`,
        ...holding.map(
          (entry) =>
            `${entry.side.displayName ?? ''} in ${entry.game.key} against ${entry.other.displayName ?? ''}`,
        ),
        runnerUp === null
          ? 'no second value in the population'
          : `next is ${fromCents(runnerUp).toFixed(2)}`,
        disputeNote,
      ],
    });
  }

  for (const [kind, pick] of [
    ['widest-margin', 'max'],
    ['closest-game', 'min'],
  ] as const) {
    // A tie is a real result and it is not the closest *game* in the sense the
    // record means — a game nobody won cannot be "decided by" anything. Excluded
    // from both margin records, and said out loud rather than filtered quietly.
    const decided = games.filter((game) => !game.tie);
    if (decided.length === 0) continue;

    const values = decided.map((game) => game.marginCents);
    const best = extremeOf(values, pick);
    if (best === null) continue;
    const holding = decided
      .filter((game) => game.marginCents === best)
      .sort((x, y) => x.key.localeCompare(y.key));
    const runnerUp = extremeOf(
      values.filter((value) => value !== best),
      pick,
    );

    out.push({
      id: `record:${kind}:${stageLabel}`,
      type: 'league-record',
      kind,
      value: fromCents(best),
      valueCents: best,
      holders: holding.map((game) => ({
        managerId: game.winner!.managerId!,
        displayName: game.winner!.displayName ?? '',
        gameKey: game.key,
        season: game.season,
        week: game.week,
        opponentManagerId: game.loser!.managerId,
      })),
      runnerUpValue: runnerUp === null ? null : fromCents(runnerUp),
      stages,
      managerIds: holding.flatMap((game) =>
        [game.winner!.managerId, game.loser!.managerId].filter(
          (id): id is string => id !== null,
        ),
      ),
      sourceGameKeys: holding.map((game) => game.key),
      scope: marginScope,
      support,
      evidence: [
        `${pick === 'max' ? 'widest' : 'narrowest'} margin ${marginScope.label}, ${stageLabel} only`,
        `${fromCents(best).toFixed(2)}, from ${String(decided.length)} decided finalized games`,
        ...holding.map(
          (game) =>
            `${game.winner?.displayName ?? ''} ${game.winner?.points.toFixed(2) ?? ''} — ` +
            `${game.loser?.displayName ?? ''} ${game.loser?.points.toFixed(2) ?? ''} in ${game.key}`,
        ),
        runnerUp === null
          ? 'no second value in the population'
          : `next is ${fromCents(runnerUp).toFixed(2)}`,
        'ties excluded: a game nobody won was not decided by any margin',
        disputeNote,
      ],
    });
  }

  return out;
}

/**
 * The largest or smallest of a list, or null when the list is empty.
 *
 * A fold rather than `Math.max(...values)`. The spread is fine at this league's
 * size and stops being fine at around a hundred thousand arguments, which is a
 * failure mode that arrives without warning and looks like a crash rather than
 * like a limit.
 */
function extremeOf(values: readonly number[], pick: 'max' | 'min'): number | null {
  let best: number | null = null;
  for (const value of values) {
    if (best === null) best = value;
    else if (pick === 'max' ? value > best : value < best) best = value;
  }
  return best;
}

/* ------------------------------------------------------------------------- */
/* Streaks                                                                   */
/* ------------------------------------------------------------------------- */

export interface SeasonStreak extends HistoricalFactBase {
  readonly type: 'season-streak';
  readonly managerId: string;
  readonly displayName: string;
  readonly season: number;
  readonly length: number;
  readonly startWeek: number;
  readonly endWeek: number;
}

/**
 * The longest run of consecutive regular-season wins, per manager per season.
 *
 * ## Streaks reset each season, and that is a recorded policy
 *
 * `docs/DATA_AUDIT.md §13` opened it as a question — *"does a win streak carry
 * from week 14 of 2024 into week 1 of 2025"* — and `§15` answered it:
 * *"streaks reset each season, use finalized results, and are never recomputed
 * from the mutable weekly snapshot; a bye neither counts nor breaks a streak."*
 * So there is deliberately **no cross-season streak** in this file. A run that
 * spanned an offseason, a draft and a different ten-man roster is a coincidence
 * of the calendar dressed as momentum.
 *
 * ## Regular season only, and a tie ends a run
 *
 * `standings.ts` gives both reasons, and this agrees with it deliberately: a
 * bracket run is a different claim, and an unbeaten run and a winning run are
 * different claims. Two functions disagreeing about what a streak is would put
 * two numbers for one manager on two surfaces.
 *
 * A week the manager did not play — a bye, or an unpaired roster — is skipped
 * rather than treated as a loss, so it neither extends nor breaks the run.
 */
export function seasonStreaks(era: TrackedEra): readonly SeasonStreak[] {
  const out: SeasonStreak[] = [];

  for (const season of era.seasons) {
    const games = countableGames(era).filter(
      (game) => game.season === season && game.stage === 'regular',
    );
    if (games.length === 0) continue;

    const managerIds = new Set<string>();
    for (const game of games) {
      if (game.a.managerId !== null) managerIds.add(game.a.managerId);
      if (game.b.managerId !== null) managerIds.add(game.b.managerId);
    }

    for (const managerId of [...managerIds].sort()) {
      const theirs = games
        .filter((game) => game.a.managerId === managerId || game.b.managerId === managerId)
        .sort((x, y) => x.week - y.week || x.sleeperMatchupId - y.sleeperMatchupId);

      let best = { length: 0, startWeek: 0, endWeek: 0 };
      let run = { length: 0, startWeek: 0, endWeek: 0 };

      for (const game of theirs) {
        if (game.winner?.managerId === managerId) {
          run = {
            length: run.length + 1,
            startWeek: run.length === 0 ? game.week : run.startWeek,
            endWeek: game.week,
          };
          if (run.length > best.length) best = run;
        } else {
          run = { length: 0, startWeek: 0, endWeek: 0 };
        }
      }

      if (best.length === 0) continue;

      const scope = scopeOf({
        kind: 'season',
        seasons: [season],
        observations: theirs.length,
      });
      const displayName = era.managers.get(managerId)?.displayName ?? managerId;

      out.push({
        id: `streak:${String(season)}:${managerId}`,
        type: 'season-streak',
        managerId,
        displayName,
        season,
        length: best.length,
        startWeek: best.startWeek,
        endWeek: best.endWeek,
        managerIds: [managerId],
        sourceGameKeys: theirs
          .filter((game) => game.week >= best.startWeek && game.week <= best.endWeek)
          .map((game) => game.key),
        scope,
        support: 'verified',
        evidence: [
          `${displayName}: ${String(best.length)} consecutive regular-season wins, ` +
            `weeks ${String(best.startWeek)} to ${String(best.endWeek)} ${scope.label}`,
          `counted over ${String(theirs.length)} countable regular-season games`,
          'a tie ends a run rather than extending it; a week without a game is skipped',
          'streaks reset each season — `docs/DATA_AUDIT.md §15`',
        ],
      });
    }
  }

  return out.sort(
    (x, y) => y.length - x.length || x.season - y.season || x.managerId.localeCompare(y.managerId),
  );
}

/* ------------------------------------------------------------------------- */
/* The publication boundary                                                  */
/* ------------------------------------------------------------------------- */

/**
 * Everything in `facts` that names only people who may currently be published.
 *
 * The same boundary `publishableWeek` applies to a week, applied to a historical
 * claim, and applied **before** selection for the reason recorded there: a
 * boundary that removes a candidate after ranking changes what gets published,
 * while one that removes it before changes only who is eligible.
 *
 * A fact naming a retired manager is a true fact and stays in the record. It may
 * not be spoken (`lib/league/membership.ts`, commissioner ruling 2026-07-30),
 * and the difference between those two things is this function.
 */
export function publishableHistory<T extends HistoricalFactBase>(
  facts: readonly T[],
  publishableManagerIds: ReadonlySet<string>,
): readonly T[] {
  return facts.filter((fact) =>
    fact.managerIds.every((id) => publishableManagerIds.has(id)),
  );
}

/* ------------------------------------------------------------------------- */
/* Explainability                                                            */
/* ------------------------------------------------------------------------- */

/**
 * Why a fact says what it says, as lines a developer can read.
 *
 * The answer to *"why was this flagged"* — which `MANDATE §10` requires of every
 * publishable fact and which is otherwise reconstructed by re-reading the
 * derivation months later. It prints the scope, the support, the population size
 * and the games, and nothing that is not already on the fact: a report that
 * computed anything of its own would be a second opinion about football, which
 * is the thing this whole layer exists to have exactly one of.
 */
export function explain(fact: HistoricalFactBase): readonly string[] {
  return [
    `${fact.type} · ${fact.id}`,
    `scope: ${fact.scope.label} (${fact.scope.kind}, ${String(fact.scope.seasons.length)} season(s), ` +
      `${String(fact.scope.observations)} observations, finalized only)`,
    `support: ${fact.support}`,
    ...fact.evidence.map((line) => `  - ${line}`),
    `source games: ${fact.sourceGameKeys.length === 0 ? 'none' : fact.sourceGameKeys.join(', ')}`,
  ];
}
