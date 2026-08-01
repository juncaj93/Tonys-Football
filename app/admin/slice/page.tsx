import Link from 'next/link';

import { draftIssueAction, holdPublicationAction } from '@/app/actions/slice';
import { PanelHeading, ReturnPlate, SignPlate } from '@/components/scene/panel';
import { RoomBehind } from '@/components/scene/room-behind';
import { Page } from '@/components/shell';
import {
  DeskPanel,
  QueueRow,
  QueueSection,
  Rule,
  SectionLabel,
  StampButton,
} from '@/components/slice/review';
import { requireAdmin } from '@/lib/auth/current-user';
import { getDb } from '@/lib/db';
import { openSeason } from '@/lib/counter/tokens';
import {
  approvedQueue,
  publicationHold,
  publishedIssues,
  rejectedVersions,
  emptyDeskPreview,
  reviewQueue,
  suggestedDraftWeek,
} from '@/lib/slice/publication';

/**
 * The desk out the back, where the paper gets read before it gets printed.
 *
 * ## Why this route exists
 *
 * `16 §4.3`'s Tuesday chain ends **`draft Slice → notify commissioner`** and
 * `16 §9` makes approval mandatory in season one. Until this screen existed the
 * notification had nowhere to land, which is the whole reason the Tuesday job
 * stayed off: a cron whose last step has no destination either publishes an issue
 * nobody approved or loses the draft.
 *
 * ## What the queue is, and what it deliberately is not
 *
 * It is **a list of decisions waiting to be made**. Published issues are on the
 * same screen but under their own rule, below the decisions, because history is
 * not a task. The refused ones are shown too — a rejection is a decision that was
 * made, and hiding it would make the same draft look like it had simply vanished.
 *
 * `requireAdmin()` answers with `notFound()`, so a manager probing this URL
 * learns nothing about whether it exists.
 */

export const dynamic = 'force-dynamic';

export default async function SliceReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const db = getDb();
  const query = await searchParams;

  /*
   * The empty desk, as a rendering — `?desk=empty`.
   *
   * Resolved on the **server** behind the demo guard, and it is the only
   * press-desk state that cannot be produced by driving the chain: an issue
   * belongs to the league rather than to a seat, so once any other press-desk
   * demo has drafted something the desk is not empty for anybody. The reasoning
   * is in `lib/slice/publication.ts`.
   */
  const emptyDesk = emptyDeskPreview(query['desk'], process.env);

  const [waiting, approved, published, refused, hold, live] = emptyDesk
    ? [[], [], [], [], { held: false, reason: null, actorName: null, since: null }, await openSeason(db)]
    : await Promise.all([
        reviewQueue(db),
        approvedQueue(db),
        publishedIssues(db),
        rejectedVersions(db),
        publicationHold(db),
        openSeason(db),
      ]);

  const drafted = typeof query['drafted'] === 'string' ? query['drafted'] : null;

  /*
   * The week the draft field offers.
   *
   * The most recent week the open season has results for — the week `16 §4.3`'s
   * Tuesday job would be drafting. A default, not a constraint: the field is
   * editable, and `generateDraft` refuses a week with nothing in it on its own
   * terms rather than trusting this number.
   */
  const week = live === null ? 1 : await suggestedDraftWeek(db, live.year);

  const docket = [
    { key: 'waiting', n: waiting.length, word: 'waiting on you' },
    { key: 'approved', n: approved.length, word: 'approved' },
    { key: 'published', n: published.length, word: 'on the rack' },
  ]
    .filter((part) => part.n > 0)
    .map((part) => ({ key: part.key, label: `${String(part.n)} ${part.word}` }));

  return (
    <>
      <RoomBehind />

      <Page>
        {/*
          * The markers the visual driver checks.
          *
          * `data-review-queue` proves the desk actually rendered — `requireAdmin()`
          * answers `notFound()`, so a seat without the commissioner's keys renders
          * a 404 that photographs cleanly and would file under the state's name.
          * `data-review-hold` and the per-section counts are how a gate tells
          * "the press is stopped" from "the press is running" in a picture that
          * looks the same either way at thumbnail size.
          */}
        <main
          className="mx-auto w-full max-w-md flex-1 px-4 pt-3 pb-8"
          data-review-queue={emptyDesk ? 'empty' : 'live'}
          data-review-hold={hold.held ? 'on' : 'off'}
        >
          <DeskPanel>
            <SignPlate tone="red">Staff only</SignPlate>
            <div className="mt-3">
              <PanelHeading>The press desk</PanelHeading>
            </div>

            <p className="mt-2 text-[17px] leading-[1.5] text-ink-700">
              Nothing reaches the rack until you stamp it.
            </p>

            {/*
              * The docket — how much work there is, before any of it.
              *
              * One line, and it earns its place twice. A commissioner opening this
              * page is asking *"is there anything for me"*, and the answer was
              * three scrolls down under three headings. And the screenshots proved
              * it: `review-waiting`, `review-approved` and `review-published`
              * photographed **byte-identically**, because the sections that told
              * them apart were all below the fold.
              *
              * Counts rather than prose because it is a docket on a desk, not a
              * sentence Tony says — and the parts that are zero are simply absent,
              * so an empty desk shows nothing rather than three noughts.
              */}
            {docket.length > 0 && (
              <p
                className="mt-2 font-display text-[13px] leading-[1.5] tracking-[0.06em] text-ink-900 uppercase tabular-nums"
                data-review-docket={docket.map((part) => part.key).join(',')}
              >
                {docket.map((part) => part.label).join(' · ')}
              </p>
            )}

            {drafted === 'refused' && (
              <p className="mt-3 border-l-[3px] border-red-dark pl-3 text-[17px] leading-[1.5] text-ink-700">
                There was nothing to draft. That week holds no result that may be printed yet —
                the books are still open, or every game in it names somebody who is no longer in
                the league.
              </p>
            )}

            {/*
              * The hold, when it is on — a **state**, at the top, where a state
              * belongs.
              *
              * Its switch is at the foot of the page and this is not that. The
              * first version put the whole control here, and the screenshots
              * settled it: a text field and a red STOP THE PRESS filled the entire
              * first screen, so *"what is waiting on you"* — the only reason to
              * open this page — started below the fold, and three different desk
              * states photographed **byte-identically**. An emergency control is
              * not the primary action; the queue is.
              */}
            {hold.held && (
              <div className="mt-4 border-l-[3px] border-red-dark pl-3">
                <p className="font-display text-[13px] leading-[1.5] text-red-dark uppercase">
                  The press is stopped
                </p>
                <p className="mt-1 text-[17px] leading-[1.5] text-ink-900">
                  {hold.actorName === null
                    ? 'Nothing can be printed until it is released.'
                    : `${hold.actorName} stopped it.`}
                  {hold.reason === null ? '' : ` “${hold.reason}”`}
                </p>
                <form action={holdPublicationAction} className="mt-2.5">
                  <input type="hidden" name="held" value="0" />
                  <StampButton tone="go">Let the press run</StampButton>
                </form>
              </div>
            )}

            <QueueSection
              slug="waiting"
              title="Waiting on you"
              count={waiting.length}
              empty="Nothing to read. When the Tuesday job drafts an issue it lands here."
            >
              {waiting.map((issue) => (
                <QueueRow
                  key={issue.versionId}
                  href={`/admin/slice/${issue.versionId}`}
                  headline={issue.headline}
                  season={issue.season}
                  week={issue.week}
                  version={issue.version}
                  status={issue.status}
                  publishable={issue.publishable}
                />
              ))}
            </QueueSection>

            <QueueSection
              slug="approved"
              title="Approved, not yet printed"
              count={approved.length}
              empty="Nothing stamped and waiting."
            >
              {approved.map((issue) => (
                <QueueRow
                  key={issue.versionId}
                  href={`/admin/slice/${issue.versionId}`}
                  headline={issue.headline}
                  season={issue.season}
                  week={issue.week}
                  version={issue.version}
                  status={issue.status}
                  publishable={issue.publishable}
                />
              ))}
            </QueueSection>

            <QueueSection
              slug="published"
              title="On the rack"
              count={published.length}
              empty="Nothing has been published yet. Until something is, the rack carries last season’s paper."
            >
              {published.map((issue) => (
                <QueueRow
                  key={issue.versionId}
                  href={`/admin/slice/${issue.versionId}`}
                  headline={issue.headline}
                  season={issue.season}
                  week={issue.week}
                  version={issue.version}
                  status={issue.status}
                  publishable={issue.publishable}
                />
              ))}
            </QueueSection>

            {refused.length > 0 && (
              <QueueSection slug="refused" title="Refused" count={refused.length} empty="">
                {refused.map((issue) => (
                  <QueueRow
                    key={issue.versionId}
                    href={`/admin/slice/${issue.versionId}`}
                    headline={issue.headline}
                    season={issue.season}
                    week={issue.week}
                    version={issue.version}
                    status={issue.status}
                    publishable={issue.publishable}
                  />
                ))}
              </QueueSection>
            )}

            <div className="mt-5">
              <Rule />
              <SectionLabel>Draft a week by hand</SectionLabel>
              <p className="mt-1.5 text-[17px] leading-[1.5] text-ink-700">
                The same thing the Tuesday job does. Running it twice on an unchanged week adds
                nothing — the second draft is the first one, read back.
              </p>

              {live === null ? (
                <p className="mt-2 text-[17px] leading-[1.5] text-ink-700">
                  There is no open season, so there is no week to draft.
                </p>
              ) : (
                <form action={draftIssueAction} className="mt-2.5">
                  <input type="hidden" name="season" value={String(live.year)} />
                  <label className="block">
                    <span className="font-display text-[12px] text-ink-500 uppercase">
                      Season {live.year}, week
                    </span>
                    <input
                      type="number"
                      name="week"
                      min={1}
                      max={18}
                      defaultValue={String(week ?? 1)}
                      className="mt-1 min-h-[44px] w-full border-2 border-ink-900/25 bg-paper-white/60 px-2.5 text-[18px] text-ink-900 tabular-nums"
                    />
                  </label>
                  <div className="mt-2">
                    <StampButton tone="quiet">Print a draft</StampButton>
                  </div>
                </form>
              )}
            </div>

            {/*
              * The hold's switch, at the foot.
              *
              * `16 §9` makes it permanent, and permanent is not the same as
              * prominent: it is the control you reach for once a season, when a
              * scoring correction is still landing. Shown only while the press is
              * running — when it is stopped, the banner at the top carries both
              * the state and the way out of it, because that is the moment you
              * want it under your thumb.
              */}
            {!hold.held && (
              <div className="mt-5">
                <Rule />
                <SectionLabel>Stop the press</SectionLabel>
                <p className="mt-1.5 text-[17px] leading-[1.5] text-ink-700">
                  Nothing can be printed while it is stopped, whoever asks and however it is
                  asked.
                </p>
                <form action={holdPublicationAction} className="mt-2.5">
                  <input type="hidden" name="held" value="1" />
                  <label className="block">
                    <span className="font-display text-[12px] text-ink-500 uppercase">Why</span>
                    <input
                      type="text"
                      name="reason"
                      maxLength={120}
                      className="mt-1 min-h-[44px] w-full border-2 border-ink-900/25 bg-paper-white/60 px-2.5 text-[17px] text-ink-900"
                    />
                  </label>
                  <div className="mt-2">
                    <StampButton tone="stop">Stop the press</StampButton>
                  </div>
                </form>
              </div>
            )}
          </DeskPanel>

          <div className="mt-5">
            <Link
              href="/admin"
              className="pixel-edge flex min-h-[48px] w-full items-center justify-center border-2 border-wood-dark bg-[#1c1113] font-display text-[12px] leading-[1.5] text-paper-mid uppercase active:translate-y-px"
            >
              &larr;&nbsp;&nbsp;The office
            </Link>
          </div>

          <div className="mt-3">
            <ReturnPlate />
          </div>
        </main>
      </Page>
    </>
  );
}
