import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import { type Queryable } from '@/lib/db';
import {
  seasonMemberships,
  seasons,
  tokenTransactions,
  weeklyRewards,
} from '@/lib/db/schema';

/**
 * What arrived while nobody was looking — the data a first-login receipt reads.
 *
 * ## A read model, and only a read model
 *
 * This builds **no UI, adds no route and writes nothing.** It answers one
 * question — *"what has been credited to this manager that they did not do
 * themselves?"* — in a shape a receipt can print without deciding anything.
 * `MANDATE §9` puts fantasy facts behind Stats; this is the same instinct
 * applied to money: the surface that eventually renders a receipt should be
 * choosing type sizes, not choosing which transactions count.
 *
 * ## The rule for what is on it: credits the manager did not initiate
 *
 * A box purchase, a stake placed and a casino wager are all things a manager did
 * with their thumb, seconds ago, on a screen that told them so. They do not need
 * a receipt on their next login. What does need one is money that **moved while
 * they were not here**: a Tuesday cron paying a week they won, and a one-off
 * thank-you the commissioner decided off the platform entirely.
 *
 * So the receipt is exactly the three reasons this workstream owns:
 *
 * | Reason | Where it comes from |
 * |---|---|
 * | `MATCHUP_WIN` | `weekly_rewards`, which carries the week and the score |
 * | `WEEKLY_HIGH_SCORE` | `weekly_rewards`, likewise |
 * | `EARLY_DUES_BONUS` | the ledger, which is the whole record (`0022`) |
 *
 * **`STAKE_PAYOUT` and `SEASON_START` are deliberately absent**, and neither is
 * an oversight. A settled stake is credited unattended and has an equally good
 * claim to a receipt — it belongs to `lib/stakes/` and adding it from here would
 * be this slice deciding another module's surface. An opening balance is not
 * news on a *first* login; it is the reason there is a balance at all. Both are
 * one entry each in {@link RECEIPT_REASONS} the day somebody owns that decision.
 *
 * ## There is no seen/unseen state, and that is a decision
 *
 * A receipt that shows each credit once needs a per-manager read watermark, and a
 * watermark across heterogeneous events is precisely the `league_events` spine
 * that `CLAUDE.md` records as **deliberately deferred** — *"revisit only when a
 * concrete feature needs … per-manager read/unread state"*. A surface does not
 * exist yet, so building the watermark now would be creating the deferred spine
 * to satisfy a screen nobody has designed. What is here is the complete list and
 * a stable order; a caller that eventually wants "since last time" can pass a
 * cutoff, which is one argument rather than one table.
 */

/** The reasons a receipt is about. Narrower than `LiveTokenReason` — see above. */
export const RECEIPT_REASONS = [
  'MATCHUP_WIN',
  'WEEKLY_HIGH_SCORE',
  'EARLY_DUES_BONUS',
] as const;

export type ReceiptReason = (typeof RECEIPT_REASONS)[number];

/** One credit, in the shape a receipt prints it. */
export interface ReceiptLine {
  readonly reason: ReceiptReason;
  /** Always positive: everything on a receipt is money arriving. */
  readonly amount: number;
  /** The curated sentence stored on the ledger row. Never generated here. */
  readonly description: string;
  /** When it landed, from the injected clock at award time. */
  readonly at: Date;
  /**
   * The week it came out of, or null for a credit that belongs to no week.
   *
   * Read from `weekly_rewards` rather than parsed out of the idempotency key.
   * A key is an identifier; treating it as a record is how a format change
   * becomes a data loss.
   */
  readonly week: number | null;
  /** What they scored, in cents, when the credit was earned on a score. */
  readonly pointsCents: number | null;
}

export interface FirstLoginReceipt {
  readonly seasonYear: number;
  readonly membershipId: string;
  /** The trigger-maintained column, read and never recomputed. `03 §5`. */
  readonly balance: number;
  /** Newest first — a receipt leads with what just happened. */
  readonly lines: readonly ReceiptLine[];
  /** What the lines add up to. **Not** a balance, and not offered as one. */
  readonly credited: number;
}

/**
 * Everything a manager was credited unattended this season, newest first.
 *
 * Returns null when they hold no seat that season — a real state rather than an
 * error, exactly as `wallet` treats it: a manager who joined in 2026 has no 2025
 * receipt, and inventing an empty one would make "no seat" and "a quiet season"
 * indistinguishable.
 *
 * `since` is the whole of the "only what is new" story. A caller that has
 * somewhere to record a watermark passes one; a caller that does not gets the
 * season. Nothing is stored either way.
 *
 * The balance is **read**, never summed from the lines. It is a trigger-maintained
 * column and the lines are a filtered subset of the ledger, so adding them up
 * would produce a second, wrong opinion about money — the same reason `/counter`
 * derives no running total.
 */
export async function firstLoginReceipt(
  db: Queryable,
  input: {
    readonly userId: string;
    readonly seasonYear: number;
    readonly since?: Date;
  },
): Promise<FirstLoginReceipt | null> {
  const [seat] = await db
    .select({
      membershipId: seasonMemberships.id,
      balance: seasonMemberships.tokenBalance,
    })
    .from(seasonMemberships)
    .innerJoin(seasons, eq(seasons.id, seasonMemberships.seasonId))
    .where(
      and(
        eq(seasonMemberships.userId, input.userId),
        eq(seasons.year, input.seasonYear),
      ),
    )
    .limit(1);

  if (seat === undefined) return null;

  const ledger = await db
    .select({
      id: tokenTransactions.id,
      reason: tokenTransactions.reasonCode,
      amount: tokenTransactions.amount,
      description: tokenTransactions.description,
      at: tokenTransactions.createdAt,
    })
    .from(tokenTransactions)
    .where(
      and(
        eq(tokenTransactions.seasonMembershipId, seat.membershipId),
        inArray(tokenTransactions.reasonCode, [...RECEIPT_REASONS]),
      ),
    )
    .orderBy(desc(tokenTransactions.createdAt), asc(tokenTransactions.id));

  /*
   * The week and the score, joined by transaction id rather than by reason.
   *
   * `weekly_rewards.token_transaction_id` is UNIQUE, so this is a genuine
   * one-to-one and a manager who won in week 3 and week 9 gets the right week on
   * the right line. Matching on the reason instead would collapse both onto
   * whichever row came back first, and the two lines would look identical.
   */
  const rewards = await db
    .select({
      transactionId: weeklyRewards.tokenTransactionId,
      week: weeklyRewards.week,
      pointsCents: weeklyRewards.pointsCents,
    })
    .from(weeklyRewards)
    .where(eq(weeklyRewards.seasonMembershipId, seat.membershipId));

  const basis = new Map(rewards.map((row) => [row.transactionId, row]));

  const lines: ReceiptLine[] = [];
  for (const row of ledger) {
    if (input.since !== undefined && row.at <= input.since) continue;
    const detail = basis.get(row.id);
    lines.push({
      reason: row.reason as ReceiptReason,
      amount: row.amount,
      description: row.description,
      at: row.at,
      week: detail?.week ?? null,
      pointsCents: detail?.pointsCents ?? null,
    });
  }

  return {
    seasonYear: input.seasonYear,
    membershipId: seat.membershipId,
    balance: seat.balance,
    lines,
    credited: lines.reduce((total, line) => total + line.amount, 0),
  };
}
