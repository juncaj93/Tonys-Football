import { describe, expect, it } from 'vitest';

import {
  DemoRefused,
  assertDemoAllowed,
  assertDemoWritesAllowed,
  isLocalDatabaseUrl,
} from './guard';

/**
 * Guard 3: the demo tooling refuses any database that is not local.
 *
 * The hole this closes is specific. `VERCEL_ENV` is set *by Vercel*, so a demo
 * command run from a laptop with `DATABASE_URL` pointed at production has no
 * `VERCEL_ENV` at all — guard 1 passes, and a demo seat gets created in a real
 * league. Guard 2 stops that touching a real manager, but a demo seat is itself
 * a credential: known PIN, and it can carry `isAdmin`.
 *
 * So these tests are about the **target**, not the environment around it.
 */

const LOCAL = 'postgres://tonys:local_dev_only@localhost:5432/tonys_dev';
const OPTED_IN = { DEMO_FIXTURES: '1', DATABASE_URL: LOCAL } as const;

describe('which databases count as local', () => {
  it('accepts localhost', () => {
    expect(isLocalDatabaseUrl(LOCAL)).toBe(true);
  });

  it('accepts 127.0.0.1', () => {
    expect(isLocalDatabaseUrl('postgres://u:p@127.0.0.1:5432/db')).toBe(true);
  });

  it('accepts IPv6 loopback', () => {
    expect(isLocalDatabaseUrl('postgres://u:p@[::1]:5432/db')).toBe(true);
  });

  it('rejects a Neon hostname', () => {
    expect(
      isLocalDatabaseUrl('postgres://u:p@ep-example-123.us-east-2.aws.neon.tech/db?sslmode=require'),
    ).toBe(false);
  });

  it('rejects a generic remote Postgres host', () => {
    expect(isLocalDatabaseUrl('postgres://u:p@db.internal.example.com:5432/tonys')).toBe(false);
  });

  it('rejects 0.0.0.0, which means every interface rather than this machine', () => {
    expect(isLocalDatabaseUrl('postgres://u:p@0.0.0.0:5432/db')).toBe(false);
  });

  it('fails closed on anything it cannot parse', () => {
    // A URL this code does not understand is not one it may assume is safe.
    for (const bad of [
      undefined,
      '',
      '   ',
      'not-a-url',
      'postgres://',
      '/var/run/postgresql',
      'postgres:///db?host=/tmp',
      'localhost:5432/db',
    ]) {
      expect(isLocalDatabaseUrl(bad), `${String(bad)} was treated as local`).toBe(false);
    }
  });

  it('is not fooled by a hostname that merely contains "localhost"', () => {
    expect(isLocalDatabaseUrl('postgres://u:p@localhost.evil.example.com/db')).toBe(false);
  });
});

describe('the write guard', () => {
  it('allows an opted-in local run', () => {
    expect(() => {
      assertDemoWritesAllowed({ ...OPTED_IN });
    }).not.toThrow();
  });

  it('refuses a remote database even when everything else is right', () => {
    expect(() =>
      assertDemoWritesAllowed({
        DEMO_FIXTURES: '1',
        DATABASE_URL: 'postgres://u:p@ep-example-123.aws.neon.tech/db',
      }),
    ).toThrow(DemoRefused);
  });

  it('refuses when DATABASE_URL is absent entirely', () => {
    /*
     * The laptop case, and the whole reason this guard exists: no `VERCEL_ENV`,
     * no `DATABASE_URL` in the parameter — nothing for an environment check to
     * catch. A demo seat carries a PIN, so silence must not mean yes.
     */
    expect(() => {
      assertDemoWritesAllowed({ DEMO_FIXTURES: '1' });
    }).toThrow(DemoRefused);
  });

  it('still refuses production, as defence in depth', () => {
    expect(() =>
      assertDemoWritesAllowed({
        VERCEL_ENV: 'production',
        DEMO_FIXTURES: '1',
        DATABASE_URL: LOCAL,
      }),
    ).toThrow(DemoRefused);
  });

  it('still requires the opt-in', () => {
    expect(() => {
      assertDemoWritesAllowed({ DATABASE_URL: LOCAL });
    }).toThrow(DemoRefused);
  });
});

describe('the render guard is deliberately not this strict', () => {
  it('still allows a preview deployment, which uses a remote sandbox database', () => {
    /*
     * The regression this split prevents. Five callers of `assertDemoAllowed`
     * render throwaway views and write nothing — board states, Slice editions,
     * character previews, reveal previews, the empty desk — and they are meant
     * to work on a Vercel preview, whose database is remote by definition.
     */
    expect(() => {
      assertDemoAllowed({
        VERCEL_ENV: 'preview',
        DEMO_FIXTURES: '1',
        DATABASE_URL: 'postgres://u:p@ep-example-123.aws.neon.tech/db',
      });
    }).not.toThrow();
  });

  it('but a write on that same preview is refused', () => {
    expect(() =>
      assertDemoWritesAllowed({
        VERCEL_ENV: 'preview',
        DEMO_FIXTURES: '1',
        DATABASE_URL: 'postgres://u:p@ep-example-123.aws.neon.tech/db',
      }),
    ).toThrow(DemoRefused);
  });
});
