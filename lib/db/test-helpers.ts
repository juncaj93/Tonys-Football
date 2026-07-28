import { expect } from 'vitest';

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
