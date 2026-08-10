import { type Rarity, RARITIES } from '@/lib/counter/catalog';
import { type EconomyKnobs, type SalvageValues, generator } from '@/lib/economy/simulate';

/**
 * How big does the catalog need to be?
 *
 * `lib/economy/simulate.ts` answers `16 §8`'s question — *are the economy's six
 * ranges met* — and it is the release gate. This file answers a different one,
 * and it is the one that decides how much art gets drawn:
 *
 * > Across one full ten-manager season, how many **unique items** does each
 * > rarity need to hold so that boxes keep producing objects rather than
 * > tokens, and a manager has enough different things to furnish a room?
 *
 * ## The two knobs are independent, and that is the whole reason this is cheap
 *
 * `standardRewardTable()` assigns mass **per rarity** (60 / 28 / 10 / 2) and
 * splits it evenly among that tier's items. So adding a common changes how many
 * *different* commons exist and **does not change how often a common comes
 * up**. Catalog depth and pull odds do not trade against each other, which means
 * a sizing decision cannot break the approved rarity curve — `docs/CATALOG_SIZING.md`
 * carries the proof and `catalog-sizing.test.ts` pins it.
 *
 * ## What a "duplicate" is in this product
 *
 * After the 2026-08-04 ruling there is **no such thing as being handed a second
 * coffee mug from a box**. `16 §8`'s rule is *roll rarity → pick an unowned item
 * in that tier → if exhausted, salvage tokens*, so a duplicate is experienced as
 * **a box that paid tokens instead of an object**. Every "duplicate rate" this
 * module reports is that: the share of openings that produced no new thing.
 *
 * That reframing is what makes the sizing question sharp. A shallow tier does
 * not cause repetition — it causes the box to stop being a box.
 *
 * ## What is measured and what is assumed
 *
 * Measured, from the product: prices, rewards, grants, salvage values, rarity
 * mass, the opening algorithm. Assumed, in exactly two places and nowhere else:
 * {@link SEASON_SHAPE} (which weeks pay, derived from the recorded fixtures) and
 * {@link ARCHETYPES} (what a good or bad manager is). Disagree there.
 *
 * ## It is a script and a test, never a bundle
 *
 * Nothing under `app/` imports this. It is pure, deterministic and
 * database-free, so it runs in vitest and in `scripts/catalog-sizing.ts`.
 */

/* ------------------------------------------------------- the season shape -- */

/**
 * A week of the season, and how many of the ten managers it pays.
 *
 * **Measured off the recorded fixtures rather than assumed.** Both imported
 * seasons (the per-league `matchups` directories under `fixtures/sleeper`) hold
 * the identical shape:
 *
 * | weeks | paired games | rosters playing |
 * |---|---|---|
 * | 1–14 | 5 | 10 |
 * | 15 | 4 | 8 |
 * | 16 | 5 | 10 |
 * | 17 | 2 | 4 |
 * | 18 | 0 | 0 — unscored |
 *
 * Seventeen scored weeks, not fourteen. That matters here because **a playoff
 * or consolation win pays exactly like a regular one** — `lib/rewards/derive.ts`
 * contains no branch on `weekType`, deliberately, because `03 §4` prices a
 * matchup win once and does not qualify it. So the last three weeks are three
 * more paydays, and a model that stops at week 14 understates a season's
 * openings by about a fifth.
 *
 * Who sits out is the one part inferred rather than counted: week 15's two
 * absentees are modelled as **byes for the top two seeds** and week 17's six as
 * everyone outside the top four. That reproduces the recorded game counts
 * exactly and is the ordinary shape of a six-team bracket in a ten-team league.
 */
export interface SeasonWeek {
  readonly week: number;
  /** How many managers are paired this week, by end-of-regular-season rank. */
  readonly playing: number;
  /** `true` when the absentees are the *top* seeds (a bye) rather than the rest. */
  readonly byeForTopSeeds: boolean;
}

export const SEASON_SHAPE: readonly SeasonWeek[] = [
  ...Array.from({ length: 14 }, (_, index) => ({
    week: index + 1,
    playing: 10,
    byeForTopSeeds: false,
  })),
  { week: 15, playing: 8, byeForTopSeeds: true },
  { week: 16, playing: 10, byeForTopSeeds: false },
  { week: 17, playing: 4, byeForTopSeeds: false },
];

/** The last week of the regular season — where the bracket is decided. */
export const REGULAR_SEASON_WEEKS = 14;

/** The week the midseason free box lands (`lib/counter/grants.ts`). */
export const MIDSEASON_WEEK = 7;

/* --------------------------------------------------------- the archetypes -- */

/**
 * Five kinds of manager, and what each is worth in a week.
 *
 * `simulate.ts` uses three — best, median, worst — because `16 §8` names three.
 * Catalog sizing needs the middle of the distribution resolved more finely: the
 * question is not *can the ranges be met* but *what does an ordinary manager's
 * collection look like in November*, and "ordinary" covering eight of ten seats
 * hides exactly the spread that matters.
 *
 * **The two rates are league-constrained, not free parameters.** Every week has
 * five winners and exactly one high score, so across the roster below the win
 * rates must average 0.5 and the high-score rates must sum to 1.0. They do, and
 * `catalog-sizing.test.ts` fails if an edit breaks either — which is what stops
 * this table from quietly inventing tokens that no real league would pay.
 */
export const ARCHETYPES = {
  elite: { winRate: 0.72, highScoreRate: 0.22 },
  strong: { winRate: 0.62, highScoreRate: 0.14 },
  average: { winRate: 0.5, highScoreRate: 0.095 },
  weak: { winRate: 0.38, highScoreRate: 0.045 },
  dire: { winRate: 0.28, highScoreRate: 0.03 },
} as const;

export type ArchetypeName = keyof typeof ARCHETYPES;

/**
 * The ten seats.
 *
 * One elite, two strong, four average, two weak, one dire — a league is mostly
 * middle with a tail either side. Ordered so seat 0 is the best team; the
 * postseason model ranks on simulated wins rather than on this order, so the
 * ordering is presentational.
 */
export const LEAGUE_ROSTER: readonly ArchetypeName[] = [
  'elite',
  'strong',
  'strong',
  'average',
  'average',
  'average',
  'average',
  'weak',
  'weak',
  'dire',
];

/* -------------------------------------------------------------- the model -- */

/** How many unique items each tier holds. The thing being sized. */
export type CatalogShape = Readonly<Record<Rarity, number>>;

/** Each tier's share of openings, as fractions summing to 1. */
export type RarityShares = Readonly<Record<Rarity, number>>;

export interface SizingInput {
  readonly shape: CatalogShape;
  readonly shares: RarityShares;
  readonly economy: EconomyKnobs;
  readonly salvage: SalvageValues;
  /** Free boxes per manager per season (`lib/counter/grants.ts`: two). */
  readonly grantsPerSeason: number;
  readonly roster: readonly ArchetypeName[];
  readonly seasons: number;
  /** How many independent leagues to run. Variation is reported across these. */
  readonly seeds: readonly number[];
  /**
   * Whether a manager starts season one with the welcome box and balance.
   *
   * True for the launch question, which is the one being asked. Season two is
   * modelled by running two seasons rather than by a second flag.
   */
  readonly welcome: boolean;
}

/** One manager's state at one moment. */
export interface Checkpoint {
  readonly season: number;
  readonly week: number;
  readonly uniqueOwned: number;
  readonly openings: number;
  /** Openings that produced tokens instead of an object. */
  readonly salvages: number;
  readonly ownedByRarity: Readonly<Record<Rarity, number>>;
  readonly balance: number;
  readonly tokensEarned: number;
}

export interface ManagerRun {
  readonly archetype: ArchetypeName;
  readonly seed: number;
  /** Every checkpoint requested, in order. */
  readonly checkpoints: readonly Checkpoint[];
  readonly finalUnique: number;
  readonly openings: number;
  readonly salvages: number;
  readonly salvageTokens: number;
  /** Season and week the first salvage happened, or null if it never did. */
  readonly firstSalvage: { readonly season: number; readonly week: number } | null;
  /** For each tier, the first season/week it ran out of new items. */
  readonly tierExhausted: Readonly<
    Record<Rarity, { readonly season: number; readonly week: number } | null>
  >;
  readonly wins: number;
  readonly highScores: number;
}

export interface SizingResult {
  readonly input: SizingInput;
  readonly runs: readonly ManagerRun[];
}

/**
 * Which weeks a run reports at.
 *
 * Week 14 is the end of the regular season and week 17 is the end of everything
 * — reported separately because the three postseason weeks pay unevenly and a
 * single "season end" number would hide that a dire manager's season stopped in
 * week 16.
 */
export const CHECKPOINT_WEEKS = [4, 8, 12, REGULAR_SEASON_WEEKS, 17] as const;

interface ManagerState {
  readonly archetype: ArchetypeName;
  balance: number;
  tokensEarned: number;
  wins: number;
  highScores: number;
  openings: number;
  salvages: number;
  salvageTokens: number;
  readonly owned: Record<Rarity, number>;
  firstSalvage: { season: number; week: number } | null;
  readonly tierExhausted: Record<Rarity, { season: number; week: number } | null>;
  readonly checkpoints: Checkpoint[];
}

function emptyByRarity(): Record<Rarity, number> {
  return { common: 0, rare: 0, epic: 0, legendary: 0 };
}

/** Draw a tier by its share. Independent of how many items the tier holds. */
function drawRarity(shares: RarityShares, next: () => number): Rarity {
  const roll = next();
  let cursor = 0;
  for (const rarity of RARITIES) {
    cursor += shares[rarity];
    if (roll < cursor) return rarity;
  }
  return 'legendary';
}

/**
 * Pick `count` winners from `candidates`, weighted, without replacement.
 *
 * Used for both halves of a week's football, and it is why this model is
 * **league-consistent** where the release gate is not: exactly five of ten
 * managers win, and exactly one posts the high score. Independent per-manager
 * coin flips would let a week pay six winners and three high scores, which
 * would show up here as tokens nobody in a real league receives.
 */
function pickWeighted(
  candidates: readonly number[],
  weightOf: (index: number) => number,
  count: number,
  next: () => number,
): readonly number[] {
  const pool = [...candidates];
  const picked: number[] = [];
  for (let n = 0; n < count && pool.length > 0; n += 1) {
    const total = pool.reduce((sum, index) => sum + weightOf(index), 0);
    if (total <= 0) {
      picked.push(pool.splice(Math.floor(next() * pool.length), 1)[0] as number);
      continue;
    }
    let roll = next() * total;
    let taken = pool.length - 1;
    for (let i = 0; i < pool.length; i += 1) {
      roll -= weightOf(pool[i] as number);
      if (roll <= 0) {
        taken = i;
        break;
      }
    }
    picked.push(pool.splice(taken, 1)[0] as number);
  }
  return picked;
}

/**
 * Run one league for one seed.
 *
 * The spending policy is the same ceiling `simulate.ts` uses — buy whenever the
 * tab allows — for the same reason: a manager who saves is strictly below one
 * who spends, so the ceiling answers *how deep does the catalog have to be*
 * without also modelling restraint the product never observes.
 */
function runLeague(input: SizingInput, seed: number): readonly ManagerRun[] {
  const next = generator(seed);
  const managers: ManagerState[] = input.roster.map((archetype) => ({
    archetype,
    balance: 0,
    tokensEarned: 0,
    wins: 0,
    highScores: 0,
    openings: 0,
    salvages: 0,
    salvageTokens: 0,
    owned: emptyByRarity(),
    firstSalvage: null,
    tierExhausted: { common: null, rare: null, epic: null, legendary: null },
    checkpoints: [],
  }));

  const openBox = (manager: ManagerState, season: number, week: number): void => {
    manager.openings += 1;
    const rarity = drawRarity(input.shares, next);
    const remaining = input.shape[rarity] - manager.owned[rarity];
    if (remaining > 0) {
      manager.owned[rarity] += 1;
      if (manager.owned[rarity] === input.shape[rarity]) {
        manager.tierExhausted[rarity] ??= { season, week };
      }
      return;
    }
    /*
     * The tier is exhausted, so the box pays tokens. The tokens go back on the
     * tab — salvage buys boxes and boxes produce salvage, and leaving the loop
     * out would understate openings on exactly the managers closest to
     * finishing a set.
     */
    manager.salvages += 1;
    manager.firstSalvage ??= { season, week };
    const worth = input.salvage[rarity];
    manager.salvageTokens += worth;
    manager.balance += worth;
    manager.tokensEarned += worth;
  };

  const spend = (manager: ManagerState, season: number, week: number): void => {
    while (manager.balance >= input.economy.standardBoxPriceTokens) {
      manager.balance -= input.economy.standardBoxPriceTokens;
      openBox(manager, season, week);
    }
  };

  const snapshot = (manager: ManagerState, season: number, week: number): Checkpoint => ({
    season,
    week,
    uniqueOwned: RARITIES.reduce((sum, rarity) => sum + manager.owned[rarity], 0),
    openings: manager.openings,
    salvages: manager.salvages,
    ownedByRarity: { ...manager.owned },
    balance: manager.balance,
    tokensEarned: manager.tokensEarned,
  });

  for (let season = 1; season <= input.seasons; season += 1) {
    /*
     * Tokens reset at the season boundary and collectibles do not (`16`'s core
     * rules). The balance is therefore cleared here rather than carried, which
     * is the one place this model differs from the release gate — and it can
     * only ever matter by less than one box.
     */
    for (const manager of managers) manager.balance = 0;

    if (season === 1 && input.welcome) {
      for (const manager of managers) {
        manager.balance += input.economy.seasonStartTokens;
        manager.tokensEarned += input.economy.seasonStartTokens;
        // `03 §5`'s welcome box: one per manager, once, ever.
        openBox(manager, season, 0);
      }
    }

    if (input.grantsPerSeason >= 1) {
      for (const manager of managers) openBox(manager, season, 0);
    }

    // Wins so far, which is what the bracket is seeded on.
    const winsThisSeason = managers.map(() => 0);

    for (const { week, playing, byeForTopSeeds } of SEASON_SHAPE) {
      if (input.grantsPerSeason >= 2 && week === MIDSEASON_WEEK) {
        for (const manager of managers) openBox(manager, season, week);
      }

      /*
       * Who is on the field. Through the regular season, everybody; afterwards,
       * by standing — which is why the seeding is computed from wins rather
       * than from the roster's declared order.
       */
      const seeding = managers
        .map((_, index) => index)
        .sort((a, b) => (winsThisSeason[b] ?? 0) - (winsThisSeason[a] ?? 0) || a - b);

      let onField: readonly number[];
      if (playing >= managers.length) {
        onField = managers.map((_, index) => index);
      } else if (byeForTopSeeds) {
        onField = seeding.slice(managers.length - playing);
      } else {
        onField = seeding.slice(0, playing);
      }

      const winRate = (index: number): number => ARCHETYPES[managers[index]!.archetype].winRate;
      const scoreRate = (index: number): number =>
        ARCHETYPES[managers[index]!.archetype].highScoreRate;

      const winners = pickWeighted(onField, winRate, Math.floor(onField.length / 2), next);
      for (const index of winners) {
        const manager = managers[index]!;
        manager.balance += input.economy.matchupWinTokens;
        manager.tokensEarned += input.economy.matchupWinTokens;
        manager.wins += 1;
        winsThisSeason[index] = (winsThisSeason[index] ?? 0) + 1;
      }

      if (onField.length > 0) {
        const [best] = pickWeighted(onField, scoreRate, 1, next);
        if (best !== undefined) {
          const manager = managers[best]!;
          manager.balance += input.economy.weeklyHighScoreTokens;
          manager.tokensEarned += input.economy.weeklyHighScoreTokens;
          manager.highScores += 1;
        }
      }

      for (const manager of managers) spend(manager, season, week);

      if ((CHECKPOINT_WEEKS as readonly number[]).includes(week)) {
        for (const manager of managers) manager.checkpoints.push(snapshot(manager, season, week));
      }
    }
  }

  return managers.map((manager) => ({
    archetype: manager.archetype,
    seed,
    checkpoints: manager.checkpoints,
    finalUnique: RARITIES.reduce((sum, rarity) => sum + manager.owned[rarity], 0),
    openings: manager.openings,
    salvages: manager.salvages,
    salvageTokens: manager.salvageTokens,
    firstSalvage: manager.firstSalvage,
    tierExhausted: manager.tierExhausted,
    wins: manager.wins,
    highScores: manager.highScores,
  }));
}

/** Run every seed and pool the results. */
export function sizeCatalog(input: SizingInput): SizingResult {
  return {
    input,
    runs: input.seeds.flatMap((seed) => runLeague(input, seed)),
  };
}

/* ------------------------------------------------------------- reporting -- */

export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  const weight = position - low;
  return (sorted[low] ?? 0) * (1 - weight) + (sorted[high] ?? 0) * weight;
}

export interface CheckpointSummary {
  readonly week: number;
  readonly uniqueMedian: number;
  readonly uniqueLow: number;
  readonly uniqueHigh: number;
  readonly completionMedian: number;
  readonly openingsMedian: number;
  /** Share of openings so far that paid tokens instead of an object, pooled. */
  readonly salvageRate: number;
  /** Share of managers who have hit at least one salvage by now. */
  readonly managersWithSalvage: number;
}

export function summarize(
  result: SizingResult,
  options: { readonly season?: number; readonly archetype?: ArchetypeName } = {},
): readonly CheckpointSummary[] {
  const season = options.season ?? 1;
  const runs =
    options.archetype === undefined
      ? result.runs
      : result.runs.filter((run) => run.archetype === options.archetype);

  const size = RARITIES.reduce((sum, rarity) => sum + result.input.shape[rarity], 0);

  return CHECKPOINT_WEEKS.map((week) => {
    const points = runs
      .map((run) => run.checkpoints.find((c) => c.season === season && c.week === week))
      .filter((c): c is Checkpoint => c !== undefined);

    const unique = points.map((c) => c.uniqueOwned);
    const openings = points.reduce((sum, c) => sum + c.openings, 0);
    const salvages = points.reduce((sum, c) => sum + c.salvages, 0);

    return {
      week,
      uniqueMedian: quantile(unique, 0.5),
      uniqueLow: quantile(unique, 0.1),
      uniqueHigh: quantile(unique, 0.9),
      completionMedian: size === 0 ? 0 : quantile(unique, 0.5) / size,
      openingsMedian: quantile(
        points.map((c) => c.openings),
        0.5,
      ),
      salvageRate: openings === 0 ? 0 : salvages / openings,
      managersWithSalvage:
        points.length === 0 ? 0 : points.filter((c) => c.salvages > 0).length / points.length,
    };
  });
}

/* ------------------------------------------------------------- subsets -- */

/**
 * How much of a collection belongs to some labelled subset of the catalog.
 *
 * Two questions in the sizing brief are the same question with a different
 * label attached:
 *
 * - *how much of what a manager owns is still a placeholder pizza box?* — the
 *   subset is "items with finished art";
 * - *does a manager own anything that reads right in the picture frame?* — the
 *   subset is "items of `wall` form".
 *
 * Both are **exact rather than sampled**, and that is worth the arithmetic.
 * `openBox` picks uniformly among the *unowned* items of the rolled tier, so
 * given that a manager owns `k` of a tier's `n`, every k-subset is equally
 * likely — the count of the subset among them is hypergeometric, whatever the
 * football did. So the expected count is `k · s / n` and the chance of holding
 * none is `C(n − s, k) / C(n, k)`, with no extra simulation and no seed noise.
 */
export type SubsetCounts = Readonly<Record<Rarity, number>>;

export interface SubsetSummary {
  readonly week: number;
  /** Expected number of the manager's items that are in the subset. */
  readonly expectedOwned: number;
  /** That, as a share of everything they own. */
  readonly expectedShare: number;
  /** Chance a manager owns at least one item from the subset. */
  readonly chanceOfAny: number;
}

/** `C(n, k)` in floating point. The numbers here are tiny; overflow is not a risk. */
function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 0; i < k; i += 1) result = (result * (n - i)) / (i + 1);
  return result;
}

export function subsetSummary(
  result: SizingResult,
  subset: SubsetCounts,
  options: { readonly season?: number; readonly archetype?: ArchetypeName } = {},
): readonly SubsetSummary[] {
  const season = options.season ?? 1;
  const runs =
    options.archetype === undefined
      ? result.runs
      : result.runs.filter((run) => run.archetype === options.archetype);

  return CHECKPOINT_WEEKS.map((week) => {
    const points = runs
      .map((run) => run.checkpoints.find((c) => c.season === season && c.week === week))
      .filter((c): c is Checkpoint => c !== undefined);

    let owned = 0;
    let inSubset = 0;
    let noneTotal = 0;

    for (const point of points) {
      let none = 1;
      for (const rarity of RARITIES) {
        const n = result.input.shape[rarity];
        const k = point.ownedByRarity[rarity];
        const s = Math.min(subset[rarity], n);
        if (n === 0) continue;
        inSubset += (k * s) / n;
        none *= choose(n - s, k) / choose(n, k);
      }
      owned += point.uniqueOwned;
      noneTotal += none;
    }

    return {
      week,
      expectedOwned: points.length === 0 ? 0 : inSubset / points.length,
      expectedShare: owned === 0 ? 0 : inSubset / owned,
      chanceOfAny: points.length === 0 ? 0 : 1 - noneTotal / points.length,
    };
  });
}

/** How long a tier survives before it stops producing objects. */
export interface TierHealth {
  readonly rarity: Rarity;
  readonly items: number;
  /** Share of managers whose tier ran out at all, over the whole run. */
  readonly exhaustedShare: number;
  /** Share whose tier ran out **during season one**. */
  readonly exhaustedInSeasonOne: number;
  /**
   * When the median exhausting manager ran out, as a season and a week.
   *
   * Computed on a **run-long ordinal** rather than per season, because a tier
   * that survives season one and dies in week 3 of season two is a different
   * fact from one that dies in week 13 twice, and a per-season median cannot
   * tell them apart.
   */
  readonly medianExhaustion: { readonly season: number; readonly week: number } | null;
  /** Expected pulls of this tier per manager over the run. */
  readonly pullsPerManager: number;
}

/** Weeks since the start of the run, so two seasons order correctly. */
function ordinalOf(point: { season: number; week: number }): number {
  return (point.season - 1) * (SEASON_SHAPE.length + 1) + point.week;
}

export function tierHealth(result: SizingResult): readonly TierHealth[] {
  const runs = result.runs;
  const openings = runs.reduce((sum, run) => sum + run.openings, 0) / Math.max(1, runs.length);
  const seasonLength = SEASON_SHAPE.length + 1;

  return RARITIES.map((rarity) => {
    const exhausted = runs
      .map((run) => run.tierExhausted[rarity])
      .filter((e): e is { season: number; week: number } => e !== null);

    const ordinals = exhausted.map(ordinalOf);
    const median = ordinals.length === 0 ? null : Math.round(quantile(ordinals, 0.5));

    return {
      rarity,
      items: result.input.shape[rarity],
      exhaustedShare: runs.length === 0 ? 0 : exhausted.length / runs.length,
      exhaustedInSeasonOne:
        runs.length === 0 ? 0 : exhausted.filter((e) => e.season === 1).length / runs.length,
      medianExhaustion:
        median === null
          ? null
          : {
              season: Math.floor((median - 1) / seasonLength) + 1,
              week: ((median - 1) % seasonLength) + 1,
            },
      pullsPerManager: openings * result.input.shares[rarity],
    };
  });
}
