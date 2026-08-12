'use server';

import { redirect } from 'next/navigation';

import { requireAdmin } from '@/lib/auth/current-user';
import { getDb } from '@/lib/db';
import { openSeason } from '@/lib/counter/tokens';
import {
  approveVersion,
  generateDraft,
  rejectVersion,
  setPublicationHold,
  submitForReview,
} from '@/lib/slice/publication';

/**
 * The commissioner's controls over Slice publication.
 *
 * Every one of these re-derives the actor from the session with `requireAdmin()`
 * and passes *that* id to the service. Nothing trusts a field in the form to say
 * who is acting — which matters more here than anywhere else in the product,
 * because the id on an approval row is the thing `16 §9`'s mandatory-approval
 * rule is enforced against.
 *
 * `requireAdmin()` answers with `notFound()`, so a manager posting to these
 * learns nothing about whether they exist.
 *
 * ## What is deliberately absent
 *
 * **There is no edit action.** `08 §22` lists an edit control; `16 §9` requires
 * every number and proper noun in a published issue to match the fact packet,
 * checked deterministically. A free-text edit would let a sentence no validator
 * had passed reach the one surface the league reads as true. The controls are
 * approve, reject and regenerate — a stronger guarantee than the one `08` asked
 * for, and the reasoning is in `lib/slice/publication.ts`.
 */

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

/**
 * Render this week's issue and put it in the queue.
 *
 * The same operation `16 §4.3`'s Tuesday job will call, exposed as a button so
 * the whole chain is walkable today without a scheduler. When the job lands it
 * calls `generateDraft`, not this — a route handler is not a shared service.
 */
export async function draftIssueAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  const season = Number(formData.get('season'));
  const week = Number(formData.get('week'));
  if (!Number.isInteger(season) || !Number.isInteger(week) || week < 1) return;

  const result = await generateDraft(getDb(), {
    season,
    week,
    actorUserId: admin.user.id,
    submit: true,
  });

  if (result.versionId === null) {
    redirect('/admin/slice?drafted=refused');
  }

  redirect(`/admin/slice/${result.versionId}?drafted=${result.outcome}`);
}

export async function submitIssueAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const versionId = formData.get('versionId');
  if (!isUuid(versionId)) return;

  await submitForReview(getDb(), { versionId, actorUserId: admin.user.id });
  redirect(`/admin/slice/${versionId}`);
}

export async function approveIssueAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const versionId = formData.get('versionId');
  if (!isUuid(versionId)) return;

  const note = formData.get('note');
  await approveVersion(getDb(), {
    versionId,
    actorUserId: admin.user.id,
    note: typeof note === 'string' && note.trim() !== '' ? note.trim() : null,
  });
  redirect(`/admin/slice/${versionId}`);
}

/**
 * Refuse a version, with a reason.
 *
 * The reason is required and the requirement is in the database
 * (`slice_reviews_rejection_needs_a_reason`), not only here: the next version is
 * written against it, and a refusal nobody recorded a reason for is a decision
 * that cannot be acted on.
 */
export async function rejectIssueAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const versionId = formData.get('versionId');
  if (!isUuid(versionId)) return;

  const note = formData.get('note');
  if (typeof note !== 'string' || note.trim() === '') {
    redirect(`/admin/slice/${versionId}?error=reason-required`);
  }

  await rejectVersion(getDb(), {
    versionId,
    actorUserId: admin.user.id,
    note: note.trim(),
  });
  redirect(`/admin/slice/${versionId}`);
}

/*
 * `publishIssueAction` is **gone**, and its absence is the point.
 *
 * `approveAndPublishAction` (`app/actions/publication.ts`) reaches the press for
 * every caller now, including an already-approved version — so a second action
 * doing the same thing would be a second endpoint to keep correct, and the one
 * that drifted would be the one without the digest check on it.
 *
 * An exported `'use server'` function is a **live endpoint**, not a helper. One
 * with no caller is a door nobody is watching, so it is deleted rather than kept
 * "in case". The service it called, `publishVersion`, is untouched.
 */

/**
 * The manual hold (`16 §9`, permanent).
 *
 * A new row each way rather than a flag being flipped, so *"was publication
 * stopped that week, and who stopped it"* stays answerable.
 */
export async function holdPublicationAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const held = formData.get('held') === '1';
  const reason = formData.get('reason');

  await setPublicationHold(getDb(), {
    held,
    actorUserId: admin.user.id,
    reason: typeof reason === 'string' && reason.trim() !== '' ? reason.trim() : null,
  });
  redirect('/admin/slice');
}

/**
 * The season a draft button defaults to. Read on the server; never posted by the form.
 *
 * ## The guard was missing, and an export from a `'use server'` file is a door
 *
 * Every other action in this file opens with `requireAdmin()`; this one opened
 * with a query. Next publishes each export of a `'use server'` module as a
 * callable endpoint, so an unguarded one is reachable by anyone holding the
 * URL — signed in or not — regardless of which component happens to call it.
 * `16 §11` has exactly one unauthenticated surface and it is the door.
 *
 * What leaked was small: the newest open season's year, which is on Sleeper and
 * on the wall of the shop. Nothing was mutated and nothing private was returned.
 * It is guarded rather than argued about, because *"that particular read was
 * harmless"* is a property of today's body, and the missing line is what the
 * next body would inherit.
 *
 * **It also has no callers.** `app/page.tsx`, `lib/parlor/receipt.ts` and
 * `lib/counter/showcase.ts` all import the identically-named function from
 * `lib/league/membership.ts`; nothing imports this one. It is left in place with
 * the guard rather than deleted — this workstream owns authorization, not the
 * Slice's surface area, and removing an export is the Slice owner's call.
 */
export async function currentSeasonYear(): Promise<number | null> {
  await requireAdmin();
  const season = await openSeason(getDb());
  return season?.year ?? null;
}
