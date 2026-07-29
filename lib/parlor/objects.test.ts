import { describe, expect, it } from 'vitest';

import {
  COUNTER_EDGE,
  ROOM,
  ROOM_OBJECTS,
  bounds,
  boundsOverlap,
  points,
  roomObject,
} from './objects';

/**
 * The room's grammar, asserted.
 *
 * The ruling makes one rule load-bearing — **only available Doors are
 * highlighted** — and several others that are easy to break silently: a tap
 * target smaller than a thumb, two objects overlapping, a Door that leads
 * nowhere, a Display that has quietly acquired a route.
 *
 * A hotspot is invisible most of the time, so none of this can be checked by
 * looking at the screen.
 */

/** One room unit is one CSS pixel on a 320px phone, the narrowest supported. */
const MIN_TAP = 44;

describe('the room objects', () => {
  it('holds only the objects the artwork actually contains', () => {
    expect(ROOM_OBJECTS.map((o) => o.id).sort()).toEqual(['collection', 'tonight', 'tony']);
  });

  /** The rule the whole ruling turns on. */
  it('gives a route to Doors and to nothing else', () => {
    for (const spec of ROOM_OBJECTS) {
      if (spec.kind === 'door') {
        expect(spec.href, spec.id).toBeDefined();
        expect(spec.destination, spec.id).toBeDefined();
      } else {
        expect(spec.href, spec.id).toBeUndefined();
        expect(spec.destination, spec.id).toBeUndefined();
      }
    }
  });

  it('opens exactly one Door, and it is the display case', () => {
    const doors = ROOM_OBJECTS.filter((o) => o.kind === 'door');
    expect(doors).toHaveLength(1);
    expect(doors[0]?.href).toBe('/collection');
    expect(doors[0]?.destination).toBe('Collection');
  });

  it('leaves the booths, the frames and the window out of it entirely', () => {
    // Scenery is absent rather than present-and-disabled: an object that is
    // not in this list cannot acquire a tap handler by accident.
    for (const gone of ['rooms', 'slice', 'booths', 'poster', 'window', 'keys', 'office']) {
      expect(() => roomObject(gone)).toThrow();
    }
  });

  it('never lets a thumb miss one', () => {
    for (const spec of ROOM_OBJECTS) {
      const box = bounds(spec);
      expect(box.width, spec.id).toBeGreaterThanOrEqual(MIN_TAP);
      expect(box.height, spec.id).toBeGreaterThanOrEqual(MIN_TAP);
    }
  });

  it('never lets two of them touch', () => {
    for (let i = 0; i < ROOM_OBJECTS.length; i++) {
      for (let j = i + 1; j < ROOM_OBJECTS.length; j++) {
        const a = ROOM_OBJECTS[i]!;
        const b = ROOM_OBJECTS[j]!;
        expect(boundsOverlap(a, b), `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it('keeps every shape inside the room', () => {
    for (const spec of ROOM_OBJECTS) {
      for (const [x, y] of spec.shape) {
        expect(x, spec.id).toBeGreaterThanOrEqual(0);
        expect(y, spec.id).toBeGreaterThanOrEqual(0);
        expect(x, spec.id).toBeLessThanOrEqual(ROOM.width);
        expect(y, spec.id).toBeLessThanOrEqual(ROOM.height);
      }
    }
  });

  /**
   * A traced outline, not a box. Three points would be a triangle and four in
   * a perfect rectangle would mean somebody gave up and drew a box — the case
   * genuinely leans, because the room has perspective.
   */
  it('traces shapes rather than boxing them', () => {
    for (const spec of ROOM_OBJECTS) {
      expect(spec.shape.length, spec.id).toBeGreaterThanOrEqual(4);
    }

    const glass = roomObject('collection');
    const topEdge = new Set(glass.shape.slice(0, 2).map(([, y]) => y));
    expect(topEdge.size, 'the case follows the room perspective').toBeGreaterThan(1);
  });

  /**
   * Tony especially.
   *
   * His first shape was `TONY`'s rectangle, and outlined it read as a picture
   * frame with a man inside it. The fix is a silhouette, and the thing that
   * makes it one is that he is narrower at the head than at the shoulders — so
   * that is what is asserted, rather than a point count anybody could satisfy
   * by splitting a corner in two.
   */
  it('follows Tony rather than framing him', () => {
    const tony = roomObject('tony');
    const widthAt = (y: number) => {
      const xs = tony.shape.filter(([, at]) => at === y).map(([x]) => x);
      return Math.max(...xs) - Math.min(...xs);
    };

    expect(widthAt(179), 'across the hairline').toBeLessThan(widthAt(COUNTER_EDGE));
    expect(bounds(tony).height, 'from his hair to the counter').toBeGreaterThan(100);
  });

  it('gives every object a spoken label', () => {
    for (const spec of ROOM_OBJECTS) {
      expect(spec.label, spec.id).toMatch(/^(Talk|Read|Look|Go|Check)\b/);
    }
  });

  it('renders a shape as SVG points', () => {
    expect(points(roomObject('collection'))).toBe('186,247 263,243 264,286 185,287');
  });

  it('refuses an unknown object loudly', () => {
    expect(() => roomObject('vending_machine')).toThrow(/vending_machine/);
  });
});
