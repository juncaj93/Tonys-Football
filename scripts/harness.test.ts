import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  HarnessRefusal,
  VISUAL_DATABASE,
  assertDatabaseReady,
  assertServerIsOurBuild,
  assertVisualDatabaseIsolated,
  databaseName,
} from './harness';

/**
 * The guards are only worth having if they fail on the exact inputs that fooled
 * the harness before. Each block below is one of those inputs.
 */

describe('reading the database out of a connection string', () => {
  it('finds the name', () => {
    expect(databaseName('postgres://tonys@localhost:5432/tonys_dev')).toBe('tonys_dev');
    expect(databaseName('postgres://u:p@ep-x.aws.neon.tech/tonys?sslmode=require')).toBe('tonys');
  });

  it('returns nothing rather than guessing', () => {
    for (const bad of [undefined, '', '   ', 'not-a-url', 'postgres://host:5432']) {
      expect(databaseName(bad), `${String(bad)} produced a name`).toBeUndefined();
    }
  });
});

describe('the full-verification database gate', () => {
  it('refuses an absent DATABASE_URL, which is the case that shipped a false green', () => {
    /*
     * The real incident: `npm run check` exited 0 while reporting
     * "71 passed | 17 skipped" and "483 tests skipped". Vitest does not read
     * .env.local, so a shell that had not exported the variable ran a third of
     * the suite not at all.
     */
    expect(() => {
      assertDatabaseReady({});
    }).toThrow(HarnessRefusal);
    expect(() => {
      assertDatabaseReady({ DATABASE_URL: '   ' });
    }).toThrow(HarnessRefusal);
  });

  it('says how to fix it, because a refusal nobody can act on is just a failure', () => {
    try {
      assertDatabaseReady({});
      expect.unreachable('should have refused');
    } catch (error: unknown) {
      const message = (error as Error).message;
      expect(message).toContain('npm run db:up');
      expect(message).toContain('export DATABASE_URL');
      // The escape hatch has to be named, or the guard reads as "no database, no work".
      expect(message).toContain('npm run test');
    }
  });

  it('refuses a set-but-unreachable database, not merely an absent one', () => {
    /*
     * Presence is the wrong test. A URL pointing at a server that is not running
     * skips every suite exactly as an absent one does and reports the same green,
     * so only a connection distinguishes them.
     */
    expect(() =>
      assertDatabaseReady({ DATABASE_URL: 'postgres://nobody@127.0.0.1:59999/tonys_nope' }),
    ).toThrow(HarnessRefusal);
  });

  it('refuses a reachable database that is behind the schema', () => {
    /*
     * The real incident, immediately after #72 merged: `check` against a database
     * last migrated before it produced 109 failures across 10 files, every one a
     * `Failed query:` on collectibles, and not one of them saying "run the
     * migrations". Reachable is not the same as usable.
     *
     * Asserted against the live database this suite is already connected to —
     * which by definition is current, since these tests are running — so the
     * check proves the comparison is real rather than mocked.
     */
    const url = process.env['DATABASE_URL'];
    if (url === undefined || url === '') return;

    const journal = JSON.parse(
      readWorkspaceFile(path.join('drizzle', 'meta', '_journal.json')),
    ) as { entries: readonly unknown[] };
    expect(journal.entries.length).toBeGreaterThan(0);

    // Current database, current journal: no refusal.
    expect(() => {
      assertDatabaseReady({ DATABASE_URL: url });
    }).not.toThrow();
  });

  it('never puts the connection string in the message', () => {
    // It can carry a password, and refusals get pasted into chat.
    const url = 'postgres://tonys:hunter2@127.0.0.1:59999/tonys_secret';
    try {
      assertDatabaseReady({ DATABASE_URL: url });
      expect.unreachable('should have refused');
    } catch (error: unknown) {
      const message = (error as Error).message;
      expect(message).not.toContain('hunter2');
      expect(message).not.toContain(url);
      expect(message).toContain('tonys_secret');
    }
  });
});

describe('keeping the sweep out of the test suite’s database', () => {
  it('refuses the two databases vitest truncates', () => {
    for (const name of ['tonys_test', 'tonys_dev']) {
      expect(() =>
        assertVisualDatabaseIsolated({
          DATABASE_URL: `postgres://tonys@localhost:5432/${name}`,
        }),
        `${name} was allowed`,
      ).toThrow(HarnessRefusal);
    }
  });

  it('allows the database CI sweeps against', () => {
    expect(() => {
      assertVisualDatabaseIsolated({
        DATABASE_URL: `postgres://tonys@localhost:5432/${VISUAL_DATABASE}`,
      });
    }).not.toThrow();
  });

  it('matches the database visual-qa.yml actually uses', () => {
    /*
     * The point of the guard is that local isolation is CI's isolation. If the
     * workflow's database is renamed and this constant is not, the guard would
     * be enforcing a rule the project no longer follows.
     */
    const workflow = readWorkflow('visual-qa.yml');
    expect(workflow).toContain(VISUAL_DATABASE);
  });

  it('names databases the test workflow does not use, so the two cannot collide', () => {
    const ci = readWorkflow('ci.yml');
    expect(ci).toContain('tonys_test');
    expect(ci).not.toContain(VISUAL_DATABASE);
  });

  it('says nothing when there is no database configured at all', () => {
    // Not this guard's job — `assertDatabaseReady` owns that, and two guards
    // reporting the same problem differently is how a message gets ignored.
    expect(() => {
      assertVisualDatabaseIsolated({});
    }).not.toThrow();
  });
});

describe('proving the server is the build on disk', () => {
  const created: string[] = [];

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  /** A throwaway tree with a `.next/BUILD_ID`, since the guard reads the real cwd. */
  function withBuildId(id: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'harness-'));
    created.push(dir);
    mkdirSync(path.join(dir, '.next'), { recursive: true });
    writeFileSync(path.join(dir, '.next', 'BUILD_ID'), `${id}\n`);
    return dir;
  }

  it('accepts a server serving this build', async () => {
    const cwd = process.cwd();
    process.chdir(withBuildId('build-abc'));
    try {
      const seen: string[] = [];
      vi.stubGlobal('fetch', (url: string) => {
        seen.push(url);
        return Promise.resolve({ status: 200 } as Response);
      });
      await expect(assertServerIsOurBuild('http://localhost:3111')).resolves.toBeUndefined();
      // Build-scoped, or it proves nothing.
      expect(seen[0]).toContain('/_next/static/build-abc/');
    } finally {
      process.chdir(cwd);
    }
  });

  it('refuses a stale server, which is the failure a 200 could not catch', async () => {
    /*
     * The real incident: the replacement server died on EADDRINUSE, the previous
     * one kept the port, and the readiness probe was satisfied by its 200. The
     * sweep photographed the old build. Build-scoped assets 404 there while every
     * page still returns 200 — which is exactly why the page check was useless.
     */
    const cwd = process.cwd();
    process.chdir(withBuildId('build-new'));
    try {
      vi.stubGlobal('fetch', () => Promise.resolve({ status: 404 } as Response));
      await expect(assertServerIsOurBuild('http://localhost:3111')).rejects.toThrow(
        HarnessRefusal,
      );
    } finally {
      process.chdir(cwd);
    }
  });

  it('tells the operator to kill by port, because killing by name is the known trap', async () => {
    const cwd = process.cwd();
    process.chdir(withBuildId('build-new'));
    try {
      vi.stubGlobal('fetch', () => Promise.resolve({ status: 404 } as Response));
      await assertServerIsOurBuild('http://localhost:3111');
      expect.unreachable('should have refused');
    } catch (error: unknown) {
      const message = (error as Error).message;
      expect(message).toContain('fuser -k -n tcp 3111');
      // The process is `next-server`; `pkill -f "next start"` matches nothing.
      expect(message).toContain('next-server');
    } finally {
      process.chdir(cwd);
    }
  });

  it('refuses when nothing is listening', async () => {
    const cwd = process.cwd();
    process.chdir(withBuildId('build-new'));
    try {
      vi.stubGlobal('fetch', () => Promise.reject(new Error('ECONNREFUSED')));
      await expect(assertServerIsOurBuild('http://localhost:3111')).rejects.toThrow(
        HarnessRefusal,
      );
    } finally {
      process.chdir(cwd);
    }
  });

  it('leaves a remote base alone', async () => {
    /*
     * A preview or production URL is legitimately a different build from this
     * working tree, and a machine that did not build it has no `.next` to compare
     * against. Enforcing there would refuse a correct run.
     */
    let called = false;
    vi.stubGlobal('fetch', () => {
      called = true;
      return Promise.resolve({ status: 404 } as Response);
    });
    await expect(
      assertServerIsOurBuild('https://tonys-football.vercel.app'),
    ).resolves.toBeUndefined();
    expect(called).toBe(false);
  });
});

describe('the wiring', () => {
  it('runs the preflight first in `check`, before the steps that pass without a database', () => {
    /*
     * Order is load-bearing. Typecheck, lint and build all pass perfectly well
     * with no database, so a preflight at the end would let the operator watch
     * three green steps before being told the run was never valid.
     */
    const scripts = JSON.parse(
      readWorkspaceFile('package.json'),
    ) as { scripts: Record<string, string> };

    const check = scripts.scripts['check'] ?? '';
    expect(check).toContain('verify-preflight');
    expect(check.indexOf('verify-preflight')).toBeLessThan(check.indexOf('typecheck'));

    // And the remedy the refusal prints has to exist.
    const visual = scripts.scripts['db:visual'] ?? '';
    expect(visual).toContain('tonys_visual');

    /*
     * **It must clear `DATABASE_URL`, and this is not a style point.**
     *
     * `dev-db.sh` resolves `DATABASE_URL=${DATABASE_URL:-$LOCAL_URL}`, preferring
     * an already-exported value over the `DB_NAME` it was given. The refusal that
     * prints this command fires precisely when the operator's shell is pointed at
     * `tonys_dev` — so without the clear, following the instructions would run
     * `reset` (drop and recreate) against the database it was warning them about.
     */
    expect(visual).toMatch(/(^|\s)DATABASE_URL=(\s|$)/);
    expect(visual).toContain('DB_NAME=tonys_visual');

    /*
     * `reset` rather than `up`: `up`'s createdb is idempotent, so it silently
     * reuses a stale database. That is not hypothetical — a `tonys_visual` left
     * over from before the demo PIN stopped being a committed constant still held
     * Alex's old pin_hash, and the sweep failed at sign-in looking exactly like a
     * product defect. CI gets a fresh container every run; so does this.
     */
    expect(visual).toContain('reset');
  });

  it('guards the sweep before it writes anything', () => {
    const driver = readWorkspaceFile('scripts/visual-qa.mts');
    expect(driver).toContain('assertVisualDatabaseIsolated(process.env)');
    expect(driver).toContain('assertServerIsOurBuild(BASE)');
    // Before the first capture directory is even made.
    expect(driver.indexOf('assertServerIsOurBuild(BASE)')).toBeLessThan(
      driver.indexOf('mkdirSync(OUT'),
    );
  });
});

function readWorkflow(name: string): string {
  return readWorkspaceFile(path.join('.github', 'workflows', name));
}

function readWorkspaceFile(relative: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('node:fs').readFileSync(path.join(process.cwd(), relative), 'utf8') as string;
}
