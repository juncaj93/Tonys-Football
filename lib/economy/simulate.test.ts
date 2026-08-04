import { describe, expect, it } from 'vitest';

import { CATALOG_SIZE } from '@/lib/counter/catalog';
import { standardRewardTable } from '@/lib/counter/rewards';
import { PROVISIONAL_ECONOMY } from '@/lib/counter/tokens';

import {
  type DuplicatePolicy,
  type SimulationInput,
  PROFILES,
  checkRanges,
  salvageFor,
  generator,
  rarityMass,
  simulate,
} from './simulate';

/**
 * The release gate's own tests.
 *
 * A simulation is a strange thing to test, because the numbers it produces are
 * the thing under review rather than a known answer — asserting that boxes come
 * out at 31.5 would pin the very value the gate exists to question.
 *
 * So these assert **properties** instead: that the result is reproducible, that
 * it responds to its inputs in the direction it should, and that the rules it
 * claims to model are the rules it actually models. A simulation that is not
 * reproducible cannot be approved, and one that quietly ignores a price cannot
 * be trusted about a price.
 */

function input(over: Partial<SimulationInput> = {}): SimulationInput {
  return {
    economy: PROVISIONAL_ECONOMY,
    table: standardRewardTable(),
    seasons: 5,
    managers: 10,
    weeks: 14,
    salvage: salvageFor(PROVISIONAL_ECONOMY.standardBoxPriceTokens),
    grantsPerSeason: 2,
    // The rule the product now follows (`0014`). The counterfactual is asked
    // for explicitly, in the two tests that compare the two.
    policy: 'specified',
    seed: 20260804,
    catalogSize: CATALOG_SIZE,
    ...over,
  };
}

describe('the generator', () => {
  it('is reproducible from its seed', () => {
    const a = generator(42);
    const b = generator(42);
    const first = Array.from({ length: 20 }, () => a());
    const second = Array.from({ length: 20 }, () => b());
    expect(first).toEqual(second);
  });

  it('produces a different stream from a different seed', () => {
    const a = Array.from({ length: 20 }, generator(1));
    const b = Array.from({ length: 20 }, generator(2));
    expect(a).not.toEqual(b);
  });

  it('stays inside [0, 1)', () => {
    const next = generator(7);
    for (let i = 0; i < 5000; i += 1) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('the simulation', () => {
  it('is reproducible — the same seed gives the same league', () => {
    /*
     * The load-bearing property. `16 §8` makes this a **release gate**, and a
     * gate whose output moves between two runs cannot be approved: "the ranges"
     * would mean whichever run somebody happened to read.
     */
    expect(simulate(input())).toEqual(simulate(input()));
  });

  it('gives a different league on a different seed', () => {
    expect(simulate(input({ seed: 1 }))).not.toEqual(simulate(input({ seed: 2 })));
  });

  it('never pays a token outside the weekly loop', () => {
    // `16 §8`: "All tokens arrive once a week, with the Slice. No daily
    // anything, ever." Reported as a measurement, so it cannot quietly become
    // an assumption.
    for (const policy of ['as-built', 'specified'] as DuplicatePolicy[]) {
      expect(simulate(input({ policy })).nonTuesdayRewards).toBe(0);
    }
  });

  it('pays the best manager more than the worst', () => {
    const result = simulate(input());
    const best = result.managers.find((m) => m.profile === 'best');
    const worst = result.managers.find((m) => m.profile === 'worst');
    expect(best!.tokensEarned).toBeGreaterThan(worst!.tokensEarned);
  });

  it('reads the prices it is given rather than a copy of them', () => {
    /*
     * Doubling the box price must roughly halve the boxes. Without this, a
     * simulation could drift into hard-coded numbers and still look plausible —
     * and its whole value is that it measures *these* prices.
     */
    const cheap = simulate(
      input({ economy: { ...PROVISIONAL_ECONOMY, standardBoxPriceTokens: 100 } }),
    );
    const dear = simulate(
      input({ economy: { ...PROVISIONAL_ECONOMY, standardBoxPriceTokens: 200 } }),
    );
    const boxes = (r: ReturnType<typeof simulate>): number =>
      r.managers.reduce((n, m) => n + m.boxesPerSeason.reduce((a, b) => a + b, 0), 0);

    expect(boxes(dear)).toBeLessThan(boxes(cheap));
    expect(boxes(dear)).toBeGreaterThan(boxes(cheap) * 0.4);
  });

  it('earns nothing at all when the rules pay nothing', () => {
    const broke = simulate(
      input({
        economy: {
          ...PROVISIONAL_ECONOMY,
          seasonStartTokens: 0,
          matchupWinTokens: 0,
          weeklyHighScoreTokens: 0,
        },
      }),
    );
    // `apply_token_delta` rejects a zero delta in the product; here a zero
    // price simply means nothing is earned and nothing is bought.
    for (const manager of broke.managers) {
      expect(manager.tokensEarned).toBe(0);
      expect(manager.boxesPerSeason.every((n) => n === 0)).toBe(true);
    }
  });

  it('grants the welcome box once, ever — not once a season', () => {
    // `03 §5`: one per manager, granted once. Isolated from the seasonal grants
    // so the two sources cannot be confused for each other.
    const one = simulate(input({ seasons: 1, weeks: 0, grantsPerSeason: 0 }));
    const five = simulate(input({ seasons: 5, weeks: 0, grantsPerSeason: 0 }));
    for (const manager of one.managers) expect(manager.openings).toBe(1);
    for (const manager of five.managers) expect(manager.openings).toBe(1);
  });

  it('grants exactly two free boxes a season, every season', () => {
    /*
     * The commissioner's ruling: two universally available milestones, season
     * opening and midseason. Not earned, not conditional — so every manager has
     * the same two in every season, and the count is seasons x 2.
     */
    const result = simulate(input({ seasons: 4, weeks: 14, grantsPerSeason: 2 }));
    for (const manager of result.managers) expect(manager.grants).toBe(8);
  });

  it('pays salvage only into the balance it came from', () => {
    // Salvage is a feedback loop: tokens returned buy more boxes. Modelling it
    // as a counter rather than as money would understate openings on exactly
    // the managers closest to finishing a set.
    const withSalvage = simulate(input({ policy: 'specified' }));
    const without = simulate(
      input({
        policy: 'specified',
        salvage: { common: 0, rare: 0, epic: 0, legendary: 0 },
      }),
    );
    const openings = (r: ReturnType<typeof simulate>): number =>
      r.managers.reduce((n, m) => n + m.openings, 0);
    expect(openings(withSalvage)).toBeGreaterThan(openings(without));
  });
});

describe('the duplicate policies', () => {
  it('as-built lets the same item come up twice', () => {
    const result = simulate(input({ policy: 'as-built' }));
    expect(result.managers.reduce((n, m) => n + m.duplicates, 0)).toBeGreaterThan(0);
  });

  it('specified never hands over an item already owned', () => {
    /*
     * `16 §8`: "roll rarity → pick an **unowned** item in that tier → if
     * exhausted, salvage tokens." Under that rule every non-salvage opening adds
     * an item, so owned count and non-salvage openings move together.
     */
    const result = simulate(input({ policy: 'specified' }));
    for (const manager of result.managers) {
      expect(manager.owned).toBe(Math.min(manager.openings - manager.salvaged, CATALOG_SIZE));
    }
  });

  it('specified completes a collection no slower than as-built', () => {
    const built = simulate(input({ policy: 'as-built' }));
    const spec = simulate(input({ policy: 'specified' }));
    const completed = (r: ReturnType<typeof simulate>): number =>
      r.managers.filter((m) => m.completedInSeason !== null).length;
    expect(completed(spec)).toBeGreaterThanOrEqual(completed(built));
  });

  it('only salvages once a tier is exhausted', () => {
    // A manager who never fills a tier should never salvage. One season, and
    // the catalog is far from complete.
    const early = simulate(input({ policy: 'specified', seasons: 1, weeks: 1 }));
    for (const manager of early.managers) expect(manager.salvaged).toBe(0);
  });
});

describe('the reward table it reads', () => {
  it('takes rarity mass from the real table', () => {
    const table = standardRewardTable();
    const mass = rarityMass(table);
    const summed = [...mass.values()].reduce((a, b) => a + b, 0);
    expect(summed).toBe(table.totalWeight);
    // Legendary is the scarcest tier; the simulation must not invent its own.
    expect(mass.get('legendary')).toBeLessThan(mass.get('common') ?? 0);
  });
});

describe('the range checks', () => {
  it('reports every range 16 §8 names, and says which held', () => {
    const checks = checkRanges(simulate(input()));
    const names = checks.map((c) => c.name);
    expect(names).toContain('Boxes per manager per season (median)');
    expect(names).toContain('Legendary rate per opening');
    expect(names).toContain('Non-weekly reward rate');
    expect(names).toContain('Direct item grants per manager per season');
  });

  it('passes on the approved configuration', () => {
    /*
     * The gate's whole purpose. It did **not** pass before the commissioner's
     * ruling — 31.5 boxes against a 6–12 range — and the price moving from 50 to
     * 200 is what closed it. This reads the canonical config rather than a copy,
     * so a drift in `PROVISIONAL_ECONOMY` fails here.
     *
     * Fifty seasons rather than five, deliberately: the legendary metrics are
     * Poisson-thin at five (about 2.3 a season against a range of 2–3, which is
     * narrower than the noise), so a five-season gate flips on the seed. A
     * release gate that depends on luck is not a gate.
     */
    const checks = checkRanges(simulate(input({ seasons: 50, policy: 'specified' })));
    const failures = checks.filter((c) => c.range !== 'informational' && !c.withinRange);
    expect(failures.map((f) => `${f.name}: ${f.measured}`)).toEqual([]);
  });

  it('fails when a value drifts outside the approved range', () => {
    // The gate has to be able to say no, or a green means nothing. Halving the
    // box price is the exact drift the ruling corrected.
    const drifted = checkRanges(
      simulate(
        input({
          seasons: 50,
          policy: 'specified',
          economy: { ...PROVISIONAL_ECONOMY, standardBoxPriceTokens: 50 },
        }),
      ),
    );
    expect(drifted.some((c) => c.range !== 'informational' && !c.withinRange)).toBe(true);
  });

  it('holds the one range that is true by construction', () => {
    const checks = checkRanges(simulate(input()));
    expect(checks.find((c) => c.name === 'Non-weekly reward rate')?.withinRange).toBe(true);
  });
});

describe('the profiles', () => {
  it('places the median manager where a ten-team league puts them', () => {
    // Five winners in ten every week. The median manager wins half by
    // construction, and one manager in ten posts the best score.
    expect(PROFILES.median.winRate).toBe(0.5);
    expect(PROFILES.median.highScoreRate).toBeCloseTo(0.1);
    expect(PROFILES.best.winRate).toBeGreaterThan(PROFILES.median.winRate);
    expect(PROFILES.worst.winRate).toBeLessThan(PROFILES.median.winRate);
  });
});
