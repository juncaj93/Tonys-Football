import Link from 'next/link';
import { notFound } from 'next/navigation';

import { approveAndPublishAction } from '@/app/actions/publication';
import {
  approveIssueAction,
  draftIssueAction,
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
import { INK, TYPE } from '@/lib/design/type';
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
  /*
   * What the stamp actually did, when it did not print.
   *
   * Both come back on the URL rather than in a session flash, because the state
   * they describe is already visible on the page beneath them — the stamp is a
   * caption on a screen that has re-rendered from the database, not the only
   * record of what happened. A refusal that arrived and then vanished on refresh
   * would leave a commissioner looking at an unchanged screen with no reason.
   */
  const refused = typeof query['refused'] === 'string' ? query['refused'] : null;
  const heldBack = typeof query['held'] === 'string' ? query['held'] : null;

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
            {/*
              * `Staff only` is wood, not red.
              *
              * Moving it after the stamp fixed the reading *order* and left the
              * loudness backwards: a red plaque beside a cream one is still the
              * first thing the eye lands on, so on an approved draft the loudest
              * object on the screen was a permanent fact about the door.
              *
              * Red on this surface means **refused** — `StatusStamp` spends it on
              * exactly one state and `WarningGlyph` on one more. A door sign is
              * a fixture, and the wood tone is what the fixtures in this room are
              * made of (`docs/TEXT_REPORT_AUDIT.md §4`).
              */}
            <div className="flex flex-wrap items-center gap-2">
              <StatusStamp status={detail.status} />
              <Plaque tone="wood">Staff only</Plaque>
            </div>

            <div className="mt-3.5">
              <PanelHeading>
                Season {detail.season} &middot; Week {detail.week}
              </PanelHeading>
            </div>

            {/*
              * What the issue actually says, at the top.
              *
              * The screen went from identity straight to the verdict, so *"what
              * is this issue about"* — the question a reviewer is here to answer
              * — could only be answered by scrolling past the findings to the
              * preview. A proof sheet names the story on it.
              *
              * `headlineQuiet` rather than a loud role: it is the subject of the
              * page, not its status, and the stamp above must stay the first
              * thing read. It is the same string the paper prints, taken from the
              * edition already on `detail` — nothing is derived here.
              */}
            <h2 className={`mt-2 ${TYPE.headlineQuiet} ${INK.paper.strong}`}>
              {detail.edition.headline}
            </h2>

            {/*
              * The draft's identity, on two lines rather than one.
              *
              * It was one 12px run of `Draft 1 · set by the template press ·
              * 8f3c2b…` — a version number, a renderer and a sixteen-character
              * digest reading as one string, and at 360 it wrapped mid-hash. The
              * digest is the thing an approval is *against*, so it gets its own
              * line in the machine role, which breaks anywhere by design.
              */}
            {/*
              * `set by the` is gone, and it is a wrap fix rather than an edit for
              * its own sake: at 390 the longer phrase put `PRESS` alone on a
              * second line, which reads as a mistake rather than as a sentence.
              * The typographic sense of "set" was nice and it was costing a line
              * on every draft.
              */}
            <MetadataStrip className="mt-1.5">
              Draft {detail.version} &middot; {detail.renderer} press
            </MetadataStrip>
            {/*
              * The digest recedes.
              *
              * It sat at the same weight as the draft line above it, so the least
              * important thing in the block — a sixteen-character hash nobody
              * reads unless they are comparing two of them — had equal billing
              * with the sentence that says which draft this is. Quiet ink, same
              * role: it is still selectable, still complete, and no longer
              * competing.
              */}
            <MetadataStrip className="mt-1" role="machine" ink={INK.paper.quiet}>
              {detail.contentHash}
            </MetadataStrip>

            {published && (
              <div className="mt-4">
                <WarningBlock tone="go" title="Printed">
                  It is on the rack now, and this is the copy every manager reads.
                </WarningBlock>
              </div>
            )}

            {heldBack !== null && (
              <div className="mt-4">
                <WarningBlock tone="stop" title="Approved, not printed">
                  Your stamp is on the record — {heldBack}. Release the hold on the desk and stamp
                  it again to print it.
                </WarningBlock>
              </div>
            )}

            {refused !== null && (
              <div className="mt-4">
                <WarningBlock tone="stop" title="Nothing was stamped">
                  {refused}
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
                      {hold.held
                        ? 'The press is stopped, so stamping it will approve it and leave it waiting. Refuse it and it stays on the record with your reason beside it.'
                        : 'Stamping it prints it — every manager in the league reads this copy. Refuse it and it stays on the record with your reason beside it.'}
                    </p>
                  ) : (
                    <div className="mt-2.5">
                      <WarningBlock tone="stop" title="Approving is not available">
                        The check refused this copy, so the stamp is locked. Refuse it, fix what the
                        findings name, and draft the week again.
                      </WarningBlock>
                    </div>
                  )}

                  {/*
                    * One stamp, not two.
                    *
                    * `16 §9` requires a person to approve; nothing in it requires
                    * a second gesture between approving and printing, and this is
                    * a ten-person private league where every extra tap is a tap
                    * on which the paper is approved and not on the rack. The
                    * **backend** keeps the two apart — `lib/publication/queue.ts`
                    * says why, and the manual hold is the reason — so what the
                    * hold produces here is a stamp that approves and stops, with
                    * the item then sitting in the queue saying so.
                    *
                    * The digest travels with the decision. What the server refuses
                    * to print is anything other than the bytes rendered above it.
                    */}
                  <form action={approveAndPublishAction} className="mt-4">
                    <input type="hidden" name="kind" value="slice" />
                    <input type="hidden" name="id" value={detail.versionId} />
                    <input type="hidden" name="digest" value={detail.contentHash} />
                    <div className="mt-2.5">
                      <StampButton tone="go" disabled={!detail.publishable}>
                        {hold.held ? 'Approve — the press is stopped' : 'Approve & print'}
                      </StampButton>
                    </div>
                  </form>

                  {/*
                    * Approving *without* printing, for a commissioner who wants
                    * the note on the record or wants to stamp now and print
                    * later while the press runs. Kept because the two operations
                    * are genuinely separate underneath and one of them takes a
                    * note; not promoted, because it is the rarer intent.
                    */}
                  <form action={approveIssueAction} className="mt-3">
                    <input type="hidden" name="versionId" value={detail.versionId} />
                    <DeskField label="Or approve it with a note, and print it after" name="note" />
                    <div className="mt-2.5">
                      <StampButton tone="quiet" disabled={!detail.publishable}>
                        Approve only
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
                  {/*
                    * The same composite, arriving at its second half.
                    *
                    * `decide` sees an already-approved version and skips straight
                    * to the press, so this is one operation reached twice rather
                    * than a second code path — which is what makes an interrupted
                    * Approve & print finish by being tapped again, and what puts
                    * the digest check on the printing step as well as on the
                    * approving one.
                    */}
                  <form action={approveAndPublishAction} className="mt-3">
                    <input type="hidden" name="kind" value="slice" />
                    <input type="hidden" name="id" value={detail.versionId} />
                    <input type="hidden" name="digest" value={detail.contentHash} />
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
