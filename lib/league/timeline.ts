import { asc } from 'drizzle-orm';

import { type Database, type Queryable } from '@/lib/db';
import { seasons } from '@/lib/db/schema';
import { championBanners } from '@/lib/parlor/champions';
import { type FactType, finalizedMarginsCents, seasonFacts } from '@/lib/stats/facts';

/**
 * The league's history, as a **computed view** rather than a stored one.
 *
 * ## Why this is a derivation and not a table
 *
 * `16 §4.1` names the Timeline as one of six surfaces that are *"views over one
 * stream"*, and the same section says why nothing is stored: *"Nothing stores
 * 'what the shop looks like now.' It is **computed** from current state on every
 * load. No drift, no stale rows, no maintenance."*
 *
 * The stream itself — `league_events` — does not exist, and the surfaces that
 * were supposed to read it were built to compute directly from the verified
 * domain tables instead. That is a real gap against the plan and it is recorded
 * in `docs/CHECKPOINT.md` rather than quietly closed here: building a spine that
 * duplicates `fantasy_matchups` would put two records of the same fact in the
 * database, which is the drift the invariant exists to prevent. What the spine
 * would uniquely buy is **ordering across heterogeneous facts and per-manager
 * watermarks**, and neither has a surface asking for it yet.
 *
 * So this page reads what is already true and already verified.
 *
 * ## Every number here comes through the Stats boundary
 *
 * `PRODUCT_DELIVERY_MANDATE §9`: a fantasy claim is derived by `lib/stats` or it
 * is not made. Nothing in this file counts, compares or ranks — `seasonFacts`
 * does that, against the same significance policy the Slice is classified under,
 * and it hands back its **suppressions** too. A season whose facts were all
 * suppressed renders as a season with no facts, never as a season with invented
 * ones.
 */

/**
 * One game, ready to print.
 *
 * **Strings, not numbers**, and that is the boundary rather than a convenience.
 * `components/slice/presentation.test.tsx` bans `toFixed(` in a display
 * component, because a component that formats a score is one edit away from a
 * component that computes one — and `MANDATE §9` makes Stats the sole authority
 * on what a result was. So the rounding happens here, once, beside the
 * derivation that produced the number.
 */
export interface TimelineFact {
  readonly id: string;
  readonly kind: FactType;
  /** `'16'`. A label, so the component never renders a number. */
  readonly week: string;
  readonly winner: string;
  readonly loser: string;
  /** `'188.02'`. Two places, from the exact cents `lib/stats` converted. */
  readonly winnerPoints: string;
  readonly loserPoints: string;
}

/** One season, as the wall records it. */
export interface TimelineSeason {
  readonly year: number;
  /** Null until somebody has won it. */
  readonly champion: string | null;
  /** The season currently being played, if this is it. */
  readonly current: boolean;
  /** Books closed. An unfinalized season can still be true and incomplete. */
  readonly finalized: boolean;
  /**
   * The season's publishable facts, strongest first, already ranked by
   * `seasonFacts`. Capped — see `FACTS_PER_SEASON`.
   */
  readonly facts: readonly TimelineFact[];
  /**
   * How many publishable facts were left out by the cap.
   *
   * Shown rather than dropped silently. *"No silent caps"* is the same rule the
   * workflow guidance states for orchestration, and it applies to a page that
   * truncates a list for exactly the same reason: a reader cannot tell a short
   * list from a trimmed one.
   */
  readonly moreFacts: number;
  /**
   * Why a season that looks empty is empty, in the reader's language.
   *
   * Null when there is nothing to explain. This is the difference between *"we
   * have nothing"* and *"we have not played yet"*, and getting it wrong is how a
   * page starts reading as broken.
   */
  readonly quietBecause: string | null;
}

/**
 * One of each kind, and the reason is a defect this caught.
 *
 * `seasonFacts` publishes up to one largest-margin and one closest-game *per
 * week*, so a full season offers around thirty-four and the wall would become a
 * log. The obvious cut — take the top two by selection score — was written
 * first, and running it against the recorded 2024 and 2025 seasons returned
 * **two blowouts for each of them and no close game at all**: a margin ranks
 * above a nail-biter in `scoreOf`, so the second-strongest blowout always beats
 * the strongest close finish.
 *
 * That is a worse history page than one of each, and it is invisible without
 * real data — every fact was true, none was invented, and the page was simply
 * telling one half of the story twice.
 */
const KINDS: readonly FactType[] = ['largest-margin', 'closest-game'];

export async function timeline(db: Queryable): Promise<readonly TimelineSeason[]> {
  /*
   * Queried once and passed down.
   *
   * `seasonFacts` needs the whole finalized margin population to place a game in
   * league history, and asking for it per season would be the same query three
   * times — `facts.ts` says as much where it takes the parameter.
   */
  const historicalMarginsCents = await finalizedMarginsCents(db);

  const banners = await championBanners(db as Database);
  const champion = new Map(banners.map((b) => [b.year, b]));

  const rows = await db
    .select({ year: seasons.year, finalizedAt: seasons.finalizedAt })
    .from(seasons)
    .orderBy(asc(seasons.year));

  const out: TimelineSeason[] = [];
  for (const row of rows) {
    const banner = champion.get(row.year);
    const derived = await seasonFacts(db, { year: row.year, historicalMarginsCents });
    const ranked = [...derived.facts];

    /*
     * `seasonFacts` has already ranked these, so the first of a kind *is* the
     * strongest of that kind. Nothing is re-scored here — this file does not
     * compare fantasy numbers (`MANDATE §9`), it only picks one of each.
     */
    const headline = KINDS.map((kind) => ranked.find((f) => f.type === kind))
      .filter((f) => f !== undefined)
      .map(
        (f): TimelineFact => ({
          id: f.id,
          kind: f.type,
          week: String(f.week),
          winner: f.winnerDisplayName,
          loser: f.loserDisplayName,
          winnerPoints: f.winnerPoints.toFixed(2),
          loserPoints: f.loserPoints.toFixed(2),
        }),
      );

    out.push({
      year: row.year,
      champion: banner?.champion ?? null,
      current: banner?.current ?? false,
      finalized: derived.finalized,
      facts: headline,
      moreFacts: Math.max(0, ranked.length - headline.length),
      quietBecause: quietBecause({
        finalized: derived.finalized,
        current: banner?.current ?? false,
        facts: ranked.length,
        suppressed: derived.suppressed.length,
      }),
    });
  }

  return out;
}

/**
 * The sentence a season with nothing on it gets.
 *
 * Deliberately not a template with a count in it. A reader wants to know whether
 * the league has forgotten something or simply has not played it yet, and the
 * *number* of suppressed facts is an internal detail — `SeasonFacts.suppressed`
 * is documented as **never rendered**.
 */
function quietBecause(input: {
  finalized: boolean;
  current: boolean;
  facts: number;
  suppressed: number;
}): string | null {
  if (input.facts > 0) return null;
  if (input.current) return 'Still being played. Nothing on the record yet.';
  if (!input.finalized) return 'Not finalized, so nothing here is official.';
  if (input.suppressed > 0) {
    // Every fact this season had was withheld — a retired manager, an
    // unverifiable snapshot. Saying so is more honest than an empty panel.
    return 'Played, but nothing from it can be published.';
  }
  return 'No games on record.';
}
