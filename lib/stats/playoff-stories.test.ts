import { describe, expect, it } from 'vitest';

import { standardPolicy } from './significance';
import { deriveStories, type StoryInput } from './stories';
import { buildWeek, type StoredWeekGame } from './week';

/**
 * Bracket-shaped stories, against the bracket this league actually has.
 *
 * ## The defect these were written for
 *
 * `elimination` was derived from *"the loser meets no other playoff team again
 * this season"*. That describes a bracket which drops its losers, and Sleeper's
 * six-team draw is not one: the two first-round losers meet each other in the
 * semifinal week for fifth, and the two semifinal losers meet each other in the
 * final week for third. **Every** playoff loser plays another playoff team the
 * week after losing, so the condition was never satisfied and the candidate was
 * never built — on either recorded season, in any of their six playoff weeks.
 *
 * That is what {@link SEMIFINAL} and {@link FIRST_ROUND} reproduce: the real
 * shape, in miniature, with recorded placements. The first test fails on the old
 * rule.
 *
 * ## Why the rule is placement-based
 *
 * `finalRanks` is `season_memberships.final_rank`, written at import from the
 * bracket's own placement games. Asking it *"did the winner reach the final"* is
 * reading a recorded fact, which is the same standard the championship story is
 * held to. The cost is that it is **retrospective** — ranks one and two do not
 * exist until the final has been played — and that is asserted here too, so the
 * limitation is a property somebody has to delete a test to lose.
 */

const POLICY = standardPolicy();

function game(input: {
  readonly week: number;
  readonly matchupId: number;
  readonly a: number;
  readonly b: number;
  readonly aCents: number;
  readonly bCents: number;
}): StoredWeekGame {
  return {
    week: input.week,
    weekType: 'playoff',
    sleeperMatchupId: input.matchupId,
    rosterAId: input.a,
    rosterBId: input.b,
    pointsACents: input.aCents,
    pointsBCents: input.bCents,
    winnerRosterId: input.aCents > input.bCents ? input.a : input.b,
    marginCents: Math.abs(input.aCents - input.bCents),
    disputed: false,
  };
}

/**
 * A six-team postseason, laid out exactly as Sleeper lays this league's out.
 *
 * Seeds 1 and 2 (rosters 1 and 2) have byes. Week 15 is the two first-round
 * games plus the consolation ladder; week 16 is the two semifinals **plus the
 * fifth-place game between the first-round losers**; week 17 is the final and
 * the third-place game. Six of the ten placements settle in week 16.
 */
const SEASON: readonly StoredWeekGame[] = [
  // Week 15 — round one, and the consolation ladder beside it.
  game({ week: 15, matchupId: 1, a: 3, b: 6, aCents: 11000, bCents: 10500 }),
  game({ week: 15, matchupId: 2, a: 4, b: 5, aCents: 10800, bCents: 11200 }),
  game({ week: 15, matchupId: 3, a: 7, b: 10, aCents: 9800, bCents: 9500 }),
  game({ week: 15, matchupId: 4, a: 8, b: 9, aCents: 9700, bCents: 9400 }),
  // Week 16 — the semifinals, the fifth-place game, and the consolation finals.
  game({ week: 16, matchupId: 1, a: 1, b: 3, aCents: 12000, bCents: 11500 }),
  game({ week: 16, matchupId: 2, a: 2, b: 5, aCents: 11800, bCents: 11900 }),
  game({ week: 16, matchupId: 3, a: 6, b: 4, aCents: 10600, bCents: 10200 }),
  game({ week: 16, matchupId: 4, a: 7, b: 8, aCents: 9900, bCents: 9600 }),
  game({ week: 16, matchupId: 5, a: 10, b: 9, aCents: 9300, bCents: 9100 }),
  // Week 17 — the final, and third place.
  game({ week: 17, matchupId: 1, a: 1, b: 5, aCents: 12500, bCents: 12100 }),
  game({ week: 17, matchupId: 2, a: 3, b: 2, aCents: 11700, bCents: 11300 }),
];

/** What the bracket above settles. Roster → league position. */
const FINAL_RANKS = new Map<number, number>([
  [1, 1],
  [5, 2],
  [3, 3],
  [2, 4],
  [6, 5],
  [4, 6],
  [7, 7],
  [8, 8],
  [10, 9],
  [9, 10],
]);

const PLAYOFF_ROSTERS = new Set([1, 2, 3, 4, 5, 6]);

const ROSTER = new Map(
  Array.from({ length: 10 }, (_, index) => [
    index + 1,
    { userId: `u${String(index + 1)}`, displayName: `Manager ${String(index + 1)}` },
  ]),
);

function storiesFor(
  week: number,
  overrides: Partial<StoryInput> = {},
): ReturnType<typeof deriveStories> {
  const record = buildWeek({
    season: 2026,
    week,
    finalized: true,
    rows: SEASON,
    roster: ROSTER,
  });

  return deriveStories({
    week: record,
    seasonRows: SEASON,
    roster: ROSTER,
    marginPopulationCents: [],
    scorePopulationCents: [],
    policy: POLICY,
    finalRanks: FINAL_RANKS,
    playoffRosters: PLAYOFF_ROSTERS,
    ...overrides,
  });
}

const SEMIFINAL = 16;
const FIRST_ROUND = 15;

describe('bracket-shaped stories', () => {
  it('finds the semifinal that knocked somebody out of the title race', () => {
    /*
     * The old rule's failing case, and the reason this file exists.
     *
     * Roster 3 lost the semifinal to roster 1 and *does* play another playoff
     * team the following week — roster 2, for third place. The old
     * "still alive" test therefore counted roster 3 as alive and produced no
     * candidate. Roster 3 finished third; roster 1 finished first.
     */
    const elimination = storiesFor(SEMIFINAL).find((story) => story.kind === 'elimination');

    expect(elimination, 'no elimination candidate for the semifinal week').toBeDefined();
    expect(elimination?.subjects).toContain('u1');
    expect(elimination?.subjects).toContain('u3');
  });

  it('does not call the fifth-place game an elimination', () => {
    /*
     * Rosters 6 and 4 play in the same week, and both were out of the title race
     * before it kicked off. A game between two teams who can no longer win
     * anything is not somebody being knocked out of something.
     */
    const eliminations = storiesFor(SEMIFINAL).filter((story) => story.kind === 'elimination');
    const subjects = eliminations.flatMap((story) => story.subjects);

    expect(subjects).not.toContain('u6');
    expect(subjects).not.toContain('u4');
  });

  it('does not call a consolation game an elimination', () => {
    // Rosters 7 through 10 never reached the bracket. Nothing that happens to
    // them removes them from a race they were not in.
    for (const week of [FIRST_ROUND, SEMIFINAL]) {
      const subjects = storiesFor(week)
        .filter((story) => story.kind === 'elimination')
        .flatMap((story) => story.subjects);

      for (const consolation of ['u7', 'u8', 'u9', 'u10']) {
        expect(subjects, `week ${String(week)} named a consolation roster`).not.toContain(
          consolation,
        );
      }
    }
  });

  it('names the first-round loser who lost to a finalist', () => {
    // Roster 4 lost to roster 5 in week 15, and roster 5 went to the final.
    // Losing a first-round game to the eventual runner-up ends a title run just
    // as finally as losing a semifinal does.
    const elimination = storiesFor(FIRST_ROUND).find((story) => story.kind === 'elimination');

    expect(elimination?.subjects).toContain('u5');
    expect(elimination?.subjects).toContain('u4');
  });

  it('says nothing at all until the placements exist', () => {
    /*
     * The limitation, pinned rather than described.
     *
     * On the Tuesday the semifinal week is closed, the final has not been
     * played, so no roster holds rank one or two and this story cannot be built.
     * A live elimination story needs the bracket itself persisted, which nothing
     * in this product stores — see `docs/PLAYOFF_REHEARSAL.md`.
     */
    const midPostseason = new Map(
      [...FINAL_RANKS].filter(([, rank]) => rank > 4),
    );

    const stories = storiesFor(SEMIFINAL, { finalRanks: midPostseason });
    expect(stories.some((story) => story.kind === 'elimination')).toBe(false);
  });

  it('finds the championship in the final and nowhere else', () => {
    expect(storiesFor(17).some((story) => story.kind === 'championship')).toBe(true);
    expect(storiesFor(SEMIFINAL).some((story) => story.kind === 'championship')).toBe(false);
    expect(storiesFor(FIRST_ROUND).some((story) => story.kind === 'championship')).toBe(false);
  });

  it('does not mistake the third-place game for the final', () => {
    // Week 17 holds two games. Only the one between the rosters who finished
    // first and second is the title game, and the other must not produce a
    // second championship candidate.
    const championships = storiesFor(17).filter((story) => story.kind === 'championship');
    expect(championships).toHaveLength(1);
    expect(championships[0]?.subjects).toContain('u1');
    expect(championships[0]?.subjects).toContain('u5');
  });
});
