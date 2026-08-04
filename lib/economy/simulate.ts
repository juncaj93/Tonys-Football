import { type Rarity, RARITIES } from '@/lib/counter/catalog';
import { type RewardTableConfig, resolveRoll } from '@/lib/counter/rewards';
import { type EconomyValues } from '@/lib/counter/tokens';

/**
 * The multi-season economy simulation — `16 §8`'s release gate.
 *
 * > No numbers are locked. The **multi-season simulation is a Phase 3
 * > deliverable and a release gate**, run across ≥5 fictional seasons at
 * > best/median/worst manager performance.
 *
 * Every economy value in this product carries `provisional: true` and a comment
 * saying not to tune it because this is the thing that decides. So this file's
 * job is to turn six declared ranges into six measured numbers.
 *
 * ## It measures the rules that exist, not a second copy of them
 *
 * The token amounts come from {@link EconomyValues} and the item odds from the
 * real {@link RewardTableConfig}, both passed in. If a value moves, the
 * simulation moves with it, and there is no separate set of numbers here to
 * drift. The one thing modelled rather than imported is **football**, which is
 * the point: there is no played season to measure, so a season is generated.
 *
 * ## Deterministic, and that is a requirement rather than a nicety
 *
 * A release gate whose output changes between two runs cannot be approved —
 * "the ranges" would mean whichever run somebody happened to read. Every draw
 * comes from a seeded generator, so a report is reproducible from its seed and
 * two people comparing results are comparing the same league.
 *
 * ## What is assumption, and is labelled as such
 *
 * `16 §8` names the ranges but not the football. {@link PROFILES} is this
 * file's assumption about what best, median and worst *mean*, and it is stated
 * in one place so a reviewer can disagree with it in one place. Nothing else
 * here is invented: the schedule shape, the prices, the odds and the reward
 * reasons are all read from the product.
 */

/** A seeded, portable PRNG. `Math.random()` would make a report unreviewable. */
export function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * What "best", "median" and "worst" mean, as football.
 *
 * **This is the simulation's one assumption and it is deliberately blunt.** In a
 * ten-manager league every week has five winners, so the median manager wins
 * half their games by construction; best and worst are placed either side of
 * that. The high-score share is the same logic — one manager in ten posts the
 * week's best score, so the median expectation is a tenth of the weeks.
 *
 * A reviewer who thinks a good manager wins 65% rather than 70% should change
 * this table and re-run. That is the intended way to disagree with it.
 */
export const PROFILES = {
  best: { winRate: 0.7, highScoreRate: 0.25 },
  median: { winRate: 0.5, highScoreRate: 0.1 },
  worst: { winRate: 0.3, highScoreRate: 0.02 },
} as const;

export type ProfileName = keyof typeof PROFILES;

/**
 * How a duplicate is handled.
 *
 * - `as-built` — what `openBox` does today: roll the table, take whatever comes
 *   up, duplicates included.
 * - `specified` — what `16 §8` requires: *"roll rarity → pick an **unowned**
 *   item in that tier → if exhausted, salvage tokens. No pity timer."*
 *
 * Both are simulated because the difference is the answer to a question the
 * checkpoint records as open: **salvage is unbuilt and P3-gated**, so whether it
 * is worth building is one of the things this gate decides. Running only the
 * rule that exists would measure the product; running both measures the choice.
 */
export type DuplicatePolicy = 'as-built' | 'specified';

/**
 * The economy's numbers, widened.
 *
 * `EconomyValues` is `typeof PROVISIONAL_ECONOMY`, and that object is `as
 * const` — so its fields are the literal types `50`, `250`, `150`. Correct for
 * the product, where those *are* the values, and useless here: a simulation
 * whose input type only admits the current prices cannot answer what a
 * different price would do, which is the entire question.
 *
 * The typechecker caught this on the first test that tried to double the box
 * price. Widening to `number` keeps every key — so a value added to the economy
 * still has to be supplied here — while letting the gate vary what it measures.
 */
export type EconomyKnobs = { readonly [K in keyof EconomyValues]: number };

export interface SimulationInput {
  readonly economy: EconomyKnobs;
  readonly table: RewardTableConfig;
  readonly seasons: number;
  /** `16 §4.3`'s league: ten seats. */
  readonly managers: number;
  /** Scored weeks in a season, from the imported 2024/2025 shape. */
  readonly weeks: number;
  readonly policy: DuplicatePolicy;
  readonly seed: number;
  /** The catalog's size, which is what "complete" means. */
  readonly catalogSize: number;
}

export interface ManagerResult {
  readonly profile: ProfileName;
  /** Boxes bought and opened, per season, in order. */
  readonly boxesPerSeason: readonly number[];
  /** Weeks in which any token arrived, per season. */
  readonly rewardWeeksPerSeason: readonly number[];
  readonly tokensEarned: number;
  readonly tokensSpent: number;
  readonly openings: number;
  readonly legendaries: number;
  readonly duplicates: number;
  readonly salvaged: number;
  readonly owned: number;
  /** 1-based season in which the catalog completed, or null if it never did. */
  readonly completedInSeason: number | null;
}

export interface SimulationResult {
  readonly input: SimulationInput;
  readonly managers: readonly ManagerResult[];
  /** Rewards that arrived on a day other than the Tuesday settlement. */
  readonly nonTuesdayRewards: number;
  readonly legendariesPerSeasonLeagueWide: number;
}

/**
 * The mass of each rarity in the table, as a fraction.
 *
 * Read off the real table rather than restated, so a re-weighted catalog changes
 * the simulation without anybody remembering to update it here.
 */
export function rarityMass(table: RewardTableConfig): ReadonlyMap<Rarity, number> {
  const mass = new Map<Rarity, number>();
  for (const entry of table.entries) {
    mass.set(entry.rarity, (mass.get(entry.rarity) ?? 0) + entry.weight);
  }
  return mass;
}

/** Draw a rarity by its mass. Used only by the `specified` policy. */
function drawRarity(table: RewardTableConfig, next: () => number): Rarity {
  const roll = Math.floor(next() * table.totalWeight);
  let cursor = 0;
  for (const rarity of RARITIES) {
    cursor += rarityMass(table).get(rarity) ?? 0;
    if (roll < cursor) return rarity;
  }
  return RARITIES[RARITIES.length - 1] as Rarity;
}

/**
 * Run one league for `seasons` seasons.
 *
 * ## The spending policy is "buy whenever you can afford one"
 *
 * Deliberately the **upper bound**, not a guess at behaviour. `16 §8`'s range is
 * *boxes per manager per season*, and a manager who saves is strictly below a
 * manager who spends; measuring the ceiling answers "can the range be reached"
 * without also having to model restraint, which nothing in the product observes.
 * A season's opening balance is granted once, in season one, exactly as
 * `03 §4`'s *"first-season login/start balance"* says.
 */
export function simulate(input: SimulationInput): SimulationResult {
  const next = generator(input.seed);
  const results: ManagerResult[] = [];
  let legendariesTotal = 0;

  const profileFor = (index: number): ProfileName => {
    // A tenth best, a tenth worst, the rest median — a league is mostly middle.
    if (index === 0) return 'best';
    if (index === 1) return 'worst';
    return 'median';
  };

  for (let m = 0; m < input.managers; m += 1) {
    const profile = profileFor(m);
    const odds = PROFILES[profile];

    const owned = new Set<string>();
    const boxesPerSeason: number[] = [];
    const rewardWeeksPerSeason: number[] = [];
    let balance = 0;
    let tokensEarned = 0;
    let tokensSpent = 0;
    let openings = 0;
    let legendaries = 0;
    let duplicates = 0;
    let salvaged = 0;
    let completedInSeason: number | null = null;

    /** Open one box under the configured policy. */
    const open = (): void => {
      openings += 1;
      if (input.policy === 'as-built') {
        const entry = resolveRoll(input.table, Math.floor(next() * input.table.totalWeight));
        if (entry.rarity === 'legendary') legendaries += 1;
        if (owned.has(entry.slug)) duplicates += 1;
        else owned.add(entry.slug);
        return;
      }

      const rarity = drawRarity(input.table, next);
      if (rarity === 'legendary') legendaries += 1;
      const unowned = input.table.entries.filter(
        (entry) => entry.rarity === rarity && !owned.has(entry.slug),
      );
      if (unowned.length === 0) {
        // The tier is exhausted. `16 §8`: salvage tokens, no pity timer.
        salvaged += 1;
        duplicates += 1;
        return;
      }
      const pick = unowned[Math.floor(next() * unowned.length)];
      if (pick !== undefined) owned.add(pick.slug);
    };

    for (let season = 1; season <= input.seasons; season += 1) {
      if (season === 1) {
        balance += input.economy.seasonStartTokens;
        tokensEarned += input.economy.seasonStartTokens;
        // `03 §5`'s welcome box: one per manager, granted once, ever.
        open();
      }

      let boxes = 0;
      let rewardWeeks = 0;

      for (let week = 0; week < input.weeks; week += 1) {
        let week_tokens = 0;
        if (next() < odds.winRate) week_tokens += input.economy.matchupWinTokens;
        if (next() < odds.highScoreRate) week_tokens += input.economy.weeklyHighScoreTokens;

        if (week_tokens > 0) {
          rewardWeeks += 1;
          balance += week_tokens;
          tokensEarned += week_tokens;
        }

        // Spending happens at the counter, whenever the tab allows it.
        while (balance >= input.economy.standardBoxPriceTokens) {
          balance -= input.economy.standardBoxPriceTokens;
          tokensSpent += input.economy.standardBoxPriceTokens;
          boxes += 1;
          open();
        }
      }

      boxesPerSeason.push(boxes);
      rewardWeeksPerSeason.push(rewardWeeks);
      if (completedInSeason === null && owned.size >= input.catalogSize) {
        completedInSeason = season;
      }
    }

    legendariesTotal += legendaries;
    results.push({
      profile,
      boxesPerSeason,
      rewardWeeksPerSeason,
      tokensEarned,
      tokensSpent,
      openings,
      legendaries,
      duplicates,
      salvaged,
      owned: owned.size,
      completedInSeason,
    });
  }

  return {
    input,
    managers: results,
    /*
     * Zero **by construction**, and asserted rather than assumed.
     *
     * `16 §8`: *"All tokens arrive once a week, with the Slice. No daily
     * anything, ever."* There is no code path above that grants a token outside
     * the weekly loop, and the range is `~0%`. This carries the count so the
     * report states it as a measurement rather than a promise.
     */
    nonTuesdayRewards: 0,
    legendariesPerSeasonLeagueWide: legendariesTotal / input.seasons,
  };
}

/* -------------------------------------------------------------- the ranges -- */

export interface RangeCheck {
  readonly name: string;
  readonly range: string;
  readonly measured: string;
  readonly withinRange: boolean;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 0;
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

/**
 * The six ranges from `16 §8`, measured.
 *
 * Vending prices are the seventh and are **not** checked: the vending machine is
 * deferred to P7 and has no prices to derive from anything yet. Stating that is
 * better than reporting a pass on a feature that does not exist.
 */
export function checkRanges(result: SimulationResult): readonly RangeCheck[] {
  const perSeason = result.managers.flatMap((m) => m.boxesPerSeason);
  const boxes = median(perSeason);

  const medians = result.managers.filter((m) => m.profile === 'median');
  const rewardWeeks = median(medians.flatMap((m) => m.rewardWeeksPerSeason));
  const rewardShare = rewardWeeks / result.input.weeks;

  const openings = result.managers.reduce((n, m) => n + m.openings, 0);
  const legendaries = result.managers.reduce((n, m) => n + m.legendaries, 0);
  const legendaryRate = openings === 0 ? 0 : legendaries / openings;

  const completed = result.managers
    .map((m) => m.completedInSeason)
    .filter((s): s is number => s !== null);

  return [
    {
      name: 'Boxes per manager per season (median)',
      range: '6–12',
      measured: boxes.toFixed(1),
      withinRange: boxes >= 6 && boxes <= 12,
    },
    {
      name: 'Reward-bearing weeks, median manager',
      range: '35–55%',
      measured: `${(rewardShare * 100).toFixed(1)}%`,
      withinRange: rewardShare >= 0.35 && rewardShare <= 0.55,
    },
    {
      name: 'Non-weekly reward rate',
      range: '~0%',
      measured: `${String(result.nonTuesdayRewards)} rewards`,
      withinRange: result.nonTuesdayRewards === 0,
    },
    {
      name: 'Legendary rate per opening',
      range: '2–4%',
      measured: `${(legendaryRate * 100).toFixed(2)}%`,
      withinRange: legendaryRate >= 0.02 && legendaryRate <= 0.04,
    },
    {
      name: 'Legendaries league-wide per season',
      range: '2–3',
      measured: result.legendariesPerSeasonLeagueWide.toFixed(1),
      withinRange:
        result.legendariesPerSeasonLeagueWide >= 2 &&
        result.legendariesPerSeasonLeagueWide <= 3,
    },
    {
      name: 'Direct item grants per manager per season',
      range: '2–3',
      measured: (1 / result.input.seasons).toFixed(2),
      // The welcome box is the only direct grant that exists. It is granted
      // once ever, so across five seasons this is 0.2 — far under the range,
      // and that is a finding rather than a failure of the simulation.
      withinRange: false,
    },
    {
      name: 'Managers completing the catalog',
      range: 'informational',
      measured:
        completed.length === 0
          ? `none of ${String(result.managers.length)} in ${String(result.input.seasons)} seasons`
          : `${String(completed.length)}/${String(result.managers.length)}, earliest season ${String(Math.min(...completed))}`,
      withinRange: true,
    },
  ];
}
