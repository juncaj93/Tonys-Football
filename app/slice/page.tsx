import { PanelHeading, PixelPanel, ReturnPlate } from '@/components/scene/panel';
import { RoomBehind } from '@/components/scene/room-behind';
import { Page } from '@/components/shell';
import { Newspaper } from '@/components/slice/newspaper';
import { requireUser } from '@/lib/auth/current-user';
import { getDb } from '@/lib/db';
import { seasonClock } from '@/lib/parlor/season';
import { latestEdition } from '@/lib/slice/edition';
import { previewEdition, type PreviewEdition } from '@/lib/slice/editions';
import { type Edition } from '@/lib/slice/render';

/**
 * The rack by the door.
 *
 * ## What is on it today, and why that is not a placeholder
 *
 * The 2026 season has not started, so there is no *current* issue. But two
 * seasons are imported, finalized and complete, and `16 §9`'s pipeline runs on
 * them exactly as it will run on a live week:
 *
 * ```
 * lib/stats → fact packet → deterministic renderer → deterministic validation
 * ```
 *
 * So the rack carries the **last issue Tony actually printed** — a real week, a
 * real lead story, real scores, rendered by the renderer that will render week
 * one and checked by the validator that will check it. Nothing here is mocked.
 *
 * That is also the honest offseason state. `CLAUDE.md`: the site launches into a
 * deliberate offseason built on imported history, and a rack holding the last
 * paper is what a shop looks like in July.
 *
 * ## An unpublishable issue is not rendered
 *
 * `latestEdition` returns null when the validator refuses, and this page then
 * says the rack is empty. Printing something the validator rejected because it
 * was the only thing available is the exact failure the validator exists to
 * prevent, and it would land on the one surface nobody thinks to check.
 *
 * ## The page holds no opinions
 *
 * Every string below that is not furniture came out of a validated `Edition`.
 * The page does not format a score, subtract a margin or decide what a result
 * meant — `MANDATE §9`. The one thing it decides is *how the rack looks when
 * there is no paper on it*, which is a fact about the shop rather than about
 * football.
 */

export const dynamic = 'force-dynamic';

export default async function SlicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();
  const clock = seasonClock();

  /*
   * A named demo edition, resolved on the **server**.
   *
   * The same shape as `?preview_reveal=` (`lib/demo/preview.ts`) and for the same
   * reason: a demo state that the browser could fabricate would be a demo of the
   * browser. `previewEdition` refuses outright in production and returns null
   * without `DEMO_FIXTURES`, so an ordinary request never reaches it.
   */
  const requested = (await searchParams)['edition'];
  const preview = await previewEdition(getDb(), requested, process.env);

  const state = preview ?? ({
    mode: 'rack',
    rack: 'offseason',
    issue: await latestEdition(getDb()),
  } satisfies PreviewEdition);

  const issue: Edition | null = state.mode === 'issue' ? state.issue : state.issue;

  return (
    <>
      <RoomBehind />

      <Page>
        {/*
          * The marker the visual driver checks.
          *
          * Present only when a named edition really resolved on the server. Without
          * `DEMO_FIXTURES` on the *server process* the preview is null, the rack
          * renders as normal, and a driver that only looked at pixels would file the
          * screenshot under the edition's name and pass — which is precisely what the
          * nine reveal states did for two milestones (`docs/CHECKPOINT.md`).
          */}
        <div
          className="mx-auto w-full max-w-[440px] px-3 pt-4 pb-10"
          data-slice-edition={preview === null ? undefined : String(requested)}
        >
          {issue === null ? (
            <EmptyRack
              preseason={state.mode === 'rack' && state.rack === 'preseason'}
              daysUntilKickoff={clock.daysUntilKickoff}
            />
          ) : (
            /*
              * The paper on the rack today is last season's, and the sheet says
              * so **on itself**.
              *
              * The note used to sit above the masthead, on the room — a caveat in
              * front of the nameplate. Passed in as a stamp it prints inside the
              * paper, under the rules, where a stamp goes. Only in the offseason:
              * a live issue is the current one and labelling it would be wrong.
              */
            <Newspaper
              issue={issue}
              stamp={state.mode === 'rack' ? 'Last one Tony printed' : null}
            />
          )}

          <div className="mt-7">
            <ReturnPlate />
          </div>
        </div>
      </Page>
    </>
  );
}

/**
 * Nothing on the rack.
 *
 * Two shelves and a note, in the shop's voice (`05 §8.5`). It says *when* the
 * first issue arrives rather than apologising, because a countdown is information
 * and an apology is not.
 */
function EmptyRack({
  preseason,
  daysUntilKickoff,
}: {
  preseason: boolean;
  daysUntilKickoff: number | null;
}) {
  return (
    <PixelPanel tone="paper" className="px-4 pt-4 pb-4">
      <div aria-hidden="true" className="h-[3px] bg-red-dark" />
      <h1 className="mt-2 text-center font-display text-[22px] leading-[1.05] text-red-dark uppercase">
        Tony&rsquo;s Tuesday Slice
      </h1>
      <div aria-hidden="true" className="mt-2 h-[3px] bg-red-dark" />

      <div className="mt-4">
        <PanelHeading>Nothing on the rack</PanelHeading>
      </div>

      <p className="mt-2 text-[18px] leading-[1.5] text-ink-700">
        Three shelves, all of them empty, and a price card nobody has updated since the shop
        opened.
      </p>

      <p className="mt-3 border-t-2 border-ink-900/20 pt-2.5 text-[17px] leading-[1.5] text-ink-700">
        {preseason || daysUntilKickoff === null
          ? 'The first issue prints the Tuesday after week one.'
          : `The first issue goes on the rack the Tuesday after week one — ${String(daysUntilKickoff)} days out.`}
      </p>
    </PixelPanel>
  );
}
