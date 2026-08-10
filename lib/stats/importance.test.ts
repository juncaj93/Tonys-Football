import { describe, expect, it } from 'vitest';

import { MIN_BASIS_WEEKS, rankMatchups, type MatchupCandidate } from './importance';
import { type StandingRow } from './standings';

/**
 * The matchup-importance rule, on its own.
 *
 * Pure, so every case below is a statement about the **rule** rather than about
 * a database that happens to contain a league. The database-facing half —
 * where a not-yet-final week's pairings come from — is asserted in
 * `lib/slice/midseason-week8.test.ts`, against a season that was played.
 *
 * The commissioner's ruling of 2026-08-10 is what these enforce, in both
 * directions: which facts may decide importance, and the instruction to **return
 * no matchup rather than fabricate one**.
 */

/** A table row, with only the fields the rule reads spelled out. */
function row(
  rosterId: number,
  rank: number,
  wins: number,
  losses: number,
  pointsFor: number,
  name = `M${String(rosterId)}`,
): StandingRow {
  return {
    rosterId,
    managerId: `user-${String(rosterId)}`,
    displayName: name,
    wins,
    losses,
    ties: 0,
    pointsForCents: Math.round(pointsFor * 100),
    rank,
  };
}

function game(sleeperMatchupId: number, a: number, b: number): MatchupCandidate {
  return { sleeperMatchupId, rosterAId: a, rosterBId: b };
}

/** The week-8 rehearsal's table entering week 9, which is a real shape. */
const TABLE: readonly StandingRow[] = [
  row(10, 1, 7, 1, 1059.1, 'Matty B'),
  row(9, 2, 7, 1, 1032.04, 'Matt Lee'),
  row(2, 3, 6, 2, 1014.48, 'Nathan'),
  row(7, 4, 5, 3, 1028.39, 'Brandon'),
  row(8, 5, 4, 4, 922.75, 'Cheese'),
  row(5, 6, 3, 5, 923.72, 'Nick'),
  row(3, 7, 3, 5, 874.11, 'Joe'),
  row(1, 8, 2, 6, 1123.8, 'Alex'),
  row(4, 9, 2, 6, 842.99, 'Zack'),
  row(6, 10, 1, 7, 786.7, 'Ryan'),
];

const EVERYONE = new Set(TABLE.map((r) => r.managerId!));

function rank(candidates: readonly MatchupCandidate[], overrides: Partial<Parameters<typeof rankMatchups>[0]> = {}) {
  return rankMatchups({
    season: 2026,
    week: 9,
    candidates,
    standings: TABLE,
    basisWeeks: 8,
    eligible: EVERYONE,
    ...overrides,
  });
}

describe('the matchup-importance rule', () => {
  describe('what decides', () => {
    it('features the two best records', () => {
      const result = rank([game(1, 10, 9), game(2, 3, 4), game(3, 5, 6)]);

      expect(result.selected).toBe(true);
      if (!result.selected) return;
      expect([result.matchup.aDisplayName, result.matchup.bDisplayName].sort()).toEqual([
        'Matt Lee',
        'Matty B',
      ]);
      expect(result.matchup.combinedWins).toBe(14);
      expect(result.matchup.rankGap).toBe(1);
    });

    it('prefers the closer game when the win totals are level', () => {
      /*
       * Both pairings carry eight combined wins — 7 + 1 and 5 + 3 — so the
       * primary key cannot separate them. One is 1st v 10th and the other is
       * 4th v 7th, and only the proximity key can tell those apart, which is
       * exactly why the ruling names standings proximity.
       */
      const mismatch = game(1, 10, 6); // Matty B 7–1 (1st) v Ryan 1–7 (10th)
      const tableFight = game(2, 7, 3); // Brandon 5–3 (4th) v Joe 3–5 (7th)

      const result = rank([mismatch, tableFight]);

      expect(result.selected).toBe(true);
      if (!result.selected) return;
      expect(result.matchup.combinedWins).toBe(8);
      expect(result.matchup.rankGap).toBe(3);
      expect([result.matchup.aDisplayName, result.matchup.bDisplayName].sort()).toEqual([
        'Brandon',
        'Joe',
      ]);
    });

    it('falls to combined points for when wins and proximity are level', () => {
      /*
       * Nick (6th, 3–5) v Joe (7th, 3–5) and Alex (8th, 2–6) v Zack (9th, 2–6)
       * would both be adjacent pairs — but their win totals differ, so this
       * needs a table where they do not. Two adjacent pairs, same combined
       * wins, decided by the column the league already uses to break a tie.
       */
      const standings = [
        row(1, 1, 4, 4, 900),
        row(2, 2, 4, 4, 800),
        row(3, 3, 4, 4, 700),
        row(4, 4, 4, 4, 600),
      ];
      const result = rankMatchups({
        season: 2026,
        week: 9,
        candidates: [game(1, 3, 4), game(2, 1, 2)],
        standings,
        basisWeeks: 8,
        eligible: new Set(standings.map((r) => r.managerId!)),
      });

      expect(result.selected).toBe(true);
      if (!result.selected) return;
      expect(result.matchup.combinedWins).toBe(8);
      expect(result.matchup.rankGap).toBe(1);
      // 900 + 800 beats 700 + 600.
      expect(result.matchup.combinedPointsForCents).toBe(170_000);
    });

    it('is the same answer whatever order the candidates arrive in', () => {
      const games = [game(1, 10, 9), game(2, 3, 4), game(3, 5, 6), game(4, 8, 1), game(5, 2, 7)];
      const forwards = rank(games);
      const backwards = rank([...games].reverse());

      expect(forwards).toEqual(backwards);
    });

    it('carries the evidence a reader would need to check it', () => {
      const result = rank([game(1, 10, 9), game(2, 3, 4)]);

      expect(result.selected).toBe(true);
      if (!result.selected) return;
      const evidence = result.matchup.evidence.join(' | ');
      expect(evidence).toContain('combined record 14–2');
      expect(evidence).toContain('Matty B');
      expect(evidence).toContain('ranks 1 apart');
      expect(evidence).toContain('8 finalized weeks');
      expect(evidence).toContain('next best');
    });
  });

  describe('what it refuses', () => {
    it('features nothing when the week offers no pairing', () => {
      expect(rank([])).toEqual({ selected: false, reason: 'no-candidates' });
    });

    it('features nothing before the standings mean anything', () => {
      expect(rank([game(1, 10, 9)], { basisWeeks: MIN_BASIS_WEEKS - 1 })).toEqual({
        selected: false,
        reason: 'not-enough-history',
      });
      // And the floor is a floor rather than a preference.
      expect(rank([game(1, 10, 9)], { basisWeeks: MIN_BASIS_WEEKS }).selected).toBe(true);
    });

    it('features nothing rather than picking between two identical games', () => {
      /*
       * **The ruling's own instruction, made mechanical.** Two pairings level on
       * every football key. Roster id would separate them — the sort uses it so
       * the output is stable — and it is not allowed to, because a game that is
       * only more important because of a lower roster number is not more
       * important.
       */
      const standings = [
        row(1, 1, 4, 4, 800),
        row(2, 2, 4, 4, 700),
        row(3, 3, 4, 4, 800),
        row(4, 4, 4, 4, 700),
      ];
      const result = rankMatchups({
        season: 2026,
        week: 9,
        candidates: [game(1, 1, 2), game(2, 3, 4)],
        standings,
        basisWeeks: 8,
        eligible: new Set(standings.map((r) => r.managerId!)),
      });

      expect(result).toEqual({ selected: false, reason: 'no-clear-favourite' });
    });

    it('features nothing when every candidate names somebody unpublishable', () => {
      const result = rank([game(1, 10, 9)], { eligible: new Set<string>() });
      expect(result).toEqual({ selected: false, reason: 'roster-unresolved' });
    });

    it('features nothing when a roster is not in the table at all', () => {
      // A seat that resolves to nobody is dropped rather than ranked with zeros,
      // which would make an unresolvable roster look like a winless one.
      expect(rank([game(1, 99, 98)])).toEqual({ selected: false, reason: 'roster-unresolved' });
    });
  });

  describe('the publication boundary', () => {
    it('drops a game naming a retired manager and features the next one', () => {
      /*
       * Applied **before** ranking. `lib/stats/week.ts` records what happens
       * otherwise: a boundary that removes a candidate after selection changes
       * which game gets featured, and the removed one takes the slot with it.
       */
      const withoutMattyB = new Set([...EVERYONE].filter((id) => id !== 'user-10'));
      const result = rank([game(1, 10, 9), game(2, 2, 7)], { eligible: withoutMattyB });

      expect(result.selected).toBe(true);
      if (!result.selected) return;
      // Nathan (6–2) v Brandon (5–3) — the best of what is left, not the best
      // overall with a name quietly removed.
      expect([result.matchup.aDisplayName, result.matchup.bDisplayName].sort()).toEqual([
        'Brandon',
        'Nathan',
      ]);
      expect(result.matchup.combinedWins).toBe(11);
    });
  });

  describe('head-to-head', () => {
    it('reports a rematch as evidence without letting it decide anything', () => {
      const withMeeting = rank([game(1, 10, 9), game(2, 3, 4)], {
        priorMeetings: new Map([['9-10', 1]]),
      });
      const without = rank([game(1, 10, 9), game(2, 3, 4)]);

      expect(withMeeting.selected).toBe(true);
      if (!withMeeting.selected || !without.selected) return;

      expect(withMeeting.matchup.priorMeetings).toBe(1);
      expect(without.matchup.priorMeetings).toBe(0);
      expect(withMeeting.matchup.evidence.join(' ')).toContain('met 1 time already');
      // The same game either way: a rematch is worth saying and not worth
      // scoring, and the two must not be confused.
      expect(withMeeting.matchup.sleeperMatchupId).toBe(without.matchup.sleeperMatchupId);
    });
  });
});
