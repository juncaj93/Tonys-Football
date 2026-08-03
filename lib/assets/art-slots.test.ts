import { describe, expect, it } from 'vitest';

import { CATALOG_SIZE, RARITIES, catalog } from '@/lib/counter/catalog';
import { TRAY_BOX, TRAY_REVEAL } from '@/lib/parlor/objects';

import { assetRegistry } from './registry';

/**
 * The art-slot contract, asserted rather than described.
 *
 * `MANDATE`'s art-slot architecture and `docs/art/ART_PRODUCTION_BACKLOG.md` say
 * what every collectible slot owes: a registry slug, logical dimensions, an
 * anchor, transparency, a documented fallback, and the same source serving the
 * Reveal, the Collection and the Showcase. All of that was **prose**, and prose
 * is what a batch of twenty-four sprites gets generated against.
 *
 * ## The contradiction this file was written to catch
 *
 * It caught one immediately. Every collectible was registered at **32 × 32**
 * while the reveal slot it draws into, `TRAY_REVEAL`, is **46 × 46**. That is a
 * scale of 1.4375 — fractional, and `VISUAL_ACCEPTANCE.md` rejects fractional
 * scaling because it blurs exactly the hard edges the quantizer exists to
 * guarantee. It also breaks the pipeline's own rule 4, *one art pixel is one
 * room unit*.
 *
 * Nothing was visibly wrong, because the art is a placeholder drawn in CSS and
 * CSS does not care. It would have become visible the moment twenty-four sprites
 * arrived at the wrong size — after they were drawn, which is the expensive
 * moment to find out. The registry is corrected to 46 × 46 and this test is what
 * stops it drifting back.
 */

describe('the collectible art slot', () => {
  const items = catalog();

  it('holds the approved catalog', () => {
    expect(items).toHaveLength(CATALOG_SIZE);
  });

  it('authors every collectible at exactly the reveal slot', () => {
    const [, , width, height] = TRAY_REVEAL;
    const expected = `${String(width)}x${String(height)}`;

    for (const item of items) {
      const record = assetRegistry.get(item.slug);
      expect(record, item.slug).toBeDefined();
      // One art pixel is one room unit. A source authored at any other size is
      // resampled into the slot and stops being pixel art.
      expect(record?.canvas, item.slug).toBe(expected);
    }
  });

  it('anchors every collectible bottom-centre', () => {
    for (const item of items) {
      // So a taller replacement grows *upward* rather than sinking through the
      // tray it is standing on.
      expect(assetRegistry.get(item.slug)?.anchor, item.slug).toBe('bottom-center');
    }
  });

  it('gives every collectible a rarity and a name', () => {
    for (const item of items) {
      const record = assetRegistry.get(item.slug);
      expect(RARITIES, item.slug).toContain(record?.rarity);
      // `alt` is the name shown under the item on every surface. An empty one
      // would leave a collectible unidentifiable while the art is a placeholder.
      expect((record?.alt ?? '').length, item.slug).toBeGreaterThan(2);
    }
  });

  it('keeps the box and the collectible different slots', () => {
    // They were the same drawing once, so the reveal showed a box turning into
    // the same box. The slots are different sizes now and must stay so.
    expect(TRAY_BOX[2]).not.toBe(TRAY_REVEAL[2]);
    expect(TRAY_BOX[3]).not.toBe(TRAY_REVEAL[3]);
  });

  it('says honestly how much of the catalog is real', () => {
    /*
     * **Twelve of the twenty-four have art**, as of 2026-08-03 — the number
     * `ASSET_PIPELINE.md §5` commits to at launch.
     *
     * This assertion is deliberately a hard-coded pair rather than a derived
     * count. Deriving it would make it tautological — it would pass whatever the
     * registry happened to say, which is the drift it exists to catch. Updating
     * it is a decision somebody makes on purpose when a batch lands, and the
     * numbers below are the record of the last time that happened.
     *
     * Landed: the arcade token, framed jersey, Bapple Tree, whipped-cream can,
     * arcade cabinet, burn barrel, barrel sauna, diner mug, singing fish, neon
     * sign, checkered tablecloth and McDonald's cookie bag. The remaining twelve
     * draw `placeholder_pizza_box` — an item still in its box, which is
     * thematically right rather than obviously unfinished.
     */
    const byStatus = (status: string): number =>
      items.filter((item) => assetRegistry.get(item.slug)?.artStatus === status).length;

    expect(byStatus('placeholder')).toBe(12);
    expect(byStatus('generated')).toBe(12);
    expect(byStatus('placeholder') + byStatus('generated')).toBe(CATALOG_SIZE);
  });

  it('gives every collectible with art a real file path', () => {
    // `resolveAsset` only returns `art` when the status has moved *and* a path
    // exists. A status flipped without a path renders the placeholder while
    // claiming to be finished, which is the one failure mode that looks fine.
    for (const item of items) {
      const record = assetRegistry.get(item.slug);
      if (record?.artStatus === 'placeholder') continue;
      expect(record?.path, item.slug).toBe(`/assets/collectible/${item.slug}.png`);
    }
  });
});
