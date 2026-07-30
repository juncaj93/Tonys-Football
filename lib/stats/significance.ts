import { createHash } from 'node:crypto';

import { type Queryable } from '@/lib/db';
import { significancePolicies } from '@/lib/db/schema';

/**
 * What a margin *means*, and the evidence required before saying it.
 *
 * `PRODUCT_DELIVERY_MANDATE.md §9`: SW may never choose emotionally loaded
 * language without a Stats classification. This file is that classification, and
 * it is deliberately the only place in the codebase where a number becomes a
 * verb.
 *
 * ## Every tier above `beat` needs two independent reasons
 *
 * An **absolute floor** and a **league-relative percentile**, and a margin has
 * to clear both. Either alone is a lie in a different direction:
 *
 * - A floor alone imports somebody else's league. Forty points is a demolition
 *   in a low-scoring format and an ordinary Sunday in a high-scoring one.
 * - A percentile alone makes a *quiet* week produce a blowout. In a week whose
 *   largest margin is nine points, that nine-point win is the 100th percentile
 *   of its week — and it is not a blowout, it is a close week. This is the
 *   failure the commissioner named directly: **do not use weekly rank alone to
 *   justify dramatic language.**
 *
 * ## Calibrated against this league, and what changed
 *
 * The commissioner's starting policy was: `edged` ≤ 5 · `beat` default ·
 * `handled` ≥ 20 · `crushed` ≥ 30 and ≥ 85th · `obliterated` ≥ 40 and ≥ 95th,
 * or the largest finalized margin of a season when it also clears the floor.
 *
 * Measured against all 162 finalized games of 2024 and 2025, **the median game
 * in this league is decided by 20.6 points.** So `handled` at a bare ≥ 20 covers
 * 88 of 162 games — 54% — and a tier that describes the majority of games is not
 * a classification, it is a synonym for "a game happened".
 *
 * One documented change, therefore: **`handled` gains a 70th-percentile gate**,
 * the same mechanism the two tiers above it already use. Every absolute floor
 * the commissioner set is kept verbatim. The result over the real 162:
 *
 * | tier | games | share |
 * |---|---|---|
 * | `edged` | 22 | 13.6% |
 * | `beat` | 91 | 56.2% |
 * | `handled` | 24 | 14.8% |
 * | `crushed` | 16 | 9.9% |
 * | `obliterated` | 9 | 5.6% |
 *
 * That is "prefer fewer strong stories over weak filler" as an arithmetic
 * property rather than an intention.
 *
 * **A consequence worth stating.** The mandate's worked example —
 * *"Matty B obliterated Nathan by 50.51 points"* — carries
 * `historicalMarginPercentile: 95`, and is `obliterated` **because of that**,
 * not because of the 50.51. In this league's actual history 50.51 sits at the
 * 84th percentile, so the same margin classifies as `handled`. The example is
 * self-consistent and the calibration is doing exactly what it is for.
 *
 * ## Provisional, and versioned by content hash
 *
 * Identical to `lib/counter/rewards.ts`, for the identical reason (`16 §8`):
 * these numbers are **simulation-gated** and nothing locks before the P3
 * calibration. A recalibration writes a *new* version and a fact records the
 * version it was classified under, so an old fact stays interpretable against
 * the policy that was live when it was derived rather than silently re-meaning
 * itself. **Never hardcode a threshold in a component.**
 */

/** In escalation order. The order is load-bearing — `classify` walks it downward. */
export const INTENSITIES = ['edged', 'beat', 'handled', 'crushed', 'obliterated'] as const;

export type Intensity = (typeof INTENSITIES)[number];

export interface Tier {
  readonly intensity: Intensity;
  /** Points. A margin below this cannot reach the tier, whatever its percentile. */
  readonly minMargin: number;
  /**
   * Percentile of the comparison population, 0–100.
   *
   * Null on `edged` and `beat`, which are absolute by nature: "decided by under
   * five points" needs no league context to be true.
   */
  readonly minPercentile: number | null;
}

/**
 * The provisional policy.
 *
 * Ordered ascending so the version hash is stable regardless of how anybody
 * later reorders the source.
 */
export const PROVISIONAL_TIERS: readonly Tier[] = Object.freeze([
  { intensity: 'edged', minMargin: 0, minPercentile: null },
  { intensity: 'beat', minMargin: 0, minPercentile: null },
  { intensity: 'handled', minMargin: 20, minPercentile: 70 },
  { intensity: 'crushed', minMargin: 30, minPercentile: 85 },
  { intensity: 'obliterated', minMargin: 40, minPercentile: 95 },
]);

/** A margin at or below this is `edged`, whatever else is true of it. */
export const EDGED_MAX_MARGIN = 5;

/**
 * How many finalized games a percentile needs before it is worth trusting.
 *
 * Below this the fact is emitted **without** the percentile and cannot reach a
 * tier that requires one — it degrades to `beat`, with the reason recorded.
 * Two seasons is 162 games, comfortably above; a single week is nine, nowhere
 * near, which is exactly the case this stops.
 */
export const MIN_POPULATION = 100;

export interface SignificancePolicy {
  /** Content hash of the tiers. Two environments seeding the same numbers agree. */
  readonly version: string;
  readonly tiers: readonly Tier[];
  readonly edgedMaxMargin: number;
  readonly minPopulation: number;
  /** True until the P3 calibration signs these numbers off. */
  readonly provisional: boolean;
}

export function standardPolicy(): SignificancePolicy {
  return {
    version: versionOf(PROVISIONAL_TIERS),
    tiers: PROVISIONAL_TIERS,
    edgedMaxMargin: EDGED_MAX_MARGIN,
    minPopulation: MIN_POPULATION,
    provisional: true,
  };
}

/**
 * Classify a margin.
 *
 * `percentile` is null when the comparison population was too small to produce
 * one. That is not an error and does not stop a classification — it caps it at
 * `beat`, because every tier above needs league context and inventing the
 * context is the failure this whole file exists to prevent.
 *
 * `isSeasonLargest` is the commissioner's escape hatch: the biggest finalized
 * margin of a season reaches `obliterated` on its own, **provided it still
 * clears the absolute floor**. Without that proviso a season whose largest
 * margin was eleven points would produce an "obliterated".
 */
export function classify(
  policy: SignificancePolicy,
  input: {
    readonly margin: number;
    readonly percentile: number | null;
    readonly isSeasonLargest: boolean;
  },
): Intensity {
  if (input.margin <= policy.edgedMaxMargin) return 'edged';

  const top = policy.tiers[policy.tiers.length - 1];
  if (
    top !== undefined &&
    input.isSeasonLargest &&
    input.margin >= top.minMargin
  ) {
    return top.intensity;
  }

  // Downward through the tiers, so the strongest claim a margin can support is
  // the one it gets. `edged` and `beat` are handled above and below.
  for (let i = policy.tiers.length - 1; i >= 0; i--) {
    const tier = policy.tiers[i];
    if (tier === undefined) continue;
    if (tier.intensity === 'edged' || tier.intensity === 'beat') continue;
    if (input.margin < tier.minMargin) continue;
    if (tier.minPercentile !== null) {
      if (input.percentile === null) continue;
      if (input.percentile < tier.minPercentile) continue;
    }
    return tier.intensity;
  }

  return 'beat';
}

/**
 * Where a margin sits in a population, 0–100.
 *
 * The **weak** definition — the share of the population at or below this value
 * — because the question a tier asks is "was this game at least as one-sided as
 * 85% of games", and the strict definition answers a subtly different one that
 * makes the largest margin in any population sit below 100.
 *
 * Returns null below `minPopulation`. The population must be sorted ascending;
 * callers sort once and reuse.
 */
export function percentileOf(
  sortedAscending: readonly number[],
  value: number,
  minPopulation: number,
): number | null {
  if (sortedAscending.length < minPopulation) return null;

  let atOrBelow = 0;
  for (const candidate of sortedAscending) {
    if (candidate <= value) atOrBelow++;
    else break;
  }

  // Rounded to a whole percent: the fact is published, and a percentile carried
  // to nine decimal places implies a precision the sample does not have.
  return Math.round((atOrBelow / sortedAscending.length) * 100);
}

/**
 * Store the policy if it is not already stored.
 *
 * Append-only, enforced by a trigger: an existing version is never rewritten,
 * because facts point at it and rewriting it would retroactively change what
 * they were classified under.
 */
export async function ensureSignificancePolicy(
  db: Queryable,
): Promise<{ version: string }> {
  const policy = standardPolicy();

  await db
    .insert(significancePolicies)
    .values({
      version: policy.version,
      tiers: policy.tiers.map((tier) => ({ ...tier })),
      provisional: policy.provisional,
    })
    .onConflictDoNothing({ target: significancePolicies.version });

  return { version: policy.version };
}

/**
 * The policy's identity: a hash of exactly what it will classify against.
 *
 * A hash rather than a counter, so two environments seeding the same numbers
 * arrive at the same version with no coordination — and so an edited policy
 * cannot reuse an existing version, because the content it hashes has changed.
 */
function versionOf(tiers: readonly Tier[]): string {
  const canonical = tiers
    .map(
      (tier) =>
        `${tier.intensity}:${String(tier.minMargin)}:${tier.minPercentile === null ? '-' : String(tier.minPercentile)}`,
    )
    .join('|');
  return createHash('sha256')
    .update(`${canonical}#edged<=${String(EDGED_MAX_MARGIN)}#n>=${String(MIN_POPULATION)}`)
    .digest('hex')
    .slice(0, 16);
}
