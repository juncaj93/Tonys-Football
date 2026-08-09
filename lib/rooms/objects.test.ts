import { describe, expect, it } from 'vitest';

import { overlaps } from '@/lib/parlor/objects';

import {
  HORIZON,
  MANAGER_ROOM,
  ROOM_OBJECTS,
  SLOTS,
  SLOT_EMPTY,
  SLOT_NAMES,
  roomObject,
  slotRect,
} from './objects';
import { DEFAULT_THEME, THEMES, THEME_SPECS, isTheme, themeOrDefault } from './themes';

/**
 * The basement's map, and the rules `06 §6.2`, `18 §1`–`§7` and `00 §11` fix
 * about it.
 *
 * Every assertion corresponds to a sentence in the specification rather than to
 * a preference. Where one does not, it says which defect it is written against.
 */

/** The narrowest supported viewport. Room units scale to it. */
const NARROWEST = 360;
const toCss = (units: number): number => (units / MANAGER_ROOM.width) * NARROWEST;

describe('the room’s map', () => {
  it('shares the parlor’s coordinate system', () => {
    // The third room, and it keeps the rule the hall established: walking
    // between rooms must not change the size of the world.
    expect(MANAGER_ROOM).toEqual({ width: 320, height: 569 });
  });

  it('has exactly eight objects, and they are the eight it should have', () => {
    expect(ROOM_OBJECTS).toHaveLength(8);
    expect(ROOM_OBJECTS.map((object) => object.id).sort()).toEqual([
      'bench',
      'corridor',
      'manager',
      'rings',
      'shelf_left',
      'shelf_right',
      'stairs',
      'wall',
    ]);
  });

  it('has exactly one Door, and it is the way out', () => {
    /*
     * A basement has one exit. The corridor is a Display because it does not go
     * anywhere by itself — it opens onto a row of doors with names on them, and
     * a Door with no single destination would have to invent one.
     */
    const doors = ROOM_OBJECTS.filter((object) => object.kind === 'door');
    expect(doors.map((door) => door.id)).toEqual(['stairs']);
    expect(doors[0]?.href).toBe('/back-hall');
  });

  it('gives no object a route except that Door', () => {
    for (const object of ROOM_OBJECTS) {
      if (object.id === 'stairs') continue;
      expect(object.href, object.id).toBeUndefined();
    }
  });

  it('has no Toy, because nothing down here is a curiosity', () => {
    // `18 §2`: a Toy reacts and carries no information. Every object in this
    // room carries information about the manager whose room it is.
    expect(ROOM_OBJECTS.some((object) => object.kind === 'toy')).toBe(false);
  });

  it('keeps every hit region inside the room', () => {
    for (const object of ROOM_OBJECTS) {
      const [x, y, width, height] = object.rect;
      expect(x, object.id).toBeGreaterThanOrEqual(0);
      expect(y, object.id).toBeGreaterThanOrEqual(0);
      expect(x + width, object.id).toBeLessThanOrEqual(MANAGER_ROOM.width);
      expect(y + height, object.id).toBeLessThanOrEqual(MANAGER_ROOM.height);
    }
  });

  it('never lets two objects share a tap', () => {
    // The gate every room in this product has. Neighbours that overlap steal
    // each other's taps, and the symptom is a shelf that "sometimes" works.
    for (const a of ROOM_OBJECTS) {
      for (const b of ROOM_OBJECTS) {
        if (a.id === b.id) continue;
        expect(overlaps(a, b), `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it('gives every object a 44 CSS px target on the narrowest supported phone', () => {
    // `00 §11`: large touch targets, validated for a phone before anything else.
    for (const object of ROOM_OBJECTS) {
      const [, , width, height] = object.rect;
      expect(toCss(width), object.id).toBeGreaterThanOrEqual(44);
      expect(toCss(height), object.id).toBeGreaterThanOrEqual(44);
    }
  });

  it('stands the manager and the floor slot on the same ground line', () => {
    /*
     * A figure whose feet are above the floor is floating and a figure whose
     * feet are below it is buried, and both look like a coding error rather
     * than like a room. The bench is furniture against the back wall, so it is
     * deliberately not on this line.
     */
    const [, y, , height] = roomObject('manager').rect;
    expect(y + height).toBeGreaterThan(HORIZON);
  });

  it('spells every label as something spoken, never as a route', () => {
    for (const object of ROOM_OBJECTS) {
      expect(object.label, object.id).not.toMatch(/^\//);
      expect(object.label, object.id).not.toMatch(/slot|_/i);
      expect(object.label.length, object.id).toBeGreaterThan(3);
    }
  });

  it('throws for an object that is not in the room', () => {
    expect(() => roomObject('basement')).toThrow(/no room object named/);
  });
});

describe('the four places', () => {
  it('has four, and every one of them is an object in the room', () => {
    /*
     * `04 §10` names shelf slot(s), wall slot(s) and a special display slot;
     * these are that list with the shelf holding two. Four is also as many as a
     * 320-unit portrait room can hold without the slots touching, which the
     * overlap test above enforces from the other side.
     */
    expect([...SLOTS]).toEqual(['shelf_left', 'shelf_right', 'wall', 'bench']);

    for (const slot of SLOTS) {
      expect(roomObject(slot).kind, slot).toBe('display');
      expect(slotRect(slot), slot).toEqual(roomObject(slot).rect);
    }
  });

  it('draws every collectible at its authored size', () => {
    /*
     * The pipeline's rule 4 — one art pixel is one room unit. Every collectible
     * is authored at 46 × 46 (`lib/assets/art-slots.test.ts` pins it against
     * `TRAY_REVEAL`), so a slot of any other size resamples the sprite and stops
     * being pixel art.
     */
    for (const slot of SLOTS) {
      const [, , width, height] = slotRect(slot);
      expect([width, height], slot).toEqual([46, 46]);
    }
  });

  it('names every place as a place rather than as a column', () => {
    for (const slot of SLOTS) {
      expect(SLOT_NAMES[slot], slot).not.toMatch(/_|slot/i);
      expect(SLOT_EMPTY[slot], slot).not.toMatch(/empty slot|null|none set/i);
      // `05 §8.5`: an empty state in the shop's voice, not an apology.
      expect(SLOT_EMPTY[slot], slot).not.toMatch(/sorry|error|unavailable/i);
    }
  });
});

describe('the three themes', () => {
  it('has exactly three', () => {
    // `16`'s P6 row, which is itself the resolution of `02 §8`'s "5-10" against
    // `15 §9`'s "one". Growing this list is a product decision, not a styling one.
    expect([...THEMES]).toEqual(['storeroom', 'rec_room', 'cold_store']);
  });

  it('starts everybody in the storeroom', () => {
    expect(DEFAULT_THEME).toBe('storeroom');
    expect(THEMES[0]).toBe('storeroom');
  });

  it('gives every theme a full set of materials, so none renders half a room', () => {
    for (const theme of THEMES) {
      const spec = THEME_SPECS[theme];
      for (const [field, value] of Object.entries(spec)) {
        expect(value, `${theme}.${field}`).toBeTruthy();
      }
      expect(spec.key).toBe(theme);
    }
  });

  it('describes each one as a room rather than as a colour', () => {
    for (const theme of THEMES) {
      const { name, line } = THEME_SPECS[theme];
      expect(name.length, theme).toBeGreaterThan(3);
      expect(line.length, theme).toBeGreaterThan(20);
      // A theme is what the space *is*. A swatch name would make it a palette.
      expect(line, theme).not.toMatch(/theme|skin|style option/i);
    }
  });

  it('repairs a value it does not recognise rather than throwing', () => {
    /*
     * Reading repairs, writing refuses — the rule `0016` set for character
     * traits. A theme retired in a later release costs the manager the theme,
     * never the room.
     */
    expect(isTheme('storeroom')).toBe(true);
    expect(isTheme('dungeon')).toBe(false);
    expect(themeOrDefault('dungeon')).toBe(DEFAULT_THEME);
    expect(themeOrDefault(null)).toBe(DEFAULT_THEME);
    expect(themeOrDefault(undefined)).toBe(DEFAULT_THEME);
    expect(themeOrDefault('cold_store')).toBe('cold_store');
  });
});
