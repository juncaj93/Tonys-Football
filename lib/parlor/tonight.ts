import { and, count, desc, eq, isNotNull } from 'drizzle-orm';

import { type Database } from '@/lib/db';
import { seasonMemberships, seasons, users } from '@/lib/db/schema';

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
 * §9`: SW never decides what a result means). Until the matchup fact layer
 * exists, the offseason detail is the countdown — a verified value from the
 * clock — and the field simply stays empty rather than being filled with prose.
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
 * so it needs no query of its own. When `fantasy_matchups` lands, the matchup of
 * the week arrives as a typed fact parameter — not as a lookup added in here.
 */
export function boardFace(input: {
  /** Days until week one, or null once the season is under way. */
  readonly daysUntilKickoff: number | null;
  /** The current week, once there is one. */
  readonly week?: number | null;
  /** A Stats-provided matchup of the week, e.g. `Matty B v Nathan`. */
  readonly matchup?: string | null;
}): BoardFace {
  const week = input.week ?? null;

  if (input.daysUntilKickoff === null) {
    return {
      hero: week === null ? 'WEEK ONE' : `WEEK ${String(week)}`,
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
    .select({ id: seasons.id, year: seasons.year })
    .from(seasons)
    .orderBy(desc(seasons.year))
    .limit(1);

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
    lines.push({
      key: 'champion',
      text: `${champion.name} still has the ${String(champion.year)} ring. Nobody has taken it off him.`,
      priority: 20,
    });
  }

  // --- Who has picked up their keys ---------------------------------------
  if (latestSeason !== undefined) {
    const [seats] = await db
      .select({ total: count() })
      .from(seasonMemberships)
      .where(eq(seasonMemberships.seasonId, latestSeason.id));

    const [claimed] = await db
      .select({ total: count() })
      .from(seasonMemberships)
      .innerJoin(users, eq(seasonMemberships.userId, users.id))
      .where(
        and(eq(seasonMemberships.seasonId, latestSeason.id), isNotNull(users.pinUpdatedAt)),
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
