import { describe, expect, it } from 'vitest';

import { traverseChain, type ImportedSeason } from './chain';
import { createFixtureSource } from './fixtures';
import { isPairingDisputed, isWeekDisputed, reconcileSeason, toCents } from './reconcile';

const LEAGUE_2026 = '1385016656425668608';

async function seasons(): Promise<readonly ImportedSeason[]> {
  const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, { includeWeeks: true });
  return chain.seasons;
}

const nameOf = (season: ImportedSeason, rosterId: number): string => {
  const seat = season.seats.find((candidate) => candidate.rosterId === rosterId);
  return season.users.find((u) => u.userId === seat?.primaryUserId)?.displayName ?? '?';
};

describe('toCents', () => {
  it('avoids the float drift that would manufacture a conflict', () => {
    // 0.1 + 0.2 in floats is 0.30000000000000004. Summed over fourteen weeks
    // and compared to a stored total, that alone reads as a discrepancy.
    expect(toCents(0.1) + toCents(0.2)).toBe(toCents(0.3));
    expect(toCents(1859.74)).toBe(185974);
    expect(toCents(149.9)).toBe(14990);
  });
});

describe('2024 — the season with a real contradiction', () => {
  it('detects exactly the four record conflicts the audit verified', async () => {
    const season = (await seasons()).find((s) => s.year === 2024)!;
    const check = season.reconciliation!;

    expect(check.recordConflicts.map((c) => c.rosterId)).toEqual([5, 6, 9, 10]);

    // Finalized standings on the left; the current scoring snapshot on the right.
    expect(check.recordConflicts).toEqual([
      { rosterId: 5, finalized: { wins: 6, losses: 8, ties: 0 }, snapshot: { wins: 5, losses: 9, ties: 0 } },
      { rosterId: 6, finalized: { wins: 8, losses: 6, ties: 0 }, snapshot: { wins: 9, losses: 5, ties: 0 } },
      { rosterId: 9, finalized: { wins: 10, losses: 4, ties: 0 }, snapshot: { wins: 9, losses: 5, ties: 0 } },
      { rosterId: 10, finalized: { wins: 5, losses: 9, ties: 0 }, snapshot: { wins: 6, losses: 8, ties: 0 } },
    ]);
  });

  it('detects exactly the five points conflicts the audit verified', async () => {
    const season = (await seasons()).find((s) => s.year === 2024)!;
    const check = season.reconciliation!;

    expect(check.pointsConflicts.map((c) => c.rosterId)).toEqual([1, 2, 3, 5, 10]);

    // The deltas are in cents and signed, and they are what identifies the
    // cause: a stat correction moved the players, not the standings.
    expect(
      check.pointsConflicts.map((c) => [c.rosterId, c.finalizedPointsFor, c.deltaCents]),
    ).toEqual([
      [1, 1787.52, 100],
      [2, 1786.99, -99],
      [3, 1523.7, -100],
      [5, 1743.38, -100],
      [10, 1687.48, 100],
    ]);
  });

  it('names the two disputed games, and keeps the finalized winner', async () => {
    const season = (await seasons()).find((s) => s.year === 2024)!;
    const check = season.reconciliation!;

    expect(check.disputedGames).toHaveLength(2);
    expect(check.recordSource).toBe('sleeper_metadata');

    const [week13, week14] = check.disputedGames;

    // MattLee04 is the official winner; the current points say MattyB2317.
    expect(week13).toMatchObject({
      week: 13,
      rosterAId: 9,
      rosterBId: 10,
      snapshotPointsA: 130.84,
      snapshotPointsB: 131.4,
      snapshotWinnerRosterId: 10,
      finalizedWinnerRosterId: 9,
    });
    expect(nameOf(season, week13!.finalizedWinnerRosterId!)).toBe('MattLee04');
    expect(nameOf(season, week13!.snapshotWinnerRosterId!)).toBe('MattyB2317');

    // SuggMyNick is the official winner; the current points say RonJonathan.
    expect(week14).toMatchObject({
      week: 14,
      rosterAId: 5,
      rosterBId: 6,
      snapshotPointsA: 149.18,
      snapshotPointsB: 149.9,
      snapshotWinnerRosterId: 6,
      finalizedWinnerRosterId: 5,
    });
    expect(nameOf(season, week14!.finalizedWinnerRosterId!)).toBe('SuggMyNick');
  });

  it('the points drift and the disputed games explain each other', async () => {
    const season = (await seasons()).find((s) => s.year === 2024)!;
    const check = season.reconciliation!;
    const delta = (rosterId: number) =>
      check.pointsConflicts.find((c) => c.rosterId === rosterId)?.deltaCents ?? 0;

    // Undo the drift and both disputed games land on the finalized result.
    // That is what identifies this as one stat correction rather than two
    // unrelated errors — and it is why the finalized record is the coherent one.
    const week13 = check.disputedGames.find((g) => g.week === 13)!;
    expect(toCents(week13.snapshotPointsA) - delta(9)).toBeGreaterThan(
      toCents(week13.snapshotPointsB) - delta(10),
    );

    const week14 = check.disputedGames.find((g) => g.week === 14)!;
    expect(toCents(week14.snapshotPointsA) - delta(5)).toBeGreaterThan(
      toCents(week14.snapshotPointsB) - delta(6),
    );
  });

  it('flags the weeks a scoring claim must not be published from', async () => {
    const season = (await seasons()).find((s) => s.year === 2024)!;
    const check = season.reconciliation!;

    expect(isWeekDisputed(check, 13)).toBe(true);
    expect(isWeekDisputed(check, 14)).toBe(true);
    expect(isWeekDisputed(check, 12)).toBe(false);

    // Order-independent: callers should not have to know which roster we
    // happened to sort first.
    expect(isPairingDisputed(check, 13, 9, 10)).toBe(true);
    expect(isPairingDisputed(check, 13, 10, 9)).toBe(true);
    expect(isPairingDisputed(check, 13, 1, 2)).toBe(false);
  });

  it("catches the trap: 2024's closest game is one of the disputed ones", async () => {
    const season = (await seasons()).find((s) => s.year === 2024)!;
    const check = season.reconciliation!;

    const regular = season.weeks.filter((week) => week.type === 'regular');
    const closest = regular
      .flatMap((week) => week.pairings.map((pairing) => ({ week: week.week, pairing })))
      .reduce((best, current) => (current.pairing.margin < best.pairing.margin ? current : best));

    expect(closest.pairing.margin).toBeCloseTo(0.56, 2);
    // "Closest game in league history" would publish the wrong winner today.
    expect(
      isPairingDisputed(check, closest.week, closest.pairing.rosterAId, closest.pairing.rosterBId),
    ).toBe(true);
  });

  it('never resolves the contradiction, only reports it', async () => {
    const season = (await seasons()).find((s) => s.year === 2024)!;
    const check = season.reconciliation!;

    // The finalized record is untouched by reconciliation: what the seats
    // carry is still exactly what Sleeper's settings said.
    const roster9 = season.seats.find((s) => s.rosterId === 9)!;
    expect([roster9.wins, roster9.losses]).toEqual([10, 4]);

    // And no averaging, no midpoint, no "corrected" value anywhere.
    expect(check.isClean).toBe(false);
    expect(check.warnings.some((w) => w.includes('finalized record stands'))).toBe(true);
    expect(check.warnings.some((w) => w.includes('finalized result is official'))).toBe(true);
  });
});

describe('2025 — clean', () => {
  it('reports zero conflicts of every kind', async () => {
    const season = (await seasons()).find((s) => s.year === 2025)!;
    const check = season.reconciliation!;

    expect(check.recordConflicts).toEqual([]);
    expect(check.pointsConflicts).toEqual([]);
    expect(check.disputedGames).toEqual([]);
    expect(check.isClean).toBe(true);
    expect(check.warnings).toEqual([]);
  });

  it('matches the finalized points total to the cent for all ten rosters', async () => {
    const season = (await seasons()).find((s) => s.year === 2025)!;

    // The property that proves settings.fpts is a regular-season total, which
    // is what makes comparing it to weeks 1–14 legitimate in the first place.
    for (const seat of season.seats) {
      const summed = season.weeks
        .filter((week) => week.type === 'regular')
        .flatMap((week) => week.entries.filter((entry) => entry.rosterId === seat.rosterId))
        .reduce((total, entry) => total + toCents(entry.points), 0);

      expect(summed, `roster ${String(seat.rosterId)}`).toBe(toCents(seat.pointsFor));
    }
  });
});

describe('reconcileSeason directly', () => {
  it('says so when there is nothing to compare against', () => {
    const check = reconcileSeason({
      year: 2026,
      capturedAt: null,
      seats: [{ rosterId: 1, wins: 0, losses: 0, ties: 0, pointsFor: 0, record: null }],
      weeks: [],
    });

    expect(check.isClean).toBe(true);
    expect(check.warnings.join(' ')).toContain('No regular-season weeks');
  });

  it('ignores playoff weeks, which the finalized record does not include', () => {
    const check = reconcileSeason({
      year: 2030,
      capturedAt: null,
      seats: [
        { rosterId: 1, wins: 1, losses: 0, ties: 0, pointsFor: 100, record: 'W' },
        { rosterId: 2, wins: 0, losses: 1, ties: 0, pointsFor: 90, record: 'L' },
      ],
      weeks: [
        {
          week: 1,
          type: 'regular',
          pairings: [{ matchupId: 1, rosterAId: 1, rosterBId: 2, pointsA: 100, pointsB: 90, winnerRosterId: 1, margin: 10 }],
          pointsByRoster: { 1: 100, 2: 90 },
        },
        {
          // A playoff week would double-count both the record and the points
          // if it were folded into the regular-season comparison.
          week: 15,
          type: 'playoff',
          pairings: [{ matchupId: 1, rosterAId: 1, rosterBId: 2, pointsA: 111, pointsB: 99, winnerRosterId: 1, margin: 12 }],
          pointsByRoster: { 1: 111, 2: 99 },
        },
      ],
    });

    expect(check.isClean).toBe(true);
  });

  it('records a tie as a tie rather than picking a winner', () => {
    const check = reconcileSeason({
      year: 2030,
      capturedAt: null,
      seats: [
        { rosterId: 1, wins: 0, losses: 0, ties: 1, pointsFor: 100, record: 'T' },
        { rosterId: 2, wins: 0, losses: 0, ties: 1, pointsFor: 100, record: 'T' },
      ],
      weeks: [
        {
          week: 1,
          type: 'regular',
          pairings: [{ matchupId: 1, rosterAId: 1, rosterBId: 2, pointsA: 100, pointsB: 100, winnerRosterId: null, margin: 0 }],
          pointsByRoster: { 1: 100, 2: 100 },
        },
      ],
    });

    expect(check.isClean).toBe(true);
    expect(check.disputedGames).toEqual([]);
  });

  it('flags a tie that the scoring snapshot has since broken', () => {
    const check = reconcileSeason({
      year: 2030,
      capturedAt: null,
      seats: [
        { rosterId: 1, wins: 0, losses: 0, ties: 1, pointsFor: 100, record: 'T' },
        { rosterId: 2, wins: 0, losses: 0, ties: 1, pointsFor: 100, record: 'T' },
      ],
      weeks: [
        {
          week: 1,
          type: 'regular',
          // A correction has nudged roster 1 ahead of a game the league
          // recorded as drawn.
          pairings: [{ matchupId: 1, rosterAId: 1, rosterBId: 2, pointsA: 100.5, pointsB: 100, winnerRosterId: 1, margin: 0.5 }],
          pointsByRoster: { 1: 100.5, 2: 100 },
        },
      ],
    });

    expect(check.disputedGames).toHaveLength(1);
    expect(check.disputedGames[0]).toMatchObject({ week: 1, finalizedWinnerRosterId: null });
  });

  it('carries the capture timestamp, because the snapshot is mutable upstream', async () => {
    const season = (await seasons()).find((s) => s.year === 2024)!;

    expect(season.reconciliation!.capturedAt).toBeInstanceOf(Date);
    expect(season.capturedAt).toBeInstanceOf(Date);
    // Every week is datable too, which is what Phase B persists per row.
    for (const week of season.weeks) {
      expect(week.capturedAt, `week ${String(week.week)}`).toBeInstanceOf(Date);
    }
  });
});
