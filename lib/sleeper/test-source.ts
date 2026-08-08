import { createFixtureSource } from './fixtures';
import { type SleeperEndpoint } from './endpoints';
import { type SleeperFetchResult, type SleeperSource } from './transport';

/**
 * A Sleeper that is part way through the 2026 season.
 *
 * ## Why this is written rather than recorded
 *
 * Every other Sleeper in this repository is a recording, which is the intended
 * design (`16 §12`) and is what makes the suite offline and byte-stable. There
 * is no recording of a season **in motion**, and there cannot be one yet: the
 * 2026 fixture is a preseason photograph with no matchups directory at all, and
 * 2024 and 2025 are finished seasons whose books are shut.
 *
 * Two defects are only visible against a season in motion — a week arriving that
 * the database has never seen, and a stale read losing to a fresh one — so this
 * is the smallest thing that can show them.
 *
 * ## It is a recording everywhere it can be
 *
 * League, users and both brackets come from the **real** fixtures, so managers,
 * roster ids, co-owners and the mapping file behave exactly as they do in
 * production. Only the two payloads a played week actually changes are
 * synthesised: the rosters' standings, and the week's matchups.
 *
 * Beyond `played`, matchups answer `[]` — which is what the live API does for a
 * week that has not happened, measured rather than assumed. That is what keeps
 * the read from running ahead of the season.
 *
 * Lives in `lib/` rather than beside one test because two suites need it and a
 * second copy would be a second definition of what a season in progress looks
 * like. Nothing in `app/` imports it, so it is not in the client bundle — the
 * same arrangement as `lib/db/test-helpers.ts`.
 */

export const IN_PROGRESS_LEAGUE = '1385016656425668608';

/** Any moment after the fixtures' own capture, so a live read reads as fresher. */
export const IN_PROGRESS_CAPTURE = new Date('2026-10-13T09:00:00Z');

export interface InProgressOptions {
  /** Weeks that have been played. Beyond this, matchups answer `[]`. */
  readonly played: number;
  /** When this read happened. Defaults to a Tuesday well after the recording. */
  readonly capturedAt?: Date;
  /** Points for roster 1 in each played week, so a test can name a score. */
  readonly pointsForRosterOne?: readonly number[];
}

export type InProgressSource = SleeperSource & {
  /** Every endpoint asked for, in order. The request budget, observable. */
  readonly requests: readonly SleeperEndpoint[];
};

export function seasonInProgress(options: InProgressOptions): InProgressSource {
  const underlying = createFixtureSource();
  const requests: SleeperEndpoint[] = [];
  const capturedAt = options.capturedAt ?? IN_PROGRESS_CAPTURE;

  /**
   * Deterministic, distinct, nothing near a tie, and always positive.
   *
   * Descending in roster id, so the **lower** id of each pair wins — which makes
   * roster 1 a manager with a perfect record and gives a standings assertion one
   * seat to name.
   */
  function points(rosterId: number, week: number): number {
    if (rosterId === 1 && options.pointsForRosterOne !== undefined) {
      return options.pointsForRosterOne[week - 1] ?? 100;
    }
    return 120 - rosterId * 3 + week;
  }

  function matchupRows(week: number): unknown[] {
    return Array.from({ length: 10 }, (_, index) => {
      const rosterId = index + 1;
      return {
        roster_id: rosterId,
        matchup_id: Math.ceil(rosterId / 2),
        points: points(rosterId, week),
        custom_points: null,
        starters: [],
        players: [],
      };
    });
  }

  /**
   * The standings Sleeper would report, derived from the same games.
   *
   * Computed rather than stated, because `reconcileSeason` compares the two and
   * a hand-written record that disagreed with its own weeks would mark every
   * game `disputed` — a fixture defect that would read as a product one.
   */
  function standingsAfter(played: number): { wins: number; losses: number; pointsFor: number }[] {
    return Array.from({ length: 10 }, (_, index) => {
      const rosterId = index + 1;
      let wins = 0;
      let pointsFor = 0;
      for (let week = 1; week <= played; week++) {
        const opponent = rosterId % 2 === 1 ? rosterId + 1 : rosterId - 1;
        const mine = points(rosterId, week);
        pointsFor += mine;
        if (mine > points(opponent, week)) wins += 1;
      }
      return { wins, losses: played - wins, pointsFor: Math.round(pointsFor * 100) / 100 };
    });
  }

  return {
    label: `in-progress(week ${String(options.played)})`,
    requests,

    async fetch(endpoint: SleeperEndpoint): Promise<SleeperFetchResult> {
      requests.push(endpoint);

      if (endpoint.kind === 'matchups' && endpoint.leagueId === IN_PROGRESS_LEAGUE) {
        return {
          kind: 'ok',
          endpoint,
          payload: endpoint.week <= options.played ? matchupRows(endpoint.week) : [],
          status: 200,
          fetchedAt: capturedAt,
        };
      }

      const result = await underlying.fetch(endpoint);

      if (
        endpoint.kind === 'rosters' &&
        endpoint.leagueId === IN_PROGRESS_LEAGUE &&
        result.kind === 'ok'
      ) {
        const rows = result.payload as { roster_id: number; settings: Record<string, unknown> }[];
        const table = standingsAfter(options.played);
        return {
          ...result,
          fetchedAt: capturedAt,
          payload: rows.map((row) => {
            const record = table[row.roster_id - 1];
            return {
              ...row,
              settings: {
                ...row.settings,
                wins: record?.wins ?? 0,
                losses: record?.losses ?? 0,
                fpts: Math.trunc(record?.pointsFor ?? 0),
                fpts_decimal: Math.round(((record?.pointsFor ?? 0) % 1) * 100),
              },
            };
          }),
        };
      }

      // Everything else passes through, restamped so one capture time governs
      // the whole read — which is what `persistChain`'s staleness guard reads.
      return { ...result, fetchedAt: capturedAt };
    },
  };
}
