import { notFound } from 'next/navigation';

import { saveDraftReviewAction } from '@/app/actions/preseason';
import { PanelHeading, ReturnPlate } from '@/components/scene/panel';
import { RoomBehind } from '@/components/scene/room-behind';
import {
  MetadataStrip,
  Plaque,
  PrintedRule,
  SectionHeading,
  WarningBlock,
} from '@/components/scene/text-surface';
import { Page } from '@/components/shell';
import {
  BestPickPicker,
  DeskTextArea,
  DraftSnapshot,
  GradePicker,
} from '@/components/slice/draft-desk';
import { DeskExit, DeskPanel, StampButton } from '@/components/slice/review';
import { requireAdmin } from '@/lib/auth/current-user';
import { openSeason } from '@/lib/counter/tokens';
import { getDb } from '@/lib/db';
import { TYPE } from '@/lib/design/type';
import { managerDesk } from '@/lib/slice/preseason-desk';
import { CONCERN_MAX, TAKE_MAX } from '@/lib/slice/preseason-reviews';

/**
 * One manager's draft, and what Tony thinks of it.
 *
 * ## One screen per manager, and that is the whole workload decision
 *
 * The commissioner's rule is that ten teams must be enterable from a phone
 * without it becoming a chore. A ten-team form is a spreadsheet; a spreadsheet
 * on a phone is a scroll with a keyboard covering half of it. So: one manager,
 * their draft above the fields so it can be read while writing about it, and
 * **Save and next** as the primary action.
 *
 * Every save is committed on its own. There is no final submit, nothing is
 * staged, and a commissioner who does four on the bus and six that evening loses
 * nothing in between.
 *
 * ## The order of the page is the order of the thought
 *
 * Who → what they did → what Tony thinks. The snapshot sits **above** the grade
 * because the grade is a response to it, and a form that asked for the verdict
 * first and showed the evidence underneath would be asking somebody to scroll
 * back up to check themselves.
 */

export const dynamic = 'force-dynamic';

export default async function DraftReviewEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const db = getDb();

  const { userId } = await params;
  const query = await searchParams;

  const live = await openSeason(db);
  if (live === null) notFound();

  const desk = await managerDesk(db, { season: live.year, userId });
  /*
   * `notFound()` rather than a message, because a user id that is not in the
   * league is not a state this screen has — it is a wrong URL. A retired manager
   * lands here too, and that is correct: they are not in the product at all
   * (`lib/league/membership.ts`).
   */
  if (desk === null) notFound();

  const refused = typeof query['refused'] === 'string' ? query['refused'] : null;
  const incomplete = query['error'] === 'incomplete';

  return (
    <>
      <RoomBehind />

      <Page>
        <main
          className="mx-auto w-full max-w-md flex-1 px-4 pt-3 pb-8"
          data-draft-editor={desk.review.grade === null ? 'blank' : 'written'}
        >
          <DeskPanel>
            <Plaque tone="stop">Staff only</Plaque>

            <div className="mt-3.5">
              <PanelHeading>{desk.review.displayName}</PanelHeading>
            </div>

            {/*
              * Where they are in the ten. It is the only thing on this screen
              * that is about the *task* rather than about this manager, so it is
              * one metadata line and not a progress bar.
              */}
            <MetadataStrip
              className="mt-2"
              data-draft-position={`${String(desk.position)}/${String(desk.total)}`}
            >
              {desk.position} of {desk.total}
              {desk.review.updatedAt === null ? '' : ' · written'}
            </MetadataStrip>

            {refused !== null && (
              <div className="mt-3.5">
                <WarningBlock tone="stop" title="Tony cannot print that">
                  {refused}
                </WarningBlock>
              </div>
            )}

            {incomplete && (
              <div className="mt-3.5">
                <WarningBlock tone="stop" title="Not enough to go on">
                  A grade and a take are both needed. The other two are Tony’s if he has them.
                </WarningBlock>
              </div>
            )}

            {/*
              * What they actually did — above the fields, so it can be read
              * while writing about it.
              */}
            <div className="mt-5">
              {desk.facts === null ? (
                <p className={`${TYPE.body} text-ink-700`}>
                  The stored draft holds no picks for this manager, so there is nothing to review
                  yet.
                </p>
              ) : (
                <DraftSnapshot
                  slot={desk.facts.draftSlot}
                  picks={desk.facts.picks.slice(0, 6).map((pick) => ({
                    label: pick.label,
                    playerName: pick.playerName,
                    position: pick.position,
                  }))}
                  positions={
                    desk.facts.byPosition.length === 0
                      ? null
                      : desk.facts.byPosition
                          .map((entry) => `${entry.position} ${String(entry.count)}`)
                          .join(' · ')
                  }
                />
              )}
            </div>

            <form action={saveDraftReviewAction} className="mt-6">
              <input type="hidden" name="userId" value={desk.review.userId} />
              <input type="hidden" name="next" value={desk.nextUserId ?? ''} />

              <PrintedRule />
              <div className="mt-2">
                <SectionHeading ink="text-ink-500">What Tony says</SectionHeading>
              </div>

              <div className="mt-3">
                <GradePicker value={desk.review.grade} />
              </div>

              <div className="mt-4">
                <DeskTextArea
                  label="Write Tony’s take"
                  name="take"
                  value={desk.review.take}
                  maxLength={TAKE_MAX}
                  required
                  hint={`A sentence or two, up to ${String(TAKE_MAX)} characters. It prints as Tony’s.`}
                />
              </div>

              <div className="mt-4">
                <BestPickPicker picks={desk.pickable} value={desk.review.bestPickId} />
              </div>

              <div className="mt-4">
                <DeskTextArea
                  label="What Tony is not sure about"
                  name="concern"
                  value={desk.review.concern}
                  maxLength={CONCERN_MAX}
                  hint="Optional. Leave it empty and the section does not print."
                />
              </div>

              <div className="mt-5">
                <StampButton tone="go">
                  {desk.nextUserId === null ? 'Save, and back to the board' : 'Save, and next'}
                </StampButton>
              </div>
            </form>

            {/*
              * Back to the previous manager, when there is one.
              *
              * A link rather than a second submit, because it must **not** save:
              * a commissioner who opened the wrong screen should be able to leave
              * it without writing a grade they did not mean.
              */}
            {desk.previousUserId !== null && (
              <div className="mt-3">
                <DeskExit href={`/admin/slice/draft/${desk.previousUserId}`}>
                  &larr;&nbsp;&nbsp;Back one
                </DeskExit>
              </div>
            )}
          </DeskPanel>

          <div className="mt-6">
            <DeskExit href="/admin/slice/draft">&larr;&nbsp;&nbsp;The draft board</DeskExit>
          </div>

          <div className="mt-3">
            <ReturnPlate />
          </div>
        </main>
      </Page>
    </>
  );
}
