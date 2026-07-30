/**
 * Put the database into a named demo state.
 *
 *   npm run demo -- list
 *   npm run demo -- apply pull-legendary
 *   npm run demo -- apply pull-legendary --json
 *   npm run demo -- reset
 *
 * `MANDATE §8`: *"a feature is not demo-ready if showing its important states
 * requires editing the database by hand."* This is the hand that would otherwise
 * be editing it.
 *
 * ## It refuses by default
 *
 * Two guards, and both must pass (`lib/demo/guard.ts`). Production is refused
 * outright, and everywhere else needs `DEMO_FIXTURES=1` set on purpose — an
 * unset variable is not a refusal, so the opt-in has to be present rather than
 * merely not-absent. Under both of those, every write still lands on a reserved
 * `demo:` seat that no real manager's Sleeper id can ever match.
 *
 * ## What it prints
 *
 * A door URL and a PIN, because a state nobody can *reach* is not a demo. The
 * `--json` form is what the visual-QA driver reads.
 */
import { closePool, getDb } from '@/lib/db';
import { DemoBlocked, applyDemoState } from '@/lib/demo/apply';
import { DemoRefused } from '@/lib/demo/guard';
import { retireDemoSeats } from '@/lib/demo/seat';
import { BLOCKED_ON_M3, DEMO_STATES } from '@/lib/demo/states';

const USAGE = `
Usage:
  npm run demo -- list
  npm run demo -- apply <state> [--json]
  npm run demo -- reset

Set DEMO_FIXTURES=1 and point DATABASE_URL at a local or preview database.
`.trim();

async function main(): Promise<void> {
  // `npm run x -- a b` and `tsx scripts/demo.ts a b` disagree about the leading
  // `--`, so it is dropped rather than each caller having to know.
  const argv = process.argv.slice(2).filter((arg) => arg !== '--');
  const command = argv[0];

  if (command === undefined || command === 'help' || command === '--help') {
    console.log(USAGE);
    return;
  }

  if (command === 'list') {
    listStates();
    return;
  }

  // One applicable key per line, for scripts. `list` is for people, and parsing
  // it meant an awk pattern that also matched the legend at the bottom — which
  // is how `scripts/dev-db.sh fresh` came to try applying a state called
  // "driven".
  if (command === 'keys') {
    for (const state of DEMO_STATES) {
      if (!BLOCKED_ON_M3.includes(state.key)) console.log(state.key);
    }
    return;
  }

  if ((process.env['DATABASE_URL'] ?? '') === '') {
    console.error('DATABASE_URL is not set. See .env.example.');
    process.exitCode = 1;
    return;
  }

  const db = getDb();

  try {
    if (command === 'reset') {
      const { retired } = await retireDemoSeats(db);
      console.log(
        retired === 0
          ? 'Nothing to retire — this database holds no live demo seats.'
          : `Retired ${String(retired)} demo ${retired === 1 ? 'seat' : 'seats'}. ` +
              'The next apply opens a fresh generation.',
      );
      console.log(
        '\nNote: retiring never deletes. `token_transactions` refuses DELETE for ' +
          'everyone, demos included — a demo that could erase its own ledger would be\n' +
          'no evidence that the real one cannot. For a truly empty database, run ' +
          '`npm run db:reset`.',
      );
      return;
    }

    if (command === 'apply') {
      const key = argv[1];
      if (key === undefined) {
        console.error('Which state? Run `npm run demo -- list`.');
        process.exitCode = 1;
        return;
      }

      const outcome = await applyDemoState(db, key, process.env);

      if (argv.includes('--json')) {
        console.log(
          JSON.stringify(
            {
              state: outcome.state.key,
              route: outcome.viewPath,
              doorPath: outcome.doorPath,
              pin: outcome.pin,
              userId: outcome.seat.userId,
              generation: outcome.seat.generation,
              evidence: outcome.evidence,
              browserSteps: outcome.browserSteps,
            },
            null,
            2,
          ),
        );
        return;
      }

      console.log(`\n${outcome.state.key} — ${outcome.state.shows}`);
      console.log(`  reach      ${outcome.state.reach}`);
      console.log(`  sign in    ${outcome.doorPath}   PIN ${outcome.pin}`);
      console.log(`  then open  ${outcome.viewPath}`);
      console.log(`  seat       ${outcome.seat.sleeperUserId}`);

      const evidence = Object.entries(outcome.evidence);
      if (evidence.length > 0) {
        console.log('\n  written:');
        for (const [name, value] of evidence) {
          console.log(`    ${name.padEnd(16)} ${String(value)}`);
        }
      }

      if (outcome.browserSteps.length > 0) {
        console.log('\n  the browser still has to do this — the condition is not in the database:');
        for (const step of outcome.browserSteps) console.log(`    · ${step}`);
      }

      console.log('');
      return;
    }

    console.error(`Unknown command "${command}".\n\n${USAGE}`);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

function listStates(): void {
  const width = Math.max(...DEMO_STATES.map((state) => state.key.length));
  console.log(`\n${String(DEMO_STATES.length)} demo states\n`);

  for (const state of DEMO_STATES) {
    const blocked = BLOCKED_ON_M3.includes(state.key) ? '  [blocked on M3]' : '';
    console.log(
      `  ${state.key.padEnd(width)}  ${state.reach.padEnd(9)} ${state.route.padEnd(21)} ` +
        `${state.shows}${blocked}`,
    );
  }

  console.log(
    '\n  driven    reached by calling the same server code a manager’s tap calls' +
      '\n  arranged  a starting position is set up first, then driven' +
      '\n  client    a condition of the browser; the applier sets up the precondition\n',
  );
}

main().catch((error: unknown) => {
  if (error instanceof DemoRefused || error instanceof DemoBlocked) {
    // A refusal is the tool working, so it reads as a sentence rather than a
    // stack trace. Still a non-zero exit, so a script cannot mistake it for
    // success.
    console.error(`\n${error.name}: ${error.message}\n`);
  } else {
    console.error(`\nDemo failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  void closePool().finally(() => {
    process.exit(1);
  });
});
