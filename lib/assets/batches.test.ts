import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { catalog } from '@/lib/counter/catalog';

import { THEMES, THEME_SPECS } from '@/lib/rooms/themes';

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


/**
 * Batch E — the basement shells — is briefed but **not in `ART_BATCHES`**, and
 * that is a decision rather than an omission.
 *
 * `ART_BATCHES` is checked by `npm run art:batch`, which is a **collectible**
 * delivery checker: it looks in `public/assets/collectible/`, and it validates
 * each file through `inspect()` in `validate-collectible.ts`, which measures a
 * 46 × 46 sprite with a bottom-centre anchor and a transparent margin. A
 * 960 × 1707 opaque room shell fails every one of those checks by being what it
 * is. Generalising that script is a real piece of work and this batch does not
 * need it — `npm run art:process` already handles shells, and did for
 * `zone_parlor_shell`.
 *
 * What the manifest genuinely buys is that **the document and the registry
 * cannot drift**, so a slug briefed for generation is a slug the product can
 * actually resolve. That is the half worth keeping, and it is this.
 */
describe('the basement handoff', () => {
  const HANDOFF = 'docs/art/BATCH_E_BASEMENT_HANDOFF.md';
  const document = readFileSync(path.join(process.cwd(), HANDOFF), 'utf8');

  it('briefs exactly the three shells the themes resolve', () => {
    for (const theme of THEMES) {
      const { shell } = THEME_SPECS[theme];
      expect(document, `${shell} is not briefed in ${HANDOFF}`).toContain(shell);
      expect(assetRegistry.get(shell), `${shell} has no registry row`).toBeDefined();
    }

    // The other direction: a slug briefed and not registered is art that arrives,
    // is reported as unexpected, and is never processed.
    const briefed = new Set(
      [...document.matchAll(/zone_room_shell_[a-z_]+/g)].map((match) => match[0]),
    );
    const resolved = new Set(THEMES.map((theme) => THEME_SPECS[theme].shell));
    expect([...briefed].sort()).toEqual([...resolved].sort());
  });

  it('briefs them at the canvas the room is authored in', () => {
    // `960 x 1707` is `320 x 569` at the pipeline's 3x authoring scale. A shell
    // generated to any other number is resampled into the room and stops being
    // pixel art — the same defect the collectibles' 32-into-46 slot would have been.
    expect(document).toContain('960 × 1707');

    for (const theme of THEMES) {
      expect(assetRegistry.get(THEME_SPECS[theme].shell)?.canvas).toBe('960x1707');
    }
  });

  it('tells the generator to leave every prepared place empty', () => {
    /*
     * `zone_tile.md §2` calls these *"prepared places"* and the failure mode is
     * specific: anything painted where a manager's own things go is covered by a
     * sprite at runtime and reads as a rendering bug. Six of them, and the
     * handoff has to name every one.
     */
    for (const place of ['frame', 'shelf', 'desk', 'pennant', 'noticeboard', 'rug']) {
      expect(document.toLowerCase(), `${place} is not listed as a prepared place`).toContain(place);
    }
    expect(document).toMatch(/drawn as empty|completely empty|drawn completely empty|must be empty/i);
  });
});
