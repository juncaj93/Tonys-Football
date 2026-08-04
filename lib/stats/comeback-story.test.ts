import { describe, expect, it } from 'vitest';

import { standardPolicy } from './significance';
import { type SnapshotEntry, type WeekSnapshotMap } from './snapshot';
import { STORY_FLOOR, STORY_GATES, deriveStories, type StoryInput } from './stories';
import { buildWeek, publishableWeek, type StoredWeekGame } from './week';

/**
 * When the paper is allowed to say somebody came back, and when it is not.
 *
 * `lib/stats/comeback.test.ts` checks the arithmetic. This checks the
 * **editorial** half, which is the half that can embarrass the league: the
 * arithmetic is right about a 0.4-point recovery too, and printing that as a
 * comeback is the failure the whole feature has to avoid.
 */

const ROSTER = new Map([
  [1, { userId: 'u-alex', displayName: 'Alex' }],
  [2, { userId: 'u-nick', displayName: 'Nick' }],
  [3, { userId: 'u-joe', displayName: 'Joe' }],
  [4, { userId: 'u-cheese', displayName: 'Cheese' }],
]);

function stored(
  matchup: number,
  a: number,
  b: number,
  aCents: number,
  bCents: number,
): StoredWeekGame {
  return {
    week: 3,
    weekType: 'regular',
    sleeperMatchupId: matchup,
    rosterAId: a,
    rosterBId: b,
    pointsACents: aCents,
    pointsBCents: bCents,
    winnerRosterId: aCents === bCents ? null : aCents > bCents ? a : b,
    marginCents: Math.abs(aCents - bCents),
    disputed: false,
  };
}

const shot = (
  matchup: number,
  a: number,
  b: number,
  aCents: number,
  bCents: number,
): SnapshotEntry => ({
  sleeperMatchupId: matchup,
  rosterAId: a,
  rosterBId: b,
  pointsACents: aCents,
  pointsBCents: bCents,
});

function stories(
  rows: readonly StoredWeekGame[],
  snapshots?: WeekSnapshotMap,
): ReturnType<typeof deriveStories> {
  const week = buildWeek({ season: 2026, week: 3, finalized: true, rows, roster: ROSTER });
  const input: StoryInput = {
    week,
    seasonRows: rows,
    roster: ROSTER,
    marginPopulationCents: [500, 1000, 2000, 5000],
    scorePopulationCents: [9000, 10000, 11000, 12000],
    policy: standardPolicy(),
    finalRanks: new Map(),
    playoffRosters: new Set(),
    ...(snapshots === undefined ? {} : { snapshots }),
  };
  return deriveStories(input);
}

const comebackIn = (
  candidates: ReturnType<typeof deriveStories>,
): ReturnType<typeof deriveStories>[number] | undefined =>
  candidates.find((story) => story.kind === 'monday-comeback');

describe('the Monday-comeback story', () => {
  /** Alex 24.10 behind before Monday, wins by 6.66. */
  const RECOVERY = stored(1, 1, 2, 12844, 12178);
  const RECOVERY_SHOT = shot(1, 1, 2, 8230, 10640);

  it('prints when somebody was meaningfully behind and won', () => {
    const story = comebackIn(stories([RECOVERY], new Map([[1, RECOVERY_SHOT]])));

    expect(story).toBeDefined();
    expect(story?.detail).toMatchObject({
      kind: 'monday-comeback',
      winner: 'Alex',
      loser: 'Nick',
      deficit: 24.1,
      margin: 6.66,
      swing: 30.76,
    });
    expect(story!.significance).toBeGreaterThanOrEqual(STORY_FLOOR);
  });

  it('does not print when the game moved but never turned over', () => {
    /*
     * Twenty points of Monday, and the same manager wins. This is what most
     * Mondays look like, and calling it a comeback is the named failure.
     */
    const held = stored(1, 1, 2, 13106, 10852);
    expect(comebackIn(stories([held], new Map([[1, shot(1, 1, 2, 11106, 10452)]])))).toBeUndefined();
  });

  it('does not print a deficit too small to be a recovery', () => {
    // Behind by 0.40 and wins by 2.00. The result flipped; nothing happened.
    const hair = stored(1, 1, 2, 12000, 11800);
    expect(comebackIn(stories([hair], new Map([[1, shot(1, 1, 2, 11700, 11740)]])))).toBeUndefined();
  });

  it('prints at exactly the gate and not a point below it', () => {
    const gate = STORY_GATES.minComebackDeficit * 100;
    const atGate = new Map([[1, shot(1, 1, 2, 12844 - 666 - gate, 12844 - 666)]]);
    const underGate = new Map([[1, shot(1, 1, 2, 12844 - 666 - (gate - 1), 12844 - 666)]]);

    expect(comebackIn(stories([RECOVERY], atGate))).toBeDefined();
    expect(comebackIn(stories([RECOVERY], underGate))).toBeUndefined();
  });

  it('says nothing at all about a week that was never photographed', () => {
    /*
     * Every historical season predates the job. A story that appeared for some
     * weeks and not others with no explanation would be worse than one that
     * appears only where the evidence exists.
     */
    expect(comebackIn(stories([RECOVERY]))).toBeUndefined();
    expect(comebackIn(stories([RECOVERY], new Map()))).toBeUndefined();
  });

  it('picks the deepest hole when more than one game turned over', () => {
    const shallow = stored(1, 1, 2, 12000, 11800);
    const deep = stored(2, 3, 4, 13000, 12500);
    const snapshots = new Map([
      [1, shot(1, 1, 2, 10000, 11500)], // 15.00 behind
      [2, shot(2, 3, 4, 10000, 14000)], // 40.00 behind
    ]);

    const story = comebackIn(stories([shallow, deep], snapshots));
    expect(story?.detail).toMatchObject({ winner: 'Joe', deficit: 40 });
  });

  it('scores on the deficit rather than the final margin', () => {
    /*
     * The one place this story disagrees with every other margin-shaped kind,
     * and deliberately: a one-point win after being forty behind is a bigger
     * story than a one-point win after being one behind, and the final margin
     * cannot tell them apart.
     */
    const game = stored(1, 1, 2, 12000, 11900);
    const shallow = comebackIn(stories([game], new Map([[1, shot(1, 1, 2, 10000, 11500)]])));
    const deep = comebackIn(stories([game], new Map([[1, shot(1, 1, 2, 8000, 11500)]])));

    expect(deep!.significance).toBeGreaterThan(shallow!.significance);
  });

  it('names only the two managers in the game, and only its own numbers', () => {
    const story = comebackIn(stories([RECOVERY], new Map([[1, RECOVERY_SHOT]])))!;

    expect(story.allowedNames).toEqual(['Alex', 'Nick']);
    expect(story.allowedNumbers).toEqual(['24.1', '6.7', '30.8']);
    expect(story.subjects).toEqual(['u-alex', 'u-nick']);
    expect(story.gameKey).toBe('2026-w03-m1');
  });

  it('carries evidence a reader could check, and no model', () => {
    const story = comebackIn(stories([RECOVERY], new Map([[1, RECOVERY_SHOT]])))!;
    const evidence = story.evidence.join(' ');

    expect(evidence).toContain('pre-Monday snapshot');
    expect(evidence).toContain('stored game 2026-w03-m1');
    // `16 §9` bans the vocabulary; this asserts the fact layer never reaches for it.
    expect(evidence).not.toMatch(/project|probabilit|odds|expected/i);
  });

  it('leaves every other story of the week alone', () => {
    /*
     * The integration risk. A new candidate that suppressed the board or crowded
     * out the week's real lead would be the *"do not suppress required newspaper
     * coverage"* failure.
     */
    const rows = [RECOVERY, stored(2, 3, 4, 15000, 9000)];
    const without = stories(rows).map((story) => story.kind);
    const with_ = stories(rows, new Map([[1, RECOVERY_SHOT]])).map((story) => story.kind);

    for (const kind of without) expect(with_).toContain(kind);
    expect(with_).toContain('monday-comeback');
    expect(with_.length).toBe(without.length + 1);
  });

  it('stays sorted with everything else by significance', () => {
    const rows = [RECOVERY, stored(2, 3, 4, 15000, 9000)];
    const candidates = stories(rows, new Map([[1, RECOVERY_SHOT]]));
    const scores = candidates.map((story) => story.significance);

    expect([...scores].sort((x, y) => y - x)).toEqual(scores);
  });

  it('never names a retired manager, because it never sees one', () => {
    /*
     * A named requirement: retired managers must not appear in user-facing
     * derived stories. This kind does not implement the rule and must not — it
     * inherits it. `publishableWeek` drops a game either of whose managers is
     * not active *before* derivation runs, so the comeback in that game is not
     * a candidate that gets filtered later; it is a candidate that never exists.
     *
     * Asserted through the real filter rather than by reading the code, so that
     * a future kind wired in below `publishableWeek` fails here.
     */
    const raw = buildWeek({
      season: 2026,
      week: 3,
      finalized: true,
      rows: [RECOVERY],
      roster: ROSTER,
    });
    // Nick has retired; Alex has not. The game names both.
    const open = publishableWeek(raw, new Set(['u-alex']));
    expect(open.games).toHaveLength(0);

    const input: StoryInput = {
      week: open,
      seasonRows: [RECOVERY],
      roster: ROSTER,
      marginPopulationCents: [500, 1000, 2000, 5000],
      scorePopulationCents: [9000, 10000, 11000, 12000],
      policy: standardPolicy(),
      finalRanks: new Map(),
      playoffRosters: new Set(),
      snapshots: new Map([[1, RECOVERY_SHOT]]),
    };

    expect(comebackIn(deriveStories(input))).toBeUndefined();
  });

  it('has a stable, derivable id', () => {
    const story = comebackIn(stories([RECOVERY], new Map([[1, RECOVERY_SHOT]])))!;
    expect(story.id).toBe('2026-w03-monday-comeback');
  });
});
