import 'server-only';

/**
 * The door both scheduled jobs stand behind.
 *
 * `16 §4.3` allows exactly two crons, and until this file existed the first one
 * carried its own copy of the check. Two copies of a security check is the
 * defect the RoomDisplay pass had just finished removing from the room's panels,
 * one layer down and with worse consequences: a fix applied to one door and not
 * the other leaves a door open, and nothing in the build notices.
 *
 * ## It is a shared secret, not an IP allowlist
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` on a scheduled invocation.
 * That is the whole check, and deliberately so: an allowlist of Vercel's egress
 * ranges is a list that changes without telling you, and these routes write to
 * the league's own record.
 *
 * ## Unset means shut
 *
 * **With `CRON_SECRET` unset every route refuses everything.** Not "runs
 * unprotected in development" — a job that quietly works without its secret is a
 * job whose secret nobody notices is missing. `docs/DEPLOYMENT.md` carries the
 * value; nothing in this repository ever logs it.
 *
 * ## And it answers 404
 *
 * The same reasoning as `requireAdmin()`: a 401 confirms the route exists and is
 * worth attacking. A 404 says nothing.
 */

/** Constant-time once the lengths match. */
function secretMatches(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i += 1) {
    diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * May this request run a scheduled job?
 *
 * The comparison is length-checked first and then constant-time, because a naive
 * `===` on a secret leaks its length and its prefix to anyone who can time a
 * request.
 */
export function cronAuthorized(request: Request, env: NodeJS.ProcessEnv): boolean {
  const expected = env['CRON_SECRET'] ?? '';
  // Unset means the door is shut, not that it is open.
  if (expected === '') return false;

  const header = request.headers.get('authorization') ?? '';
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) return false;

  return secretMatches(header.slice(prefix.length), expected);
}

/** What an unauthorized caller gets: nothing, and no confirmation of anything. */
export function cronNotFound(): Response {
  return new Response('Not found', { status: 404 });
}

/** A cron response is never cached — a cached job appears to run and does not. */
export function cronJson(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
