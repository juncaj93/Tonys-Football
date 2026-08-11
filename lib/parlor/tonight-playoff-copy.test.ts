import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearClock, setFixedClock } from '@/lib/clock';
import { closePool, getDb } from '@/lib/db';
import { seasonMemberships, seasons, users } from '@/lib/db/schema';
import { resetDatabase } from '@/lib/db/test-helpers';

import { tonightBoard } from './tonight';

/**
 * The two lines of commissioner playoff copy the board can actually support.
 *
 * ## The rule these enforce
 *
 * Commissioner ruling, 2026-08-10: **deterministic state decides whether a
 * message is eligible; authored copy only decides how Tony expresses a state
 * that is already proven.** So every test here is the same shape — construct a
 * state, and assert the line is present or absent because of *that state* and
 * nothing else.
 *
 * ## Why there are two and not three
 *
 * `FOR THE TITLE` is **not implemented**, and its absence is asserted at the
 * bottom rather than left to be noticed. Knowing that the current week is the
 * championship week needs the league's `playoff_week_start` and its bracket
 * round count; neither is persisted — `playoff_week_start` is read at import,
 * used to classify weeks, and discarded — so the only routes to it are schedule
 * inference or new bracket storage, and the same ruling forbids both.
 *
 * ## What "champion confirmed" is keyed on, and what it is not
 *
 * Not recency. `seasons.finalized_at` records when the close was *recorded*,
 * not when the season ended — 2024's and 2025's are both stamped the day the
 * fixtures were first imported — so a time window on it would have announced a
 * nineteen-month-old season as news. The key is that the champion's season is
 * **the newest on the books**, which is a fact about the record rather than
 * about the clock.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

/** Well inside the season, so the kickoff countdown never crowds the board. */
const NOW = '2026-12-22T12:00:00Z';

afterAll(async () => {
  if (hasDatabase) await closePool();
});

describe.skipIf(!hasDatabase)('the Tonight board at the end of a season', () => {
  beforeEach(async () => {
    await resetDatabase(db!);
    setFixedClock(NOW);
  });

  afterEach(() => {
    clearClock();
  });

  /**
   * One season with one champion, in whatever state the test needs.
   *
   * `closed` writes both `finalized_at` and `ARCHIVED`, which is what the close
   * does (`lib/sleeper/persist.ts`) — a season carrying one without the other is
   * not a state the product can be in, and building one here would be testing a
   * database rather than the product.
   */
  async function season(input: {
    readonly year: number;
    readonly closed: boolean;
    readonly champion?: string | null;
  }) {
    const [row] = await db!
      .insert(seasons)
      .values({
        year: input.year,
        ...(input.closed
          ? { finalizedAt: new Date('2027-01-06T12:00:00Z'), status: 'ARCHIVED' as const }
          : { status: 'ACTIVE' as const }),
      })
      .returning();

    // Ten seats, because the "keys" line counts them and a one-seat league
    // would make the board read strangely for reasons unrelated to this ruling.
    for (let rosterId = 1; rosterId <= 10; rosterId++) {
      const name = rosterId === 1 ? (input.champion ?? 'Nobody') : `Manager ${String(rosterId)}`;
      const [user] = await db!.insert(users).values({ displayName: name }).returning();
      await db!.insert(seasonMemberships).values({
        seasonId: row!.id,
        userId: user!.id,
        rosterId,
        ...(rosterId === 1 && input.champion != null ? { finalRank: 1 } : {}),
      });
    }

    return row!;
  }

  const textOf = async (key: string): Promise<string | undefined> =>
    (await tonightBoard(db!)).find((line) => line.key === key)?.text;

  // ------------------------------------------------------------------
  // Champion confirmed — `[MANAGER] WINS IT`
  // ------------------------------------------------------------------

  it('announces the champion once the newest season is closed', async () => {
    await season({ year: 2026, closed: true, champion: 'Ryan' });

    expect(await textOf('champion')).toBe('Ryan WINS IT');
  });

  it('says nothing of the sort while the season is open', async () => {
    /*
     * The state the ruling is most concerned with: a bracket that looks
     * finished, or a provisional championship score, must not produce this. An
     * open season has no `finalized_at`, and the champion line's own query also
     * requires `ARCHIVED`, so there are two independent reasons it cannot fire.
     */
    await season({ year: 2026, closed: false, champion: 'Ryan' });

    const board = await tonightBoard(db!);
    for (const line of board) expect(line.text).not.toMatch(/WINS IT/);
  });

  it('goes back to the standing-champion line once a later season exists', async () => {
    /*
     * The announcement window is *"the newest season on the books produced this
     * champion"*. In August 2026, 2025's champion has held the ring for months
     * and `still has` is the true thing to say about him.
     */
    await season({ year: 2025, closed: true, champion: 'Matty B' });
    await season({ year: 2026, closed: false });

    expect(await textOf('champion')).toBe(
      'Matty B still has the 2025 ring. Nobody has taken it off him.',
    );
  });

  it('never bakes a manager into the copy', async () => {
    // The same template, two different champions. A name in the authored string
    // would make one of these wrong.
    await season({ year: 2026, closed: true, champion: 'Cheese' });
    expect(await textOf('champion')).toBe('Cheese WINS IT');

    await resetDatabase(db!);
    await season({ year: 2026, closed: true, champion: 'Nathan' });
    expect(await textOf('champion')).toBe('Nathan WINS IT');
  });

  // ------------------------------------------------------------------
  // Season complete — `THAT'S A WRAP`
  // ------------------------------------------------------------------

  it("wraps the season only once the books are shut", async () => {
    await season({ year: 2026, closed: false, champion: 'Ryan' });
    expect(await textOf('wrap')).toBeUndefined();

    await db!
      .update(seasons)
      .set({ finalizedAt: new Date('2027-01-06T12:00:00Z'), status: 'ARCHIVED' })
      .where(eq(seasons.year, 2026));

    expect(await textOf('wrap')).toBe("THAT'S A WRAP");
  });

  it('wraps a season that closed without a champion on record', async () => {
    /*
     * The reason this is its own line rather than part of the champion's. A
     * closed season with no `final_rank` is a real state — `lib/counter/rings.ts`
     * refuses to name a champion for it — and *"the season is over"* is still
     * true.
     */
    await season({ year: 2026, closed: true, champion: null });

    expect(await textOf('champion')).toBeUndefined();
    expect(await textOf('wrap')).toBe("THAT'S A WRAP");
  });

  it('does not wrap a closed season that is no longer the newest', async () => {
    await season({ year: 2025, closed: true, champion: 'Matty B' });
    await season({ year: 2026, closed: false });

    expect(await textOf('wrap')).toBeUndefined();
  });

  it('leads with the pair, and still never exceeds four lines', async () => {
    await season({ year: 2026, closed: true, champion: 'Ryan' });

    const board = await tonightBoard(db!);
    expect(board.length).toBeLessThanOrEqual(4);
    expect(board.slice(0, 2).map((line) => line.key)).toEqual(['champion', 'wrap']);
  });

  // ------------------------------------------------------------------
  // What the board still may not say
  // ------------------------------------------------------------------

  it('claims nothing about advancement, elimination or a title week', async () => {
    /*
     * The ruling's banned list, asserted against every state this file can
     * build. `FOR THE TITLE` is in it because it is **not implemented**: the
     * championship week is not derivable from anything the product stores, and
     * the two routes to it — schedule inference and bracket persistence — are
     * both forbidden. The day it becomes supportable, this assertion is what has
     * to be deliberately removed.
     */
    const banned = [
      /FOR THE TITLE/i,
      /must win/i,
      /win and in/i,
      /eliminated/i,
      /advanced?\b/i,
      /finalist/i,
      /semifinal/i,
      /clinch/i,
    ];

    for (const state of [
      { year: 2026, closed: false, champion: 'Ryan' },
      { year: 2026, closed: true, champion: 'Ryan' },
      { year: 2026, closed: true, champion: null },
    ] as const) {
      await resetDatabase(db!);
      await season(state);

      for (const line of await tonightBoard(db!)) {
        for (const phrase of banned) {
          expect(line.text, `${line.key}: ${line.text}`).not.toMatch(phrase);
        }
      }
    }
  });
});
