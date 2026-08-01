import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  approveIssueAction,
  draftIssueAction,
  publishIssueAction,
  rejectIssueAction,
  submitIssueAction,
} from '@/app/actions/slice';
import { PanelHeading } from '@/components/scene/panel';
import { RoomBehind } from '@/components/scene/room-behind';
import {
  MetadataStrip,
  Plaque,
  PrintedRule,
  SectionHeading,
  WarningBlock,
} from '@/components/scene/text-surface';
import { Page } from '@/components/shell';
import { Newspaper } from '@/components/slice/newspaper';
import {
  DeskExit,
  DeskField,
  DeskPanel,
  HistoryPanel,
  PacketPanel,
  StampButton,
  StatusStamp,
  VerdictPanel,
} from '@/components/slice/review';
import { requireAdmin } from '@/lib/auth/current-user';
import { getDb } from '@/lib/db';
import { TYPE } from '@/lib/design/type';
import { publicationHold, reviewDetail } from '@/lib/slice/publication';

/**
 * One draft, and the decision about it.
 *
 * `08 §22` lists what a review screen shows. Every item it lists that this
 * product actually has is here — metadata, candidates, their scores, the fact
 * packet, the prose, the validation result, the suppressions, a preview, and the
 * approve action — and the three it lists that this product deliberately does
 * **not** have are named in `lib/slice/publication.ts` with their reasoning:
 * free-text editing, candidate override, and per-story regeneration.
 *
 * ## The preview is the real component
 *
 * `<Newspaper>` renders the stored edition, which is the same component the rack
 * serves to managers. A separate "preview" rendering would be a second thing to
 * keep correct, and the one place it drifted would be the place where what was
 * approved differs from what was printed.
 *
 * ## Why the actions are at the bottom
 *
 * The verdict is at the top because it can make everything below it moot; the
 * decision is at the bottom because a commissioner who has scrolled to it has
 * read the paper. A button bar at the top would make approving without reading
 * the default gesture.
 */

export const dynamic = 'force-dynamic';

export default async function SliceReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ versionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const { versionId } = await params;
  const query = await searchParams;

  const detail = await reviewDetail(getDb(), versionId);
  if (detail === null) notFound();

  const hold = await publicationHold(getDb());
  const error = typeof query['error'] === 'string' ? query['error'] : null;
  const published = query['published'] === '1';

  return (
    <>
      <RoomBehind />

      <Page>
        <main
          className="mx-auto w-full max-w-md flex-1 px-4 pt-3 pb-8"
          data-review-version={detail.status}
          data-review-publishable={detail.publishable ? 'yes' : 'no'}
        >
          {/*
            * The sheet the decision is made on.
            *
            * State, then identity, then the verdict — in that order, because the
            * three questions a commissioner opens this page with are *what is
            * this*, *what state is it in* and *can it be printed*, and the last
            * of those is the one that can make everything below it moot.
            */}
          <DeskPanel>
            {/*
              * The state first, the room's label second.
              *
              * `STAFF ONLY` in red led this row, so the loudest thing on a
              * refused draft was a permanent fact about the door rather than the
              * thing the screen exists to say. The stamp answers *what state is
              * this in*, which is question one.
              */}
            <div className="flex flex-wrap items-center gap-2">
              <StatusStamp status={detail.status} />
              <Plaque tone="stop">Staff only</Plaque>
            </div>

            <div className="mt-3.5">
              <PanelHeading>
                Season {detail.season} &middot; Week {detail.week}
              </PanelHeading>
            </div>

            {/*
              * The draft's identity, on two lines rather than one.
              *
              * It was one 12px run of `Draft 1 · set by the template press ·
              * 8f3c2b…` — a version number, a renderer and a sixteen-character
              * digest reading as one string, and at 360 it wrapped mid-hash. The
              * digest is the thing an approval is *against*, so it gets its own
              * line in the machine role, which breaks anywhere by design.
              */}
            <MetadataStrip className="mt-1.5">
              Draft {detail.version} &middot; set by the {detail.renderer} press
            </MetadataStrip>
            <p className={`mt-1 ${TYPE.machine} text-ink-500`}>{detail.contentHash}</p>

            {published && (
              <div className="mt-4">
                <WarningBlock tone="go" title="Printed">
                  It is on the rack now, and this is the copy every manager reads.
                </WarningBlock>
              </div>
            )}

            <div className="mt-4">
              <VerdictPanel detail={detail} />
            </div>
          </DeskPanel>

          {/*
            * The paper, exactly as the rack serves it.
            *
            * Outside the desk panel on purpose: a sheet of newsprint inside a
            * sheet of paper reads as a nested card, and the thing being judged
            * has to look like the thing that will print.
            */}
          <div className="mt-6">
            {/*
              * A dark plaque, not a cream plate.
              *
              * It was cream type straight onto the room, and at 360 the words
              * landed across the counter's red-and-white checker and stopped being
              * readable — `VISUAL_ACCEPTANCE §7`'s *"labels disappearing into
              * artwork"*, found by looking at the narrowest width rather than by a
              * gate. A cream plate fixed the contrast and created a second one:
              * cream label directly above cream paper, so the label read as part
              * of the sheet. Dark separates from both.
              */}
            <div className="mb-2.5">
              <Plaque>As it will print</Plaque>
            </div>
            <Newspaper issue={detail.edition} />
          </div>

          <div className="mt-6">
            <DeskPanel>
              <PacketPanel detail={detail} />
            </DeskPanel>
          </div>

          <div className="mt-6">
            <DeskPanel>
              <SectionHeading ink="text-ink-500">The decision</SectionHeading>

              {error === 'reason-required' && (
                <div className="mt-2.5">
                  <WarningBlock tone="stop" title="A refusal needs a reason">
                    The next draft is written against it, so an empty one leaves nothing for the
                    press to work from.
                  </WarningBlock>
                </div>
              )}

              {detail.status === 'draft' && (
                <>
                  <p className={`mt-2 ${TYPE.body} text-ink-700`}>
                    Drafted, and not yet up for review.
                  </p>
                  <form action={submitIssueAction} className="mt-3">
                    <input type="hidden" name="versionId" value={detail.versionId} />
                    <StampButton tone="quiet">Put it up for review</StampButton>
                  </form>
                </>
              )}

              {detail.status === 'needs_review' && (
                <>
                  {/*
                    * What happens next, and it is a different sentence when the
                    * check has already refused the copy.
                    *
                    * The refused case gets the warning treatment rather than a
                    * paragraph, because on that screen it is answering the
                    * question the whole page exists for — *can this be approved*
                    * — and the answer is no. It sat as the fourth line of an
                    * ordinary paragraph above a disabled button that gave no
                    * reason for being disabled.
                    */}
                  {detail.publishable ? (
                    <p className={`mt-2 ${TYPE.body} text-ink-700`}>
                      Approve it and it can be printed. Refuse it and it stays on the record with
                      your reason beside it.
                    </p>
                  ) : (
                    <div className="mt-2.5">
                      <WarningBlock tone="stop" title="Approving is not available">
                        The check refused this copy, so the Approve stamp is locked. Refuse it, fix
                        what the findings name, and draft the week again.
                      </WarningBlock>
                    </div>
                  )}

                  <form action={approveIssueAction} className="mt-4">
                    <input type="hidden" name="versionId" value={detail.versionId} />
                    <DeskField label="A note, if you want one on the record" name="note" />
                    <div className="mt-2.5">
                      <StampButton tone="go" disabled={!detail.publishable}>
                        Approve
                      </StampButton>
                    </div>
                  </form>

                  <div className="mt-5">
                    <PrintedRule />
                  </div>
                  <form action={rejectIssueAction} className="mt-3">
                    <input type="hidden" name="versionId" value={detail.versionId} />
                    <DeskField label="Why you are refusing it" name="note" required />
                    <div className="mt-2.5">
                      <StampButton tone="stop">Refuse it</StampButton>
                    </div>
                  </form>
                </>
              )}

              {detail.status === 'approved' && (
                <>
                  {hold.held ? (
                    <div className="mt-2.5">
                      <WarningBlock tone="stop" title="Approved, but the press is stopped">
                        Release the hold on the desk and it can be printed.
                      </WarningBlock>
                    </div>
                  ) : (
                    <p className={`mt-2 ${TYPE.body} text-ink-700`}>
                      Approved. Printing puts it on the rack, and every manager in the league reads
                      this copy.
                    </p>
                  )}
                  <form action={publishIssueAction} className="mt-3">
                    <input type="hidden" name="versionId" value={detail.versionId} />
                    <StampButton tone="go" disabled={hold.held}>
                      Print it
                    </StampButton>
                  </form>

                  <div className="mt-5">
                    <PrintedRule />
                  </div>
                  <form action={rejectIssueAction} className="mt-3">
                    <input type="hidden" name="versionId" value={detail.versionId} />
                    <DeskField label="Changed your mind? Say why" name="note" required />
                    <div className="mt-2.5">
                      <StampButton tone="stop">Pull it back</StampButton>
                    </div>
                  </form>
                </>
              )}

              {detail.status === 'published' && (
                <p className={`mt-2 ${TYPE.body} text-ink-700`}>
                  On the rack. It cannot be edited — a correction is a new draft of the same week,
                  and printing it leaves this copy on the record marked as replaced.
                </p>
              )}

              {detail.status === 'rejected' && (
                <>
                  <p className={`mt-2 ${TYPE.body} text-ink-700`}>
                    Refused, and it stays refused. Drafting the week again writes a new copy beside
                    this one rather than overwriting it.
                  </p>
                  <form action={draftIssueAction} className="mt-3">
                    <input type="hidden" name="season" value={String(detail.season)} />
                    <input type="hidden" name="week" value={String(detail.week)} />
                    <StampButton tone="quiet">Draft this week again</StampButton>
                  </form>
                </>
              )}

              {detail.status === 'superseded' && (
                <p className={`mt-2 ${TYPE.body} text-ink-700`}>
                  This copy was on the rack and a correction replaced it. It is kept because the
                  league read it.
                </p>
              )}
            </DeskPanel>
          </div>

          <div className="mt-6">
            <DeskPanel>
              <HistoryPanel history={detail.history} />

              {detail.siblings.length > 1 && (
                <>
                  <div className="mt-5">
                    <PrintedRule />
                  </div>
                  <div className="mt-2">
                    <SectionHeading ink="text-ink-500">Other drafts of this week</SectionHeading>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {detail.siblings
                      .filter((sibling) => sibling.versionId !== detail.versionId)
                      .map((sibling) => (
                        <li key={sibling.versionId}>
                          <Link
                            href={`/admin/slice/${sibling.versionId}`}
                            className={`${TYPE.bodyCompact} text-ink-900 underline decoration-ink-900/40 underline-offset-4`}
                          >
                            Draft {sibling.version} &middot; {sibling.status.replace(/_/g, ' ')}
                          </Link>
                        </li>
                      ))}
                  </ul>
                </>
              )}
            </DeskPanel>
          </div>

          <div className="mt-6">
            <DeskExit href="/admin/slice">&larr;&nbsp;&nbsp;The press desk</DeskExit>
          </div>
        </main>
      </Page>
    </>
  );
}
