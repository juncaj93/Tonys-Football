import { AssetView } from '@/lib/assets/placeholder';
import { resolveAsset } from '@/lib/assets/registry';
import { BottomNav, ClosedDoor, Page, Zone } from '@/components/shell';
import { requireUser } from '@/lib/auth/current-user';

/**
 * The display case, before there is anything in it.
 *
 * Collectibles, tokens, and the loot box are V4 (`17 §4`). Nothing here hints
 * at a number or a balance: `16 §8` keeps every economy figure simulation-gated,
 * and a "0 tokens" counter would be a number the product has not earned.
 */

export const dynamic = 'force-dynamic';

export default async function CollectionPage() {
  await requireUser();

  return (
    <>
      <Page>
        <header className="px-4 pt-5 pb-3">
          <h1 className="text-2xl leading-tight font-bold text-paper-white">The case</h1>
          <p className="mt-1 font-mono text-[11px] tracking-[0.2em] text-amber-mid uppercase">
            Nothing on the shelves
          </p>
        </header>

        <div className="grid gap-4 px-4">
          <Zone title="Display case" aside="empty">
            <AssetView resolution={resolveAsset('zone_display_case')} className="min-h-24" />
          </Zone>

          <ClosedDoor
            what="The case is empty"
            note="Tony has not put anything in it yet. Collectibles, rings and the tokens to buy a box with all arrive together, once there is a season to earn them in."
          />
        </div>
      </Page>

      <BottomNav current="/collection" />
    </>
  );
}
