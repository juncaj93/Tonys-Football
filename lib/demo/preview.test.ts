import { describe, expect, it } from 'vitest';

import { RARITIES } from '@/lib/counter/catalog';

import { previewReveal } from './preview';

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

  it('shows the same item at every width, so screenshots compare', () => {
    // Deterministic: the first of the tier in catalog order, and catalog order
    // is itself a stable sort. A random pick would make three screenshots of one
    // state show three different objects.
    expect(previewReveal('epic', ALLOWED)).toEqual(previewReveal('epic', ALLOWED));
  });
});
