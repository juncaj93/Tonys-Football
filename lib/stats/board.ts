import { desc, eq } from 'drizzle-orm';

import { type Queryable } from '@/lib/db';
import { seasons } from '@/lib/db/schema';

import { activeManagerIds } from '@/lib/league/membership';

import { type MatchupFact, finalizedMarginsCents, seasonFacts } from './facts';

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
