import { describe, expect, it } from 'vitest';

import {
  championUserId,
  derivePairings,
  derivePlacements,
  importSeason,
  traverseChain,
  verifyLeagueShape,
  type ImportedSeason,
} from './chain';
import { createFixtureSource } from './fixtures';
import { type SleeperEndpoint } from './endpoints';
import { type SleeperFetchResult, type SleeperSource } from './transport';

/**
 * The chain adapter, exercised against the real recorded league.
 *
 * These run entirely from fixtures — no network, in CI or locally. Where a
 * scenario cannot be recorded because it has never happened (a broken chain, a
 * cycle, a kicker slot), a stub or a mutated copy stands in.
 */

const LEAGUE_2026 = '1385016656425668608';
const LEAGUE_2025 = '1240008879295713280';
const LEAGUE_2024 = '1113249275284205568';

function fixtures(): SleeperSource {
  return createFixtureSource();
}

function seasonFor(chain: readonly ImportedSeason[], year: number): ImportedSeason {
  const season = chain.find((candidate) => candidate.year === year);
  if (season === undefined) throw new Error(`No imported season for ${String(year)}`);
  return season;
}

describe('traverseChain', () => {
  it('walks 2026 → 2025 → 2024 and stops where the league began', async () => {
    const chain = await traverseChain(fixtures(), LEAGUE_2026, { includeWeeks: false });

    expect(chain.seasons.map((season) => season.year)).toEqual([2026, 2025, 2024]);
    expect(chain.seasons.map((season) => season.leagueId)).toEqual([
      LEAGUE_2026,
      LEAGUE_2025,
      LEAGUE_2024,
    ]);
    expect(chain.terminatedBy).toBe('chain_end');
    expect(chain.errors).toEqual([]);
  });

  it('confirms Tier 1 is sufficient — no season needs commissioner-supplied IDs', async () => {
    // `16 §12` Tier 2 exists for a broken chain. This asserts we are not on it.
    const chain = await traverseChain(fixtures(), LEAGUE_2026, { includeWeeks: false });

    expect(chain.seasons.at(-1)?.previousLeagueId).toBeNull();
    expect(chain.errors.some((error) => error.includes('Tier 2'))).toBe(false);
  });

  describe('failure handling', () => {
    /** A source that answers for one league and fails for everything else. */
    function brokenChainSource(): SleeperSource {
      const real = fixtures();
      return {
        label: 'broken-chain',
        async fetch(endpoint: SleeperEndpoint): Promise<SleeperFetchResult> {
          const leagueId = 'leagueId' in endpoint ? endpoint.leagueId : null;
          if (leagueId !== null && leagueId !== LEAGUE_2026) {
            return {
              kind: 'error',
              endpoint,
              status: 404,
              message: 'league not found',
              attempts: 1,
              fetchedAt: new Date(0),
            };
          }
          return real.fetch(endpoint);
        },
      };
    }

    it('keeps the seasons it imported and routes the rest to Tier 2', async () => {
      const chain = await traverseChain(brokenChainSource(), LEAGUE_2026, { includeWeeks: false });

      expect(chain.seasons.map((season) => season.year)).toEqual([2026]);
      expect(chain.terminatedBy).toBe('error');
      expect(chain.errors.some((error) => error.includes('Tier 2'))).toBe(true);
    });

    it('stops on a cycle instead of looping forever', async () => {
      // A league whose previous_league_id points at itself.
      const source: SleeperSource = {
        label: 'cyclic',
        fetch(endpoint: SleeperEndpoint): Promise<SleeperFetchResult> {
          if (endpoint.kind === 'league') {
            return Promise.resolve({
              kind: 'ok',
              endpoint,
              status: 200,
              fetchedAt: new Date(0),
              payload: {
                league_id: endpoint.leagueId,
                season: '2025',
                previous_league_id: endpoint.leagueId,
                roster_positions: ['QB', 'DEF'],
                scoring_settings: { rec: 0.5 },
                total_rosters: 10,
              },
            });
          }
          return Promise.resolve({ kind: 'empty', endpoint, status: 404, fetchedAt: new Date(0) });
        },
      };

      const chain = await traverseChain(source, 'loop', { includeWeeks: false });

      expect(chain.terminatedBy).toBe('cycle');
      expect(chain.seasons).toHaveLength(1);
      expect(chain.errors.some((error) => error.includes('cycle'))).toBe(true);
    });
  });
});

describe('league shape', () => {
  it('verifies defenses and no kickers across every recorded season', async () => {
    const chain = await traverseChain(fixtures(), LEAGUE_2026, { includeWeeks: false });

    for (const season of chain.seasons) {
      expect(season.shape.ok, `${String(season.year)} shape`).toBe(true);
      expect(season.shape.hasDefense).toBe(true);
      expect(season.shape.hasKicker).toBe(false);
      expect(season.shape.receptionPoints).toBe(0.5);
      expect(season.shape.totalRosters).toBe(10);
    }
  });

  it('flags a kicker slot as a product-rule violation', () => {
    const report = verifyLeagueShape({
      totalRosters: 10,
      rosterPositions: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'],
      scoringSettings: { rec: 0.5 },
    });

    expect(report.ok).toBe(false);
    expect(report.violations.some((v) => v.includes('no kickers'))).toBe(true);
  });

  it('flags a missing defense', () => {
    const report = verifyLeagueShape({
      totalRosters: 10,
      rosterPositions: ['QB', 'RB', 'WR', 'TE'],
      scoringSettings: { rec: 0.5 },
    });

    expect(report.ok).toBe(false);
    expect(report.violations.some((v) => v.includes('defenses'))).toBe(true);
  });

  it('treats an unexpected team count as a note, not a violation', () => {
    // An expansion would be surprising, not illegal.
    const report = verifyLeagueShape({
      totalRosters: 12,
      rosterPositions: ['QB', 'DEF'],
      scoringSettings: { rec: 0.5 },
    });

    expect(report.ok).toBe(true);
    expect(report.notes.some((note) => note.includes('12 teams'))).toBe(true);
  });
});

describe('champions derived from the bracket', () => {
  it('derives 2025 and 2024 champions rather than accepting entered values', async () => {
    const chain = await traverseChain(fixtures(), LEAGUE_2026, { includeWeeks: false });

    const season2025 = seasonFor(chain.seasons, 2025);
    const champion2025 = season2025.users.find(
      (user) => user.userId === championUserId(season2025),
    );
    expect(champion2025?.displayName).toBe('MattyB2317');
    expect(season2025.placements.championRosterId).toBe(10);
    expect(season2025.placements.runnerUpRosterId).toBe(6);
    expect(season2025.placements.thirdPlaceRosterId).toBe(8);

    const season2024 = seasonFor(chain.seasons, 2024);
    const champion2024 = season2024.users.find(
      (user) => user.userId === championUserId(season2024),
    );
    // Confirmed by the commissioner on 2026-07-28: Alex = BigJuncer.
    expect(champion2024?.displayName).toBe('BigJuncer');
    expect(season2024.placements.championRosterId).toBe(1);
  });

  it('returns the champion as a person, never a roster slot', async () => {
    // A ring is permanent and belongs to a user; the roster that won it is
    // seasonal and will belong to someone else (`16 §5.1`).
    const chain = await traverseChain(fixtures(), LEAGUE_2026, { includeWeeks: false });
    const season = seasonFor(chain.seasons, 2025);

    expect(championUserId(season)).toBe('993992889480904704');
  });

  it('reports no champion for an unplayed season instead of guessing', async () => {
    const chain = await traverseChain(fixtures(), LEAGUE_2026, { includeWeeks: false });
    const season2026 = seasonFor(chain.seasons, 2026);

    expect(season2026.placements.championRosterId).toBeNull();
    expect(championUserId(season2026)).toBeNull();
    expect(season2026.warnings.some((w) => w.includes('has not been played'))).toBe(true);
  });

  it('fills placement positions from both the winner and the loser', () => {
    const placements = derivePlacements([
      { matchId: 6, round: 3, placement: 1, team1RosterId: 6, team2RosterId: 10, winnerRosterId: 10, loserRosterId: 6 },
      { matchId: 7, round: 3, placement: 3, team1RosterId: 8, team2RosterId: 5, winnerRosterId: 8, loserRosterId: 5 },
    ]);

    expect(placements.byPosition).toEqual({ 1: 10, 2: 6, 3: 8, 4: 5 });
  });
});

describe('identity across seasons', () => {
  /**
   * The single most important rule in the data model (`16 §5.1`): a roster
   * slot is not a person. The plan's example named roster 7; the live data
   * puts the turnover in roster 4, and roster 7 is in fact held by the same
   * manager all three years. This test asserts the real case.
   */
  it('shows three different people in roster 4 across three seasons', async () => {
    const chain = await traverseChain(fixtures(), LEAGUE_2026, { includeWeeks: false });

    const holderOf = (year: number, rosterId: number): string | undefined => {
      const season = seasonFor(chain.seasons, year);
      const seat = season.seats.find((candidate) => candidate.rosterId === rosterId);
      return season.users.find((user) => user.userId === seat?.primaryUserId)?.displayName;
    };

    expect(holderOf(2024, 4)).toBe('Anthonyberardo');
    expect(holderOf(2025, 4)).toBe('Tupaz11');
    expect(holderOf(2026, 4)).toBe('zackstephens54');

    // Three distinct Sleeper accounts, so three distinct `users` rows.
    const owners = [2024, 2025, 2026].map((year) => {
      const season = seasonFor(chain.seasons, year);
      return season.seats.find((seat) => seat.rosterId === 4)?.primaryUserId;
    });
    expect(new Set(owners).size).toBe(3);
  });

  it('does not mistake continuity for turnover — roster 7 is the same manager throughout', async () => {
    const chain = await traverseChain(fixtures(), LEAGUE_2026, { includeWeeks: false });

    const owners = [2024, 2025, 2026].map((year) => {
      const season = seasonFor(chain.seasons, year);
      return season.seats.find((seat) => seat.rosterId === 7)?.primaryUserId;
    });

    expect(new Set(owners).size).toBe(1);
  });
});

describe('co-owners', () => {
  /**
   * Commissioner decision, 2026-07-28, option (a): co-owners are imported as
   * people but hold no membership. Exactly one primary manager per roster.
   */
  it('keeps 2025 roster 4 to one primary manager with the co-owner recorded alongside', async () => {
    const season = await importSeason(fixtures(), LEAGUE_2025, { includeWeeks: false });
    const seat = season.seats.find((candidate) => candidate.rosterId === 4);

    expect(seat?.primaryUserId).toBe('1251952575964524544'); // Tupaz11
    expect(seat?.coOwnerUserIds).toEqual(['604375476017885184']); // topouzzz
  });

  it('imports the co-owner as a person with no seat of their own', async () => {
    const season = await importSeason(fixtures(), LEAGUE_2025, { includeWeeks: false });

    // 11 people in the league, 10 seats.
    expect(season.users).toHaveLength(11);
    expect(season.seats).toHaveLength(10);
    expect(season.rosterlessUserIds).toEqual(['604375476017885184']);

    const coOwner = season.users.find((user) => user.userId === '604375476017885184');
    expect(coOwner?.displayName).toBe('topouzzz');
  });

  it('says out loud that a rosterless person got no membership', async () => {
    const season = await importSeason(fixtures(), LEAGUE_2025, { includeWeeks: false });

    expect(
      season.warnings.some(
        (warning) => warning.includes('topouzzz') && warning.includes('no membership'),
      ),
    ).toBe(true);
  });

  it('leaves exactly one seat per roster in every season', async () => {
    const chain = await traverseChain(fixtures(), LEAGUE_2026, { includeWeeks: false });

    for (const season of chain.seasons) {
      const rosterIds = season.seats.map((seat) => seat.rosterId);
      expect(new Set(rosterIds).size, `${String(season.year)} duplicate roster`).toBe(
        rosterIds.length,
      );

      const primaries = season.seats
        .map((seat) => seat.primaryUserId)
        .filter((id): id is string => id !== null);
      expect(new Set(primaries).size, `${String(season.year)} duplicate manager`).toBe(
        primaries.length,
      );
    }
  });
});

describe('weekly data', () => {
  it('collapses opposing rows into one pairing per matchup', async () => {
    const season = await importSeason(fixtures(), LEAGUE_2025, { maxWeek: 3 });
    const week3 = season.weeks.find((week) => week.week === 3);

    expect(week3?.pairings).toHaveLength(5); // ten rosters, five games
    for (const pairing of week3?.pairings ?? []) {
      expect(pairing.rosterAId).toBeLessThan(pairing.rosterBId);
    }
  });

  it('records the winner and margin deterministically', () => {
    const { pairings } = derivePairings([
      { rosterId: 6, matchupId: 1, points: 148.36, starters: [], startersPoints: [], players: [], playerPoints: {} },
      { rosterId: 8, matchupId: 1, points: 146.62, starters: [], startersPoints: [], players: [], playerPoints: {} },
    ]);

    expect(pairings[0]).toMatchObject({
      rosterAId: 6,
      rosterBId: 8,
      winnerRosterId: 6,
      margin: 1.74,
    });
  });

  it('reports a tie as no winner rather than picking one', () => {
    const { pairings } = derivePairings([
      { rosterId: 1, matchupId: 1, points: 100, starters: [], startersPoints: [], players: [], playerPoints: {} },
      { rosterId: 2, matchupId: 1, points: 100, starters: [], startersPoints: [], players: [], playerPoints: {} },
    ]);

    expect(pairings[0]?.winnerRosterId).toBeNull();
    expect(pairings[0]?.margin).toBe(0);
  });

  /**
   * Eliminated rosters keep scoring during the playoffs with no matchup. That
   * is the state `16 §7.4` builds on — "eliminated managers dim, they do not
   * disappear" — so it is data, not an anomaly, and must not raise a warning.
   */
  it('treats unpaired playoff-week rosters as data, not warnings', async () => {
    const season = await importSeason(fixtures(), LEAGUE_2025, { maxWeek: 17 });
    const championshipWeek = season.weeks.find((week) => week.week === 17);

    expect(championshipWeek?.pairings).toHaveLength(2); // final and third-place
    expect(championshipWeek?.unpairedRosterIds).toHaveLength(6);
    expect(championshipWeek?.warnings).toEqual([]);
  });

  it('warns only when a matchup has the wrong number of rosters', () => {
    const { pairings, warnings } = derivePairings([
      { rosterId: 1, matchupId: 1, points: 100, starters: [], startersPoints: [], players: [], playerPoints: {} },
    ]);

    expect(pairings).toHaveLength(0);
    expect(warnings[0]).toContain('expected 2');
  });

  it('imports a full completed season', async () => {
    const season = await importSeason(fixtures(), LEAGUE_2025);

    expect(season.isComplete).toBe(true);
    expect(season.playoffWeekStart).toBe(15);
    // Fourteen regular-season weeks, each a full slate.
    for (let week = 1; week <= 14; week++) {
      expect(season.weeks.find((w) => w.week === week)?.pairings, `week ${String(week)}`)
        .toHaveLength(5);
    }
  });

  it('keeps failed waiver claims — they are story material', async () => {
    const season = await importSeason(fixtures(), LEAGUE_2025, { maxWeek: 3 });
    const week3 = season.weeks.find((week) => week.week === 3);

    expect(week3?.transactions.some((tx) => tx.status === 'failed')).toBe(true);
  });

  describe('transaction coverage across the recorded seasons', () => {
    async function allTransactions(leagueId: string) {
      const season = await importSeason(fixtures(), leagueId);
      return season.weeks.flatMap((week) => week.transactions);
    }

    it('imports every transaction in both completed seasons', async () => {
      // Counted directly from the recorded payloads.
      expect(await allTransactions(LEAGUE_2025)).toHaveLength(407);
      expect(await allTransactions(LEAGUE_2024)).toHaveLength(554);
    });

    it('represents all four transaction types', async () => {
      const types = new Set(
        [...(await allTransactions(LEAGUE_2025)), ...(await allTransactions(LEAGUE_2024))].map(
          (tx) => tx.type,
        ),
      );

      expect(types).toEqual(new Set(['waiver', 'free_agent', 'trade', 'commissioner']));
    });

    it('keeps both failed and successful waivers, with bids on the winners', async () => {
      const waivers = (await allTransactions(LEAGUE_2025)).filter((tx) => tx.type === 'waiver');

      expect(waivers.filter((tx) => tx.status === 'failed')).toHaveLength(70);
      expect(waivers.filter((tx) => tx.status === 'complete')).toHaveLength(98);
      expect(waivers.every((tx) => tx.waiverBid !== null)).toBe(true);
    });

    it('records FAAB on the trades that moved it', async () => {
      const trades = [
        ...(await allTransactions(LEAGUE_2025)),
        ...(await allTransactions(LEAGUE_2024)),
      ].filter((tx) => tx.type === 'trade');

      expect(trades).toHaveLength(41);
      expect(trades.filter((tx) => tx.faabTransfers.length > 0)).toHaveLength(23);

      for (const trade of trades) {
        // Every trade names the rosters that agreed to it.
        expect(trade.consenterRosterIds.length).toBeGreaterThan(0);
        for (const transfer of trade.faabTransfers) {
          expect(transfer.amount).toBeGreaterThan(0);
          expect(transfer.fromRosterId).not.toBe(transfer.toRosterId);
        }
      }
    });

    it('gives every add and drop a destination roster', async () => {
      for (const tx of await allTransactions(LEAGUE_2025)) {
        for (const rosterId of Object.values(tx.adds)) {
          expect(tx.rosterIds).toContain(rosterId);
        }
        for (const rosterId of Object.values(tx.drops)) {
          expect(tx.rosterIds).toContain(rosterId);
        }
      }
    });

    it('trades every player it drops — both sides of the swap are present', async () => {
      const trades = (await allTransactions(LEAGUE_2025)).filter((tx) => tx.type === 'trade');

      for (const trade of trades) {
        for (const [playerId, toRosterId] of Object.entries(trade.adds)) {
          const fromRosterId = trade.drops[playerId];
          // A traded player is dropped by one roster and added by the other.
          expect(fromRosterId).toBeDefined();
          expect(fromRosterId).not.toBe(toRosterId);
        }
      }
    });
  });

  it('reports no weekly data for a season that has not started', async () => {
    const season = await importSeason(fixtures(), LEAGUE_2026);

    expect(season.status).toBe('pre_draft');
    expect(season.isComplete).toBe(false);
    expect(season.weeks).toEqual([]);
  });
});

describe('re-import stability', () => {
  // Re-syncing must be a no-op (`16 §13`, P1 gate). Byte-identical output is
  // the strongest form of that guarantee, and it has to hold before anything
  // starts writing these values to the database.
  it('produces identical output on a second import', async () => {
    const first = await importSeason(fixtures(), LEAGUE_2025);
    const second = await importSeason(fixtures(), LEAGUE_2025);

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
