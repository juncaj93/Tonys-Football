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

import { settleOpenHandsAtSeasonClose } from '@/lib/casino/blackjack';
import { now } from '@/lib/clock';
import { type Database, type Queryable } from '@/lib/db';
import {
  fantasyMatchups,
  seasonMemberships,
  seasons,
  syncRuns,
  users,
  type SyncRun,
} from '@/lib/db/schema';
import {
  loadManagerMappings,
  mappingsBySleeperId,
  type ManagerMappingFile,
} from '@/lib/identity/mappings';

import { championUserId, type ChainResult, type ImportedSeason } from './chain';
import { hasRosterMetadata } from './metadata';
import { isPairingDisputed, toCents } from './reconcile';
import { isScoredWeek } from './weeks';

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

/**
 * Write one season's games.
 *
 * ## Only scored, paired games
 *
 * A week's `type` comes from the league's own `playoff_week_start` and
 * `last_scored_leg` (`weeks.ts`), so week 18 is `unscored` even though every
 * roster has points in it, and those rows are not games. An unpaired roster —
 * eliminated, still accumulating points — is not a game either. Both are normal
 * states rather than errors, and `fantasy_matchups` is a table of games.
 *
 * ## Never overwrite a finalized result
 *
 * The same rule the memberships follow, and for a stronger reason: a game has a
 * *winner*, and republishing a different one is a false claim about two named
 * people. Where a re-import disagrees with a stored row in a **finalized**
 * season, the stored row wins and the disagreement is recorded as a conflict.
 * In an open season the new figures win, because the week is still moving.
 *
 * The database backs this up — a trigger refuses the update outright — so this
 * function is the polite half of a rule that is enforced whether or not anybody
 * calls it politely.
 *
 * ## `disputed` is written here, once
 *
 * `reconcile.ts` already knows which games sit inside the 2024
 * finalized-versus-snapshot disagreement. Recording it on the row means a fact
 * derived months later reads one boolean instead of re-running a
 * reconciliation — and cannot forget to.
 */
/**
 * A scheduled game nobody has played yet.
 *
 * Sleeper publishes the whole season's schedule the moment a league drafts, and
 * a week that has not happened comes back as ordinary matchup rows with
 * `points: 0` on both sides. Nothing in the payload says *"not yet"* — no
 * kickoff time, no status field; `lib/sleeper/endpoints.ts` is the whole surface
 * this product talks to and none of its eight endpoints carries an NFL schedule.
 * Both scores being exactly zero is the only signal there is.
 *
 * **Why it has to be caught here rather than by reading fewer weeks.** The
 * in-season sync reads through one week past what it holds, so between the draft
 * and the opener it asks for week 1 every Tuesday. Without this, the first of
 * those Tuesdays would store five 0.00–0.00 ties, `finalizeWeek` would close the
 * week on them, and `week_finalizations` is append-only — so week 1's *real*
 * result could never be recorded, and the paper would have printed a week that
 * did not happen. That is the "never fabricate" rule (`16 §12`) failing in the
 * one direction that cannot be undone.
 *
 * **What it costs, stated rather than implied.** A genuine 0.00–0.00 game would
 * be dropped, and there is no way to tell the two apart from this payload. In
 * this league that needs twenty starters — defenses included, no kickers — to
 * score exactly nothing between them; `weekly.test.ts` asserts it has never
 * happened across the 162 recorded games of 2024 and 2025, so the rule is
 * measured against the league's own history rather than assumed.
 */
function isUnplayed(pairing: { readonly pointsA: number; readonly pointsB: number }): boolean {
  return toCents(pairing.pointsA) === 0 && toCents(pairing.pointsB) === 0;
}

async function persistWeeks(
  tx: Queryable,
  input: {
    season: ImportedSeason;
    seasonId: string;
    finalized: boolean;
    conflicts: string[];
  },
): Promise<{ inserted: number; updated: number; unchanged: number; refused: number }> {
  const { season, seasonId, finalized, conflicts } = input;

  const stored = await tx
    .select({
      id: fantasyMatchups.id,
      week: fantasyMatchups.week,
      sleeperMatchupId: fantasyMatchups.sleeperMatchupId,
      rosterAId: fantasyMatchups.rosterAId,
      rosterBId: fantasyMatchups.rosterBId,
      pointsACents: fantasyMatchups.pointsACents,
      pointsBCents: fantasyMatchups.pointsBCents,
      winnerRosterId: fantasyMatchups.winnerRosterId,
      marginCents: fantasyMatchups.marginCents,
      disputed: fantasyMatchups.disputed,
    })
    .from(fantasyMatchups)
    .where(eq(fantasyMatchups.seasonId, seasonId));

  const byKey = new Map(stored.map((row) => [`${String(row.week)}:${String(row.sleeperMatchupId)}`, row]));

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  let refused = 0;

  for (const week of season.weeks) {
    if (!isScoredWeek(week.type)) continue;

    for (const pairing of week.pairings) {
      if (isUnplayed(pairing)) {
        /*
         * A fixture, not a result. See `isUnplayed` — this is the one thing
         * standing between the in-season sync and a finalized week of ties that
         * were never played, and a finalized week cannot be reopened.
         */
        continue;
      }

      const disputed =
        season.reconciliation !== null &&
        isPairingDisputed(season.reconciliation, week.week, pairing.rosterAId, pairing.rosterBId);

      const incoming = {
        seasonId,
        week: week.week,
        weekType: week.type,
        sleeperMatchupId: pairing.matchupId,
        rosterAId: pairing.rosterAId,
        rosterBId: pairing.rosterBId,
        pointsACents: toCents(pairing.pointsA),
        pointsBCents: toCents(pairing.pointsB),
        winnerRosterId: pairing.winnerRosterId,
        // Recomputed from the cents rather than carried over from
        // `pairing.margin`, which is a rounded float. The CHECK constraint
        // compares these two integers, so a float that rounded differently
        // would fail the insert rather than store a margin that disagrees with
        // its own points.
        marginCents: Math.abs(toCents(pairing.pointsA) - toCents(pairing.pointsB)),
        capturedAt: week.capturedAt,
        disputed,
      };

      const existing = byKey.get(`${String(week.week)}:${String(pairing.matchupId)}`);

      if (existing === undefined) {
        await tx.insert(fantasyMatchups).values(incoming);
        inserted++;
        continue;
      }

      const differs =
        existing.rosterAId !== incoming.rosterAId ||
        existing.rosterBId !== incoming.rosterBId ||
        existing.pointsACents !== incoming.pointsACents ||
        existing.pointsBCents !== incoming.pointsBCents ||
        existing.winnerRosterId !== incoming.winnerRosterId ||
        existing.marginCents !== incoming.marginCents;

      if (!differs) {
        // `disputed` and `capturedAt` are annotation about our knowledge of the
        // game rather than the game, so they are refreshed even on a finalized
        // season — a re-reconciliation must be able to record what it found.
        if (existing.disputed !== incoming.disputed) {
          await tx
            .update(fantasyMatchups)
            .set({ disputed: incoming.disputed, capturedAt: incoming.capturedAt, updatedAt: now() })
            .where(eq(fantasyMatchups.id, existing.id));
          updated++;
        } else {
          unchanged++;
        }
        continue;
      }

      if (finalized) {
        conflicts.push(
          `${String(season.year)} week ${String(week.week)} matchup ${String(pairing.matchupId)}: ` +
            `Sleeper now reports ${String(pairing.pointsA)}–${String(pairing.pointsB)} ` +
            `for rosters ${String(pairing.rosterAId)}/${String(pairing.rosterBId)}, ` +
            `stored ${String(existing.pointsACents / 100)}–${String(existing.pointsBCents / 100)}. ` +
            'The season is finalized; the stored result stands and nothing was written.',
        );
        refused++;
        continue;
      }

      await tx
        .update(fantasyMatchups)
        .set({ ...incoming, updatedAt: now() })
        .where(eq(fantasyMatchups.id, existing.id));
      updated++;
    }
  }

  return { inserted, updated, unchanged, refused };
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

        /*
         * Is this read **older** than the one already stored?
         *
         * Finalization protects a closed season. Nothing protected an *open*
         * one, and an open season has two writers: the Tuesday job, reading
         * Sleeper live, and `npm run db:seed`, reading the recorded fixtures on
         * every single deploy (`vercel-build`). The fixtures were captured
         * before the season started, so without this the second writer walks
         * over the first — a merge to `main` in week 9 silently resets every
         * standing to 0–0 and reports it as *"1 records changed"*.
         *
         * That is not hypothetical; it is reproducible in four commands and it
         * is what this guard was written against.
         *
         * `snapshot_captured_at` is the right clock because it already means
         * exactly this: *when we last looked*. Live reads carry real time,
         * fixtures carry their recording time, and `fetchDecoded` has stamped
         * both since the transport was written.
         *
         * **Older, not merely different.** A re-read of the same capture is
         * equal and proceeds — that is what keeps a re-run of the seed a no-op
         * rather than a refusal. And a fresh database has no stored capture at
         * all, so a first import can never be stale.
         */
        const staleCapture =
          existingSeason !== undefined &&
          existingSeason.snapshotCapturedAt !== null &&
          season.capturedAt !== null &&
          season.capturedAt.getTime() < existingSeason.snapshotCapturedAt.getTime();

        if (staleCapture) {
          conflicts.push(
            `${String(season.year)} was read from a source captured ` +
              `${season.capturedAt?.toISOString() ?? 'at an unknown time'}, which is older than ` +
              `the stored capture (${existingSeason.snapshotCapturedAt?.toISOString() ?? 'unknown'}). ` +
              `The stored record is fresher and stands; no standings or games were written.`,
          );
        }

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

            if (staleCapture) {
              // A read older than the stored one. The season-level conflict
              // above says why once; a line per roster would bury it.
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

        // ---- The weeks -----------------------------------------------------
        //
        // Before finalization, for the same reason the memberships are: a
        // season frozen earlier in this pass would refuse its own rows.
        //
        // A stale capture writes no games for the same reason it writes no
        // standings: a July fixture that reports week 9 as unplayed is not new
        // information about week 9.
        const games = staleCapture
          ? { inserted: 0, updated: 0, unchanged: 0, refused: 0 }
          : await persistWeeks(tx, {
              season,
              seasonId,
              finalized: wasFinalized,
              conflicts,
            });
        recordsChanged += games.inserted + games.updated;
        recordsSkipped += games.refused;

        // Freezing happens last, after this season's rows are written — a
        // season finalized earlier in the same pass would refuse its own
        // inserts' sibling updates.
        let finalized = false;
        if (finalizeYears.has(season.year) && !wasFinalized) {
          await tx
            .update(seasons)
            // `ARCHIVED` travels with the close. See `finalizeSeason` below for
            // why the status is written here and not seeded from Sleeper's.
            .set({ finalizedAt: now(), status: 'ARCHIVED', updatedAt: now() })
            .where(eq(seasons.id, seasonId));
          finalized = true;
          recordsChanged++;
        }

        /*
         * The scoring snapshot moves upstream even when the official record
         * does not, so record when we last looked regardless of finalization.
         *
         * **Forward only.** This column is the guard's own clock: letting a
         * stale read stamp its older time here would make the *next* stale read
         * look fresh, and the deploy seed would win on the second attempt.
         */
        if (!staleCapture &&
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
 *
 * ## The status travels with the close, and it had been left behind
 *
 * `status` is seeded from Sleeper's own lifecycle **on insert and never
 * again** — the deliberate half of *"Sleeper seeds; Tony's owns"*. What was
 * missing is the other half: nothing in the product ever wrote it, so a season
 * created during the preseason stayed `DRAFT_PREP` through its whole year *and
 * through its own finalization*. Five readers take `status = 'ARCHIVED'` to
 * mean *"this season is history"* — the receipt's finish, Tonight's champion
 * and history lines, the board's featured matchup, and the derived-tag layer's
 * `isComplete` — and every one of them would have gone on ignoring 2026 after
 * the books were shut on it.
 *
 * So the close writes both. Not Sleeper's `complete`, which is refused above
 * for reasons that have not changed; the **decision** to close is what moves the
 * status, which is the same authority `finalized_at` already carries.
 */
export async function finalizeSeason(db: Database, year: number): Promise<boolean> {
  /*
   * ## One transaction, and the order inside it is load-bearing
   *
   * `apply_token_delta` refuses a finalized season. So an open blackjack hand
   * that survived the close could **never** be settled: its payout would be
   * unwritable forever, and `blackjack_hands_one_open_per_user` would jam that
   * manager's seat permanently. There is no cleanup job to rescue it —
   * `16 §4.3` allows two crons and this would be a third.
   *
   * The answer is ordering rather than machinery. Inside one transaction:
   * settle every open hand **first**, then shut the books. A hand cannot be
   * stranded because the books are still open while it settles, and a hand
   * dealt concurrently cannot slip past because the settlement takes
   * `FOR UPDATE` on every open row — a `HIT` racing the close either commits
   * before it and gets swept, or blocks and finds the hand already settled.
   *
   * The commissioner's ruling is that abandonment is **not** refunded: the
   * player is stood on whatever they were holding and the dealer runs normally.
   * `lib/casino/blackjack.ts` carries the reasoning; this is where it happens.
   */
  return db.transaction(async (tx) => {
    const [season] = await tx
      .select({ id: seasons.id, finalizedAt: seasons.finalizedAt })
      .from(seasons)
      .where(eq(seasons.year, year))
      .for('update');

    if (season === undefined || season.finalizedAt !== null) return false;

    await settleOpenHandsAtSeasonClose(tx, season.id);

    await tx
      .update(seasons)
      .set({ finalizedAt: now(), status: 'ARCHIVED', updatedAt: now() })
      .where(eq(seasons.id, season.id));

    return true;
  });
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
    // Back to `ACTIVE` rather than to whatever it was before. A season being
    // reopened is one somebody is correcting, which is not a draft, and the four
    // "this is history" surfaces must stop treating it as settled the moment its
    // record can move again.
    .set({ finalizedAt: null, status: 'ACTIVE', updatedAt: now() })
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
