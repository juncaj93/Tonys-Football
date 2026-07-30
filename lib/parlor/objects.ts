/**
 * What is in the room, and what kind of thing each one is.
 *
 * The governing rule, from `18_PARLOR_NAVIGATION_MAP.md`: **an object is
 * interactive because a manager can guess where it goes before tapping it, not
 * because it is painted well.** A booth is furniture. A window is a window.
 * Neither becomes a button by being drawn nicely.
 *
 * Four kinds, and the kind decides the treatment:
 *
 *   - **Door** — goes somewhere. Glows **only when it has something to say**.
 *   - **Display** — readable in place. Opens a panel. Never glows.
 *   - **Toy** — responds. No route, no glow.
 *   - **Scenery** — not interactive, and therefore not in this file.
 *
 * **Three Doors, four Displays, one Toy.** Eight objects.
 *
 * ## Rectangles, not polygons — and why that is not a regression
 *
 * An earlier version traced each object as an SVG polygon, on the reasoning
 * that a rectangle's glow swallows the wall beside an irregular object. That
 * reasoning was right and the solution was withdrawn anyway, because it solved
 * the problem in the wrong place: an authored polygon goes stale the moment the
 * art is regenerated, silently, and nothing fails.
 *
 * The replacement (`18 §9.4`): **glow is `filter: drop-shadow()` on an
 * overlay's own alpha channel.** It follows the silhouette exactly because it
 * *is* the silhouette, and it updates itself when the art is swapped.
 *
 * So the shapes here are hit regions and nothing else. They can be rectangles
 * because **they are never drawn**. The rule "no visible rectangles around room
 * objects" is about the glow, and the glow no longer comes from here.
 *
 * That splits the room cleanly in two:
 *
 *   - **Baked into the shell** — the board, the sign, the receipt, the tray,
 *     the doorway, the alcove. No overlay, so no alpha, so **no glow, ever**.
 *     In V1 that is exactly right: the Displays never glow by rule, and the two
 *     baked Doors have nothing to announce yet.
 *   - **Overlays** — the newspaper rack, the champion banners, the box states.
 *     These carry their own alpha, so these are the things that can glow.
 *
 * ## Hit regions are padded to 44, and the padding is deliberate
 *
 * `18 §9.4`: expand the hit region, never the glow. Several objects are drawn
 * smaller than a thumb — the receipt is 23 × 18 logical — so the region around
 * them is grown to a 44 px effective target and checked for collisions here.
 * Growing an invisible region costs nothing on screen.
 *
 * The banner row is the one documented exception: six targets on a 131-unit
 * rail cannot each be 44 wide. They are 22 × 30, which clears **WCAG 2.5.8 AA**
 * (24 CSS px) on every supported viewport and does not reach the room's
 * preferred 44 × 44 (2.5.5, AAA). See `art/B2_CHAMPION_BANNER.md`.
 */

export const ROOM = { width: 320, height: 569 } as const;

/**
 * The counter's near edge — where the shell is cut.
 *
 * The room is **one image**. Rows 0–291 are drawn behind Tony and rows 292–568
 * over him, which is what puts him *in* the shop rather than on a picture of
 * one. There is no separate foreground asset: `zone_parlor_counter_front` was
 * withdrawn precisely because two images that must stay pixel-aligned across
 * every regeneration is a defect waiting to happen.
 */
export const COUNTER_EDGE = 292;

/** Where Tony stands, and how big he is drawn. Measured on the shell. */
export const TONY = { x: 64, y: 180, width: 72, height: 197 } as const;

export type ObjectKind = 'door' | 'display' | 'toy';

export interface RoomObjectSpec {
  readonly id: string;
  readonly kind: ObjectKind;
  /** What tapping does. Spoken aloud, so it is a sentence rather than a noun. */
  readonly label: string;
  /** The hit region in room units. Never drawn. */
  readonly rect: readonly [x: number, y: number, width: number, height: number];
  /** Where it leads. Doors only. */
  readonly href?: string;
  /** The name of the place on the other side, for the accessible label. */
  readonly destination?: string;
}

/**
 * The eight.
 *
 * Coordinates are measured on `zone_parlor_shell` and recorded in
 * `art/SHELL_AUDIT_zone_parlor_shell.md §4`. Where a drawn object is smaller
 * than 44 units the region is padded around it, and the padded figure is what
 * appears here.
 */
export const ROOM_OBJECTS: readonly RoomObjectSpec[] = [
  /**
   * The left arched alcove, with the newspaper rack standing in it.
   *
   * A rack holds papers, and the Slice is a paper. Nothing about that needs
   * explaining, which is the whole test for whether an object earns a route.
   * The rack is an overlay at `(10, 224)`, so this is the one Door whose glow
   * has real alpha behind it — and it glows when a Slice is unread.
   */
  {
    id: 'slice',
    kind: 'door',
    label: 'Take the paper from the rack',
    destination: "Tony's Tuesday Slice",
    href: '/slice',
    rect: [6, 180, 45, 112],
  },

  /**
   * The large cream board on the back wall. The best surface in the room.
   *
   * Baked blank into the shell; every word on it is HTML at runtime. Shifted +5
   * so it co-centres with the championship rail above it at x 119.5.
   *
   * **The frame is `y 79–179`; the hit region starts at 88.** The banners hang
   * in front of the board's top edge — bodies to y 83, hit row to y 87 — so a
   * region that began at the frame would take the taps meant for slot 1 through
   * 6. It abuts the banner row without sharing a pixel.
   */
  {
    id: 'tonight',
    kind: 'display',
    label: "Read the board — Tonight at Tony's",
    rect: [54, 88, 132, 92],
  },

  /**
   * The championship rail.
   *
   * **A Display, not a Door.** It was reclassified because it was the one Door
   * that never glowed, and a rule with a single permanent exception is one
   * people have to remember rather than apply. Now every Door glows
   * conditionally and nothing else ever glows.
   *
   * This rect is the whole row; the six individual banner buttons are
   * partitioned out of it by `bannerPartitions()`, because each occupied banner
   * is its own target rather than one row-wide one.
   */
  {
    id: 'banners',
    kind: 'display',
    label: 'Look up at the championship banners',
    rect: [54, 58, 132, 30],
  },

  /**
   * The small dark sign to the right of Tony. Tony's weekly prediction.
   *
   * **Trigger-only.** Its usable slate is 24 units wide — too narrow to carry a
   * prediction legibly — so nothing is printed on it and tapping opens a panel.
   * Padded from 37 wide to 44.
   */
  {
    id: 'prediction',
    kind: 'display',
    label: "Read Tony's prediction",
    rect: [151, 184, 44, 59],
  },

  /**
   * The receipt lying on the counter. The manager's own record.
   *
   * **Trigger-only**, and not by preference: the paper is 23 × 18 logical, 19 ×
   * 14 of it usable, which is 57 × 42 device pixels at 3×. A name, a record and
   * a streak do not fit there at any size worth reading. The panel carries it.
   *
   * Padded from 23 × 18 to 44 × 44 **downward and to the left**, never upward.
   * The paper lies at `y 292`, exactly on the counter's edge, and Tony's region
   * ends there — so growing it up would put the receipt's target over his
   * chest and steal taps meant for him. Below it is counter and floor, which
   * nothing else claims.
   */
  {
    id: 'receipt',
    kind: 'display',
    label: 'Pick up your receipt',
    rect: [76, 292, 44, 44],
  },

  /**
   * The empty tray on the counter. Tony's Counter.
   *
   * A tray on a counter is where the thing you are buying sits. Glows when a
   * box is owned or available — and when one is, there is a box overlay whose
   * alpha carries the glow, so the affordance is real art rather than a
   * rectangle. **An owned box opens at the tray, in place**; routing to
   * `/counter` first would insert a navigation step into the most exciting
   * moment in the product.
   */
  {
    id: 'counter',
    kind: 'door',
    label: 'Look at the counter',
    destination: "Tony's Counter",
    href: '/counter',
    rect: [156, 275, 94, 44],
  },

  /**
   * The plain doorway in the right rear wall. The Back Hall.
   *
   * Unlabeled and calm in V1 — it glows only when something beyond it is open,
   * and in V1 nothing is. A doorway in the back wall goes into the back; that
   * is all it has to say. Padded from 42 wide to 44.
   */
  {
    id: 'back-hall',
    kind: 'door',
    label: 'Go through to the back',
    destination: 'The Back Hall',
    href: '/back-hall',
    rect: [202, 124, 44, 131],
  },

  /**
   * Tony. Tap him and he says something else true.
   *
   * A Toy: no route, no glow. He is the one thing in the room that responds
   * without leading anywhere, which is what makes it feel inhabited rather than
   * operated. His region stops at the counter edge, where the shell's front
   * half cuts him off.
   */
  {
    id: 'tony',
    kind: 'toy',
    label: 'Talk to Tony',
    rect: [TONY.x, TONY.y, TONY.width, COUNTER_EDGE - TONY.y],
  },
];

export function roomObject(id: string): RoomObjectSpec {
  const found = ROOM_OBJECTS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no room object named ${id}`);
  return found;
}

/**
 * The Tonight board's cream field, measured — `SHELL_AUDIT §4`.
 *
 * `111 × 79` at `(60, 93)`. This is the **art's** extent: where the cream stops
 * and the painted frame begins. Text does not go here — `TONIGHT_FIELD` is inset
 * inside it. Recorded separately so the inset is visibly derived from a
 * measurement rather than guessed.
 */
export const TONIGHT_CREAM: RoomObjectSpec['rect'] = [60, 93, 111, 79];

/**
 * Where the board's words actually go — the cream field **inset by 6 units**.
 *
 * The board is the only surface ruled *surface-rendered*: its text belongs on the
 * board's face at room scale, not only inside the panel that opens over it. A
 * blank cream rectangle is the largest object in an idle room, and an idle room is
 * what a manager sees most of the time.
 *
 * ## Why it is inset, and why that was a defect
 *
 * This used to be `TONIGHT_CREAM` itself — `60, 93, 111, 74` — so the first line's
 * cap height sat on the cream's top edge and the left of every line touched the
 * frame. Commissioner ruling, 2026-07-30: the board *"is overlapped with the
 * border of the frame"*. A sign painter leaves a margin; the frame is part of the
 * drawing and text must not crowd it.
 *
 * Six units on every side, so the text block is `99 × 67` and clears the painted
 * frame on all four sides at every supported width. What sits inside it is a hero
 * and at most one short fact (`boardFace`), centred — not the two sentences at 8px
 * and 9px that were there before.
 */
export const TONIGHT_FIELD: RoomObjectSpec['rect'] = [66, 99, 99, 67];

/**
 * The prediction sign's slate — the art's own bounds, `SHELL_AUDIT §4`.
 *
 * The sign is **trigger-only**: its slate is 24 units wide and cannot carry a
 * sentence, so the prediction lives in the panel. But baked dark and rendering
 * nothing, it was the one object in the room that looked *unloaded* rather than
 * quiet — every other empty thing here is visibly empty on purpose. The board
 * has two lines on it, the banners have years, the receipt has a name.
 *
 * So it gets a **wiped-board** treatment: two faint chalk strokes, the residue
 * of something erased. It invents no prediction — there is nothing to say until
 * Tuesday, and saying nothing is the correct content. It just says it the way a
 * chalkboard in a pizza shop would, instead of the way a failed fetch would.
 */
export const PREDICTION_SLATE: RoomObjectSpec['rect'] = [154, 184, 37, 59];

/* -------------------------------------------------------------------------
 * The tray
 * ---------------------------------------------------------------------- */

/**
 * The tray's drawn surface — `SHELL_AUDIT §4`: `156, 284, 94, 25`.
 *
 * Recorded separately from the tray Door's hit region, which is the same tray
 * padded up to a 44-unit target (`156, 275, 94, 44`). Two different questions:
 * where the tray *is* drawn, and where a thumb may land to reach it.
 */
export const TRAY_SURFACE: RoomObjectSpec['rect'] = [156, 284, 94, 25];

/**
 * Where an owned box sits on the tray.
 *
 * Derived from the tray rather than chosen: the tray runs `x 156–250`, so its
 * centre is `203`; a 44-unit box centred there spans `181–225`, comfortably
 * inside the tray's own footprint rather than overhanging it. Its base rests at
 * `y 306`, one unit above the tray's lowest drawn row (`308`, the lowest feature
 * in the whole shell), so the box sits *on* the tray instead of floating over it
 * or sinking through it. 30 units tall puts its lid at `y 276`, above the tray's
 * back edge — which is what a box on a tray looks like from this angle.
 *
 * This is the one place in the room where an overlay appears and disappears with
 * state, and it is deliberately **not** a ninth object: the box is a state of the
 * tray Door, and the Door is what takes the tap (`18 §4.1`).
 */
export const TRAY_BOX: RoomObjectSpec['rect'] = [181, 276, 44, 30];

/**
 * Where the collectible ends up when the box opens.
 *
 * **On the tray, where the box was.** An earlier version put it at `y 224`, a
 * clear 18 units above the tray's back edge, on the reasoning that the reveal
 * should rise clear of the box. On screen it read as an object hovering in front
 * of Tony's chest with nothing under it — the room has no floating things in it,
 * so a floating thing reads as a layout bug rather than as a prize.
 *
 * So it rests where the box rested: base at `y 308`, the tray's lowest drawn row,
 * centred on the tray's `x 203`. Slightly larger than the box was (46 against 44)
 * because the box is gone and this is the thing you are meant to be looking at.
 * The *rise* is the animation's job — it travels up into this position — not the
 * resting geometry's.
 */
export const TRAY_REVEAL: RoomObjectSpec['rect'] = [180, 262, 46, 46];

/**
 * The plate that names what came out, set down on the counter front.
 *
 * ## Why it is below the tray and not above it
 *
 * Above the tray is the prediction sign, the board and Tony. A plate there
 * covers the three things the room spent the most effort drawing, and a panel
 * that *replaces* the art has taken the room away (`18 §7.2.4`). Below the tray
 * is counter front — drawn, but claiming nothing and carrying no interactive
 * object.
 *
 * It is also the honest gesture: the box opens on the tray and what was inside is
 * set down on the counter in front of you. `y 316` is just past the counter's
 * front edge at logical `313`, so the plate lies on the counter rather than
 * floating over the join.
 *
 * ## No height, on purpose
 *
 * The rule is *sized to its contents* (`18 §7.2.4`), so the height is the text's
 * to decide and this anchor deliberately does not carry one. A fixed height is
 * how a panel ends up with the type shrunk to fit it, which is the mistake that
 * was made once at 15px.
 *
 * 168 of 320 units wide — a little over half the room, nowhere near the viewport
 * edges, and nowhere near the bottom of the screen. A plate on a counter, **not
 * a bottom sheet.**
 */
export const TRAY_PLATE_ANCHOR = { x: 126, y: 316, width: 168 } as const;

/** The plate's anchor as the percentages the browser wants. No height — see above. */
export function placePlate(): { left: string; top: string; width: string } {
  return {
    left: `${((TRAY_PLATE_ANCHOR.x / ROOM.width) * 100).toFixed(3)}%`,
    top: `${((TRAY_PLATE_ANCHOR.y / ROOM.height) * 100).toFixed(3)}%`,
    width: `${((TRAY_PLATE_ANCHOR.width / ROOM.width) * 100).toFixed(3)}%`,
  };
}

/** A room rectangle as the percentages the browser wants. */
export function place(rect: RoomObjectSpec['rect']): {
  left: string;
  top: string;
  width: string;
  height: string;
} {
  const [x, y, width, height] = rect;
  return {
    left: `${((x / ROOM.width) * 100).toFixed(3)}%`,
    top: `${((y / ROOM.height) * 100).toFixed(3)}%`,
    width: `${((width / ROOM.width) * 100).toFixed(3)}%`,
    height: `${((height / ROOM.height) * 100).toFixed(3)}%`,
  };
}

/** Whether two hit regions overlap. Neighbours must not steal each other's taps. */
export function overlaps(a: RoomObjectSpec, b: RoomObjectSpec): boolean {
  const [ax, ay, aw, ah] = a.rect;
  const [bx, by, bw, bh] = b.rect;
  return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;
}

/* -------------------------------------------------------------------------
 * The championship banner row
 * ---------------------------------------------------------------------- */

/**
 * Six fixed slots, and they never move.
 *
 * A banner that shifts because a season ended is a banner you have to find
 * again. Slots fill from the left, oldest first, and at season seven the
 * six-season window shifts left once rather than the banners resizing.
 *
 * Geometry reconciled against the rail rod at `x 54–184`; full derivation in
 * `art/B2_CHAMPION_BANNER.md`.
 */
export const BANNER = {
  slots: [56, 78, 100, 122, 144, 166],
  width: 18,
  height: 15,
  /** Where the banners hang from the rod. */
  top: 69,
  /** The row's hit band, inclusive: y 58–87. */
  hitTop: 58,
  hitHeight: 30,
  /**
   * **Load-bearing, not cosmetic.** Gap 4 gives a 22-unit pitch, which is 24.75
   * CSS px on a 360 px viewport — clearing WCAG 2.5.8 AA by 0.75. Gap 3 drops
   * it to 23.6 and fails. If the rod is ever re-measured narrower than 128
   * units, the answer is five slots at gap 4, never six at gap 3.
   */
  gap: 4,
} as const;

/**
 * The six hit partitions, tiled at the gap midpoints.
 *
 * Contiguous, non-overlapping, no dead zones. The two end partitions extend
 * `gap / 2` outward onto plain wall — where the tiling would have put the
 * boundary anyway had there been a seventh slot — so all six are a uniform 22
 * units. Clipping them to the outermost banner bodies instead gives 20 units,
 * which is 22.50 CSS px at 360 and **fails AA on two of the three devices this
 * room is tested on.**
 */
export function bannerPartitions(): readonly (readonly [
  x: number,
  y: number,
  width: number,
  height: number,
])[] {
  const half = BANNER.gap / 2;
  return BANNER.slots.map(
    (x) =>
      [x - half, BANNER.hitTop, BANNER.width + BANNER.gap, BANNER.hitHeight] as const,
  );
}
