import { now } from '@/lib/clock';
import { cronAuthorized, cronJson, cronNotFound } from '@/lib/cron/secret';
import { getDb } from '@/lib/db';
import { runSundayJob } from '@/lib/slice/sunday';
import { createLiveSource } from '@/lib/sleeper/transport';

/**
 * The Sunday job's door — `16 §4.3`'s first cron.
 *
 * Photograph the week's scores before Monday, so the Tuesday paper can say
 * truthfully who came from behind. `lib/slice/sunday.ts` is the job; this file
 * is the door, the clock and the one sanctioned mid-week read of Sleeper.
 *
 * The door itself is `lib/cron/secret.ts`, shared with Tuesday. Two copies of a
 * security check is a fix applied to one door and not the other.
 *
 * ## Which week it photographs
 *
 * `runSundayJob` decides, from Sleeper's own `state`. `?week=` overrides, with
 * the same secret, for a commissioner re-running a missed Sunday against a week
 * Sleeper has already moved past. It cannot overwrite anything — see
 * `lib/stats/snapshot.ts`.
 *
 * ## It reads once and writes once
 *
 * `16 §4.3`: **"No live in-game score sync, ever. It is the fastest route to
 * becoming a worse Sleeper."** This route is the single exception the same
 * section carves out, and it is deliberately shaped so it cannot grow into the
 * thing that was banned: one endpoint, one insert, no loop, no schedule of its
 * own, and a table that refuses to be written twice.
 *
 * ## The source is constructed here and nowhere else
 *
 * That is the seam: everything below `runSundayJob` takes its Sleeper as a
 * parameter, so the whole job is drivable offline by the lifecycle rehearsal
 * (`lib/rehearsal/`) against a written season. It used to live in this file,
 * where the live source made it unreachable by any test — three real decisions
 * with no cover on them.
 */

export const runtime = 'nodejs';
// A cached cron response would be a job that appears to run and does not.
export const dynamic = 'force-dynamic';
/*
 * Two Sleeper requests and one insert, so this has headroom the Tuesday job does
 * not. Declared anyway, and equal to it: a retry policy that differs between two
 * jobs behind the same door is a difference somebody has to remember.
 */
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  if (!cronAuthorized(request, process.env)) return cronNotFound();

  const requested = new URL(request.url).searchParams.get('week');
  const parsed = requested === null ? null : Number.parseInt(requested, 10);

  try {
    const outcome = await runSundayJob(getDb(), {
      source: createLiveSource(),
      at: now(),
      requestedWeek: Number.isNaN(parsed ?? Number.NaN) ? null : parsed,
    });

    if (outcome.kind === 'ran') {
      return cronJson(
        { ran: true, report: outcome.report, warnings: outcome.warnings },
        200,
      );
    }

    /*
     * `nothing-to-do` is a 200 and `upstream-failed` is a 500 so the platform
     * retries — safe, because the storage refuses a second capture of a week, so
     * a retry either photographs a week that has none or does nothing at all.
     */
    if (outcome.kind === 'upstream-failed') {
      console.error('The Sunday job could not read Sleeper:', outcome.why);
      return cronJson({ ran: false, why: outcome.why }, 500);
    }

    return cronJson({ ran: false, why: outcome.why }, 200);
  } catch (error: unknown) {
    /*
     * The detail goes to the runtime log rather than into the body: this
     * response is readable by anyone holding the cron secret, and a driver error
     * can carry a connection string.
     */
    console.error('The Sunday job failed:', error);
    return cronJson({ ran: false, why: 'The job failed. See the runtime log.' }, 500);
  }
}
