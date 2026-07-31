import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';

import { type Queryable } from '@/lib/db';
import { fantasyMatchups, seasonMemberships, seasons, users } from '@/lib/db/schema';
import { activeManagerIds } from '@/lib/league/membership';

import { factPacket, type FactPacket } from './packet';
import { renderEdition, type Edition } from './render';
import { validateEdition } from './validate';

/**
 * The last issue Tony actually printed.
 *
 * ## Why the rack is not empty in the offseason
 *
 * The 2026 season has not started, so there is no *current* issue — but two
 * seasons are imported, finalized and complete, and the pipeline in `16 §9` runs
 * on them exactly as it will run on a live week. So the rack carries a real
 * paper about a real week rather than a description of a paper that does not
 * exist yet.
 *
 * That is the honest offseason state (`CLAUDE.md`: the site launches into a
 * deliberate offseason built on imported history), and it is also the only way
 * the whole pipeline is *visible* before September. A renderer nobody can look
 * at is a renderer nobody has reviewed.
 *
 * ## An issue the validator refuses is not published
 *
 * Null, and the page says the rack is empty. Printing something the validator
 * rejected because it was the only thing available is the precise failure the
 * validator exists to prevent — and it would land on the one surface where
 * nobody thinks to check.
 *
 * `16 §9` also requires commissioner approval before the first season publishes.
 * This is not that: it is a **historical** issue about a finished season, which
 * is why it can go on the rack without a review queue. The approval gate belongs
 * with live weekly publication, and it is not built yet.
 */
export async function latestEdition(db: Queryable): Promise<Edition | null> {
  /*
   * The most recent finalized week that actually holds games.
   *
   * Asked of the database rather than assumed, because "the last week of the
   * season" is 17 in one year and 18 in another, and a hardcoded number would
   * quietly print week 17 forever once a season runs long.
   */
  const [latest] = await db
    .select({
      year: seasons.year,
      week: sql<number>`max(${fantasyMatchups.week})`.as('week'),
    })
    .from(fantasyMatchups)
    .innerJoin(seasons, eq(seasons.id, fantasyMatchups.seasonId))
    .where(isNotNull(seasons.finalizedAt))
    .groupBy(seasons.year)
    .orderBy(desc(seasons.year))
    .limit(1);

  if (latest === undefined) return null;

  /*
   * Walk back from the last week until one is publishable.
   *
   * A week can legitimately refuse — every game in it might name somebody who is
   * no longer a product participant (`lib/league/membership.ts`). Walking back
   * finds the most recent week that has something true to say, rather than
   * showing an empty rack because the final week happened to be unpublishable.
   *
   * Bounded, so a season of nothing but suppressed weeks ends rather than
   * scanning to week zero.
   */
  for (let week = Number(latest.week); week >= 1; week--) {
    const issue = await editionFor(db, { season: latest.year, week });
    if (issue !== null) return issue;
  }

  return null;
}

/**
 * One named week, rendered and checked — or null if it may not be published.
 *
 * The whole pipeline behind one call, so a caller that wants a *specific* issue
 * (a historical recap, a demo edition, the commissioner review queue when it
 * arrives) gets the identical path the rack does. A second assembly written for
 * one of those callers would be a second thing to keep correct.
 */
export async function editionFor(
  db: Queryable,
  input: { readonly season: number; readonly week: number },
): Promise<Edition | null> {
  const packet = await factPacket(db, input);
  if (packet.refusal !== null) return null;

  const issue = renderEdition(packet);
  return validateEdition(issue, packet).publishable ? issue : null;
}

/**
 * The packet behind the last issue Tony printed.
 *
 * The same walk `latestEdition` does, stopping at the packet rather than at the
 * rendered paper — because a surface that wants to *mention* a result needs the
 * allowed sets to be checked against, not the prose. Returning the rendered
 * edition and re-deriving a packet from it would be two answers to one question.
 */
export async function latestPacket(db: Queryable): Promise<FactPacket> {
  const [latest] = await db
    .select({
      year: seasons.year,
      week: sql<number>`max(${fantasyMatchups.week})`.as('week'),
    })
    .from(fantasyMatchups)
    .innerJoin(seasons, eq(seasons.id, fantasyMatchups.seasonId))
    .where(isNotNull(seasons.finalizedAt))
    .groupBy(seasons.year)
    .orderBy(desc(seasons.year))
    .limit(1);

  const nothing: FactPacket = {
    season: 0,
    week: 0,
    weekType: 'unscored',
    finalized: false,
    lead: null,
    rest: [],
    scoreboard: [],
    suppressed: [],
    demoted: [],
    quiet: false,
    allowedNumbers: [],
    allowedNames: [],
    refusal: 'no-season',
  };

  if (latest === undefined) return nothing;

  for (let week = Number(latest.week); week >= 1; week--) {
    const packet = await factPacket(db, { season: latest.year, week });
    if (packet.refusal !== null) continue;

    const issue = renderEdition(packet);
    if (validateEdition(issue, packet).publishable) return packet;
  }

  return nothing;
}

/**
 * Who won the most recent finalized season.
 *
 * `season_memberships.final_rank` — recorded at import from the bracket and
 * never inferred (`lib/sleeper/placements.ts`). Filtered through the publication
 * boundary like everything else: a retired champion is a true fact and not a
 * printable one.
 */
export async function mostRecentChampion(
  db: Queryable,
): Promise<{ displayName: string; season: number } | null> {
  const publishable = await activeManagerIds(db);

  const rows = await db
    .select({ year: seasons.year, userId: users.id, displayName: users.displayName })
    .from(seasonMemberships)
    .innerJoin(seasons, eq(seasons.id, seasonMemberships.seasonId))
    .innerJoin(users, eq(users.id, seasonMemberships.userId))
    .where(and(isNotNull(seasons.finalizedAt), eq(seasonMemberships.finalRank, 1)))
    .orderBy(desc(seasons.year))
    .limit(4);

  const found = rows.find((row) => publishable.has(row.userId));
  return found === undefined ? null : { displayName: found.displayName, season: found.year };
}
