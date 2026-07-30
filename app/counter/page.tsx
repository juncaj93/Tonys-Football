import { PanelHeading, PixelPanel, ReturnPlate, SignPlate } from '@/components/scene/panel';
import { RoomBehind } from '@/components/scene/room-behind';
import { Page } from '@/components/shell';
import { requireUser } from '@/lib/auth/current-user';
import { counterState } from '@/lib/counter/boxes';
import { getDb } from '@/lib/db';

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
  const { user } = await requireUser();
  const { unopenedBoxes, collectiblesOwned } = await counterState(getDb(), user.id);

  return (
    <>
      <RoomBehind />

      <Page>
        <div className="mx-auto w-full max-w-[420px] px-4 pt-6 pb-10">
          <SignPlate>Tony&rsquo;s counter</SignPlate>

          <p className="mt-4 text-[17px] leading-[1.5] text-paper-mid/80">
            {unopenedBoxes > 0
              ? 'There is a box on the tray with your name on it. Open it out front — Tony likes to watch.'
              : 'The tray is empty and the case behind it is dark. Tony has not put anything out yet.'}
          </p>

          <div className="mt-6 space-y-4">
            {/*
              * Landing priority, from `18 §4`: owned unopened box first, then
              * available stock, then collection progress. There is no stock to
              * rotate yet — pricing is simulation-gated (`16 §8`) — so this page
              * shows the two things that are true today and invents neither a
              * price nor a countdown.
              */}
            <PixelPanel className="px-4 py-4">
              <PanelHeading>{unopenedBoxes > 0 ? 'On the tray' : 'Nothing on the tray'}</PanelHeading>
              <p className="mt-1.5 text-[17px] leading-[1.5] text-paper-mid/80">
                {unopenedBoxes > 0
                  ? plural(unopenedBoxes, 'unopened box', 'unopened boxes') +
                    '. It opens at the tray on the way in, not in here — this page is for browsing.'
                  : 'Boxes go on sale for tokens once the season starts. Everything rotates Tuesday to Tuesday, the same for everybody, and it all comes back around.'}
              </p>
            </PixelPanel>

            {/*
              * The collection view itself is a separate slice (`/counter/collection`).
              * What must be true *now* is the count: this panel said "nothing
              * collected yet" unconditionally, and the moment a box could be
              * opened that became a false statement about the manager's own
              * property. Accuracy outranks everything else here.
              */}
            <PixelPanel className="px-4 py-4">
              <PanelHeading>Your collection</PanelHeading>
              <p className="mt-1.5 text-[17px] leading-[1.5] text-paper-mid/80">
                {collectiblesOwned > 0
                  ? plural(collectiblesOwned, 'collectible', 'collectibles') +
                    ', kept permanently, across every season.'
                  : 'Nothing collected yet. What you pull is yours permanently, across every season.'}
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

/** "1 collectible" / "3 collectibles". Counting is a fact, so it is stated exactly. */
function plural(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}
