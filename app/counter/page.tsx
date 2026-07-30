import { PanelHeading, PixelPanel, ReturnPlate, SignPlate } from '@/components/scene/panel';
import { RoomBehind } from '@/components/scene/room-behind';
import { Page } from '@/components/shell';
import { requireUser } from '@/lib/auth/current-user';

/**
 * Tony's Counter.
 *
 * **`/counter`, not `/shop`** — the product takes no money, and "the counter"
 * is what Tony calls it. `/counter/collection` and `/counter/showcase` sit
 * beneath this when they ship.
 *
 * ## Why this page is nearly empty, on purpose
 *
 * The economy is **simulation-gated**: box frequencies, token prices and reward
 * tables are Phase 3 outputs, and nothing here locks a value before the
 * multi-season simulation has run. So the counter exists — the tray on the
 * homepage has to lead somewhere real — and it says what is true rather than
 * showing a mock shop with invented prices.
 *
 * One thing worth stating here because it is easy to get backwards later:
 * **an owned box opens at the tray, in place.** This route is for browsing.
 * Routing here first would insert a navigation step into the most exciting
 * moment in the product.
 */

export const dynamic = 'force-dynamic';

export default async function CounterPage() {
  await requireUser();

  return (
    <>
      <RoomBehind />

      <Page>
        <div className="mx-auto w-full max-w-[420px] px-4 pt-6 pb-10">
          <SignPlate>Tony&rsquo;s counter</SignPlate>

          <p className="mt-4 text-[17px] leading-[1.5] text-paper-mid/80">
            The tray is empty and the case behind it is dark. Tony has not put anything out yet.
          </p>

          <div className="mt-6 space-y-4">
            <PixelPanel className="px-4 py-4">
              <PanelHeading>Nothing on the tray</PanelHeading>
              <p className="mt-1.5 text-[15px] leading-[1.45] text-paper-mid/75">
                Boxes go on sale for tokens once the season starts. Everything rotates Tuesday to
                Tuesday, the same for everybody, and it all comes back around.
              </p>
            </PixelPanel>

            <PixelPanel className="px-4 py-4">
              <PanelHeading>Your collection</PanelHeading>
              <p className="mt-1.5 text-[15px] leading-[1.45] text-paper-mid/75">
                Nothing collected yet. What you pull is yours permanently, across every season.
              </p>
            </PixelPanel>
          </div>

          <div className="mt-8">
            <ReturnPlate />
          </div>
        </div>
      </Page>
    </>
  );
}
