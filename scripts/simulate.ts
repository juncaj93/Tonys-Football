/**
 * Play a league situation through the real Tuesday pipeline and write the report.
 *
 *   npm run simulate -- preseason
 *   npm run simulate -- week-8
 *   npm run simulate -- week-16
 *   npm run simulate -- all
 *   npm run simulate -- week-8 --keep      leave the database in that state to browse
 *
 * ## What this is for
 *
 * `docs/SLICE_SIMULATION_LAB.md` is the account. The short version: every Slice
 * anybody has looked at was a week of 2024/2025 or a fixture rendered in memory,
 * so nobody has seen the paper the **cron** produces from a season the cron
 * played. This runs three of those and prints what came out — the prose *and*
 * the refusals.
 *
 * ## It asserts nothing
 *
 * `lib/simulation/lab.test.ts` is the gate; this is the evidence. The same split
 * `scripts/rehearse.ts` uses, for the same reason.
 *
 * ## It refuses a hosted database
 *
 * It truncates every league table before each scenario, exactly as the test
 * suite does. `scripts/dev-db.sh` carries the same guard, and it exists because
 * the rule was broken once and a preview dataset was destroyed.
 *
 * `--keep` is what makes the result browsable: run one scenario, leave the
 * database holding it, and point a dev server at the same `DATABASE_URL`. Every
 * scenario resets first, so `all` ends holding whichever ran last — which is why
 * the screenshots are captured per scenario rather than at the end.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { closePool, getDb } from '@/lib/db';
import { resetDatabase } from '@/lib/db/reset';
import { runSimulation } from '@/lib/simulation/lab';
import { renderSimulationReport } from '@/lib/simulation/report';
import { SIMULATION_KEYS, simulationScenario, type SimulationKey } from '@/lib/simulation/scenarios';

const USAGE = `
Usage:
  npm run simulate -- <${SIMULATION_KEYS.join(' | ')} | all> [--keep] [--no-retrospective] [--out <dir>]
`.trim();

const DEFAULT_OUT = path.join('docs', 'evidence', 'slice-simulation');

function refuseHosted(url: string): void {
  if (/neon\.tech|vercel|supabase|amazonaws|\.cloud/.test(url)) {
    throw new Error(
      `REFUSED: DATABASE_URL looks hosted (${url}). The simulation truncates every ` +
        'league table. Point it at a local throwaway database.',
    );
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const requested = args[0] ?? '';
  const outIndex = args.indexOf('--out');
  const out = outIndex === -1 ? DEFAULT_OUT : (args[outIndex + 1] ?? DEFAULT_OUT);

  const keys: readonly SimulationKey[] =
    requested === 'all'
      ? SIMULATION_KEYS
      : (SIMULATION_KEYS as readonly string[]).includes(requested)
        ? [requested as SimulationKey]
        : [];

  if (keys.length === 0) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const url = process.env['DATABASE_URL'] ?? '';
  if (url === '') {
    console.error('DATABASE_URL must be set. Try `npm run db:up`.');
    process.exitCode = 1;
    return;
  }
  refuseHosted(url);

  const db = getDb();
  mkdirSync(out, { recursive: true });

  for (const key of keys) {
    const scenario = simulationScenario(key);
    console.log(`\n${scenario.title}`);

    await resetDatabase(db);
    const record = await runSimulation(db, key, {
      retrospective: !args.includes('--no-retrospective'),
    });

    const file = path.join(out, `${key}.md`);
    const report = renderSimulationReport(record);
    writeFileSync(file, report.endsWith('\n') ? report : `${report}\n`, 'utf8');

    const featured = record.tuesdays.at(-1)?.report;
    console.log(`  paper        ${featured?.issueKind ?? 'none'}`);
    console.log(`  headline     ${record.desk?.edition.headline ?? '—'}`);
    console.log(`  validator    ${record.desk?.publishable === true ? 'passed' : 'refused'}`);
    console.log(`  status       ${record.publication?.statusAfterPublication ?? 'nothing published'}`);
    console.log(`  wrote        ${file}`);
  }

  if (args.includes('--keep')) {
    console.log(
      `\nThe database is left holding "${keys.at(-1) ?? ''}". ` +
        'Point a server at the same DATABASE_URL and open /slice.',
    );
  }

  await closePool();
}

void main();
