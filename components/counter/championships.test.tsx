import { readFileSync } from 'node:fs';
import path from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { type HeldRing } from '@/lib/counter/rings';

import { Championships } from './championships';

/**
 * The championship shelf, as rendered — and as a boundary.
 *
 * Two different jobs. The render assertions catch what only appears on the page;
 * the source assertions keep the component from ever becoming the thing that
 * decides who won, which is the failure `MANDATE §9` names and which no
 * screenshot could show.
 */

const ROOT = process.cwd();

function ring(year: number): HeldRing {
  return { year, slug: 'item_championship_ring', acquiredAt: new Date('2026-01-06T00:00:00Z') };
}

describe('the championship shelf', () => {
  it('says what is true when there are no titles', () => {
    const markup = renderToStaticMarkup(<Championships rings={[]} />);

    expect(markup).toContain('No titles yet');
    // No locked slots and no progress: there is nothing to unlock, and implying
    // a chase is one of `16 §8`'s explicit non-goals.
    expect(markup).not.toMatch(/locked|\b0 of \b|progress/i);
    expect(markup).toContain('data-championships="0"');
  });

  it('prints one plate per title, with the year', () => {
    const markup = renderToStaticMarkup(<Championships rings={[ring(2024)]} />);

    expect(markup).toContain('2024');
    expect(markup).toContain('data-championship-year="2024"');
    expect(markup).toContain('data-championships="1"');
  });

  it('keeps a repeat champion’s titles apart rather than collapsing them', () => {
    /*
     * The whole reason rings are rows and not a boolean. One asset serves every
     * championship, so if the years did not both appear a second title would be
     * invisible — the product forgetting something that happened.
     */
    const markup = renderToStaticMarkup(<Championships rings={[ring(2024), ring(2025)]} />);

    expect(markup).toContain('2024');
    expect(markup).toContain('2025');
    expect(markup).toContain('data-championships="2"');
    expect((markup.match(/data-championship-year=/g) ?? []).length).toBe(2);
  });

  it('renders the years it is handed, in the order it is handed them', () => {
    // It does not sort. `ringsFor` orders by season and this prints that order,
    // so there is exactly one place that decides what "oldest first" means.
    const markup = renderToStaticMarkup(<Championships rings={[ring(2025), ring(2024)]} />);
    expect(markup.indexOf('2025')).toBeLessThan(markup.indexOf('2024'));
  });

  it('does no championship arithmetic, and cannot reach the database', () => {
    /*
     * The boundary, asserted against the source because it is about what the
     * component is *able* to do rather than what it happens to render. A display
     * component that could decide a champion is a second championship authority,
     * and two authorities disagree eventually — the wall says one name and the
     * Collection says another.
     */
    const source = readFileSync(path.join(ROOT, 'components', 'counter', 'championships.tsx'), 'utf8');

    for (const banned of ['@/lib/db', 'drizzle-orm', 'finalRank', 'final_rank', 'finalizedAt']) {
      expect(source, `championships.tsx references ${banned}`).not.toContain(banned);
    }
    // No comparison or ranking of seasons, and no counting beyond the length it
    // is given for the marker attribute.
    expect(source).not.toMatch(/\.sort\(|\.filter\(|===\s*1\b|rank/);
  });

  it('is not reachable from the box catalog', async () => {
    // Belt and braces beside `rings.test.ts`: the shelf exists because the ring
    // is excluded from `catalog()`, so if that ever flipped this page would be
    // showing an item the box could also produce.
    const { catalog } = await import('@/lib/counter/catalog');
    expect(catalog().map((i) => i.slug)).not.toContain('item_championship_ring');
  });
});
