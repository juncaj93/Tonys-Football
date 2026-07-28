/**
 * Recorded Sleeper fixtures.
 *
 * `16 §12`: "All sync development runs against recorded fixtures regardless,
 * which is the intended design." The API is undocumented, has no SLA, and — in
 * the 2026 preseason — has no current-season data to test against at all. The
 * completed 2024 and 2025 seasons are the only realistic data that exists, and
 * a recorded copy of them is worth more than live access.
 *
 * Fixtures are byte-stable: keys sorted, two-space indent, trailing newline.
 * Re-recording an unchanged season therefore produces no diff, which is what
 * makes "did upstream change?" a question `git status` can answer.
 *
 * The manifest is load-bearing, not documentation. It records which endpoints
 * came back empty — a fact that has no file to live in — and a hash of every
 * payload, so a hand-edited fixture fails loudly instead of quietly changing
 * what the tests believe about the league.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { endpointKey, type SleeperEndpoint } from './endpoints';
import { type SleeperFetchResult, type SleeperSource } from './transport';

export const FIXTURE_ROOT = path.join(process.cwd(), 'fixtures', 'sleeper');
export const MANIFEST_FILENAME = 'manifest.json';
export const MANIFEST_VERSION = 1;

export interface FixtureManifestEntry {
  readonly key: string;
  readonly endpoint: SleeperEndpoint;
  readonly result: 'ok' | 'empty';
  readonly status: number;
  /** sha256 of the written file's bytes. Absent when `result` is `empty`. */
  readonly sha256?: string;
  readonly bytes?: number;
}

export interface FixtureManifest {
  readonly version: number;
  /** When the recording ran. Metadata only — never an input to a test. */
  readonly recordedAt: string;
  readonly baseUrl: string;
  /** Chain order, newest season first. */
  readonly leagueIds: readonly string[];
  readonly entries: readonly FixtureManifestEntry[];
  readonly playerProjection?: PlayerProjectionSummary;
}

export interface PlayerProjectionSummary {
  readonly file: string;
  readonly sha256: string;
  readonly playerCount: number;
  /** Total players Sleeper returned, before projection. */
  readonly sourceCount: number;
}

/**
 * The minimum a player record needs to be named in a story or a lineup.
 *
 * `/players/nfl` is a **14.6 MB** response covering every player in the NFL,
 * most of whom this league has never rostered. Committing it whole would make
 * the repository unpleasant to clone and every diff unreadable, and fetching
 * it in a request path would be indefensible.
 *
 * So it is the one endpoint where the recorded fixture is deliberately NOT the
 * live payload: the recorder projects it down to the players this league has
 * actually rostered, and keeps four fields. That is why it sits outside the
 * manifest's endpoint entries — the fixture/live symmetry that the rest of the
 * transport guarantees does not hold here, and hiding that would be worse than
 * the asymmetry.
 */
export interface ProjectedPlayer {
  readonly playerId: string;
  readonly fullName: string;
  readonly position: string | null;
  readonly team: string | null;
}

export const PLAYER_PROJECTION_FILE = 'players/nfl-projection';

export function loadPlayerProjection(
  root: string = FIXTURE_ROOT,
): ReadonlyMap<string, ProjectedPlayer> {
  const file = fixtureFilePath(root, PLAYER_PROJECTION_FILE);

  let contents: string;
  try {
    contents = readFileSync(file, 'utf8');
  } catch {
    throw new Error(
      `No player projection at ${file}. Record fixtures with \`npm run sleeper:record\`.`,
    );
  }

  const parsed = JSON.parse(contents) as Record<string, ProjectedPlayer>;
  return new Map(Object.entries(parsed));
}

/**
 * JSON with deterministically ordered keys.
 *
 * `JSON.stringify` preserves insertion order, which for a parsed API response
 * is whatever order the provider happened to serialize in. That is stable in
 * practice but guaranteed by nothing, and a reordered 250KB fixture is an
 * unreviewable diff.
 */
export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  const walk = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(walk);

    if (typeof input === 'object' && input !== null) {
      if (seen.has(input)) {
        throw new Error('Cannot serialize a circular structure to a fixture.');
      }
      seen.add(input);

      const source = input as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(source).sort()) {
        out[key] = walk(source[key]);
      }
      return out;
    }

    return input;
  };

  return `${JSON.stringify(walk(value), null, 2)}\n`;
}

export function hashBytes(contents: string): string {
  return createHash('sha256').update(contents, 'utf8').digest('hex');
}

export function fixtureFilePath(root: string, key: string): string {
  return path.join(root, `${key}.json`);
}

export function manifestPath(root: string): string {
  return path.join(root, MANIFEST_FILENAME);
}

export function readManifest(root: string = FIXTURE_ROOT): FixtureManifest {
  const file = manifestPath(root);

  let contents: string;
  try {
    contents = readFileSync(file, 'utf8');
  } catch {
    throw new Error(
      `No fixture manifest at ${file}. Record fixtures with \`npm run sleeper:record\`.`,
    );
  }

  const parsed: unknown = JSON.parse(contents);
  if (typeof parsed !== 'object' || parsed === null || !('entries' in parsed)) {
    throw new Error(`Fixture manifest at ${file} is malformed.`);
  }

  const manifest = parsed as FixtureManifest;
  if (manifest.version !== MANIFEST_VERSION) {
    throw new Error(
      `Fixture manifest version ${String(manifest.version)} does not match the expected ` +
        `${String(MANIFEST_VERSION)}. Re-record fixtures.`,
    );
  }

  return manifest;
}

export interface FixtureSourceOptions {
  readonly root?: string;
  /**
   * Verify each payload against the hash recorded in the manifest.
   *
   * On by default. A fixture edited by hand to make a test pass is a test that
   * proves nothing, and this is the only cheap defence against it.
   */
  readonly verifyHashes?: boolean;
}

/**
 * A {@link SleeperSource} backed by recorded fixtures.
 *
 * Interchangeable with the live source, which is the entire point: the chain
 * adapter, and everything built on it later, cannot tell which one it has.
 */
export function createFixtureSource(options: FixtureSourceOptions = {}): SleeperSource {
  const root = options.root ?? FIXTURE_ROOT;
  const verifyHashes = options.verifyHashes ?? true;

  const manifest = readManifest(root);
  const byKey = new Map(manifest.entries.map((entry) => [entry.key, entry]));

  return {
    label: `fixtures(${path.relative(process.cwd(), root) || root})`,

    fetch(endpoint: SleeperEndpoint): Promise<SleeperFetchResult> {
      const key = endpointKey(endpoint);
      // Fixtures replay recorded history; there is no live clock involved, and
      // a fixed timestamp keeps replays byte-identical between runs.
      const fetchedAt = new Date(manifest.recordedAt);
      const entry = byKey.get(key);

      if (entry === undefined) {
        return Promise.resolve({
          kind: 'error',
          endpoint,
          status: null,
          message:
            `No fixture recorded for ${key}. Either the endpoint is new or the ` +
            `fixtures are stale — re-record with \`npm run sleeper:record\`.`,
          attempts: 0,
          fetchedAt,
        });
      }

      if (entry.result === 'empty') {
        return Promise.resolve({ kind: 'empty', endpoint, status: entry.status, fetchedAt });
      }

      const file = fixtureFilePath(root, key);
      let contents: string;
      try {
        contents = readFileSync(file, 'utf8');
      } catch {
        return Promise.resolve({
          kind: 'error',
          endpoint,
          status: null,
          message: `Fixture ${key} is in the manifest but ${file} is missing.`,
          attempts: 0,
          fetchedAt,
        });
      }

      if (verifyHashes && entry.sha256 !== undefined) {
        const actual = hashBytes(contents);
        if (actual !== entry.sha256) {
          return Promise.resolve({
            kind: 'error',
            endpoint,
            status: null,
            message:
              `Fixture ${key} does not match its recorded hash. It has been edited ` +
              `by hand or partially re-recorded; re-record the whole set.`,
            attempts: 0,
            fetchedAt,
          });
        }
      }

      return Promise.resolve({
        kind: 'ok',
        endpoint,
        payload: JSON.parse(contents) as unknown,
        status: entry.status,
        fetchedAt,
      });
    },
  };
}
