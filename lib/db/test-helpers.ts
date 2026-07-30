import { sql } from 'drizzle-orm';
import { expect } from 'vitest';

import { type Database } from './index';

/**
 * Assert that a query failed with a specific Postgres error.
 *
 * Drizzle wraps driver errors, so the message on the thrown error is only
 * "Failed query: ...". The useful detail — SQLSTATE and the constraint name —
 * lives on `.cause`.
 *
 * Asserting on the SQLSTATE code and the constraint name is also stricter than
 * matching the message text: it proves *which* constraint fired, not merely
 * that something went wrong.
 */

/**
 * Empty every application table.
 *
 * One statement, listing the tables by name, rather than each test file
 * deleting the handful it happens to know about. The foreign keys are
 * `RESTRICT` by design — a person is never deleted out from under their own
 * history — so a file that truncates `users` while another table still
 * references a row fails, and it fails in whichever test file happens to run
 * first rather than in the one that added the table.
 *
 * `CASCADE` here follows the constraint graph within the truncation itself; it
 * cannot reach anything outside this list.
 *
 * **Add new tables to this list.** A missing table means a test starting from
 * a state some earlier file left behind.
 *
 * On finalized seasons: `TRUNCATE` does not fire the row-level triggers that
 * make a finalized season's memberships immutable, so this works without
 * un-finalizing anything first. That is not a hole in the guarantee —
 * `TRUNCATE` needs table ownership, which no application code path holds, and
 * the guard exists to stop an UPDATE or DELETE that an importer, a script, or a
 * hand-run statement could plausibly issue. A test harness that owns the
 * database is outside that threat model by construction.
 */
export async function resetDatabase(db: Database): Promise<void> {
  await db.execute(
    sql`truncate table
      content_usage_log,
      content_entries,
      admin_audit_logs,
      auth_attempts,
      sessions,
      collectibles,
      box_openings,
      loot_boxes,
      reward_tables,
      -- Listed rather than left to the cascade. fantasy_matchups is reached
      -- transitively through seasons, so omitting it happened to work; and
      -- significance_policies has no foreign key at all, so it would have
      -- survived every reset. A table that empties only by accident is a table
      -- that stops emptying the moment its constraints change.
      fantasy_matchups,
      significance_policies,
      token_transactions,
      economy_configs,
      season_memberships,
      seasons,
      sync_runs,
      users
    restart identity cascade`,
  );
}

/** https://www.postgresql.org/docs/current/errcodes-appendix.html */
export const PG_ERROR = {
  uniqueViolation: '23505',
  foreignKeyViolation: '23503',
  notNullViolation: '23502',
  checkViolation: '23514',
} as const;

export type PgErrorCode = (typeof PG_ERROR)[keyof typeof PG_ERROR];

interface PostgresError {
  code?: string;
  constraint?: string;
  detail?: string;
}

function unwrap(error: unknown): PostgresError {
  let current: unknown = error;

  // Walk the cause chain to the driver error.
  for (let depth = 0; depth < 5; depth++) {
    if (typeof current !== 'object' || current === null) break;
    if ('code' in current && typeof (current as PostgresError).code === 'string') {
      return current as PostgresError;
    }
    current = (current as { cause?: unknown }).cause;
  }

  throw new Error(
    `Expected a Postgres error with a SQLSTATE code, got: ${String(error)}`,
  );
}

/**
 * Assert that a query failed with a specific Postgres **message**.
 *
 * For errors a `RAISE EXCEPTION` in plpgsql produces, where the useful
 * information is the sentence rather than the SQLSTATE — `apply_token_delta`
 * raises four distinct refusals that all share code `23514` or `23503`, so a code
 * assertion cannot tell them apart.
 *
 * Walks the cause chain for the same reason `expectPgError` does: drizzle wraps
 * driver errors, so `error.message` is only "Failed query: …" and matching on it
 * would pass for any failure at all — including the query being malformed.
 */
export async function expectPgMessage(
  promise: Promise<unknown>,
  expected: RegExp,
): Promise<void> {
  let thrown: unknown;

  try {
    await promise;
  } catch (error: unknown) {
    thrown = error;
  }

  expect(thrown, 'expected the query to fail, but it succeeded').toBeDefined();

  const messages: string[] = [];
  let current: unknown = thrown;
  for (let depth = 0; depth < 5; depth++) {
    if (typeof current !== 'object' || current === null) break;
    const message = (current as { message?: unknown }).message;
    if (typeof message === 'string') messages.push(message);
    current = (current as { cause?: unknown }).cause;
  }

  expect(
    messages.some((message) => expected.test(message)),
    `expected one of these messages to match ${expected.source}:\n  ${messages.join('\n  ')}`,
  ).toBe(true);
}

export async function expectPgError(
  promise: Promise<unknown>,
  expected: { code: PgErrorCode; constraint?: string },
): Promise<void> {
  let thrown: unknown;

  try {
    await promise;
  } catch (error: unknown) {
    thrown = error;
  }

  expect(thrown, 'expected the query to fail, but it succeeded').toBeDefined();

  const pgError = unwrap(thrown);
  expect(pgError.code).toBe(expected.code);

  if (expected.constraint !== undefined) {
    expect(pgError.constraint).toBe(expected.constraint);
  }
}
