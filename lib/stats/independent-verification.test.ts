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

import { activeLeagueManagers } from '@/lib/league/membership';
import { factPacket } from '@/lib/slice/packet';
import { renderEdition } from '@/lib/slice/render';

import { finalizedMarginsCents, seasonFacts } from './facts';
import { standingsThrough, winStreak } from './standings';
import { seasonWeeks } from './week';

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

  /* ---- the week, recomputed from the files ---------------------------- */

  it('agrees on every tie, and never invents a winner for one', async () => {
    /*
     * A tie is the case where a wrong answer is most plausible and least
     * visible: `winner_roster_id` has to be null, and a pipeline that defaulted
     * to roster A would be right half the time by accident.
     */
    for (const [leagueId, year] of [
      [LEAGUE_2024, 2024],
      [LEAGUE_2025, 2025],
    ] as const) {
      const [season] = await db!.select().from(seasons).where(eq(seasons.year, year));
      const stored = await db!
        .select()
        .from(fantasyMatchups)
        .where(eq(fantasyMatchups.seasonId, season!.id));

      const rawTies = new Set<string>();
      for (let week = 1; week <= 17; week++) {
        for (const game of rawGames(leagueId, week)) {
          if (game.cents[0] === game.cents[1]) {
            rawTies.add(`${String(week)}:${String(game.matchupId)}`);
          }
        }
      }

      const storedTies = new Set(
        stored
          .filter((row) => row.winnerRosterId === null)
          .map((row) => `${String(row.week)}:${String(row.sleeperMatchupId)}`),
      );

      expect(storedTies, `${String(year)} ties`).toEqual(rawTies);
    }
  });

  it('agrees on the highest and lowest score of every week', async () => {
    // Scanned off the raw entries, including rosters with no game that week —
    // a week's extremes are about scores, not about pairings.
    for (const [leagueId, year] of [
      [LEAGUE_2024, 2024],
      [LEAGUE_2025, 2025],
    ] as const) {
      const [season] = await db!.select().from(seasons).where(eq(seasons.year, year));
      const stored = await db!
        .select()
        .from(fantasyMatchups)
        .where(eq(fantasyMatchups.seasonId, season!.id));

      for (let week = 1; week <= 17; week++) {
        const games = rawGames(leagueId, week);
        if (games.length === 0) continue;

        const rawScores = games.flatMap((game) => game.cents);
        const inWeek = stored.filter((row) => row.week === week);
        const storedScores = inWeek.flatMap((row) => [row.pointsACents, row.pointsBCents]);

        const where = `${String(year)} w${String(week)}`;
        expect(Math.max(...storedScores), `${where} high`).toBe(Math.max(...rawScores));
        expect(Math.min(...storedScores), `${where} low`).toBe(Math.min(...rawScores));
      }
    }
  });

  it('agrees on the closest game and the widest of every week', async () => {
    for (const [leagueId, year] of [
      [LEAGUE_2024, 2024],
      [LEAGUE_2025, 2025],
    ] as const) {
      const [season] = await db!.select().from(seasons).where(eq(seasons.year, year));
      const stored = await db!
        .select()
        .from(fantasyMatchups)
        .where(eq(fantasyMatchups.seasonId, season!.id));

      for (let week = 1; week <= 17; week++) {
        const games = rawGames(leagueId, week);
        if (games.length === 0) continue;
        const inWeek = stored.filter((row) => row.week === week);
        const where = `${String(year)} w${String(week)}`;

        expect(
          Math.min(...inWeek.map((row) => row.marginCents)),
          `${where} closest`,
        ).toBe(Math.min(...games.map((game) => game.marginCents)));
        expect(
          Math.max(...inWeek.map((row) => row.marginCents)),
          `${where} widest`,
        ).toBe(Math.max(...games.map((game) => game.marginCents)));
      }
    }
  });

  it('counts the finalized population the raw files describe', async () => {
    // The population every percentile is measured against. A pipeline that
    // silently dropped a season would still produce plausible percentiles.
    let expected = 0;
    for (const leagueId of [LEAGUE_2024, LEAGUE_2025]) {
      for (let week = 1; week <= 17; week++) expected += rawGames(leagueId, week).length;
    }
    expect((await finalizedMarginsCents(db!)).length).toBe(expected);
  });

  it('places a margin at the percentile the raw population puts it at', async () => {
    /*
     * The percentile drives every tier above `beat`, so an off-by-one in the
     * population or in the comparison would relabel real games. Recomputed here
     * with the weak definition stated in `significance.ts` — the share at or
     * below — over a population built from the files.
     */
    const population: number[] = [];
    for (const leagueId of [LEAGUE_2024, LEAGUE_2025]) {
      for (let week = 1; week <= 17; week++) {
        for (const game of rawGames(leagueId, week)) population.push(game.marginCents);
      }
    }
    population.sort((a, b) => a - b);

    const derived = await seasonFacts(db!, {
      year: 2024,
      historicalMarginsCents: await finalizedMarginsCents(db!),
    });

    for (const fact of derived.facts) {
      if (fact.historicalMarginPercentile === null) continue;
      const cents = Math.round(fact.margin * 100);
      const atOrBelow = population.filter((value) => value <= cents).length;
      expect(
        fact.historicalMarginPercentile,
        `${fact.id} percentile`,
      ).toBe(Math.round((atOrBelow / population.length) * 100));
    }
  });

  /* ---- invariants that catch a class of error rather than a value ------ */

  it('never publishes a score that could be cents or a double division', async () => {
    /*
     * The units trap, as an assertion about *magnitude*.
     *
     * The Slice printed a real matchup as `1.84 to 1.10` and every structural
     * test passed, because the allowed-number list and the prose came off the
     * same broken helper. A pinned value would have recorded the bug. A range
     * cannot: no week in this league is decided 1.84 to 1.10, and none is decided
     * 18412 to 10998.
     */
    const population = await finalizedMarginsCents(db!);
    for (const year of [2024, 2025]) {
      const derived = await seasonFacts(db!, { year, historicalMarginsCents: population });
      for (const fact of derived.facts) {
        for (const value of [fact.winnerPoints, fact.loserPoints]) {
          expect(value, `${fact.id} score magnitude`).toBeGreaterThan(30);
          expect(value, `${fact.id} score magnitude`).toBeLessThan(300);
        }
      }
    }
  });

  it('never publishes a margin wider than the two scores can support', async () => {
    const population = await finalizedMarginsCents(db!);
    for (const year of [2024, 2025]) {
      const derived = await seasonFacts(db!, { year, historicalMarginsCents: population });
      for (const fact of derived.facts) {
        expect(fact.margin, fact.id).toBeGreaterThan(0);
        expect(fact.margin, fact.id).toBeLessThanOrEqual(fact.winnerPoints);
        expect(fact.winnerPoints, fact.id).toBeGreaterThan(fact.loserPoints);
      }
    }
  });

  it('resolves every participant inside the season the game belongs to', async () => {
    /*
     * Roster 4 is a different person in each of the three years on record, so a
     * lookup that forgot to scope by season would attribute a blowout to somebody
     * who was not there — the error that reads perfectly until the person named
     * sees it.
     */
    const population = await finalizedMarginsCents(db!);
    for (const year of [2024, 2025]) {
      const [season] = await db!.select().from(seasons).where(eq(seasons.year, year));
      const seats = await db!
        .select({ userId: seasonMemberships.userId, name: users.displayName })
        .from(seasonMemberships)
        .innerJoin(users, eq(seasonMemberships.userId, users.id))
        .where(eq(seasonMemberships.seasonId, season!.id));

      const inSeason = new Map(seats.map((seat) => [seat.userId, seat.name]));

      const derived = await seasonFacts(db!, { year, historicalMarginsCents: population });
      for (const fact of derived.facts) {
        expect(inSeason.get(fact.winnerManagerId), `${fact.id} winner`).toBe(
          fact.winnerDisplayName,
        );
        expect(inSeason.get(fact.loserManagerId), `${fact.id} loser`).toBe(fact.loserDisplayName);
      }
    }
  });

  it('publishes nothing about a season whose books are open', async () => {
    /*
     * 2026 is imported and unfinalized. Every fact suppresses, and the Slice
     * refuses — no past-tense result copy may exist for a week that can still
     * move. Checked at both layers, because either one alone could regress.
     */
    const derived = await seasonFacts(db!, { year: 2026, historicalMarginsCents: [] });
    expect(derived.facts).toEqual([]);
    expect(derived.suppressed.length).toBeGreaterThan(0);

    for (let week = 1; week <= 3; week++) {
      const packet = await factPacket(db!, { season: 2026, week });
      expect(packet.refusal, `2026 w${String(week)}`).not.toBeNull();
      const issue = renderEdition(packet);
      expect(issue.body, `2026 w${String(week)}`).toBe('');
      expect(issue.scoreboard, `2026 w${String(week)}`).toEqual([]);
      expect(issue.nothingToPrint, `2026 w${String(week)}`).not.toBeNull();
    }
  });

  it('leaves a finalized season immutable', async () => {
    // `finalized_at` is the act of closing the books, and the triggers key on it.
    // A season that can still be edited is a season whose published facts can
    // change under a reader.
    for (const year of [2024, 2025]) {
      const [season] = await db!.select().from(seasons).where(eq(seasons.year, year));
      expect(season?.finalizedAt, String(year)).not.toBeNull();

      await expect(
        db!
          .update(fantasyMatchups)
          .set({ pointsACents: 1 })
          .where(eq(fantasyMatchups.seasonId, season!.id)),
      ).rejects.toThrow();
    }
  });

  /* ---- identity, and who may be published ----------------------------- */

  it('names people by their canonical league name, never by a Sleeper handle', async () => {
    /*
     * `16 §4`: permanent manager identity is separate from a seasonal Sleeper
     * roster identity. A fact that used the handle would have the right person and
     * the wrong identity, and it would be wrong again the day somebody renames
     * themselves upstream.
     */
    const rows = await db!
      .select({ name: users.displayName, handle: users.sleeperUsername })
      .from(users);

    const handles = new Set(
      rows.map((row) => row.handle).filter((handle): handle is string => handle !== null),
    );

    const population = await finalizedMarginsCents(db!);
    for (const year of [2024, 2025]) {
      const derived = await seasonFacts(db!, { year, historicalMarginsCents: population });
      for (const fact of derived.facts) {
        for (const name of [fact.winnerDisplayName, fact.loserDisplayName]) {
          // Only a violation when the handle differs from the display name;
          // somebody whose handle *is* their name is not evidence of anything.
          const row = rows.find((candidate) => candidate.name === name);
          expect(row, `${name} should be a known manager`).toBeDefined();
          if (row!.handle !== null && row!.handle !== name) {
            expect(handles.has(name), `${fact.id} used a handle`).toBe(false);
          }
        }
      }
    }
  });

  it('keeps a retired manager out of everything the Slice publishes', async () => {
    /*
     * The commissioner's ruling is absolute: from the navigable product's point
     * of view they do not exist. The fact layer still knows about them — deleting
     * a true result to hide a person would be falsifying the record — so the
     * boundary is what has to hold, on every published surface including the
     * results table.
     */
    const active = new Set((await activeLeagueManagers(db!)).map((manager) => manager.displayName));

    const everyone = await db!.select({ name: users.displayName }).from(users);
    const retired = everyone.map((row) => row.name).filter((name) => !active.has(name));
    expect(retired.length, 'the fixtures should contain retired managers to test against').toBeGreaterThan(0);

    for (const year of [2024, 2025]) {
      for (let week = 1; week <= 17; week++) {
        const packet = await factPacket(db!, { season: year, week });
        if (packet.refusal !== null) continue;

        const where = `${String(year)} w${String(week)}`;
        for (const name of packet.allowedNames) {
          expect(active.has(name), `${where} allowed ${name}`).toBe(true);
        }

        const printed = JSON.stringify(renderEdition(packet));
        for (const name of retired) {
          expect(printed.includes(name), `${where} printed ${name}`).toBe(false);
        }
      }
    }
  });

  it('still holds the retired manager\'s result in the fact layer', async () => {
    /*
     * The other half of the same rule, and the one that is easy to lose. The
     * widest margin on record is Ryan over a manager who has since retired. It
     * may never be printed, and it must still be **true** — `seasonFacts` keeps
     * it, and only the packet filters.
     */
    const population = await finalizedMarginsCents(db!);
    const active = new Set((await activeLeagueManagers(db!)).map((manager) => manager.displayName));

    let namesSomebodyRetired = false;
    for (const year of [2024, 2025]) {
      const derived = await seasonFacts(db!, { year, historicalMarginsCents: population });
      for (const fact of derived.facts) {
        if (!active.has(fact.winnerDisplayName) || !active.has(fact.loserDisplayName)) {
          namesSomebodyRetired = true;
        }
      }
    }
    expect(namesSomebodyRetired).toBe(true);
  });

  /* ---- the table, and the streaks, recomputed from the files ----------- */

  it('recomputes the regular season and finds exactly the disagreement `16 §12` documents', async () => {
    /*
     * The strongest independent check available, because it compares two things
     * Sleeper published *separately*: the weekly points files, and the finalized
     * `wins`/`losses` on each roster.
     *
     * Adding up fourteen weeks of raw points gives a record. `season_memberships`
     * holds the record Sleeper's own standings reported. They should be the same
     * number, and where they are not, nothing in this product may pick a winner
     * (`16 §12`: the disagreement is reported and never resolved).
     *
     * **2025 agrees perfectly. 2024 disagrees for exactly four rosters — 5, 6, 9
     * and 10.** That is pinned rather than tolerated: a fifth disagreement means
     * either the import changed or the fixtures did, and both are worth a build
     * failure. `disputed` on `fantasy_matchups` is what stops any of it being
     * published.
     */
    const expected: Record<number, readonly number[]> = { 2024: [5, 6, 9, 10], 2025: [] };

    for (const [leagueId, year] of [
      [LEAGUE_2024, 2024],
      [LEAGUE_2025, 2025],
    ] as const) {
      const record = new Map<number, { wins: number; losses: number; ties: number }>();
      const bump = (rosterId: number) => {
        const existing = record.get(rosterId);
        if (existing !== undefined) return existing;
        const fresh = { wins: 0, losses: 0, ties: 0 };
        record.set(rosterId, fresh);
        return fresh;
      };

      // Regular season only. A bracket result does not move the table — the
      // table is what produced the bracket.
      for (let week = 1; week <= 14; week++) {
        for (const game of rawGames(leagueId, week)) {
          const [a, b] = game.rosters;
          const [ca, cb] = game.cents;
          const left = bump(a);
          const right = bump(b);
          if (ca === cb) {
            left.ties++;
            right.ties++;
          } else if (ca > cb) {
            left.wins++;
            right.losses++;
          } else {
            right.wins++;
            left.losses++;
          }
        }
      }

      const [season] = await db!.select().from(seasons).where(eq(seasons.year, year));
      const stored = await db!
        .select()
        .from(seasonMemberships)
        .where(eq(seasonMemberships.seasonId, season!.id));

      const disagreeing = stored
        .filter((row) => {
          const mine = record.get(row.rosterId);
          return mine !== undefined && (mine.wins !== row.wins || mine.losses !== row.losses);
        })
        .map((row) => row.rosterId)
        .sort((x, y) => x - y);

      expect(disagreeing, `${String(year)} standings disagreement`).toEqual(expected[year]);
    }
  });

  it('agrees with the table the story layer builds, week by week', async () => {
    /*
     * `standingsThrough` is the thing under test; the expectation below is built
     * here from the raw files with no call into `lib/stats`. Checked at **every**
     * regular week rather than at the end, because a standings *move* is a claim
     * about two adjacent weeks and an off-by-one in the cutoff would be invisible
     * in a final table.
     */
    for (const [leagueId, year] of [
      [LEAGUE_2024, 2024],
      [LEAGUE_2025, 2025],
    ] as const) {
      const season = await seasonWeeks(db!, year);

      for (let through = 1; through <= 14; through++) {
        const mine = new Map<number, { wins: number; pf: number }>();
        const bump = (rosterId: number) => {
          const existing = mine.get(rosterId);
          if (existing !== undefined) return existing;
          const fresh = { wins: 0, pf: 0 };
          mine.set(rosterId, fresh);
          return fresh;
        };

        for (let week = 1; week <= through; week++) {
          for (const game of rawGames(leagueId, week)) {
            const [a, b] = game.rosters;
            const [ca, cb] = game.cents;
            bump(a).pf += ca;
            bump(b).pf += cb;
            if (ca > cb) bump(a).wins++;
            else if (cb > ca) bump(b).wins++;
          }
        }

        const table = standingsThrough({
          rows: season.rows,
          throughWeek: through,
          roster: season.roster,
        });

        for (const row of table) {
          const expected = mine.get(row.rosterId);
          if (expected === undefined) continue;
          const where = `${String(year)} through w${String(through)} roster ${String(row.rosterId)}`;
          expect(row.wins, `${where} wins`).toBe(expected.wins);
          expect(row.pointsForCents, `${where} points for`).toBe(expected.pf);
        }

        // The order is a claim too: wins, then points for. Checked as a property
        // of the returned sequence rather than by rebuilding the sort here.
        for (let i = 1; i < table.length; i++) {
          const above = table[i - 1]!;
          const below = table[i]!;
          const ordered =
            above.wins > below.wins ||
            (above.wins === below.wins && above.pointsForCents >= below.pointsForCents);
          expect(ordered, `${String(year)} w${String(through)} order at ${String(i)}`).toBe(true);
        }
      }
    }
  });

  it('counts a winning run the same way the raw weeks do', async () => {
    /*
     * A streak is the one derived value with a *direction* — counted backwards
     * from a week — so an off-by-one reads as a plausible number rather than as a
     * wrong one. Recomputed here by walking the raw weeks forward and keeping a
     * running count, which is deliberately the opposite direction from
     * `winStreak`'s.
     */
    for (const [leagueId, year] of [
      [LEAGUE_2024, 2024],
      [LEAGUE_2025, 2025],
    ] as const) {
      const season = await seasonWeeks(db!, year);

      const running = new Map<number, number>();
      for (let week = 1; week <= 14; week++) {
        for (const game of rawGames(leagueId, week)) {
          const [a, b] = game.rosters;
          const [ca, cb] = game.cents;
          if (ca === cb) {
            // A tie ends a run rather than extending it — an unbeaten run and a
            // winning run are different claims.
            running.set(a, 0);
            running.set(b, 0);
          } else {
            const winner = ca > cb ? a : b;
            const loser = ca > cb ? b : a;
            running.set(winner, (running.get(winner) ?? 0) + 1);
            running.set(loser, 0);
          }
        }

        for (const [rosterId, expected] of running) {
          expect(
            winStreak({ rows: season.rows, rosterId, throughWeek: week }),
            `${String(year)} w${String(week)} roster ${String(rosterId)}`,
          ).toBe(expected);
        }
      }
    }
  });
});
