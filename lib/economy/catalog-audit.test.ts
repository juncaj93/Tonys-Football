import { describe, expect, it } from 'vitest';

import { assetRegistry } from '@/lib/assets/registry';
import { CATALOG_SIZE, RARITIES, catalog, systemCatalog } from '@/lib/counter/catalog';
import { standardRewardTable } from '@/lib/counter/rewards';
import { SLOTS } from '@/lib/rooms/objects';

import { ITEM_FORM, auditCatalog, byForm, byRarity, catalogShape, rarityShares } from './catalog-audit';

/**
 * The audit's job is to be **derived**, so what these tests hold is that it
 * still is. Every assertion below compares the audit against the system that
 * owns the fact rather than against a number written down here — a test that
 * pinned "ten commons" would fail the day the catalog legitimately changed and
 * would say nothing about whether the audit was reading it correctly.
 */
describe('the catalog audit', () => {
  const audit = auditCatalog();

  it('covers exactly the catalog, and nothing twice', () => {
    expect(audit.box.map((row) => row.slug)).toEqual(catalog().map((item) => item.slug));
    expect(audit.system.map((row) => row.slug)).toEqual(systemCatalog().map((item) => item.slug));
    expect(audit.box).toHaveLength(CATALOG_SIZE);
  });

  it('records a form for every ownable slug', () => {
    // The only maintenance cost the form axis carries: a twenty-fifth item
    // cannot be added without somebody deciding what shape it is.
    for (const row of [...audit.box, ...audit.system]) {
      expect(ITEM_FORM[row.slug], `no form for ${row.slug}`).toBeDefined();
    }
  });

  it('has no form entry for a slug that is not a collectible', () => {
    // A stale entry would quietly inflate a form rollup for an item nobody owns.
    const owned = new Set([...audit.box, ...audit.system].map((row) => row.slug));
    for (const slug of Object.keys(ITEM_FORM)) {
      expect(owned.has(slug), `${slug} has a form but is not a collectible`).toBe(true);
    }
  });

  it('reads art status from the registry rather than from a list here', () => {
    for (const row of [...audit.box, ...audit.system]) {
      const record = assetRegistry.get(row.slug);
      expect(row.artExists).toBe(record?.path !== null);
      expect(row.placeholder).toBe(record?.path === null);
      expect(row.artStatus).toBe(record?.artStatus);
    }
  });

  it('reads pull weight from the real reward table', () => {
    const table = standardRewardTable();
    for (const entry of table.entries) {
      const row = audit.box.find((candidate) => candidate.slug === entry.slug);
      expect(row?.pullWeight).toBe(entry.weight);
    }
    const totalShare = audit.box.reduce((sum, row) => sum + row.pullShare, 0);
    expect(totalShare).toBeCloseTo(1, 10);
  });

  it('keeps the system-granted item out of every acquisition and display path', () => {
    for (const row of audit.system) {
      expect(row.boxEligible).toBe(false);
      expect(row.systemLayer).toBe(true);
      expect(row.directGrantOnly).toBe(true);
      expect(row.pullWeight).toBe(0);
      expect(row.pullShare).toBe(0);
      // A ring is not furniture (`lib/rooms/service.ts`) and is not showcased.
      expect(row.roomSlots).toEqual([]);
      expect(row.showcaseable).toBe(false);
    }
  });

  it('gives every ownable item every room slot, because that is the shipped rule', () => {
    // Asserted rather than assumed: if category compatibility is ever built,
    // this is the test that has to be changed on purpose.
    for (const row of audit.box) {
      expect(row.roomSlots).toEqual(SLOTS);
    }
  });

  it('claims nothing is seasonal, because nothing can be', () => {
    // Tokens reset; collectibles persist. There is no schema column that could
    // express a seasonal item, so no row may claim to be one.
    for (const row of [...audit.box, ...audit.system]) {
      expect(row.seasonal).toBe(false);
    }
  });

  it('rolls up to the same totals it started from', () => {
    const shape = catalogShape(audit);
    expect(RARITIES.reduce((sum, rarity) => sum + shape[rarity], 0)).toBe(CATALOG_SIZE);

    for (const rollup of byRarity(audit)) {
      expect(rollup.withArt + rollup.placeholder).toBe(rollup.items);
    }

    const forms = byForm(audit);
    expect(forms.reduce((sum, rollup) => sum + rollup.items, 0)).toBe(CATALOG_SIZE);

    const shares = rarityShares(audit);
    expect(RARITIES.reduce((sum, rarity) => sum + shares[rarity], 0)).toBeCloseTo(1, 10);
  });

  it('reports the tier shares the reward table actually assigns', () => {
    // 60 / 28 / 10 / 2 is `PROVISIONAL_RARITY_MASS`. Read through the audit so a
    // re-weighting shows up here rather than only in the box.
    const shares = rarityShares(audit);
    expect(shares.common).toBeCloseTo(0.6, 6);
    expect(shares.rare).toBeCloseTo(0.28, 6);
    expect(shares.epic).toBeCloseTo(0.1, 6);
    expect(shares.legendary).toBeCloseTo(0.02, 6);
  });
});
