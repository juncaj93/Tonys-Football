'use client';

import Link from 'next/link';

import { RoomDoor, roomObjectAttributes } from '@/components/scene/room-object';
import { AssetView } from '@/lib/assets/placeholder';
import { type AssetResolution } from '@/lib/assets/types';
import { TRAY_BOX, place, type RoomObjectSpec } from '@/lib/parlor/objects';

/**
 * The pizza box that waits in the parlor.
 *
 * It is a physical prop on Tony's actual tray, not an extra inventory badge. A
 * manager who starts with an unopened box sees it immediately, taps it, and
 * enters the same dedicated reveal room a fresh purchase reaches. The tiny tray
 * therefore stays intuitive without being asked to hold a whole prize ceremony.
 */
export function CounterTray({
  spec,
  ownedBoxId,
  boxAsset,
}: {
  spec: RoomObjectSpec;
  /** The oldest unopened box, resolved by the server for this parlor visit. */
  ownedBoxId: string | null;
  boxAsset: AssetResolution;
}) {
  if (ownedBoxId === null) return <RoomDoor spec={spec} />;

  return (
    <>
      <div
        aria-hidden="true"
        className="box-owned pointer-events-none absolute z-[22]"
        style={place(TRAY_BOX)}
      >
        <AssetView resolution={boxAsset} compact />
      </div>

      <Link
        href={`/counter/open/${ownedBoxId}`}
        aria-label="Open your pizza box"
        style={place(spec.rect)}
        className="room-shape absolute z-30 outline-none"
        {...roomObjectAttributes(spec)}
      />
    </>
  );
}
