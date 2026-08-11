import { place } from '@/lib/parlor/objects';
import { HORIZON, UNDERGROUND, undergroundObject } from '@/lib/casino/objects';

/**
 * The Underground, drawn.
 *
 * **Placeholder architecture, approved and precedented.** `zone_underground_shell`
 * does not exist and no art is briefed for it. The commissioner's ruling of
 * 2026-07-31 settled what to do about that — *"do not block development on final
 * art… use deliberate in-world placeholder architecture"* — and the Back Hall,
 * the basement and the collectible set have all shipped this way since.
 *
 * So this is **flat rectangles in palette colours**, at the right size, drawn
 * from the same numbers the hit regions use. It is meant to read as *a cellar
 * with a few machines in it*, never as finished art: no gradients, no rendering,
 * no detail that could be mistaken for a decision about what this room looks
 * like. `MANDATE`'s slot rules forbid polished temporary art becoming canonical
 * as firmly as they forbid a broken-image box.
 *
 * When the shell lands this file is deleted and the overlays become
 * `AssetView`s. Nothing else moves — the coordinates, the flags, the copy and
 * the gates all live outside it.
 *
 * ## It is darker than the hall, and that is the whole art direction it carries
 *
 * `02 §7`: the Underground should read as a Nintendo-era minigame room rather
 * than a realistic sportsbook — *colourful, tactile, instantly readable*. Two
 * things do that here: the room is lit from the machines rather than from above,
 * and the floor is the only warm surface in it.
 */
export function UndergroundScene({ slotsLit, tableLit }: { slotsLit: boolean; tableLit: boolean }) {
  const slots = undergroundObject('slots').rect;
  const table = undergroundObject('blackjack').rect;
  const desk = undergroundObject('desk').rect;
  const stairs = undergroundObject('return').rect;

  const pctOf = (units: number): string => `${((units / UNDERGROUND.height) * 100).toFixed(3)}%`;

  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      {/* Block wall, and the floor below the horizon. */}
      <div className="absolute inset-x-0 top-0 bg-ink-900" style={{ height: pctOf(HORIZON) }} />
      <div
        className="absolute inset-x-0 bottom-0 bg-wood-dark"
        style={{ height: pctOf(UNDERGROUND.height - HORIZON) }}
      />
      <span className="absolute bg-ink-700" style={place([0, HORIZON - 3, 320, 3])} />

      {/* Two courses of block, so the wall is a wall rather than a void. */}
      <span className="absolute bg-ink-700/60" style={place([0, 120, 320, 2])} />
      <span className="absolute bg-ink-700/60" style={place([0, 262, 320, 2])} />

      {/* The stairwell up, framed. */}
      <span className="absolute bg-ink-700" style={place([stairs[0] - 6, stairs[1] - 6, stairs[2] + 12, stairs[3] + 6])} />
      <span className="absolute bg-wood-mid" style={place([stairs[0], stairs[1], stairs[2], stairs[3]])} />
      {[0, 1, 2, 3, 4].map((step) => (
        <span
          key={step}
          className="absolute bg-wood-dark"
          style={place([stairs[0], stairs[1] + 16 + step * 20, stairs[2], 4])}
        />
      ))}

      {/* The slot machine: a cabinet, a window, a handle. */}
      <span className="absolute bg-ink-700" style={place([slots[0], slots[1], slots[2], slots[3]])} />
      <span
        className={`absolute ${slotsLit ? 'bg-amber-mid' : 'bg-ink-900'}`}
        style={place([slots[0] + 10, slots[1] + 24, slots[2] - 20, 44])}
      />
      <span className="absolute bg-red-mid" style={place([slots[0] + 12, slots[1] + 8, slots[2] - 24, 8])} />
      <span
        className="absolute bg-wood-mid"
        style={place([slots[0] + slots[2] - 4, slots[1] + 78, 8, 40])}
      />

      {/* The blackjack table: baize, and a rail around it. */}
      <span className="absolute bg-wood-mid" style={place([table[0] - 4, table[1] - 4, table[2] + 8, table[3] + 8])} />
      <span
        className={`absolute ${tableLit ? 'bg-green-deep' : 'bg-ink-700'}`}
        style={place([table[0], table[1], table[2], table[3]])}
      />

      {/* The cash desk. */}
      <span className="absolute bg-wood-mid" style={place([desk[0], desk[1], desk[2], desk[3]])} />
      <span className="absolute bg-ink-900" style={place([desk[0] + 8, desk[1] + 12, desk[2] - 16, 20])} />
    </div>
  );
}
