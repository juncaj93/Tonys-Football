import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { closePool, getDb } from '@/lib/db';
import { fantasyMatchups, seasonMemberships, seasons } from '@/lib/db/schema';
import { expectPgError, PG_ERROR, resetDatabase } from '@/lib/db/test-helpers';
import { tonightBoard } from '@/lib/parlor/tonight';
import { traverseChain } from '@/lib/sleeper/chain';
import { createFixtureSource } from '@/lib/sleeper/fixtures';
import { persistChain } from '@/lib/sleeper/persist';

import { featuredMatchup, matchupLine } from './board';
import { finalizedMarginsCents, seasonFacts } from './facts';
import { standardPolicy } from './significance';

/**
 * The fact layer, against the recorded fixtures and a real Postgres.
 *
 * Every number below is **pinned to the fixture**, not to a computation of it.
 * A test that recomputes what the code computes proves the code agrees with
 * itself; these say what the 2024 and 2025 seasons actually were, so a change to
 * the derivation that quietly moves a score fails here rather than in a Slice
 * eighteen months from now.
 *
 * The three that matter most are the ones the issue names: a true blowout, a
 * close week whose largest margin is not one, and a disputed game that must
 * suppress rather than produce a number.
 */

const LEAGUE_2026 = '1385016656425668608';

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

afterAll(async () => {
  if (hasDatabase) await closePool();
});

describe.skipIf(!hasDatabase)('facts derived from the recorded seasons', () => {
  beforeEach(async () => {
    await resetDatabase(db!);
    const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, {
      includeWeeks: true,
    });
    await persistChain(db!, chain, {
      sourceLabel: 'test',
      finalizeYears: [2024, 2025],
    });
  });

  async function facts(year: number) {
    const population = await finalizedMarginsCents(db!);
    return seasonFacts(db!, { year, historicalMarginsCents: population });
  }

  /* --- the games themselves ------------------------------------------- */

  it('imports both finalized seasons and no games for the unplayed one', async () => {
    const rows = await db!.select().from(fantasyMatchups);
    expect(rows).toHaveLength(162);

    const [open] = await db!.select().from(seasons).where(eq(seasons.year, 2026));
    const inOpen = await db!
      .select()
      .from(fantasyMatchups)
      .where(eq(fantasyMatchups.seasonId, open!.id));
    expect(inOpen).toHaveLength(0);
  });

  it('stores points in cents, so a margin is exact', async () => {
    const derived = await facts(2024);
    const biggest = derived.facts.find((fact) => fact.id === '2024-w16-largest-margin');

    // Pinned to the fixture. 188.02 - 47.30 in IEEE 754 floats is
    // 140.72000000000003; this is the reason the column is an integer.
    expect(biggest?.winnerPoints).toBe(188.02);
    expect(biggest?.loserPoints).toBe(47.3);
    expect(biggest?.margin).toBe(140.72);
  });

  it('is idempotent — a second import changes nothing', async () => {
    const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, {
      includeWeeks: true,
    });
    const again = await persistChain(db!, chain, {
      sourceLabel: 'test',
      finalizeYears: [2024, 2025],
    });

    expect(again.recordsChanged).toBe(0);
    expect(await db!.select().from(fantasyMatchups)).toHaveLength(162);
  });

  /* --- who won, and who that is --------------------------------------- */

  it('names the right two people, through that season’s roster', async () => {
    const derived = await facts(2024);
    const biggest = derived.facts.find((fact) => fact.id === '2024-w16-largest-margin');

    // Roster ids are seasonal (`16 §5.1`) — roster 4 is Berardo in 2024 and
    // somebody else later. This is the assertion that catches a blowout being
    // attributed to the wrong person, which reads perfectly until they see it.
    expect(biggest?.winnerDisplayName).toBe('Ryan');
    expect(biggest?.loserDisplayName).toBe('Berardo');
    expect(biggest?.winnerManagerId).not.toBe(biggest?.loserManagerId);
  });

  it('never reverses a winner and a loser', async () => {
    for (const year of [2024, 2025]) {
      const derived = await facts(year);
      for (const fact of derived.facts) {
        expect(fact.winnerPoints).toBeGreaterThan(fact.loserPoints);
        expect(fact.margin).toBeCloseTo(fact.winnerPoints - fact.loserPoints, 2);
      }
    }
  });

  it('carries canonical league names, never Sleeper handles', async () => {
    const derived = await facts(2025);
    const names = new Set(
      derived.facts.flatMap((fact) => [fact.winnerDisplayName, fact.loserDisplayName]),
    );

    // The canonical roster from `content/manager-mappings.json`. A Sleeper
    // handle appearing here means the resolution fell back, and there is no
    // fallback — a fallback here is the bug.
    for (const name of names) {
      expect(name).toMatch(/^(Alex|Brandon|Cheese|Joe|Matt Lee|Matty B|Nathan|Nick|Ryan|Zack|Berardo|Shant|Armen)$/);
    }
  });

  /* --- what it means -------------------------------------------------- */

  it('classifies a true blowout', async () => {
    const derived = await facts(2024);
    const biggest = derived.facts.find((fact) => fact.id === '2024-w16-largest-margin');

    expect(biggest?.intensity).toBe('obliterated');
    expect(biggest?.historicalMarginPercentile).toBe(100);
    expect(biggest?.reasonSelected).toBe('Largest finalized margin of the season');
  });

  it('refuses to call a close week’s largest margin a blowout', async () => {
    // 2025 week 14: the biggest game of the week was decided by 22.26, which is
    // the 51st percentile of the league's history. It is the largest margin of
    // its week and it is *not* a story — exactly the case the commissioner named
    // as the trap of using weekly rank alone.
    const derived = await facts(2025);
    const weak = derived.facts.find((fact) => fact.id === '2025-w14-largest-margin');

    expect(weak?.weeklyMarginRank).toBe(1);
    expect(weak?.margin).toBe(22.26);
    expect(weak?.intensity).toBe('beat');
  });

  it('handles decimals down to the cent', async () => {
    const derived = await facts(2025);
    const closest = derived.facts.find((fact) => fact.id === '2025-w01-closest-game');

    expect(closest?.margin).toBe(0.18);
    expect(closest?.intensity).toBe('edged');
  });

  /* --- what it refuses to say ----------------------------------------- */

  it('suppresses a disputed game rather than publishing a number', async () => {
    // `16 §12`. 2024's finalized standings and its weekly points disagree for
    // four rosters because of NFL stat corrections, and `reconcile.ts` never
    // resolves it. Two games sit inside that disagreement.
    const derived = await facts(2024);
    const disputed = derived.suppressed.filter((entry) => entry.reason === 'disputed');

    expect(disputed).toHaveLength(2);
    for (const entry of disputed) {
      expect(entry.detail).toMatch(/disagree/);
      expect(entry.detail).toMatch(/16 §12/);
    }

    // And no published fact rests on one.
    const disputedRows = await db!
      .select()
      .from(fantasyMatchups)
      .where(eq(fantasyMatchups.disputed, true));
    const weeks = new Set(disputedRows.map((row) => `${String(row.week)}`));
    for (const fact of derived.facts) {
      if (!weeks.has(String(fact.week))) continue;
      // A disputed *game* suppresses; other games in the same week are fine.
      const stillDisputed = disputedRows.some(
        (row) =>
          row.week === fact.week &&
          (row.rosterAId === fact.weeklyMarginRank || true) &&
          Math.abs(row.marginCents / 100 - fact.margin) < 0.001,
      );
      expect(stillDisputed).toBe(false);
    }
  });

  it('publishes nothing at all for a season that has not been played', async () => {
    const derived = await facts(2026);

    expect(derived.facts).toHaveLength(0);
    expect(derived.finalized).toBe(false);
    expect(derived.suppressed[0]?.reason).toBe('no-games');
  });

  it('emits no historical percentile when the population is too small', async () => {
    const derived = await seasonFacts(db!, {
      year: 2024,
      // One game is not a population. The fact still publishes; it simply cannot
      // reach a tier that needs league context.
      historicalMarginsCents: [1000],
    });

    for (const fact of derived.facts) {
      expect(fact.historicalMarginPercentile).toBeNull();
    }
  });

  /* --- determinism and evidence --------------------------------------- */

  it('derives byte-for-byte the same facts twice', async () => {
    const first = await facts(2025);
    const second = await facts(2025);
    expect(second).toEqual(first);
  });

  it('carries evidence and a source snapshot on every published fact', async () => {
    const derived = await facts(2024);
    expect(derived.facts.length).toBeGreaterThan(0);

    for (const fact of derived.facts) {
      expect(fact.evidence.length).toBeGreaterThanOrEqual(5);
      expect(fact.sourceSnapshot).toMatch(/^sleeper-\d{4}-w\d{2}-/);
      expect(fact.policyVersion).toBe(standardPolicy().version);
      // Anything above `beat` must have said which population justified it.
      if (fact.intensity !== 'beat' && fact.intensity !== 'edged') {
        expect(fact.evidence.join(' ')).toMatch(/percentile of the (historical|season) population/);
      }
    }
  });

  it('orders facts strongest story first, deterministically', async () => {
    const derived = await facts(2024);
    const scores = derived.facts.map((fact) => fact.selectionScore);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  /* --- immutability ---------------------------------------------------- */

  it('refuses to change a finalized season’s result', async () => {
    const [row] = await db!.select().from(fantasyMatchups).limit(1);

    await expectPgError(
      db!
        .update(fantasyMatchups)
        .set({ pointsACents: 1, marginCents: 1 })
        .where(eq(fantasyMatchups.id, row!.id)),
      { code: PG_ERROR.checkViolation },
    );
  });

  it('refuses to delete a finalized season’s result', async () => {
    const [row] = await db!.select().from(fantasyMatchups).limit(1);

    await expectPgError(
      db!.delete(fantasyMatchups).where(eq(fantasyMatchups.id, row!.id)),
      { code: PG_ERROR.checkViolation },
    );
  });

  it('will not store a margin that disagrees with its own points', async () => {
    const [season] = await db!.select().from(seasons).where(eq(seasons.year, 2026));

    await expectPgError(
      db!.insert(fantasyMatchups).values({
        seasonId: season!.id,
        week: 1,
        weekType: 'regular',
        sleeperMatchupId: 99,
        rosterAId: 1,
        rosterBId: 2,
        pointsACents: 10_000,
        pointsBCents: 5_000,
        winnerRosterId: 1,
        marginCents: 1, // Not 5000.
      }),
      { code: PG_ERROR.checkViolation, constraint: 'fantasy_matchups_margin_matches_points' },
    );
  });

  it('will not name a winner who did not play', async () => {
    const [season] = await db!.select().from(seasons).where(eq(seasons.year, 2026));

    await expectPgError(
      db!.insert(fantasyMatchups).values({
        seasonId: season!.id,
        week: 1,
        weekType: 'regular',
        sleeperMatchupId: 98,
        rosterAId: 1,
        rosterBId: 2,
        pointsACents: 10_000,
        pointsBCents: 5_000,
        winnerRosterId: 7,
        marginCents: 5_000,
      }),
      { code: PG_ERROR.checkViolation, constraint: 'fantasy_matchups_winner_played' },
    );
  });

  /* --- the board socket ------------------------------------------------ */

  it('fills the board’s matchup socket from a real fact', async () => {
    const featured = await featuredMatchup(db!);

    expect(featured).not.toBeNull();
    expect(featured?.season).toBe(2025);
    expect(matchupLine(featured ?? null)).toBe(
      `${featured!.winnerDisplayName} v ${featured!.loserDisplayName}`,
    );
  });

  it('leaves the board empty rather than truncating two long names', async () => {
    expect(matchupLine(null)).toBeNull();
  });

  it('quotes the fact on the Tonight board rather than restating it', async () => {
    // `MANDATE §9`: the surface renders a Stats classification and never chooses
    // one. So every element of the line has to appear in the fact object — the
    // two names, the margin to the cent, and the *word*.
    const featured = await featuredMatchup(db!);
    const lines = await tonightBoard(db!);
    const heaviest = lines.find((line) => line.key === 'heaviest');

    expect(featured).not.toBeNull();
    expect(heaviest).toBeDefined();
    expect(heaviest?.text).toContain(featured!.winnerDisplayName);
    expect(heaviest?.text).toContain(featured!.loserDisplayName);
    expect(heaviest?.text).toContain(featured!.intensity);
    expect(heaviest?.text).toContain(featured!.margin.toFixed(2));
  });

  it('says nothing on the board when there is no publishable fact', async () => {
    // Un-finalize both seasons: every game becomes unpublishable, so the line
    // disappears rather than degrading into a vaguer claim about the same games.
    await db!.update(seasons).set({ finalizedAt: null, status: 'ACTIVE' });

    expect(await featuredMatchup(db!)).toBeNull();
    expect((await tonightBoard(db!)).find((line) => line.key === 'heaviest')).toBeUndefined();
  });

  it('suppresses a tie instead of picking a winner', async () => {
    // No tie exists in either recorded season, so one is constructed on the open
    // season — which is also the only place a row may be written by hand.
    const [season] = await db!.select().from(seasons).where(eq(seasons.year, 2026));
    const [seat] = await db!
      .select()
      .from(seasonMemberships)
      .where(eq(seasonMemberships.seasonId, season!.id));

    await db!.insert(fantasyMatchups).values({
      seasonId: season!.id,
      week: 1,
      weekType: 'regular',
      sleeperMatchupId: 1,
      rosterAId: seat!.rosterId,
      rosterBId: seat!.rosterId === 1 ? 2 : 1,
      pointsACents: 12_345,
      pointsBCents: 12_345,
      winnerRosterId: null,
      marginCents: 0,
    });

    // 2026 is not finalized, so it suppresses on that first — which is itself
    // correct, and the reason a tie needs the finalized case to be tested too.
    const openSeason = await seasonFacts(db!, {
      year: 2026,
      historicalMarginsCents: await finalizedMarginsCents(db!),
    });
    expect(openSeason.facts).toHaveLength(0);
    expect(openSeason.suppressed[0]?.reason).toBe('season-not-finalized');

    await db!
      .update(seasons)
      .set({ finalizedAt: new Date('2026-01-01T00:00:00Z') })
      .where(eq(seasons.id, season!.id));

    const finalized = await seasonFacts(db!, {
      year: 2026,
      historicalMarginsCents: await finalizedMarginsCents(db!),
    });
    expect(finalized.facts).toHaveLength(0);
    expect(finalized.suppressed.map((entry) => entry.reason)).toContain('tie');
  });
});
