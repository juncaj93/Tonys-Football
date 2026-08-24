import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { listDoorManagers, type DoorManager } from '@/lib/auth/service';
import { clearClock, setClockSource } from '@/lib/clock';
import { closePool, getDb } from '@/lib/db';
import { resetDatabase } from '@/lib/db/test-helpers';
import { seasonClock } from '@/lib/parlor/season';
import { traverseChain } from '@/lib/sleeper/chain';
import { createFixtureSource } from '@/lib/sleeper/fixtures';
import { persistChain } from '@/lib/sleeper/persist';
import { latestPacket } from '@/lib/slice/edition';
import { loadTags } from '@/lib/tags/repository';

import { conversationFor, timeAndCalendarTags } from './conversation';
import { readManagerNames, seedManagerNames } from './managers';
import { readTonyConversations, seedTonyConversations } from './seed';

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;
const START = Date.parse('2026-08-24T18:00:00Z');

function clockAt(instant: number): void {
  let current = instant;
  setClockSource(() => {
    current += 1_000;
    return new Date(current);
  });
}

describe('Tony conversation deck', () => {
  it('tags an Eastern Sunday afternoon as both time and football context', () => {
    const tags = timeAndCalendarTags(new Date('2026-08-23T18:00:00Z'), 18);
    expect(tags.has('time_afternoon')).toBe(true);
    expect(tags.has('nfl_sunday')).toBe(true);
    expect(tags.has('season_offseason')).toBe(true);
  });
});

describe.skipIf(!hasDatabase)('Tony conversation rotation', () => {
  let managers: readonly DoorManager[] = [];
  let tags: ReadonlyMap<string, ReadonlySet<string>> = new Map();

  beforeAll(async () => {
    clockAt(START);
    await resetDatabase(db!);
    const source = createFixtureSource();
    const chain = await traverseChain(source, '1385016656425668608', { includeWeeks: false });
    await persistChain(db!, chain, { sourceLabel: source.label });
    await seedManagerNames(db!, readManagerNames());
    await seedTonyConversations(db!, readTonyConversations());
    managers = await listDoorManagers(db!);
    tags = await loadTags(db!);
  });

  afterAll(async () => {
    clearClock();
    if (hasDatabase) await closePool();
  });

  it('does not repeat among eight return visits', async () => {
    const manager = managers[0]!;
    const leagueTags = managers.map((candidate) => tags.get(candidate.id) ?? new Set<string>());
    const packet = await latestPacket(db!);
    const heard: string[] = [];

    for (let index = 0; index < 8; index++) {
      const line = await conversationFor(db!, {
        userId: manager.id,
        displayName: manager.displayName,
        teamName: manager.teamName,
        tags: tags.get(manager.id) ?? new Set<string>(),
        leagueTags,
        daysUntilKickoff: seasonClock().daysUntilKickoff,
        fact: null,
        packet,
        random: () => 0,
      });
      expect(line).not.toBeNull();
      heard.push(line!.entryKey);
    }

    expect(new Set(heard).size).toBe(heard.length);
  });
});
