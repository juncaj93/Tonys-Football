import { afterEach, describe, expect, it } from 'vitest';

import {
  clearClock,
  isClockOverridden,
  now,
  nowMs,
  setClockSource,
  setFixedClock,
} from './clock';

afterEach(() => {
  clearClock();
});

describe('now()', () => {
  it('returns real time when not overridden', () => {
    const before = Date.now();
    const result = now().getTime();
    const after = Date.now();

    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });

  it('returns the pinned instant when fixed', () => {
    setFixedClock('2026-09-15T09:00:00.000Z');
    expect(now().toISOString()).toBe('2026-09-15T09:00:00.000Z');
  });

  it('returns a fresh Date each call so callers cannot corrupt the clock', () => {
    setFixedClock('2026-09-15T09:00:00.000Z');

    const first = now();
    first.setFullYear(1999);

    expect(now().toISOString()).toBe('2026-09-15T09:00:00.000Z');
    expect(first).not.toBe(now());
  });

  it('accepts a Date, an ISO string, or epoch millis', () => {
    const expected = '2026-11-24T05:00:00.000Z';

    setFixedClock(new Date(expected));
    expect(now().toISOString()).toBe(expected);

    setFixedClock(expected);
    expect(now().toISOString()).toBe(expected);

    setFixedClock(Date.parse(expected));
    expect(now().toISOString()).toBe(expected);
  });

  it('rejects an invalid instant rather than silently pinning to NaN', () => {
    expect(() => setFixedClock('not a date')).toThrow(TypeError);
    expect(isClockOverridden()).toBe(false);
  });
});

describe('nowMs()', () => {
  it('agrees with now()', () => {
    setFixedClock('2026-09-15T09:00:00.000Z');
    expect(nowMs()).toBe(now().getTime());
  });
});

describe('setClockSource()', () => {
  it('supports an advancing source, as the season replay needs', () => {
    // One week per call, standing in for a 17-week replay.
    const start = Date.parse('2026-09-08T05:00:00.000Z');
    const week = 7 * 24 * 60 * 60 * 1000;
    let tick = 0;
    setClockSource(() => new Date(start + week * tick++));

    expect(now().toISOString()).toBe('2026-09-08T05:00:00.000Z');
    expect(now().toISOString()).toBe('2026-09-15T05:00:00.000Z');
    expect(now().toISOString()).toBe('2026-09-22T05:00:00.000Z');
  });
});

describe('clearClock()', () => {
  it('restores real time', () => {
    setFixedClock('2026-09-15T09:00:00.000Z');
    expect(isClockOverridden()).toBe(true);

    clearClock();

    expect(isClockOverridden()).toBe(false);
    expect(now().getFullYear()).toBeGreaterThanOrEqual(2026);
  });
});
