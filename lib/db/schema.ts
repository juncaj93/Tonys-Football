import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Identity core.
 *
 * The single most important rule in the data model (`16 §5.1`):
 *
 *   > Roster 7 in 2025 is not roster 7 in 2026.
 *
 * Sleeper reuses `roster_id` across seasons and reassigns slots when managers
 * turn over. A person is therefore NOT identified by their roster slot.
 * Permanent things hang off `users`; seasonal things hang off
 * `season_memberships`.
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

  sleeperLeagueId: text('sleeper_league_id'),

  status: seasonStatus('status').notNull().default('DRAFT_PREP'),

  /**
   * True for seasons imported retroactively with thinner data.
   *
   * `16 §12` requires that thin history be *visible* rather than disguised —
   * Tony says "highest since we started recording", never pretends to know.
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

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Season = typeof seasons.$inferSelect;
export type NewSeason = typeof seasons.$inferInsert;
export type SeasonMembership = typeof seasonMemberships.$inferSelect;
export type NewSeasonMembership = typeof seasonMemberships.$inferInsert;
