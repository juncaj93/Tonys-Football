import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { assetRegistry } from '@/lib/assets/registry';
import { catalog } from '@/lib/counter/catalog';
import { closePool, getDb } from '@/lib/db';
import { collectibles, users, wearableEquips } from '@/lib/db/schema';
import { resetDatabase } from '@/lib/db/test-helpers';

import {
  BASE_VARIANTS,
  PALETTES,
  WEARABLES,
  WEARABLE_COUNT,
  characterSlugs,
} from './catalog';
import {
  DEFAULT_CONFIGURATION,
  composeCharacter,
  compositeKey,
  validateCharacter,
} from './composite';
import {
  BASE_LAYERS,
  CHARACTER_CANVAS,
  LAYER_ORDER,
  WEARABLE_SLOTS,
  type LayerName,
} from './layers';
import { characterFor, equip, saveConfiguration, unequip } from './service';

/**
 * M3's foundation, checked where it can actually be wrong.
 *
 * The character system's failure modes are not visual. They are a stored integer
 * that points at a variant somebody reordered, a hat drawn under the hair, a
 * manager wearing somebody else's pull, and two taps leaving a slot with two
 * items in it. Every one of those is arithmetic or a constraint, and none of them
 * is visible in a screenshot until it is in front of a person.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

afterAll(async () => {
  if (hasDatabase) await closePool();
});

/* ------------------------------------------------------- the registry -- */

describe('the catalog and the registry agree', () => {
  it('names only slugs the registry holds', () => {
    /*
     * The check that would have caught this file's first draft.
     *
     * It invented `character_hair_short` at `64 × 64` with `back` and `bottoms`
     * slots — none of which exist. All twenty slugs were already canon in
     * `art/assets.inventory.json` before any of this was written, and the
     * commissioner's ruling is to preserve them exactly.
     */
    for (const slug of characterSlugs()) {
      expect(assetRegistry.get(slug), `${slug} has no registry row`).toBeDefined();
    }
  });

  it('draws every layer at the canvas the registry declares', () => {
    const expected = `${String(CHARACTER_CANVAS.width)}x${String(CHARACTER_CANVAS.height)}`;
    for (const slug of characterSlugs()) {
      expect(assetRegistry.get(slug)?.canvas, `${slug} canvas`).toBe(expected);
    }
  });

  it('puts every wearable in the slot the registry puts it in', () => {
    // The catalog's `slot` is a copy of the registry's, and a copy that drifted
    // would put a hat on somebody's chest with nothing failing.
    for (const item of WEARABLES) {
      expect(assetRegistry.get(item.slug)?.slot, `${item.slug} slot`).toBe(item.slot);
    }
  });

  it('claims every launch wearable the registry has, and no others', () => {
    /*
     * Scoped to **batch B2**, which is the launch set. The registry also holds
     * `wear_head_ballcap` in `_testSet_B0` — a B0 test-set asset that exists to
     * exercise the pipeline and is not one of the twelve. Comparing against every
     * `wear_*` slug in the file would fold it in, and the count that is asserted
     * everywhere else would quietly become thirteen.
     */
    const registered = assetRegistry
      .all()
      .filter((record) => record.slug.startsWith('wear_') && record.batch === 'B2')
      .map((record) => record.slug)
      .sort();

    expect(WEARABLES.map((item) => item.slug).sort()).toEqual(registered);
    expect(WEARABLES).toHaveLength(WEARABLE_COUNT);
  });

  it('keeps wearables out of the twenty-four collectible catalog', () => {
    /*
     * **An unresolved contradiction, pinned rather than settled.**
     *
     * `_wearables_B2` says the twelve wearables *"ARE part of the 24-item
     * catalog"*. The implemented catalog says otherwise, and the reward table is
     * seeded from it — so if the comment were right, the pizza box would drop
     * wearables and M2's shipped economy is wrong.
     *
     * This asserts the implemented behaviour so a change to it is deliberate. The
     * disagreement is recorded in `docs/CHECKPOINT.md` for the commissioner
     * (`CLAUDE.md`: do not silently resolve material contradictions).
     */
    const collectibleSlugs = new Set(catalog().map((item) => item.slug));
    for (const item of WEARABLES) {
      expect(collectibleSlugs.has(item.slug), `${item.slug} is in the box catalog`).toBe(false);
    }
    expect(catalog()).toHaveLength(24);
  });
});

/* -------------------------------------------------------- the layering -- */

describe('the layer stack', () => {
  it('draws a hat over the hair and shades under it', () => {
    // The one ordering anybody would get wrong, stated as a comparison rather
    // than as a list somebody has to read in order.
    expect(LAYER_ORDER['worn-head']).toBeGreaterThan(LAYER_ORDER['base-hair']);
    expect(LAYER_ORDER['worn-face']).toBeLessThan(LAYER_ORDER['base-hair']);
    expect(LAYER_ORDER['worn-body']).toBeGreaterThan(LAYER_ORDER['base-body']);
    expect(LAYER_ORDER['worn-hand']).toBe(
      Math.max(...Object.values(LAYER_ORDER)),
    );
  });

  it('gives every layer a distinct position', () => {
    const positions = Object.values(LAYER_ORDER);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it('composites in draw order whatever order the equipment arrives in', () => {
    const forward = composeCharacter(DEFAULT_CONFIGURATION, {
      head: 'wear_head_beanie_winter',
      body: 'wear_body_apron_tony',
      hand: 'wear_hand_slice',
      face: 'wear_face_shades',
    });
    const reverse = composeCharacter(DEFAULT_CONFIGURATION, {
      face: 'wear_face_shades',
      hand: 'wear_hand_slice',
      body: 'wear_body_apron_tony',
      head: 'wear_head_beanie_winter',
    });

    expect(compositeKey(forward)).toBe(compositeKey(reverse));

    const order = forward.layers.map((layer) => LAYER_ORDER[layer.layer]);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
  });

  it('recolours the base and never a wearable', () => {
    // A manager who pulled a legendary jersey pulled *that* jersey. Recolouring
    // it to match a character would quietly make every copy of it different.
    const composite = composeCharacter(
      { body: 0, hair: 0, palette: 2 },
      { head: 'wear_head_pizza_visor' },
    );
    for (const layer of composite.layers) {
      const isBase = layer.layer.startsWith('base-');
      expect(layer.palette, layer.slug).toBe(isBase ? 2 : null);
    }
  });

  it('draws a chosen hairstyle even when it is `Balding`', () => {
    /*
     * A skipped layer would make *"balding"* and *"the hair file failed to
     * load"* the same state, and only one of those is somebody's decision.
     */
    const balding = BASE_VARIANTS.find((variant) => variant.name === 'Balding');
    expect(balding).toBeDefined();
    const composite = composeCharacter({ body: 0, hair: balding!.index, palette: 0 });
    expect(composite.layers.some((layer) => layer.layer === 'base-hair')).toBe(true);
  });
});

/* ------------------------------------------------------- legal combos -- */

describe('what the system will draw', () => {
  it('accepts the default', () => {
    expect(validateCharacter(DEFAULT_CONFIGURATION, {})).toEqual([]);
  });

  it('refuses a variant index nobody authored', () => {
    const problems = validateCharacter({ body: 99, hair: 0, palette: 0 }, {});
    expect(problems).toContainEqual({ kind: 'unknown-variant', layer: 'body', index: 99 });
  });

  it('refuses a palette nobody authored', () => {
    const problems = validateCharacter({ body: 0, hair: 0, palette: 99 }, {});
    expect(problems).toContainEqual({ kind: 'unknown-palette', index: 99 });
  });

  it('refuses an item in the wrong slot, even a real one', () => {
    // Owned, real, and still wrong.
    const problems = validateCharacter(DEFAULT_CONFIGURATION, {
      head: 'wear_body_apron_tony',
    });
    expect(problems).toContainEqual({
      kind: 'wrong-slot',
      slug: 'wear_body_apron_tony',
      slot: 'head',
    });
  });

  it('reports every problem at once rather than the first', () => {
    // A customiser showing one error at a time makes somebody fix three things in
    // three round trips.
    const problems = validateCharacter({ body: 99, hair: 98, palette: 97 }, {});
    expect(problems).toHaveLength(3);
  });

  it('accepts every single-slot combination the catalog can produce', () => {
    for (const item of WEARABLES) {
      expect(
        validateCharacter(DEFAULT_CONFIGURATION, { [item.slot]: item.slug }),
        item.slug,
      ).toEqual([]);
    }
  });

  it('accepts every base variant with every palette', () => {
    for (const layer of BASE_LAYERS) {
      for (const variant of BASE_VARIANTS.filter((v) => v.layer === layer)) {
        for (const palette of PALETTES) {
          const configuration = { ...DEFAULT_CONFIGURATION, [layer]: variant.index, palette: palette.index };
          expect(validateCharacter(configuration, {}), `${variant.slug}/${String(palette.index)}`).toEqual([]);
        }
      }
    }
  });

  it('falls back to a drawable character rather than throwing', () => {
    // A manager whose stored hairstyle was retired should see a character, not an
    // error page. Nothing persists the fallback.
    const composite = composeCharacter({ body: 99, hair: 99, palette: 99 });
    expect(composite.layers.length).toBeGreaterThan(0);
    expect(compositeKey(composite)).toBe(compositeKey(composeCharacter(DEFAULT_CONFIGURATION)));
  });
});

/* ---------------------------------------------------------- the store -- */

describe.skipIf(!hasDatabase)('saving and wearing', () => {
  let manager = '';
  let other = '';

  beforeEach(async () => {
    await resetDatabase(db!);
    const [a, b] = await db!
      .insert(users)
      .values([
        { sleeperUserId: 'char-test-a', displayName: 'Alex' },
        { sleeperUserId: 'char-test-b', displayName: 'Ryan' },
      ])
      .returning();
    manager = a!.id;
    other = b!.id;
  });

  const give = async (userId: string, slug: string): Promise<string> => {
    const [row] = await db!
      .insert(collectibles)
      .values({ userId, slug, rarity: 'common', acquiredAt: new Date(0) })
      .returning();
    return row!.id;
  };

  it('gives a manager who has never chosen anything a drawable default', async () => {
    const state = await characterFor(db!, manager);
    expect(state.configuration).toEqual(DEFAULT_CONFIGURATION);
    expect(state.composite.layers.length).toBeGreaterThan(0);
  });

  it('writes nothing on a read', async () => {
    // Writing a default on read would turn every page view into an insert, and
    // make "has this manager ever chosen anything?" unanswerable.
    await characterFor(db!, manager);
    const state = await characterFor(db!, manager);
    expect(state.configuration).toEqual(DEFAULT_CONFIGURATION);
  });

  it('saves, and saving twice is saving once', async () => {
    const chosen = { body: 1, hair: 3, palette: 2 };
    expect((await saveConfiguration(db!, manager, chosen)).ok).toBe(true);
    expect((await saveConfiguration(db!, manager, chosen)).ok).toBe(true);
    expect((await characterFor(db!, manager)).configuration).toEqual(chosen);
  });

  it('refuses to save a configuration it cannot draw', async () => {
    const result = await saveConfiguration(db!, manager, { body: 99, hair: 0, palette: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe('invalid');
    // And nothing was written.
    expect((await characterFor(db!, manager)).configuration).toEqual(DEFAULT_CONFIGURATION);
  });

  it('equips an owned wearable into the slot the item names', async () => {
    const id = await give(manager, 'wear_head_pizza_visor');
    const result = await equip(db!, manager, id);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.equipment.head).toBe('wear_head_pizza_visor');
  });

  it('refuses a collectible that is not a wearable', async () => {
    const id = await give(manager, 'collectible_arcade_token');
    const result = await equip(db!, manager, id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe('not-wearable');
  });

  it('refuses somebody else’s pull', async () => {
    const id = await give(other, 'wear_head_pizza_visor');
    const result = await equip(db!, manager, id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe('not-owned');
  });

  it('refuses somebody else’s pull at the database too', async () => {
    /*
     * The service check produces a sentence. **This** is what actually holds when
     * a second caller exists — a bulk migration, or a commissioner fixing
     * something by hand. A foreign key can say "this is a collectible" and cannot
     * say "this is *your* collectible".
     */
    const id = await give(other, 'wear_head_pizza_visor');
    await expect(
      db!.insert(wearableEquips).values({ userId: manager, collectibleId: id, slot: 'head' }),
    ).rejects.toThrow();

    // And nothing landed. Without the trigger this insert succeeds, so an empty
    // table is the proof rather than the wording of an error the driver wraps.
    const rows = await db!.select().from(wearableEquips).where(eq(wearableEquips.userId, manager));
    expect(rows).toEqual([]);
  });

  it('keeps one item per slot, replacing rather than stacking', async () => {
    const first = await give(manager, 'wear_head_pizza_visor');
    const second = await give(manager, 'wear_head_beanie_winter');

    await equip(db!, manager, first);
    const result = await equip(db!, manager, second);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.equipment.head).toBe('wear_head_beanie_winter');

    const rows = await db!.select().from(wearableEquips).where(eq(wearableEquips.userId, manager));
    expect(rows).toHaveLength(1);
  });

  it('refuses a second item in one slot at the database too', async () => {
    // Two taps arriving together both read an empty head slot and both insert.
    const first = await give(manager, 'wear_head_pizza_visor');
    const second = await give(manager, 'wear_head_beanie_winter');
    await db!.insert(wearableEquips).values({ userId: manager, collectibleId: first, slot: 'head' });
    await expect(
      db!.insert(wearableEquips).values({ userId: manager, collectibleId: second, slot: 'head' }),
    ).rejects.toThrow();
  });

  it('empties a slot, and emptying an empty one is not an error', async () => {
    const id = await give(manager, 'wear_hand_slice');
    await equip(db!, manager, id);

    expect((await unequip(db!, manager, 'hand')).ok).toBe(true);
    expect((await unequip(db!, manager, 'hand')).ok).toBe(true);
    expect((await characterFor(db!, manager)).equipment.hand).toBeUndefined();
  });

  it('composites what is actually stored', async () => {
    await saveConfiguration(db!, manager, { body: 1, hair: 2, palette: 3 });
    for (const slot of WEARABLE_SLOTS) {
      const item = WEARABLES.find((candidate) => candidate.slot === slot)!;
      await equip(db!, manager, await give(manager, item.slug));
    }

    const state = await characterFor(db!, manager);
    // Two base layers plus one per slot, in draw order.
    expect(state.composite.layers).toHaveLength(2 + WEARABLE_SLOTS.length);
    const order = state.composite.layers.map((layer) => LAYER_ORDER[layer.layer as LayerName]);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
  });
});
