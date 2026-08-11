import { and, count, desc, eq, isNotNull } from 'drizzle-orm';

import { type Database } from '@/lib/db';
import { seasonMemberships, seasons, users } from '@/lib/db/schema';
import { notADemoSeat } from '@/lib/demo/boundary';
import { featuredMatchup } from '@/lib/stats/board';

import { seasonClock } from './season';

/**
 * Tonight at Tony's.
 *
 * `16 §7.1`: what matters now, in **at most four lines, never scrolling**. It
 * answers "what's new" in under five seconds or it has failed, and a fifth line
 * is how a board becomes a feed.
 *
 * ## It is a view, and stays one
 *
 * `16 §4.1` makes the board a view over `league_events` — nothing stores "what
 * the board says now". The spine does not exist yet, so these lines are
 * computed from imported history and the season clock on every load. When the
 * spine lands, the source changes and the surface does not. What must not
 * happen in between is a `tonight_lines` table, because that is the drift the
 * spine exists to prevent.
 *
 * Every line is a curated template filled with a verified value. No generated
 * prose: the Slice is the only place an LLM writes anything (`16 §9`).
 */

export const MAX_TONIGHT_LINES = 4;

/**
 * What is printed on the board's own face.
 *
 * ## Two elements, and that is the whole design
 *
 * Commissioner ruling, 2026-07-30: the board *"isn't clear. Too small font, too
 * many words (should just be like 'Week 5' along with a matchup of the week or
 * something) ... Needs to look elegant."*
 *
 * The face had been carrying a state line **plus a sentence** — "Week one · 42
 * days" over "Matty B still has the 2025 ring. Nobody has taken it off him." —
 * at 8px and 9px, in a 111-unit field. Two sentences at decorative size in the
 * largest object in an idle room. The panel behind the board already holds all
 * four lines and always did; the face was duplicating them badly.
 *
 * So the face is **a hero and one short fact**, nothing else. A board in a
 * pizzeria says WEEK 5 and who is playing. It does not narrate.
 *
 * ## `detail` is deliberately allowed to be null
 *
 * During the season it is the matchup of the week, and that is a **Stats & Data
 * fact**, not something this function may infer (`PRODUCT_DELIVERY_MANDATE.md
 * §9`: SW never decides what a result means). That fact layer now exists —
 * `lib/stats/facts.ts` — and `matchupLine()` turns one into the two names this
 * field takes. It stays optional and still defaults to null, because a season
 * with no publishable fact must leave the board empty rather than fill it with
 * prose. In the offseason the detail is the countdown, a verified clock value.
 */
export interface BoardFace {
  /** The big line. `WEEK ONE`, `WEEK 5`. Short enough to stay one line. */
  readonly hero: string;
  /** One short fact under it, or null. Never a sentence. */
  readonly detail: string | null;
}

/**
 * The board's face, from the clock.
 *
 * Pure and synchronous: the face is a *view* over state the caller already has,
 * so it needs no query of its own. The matchup arrives as a **parameter** —
 * already reduced from a typed fact by `lib/stats/board.ts` — and is never
 * looked up in here. Keeping the query out is what stops this function from
 * growing an opinion about which game matters.
 */
/**
 * What the face is told, in two shapes rather than one.
 *
 * ## The week is required in season, and that is a repair
 *
 * The first version made `week` optional and defaulted a missing one to `WEEK
 * ONE`. `app/page.tsx` never passed it, so from the opening Sunday to January
 * the largest object in the room would have read **WEEK ONE**, every week — and
 * nothing caught it, because in week one the wrong answer and the right answer
 * are the same string. The midseason rehearsal is what made it visible
 * (`docs/WEEK8_REHEARSAL.md`).
 *
 * A default that is correct in exactly one week is not a default, it is a bug
 * with a grace period. So the two states are two shapes: before kickoff the
 * countdown is the whole face and there is no week to name; after it, the week
 * is **not optional** and a caller that does not know it cannot compile.
 */
export type BoardFaceInput =
  | {
      /** Days until week one. The face is a countdown and names no week. */
      readonly daysUntilKickoff: number;
      readonly week?: undefined;
      readonly matchup?: undefined;
    }
  | {
      /** Null once the season is under way. */
      readonly daysUntilKickoff: null;
      /** The week the league is playing. `lib/stats/week.ts` derives it. */
      readonly week: number;
      /**
       * A Stats-provided matchup **of the season the hero names**, e.g.
       * `Matty B v Nathan`. `lib/stats/board.ts`'s `matchupLine` is what
       * enforces the season, and null is an ordinary outcome.
       */
      readonly matchup?: string | null;
    };

export function boardFace(input: BoardFaceInput): BoardFace {
  if (input.daysUntilKickoff === null) {
    return {
      hero: `WEEK ${String(input.week)}`,
      detail: input.matchup ?? null,
    };
  }

  return {
    hero: 'WEEK ONE',
    detail:
      input.daysUntilKickoff === 1 ? 'tomorrow' : `${String(input.daysUntilKickoff)} days out`,
  };
}

export interface TonightLine {
  readonly key: string;
  readonly text: string;
  /** Ordering hint; lower is more important. */
  readonly priority: number;
}

export async function tonightBoard(db: Database): Promise<readonly TonightLine[]> {
  const clock = seasonClock();
  const lines: TonightLine[] = [];

  const [latestSeason] = await db
    .select({ id: seasons.id, year: seasons.year, finalizedAt: seasons.finalizedAt })
    .from(seasons)
    .orderBy(desc(seasons.year))
    .limit(1);

  /*
   * Whether the newest season on the books has been closed.
   *
   * `seasons.finalized_at` is the product's one deterministic season-completion
   * boundary — a person's decision, written in January (`scripts/seed.ts`'s
   * `FINALIZED_SEASONS`), never Sleeper's `complete` status, which flips the
   * moment the last game ends while stat corrections are still landing.
   *
   * **The newest season, not any season.** Keying on *"some season is
   * finalized"* would have been true of 2025 in August 2026, and the board
   * would have announced a season that ended nineteen months earlier as though
   * it had just happened. `finalized_at` records when the close was *recorded*
   * rather than when the season ended — 2024's and 2025's are both stamped the
   * day the fixtures were first imported — so it is not a recency signal and is
   * not used as one.
   */
  const seasonJustClosed = latestSeason !== undefined && latestSeason.finalizedAt !== null;

  // --- The season, counted down -------------------------------------------
  if (clock.daysUntilKickoff !== null) {
    lines.push({
      key: 'kickoff',
      text:
        clock.daysUntilKickoff === 1
          ? 'Week one is tomorrow. Tony has been ready since March.'
          : `Week one opens in ${String(clock.daysUntilKickoff)} days.`,
      priority: 10,
    });
  }

  // --- Who still holds the ring -------------------------------------------
  const [champion] = await db
    .select({ name: users.displayName, year: seasons.year })
    .from(seasonMemberships)
    .innerJoin(seasons, eq(seasonMemberships.seasonId, seasons.id))
    .innerJoin(users, eq(seasonMemberships.userId, users.id))
    .where(and(eq(seasonMemberships.finalRank, 1), eq(seasons.status, 'ARCHIVED')))
    .orderBy(desc(seasons.year))
    .limit(1);

  if (champion !== undefined) {
    /*
     * Two readings of one slot, and the deterministic state picks which.
     *
     * **Champion confirmed** (commissioner copy, 2026-08-10) is this same query
     * — `final_rank = 1` on a season the product has closed — in the window
     * where the champion's season is *the newest on the books*. Then Tony
     * announces it. Once a later season exists the slot goes back to the
     * standing-champion line, because *"still has the ring"* is a claim about
     * holding it through time and only makes sense once time has passed.
     *
     * No new query, no new source, no new storage: the slot already reached
     * this state and was saying the wrong thing in it — *"still has the 2026
     * ring. Nobody has taken it off him"* on the day he won it.
     *
     * The name is **substituted from the verified result**, never authored.
     */
    const justCrowned = latestSeason !== undefined && champion.year === latestSeason.year;

    lines.push({
      key: 'champion',
      /*
       * Verbatim, and without a terminal stop the ruling did not give it. Every
       * other line here is a sentence; these two are a front page, and adding
       * punctuation to authored copy is the smallest possible way to start
       * rewriting it.
       */
      text: justCrowned
        ? `${champion.name} WINS IT`
        : `${champion.name} still has the ${String(champion.year)} ring. Nobody has taken it off him.`,
      priority: 20,
    });
  }

  /*
   * --- The season is over ---------------------------------------------------
   *
   * **Season complete** (commissioner copy, 2026-08-10). Flavour for a verified
   * state rather than a declaration of its own: it says nothing the closed
   * season does not already say, and it cannot appear before the books are
   * shut.
   *
   * Independent of the champion above rather than folded into it, because the
   * two facts genuinely come apart: a season can be closed with no `final_rank`
   * on record — `lib/counter/rings.ts` handles exactly that case and refuses to
   * name a champion for it — and *"the season is over"* is still true and still
   * worth the board saying.
   *
   * Priority 25 puts it directly under the champion. In the week a season
   * closes that pair leads the board and the history line falls off the bottom,
   * which is the right trade: *"2024 through 2026 are on the books"* is the
   * least urgent line there is, and this one implies the newest of them.
   */
  if (seasonJustClosed) {
    // A straight apostrophe, which is what `content/counter-greetings.md` uses
    // in all twenty-seven of its own and what the ruling was written with.
    lines.push({ key: 'wrap', text: "THAT'S A WRAP", priority: 25 });
  }

  /*
   * --- The heaviest night on the books -------------------------------------
   *
   * The first thing in the parlor to render a Stats fact, and the reason it is
   * worth doing in the offseason rather than waiting for week one: the fact
   * layer is otherwise demonstrable only in a test, and `MANDATE §5` asks for
   * the loop to work, not for the code to exist.
   *
   * Every figure here comes off the fact object. Nothing is recomputed, nothing
   * is rounded, and the *word* — `obliterated`, `crushed` — is the intensity the
   * fact was classified with under a stored policy version. `MANDATE §9`: this
   * surface renders a Stats classification and never chooses one.
   *
   * Absent when there is no fact, which is the whole point of the socket. A
   * league with one unfinalized season gets no line rather than a hedge.
   *
   * **Priority 35, below the keys and above the history line.** The board holds
   * four lines and a fifth is how a board becomes a feed, so adding one has to
   * displace one. It displaces *"2024 and 2025 are on the books"* — the least
   * specific of the five, and the one this line partly implies anyway by naming
   * a week of a season and quoting its score.
   */
  const heaviest = await featuredMatchup(db);
  if (heaviest !== null) {
    lines.push({
      key: 'heaviest',
      text:
        `${heaviest.winnerDisplayName} ${heaviest.intensity} ${heaviest.loserDisplayName} ` +
        `by ${heaviest.margin.toFixed(2)} in week ${String(heaviest.week)}, ` +
        `${String(heaviest.season)}. Still the one people bring up.`,
      priority: 35,
    });
  }

  // --- Who has picked up their keys ---------------------------------------
  if (latestSeason !== undefined) {
    /*
     * Both counts exclude demo seats.
     *
     * This line said **"5 of 14 managers"** on a preview holding four demo
     * seats, which is a false statement about a ten-person league in the
     * product's own voice. `MANDATE §8` requires the demo system to stay
     * distinct at the UI boundary and this is that boundary — see
     * `lib/demo/boundary.ts`. Both halves join `users` now; the total used not
     * to, which is how it drifted from the claimed count.
     */
    const [seats] = await db
      .select({ total: count() })
      .from(seasonMemberships)
      .innerJoin(users, eq(seasonMemberships.userId, users.id))
      .where(and(eq(seasonMemberships.seasonId, latestSeason.id), notADemoSeat()));

    const [claimed] = await db
      .select({ total: count() })
      .from(seasonMemberships)
      .innerJoin(users, eq(seasonMemberships.userId, users.id))
      .where(
        and(
          eq(seasonMemberships.seasonId, latestSeason.id),
          isNotNull(users.pinUpdatedAt),
          notADemoSeat(),
        ),
      );

    const total = seats?.total ?? 0;
    const inside = claimed?.total ?? 0;

    if (total > 0 && inside < total) {
      lines.push({
        key: 'keys',
        // "1 of 10 managers have" is the sort of thing a template writes and a
        // person never says.
        text:
          inside === 1
            ? `1 of ${String(total)} managers has picked up their key.`
            : `${String(inside)} of ${String(total)} managers have picked up their keys.`,
        priority: 30,
      });
    } else if (total > 0) {
      lines.push({
        key: 'keys',
        text: 'Everybody has a key now. Tony is not sure how he feels about that.',
        priority: 30,
      });
    }
  }

  // --- What is on the books -----------------------------------------------
  const archived = await db
    .select({ year: seasons.year })
    .from(seasons)
    .where(eq(seasons.status, 'ARCHIVED'))
    // Oldest first: the league's history reads forward, the way it happened.
    .orderBy(seasons.year);

  if (archived.length > 0) {
    const years = archived.map((season) => String(season.year));
    /**
     * Two years read as a sentence; five read as a list a machine wrote.
     *
     * `years.join(' and ')` was fine for 2024 and 2025 and became
     * *"2021 and 2022 and 2023 and 2024 and 2025 are on the books"* the moment a
     * third season existed — which it will in January 2027, on its own, with
     * nobody looking. Contiguous history collapses to a range; a gap keeps the
     * years so the sentence never claims a season the league did not play.
     */
    const first = years[0]!;
    const last = years[years.length - 1]!;
    const contiguous = Number(last) - Number(first) + 1 === years.length;

    lines.push({
      key: 'history',
      text:
        years.length === 1
          ? `${first} is on the books, every game of it.`
          : years.length === 2
            ? `${first} and ${last} are on the books, every game of them.`
            : contiguous
              ? `${first} through ${last} are on the books, every game of them.`
              : `${years.join(', ')} are on the books, every game of them.`,
      priority: 40,
    });
  }

  return lines.sort((a, b) => a.priority - b.priority).slice(0, MAX_TONIGHT_LINES);
}
