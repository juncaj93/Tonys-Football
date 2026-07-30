import { describe, expect, it } from 'vitest';

import { DEMO_PREFIX, DemoRefused, assertDemoAllowed, assertDemoSeat, isDemoSeat } from './guard';

/**
 * The guards, exercised rather than described.
 *
 * `MANDATE §8` is a promise to the commissioner that demo tooling cannot reach
 * production data. A promise kept only by a comment is not kept.
 */

describe('where demo fixtures may run', () => {
  it('refuses production outright, opt-in or not', () => {
    expect(() => {
      assertDemoAllowed({ VERCEL_ENV: 'production', DEMO_FIXTURES: '1' });
    }).toThrow(DemoRefused);
  });

  it('refuses without the explicit opt-in', () => {
    // Unset is not permission. The common accident is a shell that still has
    // DATABASE_URL pointed somewhere real from an earlier command.
    expect(() => {
      assertDemoAllowed({});
    }).toThrow(DemoRefused);
    expect(() => {
      assertDemoAllowed({ DEMO_FIXTURES: '0' });
    }).toThrow(DemoRefused);
  });

  it('allows preview and local with the opt-in', () => {
    expect(() => {
      assertDemoAllowed({ VERCEL_ENV: 'preview', DEMO_FIXTURES: '1' });
    }).not.toThrow();
    expect(() => {
      assertDemoAllowed({ DEMO_FIXTURES: '1' });
    }).not.toThrow();
  });
});

describe('what demo fixtures may write to', () => {
  it('recognises a demo seat by its prefix', () => {
    expect(isDemoSeat(`${DEMO_PREFIX}alex`)).toBe(true);
    expect(isDemoSeat('1385016656425668608')).toBe(false);
  });

  it('refuses to write to a real manager', () => {
    // The guard that makes a mistake in the environment check survivable: even
    // pointed at the wrong database, the tool cannot address a league seat.
    expect(() => {
      assertDemoSeat('1385016656425668608');
    }).toThrow(DemoRefused);
  });

  it('names the seat it refused, because the message is the debugging', () => {
    expect(() => {
      assertDemoSeat('99887766');
    }).toThrow(/99887766/);
  });

  it('accepts the reserved seat', () => {
    expect(() => {
      assertDemoSeat(`${DEMO_PREFIX}showcase`);
    }).not.toThrow();
  });
});
