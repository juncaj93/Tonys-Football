import Link from 'next/link';

import { ManagerRoomScene } from '@/components/scene/manager-room';
import { RoomDisplay, RoomDoor } from '@/components/scene/room-object';
import { RoomStage } from '@/components/scene/room-stage';
import { ManagerInRoom, PlacedItems, RingsOnRail } from '@/components/rooms/furnishings';
import { SlotDisplay } from '@/components/rooms/slot';
import { ThemePicker } from '@/components/rooms/theme-picker';
import { Page } from '@/components/shell';
import { resolveAsset } from '@/lib/assets/registry';
import { requireUser } from '@/lib/auth/current-user';
import { characterFor } from '@/lib/character/service';
import { getDb } from '@/lib/db';
import { TYPE } from '@/lib/design/type';
import { MANAGER_ROOM, roomObject, SLOTS } from '@/lib/rooms/objects';
import { corridor, placeable, roomFor } from '@/lib/rooms/service';
import { themeSpec } from '@/lib/rooms/themes';

/**
 * `/rooms` — your basement.
 *
 * ## Down the stairs is *your* room, not a lobby
 *
 * `18 §7` puts Rooms at **two taps** from the parlor and calls it the one
 * approved exception to one-tap depth. A corridor at the bottom of the stairs
 * would make a manager's own room three taps, and the first thing they would
 * meet after opening a door in a pizzeria would be a list of names — which is
 * the menu card `18 §5` forbids, one floor lower.
 *
 * So the stairs arrive in the room that is yours. The corridor is a door on the
 * far wall, and visiting is *one tap inside Rooms* — exactly the allowance
 * `18 §7` already grants the Counter, whose Collection and Showcase sit at the
 * same effective depth. `docs/ROOMS_BOUNDARY.md §2` records the reconciliation.
 *
 * ## Nothing here is earned, and nothing here is a score
 *
 * Four places to put things, three ways the room can be fitted out, all
 * available from the first visit. `16` removes achievements, levels, clout and
 * prestige, and a room is exactly the kind of surface those creep back into. The
 * only number anywhere on it is a count of championships, which is a fact about
 * football rather than about a room.
 *
 * ## The one thing the room cannot fake
 *
 * The rail holds verified titles from `lib/counter/rings.ts` and holds nothing
 * for the eight managers who have won nothing. `MANDATE §10` — no narrative
 * claim without a stored fact behind it — read from the visual side: an empty
 * rail is the room telling the truth.
 */

export const dynamic = 'force-dynamic';

export default async function RoomsPage() {
  const { user } = await requireUser();
  const db = getDb();

  const [room, choices, character, doors] = await Promise.all([
    roomFor(db, user.id),
    placeable(db, user.id),
    characterFor(db, user.id),
    corridor(db, user.id),
  ]);

  if (room === null) {
    // Unreachable: `requireUser()` has already resolved this manager from the
    // same table. Thrown rather than rendered as an empty room, because an empty
    // room that means "we could not find you" is the plausible-looking failure
    // the repository refuses everywhere else.
    throw new Error(`signed-in manager ${user.id} has no record to build a room from`);
  }

  const theme = themeSpec(room.theme);
  const ringAsset = resolveAsset('object_champion_banner');

  const drawn = SLOTS.flatMap((slot) => {
    const item = room.placed[slot];
    return item === undefined
      ? []
      : [{ slot, name: item.name, asset: resolveAsset(item.slug) }];
  });

  /*
   * Asset resolution happens **here**, on the server, and travels to the client
   * as data — the same rule the counter's reveal follows. It keeps
   * `art/assets.inventory.json` out of the browser bundle and keeps the
   * pipeline's one guarantee intact: every reference is by slug through the
   * registry, and swapping a placeholder for final art stays a registry row.
   */
  const slotChoices = choices.map((choice) => ({
    collectibleId: choice.collectibleId,
    name: choice.name,
    rarity: choice.rarity,
    asset: resolveAsset(choice.slug),
    placedIn: choice.placedIn,
  }));

  return (
    <Page oneScreen>
      <main
        className="relative flex min-h-0 flex-1 justify-center overflow-hidden"
        // The floor's own colour, so a viewport taller than the room reads as
        // more basement rather than as a letterbox. Same treatment as the parlor
        // and the hall.
        style={{ backgroundColor: '#1a1214' }}
      >
        <div
          className="relative w-full max-w-[430px] self-start"
          style={{ aspectRatio: `${String(MANAGER_ROOM.width)} / ${String(MANAGER_ROOM.height)}` }}
        >
          <ManagerRoomScene theme={room.theme} />

          <PlacedItems items={drawn} />
          <RingsOnRail rings={room.rings} asset={ringAsset} />
          <ManagerInRoom composite={character.composite} name={user.displayName} />

          <RoomStage>
            {/* The way out. The only Door in the room. */}
            <RoomDoor spec={roomObject('stairs')} />

            {SLOTS.map((slot) => {
              const item = room.placed[slot];
              return (
                <SlotDisplay
                  key={slot}
                  slot={slot}
                  occupant={
                    item === undefined
                      ? null
                      : {
                          collectibleId: item.collectibleId,
                          name: item.name,
                          rarity: item.rarity,
                          asset: resolveAsset(item.slug),
                        }
                  }
                  choices={slotChoices}
                />
              );
            })}

            {/*
              * The rail. Derived, and deliberately not a slot.
              *
              * `03` grants a ring for a verified title and nothing else grants
              * one. Tapping it lists every title with its year — the wall hangs
              * a pennant for each, the panel carries the record, and that is the
              * same division the parlor.s own banner rail makes.
              */}
            <RoomDisplay spec={roomObject('rings')} title="Championships" material="enamel">
              {room.rings.length === 0 ? (
                <p className={`${TYPE.body} text-paper-mid/85`}>
                  Empty rail. Win one and Tony will hang it up here.
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
              * You, and the room.
              *
              * One panel for the two things that are the owner's to decide, and
              * it is deliberately not two objects: there is no object in a
              * basement a manager could guess means *"what the walls are made
              * of"*, and inventing one — a paint tin, a light switch — would be
              * the labelled control `18 §1` refuses. The person standing in the
              * room is the honest place for the room's own decisions.
              * `docs/ROOMS_BOUNDARY.md §4` records the alternative that was
              * rejected.
              */}
            <RoomDisplay
              spec={roomObject('manager')}
              title="Your room"
              actions={
                <Link
                  href="/profile/character"
                  className={`pixel-edge flex min-h-[44px] flex-1 items-center justify-center border-2 border-wood-dark bg-[#1c1113] px-3 ${TYPE.action} text-paper-mid active:translate-y-px`}
                >
                  Change how you look
                </Link>
              }
            >
              <p className={`${TYPE.body} text-ink-700`}>
                {user.displayName}, in {theme.name.toLowerCase()}.
              </p>

              <p className={`mt-4 ${TYPE.ledgerLabel} text-ink-700`}>How it is fitted out</p>
              <ThemePicker current={room.theme} />
            </RoomDisplay>

            {/*
              * The corridor.
              *
              * `16`'s P6 exit criterion is *"visiting works"*, and `14 §5` makes
              * basements social destinations without ever explaining how ten of
              * them fit under one pizzeria. This door is that seam.
              */}
            <RoomDisplay spec={roomObject('corridor')} title="Down the corridor">
              {doors.length === 0 ? (
                <p className={`${TYPE.body} text-ink-700`}>
                  Nobody else has been down here yet.
                </p>
              ) : (
                <ul className="divide-y divide-wood-dark/25">
                  {doors.map((door) => (
                    <li key={door.userId}>
                      <Link
                        href={`/rooms/${door.userId}`}
                        className="flex min-h-[52px] items-center justify-between gap-3 py-2 active:translate-y-px"
                      >
                        <span className={`min-w-0 flex-1 truncate ${TYPE.body} text-ink-900`}>
                          {door.displayName}
                        </span>
                        <span className={`${TYPE.ledgerLabel} shrink-0 text-ink-700`}>
                          {door.titles > 0 && (
                            <span className="text-amber-deep">
                              {door.titles === 1 ? '1 title · ' : `${String(door.titles)} titles · `}
                            </span>
                          )}
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
              )}
            </RoomDisplay>
          </RoomStage>
        </div>
      </main>
    </Page>
  );
}
