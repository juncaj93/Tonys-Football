import { describe, expect, it } from 'vitest';

import { RARITIES } from '@/lib/counter/catalog';
import { renderTemplate } from '@/lib/content/select';
import { readBoxOffers } from '@/lib/content/seed';
import { PROVISIONAL_ECONOMY } from '@/lib/counter/tokens';

import { PREVIEW_STAGES, previewReveal } from './preview';

/**
 * The preview reveal, and mostly what it refuses.
 *
 * This is the one demo mechanism that lives on a **production code path** — a
 * query parameter the homepage reads on every render — so the tests that matter
 * are the ones asking it to work where it must not.
 */

const ALLOWED = { DEMO_FIXTURES: '1' } as const;

describe('the preview reveal', () => {
  it('is null in production, whatever the opt-in says', () => {
    for (const rarity of RARITIES) {
      expect(
        previewReveal(rarity, { VERCEL_ENV: 'production', DEMO_FIXTURES: '1' }),
      ).toBeNull();
    }
  });

  it('is null without the explicit opt-in', () => {
    expect(previewReveal('legendary', {})).toBeNull();
    expect(previewReveal('legendary', { DEMO_FIXTURES: '0' })).toBeNull();
  });

  it('is null for every ordinary request', () => {
    // The overwhelmingly common case: no parameter at all. The room must render
    // exactly as it would have, with no branch taken.
    expect(previewReveal(undefined, ALLOWED)).toBeNull();
    expect(previewReveal('', ALLOWED)).toBeNull();
    // A repeated parameter arrives as an array. Not a tier, so not a reveal.
    expect(previewReveal(['legendary', 'common'], ALLOWED)).toBeNull();
  });

  it('is null for anything that is not a tier', () => {
    for (const junk of ['LEGENDARY', 'mythic', '1', 'common;drop', '../']) {
      expect(previewReveal(junk, ALLOWED), junk).toBeNull();
    }
  });

  it('builds a real payload for each tier when it is allowed to', () => {
    for (const rarity of RARITIES) {
      const payload = previewReveal(rarity, ALLOWED);
      expect(payload, rarity).not.toBeNull();
      expect(payload?.rarity).toBe(rarity);
      // A real catalog slug and its registry name, so the plate says something
      // true even though the occasion is synthetic.
      expect(payload?.slug).toMatch(/^collectible_/);
      expect((payload?.name ?? '').length).toBeGreaterThan(2);
      expect(payload?.replayed).toBe(false);
    }
  });

  /**
   * The preview's offer lines are literals, so that a review-only screenshot
   * does not put a filesystem read on the parlor's hot path. That has one way to
   * go wrong — an approved line is edited and nobody remembers these copies —
   * and this is the test that makes it a build failure instead of a stale
   * screenshot nobody questions.
   */
  it('quotes every approved offer line exactly, or fails', () => {
    const approved = readBoxOffers();

    for (const stage of PREVIEW_STAGES) {
      const payload = previewReveal('rare', ALLOWED, stage);
      const offer = payload?.offer ?? null;

      if (offer === null) continue;

      const entry = approved.find((candidate) => candidate.key === offer.entryKey);
      expect(entry, `${stage} names ${offer.entryKey}, which is not in the file`).toBeDefined();

      expect(offer.line, stage).toBe(
        renderTemplate(entry!.templateText, {
          price: String(PROVISIONAL_ECONOMY.standardBoxPriceTokens),
        }),
      );
      expect(offer.price, stage).toBe(PROVISIONAL_ECONOMY.standardBoxPriceTokens);
    }
  });

  it('reaches every composition the plate has', () => {
    // The point of the parameter. Each of these renders a different pair of
    // lines at the bottom of the plate, and before it existed only `mid` had
    // ever been looked at.
    expect(previewReveal('rare', ALLOWED, 'first')?.distinct).toBe(1);
    expect(previewReveal('rare', ALLOWED, 'mid')?.distinct).toBe(7);
    expect(previewReveal('rare', ALLOWED, 'complete')?.distinct).toBe(
      previewReveal('rare', ALLOWED, 'complete')?.total,
    );

    // The one that matters most: no offer at all. Not a disabled one.
    expect(previewReveal('rare', ALLOWED, 'broke')?.offer).toBeNull();
  });

  it('falls back to the middle rather than blanking the room', () => {
    // A typo in the second parameter must not cost the caller the rarity they
    // did ask for correctly.
    expect(previewReveal('rare', ALLOWED, 'FIRST')).toEqual(previewReveal('rare', ALLOWED));
    expect(previewReveal('rare', ALLOWED, ['first'])).toEqual(previewReveal('rare', ALLOWED));
  });

  it('shows the same item at every width, so screenshots compare', () => {
    // Deterministic: the first of the tier in catalog order, and catalog order
    // is itself a stable sort. A random pick would make three screenshots of one
    // state show three different objects.
    expect(previewReveal('epic', ALLOWED)).toEqual(previewReveal('epic', ALLOWED));
  });
});
