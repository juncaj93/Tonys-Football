import { ClosedRoom } from '@/components/scene/panel';
import { RoomBehind } from '@/components/scene/room-behind';
import { Page } from '@/components/shell';
import { requireUser } from '@/lib/auth/current-user';

/**
 * The display case, lit, with nothing on the shelves.
 *
 * Collectibles, tokens and the loot box are V4 (`17 §4`). Nothing here shows a
 * number or a balance: `16 §8` keeps every economy figure simulation-gated, and
 * a "0 tokens" counter would be a number the product has not earned yet.
 *
 * The screen used to draw its own glass case out of gradients. It no longer
 * does. The real parlor sits behind, dimmed, and a note explains the case —
 * because a drawn case competing with a *drawn* case one screen away is a
 * comparison this side was always going to lose.
 */

export const dynamic = 'force-dynamic';

export default async function CollectionPage() {
  await requireUser();

  return (
    <>
      <RoomBehind />

      <Page>
        <ClosedRoom
          sign="The case"
          title="Shelves are bare"
          footnote="Collectibles, championship rings, and the tokens to open a box all arrive together — once there is a season to earn them in."
        >
          <p>The strip light is on and the glass has been wiped. Tony has not put anything in it yet.</p>
          <p className="text-ink-500">
            Two shelves, a light along the top, and a smear where somebody leaned on the glass.
          </p>
        </ClosedRoom>
      </Page>
    </>
  );
}
