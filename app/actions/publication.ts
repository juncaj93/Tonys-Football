'use server';

import { redirect } from 'next/navigation';

import { requireAdmin } from '@/lib/auth/current-user';
import { getDb } from '@/lib/db';
import { type DecisionOutcome } from '@/lib/publication/kinds';
import { decide, isPublicationKind } from '@/lib/publication/queue';
/*
 * The refusal type lives with the Slice's chain because that is where it was
 * written and where its other callers are. Moving it here to look tidier would
 * be a rename across a working module for a population of one kind; the day a
 * second kind raises it, it moves to `lib/publication/` and both import it.
 */
import { PublicationRefused } from '@/lib/slice/publication';

/**
 * Approve and publish, in one gesture.
 *
 * ## Where the authority is, and where it is not
 *
 * `requireAdmin()`, first line, every time — and the actor passed to the service
 * is the id **that check produced**, never a field on the form. That matters
 * more here than anywhere else in the product: the id on an approval row is the
 * thing `16 §9`'s mandatory-approval rule is enforced against, so a form that
 * could name the approver would be a form that could forge one.
 *
 * `requireAdmin()` answers `notFound()`, so a manager posting to this learns
 * nothing about whether it exists — and a signed-out visitor is sent to the door
 * by `requireUser()` beneath it. Neither reaches the service.
 *
 * ## What the form is allowed to say
 *
 * Three things, and each one is a question the server cannot answer for itself:
 * *which kind*, *which item*, and *which copy of it was read*. Everything else —
 * whether the check passed, whether the press is stopped, whether it is already
 * printed, who is acting — is re-derived from the database at decision time. A
 * disabled button is not authorization (`09 §9`), so nothing here trusts one
 * having been disabled.
 */

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

/**
 * The stamp.
 *
 * Redirects rather than returning, so a refresh of the result re-runs a **GET**
 * on the item instead of re-posting the decision. The service is idempotent
 * anyway — a re-post reads the published state back rather than printing twice —
 * and this means the browser never offers to do it.
 */
export async function approveAndPublishAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  const kind = formData.get('kind');
  const id = formData.get('id');
  const digest = formData.get('digest');

  /*
   * A malformed post goes back to the queue and nothing else.
   *
   * No error parameter, because nothing renders one and a parameter the screen
   * ignores is a message that looks delivered. Every field here is filled by a
   * hidden input, so the only way to arrive malformed is to craft the request —
   * and a crafted request is owed a closed door, not a diagnostic.
   */
  if (!isPublicationKind(kind) || !isUuid(id) || typeof digest !== 'string' || digest === '') {
    redirect('/admin');
  }

  let outcome: DecisionOutcome;
  try {
    outcome = await decide(getDb(), {
      kind,
      id,
      actorUserId: admin.user.id,
      digest,
    });
  } catch (error: unknown) {
    /*
     * A refusal is an answer, not a crash.
     *
     * `PublicationRefused` is what the service raises for every condition a
     * commissioner can actually meet — the copy changed, the check refused it,
     * it is not waiting on a decision. Those belong on the screen in the room's
     * words. Anything else is a defect and is allowed to reach the error
     * boundary, because a bug that renders as a polite sentence is a bug nobody
     * fixes.
     */
    if (error instanceof PublicationRefused) {
      redirect(`/admin/slice/${id}?refused=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  if (!outcome.published) {
    redirect(`/admin/slice/${id}?held=${encodeURIComponent(outcome.heldBack ?? 'it was not printed')}`);
  }

  redirect(`/admin/slice/${id}?published=1`);
}
