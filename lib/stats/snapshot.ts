import { and, eq, sql } from 'drizzle-orm';

import { type Queryable } from '@/lib/db';
import { seasons, weekSnapshots } from '@/lib/db/schema';

/**
 * The pre-Monday score, stored and read back.
 *
 * This is the whole storage boundary for `16 §4.3`'s first cron. Everything
 * above it — the job, the fact, the story, the paper — talks to these two
 * functions and to nothing else about snapshots, so a redesign of the newspaper
 * cannot reach the photograph it is describing.
 *
 * ## What a snapshot is
 *
 * One row per **paired** game of one week, holding both sides' points at the
 * instant the photograph was taken. Unpaired rosters are not stored, for the
 * reason `fantasy_matchups` gives: *"a table of games is the wrong place to
 * record a non-game"*, and a comeback is a thing that happens inside a game.
 *
 * ## Writing is idempotent because it refuses, not because it merges
 *
 * `ON CONFLICT DO NOTHING` on `UNIQUE(season_id, week, sleeper_matchup_id)`. A
 * second run for a week that already has a snapshot writes nothing and reports
 * nothing written.
 *
 * That is not the usual "make retries safe" story. **A later capture of the same
 * week is a materially different and worse photograph** — it includes Monday
 * scoring — so merging it in would replace the truth with a plausible-looking
 * falsehood and leave no evidence. The database refuses at the constraint and
 * again at an append-only trigger, so no caller can do it by accident and none
 * can do it on purpose either.
 */

/** One game's score at the moment of capture. Points are cents. */
export interface SnapshotEntry {
  readonly sleeperMatchupId: number;
  readonly rosterAId: number;
  readonly rosterBId: number;
  readonly pointsACents: number;
  readonly pointsBCents: number;
}

export interface CaptureResult {
  readonly season: number;
  readonly week: number;
  /** Rows this run actually inserted. Zero when the week was already captured. */
  readonly written: number;
  /** Rows offered. `written < offered` means the week already had a snapshot. */
  readonly offered: number;
  /** True when this run is the one that captured the week. */
  readonly captured: boolean;
}

/**
 * Photograph a week, once.
 *
 * Takes entries rather than fetching them: the Sleeper read is the job's
 * business and this module's business is the record. That separation is what
 * lets every test below run without a network, and what lets the fixtures
 * transport drive a real capture.
 */
export async function captureWeekSnapshot(
  db: Queryable,
  input: {
    readonly season: number;
    readonly week: number;
    readonly entries: readonly SnapshotEntry[];
    /** From the injected clock. */
    readonly at: Date;
    /** `sync_runs.source` vocabulary — where the numbers came from. */
    readonly source: string;
  },
): Promise<CaptureResult> {
  const nothing: CaptureResult = {
    season: input.season,
    week: input.week,
    written: 0,
    offered: input.entries.length,
    captured: false,
  };

  const [season] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.year, input.season))
    .limit(1);

  if (season === undefined) return nothing;
  if (input.entries.length === 0) return nothing;

  const rows = await db
    .insert(weekSnapshots)
    .values(
      input.entries.map((entry) => ({
        seasonId: season.id,
        week: input.week,
        sleeperMatchupId: entry.sleeperMatchupId,
        rosterAId: entry.rosterAId,
        rosterBId: entry.rosterBId,
        pointsACents: entry.pointsACents,
        pointsBCents: entry.pointsBCents,
        capturedAt: input.at,
        source: input.source,
      })),
    )
    /*
     * The one line that makes a retry safe *and* keeps the first photograph.
     *
     * Not `onConflictDoUpdate`. See the header: a later capture of the same week
     * is a worse photograph, not a fresher one.
     */
    .onConflictDoNothing()
    .returning({ id: weekSnapshots.id });

  return {
    season: input.season,
    week: input.week,
    written: rows.length,
    offered: input.entries.length,
    captured: rows.length > 0,
  };
}

/** What was photographed, keyed by the matchup id that joins it to its game. */
export type WeekSnapshotMap = ReadonlyMap<number, SnapshotEntry>;

/**
 * Read a week's snapshot back.
 *
 * Returns an empty map for a week that was never photographed, which every
 * caller must treat as *"this cannot be said"* rather than as zero. A week with
 * no snapshot is the normal state of every historical season this league
 * imported, and of any week where the job did not run.
 */
export async function weekSnapshot(
  db: Queryable,
  input: { readonly season: number; readonly week: number },
): Promise<WeekSnapshotMap> {
  const rows = await db
    .select({
      sleeperMatchupId: weekSnapshots.sleeperMatchupId,
      rosterAId: weekSnapshots.rosterAId,
      rosterBId: weekSnapshots.rosterBId,
      pointsACents: weekSnapshots.pointsACents,
      pointsBCents: weekSnapshots.pointsBCents,
    })
    .from(weekSnapshots)
    .innerJoin(seasons, eq(seasons.id, weekSnapshots.seasonId))
    .where(and(eq(seasons.year, input.season), eq(weekSnapshots.week, input.week)));

  return new Map(rows.map((row) => [row.sleeperMatchupId, row]));
}

/** Has this week been photographed at all? Cheaper than reading it. */
export async function weekIsSnapshotted(
  db: Queryable,
  input: { readonly season: number; readonly week: number },
): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(weekSnapshots)
    .innerJoin(seasons, eq(seasons.id, weekSnapshots.seasonId))
    .where(and(eq(seasons.year, input.season), eq(weekSnapshots.week, input.week)));

  return (row?.n ?? 0) > 0;
}
