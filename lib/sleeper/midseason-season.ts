import { eq } from 'drizzle-orm';

import { readManagerNames, seedManagerNames } from '@/lib/content/managers';
import {
  readBoxOffers,
  readCounterGreetings,
  readStatsAsides,
  seedBoxOffers,
  seedCounterGreetings,
  seedStatsAsides,
} from '@/lib/content/seed';
import { ensureRewardTable, grantBox } from '@/lib/counter/boxes';
import { grantSeasonalBoxes } from '@/lib/counter/grants';
import { grantChampionshipRings } from '@/lib/counter/rings';
import { applyTokenDelta, ensureEconomyConfig, openSeason } from '@/lib/counter/tokens';
import { type Database } from '@/lib/db';
import { seasonMemberships, seasons, users } from '@/lib/db/schema';
import { runTuesday, type TuesdayReport } from '@/lib/slice/tuesday';
import { ensureSignificancePolicy } from '@/lib/stats/significance';

import { traverseChain } from './chain';
import { createFixtureSource } from './fixtures';
import { persistChain } from './persist';
import { type SleeperSource } from './transport';
import {
  MIDSEASON_LEAGUE,
  MIDSEASON_SEASON,
  seasonAtWeek,
  type MidseasonOptions,
} from './midseason-2026';

/**
 * Standing the eight-week 2026 season up in a database.
 *
 * ## Why the history is *played* rather than inserted
 *
 * The obvious way to get seven finalized weeks into a database is to write the
 * rows: insert `fantasy_matchups`, insert `week_finalizations`, insert the
 * ledger entries, and start the rehearsal from there. That would be faster and
 * it would be **worthless for the question this rehearsal asks.**
 *
 * The midseason failure modes are all about what seven Tuesdays *left behind* —
 * a bounty rolled forward and never closed, a milestone grant that fired twice,
 * a reward key that collided, an authoring pass that read the wrong basis. A
 * hand-inserted history has none of that, because none of it ever ran. It would
 * prove that the code works on a state the code cannot produce.
 *
 * So weeks 1–7 are played through {@link runTuesday}, one call per week, with
 * the same Sleeper source shape, the same clock discipline and the same
 * ordering production uses. Week 8 is then the eighth call, and the only thing
 * that distinguishes it is that the rehearsal is watching.
 *
 * ## The clock is real dates, and that matters twice
 *
 * `persistChain`'s staleness guard is **forward only** on
 * `seasons.snapshot_captured_at`, so a read whose capture time went backwards
 * writes nothing. Handing every week the same instant would leave that guard
 * untested; handing them the recorded fixtures' own July timestamp would make
 * every sync stale and every week empty. {@link tuesdayOf} walks real Tuesdays
 * of the 2026 NFL season, after the recorded capture, one week apart.
 */

/**
 * A database in the state a deploy leaves it in.
 *
 * ## Why this mirrors `scripts/seed.ts` rather than doing less
 *
 * The first version imported the league, named the managers and stored the
 * economy — the three things `lib/slice/tuesday.test.ts` needs — and the
 * rehearsal fell over on its first box with *"reward table … is not stored"*.
 * That is the correct behaviour and it was the right failure to have: the
 * Tuesday job runs **after** a deploy has seeded, and a rehearsal starting from
 * less than a deploy leaves behind is rehearsing a state production never has.
 *
 * So every step the deploy seed takes that leaves a row behind is taken here, in
 * the same order and through the same functions. `scripts/seed.ts` runs `main()`
 * on import and cannot be called, so the sequence is written out rather than
 * shared — the honest cost, and the reason each step below names what it is
 * mirroring. Console output, the `CATALOG_SIZE` assertion and the admin grant
 * are the only things left out: they are a deploy's reporting, not its state.
 */
export async function importHistory(
  db: Database,
  options: {
    readonly finalizeYears?: readonly number[];
    /**
     * Where the chain is read from. Defaults to the recorded fixtures.
     *
     * Injected for the reason every Sleeper read in this project is: a caller
     * that needs the *league itself* to be wrong — a roster owned by an account
     * this league has never seen — cannot express that against a recording, and
     * `persistChain` leaves an existing membership alone, so injecting it after
     * the seed proves nothing. `lib/rehearsal/` is that caller.
     */
    readonly source?: SleeperSource;
    /** The league the chain starts at. Defaults to the 2026 league. */
    readonly leagueId?: string;
  } = {},
): Promise<void> {
  // 1. The league chain, from the recorded fixtures unless told otherwise.
  const chain = await traverseChain(
    options.source ?? createFixtureSource(),
    options.leagueId ?? MIDSEASON_LEAGUE,
    { includeWeeks: true },
  );
  await persistChain(db, chain, {
    sourceLabel: 'midseason-rehearsal',
    finalizeYears: [...(options.finalizeYears ?? [2024, 2025])],
  });

  // 2. The names Tony uses, and the content every spoken surface draws from.
  await seedManagerNames(db, readManagerNames());
  await seedCounterGreetings(db, readCounterGreetings());
  await seedBoxOffers(db, readBoxOffers());
  await seedStatsAsides(db, readStatsAsides());

  /*
   * 3. The economy, per season.
   *
   * `authorStakesForWeek` throws without a stored config — deliberately, so a
   * silent fallback to hardcoded prices is impossible — and every season the
   * rehearsal touches needs one.
   */
  for (const season of await db.select({ id: seasons.id }).from(seasons)) {
    await ensureEconomyConfig(db, season.id);
  }

  /*
   * 4. The reward table, before any box exists to open.
   *
   * `18 §4.3`: an opening resolves against a *stored* table. The service refuses
   * to roll against a version this database has never recorded rather than
   * writing one on first use.
   */
  await ensureRewardTable(db);

  // 5. The open season's tabs, and its season-opening box.
  const open = await openSeason(db);
  if (open !== null) {
    const economy = await ensureEconomyConfig(db, open.id);
    const seated = await db
      .select({ userId: seasonMemberships.userId })
      .from(seasonMemberships)
      .where(eq(seasonMemberships.seasonId, open.id));

    for (const seat of seated) {
      await applyTokenDelta(db, {
        userId: seat.userId,
        seasonId: open.id,
        amount: economy.values.seasonStartTokens,
        reason: 'SEASON_START',
        description: `Tony opens a tab for the ${String(open.year)} season.`,
        idempotencyKey: `season-start:${open.id}:${seat.userId}`,
      });
    }

    // `week: 0` is the season before a ball is thrown, so only the opening
    // milestone is due. The midseason box is the Tuesday job's.
    await grantSeasonalBoxes(db, { seasonYear: open.year, week: 0 });
  }

  // 6. The welcome box — one per manager, granted once, ever.
  for (const manager of await db.select({ id: users.id }).from(users)) {
    await grantBox(db, {
      userId: manager.id,
      grantKey: `seed:m2s1:standard:${manager.id}`,
      source: 'seed',
    });
  }

  // 7. Championship rings for the finalized seasons, and the policy a margin is
  //    classified under. Both append-only and both read by the fact layer.
  await grantChampionshipRings(db);
  await ensureSignificancePolicy(db);
}

/**
 * The Tuesday of the 2026 NFL season's week `week`, at 09:00 UTC.
 *
 * Week 1's Monday night game is 14 September 2026, so week 1's Tuesday is the
 * 15th and every later week is seven days on. Fixed rather than computed from a
 * clock, because `lib/clock.ts` exists so nothing in this project reads the wall
 * clock where a test cannot reach it.
 */
export function tuesdayOf(week: number): Date {
  const first = Date.UTC(2026, 8, 15, 9, 0, 0); // 2026-09-15T09:00:00Z
  return new Date(first + (week - 1) * 7 * 24 * 60 * 60 * 1000);
}

/**
 * Play one week the way the cron does.
 *
 * The week is **not** passed. `runTuesday` resolves it after the sync, from the
 * latest week the database now holds — which is the whole sequence defect
 * `lib/slice/tuesday.ts` was built around, and pinning the week here would step
 * around the thing the rehearsal is supposed to exercise.
 */
export async function playWeek(
  db: Database,
  week: number,
  options: Partial<MidseasonOptions> = {},
): Promise<TuesdayReport> {
  const at = tuesdayOf(week);
  return runTuesday(db, {
    season: MIDSEASON_SEASON,
    at,
    sleeper: seasonAtWeek({ played: week, capturedAt: at, ...options }),
  });
}

/** Play weeks 1..`through`, in order, one Tuesday each. */
export async function playWeeksThrough(
  db: Database,
  through: number,
): Promise<readonly TuesdayReport[]> {
  const reports: TuesdayReport[] = [];
  for (let week = 1; week <= through; week += 1) {
    reports.push(await playWeek(db, week));
  }
  return reports;
}
