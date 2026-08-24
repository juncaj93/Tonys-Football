import { now } from '@/lib/clock';

/** The shop's real-world clock: Michigan, where the league lives. */
export const LEAGUE_TIME_ZONE = 'America/New_York';

/** The three exterior states painted over existing window glass. */
export type ExteriorLight = 'morning' | 'day' | 'dusk' | 'night';

/**
 * The light outside Tony's windows at one instant.
 *
 * This is deliberately a small, readable clock rather than weather simulation:
 * the room receives bright morning/daylight, a warm early evening, or a calm
 * starry night. It follows Michigan's local wall clock (and its DST changes),
 * never the data-centre's timezone.
 */
export function exteriorLight(at: Date = now()): ExteriorLight {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: LEAGUE_TIME_ZONE,
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .find((part) => part.type === 'hour')?.value,
  );

  if (!Number.isInteger(hour)) throw new Error('could not read the league hour');
  if (hour >= 6 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 18) return 'day';
  if (hour >= 18 && hour < 21) return 'dusk';
  return 'night';
}
