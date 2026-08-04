import { describe, expect, it } from 'vitest';

import { asCollapse, comebackFor, comebacksForWeek } from './comeback';
import { type SnapshotEntry, type WeekSnapshotMap } from './snapshot';
import { buildWeek, type StoredWeekGame } from './week';

/**
 * What Monday did, checked against every shape a week can take.
 *
 * The product claim is narrow and easy to get wrong in a way nobody notices:
 * *"came back on Monday night"* is only true if somebody was actually behind
 * beforehand, and a final score cannot say. So every case below is a way the
 * paper could publish a sentence that is not true, and each one has its own
 * named outcome rather than a null a caller can mistake for "no".
 */

const ROSTER = new Map([
  [1, { userId: 'u-alex', displayName: 'Alex' }],
  [2, { userId: 'u-nick', displayName: 'Nick' }],
  [3, { userId: 'u-joe', displayName: 'Joe' }],
  [4, { userId: 'u-cheese', displayName: 'Cheese' }],
]);

function game(input: {
  matchup: number;
  a: number;
  b: number;
  aCents: number;
  bCents: number;
}): StoredWeekGame {
  const winner =
    input.aCents === input.bCents ? null : input.aCents > input.bCents ? input.a : input.b;
  return {
    week: 3,
    weekType: 'regular',
    sleeperMatchupId: input.matchup,
    rosterAId: input.a,
    rosterBId: input.b,
    pointsACents: input.aCents,
    pointsBCents: input.bCents,
    winnerRosterId: winner,
    marginCents: Math.abs(input.aCents - input.bCents),
    disputed: false,
  };
}

function week(rows: readonly StoredWeekGame[], finalized = true) {
  return buildWeek({ season: 2026, week: 3, finalized, rows, roster: ROSTER });
}

function snapshot(entries: readonly SnapshotEntry[]): WeekSnapshotMap {
  return new Map(entries.map((entry) => [entry.sleeperMatchupId, entry]));
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

describe('what Monday did', () => {
  it('calls it a comeback when the trailing side wins', () => {
    // Alex 8230 behind 10640; finishes 12844 to 12178.
    const [only] = week([game({ matchup: 1, a: 1, b: 2, aCents: 12844, bCents: 12178 })]).games;
    const fact = comebackFor(only!, snapshot([shot(1, 1, 2, 8230, 10640)]));

    expect(fact.outcome).toBe('comeback');
    expect(fact.winner).toBe('Alex');
    expect(fact.loser).toBe('Nick');
    expect(fact.deficitCents).toBe(2410);
    expect(fact.finalMarginCents).toBe(666);
    // Deficit plus final margin: how far the game actually moved.
    expect(fact.swingCents).toBe(3076);
    expect(fact.flipped).toBe(true);
  });

  it('calls it held when the leading side wins, however much the game moved', () => {
    /*
     * The case that must never be published as a comeback. Brandon gains twenty
     * points on Monday and the result never changes — a big Monday is not a
     * recovery, and conflating them is the failure this whole gate exists for.
     */
    const [only] = week([game({ matchup: 1, a: 1, b: 2, aCents: 13106, bCents: 10852 })]).games;
    const fact = comebackFor(only!, snapshot([shot(1, 1, 2, 11106, 10452)]));

    expect(fact.outcome).toBe('held');
    expect(fact.flipped).toBe(false);
    expect(fact.deficitCents).toBe(0);
    expect(fact.swingCents).toBe(2254 - 654);
  });

  it('calls it never-led when the trailing side also loses', () => {
    const [only] = week([game({ matchup: 1, a: 1, b: 2, aCents: 10470, bCents: 11918 })]).games;
    const fact = asCollapse(comebackFor(only!, snapshot([shot(1, 1, 2, 8870, 11218)])));

    // From the *winner's* seat this is `held`; from the loser's it is never-led.
    expect(fact.outcome).toBe('never-led');
    expect(fact.flipped).toBe(false);
  });

  it('gives the same event from the loser’s chair as a collapse', () => {
    const [only] = week([game({ matchup: 1, a: 1, b: 2, aCents: 12844, bCents: 12178 })]).games;
    const fact = comebackFor(only!, snapshot([shot(1, 1, 2, 8230, 10640)]));
    const flipped = asCollapse(fact);

    expect(flipped.outcome).toBe('collapse');
    // Derived, never recomputed — the two views cannot disagree about the numbers.
    expect(flipped.deficitCents).toBe(fact.deficitCents);
    expect(flipped.blownLeadCents).toBe(fact.deficitCents);
    expect(flipped.winner).toBe(fact.winner);
  });

  it('says nothing about a game that was level at the snapshot', () => {
    /*
     * Somebody won on Monday and nobody came from behind, because nobody was
     * behind. A paper that called this a comeback would be describing an event
     * that did not happen.
     */
    const [only] = week([game({ matchup: 1, a: 1, b: 2, aCents: 11720, bCents: 11086 })]).games;
    const fact = comebackFor(only!, snapshot([shot(1, 1, 2, 10000, 10000)]));

    expect(fact.outcome).toBe('tied-at-snapshot');
    expect(fact.deficitCents).toBe(0);
    expect(fact.flipped).toBe(false);
    // Level to a finished margin is the whole of the movement.
    expect(fact.swingCents).toBe(634);
  });

  it('distinguishes "nobody came back" from "we never looked"', () => {
    const [only] = week([game({ matchup: 1, a: 1, b: 2, aCents: 12844, bCents: 12178 })]).games;
    const fact = comebackFor(only!, snapshot([]));

    expect(fact.outcome).toBe('no-snapshot');
    expect(fact.winner).toBeNull();
    // Every number is zero *and* the outcome says why. A caller that only read
    // the numbers would conclude a level game with no movement.
    expect(fact.finalMarginCents).toBe(0);
  });

  it('refuses a game that has no decided result', () => {
    const [only] = week([game({ matchup: 1, a: 1, b: 2, aCents: 11000, bCents: 11000 })]).games;
    expect(comebackFor(only!, snapshot([shot(1, 1, 2, 9000, 10000)])).outcome).toBe('not-final');
  });

  it('refuses a game whose season is not finalized', () => {
    const rows = [game({ matchup: 1, a: 1, b: 2, aCents: 12844, bCents: 12178 })];
    const [only] = week(rows, false).games;
    expect(only?.publishable).toBe(false);
    expect(comebackFor(only!, snapshot([shot(1, 1, 2, 8230, 10640)])).outcome).toBe('not-final');
  });

  it('refuses a snapshot that describes a different pair of rosters', () => {
    /*
     * The dangerous one. A snapshot naming roster 3 against roster 4 joined to a
     * game between 1 and 2 would attribute one manager's Sunday to another and
     * read as a perfectly ordinary sentence.
     */
    const [only] = week([game({ matchup: 1, a: 1, b: 2, aCents: 12844, bCents: 12178 })]).games;
    expect(comebackFor(only!, snapshot([shot(1, 3, 4, 8230, 10640)])).outcome).toBe('unpaired');
  });

  it('reads a snapshot whose sides are stored the other way round', () => {
    /*
     * The mirror of the case above, and it must *not* refuse: which roster is
     * "a" is our ordering rather than Sleeper's, so a snapshot written by a
     * different code path may legitimately have them swapped.
     */
    const [only] = week([game({ matchup: 1, a: 1, b: 2, aCents: 12844, bCents: 12178 })]).games;
    const fact = comebackFor(only!, snapshot([shot(1, 2, 1, 10640, 8230)]));

    expect(fact.outcome).toBe('comeback');
    expect(fact.winner).toBe('Alex');
    expect(fact.deficitCents).toBe(2410);
  });

  it('reports every game of a week in the week’s own order', () => {
    const rows = [
      game({ matchup: 1, a: 1, b: 2, aCents: 12844, bCents: 12178 }),
      game({ matchup: 2, a: 3, b: 4, aCents: 10470, bCents: 11918 }),
    ];
    const facts = comebacksForWeek(week(rows).games, snapshot([shot(1, 1, 2, 8230, 10640)]));

    expect(facts.map((fact) => fact.outcome)).toEqual(['comeback', 'no-snapshot']);
    expect(facts.map((fact) => fact.sleeperMatchupId)).toEqual([1, 2]);
  });

  it('never invents a number it was not given', () => {
    /*
     * The arithmetic is two subtractions on stored integers, and this pins that
     * it stays two subtractions. Cents throughout: `128.44 - 121.78` in IEEE 754
     * is `6.659999999999997`, and a margin that drifts is a claim that stops
     * matching the board printed beside it.
     */
    const [only] = week([game({ matchup: 1, a: 1, b: 2, aCents: 12844, bCents: 12178 })]).games;
    const fact = comebackFor(only!, snapshot([shot(1, 1, 2, 8230, 10640)]));

    expect(Number.isInteger(fact.deficitCents)).toBe(true);
    expect(Number.isInteger(fact.finalMarginCents)).toBe(true);
    expect(Number.isInteger(fact.swingCents)).toBe(true);
    expect(fact.swingCents).toBe(fact.deficitCents + fact.finalMarginCents);
  });
});
