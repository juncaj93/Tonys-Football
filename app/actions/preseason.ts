'use server';

import { redirect } from 'next/navigation';

import { requireAdmin } from '@/lib/auth/current-user';
import { openSeason } from '@/lib/counter/tokens';
import { getDb } from '@/lib/db';
import { readSchedule } from '@/lib/sleeper/schedule';
import { syncSeasonDraft } from '@/lib/sleeper/persist-draft';
import { createLiveSource } from '@/lib/sleeper/transport';
import { generatePreseasonDraft } from '@/lib/slice/publication';
import {
  DraftReviewRefused,
  isGrade,
  saveDraftReview,
} from '@/lib/slice/preseason-reviews';
import { seasonLeagueId } from '@/lib/slice/preseason-desk';

/**
 * The commissioner's controls over the draft review.
 *
 * Every one re-derives the actor from the session with `requireAdmin()`, like
 * `app/actions/slice.ts`, and for the same reason: the id recorded against an
 * edit is the audit trail, and a field in a form is not a claim about who is
 * acting. `requireAdmin()` answers `notFound()`, so a manager posting to these
 * learns nothing about whether they exist.
 *
 * ## Alex is ghost-writing Tony, and only the desk knows
 *
 * `updated_by` records who typed a grade. Nothing that reaches a reader ever
 * does — the paper prints **TONY'S GRADE**, and `docs/PRESEASON_SLICE_BOUNDARY.md`
 * makes that a product rule rather than a wording preference.
 */

/**
 * Save one manager's review and go to the next one.
 *
 * The whole workflow is ten of these in a row, so the redirect is the feature:
 * `next` carries where to go, the page computes it from the board's own order,
 * and a commissioner who wants to stop simply stops — every save is committed on
 * its own and nothing is staged.
 */
export async function saveDraftReviewAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const db = getDb();

  const season = await openSeason(db);
  if (season === null) redirect('/admin/slice/draft');

  const userId = formData.get('userId');
  const grade = formData.get('grade');
  const take = formData.get('take');
  const bestPickId = formData.get('bestPickId');
  const concern = formData.get('concern');
  const next = formData.get('next');

  if (typeof userId !== 'string' || userId === '') redirect('/admin/slice/draft');
  if (!isGrade(grade) || typeof take !== 'string') {
    redirect(`/admin/slice/draft/${userId}?error=incomplete`);
  }

  try {
    await saveDraftReview(db, {
      seasonYear: season.year,
      userId,
      grade,
      take,
      bestPickId: typeof bestPickId === 'string' && bestPickId !== '' ? bestPickId : null,
      concern: typeof concern === 'string' && concern.trim() !== '' ? concern : null,
      actorUserId: admin.user.id,
    });
  } catch (error: unknown) {
    if (error instanceof DraftReviewRefused) {
      /*
       * The refusal travels in the URL rather than in a session flash.
       *
       * There is no flash mechanism in this product and adding one for a form
       * that is used ten times a year would be a mechanism to maintain. The
       * message is the commissioner's own sentence back at them, so it is safe
       * to put in a query string — it contains nothing the poster did not type.
       */
      redirect(
        `/admin/slice/draft/${userId}?refused=${encodeURIComponent(error.message)}`,
      );
    }
    throw error;
  }

  redirect(
    typeof next === 'string' && next !== ''
      ? `/admin/slice/draft/${next}`
      : '/admin/slice/draft?saved=1',
  );
}

/**
 * Read the draft from Sleeper.
 *
 * The same operation the Tuesday job runs, exposed as a button so the
 * commissioner is not waiting for a cron on the Sunday after draft night — which
 * is exactly when they want to start writing.
 *
 * `createLiveSource()` because there is nothing to read otherwise: the recorded
 * fixtures were captured before the league drafted, so a fixture source would
 * report `pre_draft` forever. It is the one action on this desk that reaches the
 * network.
 */
export async function pullDraftAction(): Promise<void> {
  await requireAdmin();
  const db = getDb();

  const season = await openSeason(db);
  if (season === null) redirect('/admin/slice/draft');

  const leagueId = await seasonLeagueId(db, season.year);
  if (leagueId === null) redirect('/admin/slice/draft?pulled=no-league');

  const report = await syncSeasonDraft(db, {
    source: createLiveSource(),
    seasonYear: season.year,
    leagueId,
  });

  redirect(
    `/admin/slice/draft?pulled=${report.refusal ?? String(report.picksStored)}`,
  );
}

/**
 * Draft the preseason issue and put it on the press desk.
 *
 * The same `generatePreseasonDraft` the Tuesday job calls, with the same
 * `submit: true` — it lands in the review queue and stops. There is no parameter
 * on this action that publishes, for the reason `app/actions/slice.ts` has no
 * edit action: `16 §9`'s approval gate has no preseason exemption.
 */
export async function draftPreseasonIssueAction(): Promise<void> {
  const admin = await requireAdmin();
  const db = getDb();

  const season = await openSeason(db);
  if (season === null) redirect('/admin/slice/draft');

  /*
   * Week one's fixtures, if the schedule is out.
   *
   * Read here rather than from the database, because the sync deliberately
   * refuses to store a drafted-but-unplayed week
   * (`docs/IN_SEASON_SYNC_BOUNDARY.md`). It lands inside the rendered edition,
   * which is a snapshot of what was true at press time.
   */
  const leagueId = await seasonLeagueId(db, season.year);
  const weekOne =
    leagueId === null
      ? []
      : await readSchedule(createLiveSource(), { leagueId, week: 1 });

  const result = await generatePreseasonDraft(db, {
    season: season.year,
    ...(weekOne.length === 0 ? {} : { weekOne }),
    actorUserId: admin.user.id,
    submit: true,
  });

  if (result.versionId === null) {
    redirect(`/admin/slice/draft?drafted=${result.refusal ?? 'refused'}`);
  }

  redirect(`/admin/slice/${result.versionId}?drafted=${result.outcome}`);
}
