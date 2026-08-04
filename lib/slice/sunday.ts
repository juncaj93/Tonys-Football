import { type Database } from '@/lib/db';
import { captureWeekSnapshot, type CaptureResult, type SnapshotEntry } from '@/lib/stats/snapshot';
import { type SleeperMatchupEntry } from '@/lib/sleeper/types';

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
