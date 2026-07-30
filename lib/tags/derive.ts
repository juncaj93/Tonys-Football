/**
 * Derived manager tags.
 *
 * `16 §10` defines reputation as **derived boolean tags**, recomputed from
 * verified events — no stats, no RPG, no new tables. `17 §3` pulls them forward
 * to M1 because the Counter Greeting is keyed to tags rather than to names,
 * which is what keeps every line true automatically: if the 2025 champion had
 * been somebody else, the same line still lands on the right person.
 *
 * This file is **pure**. It takes a history and returns tags. It reads no
 * database, no clock, and no environment, so every claim it makes can be
 * checked against a fixture in a unit test — which matters more here than
 * almost anywhere else in the project, because a wrong tag does not throw. It
 * makes Tony say something false to somebody's face.
 *
 * ## Two rules
 *
 * **Only completed seasons count.** A season in progress has no champion, no
 * final record, and no playoff field. Reading the 2026 preseason as history is
 * exactly how Tony ends up congratulating somebody on a January they have not
 * reached.
 *
 * **Ties are shared, never broken.** Two managers finished 2025 at 3–11. Both
 * are the worst record in the league, because that is what happened. Inventing
 * a tiebreak so exactly one person holds a tag would make the tag tidier and
 * the claim false.
 */

export interface SeatHistory {
  readonly userId: string;
  readonly rosterId: number;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly pointsFor: number;
  readonly pointsAgainst: number;
  readonly madePlayoffs: boolean;
  /** Placement, where the bracket produced one. 1 is the champion. */
  readonly finalRank: number | null;
}

export interface SeasonHistory {
  readonly year: number;
  /**
   * The season has been played to its end.
   *
   * Sourced from the season's status, not from the calendar: a season is
   * complete when the bracket resolved it, and nothing else.
   */
  readonly isComplete: boolean;
  readonly seats: readonly SeatHistory[];
}

export interface LeagueHistory {
  /** Any order; this module sorts. */
  readonly seasons: readonly SeasonHistory[];
}

export type TagSet = ReadonlySet<string>;

/** Tags that carry a year, so the line stays true when the year moves on. */
export function championTag(year: number): string {
  return `champion_${String(year)}`;
}

/**
 * The rest of the podium, per season.
 *
 * Second and third are settled by the placement games as firmly as first is
 * (`lib/sleeper/chain.ts`), so they are derivable rather than entered — and
 * they are what makes a manager with no league-leading number distinguishable.
 * The 2024 runner-up and the 2024 third-place finisher both missed the 2025
 * playoffs, and that pairing is the most pointed true thing Tony can say to
 * either of them.
 *
 * Derived for **every** completed season, not just the latest, because the
 * interesting claim spans two: what you were, and what happened next.
 */
export function runnerUpTag(year: number): string {
  return `runner_up_${String(year)}`;
}

export function thirdPlaceTag(year: number): string {
  return `third_place_${String(year)}`;
}

const complete = (history: LeagueHistory): readonly SeasonHistory[] =>
  [...history.seasons].filter((season) => season.isComplete).sort((a, b) => b.year - a.year);

/** Everyone who has ever held a seat, including seasons not yet played. */
function everyone(history: LeagueHistory): readonly string[] {
  return [...new Set(history.seasons.flatMap((season) => season.seats.map((seat) => seat.userId)))];
}

/**
 * Every user id holding the extreme value of a measure, ties included.
 *
 * `select` returns null for a seat that should not be considered at all.
 */
function extremes(
  seats: readonly SeatHistory[],
  select: (seat: SeatHistory) => number | null,
  direction: 'max' | 'min',
): readonly string[] {
  const scored = seats
    .map((seat) => ({ userId: seat.userId, value: select(seat) }))
    .filter((entry): entry is { userId: string; value: number } => entry.value !== null);

  if (scored.length === 0) return [];

  const best = scored.reduce(
    (extreme, entry) =>
      direction === 'max' ? Math.max(extreme, entry.value) : Math.min(extreme, entry.value),
    scored[0]!.value,
  );

  return scored.filter((entry) => entry.value === best).map((entry) => entry.userId);
}

export function deriveTags(history: LeagueHistory): ReadonlyMap<string, TagSet> {
  const completed = complete(history);
  const latest = completed[0] ?? null;
  const tags = new Map<string, Set<string>>();

  for (const userId of everyone(history)) tags.set(userId, new Set<string>());

  const add = (userId: string, tag: string): void => {
    const set = tags.get(userId);
    if (set === undefined) tags.set(userId, new Set([tag]));
    else set.add(tag);
  };

  // --- Championships ------------------------------------------------------
  const championsByYear = new Map<number, readonly string[]>();

  for (const season of completed) {
    const champions = season.seats
      .filter((seat) => seat.finalRank === 1)
      .map((seat) => seat.userId);
    championsByYear.set(season.year, champions);
    for (const userId of champions) add(userId, championTag(season.year));

    for (const seat of season.seats) {
      if (seat.finalRank === 2) add(seat.userId, runnerUpTag(season.year));
      if (seat.finalRank === 3) add(seat.userId, thirdPlaceTag(season.year));
    }
  }

  const everChampion = new Set([...championsByYear.values()].flat());

  for (const userId of everyone(history)) {
    if (!everChampion.has(userId)) add(userId, 'never_champion');
  }

  if (latest !== null) {
    const latestChampions = new Set(championsByYear.get(latest.year) ?? []);
    for (const userId of everyone(history)) {
      if (!latestChampions.has(userId)) add(userId, `not_champion_${String(latest.year)}`);
    }

    // A title won at .500 or worse. The 2025 champion went 7–7, which is the
    // whole joke — and it is derived, so a 13–1 champion never receives it.
    for (const userId of latestChampions) {
      const seat = latest.seats.find((candidate) => candidate.userId === userId);
      if (seat !== undefined && seat.wins <= seat.losses) add(userId, 'title_at_500_or_worse');
    }
  }

  // --- Seasons played -----------------------------------------------------
  const completedSeasonsPlayed = new Map<string, number>();
  for (const season of completed) {
    for (const seat of season.seats) {
      completedSeasonsPlayed.set(seat.userId, (completedSeasonsPlayed.get(seat.userId) ?? 0) + 1);
    }
  }

  for (const [userId, count] of completedSeasonsPlayed) {
    if (count >= 2) add(userId, 'two_plus_seasons');
  }

  // A manager with no completed season at all. Zack in 2026 — and deliberately
  // NOT somebody who has played one season, who has a record to talk about.
  for (const userId of everyone(history)) {
    if ((completedSeasonsPlayed.get(userId) ?? 0) === 0) add(userId, 'newest_manager');
  }

  // --- The latest completed season ---------------------------------------
  if (latest !== null) {
    const year = String(latest.year);
    const seats = latest.seats;

    for (const seat of seats) {
      // Both directions, because "you were not there" is a claim in its own
      // right and the absence of a tag cannot be required by a content entry.
      add(seat.userId, seat.madePlayoffs ? `made_playoffs_${year}` : `missed_playoffs_${year}`);
    }

    for (const userId of extremes(seats, (seat) => seat.wins, 'max')) {
      add(userId, `best_record_${year}`);
    }
    for (const userId of extremes(seats, (seat) => seat.wins, 'min')) {
      add(userId, `worst_record_${year}`);
    }
    for (const userId of extremes(seats, (seat) => seat.pointsFor, 'max')) {
      add(userId, `most_points_${year}`);
    }
    for (const userId of extremes(seats, (seat) => seat.pointsFor, 'min')) {
      add(userId, `fewest_points_${year}`);
    }
    for (const userId of extremes(seats, (seat) => seat.pointsAgainst, 'max')) {
      add(userId, `most_points_against_${year}`);
    }

    // Scored the second-most points in the league and did not have one of the
    // two best records — the specific shape of "somebody upstairs doesn't like
    // you". Second place only: the manager who led the league in points and
    // missed out has their own, louder line.
    const pointTotals = [...new Set(seats.map((seat) => seat.pointsFor))].sort((a, b) => b - a);
    const runnerUpPoints = pointTotals[1];

    const winTotals = [...new Set(seats.map((seat) => seat.wins))].sort((a, b) => b - a);
    const topTwoWins = new Set(winTotals.slice(0, 2));
    const bestRecords = new Set(
      seats.filter((seat) => topTwoWins.has(seat.wins)).map((seat) => seat.userId),
    );

    if (runnerUpPoints !== undefined) {
      for (const seat of seats) {
        if (seat.pointsFor === runnerUpPoints && !bestRecords.has(seat.userId)) {
          add(seat.userId, 'high_points_low_wins');
        }
      }
    }
  }

  // --- Missed January, every year they played -----------------------------
  if (completed.length >= 2) {
    for (const [userId, count] of completedSeasonsPlayed) {
      if (count < completed.length) continue;
      const everMade = completed.some((season) =>
        season.seats.some((seat) => seat.userId === userId && seat.madePlayoffs),
      );
      if (!everMade) add(userId, 'missed_playoffs_both_seasons');
    }
  }

  // --- Roster continuity --------------------------------------------------
  // Holding a seat somebody else held before. The 2026 occupant of roster 4 is
  // the third person in it; nobody else in the league has ever changed hands.
  const ordered = [...history.seasons].sort((a, b) => a.year - b.year);
  const currentSeason = ordered.at(-1);

  if (currentSeason !== undefined) {
    const earlier = ordered.filter((season) => season.year < currentSeason.year);
    for (const seat of currentSeason.seats) {
      const priorOccupants = earlier
        .flatMap((season) => season.seats)
        .filter((candidate) => candidate.rosterId === seat.rosterId)
        .map((candidate) => candidate.userId);

      if (priorOccupants.some((userId) => userId !== seat.userId)) {
        add(seat.userId, 'inherited_slot');
      }
    }
  }

  return tags;
}

/** Convenience for one person; an unknown id has no tags rather than throwing. */
export function tagsFor(all: ReadonlyMap<string, TagSet>, userId: string): TagSet {
  return all.get(userId) ?? new Set<string>();
}
