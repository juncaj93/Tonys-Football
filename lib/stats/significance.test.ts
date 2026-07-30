import { describe, expect, it } from 'vitest';

import {
  EDGED_MAX_MARGIN,
  INTENSITIES,
  MIN_POPULATION,
  PROVISIONAL_TIERS,
  classify,
  percentileOf,
  standardPolicy,
} from './significance';

/**
 * The classifier.
 *
 * Pure arithmetic, so these run without a database — and the cases below are the
 * ones the commissioner named directly, plus the two that would each be a
 * plausible-sounding lie.
 */

const policy = standardPolicy();

describe('classifying a margin', () => {
  it('needs both an absolute floor and league context above `beat`', () => {
    // 45 points clears the `obliterated` floor of 40 and nothing else. In a
    // league where 45 is ordinary it is not an obliteration, and the percentile
    // is the only thing that knows that.
    expect(classify(policy, { margin: 45, percentile: 50, isSeasonLargest: false })).toBe(
      'beat',
    );
    expect(classify(policy, { margin: 45, percentile: 96, isSeasonLargest: false })).toBe(
      'obliterated',
    );
  });

  it('does not let a quiet week manufacture a blowout', () => {
    // The failure the commissioner named: in a week whose largest margin is
    // nine points, that game is the 100th percentile *of its week*. It is a
    // close week, not a blowout, and no absolute floor is cleared.
    expect(classify(policy, { margin: 9, percentile: 100, isSeasonLargest: false })).toBe(
      'beat',
    );
  });

  it('caps at `beat` when the population was too small for a percentile', () => {
    // Not an error, and not a licence to guess. Every tier above `beat` needs
    // league context, and inventing the context is the failure the whole file
    // exists to prevent.
    expect(classify(policy, { margin: 120, percentile: null, isSeasonLargest: false })).toBe(
      'beat',
    );
  });

  it('treats a very close game as edged whatever its percentile', () => {
    expect(classify(policy, { margin: 0.18, percentile: 1, isSeasonLargest: false })).toBe(
      'edged',
    );
    expect(classify(policy, { margin: EDGED_MAX_MARGIN, percentile: 99, isSeasonLargest: false })).toBe(
      'edged',
    );
    expect(
      classify(policy, { margin: EDGED_MAX_MARGIN + 0.01, percentile: 1, isSeasonLargest: false }),
    ).toBe('beat');
  });

  it("promotes a season's largest margin, but only if it clears the floor", () => {
    expect(classify(policy, { margin: 41, percentile: 10, isSeasonLargest: true })).toBe(
      'obliterated',
    );
    // A season whose biggest win was eleven points does not get an obliteration
    // out of it. Without this proviso the escape hatch manufactures one every
    // year, by construction.
    expect(classify(policy, { margin: 11, percentile: 100, isSeasonLargest: true })).toBe(
      'beat',
    );
  });

  it('gives the strongest claim the margin can actually support', () => {
    expect(classify(policy, { margin: 25, percentile: 75, isSeasonLargest: false })).toBe(
      'handled',
    );
    expect(classify(policy, { margin: 35, percentile: 90, isSeasonLargest: false })).toBe(
      'crushed',
    );
    // Clears the crushed floor but not its percentile: falls back rather than
    // failing, because `handled`'s conditions are genuinely met.
    expect(classify(policy, { margin: 35, percentile: 72, isSeasonLargest: false })).toBe(
      'handled',
    );
  });

  it('classifies the mandate’s worked example by its percentile, not its margin', () => {
    // `PRODUCT_DELIVERY_MANDATE.md §10` — "Matty B obliterated Nathan by 50.51"
    // carries `historicalMarginPercentile: 95`, and is obliterated *because of
    // that*. In this league's real history 50.51 sits at the 84th, where the
    // same margin is `handled`. Both are correct; the calibration is the point.
    expect(classify(policy, { margin: 50.51, percentile: 95, isSeasonLargest: false })).toBe(
      'obliterated',
    );
    expect(classify(policy, { margin: 50.51, percentile: 84, isSeasonLargest: false })).toBe(
      'handled',
    );
  });
});

describe('the percentile', () => {
  const population = Array.from({ length: 200 }, (_, i) => i + 1);

  it('is the share at or below, so the largest value is the 100th', () => {
    expect(percentileOf(population, 200, MIN_POPULATION)).toBe(100);
    expect(percentileOf(population, 100, MIN_POPULATION)).toBe(50);
    expect(percentileOf(population, 1, MIN_POPULATION)).toBe(1);
  });

  it('refuses a population too small to mean anything', () => {
    expect(percentileOf([1, 2, 3], 3, MIN_POPULATION)).toBeNull();
    expect(percentileOf(population.slice(0, MIN_POPULATION - 1), 50, MIN_POPULATION)).toBeNull();
    expect(percentileOf(population.slice(0, MIN_POPULATION), 50, MIN_POPULATION)).not.toBeNull();
  });
});

describe('the policy itself', () => {
  it('is versioned by its content, so an edit cannot reuse a version', () => {
    expect(standardPolicy().version).toBe(standardPolicy().version);
    expect(standardPolicy().version).toMatch(/^[0-9a-f]{16}$/);
  });

  it('ships provisional until the P3 calibration', () => {
    // `16 §8`. The same gate reward weights are under, and for the same reason.
    expect(standardPolicy().provisional).toBe(true);
  });

  it('names every intensity exactly once, in escalation order', () => {
    expect(PROVISIONAL_TIERS.map((tier) => tier.intensity)).toEqual([...INTENSITIES]);
  });

  it('keeps every absolute floor the commissioner set', () => {
    const floor = (name: string): number =>
      PROVISIONAL_TIERS.find((tier) => tier.intensity === name)?.minMargin ?? -1;

    expect(EDGED_MAX_MARGIN).toBe(5);
    expect(floor('handled')).toBe(20);
    expect(floor('crushed')).toBe(30);
    expect(floor('obliterated')).toBe(40);
  });

  it('gates `handled` on a percentile too — the one documented change', () => {
    // Measured over all 162 finalized games of 2024 and 2025, the median margin
    // in this league is 20.6, so a bare `>= 20` covers 54% of games. A tier
    // describing the majority is not a classification.
    const handled = PROVISIONAL_TIERS.find((tier) => tier.intensity === 'handled');
    expect(handled?.minPercentile).toBe(70);
  });
});
