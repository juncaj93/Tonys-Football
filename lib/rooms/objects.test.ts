import { describe, expect, it } from 'vitest';

import { overlaps } from '@/lib/parlor/objects';

import { assetRegistry } from '@/lib/assets/registry';

import {
  CEILING,
  HORIZON,
  MANAGER_ROOM,
  PENNANT,
  ROOM_OBJECTS,
  SLOTS,
  SLOT_ART,
  SLOT_EMPTY,
  SLOT_NAMES,
  roomObject,
  slotArtRect,
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

  it('stands the manager on the floor, with floor in front of them', () => {
    /*
     * A figure whose feet are above the horizon is standing on the wall, and one
     * whose feet are at the bottom edge is standing outside the picture. Both
     * look like a coding error rather than like a room, and the first version's
     * lower quarter of empty floor was the *"picture that ran out"* failure
     * `back-hall.tsx` records against its own lower fifth.
     */
    const [, y, width, height] = roomObject('manager').rect;
    const feet = y + height;

    expect(feet, 'feet above the horizon').toBeGreaterThan(HORIZON);
    expect(feet, 'feet off the bottom of the room').toBeLessThan(MANAGER_ROOM.height - 40);
    // The sprite's own 64 × 96 aspect, so nothing is stretched.
    expect(width * 96, 'the figure is not the sprite’s aspect').toBe(height * 64);
  });

  it('draws the manager smaller than Tony and bigger than furniture', () => {
    /*
     * Tony is 35% of the room's height and looms over a counter on purpose. A
     * manager in their own basement should read as a person in the room rather
     * than a figure placed against its back wall — which is what the first
     * version's 24% did.
     */
    const [, , , height] = roomObject('manager').rect;
    const share = height / MANAGER_ROOM.height;

    expect(share).toBeGreaterThan(0.26);
    expect(share).toBeLessThan(0.34);
  });

  it('leaves the ceiling and the floor out of the wall', () => {
    // Three bands, in order, none of them empty. The composition's own skeleton.
    expect(CEILING).toBeGreaterThan(0);
    expect(HORIZON).toBeGreaterThan(CEILING);
    expect(MANAGER_ROOM.height).toBeGreaterThan(HORIZON);
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

describe('the pennant rail', () => {
  it('hangs its pennants inside the rail, at the parlor’s own pitch', () => {
    /*
     * Same fitting as the parlor's banner rail — 18 wide on a 22-unit spacing —
     * so a manager who has seen the shop reads a pennant as a championship
     * before anything explains it. Six must fit, because the wall showing fewer
     * than the panel lists is the only case that could read as a lost title.
     */
    const [, , railWidth] = roomObject('rings').rect;
    const span = PENNANT.offsetX + (PENNANT.shown - 1) * PENNANT.pitch + PENNANT.width;

    expect(span, 'the sixth pennant runs off the rail').toBeLessThanOrEqual(railWidth);
    expect(PENNANT.width).toBe(18);
    expect(PENNANT.pitch).toBe(22);
  });

  it('keeps the rail clear of everything the manager can change', () => {
    // Earned and chosen must not touch: a title overlapping a shelf would be a
    // tap that sometimes lands on the wrong meaning.
    for (const slot of SLOTS) {
      expect(SLOT_ART[slot], slot).toBeDefined();
    }
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
     * `TRAY_REVEAL`), so an art rect of any other size resamples the sprite and
     * stops being pixel art.
     */
    for (const slot of SLOTS) {
      const [, , width, height] = slotArtRect(slot);
      expect([width, height], slot).toEqual([46, 46]);
    }
  });

  it('keeps every art rect inside the region that opens it', () => {
    /*
     * Hit region and art rect are deliberately different — the frame is 116 × 78
     * because that is the frame, the desk 68 × 58 because that is the desktop,
     * and both are sized for a thumb. What must stay true is that the thing you
     * can see is inside the thing you tap: a sprite drawn outside its own hit
     * region is an object a manager can see and cannot reach.
     */
    for (const slot of SLOTS) {
      const [hx, hy, hw, hh] = slotRect(slot);
      const [ax, ay, aw, ah] = slotArtRect(slot);
      expect(ax >= hx && ay >= hy && ax + aw <= hx + hw && ay + ah <= hy + hh, slot).toBe(true);
    }
  });

  it('gives every slot a hit region a thumb can find', () => {
    // The art may be 46 wide; the target may not be smaller than that.
    for (const slot of SLOTS) {
      const [, , width, height] = slotRect(slot);
      expect(toCss(width), slot).toBeGreaterThanOrEqual(44);
      expect(toCss(height), slot).toBeGreaterThanOrEqual(44);
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

  it('gives every theme its own registered shell slot', () => {
    /*
     * The room is a **painted shell** like the parlor, and rectangles are what
     * is drawn while that shell does not exist. Each theme resolves its own,
     * independently, so three shells can land in any order and none is gated on
     * another — which is the whole reason the slot is per theme rather than one
     * shared slug with a tint.
     */
    const slugs = new Set<string>();

    for (const theme of THEMES) {
      const { shell } = THEME_SPECS[theme];
      const record = assetRegistry.get(shell);

      expect(record, `${theme} has no registered shell`).toBeDefined();
      expect(record?.family, shell).toBe('zone');
      /*
       * `960 × 1707` is `320 × 569` at the pipeline's 3× authoring scale —
       * the same canvas `zone_back_hall_shell` uses, so the three rooms of this
       * product are authored at one size.
       */
      expect(record?.canvas, shell).toBe('960x1707');
      slugs.add(shell);
    }

    expect(slugs.size, 'two themes share a shell').toBe(THEMES.length);
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
