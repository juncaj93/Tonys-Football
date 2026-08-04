import { CATALOG_SIZE } from '@/lib/counter/catalog';
import { standardRewardTable } from '@/lib/counter/rewards';
import { PROVISIONAL_ECONOMY } from '@/lib/counter/tokens';
import {
  type DuplicatePolicy,
  checkRanges,
  simulate,
} from '@/lib/economy/simulate';

/**
 * The economy simulation, as a report.
 *
 *   npx tsx scripts/simulate-economy.ts
 *   npx tsx scripts/simulate-economy.ts --seasons=10 --seed=7
 *
 * `16 §8` makes this a **release gate**: every economy value in the product is
 * flagged provisional until somebody reads these numbers and approves the
 * ranges. The script prints; it changes nothing and writes nothing.
 *
 * It runs **both** duplicate policies, because whether the specified one is
 * worth building is one of the questions the gate answers — salvage is recorded
 * as unbuilt and P3-gated, and the difference between the two columns is the
 * argument for or against it.
 */

const arg = (name: string, fallback: number): number => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (found === undefined) return fallback;
  const value = Number.parseInt(found.split('=')[1] ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
};

const SEASONS = arg('seasons', 5);
const SEED = arg('seed', 20260804);
/** Ten seats, and the scored-week count the imported seasons actually carry. */
const MANAGERS = arg('managers', 10);
const WEEKS = arg('weeks', 14);

function run(policy: DuplicatePolicy): void {
  const result = simulate({
    economy: PROVISIONAL_ECONOMY,
    table: standardRewardTable(),
    seasons: SEASONS,
    managers: MANAGERS,
    weeks: WEEKS,
    policy,
    seed: SEED,
    catalogSize: CATALOG_SIZE,
  });

  console.log(`\n  ── duplicate policy: ${policy} ${'─'.repeat(46 - policy.length)}`);
  for (const check of checkRanges(result)) {
    const mark = check.range === 'informational' ? ' ' : check.withinRange ? '✓' : '✗';
    console.log(
      `  ${mark} ${check.name.padEnd(44)} ${check.range.padEnd(14)} ${check.measured}`,
    );
  }

  const owned = result.managers.map((m) => m.owned);
  const dupes = result.managers.reduce((n, m) => n + m.duplicates, 0);
  const salvaged = result.managers.reduce((n, m) => n + m.salvaged, 0);
  const openings = result.managers.reduce((n, m) => n + m.openings, 0);
  console.log(
    `    collection after ${String(SEASONS)} seasons: ` +
      `${String(Math.min(...owned))}–${String(Math.max(...owned))} of ${String(CATALOG_SIZE)} items · ` +
      `${String(dupes)} duplicates in ${String(openings)} openings` +
      (salvaged > 0 ? ` · ${String(salvaged)} salvaged` : ''),
  );

  const earned = result.managers.map((m) => m.tokensEarned);
  console.log(
    `    tokens earned: ${String(Math.min(...earned))} (worst) … ${String(Math.max(...earned))} (best)`,
  );
}

console.log(
  `\n  Economy simulation — ${String(SEASONS)} seasons · ${String(MANAGERS)} managers · ` +
    `${String(WEEKS)} weeks · seed ${String(SEED)}`,
);
console.log(
  `  Prices: box ${String(PROVISIONAL_ECONOMY.standardBoxPriceTokens)} · ` +
    `win ${String(PROVISIONAL_ECONOMY.matchupWinTokens)} · ` +
    `high ${String(PROVISIONAL_ECONOMY.weeklyHighScoreTokens)} · ` +
    `opening ${String(PROVISIONAL_ECONOMY.seasonStartTokens)}`,
);

run('as-built');
run('specified');

console.log(
  '\n  Nothing is approved by this script. `16 §8` requires the ranges to be\n' +
    '  reviewed and signed off; until then every value stays provisional.\n',
);
