import { ClosedRoom } from '@/components/scene/panel';
import { RoomBehind } from '@/components/scene/room-behind';
import { Page } from '@/components/shell';
import { requireUser } from '@/lib/auth/current-user';

/**
 * The bottom of the stairs, and a door with a chain on it.
 *
 * Basements are v1.1, Phase 6 (`16 §3`), and `16 §7.1` asks for the closed
 * basement door to exist from the start **so the room feels like an arrival
 * when it opens** rather than a tab that appeared one day. A chain and a
 * padlock say "later" in a way a disabled button cannot.
 */

export const dynamic = 'force-dynamic';

export default async function RoomsPage() {
  await requireUser();

  return (
    <>
      <RoomBehind />

      <Page>
        <ClosedRoom
          sign="Downstairs"
          title="The door is chained"
          footnote="Every manager gets a room down here eventually — shelves, a wall, a chair, and whatever they have collected. Visitors will be able to come down and look."
        >
          <p>
            There is a light on down there and the sound of somebody moving boxes. Tony has not
            said what is in them.
          </p>
          <p className="text-ink-500">
            A chain, a padlock, and a strip of light along the bottom of the door.
          </p>
        </ClosedRoom>
      </Page>
    </>
  );
}
