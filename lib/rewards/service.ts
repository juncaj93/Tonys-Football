import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { applyTokenDelta, economyFor } from '@/lib/counter/tokens';
import { type Database } from '@/lib/db';
import {
  seasonMemberships,
  seasons,
  tokenTransactions,
  users,
  weeklyRewards,
} from '@/lib/db/schema';
import {
  earlyDuesAmount,
  earlyDuesDescription,
  earlyDuesHandlesFor,
  earlyDuesIdempotencyKey,
} from '@/lib/rewards/early-dues';
import {
  deriveWeeklyAwards,
  rewardDescription,
  rewardIdempotencyKey,
  type WeeklyAward,
} from '@/lib/rewards/derive';
/*
 * A season-wide read that `lib/stakes/` happens to own.
 *
 * Importing it rather than reimplementing it is deliberate. `stakeSeason`
 * resolves the season, its stored games, the roster-to-manager mapping and
 * `activeManagerIds` — and the last of those is an *eligibility* answer.
 * `lib/stats/week.ts` is explicit that a boundary applied in two places is a
 * boundary nobody owns; a private copy here would be a second opinion about who
 * is in this league, which is exactly the defect that filter was written to fix.
 *
 * It is misnamed for this caller and that is the honest cost. Renaming it is a
 * refactor across the stakes module and does not belong in this slice.
 */
import { stakeSeason } from '@/lib/stakes/facts';
import { weekFinality } from '@/lib/stats/finality';
import { buildWeek, publishableWeek } from '@/lib/stats/week';

/**
 * Paying a finalized week — `03 §4`'s token sources, once.
 *
 * ## The finality gate is the whole design
 *
 * A reward may only be paid from a week that is **written down as final**
 * (`lib/stats/finality.ts`). Anything else pays out on a number that can still
 * move, and a correction arriving on Wednesday would leave tokens in a wallet
 * justified by a score that no longer exists.
 *
 * The gate has a **second, independent half** that is easy to get wrong, and the
 * Tuesday integration test is what got it right: a finalized *season* cannot pay
 * at all. `apply_token_delta` refuses one outright (`03 §6` closes the books),
 * and every week of 2024 and 2025 belongs to one in every environment.
 *
 * The obvious implementation — checking `weekFinality`'s `source` for
 * `season_closed` — is wrong, and wrong in exactly the case that matters.
 * `weekFinality` prefers a week's own finalization when both records exist,
 * because that is the narrower claim and it is right for its own question; the
 * Tuesday job writes that row in its first step. So by the time rewards are
 * reached on a closed season, the source reads `finalized_week`, the check does
 * not fire, and the ledger raises an exception four frames down. An expected
 * state becomes a failed step, which is precisely the inversion that made it
 * worth writing down: `MANDATE §9`'s "no fabricated data" has a quieter partner,
 * **no fabricated failures either**. A closed season is not an error, it is a
 * season whose books are shut, and this says so — by testing the same condition
 * the ledger tests, rather than a proxy for it.
 *
 * ## One transaction
 *
 * Every award for the week is paid inside a single transaction, so a week is
 * paid completely or not at all. A partial week is the one outcome that would be
 * genuinely hard to reason about later: half the league paid, no record of which
 * half was intended, and a retry that cannot tell the difference between "not yet
 * paid" and "deliberately not paid".
 *
 * ## Two locks, and neither is application logic
 *
 * | Mechanism | What it stops |
 * |---|---|
 * | `token_transactions.idempotency_key UNIQUE` | A second payment for the same manager, week and reason — whatever asks, from wherever |
 * | `weekly_rewards_once_per_manager_per_reason` | A second *justification* row, even if a caller invents a different key format |
 *
 * There is no `SELECT ... WHERE already_rewarded` anywhere in this file. A check
 * like that is a race with a comfortable-looking body: two concurrent Tuesdays
 * both read "not yet", both proceed, and the database is what actually saves it.
 * So the database is asked directly, and a replay is a no-op because
 * `apply_token_delta` says so.
 */

/** Why a week paid nothing. Never a failure — each is a real, expected state. */
export type RewardRefusal =
  /** No such season imported. */
  | 'no-season'
  /** The week holds no publishable game — not played, or not imported. */
  | 'no-games'
  /** Played, but nothing has closed it. The Tuesday job has not run. */
  | 'not-finalized'
  /** Final only because the season is closed, and a closed season cannot pay. */
  | 'season-closed'
  /** Games and eligible managers, but nothing the rules pay for. */
  | 'nothing-payable';

export interface RewardReport {
  readonly season: number;
  readonly week: number;
  /** Awards written by *this* run. Empty on a replay — see {@link alreadyPaid}. */
  readonly paid: readonly WeeklyAward[];
  /** Awards that were already on the books when this run looked. */
  readonly alreadyPaid: number;
  /** Total tokens moved by this run. Zero on a replay. */
  readonly tokens: number;
  /** Why nothing was paid, or null when something was. */
  readonly refusal: RewardRefusal | null;
  /** The economy version the amounts came from, when a week was priced. */
  readonly economyVersion: string | null;
}

function refuse(
  season: number,
  week: number,
  refusal: RewardRefusal,
): RewardReport {
  return {
    season,
    week,
    paid: [],
    alreadyPaid: 0,
    tokens: 0,
    refusal,
    economyVersion: null,
  };
}

/**
 * Pay one week.
 *
 * `at` is injected rather than read from a clock for the reason every dated write
 * in this project takes it: `lib/clock.ts` exists so a test can put the league in
 * October.
 */
export async function awardWeek(
  db: Database,
  input: {
    readonly season: number;
    readonly week: number;
    readonly at: Date;
  },
): Promise<RewardReport> {
  const season = await stakeSeason(db, input.season);
  if (!season.found || season.seasonId === null) {
    return refuse(input.season, input.week, 'no-season');
  }
  const seasonId = season.seasonId;

  /*
   * `finalized: true` here is deliberately optimistic, and gated below.
   *
   * The same choice `buildWeekResult` documents: passing the season's real state
   * marks every game of an open season `season-not-finalized` and empties the
   * record, which would make "not played" and "played, not closed" the same
   * answer. The scores are read; the permission to *pay* on them is the separate
   * question that `weekFinality` answers three lines down.
   */
  const record = publishableWeek(
    buildWeek({
      season: input.season,
      week: input.week,
      finalized: true,
      rows: season.rows,
      roster: season.roster,
    }),
    season.eligibleUserIds,
  );

  const finality = weekFinality({
    seasonFinalizedAt: season.seasonFinalizedAt,
    weekFinalizedAt: season.weekFinalizedAt.get(input.week) ?? null,
    hasGames: season.rows.some((row) => row.week === input.week),
  });

  if (!finality.final) {
    return refuse(input.season, input.week, finality.reason ?? 'not-finalized');
  }

  /*
   * A closed season cannot pay, whatever else is true of the week.
   *
   * This tests `seasonFinalizedAt` directly rather than `finality.source`, and
   * the difference is not cosmetic — it is a defect the Tuesday integration test
   * found. `weekFinality` *prefers* a week's own finalization when both records
   * exist, which is right for its own question, and the Tuesday job writes that
   * row in step 1. So on a closed season the source reads `finalized_week`, a
   * `source === 'season_closed'` check never fires, and `apply_token_delta`
   * raises from four frames down — turning an expected state into a failed step.
   *
   * The condition here is deliberately the *same* condition the ledger enforces
   * (`seasons.finalized_at IS NOT NULL`). A gate that approximates the rule it
   * is protecting will disagree with it eventually, and the disagreement will
   * surface as an exception rather than as a decline.
   */
  if (season.seasonFinalizedAt !== null) {
    return refuse(input.season, input.week, 'season-closed');
  }

  const economy = await economyFor(db, seasonId);
  const awards = deriveWeeklyAwards({ week: record, prices: economy.values });
  if (awards.length === 0) {
    return refuse(input.season, input.week, 'nothing-payable');
  }

  return db.transaction(async (tx) => {
    const paid: WeeklyAward[] = [];
    let alreadyPaid = 0;
    let tokens = 0;

    for (const award of awards) {
      /*
       * The seat, resolved once per award.
       *
       * `apply_token_delta` takes a user and a season and finds the membership
       * itself; `weekly_rewards` stores the membership id, so it has to be
       * looked up here too. Reading it rather than threading it through the pure
       * layer keeps `derive.ts` free of database identifiers — it deals in
       * managers, which is what `11 §2` says the permanent identity is.
       */
      const [seat] = await tx
        .select({ id: seasonMemberships.id })
        .from(seasonMemberships)
        .where(
          and(
            eq(seasonMemberships.userId, award.managerId),
            eq(seasonMemberships.seasonId, seasonId),
          ),
        )
        .limit(1);

      if (seat === undefined) {
        /*
         * Eligible in the league, but holding no seat this season.
         *
         * `activeManagerIds` is league membership and a season membership is a
         * seat; they are different facts and `11 §2` keeps them apart on purpose.
         * A roster that resolved to this manager while they hold no seat is a
         * seeding inconsistency, and skipping is the only honest option — the
         * alternative is `apply_token_delta` raising "holds no seat", which would
         * cost the rest of the league its week over one bad row.
         */
        continue;
      }

      const idempotencyKey = rewardIdempotencyKey({
        season: input.season,
        week: input.week,
        managerId: award.managerId,
        reason: award.reason,
      });

      const transactionId = await applyTokenDelta(tx, {
        userId: award.managerId,
        seasonId,
        amount: award.amount,
        reason: award.reason,
        description: rewardDescription({ week: input.week, reason: award.reason }),
        idempotencyKey,
        sourceRef: award.gameKey,
      });

      /*
       * The justification, written after the payment it justifies.
       *
       * Order matters even inside a transaction, because the ledger is the
       * idempotency authority: `apply_token_delta` returns the *same* id on a
       * replay, so inserting here with `ON CONFLICT DO NOTHING` makes the second
       * run write nothing and report it as already paid. Writing this row first
       * would invert the authority — a crash between the two would leave a
       * justification with no payment, and the next run would see the row and
       * skip a manager who was never paid.
       */
      const inserted = await tx
        .insert(weeklyRewards)
        .values({
          seasonId,
          week: input.week,
          seasonMembershipId: seat.id,
          reason: award.reason,
          amount: award.amount,
          rosterId: award.rosterId,
          pointsCents: award.pointsCents,
          gameKey: award.gameKey,
          economyVersion: economy.version,
          tokenTransactionId: transactionId,
          awardedAt: input.at,
        })
        .onConflictDoNothing({
          target: [
            weeklyRewards.seasonId,
            weeklyRewards.week,
            weeklyRewards.seasonMembershipId,
            weeklyRewards.reason,
          ],
        })
        .returning({ id: weeklyRewards.id });

      if (inserted.length > 0) {
        paid.push(award);
        tokens += award.amount;
      } else {
        alreadyPaid += 1;
      }
    }

    return {
      season: input.season,
      week: input.week,
      paid,
      alreadyPaid,
      tokens,
      refusal: paid.length === 0 && alreadyPaid === 0 ? 'nothing-payable' : null,
      economyVersion: economy.version,
    };
  });
}

/** What a season paid a manager, newest first. The receipt's structured half. */
export async function rewardsForMembership(
  db: Database,
  membershipId: string,
  limit = 10,
): Promise<
  readonly {
    readonly week: number;
    readonly reason: 'MATCHUP_WIN' | 'WEEKLY_HIGH_SCORE';
    readonly amount: number;
  }[]
> {
  return db
    .select({
      week: weeklyRewards.week,
      reason: weeklyRewards.reason,
      amount: weeklyRewards.amount,
    })
    .from(weeklyRewards)
    .where(eq(weeklyRewards.seasonMembershipId, membershipId))
    .orderBy(weeklyRewards.week)
    .limit(limit);
}

/* -------------------------------------------------------------------------
 * The early-dues thank-you
 * ---------------------------------------------------------------------- */

/** Why a season paid no thank-you. Each is a real state rather than a failure. */
export type EarlyDuesRefusal =
  /** No such season in this database. */
  | 'no-season'
  /** The books are shut. A closed season does not hand out new money. */
  | 'season-closed'
  /** Nobody is on the roster for this season — the ordinary state of most seasons. */
  | 'nobody-owed'
  /** Somebody is owed one, and none of them holds a live seat this season. */
  | 'no-eligible-seat';

export interface EarlyDuesReport {
  readonly seasonYear: number;
  readonly seasonId: string | null;
  /** What each thank-you was worth — twice the box price in force. Null on a refusal. */
  readonly amount: number | null;
  /** Sleeper handles paid by *this* run. Empty on a replay. */
  readonly paid: readonly string[];
  /** Handles that were already on the books when this run looked. */
  readonly alreadyPaid: readonly string[];
  /** Total tokens moved by this run. Zero on a replay. */
  readonly tokens: number;
  /** The economy version the amount was derived from, when a season was priced. */
  readonly economyVersion: string | null;
  readonly refusal: EarlyDuesRefusal | null;
}

function refuseEarlyDues(
  seasonYear: number,
  seasonId: string | null,
  refusal: EarlyDuesRefusal,
): EarlyDuesReport {
  return {
    seasonYear,
    seasonId,
    amount: null,
    paid: [],
    alreadyPaid: [],
    tokens: 0,
    economyVersion: null,
    refusal,
  };
}

/**
 * Pay the early-dues thank-you to everyone named for this season.
 *
 * ## Eligibility is two facts, and neither is inferred
 *
 * 1. **The commissioner named this handle for this season** — `EARLY_DUES_ROSTER`,
 *    a source-controlled list with a decision attached to each row. Nothing about
 *    dues is observable from this database, so the only honest place for it is a
 *    file a pull request can read.
 * 2. **They hold a live seat in it** — `season_memberships.is_active`, the same
 *    filter `grantSeasonalBoxes` uses and for the same reason: `11 §2` keeps the
 *    permanent person and the seasonal seat apart, and a wallet belongs to the
 *    seat. There is no second opinion here about who is in this league.
 *
 * A named manager holding no seat is **skipped, not an error**: they are a
 * person this database knows who is not playing this year, and `apply_token_delta`
 * would raise *"holds no seat"* — turning an expected state into a failed step,
 * which is the inversion `awardWeek`'s finality gate exists to avoid.
 *
 * ## A closed season pays nothing
 *
 * Checked here rather than left to the ledger, exactly as `awardWeek` checks it
 * and against the same column (`seasons.finalized_at`). A gate that approximates
 * the rule it protects will disagree with it eventually, and the disagreement
 * surfaces as an exception rather than as a decline.
 *
 * ## Idempotency is `token_transactions.idempotency_key UNIQUE`, and nothing else
 *
 * There is no application check that decides whether to pay. The key names the
 * occasion — this season, this manager — and `apply_token_delta` turns every
 * replay after the first into a no-op that returns the original row's id.
 *
 * The one read of the ledger below is **a report, never a gate**: it exists so
 * the caller can log "two paid" rather than "two considered", and the money is
 * already correct whatever it returns. Under two genuinely concurrent runs it can
 * over-report by one — both read *absent*, one inserts, the other's insert is
 * swallowed — and that is an accepted, documented cost of not adding a second
 * table to make a log line exact. Nothing downstream branches on it.
 */
export async function awardEarlyDues(
  db: Database,
  input: { readonly seasonYear: number },
): Promise<EarlyDuesReport> {
  const handles = earlyDuesHandlesFor(input.seasonYear);

  const [season] = await db
    .select({ id: seasons.id, finalizedAt: seasons.finalizedAt })
    .from(seasons)
    .where(eq(seasons.year, input.seasonYear))
    .limit(1);

  if (season === undefined) {
    return refuseEarlyDues(input.seasonYear, null, 'no-season');
  }

  /*
   * The roster is checked after the season is resolved, so that "2027 has nobody
   * on the list" and "2027 does not exist" stay different answers. Most seasons
   * will refuse here, forever, and that is the designed resting state rather
   * than a gap: a thank-you nobody is owed is not a thank-you that failed.
   */
  if (handles.size === 0) {
    return refuseEarlyDues(input.seasonYear, season.id, 'nobody-owed');
  }
  if (season.finalizedAt !== null) {
    return refuseEarlyDues(input.seasonYear, season.id, 'season-closed');
  }

  const seats = await db
    .select({
      userId: seasonMemberships.userId,
      sleeperUsername: users.sleeperUsername,
    })
    .from(seasonMemberships)
    .innerJoin(users, eq(users.id, seasonMemberships.userId))
    .where(
      and(
        eq(seasonMemberships.seasonId, season.id),
        eq(seasonMemberships.isActive, true),
        /*
         * Matched in the database, lower-cased on both sides.
         *
         * `isEarlyDuesEligible` states the same rule in TypeScript and is what
         * the pure tests assert against; this is the same comparison expressed
         * where the rows are, so the query returns the eligible seats rather
         * than every seat in the league for the loop to sift. A handle Sleeper
         * registered as `NateyDee` and a roster line that says `nateydee` are one
         * account, and must not be two answers.
         */
        inArray(sql`lower(${users.sleeperUsername})`, [...handles]),
      ),
    )
    .orderBy(asc(seasonMemberships.rosterId));

  if (seats.length === 0) {
    return refuseEarlyDues(input.seasonYear, season.id, 'no-eligible-seat');
  }

  const economy = await economyFor(db, season.id);
  const amount = earlyDuesAmount(economy.values);
  const description = earlyDuesDescription(input.seasonYear);

  return db.transaction(async (tx) => {
    const paid: string[] = [];
    const alreadyPaid: string[] = [];
    let tokens = 0;

    for (const seat of seats) {
      const idempotencyKey = earlyDuesIdempotencyKey({
        seasonId: season.id,
        userId: seat.userId,
      });

      // Reporting only. See the header — the payment below is what decides.
      const existing = await tx
        .select({ id: tokenTransactions.id })
        .from(tokenTransactions)
        .where(eq(tokenTransactions.idempotencyKey, idempotencyKey))
        .limit(1);

      await applyTokenDelta(tx, {
        userId: seat.userId,
        seasonId: season.id,
        amount,
        reason: 'EARLY_DUES_BONUS',
        description,
        idempotencyKey,
        /*
         * The one fact the ledger cannot otherwise carry.
         *
         * `weekly_rewards` exists partly to record which `economy_configs`
         * version an amount was priced against, because a versioned economy is
         * only useful if a transaction says which version it belongs to. This
         * gift has no table of its own (`0022` says why), so the version travels
         * here — which is what makes "two boxes" still checkable years after the
         * box price has moved again.
         */
        sourceRef: `economy:${economy.version}`,
      });

      if (existing.length > 0) {
        alreadyPaid.push(seat.sleeperUsername ?? seat.userId);
      } else {
        paid.push(seat.sleeperUsername ?? seat.userId);
        tokens += amount;
      }
    }

    return {
      seasonYear: input.seasonYear,
      seasonId: season.id,
      amount,
      paid,
      alreadyPaid,
      tokens,
      economyVersion: economy.version,
      refusal: null,
    };
  });
}
