/**
 * What is in the room, and what kind of thing each one is.
 *
 * The governing rule, from the approved ruling: **an object is interactive
 * because it has an understandable purpose, not because it appears in the
 * artwork.** A booth is furniture. A window is a window. Neither becomes a
 * button by being painted well.
 *
 * Four kinds, and the kind decides the treatment:
 *
 *   - **Door** — goes somewhere. The *only* kind that gets a persistent
 *     highlight, and only while it is available. A locked Door is visible and
 *     never highlighted; tapping it gets a line from Tony rather than a modal
 *     apologising for the future.
 *   - **Display** — readable in place. No route, no highlight.
 *   - **Toy** — responds. No route, no highlight.
 *   - **Scenery** — not interactive at all, and therefore not in this file.
 *
 * ## The shapes are polygons, not rectangles
 *
 * Each object carries the outline of the thing itself, traced in the drawing's
 * own 320 x 569 units. That does two jobs at once: it is what the glow is
 * drawn along, so the light follows the glass case rather than boxing it, and
 * it is the hit region, so tapping the wall beside an object does nothing.
 *
 * A rectangle could do neither. The old system had both problems — a glowing
 * rectangle of wall around a small object, and a tap target that caught the
 * wall next to it.
 */

export const ROOM = { width: 320, height: 569 } as const;

/**
 * The counter's near edge.
 *
 * The room is one drawing cut along this line and stacked back with Tony
 * between the halves.
 */
export const COUNTER_EDGE = 291;

export type ObjectKind = 'door' | 'display' | 'toy';

export interface RoomObjectSpec {
  readonly id: string;
  readonly kind: ObjectKind;
  /** What tapping does. Spoken aloud, so it is a sentence rather than a noun. */
  readonly label: string;
  /**
   * The object's outline in room units, as `x,y` pairs.
   *
   * Traced off the art. This is both the glow path and the hit region.
   */
  readonly shape: readonly (readonly [number, number])[];
  /** Where it leads. Doors only, and only while they are open. */
  readonly href?: string;
  /** The name of the place on the other side, for the report and the label. */
  readonly destination?: string;
}

/**
 * Tony's own rectangle.
 *
 * Not in the object list as geometry — he is drawn between the two halves of
 * the room rather than painted into either — but the parlor needs his mark to
 * place the sprite.
 */
export const TONY = { x: 95, y: 179, width: 72, height: 197 } as const;

/**
 * The map.
 *
 * Three entries, which is every object the approved artwork actually contains
 * out of the nine the ruling names. The other six — the newspaper rack, the
 * trophy wall, the chalkboard, the basement door, the boarded door and the
 * receipt on the counter — are not painted in `zone_front_counter` or
 * `zone_counter_front`. They are listed as art requests rather than mapped
 * onto whichever fixture happens to be nearest, because a Door that is really
 * a soda fountain teaches the room's grammar wrong on the first tap.
 */
export const ROOM_OBJECTS: readonly RoomObjectSpec[] = [
  /**
   * The lit case on the counter. The one Door the artwork supports.
   *
   * Traced along the glass: the top face tilts a little with the room's
   * perspective, which is why this is a quadrilateral rather than a box.
   */
  {
    id: 'collection',
    kind: 'door',
    label: 'Look in the display case',
    destination: 'Collection',
    href: '/collection',
    shape: [
      [186, 247],
      [263, 243],
      [264, 286],
      [185, 287],
    ],
  },

  /**
   * The blank framed board on the left wall.
   *
   * The ruling puts Tonight at Tony's on "the board by the door". There is no
   * door in frame; this is the room's only blank notice board, and a notice
   * board is what the Display needs. Flagged in the report as an
   * interpretation rather than a match.
   *
   * Widened from the frame's 24 units to 46 so a thumb can hit it, centred on
   * the frame so it stays concentric. It carries no visible treatment, so the
   * extra width costs nothing on screen — the rule about not creating empty
   * rectangles is about the *glow*, and this object has none.
   */
  {
    id: 'tonight',
    kind: 'display',
    label: "Read the board — Tonight at Tony's",
    shape: [
      [22, 104],
      [68, 104],
      [68, 159],
      [22, 159],
    ],
  },

  /**
   * Tony. Tap him and he says something else true.
   *
   * A Toy: no route, no highlight by default, and cooldown-limited so he cannot
   * be made to recite the whole catalogue in ten seconds.
   *
   * ## Why he is traced rather than boxed
   *
   * The first version was `TONY`'s own rectangle, and on a phone it read as a
   * picture frame with a man inside it — the exact thing the treatment is meant
   * to avoid, and worse here than anywhere else because it also fenced in a
   * slice of the mural and the pizza boxes behind him. So this follows him:
   * narrow across the hairline, out to the shoulders, down the arms, and along
   * the counter's edge where the front layer cuts him off.
   *
   * It is deliberately generous rather than exact. A silhouette tight enough to
   * miss between his arm and his apron would be a worse tap target than a
   * rectangle, and nothing else is close enough to steal a tap from.
   */
  {
    id: 'tony',
    kind: 'toy',
    label: 'Talk to Tony',
    shape: [
      [117, 179], // hairline, left
      [152, 179], // hairline, right
      [157, 196], // jaw
      [168, 208], // right shoulder
      [170, 262], // right arm
      [167, COUNTER_EDGE],
      [97, COUNTER_EDGE],
      [95, 262], // left arm
      [95, 208], // left shoulder
      [113, 196], // jaw
    ],
  },
];

export function roomObject(id: string): RoomObjectSpec {
  const found = ROOM_OBJECTS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no room object named ${id}`);
  return found;
}

/** `"186,247 263,243 …"` — the attribute an SVG polygon wants. */
export function points(spec: RoomObjectSpec): string {
  return spec.shape.map(([x, y]) => `${String(x)},${String(y)}`).join(' ');
}

/** The smallest box containing a shape. Used for the tap-size checks. */
export function bounds(spec: RoomObjectSpec): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const xs = spec.shape.map(([x]) => x);
  const ys = spec.shape.map(([, y]) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Whether two shapes' bounding boxes touch. Neighbours must never overlap. */
export function boundsOverlap(a: RoomObjectSpec, b: RoomObjectSpec): boolean {
  const p = bounds(a);
  const q = bounds(b);
  return (
    p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height
  );
}
