import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
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

  /**
   * When the PIN was last set.
   *
   * Doubles as the claim marker: null means this manager was imported from
   * Sleeper but has never picked up their keys, which is exactly the set the
   * claim screen offers. Kept separate from `pin_hash` so the hash is never
   * read merely to answer "has this person claimed?".
   */
  pinUpdatedAt: timestamp('pin_updated_at', { withTimezone: true }),

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

    /**
     * The season's record, as Sleeper reports it.
     *
     * This is roster-level state for one season, so it belongs on the row that
     * already represents "this person, in this season, in this slot". It is
     * deliberately NOT week-level data — `fantasy_matchups` and friends
     * (`16 §5.2`) own that when the sync slice lands, and this stays the
     * season total either way.
     *
     * Unlike display names and season titles, these are **not** seeded-once:
     * Sleeper owns fantasy results, so a re-sync updates them. For the two
     * completed seasons the values never move, which is why re-importing
     * history is still a no-op.
     *
     * Stored as `numeric`, not floating point. Points decide who holds
     * `most_points_2025`, and a manager should never lose a Counter Greeting
     * to a rounding artifact.
     */
    wins: integer('wins').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    ties: integer('ties').notNull().default(0),
    pointsFor: numeric('points_for', { precision: 8, scale: 2, mode: 'number' })
      .notNull()
      .default(0),
    pointsAgainst: numeric('points_against', { precision: 8, scale: 2, mode: 'number' })
      .notNull()
      .default(0),

    /**
     * Reached the playoff bracket.
     *
     * Derived at import from appearing in the winners bracket, never inferred
     * from seed or record — a bye, a tiebreak, or a commissioner's format
     * change would all make that inference wrong in a way nobody would notice
     * until Tony told someone they missed January when they did not.
     */
    madePlayoffs: boolean('made_playoffs').notNull().default(false),

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

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/**
 * Why a session stopped being valid.
 *
 * Recorded rather than deleted: "when was I signed out, and by what" is a
 * question a manager will ask, and a deleted row cannot answer it.
 */
export const sessionRevokeReason = pgEnum('session_revoke_reason', [
  'SIGNED_OUT',
  'SIGNED_OUT_EVERYWHERE',
  'PIN_CHANGED',
  'COMMISSIONER_RESET',
]);

/**
 * One signed-in device.
 *
 * `16 §11`: a 90-day rolling session, refreshed every visit, so a manager who
 * shows up once a week on Tuesday is never logged out.
 *
 * The cookie carries a random token; this table stores only its SHA-256. A
 * leaked database backup therefore cannot be replayed as a login — the same
 * reason PINs are hashed. `token_hash` is unique so a lookup is one indexed
 * probe rather than a scan.
 *
 * Timestamps here are business dates, not audit metadata: expiry drives
 * whether someone is logged in, and the season replay and time machine
 * (`09 §7`) have to be able to move them. So they come from `lib/clock.ts` and
 * carry no database default.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    userId: uuid('user_id')
      .notNull()
      // Sessions are disposable; the person is not. Cascade is safe here only
      // because a user is never deleted — they are retired.
      .references(() => users.id, { onDelete: 'cascade' }),

    /** SHA-256 of the cookie token. The token itself is never stored. */
    tokenHash: text('token_hash').notNull().unique(),

    /**
     * Coarse, self-reported device description for the profile's device list
     * (`16 §11`). Derived from the User-Agent and deliberately vague —
     * "iPhone · Safari" is enough to recognise your own phone, and storing the
     * raw header would be tracking data this product has no use for.
     */
    deviceLabel: text('device_label').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: sessionRevokeReason('revoked_reason'),
  },
  (table) => [index('sessions_user_idx').on(table.userId)],
);

/** What happened on one login attempt. */
export const authAttemptOutcome = pgEnum('auth_attempt_outcome', [
  'SUCCEEDED',
  'BAD_PIN',
  /** Refused before the PIN was even checked. */
  'LOCKED_OUT',
  /** No such manager, or a manager who has not claimed yet. */
  'UNKNOWN_MANAGER',
]);

/**
 * Every login attempt, successful or not.
 *
 * `16 §11` requires 5 attempts per 15 minutes per account *and* per IP, with
 * exponential lockout, tracked in Postgres. This table is the whole mechanism:
 * the lockout is computed from recent rows rather than stored, so there is no
 * lock state to get stuck, no unlock job to write, and no way for a lockout to
 * outlive the failures that caused it.
 *
 * `ip_hash` is a keyed hash, never the address. Rate limiting needs to know
 * that two attempts came from the same place, not where that place is.
 *
 * `user_id` is nullable: an attempt against a name that does not exist is
 * exactly the enumeration attempt worth recording.
 */
export const authAttempts = pgTable(
  'auth_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),

    ipHash: text('ip_hash').notNull(),

    outcome: authAttemptOutcome('outcome').notNull(),

    /** From the injected clock — lockout windows are business logic. */
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('auth_attempts_user_idx').on(table.userId, table.occurredAt),
    index('auth_attempts_ip_idx').on(table.ipHash, table.occurredAt),
  ],
);

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

/**
 * What a content entry is.
 *
 * `16 §5.3` collapses eight tables — lore entries, dialogue lines, character
 * knowledge, NPCs, two NPC appearance tables, and shop dressings — into this
 * one discriminator. There is exactly one eligibility engine and one usage
 * log. Do not add a parallel dialogue or NPC system.
 */
export const contentKind = pgEnum('content_kind', [
  'tony_line',
  'manager_line',
  'npc_event',
  'lore_ref',
  'shop_dressing',
]);

/** Tony's three sprites (`17 §3`). Named on the entry, so the art matches the mood. */
export const tonyExpression = pgEnum('tony_expression', ['neutral', 'pleased', 'unimpressed']);

/**
 * Restricted content is surface-gated (`16 §10`).
 *
 * Never in the Slice's generated prose, never on a shareable URL, never in an
 * auth or error flow, never in an LLM prompt. Nothing seeded in V1 is
 * restricted; the column exists so the gate is enforceable by the selector
 * from the first line rather than retrofitted around content already live.
 */
export const contentSensitivity = pgEnum('content_sensitivity', ['ordinary', 'restricted']);

export const contentEntries = pgTable(
  'content_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * Stable authoring key, e.g. `A1`.
     *
     * The seed upserts on this, so re-seeding an edited line updates it in
     * place and keeps its usage history rather than orphaning it.
     */
    key: text('key').notNull().unique(),

    kind: contentKind('kind').notNull(),

    /** Where the line may appear, e.g. `parlor_greeting`. */
    surface: text('surface').notNull(),

    /** Every tag must be held by the viewer. Empty means always eligible. */
    requiredTags: text('required_tags').array().notNull().default([]),
    /** Any tag held by the viewer disqualifies the line. */
    excludedTags: text('excluded_tags').array().notNull().default([]),

    /** `{name}`, `{days}`. An unresolvable variable skips the line (`05 §2.3`). */
    templateText: text('template_text').notNull(),

    expression: tonyExpression('expression'),

    /** Relative likelihood, applied only after eligibility (`05 §4.2`). */
    weight: integer('weight').notNull().default(100),

    /** Days before the same viewer may see this exact line again. */
    cooldownDays: integer('cooldown_days').notNull().default(0),

    /** Null means uncapped. */
    maxUsesPerSeason: integer('max_uses_per_season'),

    sensitivity: contentSensitivity('sensitivity').notNull().default('ordinary'),

    /**
     * Which approval group the line came from.
     *
     * `A` is verified against imported data and approved by construction. `B`
     * draws on character canon and needs commissioner sign-off. Recording it
     * means "seed Group A only" is enforceable by a query rather than by
     * remembering.
     */
    approvalGroup: text('approval_group').notNull(),

    active: boolean('active').notNull().default(true),

    /** Where the line is authored, e.g. `content/counter-greetings.md#A1`. */
    sourceRef: text('source_ref'),

    ...timestamps,
  },
  (table) => [index('content_entries_surface_idx').on(table.surface, table.active)],
);

/**
 * Every line ever shown, to whom, on which surface.
 *
 * This is what makes cooldowns, seasonal caps, and "don't show the same
 * distinctive line twice in a week" possible (`05 §4.3`). It is append-only —
 * a deleted usage row would silently reset a cooldown.
 */
export const contentUsageLog = pgTable(
  'content_usage_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    entryId: uuid('entry_id')
      .notNull()
      .references(() => contentEntries.id, { onDelete: 'restrict' }),

    /** Null for a line shown to nobody in particular — a shop dressing, say. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),

    surface: text('surface').notNull(),

    /** From the injected clock — cooldowns are business logic. */
    usedAt: timestamp('used_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('content_usage_user_entry_idx').on(table.userId, table.entryId, table.usedAt),
  ],
);

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

/**
 * Admin actions that affect somebody else's account.
 *
 * `09 §8.3` requires a PIN reset to record the admin's identity and the
 * timestamp; `09 §18` wants the audit trail generally. Append-only, and
 * written in the same transaction as the action it describes, so an action
 * cannot happen without its record.
 */
export const adminAuditLogs = pgTable(
  'admin_audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    /** e.g. `pin_reset`. */
    action: text('action').notNull(),

    /** The person acted upon, where there is one. */
    subjectUserId: uuid('subject_user_id').references(() => users.id, { onDelete: 'restrict' }),

    details: jsonb('details').$type<Record<string, unknown>>(),

    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('admin_audit_actor_idx').on(table.actorUserId, table.occurredAt)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Season = typeof seasons.$inferSelect;
export type NewSeason = typeof seasons.$inferInsert;
export type SeasonMembership = typeof seasonMemberships.$inferSelect;
export type NewSeasonMembership = typeof seasonMemberships.$inferInsert;
export type SyncRun = typeof syncRuns.$inferSelect;
export type NewSyncRun = typeof syncRuns.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type AuthAttempt = typeof authAttempts.$inferSelect;
export type NewAuthAttempt = typeof authAttempts.$inferInsert;
export type ContentEntry = typeof contentEntries.$inferSelect;
export type NewContentEntry = typeof contentEntries.$inferInsert;
export type ContentUsage = typeof contentUsageLog.$inferSelect;
export type NewContentUsage = typeof contentUsageLog.$inferInsert;
export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;
export type NewAdminAuditLog = typeof adminAuditLogs.$inferInsert;
