import { afterEach, describe, expect, it } from 'vitest';

import { clearClock, setFixedClock } from '@/lib/clock';

import { describeFinish } from './receipt';
import { easternDaysBetween, KICKOFF_2026, seasonClock } from './season';

afterEach(() => {
  clearClock();
});

describe('counting the days', () => {
  /**
   * A15 says "{days} days until it matters again". That is a claim about the
   * calendar on the wall, so it is counted on that calendar rather than in
   * 24-hour blocks — which would be off by one for most of any given day.
   */
  it('counts calendar days, not 24-hour blocks', () => {
    // Late on the 28th to early on the 29th is one day, not zero.
    expect(
      easternDaysBetween(new Date('2026-07-29T03:00:00Z'), new Date('2026-07-29T13:00:00Z')),
    ).toBe(1);
  });

  it('survives the daylight-saving change', () => {
    // 1 November 2026 to 8 November 2026 spans the US clock change. Seven days
    // in the calendar, 7×24+1 hours on the wall.
    expect(
      easternDaysBetween(new Date('2026-11-01T16:00:00Z'), new Date('2026-11-08T16:00:00Z')),
    ).toBe(7);
  });

  it('agrees with the season the roadmap plans around', () => {
    setFixedClock('2026-07-28T14:00:00Z');
    const clock = seasonClock();

    // `17 §1`: today is 28 July, the season starts around 10 September.
    expect(clock.phase).toBe('offseason');
    expect(clock.daysUntilKickoff).toBe(44);
  });

  it('moves to kickoff week inside the last seven days', () => {
    setFixedClock('2026-09-07T14:00:00Z');
    expect(seasonClock().phase).toBe('kickoff_week');
  });

  it('stops counting once the season is underway', () => {
    setFixedClock('2026-09-20T14:00:00Z');
    const clock = seasonClock();

    expect(clock.phase).toBe('in_season');
    // Null rather than a negative number: A15 is then skipped, not rendered
    // with "-9 days until it matters again".
    expect(clock.daysUntilKickoff).toBeNull();
  });

  it('reads the same instant however the clock is driven', () => {
    setFixedClock(KICKOFF_2026);
    expect(seasonClock().phase).toBe('in_season');
  });
});

describe('describing a finish', () => {
  it('names the top of the bracket', () => {
    expect(describeFinish(1, true)).toBe('Champion');
    expect(describeFinish(2, true)).toBe('Runner-up');
    expect(describeFinish(4, true)).toBe('4th place');
  });

  it('does not pretend a manager who missed January made it', () => {
    expect(describeFinish(null, false)).toBe('Missed the playoffs');
  });

  it('handles a playoff team the bracket gave no placement', () => {
    expect(describeFinish(null, true)).toBe('Made the playoffs');
  });
});
