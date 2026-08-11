import { and, eq, inArray, sql } from 'drizzle-orm';

import { now } from '@/lib/clock';
import { type Database, type Queryable } from '@/lib/db';
import { hasConstraint, isBalanceViolation } from '@/lib/db/errors';
import { applyTokenDelta, economyFor, wallet } from '@/lib/counter/tokens';
import { stakeEntries, stakeResolutions, weeklyStakes } from '@/lib/db/schema';

import { authorWeek, type AuthorReport } from './author';
import { buildBasis, buildWeekResult, stakeSeason, type WeekResult } from './facts';
import {
  payoutKeyFor,
  placementKeyFor,
  type Evidence,
  type FactRefs,
  type Presentation,
  type Resolution,
  type Side,
  type Stake,
  type StakeStatus,
  type Variant,
} from './model';
import { lineCentsOf, resolveStake, settleEntry } from './resolve';

/**
 * The server side of weekly stakes: what is stored, what is offered, and what
 * gets paid.
 *
 * ## Everything that decides an outcome is here or below it
 *
 * *"Do not allow client code to decide whether a bounty was completed."* The
 * surfaces render rows. They cannot reach `resolve.ts`, they never receive an
 * unsettled comparison, and the server actions they can call take a side or ask
 * for a page — never a verdict.
 *
 * ## Settlement is idempotent three times over, on purpose
 *
 * Retry safety is not one mechanism here, and the redundancy is deliberate
 * because each layer fails differently:
 *
 *   1. **`stake_resolutions.stake_id` is UNIQUE.** A stake resolves once, ever.
 *      This is the natural key `0004` established for opening a box, and it is
 *      what makes two concurrent settlements produce one set of payouts rather
 *      than a race.
 *   2. **Each entry's settlement columns are written once**, from null, enforced
 *      by trigger. A half-applied settlement cannot be resumed into a double
 *      payment.
 *   3. **Every ledger key is derived**, never generated. `apply_token_delta`'s
 *      own `UNIQUE(idempotency_key)` turns a replay into a no-op even if both
 *      guards above were somehow bypassed.
 *
 * The whole thing runs in **one transaction**, so a failure between the
 * resolution and the last payout leaves nothing behind.
 */

/* -------------------------------------------------------------------------
 * Reads
 * ---------------------------------------------------------------------- */

interface StakeRow {
  id: string;
  seasonId: string;
  week: number;
  kind: 'TONYS_LINE' | 'BOUNTY' | 'CHALKBOARD';
  stakeKey: string;
  status: StakeStatus;
  variant: string;
  eligibleUserIds: string[];
  factRefs: unknown;
  allowedNumbers: string[];
  allowedNames: string[];
  authorVersion: string;
  stakeTokens: number | null;
  rewardTokens: number | null;
  expiresAfterWeek: number | null;
  settlementKey: string;
  voidReason: string | null;
}

function toStake(row: StakeRow, season: number): Stake {
  return {
    id: row.id,
    seasonId: row.seasonId,
    season,
    week: row.week,
    kind: row.kind,
    stakeKey: row.stakeKey,
    status: row.status,
    variant: row.variant as Variant,
    eligibleUserIds: row.eligibleUserIds,
    factRefs: row.factRefs as FactRefs,
    allowedNumbers: row.allowedNumbers,
    allowedNames: row.allowedNames,
    authorVersion: row.authorVersion,
    stakeTokens: row.stakeTokens,
    rewardTokens: row.rewardTokens,
    expiresAfterWeek: row.expiresAfterWeek,
    settlementKey: row.settlementKey,
    voidReason: row.voidReason,
  };
}

const STAKE_COLUMNS = {
  id: weeklyStakes.id,
  seasonId: weeklyStakes.seasonId,
  week: weeklyStakes.week,
  kind: weeklyStakes.kind,
  stakeKey: weeklyStakes.stakeKey,
  status: weeklyStakes.status,
  variant: weeklyStakes.variant,
  eligibleUserIds: weeklyStakes.eligibleUserIds,
  factRefs: weeklyStakes.factRefs,
  allowedNumbers: weeklyStakes.allowedNumbers,
  allowedNames: weeklyStakes.allowedNames,
  authorVersion: weeklyStakes.authorVersion,
  stakeTokens: weeklyStakes.stakeTokens,
  rewardTokens: weeklyStakes.rewardTokens,
  expiresAfterWeek: weeklyStakes.expiresAfterWeek,
  settlementKey: weeklyStakes.settlementKey,
  voidReason: weeklyStakes.voidReason,
} as const;

/**
 * How a stake presents right now.
 *
 * The stored status answers *"what happened to it"*; this answers *"why is there
 * nothing to tell me yet"*, and the two honest reasons for the second are
 * different states:
 *
 *   - `awaiting-week` — nothing has been played. Nothing is wrong.
 *   - `awaiting-final` — **the games exist and the stake has not settled.**
 *     Rendering that as a result is the single most tempting dishonesty on this
 *     surface: the numbers are right there and they are not allowed to decide
 *     anything.
 *
 *   - `rolling` — a bounty nobody claimed, with weeks left to run. Answered, not
 *     delayed.
 *
 * A week that is final but whose *market or prediction* has not been settled yet
 * folds into `awaiting-final` deliberately. Those two differ only in **why** the
 * answer is unavailable — the books being open, or the settler not having run —
 * and that is an operational distinction rather than a fact about football. A
 * manager told *"still being counted"* has been told the truth in both cases; a
 * manager given two sentences for one absence of an answer has been told about
 * the plumbing.
 *
 * A rolling bounty is genuinely different and gets its own state: the week
 * finished and the answer was *no*.
 */
export function presentationOf(stake: Stake, week: WeekResult | null): Presentation {
  if (stake.status === 'void') return 'void';
  if (stake.status === 'resolved') return 'resolved';
  if (stake.status === 'expired') return 'expired';
  if (week === null || week.teams.length === 0) return 'awaiting-week';

  /*
   * A bounty that survived a finalized week has not been *delayed*, it has been
   * **answered** — nobody did it — and it stays up. Reporting that as *"still
   * being counted"* would be false in the quietest possible way, and it is the
   * sentence a manager would read most often, because `16 §9` has a bounty
   * rolling until claimed and most of its weeks end here.
   */
  if (
    stake.kind === 'BOUNTY' &&
    week.finality.final &&
    (stake.expiresAfterWeek === null || week.week < stake.expiresAfterWeek)
  ) {
    return 'rolling';
  }

  return 'awaiting-final';
}

/** Every stake still open in a season, oldest first. What the settler walks. */
export async function openStakes(db: Queryable, season: number): Promise<readonly Stake[]> {
  const found = await stakeSeason(db, season);
  if (!found.found) return [];

  const rows = await db
    .select(STAKE_COLUMNS)
    .from(weeklyStakes)
    .where(
      and(eq(weeklyStakes.seasonId, found.seasonId ?? ''), eq(weeklyStakes.status, 'open')),
    )
    .orderBy(weeklyStakes.week, weeklyStakes.stakeKey);

  return rows.map((row) => toStake(row as StakeRow, season));
}

async function resolutionsFor(
  db: Queryable,
  stakeIds: readonly string[],
): Promise<Map<string, Resolution>> {
  if (stakeIds.length === 0) return new Map();

  const rows = await db
    .select({
      stakeId: stakeResolutions.stakeId,
      outcome: stakeResolutions.outcome,
      resolvedWeek: stakeResolutions.resolvedWeek,
      claimedByUserId: stakeResolutions.claimedByUserId,
      evidence: stakeResolutions.evidence,
      resolvedAt: stakeResolutions.resolvedAt,
    })
    .from(stakeResolutions)
    .where(inArray(stakeResolutions.stakeId, [...stakeIds]));

  return new Map(
    rows.map((row) => [
      row.stakeId,
      {
        outcome: row.outcome,
        resolvedWeek: row.resolvedWeek,
        claimedByUserId: row.claimedByUserId,
        evidence: row.evidence as unknown as Evidence,
        resolvedAt: row.resolvedAt,
      },
    ]),
  );
}

/* -------------------------------------------------------------------------
 * Authoring
 * ---------------------------------------------------------------------- */

/**
 * Author every stake a week has to offer, and store what is new.
 *
 * Idempotent by the stake key's UNIQUE constraint rather than by a read-then-
 * write, so two authoring passes racing each other produce one set of offers.
 * `onConflictDoNothing` is the correct verb: a stake that already exists is not
 * an error and must not be updated — its terms are published.
 */
export async function authorStakesForWeek(
  db: Database,
  input: {
    readonly season: number;
    readonly week: number;
    readonly lineOpen: boolean;
  },
): Promise<{ readonly report: AuthorReport; readonly written: number }> {
  const season = await stakeSeason(db, input.season);
  if (!season.found || season.seasonId === null) {
    return { report: { authored: [], refused: [] }, written: 0 };
  }

  const economy = (await economyFor(db, season.seasonId)).values;
  const basis = buildBasis({ ...season, season: input.season, week: input.week });

  const existing = await db
    .select({ variant: weeklyStakes.variant, week: weeklyStakes.week, status: weeklyStakes.status })
    .from(weeklyStakes)
    .where(eq(weeklyStakes.seasonId, season.seasonId));

  const lastChalkboardVariant =
    existing
      .filter((row) => row.week === input.week - 1)
      .map((row) => row.variant as Variant)
      .find((variant) => variant.startsWith('nobody') || variant.includes('holds') || variant.includes('loses')) ??
    null;

  /*
   * One bounty at a time.
   *
   * `16 §9` describes a bounty as rolling until claimed, which only means
   * anything if there is one board. Two live at once and *"the bounty"* stops
   * being a thing a manager can hold in their head.
   */
  const bountyRolling = existing.some(
    (row) => row.variant === 'week-score' && row.status === 'open',
  );

  const report = authorWeek({
    basis,
    economy,
    lastChalkboardVariant,
    lineOpen: input.lineOpen,
    bountyRolling,
  });

  const at = now();
  let written = 0;

  for (const authored of report.authored) {
    const inserted = await db
      .insert(weeklyStakes)
      .values({
        seasonId: season.seasonId,
        week: authored.week,
        kind: authored.kind,
        stakeKey: authored.stakeKey,
        variant: authored.variant,
        eligibleUserIds: [...authored.eligibleUserIds],
        factRefs: authored.factRefs as unknown as Record<string, unknown>,
        allowedNumbers: [...authored.allowedNumbers],
        allowedNames: [...authored.allowedNames],
        authorVersion: authored.authorVersion,
        stakeTokens: authored.stakeTokens,
        rewardTokens: authored.rewardTokens,
        expiresAfterWeek: authored.expiresAfterWeek,
        settlementKey: authored.settlementKey,
        createdAt: at,
        updatedAt: at,
      })
      .onConflictDoNothing({ target: weeklyStakes.stakeKey })
      .returning({ id: weeklyStakes.id });

    if (inserted.length > 0) written += 1;
  }

  return { report, written };
}

/* -------------------------------------------------------------------------
 * Taking a side
 * ---------------------------------------------------------------------- */

export type PlaceResult =
  | { readonly status: 'placed'; readonly side: Side; readonly staked: number }
  /** Already picked. The stored side comes back — a pick is immutable. */
  | { readonly status: 'already_placed'; readonly side: Side }
  | { readonly status: 'closed' }
  | { readonly status: 'not_eligible' }
  | { readonly status: 'insufficient_tokens'; readonly price: number; readonly balance: number };

/**
 * Take a side on Tony's Line.
 *
 * One transaction: the debit and the pick land together or neither does, so
 * nobody is charged for a pick that was not recorded and nobody holds a pick
 * they did not pay for. The debit goes first, exactly as `purchaseBox` argues —
 * if the money fails the entry is never created.
 *
 * **Eligibility is checked against the stored snapshot**, not against a live
 * query. Who was invited is a fact about the moment the offer was made.
 */
export async function placeEntry(
  db: Database,
  input: {
    readonly stakeId: string;
    readonly userId: string;
    readonly side: Side;
  },
): Promise<PlaceResult> {
  const rows = await db
    .select(STAKE_COLUMNS)
    .from(weeklyStakes)
    .where(eq(weeklyStakes.id, input.stakeId))
    .limit(1);

  const row = rows[0];
  if (row === undefined) return { status: 'closed' };
  const stake = toStake(row as StakeRow, 0);

  if (stake.kind !== 'TONYS_LINE' || stake.stakeTokens === null) return { status: 'closed' };
  if (stake.status !== 'open') return { status: 'closed' };
  if (!stake.eligibleUserIds.includes(input.userId)) return { status: 'not_eligible' };

  const existing = await db
    .select({ side: stakeEntries.side })
    .from(stakeEntries)
    .where(and(eq(stakeEntries.stakeId, stake.id), eq(stakeEntries.userId, input.userId)))
    .limit(1);

  const already = existing[0];
  if (already !== undefined) return { status: 'already_placed', side: already.side as Side };

  const price = stake.stakeTokens;

  try {
    return await db.transaction(async (tx) => {
      await applyTokenDelta(tx, {
        userId: input.userId,
        seasonId: stake.seasonId,
        amount: -price,
        reason: 'STAKE_PLACED',
        // `03 §5` requires human-readable text. Curated, not generated.
        description: "A side on Tony's Line.",
        idempotencyKey: placementKeyFor(stake.settlementKey, input.userId),
        sourceRef: stake.id,
      });

      await tx
        .insert(stakeEntries)
        .values({
          stakeId: stake.id,
          userId: input.userId,
          side: input.side,
          stakedTokens: price,
          createdAt: now(),
        })
        .onConflictDoNothing({
          target: [stakeEntries.stakeId, stakeEntries.userId],
        });

      return { status: 'placed' as const, side: input.side, staked: price };
    });
  } catch (error: unknown) {
    if (isBalanceViolation(error)) {
      const current = await wallet(db, { userId: input.userId, seasonId: stake.seasonId });
      return { status: 'insufficient_tokens', price, balance: current?.balance ?? 0 };
    }
    throw error;
  }
}

/*
 * `isBalanceViolation` now lives in `lib/db/errors.ts`.
 *
 * It was written here and in `lib/counter/boxes.ts`, identically, each with its
 * own copy of the wrapped-cause walk. The casino would have been the third, so
 * it is extracted — the predicate is unchanged and the reason it matches on the
 * **constraint name** rather than the message is recorded there, along with the
 * test that caught the message-matching version.
 */

function isUniqueViolation(error: unknown): boolean {
  return hasConstraint(error, '23505', 'stake_resolutions_one_per_stake');
}

/* -------------------------------------------------------------------------
 * Settlement
 * ---------------------------------------------------------------------- */

export type SettleResult =
  | {
      readonly status: 'settled';
      readonly outcome: string;
      readonly paid: number;
      readonly evidence: Evidence;
    }
  /** Already resolved. The stored resolution comes back unchanged. */
  | { readonly status: 'already_settled'; readonly outcome: string; readonly evidence: Evidence }
  | { readonly status: 'not_yet'; readonly why: string };

/**
 * Settle one stake, once.
 *
 * The whole operation is one transaction and the resolution row is inserted
 * **first**, so `stake_resolutions_one_per_stake` is what a concurrent second
 * attempt collides with — before any token has moved. A settler that paid first
 * and recorded afterwards would have a window in which two runs both pay.
 *
 * `week` is which week to check against. For a line or a prediction that is the
 * stake's own; for a bounty the caller walks forward from the week it opened,
 * because the earliest week that clears the target is the one that claims it.
 */
export async function settleStake(
  db: Database,
  input: { readonly stakeId: string; readonly season: number; readonly week: number },
): Promise<SettleResult> {
  const rows = await db
    .select(STAKE_COLUMNS)
    .from(weeklyStakes)
    .where(eq(weeklyStakes.id, input.stakeId))
    .limit(1);

  const row = rows[0];
  if (row === undefined) return { status: 'not_yet', why: 'no such stake' };
  const stake = toStake(row as StakeRow, input.season);

  const priorResolution = (await resolutionsFor(db, [stake.id])).get(stake.id);
  if (priorResolution !== undefined) {
    return {
      status: 'already_settled',
      outcome: priorResolution.outcome,
      evidence: priorResolution.evidence,
    };
  }

  if (stake.status !== 'open') return { status: 'not_yet', why: `stake is ${stake.status}` };

  const season = await stakeSeason(db, input.season);
  if (!season.found) return { status: 'not_yet', why: 'no such season' };

  const week = buildWeekResult({ ...season, season: input.season, week: input.week });

  const resolved = resolveStake({
    variant: stake.variant,
    factRefs: stake.factRefs,
    week,
    expiresAfterWeek: stake.expiresAfterWeek,
  });

  if (!resolved.settled) return { status: 'not_yet', why: resolved.why };

  const at = now();

  try {
    return await db.transaction(async (tx) => {
      /*
       * Who claimed it, by **id** rather than by name.
       *
       * The resolver records both: `claimant` is the name the sentence prints,
       * `claimantId` is the row it points at. Matching on the printed name would
       * make the payout depend on a display string — one rename away from paying
       * nobody, and the identity model exists precisely because a person is not
       * their current name (`16 §5.1`).
       */
      const claimant =
        stake.kind === 'BOUNTY' && resolved.outcome === 'hit'
          ? (resolved.evidence.values['claimantId'] ?? null)
          : null;

      if (stake.kind === 'BOUNTY' && resolved.outcome === 'hit' && claimant === null) {
        throw new Error(`bounty ${stake.stakeKey} resolved with no identifiable claimant`);
      }

      await tx.insert(stakeResolutions).values({
        stakeId: stake.id,
        outcome: resolved.outcome,
        /*
         * Which record made the week final, recorded rather than assumed.
         *
         * *"Which of these did we trust"* is the first question anybody asks
         * about a settlement they disagree with, and the two sources were
         * written by different things at different times — the Tuesday job on a
         * Tuesday, or the season close in January.
         */
        resolvedFrom: week.finality.source ?? 'season_closed',
        resolvedWeek: input.week,
        claimedByUserId: claimant,
        evidence: resolved.evidence as unknown as Record<string, unknown>,
        resolvedAt: at,
      });

      let paid = 0;

      if (stake.kind === 'TONYS_LINE') {
        paid = await payMarket(tx, stake, week, at);
      } else if (stake.kind === 'BOUNTY' && claimant !== null && stake.rewardTokens !== null) {
        await applyTokenDelta(tx, {
          userId: claimant,
          seasonId: stake.seasonId,
          amount: stake.rewardTokens,
          reason: 'STAKE_PAYOUT',
          description: 'The bounty off the board.',
          idempotencyKey: payoutKeyFor(stake.settlementKey, claimant),
          sourceRef: stake.id,
        });
        paid = stake.rewardTokens;
      }

      /*
       * The status moves last, and only from `open`.
       *
       * `reject_settled_stake_change` refuses a second transition, so this is a
       * third independent guard against a stake being settled twice — the
       * resolution's UNIQUE is the first, the entry's settle-once trigger the
       * second.
       */
      await tx
        .update(weeklyStakes)
        .set({
          status: resolved.outcome === 'unclaimed' ? 'expired' : 'resolved',
          updatedAt: at,
        })
        .where(and(eq(weeklyStakes.id, stake.id), eq(weeklyStakes.status, 'open')));

      return {
        status: 'settled' as const,
        outcome: resolved.outcome,
        paid,
        evidence: resolved.evidence,
      };
    });
  } catch (error: unknown) {
    /*
     * A concurrent settler got there first.
     *
     * The UNIQUE on `stake_id` is the mechanism, and losing that race is not an
     * error — it is the guarantee working. Read the winner's resolution back and
     * report it, exactly as opening an already-opened box does.
     */
    if (isUniqueViolation(error)) {
      const stored = (await resolutionsFor(db, [stake.id])).get(stake.id);
      if (stored !== undefined) {
        return {
          status: 'already_settled',
          outcome: stored.outcome,
          evidence: stored.evidence,
        };
      }
    }
    throw error;
  }
}

/**
 * Pay every entry on a settled market.
 *
 * A losing entry is written too — `outcome: 'lost'`, `payoutTokens: 0` — and no
 * ledger row is created for it, because a zero-amount transaction is refused by
 * `token_transactions_amount_non_zero` and would be meaningless anyway. The
 * entry row is the record that it was settled; the ledger records only movement.
 */
async function payMarket(
  tx: Queryable,
  stake: Stake,
  week: WeekResult,
  at: Date,
): Promise<number> {
  const line = lineCentsOf(stake.factRefs);
  if (line === null || stake.stakeTokens === null || stake.rewardTokens === null) return 0;

  const entries = await tx
    .select({
      id: stakeEntries.id,
      userId: stakeEntries.userId,
      side: stakeEntries.side,
      stakedTokens: stakeEntries.stakedTokens,
      settledAt: stakeEntries.settledAt,
    })
    .from(stakeEntries)
    .where(eq(stakeEntries.stakeId, stake.id));

  let paid = 0;

  for (const entry of entries) {
    if (entry.settledAt !== null) continue;

    const team = week.teams.find((candidate) => candidate.managerId === entry.userId) ?? null;

    const verdict = settleEntry({
      side: entry.side as Side,
      stakedTokens: entry.stakedTokens,
      rewardTokens: stake.rewardTokens,
      lineCents: line,
      team,
    });

    await tx
      .update(stakeEntries)
      .set({
        outcome: verdict.outcome,
        payoutTokens: verdict.payoutTokens,
        settledAt: at,
      })
      .where(and(eq(stakeEntries.id, entry.id), sql`${stakeEntries.settledAt} is null`));

    if (verdict.payoutTokens > 0) {
      await applyTokenDelta(tx, {
        userId: entry.userId,
        seasonId: stake.seasonId,
        amount: verdict.payoutTokens,
        reason: 'STAKE_PAYOUT',
        description:
          verdict.outcome === 'push'
            ? "Your side of Tony's Line, handed back."
            : "Your side of Tony's Line, paid.",
        idempotencyKey: payoutKeyFor(stake.settlementKey, entry.userId),
        sourceRef: stake.id,
      });
      paid += verdict.payoutTokens;
    }
  }

  return paid;
}

/**
 * Settle everything a season has open, walking each stake forward.
 *
 * A bounty is checked against **every** week from the one it opened in, in order,
 * so the earliest week that clears the target is the one that claims it — a
 * bounty is not awarded to whoever the settler happened to look at first. A line
 * or a prediction is checked against its own week only.
 *
 * Safe to run repeatedly: every stake it has already settled comes back
 * `already_settled` and nothing moves.
 */
export async function settleSeason(
  db: Database,
  season: number,
): Promise<readonly { readonly stakeKey: string; readonly result: SettleResult }[]> {
  const out: { stakeKey: string; result: SettleResult }[] = [];

  for (const stake of await openStakes(db, season)) {
    const weeks =
      stake.kind === 'BOUNTY'
        ? range(stake.week, stake.expiresAfterWeek ?? stake.week)
        : [stake.week];

    let last: SettleResult = { status: 'not_yet', why: 'no week checked' };
    for (const week of weeks) {
      last = await settleStake(db, { stakeId: stake.id, season, week });
      if (last.status !== 'not_yet') break;
    }
    out.push({ stakeKey: stake.stakeKey, result: last });
  }

  return out;
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let week = from; week <= to; week += 1) out.push(week);
  return out;
}

/**
 * Withdraw a stake, with a reason.
 *
 * The row survives — a stake that was shown to the league and then withdrawn is
 * history rather than a mistake to delete, and `weekly_stakes_undeletable` makes
 * that structural. `weekly_stakes_void_has_reason` makes the reason mandatory in
 * exactly this state, so *"suppressed, and nobody wrote down why"* is not a shape
 * the table can hold.
 */
export async function voidStake(
  db: Database,
  input: { readonly stakeId: string; readonly reason: string },
): Promise<boolean> {
  const updated = await db
    .update(weeklyStakes)
    .set({ status: 'void', voidReason: input.reason, voidedAt: now(), updatedAt: now() })
    .where(and(eq(weeklyStakes.id, input.stakeId), eq(weeklyStakes.status, 'open')))
    .returning({ id: weeklyStakes.id });

  return updated.length > 0;
}
