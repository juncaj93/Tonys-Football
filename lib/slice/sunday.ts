import { openSeason } from '@/lib/counter/tokens';
import { type Database } from '@/lib/db';
import { seasons } from '@/lib/db/schema';
import { decodeMatchups, decodeState } from '@/lib/sleeper/codec';
import { type SleeperSource } from '@/lib/sleeper/transport';
import { captureWeekSnapshot, type CaptureResult, type SnapshotEntry } from '@/lib/stats/snapshot';
import { type SleeperMatchupEntry } from '@/lib/sleeper/types';
import { eq } from 'drizzle-orm';

/**
 * The Sunday job — `16 §4.3`'s first cron, as one operation.
 *
 * ## What it is
 *
 * One read of the current week's matchups and one insert. That is the entire
 * job, and its smallness is the point: `16 §4.3` also says **"no live in-game
 * score sync, ever"**, so this is the one sanctioned mid-week look at Sleeper in
 * the whole product. It takes a photograph and stops.
 *
 * ## Why the pairing happens here
 *
 * Sleeper returns one row per **roster**, tagged with a `matchup_id`. Two rows
 * sharing a `matchup_id` are a game; a row whose `matchup_id` is null or
 * unshared is a roster with no opponent — normal in the playoff weeks, and true
 * of everybody in week 18. `fantasy_matchups` already refuses to store those and
 * says why: *"a table of games is the wrong place to record a non-game"*. A
 * comeback happens inside a game, so the same rule holds here.
 *
 * The pairing is deterministic — rosters sorted ascending — so the same payload
 * always produces the same `roster_a` / `roster_b` assignment, and a snapshot is
 * comparable to a game whichever order either one stored them in.
 *
 * ## It is safe to run twice, and safe to run late
 *
 * Safe to run twice because the storage refuses a second capture of a week.
 * Safe to run *late* in the only sense that matters: a late run cannot corrupt
 * an existing snapshot. It can, however, capture a first snapshot after Monday
 * has already started — nothing in Sleeper's payload says what time it is — so
 * the schedule is the guarantee, and `docs/SUNDAY_SNAPSHOT_BOUNDARY.md §3`
 * records exactly how much guarantee that is.
 */

export interface SundayReport {
  readonly season: number;
  readonly week: number;
  /** Roster rows Sleeper returned. */
  readonly rosters: number;
  /** Rows that paired into games. */
  readonly games: number;
  /** Rows that had no opponent and were not stored. */
  readonly unpaired: number;
  readonly capture: CaptureResult | null;
  /**
   * What the job declined to do, and why — one plain sentence per skipped step.
   *
   * Empty on an ordinary Sunday. This is the field somebody reads when a week
   * has no snapshot and they want to know whether the job ran.
   */
  readonly skipped: readonly string[];
}

/**
 * Two Sleeper rows that share a `matchup_id`, as one game.
 *
 * Exported because it is the whole of the job's interesting logic and deserves
 * to be testable without a database or a network.
 */
export function pairMatchups(entries: readonly SleeperMatchupEntry[]): {
  readonly games: readonly SnapshotEntry[];
  readonly unpaired: number;
} {
  const byMatchup = new Map<number, SleeperMatchupEntry[]>();
  let unpaired = 0;

  for (const entry of entries) {
    if (entry.matchupId === null) {
      // A roster with no matchup id is not in a game this week.
      unpaired += 1;
      continue;
    }
    const bucket = byMatchup.get(entry.matchupId);
    if (bucket === undefined) byMatchup.set(entry.matchupId, [entry]);
    else bucket.push(entry);
  }

  const games: SnapshotEntry[] = [];
  for (const [matchupId, bucket] of [...byMatchup.entries()].sort((x, y) => x[0] - y[0])) {
    if (bucket.length !== 2) {
      /*
       * One roster, or three. One is an unpaired roster wearing a matchup id,
       * which Sleeper does in consolation weeks. Three is malformed and there is
       * no honest way to pick two of them.
       */
      unpaired += bucket.length;
      continue;
    }
    const [first, second] = bucket as [SleeperMatchupEntry, SleeperMatchupEntry];
    // Ascending roster id, so the same payload always pairs the same way round.
    const [a, b] =
      first.rosterId <= second.rosterId ? [first, second] : [second, first];

    games.push({
      sleeperMatchupId: matchupId,
      rosterAId: a.rosterId,
      rosterBId: b.rosterId,
      pointsACents: toCents(a.points),
      pointsBCents: toCents(b.points),
    });
  }

  return { games, unpaired };
}

/**
 * Points to cents, the way `reconcile.ts` does it.
 *
 * Duplicated rather than imported so this module has no dependency on the import
 * pipeline. It is one rounding rule and it is the same rounding rule: a score of
 * `154.42` is `15442`, never `15441.999999998`.
 */
function toCents(points: number): number {
  return Math.round(points * 100);
}

/** Photograph one week. */
export async function runSunday(
  db: Database,
  input: {
    readonly season: number;
    readonly week: number;
    readonly entries: readonly SleeperMatchupEntry[];
    readonly at: Date;
    readonly source: string;
  },
): Promise<SundayReport> {
  const skipped: string[] = [];
  const { games, unpaired } = pairMatchups(input.entries);

  if (games.length === 0) {
    skipped.push(
      `Week ${String(input.week)} has no paired game to photograph, so nothing was stored.`,
    );
    return {
      season: input.season,
      week: input.week,
      rosters: input.entries.length,
      games: 0,
      unpaired,
      capture: null,
      skipped,
    };
  }

  const capture = await captureWeekSnapshot(db, {
    season: input.season,
    week: input.week,
    entries: games,
    at: input.at,
    source: input.source,
  });

  if (!capture.captured) {
    skipped.push(
      `Week ${String(input.week)} was already photographed; a snapshot is taken once and never retaken.`,
    );
  }

  return {
    season: input.season,
    week: input.week,
    rosters: input.entries.length,
    games: games.length,
    unpaired,
    capture,
    skipped,
  };
}

/* -------------------------------------------------------------------------
 * The job, from the season down
 * ---------------------------------------------------------------------- */

/**
 * Everything the Sunday cron does once the door has let it in.
 *
 * ## Why this is not in the route
 *
 * It was, and the route was the only place it could be exercised — which meant
 * it could not be exercised at all, because the route constructs its own live
 * Sleeper and a test that ran it would reach the network. So *which season*,
 * *which week*, and *what an unreadable upstream costs* were three real
 * decisions with no test on any of them, sitting in a file whose job was
 * supposed to be the door and the clock.
 *
 * The seam is the source. Everything above it — auth, the live source, the
 * response — stays in `app/api/cron/sunday/route.ts`; everything below it is
 * here, injected, and driven by the lifecycle rehearsal against a written
 * season. The route is now short enough to read in one screen, which is the
 * standard it was already claiming.
 *
 * ## The outcomes are three, and the route maps them to two status codes
 *
 * `nothing-to-do` is a 200 on purpose: in July there is no open season, and a
 * non-2xx would have the platform retry an empty job every few minutes until
 * September. `upstream-failed` is the 500 — a retry might genuinely fix it, and
 * retrying is safe because the storage refuses a second capture of a week.
 */
export type SundayOutcome =
  | {
      readonly kind: 'ran';
      readonly report: SundayReport;
      readonly warnings: readonly string[];
    }
  /** A real, expected state in which there is nothing to photograph. */
  | { readonly kind: 'nothing-to-do'; readonly why: string }
  /** Sleeper could not be read. Worth a retry. */
  | { readonly kind: 'upstream-failed'; readonly why: string };

export async function runSundayJob(
  db: Database,
  input: {
    readonly source: SleeperSource;
    /** From the injected clock. Stamped onto the photograph. */
    readonly at: Date;
    /**
     * `?week=` — a commissioner re-running a missed Sunday.
     *
     * It cannot overwrite anything: `captureWeekSnapshot` refuses a week that
     * already has a photograph, and refuses it at a constraint rather than in a
     * branch. Out-of-range values are ignored rather than rejected, because the
     * fallback below is always available and a 400 on a cron is a job that did
     * not run.
     */
    readonly requestedWeek?: number | null;
  },
): Promise<SundayOutcome> {
  const season = await openSeason(db);
  if (season === null) {
    return {
      kind: 'nothing-to-do',
      why: 'There is no open season, so there is no week being played.',
    };
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
    return {
      kind: 'nothing-to-do',
      why: `Season ${String(season.year)} has no Sleeper league id, so there is nothing to read.`,
    };
  }

  const week = await weekToPhotograph(input.source, input.requestedWeek ?? null);
  if (week === null) {
    return {
      kind: 'nothing-to-do',
      why: 'Sleeper did not report a current week, so nothing was photographed.',
    };
  }

  const fetched = await input.source.fetch({ kind: 'matchups', leagueId, week });
  if (fetched.kind !== 'ok') {
    return { kind: 'upstream-failed', why: 'Sleeper did not answer. See the runtime log.' };
  }

  const decoded = decodeMatchups(fetched.payload, `matchups(${String(week)})`);
  const report = await runSunday(db, {
    season: season.year,
    week,
    entries: decoded.value,
    at: input.at,
    source: input.source.label,
  });

  return { kind: 'ran', report, warnings: decoded.warnings };
}

/**
 * The overridden week, or the one Sleeper says is being played.
 *
 * Sleeper's own `state`, not a stored week. Tuesday asks *"which week has just
 * been played"* and reads that from the database; Sunday asks *"which week is
 * being played right now"*, and the only authority on that is the upstream. A
 * stored answer would be last week's for the entire duration of this one.
 */
async function weekToPhotograph(
  source: SleeperSource,
  requested: number | null,
): Promise<number | null> {
  if (requested !== null && Number.isInteger(requested) && requested >= 1 && requested <= 18) {
    return requested;
  }

  const state = await source.fetch({ kind: 'state' });
  if (state.kind !== 'ok') return null;

  const week = decodeState(state.payload).value.week;
  return Number.isInteger(week) && week >= 1 && week <= 18 ? week : null;
}
