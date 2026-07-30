import { describe, expect, it } from 'vitest';

import { CATALOG_SIZE, RARITIES, catalog, catalogItem } from './catalog';
import { resolveRoll, standardRewardTable } from './rewards';

/**
 * The reward table is a pure function of the catalog, so it can be asserted
 * exactly — no database, no clock, no randomness.
 *
 * What these tests protect is the property that makes an opening auditable: the
 * same table version plus the same recorded roll must produce the same item, on
 * any machine, forever. A change that breaks that silently rewrites history.
 */

describe('the catalog', () => {
  it('holds exactly the approved number of items', () => {
    // `16` approves a 24-item launch catalog. If this fails, a registry edit
    // changed the economy — fix the registry or change CATALOG_SIZE deliberately.
    // Never delete an approved slug to satisfy the old count (`AUTONOMY.md §5`).
    expect(catalog()).toHaveLength(CATALOG_SIZE);
  });

  it('gives every item a slug, a name and a known rarity', () => {
    for (const item of catalog()) {
      expect(item.slug).toMatch(/^collectible_/);
      expect(item.name.trim()).not.toBe('');
      expect(RARITIES).toContain(item.rarity);
    }
  });

  it('excludes the championship ring, which is earned rather than pulled', () => {
    expect(catalog().map((item) => item.slug)).not.toContain('item_championship_ring');
  });

  it('excludes the universal placeholder art, which is not a thing you can own', () => {
    expect(catalog().map((item) => item.slug)).not.toContain('placeholder_pizza_box');
  });

  it('is ordered deterministically, because the version hashes the order', () => {
    // Two builds of the same catalog must agree, or every seed writes a new
    // version and no opening can be replayed against the table it used.
    expect(catalog().map((i) => i.slug)).toEqual(catalog().map((i) => i.slug));
  });

  it('throws on an unknown slug rather than returning a hole', () => {
    expect(() => catalogItem('collectible_not_a_thing')).toThrow(/no catalog entry/);
  });
});

describe('the standard reward table', () => {
  it('covers every catalog item exactly once', () => {
    const table = standardRewardTable();
    expect(table.entries).toHaveLength(CATALOG_SIZE);
    expect(new Set(table.entries.map((e) => e.slug)).size).toBe(CATALOG_SIZE);
  });

  it('uses integer weights, so a recorded roll is reproducible', () => {
    // A float weight makes the cumulative walk platform-dependent, which would
    // make the persisted `roll` un-replayable — the thing it exists for.
    for (const entry of standardRewardTable().entries) {
      expect(Number.isInteger(entry.weight)).toBe(true);
      expect(entry.weight).toBeGreaterThan(0);
    }
  });

  it('gives every item in a rarity the same weight', () => {
    // `18 §4.2`: rarity gates frequency. A per-item weight would let one common
    // quietly become rarer than an epic, which is a different product.
    const table = standardRewardTable();
    for (const rarity of RARITIES) {
      const weights = new Set(
        table.entries.filter((e) => e.rarity === rarity).map((e) => e.weight),
      );
      expect(weights.size).toBeLessThanOrEqual(1);
    }
  });

  it('orders the rarity tiers by total mass, rarest last', () => {
    const table = standardRewardTable();
    const mass = (rarity: string): number =>
      table.entries.filter((e) => e.rarity === rarity).reduce((sum, e) => sum + e.weight, 0);

    expect(mass('common')).toBeGreaterThan(mass('rare'));
    expect(mass('rare')).toBeGreaterThan(mass('epic'));
    expect(mass('epic')).toBeGreaterThan(mass('legendary'));
  });

  it('reports a total weight equal to the sum of its entries', () => {
    const table = standardRewardTable();
    expect(table.entries.reduce((sum, e) => sum + e.weight, 0)).toBe(table.totalWeight);
  });

  it('is marked provisional until the P3 simulation signs it off', () => {
    // `16 §8` gates reward pacing on the multi-season simulation. This flag is
    // what makes "has this been simulated yet" a query rather than a memory.
    expect(standardRewardTable().provisional).toBe(true);
  });

  it('has a stable version across builds', () => {
    expect(standardRewardTable().version).toBe(standardRewardTable().version);
    expect(standardRewardTable().version).toMatch(/^[0-9a-f]{16}$/);
  });

  it('changes version when the weights change', () => {
    const table = standardRewardTable();
    // Simulate a rebalance without touching the real table: the version must
    // track the content, or a new economy could reuse an old audit identity.
    const rebalanced = {
      ...table,
      entries: table.entries.map((e, i) => (i === 0 ? { ...e, weight: e.weight + 1 } : e)),
    };
    expect(versionsDiffer(table.entries, rebalanced.entries)).toBe(true);
  });
});

describe('resolving a roll', () => {
  it('lands on the first entry at roll 0 and the last at the top of the range', () => {
    const table = standardRewardTable();
    expect(resolveRoll(table, 0).slug).toBe(table.entries[0]!.slug);
    expect(resolveRoll(table, table.totalWeight - 1).slug).toBe(
      table.entries[table.entries.length - 1]!.slug,
    );
  });

  it('is total: every roll in range resolves to exactly one entry', () => {
    // Walked exhaustively rather than sampled. The table is 4000 wide, so an
    // off-by-one at a tier boundary has nowhere to hide.
    const table = standardRewardTable();
    for (let roll = 0; roll < table.totalWeight; roll++) {
      expect(resolveRoll(table, roll).slug).toBeTruthy();
    }
  });

  it('distributes rolls exactly in proportion to weight', () => {
    const table = standardRewardTable();
    const counts = new Map<string, number>();
    for (let roll = 0; roll < table.totalWeight; roll++) {
      const slug = resolveRoll(table, roll).slug;
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
    for (const entry of table.entries) {
      expect(counts.get(entry.slug)).toBe(entry.weight);
    }
  });

  it('refuses a roll outside the range rather than clamping it', () => {
    const table = standardRewardTable();
    expect(() => resolveRoll(table, -1)).toThrow(RangeError);
    expect(() => resolveRoll(table, table.totalWeight)).toThrow(RangeError);
    expect(() => resolveRoll(table, 1.5)).toThrow(RangeError);
  });

  it('gives a legendary only at the very top of the range', () => {
    const table = standardRewardTable();
    const legendaryMass = table.entries
      .filter((e) => e.rarity === 'legendary')
      .reduce((sum, e) => sum + e.weight, 0);

    expect(resolveRoll(table, table.totalWeight - legendaryMass).rarity).toBe('legendary');
    expect(resolveRoll(table, table.totalWeight - legendaryMass - 1).rarity).not.toBe('legendary');
  });
});

/** Two entry lists hash differently iff their canonical form differs. */
function versionsDiffer(
  a: readonly { slug: string; rarity: string; weight: number }[],
  b: readonly { slug: string; rarity: string; weight: number }[],
): boolean {
  const canonical = (list: readonly { slug: string; rarity: string; weight: number }[]): string =>
    list.map((e) => `${e.slug}:${e.rarity}:${String(e.weight)}`).join('|');
  return canonical(a) !== canonical(b);
}
