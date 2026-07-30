import { AssetView } from '@/lib/assets/placeholder';
import { resolveAsset } from '@/lib/assets/registry';
import { ROOM } from '@/lib/parlor/objects';

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
 *
 * ## It was drawing the legacy two-tile room
 *
 * Until 2026-07-30 this composed `zone_front_counter` over `zone_counter_front` —
 * **both withdrawn**. `zone_front_counter` is the legacy two-tile room and
 * `zone_counter_front` is the foreground asset `SHELL_AUDIT` retired outright, on
 * the grounds that two independently generated images which must stay
 * pixel-aligned is a defect class. So every interior screen — the counter, the
 * Back Hall, the Timeline, the Slice, Rooms — was quietly backed by the artwork the
 * approved shell replaced, and two withdrawn PNGs were being preloaded on every one
 * of those pages.
 *
 * `visual:qa`'s `legacy` gate exists to catch exactly this and did not, because
 * `counter`, `back-hall` and `rack` were skipped in the state loop. Adding the
 * `collection` state exposed it, and the skip list has been narrowed to the checks
 * that genuinely only apply to the homepage.
 *
 * It is now the one approved drawing. No cut is needed: there is no Tony here to
 * sandwich, so the shell is simply drawn whole and dimmed.
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
        <AssetView resolution={resolveAsset('zone_parlor_shell')} />
      </div>

      {/* Enough darkness over it that cream paper reads at a glance. */}
      <div className="absolute inset-0 bg-ink-900/45" />
    </div>
  );
}
