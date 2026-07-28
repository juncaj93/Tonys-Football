import { describe, expect, it } from 'vitest';

import {
  clientIp,
  evaluateLockout,
  FAILURE_LOOKBACK_MS,
  hashIp,
  LOCKOUT_BASE_MS,
  lockoutMessage,
  MAX_ATTEMPTS,
  MAX_LOCKOUT_MS,
} from './rate-limit';

const NOW = new Date('2026-07-28T12:00:00Z');

function failuresAgo(...minutes: readonly number[]) {
  return minutes.map((m) => ({ occurredAt: new Date(NOW.getTime() - m * 60_000) }));
}

describe('lockout', () => {
  it('lets an honest mistake through', () => {
    const decision = evaluateLockout(failuresAgo(1, 2, 3), NOW);
    expect(decision.locked).toBe(false);
    expect(decision.remaining).toBe(MAX_ATTEMPTS - 3);
  });

  it('locks on the fifth failure inside the window', () => {
    const decision = evaluateLockout(failuresAgo(1, 2, 3, 4, 5), NOW);
    expect(decision.locked).toBe(true);
    expect(decision.remaining).toBe(0);
  });

  it('forgets failures older than the lookback', () => {
    const stale = FAILURE_LOOKBACK_MS / 60_000 + 1;
    const decision = evaluateLockout(failuresAgo(stale, stale + 1, stale + 2, stale + 3, stale + 4), NOW);
    expect(decision.locked).toBe(false);
    expect(decision.remaining).toBe(MAX_ATTEMPTS);
  });

  it('doubles the wait for each failure past the threshold', () => {
    const five = evaluateLockout(failuresAgo(0, 1, 2, 3, 4), NOW);
    const six = evaluateLockout(failuresAgo(0, 1, 2, 3, 4, 5), NOW);
    const seven = evaluateLockout(failuresAgo(0, 1, 2, 3, 4, 5, 6), NOW);

    const wait = (until: Date | null): number => (until?.getTime() ?? 0) - NOW.getTime();

    expect(wait(five.until)).toBeCloseTo(LOCKOUT_BASE_MS, -3);
    expect(wait(six.until)).toBeCloseTo(LOCKOUT_BASE_MS * 2, -3);
    expect(wait(seven.until)).toBeCloseTo(LOCKOUT_BASE_MS * 4, -3);
  });

  /**
   * The bug this was written for: counting failures over the same fifteen
   * minutes that forms the first penalty makes every later penalty
   * unreachable. The failures age out before the doubled wait is served, the
   * count drops below five, and the door reopens — so a grinder is held for
   * fifteen minutes however many times they have tried.
   */
  it('actually holds a sixth failure past the first fifteen minutes', () => {
    const sixteenMinutesLater = new Date(NOW.getTime() + 16 * 60_000);
    const decision = evaluateLockout(failuresAgo(0, 1, 2, 3, 4, 5), sixteenMinutesLater);

    expect(decision.locked).toBe(true);
    expect((decision.until?.getTime() ?? 0) - sixteenMinutesLater.getTime()).toBeGreaterThan(0);
  });

  it('caps the wait so a manager is never locked out for a day', () => {
    const many = failuresAgo(...Array.from({ length: 20 }, (_, index) => index));
    const decision = evaluateLockout(many, NOW);
    expect((decision.until?.getTime() ?? 0) - NOW.getTime()).toBeLessThanOrEqual(MAX_LOCKOUT_MS);
  });

  /**
   * The lockout is computed, never stored, so it cannot outlive the failures
   * that caused it. Once the penalty has elapsed the manager gets an attempt
   * back without anything having to unlock them.
   */
  it('expires on its own once the penalty has been served', () => {
    // Five failures, fourteen minutes ago: fifteen-minute penalty, nearly up.
    expect(evaluateLockout(failuresAgo(14, 14, 14, 14, 14), NOW).locked).toBe(true);

    // The same five, twenty minutes on. Still counted — one more mistake locks
    // the door again, for twice as long — but the manager gets an attempt.
    const later = evaluateLockout(failuresAgo(20, 20, 20, 20, 20), NOW);
    expect(later.locked).toBe(false);
    expect(later.remaining).toBe(1);
  });

  it('says how long to wait in minutes, then hours', () => {
    expect(lockoutMessage(new Date(NOW.getTime() + 15 * 60_000), NOW)).toMatch(/15 minutes/);
    expect(lockoutMessage(new Date(NOW.getTime() + 2 * 60 * 60_000), NOW)).toMatch(/2 hours/);
  });
});

describe('client address', () => {
  /**
   * `x-forwarded-for` is a client-controllable list. The platform's proxy
   * appends its own view LAST, so trusting the first entry would let anyone
   * reset their own rate limit by sending a header.
   */
  it('takes the last hop, not the first', () => {
    const headers = new Headers({ 'x-forwarded-for': '10.0.0.1, 203.0.113.7' });
    expect(clientIp(headers)).toBe('203.0.113.7');
  });

  it('prefers x-real-ip when the platform sets it', () => {
    const headers = new Headers({
      'x-real-ip': '203.0.113.9',
      'x-forwarded-for': '10.0.0.1',
    });
    expect(clientIp(headers)).toBe('203.0.113.9');
  });

  it('reports nothing rather than guessing', () => {
    expect(clientIp(new Headers())).toBeNull();
    expect(clientIp(new Headers({ 'x-forwarded-for': '  ' }))).toBeNull();
  });

  it('hashes rather than storing the address', () => {
    process.env['SESSION_SECRET'] = 'test-secret';
    const hash = hashIp('203.0.113.7');

    expect(hash).not.toContain('203.0.113.7');
    expect(hashIp('203.0.113.7')).toBe(hash);
    expect(hashIp('203.0.113.8')).not.toBe(hash);

    // Unattributable attempts share one bucket rather than each getting a free
    // allowance.
    expect(hashIp(null)).toBe(hashIp('   '));
    delete process.env['SESSION_SECRET'];
  });
});
