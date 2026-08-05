import { and, asc, eq } from 'drizzle-orm';

import { type Queryable } from '@/lib/db';
import { lootBoxes, seasonMemberships, seasons } from '@/lib/db/schema';

import { grantBox } from './boxes';

/**
 * The two free boxes a season hands out.
 *
 * ## What the commissioner ruled, and what it is *not*
 *
 * The 2026-08-04 economy ruling moved the box price from 50 to 200 and added
 * **two seasonal free-box grants per active manager per season** — season
 * opening and midseason — so that a manager who never wins a game still opens
 * something twice a year. The price rise is what the simulation demanded; these
 * are what keeps it from reading as a tax.
 *
 * They are deliberately **not** an achievement, a level, a streak or a login
 * calendar — `16 §8`'s explicit non-goals. A grant is owed to a seat, not earned
 * by behaviour: every active manager gets exactly the same two, at the same two
 * moments, whatever their record. There is nothing to chase and nothing to miss.
 *
 * ## Idempotency is `loot_boxes.grant_key`, and nothing else
 *
 * This module adds no idempotency mechanism of its own. `grant_key` is UNIQUE
 * across the table and the key here names the **occasion** —
 * `season-grant:<seasonId>:<milestone>:<userId>` — so:
 *
 * - re-running the Tuesday job re-grants nothing;
 * - re-running the seed on every deploy re-grants nothing;
 * - a grant already **opened** is not re-granted either, which is the case that
 *   matters: a re-grant of an opened box is a reroll dressed up as a schedule.
 *
 * There is no `SELECT ... WHERE already_granted` anywhere below. That check is a
 * race with a comfortable-looking body — two Tuesdays overlapping a deploy both
 * read "not yet" — and the unique index is what actually saves it.
 *
 * ## Season-scoped, and keyed to the milestone rather than to the moment
 *
 * The key carries the season id, so 2026's opening box and 2027's are different
 * grants and a manager seated in both gets both. Within a season the key carries
 * the *milestone*, not the week it happened to be noticed — which is what makes
 * a **late-joining manager** correct rather than a special case: a replacement
 * seated in week 9 receives the opening grant *and* the midseason grant the
 * first time this runs, because both milestones have passed and both are owed to
 * the seat they now hold. Nobody joins a league and is told they have missed two
 * boxes that were never conditional on anything.
 */

/** The two occasions. Their names are part of the grant key, so they are frozen. */
export const SEASONAL_MILESTONES = ['SEASON_OPENING', 'MIDSEASON'] as const;

export type SeasonalMilestone = (typeof SEASONAL_MILESTONES)[number];

/**
 * The week the midseason box lands.
 *
 * Seven, because the imported seasons score fourteen weeks and the simulation
 * models the midseason grant at the halfway point (`lib/economy/simulate.ts`).
 * A constant rather than a computed half of the real week count: the number of
 * weeks a season will run is not known until it has run, and a milestone whose
 * date moves as the season goes on is not a milestone.
 */
export const MIDSEASON_WEEK = 7;

/**
 * Which milestones a season has reached by the end of `week`.
 *
 * Pure, so the schedule is testable without a database. Monotonic on purpose:
 * once a milestone is due it stays due forever, which is what lets a catch-up
 * run — a late seat, a missed Tuesday, a re-seeded environment — settle the
 * whole season's grants in one pass instead of silently skipping the ones whose
 * moment has gone.
 *
 * `week: 0` is the season before a ball is thrown, which is where the seed calls
 * from.
 */
export function milestonesDue(week: number): readonly SeasonalMilestone[] {
  const due: SeasonalMilestone[] = ['SEASON_OPENING'];
  if (week >= MIDSEASON_WEEK) due.push('MIDSEASON');
  return due;
}

/** The occasion's name, which is also its idempotency key. */
export function grantKeyFor(input: {
  seasonId: string;
  milestone: SeasonalMilestone;
  userId: string;
}): string {
  return `season-grant:${input.seasonId}:${input.milestone}:${input.userId}`;
}

/** Why a season granted nothing. Each is a real state rather than a failure. */
export type GrantRefusal =
  /** No such season in this database. */
  | 'no-season'
  /** The books are shut. A closed season does not hand out new boxes. */
  | 'season-closed'
  /** The season exists and nobody holds an active seat in it. */
  | 'no-active-seats';

export interface GrantReport {
  readonly seasonId: string | null;
  /** Milestones this run considered — every one the week has reached. */
  readonly milestones: readonly SeasonalMilestone[];
  /** Active seats the grants were offered to. */
  readonly seats: number;
  /** Boxes actually written by *this* run. Zero on a replay. */
  readonly granted: number;
  /** Grants that were already on the books when this run looked. */
  readonly alreadyGranted: number;
  readonly refusal: GrantRefusal | null;
}

/**
 * Hand out every seasonal box the season has reached, to everyone owed one.
 *
 * ## Only an active seat
 *
 * `season_memberships.is_active` is false for *"a manager who left mid-season and
 * was replaced"*, and the ruling says grants are unavailable to a retired or
 * inactive manager. So the read filters on it, and the filter is the whole
 * eligibility rule — there is no second opinion about who is in this league.
 *
 * A manager who goes inactive **after** a grant keeps the box. Collectibles and
 * the boxes that hold them hang off `users.id` and persist across seasons
 * (`16 §5.1`); clawing one back would be the first destructive operation in the
 * economy, and nothing asks for it.
 *
 * ## A closed season grants nothing
 *
 * Not because a box is seasonal — it is not — but because these are dated
 * events. Writing 2024's opening box in 2026 would be a record of something that
 * did not happen, which `MANDATE §9` rules out more firmly than any balance
 * question.
 */
export async function grantSeasonalBoxes(
  db: Queryable,
  input: { readonly seasonYear: number; readonly week: number },
): Promise<GrantReport> {
  const [season] = await db
    .select({ id: seasons.id, finalizedAt: seasons.finalizedAt })
    .from(seasons)
    .where(eq(seasons.year, input.seasonYear))
    .limit(1);

  const milestones = milestonesDue(input.week);

  if (season === undefined) {
    return { seasonId: null, milestones, seats: 0, granted: 0, alreadyGranted: 0, refusal: 'no-season' };
  }
  if (season.finalizedAt !== null) {
    return {
      seasonId: season.id,
      milestones,
      seats: 0,
      granted: 0,
      alreadyGranted: 0,
      refusal: 'season-closed',
    };
  }

  const seats = await db
    .select({ userId: seasonMemberships.userId })
    .from(seasonMemberships)
    .where(
      and(
        eq(seasonMemberships.seasonId, season.id),
        eq(seasonMemberships.isActive, true),
      ),
    )
    .orderBy(asc(seasonMemberships.rosterId));

  if (seats.length === 0) {
    return {
      seasonId: season.id,
      milestones,
      seats: 0,
      granted: 0,
      alreadyGranted: 0,
      refusal: 'no-active-seats',
    };
  }

  let granted = 0;
  let alreadyGranted = 0;

  for (const milestone of milestones) {
    for (const seat of seats) {
      const result = await grantBox(db, {
        userId: seat.userId,
        grantKey: grantKeyFor({ seasonId: season.id, milestone, userId: seat.userId }),
        // `source` is what an audit reads first, so it names the mechanism and
        // the occasion. The key carries the season and the manager.
        source: `season_grant:${milestone}`,
      });
      if (result.granted) granted += 1;
      else alreadyGranted += 1;
    }
  }

  return {
    seasonId: season.id,
    milestones,
    seats: seats.length,
    granted,
    alreadyGranted,
    refusal: null,
  };
}

/**
 * The seasonal grants a manager has actually received, oldest first.
 *
 * The audit path, and the receipt's. Reads `loot_boxes` rather than a second
 * table, because there is no second table: the grant *is* the box, and a record
 * of grants kept beside the boxes would be a fact stored twice.
 */
export async function seasonalGrantsFor(
  db: Queryable,
  input: { readonly userId: string; readonly seasonId: string },
): Promise<
  readonly { readonly milestone: SeasonalMilestone; readonly opened: boolean; readonly grantedAt: Date }[]
> {
  const rows = await db
    .select({
      grantKey: lootBoxes.grantKey,
      state: lootBoxes.state,
      grantedAt: lootBoxes.grantedAt,
    })
    .from(lootBoxes)
    .where(eq(lootBoxes.userId, input.userId))
    .orderBy(asc(lootBoxes.grantedAt));

  const wanted = new Map(
    SEASONAL_MILESTONES.map((milestone) => [
      grantKeyFor({ seasonId: input.seasonId, milestone, userId: input.userId }),
      milestone,
    ]),
  );

  return rows.flatMap((row) => {
    const milestone = row.grantKey === null ? undefined : wanted.get(row.grantKey);
    return milestone === undefined
      ? []
      : [{ milestone, opened: row.state === 'OPENED', grantedAt: row.grantedAt }];
  });
}
