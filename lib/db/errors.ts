/**
 * Recognising the database's expected refusals.
 *
 * ## Matched on the constraint name, never on the message
 *
 * Drizzle wraps driver errors, so `error.message` is only *"Failed query: …"*.
 * Matching on it would also swallow an unrelated check violation and report it
 * to a manager as *"you cannot afford this"* — a lie that looks like a feature.
 * The first version of the stakes service did exactly that and a test caught it:
 * a refused pick threw instead of returning `insufficient_tokens`.
 *
 * ## Why this file exists at all
 *
 * `isBalanceViolation` was written twice, identically, in `lib/counter/boxes.ts`
 * and `lib/stakes/service.ts` — each with its own copy of the wrapped-cause walk.
 * The casino would have been the third, and three copies of a security-adjacent
 * predicate is three places for one of them to drift into matching a message.
 *
 * **This is the extraction and nothing more.** No error taxonomy, no result
 * wrapper, no retry policy — the two callers that existed keep behaving exactly
 * as they did, and the new one gets the same predicate rather than a fourth
 * opinion about it.
 */

/** Postgres SQLSTATEs this product actually recognises. */
const CHECK_VIOLATION = '23514';

/**
 * Walk an error and its `cause` chain for a specific constraint failure.
 *
 * Bounded rather than recursive: a cycle in a driver's error chain would
 * otherwise hang the request, and five is deeper than any wrapper in this stack.
 */
export function hasConstraint(error: unknown, code: string, constraint: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== 'object' || current === null) return false;
    const candidate = current as { code?: string; constraint?: string; cause?: unknown };
    if (candidate.code === code && candidate.constraint === constraint) return true;
    current = candidate.cause;
  }
  return false;
}

/**
 * Was this the overdraft CHECK refusing a debit?
 *
 * The single question every spending path in this product asks, and the reason
 * none of them reads a balance and decides for itself. `16 §5.4`: overdraft is
 * refused by `CHECK (token_balance >= 0)`, never by a read-then-check in a
 * service — a read-then-check is a race that two concurrent purchases both pass.
 */
export function isBalanceViolation(error: unknown): boolean {
  return hasConstraint(error, CHECK_VIOLATION, 'season_memberships_token_balance_non_negative');
}
