import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createFixtureSource,
  hashBytes,
  loadPlayerProjection,
  MANIFEST_VERSION,
  readManifest,
  stableStringify,
  type FixtureManifest,
} from './fixtures';

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'tonys-fixtures-'));
  temporaryRoots.push(root);
  return root;
}

/** Build a one-entry fixture set on disk. */
function writeFixtureSet(payload: unknown, options: { corrupt?: boolean } = {}): string {
  const root = temporaryRoot();
  const key = 'league/1/league';
  const contents = stableStringify(payload);

  mkdirSync(path.join(root, 'league', '1'), { recursive: true });
  writeFileSync(path.join(root, `${key}.json`), options.corrupt === true ? `${contents} ` : contents);

  const manifest: FixtureManifest = {
    version: MANIFEST_VERSION,
    recordedAt: '2026-07-28T00:00:00.000Z',
    baseUrl: 'https://api.sleeper.app/v1',
    leagueIds: ['1'],
    entries: [
      {
        key,
        endpoint: { kind: 'league', leagueId: '1' },
        result: 'ok',
        status: 200,
        sha256: hashBytes(contents),
        bytes: contents.length,
      },
      {
        key: 'league/1/transactions/14',
        endpoint: { kind: 'transactions', leagueId: '1', week: 14 },
        result: 'empty',
        status: 404,
      },
    ],
  };

  writeFileSync(path.join(root, 'manifest.json'), stableStringify(manifest));
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('stableStringify', () => {
  it('sorts keys so a re-recording produces no diff', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });

  it('sorts nested keys too', () => {
    expect(stableStringify({ x: { z: 1, y: 2 } })).toBe('{\n  "x": {\n    "y": 2,\n    "z": 1\n  }\n}\n');
  });

  it('preserves array order, which is meaningful', () => {
    expect(stableStringify([3, 1, 2])).toContain('3');
    expect(JSON.parse(stableStringify([3, 1, 2]))).toEqual([3, 1, 2]);
  });

  it('ends with a newline', () => {
    expect(stableStringify({ a: 1 }).endsWith('\n')).toBe(true);
  });

  it('refuses to serialize a circular structure', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    expect(() => stableStringify(circular)).toThrow(/circular/i);
  });
});

describe('createFixtureSource', () => {
  it('replays a recorded payload', async () => {
    const source = createFixtureSource({ root: writeFixtureSet({ league_id: '1', season: '2025' }) });
    const result = await source.fetch({ kind: 'league', leagueId: '1' });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('unreachable');
    expect(result.payload).toEqual({ league_id: '1', season: '2025' });
  });

  it('replays a recorded empty result', async () => {
    const source = createFixtureSource({ root: writeFixtureSet({ league_id: '1' }) });
    const result = await source.fetch({ kind: 'transactions', leagueId: '1', week: 14 });

    expect(result.kind).toBe('empty');
    expect(result.status).toBe(404);
  });

  // A fixture edited to make a test pass is a test that proves nothing.
  it('rejects a fixture whose bytes no longer match the manifest hash', async () => {
    const source = createFixtureSource({
      root: writeFixtureSet({ league_id: '1' }, { corrupt: true }),
    });
    const result = await source.fetch({ kind: 'league', leagueId: '1' });

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') throw new Error('unreachable');
    expect(result.message).toContain('does not match its recorded hash');
  });

  it('reports an unrecorded endpoint rather than silently returning empty', async () => {
    const source = createFixtureSource({ root: writeFixtureSet({ league_id: '1' }) });
    const result = await source.fetch({ kind: 'matchups', leagueId: '1', week: 5 });

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') throw new Error('unreachable');
    expect(result.message).toContain('No fixture recorded');
  });

  it('refuses a manifest from an older format version', () => {
    const root = writeFixtureSet({ league_id: '1' });
    writeFileSync(
      path.join(root, 'manifest.json'),
      stableStringify({ version: 0, recordedAt: '', baseUrl: '', leagueIds: [], entries: [] }),
    );

    expect(() => createFixtureSource({ root })).toThrow(/does not match the expected/);
  });

  it('explains itself when there are no fixtures at all', () => {
    expect(() => readManifest(temporaryRoot())).toThrow(/npm run sleeper:record/);
  });
});

describe('the committed fixture set', () => {
  it('covers the full league chain, newest season first', () => {
    const manifest = readManifest();

    expect(manifest.leagueIds).toEqual([
      '1385016656425668608', // 2026
      '1240008879295713280', // 2025
      '1113249275284205568', // 2024
    ]);
  });

  it('projects the player catalog instead of committing all 14.6 MB of it', () => {
    const manifest = readManifest();
    const projection = loadPlayerProjection();

    expect(manifest.playerProjection).toBeDefined();
    // A few hundred players this league has rostered, out of twelve thousand.
    expect(projection.size).toBeLessThan(1000);
    expect(manifest.playerProjection?.sourceCount ?? 0).toBeGreaterThan(10_000);
  });

  it('resolves a real rostered player and a team defense', () => {
    const projection = loadPlayerProjection();
    const defenses = [...projection.values()].filter((player) => player.position === 'DEF');

    expect(defenses.length).toBeGreaterThan(0);
    // Every projected player is named — an unnamed one would surface in a
    // story as a bare numeric ID.
    for (const player of projection.values()) {
      expect(player.fullName.length).toBeGreaterThan(0);
    }
  });
});
