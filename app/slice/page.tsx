import { PanelHeading, PixelPanel, ReturnPlate, SignPlate } from '@/components/scene/panel';
import { RoomBehind } from '@/components/scene/room-behind';
import { Page } from '@/components/shell';
import { requireUser } from '@/lib/auth/current-user';
import { getDb } from '@/lib/db';
import { seasonClock } from '@/lib/parlor/season';
import { latestEdition } from '@/lib/slice/edition';

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
 */

export const dynamic = 'force-dynamic';

export default async function SlicePage() {
  await requireUser();
  const clock = seasonClock();
  const issue = await latestEdition(getDb());

  return (
    <>
      <RoomBehind />

      <Page>
        <div className="mx-auto w-full max-w-[420px] px-4 pt-6 pb-10">
          <SignPlate tone="red">Tony&rsquo;s Tuesday Slice</SignPlate>

          {issue === null ? (
            <>
              <p className="mt-4 text-[17px] leading-[1.5] text-paper-mid/85">
                Three shelves, all of them empty, and a price card nobody has updated since the
                shop opened.
              </p>
              <div className="mt-6">
                <PixelPanel className="px-4 py-4">
                  <PanelHeading>Nothing on the rack</PanelHeading>
                  <p className="mt-1.5 text-[17px] leading-[1.5] text-ink-700">
                    {clock.daysUntilKickoff === null
                      ? 'The first issue prints the Tuesday after week one.'
                      : `The first issue goes on the rack the Tuesday after week one — ${String(clock.daysUntilKickoff)} days out.`}
                  </p>
                </PixelPanel>
              </div>
            </>
          ) : (
            <>
              {/*
                * The masthead line. It names the season as well as the week,
                * because a paper about 2025 sitting on the rack in July 2026 has
                * to be unambiguous about which one it is — the same reason every
                * Group A greeting names its year.
                */}
              <p className="mt-4 font-display text-[11px] leading-[1.5] tracking-[0.12em] text-paper-mid/75 uppercase">
                {String(issue.season)} &middot; Week {String(issue.week)} &middot; Last printed
              </p>

              <div className="mt-3">
                <PixelPanel className="px-4 pt-4 pb-4">
                  {/*
                    * The headline, in the paper's display face at the size a
                    * headline is. Sized to the type rather than the type to a
                    * box, so a long one takes a second line.
                    */}
                  <h1 className="font-display text-[19px] leading-[1.3] text-ink-900 uppercase">
                    {issue.headline}
                  </h1>

                  <p className="mt-3 text-[17px] leading-[1.5] text-ink-700">{issue.lead}</p>

                  {issue.alsoRan.length > 0 && (
                    <>
                      {/*
                        * The rest of the week, under a printed rule. Flat lines,
                        * no adjectives — the lead has those, and a page where
                        * every result is dramatic has no lead at all.
                        */}
                      <p className="mt-4 border-t-2 border-red-dark/25 pt-2 font-display text-[10px] leading-[1.5] tracking-[0.12em] text-wood-mid uppercase">
                        Also that week
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {issue.alsoRan.map((line) => (
                          <li key={line} className="text-[15px] leading-[1.4] text-ink-700">
                            {line}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </PixelPanel>
              </div>

              {/*
                * How the paper was made, printed on the paper.
                *
                * `MANDATE §9`–`§10` require a fantasy fact to carry its
                * provenance. One line in signage type rather than a disclaimer
                * panel, because it is a fact about the paper and not an apology
                * for it.
                */}
              <p className="mt-3 font-display text-[10px] leading-[1.5] tracking-wide text-paper-mid/70 uppercase">
                Set from the league&rsquo;s own records. Every number checked before it printed.
              </p>
            </>
          )}

          <div className="mt-8">
            <ReturnPlate />
          </div>
        </div>
      </Page>
    </>
  );
}
