import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { clearClock, setFixedClock } from '@/lib/clock';
import { grantChampionshipRings, verifiedTitles } from '@/lib/counter/rings';
import { closePool, getDb } from '@/lib/db';
import {
  collectibles,
  rewardTables,
  seasonMemberships,
  seasons,
  tokenTransactions,
} from '@/lib/db/schema';
import { resetDatabase } from '@/lib/db/test-helpers';
import { championBanners } from '@/lib/parlor/champions';
import { ensureRoom, roomFor } from '@/lib/rooms/service';
import { boardFace, tonightBoard } from '@/lib/parlor/tonight';
import { factPacket } from '@/lib/slice/packet';
import { latestPublishedIssue } from '@/lib/slice/publication';
import { renderEdition } from '@/lib/slice/render';
import { validateEdition } from '@/lib/slice/validate';
import { finalizeSeason } from '@/lib/sleeper/persist';
import { currentWeekOf } from '@/lib/stats/week';

import { createRehearsal, type LifecycleState, type Rehearsal } from './harness';
import { type ScriptedBracketMatch, type ScriptedBrackets } from './script';
import {
  BYES,
  CHAMPIONSHIP_WEEK,
  FINAL_RANKS,
  MISSED_OUT,
  PLAYOFF_WEEK_START,
  QUALIFIERS,
  RANKS_AFTER_SEMIFINAL,
  SEEDS,
  SEMIFINAL_WEEK,
  STILL_IN,
  WEEK_16_SCRIPT,
} from './week-16';

/**
 * The playoff rehearsal — week 16, through the same four verbs week 1 uses.
 *
 * ## Why this is a scenario and not a second harness
 *
 * `docs/WEEK_1_REHEARSAL.md §8` is explicit: a new scenario writes a
 * `SeasonScript` and calls `seed` / `sunday` / `tuesday` / `observe`. The one
 * thing the script could not express was a **bracket that moves**, and
 * `made_playoffs` and `final_rank` are written at import *from the bracket* — so
 * a scenario that cannot advance one cannot rehearse a placement being settled.
 * `ScriptedBrackets` is that addition, and it is scenario data rather than a
 * fifth verb.
 *
 * ## The round is derived, not assumed
 *
 * `playoff_week_start` is 15 and the winners bracket is three rounds, so week 16
 * is the **semifinal** — and it is the week in which six of the ten placements
 * settle. The four that decide a championship do not. Everything below turns on
 * that distinction.
 *
 * ## Sixteen weeks, played
 *
 * The season is driven forward through `runTuesday`, one week at a time, against
 * a Sleeper that has played exactly that many. Nothing is inserted behind the
 * product's back, and the state the assertions read is the state sixteen real
 * Tuesdays left behind.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

/** Late December: the semifinal is played, the books are not shut. */
const NOW = '2026-12-22T12:00:00Z';

/** The Tuesday that closes week 1. Each week advances seven days. */
const FIRST_TUESDAY = new Date('2026-09-15T09:00:00Z');

function tuesdayOf(week: number): Date {
  return new Date(FIRST_TUESDAY.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000);
}

/** Play the season forward through the real job, one week at a time. */
async function playThrough(rehearsal: Rehearsal, through: number): Promise<void> {
  for (let week = 1; week <= through; week++) {
    await rehearsal.tuesday({ at: tuesdayOf(week), played: week });
  }
}

afterAll(async () => {
  clearClock();
  if (hasDatabase) await closePool();
});

describe.skipIf(!hasDatabase)('the week 16 playoff rehearsal', () => {
  let rehearsal: Rehearsal;
  let state: LifecycleState;
  let seasonId: string;

  beforeAll(async () => {
    setFixedClock(NOW);
    await resetDatabase(db!);

    rehearsal = createRehearsal({
      db: db!,
      script: WEEK_16_SCRIPT,
      // Exactly as a deploy leaves them, and as week 1 rehearses them.
      finalizeYears: [2024, 2025],
    });

    await rehearsal.seed();
    await playThrough(rehearsal, SEMIFINAL_WEEK);
    state = await rehearsal.observe();

    const [row] = await db!
      .select({ id: seasons.id })
      .from(seasons)
      .where(eq(seasons.year, WEEK_16_SCRIPT.year));
    seasonId = row!.id;
  }, 600_000);

  /** The memberships, in roster order. */
  async function table() {
    return db!
      .select({
        rosterId: seasonMemberships.rosterId,
        wins: seasonMemberships.wins,
        losses: seasonMemberships.losses,
        madePlayoffs: seasonMemberships.madePlayoffs,
        finalRank: seasonMemberships.finalRank,
        tokenBalance: seasonMemberships.tokenBalance,
        isActive: seasonMemberships.isActive,
      })
      .from(seasonMemberships)
      .where(eq(seasonMemberships.seasonId, seasonId))
      .orderBy(seasonMemberships.rosterId);
  }

  // ------------------------------------------------------------------
  // The configuration, and the seeding it produced
  // ------------------------------------------------------------------

  it('closes sixteen weeks and reaches the semifinal round', () => {
    expect(state.finalizations.map((row) => row.week)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ]);

    // Week 16 is round two of three. Derived, not restated.
    expect(SEMIFINAL_WEEK - PLAYOFF_WEEK_START + 1).toBe(2);
    expect(SEMIFINAL_WEEK).not.toBe(CHAMPIONSHIP_WEEK);
  });

  it('stores the playoff weeks as playoff weeks, and the byes as no game', () => {
    /*
     * `week_type` comes from the league's own `playoff_week_start` at import
     * (`lib/sleeper/weeks.ts`), never from the script — a scenario that declared
     * it would be scripting the answer.
     *
     * Week 15 has four games and two byes; a bye is an unpaired row, and
     * `fantasy_matchups` refuses a non-game. Four rows, not five, is what proves
     * the refusal rather than the absence.
     */
    const byWeek = (week: number) => state.games.filter((game) => game.week === week);

    expect(byWeek(14).every((game) => game.weekType === 'regular')).toBe(true);
    expect(byWeek(15).every((game) => game.weekType === 'playoff')).toBe(true);
    expect(byWeek(16).every((game) => game.weekType === 'playoff')).toBe(true);

    expect(byWeek(15)).toHaveLength(4);
    expect(byWeek(16)).toHaveLength(5);

    const week15Rosters = byWeek(15).flatMap((game) => [game.rosterA, game.rosterB]);
    for (const bye of BYES) expect(week15Rosters).not.toContain(bye);
  });

  it('qualifies exactly the six the regular season produced', async () => {
    const rows = await table();
    expect(rows.filter((row) => row.madePlayoffs).map((row) => row.rosterId)).toEqual([
      ...QUALIFIERS,
    ]);

    // The bracket was drawn to these seeds; if the scoreboard ever moves the
    // table, this fails before anything downstream gets confusing.
    expect(SEEDS.slice(0, 6).slice().sort((a, b) => a - b)).toEqual([...QUALIFIERS]);
  });

  // ------------------------------------------------------------------
  // The boundary
  // ------------------------------------------------------------------

  it('keeps every eliminated manager in the league', async () => {
    /*
     * `16 §7.4`: eliminated managers dim, they do not disappear. Asked as a data
     * question — a seat that vanished would take a permanent identity, a record
     * and a token balance with it.
     */
    const rows = await table();
    expect(rows).toHaveLength(10);

    for (const rosterId of MISSED_OUT) {
      const row = rows.find((candidate) => candidate.rosterId === rosterId);
      expect(row, `roster ${String(rosterId)} left the league`).toBeDefined();
      expect(row!.isActive).toBe(true);
      expect(row!.wins + row!.losses).toBe(14);
      expect(row!.tokenBalance).toBeGreaterThan(0);
    }
  });

  it('does not hand a final rank to anybody still playing for the title', async () => {
    /*
     * The premature-finish check, and the reason week 16 is the interesting
     * week. Six placements *are* settled by it and writing them is correct; the
     * four that are not are the four that decide a championship.
     */
    const rows = await table();

    expect(rows.filter((row) => row.finalRank === null).map((row) => row.rosterId)).toEqual([
      ...STILL_IN,
    ]);

    expect(
      Object.fromEntries(
        rows.filter((row) => row.finalRank !== null).map((row) => [row.rosterId, row.finalRank]),
      ),
    ).toEqual(RANKS_AFTER_SEMIFINAL);
  });

  it('settles the consolation ladder without touching the championship track', async () => {
    // 7th–10th are final after week 16 and belong to the four who never reached
    // the bracket. A consolation result leaking into the title race would show
    // up here as a qualifier holding 7–10.
    const rows = await table();
    const consolation = rows.filter((row) => row.finalRank !== null && row.finalRank >= 7);

    expect(consolation.map((row) => row.rosterId).sort((a, b) => a - b)).toEqual([...MISSED_OUT]);
    for (const row of consolation) expect(row.madePlayoffs).toBe(false);
  });

  it('hangs no 2026 banner while the bracket is unfinished', async () => {
    /*
     * The title-contending surface, and where a premature champion would be most
     * visible. After the semifinal 2026 must read as still being played, and the
     * two seasons on the books must be untouched by a third season's postseason.
     */
    const banners = await championBanners(db!);
    const current = banners.find((banner) => banner.year === WEEK_16_SCRIPT.year);

    expect(current?.champion).toBeNull();
    expect(current?.current).toBe(true);
    expect(
      banners.filter((banner) => banner.year < WEEK_16_SCRIPT.year).map((b) => [b.year, b.champion]),
    ).toEqual([
      [2024, 'Alex'],
      [2025, 'Matty B'],
    ]);
  });

  it('grants no championship ring on a semifinal, however often it is asked', async () => {
    /*
     * Two independent gates, both load-bearing: `verifiedTitles` reads
     * `final_rank = 1` **on a finalized season**, and after week 16 neither half
     * is true of 2026.
     */
    expect((await verifiedTitles(db!)).map((title) => title.year)).toEqual([2024, 2025]);

    const first = await grantChampionshipRings(db!);
    const second = await grantChampionshipRings(db!);

    expect(first.granted).toBe(0);
    expect(second.granted).toBe(0);
    expect(second.alreadyHeld).toBe(2);

    const [held] = await db!
      .select({ total: sql<number>`count(*)::int` })
      .from(collectibles)
      .where(eq(collectibles.slug, 'item_championship_ring'));
    expect(held?.total).toBe(2);
  });

  it('never lets the ring into the box', async () => {
    // Asserted against the **stored** reward table rather than the catalog
    // module, because the table is what a roll actually reads.
    const rows = await db!.select({ entries: rewardTables.entries }).from(rewardTables);
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      const slugs = (row.entries as readonly { slug: string }[]).map((entry) => entry.slug);
      expect(slugs).not.toContain('item_championship_ring');
    }
  });

  // ------------------------------------------------------------------
  // The economy
  // ------------------------------------------------------------------

  it('pays a playoff win exactly like a regular one, and nothing extra', () => {
    const week16 = state.rewards.filter((reward) => reward.week === SEMIFINAL_WEEK);
    const byReason: Record<string, number> = {};
    for (const reward of week16) byReason[reward.reason] = (byReason[reward.reason] ?? 0) + 1;

    // Five games — two semifinals, the fifth-place game and both consolation
    // finals — so five wins and one high score. No advancement bonus, no
    // seeding bonus, no consolation bonus: `03 §4` prices two things and a
    // playoff week is not one of them.
    expect(byReason).toEqual({ MATCHUP_WIN: 5, WEEKLY_HIGH_SCORE: 1 });
  });

  it('pays the bye weeks nothing, because a bye is not a win', () => {
    const wins = state.rewards.filter(
      (reward) => reward.week === PLAYOFF_WEEK_START && reward.reason === 'MATCHUP_WIN',
    );
    expect(wins).toHaveLength(4);

    const paid = new Set(wins.map((reward) => reward.manager));
    for (const bye of BYES) {
      // Neither bye roster's manager is among the week's winners.
      expect([...paid].some((name) => name === state.seats.find((s) => s.rosterId === bye)?.manager))
        .toBe(false);
    }
  });

  it('leaves every token balance standing through the postseason', async () => {
    /*
     * The **absence** assertion. `16` defers the silent auction and puts the
     * spend-down in November; no expiry mechanism exists, and a legacy
     * end-of-season expiry resurrected from the older documents would show up as
     * a balance falling across the playoff weeks.
     */
    for (const seat of state.seats) {
      expect(seat.balance, `${seat.manager} lost tokens`).toBeGreaterThan(0);
    }

    const [awards] = await db!
      .select({ total: sql<number>`count(*)::int` })
      .from(tokenTransactions)
      .where(eq(tokenTransactions.reasonCode, 'SEASON_AWARD'));
    expect(awards?.total).toBe(0);
  });

  // ------------------------------------------------------------------
  // The paper and the room
  // ------------------------------------------------------------------

  it('prints the semifinal, and refuses the week nobody has played', async () => {
    /*
     * The positive half of A0, on a playoff week. The repair itself is #85's and
     * lives in `lib/slice/packet.ts`; what this adds is that it holds all the way
     * to the semifinal rather than only on the opening week.
     */
    const packet = await factPacket(db!, { season: WEEK_16_SCRIPT.year, week: SEMIFINAL_WEEK });

    expect(packet.refusal).toBeNull();
    expect(packet.finalized).toBe(true);
    expect(packet.weekType).toBe('playoff');
    expect(packet.scoreboard).toHaveLength(5);

    const unplayed = await factPacket(db!, {
      season: WEEK_16_SCRIPT.year,
      week: CHAMPIONSHIP_WEEK,
    });
    expect(unplayed.refusal).toBe('no-week');
    expect(unplayed.lead).toBeNull();
  });

  it('leads with the close semifinal and claims nothing about advancing', async () => {
    const packet = await factPacket(db!, { season: WEEK_16_SCRIPT.year, week: SEMIFINAL_WEEK });
    const edition = renderEdition(packet);

    // 130.97 to 130.55. The lead is the margin, which is a fact; there is no
    // "reaches the final", because the bracket is not persisted and the paper
    // may not infer one (`MANDATE §9`).
    expect(packet.lead?.kind).toBe('nail-biter');
    expect(edition.deck).toContain('130.97');
    expect(validateEdition(edition, packet)).toEqual({ publishable: true, violations: [] });
  });

  it('drafts every week onto the desk and publishes none of them', async () => {
    /*
     * `16 §9` makes approval mandatory in season one. Sixteen Tuesdays ran and
     * not one published, which is the property that makes the gate real rather
     * than a step somebody remembered to skip.
     *
     * Sixteen drafts, one per closed week — the count is the evidence that a
     * live season drafts *weekly* under the approved model, not only once.
     */
    const byStatus: Record<string, number> = {};
    for (const version of state.versions) {
      byStatus[version.status] = (byStatus[version.status] ?? 0) + 1;
    }

    expect(byStatus['needs_review']).toBe(SEMIFINAL_WEEK);
    expect(byStatus['published'] ?? 0).toBe(0);
    expect(byStatus['approved'] ?? 0).toBe(0);
    expect(await latestPublishedIssue(db!)).toBeNull();
  });

  it('names the week being played rather than WEEK ONE in December', async () => {
    /*
     * The repair is #86's — `currentWeekOf` and the two-shape `BoardFaceInput`.
     * What this adds is the playoff end of the range: a board that was correct
     * in week 8 and fell back to WEEK ONE in December would still be wrong for
     * the four weeks anybody cares most about.
     *
     * `currentWeekOf` counts **forward** from finality: on the Tuesday that
     * closes the semifinal the league moves to the championship week, and that
     * is what the board says for the six days after it.
     */
    const week = await currentWeekOf(db!, WEEK_16_SCRIPT.year);
    expect(week).toBe(CHAMPIONSHIP_WEEK);

    expect(boardFace({ daysUntilKickoff: null, week }).hero).toBe('WEEK 17');
    expect(boardFace({ daysUntilKickoff: null, week }).hero).not.toBe('WEEK ONE');
  });

  it('says nothing about the playoffs mid-bracket, and the season is not wrapped', async () => {
    /*
     * The board gained two lines of commissioner copy on 2026-08-10 — *"[MANAGER]
     * WINS IT"* and *"THAT'S A WRAP"* — and **neither may appear here.** The
     * semifinal is played, the bracket is half-resolved and the books are open,
     * which is precisely the state the ruling's *"do not display this from a
     * provisional championship score or merely because the bracket appears
     * complete"* is about.
     *
     * The third slot, *"FOR THE TITLE"*, is **not implemented at all**: knowing
     * that the current week is the championship week needs the league's
     * `playoff_week_start` and its bracket round count, and neither is
     * persisted. `docs/OPEN_ITEMS.md` **G4**.
     */
    const keys = (await tonightBoard(db!)).map((line) => line.key);

    expect(keys).not.toContain('wrap');
    expect(keys).not.toContain('playoff');
    expect(keys).not.toContain('elimination');
    expect(
      keys.every((key) =>
        ['kickoff', 'champion', 'heaviest', 'keys', 'history'].includes(key),
      ),
    ).toBe(true);

    // And the standing-champion line is still 2025's, said the standing way —
    // 2026 has not produced one, so nothing announces anybody.
    const board = await tonightBoard(db!);
    for (const line of board) {
      expect(line.text).not.toMatch(/WINS IT/);
      expect(line.text).not.toMatch(/FOR THE TITLE/i);
    }
  });

  it('leaves every manager their room after elimination', async () => {
    /*
     * `16 §7.4` again, on the surface a manager actually visits. A basement is a
     * *permanent* thing (`11 §2` keeps the person and the seat apart), so missing
     * the playoffs must not close one — and `roomFor` returning null for four of
     * ten managers in December is exactly what that would look like.
     */
    for (const rosterId of [...MISSED_OUT, ...STILL_IN]) {
      const manager = state.seats.find((seat) => seat.rosterId === rosterId);
      expect(manager, `roster ${String(rosterId)} has no seat`).toBeDefined();

      const userId = await rehearsal.managerIdNamed(manager!.manager);
      expect(userId).not.toBeNull();

      await ensureRoom(db!, userId!);
      expect(await roomFor(db!, userId!), `${manager!.manager} has no room`).not.toBeNull();
    }
  });

  // ------------------------------------------------------------------
  // The Sunday photograph, on a playoff week
  // ------------------------------------------------------------------

  describe('the Sunday snapshot', () => {
    it('photographs the games and leaves the byes out', async () => {
      /*
       * Week 15 rather than 16, because 15 is the week with byes and can tell a
       * working filter from an absent one. Ten rosters read, four games
       * photographed: a snapshot that captured an unpaired roster would run
       * `07 §8`'s comeback arithmetic against a score with no opponent.
       */
      const leg = await rehearsal.sunday({
        week: PLAYOFF_WEEK_START,
        played: PLAYOFF_WEEK_START,
        at: new Date('2026-12-14T04:55:00Z'),
      });

      expect(leg.outcome.kind).toBe('ran');
      if (leg.outcome.kind !== 'ran') return;

      expect(leg.outcome.report.rosters).toBe(10);
      expect(leg.outcome.report.games).toBe(4);
      expect(leg.outcome.report.unpaired).toBe(2);
    });

    it('is taken once and never retaken', async () => {
      /*
       * Idempotency is stronger here than anywhere else in the schema, and
       * deliberately so: a second capture is a *worse* photograph, not a fresher
       * one. The score before Monday is unrecoverable once Monday has happened.
       */
      const again = await rehearsal.sunday({
        week: PLAYOFF_WEEK_START,
        played: PLAYOFF_WEEK_START,
        at: new Date('2026-12-21T04:55:00Z'),
      });

      expect(again.outcome.kind).toBe('ran');
      if (again.outcome.kind !== 'ran') return;

      expect(again.outcome.report.capture?.captured).toBe(false);
      expect(again.outcome.report.skipped.join(' ')).toMatch(/already photographed/);
    });
  });

  // ------------------------------------------------------------------
  // The season transition, which must not happen yet
  // ------------------------------------------------------------------

  it('does not close the season on a semifinal', async () => {
    const [season] = await db!
      .select({ status: seasons.status, finalizedAt: seasons.finalizedAt })
      .from(seasons)
      .where(eq(seasons.year, WEEK_16_SCRIPT.year));

    expect(season?.finalizedAt).toBeNull();
    expect(season?.status).not.toBe('ARCHIVED');
    expect(state.season?.finalized).toBe(false);
  });
});

/**
 * Failure injections, each on its own league.
 *
 * A fresh database per case, because each is about a *state* the product can be
 * in rather than a step in a sequence — sharing one league would make every case
 * depend on the last one's damage.
 */
describe.skipIf(!hasDatabase)('week 16 under injected failure', () => {
  async function freshRehearsal(): Promise<Rehearsal> {
    setFixedClock(NOW);
    await resetDatabase(db!);
    const rehearsal = createRehearsal({
      db: db!,
      script: WEEK_16_SCRIPT,
      finalizeYears: [2024, 2025],
    });
    await rehearsal.seed();
    return rehearsal;
  }

  it('claims no placement when the bracket lags its own games', async () => {
    /*
     * The brackets are separate endpoints from the matchups and have been seen
     * to lag. A week whose games are in and whose bracket is a round behind must
     * not produce a finish for anybody the bracket has not settled — and must
     * still store and close the games, because those are not in doubt.
     *
     * Injected through the script's own progression: the Tuesday of week 16 is
     * run with the upstream admitting only fifteen weeks of bracket, which is
     * exactly the shape of an endpoint that has not caught up.
     */
    /*
     * The same season with round two's results never recorded on the bracket.
     * Weeks 1–15 are unaffected — the lag only withholds what week 16 decided —
     * so this is one rehearsal rather than a splice of two.
     */
    setFixedClock(NOW);
    await resetDatabase(db!);
    const rehearsal = createRehearsal({
      db: db!,
      script: { ...WEEK_16_SCRIPT, brackets: laggedBrackets() },
      finalizeYears: [2024, 2025],
    });
    await rehearsal.seed();
    await playThrough(rehearsal, SEMIFINAL_WEEK);

    const state = await rehearsal.observe();
    expect(state.finalizations.map((row) => row.week)).toContain(16);
    expect(state.games.filter((game) => game.week === 16)).toHaveLength(5);

    const rows = await db!
      .select({
        rosterId: seasonMemberships.rosterId,
        finalRank: seasonMemberships.finalRank,
        madePlayoffs: seasonMemberships.madePlayoffs,
      })
      .from(seasonMemberships)
      .innerJoin(seasons, eq(seasons.id, seasonMemberships.seasonId))
      .where(eq(seasons.year, WEEK_16_SCRIPT.year));

    // Not one placement is claimed. Week 15 settles nothing on its own, and a
    // bracket that has not recorded week 16 must not be read as though it had.
    expect(rows.filter((row) => row.finalRank !== null)).toEqual([]);

    // Participation still reads correctly — round one *was* recorded, and that
    // is a different fact from a finish. A lag that quietly emptied both would
    // be a worse outcome than one that withholds only what it does not know.
    expect(rows.filter((row) => row.madePlayoffs).map((row) => row.rosterId).sort((a, b) => a - b))
      .toEqual([...QUALIFIERS]);
  });

  it('finalizes nothing on a playoff week Sleeper has only scheduled', async () => {
    /*
     * The state between the semifinal and the final: Sleeper answers week 17
     * with ordinary rows at zero on both sides and nothing in the payload saying
     * *"not yet"*. Two 0.00–0.00 rows stored as a tie and finalized would put a
     * championship nobody played into an append-only table, and `16 §4.3`'s job
     * would then be unable to record the real one.
     *
     * Week 1 rehearses this on a regular week; the playoff week is worth its own
     * case because the row it would fabricate is a **title game**.
     */
    setFixedClock(NOW);
    await resetDatabase(db!);
    const rehearsal = createRehearsal({
      db: db!,
      script: WEEK_16_SCRIPT,
      finalizeYears: [2024, 2025],
    });
    await rehearsal.seed();
    await playThrough(rehearsal, SEMIFINAL_WEEK);

    /*
     * The bracket is held back with the games, which is what the upstream
     * actually looks like: Sleeper resolves a bracket *from* results, so a week
     * it has only scheduled cannot have a decided one. Serving a decided bracket
     * over unplayed games would be staging a contradiction rather than a state.
     *
     * The asymmetry is worth naming: placements follow the **bracket alone**, so
     * a bracket that ran ahead of its own games would write a finish for a game
     * that was never stored. Nothing observed does that, and the lagging
     * direction — which is the one that has been seen — is covered above.
     */
    const scheduled = createRehearsal({
      db: db!,
      script: { ...WEEK_16_SCRIPT, brackets: laggedBrackets(CHAMPIONSHIP_WEEK) },
      finalizeYears: [2024, 2025],
    });

    await scheduled.tuesday({
      at: tuesdayOf(CHAMPIONSHIP_WEEK),
      played: CHAMPIONSHIP_WEEK,
      week: CHAMPIONSHIP_WEEK,
      scheduledOnly: true,
    });

    const state = await rehearsal.observe();

    expect(state.games.filter((game) => game.week === CHAMPIONSHIP_WEEK)).toEqual([]);
    expect(state.finalizations.map((row) => row.week)).not.toContain(CHAMPIONSHIP_WEEK);

    // And the championship is still unclaimed, because it has not been played.
    const ranked = await db!
      .select({ rosterId: seasonMemberships.rosterId, finalRank: seasonMemberships.finalRank })
      .from(seasonMemberships)
      .innerJoin(seasons, eq(seasons.id, seasonMemberships.seasonId))
      .where(eq(seasons.year, WEEK_16_SCRIPT.year));
    expect(ranked.filter((row) => row.finalRank === 1)).toEqual([]);
  });

  it('changes nothing when the Tuesday job runs twice on the semifinal', async () => {
    const rehearsal = await freshRehearsal();
    for (let week = 1; week <= 16; week++) {
      await rehearsal.tuesday({ at: tuesdayOf(week), played: week });
    }

    const before = await rehearsal.observe();

    // The same Tuesday again, a week later on the clock. Vercel retries, deploys
    // overlap schedules, and a commissioner can press the button by hand.
    const replay = await rehearsal.tuesday({ at: tuesdayOf(17), played: 16, week: 16 });

    expect(replay.finalized).toBe(false);
    expect(replay.failed).toEqual([]);
    expect(replay.draft?.outcome).toBe('noop');
    expect(await rehearsal.observe()).toEqual(before);
  });
});

/**
 * The bracket as it stands with round two unrecorded.
 *
 * Only the results are withheld. The draw, the placements and the feeds are
 * untouched, because a lagging endpoint serves a bracket that is *behind* rather
 * than one that is malformed.
 */
function laggedBrackets(from: number = SEMIFINAL_WEEK): ScriptedBrackets {
  const strip = (matches: readonly ScriptedBracketMatch[]): readonly ScriptedBracketMatch[] =>
    matches.map((match) => {
      if (match.week < from) return match;
      const { winner: _withheld, ...behind } = match;
      return behind;
    });

  const brackets = WEEK_16_SCRIPT.brackets!;
  return { winners: strip(brackets.winners), losers: strip(brackets.losers) };
}

/**
 * One synthetic round further, to prove the championship completes.
 *
 * Deliberately the smallest extension: week 17 is played, the books are shut by
 * the same call `scripts/seed.ts` makes in January, and rings are granted. No
 * ceremony is built and none is implied — `16` defers that to v1.1, and the
 * entitlement existing has never been a reason to move it.
 */
describe.skipIf(!hasDatabase)('carrying the rehearsal to the championship', () => {
  let rehearsal: Rehearsal;
  let seasonId: string;

  beforeAll(async () => {
    setFixedClock(NOW);
    await resetDatabase(db!);
    rehearsal = createRehearsal({
      db: db!,
      script: WEEK_16_SCRIPT,
      finalizeYears: [2024, 2025],
    });
    await rehearsal.seed();
    await playThrough(rehearsal, CHAMPIONSHIP_WEEK);

    const [row] = await db!
      .select({ id: seasons.id })
      .from(seasons)
      .where(eq(seasons.year, WEEK_16_SCRIPT.year));
    seasonId = row!.id;
  }, 600_000);

  it('completes the bracket without closing the books', async () => {
    const rows = await db!
      .select({ rosterId: seasonMemberships.rosterId, finalRank: seasonMemberships.finalRank })
      .from(seasonMemberships)
      .where(eq(seasonMemberships.seasonId, seasonId));

    expect(
      Object.fromEntries(rows.map((row) => [row.rosterId, row.finalRank])),
    ).toEqual(FINAL_RANKS);

    // The bracket finishing is not the season closing. That is a person's call,
    // and it happens in January (`scripts/seed.ts`'s `FINALIZED_SEASONS`).
    const [season] = await db!
      .select({ finalizedAt: seasons.finalizedAt })
      .from(seasons)
      .where(eq(seasons.year, WEEK_16_SCRIPT.year));
    expect(season?.finalizedAt).toBeNull();
  });

  it('puts seventeen drafts on the desk and publishes none of them', async () => {
    /*
     * One per closed week, which is what the approved weekly drafting model
     * means in practice: `week finalized → fact packet → draft → review desk`,
     * and the cron stopping there. Seventeen, because the season has seventeen
     * played weeks.
     */
    const state = await rehearsal.observe();
    const byStatus: Record<string, number> = {};
    for (const version of state.versions) {
      byStatus[version.status] = (byStatus[version.status] ?? 0) + 1;
    }

    expect(byStatus['needs_review']).toBe(CHAMPIONSHIP_WEEK);
    expect(byStatus['published'] ?? 0).toBe(0);
    expect(byStatus['approved'] ?? 0).toBe(0);
  });

  it('still grants no ring while the books are open', async () => {
    expect((await grantChampionshipRings(db!)).granted).toBe(0);
  });

  it('grants exactly one ring when the books are shut, and none on a replay', async () => {
    expect(await finalizeSeason(db!, WEEK_16_SCRIPT.year)).toBe(true);

    expect((await grantChampionshipRings(db!)).granted).toBe(1);
    expect((await grantChampionshipRings(db!)).granted).toBe(0);

    const held = await db!
      .select({
        rosterId: seasonMemberships.rosterId,
        total: sql<number>`count(${collectibles.id})::int`,
      })
      .from(seasonMemberships)
      .leftJoin(
        collectibles,
        and(
          eq(collectibles.userId, seasonMemberships.userId),
          eq(collectibles.sourceSeasonId, seasonId),
          eq(collectibles.slug, 'item_championship_ring'),
        ),
      )
      .where(eq(seasonMemberships.seasonId, seasonId))
      .groupBy(seasonMemberships.rosterId)
      .orderBy(seasonMemberships.rosterId);

    // Roster 3 won it; nobody else holds a 2026 ring, and the champion holds one.
    for (const row of held) {
      expect(row.total, `roster ${String(row.rosterId)}`).toBe(row.rosterId === 3 ? 1 : 0);
    }
  });

  it('marks the closed season as history so the room can read it', async () => {
    /*
     * `status` was seeded from Sleeper on insert and written by nothing ever
     * again, so a season created in the preseason stayed `DRAFT_PREP` through
     * its own finalization — and four surfaces read `ARCHIVED` to mean *"this is
     * history"*. The close writes both now.
     */
    const [season] = await db!
      .select({ status: seasons.status, finalizedAt: seasons.finalizedAt })
      .from(seasons)
      .where(eq(seasons.year, WEEK_16_SCRIPT.year));

    expect(season?.finalizedAt).not.toBeNull();
    expect(season?.status).toBe('ARCHIVED');
  });
});
