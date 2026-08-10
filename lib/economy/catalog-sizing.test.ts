import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RARITIES } from '@/lib/counter/catalog';
import { PROVISIONAL_ECONOMY } from '@/lib/counter/tokens';
import { salvageFor } from '@/lib/economy/simulate';

import {
  type CatalogShape,
  type SizingInput,
  ARCHETYPES,
  CHECKPOINT_WEEKS,
  LEAGUE_ROSTER,
  SEASON_SHAPE,
  sizeCatalog,
  subsetSummary,
  summarize,
  tierHealth,
} from './catalog-sizing';

const BASE: Omit<SizingInput, 'shape' | 'seeds'> = {
  shares: { common: 0.6, rare: 0.28, epic: 0.1, legendary: 0.02 },
  economy: PROVISIONAL_ECONOMY,
  salvage: salvageFor(PROVISIONAL_ECONOMY.standardBoxPriceTokens),
  grantsPerSeason: 2,
  roster: LEAGUE_ROSTER,
  seasons: 1,
  welcome: true,
};

const shipped: CatalogShape = { common: 10, rare: 8, epic: 4, legendary: 2 };
const seeds = [11, 22, 33, 44];

function run(shape: CatalogShape, overrides: Partial<SizingInput> = {}) {
  return sizeCatalog({ ...BASE, shape, seeds, ...overrides });
}

describe('the season the simulation models', () => {
  it('matches the recorded fixtures week for week', () => {
    /*
     * The model's one football claim, checked against the files rather than
     * against itself. Both imported seasons hold the same shape, and a paired
     * game is two rosters — so the fixtures decide `playing`, not this file.
     */
    const root = 'fixtures/sleeper/league';
    const leagues = readdirSync(root).filter((entry) => {
      try {
        readdirSync(join(root, entry, 'matchups'));
        return true;
      } catch {
        return false;
      }
    });
    expect(leagues.length).toBeGreaterThanOrEqual(2);

    for (const league of leagues) {
      for (const { week, playing } of SEASON_SHAPE) {
        const raw: { matchup_id: number | null }[] = JSON.parse(
          readFileSync(join(root, league, 'matchups', `${String(week).padStart(2, '0')}.json`), 'utf8'),
        ) as { matchup_id: number | null }[];
        const games = new Set(raw.map((row) => row.matchup_id).filter((id) => id !== null)).size;
        expect(games * 2, `league ${league} week ${String(week)}`).toBe(playing);
      }
    }
  });

  it('is seventeen scored weeks, because a playoff win pays like any other', () => {
    // `lib/rewards/derive.ts` has no branch on week type. A fourteen-week model
    // would understate a season's earnings by the last three paydays.
    expect(SEASON_SHAPE).toHaveLength(17);
    expect(SEASON_SHAPE.every((week) => week.playing > 0)).toBe(true);
  });
});

describe('the archetype ladder', () => {
  it('pays out exactly what a real league pays out', () => {
    /*
     * Every week has five winners and one high score, so across the roster the
     * win rates must average 0.5 and the high-score rates must sum to 1. An
     * edit that breaks either would invent tokens no league would hand over.
     */
    const wins = LEAGUE_ROSTER.reduce((sum, name) => sum + ARCHETYPES[name].winRate, 0);
    const scores = LEAGUE_ROSTER.reduce((sum, name) => sum + ARCHETYPES[name].highScoreRate, 0);
    expect(wins / LEAGUE_ROSTER.length).toBeCloseTo(0.5, 2);
    expect(scores).toBeCloseTo(1, 2);
  });

  it('orders the collection the way it orders the football', () => {
    const result = run(shipped, { seeds: [1, 2, 3, 4, 5, 6, 7, 8] });
    const endOf = (archetype: keyof typeof ARCHETYPES): number =>
      summarize(result, { season: 1, archetype }).at(-1)?.uniqueMedian ?? 0;

    expect(endOf('elite')).toBeGreaterThan(endOf('average'));
    expect(endOf('average')).toBeGreaterThan(endOf('dire'));
  });
});

describe('the sizing model', () => {
  it('is reproducible from a seed and different on another', () => {
    expect(run(shipped, { seeds: [7] })).toEqual(run(shipped, { seeds: [7] }));
    expect(run(shipped, { seeds: [7] })).not.toEqual(run(shipped, { seeds: [8] }));
  });

  it('never hands over an item the manager already owns', () => {
    const result = run(shipped, { seasons: 3 });
    for (const manager of result.runs) {
      for (const point of manager.checkpoints) {
        for (const rarity of RARITIES) {
          expect(point.ownedByRarity[rarity]).toBeLessThanOrEqual(shipped[rarity]);
        }
      }
    }
  });

  it('pays tokens only once a tier has run out', () => {
    const result = run(shipped, { seasons: 3 });
    for (const manager of result.runs) {
      if (manager.salvages === 0) continue;
      const exhausted = RARITIES.some((rarity) => manager.tierExhausted[rarity] !== null);
      expect(exhausted).toBe(true);
    }
  });

  it('balances its own books', () => {
    /*
     * An accounting identity rather than a range: everything a manager earned
     * is a win, a high score, the opening balance or a salvage. If a fifth
     * source ever appears in the loop, this is what notices.
     */
    const result = run(shipped, { seasons: 2 });
    for (const manager of result.runs) {
      const expected =
        manager.wins * PROVISIONAL_ECONOMY.matchupWinTokens +
        manager.highScores * PROVISIONAL_ECONOMY.weeklyHighScoreTokens +
        manager.salvageTokens +
        PROVISIONAL_ECONOMY.seasonStartTokens;
      const earned = manager.checkpoints.at(-1)?.tokensEarned ?? 0;
      expect(earned).toBe(expected);
    }
  });

  it('checkpoints every week it says it does', () => {
    const result = run(shipped, { seasons: 2 });
    for (const manager of result.runs) {
      expect(manager.checkpoints.map((point) => point.week)).toEqual([
        ...CHECKPOINT_WEEKS,
        ...CHECKPOINT_WEEKS,
      ]);
    }
  });
});

describe('what catalog depth does and does not change', () => {
  it('does not change how fast a manager collects, only when the box stops giving objects', () => {
    /*
     * The finding the whole report rests on. Rarity mass is per **tier** and is
     * split among that tier's items, so adding an item changes *which* object
     * comes out and never *how often* the tier comes up. Until a tier runs out,
     * two different catalogs are the same experience — proved here by running
     * one deep enough that nothing exhausts and comparing week by week.
     */
    const deep: CatalogShape = { common: 60, rare: 60, epic: 60, legendary: 60 };
    const deeper: CatalogShape = { common: 90, rare: 90, epic: 90, legendary: 90 };

    const a = run(deep);
    const b = run(deeper);

    expect(a.runs.every((manager) => manager.salvages === 0)).toBe(true);
    expect(b.runs.every((manager) => manager.salvages === 0)).toBe(true);

    for (const [index, manager] of a.runs.entries()) {
      const other = b.runs[index]!;
      expect(manager.openings).toBe(other.openings);
      expect(manager.finalUnique).toBe(other.finalUnique);
      expect(manager.checkpoints.map((point) => point.uniqueOwned)).toEqual(
        other.checkpoints.map((point) => point.uniqueOwned),
      );
    }
  });

  it('never makes the wall arrive sooner by adding items', () => {
    const shallow = run({ common: 6, rare: 5, epic: 3, legendary: 2 }, { seasons: 2 });
    const deep = run({ common: 16, rare: 12, epic: 5, legendary: 3 }, { seasons: 2 });

    const salvageRate = (result: ReturnType<typeof run>): number => {
      const openings = result.runs.reduce((sum, manager) => sum + manager.openings, 0);
      const salvages = result.runs.reduce((sum, manager) => sum + manager.salvages, 0);
      return salvages / openings;
    };

    expect(salvageRate(deep)).toBeLessThan(salvageRate(shallow));
  });

  it('reports a tier as exhausted exactly when it holds every item in it', () => {
    const result = run({ common: 4, rare: 4, epic: 4, legendary: 4 }, { seasons: 2 });
    for (const manager of result.runs) {
      const last = manager.checkpoints.at(-1)!;
      for (const rarity of RARITIES) {
        const full = last.ownedByRarity[rarity] === 4;
        expect(manager.tierExhausted[rarity] !== null).toBe(full);
      }
    }
  });

  it('reads the prices it is given', () => {
    // Doubling the box price roughly halves the boxes, which is what stops the
    // model drifting into numbers of its own.
    const cheap = run(shipped, { economy: { ...PROVISIONAL_ECONOMY, standardBoxPriceTokens: 100 } });
    const dear = run(shipped, { economy: { ...PROVISIONAL_ECONOMY, standardBoxPriceTokens: 400 } });
    const openings = (result: ReturnType<typeof run>): number =>
      result.runs.reduce((sum, manager) => sum + manager.openings, 0);
    expect(openings(cheap)).toBeGreaterThan(openings(dear) * 1.5);
  });
});

describe('the subset arithmetic', () => {
  const result = run(shipped);

  it('is trivially right at both ends', () => {
    const everything = subsetSummary(result, shipped);
    for (const point of everything) {
      expect(point.expectedShare).toBeCloseTo(1, 10);
      expect(point.chanceOfAny).toBeCloseTo(1, 10);
    }

    const nothing = subsetSummary(result, { common: 0, rare: 0, epic: 0, legendary: 0 });
    for (const point of nothing) {
      expect(point.expectedOwned).toBe(0);
      expect(point.chanceOfAny).toBe(0);
    }
  });

  it('agrees with the simulation about how much is owned', () => {
    /*
     * The subset maths is exact rather than sampled, so it has to reconcile
     * with the counts the run actually produced: a subset covering a whole tier
     * must equal that tier's owned count.
     */
    const commonsOnly = subsetSummary(result, { ...shipped, rare: 0, epic: 0, legendary: 0 });
    for (const [index, point] of commonsOnly.entries()) {
      const week = CHECKPOINT_WEEKS[index]!;
      const owned = result.runs
        .map((manager) => manager.checkpoints.find((c) => c.week === week)?.ownedByRarity.common ?? 0)
        .reduce((sum, value) => sum + value, 0);
      expect(point.expectedOwned).toBeCloseTo(owned / result.runs.length, 8);
    }
  });

  it('rises with the size of the subset', () => {
    const few = subsetSummary(result, { common: 1, rare: 0, epic: 0, legendary: 0 });
    const many = subsetSummary(result, { common: 5, rare: 0, epic: 0, legendary: 0 });
    for (const [index, point] of few.entries()) {
      expect(many[index]!.chanceOfAny).toBeGreaterThan(point.chanceOfAny);
    }
  });
});

describe('tier health', () => {
  it('counts pulls in proportion to the tier shares, not to the item counts', () => {
    const health = tierHealth(run(shipped));
    const common = health.find((tier) => tier.rarity === 'common')!;
    const legendary = health.find((tier) => tier.rarity === 'legendary')!;
    // 60% against 2% — thirty to one, whatever the catalog holds.
    expect(common.pullsPerManager / legendary.pullsPerManager).toBeCloseTo(30, 0);
  });

  it('says a tier never ran out when it never ran out', () => {
    const health = tierHealth(run({ common: 99, rare: 99, epic: 99, legendary: 99 }));
    for (const tier of health) {
      expect(tier.exhaustedShare).toBe(0);
      expect(tier.medianExhaustion).toBeNull();
    }
  });
});
