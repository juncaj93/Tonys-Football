import { describe, expect, it } from 'vitest';

import {
  BANNER,
  COUNTER_EDGE,
  ROOM,
  ROOM_OBJECTS,
  TONY,
  bannerPartitions,
  overlaps,
  roomObject,
} from './objects';

/**
 * The room's map, asserted.
 *
 * Two things are worth testing here and they are different. **The taxonomy** —
 * eight objects in a fixed 3/4/1 split, because the count and the split are
 * user-facing architecture that a casual edit should not be able to change
 * quietly. And **the geometry** — that every region is reachable by a thumb,
 * inside the room, and not stealing its neighbour's taps.
 *
 * The geometry half exists because none of it is visible. A hit region that has
 * drifted onto the wall, or grown over the object beside it, looks exactly like
 * one that has not.
 */

/** The smallest supported viewport. Every CSS-pixel figure below is measured here. */
const NARROWEST_VIEWPORT = 360;
const scale = NARROWEST_VIEWPORT / ROOM.width;

/** WCAG 2.5.8 Target Size (Minimum), AA. */
const AA = 24;
/** The room's own preferred size — WCAG 2.5.5 Target Size (Enhanced), AAA. */
const PREFERRED = 44;

describe('the object map', () => {
  it('has exactly eight objects', () => {
    expect(ROOM_OBJECTS).toHaveLength(8);
  });

  it('is three Doors, four Displays and one Toy', () => {
    // The banner rail moved from Door to Display, which is why this is 3/4/1
    // and not 4/3/1. It was the one Door that never glowed, so the glow rule is
    // now uniform: every Door glows conditionally, nothing else ever glows.
    const byKind = (kind: string) => ROOM_OBJECTS.filter((o) => o.kind === kind);

    expect(byKind('door').map((o) => o.id)).toEqual(['slice', 'counter', 'back-hall']);
    expect(byKind('display').map((o) => o.id)).toEqual([
      'tonight',
      'banners',
      'prediction',
      'receipt',
    ]);
    expect(byKind('toy').map((o) => o.id)).toEqual(['tony']);
  });

  it('gives every Door somewhere to go, and nothing else a route', () => {
    for (const object of ROOM_OBJECTS) {
      if (object.kind === 'door') {
        expect(object.href, object.id).toBeDefined();
        expect(object.destination, object.id).toBeDefined();
      } else {
        expect(object.href, `${object.id} is not a Door and must not navigate`).toBeUndefined();
      }
    }
  });

  it('routes only to destinations the ruling names', () => {
    // `/collection` is not a route. The countertop tray leads to `/counter`,
    // and Rooms and Underground live behind `/back-hall` rather than on the
    // homepage.
    const routes = ROOM_OBJECTS.flatMap((o) => (o.href === undefined ? [] : [o.href]));

    expect(routes).toEqual(['/slice', '/counter', '/back-hall']);
    expect(routes).not.toContain('/collection');
    expect(routes).not.toContain('/rooms');
    expect(routes).not.toContain('/underground');
  });

  it('describes every object as an action rather than a noun', () => {
    // The label is read aloud, so "Talk to Tony" and not "Tony".
    for (const object of ROOM_OBJECTS) {
      expect(object.label.length, object.id).toBeGreaterThan(4);
      expect(object.label, object.id).toMatch(/^[A-Z]/);
    }
  });
});

describe('the hit regions', () => {
  it('stay inside the room', () => {
    for (const { id, rect } of ROOM_OBJECTS) {
      const [x, y, width, height] = rect;
      expect(x, id).toBeGreaterThanOrEqual(0);
      expect(y, id).toBeGreaterThanOrEqual(0);
      expect(x + width, id).toBeLessThanOrEqual(ROOM.width);
      expect(y + height, id).toBeLessThanOrEqual(ROOM.height);
    }
  });

  it('never overlap', () => {
    // A region that has grown over its neighbour steals taps, invisibly.
    for (const a of ROOM_OBJECTS) {
      for (const b of ROOM_OBJECTS) {
        if (a.id === b.id) continue;
        expect(overlaps(a, b), `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it('reach the preferred 44 x 44 everywhere except the banner row', () => {
    for (const { id, rect } of ROOM_OBJECTS) {
      if (id === 'banners') continue; // the one documented exception, below
      const [, , width, height] = rect;
      expect(width, `${id} is ${String(width)} wide`).toBeGreaterThanOrEqual(PREFERRED);
      expect(height, `${id} is ${String(height)} tall`).toBeGreaterThanOrEqual(PREFERRED);
    }
  });

  it('keeps Tony behind the counter edge', () => {
    const [, y, , height] = roomObject('tony').rect;
    expect(y).toBe(TONY.y);
    // The shell's front half is drawn over him from here down, so a region that
    // continued past it would take taps on painted counter.
    expect(y + height).toBe(COUNTER_EDGE);
  });
});

/**
 * The banner row, which is where the accessibility argument actually lives.
 *
 * Six targets cannot each be 44 units wide on a 131-unit rail — that is
 * arithmetic, not a compromise. What they *can* be is uniform and above the AA
 * floor, and this is where that is checked, on the narrowest supported viewport
 * rather than the widest. Measuring only the widest is exactly how the row was
 * first recorded as passing when it did not.
 */
describe('the banner row', () => {
  const partitions = bannerPartitions();

  it('has one partition per slot', () => {
    expect(partitions).toHaveLength(BANNER.slots.length);
    expect(BANNER.slots).toHaveLength(6);
  });

  it('is a uniform pitch, so no banner is harder to hit than another', () => {
    const widths = new Set(partitions.map(([, , width]) => width));
    expect([...widths]).toEqual([BANNER.width + BANNER.gap]);
  });

  it('clears WCAG 2.5.8 AA on the narrowest supported viewport', () => {
    for (const [, , width, height] of partitions) {
      expect(
        width * scale,
        `${String(width)} units at ${String(NARROWEST_VIEWPORT)}px`,
      ).toBeGreaterThanOrEqual(AA);
      expect(height * scale).toBeGreaterThanOrEqual(AA);
    }
  });

  it('fails AA at gap 3, which is why gap 4 is not a preference', () => {
    // Stated as a test because "load-bearing" is easy to write and easy to
    // ignore. Narrowing the gap by one unit drops the row below the criterion.
    expect((BANNER.width + 3) * scale).toBeLessThan(AA);
  });

  it('tiles the row with no gaps and no overlaps', () => {
    for (let i = 1; i < partitions.length; i++) {
      const [prevX, , prevWidth] = partitions[i - 1]!;
      const [x] = partitions[i]!;
      expect(x, `partition ${String(i)} does not meet the one before it`).toBe(prevX + prevWidth);
    }
  });

  it('centres every banner in its own partition', () => {
    partitions.forEach(([x, , width], i) => {
      expect(BANNER.slots[i]! + BANNER.width / 2, `slot ${String(i + 1)}`).toBe(x + width / 2);
    });
  });

  it('hangs every banner on the rail rod', () => {
    // The rod is x 54-184, measured. A banner whose body left the rod would be
    // hanging off the end of the rail with nothing supporting it.
    const ROD = { left: 54, right: 184 };
    expect(BANNER.slots[0]).toBeGreaterThanOrEqual(ROD.left);
    expect(BANNER.slots[5]! + BANNER.width - 1).toBeLessThanOrEqual(ROD.right);
  });

  it('clears the Tonight board below it', () => {
    const [, boardTop] = roomObject('tonight').rect;
    expect(BANNER.hitTop + BANNER.hitHeight).toBeLessThanOrEqual(boardTop);
  });
});
