/**
 * The first step of `npm run check`, and the only reason it can be trusted.
 *
 * `check` is the command whose green means *this branch is verified*. It said so
 * once while a third of the suite had silently skipped, because vitest does not
 * read `.env.local` and 28 database-backed files are guarded by
 * `describe.skipIf(!hasDatabase)`.
 *
 * Running first matters: typecheck, lint and build all pass perfectly well
 * without a database, so a preflight at the end would let the operator watch
 * three green steps before being told the run was never valid.
 *
 * `scripts/harness.ts` explains the incident. This file is only the door.
 */

import { HarnessRefusal, assertDatabaseReady } from './harness';

try {
  assertDatabaseReady(process.env);
} catch (error: unknown) {
  if (error instanceof HarnessRefusal) {
    // No stack trace: the message is the whole point, and a stack buries it.
    console.error(`\ncheck refused to start.\n\n  ${error.message}\n`);
    process.exit(1);
  }
  throw error;
}
