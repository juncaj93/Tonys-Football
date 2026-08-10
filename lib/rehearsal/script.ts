import { type SleeperEndpoint } from '@/lib/sleeper/endpoints';
import { createFixtureSource } from '@/lib/sleeper/fixtures';
import { type SleeperFetchResult, type SleeperSource } from '@/lib/sleeper/transport';

/**
 * A written season — the input half of the lifecycle rehearsal harness.
 *
 * ## What this is for
 *
 * Every piece of the Sunday-to-Tuesday chain is separately tested. What is not
 * testable from the pieces is the **week as one event**: a Sunday photograph and
 * a Tuesday close that have to agree with each other, a reward that has to come
 * out of the same five games the paper prints, and a second run of the whole
 * thing that has to move nothing. Answering *"would the first real week of 2026
 * survive?"* needs a season somebody can write down, week by week, and then push
 * through the real code.
 *
 * `lib/sleeper/test-source.ts` was the first version of this idea and remains
 * correct for what it does — but its scores come out of a formula
 * (`120 - rosterId * 3 + week`), so every game is a comfortable win by the lower
 * roster id and no week has a close game, a blowout, a tie, or a notable score
 * in it. A rehearsal wants to *name* the outcomes, because the outcomes are what
 * the assertions are about.
 *
 * So this generalises it: the scores are data.
 *
 * ## It is a recording everywhere it can be
 *
 * League, users, rosters and both brackets come from the **real** recorded
 * fixtures, so managers, Sleeper user ids, roster ids and the name mapping
 * behave exactly as they do in production. Only the two payloads a played week
 * actually changes are synthesised: the week's matchups, and the standings those
 * matchups imply.
 *
 * The standings are **computed from the same script**, never stated separately.
 * `reconcileSeason` compares a season's official record against the sum of its
 * weeks and marks the disagreements `disputed`; a hand-written record that
 * disagreed with its own games would suppress every game in the rehearsal and
 * read exactly like a product defect.
 *
 * ## Two phases, because the week has two readings
 *
 * `16 §4.3` sanctions exactly two reads of Sleeper: the Sunday photograph before
 * Monday night, and the Tuesday close after the week is over. Those are two
 * different score lines for the same games, and the difference between them is
 * the *only* thing that makes a Monday comeback sayable (`07 §8`). So a scripted
 * game carries both, and the source is asked which one it is serving.
 *
 * ## No fabricated football
 *
 * These numbers are **test data and are never presented as league fact**. They
 * exist only inside the rehearsal, against a throwaway database, and no
 * rehearsal fixture is reachable from any production surface — the same standing
 * that `lib/sleeper/test-source.ts` holds.
 */

/** One game, at both of the two moments the product is allowed to look. */
export interface ScriptedGame {
  /** Sleeper's own pairing id. Two rows sharing it are a game. */
  readonly matchupId: number;
  readonly rosters: readonly [number, number];
  /** The score before Monday night — what the Sunday job photographs. */
  readonly preMonday: readonly [number, number];
  /** The score the week finished on — what the Tuesday job closes. */
  readonly final: readonly [number, number];
}

export interface ScriptedWeek {
  readonly week: number;
  readonly games: readonly ScriptedGame[];
  /**
   * A postseason week, which the **official record does not count**.
   *
   * `settings.fpts` and the W/L on a Sleeper roster are regular-season totals —
   * verified to the cent against weeks 1–14 of both recorded seasons — and
   * `reconcileSeason` compares them against the sum of the weeks. A playoff week
   * folded into that sum manufactures a disagreement on every roster in the
   * league, which then marks real games `disputed`. So the standings this source
   * computes skip it, exactly as Sleeper's do.
   *
   * It says nothing about `week_type` in the database: that is derived at import
   * from the league's own `playoff_week_start` (`lib/sleeper/weeks.ts`), and a
   * script that contradicted it would be scripting the answer.
   */
  readonly postseason?: boolean;
  /**
   * Rosters that score but play nobody — `[rosterId, points]`.
   *
   * **Not an omission to be tidied away.** `lib/sleeper/weeks.ts` opens with it:
   * Sleeper keeps reporting points for a roster whose week is over, and reading
   * those as results is how the league's lowest score ever becomes a
   * fabrication. It happens in exactly two shapes — a **bye** in the first
   * playoff week, and an **eliminated** roster still accruing NFL scoring
   * beside the real games — and both are states the product has to classify
   * rather than states it can arrange never to see.
   *
   * Written out per week rather than derived from "everybody not in a game",
   * because the score is the point: `explainUnpaired` has to tell a bye from an
   * elimination, and a rehearsal that supplied neither could not exercise
   * either.
   */
  readonly unpaired?: readonly (readonly [number, number])[];
}

/**
 * One bracket game, and what has become of it.
 *
 * Deliberately close to Sleeper's own shape rather than an idealised one,
 * because the shape is the trap. `placement` is **bracket-relative** — `p=1` in
 * the winners bracket is the championship and `p=1` in the losers bracket is
 * seventh in a ten-team league — and `lib/sleeper/placements.ts` exists because
 * reading one as the other reports the seventh-place finisher as the champion.
 */
export interface ScriptedBracketMatch {
  readonly round: number;
  readonly matchId: number;
  /** The week this round is played. Decides when a result becomes visible. */
  readonly week: number;
  readonly team1: ScriptedSlot;
  readonly team2: ScriptedSlot;
  /** The league position this game settles, bracket-relative. */
  readonly placement?: number;
  /** Who won it. Served only once `played` has reached this match's week. */
  readonly winner?: number;
}

/**
 * One side of a bracket game: a roster from the draw, or whoever comes out of
 * an earlier match.
 *
 * The distinction is the one Sleeper itself draws and the reason a preseason
 * bracket is not empty. `t1_from: { w: 1 }` — *"the winner of match 1"* — is
 * served as `null` until match 1 has been played, while a slot filled by the
 * **draw** carries its roster id from the moment the bracket exists. The
 * recorded 2026 bracket is exactly this shape: four first-round rosters and two
 * byes named in the preseason, every later slot null.
 *
 * Modelling it as a union rather than as `number | null` plus a visibility rule
 * means a scenario cannot accidentally publish a semifinalist before the
 * quarter-final: what is knowable is a property of the slot, not of the author's
 * care.
 */
export type ScriptedSlot =
  /** Filled by the draw. Visible from the moment the bracket is published. */
  | number
  /** Filled by a result. Null until that match has been played. */
  | { readonly fromMatch: number; readonly take: 'winner' | 'loser' };

/**
 * A written postseason.
 *
 * Optional, and its absence is the ordinary case: a regular-season scenario
 * wants the recorded preseason brackets passed straight through, which is what
 * every rehearsal before this one relied on.
 *
 * Where it *is* supplied, the source serves both endpoints from it and filters
 * by how far the season has been played — a bracket read on the Tuesday of the
 * semifinal knows who is in the final and one read a week earlier does not.
 * That progression is the whole reason this exists: `made_playoffs` and
 * `final_rank` are written at import from the bracket, so a scenario that cannot
 * move the bracket cannot rehearse a placement being settled.
 */
export interface ScriptedBrackets {
  readonly winners: readonly ScriptedBracketMatch[];
  readonly losers: readonly ScriptedBracketMatch[];
}

export interface SeasonScript {
  readonly year: number;
  readonly leagueId: string;
  readonly weeks: readonly ScriptedWeek[];
  /** The postseason, when the scenario has one. See {@link ScriptedBrackets}. */
  readonly brackets?: ScriptedBrackets;
}

/**
 * Which reading this source is serving.
 *
 * `pre-monday` and `final` are the two `16 §4.3` sanctions. `scheduled` is the
 * third thing the live API genuinely returns and the one nothing else can stage:
 * from the moment a league drafts, Sleeper answers a *future* week with ordinary
 * matchup rows at `0` on both sides. Nothing in the payload says *"not yet"* —
 * there is no kickoff time and no status field — so a rehearsal of that state has
 * to be able to produce it.
 */
export type ScriptedPhase = 'pre-monday' | 'final' | 'scheduled';

/**
 * A deliberate upstream defect.
 *
 * Every one of these is a state the live API can genuinely produce, and each is
 * injected at the boundary that owns it rather than by stubbing an internal
 * function — a failure rehearsal that mocks the thing it is testing proves the
 * mock.
 */
export type ScriptedFault =
  /** Sleeper cannot be reached at all. The transport throws. */
  | { readonly kind: 'unreachable' }
  /** Sleeper answers, but the payload is not what it should be. */
  | { readonly kind: 'malformed-matchups'; readonly week: number }
  /**
   * A roster owned by a Sleeper account this league has never seen — the shape
   * a retired manager's seat takes when it is handed to somebody new, or a
   * roster whose owner deleted their account.
   */
  | { readonly kind: 'unknown-owner'; readonly rosters: readonly number[] };

export interface ScriptedSourceOptions {
  readonly script: SeasonScript;
  /**
   * How many weeks the upstream will admit to.
   *
   * Beyond this, matchups answer `[]` — which is what the live API does for a
   * week that has not happened, and what keeps a read from running ahead of the
   * season.
   */
  readonly played: number;
  /** Defaults to `final`. The Sunday job asks for `pre-monday`. */
  readonly phase?: ScriptedPhase;
  /**
   * What `/state/nfl` reports as the week in progress. Defaults to `played`.
   *
   * The Sunday job resolves its week from here rather than from the database,
   * because *"which week is being played right now"* has exactly one authority
   * and it is upstream. `0` is the recorded preseason value and is a legitimate
   * answer — it is what the fixtures hold today, and the job declines on it.
   */
  readonly currentWeek?: number;
  /**
   * When this read happened.
   *
   * `persistChain` compares it against `seasons.snapshot_captured_at` and
   * refuses a capture older than the stored one, so this is the knob a stale-read
   * rehearsal turns.
   */
  readonly capturedAt: Date;
  readonly fault?: ScriptedFault;
}

export type ScriptedSource = SleeperSource & {
  /** Every endpoint asked for, in order. The request budget, observable. */
  readonly requests: readonly SleeperEndpoint[];
};

/** The scores this phase exposes for one game. */
function scoresOf(game: ScriptedGame, phase: ScriptedPhase): readonly [number, number] {
  if (phase === 'scheduled') return [0, 0];
  return phase === 'pre-monday' ? game.preMonday : game.final;
}

/** One week of the script, or undefined when it was never written. */
function weekOf(script: SeasonScript, week: number): ScriptedWeek | undefined {
  return script.weeks.find((candidate) => candidate.week === week);
}

/**
 * A Sleeper serving one written season.
 *
 * Deterministic in every respect: same options in, byte-identical payloads out.
 * Nothing here reads a clock, a random number, or the network.
 */
export function scriptedSeason(options: ScriptedSourceOptions): ScriptedSource {
  const underlying = createFixtureSource();
  const requests: SleeperEndpoint[] = [];
  const phase = options.phase ?? 'final';
  const { script, capturedAt } = options;

  function matchupRows(week: number): unknown[] {
    const scripted = weekOf(script, week);
    if (scripted === undefined) return [];

    const rows = scripted.games.flatMap((game) => {
      const points = scoresOf(game, phase);
      return game.rosters.map((rosterId, side) => ({
        roster_id: rosterId,
        matchup_id: game.matchupId,
        points: points[side],
        custom_points: null,
        starters: [],
        players: [],
      }));
    });

    /*
     * The rosters with a score and no game. See `ScriptedWeek.unpaired`.
     *
     * A scheduled week has none by construction: the state being staged is
     * *"Sleeper published the fixtures"*, and it publishes them at zero for
     * everybody who has one rather than inventing a bye.
     */
    if (phase !== 'scheduled') {
      for (const [rosterId, points] of scripted.unpaired ?? []) {
        rows.push({
          roster_id: rosterId,
          matchup_id: null as unknown as number,
          points,
          custom_points: null,
          starters: [],
          players: [],
        });
      }
    }

    return rows.sort((left, right) => left.roster_id - right.roster_id);
  }

  /**
   * The record Sleeper would report, derived from the same games.
   *
   * A tie is counted as a tie rather than folded into either column, because
   * `reconcileSeason` compares all three and the league's rules produce ties.
   */
  function standingsAfter(played: number): Map<
    number,
    { wins: number; losses: number; ties: number; pointsFor: number }
  > {
    const table = new Map<
      number,
      { wins: number; losses: number; ties: number; pointsFor: number }
    >();
    const seat = (rosterId: number): { wins: number; losses: number; ties: number; pointsFor: number } => {
      const existing = table.get(rosterId);
      if (existing !== undefined) return existing;
      const fresh = { wins: 0, losses: 0, ties: 0, pointsFor: 0 };
      table.set(rosterId, fresh);
      return fresh;
    };

    for (const scripted of script.weeks) {
      if (scripted.week > played) continue;
      // The official record is the regular season's. See `ScriptedWeek.postseason`.
      if (scripted.postseason === true) continue;
      for (const game of scripted.games) {
        const points = scoresOf(game, phase);
        const [a, b] = game.rosters;
        const rowA = seat(a);
        const rowB = seat(b);
        rowA.pointsFor += points[0];
        rowB.pointsFor += points[1];
        if (points[0] > points[1]) {
          rowA.wins += 1;
          rowB.losses += 1;
        } else if (points[1] > points[0]) {
          rowB.wins += 1;
          rowA.losses += 1;
        } else {
          rowA.ties += 1;
          rowB.ties += 1;
        }
      }
    }

    return table;
  }

  const fault = options.fault;

  /**
   * A scripted bracket as Sleeper serialises it, at this point in the season.
   *
   * A match's result is withheld until `played` reaches its week, and its
   * participants with it — which is what makes the two brackets a *progression*
   * rather than a fixture. `l` is derived from the pairing rather than written
   * down, because a loser that disagreed with its own match would be a fixture
   * defect that reads as a placement defect.
   */
  function bracketRows(matches: readonly ScriptedBracketMatch[]): unknown[] {
    const decidedIn = (match: ScriptedBracketMatch): boolean =>
      match.winner !== undefined && match.week <= options.played;

    /** A slot's roster id, or null while whatever fills it has not happened. */
    function resolve(slot: ScriptedSlot): number | null {
      if (typeof slot === 'number') return slot;

      const feeder = matches.find((match) => match.matchId === slot.fromMatch);
      if (feeder === undefined || !decidedIn(feeder)) return null;

      const winner = feeder.winner!;
      if (slot.take === 'winner') return winner;

      const one = resolve(feeder.team1);
      const two = resolve(feeder.team2);
      return one === winner ? two : one;
    }

    return matches.map((match) => {
      const one = resolve(match.team1);
      const two = resolve(match.team2);
      const decided = decidedIn(match);

      // The loser follows from the pairing rather than being written down: a
      // loser that disagreed with its own match would be a fixture defect that
      // reads as a placement defect.
      const loser =
        decided && one !== null && two !== null ? (match.winner === one ? two : one) : null;

      return {
        r: match.round,
        m: match.matchId,
        t1: one,
        t2: two,
        w: decided ? match.winner : null,
        l: loser,
        p: match.placement ?? null,
      };
    });
  }

  return {
    label: `scripted(${String(script.year)} through week ${String(options.played)}, ${phase})`,
    requests,

    async fetch(endpoint: SleeperEndpoint): Promise<SleeperFetchResult> {
      requests.push(endpoint);

      if (fault?.kind === 'unreachable') {
        /*
         * The transport's own failure mode, not a returned error value.
         * `importSeason` throws only when the *league* payload cannot be read,
         * and `syncSeason` turns that into a refusal — which is the behaviour
         * being rehearsed.
         */
        throw new Error('socket hang up');
      }

      if (endpoint.kind === 'matchups' && endpoint.leagueId === script.leagueId) {
        if (fault?.kind === 'malformed-matchups' && fault.week === endpoint.week) {
          /*
           * Answered, and wrong. Three shapes at once, all of which the decoder
           * is written to survive: a row that is not an object, a row with no
           * `roster_id`, and a row with no `points` at all.
           */
          return {
            kind: 'ok',
            endpoint,
            payload: [
              'not an object',
              { matchup_id: 1, points: 101.5 },
              { roster_id: 3, matchup_id: 2 },
            ],
            status: 200,
            fetchedAt: capturedAt,
          };
        }

        return {
          kind: 'ok',
          endpoint,
          payload: endpoint.week <= options.played ? matchupRows(endpoint.week) : [],
          status: 200,
          fetchedAt: capturedAt,
        };
      }

      if (
        script.brackets !== undefined &&
        (endpoint.kind === 'winners_bracket' || endpoint.kind === 'losers_bracket') &&
        endpoint.leagueId === script.leagueId
      ) {
        return {
          kind: 'ok',
          endpoint,
          payload: bracketRows(
            endpoint.kind === 'winners_bracket'
              ? script.brackets.winners
              : script.brackets.losers,
          ),
          status: 200,
          fetchedAt: capturedAt,
        };
      }

      const result = await underlying.fetch(endpoint);

      if (endpoint.kind === 'state' && result.kind === 'ok') {
        /*
         * The recorded state is July's, and says `week: 0`. Restating it as the
         * week in progress is the whole of what a live September read changes,
         * and it is what the Sunday job resolves its week from.
         */
        const week = options.currentWeek ?? options.played;
        return {
          ...result,
          fetchedAt: capturedAt,
          payload: {
            ...(result.payload as Record<string, unknown>),
            week,
            leg: week,
            display_week: Math.max(1, week),
            season_type: week > 0 ? 'regular' : 'pre',
          },
        };
      }

      if (
        endpoint.kind === 'rosters' &&
        endpoint.leagueId === script.leagueId &&
        result.kind === 'ok'
      ) {
        const rows = result.payload as {
          roster_id: number;
          owner_id: string | null;
          settings: Record<string, unknown>;
        }[];
        const table = standingsAfter(options.played);

        return {
          ...result,
          fetchedAt: capturedAt,
          payload: rows.map((row) => {
            const record = table.get(row.roster_id) ?? {
              wins: 0,
              losses: 0,
              ties: 0,
              pointsFor: 0,
            };
            const rounded = Math.round(record.pointsFor * 100) / 100;
            const owned =
              fault?.kind === 'unknown-owner' && fault.rosters.includes(row.roster_id)
                ? // A Sleeper account this league has never had. Deliberately
                  // well-formed: the point is that it resolves to nobody, not
                  // that it fails to parse.
                  { ...row, owner_id: '999999999999999999', co_owners: null }
                : row;

            return {
              ...owned,
              settings: {
                ...row.settings,
                wins: record.wins,
                losses: record.losses,
                ties: record.ties,
                fpts: Math.trunc(rounded),
                fpts_decimal: Math.round((rounded % 1) * 100),
              },
            };
          }),
        };
      }

      // Everything else passes through, restamped so one capture time governs
      // the whole read — which is what `persistChain`'s staleness guard reads.
      return { ...result, fetchedAt: capturedAt };
    },
  };
}
