import { AssetView } from '@/lib/assets/placeholder';
import { resolveAsset } from '@/lib/assets/registry';
import { BottomNav, ClosedDoor, Page, Zone } from '@/components/shell';
import { requireUser } from '@/lib/auth/current-user';

/**
 * The basement door, shut.
 *
 * Basements are v1.1, Phase 6 (`16 §3`), and `16 §7.1` asks for the closed
 * basement door to exist as a wall dressing from the start **so the room feels
 * like an arrival when it opens** rather than a tab that appeared one day.
 */

export const dynamic = 'force-dynamic';

export default async function RoomsPage() {
  await requireUser();

  return (
    <>
      <Page>
        <header className="px-4 pt-5 pb-3">
          <h1 className="text-2xl leading-tight font-bold text-paper-white">Downstairs</h1>
          <p className="mt-1 font-mono text-[11px] tracking-[0.2em] text-amber-mid uppercase">
            Door&rsquo;s shut
          </p>
        </header>

        <div className="grid gap-4 px-4">
          <Zone title="Basement door" aside="closed" tone="dark">
            <AssetView resolution={resolveAsset('dressing_door_basement')} className="min-h-24" />
          </Zone>

          <ClosedDoor
            what="Nothing down there yet"
            note="Every manager gets a room eventually — shelves, a wall, whatever they have collected. Tony is still moving boxes."
          />
        </div>
      </Page>

      <BottomNav current="/rooms" />
    </>
  );
}
