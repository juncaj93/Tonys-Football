import { ROOM, type RoomObjectSpec } from '@/lib/parlor/objects';

/**
 * What is in a manager's room.
 *
 * The same grammar as the parlor and the back hall, deliberately: **one portrait
 * shell plus transparent hit regions**, rectangles because they are never drawn,
 * and an object earning a place only if a manager can guess what it does before
 * tapping it (`18 §1`, `16`'s architecture invariants).
 *
 * ## The geometry is derived from the approved room reference
 *
 * **Commissioner direction, 2026-08-09.** The first version of this room was
 * laid out against nothing — a shelf plank, a nail and a workbench invented to
 * fill a portrait rectangle — and it read as *"flat walls, simplistic stairs,
 * crude rectangles, under-detailed props, weak atmosphere."* There is now an
 * approved reference for what this space is: a real basement under an old pizza
 * place, block walls, exposed joists and pipes, a wooden staircase with light at
 * the top, one hanging enamel lamp, a clean display wall on the back wall, a
 * pennant, a shelf, a desk, and a rug with room to stand on.
 *
 * **Every rectangle below is measured off the delivered storeroom shell**
 * (`zone_room_shell_storeroom`, 2026-08-10), so a tap lands on the furniture a
 * manager can actually see. The brief was written first and the art came back
 * close but not exact — a generated image never hits a coordinate table — so
 * the geometry was aligned to the art rather than the art being sent back.
 *
 * **The storeroom is now the master.** `docs/art/BATCH_E_BASEMENT_HANDOFF.md`
 * carries these same numbers so the two outstanding shells are drawn to the room
 * that exists: the rec room and the cold store are *the same room refitted*, and
 * a fixture that moved between themes would move a manager's things when they
 * changed the walls.
 *
 * ## The room is the size of every other room
 *
 * `BACK_HALL = ROOM` for the reason `lib/backhall/objects.ts` gives — one
 * coordinate system and one `place()`, so walking between rooms does not change
 * the size of the world. This is the third room and it keeps that. The delivered
 * shell is 940 × 1672, an aspect of 0.5622 against this room's 0.5624, so it
 * transfers with no crop and no stretch worth measuring.
 *
 * ## Eight objects, and what is deliberately not one of them
 *
 * Four **slots** you can put something in, two **things the product knows about
 * you** that you cannot edit, one **way out**, and one **way to the neighbours**.
 *
 * Not objects, permanently: the lamp, the pipes, the joists, the window, the
 * side table, the radio, the milk crate, the rug, the walls, the floor.
 * `18 §3.6` — most of a room is scenery, and the reference is full of it on
 * purpose. A crate that opened a panel saying "a crate" is the failure the
 * mandate calls a generic web box wearing pixel art.
 *
 * ## Why the slots are Displays and not a fifth kind
 *
 * `18 §2` gives four kinds and a slot is a Display: it shows live content in
 * place and opens a panel. It is not a Door (no route), not a Toy (it carries
 * information). That it happens to be *editable* is a property of the panel, not
 * of the object.
 */

/** A room is a room. Same coordinate system as the parlor and the back hall. */
export const MANAGER_ROOM = ROOM;

/**
 * Where the floor meets the back wall, **measured off the delivered shell**.
 *
 * Used only by the drawn stand-in now — the storeroom draws its painted shell —
 * so its job is to keep the two themes still on geometry looking like the same
 * room as the one that has art.
 */
export const HORIZON = 340;

/** Where the ceiling's joists stop and the block wall starts. Same source. */
export const CEILING = 62;

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
 *
 * **`bench` is called the desk**, and that is the one name that drifted from its
 * stored value. The reference has a desk where the first version had a
 * workbench, and `room_slot` is a Postgres enum — migrating four enum values to
 * rename one label would be a migration bought entirely with vocabulary. The
 * stored value stays `bench`; every word a manager reads says desk.
 */
export const SLOT_NAMES: Readonly<Record<Slot, string>> = {
  shelf_left: 'the shelf, left',
  shelf_right: 'the shelf, right',
  wall: 'the display wall',
  bench: 'the desk',
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
  wall: 'A clean wall, waiting for something worth hanging.',
  bench: 'The desk is clear.',
};

/**
 * The eight, laid out against the reference.
 *
 * Every region clears **44 CSS px on the narrowest supported phone** — 360 px
 * across a 320-unit room, so 39.1 room units. `objects.test.ts` fails the build
 * if any two of them touch or if any falls outside the room.
 */
export const ROOM_OBJECTS: readonly RoomObjectSpec[] = [
  /**
   * The staircase back up to the hall — the left third of the room.
   *
   * The reference makes this the room's largest single feature: a full wooden
   * flight in its own framed opening, rising to a lit doorway with a curtain
   * beside it. That is also the honest scale — it is how you got in, and the
   * first version's narrow ladder against the wall was the clearest single
   * symptom of *"simplistic stairs"*.
   */
  {
    id: 'stairs',
    kind: 'door',
    label: 'Back up the stairs',
    destination: 'the hall',
    href: '/back-hall',
    rect: [48, 92, 82, 240],
  },

  /**
   * The pennant rail — **derived, and not a slot.**
   *
   * Rings are granted from verified titles (`lib/counter/rings.ts`) and cannot
   * be placed, moved or taken down. That is the difference between the two kinds
   * of thing in this room said in geometry: the shelf holds what you *chose*,
   * this holds what you *won*, and nothing about the second is a preference.
   *
   * The reference hangs a felt pennant high on the back wall, which is the
   * product's existing championship vocabulary — `object_champion_banner` is a
   * pennant and the parlor's own rail hangs six of them. Reusing it means a
   * manager reads a title before anything explains it.
   *
   * Drawn whether or not anything hangs from it. Eight of ten managers have won
   * nothing, and a rail that appeared the day you won would take the meaning out
   * of the day you won.
   */
  {
    id: 'rings',
    kind: 'display',
    label: 'The pennant rail',
    rect: [136, 96, 118, 40],
  },

  /* --- The four slots ---------------------------------------------------- */

  /**
   * The display wall above the hearth — the room's largest display surface.
   *
   * This used to be a permanent empty picture frame. That made every wall item
   * look like a small object floating inside somebody else's decor — the CRT
   * television was the obvious failure. The rebuilt shell is intentionally
   * blank, with discreet hooks: wall decor now owns the wall rather than being
   * trapped inside a generic frame.
   *
   * Its hit region is the deliberate hanging area; the collectible is drawn 46
   * × 46 at its centre (`SLOT_ART`), because a sprite stretched to fill a wall
   * be the fractional resample the pipeline exists to prevent.
   */
  {
    id: 'wall',
    kind: 'display',
    label: 'The display wall',
    rect: [150, 140, 100, 72],
  },

/** The left of the shelf under the display wall. */
  {
    id: 'shelf_left',
    kind: 'display',
    label: 'The left of the shelf',
    rect: [140, 216, 46, 46],
  },
  /** The right of the same plank. */
  {
    id: 'shelf_right',
    kind: 'display',
    label: 'The right of the shelf',
    rect: [196, 216, 46, 46],
  },

  /**
   * The desk — `04 §10`'s "special display slot".
   *
   * The one surface in the room at working height, which is why the thing put
   * there reads as chosen rather than stored. The stored enum value is still
   * `bench`; see {@link SLOT_NAMES}.
   */
  {
    id: 'bench',
    kind: 'display',
    label: 'The desk',
    rect: [256, 286, 60, 60],
  },

  /* --- The two the product knows ---------------------------------------- */

  /**
   * The manager, standing on the rug.
   *
   * Drawn from `character_configurations` — the same composite the customiser
   * and the profile row use, at the same 64 × 96 canvas, scaled to fill this
   * rectangle. `112 × 168` keeps the sprite's exact 2:3 aspect, so nothing is
   * stretched.
   *
   * **29.5% of the room's height**, up from the first version's 24%, against
   * Tony's 35%. The reference sets it: a person standing on that rug reads as
   * somebody *in* the room rather than a figure placed against its back wall.
   * Tony still looms more, which is right — he is behind a counter and this is
   * a manager in their own basement.
   *
   * Feet at `y 488`, well below the horizon, with eighty units of rug in front
   * of them. The first version left a quarter of the frame as empty floor, which
   * is the *"picture that ran out"* failure `back-hall.tsx` records against its
   * own lower fifth.
   */
  {
    id: 'manager',
    kind: 'display',
    label: 'The manager',
    rect: [126, 334, 112, 168],
  },

  /**
   * The cork noticeboard on the right wall — the way to the other rooms.
   *
   * `14 §5` makes basements social destinations and *"no one explains how ten
   * basements fit beneath the parlor and casino"*. The reference answers that
   * better than a second door would: **a board with everybody pinned to it.**
   *
   * The first version called this "the door to the corridor" and drew a plain
   * door in the back wall, which meant a manager tapped a door and got a list —
   * a door that opens onto a menu. A noticeboard *is* a list, in world, and
   * taking a name off it and walking to that room needs no fiction at all.
   *
   * It stays a Display rather than a Door because it has no single destination.
   */
  {
    id: 'corridor',
    kind: 'display',
    label: 'The noticeboard',
    rect: [280, 118, 40, 112],
  },
] as const;

export function roomObject(id: string): RoomObjectSpec {
  const found = ROOM_OBJECTS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no room object named ${id}`);
  return found;
}

/**
 * Where a slot's collectible is **drawn**, which is not always where it is
 * **tapped**.
 *
 * Every collectible is authored 46 × 46 (`lib/assets/art-slots.test.ts` pins it
 * against `TRAY_REVEAL`) and the pipeline's rule 4 is *one art pixel is one room
 * unit* — so a sprite always occupies exactly 46 × 46 here, whatever the
 * furniture around it is.
 *
 * The hit regions are a different question and are sized for a **thumb**: the
 * display wall is 116 × 78 because that is a reachable hanging area, and the desk is 60 × 60 because
 * that is the desktop. Collapsing the two would either shrink the targets to
 * sprite size or stretch every sprite to its furniture, and the second is the
 * fractional resample this whole pipeline exists to avoid.
 *
 * `objects.test.ts` asserts every art rect is exactly 46 × 46 and sits inside
 * its own hit region.
 */
export const SLOT_ART: Readonly<Record<Slot, RoomObjectSpec['rect']>> = {
  // Standing on the shelf, where the hit region already is.
  shelf_left: [140, 216, 46, 46],
  shelf_right: [196, 216, 46, 46],
  // Centred in the deliberate blank hanging area.
  wall: [177, 153, 46, 46],
  // Standing on the desktop, not floating in the middle of the desk.
  bench: [263, 292, 46, 46],
};

/** The hit region a slot is tapped in. */
export function slotRect(slot: Slot): RoomObjectSpec['rect'] {
  return roomObject(slot).rect;
}

/** The 46 × 46 rectangle a slot's collectible is drawn into. */
export function slotArtRect(slot: Slot): RoomObjectSpec['rect'] {
  return SLOT_ART[slot];
}

/**
 * Where the pennants hang on the rail.
 *
 * Same pitch as the parlor's banner rail — 18 wide on a 22-unit spacing — so the
 * two rails are visibly the same fitting. Six fit across the 134-unit rod, which
 * is more titles than this league can produce before the point is moot.
 */
export const PENNANT = Object.freeze({
  width: 18,
  height: 15,
  pitch: 22,
  /** Inset from the rail's own rectangle, so they hang from the rod. */
  offsetX: 4,
  offsetY: 26,
  /**
   * How many hang on the wall. The panel lists every one.
   *
   * **Five, not six.** The rod in the delivered shell is 114 units wide, and at
   * the parlor's own 22-unit pitch that fits five. Narrowing the pitch to force a
   * sixth would make this rail visibly a different fitting from the one in the
   * shop, which is the whole reason a pennant reads as a championship here
   * without being explained. Five titles is already past this league's horizon,
   * and the panel is the record either way.
   */
  shown: 5,
});
