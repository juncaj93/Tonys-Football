import { ensureRewardTable } from '@/lib/counter/boxes';
import { grantChampionshipRings } from '@/lib/counter/rings';
import { ensureEconomyConfig, openSeason } from '@/lib/counter/tokens';
import { type Database } from '@/lib/db';
import { traverseChain } from '@/lib/sleeper/chain';
import { createFixtureSource } from '@/lib/sleeper/fixtures';
import { persistChain } from '@/lib/sleeper/persist';
import { ensureSignificancePolicy } from '@/lib/stats/significance';
import { rosterNames } from '@/lib/stats/facts';
import { runTuesday, type TuesdayReport } from '@/lib/slice/tuesday';

import { rehearsalSeason, REHEARSAL_LEAGUE, type RehearsalOptions } from './season';

/**
 * Standing up a league that has already played, then playing it forward.
 *
 * This is the second half of the shared rehearsal infrastructure: `season.ts`
 * is *what Sleeper says*, and this is *the product being run against it*. The
 * split matters because the interesting failures are in the seam — a week that
 * arrives, a job that runs on it, a surface that reads what the job wrote.
 *
 * ## It runs the real jobs, and nothing beside them
 *
 * `playForward` calls `runTuesday`, which is the deployed cron's own entry
 * point. It does not reimplement the chain, reorder it, or skip a step. A
 * rehearsal that ran its own sequence would be evidence about the rehearsal —
 * the same argument `lib/demo/` makes for its states, and the reason
 * `MANDATE §8` insists a demo drive production code.
 *
 * ## The history is the real history
 *
 * 2024 and 2025 come from the recorded fixtures and are finalized, exactly as
 * `scripts/seed.ts` leaves them: two verified champions, ten managers with
 * permanent identities, and rings already granted. A playoff rehearsal needs
 * that, because half of what it is checking is that a *third* season's
 * postseason does not disturb the two on the books.
 */

/** The seasons the recorded fixtures cover, closed exactly as the seed closes them. */
export const REHEARSAL_FINALIZED = [2024, 2025] as const;

export const REHEARSAL_SEASON_YEAR = 2026;

export interface RehearsalLeague {
  /** Roster id → the manager who holds that seat in 2026. */
  readonly seats: ReadonlyMap<number, { readonly userId: string; readonly displayName: string }>;
  readonly seasonId: string;
}

/**
 * Import the recorded history and open 2026 for business.
 *
 * Everything here is a call the seed already makes, in the order it makes them.
 * Content entries are deliberately **not** seeded: no rehearsal assertion reads
 * a Tony line, and seeding thirty-one of them on every test file would be a
 * second, slower copy of a fixture nothing looks at.
 */
export async function standUpLeague(db: Database): Promise<RehearsalLeague> {
  const chain = await traverseChain(createFixtureSource(), REHEARSAL_LEAGUE, {
    includeWeeks: true,
  });

  await persistChain(db, chain, {
    sourceLabel: 'rehearsal-fixtures',
    finalizeYears: [...REHEARSAL_FINALIZED],
  });

  await ensureRewardTable(db);
  await ensureSignificancePolicy(db);

  const open = await openSeason(db);
  if (open === null) throw new Error('The rehearsal imported no open season.');
  await ensureEconomyConfig(db, open.id);

  // The two verified titles, so a third season's postseason has something to
  // not disturb.
  await grantChampionshipRings(db);

  return { seats: await rosterNames(db, open.id), seasonId: open.id };
}

export interface PlayedWeek {
  readonly week: number;
  readonly report: TuesdayReport;
}

/**
 * Play the season forward, one real Tuesday at a time.
 *
 * `through` is the last week played. Each iteration builds a Sleeper that has
 * played exactly that many weeks and runs the job against it, which is what
 * makes the sequence honest: week 9's job cannot see week 10's football,
 * because the source it is handed has not played it.
 *
 * `at` advances a week per iteration from the supplied start, so
 * `week_finalizations.finalized_at` reads like a season rather than like ten
 * rows written in the same millisecond.
 */
export async function playForward(
  db: Database,
  input: {
    readonly through: number;
    readonly from?: number;
    readonly at: Date;
    /** Applied to every week's source — score overrides, injected failures. */
    readonly options?: Omit<RehearsalOptions, 'played'>;
    /** Overrides for one week only, keyed by the week being played. */
    readonly perWeek?: ReadonlyMap<number, Omit<RehearsalOptions, 'played'>>;
  },
): Promise<readonly PlayedWeek[]> {
  const out: PlayedWeek[] = [];
  const from = input.from ?? 1;

  for (let week = from; week <= input.through; week++) {
    const source = rehearsalSeason({
      played: week,
      ...input.options,
      ...(input.perWeek?.get(week) ?? {}),
    });

    const at = new Date(input.at.getTime() + (week - from) * 7 * 24 * 60 * 60 * 1000);
    const report = await runTuesday(db, {
      season: REHEARSAL_SEASON_YEAR,
      at,
      sleeper: source,
      /*
       * Tony's Line stays shut, which is what `18 §3.4` and the deployed flag
       * both say. A rehearsal that opened it would be rehearsing a different
       * product.
       *
       * An empty environment rather than `process.env`, so a variable set on the
       * machine running the tests cannot change what the rehearsal rehearses.
       */
      env: {} as NodeJS.ProcessEnv,
    });

    out.push({ week, report });
  }

  return out;
}
