import { and, desc, eq, sql } from 'drizzle-orm';

import { now } from '@/lib/clock';
import { rollBelow } from '@/lib/counter/rng';
import { applyTokenDelta } from '@/lib/counter/tokens';
import { type Database } from '@/lib/db';
import { isBalanceViolation } from '@/lib/db/errors';
import { slotSpins } from '@/lib/db/schema';

import { type Symbol } from './slots-model';
import { casinoTableFor, reelSpan, resolve, symbolFor } from './table';

/**
 * Taking a spin.
 *
 * `09 §12`'s casino-integrity list is the whole contract for this file:
 * server-generated outcome · validated bet amount · sufficient-token check ·
 * atomic bet and payout · idempotency · rejection of replayed requests · **no
 * client-authoritative result**. Every one of them is satisfied by a database
 * mechanism rather than by care taken here.
 *
 * ## The client sends a stake and a token, and receives what happened
 *
 * That is the entire protocol. No symbols go up, no paytable comes down, and the
 * browser has no way to influence the outcome — it cannot even see the strip.
 * The reels are animated onto a result the server already committed
 * (`04 §11`).
 *
 * ## Exactly once, and four mechanisms in the order they engage
 *
 *   1. **A transaction-scoped advisory lock on the manager.** Taken first,
 *      always, so one manager's spins serialize against each other and nobody
 *      else's. `openBox` needed this for the collection read; this needs it so
 *      the replay check, the interval check and the debit cannot interleave with
 *      a second request from the same thumb.
 *   2. **The replay read.** A spin already recorded under this key comes back
 *      unchanged. This is the path a double tap actually takes and it is not an
 *      error path.
 *   3. **`slot_spins.spin_key UNIQUE`.** The backstop, for the case the lock is
 *      ever bypassed — a different caller, a hand-run statement, a refactor that
 *      forgets it. The insert fails rather than minting a second spin.
 *   4. **`token_transactions.idempotency_key UNIQUE`**, inside
 *      `apply_token_delta`, both keys derived from the spin key. Even a spin row
 *      that somehow vanished could not cause a second debit.
 *
 * All of it inside one transaction, so a failure anywhere leaves the tab exactly
 * as it was rather than half-charged.
 *
 * ## R13's accounting, and why it is two rows rather than one
 *
 * The wager and the payout are **distinct audited movements**. That is the
 * ruling, and it is also forced: a returned stake would be a net delta of zero
 * and `apply_token_delta` refuses zero outright. There is no net-only
 * representation available even if one were wanted.
 */

/** A stake the machine will not take, and why the caller cannot pick one. */
export type SpinRefusal =
  /** Not one of the paytable's buttons. The client offers three; anything else is crafted. */
  | 'stake_not_offered'
  /** The balance would have gone negative. The database refused it. */
  | 'insufficient_tokens'
  /**
   * Too soon after the last spin.
   *
   * R9: a **technical correctness rule, not a behavioural restriction.** There is
   * no daily cap and no session quota; this exists so a held-down button or a
   * retrying client cannot place wagers the manager did not intend to place.
   */
  | 'too_fast'
  /** No open season, so there is no wallet to charge. */
  | 'closed';

export interface SpinRecord {
  readonly id: string;
  readonly symbols: readonly [Symbol, Symbol, Symbol];
  readonly stake: number;
  readonly payout: number;
  readonly line: 'three' | 'pair' | 'nothing';
  /**
   * This spin had already been taken, and this is the record of it.
   *
   * Not an error. A refresh mid-animation and a second tap both land here, and
   * both must show the same reels rather than spinning again.
   */
  readonly replayed: boolean;
}

export type SpinResult =
  | { readonly status: 'spun'; readonly spin: SpinRecord }
  | { readonly status: 'refused'; readonly reason: SpinRefusal; readonly balance?: number };

/**
 * The shortest gap the machine will accept between two spins from one manager.
 *
 * Long enough that a double tap or a retried request is refused, short enough
 * that it never interrupts somebody playing. It is deliberately **not** a
 * rate limit in the throttling sense — R9 forbids arbitrary quotas, and a
 * manager who wants to spin for an hour may.
 *
 * Evaluated **inside the transaction**, against the manager's own last row,
 * under the advisory lock. An in-memory limiter would be worse than nothing
 * here: serverless functions share no memory between invocations, so it would
 * look like a control and do nothing.
 */
export const MIN_SPIN_INTERVAL_MS = 600;

export async function spin(
  db: Database,
  input: {
    readonly userId: string;
    /** Resolved by the caller. `null` means the books are shut everywhere. */
    readonly seasonId: string | null;
    /** Names this spin. A replay returns the recorded one. Namespaced server-side. */
    readonly spinKey: string;
    readonly stake: number;
  },
): Promise<SpinResult> {
  if (input.seasonId === null) return { status: 'refused', reason: 'closed' };
  const seasonId = input.seasonId;

  const { version, table } = await casinoTableFor(db);

  try {
    return await db.transaction(async (tx) => {
      /*
       * The manager's turnstile. `pg_advisory_xact_lock` releases at commit or
       * rollback with no unlock call to forget, which is the property that
       * matters in a function with several early returns.
       */
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`casino:${input.userId}`})::bigint)`,
      );

      const existing = await tx
        .select({
          id: slotSpins.id,
          symbols: slotSpins.symbols,
          stake: slotSpins.stakeTokens,
          payout: slotSpins.payoutTokens,
        })
        .from(slotSpins)
        .where(and(eq(slotSpins.spinKey, input.spinKey), eq(slotSpins.userId, input.userId)))
        .limit(1);

      const replay = existing[0];
      if (replay !== undefined) {
        const symbols = replay.symbols as [Symbol, Symbol, Symbol];
        return {
          status: 'spun' as const,
          spin: {
            id: replay.id,
            symbols,
            stake: replay.stake,
            payout: replay.payout,
            // Read back rather than recomputed: a replay must show what
            // happened, not what would happen if it happened now.
            line: resolve(symbols, table).line,
            replayed: true,
          },
        };
      }

      /*
       * The stake must be one the machine offers.
       *
       * Checked against the **stored** table rather than a constant, so a
       * re-tuned set of buttons takes effect by being seeded. A client sending
       * anything else is not a manager with an unusual preference; it is a
       * crafted request, and `18 §4.3`'s "the client never decides" covers the
       * amount as much as the outcome.
       */
      if (!table.wagers.includes(input.stake)) {
        return { status: 'refused' as const, reason: 'stake_not_offered' as const };
      }

      const at = now();

      const last = await tx
        .select({ createdAt: slotSpins.createdAt })
        .from(slotSpins)
        .where(eq(slotSpins.userId, input.userId))
        .orderBy(desc(slotSpins.createdAt))
        .limit(1);

      const previous = last[0]?.createdAt;
      if (previous !== undefined && at.getTime() - previous.getTime() < MIN_SPIN_INTERVAL_MS) {
        return { status: 'refused' as const, reason: 'too_fast' as const };
      }

      /*
       * The debit goes first, exactly as `purchaseBox` argues: the balance is
       * enforced by `apply_token_delta`, so if the tab cannot cover it the
       * `CHECK` fails and no spin is ever recorded. **Nothing here reads a
       * balance and decides** — a read-then-check is a race, and two spins
       * arriving together would both pass it.
       */
      const wagerTxId = await applyTokenDelta(tx, {
        userId: input.userId,
        seasonId,
        amount: -input.stake,
        reason: 'CASINO_WAGER',
        // `03 §5` requires human-readable text. Curated, not generated.
        description: 'A pull on the machine downstairs.',
        idempotencyKey: `casino:slots:wager:${input.spinKey}`,
      });

      /*
       * Three independent draws, on the server, recorded.
       *
       * `rollBelow` is the product's one randomness source — `crypto.randomInt`,
       * injectable exactly like the clock, never `Math.random`. The rolls are
       * stored, so the outcome stays recomputable from the row and the table
       * version by anybody who doubts it.
       */
      const span = reelSpan(table);
      const rolls = [rollBelow(span), rollBelow(span), rollBelow(span)] as const;
      const symbols = [
        symbolFor(rolls[0], table),
        symbolFor(rolls[1], table),
        symbolFor(rolls[2], table),
      ] as [Symbol, Symbol, Symbol];

      const outcome = resolve(symbols, table);
      const payout = outcome.multiplier * input.stake;

      let payoutTxId: string | null = null;
      if (payout > 0) {
        payoutTxId = await applyTokenDelta(tx, {
          userId: input.userId,
          seasonId,
          amount: payout,
          reason: 'CASINO_PAYOUT',
          description: 'The machine downstairs pays out.',
          idempotencyKey: `casino:slots:payout:${input.spinKey}`,
        });
      }

      const written = await tx
        .insert(slotSpins)
        .values({
          userId: input.userId,
          seasonId,
          spinKey: input.spinKey,
          stakeTokens: input.stake,
          tableVersion: version,
          rolls: [...rolls],
          symbols,
          payoutTokens: payout,
          wagerTxId,
          payoutTxId,
          createdAt: at,
        })
        .returning({ id: slotSpins.id });

      const row = written[0];
      if (row === undefined) throw new Error('the spin was not recorded');

      return {
        status: 'spun' as const,
        spin: {
          id: row.id,
          symbols,
          stake: input.stake,
          payout,
          line: outcome.line,
          replayed: false,
        },
      };
    });
  } catch (error: unknown) {
    // The one expected failure: the balance check refused the wager. Every other
    // error is a real fault and must keep propagating.
    if (isBalanceViolation(error)) {
      return { status: 'refused', reason: 'insufficient_tokens' };
    }
    throw error;
  }
}

/**
 * A manager's own recent spins.
 *
 * **Theirs only.** R10 makes casino history private in v1: no leaderboard, no
 * activity feed, no public volume. The `userId` filter is not a convenience —
 * it is the ruling, and there is deliberately no function in this module that
 * reads anybody else's.
 */
export async function recentSpins(
  db: Database,
  userId: string,
  limit = 10,
): Promise<readonly { symbols: readonly string[]; stake: number; payout: number; at: Date }[]> {
  const rows = await db
    .select({
      symbols: slotSpins.symbols,
      stake: slotSpins.stakeTokens,
      payout: slotSpins.payoutTokens,
      at: slotSpins.createdAt,
    })
    .from(slotSpins)
    .where(eq(slotSpins.userId, userId))
    .orderBy(desc(slotSpins.createdAt))
    .limit(limit);

  return rows;
}
