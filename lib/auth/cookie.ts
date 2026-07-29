/**
 * The session cookie's name and attributes.
 *
 * Deliberately its own module with **no Node imports**. `middleware.ts` runs on
 * the Edge runtime and needs these values; importing them from `session.ts`
 * would drag `node:crypto` into a runtime that does not have it, and the build
 * failure would arrive at deploy time rather than here.
 */

export const SESSION_COOKIE = 'tonys_session';

/** `16 §11`: 90 days, rolling. */
export const SESSION_TTL_DAYS = 90;
export const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;

export interface CookieAttributes {
  readonly httpOnly: true;
  readonly sameSite: 'lax';
  readonly secure: boolean;
  readonly path: '/';
  readonly maxAge: number;
}

/**
 * `16 §11`: signed, HTTP-only, Secure, SameSite=Lax.
 *
 * **Host-only by omission.** There is no `domain` attribute, so the cookie is
 * scoped to the exact host that set it. That is what keeps attaching a
 * `juncaj.net` subdomain later a DNS change rather than a code change
 * (`17 §10`) — and it means a cookie from a public preview URL is not valid on
 * production even if somebody copies it across.
 *
 * `SameSite=Lax` rather than `Strict` on purpose: `Strict` drops the cookie on
 * the first navigation in from a text message, which is exactly how this league
 * will open the site, and being silently signed out on arrival would look like
 * the session had expired.
 */
export function cookieAttributes(): CookieAttributes {
  return {
    httpOnly: true,
    sameSite: 'lax',
    // Local development is plain HTTP; a Secure cookie would never be stored.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };
}
