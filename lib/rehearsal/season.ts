import { createFixtureSource } from '@/lib/sleeper/fixtures';
import { type SleeperEndpoint } from '@/lib/sleeper/endpoints';
import { type SleeperFetchResult, type SleeperSource } from '@/lib/sleeper/transport';

/**
 * A whole season of football, in motion — the shared rehearsal source.
 *
 * ## Why this exists, and why it is not a second harness
 *
 * `lib/sleeper/test-source.ts` already synthesises a season in progress, and it
 * was built for one narrow job: prove that a *new regular-season week* reaches
 * the database and that a stale read loses to a fresh one. It pairs all ten
 * rosters every week by `ceil(rosterId / 2)`, forever. That is a fine model of
 * September and a **false** model of January: it has no bracket, no byes, no
 * eliminated rosters accruing points beside a real game, and no consolation
 * ladder. Every late-season failure mode this repository worries about
 * (`lib/sleeper/weeks.ts`'s whole module comment) is invisible to it.
 *
 * So this is the same idea carried through to the end of the season, and it is
 * **the** rehearsal source rather than a playoff-only one: `rehearsalSeason({
 * played: 1 })` is a week-one rehearsal, `played: 8` is a midseason one, and
 * `played: 16` is the semifinal. A week-N workstream should extend this rather
 * than write a third season generator.
 *
 * ## Nothing about the league's shape is invented here
 *
 * The playoff week, the size of the field and the roster count are **read from
 * the recorded 2026 league payload** ({@link rehearsalShape}) rather than
 * written down. `playoff_week_start = 15` and `playoff_teams = 6` are facts
 * about this league today; a league that moved either must not have a rehearsal
 * that silently keeps rehearsing the old shape.
 *
 * League, users and roster identities come from the real fixtures, so managers,
 * roster ids and co-owners behave exactly as they do in production. Only the
 * three payloads a played week actually changes are synthesised: the matchups,
 * the standings, and the two brackets.
 *
 * ## The brackets are a state machine, because that is the interesting part
 *
 * Sleeper does not hand you "the playoffs". It hands you a bracket that fills
 * in as rounds are played, and **`p` is bracket-relative** — the trap
 * `lib/sleeper/placements.ts` exists to defuse. So the brackets here are
 * generated from how far the postseason has actually got:
 *
 * | after week | winners bracket | losers bracket |
 * |---|---|---|
 * | 14 | drawn from the seeds, no result | drawn, no result |
 * | 15 | round 1 decided | round 1 decided |
 * | 16 | round 2 decided — **5th and 6th are final** | round 2 decided — **7th–10th are final** |
 * | 17 | round 3 decided — champion, 2nd, 3rd, 4th | unchanged |
 *
 * That table is the single most important thing about week 16 in this league:
 * six of the ten final placements are settled by it, and the four that decide a
 * championship are not. A rehearsal that models the postseason as "one bracket
 * that resolves at the end" would test none of it.
 *
 * ## Deterministic, and pinned rather than random
 *
 * Every score comes from {@link scoreCents}, an integer function of roster and
 * week. Nothing here calls a clock or a random number generator — the same
 * options produce the same season on every machine, which is what lets a test
 * assert a seed order and a margin to the cent.
 */

// --------------------------------------------------------------------------
// The league's shape, read rather than assumed
// --------------------------------------------------------------------------

/** The 2026 league. The season a rehearsal plays. */
export const REHEARSAL_LEAGUE = '1385016656425668608';

/** Any moment after the fixtures' own capture, so a live read reads as fresher. */
export const REHEARSAL_CAPTURE = new Date('2026-12-23T09:00:00Z');

export interface RehearsalShape {
  readonly totalRosters: number;
  readonly playoffTeams: number;
  readonly playoffWeekStart: number;
  /** The last regular-season week. `playoffWeekStart - 1`. */
  readonly lastRegularWeek: number;
  /** Rounds in the winners bracket, from the field size. Three for six teams. */
  readonly playoffRounds: number;
  /** The last week the league plays. */
  readonly lastWeek: number;
  /** The championship round's week. */
  readonly championshipWeek: number;
}

interface RawLeague {
  readonly settings?: Record<string, unknown>;
  readonly total_rosters?: number;
}

/**
 * The league's postseason shape, derived from the recorded league payload.
 *
 * A six-team bracket is three rounds — two first-round games plus two byes,
 * two semifinals, one final — and that arithmetic is `ceil(log2(field))`. It is
 * written as arithmetic rather than as `3` so a league that expanded its field
 * produces a rehearsal of *its* postseason and not of this one.
 */
export function rehearsalShape(league: unknown): RehearsalShape {
  const raw = league as RawLeague;
  const settings = raw.settings ?? {};

  const number = (key: string): number | null => {
    const value = settings[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
      return Number(value);
    }
    return null;
  };

  const totalRosters = raw.total_rosters ?? 0;
  const playoffTeams = number('playoff_teams');
  const playoffWeekStart = number('playoff_week_start');

  if (totalRosters <= 0 || playoffTeams === null || playoffWeekStart === null) {
    throw new Error(
      'The recorded league payload carries no roster count, playoff field size or playoff ' +
        'week. A rehearsal cannot invent them — re-record the fixtures.',
    );
  }

  const playoffRounds = Math.ceil(Math.log2(playoffTeams));

  return {
    totalRosters,
    playoffTeams,
    playoffWeekStart,
    lastRegularWeek: playoffWeekStart - 1,
    playoffRounds,
    lastWeek: playoffWeekStart + playoffRounds - 1,
    championshipWeek: playoffWeekStart + playoffRounds - 1,
  };
}

// --------------------------------------------------------------------------
// The football
// --------------------------------------------------------------------------

/**
 * Per-roster strength, so the table has a shape somebody could seed from.
 *
 * Deliberately not in roster order. A season whose standings come out 1..10 in
 * roster order would let a bracket assertion pass while reading the roster id
 * instead of the seed — which is exactly the class of defect
 * `placements.ts` was written to catch.
 */
const STRENGTH: readonly number[] = [8, 3, 10, 5, 1, 9, 4, 7, 2, 6];

/**
 * One roster's score in one week, in integer cents.
 *
 * A cheap deterministic hash, kept in cents because every comparison
 * downstream is in cents and a float here would reintroduce the rounding
 * question `reconcile.ts` exists to avoid.
 */
export function scoreCents(rosterId: number, week: number): number {
  const strength = STRENGTH[(rosterId - 1) % STRENGTH.length] ?? 5;
  const wobble = (rosterId * 7919 + week * 104729) % 4001;

  /*
   * 80.00 points, plus up to 21.00 of standing and up to 40.00 of week. The
   * range lands between roughly 82 and 143, which is where this league's real
   * team-weeks sit — a generator whose scores were out of range would make
   * every percentile in `significance.ts` meaningless.
   */
  return 8_000 + strength * 210 + wobble;
}

/** `${week}:${rosterId}` — the key an override is written against. */
export function scoreKey(week: number, rosterId: number): string {
  return `${String(week)}:${String(rosterId)}`;
}

/**
 * The regular season's fixtures, by the circle method.
 *
 * Ten teams give a nine-week cycle that repeats; fourteen weeks is one full
 * cycle plus five. Everybody plays everybody at least once, which is what makes
 * the resulting table a table rather than a strength-of-schedule artefact.
 */
export function regularPairings(week: number, totalRosters: number): readonly [number, number][] {
  const fixed = 1;
  const rotating: number[] = [];
  for (let id = 2; id <= totalRosters; id++) rotating.push(id);

  const shift = (week - 1) % rotating.length;
  const rotated = [...rotating.slice(shift), ...rotating.slice(0, shift)];
  const order = [fixed, ...rotated];

  const pairs: [number, number][] = [];
  for (let index = 0; index < totalRosters / 2; index++) {
    const home = order[index]!;
    const away = order[totalRosters - 1 - index]!;
    pairs.push(home < away ? [home, away] : [away, home]);
  }
  return pairs;
}

// --------------------------------------------------------------------------
// The postseason
// --------------------------------------------------------------------------

/** One bracket game, before or after it is played. */
export interface RehearsalMatch {
  readonly round: number;
  readonly matchId: number;
  readonly week: number;
  readonly team1: number | null;
  readonly team2: number | null;
  /** The league position this game settles, bracket-relative. Null when none. */
  readonly placement: number | null;
}

/** Both brackets, laid out from the seeds. Results are applied separately. */
export interface RehearsalBrackets {
  readonly winners: readonly RehearsalMatch[];
  readonly losers: readonly RehearsalMatch[];
}

/**
 * A six-team winners bracket and a four-team consolation ladder.
 *
 * The layout follows the recorded 2026 draw exactly, including the detail that
 * makes week 16 what it is: **round 2 carries a `p=5` game between the two
 * first-round losers**, and the consolation bracket's round 2 carries `p=1` and
 * `p=3`. Six placements settle in the semifinal week; only the four that decide
 * a championship wait for week 17.
 */
export function drawBrackets(
  seeds: readonly number[],
  shape: RehearsalShape,
): RehearsalBrackets {
  const seed = (position: number): number | null => seeds[position - 1] ?? null;
  const first = shape.playoffWeekStart;

  const byes = shape.playoffTeams - 2 * (shape.playoffTeams - 2 ** (shape.playoffRounds - 1));

  if (shape.playoffTeams !== 6 || byes !== 2) {
    throw new Error(
      `The rehearsal draws a six-team bracket with two byes. This league's field is ` +
        `${String(shape.playoffTeams)}. Extend drawBrackets before rehearsing it.`,
    );
  }

  const winners: RehearsalMatch[] = [
    { round: 1, matchId: 1, week: first, team1: seed(3), team2: seed(6), placement: null },
    { round: 1, matchId: 2, week: first, team1: seed(4), team2: seed(5), placement: null },
    { round: 2, matchId: 3, week: first + 1, team1: seed(1), team2: null, placement: null },
    { round: 2, matchId: 4, week: first + 1, team1: seed(2), team2: null, placement: null },
    // The two first-round losers, playing for fifth. Decided in week 16.
    { round: 2, matchId: 5, week: first + 1, team1: null, team2: null, placement: 5 },
    { round: 3, matchId: 6, week: first + 2, team1: null, team2: null, placement: 1 },
    { round: 3, matchId: 7, week: first + 2, team1: null, team2: null, placement: 3 },
  ];

  const losers: RehearsalMatch[] = [
    { round: 1, matchId: 1, week: first, team1: seed(7), team2: seed(10), placement: null },
    { round: 1, matchId: 2, week: first, team1: seed(8), team2: seed(9), placement: null },
    // Bracket-relative: p=1 here is the league's 7th place.
    { round: 2, matchId: 3, week: first + 1, team1: null, team2: null, placement: 1 },
    { round: 2, matchId: 4, week: first + 1, team1: null, team2: null, placement: 3 },
  ];

  return { winners, losers };
}

/** A bracket match as Sleeper serialises it, results included where known. */
interface SerialisedMatch {
  readonly r: number;
  readonly m: number;
  readonly t1: number | null;
  readonly t2: number | null;
  readonly w: number | null;
  readonly l: number | null;
  readonly p: number | null;
}

// --------------------------------------------------------------------------
// The source
// --------------------------------------------------------------------------

export interface RehearsalOptions {
  /** Weeks that have been played. Beyond this, matchups answer `[]`. */
  readonly played: number;
  /** When this read happened. Defaults to well after the recording. */
  readonly capturedAt?: Date;
  /**
   * Score overrides, keyed by {@link scoreKey}, in **cents**.
   *
   * How a scenario pins a close finish or a blowout without reaching into the
   * hash. An override is applied wherever that roster plays that week, so a
   * week-16 semifinal can be made to finish by 0.42 on purpose.
   */
  readonly scores?: ReadonlyMap<string, number>;
  /**
   * Report the brackets as if only this many weeks had been played.
   *
   * Failure injection: Sleeper's bracket endpoints are separate calls from the
   * matchups, and they have been observed to lag. A week whose games are in but
   * whose bracket is not is a real state, and the product must not read a
   * placement out of it.
   */
  readonly bracketPlayedThrough?: number;
  /**
   * Report the standings as if only this many weeks had been played.
   *
   * The other half of the same failure: the official record lagging the weekly
   * snapshot is what `reconcileSeason` exists to detect.
   */
  readonly standingsPlayedThrough?: number;
}

export type RehearsalSource = SleeperSource & {
  /** Every endpoint asked for, in order. The request budget, observable. */
  readonly requests: readonly SleeperEndpoint[];
  readonly shape: RehearsalShape;
  /** The regular-season table, best first, as the seeds are taken from it. */
  readonly seeds: readonly number[];
  readonly brackets: RehearsalBrackets;
  /** Who won each bracket game, once its week has been played. */
  readonly winnersResults: ReadonlyMap<number, { winner: number; loser: number }>;
  readonly losersResults: ReadonlyMap<number, { winner: number; loser: number }>;
  /** Every pairing the league plays in a week, whoever it is between. */
  pairingsFor(week: number): readonly [number, number][];
  /** One roster's score in one week, cents, overrides applied. */
  scoreFor(week: number, rosterId: number): number;
};

interface RegularRecord {
  wins: number;
  losses: number;
  ties: number;
  pointsForCents: number;
  pointsAgainstCents: number;
  results: string;
}

export function rehearsalSeason(options: RehearsalOptions): RehearsalSource {
  const underlying = createFixtureSource();
  const requests: SleeperEndpoint[] = [];
  const capturedAt = options.capturedAt ?? REHEARSAL_CAPTURE;
  const overrides = options.scores ?? new Map<string, number>();

  /*
   * The league payload has to be read before anything else can be laid out, and
   * the source's own `fetch` is async. Reading the fixture synchronously here
   * would duplicate `createFixtureSource`'s manifest handling, so the shape is
   * resolved lazily and cached — every code path below goes through `shape()`.
   */
  let cachedShape: RehearsalShape | null = null;
  let cachedLeague: Record<string, unknown> | null = null;

  async function league(): Promise<Record<string, unknown>> {
    if (cachedLeague !== null) return cachedLeague;
    const result = await underlying.fetch({ kind: 'league', leagueId: REHEARSAL_LEAGUE });
    if (result.kind !== 'ok') {
      throw new Error('The recorded 2026 league payload could not be read.');
    }
    cachedLeague = result.payload as Record<string, unknown>;
    return cachedLeague;
  }

  async function shape(): Promise<RehearsalShape> {
    cachedShape ??= rehearsalShape(await league());
    return cachedShape;
  }

  function score(week: number, rosterId: number): number {
    return overrides.get(scoreKey(week, rosterId)) ?? scoreCents(rosterId, week);
  }

  /** The regular-season table, computed from the same games the weeks report. */
  function regularRecords(through: number, form: RehearsalShape): Map<number, RegularRecord> {
    const table = new Map<number, RegularRecord>();
    for (let rosterId = 1; rosterId <= form.totalRosters; rosterId++) {
      table.set(rosterId, {
        wins: 0,
        losses: 0,
        ties: 0,
        pointsForCents: 0,
        pointsAgainstCents: 0,
        results: '',
      });
    }

    const last = Math.min(through, form.lastRegularWeek);
    for (let week = 1; week <= last; week++) {
      for (const [home, away] of regularPairings(week, form.totalRosters)) {
        const homeScore = score(week, home);
        const awayScore = score(week, away);
        const homeRow = table.get(home)!;
        const awayRow = table.get(away)!;

        homeRow.pointsForCents += homeScore;
        homeRow.pointsAgainstCents += awayScore;
        awayRow.pointsForCents += awayScore;
        awayRow.pointsAgainstCents += homeScore;

        if (homeScore === awayScore) {
          homeRow.ties++;
          awayRow.ties++;
          homeRow.results += 'T';
          awayRow.results += 'T';
        } else if (homeScore > awayScore) {
          homeRow.wins++;
          awayRow.losses++;
          homeRow.results += 'W';
          awayRow.results += 'L';
        } else {
          awayRow.wins++;
          homeRow.losses++;
          awayRow.results += 'W';
          homeRow.results += 'L';
        }
      }
    }

    return table;
  }

  /**
   * The seeding, from the finished regular season.
   *
   * Wins, then points for — this league's own order, and the one Sleeper's
   * standings imply. Ties in both are broken by roster id so the rehearsal is
   * reproducible; a real league would not, and the rehearsal never claims that
   * ordering is the league's tiebreak rule.
   */
  function seedOrder(form: RehearsalShape): readonly number[] {
    const table = regularRecords(form.lastRegularWeek, form);
    return [...table.entries()]
      .sort(
        ([leftId, left], [rightId, right]) =>
          right.wins - left.wins ||
          right.pointsForCents - left.pointsForCents ||
          leftId - rightId,
      )
      .map(([rosterId]) => rosterId);
  }

  /** Every pairing in a week — regular fixtures, or the bracket's games. */
  function pairings(week: number, form: RehearsalShape): readonly [number, number][] {
    if (week <= form.lastRegularWeek) return regularPairings(week, form.totalRosters);

    const resolved = resolveBrackets(form, week - 1);
    const out: [number, number][] = [];
    for (const match of [...resolved.winners, ...resolved.losers]) {
      if (match.week !== week) continue;
      if (match.team1 === null || match.team2 === null) continue;
      out.push(match.team1 < match.team2 ? [match.team1, match.team2] : [match.team2, match.team1]);
    }
    return out;
  }

  /**
   * The brackets as they stand once `through` weeks have been played.
   *
   * Round N's participants are only known once round N−1 is in, which is the
   * whole reason this is a fold rather than a lookup: a bracket read on the
   * Tuesday of week 16 knows who is in the final and a bracket read on the
   * Tuesday of week 15 does not.
   */
  function resolveBrackets(
    form: RehearsalShape,
    through: number,
  ): {
    readonly winners: readonly RehearsalMatch[];
    readonly losers: readonly RehearsalMatch[];
    readonly winnersResults: Map<number, { winner: number; loser: number }>;
    readonly losersResults: Map<number, { winner: number; loser: number }>;
  } {
    const drawn = drawBrackets(seedOrder(form), form);
    const winners = drawn.winners.map((match) => ({ ...match }));
    const losers = drawn.losers.map((match) => ({ ...match }));
    const winnersResults = new Map<number, { winner: number; loser: number }>();
    const losersResults = new Map<number, { winner: number; loser: number }>();

    const decide = (match: RehearsalMatch): { winner: number; loser: number } | null => {
      if (match.team1 === null || match.team2 === null) return null;
      if (match.week > through) return null;
      const one = score(match.week, match.team1);
      const two = score(match.week, match.team2);
      if (one === two) return null;
      return one > two
        ? { winner: match.team1, loser: match.team2 }
        : { winner: match.team2, loser: match.team1 };
    };

    for (let round = 1; round <= form.playoffRounds; round++) {
      for (const match of winners) {
        if (match.round !== round) continue;
        const result = decide(match);
        if (result !== null) winnersResults.set(match.matchId, result);
      }
      for (const match of losers) {
        if (match.round !== round) continue;
        const result = decide(match);
        if (result !== null) losersResults.set(match.matchId, result);
      }

      // Feed the next round from what this one produced.
      if (round === 1) {
        const one = winnersResults.get(1);
        const two = winnersResults.get(2);
        if (one !== undefined) winners[2] = { ...winners[2]!, team2: one.winner };
        if (two !== undefined) winners[3] = { ...winners[3]!, team2: two.winner };
        if (one !== undefined && two !== undefined) {
          winners[4] = { ...winners[4]!, team1: one.loser, team2: two.loser };
        }

        const lowOne = losersResults.get(1);
        const lowTwo = losersResults.get(2);
        if (lowOne !== undefined && lowTwo !== undefined) {
          losers[2] = { ...losers[2]!, team1: lowOne.winner, team2: lowTwo.winner };
          losers[3] = { ...losers[3]!, team1: lowOne.loser, team2: lowTwo.loser };
        }
      }

      if (round === 2) {
        const three = winnersResults.get(3);
        const four = winnersResults.get(4);
        if (three !== undefined && four !== undefined) {
          winners[5] = { ...winners[5]!, team1: three.winner, team2: four.winner };
          winners[6] = { ...winners[6]!, team1: three.loser, team2: four.loser };
        }
      }
    }

    return { winners, losers, winnersResults, losersResults };
  }

  function serialise(
    matches: readonly RehearsalMatch[],
    results: ReadonlyMap<number, { winner: number; loser: number }>,
  ): SerialisedMatch[] {
    return matches.map((match) => {
      const result = results.get(match.matchId);
      return {
        r: match.round,
        m: match.matchId,
        t1: match.team1,
        t2: match.team2,
        w: result?.winner ?? null,
        l: result?.loser ?? null,
        p: match.placement,
      };
    });
  }

  function matchupRows(week: number, form: RehearsalShape): unknown[] {
    const rows: unknown[] = [];
    const paired = new Set<number>();

    pairings(week, form).forEach(([home, away], index) => {
      const matchupId = index + 1;
      paired.add(home);
      paired.add(away);
      for (const rosterId of [home, away]) {
        rows.push({
          roster_id: rosterId,
          matchup_id: matchupId,
          points: score(week, rosterId) / 100,
          custom_points: null,
          starters: [],
          players: [],
        });
      }
    });

    /*
     * Everybody else still scores, and that is not a quirk to be tidied away.
     *
     * `lib/sleeper/weeks.ts` opens with it: Sleeper keeps reporting points for
     * a roster whose season is over, and reading those as results is how the
     * league's lowest score ever becomes a fabrication. A rehearsal that
     * omitted the unpaired rows would rehearse a Sleeper that does not exist
     * and would silently stop testing the guard.
     */
    for (let rosterId = 1; rosterId <= form.totalRosters; rosterId++) {
      if (paired.has(rosterId)) continue;
      rows.push({
        roster_id: rosterId,
        matchup_id: null,
        points: score(week, rosterId) / 100,
        custom_points: null,
        starters: [],
        players: [],
      });
    }

    return rows.sort(
      (left, right) =>
        (left as { roster_id: number }).roster_id - (right as { roster_id: number }).roster_id,
    );
  }

  const source: RehearsalSource = {
    label: `rehearsal(week ${String(options.played)})`,
    requests,

    // Populated on first use; every accessor below drives `fetch` first in
    // practice, and the tests read them after a sync.
    get shape(): RehearsalShape {
      if (cachedShape === null) {
        throw new Error('The rehearsal shape is unavailable until the league has been read.');
      }
      return cachedShape;
    },
    get seeds(): readonly number[] {
      return seedOrder(source.shape);
    },
    get brackets(): RehearsalBrackets {
      return drawBrackets(source.seeds, source.shape);
    },
    get winnersResults(): ReadonlyMap<number, { winner: number; loser: number }> {
      return resolveBrackets(source.shape, options.bracketPlayedThrough ?? options.played)
        .winnersResults;
    },
    get losersResults(): ReadonlyMap<number, { winner: number; loser: number }> {
      return resolveBrackets(source.shape, options.bracketPlayedThrough ?? options.played)
        .losersResults;
    },

    pairingsFor(week: number): readonly [number, number][] {
      return pairings(week, source.shape);
    },

    scoreFor(week: number, rosterId: number): number {
      return score(week, rosterId);
    },

    async fetch(endpoint: SleeperEndpoint): Promise<SleeperFetchResult> {
      requests.push(endpoint);

      if (endpoint.kind !== 'state' && endpoint.leagueId !== REHEARSAL_LEAGUE) {
        // An earlier season in the chain. Recorded history, untouched.
        return { ...(await underlying.fetch(endpoint)), fetchedAt: capturedAt };
      }

      const form = await shape();

      if (endpoint.kind === 'league') {
        const raw = await league();
        const settings = (raw['settings'] ?? {}) as Record<string, unknown>;
        return {
          kind: 'ok',
          endpoint,
          status: 200,
          fetchedAt: capturedAt,
          payload: {
            ...raw,
            status: options.played >= form.lastWeek ? 'complete' : 'in_season',
            settings: {
              ...settings,
              leg: Math.max(1, options.played),
              // Sleeper's own record of the last week it scored. Absent before
              // week one, which is what the recorded preseason payload shows.
              ...(options.played > 0 ? { last_scored_leg: options.played } : {}),
            },
          },
        };
      }

      if (endpoint.kind === 'matchups') {
        return {
          kind: 'ok',
          endpoint,
          status: 200,
          fetchedAt: capturedAt,
          payload: endpoint.week <= options.played ? matchupRows(endpoint.week, form) : [],
        };
      }

      if (endpoint.kind === 'winners_bracket' || endpoint.kind === 'losers_bracket') {
        const through = options.bracketPlayedThrough ?? options.played;
        const resolved = resolveBrackets(form, through);
        return {
          kind: 'ok',
          endpoint,
          status: 200,
          fetchedAt: capturedAt,
          payload:
            endpoint.kind === 'winners_bracket'
              ? serialise(resolved.winners, resolved.winnersResults)
              : serialise(resolved.losers, resolved.losersResults),
        };
      }

      const result = await underlying.fetch(endpoint);

      if (endpoint.kind === 'rosters' && result.kind === 'ok') {
        const through = options.standingsPlayedThrough ?? options.played;
        const table = regularRecords(through, form);
        const rows = result.payload as { roster_id: number; settings: Record<string, unknown>; metadata: unknown }[];

        return {
          ...result,
          fetchedAt: capturedAt,
          payload: rows.map((row) => {
            const record = table.get(row.roster_id);
            const pointsFor = (record?.pointsForCents ?? 0) / 100;
            const pointsAgainst = (record?.pointsAgainstCents ?? 0) / 100;
            const metadata =
              typeof row.metadata === 'object' && row.metadata !== null
                ? (row.metadata as Record<string, unknown>)
                : {};

            return {
              ...row,
              metadata: { ...metadata, record: record?.results ?? '' },
              settings: {
                ...row.settings,
                wins: record?.wins ?? 0,
                losses: record?.losses ?? 0,
                ties: record?.ties ?? 0,
                fpts: Math.trunc(pointsFor),
                fpts_decimal: Math.round((pointsFor % 1) * 100),
                fpts_against: Math.trunc(pointsAgainst),
                fpts_against_decimal: Math.round((pointsAgainst % 1) * 100),
              },
            };
          }),
        };
      }

      return { ...result, fetchedAt: capturedAt };
    },
  };

  return source;
}
