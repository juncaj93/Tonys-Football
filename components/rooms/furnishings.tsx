import { CharacterView } from '@/components/character/character-view';
import { AssetView } from '@/lib/assets/placeholder';
import { type AssetResolution } from '@/lib/assets/types';
import { type Composite } from '@/lib/character/composite';
import { type HeldRing } from '@/lib/counter/rings';
import { place } from '@/lib/parlor/objects';
import { PENNANT, roomObject, slotArtRect, SLOTS, type Slot } from '@/lib/rooms/objects';

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
 * Each sprite is drawn into its **art rect** — always exactly 46 × 46, which is
 * the pipeline's rule 4: one art pixel is one room unit, the same relationship
 * the counter tray has.
 *
 * That is deliberately **not** the hit region. The frame on the wall is
 * 116 × 78 because that is the frame, and the desk is 68 × 58 because that is
 * the desktop; both are sized for a thumb. Collapsing the two would either
 * shrink the targets to sprite size or stretch every sprite to its furniture,
 * and the second is the fractional resample the pipeline exists to avoid.
 * `lib/rooms/objects.ts` holds both, so there is still one definition of each.
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
            style={place(slotArtRect(slot))}
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
 * six across the 134-unit rod. A seventh title is years away and belongs to the
 * panel, which lists them all. **No "+2" mark**: a count of what is not being
 * shown is a score, and `18 §4` allows none.
 */
export function RingsOnRail({
  rings,
  asset,
}: {
  rings: readonly HeldRing[];
  /** `object_champion_banner`, resolved once on the server. */
  asset: AssetResolution;
}) {
  const [railX, railY] = roomObject('rings').rect;
  const shown = rings.slice(0, PENNANT.shown);

  return (
    <>
      {shown.map((ring, index) => (
        <span
          key={ring.year}
          aria-hidden="true"
          data-room-title={ring.year}
          className="pointer-events-none absolute z-10"
          style={place([
            railX + PENNANT.offsetX + index * PENNANT.pitch,
            railY + PENNANT.offsetY,
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
  const [x, y, width, height] = roomObject('manager').rect;

  return (
    <>
      {/*
       * The shadow the manager casts on the rug.
       *
       * **It belongs to the floor, not to the figure**, which is why it is here
       * and not a row of the sprite. A shadow inside the composite would follow
       * the character onto `/profile` and into the customiser, where there is no
       * floor for it to fall on, and it would be recoloured by whatever ramp the
       * layer under it happened to use.
       *
       * It is the last thing between a figure that is standing in a room and a
       * figure that has been placed on top of a photograph of one — the single
       * cue no amount of work on the sprite itself could supply.
       *
       * ## Two hard ellipses, no blur
       *
       * The first version was one blurred ellipse and it was invisible in the
       * capture, for two reasons worth writing down. `rounded-[50%]` is an
       * arbitrary value Tailwind did not emit, so it was a **rectangle**; and a
       * blurred one at that, which is the treatment `globals.css`'s house-edge
       * note says *"made the interiors read as a different product from the room
       * the moment the room became real pixel art."*
       *
       * A penumbra out of two flat steps is the same trick `.pixel-edge` uses for
       * a bevel and the same trick the sprite uses for a curve. It survives
       * `image-rendering: pixelated`, it costs no filter, and it is the house
       * style rather than an exception to it.
       *
       * The radii are inline because a percentage border-radius has no utility.
       */}
      <span
        aria-hidden="true"
        data-room-shadow=""
        className="pointer-events-none absolute z-0 bg-ink-900/30"
        style={{ ...place([x + width * 0.16, y + height - 7, width * 0.68, 11]), borderRadius: '50%' }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute z-0 bg-ink-900/45"
        style={{ ...place([x + width * 0.24, y + height - 5, width * 0.52, 7]), borderRadius: '50%' }}
      />
      <span
        aria-hidden="true"
        data-room-character=""
        className="pointer-events-none absolute z-10"
        style={place([x, y, width, height])}
      >
        <CharacterView composite={composite} fit="container" label={name} />
      </span>
    </>
  );
}
