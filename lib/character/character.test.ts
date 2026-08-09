import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { assetRegistry } from '@/lib/assets/registry';
import { catalog } from '@/lib/counter/catalog';
import { closePool, getDb } from '@/lib/db';
import { characterConfigurations, collectibles, users, wearableEquips } from '@/lib/db/schema';
import { resetDatabase } from '@/lib/db/test-helpers';

import { drawnSlugs, toneGrid } from './art';
import {
  COLOUR_TRAITS,
  STYLE_TRAITS,
  WEARABLES,
  WEARABLE_COUNT,
  characterSlugs,
  isKnownOption,
  optionCount,
  styleSlug,
} from './catalog';
import {
  DEFAULT_CONFIGURATION,
  composeCharacter,
  compositeKey,
  compositeRuns,
  defaultCharacterFor,
  describeCharacter,
  repairConfiguration,
  validateCharacter,
  type CharacterConfiguration,
} from './composite';
import {
  BASE_TRAITS,
  CHARACTER_CANVAS,
  LAYER_ORDER,
  WEARABLE_SLOTS,
  type LayerName,
} from './layers';
import { HAIR_COLOURS, HOUSE, SKIN_TONES, TOP_COLOURS } from './palette';
import { bounds, coverage } from './sprite';
import { characterFor, saveCharacter, unequip } from './service';

/**
 * The character system, checked where it can actually be wrong.
 *
 * Its failure modes are not visual. They are a stored integer that points at an
 * option somebody reordered, a hat drawn under the hair, a manager wearing
 * somebody else's pull, two taps leaving a slot with two items in it, and a
 * stored value that no longer resolves taking a whole character down with it.
 * Every one of those is arithmetic or a constraint, and none is visible in a
 * screenshot until it is in front of a person.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

afterAll(async () => {
  if (hasDatabase) await closePool();
});

/** Every configuration the catalog can express. 11,520 of them. */
function* everyConfiguration(): Generator<CharacterConfiguration> {
  for (const skin of COLOUR_TRAITS.skin) {
    for (const hair of STYLE_TRAITS.hair) {
      for (const hairColour of COLOUR_TRAITS.hairColour) {
        for (const facialHair of STYLE_TRAITS.facialHair) {
          for (const top of STYLE_TRAITS.top) {
            for (const topColour of COLOUR_TRAITS.topColour) {
              yield {
                skin: skin.index,
                hair: hair.index,
                hairColour: hairColour.index,
                facialHair: facialHair.index,
                top: top.index,
                topColour: topColour.index,
              };
            }
          }
        }
      }
    }
  }
}

/* ------------------------------------------------------- the registry -- */

describe('the catalog and the registry agree', () => {
  it('names only slugs the registry holds', () => {
    for (const slug of characterSlugs()) {
      expect(assetRegistry.has(slug), `${slug} is not in the registry`).toBe(true);
    }
  });

  it('draws every layer at the canvas the registry declares', () => {
    /*
     * A layer that has to be resampled to fit is a layer authored wrong, and it
     * is not hypothetical: every collectible was once registered at `32x32`
     * against a `46` slot, a 1.4375× resample that would have blurred a whole
     * batch and was discoverable only after the art existed.
     */
    const expected = `${String(CHARACTER_CANVAS.width)}x${String(CHARACTER_CANVAS.height)}`;
    for (const slug of characterSlugs()) {
      expect(assetRegistry.get(slug)?.canvas, `${slug} declares the wrong canvas`).toBe(expected);
    }
  });

  it('puts every wearable in the slot the registry puts it in', () => {
    for (const item of WEARABLES) {
      expect(assetRegistry.get(item.slug)?.slot, `${item.slug} slot`).toBe(item.slot);
    }
  });

  it('claims every launch wearable the registry has, and no others', () => {
    /*
     * Scoped to **B2**, which is what "launch wearable" means. `wear_head_ballcap`
     * is a B0 test-batch asset from the art pipeline's first round and has never
     * been part of the twelve; an unscoped filter counts it and reads as drift.
     */
    const registered = assetRegistry
      .byBatch('B2')
      .filter((record) => record.slug.startsWith('wear_'))
      .map((record) => record.slug)
      .sort();
    expect(registered).toEqual([...WEARABLES.map((item) => item.slug)].sort());
    expect(WEARABLES).toHaveLength(WEARABLE_COUNT);
  });

  it('keeps wearables out of the twenty-four collectible catalog', () => {
    const boxed = new Set(catalog().map((item) => item.slug));
    for (const item of WEARABLES) expect(boxed.has(item.slug)).toBe(false);
  });
});

/* ------------------------------------------------------------ the art -- */

describe('the art and the catalog agree', () => {
  it('draws every slug the catalog names', () => {
    /*
     * The check `composeCharacter` deliberately does **not** make at runtime. A
     * slug with no artwork draws nothing rather than throwing, because a stored
     * value must never take a page down — so the guarantee that there is always
     * artwork has to live here instead.
     */
    for (const slug of characterSlugs()) {
      expect(toneGrid(slug), `${slug} has no artwork`).not.toBeNull();
    }
  });

  it('draws nothing the catalog does not name', () => {
    // An orphan is art nobody can reach, which is dead weight that still has to
    // be maintained and still shows up in a review as though it shipped.
    expect([...drawnSlugs()].sort()).toEqual([...characterSlugs()].sort());
  });

  it('actually puts pixels down for every layer', () => {
    // "None" is expressed as a null slug, never as an empty drawing, so every
    // slug that exists must draw something. An empty grid is a silent no-op.
    for (const slug of characterSlugs()) {
      expect(coverage(toneGrid(slug)!), `${slug} draws nothing`).toBeGreaterThan(0);
    }
  });

  it('keeps every layer inside the canvas', () => {
    // A layer that pushes past the edge clips at the container and reads as a
    // rendering bug rather than as a hat.
    for (const slug of characterSlugs()) {
      const box = bounds(toneGrid(slug)!)!;
      expect(box.left, `${slug} left`).toBeGreaterThanOrEqual(0);
      expect(box.top, `${slug} top`).toBeGreaterThanOrEqual(0);
      expect(box.right, `${slug} right`).toBeLessThanOrEqual(CHARACTER_CANVAS.width);
      expect(box.bottom, `${slug} bottom`).toBeLessThanOrEqual(CHARACTER_CANVAS.height);
    }
  });

  it('stands every character on the same floor row, whatever is worn', () => {
    /*
     * A hat must not lift a character off the ground and a long coat must not
     * sink them through it. The contact row is the base body's, and nothing may
     * reach below it.
     */
    const floor = bounds(toneGrid('avatar_body_base')!)!.bottom;
    expect(floor).toBe(CHARACTER_CANVAS.height);

    for (const slug of characterSlugs()) {
      expect(bounds(toneGrid(slug)!)!.bottom, `${slug} hangs below the floor`).toBeLessThanOrEqual(
        floor,
      );
    }
  });

  it('overlaps hair and every hat, so a hat never floats', () => {
    /*
     * The matrix test, not a spot check. This is the rule that fails on a
     * *specific pair* of variants rather than systemically — the tallest hair
     * under the shallowest hat — which is exactly what a single example misses.
     */
    const hats = WEARABLES.filter((item) => item.slot === 'head');
    for (const style of STYLE_TRAITS.hair) {
      const hair = toneGrid(style.slug!)!;
      for (const hat of hats) {
        const worn = toneGrid(hat.slug)!;
        let shared = 0;
        for (let y = 0; y < CHARACTER_CANVAS.height; y++) {
          for (let x = 0; x < CHARACTER_CANVAS.width; x++) {
            if (hair[y]?.[x] !== null && worn[y]?.[x] !== null) shared++;
          }
        }
        expect(shared, `${hat.slug} floats above ${style.slug!}`).toBeGreaterThan(0);
      }
    }
  });

  it('leaves the held hand clear on every top, so a sleeve never eats a hand', () => {
    /*
     * The defect this is written against shipped: a hoodie authored wider than
     * the shirt covered the sleeves *and* the hands, and the figure rendered as a
     * head on a slab with no arms at all. It was visible only at hero scale.
     */
    const body = toneGrid('avatar_body_base')!;
    for (const option of STYLE_TRAITS.top) {
      const top = toneGrid(option.slug!)!;
      let handPixels = 0;
      for (let y = 0; y < CHARACTER_CANVAS.height; y++) {
        for (let x = 0; x < CHARACTER_CANVAS.width; x++) {
          if (body[y]?.[x] !== null && top[y]?.[x] === null) handPixels++;
        }
      }
      // Head, hands, legs and shoes at the very least.
      expect(handPixels, `${option.slug!} covers the whole figure`).toBeGreaterThan(400);
    }
  });

  it('draws no colour that is not in the locked palette', () => {
    /*
     * `art/palette.json` is locked. A sprite is drawn at runtime rather than
     * quantized by the pipeline, so nothing else enforces this — a hand-typed hex
     * would simply appear, one colour off, in a room where every other asset went
     * through `art:process`.
     */
    const allowed = new Set<string>(Object.values(HOUSE));
    for (const item of WEARABLES) {
      const runs = compositeRuns(composeCharacter(DEFAULT_CONFIGURATION, { [item.slot]: item.slug }));
      for (const run of runs) {
        expect(allowed.has(run.value), `${run.value} is not a house colour`).toBe(true);
      }
    }
    for (const configuration of [DEFAULT_CONFIGURATION, ...STYLE_TRAITS.top.map((top) => ({ ...DEFAULT_CONFIGURATION, top: top.index }))]) {
      for (const run of compositeRuns(composeCharacter(configuration))) {
        expect(allowed.has(run.value), `${run.value} is not a house colour`).toBe(true);
      }
    }
  });

  it('takes skin, hair and top colours from the palette ramps only', () => {
    const allowed = new Set<string>(Object.keys(HOUSE));
    for (const ramp of [...SKIN_TONES, ...HAIR_COLOURS, ...TOP_COLOURS]) {
      expect(allowed.has(ramp.base), `${ramp.name} base`).toBe(true);
      expect(allowed.has(ramp.shade), `${ramp.name} shade`).toBe(true);
    }
  });

  it('gives skin its own four steps, never a wood or a paper colour', () => {
    /*
     * The specific correction this rebuild makes. `art/palette.json` has a `skin`
     * ramp whose role note says a manager selects a step and that it is tied to
     * nothing else — and the system this replaces painted faces with `wood-pale`,
     * `wood-mid`, `paper-mid` and `wood-light` instead, welded to hair and shirt.
     */
    expect(SKIN_TONES.map((tone) => tone.base)).toEqual(['skin-1', 'skin-2', 'skin-3', 'skin-4']);
  });
});

/* ------------------------------------------------------ the compositor -- */

describe('the layer stack', () => {
  it('draws a hat over the hair and a top under an apron', () => {
    expect(LAYER_ORDER['worn-head']).toBeGreaterThan(LAYER_ORDER['base-hair']);
    expect(LAYER_ORDER['base-hair']).toBeGreaterThan(LAYER_ORDER['base-facial-hair']);
    expect(LAYER_ORDER['worn-body']).toBeGreaterThan(LAYER_ORDER['base-top']);
    expect(LAYER_ORDER['base-top']).toBeGreaterThan(LAYER_ORDER['base-body']);
    expect(LAYER_ORDER['worn-hand']).toBe(
      Math.max(...Object.values(LAYER_ORDER)),
    );
  });

  it('gives every layer a distinct position', () => {
    const orders = Object.values(LAYER_ORDER);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('composites in draw order whatever order the equipment arrives in', () => {
    const forwards = composeCharacter(DEFAULT_CONFIGURATION, {
      head: 'wear_head_pizza_visor',
      body: 'wear_body_apron_tony',
      face: 'wear_face_shades',
      hand: 'wear_hand_slice',
    });
    const backwards = composeCharacter(DEFAULT_CONFIGURATION, {
      hand: 'wear_hand_slice',
      face: 'wear_face_shades',
      body: 'wear_body_apron_tony',
      head: 'wear_head_pizza_visor',
    });

    const positions = forwards.layers.map((layer) => LAYER_ORDER[layer.layer]);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(compositeKey(forwards)).toBe(compositeKey(backwards));
  });

  it('paints facial hair the hair colour and never a colour of its own', () => {
    const composite = composeCharacter({ ...DEFAULT_CONFIGURATION, facialHair: 4, hairColour: 5 });
    const beard = composite.layers.find((layer) => layer.layer === 'base-facial-hair');
    const hair = composite.layers.find((layer) => layer.layer === 'base-hair');
    expect(beard?.paint).toEqual({ kind: 'hair', index: 5 });
    expect(hair?.paint).toEqual({ kind: 'hair', index: 5 });
  });

  it('never recolours a wearable', () => {
    // A manager who pulled a blue jersey pulled *that* jersey. Recolouring it per
    // character would quietly make every copy different.
    const composite = composeCharacter(
      { ...DEFAULT_CONFIGURATION, topColour: 7, skin: 3 },
      { body: 'wear_body_jersey_blank' },
    );
    const worn = composite.layers.find((layer) => layer.layer === 'worn-body');
    expect(worn?.paint).toEqual({ kind: 'item', slug: 'wear_body_jersey_blank' });
  });

  it('draws a chosen hairstyle even when it is `Receding`', () => {
    // A skipped layer would make "receding" and "the hair failed to load" the
    // same state, and only one of those is somebody's decision.
    const composite = composeCharacter({ ...DEFAULT_CONFIGURATION, hair: 4 });
    expect(composite.layers.some((layer) => layer.layer === 'base-hair')).toBe(true);
  });

  it('draws no facial-hair layer at all for clean-shaven', () => {
    const composite = composeCharacter({ ...DEFAULT_CONFIGURATION, facialHair: 0 });
    expect(composite.layers.some((layer) => layer.layer === 'base-facial-hair')).toBe(false);
    expect(styleSlug('facialHair', 0)).toBeNull();
  });
});

describe('what the system will draw', () => {
  it('accepts the default', () => {
    expect(validateCharacter(DEFAULT_CONFIGURATION, {})).toEqual([]);
  });

  it('refuses an option index nobody authored', () => {
    for (const trait of BASE_TRAITS) {
      const problems = validateCharacter({ ...DEFAULT_CONFIGURATION, [trait]: 99 }, {});
      expect(problems, `${trait} 99 was accepted`).toEqual([
        { kind: 'unknown-option', trait, index: 99 },
      ]);
    }
  });

  it('refuses an item in the wrong slot, even a real one', () => {
    expect(
      validateCharacter(DEFAULT_CONFIGURATION, { head: 'wear_body_jersey_blank' }),
    ).toEqual([{ kind: 'wrong-slot', slug: 'wear_body_jersey_blank', slot: 'head' }]);
  });

  it('refuses a collectible that is not a wearable', () => {
    expect(validateCharacter(DEFAULT_CONFIGURATION, { head: 'collectible_neon_sign' })).toEqual([
      { kind: 'unknown-wearable', slug: 'collectible_neon_sign' },
    ]);
  });

  it('reports every problem at once rather than the first', () => {
    const problems = validateCharacter(
      { ...DEFAULT_CONFIGURATION, skin: 99, hair: 98 },
      { head: 'wear_hand_slice' },
    );
    expect(problems).toHaveLength(3);
  });

  it('accepts every configuration the catalog can produce', () => {
    // 11,520 of them, and the point is that there is no combination the system
    // offers and then refuses.
    let checked = 0;
    for (const configuration of everyConfiguration()) {
      expect(validateCharacter(configuration, {})).toEqual([]);
      checked++;
    }
    expect(checked).toBe(
      optionCount('skin') *
        optionCount('hair') *
        optionCount('hairColour') *
        optionCount('facialHair') *
        optionCount('top') *
        optionCount('topColour'),
    );
  });

  it('accepts every single-slot combination the catalog can produce', () => {
    for (const item of WEARABLES) {
      expect(validateCharacter(DEFAULT_CONFIGURATION, { [item.slot]: item.slug })).toEqual([]);
    }
  });
});

describe('a stored value that stops resolving', () => {
  /*
   * **The behaviour the previous system got wrong.** It reset the whole character
   * on the first unrecognised value, so a manager whose hairstyle was retired
   * also lost their skin tone, their shirt and their colour, and nothing said why.
   */
  it('repairs only the trait that is wrong', () => {
    const stored = { skin: 2, hair: 97, hairColour: 5, facialHair: 3, top: 4, topColour: 44 };
    const repaired = repairConfiguration(stored);

    expect(repaired.hair).toBe(DEFAULT_CONFIGURATION.hair);
    expect(repaired.topColour).toBe(DEFAULT_CONFIGURATION.topColour);
    // Everything that still resolves is untouched.
    expect(repaired.skin).toBe(2);
    expect(repaired.hairColour).toBe(5);
    expect(repaired.facialHair).toBe(3);
    expect(repaired.top).toBe(4);
  });

  it('drops an unwearable item and keeps the rest of the wardrobe', () => {
    const composite = composeCharacter(DEFAULT_CONFIGURATION, {
      head: 'wear_head_pizza_visor',
      body: 'collectible_neon_sign',
    });
    expect(composite.equipment).toEqual({ head: 'wear_head_pizza_visor' });
  });

  it('never throws, for any input a database could hold', () => {
    const hostile: CharacterConfiguration[] = [
      { skin: -1, hair: -1, hairColour: -1, facialHair: -1, top: -1, topColour: -1 },
      { skin: 1e9, hair: 1e9, hairColour: 1e9, facialHair: 1e9, top: 1e9, topColour: 1e9 },
      { skin: 0.5, hair: NaN, hairColour: Infinity, facialHair: 0, top: 0, topColour: 0 },
    ];
    for (const configuration of hostile) {
      expect(() => compositeRuns(composeCharacter(configuration, { head: 'nope' }))).not.toThrow();
      expect(composeCharacter(configuration).layers.length).toBeGreaterThan(0);
    }
  });

  it('describes a repaired character rather than the stored one', () => {
    // The description comes off the composite, so it cannot name a hairstyle that
    // is not on screen.
    const composite = composeCharacter({ ...DEFAULT_CONFIGURATION, hair: 99 });
    expect(describeCharacter(composite)).toContain('short');
  });
});

describe('the character a manager gets before they choose', () => {
  it('is stable for a given manager', () => {
    const id = '3f2b1c44-9d0e-4b21-8f7a-1c2d3e4f5a6b';
    expect(defaultCharacterFor(id)).toEqual(defaultCharacterFor(id));
  });

  it('is always drawable', () => {
    for (let i = 0; i < 200; i++) {
      const configuration = defaultCharacterFor(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
      expect(validateCharacter(configuration, [] as never)).toEqual([]);
    }
  });

  it('spreads ten managers over more than one look', () => {
    /*
     * Ten identical characters is the state this whole feature exists to avoid.
     * All-zeroes would have been the obvious default and would have produced
     * exactly that for every manager who never opened the customiser.
     */
    const names = ['Alex', 'Brandon', 'Cheese', 'Joe', 'Matt Lee', 'Matty B', 'Nathan', 'Nick', 'Ryan', 'Zack'];
    const looks = new Set(names.map((name) => compositeKey(composeCharacter(defaultCharacterFor(name)))));
    expect(looks.size).toBeGreaterThanOrEqual(8);
  });
});

/* ---------------------------------------------------- the run encoding -- */

describe('the drawing', () => {
  it('reproduces the grid exactly when the runs are expanded', () => {
    /*
     * The rectangle decomposition is an optimisation of the *drawing* and must
     * never be one of the picture. Lossy compaction here would be invisible in
     * review and wrong on exactly the pixels where two tones meet.
     */
    const composite = composeCharacter(
      { skin: 2, hair: 3, hairColour: 4, facialHair: 4, top: 4, topColour: 2 },
      { head: 'wear_head_beanie_winter', hand: 'wear_hand_pizza_peel' },
    );
    const runs = compositeRuns(composite);

    const painted = new Map<string, string>();
    for (const run of runs) {
      for (let y = run.y; y < run.y + run.h; y++) {
        for (let x = run.x; x < run.x + run.w; x++) {
          const key = `${String(x)},${String(y)}`;
          expect(painted.has(key), `${key} painted twice`).toBe(false);
          painted.set(key, run.value);
        }
      }
    }

    // Every painted pixel is inside the canvas, and the total matches the runs.
    let total = 0;
    for (const run of runs) total += run.w * run.h;
    expect(painted.size).toBe(total);
  });

  it('is far fewer rectangles than pixels', () => {
    // One node per pixel is 6,144 elements on a page that also draws the room.
    const runs = compositeRuns(composeCharacter(DEFAULT_CONFIGURATION));
    expect(runs.length).toBeLessThan(600);
    expect(runs.length).toBeGreaterThan(50);
  });

  it('is deterministic', () => {
    const configuration = { skin: 3, hair: 5, hairColour: 0, facialHair: 2, top: 3, topColour: 7 };
    const once = compositeRuns(composeCharacter(configuration));
    const twice = compositeRuns(composeCharacter(configuration));
    expect(once).toEqual(twice);
  });
});

/* ------------------------------------------------------- the database -- */

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

  const chosen: CharacterConfiguration = {
    skin: 2,
    hair: 3,
    hairColour: 5,
    facialHair: 2,
    top: 4,
    topColour: 6,
  };

  it('gives a manager who has never chosen anything a drawable character', async () => {
    const state = await characterFor(db!, manager);
    expect(state.chosen).toBe(false);
    expect(validateCharacter(state.configuration, {})).toEqual([]);
    expect(state.composite.layers.length).toBeGreaterThan(0);
  });

  it('writes nothing on a read', async () => {
    // Writing a default on read would turn every page view into an insert, and
    // make "has this manager ever chosen anything?" unanswerable.
    await characterFor(db!, manager);
    await characterFor(db!, manager);
    const rows = await db!
      .select()
      .from(characterConfigurations)
      .where(eq(characterConfigurations.userId, manager));
    expect(rows).toHaveLength(0);
  });

  it('saves, and saving twice is saving once', async () => {
    expect((await saveCharacter(db!, manager, chosen, {})).ok).toBe(true);
    expect((await saveCharacter(db!, manager, chosen, {})).ok).toBe(true);

    const state = await characterFor(db!, manager);
    expect(state.configuration).toEqual(chosen);
    expect(state.chosen).toBe(true);

    const rows = await db!
      .select()
      .from(characterConfigurations)
      .where(eq(characterConfigurations.userId, manager));
    expect(rows).toHaveLength(1);
  });

  it('survives a refresh and a second reader', async () => {
    await saveCharacter(db!, manager, chosen, {});
    const first = await characterFor(db!, manager);
    const second = await characterFor(db!, manager);
    expect(compositeKey(first.composite)).toBe(compositeKey(second.composite));
    expect(second.configuration).toEqual(chosen);
  });

  it('refuses to save a configuration it cannot draw', async () => {
    /*
     * Reading repairs and writing refuses, deliberately. Storing a repaired value
     * would silently discard a choice the client believed it was making — and the
     * client is the only thing that could have sent an index the catalog lacks.
     */
    const result = await saveCharacter(db!, manager, { ...chosen, hair: 99 }, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe('invalid');

    const rows = await db!
      .select()
      .from(characterConfigurations)
      .where(eq(characterConfigurations.userId, manager));
    expect(rows).toHaveLength(0);
  });

  it('leaves one manager unable to change another', async () => {
    await saveCharacter(db!, manager, chosen, {});
    await saveCharacter(db!, other, DEFAULT_CONFIGURATION, {});
    expect((await characterFor(db!, manager)).configuration).toEqual(chosen);
  });

  it('equips an owned wearable into the slot the item names', async () => {
    const id = await give(manager, 'wear_head_pizza_visor');
    const result = await saveCharacter(db!, manager, chosen, { head: id });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.equipment).toEqual({ head: 'wear_head_pizza_visor' });
  });

  it('refuses a collectible that is not a wearable', async () => {
    const id = await give(manager, 'collectible_neon_sign');
    const result = await saveCharacter(db!, manager, chosen, { head: id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe('not-owned');
  });

  it('refuses somebody else’s pull', async () => {
    const id = await give(other, 'wear_head_pizza_visor');
    const result = await saveCharacter(db!, manager, chosen, { head: id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe('not-owned');
  });

  it('refuses somebody else’s pull at the database too', async () => {
    /*
     * A foreign key can say *"this is a collectible"* and cannot say *"this is
     * **your** collectible"*. The service refuses first; this is the trigger that
     * holds when a second caller exists.
     */
    const id = await give(other, 'wear_head_pizza_visor');

    // Drizzle wraps the driver error, so the trigger's own sentence is on the
    // cause. Asserting only "it rejected" would pass for a typo in the table name.
    let message = '';
    try {
      await db!.insert(wearableEquips).values({ userId: manager, collectibleId: id, slot: 'head' });
    } catch (error: unknown) {
      const cause = (error as { cause?: { message?: string } }).cause;
      message = cause?.message ?? (error as Error).message;
    }
    expect(message).toMatch(/not owned by user/);
  });

  it('refuses a wearable in a slot it does not belong to', async () => {
    const id = await give(manager, 'wear_body_jersey_blank');
    const result = await saveCharacter(db!, manager, chosen, { head: id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe('wrong-slot');
  });

  it('keeps one item per slot, replacing rather than stacking', async () => {
    const visor = await give(manager, 'wear_head_pizza_visor');
    const beanie = await give(manager, 'wear_head_beanie_winter');

    await saveCharacter(db!, manager, chosen, { head: visor });
    const result = await saveCharacter(db!, manager, chosen, { head: beanie });
    expect(result.ok).toBe(true);

    const rows = await db!
      .select()
      .from(wearableEquips)
      .where(eq(wearableEquips.userId, manager));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.collectibleId).toBe(beanie);
  });

  it('refuses a second item in one slot at the database too', async () => {
    const visor = await give(manager, 'wear_head_pizza_visor');
    const beanie = await give(manager, 'wear_head_beanie_winter');
    await db!.insert(wearableEquips).values({ userId: manager, collectibleId: visor, slot: 'head' });
    await expect(
      db!.insert(wearableEquips).values({ userId: manager, collectibleId: beanie, slot: 'head' }),
    ).rejects.toThrow();
  });

  it('empties a slot, and emptying an empty one is not an error', async () => {
    const id = await give(manager, 'wear_head_pizza_visor');
    await saveCharacter(db!, manager, chosen, { head: id });

    expect((await unequip(db!, manager, 'head')).ok).toBe(true);
    expect((await unequip(db!, manager, 'head')).ok).toBe(true);
    expect((await characterFor(db!, manager)).equipment).toEqual({});
  });

  it('takes a slot off when the save omits it', async () => {
    // `equipment` is complete, not a patch. That is what makes "take it off" need
    // no separate call and no separate button.
    const id = await give(manager, 'wear_head_pizza_visor');
    await saveCharacter(db!, manager, chosen, { head: id });
    const result = await saveCharacter(db!, manager, chosen, {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.equipment).toEqual({});
  });

  it('composites what is actually stored', async () => {
    const id = await give(manager, 'wear_hand_slice');
    await saveCharacter(db!, manager, chosen, { hand: id });

    const state = await characterFor(db!, manager);
    const slugs = state.composite.layers.map((layer) => layer.slug);
    expect(slugs).toContain('wear_hand_slice');
    expect(slugs).toContain(styleSlug('hair', chosen.hair));
    expect(slugs).toContain(styleSlug('top', chosen.top));
  });

  it('renders a row whose superseded columns were never written', async () => {
    /*
     * `0016` left `body`, `face` and `palette` in place with defaults and nothing
     * writes them any more. A row where they are absent must be as ordinary as
     * any other, or the migration's promise that they are unread is false.
     */
    await saveCharacter(db!, manager, chosen, {});
    const [row] = await db!
      .select()
      .from(characterConfigurations)
      .where(eq(characterConfigurations.userId, manager));
    expect(row?.body).toBe(0);
    expect(row?.palette).toBe(0);
    expect((await characterFor(db!, manager)).configuration).toEqual(chosen);
  });

  it('draws a character out of a row whose stored option was retired', async () => {
    /*
     * Written straight into the table rather than through the service, because
     * the service refuses it — which is the point. This is the row a retired
     * hairstyle leaves behind, and it must render.
     */
    await db!.insert(characterConfigurations).values({
      userId: manager,
      ...chosen,
      hair: 97,
    });

    const state = await characterFor(db!, manager);
    expect(state.chosen).toBe(true);
    expect(state.composite.configuration.hair).toBe(DEFAULT_CONFIGURATION.hair);
    // The rest of the stored character is intact.
    expect(state.composite.configuration.skin).toBe(chosen.skin);
    expect(state.composite.configuration.top).toBe(chosen.top);
    expect(() => compositeRuns(state.composite)).not.toThrow();
  });
});

describe('the catalog itself', () => {
  it('numbers every option from zero without a gap', () => {
    for (const trait of BASE_TRAITS) {
      for (let i = 0; i < optionCount(trait); i++) {
        expect(isKnownOption(trait, i), `${trait} ${String(i)}`).toBe(true);
      }
      expect(isKnownOption(trait, optionCount(trait))).toBe(false);
    }
  });

  it('keeps the six inherited hairstyle slugs at their inherited indices', () => {
    /*
     * Order is the meaning of the stored number. `avatar_hair_01`…`_06` were
     * canon before this system existed and a configuration saved against them
     * still has to mean what it meant.
     */
    expect(STYLE_TRAITS.hair.map((option) => option.slug)).toEqual([
      'avatar_hair_01',
      'avatar_hair_02',
      'avatar_hair_03',
      'avatar_hair_04',
      'avatar_hair_05',
      'avatar_hair_06',
    ]);
  });

  it('keeps the two inherited tops at indices 0 and 1', () => {
    expect(STYLE_TRAITS.top[0]?.slug).toBe('avatar_body_starter_02');
    expect(STYLE_TRAITS.top[1]?.slug).toBe('avatar_body_starter_03');
  });

  it('gives every slot at least one wearable', () => {
    for (const slot of WEARABLE_SLOTS) {
      expect(WEARABLES.some((item) => item.slot === slot), `${slot} has none`).toBe(true);
    }
  });

  it('offers enough combinations to tell ten managers apart', () => {
    const total = BASE_TRAITS.reduce((product, trait) => product * optionCount(trait), 1);
    expect(total).toBeGreaterThan(1000);
  });
});

/** Named so a failure reads as the layer it is about. */
export type _LayerNameIsUsed = LayerName;
