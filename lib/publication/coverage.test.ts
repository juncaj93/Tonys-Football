import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEMO_STATES } from '@/lib/demo/states';

import { byPriority, type ReviewItem } from './item';
import { PUBLICATION_KINDS } from './kinds';
import { QUEUE_PREVIEWS, applyQueuePreview, queuePreview } from './preview';
import { countPending } from './queue';

/**
 * The queue's rules, and the driver's agreement with the catalog.
 *
 * ## Why this file needs no database
 *
 * Three of the things worth pinning are pure: the priority order, the pending
 * rule, and the preview's fail-open behaviour. `queue.test.ts` proves them
 * against real drafts; this proves them against inputs a real draft could not
 * easily be arranged into — a tie in the sort key, a misspelt preview, a band
 * that should not count.
 *
 * ## And the failure that has shipped twice
 *
 * `scripts/visual-qa.mts` imports nothing from `lib/` on purpose — it drives a
 * built server over HTTP — so it cannot know what `DEMO_STATES` says. An office
 * state added to the catalog and forgotten in the driver is **never
 * photographed**: no gate fails, no report mentions it, and the first person to
 * notice is whoever goes looking for a screenshot that was never taken.
 *
 * The office has the sharper version of the same hazard on top: `requireAdmin()`
 * answers `notFound()`, so a seat without the commissioner's keys renders a
 * **404** that photographs cleanly and files under the state's name.
 */

const DRIVER = readFileSync(path.join(process.cwd(), 'scripts', 'visual-qa.mts'), 'utf8');

/** The office states the demo catalog declares, plus the empty one. */
const OFFICE_STATES = DEMO_STATES.filter((state) => state.route === '/admin').map(
  (state) => state.key,
);

function officeExpectations(): readonly string[] {
  const table = /const OFFICE_EXPECTATIONS: Record<[\s\S]*?\n> = \{([\s\S]*?)\n\};/.exec(DRIVER);
  if (table === null) {
    throw new Error('could not find OFFICE_EXPECTATIONS in scripts/visual-qa.mts');
  }
  return [...table[1]!.matchAll(/'?(office(?:-[a-z]+)?)'?:/g)].map((match) => match[1]!);
}

const item = (over: Partial<ReviewItem>): ReviewItem => ({
  kind: 'slice',
  id: 'a',
  title: 'A headline',
  subject: 'Season 2025 · Week 1',
  readiness: 'ready',
  blockedReason: null,
  factsVerified: true,
  digest: 'deadbeefdeadbeef',
  updatedAt: new Date('2026-08-01T12:00:00Z'),
  href: '/admin/slice/a',
  ...over,
});

/* -------------------------------------------------------------------------- */

describe('the queue’s order', () => {
  it('puts what you can complete above what you cannot', () => {
    const sorted = [
      item({ id: 'e', readiness: 'published' }),
      item({ id: 'd', readiness: 'incomplete' }),
      item({ id: 'c', readiness: 'blocked' }),
      item({ id: 'b', readiness: 'approved' }),
      item({ id: 'a', readiness: 'ready' }),
    ].sort(byPriority);

    expect(sorted.map((entry) => entry.readiness)).toEqual([
      'ready',
      'approved',
      'blocked',
      'incomplete',
      'published',
    ]);
  });

  it('puts the most recent work on top within a band', () => {
    const sorted = [
      item({ id: 'old', updatedAt: new Date('2026-08-01T00:00:00Z') }),
      item({ id: 'new', updatedAt: new Date('2026-08-02T00:00:00Z') }),
    ].sort(byPriority);

    expect(sorted.map((entry) => entry.id)).toEqual(['new', 'old']);
  });

  /**
   * A total order, not a stable-sort assumption.
   *
   * Two items can share an instant — the clock is injected, and the demo
   * appliers drive several drafts inside one run — and a queue whose order
   * depended on the order rows came back in would photograph differently at
   * three widths under one state name. That failure has shipped here before.
   */
  it('breaks a tied instant deterministically, whatever order it is given', () => {
    const at = new Date('2026-08-01T12:00:00Z');
    const forwards = [item({ id: 'a', updatedAt: at }), item({ id: 'b', updatedAt: at })];
    const backwards = [...forwards].reverse();

    expect([...forwards].sort(byPriority).map((entry) => entry.id)).toEqual(['a', 'b']);
    expect([...backwards].sort(byPriority).map((entry) => entry.id)).toEqual(['a', 'b']);
  });
});

describe('what counts as pending', () => {
  it('counts a decision that can be made and one that is stuck', () => {
    expect(
      countPending([
        item({ id: 'a', readiness: 'ready' }),
        item({ id: 'b', readiness: 'approved' }),
        item({ id: 'c', readiness: 'blocked' }),
      ]),
    ).toBe(3);
  });

  /**
   * A draft nobody submitted is not waiting on anybody.
   *
   * The Tuesday job submits what it drafts, so the only way to make one is to
   * ask for a draft by hand and stop. Counting it would put a permanent number
   * beside the office door for a state nobody can act on, which is how a badge
   * stops being read.
   */
  it('does not count an unsubmitted draft or a printed issue', () => {
    expect(
      countPending([
        item({ id: 'a', readiness: 'incomplete' }),
        item({ id: 'b', readiness: 'published' }),
      ]),
    ).toBe(0);
  });
});

describe('the review-only queue narrowing', () => {
  const demo = { DEMO_FIXTURES: '1', NODE_ENV: 'test' };

  it('shows only the band it names', () => {
    const items = [
      item({ id: 'a', readiness: 'ready' }),
      item({ id: 'b', readiness: 'blocked' }),
      item({ id: 'c', readiness: 'published' }),
    ];

    expect(
      applyQueuePreview(items, queuePreview('ready', demo)).map((entry) => entry.id),
    ).toEqual(['a']);
    expect(applyQueuePreview(items, queuePreview('empty', demo))).toEqual([]);
  });

  /**
   * Three different reasons for one answer, and the answer is *show the truth*.
   *
   * A misspelt preview, an absent one, or a non-demo environment must all leave
   * the real queue alone. The failure being guarded is the worst one this screen
   * has available: a commissioner's queue silently showing nothing looks exactly
   * like a quiet week, which is the ordinary state.
   */
  it('leaves the real queue alone on anything it does not recognise', () => {
    const items = [item({ id: 'a', readiness: 'ready' })];

    expect(queuePreview(undefined, demo)).toBeNull();
    expect(queuePreview('reddy', demo)).toBeNull();
    expect(queuePreview(['ready'], demo)).toBeNull();
    expect(applyQueuePreview(items, null)).toEqual(items);
  });

  it('is refused outside a demo environment, however it is spelt', () => {
    for (const key of QUEUE_PREVIEWS) {
      expect(queuePreview(key, { NODE_ENV: 'production' }), key).toBeNull();
      expect(queuePreview(key, { NODE_ENV: 'test' }), key).toBeNull();
    }
  });
});

describe('the publication registry', () => {
  /**
   * One kind, pinned as a number.
   *
   * Adding a second is a deliberate edit that has to say what editorial surface
   * it is — which is the whole reason a registry exists at a population of one.
   * `docs/PUBLICATION_APPROVAL_BOUNDARY.md §2` is the matrix it has to agree
   * with.
   */
  it('declares exactly the editorial surfaces this product publishes', () => {
    expect(Object.keys(PUBLICATION_KINDS)).toEqual(['slice']);
  });

  it('gives every kind a key that matches its slot, and a label', () => {
    for (const [key, kind] of Object.entries(PUBLICATION_KINDS)) {
      expect(kind.key, key).toBe(key);
      expect(kind.label.length, key).toBeGreaterThan(0);
    }
  });
});

describe('the visual driver and the office catalog agree', () => {
  /**
   * Five, and each is a different answer to *"is there anything for me"*.
   *
   * `office` is declared outside the office family — it predates the queue and
   * keeps its name, because it is the state a commissioner meets today.
   */
  it('photographs every office state the catalog declares', () => {
    for (const key of [...OFFICE_STATES, 'office']) {
      expect(DRIVER, key).toContain(`case '${key}':`);
    }
  });

  it('gives every one of them something to prove', () => {
    expect([...officeExpectations()].sort()).toEqual([...OFFICE_STATES, 'office'].sort());
  });

  /**
   * The narrowing the driver asks for has to be one the product resolves.
   *
   * A driver navigating to `?queue=reddy` would get the **unfiltered** queue —
   * fail-open, by design — photograph it under a narrowed state's name, and only
   * the composition check would notice. This makes the typo a unit failure
   * instead.
   */
  it('only asks for previews the product knows', () => {
    const asked = [...DRIVER.matchAll(/\/admin\?queue=([a-z]+)/g)].map((match) => match[1]!);
    expect(asked.length).toBeGreaterThan(0);
    for (const key of asked) {
      expect(QUEUE_PREVIEWS, key).toContain(key);
    }
  });
});
