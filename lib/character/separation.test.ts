import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { assetRegistry } from '@/lib/assets/registry';
import { CATALOG_SIZE, catalog } from '@/lib/counter/catalog';
import { standardRewardTable } from '@/lib/counter/rewards';

import { WEARABLES, WEARABLE_COUNT, characterSlugs } from './catalog';

/**
 * **Commissioner rulings, 2026-07-31 and 2026-08-23: collectibles and wearables
 * are separate systems.**
 *
 * The 24 `collectible_*` items are the pizza-box economy. The 12 `wear_*` assets
 * belong to the modular character and equipment system. They are two product
 * families and two progression surfaces:
 *
 * - a pizza box awards `collectible_*`;
 * - character equipment uses `wear_*`.
 *
 * A pizza box never rolls a wearable or a mixed reward. The 2026-08-23 ruling
 * does approve a **separate, idempotent wardrobe bonus** after selected lore
 * pulls; `unlocks.ts` guards that deliberately narrow crossover. The absence of
 * a wearable in the reward table is still a product decision rather than an
 * unimplemented feature.
 *
 * ## Why this file exists rather than one more `it`
 *
 * The ruling settles a contradiction that lived in the repository for a week:
 * `art/assets.inventory.json` claimed the twelve wearables were *inside* the
 * 24-item catalog, while the seeded reward table held only collectibles. Both
 * statements were committed, and nothing failed.
 *
 * So the guard is written against **every direction the ruling could be undone
 * from** — the registry, the catalog, the reward table, the character catalog,
 * and the inventory comment that was wrong in the first place. A test that only
 * checked the last observed symptom would let the next one through.
 */

const WEAR_PREFIX = 'wear_';
const COLLECTIBLE_PREFIX = 'collectible_';

describe('the pizza-box catalog is collectibles only', () => {
  it('holds twenty-four items, every one of them a collectible slug', () => {
    const items = catalog();
    expect(items).toHaveLength(CATALOG_SIZE);
    for (const item of items) {
      expect(item.slug.startsWith(COLLECTIBLE_PREFIX), `${item.slug} is not a collectible`).toBe(
        true,
      );
    }
  });

  it('never awards a wearable from the reward table', () => {
    /*
     * The one that matters most. The reward table is what a box actually rolls
     * against, it is content-hash versioned, and it is append-only — so a
     * wearable reaching it would not merely be a bug, it would be a *recorded*
     * one that later versions inherit.
     */
    const table = standardRewardTable();
    const wearables = new Set(WEARABLES.map((item) => item.slug));

    expect(table.entries).toHaveLength(CATALOG_SIZE);
    for (const entry of table.entries) {
      expect(wearables.has(entry.slug), `${entry.slug} is a wearable in the box`).toBe(false);
      expect(entry.slug.startsWith(WEAR_PREFIX), `${entry.slug} is worn, not pulled`).toBe(false);
    }
  });

  it('shares no slug at all with the character system', () => {
    const boxed = new Set(catalog().map((item) => item.slug));
    for (const slug of characterSlugs()) {
      expect(boxed.has(slug), `${slug} is in both systems`).toBe(false);
    }
  });
});

describe('the two families are separate in the registry', () => {
  it('registers every wearable and base layer under `avatar`, never `collectible`', () => {
    /*
     * This is the *mechanism*, not a restatement. `catalog()` is
     * `assetRegistry.byFamily('collectible')`, so the family field is the only
     * thing standing between a wearable and the reward table. Changing one row
     * from `avatar` to `collectible` would silently grow the economy to 25 items
     * — which `CATALOG_SIZE` would catch — or to 36, which is worse because the
     * seed would fail on a Tuesday with no explanation of what it means.
     */
    for (const slug of characterSlugs()) {
      const record = assetRegistry.get(slug);
      expect(record, `${slug} is not registered`).toBeDefined();
      expect(record?.family, `${slug} is registered as ${String(record?.family)}`).toBe('avatar');
    }
  });

  it('registers every catalog item under `collectible`', () => {
    for (const item of catalog()) {
      expect(assetRegistry.get(item.slug)?.family).toBe('collectible');
    }
  });

  it('counts twelve wearables and keeps the two lists the sizes the ruling names', () => {
    expect(WEARABLES).toHaveLength(WEARABLE_COUNT);
    expect(WEARABLE_COUNT).toBe(12);
    expect(CATALOG_SIZE).toBe(24);
    /*
     * Every character slug is distinct, and the twelve wearables are all of it
     * that overlaps the earned economy. Counting the free layers explicitly would
     * make appending a hairstyle fail this test for no reason — what it is
     * actually guarding is that no slug is counted twice and that the wearable
     * count has not drifted.
     */
    const slugs = characterSlugs();
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.filter((slug) => slug.startsWith('wear_'))).toHaveLength(WEARABLE_COUNT);
  });
});

describe('the inventory file states the ruling rather than contradicting it', () => {
  /*
   * A comment cannot be type-checked, and this one was wrong for a week while
   * every test passed. It is the artefact a future reader most plausibly trusts
   * — it sits directly above the twelve assets — so it gets a build-failing
   * assertion of its own.
   */
  const inventory = readFileSync(
    join(process.cwd(), 'art', 'assets.inventory.json'),
    'utf8',
  );
  const groups = JSON.parse(inventory) as {
    assets: Record<string, Record<string, unknown> & { $comment?: string }>;
  };

  it('does not claim the wearables are part of the 24-item catalog', () => {
    const comment = groups.assets['_wearables_B2']?.$comment ?? '';
    expect(comment).not.toMatch(/part of the 24-item catalog(?!\s)/i);
    expect(comment.toLowerCase()).toContain('not part of the 24-item pizza-box collectible catalog');
  });

  it('says the collectible group is the pizza-box catalog', () => {
    const comment = groups.assets['_collectibles_B3']?.$comment ?? '';
    expect(comment).toContain('24-item launch catalog');
  });
});
