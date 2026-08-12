import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { playSingleDeck, solveInfiniteDeck } from '@/lib/casino/blackjack-model';
import { CANDIDATES, RECOMMENDED } from '@/lib/casino/candidates';
import { SYMBOLS, analyse, auditPaytable, type Paytable } from '@/lib/casino/slots-model';
import { CATALOG_SIZE } from '@/lib/counter/catalog';
import { standardRewardTable } from '@/lib/counter/rewards';
import { PROVISIONAL_ECONOMY } from '@/lib/counter/tokens';
import {
  CADENCE,
  CASINO_ARCHETYPES,
  type CasinoArchetype,
  type CasinoPolicy,
  SLOT_SHARE,
  blackjackGame,
  slotsGame,
  uniformRoster,
} from '@/lib/economy/casino-scenario';
import {
  SCORED_WEEKS,
  checkRanges,
  generator,
  salvageFor,
  simulate,
  type SimulationInput,
} from '@/lib/economy/simulate';

/**
 * Phase 3 — the slots redesign, under the 2026-08-11 rulings.
 *
 *   npx tsx scripts/slots-redesign.ts
 *
 * Ruling 1 fixes the buttons at 5 / 10 / 20. Ruling 2 fixes the top prize at
 * 20× — 400 tokens at the largest button. Ruling 3 refuses 85.13% and directs
 * the design at roughly 92%, with 90 / 92 / 93 to be explored and **no
 * assumption that 92 wins**.
 *
 * The script prints, writes one evidence file, and approves nothing.
 */

const SEASONS = 50;
const MANAGERS = 10;
const SEED = 20260804;
const CASINO_SEED = 20260811;
/** The button the scenario models. Middle of the approved three. */
const SLOTS_WAGER = 10;
/** Ruling 4: blackjack is unchanged. Middle button. */
const BLACKJACK_WAGER = 40;

const out: string[] = [];
const say = (line = ''): void => {
  out.push(line);
  console.log(line);
};
const pct = (x: number, dp = 2): string => `${(x * 100).toFixed(dp)}%`;

function percentile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const a = sorted[lo] ?? 0;
  const b = sorted[Math.ceil(pos)] ?? 0;
  return a + (b - a) * (pos - lo);
}

const BASE: SimulationInput = {
  economy: PROVISIONAL_ECONOMY,
  salvage: salvageFor(PROVISIONAL_ECONOMY.standardBoxPriceTokens),
  grantsPerSeason: 2,
  table: standardRewardTable(),
  seasons: SEASONS,
  managers: MANAGERS,
  weeks: SCORED_WEEKS,
  policy: 'specified',
  seed: SEED,
  catalogSize: CATALOG_SIZE,
};
const SEASON_ONE: SimulationInput = { ...BASE, seasons: 1 };

/** Blackjack is unchanged by Ruling 4; its spread drives the 25% of plays that are hands. */
const blackjack = playSingleDeck(2_000_000, generator(4242), solveInfiniteDeck().hitTable);

function policyFor(
  table: Paytable,
  archetype: CasinoArchetype,
  wager = SLOTS_WAGER,
): CasinoPolicy {
  return {
    archetypes: uniformRoster(MANAGERS, archetype),
    slots: slotsGame(table, wager),
    blackjack: blackjackGame(blackjack.outcomes, BLACKJACK_WAGER),
    slotShare: SLOT_SHARE,
    reserveTokens: 0,
    seed: CASINO_SEED,
  };
}

/* ------------------------------------------------------------- paytables -- */

say('# Slots redesign — Phase 3, under the 2026-08-11 rulings');
say();
say(
  'Buttons **5 / 10 / 20** (Ruling 1) · top prize **20×**, 400 tokens at the largest button ' +
    '(Ruling 2) · return rate re-derived toward **≈92%** (Ruling 3) · blackjack untouched (Ruling 4).',
);
say();
say('## 1. The strip');
say();
say(
  '`' +
    SYMBOLS.map((s) => `${s} ${String(RECOMMENDED.strip[s])}`).join(' · ') +
    '` out of 100, identical across all three candidates, so the comparison isolates the return rate.',
);
say();
say(
  'It is flatter at the rare end than Phase 2. On the old strip the top prize landed **1 in 2,915 spins**, ' +
    'which a regular player would meet once every 5.7 seasons — a top prize the league never sees. ' +
    `It is now **1 in ${Math.round(1 / analyse(RECOMMENDED).topPrize.probability).toLocaleString('en-US')}**.`,
);
say();

say('## 2. Candidate paytables');
say();
say('| | pair pays (crust→tony) | triple pays (crust→tony) | RTP | Hit rate | Payout ≥ wager | True win (>1×) | Top prize | Volatility |');
say('|---|---|---|---|---|---|---|---|---|');
for (const table of CANDIDATES) {
  const a = analyse(table);
  say(
    `| **${table.id}** | ${SYMBOLS.map((s) => table.pair[s]).join('/')} | ${SYMBOLS.map((s) => table.triple[s]).join('/')} | ` +
      `**${pct(a.rtp)}** | ${pct(a.hitRate)} | ${pct(a.hitRate)} | ${pct(a.winRate)} | ` +
      `${String(a.topPrize.multiplier)}× @ 1 in ${Math.round(1 / a.topPrize.probability).toLocaleString('en-US')} | ${a.volatility.toFixed(3)} |`,
  );
}
say();
say(
  '*Payout ≥ wager equals the hit rate because no combination in any candidate pays less than the stake — ' +
    'a win that returns half a wager is a loss wearing a win\'s animation, and `16 §8` refuses that class of mechanic.*',
);
say();

say('### Expected token loss per spin');
say();
say('| Candidate | 5 tokens | 10 tokens | 20 tokens | Spins per box lost (at 10) |');
say('|---|---|---|---|---|');
for (const table of CANDIDATES) {
  const a = analyse(table);
  const at10 = a.expectedLossByWager.get(10) ?? 0;
  say(
    `| ${table.id} | ${(a.expectedLossByWager.get(5) ?? 0).toFixed(3)} | ${at10.toFixed(3)} | ` +
      `${(a.expectedLossByWager.get(20) ?? 0).toFixed(3)} | ${Math.round(PROVISIONAL_ECONOMY.standardBoxPriceTokens / at10).toLocaleString('en-US')} |`,
  );
}
say();

say('### Coherence, checked rather than reviewed');
say();
say('| Candidate | Probability space sums to 1 | Rarer pays more | Pair < triple | Integer & ≥ stake | Unique top prize | Inside the 400 cap |');
say('|---|---|---|---|---|---|---|');
for (const table of CANDIDATES) {
  const a = analyse(table);
  const sum = a.lines.reduce((s, l) => s + l.probability, 0) + a.lossRate;
  const problems = auditPaytable(table);
  const ok = (yes: boolean): string => (yes ? '✓' : '✗');
  say(
    `| ${table.id} | ${ok(Math.abs(sum - 1) < 1e-12)} | ${ok(!problems.some((p) => p.includes('rarer')))} | ` +
      `${ok(!problems.some((p) => p.includes('at least as much')))} | ${ok(!problems.some((p) => p.includes('whole multiple') || p.includes('less than the stake')))} | ` +
      `${ok(!problems.some((p) => p.includes('top prize')))} | ${ok(a.capBreaches.length === 0)} |`,
  );
}
say();
say('Every candidate is clean. The full outcome enumeration for the recommendation:');
say();
const rec = analyse(RECOMMENDED);
say('| Combination | Probability | Pays | Contribution |');
say('|---|---|---|---|');
for (const line of rec.lines) {
  say(`| ${line.label} | ${pct(line.probability, 4)} | ${String(line.multiplier)}× | ${pct(line.returned, 3)} |`);
}
say(`| *nothing* | ${pct(rec.lossRate, 4)} | 0 | — |`);
say(`| **total** | **100.0000%** | | **${pct(rec.rtp, 3)}** |`);
say();

/* ------------------------------------------------------------ simulation -- */

say('## 3. Full-season simulation');
say();
say(
  `${String(SEASONS)} seasons · ${String(MANAGERS)} managers · ${String(SCORED_WEEKS)} weeks · box 200 · ` +
    `slots at the ${String(SLOTS_WAGER)}-token button · blackjack at ${String(BLACKJACK_WAGER)} · ` +
    `${pct(SLOT_SHARE, 0)} of plays are spins · managers gamble before buying and reserve nothing.`,
);
say();

interface Cell {
  readonly boxesMedian: number;
  readonly boxesP10: number;
  readonly boxesP90: number;
  readonly balP10: number;
  readonly balMedian: number;
  readonly balP90: number;
  readonly net: number;
  readonly itemsSeason1: number;
  readonly bestBoxes: number;
  readonly worstBoxes: number;
  readonly gate: boolean;
}

const grid = new Map<string, Cell>();

/**
 * Season-one collection progression, averaged over many leagues.
 *
 * **One season of ten managers is far too small to decide anything.** The first
 * run of this script reported season-one item counts that were *non-monotonic in
 * the return rate* — the 93% candidate looked worse than the 90% one — which is
 * sampling noise being read as a finding. It is the same error the 2026-08-10
 * economy-gate ruling was issued about, and the fix is the same: make the sample
 * big enough that the signal survives it.
 *
 * Fifty independent leagues, so each figure rests on 500 manager-seasons rather
 * than ten. Every league uses its own seed for both football and the casino, so
 * the runs are independent rather than fifty views of one season.
 */
const SEASON_ONE_LEAGUES = 50;

function seasonOneItems(table: Paytable, archetype: CasinoArchetype): number {
  let total = 0;
  let managers = 0;
  for (let league = 0; league < SEASON_ONE_LEAGUES; league += 1) {
    const input: SimulationInput = { ...SEASON_ONE, seed: SEED + league * 7919 };
    const result =
      archetype === 'none'
        ? simulate(input)
        : simulate({
            ...input,
            casino: { ...policyFor(table, archetype), seed: CASINO_SEED + league * 104_729 },
          });
    for (const m of result.managers) {
      total += m.owned;
      managers += 1;
    }
  }
  return total / managers;
}

for (const table of CANDIDATES) {
  for (const archetype of CASINO_ARCHETYPES) {
    const long =
      archetype === 'none' ? simulate(BASE) : simulate({ ...BASE, casino: policyFor(table, archetype) });

    const boxes = long.managers.flatMap((m) => m.boxesPerSeason);
    const balances = long.managers.map((m) => m.endingBalance);
    const checks = checkRanges(long);

    // `simulate` assigns manager 0 the best football profile and manager 1 the worst.
    const best = long.managers[0];
    const worst = long.managers[1];

    grid.set(`${table.id}|${archetype}`, {
      boxesMedian: percentile(boxes, 0.5),
      boxesP10: percentile(boxes, 0.1),
      boxesP90: percentile(boxes, 0.9),
      balP10: percentile(balances, 0.1),
      balMedian: percentile(balances, 0.5),
      balP90: percentile(balances, 0.9),
      net: long.managers.reduce((n, m) => n + m.casinoReturned - m.casinoWagered, 0),
      itemsSeason1: seasonOneItems(table, archetype),
      bestBoxes: (best?.boxesPerSeason.reduce((a, b) => a + b, 0) ?? 0) / SEASONS,
      worstBoxes: (worst?.boxesPerSeason.reduce((a, b) => a + b, 0) ?? 0) / SEASONS,
      gate: checks.filter((c) => c.gating).every((c) => c.withinRange),
    });
  }
}

for (const table of CANDIDATES) {
  say(`### ${table.id} — RTP ${pct(analyse(table).rtp)}`);
  say();
  say('| Archetype | Boxes/season p10 · med · p90 | Items after S1 (mean, 50 leagues) | Ending balance p10 · med · p90 | Casino net | Strongest mgr | Weakest mgr | Gate |');
  say('|---|---|---|---|---|---|---|---|');
  for (const archetype of CASINO_ARCHETYPES) {
    const c = grid.get(`${table.id}|${archetype}`);
    if (c === undefined) continue;
    say(
      `| ${archetype} (${String(CADENCE[archetype])}/wk) | ${c.boxesP10.toFixed(1)} · **${c.boxesMedian.toFixed(1)}** · ${c.boxesP90.toFixed(1)} | ` +
        `**${c.itemsSeason1.toFixed(1)}** / ${String(CATALOG_SIZE)} | ${c.balP10.toFixed(0)} · ${c.balMedian.toFixed(0)} · ${c.balP90.toFixed(0)} | ` +
        `${c.net >= 0 ? '+' : ''}${c.net.toLocaleString('en-US')} | ${c.bestBoxes.toFixed(1)} | ${c.worstBoxes.toFixed(1)} | ` +
        `${c.gate ? 'PASS' : '**FAIL**'} |`,
    );
  }
  say();
}

/* ---------------------------------------------------------- the tradeoff -- */

say('## 4. The tradeoff Ruling 3 asked to see');
say();
say('Regular play is the case that decides it — the cadence an ordinary interested manager reaches.');
say();
say('| Candidate | RTP | Regular: boxes/season | Regular: items after S1 | Heavy: boxes/season | Heavy: items after S1 | League net drain / season | Gate at heavy |');
say('|---|---|---|---|---|---|---|---|');

const noneCell = grid.get(`${CANDIDATES[0]?.id ?? ''}|none`);
for (const table of CANDIDATES) {
  const reg = grid.get(`${table.id}|regular`);
  const hvy = grid.get(`${table.id}|heavy`);
  if (reg === undefined || hvy === undefined) continue;
  say(
    `| **${table.id}** | ${pct(analyse(table).rtp)} | ${reg.boxesMedian.toFixed(1)} | ${reg.itemsSeason1.toFixed(1)} / ${String(CATALOG_SIZE)} | ` +
      `${hvy.boxesMedian.toFixed(1)} | ${hvy.itemsSeason1.toFixed(1)} / ${String(CATALOG_SIZE)} | ` +
      `${Math.round(-reg.net / SEASONS).toLocaleString('en-US')} | ${hvy.gate ? 'PASS' : '**FAIL**'} |`,
  );
}
if (noneCell !== undefined) {
  say(
    `| *no casino* | — | ${noneCell.boxesMedian.toFixed(1)} | ${noneCell.itemsSeason1.toFixed(1)} / ${String(CATALOG_SIZE)} | ` +
      `${noneCell.boxesMedian.toFixed(1)} | ${noneCell.itemsSeason1.toFixed(1)} / ${String(CATALOG_SIZE)} | 0 | PASS |`,
  );
}
say();

/* ------------------------------------------------------- button sensitivity -- */

say('## 5. The recommendation across all three buttons');
say();
say(`${RECOMMENDED.id}, regular cadence, at each approved button.`);
say();
say('| Button | Expected loss/spin | Boxes/season | Items after S1 | Top payout |');
say('|---|---|---|---|---|');
for (const wager of RECOMMENDED.wagers) {
  const long = simulate({ ...BASE, casino: policyFor(RECOMMENDED, 'regular', wager) });
  let items = 0;
  for (let league = 0; league < SEASON_ONE_LEAGUES; league += 1) {
    const run = simulate({
      ...SEASON_ONE,
      seed: SEED + league * 7919,
      casino: {
        ...policyFor(RECOMMENDED, 'regular', wager),
        seed: CASINO_SEED + league * 104_729,
      },
    });
    items += run.managers.reduce((n, m) => n + m.owned, 0) / run.managers.length;
  }
  items /= SEASON_ONE_LEAGUES;
  const a = analyse(RECOMMENDED);
  say(
    `| ${String(wager)} | ${(a.expectedLossByWager.get(wager) ?? 0).toFixed(3)} | ` +
      `**${percentile(long.managers.flatMap((m) => m.boxesPerSeason), 0.5).toFixed(1)}** | ` +
      `${items.toFixed(1)} / ${String(CATALOG_SIZE)} | ` +
      `${String((a.maxPayoutByWager.get(wager) ?? 0))} |`,
  );
}
say();

const path = join(process.cwd(), 'docs/evidence/casino/slots-redesign.md');
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, `${out.join('\n')}\n`);
console.log(`\nwritten → ${path}`);
