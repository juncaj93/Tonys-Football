import { AssetView } from '@/lib/assets/placeholder';
import { resolveAsset } from '@/lib/assets/registry';
import { COUNTER_EDGE, ROOM } from '@/lib/parlor/objects';

/**
 * The parlor, dimmed, behind an interior screen.
 *
 * You did not leave the shop to look in the case — you turned round inside it.
 * Putting the real art behind every interior is what makes those screens part
 * of the same world, and it is the one thing four hand-drawn CSS dioramas could
 * never manage: a wire rack drawn with gradients loses to a wire rack drawn
 * properly, every time, and the comparison was sitting right there on the
 * previous screen.
 *
 * It is `aria-hidden` and inert. Nothing here is information — the words on the
 * panel in front carry all of it — so it costs a screen reader nothing.
 */
export function RoomBehind() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 flex justify-center overflow-hidden bg-ink-900"
    >
      <div
        className="room-behind relative w-full max-w-[430px] self-start"
        style={{ aspectRatio: `${String(ROOM.width)} / ${String(ROOM.height)}` }}
      >
        <AssetView resolution={resolveAsset('zone_front_counter')} />
        <div
          className="absolute inset-x-0"
          style={{ top: `${((COUNTER_EDGE / ROOM.height) * 100).toFixed(3)}%` }}
        >
          <AssetView resolution={resolveAsset('zone_counter_front')} />
        </div>
      </div>

      {/* Enough darkness over it that cream paper reads at a glance. */}
      <div className="absolute inset-0 bg-ink-900/45" />
    </div>
  );
}
