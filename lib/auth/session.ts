import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Session tokens and the cookie that carries them.
 *
 * Pure functions over strings — no database, no `next/headers`, no request. It
 * is all unit-testable, and the parts that need a request live in
 * `current-user.ts`.
 *
 * The shape (`16 §11`):
 *
 *   cookie value = <token>.<hmac(secret, token)>
 *   database     = sha256(token)
 *
 * Three separate jobs, deliberately not collapsed into one:
 *
 * - **The token** is 32 random bytes. That, not the signature, is what makes a
 *   session unguessable.
 * - **The signature** lets us reject a garbage cookie without touching the
 *   database, so a bot spraying cookies costs no queries. It is also the reason
 *   `SESSION_SECRET` differs per environment: a preview cookie cannot be
 *   replayed against production even if the token somehow collided.
 * - **The stored hash** means a leaked database backup cannot be replayed as a
 *   login, for the same reason PINs are hashed.
 *
 * The cookie is host-only — no `Domain` attribute — which is what keeps a
 * `juncaj.net` subdomain a DNS change rather than a code change (`17 §10`).
 */

// The cookie's name and attributes live in `cookie.ts` so the Edge middleware
// can read them without pulling `node:crypto` into a runtime without it.
export { SESSION_COOKIE, SESSION_TTL_DAYS, SESSION_TTL_SECONDS } from './cookie';

/**
 * How stale `last_seen_at` may get before the row is touched.
 *
 * The cookie's expiry is refreshed on every request by the middleware, which
 * costs nothing. The database row only needs to keep up well enough that the
 * 90-day window is honest, so it is written at most once an hour per session
 * rather than on every page view.
 */
export const SESSION_TOUCH_INTERVAL_MS = 60 * 60 * 1000;

export interface MintedSession {
  /** Goes in the cookie. Never stored. */
  readonly cookieValue: string;
  /** Goes in the database. */
  readonly tokenHash: string;
}

function secret(): string {
  const value = process.env['SESSION_SECRET'];
  if (value === undefined || value === '') {
    // Failing closed is the point: an unsigned session cookie in production
    // would be a silent downgrade, and silent downgrades are how this kind of
    // thing goes wrong.
    throw new Error(
      'SESSION_SECRET is not set. Generate one with `openssl rand -base64 32` ' +
        'and set it per environment — see docs/DEPLOYMENT.md.',
    );
  }
  return value;
}

function sign(token: string): string {
  return createHmac('sha256', secret()).update(token).digest('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

export function mintSession(): MintedSession {
  const token = randomBytes(32).toString('base64url');
  return {
    cookieValue: `${token}.${sign(token)}`,
    tokenHash: hashToken(token),
  };
}

/**
 * Recover the stored-hash form from a cookie value.
 *
 * Returns null on anything that is not a cookie this deployment issued: wrong
 * shape, bad signature, tampered token. The caller can then skip the database
 * entirely.
 */
export function tokenHashFromCookie(cookieValue: string | undefined): string | null {
  if (cookieValue === undefined || cookieValue === '') return null;

  const separator = cookieValue.lastIndexOf('.');
  if (separator <= 0 || separator === cookieValue.length - 1) return null;

  const token = cookieValue.slice(0, separator);
  const signature = cookieValue.slice(separator + 1);

  const expected = Buffer.from(sign(token));
  const actual = Buffer.from(signature);
  // Constant-time, and length-checked first because timingSafeEqual throws on
  // a length mismatch.
  if (expected.length !== actual.length) return null;
  if (!timingSafeEqual(expected, actual)) return null;

  return hashToken(token);
}

/**
 * A short, human-recognisable device name from a User-Agent.
 *
 * The point is "is that my phone?" and nothing more. The raw header is
 * deliberately not stored: it is a fingerprint, and this product has no use
 * for one (`16 §A.1` removes analytics vendors for the same reason).
 */
export function deviceLabel(userAgent: string | null): string {
  if (userAgent === null || userAgent.trim() === '') return 'Unknown device';

  const platform = /iPhone/i.test(userAgent)
    ? 'iPhone'
    : /iPad/i.test(userAgent)
      ? 'iPad'
      : /Android/i.test(userAgent)
        ? 'Android'
        : /Macintosh/i.test(userAgent)
          ? 'Mac'
          : /Windows/i.test(userAgent)
            ? 'Windows'
            : 'Unknown device';

  // Order matters: Chrome and Edge both claim Safari, and Edge claims Chrome.
  const browser = /Edg\//i.test(userAgent)
    ? 'Edge'
    : /CriOS|Chrome/i.test(userAgent)
      ? 'Chrome'
      : /FxiOS|Firefox/i.test(userAgent)
        ? 'Firefox'
        : /Safari/i.test(userAgent)
          ? 'Safari'
          : null;

  return browser === null ? platform : `${platform} · ${browser}`;
}
