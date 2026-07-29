import { ClosedRoom } from '@/components/scene/panel';
import { RoomBehind } from '@/components/scene/room-behind';
import { Page } from '@/components/shell';
import { requireUser } from '@/lib/auth/current-user';
import { seasonClock } from '@/lib/parlor/season';

/**
 * The rack by the door, before there is a paper in it.
 *
 * The Slice is V3 (`17 §4`). This is the corner of the shop it will arrive in,
 * described rather than drawn: `05 §8.5` wants empty states in the shop's voice
 * rather than a blank panel, and "the rack is empty" is a fact about a rack.
 */

export const dynamic = 'force-dynamic';

export default async function SlicePage() {
  await requireUser();
  const clock = seasonClock();

  return (
    <>
      <RoomBehind />

      <Page>
        <ClosedRoom
          sign="Tony's Tuesday Slice"
          title="Nothing on the rack"
          footnote="When it does print, the whole shop changes on a Tuesday morning: fresh papers here, a new line on the menu board, and something different on the wall."
        >
          <p>
            {clock.daysUntilKickoff === null
              ? 'The first issue prints the Tuesday after week one.'
              : `Nothing has happened worth printing since December. The first issue goes on the rack the Tuesday after week one — ${String(clock.daysUntilKickoff)} days out.`}
          </p>
          <p className="text-ink-500">
            Three shelves, all of them empty, and a price card nobody has updated since the shop
            opened.
          </p>
        </ClosedRoom>
      </Page>
    </>
  );
}
