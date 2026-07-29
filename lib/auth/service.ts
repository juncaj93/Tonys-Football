import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';

import { now } from '@/lib/clock';
import { type Database } from '@/lib/db';
import {
  adminAuditLogs,
  authAttempts,
  seasonMemberships,
  seasons,
  sessions,
  users,
  type Session,
  type User,
} from '@/lib/db/schema';

import { hashPin, validatePin, verifyPin } from './pin';
import {
  evaluateLockout,
  lockoutMessage,
  FAILURE_LOOKBACK_MS,
  type Failure,
} from './rate-limit';
import {
  deviceLabel as labelDevice,
  mintSession,
  SESSION_TOUCH_INTERVAL_MS,
  SESSION_TTL_DAYS,
} from './session';

/**
 * The authentication service.
 *
 * Every function takes the database as a parameter rather than reaching for
 * `getDb()`, so a test can hand it a scratch database and no code path can
 * accidentally talk to production (`lib/db/index.ts`).
 *
 * `16 §4.2`: there is no database client in the browser. These run in server
 * actions and route handlers only.
 */

// ---------------------------------------------------------------------------
// The door
// ---------------------------------------------------------------------------

export interface DoorManager {
  readonly id: string;
  readonly displayName: string;
  readonly rosterId: number;
  /** Has set a PIN. Unclaimed managers are the ones the door is for. */
  readonly claimed: boolean;
}

/** The newest season on record — the one whose managers are current. */
export async function currentSeasonYear(db: Database): Promise<number | null> {
  const [row] = await db
    .select({ year: seasons.year })
    .from(seasons)
    .orderBy(desc(seasons.year))
    .limit(1);
  return row?.year ?? null;
}

/**
 * The managers on the door: everyone holding a seat this season.
 *
 * `16 §11`: "pick your name from ten, enter PIN. Two taps."
 *
 * Listing the names is a deliberate choice, not an oversight. In a private
 * ten-person league the roster is common knowledge — it is on Sleeper — so
 * hiding it would buy nothing and cost the two-tap login the plan asks for.
 * Guessing is stopped by the rate limiter, not by secrecy about who plays.
 *
 * Managers from past seasons who no longer hold a seat are not offered. They
 * keep their history and their rows; they are simply not in this year's league.
 */
export async function listDoorManagers(db: Database): Promise<readonly DoorManager[]> {
  const year = await currentSeasonYear(db);
  if (year === null) return [];

  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      rosterId: seasonMemberships.rosterId,
      pinUpdatedAt: users.pinUpdatedAt,
    })
    .from(seasonMemberships)
    .innerJoin(seasons, eq(seasonMemberships.seasonId, seasons.id))
    .innerJoin(users, eq(seasonMemberships.userId, users.id))
    .where(and(eq(seasons.year, year), eq(seasonMemberships.isActive, true)))
    .orderBy(users.displayName);

  return rows.map((row) => ({
    id: row.id,
    displayName: row.displayName,
    rosterId: row.rosterId,
    claimed: row.pinUpdatedAt !== null,
  }));
}

/** One manager from the door list, or null if they hold no seat this season. */
export async function doorManager(db: Database, userId: string): Promise<DoorManager | null> {
  const managers = await listDoorManagers(db);
  return managers.find((manager) => manager.id === userId) ?? null;
}

// ---------------------------------------------------------------------------
// Attempts and lockout
// ---------------------------------------------------------------------------

async function recentFailures(
  db: Database,
  column: 'user' | 'ip',
  value: string,
  at: Date,
): Promise<readonly Failure[]> {
  const since = new Date(at.getTime() - FAILURE_LOOKBACK_MS);

  const rows = await db
    .select({ occurredAt: authAttempts.occurredAt })
    .from(authAttempts)
    .where(
      and(
        column === 'user' ? eq(authAttempts.userId, value) : eq(authAttempts.ipHash, value),
        gt(authAttempts.occurredAt, since),
        // A success clears the slate: only failures since the last success
        // count. Without this, five typos followed by a correct PIN would still
        // lock the manager out on their next visit.
        sql`${authAttempts.outcome} <> 'SUCCEEDED'`,
        sql`${authAttempts.occurredAt} > coalesce((
          select max(a2.occurred_at) from auth_attempts a2
          where a2.outcome = 'SUCCEEDED'
            and ${column === 'user' ? sql`a2.user_id = ${value}` : sql`a2.ip_hash = ${value}`}
        ), '-infinity'::timestamptz)`,
      ),
    )
    .orderBy(desc(authAttempts.occurredAt));

  return rows;
}

async function recordAttempt(
  db: Database,
  input: {
    userId: string | null;
    ipHash: string;
    outcome: 'SUCCEEDED' | 'BAD_PIN' | 'LOCKED_OUT' | 'UNKNOWN_MANAGER';
    at: Date;
  },
): Promise<void> {
  await db.insert(authAttempts).values({
    userId: input.userId,
    ipHash: input.ipHash,
    outcome: input.outcome,
    occurredAt: input.at,
  });
}

// ---------------------------------------------------------------------------
// Signing in
// ---------------------------------------------------------------------------

export interface AuthContext {
  readonly ipHash: string;
  readonly userAgent: string | null;
}

export type AuthResult =
  | { readonly ok: true; readonly user: User; readonly cookieValue: string }
  | { readonly ok: false; readonly message: string };

async function issueSession(
  db: Database,
  userId: string,
  context: AuthContext,
  at: Date,
): Promise<string> {
  const { cookieValue, tokenHash } = mintSession();

  await db.insert(sessions).values({
    userId,
    tokenHash,
    deviceLabel: labelDevice(context.userAgent),
    createdAt: at,
    lastSeenAt: at,
    expiresAt: expiryFrom(at),
  });

  return cookieValue;
}

function expiryFrom(at: Date): Date {
  return new Date(at.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Claim a manager profile and set its first PIN.
 *
 * Only ever succeeds for a manager who holds a seat this season and has no PIN.
 * Re-claiming a claimed account is refused here rather than at the UI, because
 * "the button was hidden" is not authorization (`09 §9`).
 *
 * The optional claim code (`CLAIM_CODE`) closes the one window where the site
 * is genuinely open: before a manager claims, anyone holding the URL could
 * claim on their behalf. Unset — the default — leaves the flow exactly as
 * specified: pick your name, set a PIN.
 */
export async function claimManager(
  db: Database,
  input: { userId: string; pin: string; claimCode?: string },
  context: AuthContext,
): Promise<AuthResult> {
  const at = now();

  const expectedCode = process.env['CLAIM_CODE'] ?? '';
  if (expectedCode !== '' && (input.claimCode ?? '').trim() !== expectedCode) {
    await recordAttempt(db, { userId: input.userId, ipHash: context.ipHash, outcome: 'BAD_PIN', at });
    return { ok: false, message: "That's not the code Tony handed out." };
  }

  const gate = await checkLockout(db, input.userId, context.ipHash, at);
  if (gate !== null) return gate;

  const validation = validatePin(input.pin);
  if (!validation.ok) {
    return { ok: false, message: validation.message ?? 'That PIN will not do.' };
  }

  const manager = await doorManager(db, input.userId);
  if (manager === null) {
    await recordAttempt(db, { userId: null, ipHash: context.ipHash, outcome: 'UNKNOWN_MANAGER', at });
    return { ok: false, message: 'Tony does not have that name on the board.' };
  }
  if (manager.claimed) {
    await recordAttempt(db, {
      userId: input.userId,
      ipHash: context.ipHash,
      outcome: 'UNKNOWN_MANAGER',
      at,
    });
    return {
      ok: false,
      message: 'That name already has a PIN. Sign in instead, or ask the commissioner to reset it.',
    };
  }

  const pinHash = await hashPin(input.pin);

  // Guarded by `pin_hash is null` so two simultaneous claims cannot both win.
  const claimed = await db
    .update(users)
    .set({ pinHash, pinUpdatedAt: at, updatedAt: at })
    .where(and(eq(users.id, input.userId), isNull(users.pinHash)))
    .returning();

  const user = claimed[0];
  if (user === undefined) {
    return { ok: false, message: 'That name was claimed a moment ago. Sign in instead.' };
  }

  await recordAttempt(db, { userId: user.id, ipHash: context.ipHash, outcome: 'SUCCEEDED', at });
  const cookieValue = await issueSession(db, user.id, context, at);

  return { ok: true, user, cookieValue };
}

/** Verify a PIN and start a session. */
export async function signIn(
  db: Database,
  input: { userId: string; pin: string },
  context: AuthContext,
): Promise<AuthResult> {
  const at = now();

  const gate = await checkLockout(db, input.userId, context.ipHash, at);
  if (gate !== null) return gate;

  const [user] = await db.select().from(users).where(eq(users.id, input.userId));

  if (user === undefined || user.pinHash === null) {
    await recordAttempt(db, {
      userId: user?.id ?? null,
      ipHash: context.ipHash,
      outcome: 'UNKNOWN_MANAGER',
      at,
    });
    return { ok: false, message: 'That name has not been claimed yet.' };
  }

  if (!(await verifyPin(input.pin, user.pinHash))) {
    await recordAttempt(db, { userId: user.id, ipHash: context.ipHash, outcome: 'BAD_PIN', at });
    return { ok: false, message: "That's not the PIN Tony has on file." };
  }

  await recordAttempt(db, { userId: user.id, ipHash: context.ipHash, outcome: 'SUCCEEDED', at });
  const cookieValue = await issueSession(db, user.id, context, at);

  return { ok: true, user, cookieValue };
}

/** Null when the attempt may proceed; a refusal otherwise. */
async function checkLockout(
  db: Database,
  userId: string,
  ipHash: string,
  at: Date,
): Promise<{ ok: false; message: string } | null> {
  const [byUser, byIp] = await Promise.all([
    recentFailures(db, 'user', userId, at),
    recentFailures(db, 'ip', ipHash, at),
  ]);

  for (const failures of [byUser, byIp]) {
    const decision = evaluateLockout(failures, at);
    if (decision.locked && decision.until !== null) {
      await recordAttempt(db, { userId, ipHash, outcome: 'LOCKED_OUT', at });
      return { ok: false, message: lockoutMessage(decision.until, at) };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Reading and ending sessions
// ---------------------------------------------------------------------------

export interface ResolvedSession {
  readonly user: User;
  readonly session: Session;
}

/**
 * Resolve a session cookie to a person, and roll the window forward.
 *
 * The 90-day expiry is refreshed here rather than only at login, which is what
 * makes it *rolling*: a manager who visits every Tuesday is never signed out.
 * The row is touched at most once an hour, because the cookie's own expiry is
 * refreshed on every request by the middleware and costs nothing.
 */
export async function resolveSession(
  db: Database,
  tokenHash: string | null,
): Promise<ResolvedSession | null> {
  if (tokenHash === null) return null;

  const at = now();

  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, tokenHash));

  if (row === undefined) return null;
  if (row.session.revokedAt !== null) return null;
  if (row.session.expiresAt.getTime() <= at.getTime()) return null;

  if (at.getTime() - row.session.lastSeenAt.getTime() > SESSION_TOUCH_INTERVAL_MS) {
    await db
      .update(sessions)
      .set({ lastSeenAt: at, expiresAt: expiryFrom(at) })
      .where(eq(sessions.id, row.session.id));
  }

  return { user: row.user, session: row.session };
}

export async function signOut(db: Database, tokenHash: string | null): Promise<void> {
  if (tokenHash === null) return;
  await db
    .update(sessions)
    .set({ revokedAt: now(), revokedReason: 'SIGNED_OUT' })
    .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)));
}

export async function signOutEverywhere(db: Database, userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: now(), revokedReason: 'SIGNED_OUT_EVERYWHERE' })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

export interface DeviceSummary {
  readonly id: string;
  readonly label: string;
  readonly lastSeenAt: Date;
  readonly current: boolean;
}

export async function listDevices(
  db: Database,
  userId: string,
  currentSessionId: string,
): Promise<readonly DeviceSummary[]> {
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .orderBy(desc(sessions.lastSeenAt));

  return rows
    .filter((row) => row.expiresAt.getTime() > now().getTime())
    .map((row) => ({
      id: row.id,
      label: row.deviceLabel,
      lastSeenAt: row.lastSeenAt,
      current: row.id === currentSessionId,
    }));
}

// ---------------------------------------------------------------------------
// Commissioner recovery
// ---------------------------------------------------------------------------

/**
 * Reset a manager's PIN (`09 §8.3`).
 *
 * Clears the hash rather than setting a new one — the commissioner must never
 * be able to see or choose someone's PIN. The manager then re-claims their name
 * from the door, exactly as they did the first time.
 *
 * Every existing session is revoked in the same transaction as the reset and
 * the audit row, so a reset cannot half-happen and cannot happen unrecorded.
 */
export async function resetPin(
  db: Database,
  input: { actorUserId: string; subjectUserId: string },
): Promise<void> {
  const at = now();

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ pinHash: null, pinUpdatedAt: null, updatedAt: at })
      .where(eq(users.id, input.subjectUserId));

    await tx
      .update(sessions)
      .set({ revokedAt: at, revokedReason: 'COMMISSIONER_RESET' })
      .where(and(eq(sessions.userId, input.subjectUserId), isNull(sessions.revokedAt)));

    await tx.insert(adminAuditLogs).values({
      actorUserId: input.actorUserId,
      action: 'pin_reset',
      subjectUserId: input.subjectUserId,
      details: { revokedSessions: true },
      occurredAt: at,
    });
  });
}
