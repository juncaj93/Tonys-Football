import { describe, expect, it } from 'vitest';

import {
  COUNTER_EDGE,
  HOTSPOTS,
  MIN_TAP,
  ROOM,
  TONY,
  hotspot,
  overlaps,
  place,
  reachable,
} from './hotspots';

/**
 * The room is the navigation, so these rectangles are the whole interface.
 *
 * A tab bar can be checked by looking at it. A hotspot cannot: it is invisible
 * most of the time, it is expressed in percentages, and the failure modes are
 * quiet — a target a thumb misses, or one that has crept over its neighbour and
 * opens the wrong thing. So the geometry is asserted here rather than trusted.
 */

describe('the parlor hotspots', () => {
  it('reaches every closed door in the shop', () => {
    expect(HOTSPOTS.map((spot) => spot.id).sort()).toEqual([
      'collection',
      'rooms',
      'slice',
      'tonight',
      'tony',
    ]);
  });

  it('gives every one of them a spoken label', () => {
    for (const spot of HOTSPOTS) {
      expect(spot.label.length, spot.id).toBeGreaterThan(8);
      // A label is read aloud in place of the object, so it says what tapping
      // does. "Display case" tells a screen reader nothing it can act on.
      expect(spot.label, spot.id).toMatch(/^(Talk|Read|Check|Look|Go)\b/);
    }
  });

  /**
   * One unit is one CSS pixel on a 320px phone, which is the narrowest still in
   * circulation — so this is the floor, and every wider screen exceeds it.
   */
  it('leaves nothing smaller than a thumb', () => {
    for (const spot of HOTSPOTS) {
      const grown = reachable(spot.rect);
      expect(grown.width, spot.id).toBeGreaterThanOrEqual(MIN_TAP);
      expect(grown.height, spot.id).toBeGreaterThanOrEqual(MIN_TAP);
    }
  });

  it('keeps the object and its tap area concentric', () => {
    for (const spot of HOTSPOTS) {
      const grown = reachable(spot.rect);
      expect(grown.x + grown.width / 2, spot.id).toBeCloseTo(spot.rect.x + spot.rect.width / 2, 5);
      expect(grown.y + grown.height / 2, spot.id).toBeCloseTo(spot.rect.y + spot.rect.height / 2, 5);
    }
  });

  /** Tapping the case must never open the booths. */
  it('never lets two of them touch, even after growing', () => {
    const grown = HOTSPOTS.map((spot) => ({ id: spot.id, rect: reachable(spot.rect) }));

    for (let i = 0; i < grown.length; i++) {
      for (let j = i + 1; j < grown.length; j++) {
        const a = grown[i]!;
        const b = grown[j]!;
        expect(overlaps(a.rect, b.rect), `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  /**
   * The other half of the same worry: a target big enough to be easy is also
   * big enough to swallow the room. Nothing may claim a tenth of the parlor.
   */
  it('never lets one of them swallow the room', () => {
    const roomArea = ROOM.width * ROOM.height;

    for (const spot of HOTSPOTS) {
      const grown = reachable(spot.rect);
      expect((grown.width * grown.height) / roomArea, spot.id).toBeLessThan(0.1);
    }
  });

  it('keeps every one of them inside the room', () => {
    for (const spot of HOTSPOTS) {
      const grown = reachable(spot.rect);
      expect(grown.x, spot.id).toBeGreaterThanOrEqual(0);
      expect(grown.y, spot.id).toBeGreaterThanOrEqual(0);
      expect(grown.x + grown.width, spot.id).toBeLessThanOrEqual(ROOM.width);
      expect(grown.y + grown.height, spot.id).toBeLessThanOrEqual(ROOM.height);
    }
  });

  /**
   * Tony is drawn past the cut and then covered by it. If he ever stopped at
   * the counter line he would be standing in front of the counter rather than
   * behind it, and the whole layering trick would be off.
   */
  it('runs Tony under the counter rather than up to it', () => {
    expect(TONY.y + TONY.height).toBeGreaterThan(COUNTER_EDGE);
    // ...but his face has to clear it by a comfortable margin.
    expect(COUNTER_EDGE - TONY.y).toBeGreaterThan(90);
  });

  it('stops his tap area where the counter hides him', () => {
    const tony = hotspot('tony');
    expect(tony.rect.y + tony.rect.height).toBe(COUNTER_EDGE);
  });

  it('draws a pool of light around Tony rather than a box', () => {
    expect(hotspot('tony').shape).toBe('figure');
  });

  it('converts a rectangle to percentages of the room', () => {
    expect(place({ x: 160, y: 0, width: 32, height: 569 })).toEqual({
      left: '50.000%',
      top: '0.000%',
      width: '10.000%',
      height: '100.000%',
    });
  });

  it('refuses an unknown hotspot loudly', () => {
    expect(() => hotspot('vending_machine')).toThrow(/vending_machine/);
  });

  /**
   * With the tab bar gone the room is the only way through the shop, so every
   * screen V1 has must be reachable from an object in it. A destination that
   * exists and cannot be walked to is a room with no door.
   */
  it('opens a door to every screen the shop has', () => {
    const destinations = HOTSPOTS.flatMap((spot) => (spot.href === undefined ? [] : [spot.href]));

    expect(destinations.sort()).toEqual(['/collection', '/rooms', '/slice']);
  });

  it('opens the rest in place, over the room', () => {
    expect(hotspot('tony').href).toBeUndefined();
    expect(hotspot('tonight').href).toBeUndefined();
  });
});
