import { ROOM, type RoomObjectSpec } from '@/lib/parlor/objects';

/**
 * What is in the Underground.
 *
 * The same grammar as every other room in this product — **one portrait shell
 * plus transparent overlays**, hit regions that are rectangles because they are
 * never drawn, and an object earning a place only if a manager can guess what it
 * is before tapping it (`18 §5`, `16`'s architecture invariants).
 *
 * ## Four objects, and most of the room is scenery
 *
 * `18 §3.6`: most of a room is scenery, permanently. A basement casino is full
 * of things — crates, pipes, a fridge, a bare bulb, somebody's coat — and none
 * of them is an object. A crate that opened a panel saying *"a crate"* is the
 * failure the mandate calls a generic web box wearing pixel art.
 *
 *   - the **slot machine**, which is W1 and is built
 *   - the **blackjack table**, which is W2 and is drawn shut
 *   - the **cash desk**, which is where a manager's own tab and their own recent
 *     spins are — R10 makes casino history private, so this is the only surface
 *     in the product that shows it and it shows nobody else's
 *   - the **way back up**, which is a door rather than a breadcrumb
 *
 * ## Both games open in place, and that is the depth rule rather than a preference
 *
 * `18 §5` caps Rooms and the Underground at **two taps** and calls it the only
 * approved exception to one-tap depth. A game at `/underground/slots` would be
 * three. So the machine opens a panel over the room exactly as the counter tray
 * opens a box in place (`18 §4.1`), and `components/scene/room-panel.tsx` is the
 * panel — the one the RoomDisplay pass built, not a second one.
 *
 * ## The room is the size of every other room
 *
 * `ROOM` again, for the reason `lib/backhall/objects.ts` gives: one coordinate
 * system and one `place()`, so walking down the stairs does not change the size
 * of the world. Fourth room, same rule.
 */

/** A casino is a room is a room. */
export const UNDERGROUND = ROOM;

/** Where the floor meets the back wall. Lower than the hall — this is a cellar. */
export const HORIZON = 400;

/**
 * The four.
 *
 * Coordinates are chosen against the drawn stand-in in
 * `components/scene/underground.tsx`, which draws the room from these same
 * numbers — so the hit region and the thing you can see are one definition
 * rather than two that drift. When `zone_underground_shell` lands as real art it
 * is measured the way the storeroom was, and these move once.
 *
 * Every region clears **44 CSS px on the narrowest supported phone** — 360px
 * across a 320-unit room, so 39.1 room units. `objects.test.ts` fails the build
 * if any two of them touch or if any falls outside the room.
 */
export const UNDERGROUND_OBJECTS: readonly RoomObjectSpec[] = [
  /**
   * The slot machine, against the left-hand wall.
   *
   * Tall and narrow, with a window and a handle, because that is what a slot
   * machine looks like and the test `18 §5` sets is whether a manager knows what
   * it is before tapping it. It is a Display: it shows live content in place and
   * opens a panel. Not a Door — there is nowhere to go.
   */
  {
    id: 'slots',
    kind: 'display',
    label: 'The slot machine',
    destination: 'a pull on the machine',
    rect: [22, 150, 84, 200],
  },

  /**
   * The blackjack table, in the middle of the floor.
   *
   * **Drawn from the first day and shut until W2.** `18 §6.1`: a locked
   * destination is a closed door, never a hidden one — a manager should know the
   * table exists before it opens. Hiding it until blackjack ships would make the
   * room look finished when it is not, and would make the day it arrives look
   * like a new room rather than a table with a dealer at it.
   */
  {
    id: 'blackjack',
    kind: 'display',
    label: 'The blackjack table',
    destination: 'a hand',
    rect: [126, 236, 132, 96],
  },

  /**
   * The cash desk, on the right.
   *
   * A manager's own tab and their own last few spins. **Theirs only** — R10
   * makes casino history private in v1, and there is no surface anywhere in this
   * product that shows anybody else's.
   */
  {
    id: 'desk',
    kind: 'display',
    label: 'The cash desk',
    destination: 'your tab',
    rect: [236, 150, 68, 76],
  },

  /**
   * The stairs back up to the hall.
   *
   * A door in the world rather than a breadcrumb or a browser-back dependency
   * (`18 §5`). It is the only object here that is never shut.
   */
  {
    id: 'return',
    kind: 'door',
    label: 'Back up the stairs',
    destination: 'the back hall',
    href: '/back-hall',
    rect: [126, 96, 70, 120],
  },
] as const;

export function undergroundObject(id: string): RoomObjectSpec {
  const spec = UNDERGROUND_OBJECTS.find((object) => object.id === id);
  if (spec === undefined) throw new Error(`no underground object called ${id}`);
  return spec;
}

/**
 * What each shut machine says when it is tapped.
 *
 * `18 §6.3`: *"tappable, but answers in-world — not a route, not a modal, not a
 * coming-soon badge."* And `18 §6`: **no countdown timers.** A machine that
 * opens "in three days" manufactures urgency; a machine that is simply covered
 * does not. Both lines say *what* rather than *when*.
 *
 * Curated copy in the shop's voice (`05 §8.5`), never generated — `16 §10`
 * limits generative text to the Slice.
 */
export const COVERED_LINES: Readonly<Record<string, string>> = {
  slots: 'Unplugged. Tony says the wiring down here is nobody’s business.',
  blackjack: 'Green baize, no dealer. Tony has not found anyone he trusts.',
};
