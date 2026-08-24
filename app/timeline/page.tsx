import Link from 'next/link';

import { PixelPanel, ReturnPlate, SignPlate } from '@/components/scene/panel';
import { RoomBehind } from '@/components/scene/room-behind';
import { SeasonRecord } from '@/components/league/season-record';
import { Page } from '@/components/shell';
import { TYPE } from '@/lib/design/type';
import { requireUser } from '@/lib/auth/current-user';
import { getDb } from '@/lib/db';
import { timeline } from '@/lib/league/timeline';

/**
 * Champions & history.
 *
 * Where a banner's **View season** lands, and the reason the champion's name is
 * not painted on the fabric: a pennant is 18 × 15 logical units, and a name
 * baked into art would have to be regenerated every January and could never be
 * corrected afterwards. The wall carries the year; this carries the record.
 *
 * ## It used to carry only the year
 *
 * V1 shipped this as three panels holding a four-digit heading and a champion's
 * name, with a note calling it *"deliberately thin"* and pointing at the
 * deferred Season Story. That was the right call when nothing else was
 * derivable. It is not any more: `lib/stats` has produced verified, ranked,
 * suppression-aware facts since Stats Intelligence landed, and the page was
 * showing none of them — a history page that knew the league's biggest win and
 * its closest finish and printed neither.
 *
 * So each season now carries its champion **and** its two headline games, and
 * says how many more are on record rather than implying there were two.
 *
 * ## Newest first, and the anchor still works
 *
 * `lib/league/timeline.ts` returns oldest-first because that is the order the
 * seasons happened in; the wall reverses it because a manager arriving here
 * wants this year. The `id` is the four-digit year either way, so
 * `/timeline#2025` from a banner lands on that season.
 */

export const dynamic = 'force-dynamic';

export default async function TimelinePage() {
  await requireUser();
  const seasons = await timeline(getDb());

  return (
    <>
      <RoomBehind />

      <Page>
        <div className="mx-auto w-full max-w-[420px] px-4 pt-6 pb-10">
          {/*
            * "and", not "&".
            *
            * Silkscreen's ampersand is a vertical bar through a rounded bowl and
            * at this size it reads as a dollar sign — the sign said
            * "CHAMPIONS $ HISTORY" in every capture. A pixel display face has
            * the glyphs it has; the fix is the word.
            */}
          <SignPlate>Champions and history</SignPlate>

          <Link
            href="/fraud-check"
            className={`mt-4 inline-flex min-h-[44px] items-center border-2 border-paper-dark bg-paper-mid px-3 ${TYPE.eyebrow} text-ink-900 shadow-[2px_2px_0_rgba(0,0,0,0.4)] active:translate-y-px`}
          >
            Open Tony&rsquo;s Fraud Check &rarr;
          </Link>

          <div className="mt-6 space-y-4">
            {seasons.length === 0 ? (
              <p className={`${TYPE.body} text-paper-mid/75`}>No seasons on record yet.</p>
            ) : (
              [...seasons].reverse().map((season) => (
                <PixelPanel key={season.year} className="px-4 py-4">
                  <SeasonRecord season={season} />
                </PixelPanel>
              ))
            )}
          </div>

          <div className="mt-8">
            <ReturnPlate />
          </div>
        </div>
      </Page>
    </>
  );
}
