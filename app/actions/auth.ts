'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { authContext, requireAdmin, requireUser, viewer } from '@/lib/auth/current-user';
import { cookieAttributes, SESSION_COOKIE } from '@/lib/auth/cookie';
import {
  claimManager,
  resetPin,
  signIn,
  signOut,
  signOutEverywhere,
} from '@/lib/auth/service';
import { tokenHashFromCookie } from '@/lib/auth/session';
import { getDb } from '@/lib/db';

/**
 * The authenticated actions.
 *
 * Server actions rather than route handlers, which gets Next's own Origin/Host
 * check for free — with `SameSite=Lax` on the cookie that is the CSRF story
 * `04 §21` asks for. Every one of these re-derives the caller from the session
 * on the server; none of them trusts a field in the form to say who is acting.
 */

export interface AuthFormState {
  readonly error?: string;
}

function isSixDigits(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9]{6}$/.test(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

async function setSessionCookie(value: string): Promise<void> {
  const store = await cookies();
  store.set({ name: SESSION_COOKIE, value, ...cookieAttributes() });
}

export async function claimAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const userId = formData.get('userId');
  const pin = formData.get('pin');
  const confirm = formData.get('confirm');

  if (!isUuid(userId)) return { error: 'Tony does not have that name on the board.' };
  if (!isSixDigits(pin)) return { error: 'Tony needs all six digits.' };
  if (pin !== confirm) return { error: 'The two PINs do not match. Try again.' };

  const claimCode = formData.get('claimCode');

  const result = await claimManager(
    getDb(),
    {
      userId,
      pin,
      ...(typeof claimCode === 'string' ? { claimCode } : {}),
    },
    await authContext(),
  );

  if (!result.ok) return { error: result.message };

  await setSessionCookie(result.cookieValue);
  redirect('/');
}

export async function signInAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const userId = formData.get('userId');
  const pin = formData.get('pin');

  if (!isUuid(userId)) return { error: 'Tony does not have that name on the board.' };
  if (!isSixDigits(pin)) return { error: 'Tony needs all six digits.' };

  const result = await signIn(getDb(), { userId, pin }, await authContext());

  if (!result.ok) return { error: result.message };

  await setSessionCookie(result.cookieValue);
  redirect('/');
}

export async function signOutAction(): Promise<void> {
  const store = await cookies();
  await signOut(getDb(), tokenHashFromCookie(store.get(SESSION_COOKIE)?.value));
  store.delete(SESSION_COOKIE);
  redirect('/door');
}

export async function signOutEverywhereAction(): Promise<void> {
  const current = await viewer();
  if (current !== null) await signOutEverywhere(getDb(), current.user.id);

  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect('/door');
}

/**
 * Commissioner PIN reset (`09 §8.3`).
 *
 * `requireAdmin()` is the authorization, not the fact that the button only
 * renders on a page a player cannot see. The actor is the session's user, never
 * a form field — otherwise anyone could post this action naming the
 * commissioner as the actor.
 */
export async function resetPinAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const subjectUserId = formData.get('userId');

  if (!isUuid(subjectUserId)) return;
  // Resetting your own PIN through the admin screen would sign you out
  // mid-action and leave nobody able to reach the screen.
  if (subjectUserId === admin.user.id) return;

  await resetPin(getDb(), { actorUserId: admin.user.id, subjectUserId });
  redirect('/admin');
}

/** Used by the profile page to prove a session exists before rendering it. */
export async function requireSignedIn(): Promise<void> {
  await requireUser();
}
