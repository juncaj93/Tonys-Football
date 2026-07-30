import { PanelHeading, PixelPanel, ReturnPlate, SignPlate } from '@/components/scene/panel';
import { RoomBehind } from '@/components/scene/room-behind';
import { Page } from '@/components/shell';
import { requireUser } from '@/lib/auth/current-user';
import { getDb } from '@/lib/db';
import { championBanners } from '@/lib/parlor/champions';

/**
 * Champions & History.
 *
 * Where a banner's **View season** lands, and the reason the champion's name is
 * not painted on the fabric: a pennant is 18 × 15 logical units, and a name
 * baked into art would have to be regenerated every January and could never be
 * corrected afterwards. The wall carries the year; this carries the record.
 *
 * V1 is deliberately thin — the imported 2024 and 2025 seasons and the current
 * one, oldest first, anchored so a banner can link straight to its year. The
 * Season Story that eventually fills this out is deferred (`16 §13`), and
 * shipping a page that says only what is true beats shipping one that pads.
 */

export const dynamic = 'force-dynamic';

export default async function TimelinePage() {
  await requireUser();
  const banners = await championBanners(getDb());

  return (
    <>
      <RoomBehind />

      <Page>
        <div className="mx-auto w-full max-w-[420px] px-4 pt-6 pb-10">
          <SignPlate>Champions &amp; history</SignPlate>

          <div className="mt-6 space-y-4">
            {banners.length === 0 ? (
              <p className="text-[17px] leading-[1.5] text-paper-mid/75">
                No seasons on record yet.
              </p>
            ) : (
              [...banners].reverse().map((banner) => (
                // The anchor is the four-digit year, so `/timeline#2025` from a
                // banner lands on that season rather than at the top.
                <PixelPanel key={banner.year} className="px-4 py-4">
                  <div id={String(banner.year)} className="scroll-mt-4">
                    <PanelHeading>{String(banner.year)}</PanelHeading>

                    {banner.champion === null ? (
                      <>
                        <p className="mt-1.5 font-display text-[15px] text-paper-mid">TBD</p>
                        <p className="mt-1.5 text-[15px] leading-[1.45] text-ink-700">
                          {banner.current
                            ? 'Still being played. Nobody has won it yet.'
                            : 'Not finalized, so there is no champion on record.'}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="mt-1.5 font-display text-[15px] text-paper-mid">
                          {banner.champion}
                        </p>
                        <p className="mt-1.5 font-display text-[9px] text-amber-mid/70 uppercase">
                          Champion
                        </p>
                      </>
                    )}
                  </div>
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
