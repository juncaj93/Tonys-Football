import { describe, expect, it } from 'vitest';

import { traverseChain } from '@/lib/sleeper/chain';
import { createFixtureSource } from '@/lib/sleeper/fixtures';

import { loadManagerMappings, mappingsBySleeperId, parseManagerMappings } from './mappings';

const LEAGUE_2026 = '1385016656425668608';

function valid(overrides: Record<string, unknown> = {}): unknown {
  return {
    version: 1,
    approvedOn: '2026-07-29',
    managers: [
      {
        sleeperUserId: '1',
        sleeperUsername: 'handle',
        displayName: 'Name',
        retired: false,
        source: 'test',
      },
    ],
    unmapped: [],
    ...overrides,
  };
}

describe('parseManagerMappings', () => {
  it('reads a well-formed file', () => {
    const file = parseManagerMappings(valid());
    expect(file.managers).toHaveLength(1);
    expect(file.managers[0]).toMatchObject({ displayName: 'Name', retired: false });
  });

  it('refuses a mapping with no source — an unsourced mapping is a guess', () => {
    expect(() =>
      parseManagerMappings(
        valid({ managers: [{ sleeperUserId: '1', sleeperUsername: 'h', displayName: 'N' }] }),
      ),
    ).toThrow(/no source/);
  });

  it('refuses two people sharing one canonical name', () => {
    // `users.display_name` carries no uniqueness constraint, so this is the
    // only place a duplicate can be caught — and a duplicate is how a receipt
    // ends up on the wrong counter.
    expect(() =>
      parseManagerMappings(
        valid({
          managers: [
            { sleeperUserId: '1', sleeperUsername: 'a', displayName: 'Same', source: 't' },
            { sleeperUserId: '2', sleeperUsername: 'b', displayName: 'Same', source: 't' },
          ],
        }),
      ),
    ).toThrow(/used by more than one account/);
  });

  it('refuses the same Sleeper account twice', () => {
    expect(() =>
      parseManagerMappings(
        valid({
          managers: [
            { sleeperUserId: '1', sleeperUsername: 'a', displayName: 'A', source: 't' },
            { sleeperUserId: '1', sleeperUsername: 'a', displayName: 'B', source: 't' },
          ],
        }),
      ),
    ).toThrow(/appears twice/);
  });

  it('refuses an account listed as both mapped and unmapped', () => {
    expect(() =>
      parseManagerMappings(
        valid({ unmapped: [{ sleeperUserId: '1', sleeperUsername: 'handle', reason: 'x' }] }),
      ),
    ).toThrow(/both/);
  });

  it('refuses a file from another version rather than reading it optimistically', () => {
    expect(() => parseManagerMappings(valid({ version: 2 }))).toThrow(/version/);
  });
});

describe('the committed mapping file', () => {
  it('names the four accounts the ruling settled', () => {
    const byId = mappingsBySleeperId(loadManagerMappings());

    // RonJonathan is Ryan. There is no separate Ron identity.
    expect(byId.get('705813167879553024')?.displayName).toBe('Ryan');
    expect(byId.get('1251952575964524544')?.displayName).toBe('Shant');
    expect(byId.get('1113986962647654400')?.displayName).toBe('Brandon');
    expect(byId.get('963870811994046464')?.displayName).toBe('Joe');
  });

  it('creates no second identity for Ron', () => {
    const file = loadManagerMappings();
    expect(file.managers.some((m) => m.displayName === 'Ron')).toBe(false);
    expect(file.managers.filter((m) => m.displayName === 'Ryan')).toHaveLength(1);
  });

  it('retires Shant, Armen, and Berardo, and nobody else', () => {
    const file = loadManagerMappings();
    const retired = file.managers.filter((m) => m.retired).map((m) => m.displayName).sort();
    expect(retired).toEqual(['Armen', 'Berardo', 'Shant']);
  });

  it('keeps Armen and Shant as separate people', () => {
    const byId = mappingsBySleeperId(loadManagerMappings());
    const shant = byId.get('1251952575964524544');
    const armen = byId.get('604375476017885184');

    expect(armen?.displayName).toBe('Armen');
    expect(shant?.displayName).toBe('Shant');
    expect(armen?.sleeperUserId).not.toBe(shant?.sleeperUserId);
  });

  it('sources every mapping', () => {
    for (const mapping of loadManagerMappings().managers) {
      expect(mapping.source, mapping.displayName).not.toBe('');
    }
  });

  it('covers every Sleeper account in the recorded league', async () => {
    const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, { includeWeeks: false });
    const byId = mappingsBySleeperId(loadManagerMappings());

    const everyAccount = new Set(
      chain.seasons.flatMap((season) => season.users.map((user) => user.userId)),
    );

    // Thirteen people across three seasons, co-owner included.
    expect(everyAccount.size).toBe(13);

    const missing = [...everyAccount].filter((id) => !byId.has(id));
    expect(missing).toEqual([]);
  });

  it('matches each mapping to the Sleeper handle it claims', async () => {
    const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, { includeWeeks: false });
    const handles = new Map(
      chain.seasons.flatMap((season) =>
        season.users.map((user) => [user.userId, user.displayName] as const),
      ),
    );

    // Guards against a transposed ID putting the right name on the wrong person.
    for (const mapping of loadManagerMappings().managers) {
      expect(handles.get(mapping.sleeperUserId), mapping.displayName).toBe(mapping.sleeperUsername);
    }
  });
});
