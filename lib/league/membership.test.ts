import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { closePool, getDb } from '@/lib/db';
import { seasonMemberships, seasons, users } from '@/lib/db/schema';
import { resetDatabase } from '@/lib/db/test-helpers';
import { listDoorManagers } from '@/lib/auth/service';
import { leagueShowcase } from '@/lib/counter/showcase';
import { applyDemoState } from '@/lib/demo/apply';
import { featuredMatchup } from '@/lib/stats/board';
import { traverseChain } from '@/lib/sleeper/chain';
import { createFixtureSource } from '@/lib/sleeper/fixtures';
import { persistChain } from '@/lib/sleeper/persist';

import { APPROVED_2026_ROSTER, CAMEO_ONLY_NAMES, activeLeagueManagers } from './membership';

/**
 * The retired-manager ruling, enforced.
 *
 * **Commissioner, 2026-07-30, absolute.** Armen, Shant and Berardo never appear
 * in a structured product surface — not as an entry, not labelled "retired", not
 * disabled, not behind an alumni page. The only permitted use of their names is
 * a rare cameo in Tony's dialogue.
 *
 * The ruling is also explicit that this must not be solved with `name !==
 * 'Armen'` scattered through components. So these tests do not check for a
 * filter; they check the **surfaces** — and they run against the real imported
 * league, so a surface that starts selecting from `users` again fails here even
 * though nothing about it looks like an exclusion.
 *
 * `docs/CHECKPOINT.md` recorded the opposite ruling for a few hours this
 * morning. Correcting the loser is the rule (`AUTONOMY.md §1`), and a test is
 * what stops it coming back a third time.
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

describe.skipIf(!hasDatabase)('who the product says is in this league', () => {
  beforeEach(async () => {
    await resetDatabase(db!);
    const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, {
      includeWeeks: true,
    });
    await persistChain(db!, chain, { sourceLabel: 'test', finalizeYears: [2024, 2025] });
  });

  /** Every name any structured surface would show a manager under. */
  async function everyNameOnShow(): Promise<string[]> {
    const [door, wall, active] = await Promise.all([
      listDoorManagers(db!),
      leagueShowcase(db!),
      activeLeagueManagers(db!),
    ]);
    return [
      ...door.map((m) => m.displayName),
      ...wall.map((m) => m.displayName),
      ...active.map((m) => m.displayName),
    ];
  }

  it('is exactly the approved ten, derived from seats rather than a list', async () => {
    const roster = (await activeLeagueManagers(db!)).map((m) => m.displayName);
    expect([...roster].sort()).toEqual([...APPROVED_2026_ROSTER].sort());
  });

  it('never shows a retired manager on any structured surface', async () => {
    const shown = await everyNameOnShow();
    for (const retired of CAMEO_ONLY_NAMES) {
      expect(shown, `${retired} is visible somewhere`).not.toContain(retired);
    }
  });

  it('keeps their rows, because the ruling preserves data and hides people', async () => {
    // The distinction the ruling turns on. Deleting them would take old imports,
    // audit history and referential integrity with them.
    for (const retired of CAMEO_ONLY_NAMES) {
      const [row] = await db!.select().from(users).where(eq(users.displayName, retired));
      expect(row, `${retired} should still exist in storage`).toBeDefined();
    }
  });

  it('does not let an old membership make somebody current', async () => {
    // Berardo holds a real 2024 seat. A season association is not a seat *now*,
    // and this is the assertion that says so against real imported data.
    const [berardo] = await db!.select().from(users).where(eq(users.displayName, 'Berardo'));
    const held = await db!
      .select()
      .from(seasonMemberships)
      .where(eq(seasonMemberships.userId, berardo!.id));

    expect(held.length).toBeGreaterThan(0);
    expect((await everyNameOnShow())).not.toContain('Berardo');
  });

  it('does not let a deactivated current-season seat make somebody current', async () => {
    const [season] = await db!.select().from(seasons).where(eq(seasons.year, 2026));
    const [shant] = await db!.select().from(users).where(eq(users.displayName, 'Shant'));

    await db!.insert(seasonMemberships).values({
      seasonId: season!.id,
      userId: shant!.id,
      rosterId: 11,
      isActive: false,
    });

    expect(await everyNameOnShow()).not.toContain('Shant');
  });

  it('keeps demo seats off the league wall while letting them through the door', async () => {
    /*
     * The one asymmetry, and it is deliberate. The door is a list of ways in —
     * a demo seat has to be signable-in-as or preview QA cannot photograph a
     * state. The wall is a claim about who the league is, and a demo seat is not
     * a person this league has.
     *
     * In production the two are identical, because a demo seat cannot be created
     * there at all.
     */
    const applied = await applyDemoState(db!, 'one-box', { DEMO_FIXTURES: '1' });

    const door = await listDoorManagers(db!);
    expect(door.some((m) => m.id === applied.seat.userId)).toBe(true);

    const wall = await leagueShowcase(db!);
    expect(wall.some((m) => m.userId === applied.seat.userId)).toBe(false);

    const league = await activeLeagueManagers(db!);
    expect(league.some((m) => m.id === applied.seat.userId)).toBe(false);
  });

  it('does not let a collectible or a token make somebody current', async () => {
    // Owning things is the argument that lost. A retired manager may hold a
    // welcome box and a collectible from an earlier season; neither is
    // membership.
    await applyDemoState(db!, 'collection-full', { DEMO_FIXTURES: '1' });
    expect(await everyNameOnShow()).not.toContain('Armen');
  });

  it('will not publish a fact that names a retired manager', async () => {
    /*
     * The largest margin this league has ever recorded is Ryan 188.02 — Berardo
     * 47.30, week 16 of 2024. The *fact* survives, because it happened. The
     * Tonight board is an official statistical summary and does not get to say
     * it.
     */
    const featured = await featuredMatchup(db!);
    expect(featured).not.toBeNull();
    expect([featured?.winnerDisplayName, featured?.loserDisplayName]).not.toContain('Berardo');
  });
});

describe('the cameo list', () => {
  it('names the three retired managers and nobody else', () => {
    expect([...CAMEO_ONLY_NAMES].sort()).toEqual(['Armen', 'Berardo', 'Shant']);
  });

  it('shares no name with the active roster', () => {
    for (const name of CAMEO_ONLY_NAMES) {
      expect(APPROVED_2026_ROSTER).not.toContain(name);
    }
  });

  it('is ten active managers, which is what `16 §11` says the door holds', () => {
    expect(APPROVED_2026_ROSTER).toHaveLength(10);
  });
});
