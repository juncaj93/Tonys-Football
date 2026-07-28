import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { clearClock, setClockSource } from '@/lib/clock';
import { listDoorManagers, type DoorManager } from '@/lib/auth/service';
import { closePool, getDb } from '@/lib/db';
import { resetDatabase } from '@/lib/db/test-helpers';
import { contentUsageLog } from '@/lib/db/schema';
import { seasonClock } from '@/lib/parlor/season';
import { traverseChain } from '@/lib/sleeper/chain';
import { createFixtureSource } from '@/lib/sleeper/fixtures';
import { persistChain } from '@/lib/sleeper/persist';
import { loadTags } from '@/lib/tags/repository';

import { greetingFor } from './greeting';
import { readCounterGreetings, seedCounterGreetings } from './seed';

/**
 * **The acceptance criterion.**
 *
 * `17 §3`: "Two managers log in side by side and get visibly different
 * greetings that are both true." M1 is not done if this does not hold, so it is
 * asserted here rather than checked by hand on a phone once.
 *
 * The setup is the real thing end to end: the recorded 2024–2026 chain is
 * imported into a real database, the real markdown is parsed and seeded, tags
 * are derived from what was imported, and greetings are selected through the
 * real content pipeline. Nothing is stubbed, so nothing can be true here and
 * false in the parlor.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

const START = Date.parse('2026-07-28T12:00:00Z');

/** Drives the clock so each greeting is logged at a distinct instant. */
function clockAt(instant: number): void {
  let current = instant;
  setClockSource(() => {
    current += 1_000;
    return new Date(current);
  });
}

let managers: readonly DoorManager[] = [];
let tags: ReadonlyMap<string, ReadonlySet<string>> = new Map();

describe.skipIf(!hasDatabase)('the Counter Greeting', () => {
  beforeAll(async () => {
    clockAt(START);

    await resetDatabase(db!);

    const source = createFixtureSource();
    const chain = await traverseChain(source, '1385016656425668608', { includeWeeks: false });
    await persistChain(db!, chain, { sourceLabel: source.label });
    await seedCounterGreetings(db!, readCounterGreetings());

    managers = await listDoorManagers(db!);
    tags = await loadTags(db!);
  });

  afterAll(async () => {
    clearClock();
    if (hasDatabase) await closePool();
  });

  const leagueTags = (): readonly ReadonlySet<string>[] =>
    managers.map((manager) => tags.get(manager.id) ?? new Set<string>());

  async function greet(manager: DoorManager) {
    return greetingFor(db!, {
      userId: manager.id,
      displayName: manager.displayName,
      tags: tags.get(manager.id) ?? new Set<string>(),
      leagueTags: leagueTags(),
      daysUntilKickoff: seasonClock().daysUntilKickoff,
    });
  }

  const find = (name: string): DoorManager => {
    const manager = managers.find((candidate) => candidate.displayName === name);
    if (manager === undefined) throw new Error(`${name} is not in the imported league`);
    return manager;
  };

  it('imported the ten managers the league actually has', () => {
    expect(managers).toHaveLength(10);
  });

  it('gives every manager a line', async () => {
    await db!.delete(contentUsageLog);

    for (const manager of managers) {
      const greeting = await greet(manager);
      expect(greeting, manager.displayName).not.toBeNull();
      expect(greeting?.text.length ?? 0, manager.displayName).toBeGreaterThan(0);
    }
  });

  /** The criterion, stated the way `17 §3` states it. */
  it('gives two managers side by side visibly different greetings', async () => {
    await db!.delete(contentUsageLog);

    const champion = await greet(find('MattyB2317'));
    const bestRecord = await greet(find('RonJonathan'));

    expect(champion?.text).not.toBe(bestRecord?.text);
    expect(champion?.entryKey).not.toBe(bestRecord?.entryKey);
  });

  /**
   * How far the greeting actually differentiates the room, asserted rather
   * than assumed — so that adding a line, or a manager's season changing what
   * they are eligible for, shows up here as a change rather than as a quiet
   * drift toward everybody hearing the same thing.
   *
   * Six of the ten get a line nobody else in the room gets. The other four
   * share in two pairs, and both pairs are honest ties in the data:
   *
   *   - SuggMyNick and cheeseking both made the 2025 playoffs without a title,
   *     and A21 is the only Group A line keyed to that
   *   - NateyDee (5–9) and imbrickedup22 (4–10) finished 2025 without leading
   *     or trailing the league in anything, so the title-drought line is all
   *     Group A has for either
   *
   * That is a **content gap on the commissioner's track** (`17 §11`), not a
   * selection bug: two more lines close it, and no code changes.
   */
  it('gives most of the room a line nobody else gets, and never more than a pair the same', async () => {
    await db!.delete(contentUsageLog);

    const byKey = new Map<string, string[]>();

    for (const manager of managers) {
      const greeting = await greet(manager);
      const holders = byKey.get(greeting?.entryKey ?? '—') ?? [];
      holders.push(manager.displayName);
      byKey.set(greeting?.entryKey ?? '—', holders);
    }

    const unique = [...byKey.values()].filter((holders) => holders.length === 1);
    const largestGroup = Math.max(...[...byKey.values()].map((holders) => holders.length));

    expect(unique.length).toBeGreaterThanOrEqual(6);
    // Nobody's greeting is the house line. Three managers hearing the same
    // sentence is the failure `17 §3` is guarding against.
    expect(largestGroup).toBeLessThanOrEqual(2);
  });

  /**
   * Every claim is checked against the imported numbers rather than against
   * the tag that produced it. A tag and a line can agree with each other and
   * both be wrong about the season.
   */
  it('says only true things', async () => {
    await db!.delete(contentUsageLog);

    const truths: Record<string, RegExp> = {
      // 7–7 and the ring. Champion of 2025.
      MattyB2317: /Seven and seven|Defending champ|Trophy's yours/,
      // 11–3, 1868.70 points, no title.
      RonJonathan: /Eighteen sixty-eight|Eleven and three|Two seasons on that wall/,
      // 2024 champion, 9–5 with the second-most points in 2025.
      BigJuncer: /Still the only reason|One ring, one year removed|Second most points/,
      // 1430.34 points, fewest in the league.
      MattLee04: /Fewest points|Three and eleven|Two seasons on that wall/,
      // 1776.20 points against, most in the league; missed January both years.
      jfletcher433: /Seventeen seventy-six|Two seasons, no January|Three and eleven/,
      // First season; roster 4, after Berardo and Topouzian.
      zackstephens54: /You're the new one|No record, no history|Fourth roster/,
    };

    for (const [name, expected] of Object.entries(truths)) {
      const greeting = await greet(find(name));
      expect(greeting?.text ?? '', `${name}: ${greeting?.text ?? 'no line'}`).toMatch(expected);
    }
  });

  it('never tells the newcomer about a season he did not play', async () => {
    await db!.delete(contentUsageLog);
    const zack = find('zackstephens54');

    // Ten draws: no record, no placement, no points may ever appear.
    for (let visit = 0; visit < 10; visit++) {
      const greeting = await greet(zack);
      expect(greeting?.text ?? '').not.toMatch(/\d+ and \d+|ring|points|playoffs/i);
    }
  });

  /** `17 §3`'s secondary criterion. */
  it('gives the same manager three different lines on three consecutive days', async () => {
    await db!.delete(contentUsageLog);
    const matty = find('MattyB2317');
    const seen: string[] = [];

    for (let day = 0; day < 3; day++) {
      clockAt(START + day * 24 * 60 * 60 * 1000);
      const greeting = await greet(matty);
      seen.push(greeting?.entryKey ?? '—');
    }

    expect(new Set(seen).size).toBe(3);
    clockAt(START);
  });

  it('does not repeat a line to the same manager twice in a day', async () => {
    await db!.delete(contentUsageLog);
    const ron = find('RonJonathan');

    const first = await greet(ron);
    const second = await greet(ron);

    expect(first?.entryKey).not.toBe(second?.entryKey);
  });

  it('logs every line it shows, so the cooldown has something to work from', async () => {
    await db!.delete(contentUsageLog);
    const alex = find('BigJuncer');

    await greet(alex);
    const logged = await db!.select().from(contentUsageLog);

    expect(logged).toHaveLength(1);
    expect(logged[0]!.userId).toBe(alex.id);
    expect(logged[0]!.surface).toBe('parlor_greeting');
  });

  it('matches Tony’s sprite to the mood of the line', async () => {
    await db!.delete(contentUsageLog);

    for (const manager of managers) {
      const greeting = await greet(manager);
      expect(greeting?.tonySlug).toBe(`character_tony_${greeting?.expression ?? 'neutral'}`);
    }
  });

  it('falls back to an offseason line rather than saying nothing', async () => {
    await db!.delete(contentUsageLog);
    const nate = find('NateyDee');

    // Draw until the tagged lines are exhausted by their cooldowns; what is
    // left must still be a real, true line.
    for (let visit = 0; visit < 5; visit++) {
      const greeting = await greet(nate);
      expect(greeting, `visit ${String(visit)}`).not.toBeNull();
      expect(greeting?.text).toContain('NateyDee');
    }
  });

  /**
   * A15 reads "{days} days until it matters again". Once the season starts
   * there is no such number, and `05 §2.3` requires the line be skipped rather
   * than rendered with a gap.
   */
  it('drops the countdown line once the season has started', async () => {
    await db!.delete(contentUsageLog);
    const nate = find('NateyDee');

    for (let visit = 0; visit < 6; visit++) {
      const greeting = await greetingFor(db!, {
        userId: nate.id,
        displayName: nate.displayName,
        tags: tags.get(nate.id) ?? new Set<string>(),
        leagueTags: leagueTags(),
        daysUntilKickoff: null,
      });

      expect(greeting?.entryKey).not.toBe('A15');
      expect(greeting?.text ?? '').not.toContain('{days}');
    }
  });
});
