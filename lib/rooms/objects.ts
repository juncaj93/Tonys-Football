import { ROOM, type RoomObjectSpec } from '@/lib/parlor/objects';

/**
 * What is in a manager's room.
 *
 * The same grammar as the parlor and the back hall, deliberately: **one portrait
 * scene plus transparent hit regions**, rectangles because they are never drawn,
 * and an object earning a place only if a manager can guess what it does before
 * tapping it (`18 §1`, `16`'s architecture invariants).
 *
 * ## The room is the size of every other room
 *
 * `BACK_HALL = ROOM` for the reason `lib/backhall/objects.ts` gives — one
 * coordinate system and one `place()`, so walking between rooms does not change
 * the size of the world. This is the third room and it keeps that.
 *
 * ## Eight objects, and what is deliberately not one of them
 *
 * Four **slots** you can put something in, two **things the product knows about
 * you** that you cannot edit, one **way out**, and one **way to the neighbours**.
 *
 * Not objects, permanently: the light, the pipes, the boxes, the floor, the
 * walls. `18 §3.6` — most of a room is scenery, and it stays scenery. A crate
 * that opened a panel saying "a crate" is the failure the mandate calls a
 * generic web box wearing pixel art.
 *
 * ## Why the slots are Displays and not a fifth kind
 *
 * `18 §2` gives four kinds and a slot is a Display: it shows live content in
 * place and opens a panel. It is not a Door (no route), not a Toy (it carries
 * information). That it happens to be *editable* is a property of the panel, not
 * of the object — the receipt is a Display and the counter tray is a Door, and
 * neither needed a new kind when it gained a control.
 *
 * ## The character is a Display, and that is a decision
 *
 * The obvious reading is Toy: tap the little person, they react. But `16`'s P6
 * row asks for *"character in-room"* and the useful thing a manager wants from
 * their own character standing in their own room is **to change it** — which is
 * a destination, in a panel, exactly as the champion banner opens into one. In
 * somebody else's room the same object answers *whose* it is, which is the
 * question a visitor actually has.
 */

/** A room is a room. Same coordinate system as the parlor and the back hall. */
export const MANAGER_ROOM = ROOM;

/** Where the floor meets the back wall. Shared by the scene and the layout. */
export const HORIZON = 392;

/**
 * The four places a collectible can go.
 *
 * Ordered the way the eye reads the room — up first, then down — because this
 * order is what the panel's *"put something here"* list and the keyboard tab
 * order both use, and a third ordering somewhere else would be a third opinion.
 */
export const SLOTS = ['shelf_left', 'shelf_right', 'wall', 'bench'] as const;
export type Slot = (typeof SLOTS)[number];

/**
 * What each place is called out loud.
 *
 * Physical, because the panel says it: *"on the shelf, on the left"* is a place
 * in a room and `shelf_left` is a database column that leaked onto a screen.
 */
export const SLOT_NAMES: Readonly<Record<Slot, string>> = {
  shelf_left: 'the shelf, left',
  shelf_right: 'the shelf, right',
  wall: 'the wall',
  bench: 'the workbench',
};

/**
 * What an empty place says.
 *
 * Not *"empty slot"*. `05 §8.5` wants empty states in the shop's voice, and an
 * empty shelf in a basement is a fact about the basement rather than a null.
 */
export const SLOT_EMPTY: Readonly<Record<Slot, string>> = {
  shelf_left: 'Nothing on this end of the shelf.',
  shelf_right: 'The other end of the shelf is bare.',
  wall: 'A nail in the wall with nothing on it.',
  bench: 'The bench is clear.',
};

/**
 * The eight, laid out.
 *
 * Coordinates are chosen against `components/scene/manager-room.tsx`, which
 * draws the room from these same numbers — so the hit region and the thing you
 * can see are one definition rather than two that drift. That is the property
 * the back hall arrived at first and it is worth restating: when real art lands,
 * the scene file is deleted and these do not move.
 *
 * Every region is at least 44 × 44 room units, which at the narrowest supported
 * phone (360 CSS px across a 320-unit room) is 49.5 CSS px. `objects.test.ts`
 * fails the build if any two of them touch or if any falls under the floor.
 */
export const ROOM_OBJECTS: readonly RoomObjectSpec[] = [
  /**
   * The stairs back up to the hall.
   *
   * The way out is a door in the world rather than a breadcrumb or a
   * browser-back dependency (`18 §5`), and here it is literally the stairs you
   * came down. It is the only object in the room that is never anything but
   * itself.
   */
  {
    id: 'stairs',
    kind: 'door',
    label: 'Back up the stairs',
    destination: 'the hall',
    href: '/back-hall',
    rect: [8, 132, 80, 260],
  },

  /**
   * The championship rail — **derived, and not a slot.**
   *
   * Rings are granted from verified titles (`lib/counter/rings.ts`) and cannot
   * be placed, moved or taken down. That is the difference between the two kinds
   * of thing in this room said in geometry: the shelf holds what you *chose*,
   * this holds what you *won*, and nothing about the second is a preference.
   *
   * It is on the wall above everything else because a manager with none should
   * see an empty rail — `MANDATE`'s no-fabricated-data rule from the visual
   * side. Eight of ten managers have nothing here and the room should say so
   * rather than hide the rail until it has something on it.
   */
  {
    id: 'rings',
    kind: 'display',
    label: 'The championship rail',
    rect: [100, 56, 140, 46],
  },

  /* --- The four slots ---------------------------------------------------- */

  {
    id: 'shelf_left',
    kind: 'display',
    label: 'The left of the shelf',
    rect: [104, 152, 46, 46],
  },
  {
    id: 'shelf_right',
    kind: 'display',
    label: 'The right of the shelf',
    rect: [166, 152, 46, 46],
  },
  {
    id: 'wall',
    kind: 'display',
    label: 'The nail in the wall',
    rect: [104, 240, 46, 46],
  },
  {
    id: 'bench',
    kind: 'display',
    label: 'The workbench',
    rect: [194, 290, 46, 46],
  },

  /* --- The two the product knows ---------------------------------------- */

  /**
   * The manager, standing in their own room.
   *
   * Drawn from `character_configurations` — the same composite the customiser
   * and the profile row use, at the same 64 × 96 canvas, scaled to fill this
   * rectangle. `92 × 138` keeps the sprite's exact 2:3 aspect, so nothing is
   * stretched, and puts a person at **24% of the room's height** against Tony's
   * 35%. Tony looms over a counter on purpose; a manager standing in their own
   * basement should not.
   *
   * Its feet are at `y 494` — a hundred units below the horizon, so the figure
   * is standing **in** the room rather than against its back wall. The first
   * version put them at 444 and left a quarter of the frame as empty floor,
   * which is the *"picture that ran out"* failure `back-hall.tsx` records
   * against its own lower fifth.
   */
  {
    id: 'manager',
    kind: 'display',
    label: 'The manager',
    rect: [96, 350, 96, 144],
  },

  /**
   * The door to the corridor — where the other nine rooms are.
   *
   * `14 §5` makes basements social destinations and *"no one explains how ten
   * basements fit beneath the parlor and casino"*, which is the fiction this
   * door is the seam of. `16`'s P6 exit criterion is **visiting works**.
   *
   * It is a Display rather than a Door because it does not go anywhere by
   * itself: it opens onto a corridor, and the corridor is a row of doors with
   * names on them. A Door with no single destination would have to invent one.
   */
  {
    id: 'corridor',
    kind: 'display',
    label: 'The door to the corridor',
    rect: [246, 156, 66, 236],
  },
] as const;

export function roomObject(id: string): RoomObjectSpec {
  const found = ROOM_OBJECTS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no room object named ${id}`);
  return found;
}

/** The hit region a slot's collectible is drawn into. */
export function slotRect(slot: Slot): RoomObjectSpec['rect'] {
  return roomObject(slot).rect;
}
