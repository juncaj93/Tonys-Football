import 'server-only';

import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { getDb } from '@/lib/db';

import { clientIp, hashIp } from './rate-limit';
import { resolveSession, type ResolvedSession } from './service';
import { SESSION_COOKIE, tokenHashFromCookie } from './session';
import type { AuthContext } from './service';

/**
 * The authorization layer.
 *
 * `16 §4.2` replaces row-level security with exactly one testable server-side
 * layer, and this is it. Every protected page and action starts here. There is
 * no client-side route guard anywhere in the project, because a hidden button
 * is not authorization (`09 §9`).
 *
 * `server-only` makes importing this from a client component a build error
 * rather than a runtime surprise.
 */

/** The signed-in person, or null. Never throws, never redirects. */
export async function viewer(): Promise<ResolvedSession | null> {
  const store = await cookies();
  const tokenHash = tokenHashFromCookie(store.get(SESSION_COOKIE)?.value);
  return resolveSession(getDb(), tokenHash);
}

/**
 * Require a signed-in person.
 *
 * Sends anyone else to the door. The door is the only unauthenticated surface
 * in the product.
 */
export async function requireUser(): Promise<ResolvedSession> {
  const current = await viewer();
  if (current === null) redirect('/door');
  return current;
}

/**
 * Require the commissioner.
 *
 * Answers with `notFound()` rather than a redirect or a 403: a player probing
 * `/admin` learns nothing about whether it exists.
 */
export async function requireAdmin(): Promise<ResolvedSession> {
  const current = await requireUser();
  if (!current.user.isAdmin) notFound();
  return current;
}

/** Request-derived context for the rate limiter and the device label. */
export async function authContext(): Promise<AuthContext> {
  const headerList = await headers();
  return {
    ipHash: hashIp(clientIp(headerList)),
    userAgent: headerList.get('user-agent'),
  };
}
