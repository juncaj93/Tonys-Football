import { draftPreseasonIssueAction, pullDraftAction } from '@/app/actions/preseason';
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
import { BoardRow, ReviewProgressStrip } from '@/components/slice/draft-desk';
import { DeskExit, DeskPanel, StampButton } from '@/components/slice/review';
import { requireAdmin } from '@/lib/auth/current-user';
import { openSeason } from '@/lib/counter/tokens';
import { getDb } from '@/lib/db';
import { TYPE } from '@/lib/design/type';
import { stamp } from '@/lib/design/moment';
import { draftBoard } from '@/lib/slice/preseason-desk';
import { type PreseasonRefusal } from '@/lib/slice/preseason';

/**
 * Tony's draft board — the desk where the preseason issue gets written.
 *
 * ## What this page is for
 *
 * One question, answered above the fold: **how many drafts has Tony read, and
 * whose is next.** Everything else on the page is in service of that or is the
 * button that turns ten finished reviews into a paper.
 *
 * The press desk next door lists *decisions waiting to be made*; this lists
 * *writing waiting to be done*, which is a different job on a different day, so
 * it is a different screen rather than a fourth section of that one.
 *
 * `requireAdmin()` answers with `notFound()`, so a manager probing this URL
 * learns nothing about whether it exists.
 */

export const dynamic = 'force-dynamic';

/** Why the board cannot produce an issue yet, in one sentence each. */
const REFUSALS: Record<PreseasonRefusal, string> = {
  'no-season': 'There is no open season, so there is no draft to review.',
  'season-closed': 'That season is finalized. A closed season does not get a preview.',
  'no-draft': 'Sleeper has no draft for this league yet. Pull it once the league has drafted.',
  'draft-incomplete': 'Sleeper says the draft has not finished. Pull it again when it has.',
  'no-picks': 'The draft is marked finished and Sleeper returned no picks for it.',
  'nobody-publishable': 'Nobody in the league picked in that draft.',
  'season-underway': 'A week has been played, so the weekly paper is the paper now.',
  'reviews-incomplete': 'Tony has not finished reading the boards.',
};

export default async function DraftBoardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const db = getDb();
  const query = await searchParams;

  const live = await openSeason(db);
  const board = live === null ? null : await draftBoard(db, live.year);

  const pulled = typeof query['pulled'] === 'string' ? query['pulled'] : null;
  const drafted = typeof query['drafted'] === 'string' ? query['drafted'] : null;

  return (
    <>
      <RoomBehind />

      <Page>
        {/*
          * `data-draft-board` proves the desk really rendered.
          *
          * `requireAdmin()` answers `notFound()`, and a 404 photographs cleanly
          * and files under the state's name — the false green the nine `reveal-*`
          * states cost a milestone to. The gate reads this marker, not the pixels.
          */}
        <main
          className="mx-auto w-full max-w-md flex-1 px-4 pt-3 pb-8"
          data-draft-board={board === null ? 'none' : board.eligible ? 'ready' : 'waiting'}
        >
          <DeskPanel>
            <Plaque tone="stop">Staff only</Plaque>
            <div className="mt-3.5">
              <PanelHeading>Tony’s draft board</PanelHeading>
            </div>

            <p className={`mt-2 ${TYPE.body} text-ink-700`}>
              Ten drafts, a grade and a line on each. The paper prints them as Tony’s.
            </p>

            {board === null ? (
              <p className={`mt-4 ${TYPE.body} text-ink-700`}>{REFUSALS['no-season']}</p>
            ) : (
              <>
                <ReviewProgressStrip
                  reviewed={board.progress.reviewed}
                  total={board.progress.total}
                />

                {/*
                  * The draft's own state, which is the thing that blocks
                  * everything else in August. Shown as a fact rather than as an
                  * error — a league that has not drafted is not a fault.
                  */}
                <MetadataStrip className="mt-1.5" data-draft-status={board.draftStatus ?? 'none'}>
                  {board.draftStatus === null
                    ? 'No draft read from Sleeper yet'
                    : board.draftStatus === 'complete'
                      ? `Draft in — ${String(board.picksStored)} picks` +
                        (board.completedAt === null ? '' : ` · ${stamp(board.completedAt)}`)
                      : `Sleeper says: ${board.draftStatus.replace(/_/g, ' ')}`}
                </MetadataStrip>

                {pulled !== null && (
                  <div className="mt-3.5">
                    <WarningBlock
                      tone={/^\d+$/.test(pulled) ? 'go' : 'stop'}
                      title={/^\d+$/.test(pulled) ? 'The draft came in' : 'Nothing came in'}
                    >
                      {/^\d+$/.test(pulled)
                        ? `${pulled} picks are on record. Tony can start reading.`
                        : REFUSALS[pulled as PreseasonRefusal] ??
                          'Sleeper could not be read. Try again in a minute.'}
                    </WarningBlock>
                  </div>
                )}

                {drafted !== null && (
                  <div className="mt-3.5">
                    <WarningBlock tone="stop" title="The issue was not drafted">
                      {REFUSALS[drafted as PreseasonRefusal] ??
                        'That did not produce an issue. Nothing was written.'}
                    </WarningBlock>
                  </div>
                )}

                {/*
                  * The board itself. Every active manager, always — including
                  * the ones Tony has not reached, because the ones he has not
                  * reached are the point of the list.
                  */}
                <section className="mt-6" data-draft-list="">
                  <PrintedRule weight="heavy" />
                  <div className="mt-2">
                    <SectionHeading ink="text-ink-500">The league</SectionHeading>
                  </div>

                  {board.progress.rows.length === 0 ? (
                    <p className={`mt-1.5 ${TYPE.body} text-ink-700`}>
                      Nobody holds a seat this season, so there is nobody to review.
                    </p>
                  ) : (
                    <ul className="mt-2.5 space-y-2">
                      {board.progress.rows.map((row) => (
                        <BoardRow
                          key={row.userId}
                          href={`/admin/slice/draft/${row.userId}`}
                          displayName={row.displayName}
                          grade={row.grade}
                          take={row.take}
                        />
                      ))}
                    </ul>
                  )}
                </section>

                {/*
                  * Two actions, and which one is offered is decided by state
                  * rather than by both being present and one being disabled.
                  *
                  * A disabled button asks the reader to work out why. The
                  * sentence beside each of these says what has to happen next,
                  * which is what a commissioner opening this page in August
                  * actually needs.
                  */}
                <section className="mt-6">
                  <PrintedRule />
                  <div className="mt-2">
                    <SectionHeading ink="text-ink-500">Read the draft from Sleeper</SectionHeading>
                  </div>
                  <p className={`mt-1.5 ${TYPE.body} text-ink-700`}>
                    The same thing the Tuesday job does. Running it twice on a finished draft adds
                    nothing.
                  </p>
                  <form action={pullDraftAction} className="mt-3">
                    <StampButton tone="quiet">Pull the draft</StampButton>
                  </form>
                </section>

                <section className="mt-6">
                  <PrintedRule />
                  <div className="mt-2">
                    <SectionHeading ink="text-ink-500">Print the draft review</SectionHeading>
                  </div>
                  {board.eligible && board.progress.complete ? (
                    <>
                      <p className={`mt-1.5 ${TYPE.body} text-ink-700`}>
                        Every draft has a grade and a take. This puts the issue on the press desk —
                        it still needs stamping before anybody reads it.
                      </p>
                      <form action={draftPreseasonIssueAction} className="mt-3">
                        <StampButton tone="go">Print a draft review</StampButton>
                      </form>
                    </>
                  ) : (
                    <p className={`mt-1.5 ${TYPE.body} text-ink-700`}>
                      {board.eligible
                        ? board.progress.outstanding.length === 0
                          ? REFUSALS['reviews-incomplete']
                          : `Still waiting on Tony for ${board.progress.outstanding.join(', ')}.`
                        : REFUSALS[board.refusal ?? 'no-draft']}
                    </p>
                  )}
                </section>
              </>
            )}
          </DeskPanel>

          <div className="mt-6">
            <DeskExit href="/admin/slice">&larr;&nbsp;&nbsp;The press desk</DeskExit>
          </div>

          <div className="mt-3">
            <ReturnPlate />
          </div>
        </main>
      </Page>
    </>
  );
}
