import { type StandingRow } from './standings';

/**
 * Which game of a week matters most — deterministically, or not at all.
 *
 * Commissioner ruling, 2026-08-10. The homepage board's detail slot correctly
 * went blank in season once stale prior-season matchups were excluded
 * (`docs/WEEK8_REHEARSAL.md §4.2`), and this is what may fill it: a
 * **current-season** matchup that is important according to *verified standings
 * context*.
 *
 * ## What it is allowed to know, and what it is not
 *
 * Everything below is an order statistic over stored, finalized games. There is
 * no projection, no model, no rivalry list, no narrative, and no clock. The same
 * inputs produce the same answer on every machine, which is what lets a manager
 * check it: wins and points-for are the two columns the standings already print.
 *
 * The ruling names five permitted inputs. Three are used and two are not, and
 * the two absences are decisions rather than omissions:
 *
 * | Input | Used | Why |
 * |---|---|---|
 * | Combined wins | **yes** | The primary key. The biggest game of a week is the one between the two best records |
 * | Standings proximity | **yes** | Separates 1st-v-2nd from 1st-v-10th when the win totals happen to match |
 * | Combined points for | **yes** | The league's own tiebreak (`lib/stats/standings.ts`), reused rather than reinvented |
 * | Playoff-position proximity | **no** | *"Where legitimately derivable"* — and mid-season it is not. The field is derived from the winners bracket, which has no decided game until January; `lib/sleeper/placements.ts` reports exactly that. A seed line guessed from a table is an invented rule |
 * | Head-to-head | **no** | Computed and carried as {@link FeaturedMatchup.priorMeetings} evidence, but not scored. This league plays a complete round robin in nine weeks, so it is zero for most of a season, and a key that is almost always constant is a key that mostly does not exist |
 *
 * ## It refuses rather than fabricates
 *
 * *"The selector should return no matchup rather than fabricate importance when
 * the data cannot support a meaningful distinction."* Three refusals implement
 * that, and the third is the load-bearing one:
 *
 *   - **`not-enough-history`** — below {@link MIN_BASIS_WEEKS} finalized weeks
 *     there is no standings context to be important *relative to*. After one
 *     week every team is 1–0 or 0–1 and "combined wins" is a coin toss wearing a
 *     number.
 *   - **`roster-unresolved`** — every candidate names somebody who may not be
 *     published, so there is no game left to feature.
 *   - **`no-clear-favourite`** — the best candidate does not **strictly** beat
 *     the second on the football keys. Roster id makes the sort total so the
 *     output is stable, and it is *never* allowed to decide which game is
 *     featured: two games that are genuinely indistinguishable get no winner,
 *     because picking one would be importance invented by a tiebreak.
 *
 * ## Naming
 *
 * The board renders two names and nothing else, so no claim travels with this.
 * That is deliberate and the ruling is explicit about it: nothing here may be
 * called *must-win*, *win-and-in* or an *elimination game*, because none of
 * those is provable from a table without the remaining schedule, and this module
 * has no schedule. **Featured matchup** is the whole claim.
 */

/** One pairing a week is offering, before anything is known about who is in it. */
export interface MatchupCandidate {
  readonly sleeperMatchupId: number;
  readonly rosterAId: number;
  readonly rosterBId: number;
}

/** Why no matchup was featured. Each is a real state, never an error. */
export type ImportanceRefusal =
  /** The week offered no pairing at all. */
  | 'no-candidates'
  /** Too few finalized weeks for a standing to mean anything yet. */
  | 'not-enough-history'
  /** Every candidate names a seat that cannot be resolved or published. */
  | 'roster-unresolved'
  /** Two games are indistinguishable on the football keys. */
  | 'no-clear-favourite';

export interface FeaturedMatchup {
  readonly season: number;
  readonly week: number;
  readonly sleeperMatchupId: number;

  readonly aRosterId: number;
  readonly aManagerId: string;
  readonly aDisplayName: string;
  /** Where A sat in the table going into the week. 1 is first. */
  readonly aRank: number;
  readonly bRosterId: number;
  readonly bManagerId: string;
  readonly bDisplayName: string;
  readonly bRank: number;

  /** Wins the two carry into the week, added. The primary key. */
  readonly combinedWins: number;
  /** How far apart they sit in the table. Zero means level. */
  readonly rankGap: number;
  /** The better of the two ranks, 1 being first. */
  readonly bestRank: number;
  /** Both points-for totals, added, in integer cents. */
  readonly combinedPointsForCents: number;
  /** Times these two have already met this season. Evidence, never scored. */
  readonly priorMeetings: number;
  /** Weeks of finalized football the standings above were built from. */
  readonly basisWeeks: number;
  /** Everything a reader would need to check the choice themselves. */
  readonly evidence: readonly string[];
}

export type ImportanceResult =
  | { readonly selected: true; readonly matchup: FeaturedMatchup }
  | { readonly selected: false; readonly reason: ImportanceRefusal };

/**
 * Finalized weeks required before a standing is worth comparing.
 *
 * Two. After one week the table is five teams at 1–0 and five at 0–1, so
 * "combined wins" takes one of exactly three values and the proximity key is
 * noise — a distinction the data does not support, which is the thing this
 * module is meant to refuse rather than dress up.
 */
export const MIN_BASIS_WEEKS = 2;

interface Scored {
  readonly candidate: MatchupCandidate;
  readonly a: StandingRow;
  readonly b: StandingRow;
  readonly combinedWins: number;
  readonly rankGap: number;
  readonly combinedPointsForCents: number;
}

/** The football keys, in order. Roster id is deliberately not among them. */
function compare(x: Scored, y: Scored): number {
  return (
    y.combinedWins - x.combinedWins ||
    x.rankGap - y.rankGap ||
    y.combinedPointsForCents - x.combinedPointsForCents
  );
}

/**
 * Rank a week's pairings. Pure.
 *
 * Split from the database read for the reason every derivation in `lib/stats/`
 * is: a frozen fixture drives the **same** arithmetic production does, so a
 * rehearsal is evidence rather than a parallel implementation of the rule.
 */
export function rankMatchups(input: {
  readonly season: number;
  readonly week: number;
  readonly candidates: readonly MatchupCandidate[];
  /** The table through the last finalized week before {@link week}. */
  readonly standings: readonly StandingRow[];
  /** How many finalized weeks produced those standings. */
  readonly basisWeeks: number;
  /** Managers a published claim may name (`lib/league/membership.ts`). */
  readonly eligible: ReadonlySet<string>;
  /** Prior meetings this season, keyed `min-max` roster id. Evidence only. */
  readonly priorMeetings?: ReadonlyMap<string, number>;
}): ImportanceResult {
  if (input.candidates.length === 0) return { selected: false, reason: 'no-candidates' };
  if (input.basisWeeks < MIN_BASIS_WEEKS) {
    return { selected: false, reason: 'not-enough-history' };
  }

  const byRoster = new Map(input.standings.map((row) => [row.rosterId, row]));

  const scored: Scored[] = [];
  for (const candidate of input.candidates) {
    const a = byRoster.get(candidate.rosterAId);
    const b = byRoster.get(candidate.rosterBId);
    if (a === undefined || b === undefined) continue;
    // The publication boundary, applied **before** ranking rather than after.
    // `lib/stats/week.ts` records why: a filter that removes a candidate after
    // selection changes which one wins.
    if (a.managerId === null || b.managerId === null) continue;
    if (!input.eligible.has(a.managerId) || !input.eligible.has(b.managerId)) continue;

    scored.push({
      candidate,
      a,
      b,
      combinedWins: a.wins + b.wins,
      rankGap: Math.abs(a.rank - b.rank),
      combinedPointsForCents: a.pointsForCents + b.pointsForCents,
    });
  }

  if (scored.length === 0) return { selected: false, reason: 'roster-unresolved' };

  /*
   * Sorted on the football keys, then on roster id so the order is total.
   *
   * The roster-id term makes the *sort* stable — without it, two equal entries
   * could come back in query order and the answer would depend on the database.
   * It is not allowed to select: the strictness check below runs on `compare`
   * alone, which does not consider it.
   */
  const ordered = [...scored].sort(
    (x, y) =>
      compare(x, y) ||
      Math.min(x.a.rosterId, x.b.rosterId) - Math.min(y.a.rosterId, y.b.rosterId),
  );

  const best = ordered[0]!;
  const runnerUp = ordered[1];
  if (runnerUp !== undefined && compare(best, runnerUp) === 0) {
    return { selected: false, reason: 'no-clear-favourite' };
  }

  const key = pairKey(best.a.rosterId, best.b.rosterId);
  const priorMeetings = input.priorMeetings?.get(key) ?? 0;

  /*
   * Stated in the order the keys are applied, so "why this game" is answerable
   * without re-running anything. Never rendered to a manager — the face gets two
   * names, and this is for the commissioner and for the tests.
   */
  const evidence = [
    `combined record ${String(best.a.wins + best.b.wins)}–${String(best.a.losses + best.b.losses)} ` +
      `through week ${String(input.week - 1)}`,
    `${best.a.displayName ?? '?'} ${String(best.a.wins)}–${String(best.a.losses)} (rank ${String(best.a.rank)}) v ` +
      `${best.b.displayName ?? '?'} ${String(best.b.wins)}–${String(best.b.losses)} (rank ${String(best.b.rank)})`,
    `ranks ${String(best.rankGap)} apart`,
    `combined points for ${(best.combinedPointsForCents / 100).toFixed(2)}`,
    `standings from ${String(input.basisWeeks)} finalized week${input.basisWeeks === 1 ? '' : 's'}`,
    ...(runnerUp === undefined
      ? ['the only publishable game of the week']
      : [
          `next best: combined wins ${String(runnerUp.combinedWins)}, ranks ` +
            `${String(runnerUp.rankGap)} apart`,
        ]),
    ...(priorMeetings > 0
      ? [`met ${String(priorMeetings)} time${priorMeetings === 1 ? '' : 's'} already this season`]
      : []),
  ];

  return {
    selected: true,
    matchup: {
      season: input.season,
      week: input.week,
      sleeperMatchupId: best.candidate.sleeperMatchupId,
      aRosterId: best.a.rosterId,
      aManagerId: best.a.managerId!,
      aDisplayName: best.a.displayName ?? '',
      aRank: best.a.rank,
      bRosterId: best.b.rosterId,
      bManagerId: best.b.managerId!,
      bDisplayName: best.b.displayName ?? '',
      bRank: best.b.rank,
      combinedWins: best.combinedWins,
      rankGap: best.rankGap,
      bestRank: Math.min(best.a.rank, best.b.rank),
      combinedPointsForCents: best.combinedPointsForCents,
      priorMeetings,
      basisWeeks: input.basisWeeks,
      evidence,
    },
  };
}

/** Two rosters as one stable key, lower id first. */
export function pairKey(x: number, y: number): string {
  return x <= y ? `${String(x)}-${String(y)}` : `${String(y)}-${String(x)}`;
}
