import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { type Rarity, RARITIES } from '@/lib/counter/catalog';
import { PROVISIONAL_ECONOMY } from '@/lib/counter/tokens';
import {
  auditCatalog,
  byForm,
  byRarity,
  catalogShape,
  rarityShares,
} from '@/lib/economy/catalog-audit';
import {
  type ArchetypeName,
  type CatalogShape,
  ARCHETYPES,
  LEAGUE_ROSTER,
  sizeCatalog,
  subsetSummary,
  summarize,
  tierHealth,
} from '@/lib/economy/catalog-sizing';
import { salvageFor } from '@/lib/economy/simulate';

/**
 * The catalog-sizing report.
 *
 *   npx tsx scripts/catalog-sizing.ts                    # audit + every scenario
 *   npx tsx scripts/catalog-sizing.ts --add=common:5,rare:3
 *   npx tsx scripts/catalog-sizing.ts --shape=14,12,6,3
 *   npx tsx scripts/catalog-sizing.ts --seasons=3 --seeds=40
 *   npx tsx scripts/catalog-sizing.ts --json=docs/evidence/catalog-sizing/report.json
 *
 * It prints. It writes nothing unless `--json` names a file, it touches no
 * database, and it approves nothing — the same contract as
 * `scripts/simulate-economy.ts`.
 */

const flag = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

const num = (name: string, fallback: number): number => {
  const value = Number.parseInt(flag(name) ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
};

const SEASONS = num('seasons', 1);
const SEEDS = num('seeds', 24);
const GRANTS = num('grants', 2);
const BOX_PRICE = num('price', PROVISIONAL_ECONOMY.standardBoxPriceTokens);

/** Deterministic and spread out — a report has to be reproducible from its flags. */
const seeds = Array.from({ length: SEEDS }, (_, index) => 20260810 + index * 7919);

const audit = auditCatalog();
const CURRENT: CatalogShape = catalogShape(audit);
const SHARES = rarityShares(audit);

function shapeOf(spec: string | undefined, base: CatalogShape): CatalogShape {
  if (spec === undefined) return base;
  const parts = spec.split(',').map((n) => Number.parseInt(n, 10));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error('--shape takes four integers: common,rare,epic,legendary');
  }
  return { common: parts[0]!, rare: parts[1]!, epic: parts[2]!, legendary: parts[3]! };
}

function added(spec: string | undefined, base: CatalogShape): CatalogShape {
  if (spec === undefined) return base;
  const shape = { ...base };
  for (const term of spec.split(',')) {
    const [rarity, count] = term.split(':');
    if (!(RARITIES as readonly string[]).includes(rarity ?? '')) {
      throw new Error(`--add: ${String(rarity)} is not a rarity`);
    }
    shape[rarity as Rarity] += Number.parseInt(count ?? '0', 10);
  }
  return shape;
}

const total = (shape: CatalogShape): number =>
  RARITIES.reduce((sum, rarity) => sum + shape[rarity], 0);

const label = (shape: CatalogShape): string =>
  `${String(total(shape))} = ${RARITIES.map((r) => `${String(shape[r])}${r[0]!}`).join('/')}`;

function run(name: string, shape: CatalogShape) {
  const result = sizeCatalog({
    shape,
    shares: SHARES,
    economy: { ...PROVISIONAL_ECONOMY, standardBoxPriceTokens: BOX_PRICE },
    salvage: salvageFor(BOX_PRICE),
    grantsPerSeason: GRANTS,
    roster: LEAGUE_ROSTER,
    seasons: SEASONS,
    seeds,
    welcome: true,
  });

  console.log(`\n  ${name}  ·  ${label(shape)}`);
  const perSeason = Array.from({ length: SEASONS }, (_, index) =>
    summarize(result, { season: index + 1 }),
  );

  console.log(
    '    season week   unique (p10/med/p90)   complete   opened   no-object rate   managers hit',
  );
  for (const [index, season] of perSeason.entries()) {
    for (const point of season) {
      console.log(
        `    ${String(index + 1).padStart(6)} ${String(point.week).padStart(4)}   ` +
          `${point.uniqueLow.toFixed(0).padStart(4)} /${point.uniqueMedian.toFixed(1).padStart(6)} /${point.uniqueHigh.toFixed(0).padStart(4)}      ` +
          `${(point.completionMedian * 100).toFixed(0).padStart(4)}%   ` +
          `${point.openingsMedian.toFixed(1).padStart(6)}   ` +
          `${(point.salvageRate * 100).toFixed(1).padStart(12)}%   ` +
          `${(point.managersWithSalvage * 100).toFixed(0).padStart(10)}%`,
      );
    }
  }

  const health = tierHealth(result);
  console.log('    tier         items   pulls/mgr   ran out   in S1   median exhaustion');
  for (const tier of health) {
    const when = tier.medianExhaustion;
    console.log(
      `    ${tier.rarity.padEnd(12)} ${String(tier.items).padStart(5)}   ` +
        `${tier.pullsPerManager.toFixed(1).padStart(9)}   ` +
        `${(tier.exhaustedShare * 100).toFixed(0).padStart(6)}%   ` +
        `${(tier.exhaustedInSeasonOne * 100).toFixed(0).padStart(4)}%   ` +
        `${when === null ? '                 —' : `      S${String(when.season)} week ${String(when.week).padStart(2)}`}`,
    );
  }

  return { name, shape, league: perSeason[0] ?? [], perSeason, health, result };
}

/** Per-rarity counts of the catalog rows that satisfy some predicate. */
function countBy(predicate: (row: (typeof audit.box)[number]) => boolean) {
  const counts = {} as Record<Rarity, number>;
  for (const rarity of RARITIES) {
    counts[rarity] = audit.box.filter((row) => row.rarity === rarity && predicate(row)).length;
  }
  return counts;
}

/* --------------------------------------------------------------- the audit -- */

console.log('\n  CATALOG AUDIT — from the asset registry, the reward table and the economy\n');
console.log(
  `  reward table ${audit.generatedFrom.rewardTableVersion.slice(0, 12)} · ` +
    `box ${String(audit.generatedFrom.boxPriceTokens)} tokens · ` +
    `${String(audit.generatedFrom.catalogSize)} box items · ` +
    `${String(audit.system.length)} system-granted`,
);

console.log('\n  rarity       items   art   placeholder   tier share   salvage');
for (const rollup of byRarity(audit)) {
  console.log(
    `  ${rollup.rarity.padEnd(12)} ${String(rollup.items).padStart(5)}   ` +
      `${String(rollup.withArt).padStart(3)}   ${String(rollup.placeholder).padStart(11)}   ` +
      `${(rollup.tierShare * 100).toFixed(1).padStart(9)}%   ${String(rollup.salvageTokens).padStart(7)}`,
  );
}

console.log('\n  form        items   art   common   rare   epic   legendary');
for (const rollup of byForm(audit)) {
  console.log(
    `  ${rollup.form.padEnd(11)} ${String(rollup.items).padStart(5)}   ` +
      `${String(rollup.withArt).padStart(3)}   ` +
      RARITIES.map((r) => String(rollup.byRarity[r]).padStart(r === 'common' ? 6 : 5)).join('  '),
  );
}

console.log('\n  system-granted, excluded from every box and from all sizing:');
for (const item of audit.system) {
  console.log(`    ${item.slug.padEnd(28)} ${item.rarity.padEnd(10)} ${item.name}`);
}

/* ------------------------------------------------------------ the scenarios -- */

console.log(
  `\n\n  SIZING — ${String(SEASONS)} season(s) · ${String(seeds.length)} leagues · ` +
    `${String(LEAGUE_ROSTER.length)} managers · box ${String(BOX_PRICE)} · ${String(GRANTS)} grants`,
);
console.log(
  `  archetypes: ${Object.entries(ARCHETYPES)
    .map(([name, odds]) => `${name} ${(odds.winRate * 100).toFixed(0)}%`)
    .join(' · ')}`,
);

/**
 * A scenario is a catalog shape plus what the art looks like under it.
 *
 * `art` and `wall` are the per-rarity counts of items that would have finished
 * art and of items that would hang on a wall. They are what turns a sizing
 * number into an art decision: a catalog of thirty is a different product
 * depending on whether twelve of them are the same pizza box.
 */
interface Scenario {
  readonly name: string;
  readonly shape: CatalogShape;
  readonly art: CatalogShape;
  readonly wall: CatalogShape;
}

const SHIPPED_ART = countBy((row) => row.artExists);
const SHIPPED_WALL = countBy((row) => row.form === 'wall');

const explicit = flag('shape') ?? flag('add');
const scenarios: readonly Scenario[] =
  explicit === undefined
    ? [
        /* What is on `main` today. */
        { name: 'shipped', shape: CURRENT, art: SHIPPED_ART, wall: SHIPPED_WALL },
        /*
         * P0 — no new slugs, every slug painted. The one form change is free:
         * `collectible_paper_menu` briefed as a menu board that hangs, which
         * gives the frame its first common-tier occupant at no extra art.
         */
        {
          name: 'P0 kickoff — 24 painted',
          shape: CURRENT,
          art: CURRENT,
          wall: { common: 1, rare: 2, epic: 1, legendary: 1 },
        },
        /* P1 — the recommended season-one catalog. */
        {
          name: 'P1 season one — 32',
          shape: { common: 15, rare: 10, epic: 4, legendary: 3 },
          art: { common: 15, rare: 10, epic: 4, legendary: 3 },
          wall: { common: 4, rare: 3, epic: 1, legendary: 2 },
        },
        /* P2 — depth for season two, not needed before kickoff. */
        {
          name: 'P2 stretch — 38',
          shape: { common: 18, rare: 12, epic: 5, legendary: 3 },
          art: { common: 18, rare: 12, epic: 5, legendary: 3 },
          wall: { common: 5, rare: 4, epic: 1, legendary: 2 },
        },
      ]
    : [
        {
          name: 'requested',
          shape: added(flag('add'), shapeOf(flag('shape'), CURRENT)),
          art: added(flag('add'), shapeOf(flag('shape'), CURRENT)),
          wall: SHIPPED_WALL,
        },
      ];

const runs = scenarios.map((scenario) => ({
  ...run(scenario.name, scenario.shape),
  art: scenario.art,
  wall: scenario.wall,
}));

/* ------------------------------------------------------------ by archetype -- */

console.log('\n  BY ARCHETYPE — unique items at season end, shipped catalog\n');
console.log('    archetype    week 4   week 8   week 12   week 14   season end');
const shipped = runs[0]!;
for (const archetype of Object.keys(ARCHETYPES) as ArchetypeName[]) {
  const points = summarize(shipped.result, { season: 1, archetype });
  console.log(
    `    ${archetype.padEnd(12)}` +
      points.map((p) => p.uniqueMedian.toFixed(1).padStart(8)).join(' '),
  );
}

/* --------------------------------------------------- what a collection is -- */

/*
 * Two questions that a count alone cannot answer: how much of a manager's
 * collection is still the same placeholder pizza box, and whether they own
 * anything that reads right in the room's picture frame. Both are exact rather
 * than sampled — see `subsetSummary`.
 */
console.log('\n  WHAT A SEASON-ONE COLLECTION LOOKS LIKE\n');
console.log(
  '    scenario                week   owned   with art   art share   holds a wall item',
);
for (const entry of runs) {
  const art = subsetSummary(entry.result, entry.art, { season: 1 });
  const wall = subsetSummary(entry.result, entry.wall, { season: 1 });
  for (const [index, point] of art.entries()) {
    const owned = entry.league[index]?.uniqueMedian ?? 0;
    console.log(
      `    ${(index === 0 ? entry.name : '').padEnd(24)}${String(point.week).padStart(4)}   ` +
        `${owned.toFixed(1).padStart(5)}   ${point.expectedOwned.toFixed(1).padStart(8)}   ` +
        `${(point.expectedShare * 100).toFixed(0).padStart(8)}%   ` +
        `${((wall[index]?.chanceOfAny ?? 0) * 100).toFixed(0).padStart(16)}%`,
    );
  }
  console.log('');
}

/* ------------------------------------------------------------------- json -- */

const jsonPath = flag('json');
if (jsonPath !== undefined) {
  const payload = {
    generatedFrom: audit.generatedFrom,
    settings: { seasons: SEASONS, seeds: seeds.length, grants: GRANTS, boxPrice: BOX_PRICE },
    audit: { box: audit.box, system: audit.system },
    rarity: byRarity(audit),
    form: byForm(audit),
    scenarios: runs.map((entry) => ({
      name: entry.name,
      shape: entry.shape,
      total: total(entry.shape),
      art: entry.art,
      wall: entry.wall,
      collection: {
        art: subsetSummary(entry.result, entry.art, { season: 1 }),
        wall: subsetSummary(entry.result, entry.wall, { season: 1 }),
      },
      checkpoints: entry.league,
      perSeason: entry.perSeason,
      tiers: entry.health,
      byArchetype: Object.fromEntries(
        (Object.keys(ARCHETYPES) as ArchetypeName[]).map((archetype) => [
          archetype,
          summarize(entry.result, { season: 1, archetype }),
        ]),
      ),
    })),
  };
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`\n  wrote ${jsonPath}`);
}

console.log('');
