import { now } from '@/lib/clock';

/**
 * Where the league is in its year.
 *
 * `17 §1`: today is late July, the season starts around 10 September, and the
 * offseason is **an asset rather than an obstacle**. The shop being closed for
 * the summer is a designed state with its own dressing, not an empty screen
 * waiting for content.
 *
 * Kickoff is configuration, not a derived fact. Sleeper exposes no reliable
 * league start date in the preseason — `status` is `pre_draft` and there is no
 * week-one timestamp — so inventing one from the data would be exactly the
 * fabrication `16 §12` forbids. It lives here as a single named constant the
 * commissioner can move in one line when the schedule is final.
 */

/**
 * Thursday 10 September 2026, 8:20pm ET — the NFL's opening night, and the
 * date `17 §1` plans the season around.
 */
export const KICKOFF_2026 = new Date('2026-09-11T00:20:00Z');

export type SeasonPhase = 'offseason' | 'kickoff_week' | 'in_season';

export interface SeasonClock {
  readonly phase: SeasonPhase;
  /** Whole days from today until kickoff, in Eastern time. Null once underway. */
  readonly daysUntilKickoff: number | null;
  readonly kickoff: Date;
}

/**
 * Calendar days between two instants, counted in Eastern time.
 *
 * Not `(b - a) / 86400000`: that answers "how many 24-hour periods", which is
 * off by one for most of the day and wrong across a DST boundary. "44 days
 * until it matters again" is a claim about the calendar on the wall in
 * Michigan, so it is counted on that calendar.
 */
export function easternDaysBetween(from: Date, to: Date): number {
  return Math.round(
    (Date.parse(`${easternDayKey(to)}T00:00:00Z`) -
      Date.parse(`${easternDayKey(from)}T00:00:00Z`)) /
      86_400_000,
  );
}

/**
 * The calendar day in Michigan, as `YYYY-MM-DD`.
 *
 * The parlor already counts days on this calendar — a greeting turns over at
 * midnight Eastern rather than at whatever hour the server thinks it is — and
 * the seeded content draw needs the same day for the same reason: "one line per
 * manager per day" has to mean the day the manager is having.
 */
export function easternDayKey(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

export function seasonClock(kickoff: Date = KICKOFF_2026): SeasonClock {
  const at = now();
  const days = easternDaysBetween(at, kickoff);

  if (days > 7) return { phase: 'offseason', daysUntilKickoff: days, kickoff };
  if (days > 0) return { phase: 'kickoff_week', daysUntilKickoff: days, kickoff };
  return { phase: 'in_season', daysUntilKickoff: null, kickoff };
}
