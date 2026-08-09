import { CharacterView } from '@/components/character/character-view';
import { AssetView } from '@/lib/assets/placeholder';
import { type AssetResolution } from '@/lib/assets/types';
import { type Composite } from '@/lib/character/composite';
import { type HeldRing } from '@/lib/counter/rings';
import { place } from '@/lib/parlor/objects';
import { roomObject, SLOTS, type Slot } from '@/lib/rooms/objects';

/**
 * What is actually in the room — the things, drawn where they are.
 *
 * Separate from `manager-room.tsx` because the two have different lifetimes.
 * That file is the **room**: walls, floor, shelf, stairs, and it is deleted the
 * day `zone_room_shell_*` art exists. This file is the **contents**, which are
 * per manager, resolved from the database, and survive the art swap unchanged —
 * a collectible in a slot is an `AssetView` today and an `AssetView` afterwards.
 *
 * Everything here is `aria-hidden`. The words are all on the panels the hit
 * regions open, so a screen reader that read these too would say every
 * collectible's name twice.
 */

/** A collectible standing in one of the four places. */
export interface DrawnItem {
  readonly slot: Slot;
  readonly name: string;
  readonly asset: AssetResolution;
}

/**
 * The four slots' contents.
 *
 * Each sprite is drawn into **exactly the hit region's rectangle**, from
 * `lib/rooms/objects.ts`. That is the property the back hall established and it
 * is worth restating in a file that could easily have re-declared four positions:
 * what a manager sees and what a tap lands on are one definition.
 *
 * A 46 × 46 sprite in a 46 × 46 region is `1:1` at the room's own scale, which is
 * the pipeline's rule 4 — one art pixel is one room unit — and the same
 * relationship the counter tray has.
 */
export function PlacedItems({ items }: { items: readonly DrawnItem[] }) {
  const bySlot = new Map(items.map((item) => [item.slot, item]));

  return (
    <>
      {SLOTS.map((slot) => {
        const item = bySlot.get(slot);
        if (item === undefined) return null;

        return (
          <span
            key={slot}
            aria-hidden="true"
            data-room-item={slot}
            className="pointer-events-none absolute z-10 flex items-end justify-center"
            style={place(roomObject(slot).rect)}
          >
            <AssetView resolution={item.asset} compact placeholder="collectible" />
          </span>
        );
      })}
    </>
  );
}

/**
 * The championships on the rail.
 *
 * ## They are pennants, and the art already exists
 *
 * `object_champion_banner` is 18 × 15 and is one of the few slugs in this
 * product with **generated, approved art**. It is what the parlor's own rail
 * hangs, so a manager who has seen the shop reads a pennant as a championship
 * before anything explains it — and reusing it means this feature asks for no
 * new art at all.
 *
 * The alternative was `item_championship_ring`, which is still a placeholder and
 * therefore draws the same stand-in carton as every unfinished collectible. A
 * row of identical cartons on a wall rail says *storage*, which is the one thing
 * this rail must not say.
 *
 * ## No year is painted on them, and that is deliberate
 *
 * The parlor's banner carries a two-digit year, and that mark is **the one
 * declared exemption from the type floor** in this product — 10.1 CSS px at 360,
 * justified there because the rail is the only place the season is named. Here
 * it is not: the panel this rail opens lists every title with its year at body
 * size. Adding a second exemption to save a tap would be spending the rule's one
 * concession on a surface that does not need it.
 *
 * ## Six on the wall, all of them in the panel
 *
 * Same pitch as the parlor's rail — 18 wide on a 22-unit spacing — which fits
 * six across the 140-unit rod. A seventh title is years away and belongs to the
 * panel, which lists them all. **No "+2" mark**: a count of what is not being
 * shown is a score, and `18 §4` allows none.
 */
const PENNANTS_ON_THE_RAIL = 6;
const PENNANT = { width: 18, height: 15, pitch: 22, top: 8 } as const;

export function RingsOnRail({
  rings,
  asset,
}: {
  rings: readonly HeldRing[];
  /** `object_champion_banner`, resolved once on the server. */
  asset: AssetResolution;
}) {
  const [railX, railY] = roomObject('rings').rect;
  const shown = rings.slice(0, PENNANTS_ON_THE_RAIL);

  return (
    <>
      {shown.map((ring, index) => (
        <span
          key={ring.year}
          aria-hidden="true"
          data-room-title={ring.year}
          className="pointer-events-none absolute z-10"
          style={place([
            railX + 4 + index * PENNANT.pitch,
            railY + PENNANT.top,
            PENNANT.width,
            PENNANT.height,
          ])}
        >
          <AssetView resolution={asset} />
        </span>
      ))}
    </>
  );
}

/**
 * The manager, standing in the room.
 *
 * `fit="container"` rather than a fixed scale: the room is a percentage of the
 * viewport and a figure at a fixed pixel size would be a different fraction of
 * the room on every phone. `CharacterView`'s own note carries the argument —
 * there is no raster to resample, only `<rect>`s with `crispEdges`.
 *
 * **`idle` is off.** The customiser's breathe is one source pixel over three and
 * a half seconds and it exists there because you are looking *at* the character.
 * Here you are looking at a room, and a figure that moves in it is the only
 * moving thing on the screen — which `MANDATE §6` would read as an affordance and
 * a manager would read as "tap me".
 */
export function ManagerInRoom({
  composite,
  name,
}: {
  composite: Composite;
  name: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-room-character=""
      className="pointer-events-none absolute z-10"
      style={place(roomObject('manager').rect)}
    >
      <CharacterView composite={composite} fit="container" label={name} />
    </span>
  );
}
