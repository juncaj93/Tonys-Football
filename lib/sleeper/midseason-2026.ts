import { createFixtureSource } from './fixtures';
import { type SleeperEndpoint } from './endpoints';
import { type SleeperFetchResult, type SleeperSource } from './transport';

/**
 * The 2026 league, eight weeks in — the midseason rehearsal's one fixture.
 *
 * ## Why this exists beside `seasonInProgress` rather than replacing it
 *
 * `lib/sleeper/test-source.ts` answers a different question and answers it well:
 * *does a week arriving that the database has never seen get stored, closed and
 * paid.* Its scoreboard is a formula — `120 - rosterId * 3 + week` — so the lower
 * roster id always wins, five managers go 8–0 and five go 0–8, every margin is
 * the same size, and nobody is ever on a streak. That is the right shape for a
 * **week-one** question and it cannot express a midseason one.
 *
 * What only exists after seven finalized weeks is *accumulated* state, and the
 * defects that hide there are about accumulation: a record that resets or double
 * counts, a streak read across the wrong boundary, an order statistic computed
 * from the wrong sample, a standings tiebreak nobody exercised because every
 * record was identical. None of those can be seen against a formula that makes
 * every manager's season look the same.
 *
 * So this is a **written scoreboard**, not a generator. Forty games, eighty
 * scores, frozen as a literal, chosen so that the league it describes has the
 * shape a real league has by Halloween.
 *
 * ## It is a recording everywhere it can be
 *
 * The same arrangement `seasonInProgress` uses, for the same reason: league,
 * users and both brackets come from the **real** recorded fixtures, so managers,
 * roster ids, co-owners and the mapping file behave exactly as they do in
 * production. Only the two payloads a played week actually changes are
 * synthesised — the rosters' standings and the week's matchups — and the
 * standings are **computed from these same games** rather than stated, because
 * `reconcileSeason` compares the two and a hand-written record that disagreed
 * with its own weeks would mark real games `disputed`.
 *
 * ## What the league looks like, and why each piece is there
 *
 * Every one of these is a condition week one structurally cannot produce.
 *
 * | Manager | Through wk 7 | Why it is in the fixture |
 * |---|---|---|
 * | **Alex** (roster 1) | 2–5, **most points in the league** | The misleading record. Five of his seven games are losses by under three points while he outscores everybody. Any surface that reads *record* as *quality* says something false about him |
 * | **Matty B** (10) | 6–1, 900.20 PF | Top of the table on the **points-for tiebreak**, by 0.60 over Matt Lee. Two managers level on wins is the only way that tiebreak is ever executed |
 * | **Matt Lee** (9) | 6–1, 899.60 PF | The other half of the tiebreak |
 * | **Nathan** (2) | 5–2, **won four straight** | A live win streak entering week 8, which becomes five |
 * | **Zack** (4) | 2–5, **lost four straight** | A live losing streak, which becomes five |
 * | **Joe** (3) | 2–5, lost four straight | Snaps it in week 8 — a streak that *ends* is the case a streak reader gets wrong |
 * | **Brandon** (7) | 5–2, won three straight | The other side of week 8's heaviest game |
 * | Ryan (6) | 1–6 | Somebody has to be last |
 *
 * ## Week 8 itself
 *
 * Authored so the rehearsal has something to check rather than merely something
 * to run:
 *
 * - **Alex 139.15 – Cheese 139.57.** A 0.42 loss. The league's highest scorer
 *   loses his sixth close game.
 * - **Matty B 158.90 – Ryan 94.27.** A 64.63 blowout, and **158.90 is the
 *   season's highest single team-week** — it beats Alex's 149.24 from week 4,
 *   which is the number the rolling bounty was authored against.
 * - **Matt Lee (6–1) – Brandon (5–2).** Eleven combined wins, more than any
 *   other game on the card, and the only week-8 pairing whose result moves the
 *   top of the table.
 * - Nathan 126.70 – Nick 118.02, and Joe 112.85 – Zack 104.19.
 *
 * ## Three properties the scoreboard holds on purpose
 *
 * 1. **No repeat opponents.** Ten teams play a complete round robin in nine
 *    weeks, so weeks 1–8 contain forty distinct pairings and not one rematch.
 *    "Repeat opponents where the schedule permits" is satisfied by the schedule
 *    permitting none.
 * 2. **No ties.** A tie suppresses a fact (`lib/stats/facts.ts`), and a fixture
 *    that quietly suppressed half its own assertions would pass for the wrong
 *    reason. The tie *paths* are tested where they belong, in unit tests.
 * 3. **Nothing is 0–0.** `persistWeeks` drops an all-zero pairing as an unplayed
 *    fixture, so a 0–0 game here would silently vanish. {@link scheduledThrough}
 *    is how a caller asks for that state deliberately.
 */

export const MIDSEASON_LEAGUE = '1385016656425668608';
export const MIDSEASON_SEASON = 2026;

/** The week the rehearsal is about. */
export const REHEARSAL_WEEK = 8;

/** A Tuesday well after the recorded fixtures' own capture, so a read is fresh. */
export const MIDSEASON_CAPTURE = new Date('2026-10-27T09:00:00Z');

/** Roster id → the manager who holds that seat in 2026. Provenance only. */
export const MIDSEASON_SEATS: Readonly<Record<number, string>> = {
  1: 'Alex',
  2: 'Nathan',
  3: 'Joe',
  4: 'Zack',
  5: 'Nick',
  6: 'Ryan',
  7: 'Brandon',
  8: 'Cheese',
  9: 'Matt Lee',
  10: 'Matty B',
};

/** One game: roster A, A's points, roster B, B's points. */
export type MidseasonGame = readonly [number, number, number, number];

/**
 * The scoreboard, frozen.
 *
 * Position in the week's array is the `matchup_id`, which is what Sleeper's
 * payload carries and what pairs two roster rows into a game.
 */
export const MIDSEASON_GAMES: Readonly<Record<number, readonly MidseasonGame[]>> = {
  1: [
    [1, 138.62, 10, 139.44],
    [2, 117.4, 9, 131.06],
    [3, 108.55, 8, 104.22],
    [4, 119.83, 7, 118.9],
    [5, 114.71, 6, 99.35],
  ],
  2: [
    [1, 144.1, 2, 145.83],
    [3, 110.06, 10, 126.44],
    [4, 98.72, 9, 133.15],
    [5, 106.38, 8, 115.9],
    [6, 94.61, 7, 127.33],
  ],
  3: [
    [1, 136.88, 3, 137.9],
    [4, 121.47, 2, 116.02],
    [5, 109.24, 10, 124.81],
    [6, 101.55, 9, 128.63],
    [7, 130.09, 8, 112.76],
  ],
  4: [
    [1, 149.24, 4, 102.31],
    [5, 118.66, 3, 103.4],
    [6, 97.88, 2, 126.55],
    [7, 120.15, 10, 131.72],
    [8, 108.93, 9, 125.47],
  ],
  5: [
    [1, 140.55, 5, 143.26],
    [6, 110.42, 4, 99.15],
    [7, 126.88, 3, 99.71],
    [8, 113.3, 2, 129.94],
    [9, 122.6, 10, 134.08],
  ],
  6: [
    [1, 133.07, 6, 95.18],
    [7, 131.62, 5, 107.85],
    [8, 116.49, 4, 100.03],
    [9, 130.77, 3, 101.16],
    [10, 118.35, 2, 127.21],
  ],
  7: [
    [1, 142.19, 7, 144.71],
    [8, 111.58, 6, 93.44],
    [9, 127.92, 5, 105.6],
    [10, 125.36, 4, 97.29],
    [2, 124.83, 3, 100.48],
  ],
  /*
   * **Week 9 is the next week's card, and no test plays it.**
   *
   * Two things need a week the season has not reached. The
   * drafted-but-unplayed probe needs a real schedule to arrive as ten rows at
   * 0.00 — before this existed {@link scheduledMatchupRows} answered `[]` for
   * week 9 and the probe passed against an empty payload, which is a test
   * asserting nothing. And the board's featured matchup needs a card for the
   * week it is naming, which after week 8 closes is week 9.
   *
   * The scores are here so a Sunday photograph can be taken of it. Nothing
   * finalizes week 9, so they never reach a record.
   */
  8: [
    // The 0.42 loss.
    [1, 139.15, 8, 139.57],
    // Eleven combined wins — the heaviest game on the card.
    [9, 132.44, 7, 128.71],
    // The blowout, and the season's highest single score.
    [10, 158.9, 6, 94.27],
    [2, 126.7, 5, 118.02],
    [3, 112.85, 4, 104.19],
  ],
  9: [
    [1, 131.44, 9, 127.08],
    [10, 122.63, 8, 118.91],
    [2, 129.37, 7, 125.02],
    [3, 108.16, 6, 101.55],
    [4, 114.29, 5, 110.73],
  ],
};

/**
 * The last week this fixture has a scoreboard for.
 *
 * Nine, one past {@link REHEARSAL_WEEK}, because two probes need a week the
 * season has not played yet — see the note on week 9 above.
 */
export const MIDSEASON_LAST_WEEK = 9;

export interface MidseasonOptions {
  /** Weeks with a real result. Beyond this, see {@link scheduledThrough}. */
  readonly played: number;
  /** When this read happened. `persistChain`'s staleness guard reads it. */
  readonly capturedAt?: Date;
  /**
   * Emit **unplayed schedule rows** for weeks `played + 1 .. scheduledThrough`.
   *
   * Sleeper publishes the whole season's schedule the moment a league drafts, so
   * a week that has not happened comes back as ordinary matchup rows with
   * `points: 0` on both sides and nothing saying *"not yet"*. Omitted by default
   * — the live API answers `[]` for a week beyond the schedule, and only a
   * drafted-but-unplayed week looks like this.
   */
  readonly scheduledThrough?: number;
  /**
   * Rewrite one week's matchup rows on the way out.
   *
   * The corruption probes' one hook. Deliberately a *transport-level* edit: a
   * probe that reached into the database would be testing a state the product
   * cannot produce, while a malformed payload is exactly what an upstream API
   * can hand over on a Tuesday morning.
   */
  readonly mutate?: (week: number, rows: readonly unknown[]) => readonly unknown[];
}

export type MidseasonSource = SleeperSource & {
  /** Every endpoint asked for, in order. The request budget, observable. */
  readonly requests: readonly SleeperEndpoint[];
};

/** Points as an exact integer count of hundredths, the way `reconcile.ts` does. */
function cents(points: number): number {
  return Math.round(points * 100);
}

/** Every played game up to and including `week`, in schedule order. */
export function gamesThrough(week: number): readonly (MidseasonGame & { week?: number })[] {
  const out: MidseasonGame[] = [];
  for (let w = 1; w <= Math.min(week, MIDSEASON_LAST_WEEK); w += 1) {
    out.push(...(MIDSEASON_GAMES[w] ?? []));
  }
  return out;
}

export interface MidseasonRecord {
  readonly rosterId: number;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  /** Integer cents, so a total never carries a float's rounding error. */
  readonly pointsForCents: number;
}

/**
 * The table after `played` weeks, from the scoreboard alone.
 *
 * Exported because the rehearsal asserts against it and because the rosters
 * payload is built from it — one derivation, so the standings Sleeper reports
 * and the standings the weeks add up to cannot drift apart.
 */
export function midseasonRecords(played: number): readonly MidseasonRecord[] {
  const tally = new Map<number, { wins: number; losses: number; ties: number; pf: number }>();
  for (let rosterId = 1; rosterId <= 10; rosterId += 1) {
    tally.set(rosterId, { wins: 0, losses: 0, ties: 0, pf: 0 });
  }

  for (let week = 1; week <= Math.min(played, MIDSEASON_LAST_WEEK); week += 1) {
    for (const [a, pointsA, b, pointsB] of MIDSEASON_GAMES[week] ?? []) {
      const rowA = tally.get(a)!;
      const rowB = tally.get(b)!;
      rowA.pf += cents(pointsA);
      rowB.pf += cents(pointsB);
      if (cents(pointsA) === cents(pointsB)) {
        rowA.ties += 1;
        rowB.ties += 1;
      } else if (cents(pointsA) > cents(pointsB)) {
        rowA.wins += 1;
        rowB.losses += 1;
      } else {
        rowB.wins += 1;
        rowA.losses += 1;
      }
    }
  }

  return [...tally.entries()]
    .map(([rosterId, row]) => ({
      rosterId,
      wins: row.wins,
      losses: row.losses,
      ties: row.ties,
      pointsForCents: row.pf,
    }))
    .sort((x, y) => x.rosterId - y.rosterId);
}

/** One week's Sleeper matchup rows, as the API shapes them. */
export function midseasonMatchupRows(week: number): readonly unknown[] {
  const games = MIDSEASON_GAMES[week];
  if (games === undefined) return [];

  const rows: unknown[] = [];
  for (const [index, [a, pointsA, b, pointsB]] of games.entries()) {
    const matchupId = index + 1;
    rows.push(row(a, matchupId, pointsA), row(b, matchupId, pointsB));
  }
  // Ascending roster id, the way the live API returns them.
  return rows.sort(
    (x, y) => (x as { roster_id: number }).roster_id - (y as { roster_id: number }).roster_id,
  );
}

/**
 * A week that is on the schedule and has not been played.
 *
 * Every roster paired, every score exactly zero — which is all the payload says.
 * `persistWeeks` drops these, and that drop is the one thing standing between
 * the in-season sync and a finalized week of ties nobody played.
 */
export function scheduledMatchupRows(week: number): readonly unknown[] {
  const games = MIDSEASON_GAMES[week];
  if (games === undefined) return [];

  const rows: unknown[] = [];
  for (const [index, [a, , b]] of games.entries()) {
    const matchupId = index + 1;
    rows.push(row(a, matchupId, 0), row(b, matchupId, 0));
  }
  return rows.sort(
    (x, y) => (x as { roster_id: number }).roster_id - (y as { roster_id: number }).roster_id,
  );
}

function row(rosterId: number, matchupId: number, points: number): unknown {
  return {
    roster_id: rosterId,
    matchup_id: matchupId,
    points,
    custom_points: null,
    starters: [],
    players: [],
  };
}

/**
 * A Sleeper that is `played` weeks into 2026.
 *
 * Everything not synthesised passes through the recorded fixtures, restamped so
 * **one** capture time governs the whole read — which is what `persistChain`'s
 * staleness guard compares, and a read whose payloads carried different times
 * would be a fixture defect that reads as a product one.
 */
export function seasonAtWeek(options: MidseasonOptions): MidseasonSource {
  const underlying = createFixtureSource();
  const requests: SleeperEndpoint[] = [];
  const capturedAt = options.capturedAt ?? MIDSEASON_CAPTURE;
  const scheduledThrough = options.scheduledThrough ?? 0;

  return {
    label: `midseason-2026(week ${String(options.played)})`,
    requests,

    async fetch(endpoint: SleeperEndpoint): Promise<SleeperFetchResult> {
      requests.push(endpoint);

      if (endpoint.kind === 'matchups' && endpoint.leagueId === MIDSEASON_LEAGUE) {
        const week = endpoint.week;
        const base =
          week <= options.played
            ? midseasonMatchupRows(week)
            : week <= scheduledThrough
              ? scheduledMatchupRows(week)
              : [];

        return {
          kind: 'ok',
          endpoint,
          payload: options.mutate === undefined ? base : options.mutate(week, base),
          status: 200,
          fetchedAt: capturedAt,
        };
      }

      const result = await underlying.fetch(endpoint);

      if (
        endpoint.kind === 'rosters' &&
        endpoint.leagueId === MIDSEASON_LEAGUE &&
        result.kind === 'ok'
      ) {
        const rows = result.payload as { roster_id: number; settings: Record<string, unknown> }[];
        const table = new Map(midseasonRecords(options.played).map((r) => [r.rosterId, r]));

        return {
          ...result,
          fetchedAt: capturedAt,
          payload: rows.map((rosterRow) => {
            const record = table.get(rosterRow.roster_id);
            const pf = record?.pointsForCents ?? 0;
            return {
              ...rosterRow,
              settings: {
                ...rosterRow.settings,
                wins: record?.wins ?? 0,
                losses: record?.losses ?? 0,
                ties: record?.ties ?? 0,
                // Sleeper's split form: 1123.80 is `fpts: 1123`, `fpts_decimal: 80`.
                fpts: Math.trunc(pf / 100),
                fpts_decimal: pf % 100,
              },
            };
          }),
        };
      }

      return { ...result, fetchedAt: capturedAt };
    },
  };
}
