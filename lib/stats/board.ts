import { desc, eq } from 'drizzle-orm';

import { type Queryable } from '@/lib/db';
import { seasons } from '@/lib/db/schema';

import { activeManagerIds } from '@/lib/league/membership';

import { type MatchupFact, finalizedMarginsCents, seasonFacts } from './facts';
import {
  pairKey,
  rankMatchups,
  type ImportanceResult,
  type MatchupCandidate,
} from './importance';
import { weekSnapshot } from './snapshot';
import { standingsThrough } from './standings';
import { seasonWeeks } from './week';

/**
 * The board's matchup of the week — the fact layer's first consumer.
 *
 * `boardFace()` takes an optional `matchup` string and renders **nothing** when
 * it is absent, because `PRODUCT_DELIVERY_MANDATE.md §9` forbids the interface
 * deciding what a result means. That empty socket is the acceptance test for
 * this layer, and this function is what fills it — with a *typed fact* and
 * nothing else.
 *
 * ## What it deliberately does not do
 *
 * It does not compose a sentence. `boardFace`'s detail is capped at twenty
 * characters with no full stop (the board's face is a hero plus one short fact),
 * so what goes there is two names and nothing more: **`Ryan v Berardo`**. The
 * intensity, the margin and the evidence stay on the fact object for the panel
 * and the Slice to use, where there is room to state them properly.
 *
 * Rendering `obliterated` here would be the interface picking a word out of a
 * fact object and putting it on the largest surface in the room without the
 * evidence that earns it. The word travels with its fact or not at all.
 */

/**
 * Two names, short enough for the board's face. Null when nothing qualifies.
 *
 * ## `announcing` is required, and it is a correctness argument
 *
 * The face is a **hero and one short fact**, and the hero names a week. Two bare
 * names underneath it are read as *that week's* game — there is no room on the
 * face for the season, which is exactly why {@link featuredMatchup}'s panel line
 * says *"in week 16, 2025"* and this one cannot.
 *
 * `featuredMatchup` only ever returns a fact from the most recent **archived**
 * season, which was right while the product only ever ran in the offseason. The
 * midseason rehearsal photographed what it becomes once a season is under way:
 * the board read `WEEK 8` over `Brandon v Matt Lee`, a game played in week 16 of
 * 2025. Nothing about that is a false *fact* — the fact is true and evidenced —
 * and it is a false *claim*, which is the distinction this module already exists
 * to police.
 *
 * So the caller states which season the board is announcing, and a fact from any
 * other season yields nothing. **Null is a designed outcome here**, not a
 * degradation: `boardFace` renders an empty detail rather than prose, and the
 * panel behind the board still carries the whole fact with its season on it.
 *
 * `null` means the board is not announcing a season — the offseason, where the
 * detail is the countdown and this is not consulted.
 */
export function matchupLine(
  fact: MatchupFact | null,
  announcing: { readonly season: number | null },
): string | null {
  if (fact === null) return null;
  if (announcing.season === null || fact.season !== announcing.season) return null;

  const line = `${fact.winnerDisplayName} v ${fact.loserDisplayName}`;

  // The board's own contract, asserted by `board-face.test.ts`: twenty
  // characters. Two long names are a real possibility, and a truncated name is
  // worse than an empty board — so the board stays empty and the panel behind it
  // still carries the whole fact.
  return line.length <= 20 ? line : null;
}

/**
 * The strongest publishable fact from the most recent finalized season.
 *
 * Offseason behaviour, and it is the behaviour that matters today: the 2026
 * season has not been played, so there is no *current* week to feature. Rather
 * than inventing one, this reaches back to the last season whose books are
 * closed — which is a true statement about a real game — and returns null when
 * even that does not exist.
 *
 * Returns the fact rather than a string, so the caller decides how much of it to
 * render and no rendering decision happens here.
 */
export async function featuredMatchup(db: Queryable): Promise<MatchupFact | null> {
  const [latest] = await db
    .select({ year: seasons.year })
    .from(seasons)
    .where(eq(seasons.status, 'ARCHIVED'))
    .orderBy(desc(seasons.year))
    .limit(1);

  if (latest === undefined) return null;

  const population = await finalizedMarginsCents(db);
  const derived = await seasonFacts(db, {
    year: latest.year,
    historicalMarginsCents: population,
  });

  /*
   * The publication boundary: a fact may name a retired manager, a **published
   * claim** may not.
   *
   * The distinction is the whole point of having a fact layer. Ryan beating
   * Berardo by 140.72 in week 16 of 2024 is the largest margin this league has
   * ever recorded and it is *true* — the fact keeps it, the audit trail keeps
   * it, and `seasonFacts` will hand it over. But the commissioner's ruling is
   * that a retired manager never enters an official Slice story, standing,
   * record, receipt or statistical summary, and the Tonight board is exactly
   * that. So the record survives and the sentence does not get said.
   *
   * Filtered here rather than inside `seasonFacts`, deliberately. Suppressing it
   * at derivation would make the fact layer's answer depend on who happens to be
   * seated this season, and a fact whose truth changes when somebody leaves the
   * league is not a fact. Derivation is history; this is editorial.
   */
  const active = await activeManagerIds(db);
  return (
    derived.facts.find(
      (fact) => active.has(fact.winnerManagerId) && active.has(fact.loserManagerId),
    ) ?? null
  );
}

/* -------------------------------------------------------------------------
 * The current season's featured matchup
 * ---------------------------------------------------------------------- */

/**
 * The most important game of the week the board is naming, or nothing.
 *
 * Commissioner ruling, 2026-08-10. `lib/stats/importance.ts` owns the rule; this
 * owns the reads, so the rule stays drivable from a fixture.
 *
 * ## Where a not-yet-final week's pairings come from
 *
 * This is the constraint that shapes the whole function, and it is worth stating
 * plainly because it bounds what the feature can do.
 *
 * **The league's schedule is not stored.** `persistWeeks` drops an all-zero
 * pairing as an unplayed fixture — deliberately, and it is the one thing
 * standing between the in-season sync and a finalized week of ties nobody played
 * — so `fantasy_matchups` learns a week's pairings only once that week has been
 * played. By then the Tuesday job has closed it and the board has moved on.
 *
 * So the pairings for the week the board is naming come from the two records
 * that legitimately hold them before it is final, in this order:
 *
 *   1. **`week_snapshots`** — Sunday's photograph. `16 §4.3`'s first cron writes
 *      one row per paired game of the current week, which is exactly the
 *      schedule for that week, verified, from Sleeper, on the sanctioned read.
 *   2. **`fantasy_matchups`** — the week's stored games, for the degraded case
 *      where a week has been synced but its Tuesday declined to close it.
 *
 * Neither is a projection and neither is inferred. Where neither exists, the
 * answer is `null` and the board prints nothing, which is the ruling's own
 * instruction and the board's own documented behaviour.
 *
 * **The honest cost, stated:** between the Tuesday that closes a week and the
 * Sunday that photographs the next one, no pairing for the named week is on
 * record and the detail slot is empty. Removing that gap means persisting the
 * schedule, which is new storage and is not in this ruling's scope.
 *
 * ## The standings it ranks against are strictly earlier
 *
 * Finalized weeks **before** the named week, and only those. A week ranks
 * against what was known going into it; letting the week's own result inform its
 * importance would make the board a report rather than a card.
 */
export async function featuredCurrentMatchup(
  db: Queryable,
  input: { readonly season: number; readonly week: number },
): Promise<ImportanceResult> {
  const season = await seasonWeeks(db, input.season);
  if (!season.found) return { selected: false, reason: 'no-candidates' };

  const basis = [...season.weekFinalizedAt.keys()]
    .filter((week) => week < input.week)
    .sort((a, b) => a - b);

  const closed = new Set(basis);
  const standings =
    basis.length === 0
      ? []
      : standingsThrough({
          rows: season.rows.filter((row) => closed.has(row.week)),
          throughWeek: basis[basis.length - 1]!,
          roster: season.roster,
        });

  /*
   * Sunday's photograph first, the week's stored games second. Both are sorted
   * by matchup id, so the candidate order this hands to the ranker never depends
   * on what the planner returned.
   */
  const snapshot = await weekSnapshot(db, { season: input.season, week: input.week });
  const candidates: MatchupCandidate[] =
    snapshot.size > 0
      ? [...snapshot.values()]
          .map((entry) => ({
            sleeperMatchupId: entry.sleeperMatchupId,
            rosterAId: entry.rosterAId,
            rosterBId: entry.rosterBId,
          }))
          .sort((x, y) => x.sleeperMatchupId - y.sleeperMatchupId)
      : season.rows
          .filter((row) => row.week === input.week && row.weekType === 'regular')
          .map((row) => ({
            sleeperMatchupId: row.sleeperMatchupId,
            rosterAId: row.rosterAId,
            rosterBId: row.rosterBId,
          }))
          .sort((x, y) => x.sleeperMatchupId - y.sleeperMatchupId);

  // Prior meetings this season, from finalized weeks only. Evidence, not a key.
  const priorMeetings = new Map<string, number>();
  for (const row of season.rows) {
    if (!closed.has(row.week)) continue;
    const key = pairKey(row.rosterAId, row.rosterBId);
    priorMeetings.set(key, (priorMeetings.get(key) ?? 0) + 1);
  }

  return rankMatchups({
    season: input.season,
    week: input.week,
    candidates,
    standings,
    basisWeeks: basis.length,
    eligible: await activeManagerIds(db),
    priorMeetings,
  });
}

/**
 * The featured matchup as the board's face may print it — two names, or null.
 *
 * The same twenty-character contract `matchupLine` carries, for the same reason:
 * a truncated name is worse than an empty board. Written separately rather than
 * shared, because the two take different objects and a single function taking a
 * union would be one call site pretending to be two.
 *
 * The order is **standings order** — the better-placed manager is named first —
 * so the line reads the way the table does and never depends on which roster
 * Sleeper happened to put in column A.
 */
export function currentMatchupLine(result: ImportanceResult): string | null {
  if (!result.selected) return null;

  const { matchup } = result;
  const [first, second] =
    matchup.aRank <= matchup.bRank
      ? [matchup.aDisplayName, matchup.bDisplayName]
      : [matchup.bDisplayName, matchup.aDisplayName];

  const line = `${first} v ${second}`;
  return line.length <= 20 ? line : null;
}
