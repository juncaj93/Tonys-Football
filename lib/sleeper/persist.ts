/**
 * Persisting an imported chain.
 *
 * This is the boundary where Sleeper's account of the past becomes Tony's
 * Pizza's permanent record. Everything upstream of here is a pure read;
 * everything here writes rows that later seasons of collectibles, rings, and
 * Timeline entries will hang off.
 *
 * Four rules shape the whole file.
 *
 * **All or nothing.** The entire import runs in one transaction. A partial
 * import — 2025's managers present, 2024's missing — is worse than no import,
 * because the gap is invisible until something later reads around it.
 *
 * **The sync run is written outside that transaction.** If the audit record
 * lived inside, a rollback would erase the evidence of the failure that caused
 * it. `09 §14` wants the last *attempted* sync, not just the last successful
 * one.
 *
 * **Never overwrite, never delete.** `15 §5` requires provider failures to
 * preserve prior valid data. Where Sleeper now disagrees with what we already
 * recorded, the existing row wins and the disagreement is reported as a
 * conflict for the commissioner. An importer that silently reassigns a roster
 * is the exact mechanism by which someone inherits another manager's history.
 *
 * **Sleeper seeds; Tony's owns.** Display names, season status, and season
 * titles are seeded from Sleeper at first insert and never touched again. They
 * belong to Tony's Pizza after that — the commissioner may rename a manager or
 * advance a season, and a re-sync must not undo it.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';

import { now } from '@/lib/clock';
import { type Database } from '@/lib/db';
import { seasonMemberships, seasons, syncRuns, users, type SyncRun } from '@/lib/db/schema';

import { championUserId, type ChainResult, type ImportedSeason } from './chain';
import { hasRosterMetadata } from './metadata';

/**
 * More than one co-owner on a roster.
 *
 * Commissioner decision, 2026-07-28: fail loudly rather than silently lose or
 * misattribute history. The model holds one co-owner because this league has
 * only ever had one; a second means the model needs widening, and that is a
 * decision for a person rather than a truncation for the importer.
 */
export class MultipleCoOwnersError extends Error {
  constructor(
    readonly year: number,
    readonly rosterId: number,
    readonly coOwnerUserIds: readonly string[],
  ) {
    super(
      `Roster ${String(rosterId)} in ${String(year)} has ${String(coOwnerUserIds.length)} ` +
        `co-owners (${coOwnerUserIds.join(', ')}), but the data model holds one. ` +
        `Import aborted rather than dropping a person from league history. ` +
        `Widening this needs a schema change — see season_memberships.co_owner_user_id.`,
    );
    this.name = 'MultipleCoOwnersError';
  }
}

export interface SeasonImportSummary {
  readonly year: number;
  readonly leagueId: string;
  readonly seasonCreated: boolean;
  readonly membershipsCreated: number;
  readonly membershipsUnchanged: number;
  readonly championUserId: string | null;
  readonly conflicts: readonly string[];
}

export interface ImportSummary {
  readonly syncRunId: string;
  readonly status: 'SUCCEEDED' | 'NEEDS_REVIEW';
  readonly usersCreated: number;
  readonly recordsChanged: number;
  readonly recordsSkipped: number;
  readonly seasons: readonly SeasonImportSummary[];
  readonly warnings: readonly string[];
}

export interface PersistOptions {
  /** Identifies the data source in the audit record, e.g. `fixtures(…)`. */
  readonly sourceLabel: string;
}

/** Sleeper's lifecycle seeds ours; the season service owns it from then on. */
function seedSeasonStatus(sleeperStatus: string): 'DRAFT_PREP' | 'ACTIVE' | 'ARCHIVED' {
  switch (sleeperStatus) {
    case 'in_season':
      return 'ACTIVE';
    case 'complete':
      return 'ARCHIVED';
    default:
      // pre_draft, drafting, and anything unrecognized.
      return 'DRAFT_PREP';
  }
}

/**
 * Guard the co-owner assumption before anything is written.
 *
 * Runs across every season first, so a violation in 2024 aborts before 2026's
 * rows are inserted and rolled back.
 */
function assertSingleCoOwners(seasonList: readonly ImportedSeason[]): void {
  for (const season of seasonList) {
    for (const seat of season.seats) {
      if (seat.coOwnerUserIds.length > 1) {
        throw new MultipleCoOwnersError(season.year, seat.rosterId, seat.coOwnerUserIds);
      }
    }
  }
}

/**
 * Every person across the chain, newest name wins.
 *
 * Seasons arrive newest-first, and a manager who changed their Sleeper handle
 * should enter our records under the name they use now.
 */
function collectPeople(seasonList: readonly ImportedSeason[]): Map<string, string> {
  const people = new Map<string, string>();
  for (const season of seasonList) {
    for (const user of season.users) {
      if (!people.has(user.userId)) people.set(user.userId, user.displayName);
    }
  }
  return people;
}

export async function persistChain(
  db: Database,
  chain: ChainResult,
  options: PersistOptions,
): Promise<ImportSummary> {
  if (chain.seasons.length === 0) {
    throw new Error('Nothing to import: the chain produced no seasons.');
  }

  assertSingleCoOwners(chain.seasons);

  // Written first and committed on its own, so a failure below still leaves a
  // record that an import was attempted.
  const [run] = await db
    .insert(syncRuns)
    .values({ kind: 'HISTORICAL_IMPORT', source: options.sourceLabel, status: 'RUNNING' })
    .returning({ id: syncRuns.id });

  if (run === undefined) {
    throw new Error('Could not open a sync run.');
  }

  try {
    const summary = await db.transaction(async (tx) => {
      const conflicts: string[] = [];

      // ---- People ----------------------------------------------------------
      const people = collectPeople(chain.seasons);
      const sleeperIds = [...people.keys()];

      const existing =
        sleeperIds.length === 0
          ? []
          : await tx
              .select({ id: users.id, sleeperUserId: users.sleeperUserId })
              .from(users)
              .where(inArray(users.sleeperUserId, sleeperIds));

      const userIdBySleeperId = new Map<string, string>();
      for (const row of existing) {
        if (row.sleeperUserId !== null) userIdBySleeperId.set(row.sleeperUserId, row.id);
      }

      const missing = sleeperIds.filter((id) => !userIdBySleeperId.has(id));
      if (missing.length > 0) {
        const inserted = await tx
          .insert(users)
          .values(
            missing.map((sleeperUserId) => ({
              // Seeded from Sleeper once. Tony's Pizza owns it from here —
              // a commissioner rename must survive every future re-sync.
              displayName: people.get(sleeperUserId) ?? sleeperUserId,
              sleeperUserId,
            })),
          )
          .returning({ id: users.id, sleeperUserId: users.sleeperUserId });

        for (const row of inserted) {
          if (row.sleeperUserId !== null) userIdBySleeperId.set(row.sleeperUserId, row.id);
        }
      }

      // ---- Seasons and memberships ----------------------------------------
      // Oldest first, so history accumulates forward the way it happened.
      const ordered = [...chain.seasons].sort((a, b) => a.year - b.year);
      const seasonSummaries: SeasonImportSummary[] = [];
      let recordsChanged = missing.length;
      let recordsSkipped = 0;

      for (const season of ordered) {
        const [existingSeason] = await tx
          .select({ id: seasons.id })
          .from(seasons)
          .where(eq(seasons.year, season.year));

        let seasonId: string;
        let seasonCreated = false;

        if (existingSeason === undefined) {
          const [created] = await tx
            .insert(seasons)
            .values({
              year: season.year,
              sleeperLeagueId: season.leagueId,
              status: seedSeasonStatus(season.status),
              // A season already complete when we first saw it was
              // reconstructed after the fact, never watched live. `16 §12`
              // requires that distinction stay visible rather than disguised.
              isHistorical: season.isComplete,
            })
            .returning({ id: seasons.id });

          if (created === undefined) throw new Error(`Could not create season ${String(season.year)}.`);
          seasonId = created.id;
          seasonCreated = true;
          recordsChanged++;
        } else {
          seasonId = existingSeason.id;
        }

        const existingMemberships = await tx
          .select({
            id: seasonMemberships.id,
            rosterId: seasonMemberships.rosterId,
            userId: seasonMemberships.userId,
          })
          .from(seasonMemberships)
          .where(eq(seasonMemberships.seasonId, seasonId));

        const membershipByRoster = new Map(existingMemberships.map((m) => [m.rosterId, m]));

        let membershipsCreated = 0;
        let membershipsUnchanged = 0;

        for (const seat of season.seats) {
          if (seat.primaryUserId === null) {
            conflicts.push(
              `${String(season.year)} roster ${String(seat.rosterId)} has no owner on Sleeper; ` +
                `no membership was created.`,
            );
            recordsSkipped++;
            continue;
          }

          const userId = userIdBySleeperId.get(seat.primaryUserId);
          if (userId === undefined) {
            conflicts.push(
              `${String(season.year)} roster ${String(seat.rosterId)}: Sleeper user ` +
                `${seat.primaryUserId} could not be resolved to a person.`,
            );
            recordsSkipped++;
            continue;
          }

          const coOwnerSleeperId = seat.coOwnerUserIds[0];
          const coOwnerUserId =
            coOwnerSleeperId === undefined ? null : (userIdBySleeperId.get(coOwnerSleeperId) ?? null);

          const already = membershipByRoster.get(seat.rosterId);

          if (already !== undefined) {
            if (already.userId !== userId) {
              // Sleeper says this seat belongs to someone else than we
              // recorded. Overwriting would hand one manager's history to
              // another, so the existing row stands and a human decides.
              conflicts.push(
                `${String(season.year)} roster ${String(seat.rosterId)} is already recorded to a ` +
                  `different manager than Sleeper now reports. Left unchanged — resolve manually.`,
              );
              recordsSkipped++;
            } else {
              membershipsUnchanged++;
            }
            continue;
          }

          const finalRank = Object.entries(season.placements.byPosition).find(
            ([, rosterId]) => rosterId === seat.rosterId,
          )?.[0];

          await tx.insert(seasonMemberships).values({
            seasonId,
            userId,
            rosterId: seat.rosterId,
            coOwnerUserId,
            sleeperMetadata: hasRosterMetadata(seat.metadata) ? seat.metadata : null,
            finalRank: finalRank === undefined ? null : Number(finalRank),
          });

          membershipsCreated++;
          recordsChanged++;
        }

        const championSleeperId = championUserId(season);

        seasonSummaries.push({
          year: season.year,
          leagueId: season.leagueId,
          seasonCreated,
          membershipsCreated,
          membershipsUnchanged,
          championUserId:
            championSleeperId === null ? null : (userIdBySleeperId.get(championSleeperId) ?? null),
          conflicts: conflicts.filter((c) => c.startsWith(String(season.year))),
        });
      }

      return {
        usersCreated: missing.length,
        recordsChanged,
        recordsSkipped,
        seasons: seasonSummaries,
        conflicts,
      };
    });

    const status = summary.conflicts.length > 0 ? 'NEEDS_REVIEW' : 'SUCCEEDED';
    const warnings = [...summary.conflicts, ...chain.warnings];

    await db
      .update(syncRuns)
      .set({
        status,
        finishedAt: now(),
        recordsChanged: summary.recordsChanged,
        recordsSkipped: summary.recordsSkipped,
        warnings,
      })
      .where(eq(syncRuns.id, run.id));

    return {
      syncRunId: run.id,
      status,
      usersCreated: summary.usersCreated,
      recordsChanged: summary.recordsChanged,
      recordsSkipped: summary.recordsSkipped,
      seasons: summary.seasons,
      warnings,
    };
  } catch (error: unknown) {
    await db
      .update(syncRuns)
      .set({
        status: 'FAILED',
        finishedAt: now(),
        error: error instanceof Error ? error.message : String(error),
      })
      .where(eq(syncRuns.id, run.id));

    throw error;
  }
}

/**
 * The most recent successful import, for the admin sync panel (`09 §14`).
 *
 * `NEEDS_REVIEW` does not count as successful: a run that left a conflict
 * unresolved should not be what "last good sync" points at.
 */
export async function lastSuccessfulRun(db: Database): Promise<SyncRun | null> {
  const [row] = await db
    .select()
    .from(syncRuns)
    .where(and(eq(syncRuns.kind, 'HISTORICAL_IMPORT'), eq(syncRuns.status, 'SUCCEEDED')))
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);

  return row ?? null;
}
