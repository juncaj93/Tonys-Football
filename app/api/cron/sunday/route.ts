import { eq } from 'drizzle-orm';

import { now } from '@/lib/clock';
import { openSeason } from '@/lib/counter/tokens';
import { cronAuthorized, cronJson, cronNotFound } from '@/lib/cron/secret';
import { getDb } from '@/lib/db';
import { seasons } from '@/lib/db/schema';
import { runSunday } from '@/lib/slice/sunday';
import { decodeMatchups, decodeState } from '@/lib/sleeper/codec';
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
 * Sleeper's own `state`, not a stored week. Tuesday asks *"which week has just
 * been played"* and reads that from the database; Sunday asks *"which week is
 * being played right now"*, and the only authority on that is the upstream. A
 * stored answer would be last week's for the entire duration of this one.
 *
 * `?week=` overrides, with the same secret, for a commissioner re-running a
 * missed Sunday against a week Sleeper has already moved past. It cannot
 * overwrite anything — see `lib/stats/snapshot.ts`.
 *
 * ## It reads once and writes once
 *
 * `16 §4.3`: **"No live in-game score sync, ever. It is the fastest route to
 * becoming a worse Sleeper."** This route is the single exception the same
 * section carves out, and it is deliberately shaped so it cannot grow into the
 * thing that was banned: one endpoint, one insert, no loop, no schedule of its
 * own, and a table that refuses to be written twice.
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

  const db = getDb();
  const season = await openSeason(db);

  if (season === null) {
    /*
     * No open season. Not an error and not a retry: in July there is nothing
     * being played, and a non-2xx here would have the platform retry an empty
     * job every few minutes until September.
     */
    return cronJson(
      { ran: false, why: 'There is no open season, so there is no week being played.' },
      200,
    );
  }

  const [row] = await db
    .select({ leagueId: seasons.sleeperLeagueId })
    .from(seasons)
    .where(eq(seasons.id, season.id))
    .limit(1);

  const leagueId = row?.leagueId ?? null;
  if (leagueId === null || leagueId === '') {
    /*
     * An open season with no Sleeper league attached. A real state — a season
     * row can be created before the league exists — and not a failure to retry.
     */
    return cronJson(
      {
        ran: false,
        why: `Season ${String(season.year)} has no Sleeper league id, so there is nothing to read.`,
      },
      200,
    );
  }

  const source = createLiveSource();

  try {
    const week = await weekToPhotograph(request, source);
    if (week === null) {
      return cronJson(
        { ran: false, why: 'Sleeper did not report a current week, so nothing was photographed.' },
        200,
      );
    }

    const fetched = await source.fetch({ kind: 'matchups', leagueId, week });
    if (fetched.kind !== 'ok') {
      /*
       * 500 so the platform retries. Safe: the storage refuses a second capture
       * of a week, so a retry either photographs a week that has none or does
       * nothing at all.
       */
      console.error('The Sunday job could not read matchups:', fetched);
      return cronJson({ ran: false, why: 'Sleeper did not answer. See the runtime log.' }, 500);
    }

    const decoded = decodeMatchups(fetched.payload, `matchups(${String(week)})`);
    const report = await runSunday(db, {
      season: season.year,
      week,
      entries: decoded.value,
      at: now(),
      source: source.label,
    });

    return cronJson({ ran: true, report, warnings: decoded.warnings }, 200);
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

/** The overridden week, or the one Sleeper says is being played. */
async function weekToPhotograph(
  request: Request,
  source: ReturnType<typeof createLiveSource>,
): Promise<number | null> {
  const requested = new URL(request.url).searchParams.get('week');
  const parsed = requested === null ? null : Number.parseInt(requested, 10);
  if (parsed !== null && Number.isInteger(parsed) && parsed >= 1 && parsed <= 18) return parsed;

  const state = await source.fetch({ kind: 'state' });
  if (state.kind !== 'ok') return null;

  const decoded = decodeState(state.payload);
  const week = decoded.value.week;
  return Number.isInteger(week) && week >= 1 && week <= 18 ? week : null;
}
