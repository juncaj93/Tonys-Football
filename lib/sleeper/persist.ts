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
import {
  loadManagerMappings,
  mappingsBySleeperId,
  type ManagerMappingFile,
} from '@/lib/identity/mappings';

import { championUserId, type ChainResult, type ImportedSeason } from './chain';
import { hasRosterMetadata } from './metadata';
import { toCents } from './reconcile';

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

/**
 * One roster's official finalized record, as persisted.
 *
 * These fields come from `rosters[].settings` and never from recomputed weekly
 * points. That is the ruling of 2026-07-29 §3, and it is the only choice
 * consistent with the 2024 bracket: the playoff field and its seeding follow
 * from these standings, so a record recomputed from today's corrected points
 * would describe a postseason that never happened.
 */
interface OfficialRecord {
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly pointsFor: number;
  readonly pointsAgainst: number;
  readonly madePlayoffs: boolean;
  readonly finalRank: number | null;
  readonly teamName: string | null;
}

/** Compared in integer cents so a float representation cannot fake a change. */
function sameOfficialRecord(a: OfficialRecord, b: OfficialRecord): boolean {
  return (
    a.wins === b.wins &&
    a.losses === b.losses &&
    a.ties === b.ties &&
    toCents(a.pointsFor) === toCents(b.pointsFor) &&
    toCents(a.pointsAgainst) === toCents(b.pointsAgainst) &&
    a.madePlayoffs === b.madePlayoffs &&
    a.finalRank === b.finalRank &&
    a.teamName === b.teamName
  );
}

function describeRecord(record: OfficialRecord): string {
  return (
    `${String(record.wins)}-${String(record.losses)}-${String(record.ties)}, ` +
    `${record.pointsFor.toFixed(2)} PF, finish ${record.finalRank === null ? '—' : String(record.finalRank)}`
  );
}

export interface SeasonImportSummary {
  readonly year: number;
  readonly leagueId: string;
  readonly seasonCreated: boolean;
  readonly membershipsCreated: number;
  readonly membershipsUnchanged: number;
  /** Existing seats whose record moved. Only ever on a season not yet finalized. */
  readonly membershipsUpdated: number;
  /** True when this run froze the season's official record. */
  readonly finalized: boolean;
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
  /**
   * Seasons to freeze as part of this run.
   *
   * **Explicit by design.** Sleeper's `complete` status is not sufficient —
   * it flips the moment the final game ends, while NFL stat corrections keep
   * arriving for weeks. Finalizing on that signal would freeze a record that
   * is still moving, which is precisely how 2024 ended up with standings and
   * weekly points that disagree.
   */
  readonly finalizeYears?: readonly number[];
  /** Injectable so a test can supply mappings without touching the real file. */
  readonly mappings?: ManagerMappingFile;
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

  // Loaded before the sync run opens: a malformed mapping file is a
  // configuration error, not a failed import, and should not leave a FAILED
  // run behind.
  const mappingFile = options.mappings ?? loadManagerMappings();
  const finalizeYears = new Set(options.finalizeYears ?? []);

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
      const canonical = mappingsBySleeperId(mappingFile);

      const existing =
        sleeperIds.length === 0
          ? []
          : await tx
              .select({
                id: users.id,
                sleeperUserId: users.sleeperUserId,
                displayName: users.displayName,
                sleeperUsername: users.sleeperUsername,
                isRetired: users.isRetired,
              })
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
            missing.map((sleeperUserId) => {
              const mapping = canonical.get(sleeperUserId);
              const sleeperName = people.get(sleeperUserId) ?? sleeperUserId;
              return {
                // The canonical league name where one is approved; the Sleeper
                // handle otherwise, so an unmapped person is visibly unmapped
                // rather than silently named something invented.
                displayName: mapping?.displayName ?? sleeperName,
                sleeperUserId,
                sleeperUsername: sleeperName,
                isRetired: mapping?.retired ?? false,
              };
            }),
          )
          .returning({ id: users.id, sleeperUserId: users.sleeperUserId });

        for (const row of inserted) {
          if (row.sleeperUserId !== null) userIdBySleeperId.set(row.sleeperUserId, row.id);
        }
      }

      for (const sleeperUserId of missing) {
        if (!canonical.has(sleeperUserId)) {
          conflicts.push(
            `Sleeper account ${people.get(sleeperUserId) ?? sleeperUserId} ` +
              `(${sleeperUserId}) has no entry in content/manager-mappings.json. ` +
              `It keeps its Sleeper display name until a canonical name is approved.`,
          );
        }
      }

      // Existing people: the mapping file is the authority on the canonical
      // name and on retirement, so a change there lands here. Sleeper still
      // never overwrites a name — an account with no mapping is left alone,
      // which is what preserves a commissioner rename across a re-sync.
      let peopleUpdated = 0;

      for (const row of existing) {
        if (row.sleeperUserId === null) continue;
        const mapping = canonical.get(row.sleeperUserId);
        const sleeperName = people.get(row.sleeperUserId) ?? null;

        const nextDisplayName = mapping?.displayName ?? row.displayName;
        const nextRetired = mapping?.retired ?? row.isRetired;
        const nextUsername = sleeperName ?? row.sleeperUsername;

        if (
          nextDisplayName === row.displayName &&
          nextRetired === row.isRetired &&
          nextUsername === row.sleeperUsername
        ) {
          continue;
        }

        if (mapping !== undefined && nextDisplayName !== row.displayName) {
          conflicts.push(
            `${row.displayName} is renamed to ${nextDisplayName} by ` +
              `content/manager-mappings.json (${mapping.source}).`,
          );
        }
        if (mapping !== undefined && nextRetired !== row.isRetired) {
          conflicts.push(
            `${nextDisplayName} is marked ${nextRetired ? 'retired' : 'active'} by ` +
              `content/manager-mappings.json. Retirement preserves every membership, ` +
              `team name, record, and finish.`,
          );
        }

        await tx
          .update(users)
          .set({
            displayName: nextDisplayName,
            isRetired: nextRetired,
            sleeperUsername: nextUsername,
            updatedAt: now(),
          })
          .where(eq(users.id, row.id));
        peopleUpdated++;
      }

      // ---- Seasons and memberships ----------------------------------------
      // Oldest first, so history accumulates forward the way it happened.
      const ordered = [...chain.seasons].sort((a, b) => a.year - b.year);
      const seasonSummaries: SeasonImportSummary[] = [];
      let recordsChanged = missing.length + peopleUpdated;
      let recordsSkipped = 0;

      for (const season of ordered) {
        const [existingSeason] = await tx
          .select({
            id: seasons.id,
            finalizedAt: seasons.finalizedAt,
            snapshotCapturedAt: seasons.snapshotCapturedAt,
          })
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
              // A season already complete the first time we saw it was
              // reconstructed after the fact, never watched live. That is
              // what `is_historical` records — provenance, not completeness
              // (`16 §12`). 2024 and 2025 are both historical AND complete.
              //
              // Only set on insert. A season we watched live keeps
              // `is_historical = false` forever, even after it closes.
              isHistorical: season.isComplete,
              snapshotCapturedAt: season.capturedAt,
            })
            .returning({ id: seasons.id });

          if (created === undefined) throw new Error(`Could not create season ${String(season.year)}.`);
          seasonId = created.id;
          seasonCreated = true;
          recordsChanged++;
        } else {
          seasonId = existingSeason.id;
        }

        // Is this season's official record already frozen? Read before any
        // write, because every membership decision below turns on it.
        const wasFinalized =
          existingSeason !== undefined && existingSeason.finalizedAt !== null;

        const existingMemberships = await tx
          .select({
            id: seasonMemberships.id,
            rosterId: seasonMemberships.rosterId,
            userId: seasonMemberships.userId,
            wins: seasonMemberships.wins,
            losses: seasonMemberships.losses,
            ties: seasonMemberships.ties,
            pointsFor: seasonMemberships.pointsFor,
            pointsAgainst: seasonMemberships.pointsAgainst,
            madePlayoffs: seasonMemberships.madePlayoffs,
            finalRank: seasonMemberships.finalRank,
            teamName: seasonMemberships.teamName,
          })
          .from(seasonMemberships)
          .where(eq(seasonMemberships.seasonId, seasonId));

        const membershipByRoster = new Map(existingMemberships.map((m) => [m.rosterId, m]));

        let membershipsCreated = 0;
        let membershipsUnchanged = 0;
        let membershipsUpdated = 0;

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

          // The complete finish, 1..N — the consolation bracket settles 7th
          // through 10th, so nobody is recorded as "no finish" when the answer
          // exists.
          const rank = season.fullPlacements.rankByRoster[seat.rosterId];

          const record: OfficialRecord = {
            wins: seat.wins,
            losses: seat.losses,
            ties: seat.ties,
            pointsFor: seat.pointsFor,
            pointsAgainst: seat.pointsAgainst,
            madePlayoffs: season.fullPlacements.playoffRosterIds.includes(seat.rosterId),
            finalRank: rank ?? null,
            teamName: seat.teamName,
          };

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
              continue;
            }

            if (sameOfficialRecord(already, record)) {
              membershipsUnchanged++;
              continue;
            }

            if (wasFinalized) {
              // The whole point of finalization. Sleeper now disagrees with a
              // record the league already closed the books on — most likely a
              // stat correction landing months later. It does not get to
              // rewrite history quietly; it gets reported and dropped. The
              // database trigger would refuse the write anyway, so this is the
              // readable half of a guard that exists in two places.
              conflicts.push(
                `${String(season.year)} roster ${String(seat.rosterId)} is finalized and its ` +
                  `official record is immutable. Sleeper now reports ${describeRecord(record)}; ` +
                  `the finalized record (${describeRecord(already)}) stands and nothing was ` +
                  `written. Un-finalize the season deliberately if this correction should apply.`,
              );
              recordsSkipped++;
              continue;
            }

            // An open season: the record is supposed to move week to week.
            await tx
              .update(seasonMemberships)
              .set({ ...record, updatedAt: now() })
              .where(eq(seasonMemberships.id, already.id));
            membershipsUpdated++;
            recordsChanged++;
            continue;
          }

          await tx.insert(seasonMemberships).values({
            seasonId,
            userId,
            rosterId: seat.rosterId,
            coOwnerUserId,
            sleeperMetadata: hasRosterMetadata(seat.metadata) ? seat.metadata : null,
            ...record,
          });

          membershipsCreated++;
          recordsChanged++;
        }

        // Freezing happens last, after this season's rows are written — a
        // season finalized earlier in the same pass would refuse its own
        // inserts' sibling updates.
        let finalized = false;
        if (finalizeYears.has(season.year) && !wasFinalized) {
          await tx
            .update(seasons)
            .set({ finalizedAt: now(), updatedAt: now() })
            .where(eq(seasons.id, seasonId));
          finalized = true;
          recordsChanged++;
        }

        // The scoring snapshot moves upstream even when the official record
        // does not, so record when we last looked regardless of finalization.
        if (
          season.capturedAt !== null &&
          existingSeason !== undefined &&
          existingSeason.snapshotCapturedAt?.getTime() !== season.capturedAt.getTime()
        ) {
          await tx
            .update(seasons)
            .set({ snapshotCapturedAt: season.capturedAt })
            .where(eq(seasons.id, seasonId));
        }

        const championSleeperId = championUserId(season);

        seasonSummaries.push({
          year: season.year,
          leagueId: season.leagueId,
          seasonCreated,
          membershipsCreated,
          membershipsUnchanged,
          membershipsUpdated,
          finalized,
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
 * Freeze a season's official record.
 *
 * Explicit and separate from the importer on purpose. Sleeper's `complete`
 * status is not a finalization signal — it flips when the last game ends,
 * while stat corrections keep arriving afterwards, which is exactly how 2024's
 * standings and its weekly points came to disagree. Somebody decides the books
 * are closed; the API does not get a vote.
 *
 * Returns false when the season does not exist or was already finalized, so
 * calling it twice is safe.
 */
export async function finalizeSeason(db: Database, year: number): Promise<boolean> {
  const [season] = await db
    .select({ id: seasons.id, finalizedAt: seasons.finalizedAt })
    .from(seasons)
    .where(eq(seasons.year, year));

  if (season === undefined || season.finalizedAt !== null) return false;

  await db
    .update(seasons)
    .set({ finalizedAt: now(), updatedAt: now() })
    .where(eq(seasons.id, season.id));

  return true;
}

/**
 * Reopen a finalized season.
 *
 * Deliberately possible, deliberately explicit. A correction that genuinely
 * should apply to a closed season needs a way in, and the alternative — a
 * record nobody can ever repair — is worse than the risk. This is the one
 * documented route past the immutability trigger.
 */
export async function unfinalizeSeason(db: Database, year: number): Promise<boolean> {
  const [season] = await db
    .select({ id: seasons.id, finalizedAt: seasons.finalizedAt })
    .from(seasons)
    .where(eq(seasons.year, year));

  if (season === undefined || season.finalizedAt === null) return false;

  await db
    .update(seasons)
    .set({ finalizedAt: null, updatedAt: now() })
    .where(eq(seasons.id, season.id));

  return true;
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
