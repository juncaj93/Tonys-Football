import { CATALOG_SIZE } from '@/lib/counter/catalog';
import { standardRewardTable } from '@/lib/counter/rewards';
import { PROVISIONAL_ECONOMY } from '@/lib/counter/tokens';
import {
  type DuplicatePolicy,
  type SalvageValues,
  SCORED_WEEKS,
  checkRanges,
  salvageFor,
  simulate,
} from '@/lib/economy/simulate';

/**
 * The economy simulation, as a report — `16 §8`'s release gate.
 *
 *   npx tsx scripts/simulate-economy.ts
 *   npx tsx scripts/simulate-economy.ts --price=175 --seasons=10 --seed=7
 *   npx tsx scripts/simulate-economy.ts --sweep
 *
 * The script prints. It changes nothing, writes nothing, and approves nothing.
 */

const arg = (name: string, fallback: number): number => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (found === undefined) return fallback;
  const value = Number.parseInt(found.split('=')[1] ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
};

const SEASONS = arg('seasons', 5);
const SEED = arg('seed', 20260804);
const MANAGERS = arg('managers', 10);
const WEEKS = arg('weeks', SCORED_WEEKS);
const GRANTS = arg('grants', 2);

function run(price: number, policy: DuplicatePolicy, salvage: SalvageValues): boolean {
  const result = simulate({
    economy: { ...PROVISIONAL_ECONOMY, standardBoxPriceTokens: price },
    salvage,
    grantsPerSeason: GRANTS,
    table: standardRewardTable(),
    seasons: SEASONS,
    managers: MANAGERS,
    weeks: WEEKS,
    policy,
    seed: SEED,
    catalogSize: CATALOG_SIZE,
  });

  const checks = checkRanges(result);
  const gating = checks.filter((c) => c.range !== 'informational');
  const passed = gating.every((c) => c.withinRange);

  console.log(`\n  ── box ${String(price)} · ${policy} ${'─'.repeat(Math.max(0, 40 - policy.length))}`);
  for (const check of checks) {
    const mark = check.range === 'informational' ? ' ' : check.withinRange ? '✓' : '✗';
    console.log(`  ${mark} ${check.name.padEnd(44)} ${check.range.padEnd(14)} ${check.measured}`);
  }

  const owned = result.managers.map((m) => m.owned);
  const dupes = result.managers.reduce((n, m) => n + m.duplicates, 0);
  const salv = result.managers.reduce((n, m) => n + m.salvaged, 0);
  const openings = result.managers.reduce((n, m) => n + m.openings, 0);
  console.log(
    `    collection: ${String(Math.min(...owned))}–${String(Math.max(...owned))} of ${String(CATALOG_SIZE)} · ` +
      `${String(dupes)} duplicates in ${String(openings)} openings` +
      (salv > 0 ? ` · ${String(salv)} salvaged` : ''),
  );
  return passed;
}

console.log(
  `\n  Economy simulation — ${String(SEASONS)} seasons · ${String(MANAGERS)} managers · ` +
    `${String(WEEKS)} weeks · ${String(GRANTS)} grants/season · seed ${String(SEED)}`,
);

if (process.argv.includes('--sweep')) {
  /*
   * The commissioner's bounded tuning authority: 175–225 in steps of 25, and
   * the value closest to 200 that passes the whole gate wins.
   */
  const results: { price: number; passed: boolean }[] = [];
  for (const price of [175, 200, 225]) {
    const salvage = salvageFor(price);
    console.log(
      `\n  salvage at ${String(price)}: common ${String(salvage.common)} · rare ${String(salvage.rare)} · ` +
        `epic ${String(salvage.epic)} · legendary ${String(salvage.legendary)}`,
    );
    results.push({ price, passed: run(price, 'specified', salvage) });
  }
  const passing = results.filter((r) => r.passed).map((r) => r.price);
  console.log(
    `\n  Passing prices: ${passing.length === 0 ? 'none' : passing.join(', ')}` +
      (passing.length === 0
        ? ' — report the table rather than widening the change.'
        : ` → closest to 200 is ${String(passing.sort((a, b) => Math.abs(a - 200) - Math.abs(b - 200))[0])}`),
  );
} else {
  const price = arg('price', PROVISIONAL_ECONOMY.standardBoxPriceTokens);
  const salvage = salvageFor(price);
  // The rule that ships, then the pre-`0014` counterfactual beneath it — so the
  // report shows what the ruling changed rather than only where it landed.
  run(price, 'specified', salvage);
  run(price, 'as-built', salvage);
}

console.log(
  '\n  Nothing is approved by this script. `16 §8` requires the ranges to be\n' +
    '  reviewed and signed off; until then every value stays provisional.\n',
);
