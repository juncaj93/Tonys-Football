import { getPool } from '@/lib/db';

/**
 * Deploy health check.
 *
 * Exists to answer one question from a phone, with no login: *is the build I
 * just pushed actually the build that is live, and can it reach its database?*
 * Without it, "the deploy succeeded" is a claim about Vercel's UI rather than
 * about the running application.
 *
 * It reveals nothing an attacker could use — no connection string, no host, no
 * schema, no driver error text. A failure is logged server-side and reported
 * here as a single word.
 */

export const runtime = 'nodejs';
// Never cached, never prerendered: a stale health check is worse than none.
export const dynamic = 'force-dynamic';

interface HealthBody {
  readonly status: 'ok' | 'degraded';
  /** The commit Vercel built. `unknown` outside Vercel. */
  readonly commit: string;
  readonly database: 'reachable' | 'unreachable' | 'unconfigured';
}

export async function GET(): Promise<Response> {
  const commit = process.env['VERCEL_GIT_COMMIT_SHA'] ?? 'unknown';

  if ((process.env['DATABASE_URL'] ?? '') === '') {
    return json({ status: 'degraded', commit, database: 'unconfigured' }, 503);
  }

  try {
    await getPool().query('select 1');
    return json({ status: 'ok', commit, database: 'reachable' }, 200);
  } catch (error: unknown) {
    // The detail belongs in the runtime log, not in the response body.
    console.error('Health check could not reach the database:', error);
    return json({ status: 'degraded', commit, database: 'unreachable' }, 503);
  }
}

function json(body: HealthBody, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}
