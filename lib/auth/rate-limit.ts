import { createHmac } from 'node:crypto';

/**
 * Login rate limiting.
 *
 * `16 §11`: five attempts per fifteen minutes, per account **and** per IP, with
 * exponential lockout, tracked in Postgres.
 *
 * The lockout is **computed from recent failures, never stored.** There is no
 * lock flag to get stuck on, no unlock job to write, and no way for a lockout
 * to outlive the failures that caused it. The most expensive thing an attacker
 * can achieve is locking a manager out of their own account for a while — with
 * ten known names that is unavoidable for any scheme, and it resolves itself.
 *
 * Counting is per account and per IP because they defend different things:
 * per-account stops one manager's PIN being ground down, per-IP stops one
 * machine walking the whole roster five guesses at a time.
 *
 * This module is pure. It takes the failures the caller loaded and returns a
 * decision; the queries live in `service.ts`.
 */

/** Five failures and the door shuts (`16 §11`). */
export const MAX_ATTEMPTS = 5;

/** The first lockout, and the unit the rest double from. */
export const LOCKOUT_BASE_MINUTES = 15;
export const LOCKOUT_BASE_MS = LOCKOUT_BASE_MINUTES * 60 * 1000;

/**
 * Lockout doubles per failure past the threshold: 15m, 30m, 60m, 120m, then a
 * ceiling of four hours. A determined guesser gets a handful of tries a day; a
 * manager who fat-fingers their PIN six times waits half an hour.
 */
export const MAX_LOCKOUT_MS = 4 * 60 * 60 * 1000;

/**
 * How far back failures are counted.
 *
 * This is **not** the fifteen minutes in `16 §11`, and the difference is the
 * whole reason the escalation works. Counting failures only within a fifteen
 * minute window means the sixth failure's thirty-minute penalty can never be
 * served: the failures age out of the window after fifteen, the count drops
 * below five, and the door reopens. Every lockout collapses to the same
 * fifteen minutes however many times somebody has tried, and the exponential
 * exists only in the comment above it.
 *
 * So failures are counted over a day — comfortably longer than the four-hour
 * ceiling — and the penalty is measured from the most recent one. Five rapid
 * failures still lock the door for fifteen minutes, which is what the plan
 * asks for. Somebody grinding away all afternoon is held longer each time,
 * which is what the plan meant.
 *
 * A correct PIN clears the count entirely, so this never accumulates against a
 * manager who simply forgot once a month.
 */
export const FAILURE_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export interface Failure {
  /** From the injected clock at the time of the attempt. */
  readonly occurredAt: Date;
}

export interface LockoutDecision {
  readonly locked: boolean;
  /** When the next attempt is allowed. Null when not locked. */
  readonly until: Date | null;
  /** Attempts left in the current window before lockout begins. */
  readonly remaining: number;
}

/**
 * Decide whether an actor may attempt a login.
 *
 * `failures` must be the failed attempts inside the window, newest first; a
 * successful login clears the count by the caller not passing failures that
 * precede it.
 */
export function evaluateLockout(failures: readonly Failure[], now: Date): LockoutDecision {
  const recent = failures.filter(
    (failure) => now.getTime() - failure.occurredAt.getTime() < FAILURE_LOOKBACK_MS,
  );

  if (recent.length < MAX_ATTEMPTS) {
    return { locked: false, until: null, remaining: MAX_ATTEMPTS - recent.length };
  }

  const excess = recent.length - MAX_ATTEMPTS;
  const penalty = Math.min(LOCKOUT_BASE_MS * 2 ** excess, MAX_LOCKOUT_MS);

  const newest = recent.reduce(
    (latest, failure) => (failure.occurredAt > latest ? failure.occurredAt : latest),
    recent[0]!.occurredAt,
  );

  const until = new Date(newest.getTime() + penalty);

  if (until.getTime() <= now.getTime()) {
    // The penalty has been served. The failures are still counted, so one more
    // mistake re-locks immediately and for twice as long — but the manager
    // gets their attempt.
    return { locked: false, until: null, remaining: 1 };
  }

  return { locked: true, until, remaining: 0 };
}

/** How long to wait, phrased for a person rather than in milliseconds. */
export function lockoutMessage(until: Date, now: Date): string {
  const minutes = Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60_000));
  if (minutes < 60) {
    return `Too many tries. Tony's locked the door for ${String(minutes)} minutes.`;
  }
  const hours = Math.ceil(minutes / 60);
  return `Too many tries. Tony's locked the door for ${String(hours)} hours.`;
}

/**
 * A keyed hash of the client address.
 *
 * Rate limiting needs to know that two attempts came from the same place, not
 * where that place is. Keying it with `SESSION_SECRET` means the stored values
 * are not a reversible list of the league's home IPs, and rotating the secret
 * discards the history rather than exposing it.
 *
 * An unknown address hashes to a shared bucket. That is deliberate: attempts we
 * cannot attribute should share a limit rather than each get a free one.
 */
export function hashIp(ip: string | null): string {
  const secret = process.env['SESSION_SECRET'] ?? '';
  const value = ip === null || ip.trim() === '' ? 'unknown-client' : ip.trim();
  return createHmac('sha256', secret).update(value).digest('base64url');
}

/**
 * The client address, from Vercel's proxy headers.
 *
 * `x-forwarded-for` is a client-controllable list; the value appended by the
 * platform's own proxy is the LAST entry, not the first. Trusting the first
 * would let anyone reset their own rate limit by sending a header.
 */
export function clientIp(headers: Headers): string | null {
  const real = headers.get('x-real-ip');
  if (real !== null && real.trim() !== '') return real.trim();

  const forwarded = headers.get('x-forwarded-for');
  if (forwarded === null || forwarded.trim() === '') return null;

  const hops = forwarded
    .split(',')
    .map((hop) => hop.trim())
    .filter((hop) => hop !== '');

  return hops.at(-1) ?? null;
}
