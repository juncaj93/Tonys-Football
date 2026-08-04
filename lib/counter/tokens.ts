import { createHash } from 'node:crypto';

import { and, desc, eq, sql } from 'drizzle-orm';

import { now } from '@/lib/clock';
import { type Queryable } from '@/lib/db';
import { economyConfigs, seasonMemberships, seasons, tokenTransactions } from '@/lib/db/schema';

/**
 * Tony Tokens.
 *
 * ## Everything here goes through `apply_token_delta`
 *
 * There is exactly one way tokens move, and it is a **database function**
 * (`drizzle/0005_token_ledger.sql`), not this file. `16 §5.4`: no feature gets
 * its own balance-writing path. This module is a typed wrapper over that
 * function plus the reads that surfaces need — it holds no arithmetic of its own,
 * and deliberately offers no way to set a balance.
 *
 * If you are looking for where to add a token grant: you add a **caller**, with
 * an idempotency key. You do not add a write path.
 *
 * ## The numbers are provisional
 *
 * `03 §4` names 250 as a first-season starting balance and `03 §11` says costs
 * belong in database configuration rather than code. `16 §8` gates every value on
 * the P3 multi-season simulation. So the values live in `economy_configs`, keyed
 * by a content hash, flagged `provisional`, and a rebalance writes a **new
 * version** rather than editing the old one — because a transaction is only
 * interpretable against the numbers that were live when it happened.
 */

/**
 * The provisional economy.
 *
 * Both figures come straight from `03 §4` / `03 §11` rather than being invented
 * here, and both are **provisional until P3**. Do not tune them to make something
 * feel better; that is the simulation's job, and doing it early locks the values
 * the gate exists to keep open.
 *
 * The price is set so an opening balance buys a handful of boxes rather than one
 * or thirty — enough for the loop to be *played* during review, which is the only
 * property this slice needs from it.
 */
export const PROVISIONAL_ECONOMY = {
  /** `03 §4`: "first-season login/start balance: 250". */
  seasonStartTokens: 250,
  /** `03 §11`: the standard box is the "lower price" tier. */
  standardBoxPriceTokens: 50,
  /**
   * The fixed stake on Tony's Line (`16 §9`).
   *
   * `03` names no wager baseline, so this one is set **relative to the price it
   * competes with** rather than invented on its own: a fifth of a box, so a full
   * regular season of lines is roughly three boxes' worth of swing in either
   * direction. Big enough that taking a side is a decision, small enough that a
   * bad run does not empty a tab and end somebody's collecting for the year —
   * which is `16 A.1`'s ruling that punishment is visibility, not deprivation.
   *
   * The payout is fixed at 2x by `16 §9` and enforced by
   * `weekly_stakes_line_pays_double`, so it is not a second number here.
   */
  weeklyLineStakeTokens: 10,
  /**
   * What a bounty pays whoever claims it.
   *
   * Two boxes. A bounty is one manager beating the best week anybody has posted
   * all season — it happens a handful of times a year at most, so it can be
   * worth noticeably more than a market a manager plays every week.
   */
  bountyRewardTokens: 100,
  /**
   * `03 §4`: "matchup win: 150".
   *
   * Taken from the specification rather than derived, exactly like
   * `seasonStartTokens` above it and for the same reason — `03 §4` calls these
   * "initial baseline values" and requires that "final numbers must be
   * configurable and reviewed against simulations before launch", which is what
   * `provisional` and the content-hash version are for. Do not tune it here.
   */
  matchupWinTokens: 150,
  /**
   * `03 §4`: "weekly high score: 400".
   *
   * Worth more than a win and more than eight boxes a season is not an accident
   * of the spec: a win is a thing half the league does every week, and the high
   * score is a thing exactly one manager does.
   */
  weeklyHighScoreTokens: 400,
} as const;

export type EconomyValues = typeof PROVISIONAL_ECONOMY;

/** Reasons application code may actually use today. See the enum's comment. */
export type LiveTokenReason =
  | 'SEASON_START'
  | 'BOX_PURCHASE'
  | 'COMMISSIONER_ADJUSTMENT'
  /** A pick on Tony's Line, debited when it is placed (`lib/stakes/`). */
  | 'STAKE_PLACED'
  /** A winning pick, or a claimed bounty. Credited by settlement, once. */
  | 'STAKE_PAYOUT'
  /** Won a paired game in a finalized week (`lib/rewards/`). */
  | 'MATCHUP_WIN'
  /** Posted the week's best score in a finalized week (`lib/rewards/`). */
  | 'WEEKLY_HIGH_SCORE';

export interface TokenDelta {
  readonly userId: string;
  readonly seasonId: string;
  /** Signed. Negative spends. Zero is rejected by the database. */
  readonly amount: number;
  readonly reason: LiveTokenReason;
  /** Human-readable, required by `03 §5`. Curated or templated, never generated. */
  readonly description: string;
  /**
   * The caller's name for this occasion.
   *
   * A token delta is an **event**, not a thing, so it has no natural key — "add
   * 150 tokens" may legitimately happen twice and nothing about the row can tell
   * a retry from a second genuine award. Naming the occasion is what makes a
   * replay a no-op. Reusing a key for a *different* delta raises rather than
   * silently doing nothing.
   */
  readonly idempotencyKey: string;
  /** The thing this was about — a box id, a matchup, an auction lot. */
  readonly sourceRef?: string;
  /** The commissioner, on a manual adjustment. Omitted means the system did it. */
  readonly actorId?: string;
}

/**
 * Move tokens.
 *
 * Thin on purpose: every rule — overdraft, idempotency, finalized seasons,
 * append-only, the balance column — is enforced inside the database function this
 * calls. A caller cannot get any of it wrong by forgetting something here.
 *
 * Returns the ledger row's id, which is the same id on a replay.
 */
export async function applyTokenDelta(db: Queryable, delta: TokenDelta): Promise<string> {
  const rows = await db.execute<{ id: string }>(sql`
    select apply_token_delta(
      ${delta.userId}::uuid,
      ${delta.seasonId}::uuid,
      ${delta.amount}::integer,
      ${delta.reason}::token_reason,
      ${delta.description}::text,
      ${delta.idempotencyKey}::text,
      ${delta.sourceRef ?? null}::text,
      ${delta.actorId ?? null}::uuid,
      ${now().toISOString()}::timestamptz
    ) as id
  `);

  // `db.execute` returns driver rows; drizzle's pg result exposes them on `.rows`.
  const id = (rows as unknown as { rows: { id: string }[] }).rows[0]?.id;
  if (id === undefined) throw new Error('apply_token_delta returned no transaction id');
  return id;
}

/**
 * A manager's wallet for one season.
 *
 * Returns null when they hold no seat that season — which is a real state, not an
 * error: a manager who joined in 2026 has no 2025 wallet, and inventing a zero
 * would make "no seat" and "spent everything" indistinguishable.
 */
export async function wallet(
  db: Queryable,
  input: { userId: string; seasonId: string },
): Promise<{ membershipId: string; balance: number } | null> {
  const rows = await db
    .select({ id: seasonMemberships.id, balance: seasonMemberships.tokenBalance })
    .from(seasonMemberships)
    .where(
      and(
        eq(seasonMemberships.userId, input.userId),
        eq(seasonMemberships.seasonId, input.seasonId),
      ),
    )
    .limit(1);

  const row = rows[0];
  return row === undefined ? null : { membershipId: row.id, balance: row.balance };
}

/** The most recent movements, newest first. What a manager's statement shows. */
export async function recentTransactions(
  db: Queryable,
  membershipId: string,
  limit = 10,
): Promise<{ amount: number; description: string; createdAt: Date }[]> {
  return db
    .select({
      amount: tokenTransactions.amount,
      description: tokenTransactions.description,
      createdAt: tokenTransactions.createdAt,
    })
    .from(tokenTransactions)
    .where(eq(tokenTransactions.seasonMembershipId, membershipId))
    .orderBy(desc(tokenTransactions.createdAt))
    .limit(limit);
}

/* -------------------------------------------------------------------------
 * Configuration
 * ---------------------------------------------------------------------- */

/** Content hash of the values, so two environments seeding the same numbers agree. */
export function economyVersion(values: EconomyValues): string {
  const canonical = Object.entries(values)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${String(value)}`)
    .join('|');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

/**
 * Store the provisional economy for a season if it is not already stored.
 *
 * Append-only: an existing version is never rewritten, because transactions point
 * at the numbers that were live when they happened. New numbers are a new
 * version, which the content hash gives for free.
 */
export async function ensureEconomyConfig(
  db: Queryable,
  seasonId: string,
): Promise<{ version: string; values: EconomyValues }> {
  const values = PROVISIONAL_ECONOMY;
  const version = economyVersion(values);

  await db
    .insert(economyConfigs)
    .values({ seasonId, version, values, provisional: true })
    .onConflictDoNothing({
      target: [economyConfigs.seasonId, economyConfigs.version],
    });

  return { version, values };
}

/**
 * The numbers in force for a season.
 *
 * Reads the newest stored version rather than the constant, so a rebalance takes
 * effect by being seeded — not by a deploy. Falls back to nothing: a season with
 * no stored config is a seeding failure and should be loud rather than silently
 * running on hardcoded values.
 */
export async function economyFor(
  db: Queryable,
  seasonId: string,
): Promise<{ version: string; values: EconomyValues }> {
  const rows = await db
    .select({ version: economyConfigs.version, values: economyConfigs.values })
    .from(economyConfigs)
    .where(eq(economyConfigs.seasonId, seasonId))
    .orderBy(desc(economyConfigs.createdAt))
    .limit(1);

  const row = rows[0];
  if (row === undefined) {
    throw new Error(
      `season ${seasonId} has no stored economy config; run npm run db:seed before spending tokens`,
    );
  }

  /*
   * A stored config missing a key is a seeding failure, and it must be as loud
   * as a missing config.
   *
   * This used to be a bare `as EconomyValues` over jsonb, which is a cast with
   * no evidence behind it — and the first time a value was **added** to the
   * economy, every environment seeded before that change kept serving a row
   * without it. Nothing threw. The parlor rendered *"undefined off your tab
   * either way"* on the market's own price line, which is where it was caught:
   * by looking, on the screen, at the number a manager is being asked to commit.
   *
   * The row is append-only and versioned precisely so old numbers stay
   * interpretable; that guarantee says nothing about a row being *complete* for
   * today's code, and this is the check that does.
   */
  const values = row.values as Partial<EconomyValues>;
  const missing = Object.keys(PROVISIONAL_ECONOMY).filter(
    (key) => typeof values[key as keyof EconomyValues] !== 'number',
  );
  if (missing.length > 0) {
    throw new Error(
      `season ${seasonId} has economy config ${row.version}, which is missing ` +
        `${missing.join(', ')}. Run npm run db:seed to store the current version.`,
    );
  }

  return { version: row.version, values: values as EconomyValues };
}

/**
 * The season whose wallet is live.
 *
 * The newest season that has **not** been finalized — which is what "this season"
 * means for money, and it is deliberately not "the current calendar year": a
 * season stays open through its spend-down, and `apply_token_delta` refuses a
 * finalized one outright.
 */
export async function openSeason(
  db: Queryable,
): Promise<{ id: string; year: number } | null> {
  const rows = await db
    .select({ id: seasons.id, year: seasons.year })
    .from(seasons)
    .where(sql`${seasons.finalizedAt} is null`)
    .orderBy(desc(seasons.year))
    .limit(1);

  return rows[0] ?? null;
}
