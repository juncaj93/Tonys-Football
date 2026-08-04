import { createHash } from 'node:crypto';

import { RARITIES, catalog, type Rarity } from './catalog';

/**
 * The reward table, and how a roll becomes a collectible.
 *
 * Everything here is a **pure function of the catalog**. Nothing reads the
 * clock, nothing reads the database, and nothing generates randomness — the
 * caller supplies the roll. That is what makes an opening auditable: given the
 * table version and the recorded roll, anybody can recompute the outcome and
 * check that the server was telling the truth.
 *
 * ## The weights are PROVISIONAL and must not be treated as approved
 *
 * `16 §8` and `18 §4.2` both gate reward pacing on the multi-season simulation
 * that runs in **P3**: *"Frequencies, prices, and reward tables are Phase 3
 * outputs. No values lock before the multi-season simulation runs."*
 *
 * The numbers below therefore exist so the loop can be built, reviewed and
 * played — not because they are right. They are recorded in the database with
 * `provisional = true`, and when the simulation produces real frequencies the
 * seed writes a **new version** rather than editing this one. Every opening that
 * already happened keeps pointing at the table it actually rolled against.
 *
 * Do not tune these to feel better. Tuning them is P3's job, and doing it here
 * would quietly lock the values the gate exists to keep open.
 */

/**
 * Provisional rarity mass, split evenly among the items of each rarity.
 *
 * Per-rarity rather than per-item on purpose: `18 §4.2` says **rarity gates
 * frequency**, so the frequency decision belongs to the tier. Per-item weights
 * would let one common quietly become rarer than an epic, which is a different
 * product than the one that was approved.
 */
const PROVISIONAL_RARITY_MASS: Record<Rarity, number> = {
  common: 60,
  rare: 28,
  epic: 10,
  legendary: 2,
};

export interface RewardEntry {
  readonly slug: string;
  readonly rarity: Rarity;
  /** Relative likelihood. Integer, so the roll is integer arithmetic. */
  readonly weight: number;
}

export interface RewardTableConfig {
  /** Content hash of the entries. Two environments seeding the same catalog agree. */
  readonly version: string;
  readonly entries: readonly RewardEntry[];
  readonly totalWeight: number;
  /** True until the P3 simulation signs off. See the note above. */
  readonly provisional: boolean;
}

/**
 * Build the standard box's table from the catalog.
 *
 * Each rarity's mass is multiplied out so it divides evenly among its items
 * without floating point: a tier holding four items gets `mass × lcm / 4` each,
 * which keeps every weight an integer and keeps the tier's total mass exactly
 * proportional. Integer weights matter because the roll is an integer and
 * `roll` is persisted — a float would make the recorded audit trail
 * irreproducible across platforms.
 */
export function standardRewardTable(): RewardTableConfig {
  const items = catalog();

  const countByRarity = new Map<Rarity, number>();
  for (const rarity of RARITIES) {
    countByRarity.set(
      rarity,
      items.filter((item) => item.rarity === rarity).length,
    );
  }

  // A tier with no items contributes nothing rather than dividing by zero.
  const populated = RARITIES.filter((rarity) => (countByRarity.get(rarity) ?? 0) > 0);
  if (populated.length === 0) {
    throw new Error('the catalog is empty; there is no reward table to build');
  }

  // One scale factor for the whole table, so every tier's mass stays exact.
  const scale = populated.reduce(
    (acc, rarity) => lcm(acc, countByRarity.get(rarity) ?? 1),
    1,
  );

  const entries: RewardEntry[] = items.map((item) => {
    const count = countByRarity.get(item.rarity) ?? 1;
    return {
      slug: item.slug,
      rarity: item.rarity,
      weight: (PROVISIONAL_RARITY_MASS[item.rarity] * scale) / count,
    };
  });

  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);

  return {
    version: versionOf(entries),
    entries: Object.freeze(entries),
    totalWeight,
    provisional: true,
  };
}

/**
 * Resolve a roll to an entry.
 *
 * A plain cumulative walk over the entries in their stored order. `roll` must be
 * an integer in `[0, totalWeight)`; anything else is a programming error rather
 * than a bad input to tolerate, because the caller that produced it is the
 * server itself.
 *
 * The walk order is the stored order, which is why `catalog()` sorts
 * deterministically: replaying a recorded roll against a recorded table has to
 * land on the same item on every machine, forever.
 */
export function resolveRoll(
  table: Pick<RewardTableConfig, 'entries' | 'totalWeight'>,
  roll: number,
): RewardEntry {
  if (!Number.isInteger(roll) || roll < 0 || roll >= table.totalWeight) {
    throw new RangeError(
      `roll ${String(roll)} is outside [0, ${String(table.totalWeight)})`,
    );
  }

  let cursor = 0;
  for (const entry of table.entries) {
    cursor += entry.weight;
    if (roll < cursor) return entry;
  }

  // Unreachable while the range check above holds and the weights sum to
  // totalWeight. Thrown rather than returning the last entry, because silently
  // handing out the final item would hide a real arithmetic bug.
  throw new Error(`roll ${String(roll)} fell through a table of ${String(cursor)}`);
}

/**
 * What a box actually hands over, given who is opening it.
 *
 * `16 §8`'s duplicate rule, and the whole of it: **roll rarity → pick an unowned
 * item in that tier → if exhausted, salvage tokens.**
 *
 * ## The roll still decides, and it decides first
 *
 * The rarity comes from `resolveRoll` exactly as before — the weights, the
 * integer, the version and the cumulative walk are untouched. The commissioner's
 * ruling §1 is explicit that a legendary must stay as likely as it was, and the
 * only way to be sure of that is for this function to have no opinion about
 * rarity at all. It receives a tier and stays inside it.
 *
 * ## Within the tier, the walk starts where the roll landed
 *
 * If the rolled item is unowned, that is the answer and nothing has changed. If
 * it is owned, the walk continues **from that item forward, wrapping**, and takes
 * the first unowned one. Starting at the roll rather than at the top of the tier
 * matters: a fixed start would make the alphabetically-first unowned item of a
 * tier the answer to almost every redirect, so a manager filling a set would
 * receive it in near-alphabetical order and the box would feel like a list.
 *
 * ## Pure, so an opening stays auditable
 *
 * No clock, no database, no randomness. Given the table version, the recorded
 * roll and what the manager owned at that moment — reconstructible from
 * `collectibles.acquired_at` — the outcome recomputes exactly, which is what
 * `18 §4.3` means by an auditable opening.
 */
export type Award =
  | { readonly kind: 'item'; readonly slug: string; readonly rarity: Rarity }
  /** Every item in the rolled tier is already owned. `slug` is the spare. */
  | { readonly kind: 'salvage'; readonly slug: string; readonly rarity: Rarity };

export function selectAward(
  table: Pick<RewardTableConfig, 'entries' | 'totalWeight'>,
  roll: number,
  owned: ReadonlySet<string>,
): Award {
  const rolled = resolveRoll(table, roll);
  if (!owned.has(rolled.slug)) {
    return { kind: 'item', slug: rolled.slug, rarity: rolled.rarity };
  }

  const tier = table.entries.filter((entry) => entry.rarity === rolled.rarity);
  const start = tier.findIndex((entry) => entry.slug === rolled.slug);

  for (let step = 1; step < tier.length; step += 1) {
    const candidate = tier[(start + step) % tier.length];
    if (candidate !== undefined && !owned.has(candidate.slug)) {
      return { kind: 'item', slug: candidate.slug, rarity: candidate.rarity };
    }
  }

  // The tier is complete. The box still contained something; it is a spare.
  return { kind: 'salvage', slug: rolled.slug, rarity: rolled.rarity };
}

/**
 * The table's identity: a hash of exactly what it will roll against.
 *
 * A hash rather than a counter, for two reasons. Two environments seeding the
 * same catalog independently arrive at the same version with no coordination —
 * so a preview and production can be compared. And an edited table cannot reuse
 * an existing version, because the content it hashes has changed.
 *
 * Truncated to 16 hex characters: 64 bits of collision resistance is far more
 * than twenty-four items need, and a short version is legible in an audit row.
 */
function versionOf(entries: readonly RewardEntry[]): string {
  const canonical = entries
    .map((entry) => `${entry.slug}:${entry.rarity}:${String(entry.weight)}`)
    .join('|');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function lcm(a: number, b: number): number {
  return (a * b) / gcd(a, b);
}
