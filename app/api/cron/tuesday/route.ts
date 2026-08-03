import { now } from '@/lib/clock';
import { openSeason } from '@/lib/counter/tokens';
import { getDb } from '@/lib/db';
import { suggestedDraftWeek } from '@/lib/slice/publication';
import { runTuesday } from '@/lib/slice/tuesday';

/**
 * The Tuesday job's door.
 *
 * `16 §4.3` allows exactly two scheduled jobs and this is the second: close the
 * week, settle what was riding on it, put next week on the board, and draft the
 * Slice onto the press desk. `lib/slice/tuesday.ts` is the job; this file is
 * only the door and the clock.
 *
 * ## It is a shared secret, not an IP allowlist
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` on a scheduled invocation.
 * That is the whole check, and it is deliberately the whole check: an allowlist
 * of Vercel's egress ranges is a list that changes without telling you, and the
 * route writes to the league's own record.
 *
 * **With `CRON_SECRET` unset the route refuses everything.** Not "runs
 * unprotected in development" — a job that quietly works without its secret is a
 * job whose secret nobody notices is missing. `docs/DEPLOYMENT.md` carries the
 * value; nothing in this repository ever logs it.
 *
 * The comparison is length-checked first and then constant-time, because a
 * naive `===` on a secret leaks its length and prefix to anyone who can time a
 * request.
 *
 * ## It never publishes
 *
 * `runTuesday` ends at `submit: true`. `16 §9` makes commissioner approval
 * mandatory in season one and `docs/SLICE_REVIEW_BOUNDARY.md` makes it
 * permanent, so the draft lands on the desk and stops. There is no parameter on
 * this route that can change that, which is the point of there being no
 * parameter on this route at all.
 *
 * ## Which week it runs
 *
 * The open season's most recent week with results — the week that has just been
 * played, which is what a Tuesday is about. Overridable by `?week=` **only** with
 * the same secret, because a commissioner re-running a missed Tuesday should not
 * need a deploy, and because every operation underneath is idempotent so a
 * repeated week is a read.
 */

export const runtime = 'nodejs';
// A cached cron response would be a job that appears to run and does not.
export const dynamic = 'force-dynamic';

/** Constant-time once the lengths match. */
function secretMatches(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i += 1) {
    diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function authorized(request: Request, env: NodeJS.ProcessEnv): boolean {
  const expected = env['CRON_SECRET'] ?? '';
  // Unset means the door is shut, not that it is open.
  if (expected === '') return false;

  const header = request.headers.get('authorization') ?? '';
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) return false;

  return secretMatches(header.slice(prefix.length), expected);
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request, process.env)) {
    /*
     * 404, not 401.
     *
     * The same reasoning as `requireAdmin()`, which answers `notFound()`: a 401
     * confirms the route exists and is worth attacking. A 404 says nothing.
     */
    return new Response('Not found', { status: 404 });
  }

  const db = getDb();
  const season = await openSeason(db);

  if (season === null) {
    /*
     * No open season. Not an error and not a retry: in July there is nothing to
     * close, and a non-2xx here would have the platform retry an empty job every
     * few minutes until September.
     */
    return json({ ran: false, why: 'There is no open season, so there is no week to close.' }, 200);
  }

  const requested = new URL(request.url).searchParams.get('week');
  const parsed = requested === null ? null : Number.parseInt(requested, 10);
  const week =
    parsed !== null && Number.isInteger(parsed) && parsed >= 1 && parsed <= 18
      ? parsed
      : await suggestedDraftWeek(db, season.year);

  try {
    const report = await runTuesday(db, { season: season.year, week, at: now() });

    /*
     * A step that **threw** is a failure even though the chain finished around
     * it. 500 so the platform retries — safe because every operation underneath
     * is idempotent, and necessary because the alternative is a mis-seeded
     * economy failing silently every Tuesday behind a 200.
     *
     * The report goes in the body either way: whoever is holding the secret is
     * the person who needs to know which step it was.
     */
    return json({ ran: true, report }, report.failed.length === 0 ? 200 : 500);
  } catch (error: unknown) {
    /*
     * A thrown step is the only failure. 500 so the platform retries, which is
     * safe precisely because every operation the job performs is idempotent —
     * see the table in `lib/slice/tuesday.ts`.
     *
     * The detail goes to the runtime log rather than into the body: this
     * response is readable by anyone holding the secret, and a driver error can
     * carry a connection string.
     */
    console.error('The Tuesday job failed:', error);
    return json({ ran: false, why: 'The job failed. See the runtime log.' }, 500);
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
