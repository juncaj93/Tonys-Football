/**
 * Where you can tap in the parlor, measured on the drawing.
 *
 * The room is the navigation. There is no tab bar at the bottom of the shop —
 * you get to the Slice by looking at the poster frame by the window, and to
 * your collection by looking in the case on the counter. That only works if the
 * regions you can tap sit exactly on the objects a person believes they are
 * tapping, so every rectangle here was read off `zone_front_counter` and
 * `zone_counter_front` rather than guessed, and the arithmetic that turns them
 * into CSS is tested rather than eyeballed.
 *
 * ## The units
 *
 * The stacked room is 320 x 569, which is also its size in CSS pixels on a
 * 320px-wide phone — the narrowest still in circulation. So one unit here is
 * one CSS pixel at the worst case and more than one everywhere else, which is
 * what lets the 44px tap-target floor be checked in these units directly.
 */

export const ROOM = { width: 320, height: 569 } as const;

/**
 * The counter's near edge.
 *
 * The room is one drawing cut along this line, and the two halves are stacked
 * back with Tony between them. Everything about his placement is relative to
 * it.
 */
export const COUNTER_EDGE = 291;

/** A rectangle on the drawing. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The same rectangle, as the percentages the browser wants. */
export interface Placement {
  readonly left: string;
  readonly top: string;
  readonly width: string;
  readonly height: string;
}

/**
 * How the interactive outline is drawn.
 *
 * A rectangle around a picture frame is honest — the frame is a rectangle. A
 * rectangle around a person is a button with a man inside it, so Tony gets a
 * soft pool of warm light instead of an edge. `16 §7.1`'s room has to keep
 * reading as a room even while it is telling you what you can touch.
 */
export type Shape = 'frame' | 'case' | 'opening' | 'figure';

export interface Hotspot {
  readonly id: string;
  /** What tapping it does. Read aloud, so it is a sentence, not a noun. */
  readonly label: string;
  readonly rect: Rect;
  readonly shape: Shape;
  /** Where it leads. Absent means it opens in place, over the room. */
  readonly href?: string;
}

/** The smallest comfortable tap target, in CSS pixels. */
export const MIN_TAP = 46;

/**
 * Grow a rectangle until a thumb can hit it.
 *
 * The object stays the size the artist drew it; only the region that responds
 * grows, and it grows around the object's centre so the two stay concentric.
 * The growth is deliberately modest — a hotspot that swallows a quarter of the
 * wall would catch taps meant for the room itself.
 */
export function reachable(rect: Rect): Rect {
  const grow = (start: number, extent: number): [number, number] => {
    if (extent >= MIN_TAP) return [start, extent];
    const margin = (MIN_TAP - extent) / 2;
    return [start - margin, extent + 2 * margin];
  };

  const [x, width] = grow(rect.x, rect.width);
  const [y, height] = grow(rect.y, rect.height);

  return { x, y, width, height };
}

/** A rectangle on the drawing, as percentages of the room. */
export function place(rect: Rect): Placement {
  return {
    left: `${((rect.x / ROOM.width) * 100).toFixed(3)}%`,
    top: `${((rect.y / ROOM.height) * 100).toFixed(3)}%`,
    width: `${((rect.width / ROOM.width) * 100).toFixed(3)}%`,
    height: `${((rect.height / ROOM.height) * 100).toFixed(3)}%`,
  };
}

/**
 * Tony.
 *
 * 88 x 240 of asset drawn 72 x 197 of room, which lands at 1:1 in CSS pixels on
 * a 390px phone. He stands in the clear lane between the soda fountain, which
 * ends at x=118 on the drawing, and the warmer, which begins at x=183 — so he
 * is neither in front of the machine nor in front of the glass, and the only
 * thing he overlaps is the wall.
 *
 * He runs past `COUNTER_EDGE` on purpose. The part below it is drawn and then
 * covered by the counter front, which is what puts him behind the counter
 * instead of on top of it.
 */
export const TONY: Rect = { x: 95, y: 179, width: 72, height: 197 };

/**
 * What you can tap, and what it is.
 *
 * Tony's own region stops at the counter, because that is all of him you can
 * see and therefore all of him you would think to touch.
 */
export const HOTSPOTS: readonly Hotspot[] = [
  {
    id: 'tony',
    label: 'Talk to Tony',
    rect: { x: TONY.x, y: TONY.y, width: TONY.width, height: COUNTER_EDGE - TONY.y },
    shape: 'figure',
  },
  {
    id: 'tonight',
    label: 'Read the notice in the frame on the wall',
    rect: { x: 34, y: 105, width: 21, height: 47 },
    shape: 'frame',
  },
  {
    id: 'slice',
    label: 'Check the poster frame by the window',
    rect: { x: 244, y: 117, width: 16, height: 43 },
    shape: 'frame',
    href: '/slice',
  },
  {
    id: 'collection',
    label: 'Look in the display case on the counter',
    rect: { x: 185, y: 240, width: 70, height: 40 },
    shape: 'case',
    href: '/collection',
  },
  {
    id: 'rooms',
    label: 'Go through to the booths at the back',
    rect: { x: 272, y: 200, width: 48, height: 68 },
    shape: 'opening',
    href: '/rooms',
  },
];

export function hotspot(id: string): Hotspot {
  const found = HOTSPOTS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no hotspot named ${id}`);
  return found;
}

/** Whether two rectangles share any area at all. */
export function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}
