import { expect } from 'vitest';

/**
 * Re-exported so every existing caller is unchanged.
 *
 * It lives in `./reset` because this file imports vitest, and a vitest import
 * cannot be loaded from a plain `tsx` script — see that module's header.
 */
export { resetDatabase } from './reset';

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
