'use server';

import { redirect } from 'next/navigation';

import { requireAdmin } from '@/lib/auth/current-user';
import { applyCorrection, isCorrectionKind } from '@/lib/admin/corrections';
import { getDb } from '@/lib/db';

/**
 * The commissioner's correction actions.
 *
 * One action, because the office has one kind of correction button: a form on a
 * confirmation screen that names a manager and a correction and does exactly
 * that one thing.
 *
 * ## Nothing but `async function` may be exported from this file
 *
 * Not a style rule — a crash. `app/actions/character.ts` carries the full
 * account and `app/actions/use-server-exports.test.ts` is the gate: a
 * `'use server'` module that exports anything but an async function throws
 * `A "use server" file can only export async functions` the first time an action
 * in it is invoked, which is *after* the page has rendered perfectly.
 *
 * ## The actor is the session and never the form
 *
 * `requireAdmin()` first line, every time, exactly as `resetPinAction` and the
 * Slice actions do. The form carries who is being corrected; it never carries
 * who is doing the correcting, because a form field naming the actor is a field
 * anybody can set. `requireAdmin()` answers `notFound()`, so a manager posting
 * here learns nothing about whether the screen exists.
 *
 * ## Every refusal comes back on the screen rather than as a thrown error
 *
 * A correction can be refused for three ordinary reasons — the name is not on
 * the door, it is already back on the hook, it is your own — and none of them is
 * a fault. They redirect back to the same manager with the refusal named, so the
 * commissioner reads a sentence instead of a stack trace.
 */

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

export async function applyCorrectionAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  const subjectUserId = formData.get('userId');
  const kind = formData.get('kind');

  /*
   * A malformed post is sent back to the list rather than corrected into
   * something plausible. There is no manager to name in a message, so there is
   * nothing useful to say about it beyond "that was not a correction".
   */
  if (!isUuid(subjectUserId) || !isCorrectionKind(kind)) redirect('/admin/corrections');

  const result = await applyCorrection(getDb(), kind, {
    actorUserId: admin.user.id,
    subjectUserId,
  });

  const back = `/admin/corrections?subject=${subjectUserId}`;

  if (!result.ok) redirect(`${back}&refused=${result.refusal}`);

  redirect(`${back}&done=${kind}&result=${result.changed ? 'changed' : 'unchanged'}`);
}
