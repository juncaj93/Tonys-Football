import { type StoredWeekGame } from './week';

/**
 * The table, as it stood after a given week.
 *
 * ## Why this is recomputed rather than read
 *
 * `season_memberships` stores a **final** record — the one Sleeper published when
 * the season closed. It cannot answer *"where was Brandon after week 6"*, and
 * every story about movement is a question about exactly that. So the table is
 * rebuilt from the games, which are the only rows that carry a week.
 *
 * That also keeps a standings claim checkable: the inputs are the same stored
 * games the scoreboard prints, so a reader who disagrees can add up the column
 * themselves. A claim resting on a number nobody can recompute is the thing
 * `MANDATE §10` exists to stop.
 *
 * ## Regular season only
 *
 * A playoff result does not move the table — the table is what *produced* the
 * bracket. Including playoff games would show managers climbing in January and
 * quietly contradict the seeding the bracket was built from.
 *
 * ## The tiebreak is stated, not discovered
 *
 * Wins, then points for, then roster id. The last one is arbitrary and is there
 * only to make the order total: two managers identical on both real criteria have
 * no football reason to be ranked, and a rank that depended on query order would
 * make *"climbed three places"* a claim about the database rather than about the
 * season. Ties in rank are reported as the same rank, so a story can tell "moved"
 * from "was always level".
 */

export interface StandingRow {
  readonly rosterId: number;
  readonly managerId: string | null;
  readonly displayName: string | null;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly pointsForCents: number;
  /** 1 is first. Shared by managers level on wins *and* points. */
  readonly rank: number;
}

/**
 * The table after `throughWeek`, from the games alone.
 *
 * `roster` supplies who held each seat that season; a roster with no membership
 * still appears, with null names, because leaving it out would silently change
 * everybody else's rank.
 */
export function standingsThrough(input: {
  readonly rows: readonly StoredWeekGame[];
  readonly throughWeek: number;
  readonly roster: ReadonlyMap<number, { userId: string; displayName: string }>;
}): readonly StandingRow[] {
  const tally = new Map<number, { wins: number; losses: number; ties: number; pf: number }>();

  const bump = (rosterId: number): { wins: number; losses: number; ties: number; pf: number } => {
    const existing = tally.get(rosterId);
    if (existing !== undefined) return existing;
    const fresh = { wins: 0, losses: 0, ties: 0, pf: 0 };
    tally.set(rosterId, fresh);
    return fresh;
  };

  for (const rosterId of input.roster.keys()) bump(rosterId);

  for (const row of input.rows) {
    if (row.week > input.throughWeek) continue;
    if (row.weekType !== 'regular') continue;

    const a = bump(row.rosterAId);
    const b = bump(row.rosterBId);
    a.pf += row.pointsACents;
    b.pf += row.pointsBCents;

    if (row.winnerRosterId === null) {
      a.ties++;
      b.ties++;
    } else if (row.winnerRosterId === row.rosterAId) {
      a.wins++;
      b.losses++;
    } else {
      b.wins++;
      a.losses++;
    }
  }

  const ordered = [...tally.entries()]
    .map(([rosterId, record]) => ({ rosterId, ...record }))
    .sort((x, y) => y.wins - x.wins || y.pf - x.pf || x.rosterId - y.rosterId);

  const out: StandingRow[] = [];
  for (const [index, entry] of ordered.entries()) {
    const previous = index === 0 ? undefined : ordered[index - 1];
    const level =
      previous !== undefined && previous.wins === entry.wins && previous.pf === entry.pf;
    const seat = input.roster.get(entry.rosterId);
    out.push({
      rosterId: entry.rosterId,
      managerId: seat?.userId ?? null,
      displayName: seat?.displayName ?? null,
      wins: entry.wins,
      losses: entry.losses,
      ties: entry.ties,
      pointsForCents: entry.pf,
      rank: level ? (out[index - 1]?.rank ?? index + 1) : index + 1,
    });
  }

  return out;
}

/**
 * How many games in a row this roster has won, counting back from `throughWeek`.
 *
 * Regular season only, for the same reason the table is: a bracket run is a
 * different kind of streak and conflating them would report a manager who lost
 * their last four regular-season games as being on a hot run.
 *
 * A tie ends a streak rather than extending it — an unbeaten run and a winning
 * run are different claims and this function only supports the second.
 */
export function winStreak(input: {
  readonly rows: readonly StoredWeekGame[];
  readonly rosterId: number;
  readonly throughWeek: number;
}): number {
  const played = input.rows
    .filter(
      (row) =>
        row.weekType === 'regular' &&
        row.week <= input.throughWeek &&
        (row.rosterAId === input.rosterId || row.rosterBId === input.rosterId),
    )
    .sort((x, y) => y.week - x.week || y.sleeperMatchupId - x.sleeperMatchupId);

  let streak = 0;
  for (const row of played) {
    if (row.winnerRosterId !== input.rosterId) break;
    streak++;
  }
  return streak;
}
