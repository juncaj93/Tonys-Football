import { NextResponse, type NextRequest } from 'next/server';

import { cookieAttributes, SESSION_COOKIE } from '@/lib/auth/cookie';

/**
 * Rolls the session cookie forward on every visit.
 *
 * `16 §11` asks for a **90-day rolling session, refreshed every visit**, so a
 * manager who shows up once a week on Tuesday is never signed out. Two halves
 * make that true, and both are needed:
 *
 *   - the database row's expiry, extended in `resolveSession`
 *   - the cookie's own `Max-Age`, extended here
 *
 * Without this half the cookie would still expire exactly 90 days after
 * sign-in, however fresh the row was — the session would be valid and the
 * browser would simply have stopped sending it.
 *
 * It rewrites the cookie without validating it, which is safe: re-sending a
 * value the browser already holds grants nothing. Validation costs a database
 * round trip and this runs on every request, including static assets, so it
 * stays a header write and nothing more.
 */
export function middleware(request: NextRequest): NextResponse {
  const response = NextResponse.next();
  const existing = request.cookies.get(SESSION_COOKIE);

  if (existing !== undefined) {
    response.cookies.set({
      name: SESSION_COOKIE,
      value: existing.value,
      ...cookieAttributes(),
    });
  }

  return response;
}

export const config = {
  // Everything except build output and metadata files. The parlor is one page;
  // matching it specifically would mean a manager who only ever opens a
  // deep-linked page slowly ages out of a session that is otherwise alive.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
};
