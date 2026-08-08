/**
 * The three things the verification harness must not get wrong.
 *
 * Every check here exists because it **already failed once**, silently, and
 * produced a confident wrong answer. None of them is hypothetical, and none is
 * a general-purpose utility — this module is deliberately small and deliberately
 * about three named incidents.
 *
 * ## 1. A green `check` that never touched the database
 *
 * Twenty-eight test files are guarded by
 *
 *     const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';
 *     describe.skipIf(!hasDatabase)(…)
 *
 * which is correct: a contributor without Postgres should still be able to run
 * the unit tests. Those files also throw when `CI === 'true'`, so a hosted run
 * can never skip them.
 *
 * **Locally there was no equivalent**, and the asymmetry is the defect. Vitest
 * does not read `.env.local`, so a run in a shell that had not exported
 * `DATABASE_URL` reported
 *
 *     Test Files  71 passed | 17 skipped (88)
 *          Tests  902 passed | 483 skipped (1385)
 *
 * and exited zero. A third of the suite did not run and the command said it
 * passed. The count is printed, but reading it requires already suspecting the
 * problem — which is precisely what a gate is supposed to remove.
 *
 * The fix is not to make the tests fail without a database. It is to make **the
 * command that claims to be the full verification** refuse to start without one.
 * `npm run test` keeps its inner-loop behaviour; `npm run check` does not.
 *
 * ## 2. Screenshots of a server nobody owned
 *
 * `visual-qa.mts` has never started its own server — it reads `VISUAL_QA_BASE`
 * and photographs whatever answers. Readiness was *"the port returns 200"*, and
 * a 200 is not evidence of identity.
 *
 * A replacement server died on `EADDRINUSE`, the previous one kept the port, the
 * probe got its 200, and the sweep photographed the **old build** while reporting
 * on the new one. What made it survivable was luck: the stale build was different
 * enough to fail at sign-in. A stale build that differed only in the pixels under
 * test would have passed and been believed.
 *
 * The kill that should have prevented it matched `next start`. The running
 * process is named `next-server` — the gotcha `docs/CHECKPOINT.md` documents,
 * walked into anyway. A rule that has to be remembered is not a mechanism.
 *
 * ## 3. Two harnesses, one database
 *
 * CI has always used `tonys_test` for the test suite and `tonys_visual` for the
 * sweep, for exactly this reason. Locally there was one `DATABASE_URL` for both,
 * so `resetDatabase()` truncated the tables the screenshots were about to be
 * taken from, and reseeding afterwards left orphaned rows — fourteen users, two
 * `Nick`s, one with an empty `sleeper_user_id` — with the manager the sweep signs
 * in as no longer seated.
 *
 * The local rule is now CI's rule.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

/** Databases the vitest suite truncates. The sweep may never point at one. */
const TEST_DATABASES = new Set(['tonys_test', 'tonys_dev']);

/** Where the sweep belongs, matching `visual-qa.yml`. */
export const VISUAL_DATABASE = 'tonys_visual';

/** The database a connection string names, or `undefined` if it names none. */
export function databaseName(url: string | undefined): string | undefined {
  if (url === undefined || url.trim() === '') return undefined;
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return undefined;
  }
  const name = pathname.replace(/^\//, '');
  return name === '' ? undefined : name;
}

/**
 * Refuse to call a run "full verification" when its database is missing.
 *
 * Reachability rather than presence: a `DATABASE_URL` pointing at a server that
 * is not running skips every suite exactly as an absent one does, and reports
 * the same green. The distinction the operator needs is *did the database tests
 * run*, and only a connection answers that.
 */
export function assertDatabaseReady(env: Record<string, string | undefined>): void {
  const url = env['DATABASE_URL'];

  if (url === undefined || url.trim() === '') {
    throw new HarnessRefusal(
      'DATABASE_URL is not set, so every database-backed suite would skip and ' +
        'this command would still exit 0.\n\n' +
        '  28 test files are guarded by `describe.skipIf(!hasDatabase)`. Vitest does\n' +
        '  not read .env.local, so exporting it in the shell is required:\n\n' +
        '    npm run db:up\n' +
        '    export DATABASE_URL="postgres://tonys@localhost:5432/tonys_dev"\n' +
        '    npm run check\n\n' +
        '  To run only the unit tests without a database, use `npm run test`.',
    );
  }

  try {
    execFileSync('psql', [url, '-tAc', 'select 1'], { stdio: 'pipe', timeout: 15_000 });
  } catch {
    throw new HarnessRefusal(
      `DATABASE_URL is set but ${describe(url)} is not reachable, so every ` +
        'database-backed suite would skip and this command would still exit 0.\n\n' +
        '    npm run db:up\n\n' +
        '  starts it. `npm run db:status` reports what it finds.',
    );
  }

  assertSchemaIsCurrent(url);
}

/**
 * Reachable is not the same as usable.
 *
 * A database two migrations behind answers `select 1` perfectly and then fails
 * every insert that touches a column it does not have. That is not a subtle
 * outcome — merging `#72` and running `check` against a database last migrated
 * before it produced **109 failures across 10 files**, every one of them a
 * `Failed query:` on `collectibles`, and not one of them saying *run the
 * migrations*.
 *
 * Comparing the journal against the applied count turns all 109 into one
 * sentence. It deliberately does **not** migrate: a verification command that
 * quietly mutates the database it is about to measure is how a schema change
 * gets shipped without anyone reading it.
 */
function assertSchemaIsCurrent(url: string): void {
  const expected = (
    JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
      entries: readonly unknown[];
    }
  ).entries.length;

  let applied = 0;
  try {
    const out = execFileSync(
      'psql',
      [url, '-tAc', 'select count(*) from drizzle.__drizzle_migrations'],
      { stdio: 'pipe', timeout: 15_000 },
    );
    applied = Number.parseInt(out.toString().trim(), 10);
  } catch {
    // No bookkeeping table at all: nothing has ever been migrated here.
    applied = 0;
  }

  if (Number.isNaN(applied) || applied >= expected) return;

  throw new HarnessRefusal(
    `${describe(url)} is behind the schema: ${String(applied)} of ` +
      `${String(expected)} migrations applied.\n\n` +
      '  Every query touching a column from the missing migrations fails, which\n' +
      '  reads as dozens of unrelated test failures rather than as one stale\n' +
      '  database.\n\n' +
      '    npm run db:migrate\n',
  );
}

/**
 * Refuse to photograph a server that is not the build on disk.
 *
 * `.next/BUILD_ID` changes on every build, and `next start` serves that build's
 * assets under `/_next/static/<BUILD_ID>/`. A server running a different build
 * answers **404** there while still answering 200 on every page — which is the
 * whole point, because a page 200 is what fooled the readiness probe.
 *
 * Enforced only against a local base. A preview or production URL is legitimately
 * a different build from whatever happens to be in this working tree, and there
 * is no `.next` to compare against on a machine that did not build it.
 */
export async function assertServerIsOurBuild(base: string): Promise<void> {
  if (!isLocal(base)) return;

  if (!existsSync('.next/BUILD_ID')) {
    throw new HarnessRefusal(
      'No .next/BUILD_ID, so the server on ' +
        `${base} cannot be shown to be this working tree's build.\n\n` +
        '    npm run build\n\n' +
        '  A production build is what the sweep is specified against — `next dev`\n' +
        '  renders differently and its overlay is not product UI.',
    );
  }

  const id = readFileSync('.next/BUILD_ID', 'utf8').trim();
  const probe = `${base}/_next/static/${id}/_ssgManifest.js`;

  let status: number;
  try {
    status = (await fetch(probe)).status;
  } catch {
    throw new HarnessRefusal(`Nothing is answering on ${base}.\n\n${START_HINT}`);
  }

  if (status !== 200) {
    throw new HarnessRefusal(
      `The server on ${base} is serving a different build.\n\n` +
        `  This tree built ${id}, and that build's assets answer 404 there, so the\n` +
        '  sweep would photograph the wrong code and report on this one.\n\n' +
        '  Almost always a stale server: the replacement died on EADDRINUSE and the\n' +
        '  old one kept the port. A page still returns 200, which is why readiness\n' +
        '  alone never caught this.\n\n' +
        START_HINT,
    );
  }
}

/**
 * Refuse to sweep a database the test suite truncates.
 *
 * `visual-qa.yml` and `ci.yml` have always used separate databases. This is that
 * separation, locally, as a mechanism rather than a convention — `resetDatabase()`
 * is destructive and does not ask who else is using the tables.
 */
export function assertVisualDatabaseIsolated(env: Record<string, string | undefined>): void {
  const name = databaseName(env['DATABASE_URL']);
  if (name === undefined || !TEST_DATABASES.has(name)) return;

  throw new HarnessRefusal(
    `The sweep is pointed at "${name}", which the test suite truncates.\n\n` +
      '  `resetDatabase()` empties these tables between test files, so a sweep\n' +
      '  sharing them photographs whatever the last test left behind — or signs in\n' +
      '  as a manager who is no longer seated. CI has always kept these apart.\n\n' +
      `    npm run db:visual\n` +
      `    export DATABASE_URL="postgres://tonys@localhost:5432/${VISUAL_DATABASE}"\n`,
  );
}

const START_HINT =
  '  Start it, and stop any predecessor by port rather than by name — the\n' +
  '  process is `next-server`, not `next start`, so `pkill -f "next start"`\n' +
  '  silently matches nothing (and `pkill -f next-server` matches your own shell):\n\n' +
  '    fuser -k -n tcp 3111\n' +
  '    npx next start -p 3111';

/** A refusal the operator can act on, printed without a stack trace. */
export class HarnessRefusal extends Error {}

function isLocal(base: string): boolean {
  try {
    const { hostname } = new URL(base);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

/** Never the whole URL: it can carry a password. */
function describe(url: string): string {
  const name = databaseName(url);
  return name === undefined ? 'the database' : `"${name}"`;
}
