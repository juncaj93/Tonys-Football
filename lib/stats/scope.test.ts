import { describe, expect, it } from 'vitest';

import {
  APPROVED_ERA_WORDING,
  describeScope,
  findOverclaims,
  HISTORICAL_OVERCLAIMS,
  scopeOf,
} from './scope';

/**
 * The scope layer, and the four words it exists to refuse.
 *
 * The tests that matter here are the **near-negatives**: a scope that reaches
 * one season further than the population, and a sentence that overclaims by a
 * single word while every number in it is correct. Both produce output that
 * looks right, which is why neither is caught by reading.
 */

describe('scopeOf', () => {
  it('describes the tracked era by its first recorded season, never as all time', () => {
    const scope = scopeOf({ kind: 'tracked-era', seasons: [2025, 2024], observations: 162 });

    expect(scope.firstSeason).toBe(2024);
    expect(scope.lastSeason).toBe(2025);
    expect(scope.seasons).toEqual([2024, 2025]);
    expect(scope.label).toBe('since 2024');
    expect(scope.observations).toBe(162);
    expect(scope.finalizedOnly).toBe(true);
  });

  it('never produces a label an overclaim scan would refuse', () => {
    const labels = [
      scopeOf({ kind: 'tracked-era', seasons: [2024, 2025], observations: 1 }).label,
      scopeOf({ kind: 'season', seasons: [2025], observations: 1 }).label,
      scopeOf({ kind: 'season-to-date', seasons: [2026], observations: 1, throughWeek: 7 }).label,
      scopeOf({ kind: 'week', seasons: [2026], observations: 1, throughWeek: 7 }).label,
      ...APPROVED_ERA_WORDING,
    ];

    for (const label of labels) expect(findOverclaims(label)).toEqual([]);
  });

  it('moves its label when the population moves — a scope cannot outlive its data', () => {
    // The failure this guards is a label cached from a wider population than the
    // claim was measured on: "since 2024" printed over a 2025-only record.
    const wide = scopeOf({ kind: 'tracked-era', seasons: [2024, 2025], observations: 162 });
    const narrow = scopeOf({ kind: 'tracked-era', seasons: [2025], observations: 81 });

    expect(wide.label).toBe('since 2024');
    expect(narrow.label).toBe('since 2025');
  });

  it('refuses a scope over no seasons rather than describing nothing', () => {
    expect(() => scopeOf({ kind: 'tracked-era', seasons: [], observations: 0 })).toThrow(
      /describes nothing/,
    );
  });

  it('refuses a week-shaped scope with no week, and a season scope over two seasons', () => {
    expect(() => scopeOf({ kind: 'week', seasons: [2026], observations: 1 })).toThrow(
      /needs the week/,
    );
    expect(() =>
      scopeOf({ kind: 'season-to-date', seasons: [2026], observations: 1 }),
    ).toThrow(/needs the week/);
    expect(() => scopeOf({ kind: 'season', seasons: [2024, 2025], observations: 1 })).toThrow(
      /exactly one season/,
    );
  });

  it('is deterministic and order-independent in its season list', () => {
    const a = scopeOf({ kind: 'tracked-era', seasons: [2025, 2024, 2024], observations: 5 });
    const b = scopeOf({ kind: 'tracked-era', seasons: [2024, 2025], observations: 5 });
    expect(a).toEqual(b);
  });
});

describe('describeScope', () => {
  it('words each kind the way a sentence needs it', () => {
    expect(
      describeScope({ kind: 'week', firstSeason: 2026, lastSeason: 2026, throughWeek: 7 }),
    ).toBe('in week 7 of 2026');
    expect(
      describeScope({ kind: 'season', firstSeason: 2025, lastSeason: 2025, throughWeek: null }),
    ).toBe('in the 2025 season');
    expect(
      describeScope({
        kind: 'season-to-date',
        firstSeason: 2026,
        lastSeason: 2026,
        throughWeek: 7,
      }),
    ).toBe('in 2026 through week 7');
    expect(
      describeScope({ kind: 'tracked-era', firstSeason: 2024, lastSeason: 2025, throughWeek: null }),
    ).toBe('since 2024');
  });
});

describe('findOverclaims', () => {
  it('refuses exactly the four terms `docs/DATA_AUDIT.md §15` bans', () => {
    expect(HISTORICAL_OVERCLAIMS).toHaveLength(4);

    for (const sentence of [
      'The highest score all-time.',
      'The highest score all time.',
      'The biggest margin ever recorded.',
      'The widest win in league history.',
      'A franchise record for points.',
    ]) {
      expect(findOverclaims(sentence).length).toBeGreaterThan(0);
    }
  });

  it('passes the same claim once it is scoped — the number was never the problem', () => {
    // The two sentences describe the identical, correctly derived fact. Only one
    // of them is true, and nothing but the wording separates them.
    expect(findOverclaims('Brandon posted 183.94, the highest score ever.')).not.toEqual([]);
    expect(findOverclaims('Brandon posted 183.94, the highest score since 2024.')).toEqual([]);
  });

  it('does not fire on ordinary words that contain a banned one', () => {
    for (const sentence of [
      'He never trailed.',
      'However the week went, it was close.',
      'Whenever they meet it is tight.',
      'The margin was severe.',
      'Everyone scored.',
    ]) {
      expect(findOverclaims(sentence)).toEqual([]);
    }
  });

  it('reports every overclaim in a sentence, not only the first', () => {
    const found = findOverclaims('The best all-time performance in league history.');
    expect(found.map((entry) => entry.term.toLowerCase())).toEqual([
      'all-time',
      'in league history',
    ]);
  });

  it('carries a reason a reviewer can act on', () => {
    const [first] = findOverclaims('the highest ever');
    expect(first?.why).toContain('2024');
  });

  it('has no lastIndex to leak between calls', () => {
    // A shared `/g` regex would make the second call miss. Two identical calls
    // must give two identical answers.
    const once = findOverclaims('the widest margin ever');
    const twice = findOverclaims('the widest margin ever');
    expect(twice).toEqual(once);
    expect(twice).not.toEqual([]);
  });
});
