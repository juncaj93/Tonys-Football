import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { type RosterMetadata } from '@/lib/sleeper/metadata';

/**
 * Identity core.
 *
 * The single most important rule in the data model (`16 §5.1`):
 *
 *   > Roster 4 in 2025 is not roster 4 in 2026.
 *
 * Sleeper reuses `roster_id` across seasons and reassigns slots when managers
 * turn over. A person is therefore NOT identified by their roster slot.
 * Permanent things hang off `users`; seasonal things hang off
 * `season_memberships`.
 *
 * This is not hypothetical: in the recorded league, roster 4 is held by
 * Berardo in 2024, Topouzian in 2025, and Zack in 2026 — three distinct
 * Sleeper accounts in one slot. `lib/sleeper/chain.test.ts` asserts it.
 *
 * Getting this wrong is unrecoverable — a replacement manager would silently
 * inherit the previous occupant's championships, collectibles, and history.
 *
 * On timestamps: `created_at` / `updated_at` default to the database clock
 * because they are audit metadata, and audit metadata should record real
 * wall time. Business dates — season phase boundaries, deadlines, publication
 * times — must come from the application clock in `lib/clock.ts` so the time
 * machine and the synthetic season replay can control them.
 */

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/** Season lifecycle, per `04 §6`. */
export const seasonStatus = pgEnum('season_status', [
  'DRAFT_PREP',
  'ACTIVE',
  'PLAYOFFS',
  'SPEND_DOWN',
  'OFFSEASON',
  'ARCHIVED',
]);

/**
 * A permanent person.
 *
 * Never deleted. A departed manager is retired, which preserves every
 * membership, collectible, ring, and Timeline entry attached to them.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),

  displayName: text('display_name').notNull(),

  /**
   * Sleeper account, mapped when the manager claims their profile.
   * Nullable: historical managers imported from 2024/2025 may never claim,
   * and a person exists here before they authenticate.
   */
  sleeperUserId: text('sleeper_user_id').unique(),

  /** argon2id. Null until the manager sets a PIN at claim time. */
  pinHash: text('pin_hash'),

  isAdmin: boolean('is_admin').notNull().default(false),

  /** Retired, not deleted. History is preserved permanently. */
  isRetired: boolean('is_retired').notNull().default(false),

  ...timestamps,
});

/**
 * One fantasy season.
 *
 * `sleeperLeagueId` is nullable because 2024/2025 may be imported through the
 * manual tier if the `previous_league_id` chain is incomplete (`16 §12`).
 */
export const seasons = pgTable('seasons', {
  id: uuid('id').primaryKey().defaultRandom(),

  /** One season per calendar year. */
  year: integer('year').notNull().unique(),

  /**
   * Sleeper mints a new league ID each season, so this is unique across
   * seasons. Without the constraint two `seasons` rows could claim the same
   * Sleeper league and an import would have no way to tell which it meant.
   */
  sleeperLeagueId: text('sleeper_league_id').unique(),

  status: seasonStatus('status').notNull().default('DRAFT_PREP'),

  /**
   * A completed season reconstructed after the website existed.
   *
   * This is a statement about **provenance, not completeness**. A season
   * imported cleanly from Sleeper's chain is historical *and* complete —
   * 2024 and 2025 both are. The flag records that we were not here to watch
   * it happen, nothing more.
   *
   * Completeness is tracked separately, at the level of individual facts:
   * `league_memories.confidence` says whether a specific claim is solid.
   * Tony hedges because a *fact* is unverified, never because a season is
   * old. Do not add a season-level completeness flag — the two questions are
   * orthogonal and collapsing them loses both answers.
   *
   * Set once, at import, from whether the season had already finished the
   * first time we saw it. Never recomputed: a season we watched live stays
   * non-historical forever, even after it closes.
   */
  isHistorical: boolean('is_historical').notNull().default(false),

  /** Algorithmically suggested, commissioner selected (`16 §3`). Set at close. */
  title: text('title'),

  closedAt: timestamp('closed_at', { withTimezone: true }),

  ...timestamps,
});

/**
 * A person's seat in one season.
 *
 * This is the join that keeps permanent identity separate from the seasonal
 * Sleeper roster slot. Two constraints carry the whole model:
 *
 *   - one person may hold at most one seat per season
 *   - one roster slot belongs to at most one person per season
 *
 * Both are scoped to the season, never global — a global unique on `rosterId`
 * would be the exact bug this table exists to prevent.
 *
 * Co-ownership (commissioner decision, 2026-07-28) does not weaken either
 * constraint: a co-owner becomes a `users` row and gets NO membership. The
 * column recording them alongside the primary membership arrives with the
 * persistence slice; `lib/sleeper/chain.ts` already imports them this way.
 */
export const seasonMemberships = pgTable(
  'season_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    seasonId: uuid('season_id')
      .notNull()
      // Never delete a season out from under its history.
      .references(() => seasons.id, { onDelete: 'restrict' }),

    userId: uuid('user_id')
      .notNull()
      // Never cascade-delete a person's record of having played.
      .references(() => users.id, { onDelete: 'restrict' }),

    /** Sleeper's roster slot for this season only. Meaningless across seasons. */
    rosterId: integer('roster_id').notNull(),

    /**
     * A second person sharing this roster on Sleeper.
     *
     * Commissioner decision, 2026-07-28 (option (a)): a co-owner is a real
     * person and gets a `users` row, but holds NO membership of their own.
     * Recording them here keeps both unique constraints intact while keeping
     * the person in league history.
     *
     * Deliberately a single column, not a list: this league has had exactly
     * one co-owner ever. The importer raises a hard error if Sleeper ever
     * reports more than one on a roster, so we find out and widen the model
     * rather than silently dropping someone.
     */
    coOwnerUserId: uuid('co_owner_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),

    /**
     * League-authored text kept from Sleeper's roster metadata — chiefly the
     * manager-written player nicknames, which are curated source material for
     * Tony's dialogue and lore (`16 §10`). Sleeper overwrites a nickname when
     * the manager changes it, so it is unrecoverable if not captured here.
     * Personal notification settings are discarded at import.
     */
    sleeperMetadata: jsonb('sleeper_metadata').$type<RosterMetadata>(),

    /** False when a manager left mid-season and was replaced. */
    isActive: boolean('is_active').notNull().default(true),

    finalRank: integer('final_rank'),

    ...timestamps,
  },
  (table) => [
    unique('season_memberships_season_roster_unique').on(table.seasonId, table.rosterId),
    unique('season_memberships_season_user_unique').on(table.seasonId, table.userId),
  ],
);

/**
 * What kind of job a sync run was.
 *
 * Only the historical import exists today. The two scheduled jobs from
 * `16 §4.3` get their own values when they are built — adding an enum value is
 * a one-line migration, and inventing them now would be scaffolding for code
 * that does not exist.
 */
export const syncRunKind = pgEnum('sync_run_kind', ['HISTORICAL_IMPORT']);

export const syncRunStatus = pgEnum('sync_run_status', [
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  /** Finished, but something needs a human — a conflict was left unresolved. */
  'NEEDS_REVIEW',
]);

/**
 * One execution of a sync job.
 *
 * `09 §14` requires admin visibility into the last successful sync, the last
 * attempted sync, records changed, records skipped, and conflict warnings.
 * This table is where all of that comes from, and it is written even when the
 * run fails — a failed run that leaves no trace is the one you cannot debug.
 *
 * `source` records whether a run read the live API or recorded fixtures.
 * Without it, "why does staging disagree with production" is unanswerable.
 */
export const syncRuns = pgTable('sync_runs', {
  id: uuid('id').primaryKey().defaultRandom(),

  kind: syncRunKind('kind').notNull(),
  status: syncRunStatus('status').notNull().default('RUNNING'),

  /** e.g. `fixtures(fixtures/sleeper)` or `live(https://api.sleeper.app/v1)`. */
  source: text('source').notNull(),

  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),

  recordsChanged: integer('records_changed').notNull().default(0),
  recordsSkipped: integer('records_skipped').notNull().default(0),

  /** Conflicts and anomalies worth a commissioner's attention. */
  warnings: jsonb('warnings').$type<string[]>().notNull().default([]),

  /** Set when the run failed. Null on success. */
  error: text('error'),

  ...timestamps,
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Season = typeof seasons.$inferSelect;
export type NewSeason = typeof seasons.$inferInsert;
export type SeasonMembership = typeof seasonMemberships.$inferSelect;
export type NewSeasonMembership = typeof seasonMemberships.$inferInsert;
export type SyncRun = typeof syncRuns.$inferSelect;
export type NewSyncRun = typeof syncRuns.$inferInsert;
