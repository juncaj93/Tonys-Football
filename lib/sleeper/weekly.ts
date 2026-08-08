import { eq, sql } from 'drizzle-orm';

import { type Database, type Queryable } from '@/lib/db';
import { fantasyMatchups, seasons } from '@/lib/db/schema';

import { type ChainResult, importSeason } from './chain';
import { type ImportSummary, persistChain } from './persist';
import { type SleeperSource } from './transport';

/**
 * The in-season sync — how a week that was actually played gets into the
 * database.
 *
 * ## The gap this closes
 *
 * `16 §4.3` specifies the Tuesday job as **sync → finalize → rewards → settle →
 * … → draft**. Everything from `finalize` rightwards was built (#56, #59, #66)
 * and every piece of it is idempotent and tested. **`sync` was never built**,
 * and nothing else in the deployed application writes `fantasy_matchups`:
 * `npm run db:seed` imports from the recorded fixtures, which is deliberate and
 * correct for a deploy (`16 §12`) and says nothing about a week played in
 * October. The Sunday cron reads Sleeper live but writes only the pre-Monday
 * *photograph* — a different table, on purpose.
 *
 * So the whole downstream chain was correct and starved. On the first Tuesday of
 * the season `finalizeWeek` would find zero publishable games, decline, and the
 * shop would sit in offseason for the rest of the year with no error anywhere.
 *
 * ## Why this is not "live score sync"
 *
 * `16 §4.3` also says **"no live in-game score sync, ever."** That bans a poller
 * that keeps the room's scores warm while games are in progress. This is the
 * opposite shape: it runs **once a week, after the week is over**, and imports a
 * finished result. The Sunday job is the same argument from the other side —
 * `16 §4.3` carves that read out explicitly, and this one is what the same
 * section asks for by name.
 *
 * ## The request budget is the design constraint
 *
 * `16 §4.3` warns that the Tuesday job must be *"chunked and resumable against
 * Hobby's function duration ceiling"*, and it is right to.
 *
 * Three things keep it bounded:
 *
 *   1. **One season.** Finalized seasons cannot be rewritten — the trigger
 *      refuses and `persistChain` reports it — so walking the chain back to 2024
 *      every Tuesday buys nothing and costs two thirds of the requests.
 *   2. **No transactions.** Nothing persists or reads them; they were half of
 *      every week's budget. `includeTransactions: false`.
 *   3. **Weeks 1..through, never further.** A week is only fetched once there is
 *      reason to believe it was played.
 *
 * The range must **start at week 1** and that is not an accident of the API.
 * `reconcileSeason` compares the season's official standings against the sum of
 * the weekly snapshot; hand it weeks 6..9 and every roster disagrees with its own
 * record, which would mark real games `disputed`. Weeks 1..N mid-season is
 * apples to apples — the standings reflect N weeks and so does the snapshot.
 *
 * ## What it deliberately does not do
 *
 * It never finalizes a season. `finalizeYears` is empty and stays empty: closing
 * the books is a decision a person makes (`scripts/seed.ts`'s
 * `FINALIZED_SEASONS`), and a cron that did it on Sleeper's `complete` status
 * would freeze a record while stat corrections were still landing.
 */

/** Why a sync did nothing, when nothing is a legitimate answer. */
export type SyncRefusal =
  /** No `seasons` row for that year. Nothing to sync into. */
  | 'no-season'
  /** The season row carries no Sleeper league id, so there is nothing to read. */
  | 'no-league'
  /** The books are shut. A finalized season refuses every write anyway. */
  | 'season-closed'
  /** Sleeper could not be read. The only refusal a retry can fix. */
  | 'unreachable'
  /**
   * The league Sleeper returned is not the season we asked for.
   *
   * A misconfigured `SLEEPER_LEAGUE_ID` — a stale value left over from last
   * year, most likely — would otherwise import one season's games under
   * another's roster ids. Refused rather than reconciled.
   */
  | 'wrong-season';

export interface SyncReport {
  readonly season: number;
  /** The highest week fetched. Weeks 1..through were read. */
  readonly through: number;
  /** Null when the sync refused. */
  readonly summary: ImportSummary | null;
  readonly refusal: SyncRefusal | null;
  /** Non-fatal notes from the read — a decoder warning, a reconciliation note. */
  readonly warnings: readonly string[];
}

/**
 * The highest week with a stored game, or 0 when the season has none.
 *
 * Exported because the Tuesday job needs it twice — once to decide how far to
 * read, and once afterwards to decide which week it is closing.
 */
export async function latestStoredWeek(db: Queryable, seasonYear: number): Promise<number> {
  const [row] = await db
    .select({ week: sql<number | null>`max(${fantasyMatchups.week})` })
    .from(fantasyMatchups)
    .innerJoin(seasons, eq(seasons.id, fantasyMatchups.seasonId))
    .where(eq(seasons.year, seasonYear));

  const week = row?.week;
  return week === null || week === undefined ? 0 : Number(week);
}

/** The last week the league plays. Beyond this Sleeper has nothing to give. */
export const LAST_SYNCABLE_WEEK = 18;

/**
 * How far to read this week.
 *
 * One past the last week we hold, so a standing start asks for week 1 and an
 * ordinary Tuesday asks for the week that has just been played.
 *
 * **It advances one week per run, and that is the safe direction.** A week that
 * was not played yet comes back empty and stores nothing, so the bound does not
 * move and next Tuesday asks the same question — which is exactly what should
 * happen during the preseason. A Tuesday that is *missed* leaves the league one
 * week behind rather than skipping a week's rewards, and `?week=` on the route
 * is the catch-up path for a commissioner who wants it back sooner.
 *
 * The alternative — asking Sleeper which week it is — was measured and rejected:
 * `state.week` rolls over on Tuesday morning, which is exactly when the job runs,
 * so it names the just-finished week or the next one depending on the minute.
 */
export function weekToReadThrough(stored: number): number {
  return Math.min(LAST_SYNCABLE_WEEK, Math.max(1, stored + 1));
}

/**
 * Read one season from Sleeper and persist what is new.
 *
 * The source is injected rather than constructed, for the same reason the clock
 * and the RNG are: the test suite never touches the network, and the fixture
 * source is a drop-in that makes this whole path testable offline.
 */
export async function syncSeason(
  db: Database,
  input: {
    readonly source: SleeperSource;
    readonly seasonYear: number;
    /** Weeks 1..through are read. Clamped to the league's last playable week. */
    readonly through: number;
  },
): Promise<SyncReport> {
  const through = Math.min(LAST_SYNCABLE_WEEK, Math.max(1, input.through));

  const [row] = await db
    .select({
      leagueId: seasons.sleeperLeagueId,
      finalizedAt: seasons.finalizedAt,
    })
    .from(seasons)
    .where(eq(seasons.year, input.seasonYear))
    .limit(1);

  if (row === undefined) {
    return { season: input.seasonYear, through, summary: null, refusal: 'no-season', warnings: [] };
  }

  if (row.finalizedAt !== null) {
    /*
     * Not an error and not a retry. `persistChain` would refuse every write and
     * report a conflict per roster, which is a lot of noise for a season whose
     * books somebody closed on purpose.
     */
    return {
      season: input.seasonYear,
      through,
      summary: null,
      refusal: 'season-closed',
      warnings: [],
    };
  }

  const leagueId = row.leagueId;
  if (leagueId === null || leagueId === '') {
    return { season: input.seasonYear, through, summary: null, refusal: 'no-league', warnings: [] };
  }

  let season;
  try {
    season = await importSeason(input.source, leagueId, {
      includeWeeks: true,
      includeTransactions: false,
      maxWeek: through,
    });
  } catch (error: unknown) {
    /*
     * `importSeason` throws only when the league payload itself cannot be read —
     * everything below that returns a result value (`transport.ts`). A Sleeper
     * outage on a Tuesday morning must not cost the league its paper, so this is
     * a refusal the caller records rather than an exception it propagates.
     */
    return {
      season: input.seasonYear,
      through,
      summary: null,
      refusal: 'unreachable',
      warnings: [error instanceof Error ? error.message : String(error)],
    };
  }

  if (season.year !== input.seasonYear) {
    return {
      season: input.seasonYear,
      through,
      summary: null,
      refusal: 'wrong-season',
      warnings: [
        `League ${leagueId} is Sleeper's ${String(season.year)} season, not ` +
          `${String(input.seasonYear)}. Nothing was imported — check SLEEPER_LEAGUE_ID.`,
      ],
    };
  }

  /*
   * One season, so the chain is a chain of one. Written out rather than run
   * through `traverseChain` with `maxDepth: 1`, which reports *"chain exceeded
   * the maximum depth"* as an error every single time — a weekly cron that
   * carries a false error in its report teaches whoever reads it to stop
   * reading.
   */
  const chain: ChainResult = {
    seasons: [season],
    terminatedBy: 'chain_end',
    errors: [],
    warnings: season.warnings,
  };

  const summary = await persistChain(db, chain, {
    sourceLabel: input.source.label,
    // Never. Closing the books is a person's decision — see the module comment.
    finalizeYears: [],
  });

  return { season: input.seasonYear, through, summary, refusal: null, warnings: summary.warnings };
}
