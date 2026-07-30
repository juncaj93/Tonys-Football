import { readFileSync } from 'node:fs';
import path from 'node:path';

import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { closePool, getDb } from '@/lib/db';
import { fantasyMatchups, seasonMemberships, seasons, users } from '@/lib/db/schema';
import { resetDatabase } from '@/lib/db/test-helpers';
import { traverseChain } from '@/lib/sleeper/chain';
import { createFixtureSource } from '@/lib/sleeper/fixtures';
import { persistChain } from '@/lib/sleeper/persist';

import { finalizedMarginsCents, seasonFacts } from './facts';

/**
 * An independent check on the fact layer, from the raw files.
 *
 * **Commissioner ruling, 2026-07-30:** *"Do not allow the same unverified
 * narrative code path to both calculate and approve its own claims."* Stats
 * needs stronger independence than other work because a statistical error looks
 * plausible — a reversed winner or a misattributed blowout reads perfectly until
 * the person named sees it.
 *
 * `facts.test.ts` pins expected values, which is good and is not this. Those
 * numbers were read off the pipeline's own output and written down; if the
 * pipeline had a consistent bias they would have recorded the bias. So this file
 * takes the **acceptable alternative** the ruling describes: recompute from the
 * authoritative source, in a way that shares no code with the thing under test.
 *
 * ## What "no shared code" means here
 *
 * Everything below is derived by reading `fixtures/sleeper/**` with `JSON.parse`
 * and doing arithmetic in this file. It does not call `traverseChain`,
 * `derivePairings`, `toCents`, `reconcileSeason`, `resolveRoll`, or anything in
 * `lib/stats/`. Where the pipeline groups by `matchup_id`, this groups by
 * `matchup_id` **again, separately** — and if both are wrong in the same way,
 * that is a bug this cannot catch, which is stated rather than pretended
 * otherwise.
 *
 * The clock, the RNG and the roster mapping are not involved: none of these
 * assertions depends on when they run or what anybody rolled.
 */

const LEAGUE_2026 = '1385016656425668608';
const LEAGUE_2025 = '1240008879295713280';
const LEAGUE_2024 = '1113249275284205568';

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

afterAll(async () => {
  if (hasDatabase) await closePool();
});

interface RawEntry {
  readonly matchup_id: number | null;
  readonly roster_id: number;
  readonly points: number;
}

/** Read a week straight off disk. No adapter, no codec, no chain. */
function rawWeek(leagueId: string, week: number): RawEntry[] {
  const file = path.join(
    process.cwd(),
    'fixtures',
    'sleeper',
    'league',
    leagueId,
    'matchups',
    `${String(week).padStart(2, '0')}.json`,
  );
  return JSON.parse(readFileSync(file, 'utf8')) as RawEntry[];
}

/**
 * Pair a week up independently, in cents, and return the games.
 *
 * Deliberately written differently from `derivePairings`: it sorts by roster id
 * inside each matchup and rounds each score to cents *before* subtracting, which
 * is the property being checked — that a margin never inherits a float artefact.
 */
function rawGames(leagueId: string, week: number): {
  matchupId: number;
  rosters: [number, number];
  cents: [number, number];
  marginCents: number;
}[] {
  const grouped = new Map<number, RawEntry[]>();
  for (const entry of rawWeek(leagueId, week)) {
    if (entry.matchup_id === null) continue;
    const bucket = grouped.get(entry.matchup_id);
    if (bucket === undefined) grouped.set(entry.matchup_id, [entry]);
    else bucket.push(entry);
  }

  const out: ReturnType<typeof rawGames> = [];
  for (const [matchupId, bucket] of [...grouped.entries()].sort((a, b) => a[0] - b[0])) {
    if (bucket.length !== 2) continue;
    const [a, b] = [...bucket].sort((x, y) => x.roster_id - y.roster_id) as [RawEntry, RawEntry];
    const cents: [number, number] = [Math.round(a.points * 100), Math.round(b.points * 100)];
    out.push({
      matchupId,
      rosters: [a.roster_id, b.roster_id],
      cents,
      marginCents: Math.abs(cents[0] - cents[1]),
    });
  }
  return out;
}

describe.skipIf(!hasDatabase)('the fact layer, checked against the raw files', () => {
  beforeEach(async () => {
    await resetDatabase(db!);
    const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, {
      includeWeeks: true,
    });
    await persistChain(db!, chain, { sourceLabel: 'test', finalizeYears: [2024, 2025] });
  });

  it('stored every scored game the raw weeks contain, and no others', async () => {
    // Regular season plus playoffs, per league. Week 18 is unscored in both, and
    // this counts what the *files* hold rather than trusting the week classifier.
    for (const [leagueId, year] of [
      [LEAGUE_2024, 2024],
      [LEAGUE_2025, 2025],
    ] as const) {
      let expected = 0;
      for (let week = 1; week <= 17; week++) expected += rawGames(leagueId, week).length;

      const [season] = await db!.select().from(seasons).where(eq(seasons.year, year));
      const stored = await db!
        .select()
        .from(fantasyMatchups)
        .where(eq(fantasyMatchups.seasonId, season!.id));

      expect(stored.length, `${String(year)} game count`).toBe(expected);
    }
  });

  it('stored every score and margin exactly as the raw files give them', async () => {
    for (const [leagueId, year] of [
      [LEAGUE_2024, 2024],
      [LEAGUE_2025, 2025],
    ] as const) {
      const [season] = await db!.select().from(seasons).where(eq(seasons.year, year));
      const stored = await db!
        .select()
        .from(fantasyMatchups)
        .where(eq(fantasyMatchups.seasonId, season!.id));

      const byKey = new Map(
        stored.map((row) => [`${String(row.week)}:${String(row.sleeperMatchupId)}`, row]),
      );

      for (let week = 1; week <= 17; week++) {
        for (const game of rawGames(leagueId, week)) {
          const row = byKey.get(`${String(week)}:${String(game.matchupId)}`);
          const where = `${String(year)} w${String(week)} m${String(game.matchupId)}`;
          expect(row, where).toBeDefined();

          // Rosters in the same order, so a swap cannot hide inside a symmetric
          // margin.
          expect([row!.rosterAId, row!.rosterBId], where).toEqual(game.rosters);
          expect([row!.pointsACents, row!.pointsBCents], where).toEqual(game.cents);
          expect(row!.marginCents, where).toBe(game.marginCents);
        }
      }
    }
  });

  it('never names the wrong winner, checked against the raw points', async () => {
    // The claim with the most at stake. Recomputed from the file, not read back
    // from `winner_roster_id`.
    for (const [leagueId, year] of [
      [LEAGUE_2024, 2024],
      [LEAGUE_2025, 2025],
    ] as const) {
      const [season] = await db!.select().from(seasons).where(eq(seasons.year, year));
      const stored = await db!
        .select()
        .from(fantasyMatchups)
        .where(eq(fantasyMatchups.seasonId, season!.id));

      const byKey = new Map(
        stored.map((row) => [`${String(row.week)}:${String(row.sleeperMatchupId)}`, row]),
      );

      for (let week = 1; week <= 17; week++) {
        for (const game of rawGames(leagueId, week)) {
          const row = byKey.get(`${String(week)}:${String(game.matchupId)}`)!;
          const [ca, cb] = game.cents;
          const expected = ca === cb ? null : ca > cb ? game.rosters[0] : game.rosters[1];
          expect(row.winnerRosterId, `${String(year)} w${String(week)} winner`).toBe(expected);
        }
      }
    }
  });

  it('attributes a published fact to the roster that actually held the seat', async () => {
    /*
     * Roster ids are seasonal, and this is the error that reads perfectly until
     * the person named sees it. Checked by going the long way round: take a
     * published fact, find its winner's roster in the raw file for that week,
     * then look that roster up in `season_memberships` for that year and compare
     * the name.
     */
    const population = await finalizedMarginsCents(db!);
    const derived = await seasonFacts(db!, { year: 2024, historicalMarginsCents: population });
    const fact = derived.facts.find((candidate) => candidate.id === '2024-w16-largest-margin');
    expect(fact).toBeDefined();

    const game = rawGames(LEAGUE_2024, 16).find(
      (candidate) => candidate.marginCents === Math.round(fact!.margin * 100),
    );
    expect(game, 'the fact should correspond to a real game in the file').toBeDefined();

    const [ca] = game!.cents;
    const winnerRoster = ca > game!.cents[1] ? game!.rosters[0] : game!.rosters[1];

    const [season] = await db!.select().from(seasons).where(eq(seasons.year, 2024));

    // Scoped to **that season**. Roster 4 is a different person in each of the
    // three years on record, so an unscoped lookup would pass by accident on a
    // one-season database and start failing the moment a second one existed.
    const [named] = await db!
      .select({ name: users.displayName })
      .from(seasonMemberships)
      .innerJoin(users, eq(seasonMemberships.userId, users.id))
      .where(
        and(
          eq(seasonMemberships.seasonId, season!.id),
          eq(seasonMemberships.rosterId, winnerRoster),
        ),
      );

    expect(named?.name).toBe(fact!.winnerDisplayName);
  });

  it('reports the same largest margin the raw files do', async () => {
    // End to end, without touching the pipeline's own ordering: scan every raw
    // week, take the biggest margin, and check the fact layer agrees.
    let biggest = { cents: -1, year: 0, week: 0 };
    for (const [leagueId, year] of [
      [LEAGUE_2024, 2024],
      [LEAGUE_2025, 2025],
    ] as const) {
      for (let week = 1; week <= 17; week++) {
        for (const game of rawGames(leagueId, week)) {
          if (game.marginCents > biggest.cents) biggest = { cents: game.marginCents, year, week };
        }
      }
    }

    const population = await finalizedMarginsCents(db!);
    const derived = await seasonFacts(db!, {
      year: biggest.year,
      historicalMarginsCents: population,
    });
    const top = derived.facts.find(
      (fact) => fact.reasonSelected === 'Largest finalized margin of the season',
    );

    expect(top?.week).toBe(biggest.week);
    expect(Math.round((top?.margin ?? 0) * 100)).toBe(biggest.cents);
  });

  it('leaves no published margin that disagrees with its own points', async () => {
    // An invariant rather than a value: whatever the layer publishes, its three
    // numbers have to be consistent with each other to the cent.
    const population = await finalizedMarginsCents(db!);
    for (const year of [2024, 2025]) {
      const derived = await seasonFacts(db!, { year, historicalMarginsCents: population });
      for (const fact of derived.facts) {
        const recomputed =
          Math.round(fact.winnerPoints * 100) - Math.round(fact.loserPoints * 100);
        expect(Math.round(fact.margin * 100), fact.id).toBe(recomputed);
        expect(recomputed, fact.id).toBeGreaterThan(0);
      }
    }
  });
});
