import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

/**
 * Database access.
 *
 * `16 §4.2`: there is no database client in the browser. Every query runs in a
 * server action or route handler, and the `anon` role's privileges are revoked
 * entirely. Authorization is one server-side layer rather than RLS policies
 * duplicating application logic.
 *
 * The driver is plain `node-postgres`. Neon accepts standard Postgres
 * connections, so the same code serves local Docker and hosted Neon — point
 * `DATABASE_URL` at Neon's *pooled* connection string in serverless
 * environments so the pool cannot exhaust connections.
 */

declare global {
  var __tonysPool: Pool | undefined;
}

function connectionString(): string {
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url === '') {
    throw new Error(
      'DATABASE_URL is not set. Start local Postgres with `npm run db:up`, ' +
        'then copy .env.example to .env.local.',
    );
  }
  return url;
}

/**
 * A single pool per process.
 *
 * Cached on `globalThis` so Next's dev-server hot reload does not open a new
 * pool on every edit and exhaust the database's connection limit.
 */
export function getPool(): Pool {
  if (globalThis.__tonysPool === undefined) {
    globalThis.__tonysPool = new Pool({
      connectionString: connectionString(),
      // Small: ten users, and serverless functions each hold their own pool.
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return globalThis.__tonysPool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}

/**
 * The database handle.
 *
 * Services take this as a parameter rather than reaching for `getDb()`
 * themselves, so a test can hand them a connection pointed at a scratch
 * database and no service can accidentally talk to production.
 */
export type Database = ReturnType<typeof getDb>;

/** Close the pool. Tests and graceful shutdown only. */
export async function closePool(): Promise<void> {
  if (globalThis.__tonysPool !== undefined) {
    await globalThis.__tonysPool.end();
    globalThis.__tonysPool = undefined;
  }
}

export { schema };
