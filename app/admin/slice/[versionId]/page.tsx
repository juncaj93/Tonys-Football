import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  approveIssueAction,
  draftIssueAction,
  publishIssueAction,
  rejectIssueAction,
  submitIssueAction,
} from '@/app/actions/slice';
import { PanelHeading, SignPlate } from '@/components/scene/panel';
import { RoomBehind } from '@/components/scene/room-behind';
import { Page } from '@/components/shell';
import { Newspaper } from '@/components/slice/newspaper';
import {
  DeskPanel,
  HistoryPanel,
  PacketPanel,
  Rule,
  SectionLabel,
  StampButton,
  StatusPlate,
  VerdictPanel,
} from '@/components/slice/review';
import { requireAdmin } from '@/lib/auth/current-user';
import { getDb } from '@/lib/db';
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
          <DeskPanel>
            <div className="flex flex-wrap items-center gap-2">
              <SignPlate tone="red">Staff only</SignPlate>
              <StatusPlate status={detail.status} />
            </div>

            <div className="mt-3">
              <PanelHeading>
                Season {detail.season} &middot; Week {detail.week}
              </PanelHeading>
            </div>

            <p className="mt-1 font-display text-[12px] leading-[1.5] text-ink-500 uppercase tabular-nums">
              Draft {detail.version} &middot; set by the {detail.renderer} press &middot;{' '}
              {detail.contentHash}
            </p>

            {published && (
              <p className="mt-3 border-l-[3px] border-blue-mid pl-3 text-[17px] leading-[1.5] text-ink-900">
                Printed. It is on the rack now, and this is the copy every manager reads.
              </p>
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
          <div className="mt-5">
            {/*
              * A plate, not a bare label.
              *
              * It was cream type straight onto the room, and at 360 the words
              * landed across the counter's red-and-white checker and stopped being
              * readable — `VISUAL_ACCEPTANCE §7`'s *"labels disappearing into
              * artwork"*, found by looking at the narrowest width rather than by a
              * gate. `SignPlate` is the room's own answer to a surface naming
              * itself, and it carries its own ground.
              */}
            <div className="mb-2">
              <SignPlate tone="cream">As it will print</SignPlate>
            </div>
            <Newspaper issue={detail.edition} />
          </div>

          <div className="mt-5">
            <DeskPanel>
              <PacketPanel detail={detail} />
            </DeskPanel>
          </div>

          <div className="mt-5">
            <DeskPanel>
              <SectionLabel>The decision</SectionLabel>

              {error === 'reason-required' && (
                <p className="mt-1.5 border-l-[3px] border-red-dark pl-3 text-[17px] leading-[1.5] text-ink-900">
                  A refusal needs a reason. The next draft is written against it.
                </p>
              )}

              {detail.status === 'draft' && (
                <>
                  <p className="mt-1.5 text-[17px] leading-[1.5] text-ink-700">
                    Drafted, and not yet up for review.
                  </p>
                  <form action={submitIssueAction} className="mt-2.5">
                    <input type="hidden" name="versionId" value={detail.versionId} />
                    <StampButton tone="quiet">Put it up for review</StampButton>
                  </form>
                </>
              )}

              {detail.status === 'needs_review' && (
                <>
                  <p className="mt-1.5 text-[17px] leading-[1.5] text-ink-700">
                    {detail.publishable
                      ? 'Approve it and it can be printed. Refuse it and it stays on the record with your reason beside it.'
                      : 'The check refused this one, so it cannot be approved. Refuse it, fix what it found, and draft the week again.'}
                  </p>

                  <form action={approveIssueAction} className="mt-3">
                    <input type="hidden" name="versionId" value={detail.versionId} />
                    <label className="block">
                      <span className="font-display text-[12px] text-ink-500 uppercase">
                        A note, if you want one on the record
                      </span>
                      <input
                        type="text"
                        name="note"
                        maxLength={160}
                        className="mt-1 min-h-[44px] w-full border-2 border-ink-900/25 bg-paper-white/60 px-2.5 text-[17px] text-ink-900"
                      />
                    </label>
                    <div className="mt-2">
                      <StampButton tone="go" disabled={!detail.publishable}>
                        Approve
                      </StampButton>
                    </div>
                  </form>

                  <form action={rejectIssueAction} className="mt-4 border-t-2 border-ink-900/20 pt-3">
                    <input type="hidden" name="versionId" value={detail.versionId} />
                    <label className="block">
                      <span className="font-display text-[12px] text-ink-500 uppercase">
                        Why you are refusing it
                      </span>
                      <input
                        type="text"
                        name="note"
                        required
                        maxLength={160}
                        className="mt-1 min-h-[44px] w-full border-2 border-ink-900/25 bg-paper-white/60 px-2.5 text-[17px] text-ink-900"
                      />
                    </label>
                    <div className="mt-2">
                      <StampButton tone="stop">Refuse it</StampButton>
                    </div>
                  </form>
                </>
              )}

              {detail.status === 'approved' && (
                <>
                  <p className="mt-1.5 text-[17px] leading-[1.5] text-ink-700">
                    {hold.held
                      ? 'Approved — but the press is stopped. Release the hold on the desk and it can be printed.'
                      : 'Approved. Printing puts it on the rack, and every manager in the league reads this copy.'}
                  </p>
                  <form action={publishIssueAction} className="mt-2.5">
                    <input type="hidden" name="versionId" value={detail.versionId} />
                    <StampButton tone="go" disabled={hold.held}>
                      Print it
                    </StampButton>
                  </form>

                  <form action={rejectIssueAction} className="mt-4 border-t-2 border-ink-900/20 pt-3">
                    <input type="hidden" name="versionId" value={detail.versionId} />
                    <label className="block">
                      <span className="font-display text-[12px] text-ink-500 uppercase">
                        Changed your mind? Say why
                      </span>
                      <input
                        type="text"
                        name="note"
                        required
                        maxLength={160}
                        className="mt-1 min-h-[44px] w-full border-2 border-ink-900/25 bg-paper-white/60 px-2.5 text-[17px] text-ink-900"
                      />
                    </label>
                    <div className="mt-2">
                      <StampButton tone="stop">Pull it back</StampButton>
                    </div>
                  </form>
                </>
              )}

              {detail.status === 'published' && (
                <p className="mt-1.5 text-[17px] leading-[1.5] text-ink-700">
                  On the rack. It cannot be edited — a correction is a new draft of the same week,
                  and printing it leaves this copy on the record marked as replaced.
                </p>
              )}

              {detail.status === 'rejected' && (
                <>
                  <p className="mt-1.5 text-[17px] leading-[1.5] text-ink-700">
                    Refused, and it stays refused. Drafting the week again writes a new copy beside
                    this one rather than overwriting it.
                  </p>
                  <form action={draftIssueAction} className="mt-2.5">
                    <input type="hidden" name="season" value={String(detail.season)} />
                    <input type="hidden" name="week" value={String(detail.week)} />
                    <StampButton tone="quiet">Draft this week again</StampButton>
                  </form>
                </>
              )}

              {detail.status === 'superseded' && (
                <p className="mt-1.5 text-[17px] leading-[1.5] text-ink-700">
                  This copy was on the rack and a correction replaced it. It is kept because the
                  league read it.
                </p>
              )}
            </DeskPanel>
          </div>

          <div className="mt-5">
            <DeskPanel>
              <HistoryPanel history={detail.history} />

              {detail.siblings.length > 1 && (
                <>
                  <div className="mt-4">
                    <Rule />
                  </div>
                  <SectionLabel>Other drafts of this week</SectionLabel>
                  <ul className="mt-1.5 space-y-1">
                    {detail.siblings
                      .filter((sibling) => sibling.versionId !== detail.versionId)
                      .map((sibling) => (
                        <li key={sibling.versionId}>
                          <Link
                            href={`/admin/slice/${sibling.versionId}`}
                            className="text-[17px] leading-[1.45] text-ink-900 underline decoration-ink-900/40 underline-offset-4"
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

          <div className="mt-5">
            <Link
              href="/admin/slice"
              className="pixel-edge flex min-h-[48px] w-full items-center justify-center border-2 border-wood-dark bg-[#1c1113] font-display text-[12px] leading-[1.5] text-paper-mid uppercase active:translate-y-px"
            >
              &larr;&nbsp;&nbsp;The press desk
            </Link>
          </div>
        </main>
      </Page>
    </>
  );
}
