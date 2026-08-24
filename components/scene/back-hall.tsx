import { backHallObject } from '@/lib/backhall/objects';
import { AssetView } from '@/lib/assets/placeholder';
import { resolveAsset } from '@/lib/assets/registry';
import { place } from '@/lib/parlor/objects';

/**
 * The back hall.
 *
 * ## The drawn stand-in is gone, and this file is what is left of it
 *
 * For one milestone this was about a hundred and eighty lines of flat rectangles
 * — the deliberate in-world placeholder architecture the commissioner's ruling
 * of 2026-07-31 asked for, and the thing that took the hall from a menu card to
 * a room a year before a painting existed. It said, in its own header, that when
 * `zone_back_hall_shell` landed it would be **deleted** and the shell would
 * become one `AssetView`. That is what happened on 2026-08-11.
 *
 * It is deleted rather than kept behind a resolver, which is where this differs
 * from `manager-room.tsx`. The basement keeps its drawing because **two of its
 * three themes are still unpainted** and the code resolves a shell per theme.
 * The hall has one shell. A second branch here would be a branch nothing can
 * reach, and the honest signal that the art has gone missing is the room looking
 * wrong rather than the room quietly looking like a diagram again.
 *
 * `data-room-shell` is how that stays checkable: `checkBackHall` asserts it
 * reads `art`, so a registry row losing its `path` fails the visual gate instead
 * of shipping a placeholder the size of a room.
 *
 * ## The chain is the whole reason this file still exists
 *
 * It is **a state of the door, not part of the room** — `BACK_HALL_BOUNDARY §8.3`
 * is the round where that was learned by photographing an open stairwell with a
 * chain across it, which no test failed and which simply contradicted the page.
 * So it is runtime, it is excluded from the painting by name (`BATCH_G §0`), and
 * it is drawn here in flat palette colour on purpose: it is a marker, not art.
 */

/**
 * Where the chain hangs across the stair opening.
 *
 * Read off `backHallObject('stairs')` rather than written down, so it cannot
 * drift from the doorway it is closing. At roughly a third of the way down the
 * opening it sits at about chest height on the flight — where a chain across a
 * staff stairwell actually goes, rather than across a floor rail, which is what
 * the stand-in's geometry needed and is why `LOCKED_LINES.stairs` no longer
 * mentions one.
 */
const CHAIN_DROP = 0.34;

/** How many links span the opening. Enough to read as a chain, few enough to stay flat. */
const LINKS = 11;

export function BackHallScene({ chained = true, night = false }: { chained?: boolean; night?: boolean }) {
  const [x, y, width, height] = backHallObject('stairs').rect;
  const chainY = Math.round(y + height * CHAIN_DROP);

  /*
   * Two eye plates and a run of links between them.
   *
   * The first version was one pale bar, and against a painted room it was the
   * only thing on screen that looked drawn by a programmer. Alternating two
   * tones is what makes a line read as **links** rather than as a rule — the
   * same observation the basement's staircase records about treads, which is
   * *"a series of lit edges over dark risers"* and not a stack of blocks.
   *
   * It stays flat and stays in palette on purpose. It is a **state marker**,
   * and `MANDATE`'s slot rules forbid temporary art polished enough to be
   * mistaken for a decision as firmly as they forbid a broken-image box.
   */
  const span = width - 12;
  const link = span / LINKS;

  return (
    <div aria-hidden="true" data-room-shell="art" className="absolute inset-0 overflow-hidden">
      <AssetView resolution={resolveAsset(night ? 'zone_back_hall_shell_night' : 'zone_back_hall_shell')} />

      {chained && (
        <span data-stairs-chained="true">
          <span className="absolute bg-ink-500" style={place([x + 2, chainY - 3, 6, 9])} />
          <span className="absolute bg-ink-500" style={place([x + width - 8, chainY - 3, 6, 9])} />
          {Array.from({ length: LINKS }, (_, i) => (
            <span
              key={i}
              // Lit from the left, like everything else in this room.
              className={`absolute ${i % 2 === 0 ? 'bg-ink-100/80' : 'bg-ink-300/70'}`}
              style={place([Math.round(x + 6 + i * link), chainY + (i % 2 === 0 ? 0 : 1), Math.ceil(link) - 1, 3])}
            />
          ))}
        </span>
      )}
    </div>
  );
}
