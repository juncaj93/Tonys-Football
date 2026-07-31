import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { catalog } from '@/lib/counter/catalog';

import { ART_BATCHES, BATCH_B, BATCH_B2 } from './batches';
import { assetRegistry } from './registry';

/**
 * A batch manifest and its handoff document cannot disagree.
 *
 * `npm run art:batch` checks delivery against `batches.ts`; a generator works
 * from the Markdown. If they drift, the batch that arrives is not the batch that
 * is expected — and the failure is a filename mismatch on the day the art lands,
 * which is the worst possible day to discover a documentation bug.
 *
 * The Markdown is authoritative for *how to draw the thing*. This file is
 * authoritative for *which things*. The test makes that split safe.
 */

function handoff(batch: { handoff: string }): string {
  return readFileSync(path.join(process.cwd(), batch.handoff), 'utf8');
}

describe.each(ART_BATCHES)('batch $key', (batch) => {
  it('briefs every slug it claims, in its handoff document', () => {
    const document = handoff(batch);
    for (const slug of batch.slugs) {
      expect(document, `${slug} is missing from ${batch.handoff}`).toContain(slug);
    }
  });

  it('claims every collectible its handoff briefs a production filename for', () => {
    // The other direction. A slug briefed in the document and absent from the
    // manifest is a sprite that arrives, is reported as unexpected, and is never
    // processed — the exact silent gap the manifest exists to close.
    const briefed = [
      ...handoff(batch).matchAll(/public\/assets\/collectible\/(collectible_[a-z_]+)\.png/g),
    ].map((match) => match[1]!);

    expect([...new Set(briefed)].sort()).toEqual([...batch.slugs].sort());
  });

  it('names only registered slugs, at the size the tray draws', () => {
    for (const slug of batch.slugs) {
      const entry = assetRegistry.get(slug);
      expect(entry, `${slug} has no registry row`).toBeDefined();
      // Every collectible was once registered at 32x32 while the slot it draws
      // into is 46 — a 1.4375x resample that would have blurred an entire batch,
      // discoverable only after it was drawn.
      expect(entry!.canvas, `${slug} canvas`).toBe('46x46');
      expect(entry!.anchor, `${slug} anchor`).toBe('bottom-center');
    }
  });

  it('names only items that are actually in the catalog', () => {
    const slugs = new Set(catalog().map((item) => item.slug));
    for (const slug of batch.slugs) {
      expect(slugs.has(slug), `${slug} is not one of the 24 catalog items`).toBe(true);
    }
  });
});

describe('the two batches together', () => {
  it('overlap nowhere', () => {
    const overlap = BATCH_B.slugs.filter((slug) => BATCH_B2.slugs.includes(slug));
    expect(overlap).toEqual([]);
  });

  it('reach the twelve-of-twenty-four launch commitment', () => {
    /*
     * `art/ASSET_PIPELINE.md §5`, `art/assets.inventory.json` and
     * `art/prompts/collectible.md` all state the same split, written before the
     * question of how many M2 needs came up: **12 receive finished art at
     * launch**, the rest ship as `placeholder_pizza_box` and upgrade on any
     * Tuesday.
     *
     * Eight closes M2 — that is a determination about proving the *system*. Twelve
     * is owed by the time the season starts, which is a different commitment with
     * a different date, and this is the assertion that keeps the second one from
     * being quietly forgotten once the first is met.
     */
    expect(BATCH_B.slugs.length + BATCH_B2.slugs.length).toBe(12);
    expect(catalog()).toHaveLength(24);
  });

  it('spread across rarities rather than clustering', () => {
    // A batch of eight legendaries would prove nothing about how the tray treats
    // a common. Every rarity has to appear across the twelve.
    const items = new Map(catalog().map((item) => [item.slug, item]));
    const rarities = new Set(
      [...BATCH_B.slugs, ...BATCH_B2.slugs].map((slug) => items.get(slug)?.rarity),
    );
    expect(rarities.size).toBeGreaterThanOrEqual(4);
  });
});
