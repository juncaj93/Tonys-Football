import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { ManagerRoomScene } from '@/components/scene/manager-room';
import { RoomDisplay, RoomDoor } from '@/components/scene/room-object';
import { RoomStage } from '@/components/scene/room-stage';
import { ManagerInRoom, PlacedItems, RingsOnRail } from '@/components/rooms/furnishings';
import { Page } from '@/components/shell';
import { resolveAsset } from '@/lib/assets/registry';
import { requireUser } from '@/lib/auth/current-user';
import { characterFor } from '@/lib/character/service';
import { getDb } from '@/lib/db';
import { featureFlags } from '@/lib/flags';
import { TYPE } from '@/lib/design/type';
import {
  MANAGER_ROOM,
  roomObject,
  SLOTS,
  SLOT_NAMES,
  type Slot,
} from '@/lib/rooms/objects';
import { corridor, roomFor, visitable } from '@/lib/rooms/service';
import { themeSpec } from '@/lib/rooms/themes';

/**
 * `/rooms/<manager>` — somebody else's basement.
 *
 * ## It is the same room, with nothing that writes
 *
 * `16`'s P6 exit criterion is *"visiting works"*, and the honest implementation
 * of that is the identical scene with the controls removed rather than a
 * summary of a room. A visitor sees the shelf, the wall, the bench, the rail and
 * the manager standing in it — the same six things the owner sees, drawn from
 * the same geometry.
 *
 * **There is no action on this page at all.** Not a disabled control, not a
 * hidden one: `app/actions/rooms.ts` has no `userId` parameter on anything, so
 * there is no request a visitor could make about a room that is not theirs. The
 * authorization is the absence of an operation, backed by
 * `room_placements_must_be_owned` in the database.
 *
 * ## Who can be visited
 *
 * Active league seats only. A retired manager's room still exists — `14 §5` makes
 * a basement permanent — and is not reachable, because the commissioner's ruling
 * that a retired manager is not a browsable identity is absolute and a URL is
 * not exempt from it. `visitable()` carries the rule; this route just obeys it.
 */

export const dynamic = 'force-dynamic';

export default async function VisitRoomPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { user } = await requireUser();

  // The flag gates the route, not only the door. See `app/rooms/page.tsx`.
  if (!featureFlags().rooms) notFound();

  const { userId } = await params;
  const db = getDb();

  // Your own room has one address, and it is the one with the controls on it.
  if (userId === user.id) redirect('/rooms');

  /*
   * One answer for "no such manager", "not a manager any more" and "a
   * malformed id": `notFound()`. Probing addresses teaches nothing about who
   * used to be in this league — the same property `openBox` gives box ids.
   */
  if (!(await visitable(db, userId))) notFound();

  const [room, character, doors] = await Promise.all([
    roomFor(db, userId),
    characterFor(db, userId),
    corridor(db, user.id),
  ]);

  if (room === null) notFound();

  const theme = themeSpec(room.theme);
  const ringAsset = resolveAsset('object_champion_banner');

  const drawn = SLOTS.flatMap((slot) => {
    const item = room.placed[slot];
    return item === undefined
      ? []
      : [{ slot, name: item.name, asset: resolveAsset(item.slug) }];
  });

  /** What a visitor is told about a place. Never *"empty slot"*. */
  const said = (slot: Slot): { title: string; body: string; rarity?: string } => {
    const item = room.placed[slot];
    if (item === undefined) {
      return {
        title: SLOT_NAMES[slot],
        body: `${room.displayName} has not put anything here.`,
      };
    }
    return { title: SLOT_NAMES[slot], body: item.name, rarity: item.rarity };
  };

  /* The neighbours, minus the room being stood in. */
  const others = doors.filter((door) => door.userId !== userId);

  return (
    <Page oneScreen>
      <main
        className="relative flex min-h-0 flex-1 justify-center overflow-hidden"
        style={{ backgroundColor: '#1a1214' }}
      >
        <div
          className="relative w-full max-w-[430px] self-start"
          style={{ aspectRatio: `${String(MANAGER_ROOM.width)} / ${String(MANAGER_ROOM.height)}` }}
        >
          <ManagerRoomScene theme={room.theme} />

          <PlacedItems items={drawn} />
          <RingsOnRail rings={room.rings} asset={ringAsset} />
          <ManagerInRoom composite={character.composite} name={room.displayName} />

          <RoomStage>
            {/*
              * The way out goes to **your** room rather than to the hall.
              *
              * You got here by walking down the corridor, so the way back is the
              * way you came. It is also the only in-world exit that does not
              * require a visitor to know they are two floors from the parlor.
              */}
            <RoomDoor
              spec={{
                ...roomObject('stairs'),
                label: 'Back to your own room',
                destination: 'your room',
                href: '/rooms',
              }}
            />

            {SLOTS.map((slot) => {
              const words = said(slot);
              return (
                <RoomDisplay key={slot} spec={roomObject(slot)} title={words.title}>
                  {words.rarity === undefined ? (
                    <p className={`${TYPE.body} text-ink-700`}>{words.body}</p>
                  ) : (
                    <p className={TYPE.body}>
                      <span className={`rarity-${words.rarity} rarity-word ${TYPE.eyebrow}`}>
                        {words.rarity}
                      </span>
                      <span className="mt-1 block text-ink-900">{words.body}</span>
                    </p>
                  )}
                </RoomDisplay>
              );
            })}

            <RoomDisplay spec={roomObject('rings')} title="Championships" material="enamel">
              {room.rings.length === 0 ? (
                <p className={`${TYPE.body} text-paper-mid/85`}>
                  {room.displayName} has not won one yet.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {room.rings.map((ring) => (
                    <li key={ring.year} className="flex items-baseline justify-between gap-3">
                      <span className={`${TYPE.body} text-paper-mid`}>Champion</span>
                      <span className={`${TYPE.ledgerValue} text-amber-mid`}>{ring.year}</span>
                    </li>
                  ))}
                </ul>
              )}
            </RoomDisplay>

            {/*
              * Whose room this is.
              *
              * The same object that carries the owner's own decisions, answering
              * the only question a visitor has about the person standing there.
              * No theme picker and no link to anybody's appearance: neither is a
              * visitor's to change, and a disabled version of either would be a
              * control that exists to say no.
              */}
            <RoomDisplay spec={roomObject('manager')} title={room.displayName}>
              <p className={`${TYPE.body} text-ink-700`}>
                {theme.name}. {theme.line}
              </p>
              <p className={`mt-3 ${TYPE.body} text-ink-700`}>
                {room.holdings === 0
                  ? 'Nothing collected yet.'
                  : room.holdings === 1
                    ? 'One thing collected.'
                    : `${String(room.holdings)} different things collected.`}
              </p>
            </RoomDisplay>

            <RoomDisplay spec={roomObject('corridor')} title="Down the corridor">
              <ul className="divide-y divide-wood-dark/25">
                <li>
                  <Link
                    href="/rooms"
                    className="flex min-h-[52px] items-center justify-between gap-3 py-2 active:translate-y-px"
                  >
                    <span className={`min-w-0 flex-1 truncate ${TYPE.body} text-ink-900`}>
                      Your room
                    </span>
                    <span className={`${TYPE.ledgerLabel} shrink-0 text-ink-700`}>yours</span>
                  </Link>
                </li>

                {others.map((door) => (
                  <li key={door.userId}>
                    <Link
                      href={`/rooms/${door.userId}`}
                      className="flex min-h-[52px] items-center justify-between gap-3 py-2 active:translate-y-px"
                    >
                      <span className={`min-w-0 flex-1 truncate ${TYPE.body} text-ink-900`}>
                        {door.displayName}
                      </span>
                      <span className={`${TYPE.ledgerLabel} shrink-0 text-ink-700`}>
                        {door.onShow === 0
                          ? 'nothing out'
                          : door.onShow === 1
                            ? '1 thing out'
                            : `${String(door.onShow)} things out`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </RoomDisplay>
          </RoomStage>
        </div>
      </main>
    </Page>
  );
}
