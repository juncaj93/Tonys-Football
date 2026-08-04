import { now } from '@/lib/clock';
import { openSeason } from '@/lib/counter/tokens';
import { cronAuthorized, cronJson, cronNotFound } from '@/lib/cron/secret';
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
 * ## The door is shared with Sunday
 *
 * `lib/cron/secret.ts`, and it used to be a private copy here. Two copies of a
 * security check is a fix applied to one door and not the other — with
 * `CRON_SECRET` unset **both** routes refuse everything, and that has to stay
 * one sentence rather than two implementations of it.
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

export async function GET(request: Request): Promise<Response> {
  if (!cronAuthorized(request, process.env)) return cronNotFound();

  const db = getDb();
  const season = await openSeason(db);

  if (season === null) {
    /*
     * No open season. Not an error and not a retry: in July there is nothing to
     * close, and a non-2xx here would have the platform retry an empty job every
     * few minutes until September.
     */
    return cronJson(
      { ran: false, why: 'There is no open season, so there is no week to close.' },
      200,
    );
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
    return cronJson({ ran: true, report }, report.failed.length === 0 ? 200 : 500);
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
    return cronJson({ ran: false, why: 'The job failed. See the runtime log.' }, 500);
  }
}
