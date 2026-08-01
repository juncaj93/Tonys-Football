import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
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

  /**
   * The canonical league name — what Tony calls this person.
   *
   * A league decision, not a Sleeper fact. It comes from
   * `content/manager-mappings.json`, so a rename is a reviewable file edit
   * rather than a hand-run UPDATE nobody can account for later. An account
   * with no mapping keeps its Sleeper display name and is reported at import.
   */
  displayName: text('display_name').notNull(),

  /**
   * Sleeper account, mapped when the manager claims their profile.
   * Nullable: historical managers imported from 2024/2025 may never claim,
   * and a person exists here before they authenticate.
   */
  sleeperUserId: text('sleeper_user_id').unique(),

  /**
   * The handle Sleeper shows for this account.
   *
   * Provenance, kept separate from the canonical name so "who is this on
   * Sleeper" and "what do we call them" never have to be the same string.
   * Re-seeded from Sleeper on every import — unlike `display_name`, this one
   * genuinely is Sleeper's to own.
   */
  sleeperUsername: text('sleeper_username'),

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

  /**
   * The one collectible this manager shows the league.
   *
   * `16 §5.3` is explicit that the Showcase is **a column, not a feature** — one
   * item, surfaced where the league can see it, with no levels, prestige or clout
   * attached (`18 §4`). Keeping it a column is what stops it growing a table and
   * then a ranking.
   *
   * It hangs off `users` rather than off a membership because a Showcase is part
   * of who somebody is, not of a season they played — the same reason the
   * collectible it points at is permanent while the tokens that bought it reset.
   *
   * **A manager may only show what they own**, and that is enforced by a trigger
   * rather than by the service that sets it: an FK can say "this is a
   * collectible" but not "this is *your* collectible".
   *
   * Nullable, and null is an ordinary state — a manager who has not chosen yet,
   * or who has taken their item back off the shelf.
   *
   * **The foreign key is declared in SQL, not here**, and deliberately so:
   * `collectibles.user_id` references `users`, so declaring the reverse in the
   * schema makes the two table types mutually recursive and TypeScript gives up on
   * inferring either (`TS7022`). Postgres has no such trouble with a cycle. The
   * constraint lives in `drizzle/0006_showcase.sql` alongside the ownership trigger
   * it belongs with, and drizzle leaves undeclared constraints alone rather than
   * dropping them.
   */
  showcaseCollectibleId: uuid('showcase_collectible_id'),

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

  /**
   * When this season's official record was frozen.
   *
   * **Explicit, never inferred from Sleeper's `complete` status.** Sleeper
   * marks a season complete the moment the final game ends, but NFL stat
   * corrections keep landing for weeks afterwards — 2024's standings and its
   * weekly points still disagree because of exactly that. Finalizing on
   * Sleeper's word would freeze a record that was still moving.
   *
   * Once set, the official historical fields on this season's memberships
   * become immutable, enforced by a database trigger rather than by
   * application discipline. A re-sync that disagrees with a finalized season
   * raises an auditable conflict and writes nothing.
   */
  finalizedAt: timestamp('finalized_at', { withTimezone: true }),

  /**
   * When the weekly scoring snapshot behind this season was captured.
   *
   * The weekly payloads are mutable upstream — stat corrections keep landing
   * on old weeks — so "what the players scored" is only meaningful alongside
   * when we looked. Season-level because Phase A does not persist weekly rows;
   * `ImportedWeek.capturedAt` already carries the per-week value in memory,
   * and Phase B's `fantasy_matchups` is where it lands per week.
   */
  snapshotCapturedAt: timestamp('snapshot_captured_at', { withTimezone: true }),

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

    /**
     * The team name this manager ran under in this season.
     *
     * From `users[].metadata.team_name` — Sleeper keeps it on the user, not
     * the roster. It is overwritten upstream the moment a manager renames, so
     * a season's name is only recoverable if it was captured at import.
     * Nullable: a manager who never set one has none, and inventing one would
     * be fabrication.
     */
    teamName: text('team_name'),

    /**
     * The official finalized season record.
     *
     * This is roster-level state for one season, so it belongs on the row that
     * already represents "this person, in this season, in this slot". It is
     * deliberately NOT week-level data — `fantasy_matchups` and friends
     * (`16 §5.2`) own that when the sync slice lands, and this stays the
     * season total either way.
     *
     * These come from `rosters[].settings`, which is the league's authoritative
     * standing — the playoff field and its seeding follow from it. They are
     * deliberately NOT recomputed from weekly matchup points: those are a
     * separate, upstream-mutable scoring snapshot that in 2024 disagrees with
     * this record for four rosters. Reconciliation reports the disagreement and
     * never resolves it (`lib/sleeper/reconcile.ts`).
     *
     * Sleeper owns fantasy results, so a re-sync updates these — **until the
     * season is finalized.** From then on `seasons.finalized_at` makes them
     * immutable and a disagreeing re-sync raises a conflict instead of writing.
     * For the two completed seasons the values never move, which is why
     * re-importing history is still a no-op.
     *
     * Stored as `numeric`, not floating point. Points decide who holds
     * `most_points_2025`, and a manager should never lose a Counter Greeting
     * to a rounding artifact. Comparisons are additionally done in integer
     * cents, so neither the storage nor the arithmetic can invent a conflict.
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
     *
     * Only true once the bracket has decided something: Sleeper publishes a
     * drawn bracket during the preseason with slots already filled.
     */
    madePlayoffs: boolean('made_playoffs').notNull().default(false),

    /** False when a manager left mid-season and was replaced. */
    isActive: boolean('is_active').notNull().default(true),

    /**
     * Tony Tokens held this season.
     *
     * ## Read this column; never write it
     *
     * `16 §5.4`: the balance is written **only** by an AFTER-INSERT trigger on
     * `token_transactions`, with `CHECK (balance >= 0)`, so an overdraft fails at
     * the database and the balance physically cannot drift from the ledger. **No
     * feature gets its own balance-writing path** — and that is not left to
     * discipline: a second trigger rejects any UPDATE that changes this column
     * unless the ledger trigger is the one making it.
     *
     * So the only way to move tokens is `apply_token_delta()`. An `UPDATE
     * season_memberships SET token_balance = …` raises, whoever issues it.
     *
     * It lives on the membership rather than on `users` because **tokens are
     * seasonal and do not carry over** (`03 §6`) — a season's wallet belongs to a
     * season's seat. Collectibles are the opposite and hang off `users.id`.
     * `16 §5.3` collapses the `season_wallets` table into exactly this column.
     */
    tokenBalance: integer('token_balance').notNull().default(0),

    /**
     * Final league placement, 1..N.
     *
     * Covers the whole league, not just the playoff field: the winners bracket
     * settles 1–6 and the consolation bracket settles 7–10. Null only where a
     * season genuinely has not produced a finish.
     */
    finalRank: integer('final_rank'),

    ...timestamps,
  },
  (table) => [
    unique('season_memberships_season_roster_unique').on(table.seasonId, table.rosterId),
    unique('season_memberships_season_user_unique').on(table.seasonId, table.userId),
    /*
     * Overdraft is impossible, and it is impossible *here* rather than in a
     * service that remembers to check.
     *
     * `16 §5.4` and the P3 release gate both state it as a property of the
     * database. A balance check in application code is a race: two purchases
     * arriving together both read 100, both decide 100 >= 100, and both spend.
     * This constraint is evaluated inside the same statement that changes the
     * balance, so the second one fails.
     */
    check('season_memberships_token_balance_non_negative', sql`${table.tokenBalance} >= 0`),
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

// ---------------------------------------------------------------------------
// Tony Tokens
// ---------------------------------------------------------------------------

/**
 * Why a balance moved.
 *
 * `03 §5` requires every balance change to record a reason code, and the point
 * of an enum rather than free text is that "how did this manager get 400 tokens"
 * has a finite, auditable set of answers. Adding a value is a one-line
 * migration.
 *
 * Only the two that can actually happen today are used by application code:
 *
 *   - `SEASON_START` — the opening balance. `03 §4` names 250 as a baseline; the
 *     value lives in `economy_configs` and is provisional until P3.
 *   - `BOX_PURCHASE` — spending at the counter.
 *
 * The rest are declared because they are named in `03 §4` and the ledger should
 * not need a migration the first Tuesday of the season. They are deliberately
 * **not** wired to anything: there is no cron yet (`16 §4.3` allows exactly two
 * jobs and neither is built), and inventing a weekly reward that fires on
 * nothing would be fabricated data.
 */
export const tokenReason = pgEnum('token_reason', [
  'SEASON_START',
  'BOX_PURCHASE',
  'MATCHUP_WIN',
  'WEEKLY_HIGH_SCORE',
  'SEASON_AWARD',
  'COMMISSIONER_ADJUSTMENT',
  /*
   * The two ways a weekly stake moves money (`0010`).
   *
   * Their own reasons rather than a reused `COMMISSIONER_ADJUSTMENT`, because a
   * manager's statement is a thing they read: a stake payout that said
   * "adjustment" would be indistinguishable from the commissioner correcting
   * something by hand, which is the one line on a statement that ought to be
   * rare and conspicuous.
   *
   * Adding the values is the whole change. `apply_token_delta`, the balance
   * trigger and the overdraft CHECK are untouched, and settlement gets no write
   * path of its own.
   */
  'STAKE_PLACED',
  'STAKE_PAYOUT',
]);

/**
 * The token ledger. Append-only, and the only way a balance moves.
 *
 * `16 §5.4` is the whole contract:
 *
 * ```
 * apply_token_delta(user_id, season_id, amount, reason_code,
 *                   idempotency_key, source_ref, actor_id)
 * ```
 *
 * ## Why the idempotency key is genuinely needed here
 *
 * Slice 1 argued *against* a client-supplied key for opening a box, because a
 * box opens once and the operation therefore has a natural key. A token delta is
 * the opposite: it is an **event**, not a thing. "Add 150 tokens" has no natural
 * key — the same delta may legitimately happen twice, so nothing about the row
 * itself can tell a retry from a second genuine award. The caller has to name the
 * occasion, and `UNIQUE(idempotency_key)` makes a replay a no-op.
 *
 * That is why the two slices differ, and the difference is the point rather than
 * an inconsistency.
 *
 * ## Seasonal, so it hangs off the membership
 *
 * `16 §5.1`: permanent things FK to `users.id`, seasonal things to
 * `season_memberships.id`. Tokens do not carry over (`03 §6`), so the ledger is
 * seasonal — while collectibles bought with them are permanent. A manager keeps
 * what they pulled and loses what they did not spend.
 */
export const tokenTransactions = pgTable(
  'token_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    seasonMembershipId: uuid('season_membership_id')
      .notNull()
      // Never delete a seat out from under its own financial history.
      .references(() => seasonMemberships.id, { onDelete: 'restrict' }),

    /** Signed. Negative is a spend. Never zero — a no-op is not a transaction. */
    amount: integer('amount').notNull(),

    reasonCode: tokenReason('reason_code').notNull(),

    /**
     * Human-readable, required by `03 §5`.
     *
     * Curated or templated, never generated — `16 §10` limits generative text to
     * the Slice. This is what a manager reads on their own statement, so it says
     * what happened in the shop's voice rather than naming an enum value.
     */
    description: text('description').notNull(),

    /**
     * The caller's name for this occasion. A replay is a no-op.
     *
     * Not nullable and not defaulted: a caller that cannot name the occasion has
     * not thought about what happens when its request is retried.
     */
    idempotencyKey: text('idempotency_key').notNull().unique(),

    /** The thing this was about — a box id, a matchup, an auction lot. */
    sourceRef: text('source_ref'),

    /** The commissioner, on a manual adjustment. Null means the system did it. */
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'restrict' }),

    /** From the injected clock — a statement's dates are business dates. */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('token_transactions_membership_idx').on(table.seasonMembershipId, table.createdAt),
    /*
     * A zero-amount row would pass every other check and mean nothing, while
     * still consuming an idempotency key — so a genuine later delta under the
     * same key would be silently swallowed.
     */
    check('token_transactions_amount_non_zero', sql`${table.amount} <> 0`),
  ],
);

/**
 * Versioned economy configuration, per season.
 *
 * `03 §11`: *"Exact costs and probabilities belong in database configuration, not
 * hardcoded frontend logic."* And `16 §8` gates every value on the P3
 * multi-season simulation. Both are satisfied the same way the reward table is:
 * the row is **immutable and versioned**, so a rebalance writes a new version and
 * every historical transaction stays interpretable against the numbers that were
 * live when it happened.
 *
 * `provisional` records whether the simulation has signed the values off, so
 * "has this been simulated" is a query rather than a memory. Clearing it is the
 * one legitimate update to an existing row.
 */
export const economyConfigs = pgTable(
  'economy_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    seasonId: uuid('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'restrict' }),

    /** Content hash of `values`. Two environments seeding the same numbers agree. */
    version: text('version').notNull(),

    /** `{ seasonStartTokens, standardBoxPriceTokens }`, and more as systems land. */
    values: jsonb('values').$type<Record<string, number>>().notNull(),

    /** True until the P3 simulation signs these numbers off. */
    provisional: boolean('provisional').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One row per (season, version): a season may carry several versions over
    // time, and the same numbers must not be stored twice for one season.
    unique('economy_configs_season_version_unique').on(table.seasonId, table.version),
  ],
);

// ---------------------------------------------------------------------------
// The collectible economy
// ---------------------------------------------------------------------------

/**
 * Rarity.
 *
 * `03` and `16 §8`: rarity gates **how often an item appears**, never what it
 * costs or what it can do. So this is a property of the catalog entry and of
 * the historical record of a pull — it is deliberately not a price tier.
 *
 * Stored on three rows for three different reasons, and the duplication is
 * intentional:
 *
 *   - the **reward table** entry, because that is the roll's input
 *   - the **opening**, because that is what the manager was told they got
 *   - the **collectible**, because that is what they own
 *
 * If the catalog ever reclassifies an item, none of the three historical
 * records may move. A join to a live catalog would silently rewrite what
 * somebody pulled in 2026, which is exactly the class of quiet history
 * rewriting `16 §5.1` exists to prevent.
 */
export const collectibleRarity = pgEnum('collectible_rarity', [
  'common',
  'rare',
  'epic',
  'legendary',
]);

/**
 * One box in v1 (`16`, approved scope: "one loot box and a 24-item catalog").
 *
 * The enum has a single value on purpose. `object_box_rare` and
 * `object_box_legendary` exist in the asset registry as *tray dressing* for
 * rotation, which is a later slice; adding enum values for boxes that cannot be
 * acquired would be scaffolding for code that does not exist.
 */
export const lootBoxKind = pgEnum('loot_box_kind', ['standard']);

/** A box is unopened or opened. There is no third state, and no un-opening. */
export const lootBoxState = pgEnum('loot_box_state', ['UNOPENED', 'OPENED']);

/**
 * A stored, immutable, versioned reward table.
 *
 * `18 §4.3`: "The reward is resolved from a stored reward table, with the box's
 * config version recorded on the opening." Both halves of that matter, and this
 * table is the first half.
 *
 * **Append-only.** A row is never updated. When the catalog or the weights
 * change, the seed writes a *new* version and every historical opening keeps
 * pointing at the version it actually rolled against. That is what makes an
 * opening auditable a year later: the table it came from still exists, byte for
 * byte, and can be replayed.
 *
 * `version` is a content hash of the entries rather than a counter, so two
 * environments that seeded the same catalog agree on the version without
 * coordinating, and an accidental edit cannot reuse an existing version number.
 *
 * ## The weights in here are provisional, and the column comment says so
 *
 * `16 §8` gates reward pacing on the multi-season simulation in P3: **no values
 * lock before it runs.** `provisional` records that in the data rather than in a
 * comment somebody has to find, so "has this been simulated yet" is a query.
 */
export const rewardTables = pgTable('reward_tables', {
  id: uuid('id').primaryKey().defaultRandom(),

  /** Content hash of `entries`. Stable across environments. */
  version: text('version').notNull().unique(),

  kind: lootBoxKind('kind').notNull(),

  /**
   * `[{ slug, rarity, weight }]`, canonically ordered.
   *
   * One jsonb column rather than a child table because the table is a single
   * immutable unit: half a reward table is not a reward table, and a child
   * table invites a partial insert that the version hash would then be lying
   * about.
   */
  entries: jsonb('entries')
    .$type<{ slug: string; rarity: string; weight: number }[]>()
    .notNull(),

  /** True until the P3 simulation has signed off on these frequencies. */
  provisional: boolean('provisional').notNull().default(true),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A box somebody owns.
 *
 * In this slice a box arrives from the seed. Purchase with tokens is the next
 * slice and goes through `apply_token_delta`; nothing here writes a balance.
 *
 * `grant_key` is what makes granting idempotent. Without it, every deploy's
 * seed would hand out another box — and re-granting after an opening would be a
 * reroll with extra steps.
 */
export const lootBoxes = pgTable(
  'loot_boxes',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    userId: uuid('user_id')
      .notNull()
      // A person is retired, never deleted, and their boxes go with them.
      .references(() => users.id, { onDelete: 'restrict' }),

    kind: lootBoxKind('kind').notNull().default('standard'),

    state: lootBoxState('state').notNull().default('UNOPENED'),

    /** Where it came from: `seed`, and later `purchase` or `weekly_reward`. */
    source: text('source').notNull(),

    /**
     * A stable key for the act of granting, unique across the table.
     *
     * The seed derives one per manager per fixture box, so running the seed
     * twice is a no-op — including after the box has been opened, which is the
     * case that matters. Nullable because a purchased box is granted by a
     * user action that is already idempotent on its own.
     */
    grantKey: text('grant_key').unique(),

    /** From the injected clock: when this box became someone's. */
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull(),

    /** Set exactly when `state` becomes `OPENED`, and never cleared. */
    openedAt: timestamp('opened_at', { withTimezone: true }),
  },
  (table) => [
    index('loot_boxes_user_state_idx').on(table.userId, table.state),
    /*
     * State and timestamp cannot disagree.
     *
     * The pair is what every read uses — the tray asks "is a box unopened", the
     * audit asks "when was it opened" — so a row where one says opened and the
     * other says never would make the tray and the ledger tell different
     * stories. The database refuses it rather than trusting every future writer
     * to keep them in step.
     */
    check(
      'loot_boxes_opened_at_matches_state',
      sql`(${table.state} = 'OPENED') = (${table.openedAt} IS NOT NULL)`,
    ),
  ],
);

/**
 * The append-only record of one box being opened.
 *
 * ## `box_id` is UNIQUE, and that single constraint is the idempotency mechanism
 *
 * `18 §4.3` requires that "duplicate requests and refresh rerolls are
 * rejected". The obvious implementation is a client-supplied idempotency key,
 * and it is the wrong one here: the operation already has a natural key. **A
 * box opens once, ever.** So a unique constraint on `box_id` makes a second
 * opening physically impossible, whatever asks for it — a double tap, a
 * refresh mid-reveal, two serverless instances racing, or a hand-run INSERT.
 *
 * A separate idempotency key would add a column that a client controls, and
 * would still need this constraint underneath to be worth anything. (The
 * idempotency-key invariant in `16 §5.4` is about `apply_token_delta`, where
 * the operation genuinely has no natural key — a delta is not a thing, it is an
 * event. That is a different problem and it is out of this slice's scope.)
 *
 * The service takes `FOR UPDATE` on the box first, so the common concurrent
 * case *waits* and then reads back the existing opening rather than erroring.
 * The constraint is the backstop, not the happy path.
 */
export const boxOpenings = pgTable(
  'box_openings',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** One opening per box, forever. See the note above. */
    boxId: uuid('box_id')
      .notNull()
      .unique()
      .references(() => lootBoxes.id, { onDelete: 'restrict' }),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    /** The registry slug of what came out. Not an FK: the catalog is the registry. */
    collectibleSlug: text('collectible_slug').notNull(),

    /** What the manager was told they got. Frozen, see `collectibleRarity`. */
    rarity: collectibleRarity('rarity').notNull(),

    /**
     * The reward table this roll was resolved against — `18 §4.3`'s "config
     * version recorded on the opening". RESTRICT, so a version that any opening
     * references can never be deleted out from under its own audit trail.
     */
    rewardTableVersion: text('reward_table_version')
      .notNull()
      .references(() => rewardTables.version, { onDelete: 'restrict' }),

    /**
     * The roll, in the same units the resolver used: an integer in
     * `[0, totalWeight)`.
     *
     * Recorded so an opening is genuinely *auditable* rather than merely
     * logged. With the table version and this number, the outcome is a pure
     * function anybody can recompute — which is the only way to answer "was
     * that legendary real" without being asked to take the server's word.
     */
    roll: integer('roll').notNull(),

    openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('box_openings_user_idx').on(table.userId, table.openedAt)],
);

/**
 * A collectible somebody owns, permanently.
 *
 * `16 §5.1`: collectibles hang off `users.id`, never off a season membership.
 * Roster 4 in 2025 is not roster 4 in 2026, and a replacement manager must not
 * inherit the previous occupant's shelf.
 *
 * Duplicates are allowed — no unique on `(user_id, slug)`. Pulling the same
 * parmesan shaker twice is an ordinary outcome of a weighted table, and the
 * Collection counts copies. Forbidding it would silently turn every duplicate
 * roll into a reroll, which is a reward-pacing change made by accident in a
 * constraint.
 */
export const collectibles = pgTable(
  'collectibles',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    /** The registry slug. Art is swapped by registry row, never by data edit. */
    slug: text('slug').notNull(),

    rarity: collectibleRarity('rarity').notNull(),

    acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull(),

    /**
     * The opening that produced it.
     *
     * UNIQUE, so one opening can never mint two collectibles — the other half
     * of exactly-once, and the half a retry of the *second* insert would break
     * if only the opening were guarded. Nullable because later sources (weekly
     * rewards, rings) are not box openings.
     */
    sourceOpeningId: uuid('source_opening_id')
      .unique()
      .references(() => boxOpenings.id, { onDelete: 'restrict' }),
  },
  (table) => [index('collectibles_user_idx').on(table.userId, table.acquiredAt)],
);

// ---------------------------------------------------------------------------
// Weekly results, and the policy that decides what they mean
// ---------------------------------------------------------------------------

/**
 * One game, as the weekly scoring snapshot recorded it.
 *
 * `16 §5.2` names this table; `PRODUCT_DELIVERY_MANDATE.md §10` says why it has
 * to exist before any narrative copy. Every publishable claim about a game is
 * derived from a row here, so a claim stays recomputable from a stored record
 * rather than from a query somebody ran once.
 *
 * **Points are cents.** A margin of 50.51 has to be exactly 50.51 forever, and
 * `154.42 - 103.91` in IEEE 754 is `50.510000000000005`. `reconcile.ts` already
 * works in cents and exports `toCents`/`fromCents`.
 *
 * **Only paired rows.** An unpaired roster has points and no game — normal once
 * the playoffs start, and true of all ten rosters in week 18 — and a table of
 * games is the wrong place to record a non-game.
 */
export const fantasyMatchups = pgTable(
  'fantasy_matchups',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    seasonId: uuid('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'restrict' }),

    week: integer('week').notNull(),

    /**
     * `regular` · `playoff` · `consolation` · `unscored`.
     *
     * From the league's own `playoff_week_start` and `last_scored_leg`, never a
     * hardcoded week number — `lib/sleeper/weeks.ts` documents why week 18 is
     * `unscored` despite having points in every row.
     */
    weekType: text('week_type').notNull(),

    /** Stable within a week, and what makes a re-import idempotent. */
    sleeperMatchupId: integer('sleeper_matchup_id').notNull(),

    rosterAId: integer('roster_a_id').notNull(),
    rosterBId: integer('roster_b_id').notNull(),

    pointsACents: integer('points_a_cents').notNull(),
    pointsBCents: integer('points_b_cents').notNull(),

    /** Null on a tie. A tie is a result, not a missing value. */
    winnerRosterId: integer('winner_roster_id'),

    marginCents: integer('margin_cents').notNull(),

    /** When the weekly payload was fetched. Weekly scoring is mutable upstream. */
    capturedAt: timestamp('captured_at', { withTimezone: true }),

    /**
     * This game sits inside a finalized-versus-snapshot disagreement.
     *
     * `16 §12`: 2024's standings and its weekly points disagree for four
     * rosters. `reconcile.ts` reports it and never resolves it. Marked at import
     * so a fact derived months later suppresses rather than publishing a winner
     * the official record contradicts.
     */
    disputed: boolean('disputed').notNull().default(false),

    ...timestamps,
  },
  (table) => [
    unique('fantasy_matchups_season_week_matchup_unique').on(
      table.seasonId,
      table.week,
      table.sleeperMatchupId,
    ),
    index('fantasy_matchups_season_week_idx').on(table.seasonId, table.week),
    // The margin is stored for querying; this makes it unable to disagree with
    // the points it came from.
    check(
      'fantasy_matchups_margin_matches_points',
      sql`${table.marginCents} = abs(${table.pointsACents} - ${table.pointsBCents})`,
    ),
    check(
      'fantasy_matchups_distinct_rosters',
      sql`${table.rosterAId} <> ${table.rosterBId}`,
    ),
    check(
      'fantasy_matchups_winner_played',
      sql`${table.winnerRosterId} is null
        or ${table.winnerRosterId} = ${table.rosterAId}
        or ${table.winnerRosterId} = ${table.rosterBId}`,
    ),
  ],
);

/**
 * The thresholds that decide what a margin *means*.
 *
 * Exactly the shape `reward_tables` uses, for exactly the same reason
 * (`16 §8`): these numbers are **simulation-gated** and provisional until the P3
 * calibration. A recalibration writes a new version; a fact records the version
 * it was classified under, so an old fact stays interpretable against the policy
 * that was live when it was derived rather than silently re-meaning itself.
 *
 * Append-only, enforced by a trigger.
 */
export const significancePolicies = pgTable('significance_policies', {
  /** Content hash of `tiers`. Two environments seeding the same numbers agree. */
  version: text('version').primaryKey(),
  tiers: jsonb('tiers').notNull(),
  /** True until the P3 calibration signs these numbers off. */
  provisional: boolean('provisional').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

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
export type TokenTransaction = typeof tokenTransactions.$inferSelect;
export type NewTokenTransaction = typeof tokenTransactions.$inferInsert;
export type EconomyConfig = typeof economyConfigs.$inferSelect;
export type NewEconomyConfig = typeof economyConfigs.$inferInsert;
export type RewardTable = typeof rewardTables.$inferSelect;
export type NewRewardTable = typeof rewardTables.$inferInsert;
export type LootBox = typeof lootBoxes.$inferSelect;
export type NewLootBox = typeof lootBoxes.$inferInsert;
export type BoxOpening = typeof boxOpenings.$inferSelect;
export type NewBoxOpening = typeof boxOpenings.$inferInsert;
export type Collectible = typeof collectibles.$inferSelect;
export type NewCollectible = typeof collectibles.$inferInsert;
export type FantasyMatchup = typeof fantasyMatchups.$inferSelect;
export type NewFantasyMatchup = typeof fantasyMatchups.$inferInsert;
export type SignificancePolicy = typeof significancePolicies.$inferSelect;
export type NewSignificancePolicy = typeof significancePolicies.$inferInsert;

// ---------------------------------------------------------------------------
// M3 — modular character identity
// ---------------------------------------------------------------------------

/**
 * A manager's base appearance.
 *
 * Four small integers, indices into `lib/character/catalog.ts`. `04 §10` permits
 * a validated JSON configuration and this is columns instead, for one reason
 * that matters: a column can carry a CHECK, and a legal-combination rule living
 * only in application code holds until somebody writes a second caller.
 *
 * **Order in that catalog is the meaning of the stored number.** Never reorder
 * it; only append. A stored value pointing at a moved row is unrecoverable and
 * nobody notices for a week.
 */
export const characterConfigurations = pgTable('character_configurations', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),

  body: integer('body').notNull(),
  face: integer('face').notNull(),
  hair: integer('hair').notNull(),
  /** Recolours the base layers only. A wearable keeps its authored colours. */
  palette: integer('palette').notNull(),

  ...timestamps,
});

/**
 * What a manager is wearing.
 *
 * A row per equipped item; unequipping deletes it. *"Not wearing a hat"* is the
 * absence of a hat, and a soft-deleted equip would need every reader to remember
 * the filter.
 *
 * Three guarantees are in the database rather than in a service, and each one
 * fails a race the service could not see:
 *
 * - **one item per slot** — two taps arriving together both read an empty head
 *   slot and both insert; the second fails here instead of leaving somebody
 *   wearing two hats with no way to remove either
 * - **one place for each item** — the same collectible cannot occupy two slots
 * - **only what you own** — a trigger, because a foreign key can say *"this is a
 *   collectible"* and cannot say *"this is **your** collectible"*. The Showcase
 *   needed exactly this and for exactly this reason.
 */
export const wearableEquips = pgTable(
  'wearable_equips',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** RESTRICT, like every reference to a collectible. They are never deleted. */
    collectibleId: uuid('collectible_id')
      .notNull()
      .references(() => collectibles.id, { onDelete: 'restrict' }),

    /** `back` · `bottoms` · `top` · `hand` · `head` (`lib/character/layers.ts`). */
    slot: text('slot').notNull(),

    equippedAt: timestamp('equipped_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('wearable_equips_one_per_slot').on(table.userId, table.slot),
    unique('wearable_equips_one_place_each').on(table.collectibleId),
  ],
);

// ---------------------------------------------------------------------------
// Weekly stakes
// ---------------------------------------------------------------------------

/**
 * Week-level finality — what the Tuesday job (`16 §4.3`) writes.
 *
 * ## Why it has to exist for stakes to work at all
 *
 * Two rules were both in force and contradicted each other the moment a stake
 * tried to pay anybody: **a stake settles only from finalized results**, and
 * **`apply_token_delta` refuses a finalized season** (`03 §6` closes the books).
 * With season-level finality as the only kind, a stake was settleable exactly
 * when it was unpayable.
 *
 * A database test found it — every payout raised — and neither rule is relaxed.
 * They are about different things: a *week* is final on Tuesday, a *season*
 * closes in January.
 *
 * Written once per week, never rewritten. A settlement resting on a finality
 * that could be withdrawn would be resting on nothing.
 */
export const weekFinalizations = pgTable(
  'week_finalizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    seasonId: uuid('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'restrict' }),

    week: integer('week').notNull(),

    /** How many publishable games the week held when it was closed. */
    games: integer('games').notNull(),

    /** From the injected clock — a business date, not the database's. */
    finalizedAt: timestamp('finalized_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    unique('week_finalizations_one_per_week').on(table.seasonId, table.week),
    check('week_finalizations_week_positive', sql`${table.week} > 0`),
    check('week_finalizations_games_positive', sql`${table.games} > 0`),
  ],
);

/**
 * The three approved families, and the discriminator that keeps them one system.
 *
 * `16 §9`, verbatim: *"Weekly stakes (one table, type discriminator)"*. Three
 * tables would give three settlement paths, three idempotency stories, and three
 * places for a duplicate payout to hide — which is the whole reason the plan says
 * one.
 *
 * They really are the same object: **a claim made in advance from verified facts,
 * checked later against finalized ones.** What differs is who makes the claim
 * (Tony, or a manager), and what is riding on it.
 */
export const stakeKind = pgEnum('stake_kind', ['TONYS_LINE', 'BOUNTY', 'CHALKBOARD']);

/**
 * `open` is the only state a stake is authored into; the rest are terminal.
 *
 * `void` keeps the row rather than deleting it, because a stake that was shown to
 * the league and then withdrawn is history. `weekly_stakes_void_has_reason`
 * makes the reason mandatory in exactly that state and forbidden everywhere else.
 */
export const stakeStatus = pgEnum('stake_status', ['open', 'resolved', 'expired', 'void']);

/**
 * What a resolution decided, per kind — enforced by trigger, not by convention.
 *
 * `settled` exists because a market's stake-level outcome is not a verdict. The
 * field splits and the verdict is per entry, so calling it `hit` would be a lie
 * told by an enum.
 */
export const stakeOutcome = pgEnum('stake_outcome', [
  'hit',
  'missed',
  'push',
  'unclaimed',
  'settled',
]);

/** Deterministic authoring, or the commissioner. Provenance is permanent. */
export const stakeSource = pgEnum('stake_source', ['system_author', 'commissioner']);

/**
 * What a resolution read.
 *
 * One value today, meaning what `lib/stats/finality.ts` says it means: a week
 * inside a season whose books are closed. The Tuesday job (`16 §4.3`) will
 * finalize weeks individually and this enum already has room for that source — a
 * stored resolution keeps saying which one it used.
 */
export const stakeResolutionSource = pgEnum('stake_resolution_source', [
  'finalized_week',
  'season_closed',
]);

export const stakeEntryOutcome = pgEnum('stake_entry_outcome', ['won', 'lost', 'push']);

/**
 * One stake. The offer, its terms, and the verified facts behind it.
 *
 * Immutable once published (`weekly_stakes_terms_immutable`) and never deleted
 * (`weekly_stakes_undeletable`). *"Do not allow later Sleeper mutations to
 * rewrite finalized outcomes"* is only true if the terms cannot move either — a
 * line quietly re-derived after a stat correction would settle a different bet
 * from the one managers took.
 */
export const weeklyStakes = pgTable(
  'weekly_stakes',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    seasonId: uuid('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'restrict' }),

    /** Settles against this week; for a bounty, opened in it. */
    week: integer('week').notNull(),

    kind: stakeKind('kind').notNull(),

    /**
     * `2025-w07-tonys-line`. Stable, derivable, and the reason re-authoring is a
     * no-op rather than a second stake.
     */
    stakeKey: text('stake_key').notNull().unique(),

    status: stakeStatus('status').notNull().default('open'),

    /**
     * The variant within the kind — `season-median`, `week-score`,
     * `nobody-clears-record`.
     *
     * Stored rather than derived, because the authoring rules will change and a
     * historical stake has to keep meaning what it meant.
     */
    variant: text('variant').notNull(),

    /**
     * Who was eligible, snapshotted at authoring.
     *
     * Eligibility is a fact about the moment the offer was made. Recomputing it
     * later would quietly rewrite who was invited — and retired managers are
     * excluded *here*, once, through the same boundary every other surface uses.
     */
    eligibleUserIds: uuid('eligible_user_ids').array().notNull(),

    /** `{ basisWeeks, gameKeys, values }` — what it was built from. */
    factRefs: jsonb('fact_refs').$type<Record<string, unknown>>().notNull(),

    /** Exactly `FactPacket.allowedNumbers` / `allowedNames`, so one validator serves both. */
    allowedNumbers: text('allowed_numbers').array().notNull(),
    allowedNames: text('allowed_names').array().notNull(),

    createdBy: stakeSource('created_by').notNull().default('system_author'),

    /** Content hash of the authoring rules. A re-authoring under new rules is a new stake. */
    authorVersion: text('author_version').notNull(),

    /** Debited on a pick. Tony's Line only. */
    stakeTokens: integer('stake_tokens'),
    /** Credited to a winning pick, or to whoever claims a bounty. */
    rewardTokens: integer('reward_tokens'),

    /** The last week a bounty may still be claimed in. Null rolls to the season's end. */
    expiresAfterWeek: integer('expires_after_week'),

    /** The ledger key prefix every payout from this stake is namespaced under. */
    settlementKey: text('settlement_key').notNull().unique(),

    voidReason: text('void_reason'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),

    /** Business dates, from the injected clock — not the database's. */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('weekly_stakes_season_week_idx').on(table.seasonId, table.week),
    index('weekly_stakes_open_idx').on(table.seasonId, table.status),
    check('weekly_stakes_week_positive', sql`${table.week} > 0`),
    check(
      'weekly_stakes_expiry_after_open',
      sql`${table.expiresAfterWeek} is null or ${table.expiresAfterWeek} >= ${table.week}`,
    ),
    check(
      'weekly_stakes_only_bounties_roll',
      sql`${table.expiresAfterWeek} is null or ${table.kind} = 'BOUNTY'`,
    ),
    /*
     * `16 §9` fixes the payout at 2x. Enforcing the multiplier here means a
     * rebalance cannot change it from a service, and the two kinds with no money
     * cannot acquire any.
     */
    check(
      'weekly_stakes_line_pays_double',
      sql`(${table.kind} = 'TONYS_LINE' and ${table.stakeTokens} > 0 and ${table.rewardTokens} = ${table.stakeTokens} * 2)
        or (${table.kind} = 'BOUNTY' and ${table.stakeTokens} is null and ${table.rewardTokens} > 0)
        or (${table.kind} = 'CHALKBOARD' and ${table.stakeTokens} is null and ${table.rewardTokens} is null)`,
    ),
    check(
      'weekly_stakes_void_has_reason',
      sql`(${table.status} = 'void') = (${table.voidReason} is not null)`,
    ),
  ],
);

/**
 * A manager's pick. Tony's Line is the only kind that has them today.
 *
 * The pick is immutable — a manager who could switch sides after kickoff is not
 * making a prediction — and the three settlement columns are written exactly
 * once, from null. That is what makes a replayed settlement a no-op at the row
 * level as well as at the ledger's, which is two independent guarantees rather
 * than one restated.
 */
export const stakeEntries = pgTable(
  'stake_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    stakeId: uuid('stake_id')
      .notNull()
      .references(() => weeklyStakes.id, { onDelete: 'restrict' }),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    /** `over` or `under`, checked in the database. The vocabulary is the variant's. */
    side: text('side').notNull(),

    /**
     * What this manager actually paid, recorded on the entry rather than read
     * back off the stake. They are the same today and must not be assumed to be.
     */
    stakedTokens: integer('staked_tokens').notNull(),

    outcome: stakeEntryOutcome('outcome'),
    payoutTokens: integer('payout_tokens'),
    settledAt: timestamp('settled_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    unique('stake_entries_one_per_manager').on(table.stakeId, table.userId),
    index('stake_entries_stake_idx').on(table.stakeId),
    check('stake_entries_side_known', sql`${table.side} in ('over','under')`),
    check('stake_entries_stake_positive', sql`${table.stakedTokens} > 0`),
    /* A half-written settlement is the shape a duplicate payout hides in. */
    check(
      'stake_entries_settlement_complete',
      sql`(${table.outcome} is null and ${table.payoutTokens} is null and ${table.settledAt} is null)
        or (${table.outcome} is not null and ${table.payoutTokens} is not null and ${table.settledAt} is not null)`,
    ),
    check(
      'stake_entries_payout_non_negative',
      sql`${table.payoutTokens} is null or ${table.payoutTokens} >= 0`,
    ),
  ],
);

/**
 * The resolution. **One per stake, forever.**
 *
 * `stake_id` is UNIQUE and that single constraint is the idempotency mechanism —
 * the same argument `box_openings.box_id` makes. A stake resolves once, so the
 * operation has a natural key and needs no caller-supplied one; two concurrent
 * settlements produce one resolution and one set of payouts.
 *
 * Append-only, so a stat correction landing in March cannot change what a manager
 * was paid in October.
 */
export const stakeResolutions = pgTable(
  'stake_resolutions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    stakeId: uuid('stake_id')
      .notNull()
      .references(() => weeklyStakes.id, { onDelete: 'restrict' })
      .unique(),

    outcome: stakeOutcome('outcome').notNull(),

    resolvedFrom: stakeResolutionSource('resolved_from').notNull().default('finalized_week'),

    /** Not always the stake's own week: a bounty claimed in week nine says nine. */
    resolvedWeek: integer('resolved_week').notNull(),

    claimedByUserId: uuid('claimed_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),

    /**
     * Why it resolved the way it did, as recomputable data.
     *
     * `{ statement, gameKeys, values }` — deliberately not prose alone, because
     * prose cannot be recomputed against. This is the audit history the product
     * owes a manager who asks *"how did that settle"*.
     */
    evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull(),

    resolvedAt: timestamp('resolved_at', { withTimezone: true }).notNull(),
  },
  (table) => [check('stake_resolutions_week_positive', sql`${table.resolvedWeek} > 0`)],
);
