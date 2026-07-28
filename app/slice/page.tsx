import { AssetView } from '@/lib/assets/placeholder';
import { resolveAsset } from '@/lib/assets/registry';
import { BottomNav, ClosedDoor, Page, Zone } from '@/components/shell';
import { requireUser } from '@/lib/auth/current-user';
import { seasonClock } from '@/lib/parlor/season';

/**
 * The newspaper rack, before there is a paper.
 *
 * The Slice is V3 (`17 §4`). This page exists so the nav item leads somewhere:
 * a nav entry that does nothing when tapped is indistinguishable from a broken
 * one, and `05 §8.5` wants empty states in the shop's voice rather than blank.
 */

export const dynamic = 'force-dynamic';

export default async function SlicePage() {
  await requireUser();
  const clock = seasonClock();

  return (
    <>
      <Page>
        <header className="px-4 pt-5 pb-3">
          <h1 className="text-2xl leading-tight font-bold text-paper-white">
            Tony&rsquo;s Tuesday Slice
          </h1>
          <p className="mt-1 font-mono text-[11px] tracking-[0.2em] text-amber-mid uppercase">
            Fresh out of the oven — eventually
          </p>
        </header>

        <div className="grid gap-4 px-4">
          <Zone title="Newspaper rack" aside="empty">
            <AssetView resolution={resolveAsset('zone_newspaper_rack')} className="min-h-24" />
          </Zone>

          <ClosedDoor
            what="No issues yet"
            note={
              clock.daysUntilKickoff === null
                ? 'The first issue prints the Tuesday after week one.'
                : `Nothing has happened to write about since December. First issue prints the Tuesday after week one — ${String(clock.daysUntilKickoff)} days out.`
            }
          />
        </div>
      </Page>

      <BottomNav current="/slice" />
    </>
  );
}
