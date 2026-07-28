/**
 * Records Sleeper fixtures for the whole league chain.
 *
 *   npm run sleeper:record                    # starts from SLEEPER_LEAGUE_ID
 *   npm run sleeper:record -- <league-id>     # starts from an explicit ID
 *   npm run sleeper:record -- --check         # re-record and fail on any diff
 *
 * This is the only file in the project that reaches the live Sleeper API on
 * purpose. Everything else — tests, the chain adapter, CI — reads what this
 * script wrote. `16 §12`: "All sync development runs against recorded fixtures
 * regardless, which is the intended design."
 *
 * Output is byte-stable, so re-recording an unchanged season produces no diff.
 * `--check` turns that property into an upstream-drift alarm that can be run
 * on demand without touching the working tree.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { now } from '@/lib/clock';
import { decodeLeague, decodeMatchups, decodeRosters } from '@/lib/sleeper/codec';
import {
  endpointKey,
  seasonEndpoints,
  SLEEPER_API_BASE,
  type SleeperEndpoint,
} from '@/lib/sleeper/endpoints';
import {
  fixtureFilePath,
  hashBytes,
  manifestPath,
  MANIFEST_VERSION,
  PLAYER_PROJECTION_FILE,
  stableStringify,
  type FixtureManifest,
  type FixtureManifestEntry,
  type PlayerProjectionSummary,
  type ProjectedPlayer,
} from '@/lib/sleeper/fixtures';
import { createLiveSource, type SleeperSource } from '@/lib/sleeper/transport';

const FIXTURE_ROOT = path.join(process.cwd(), 'fixtures', 'sleeper');
const MAX_CHAIN_DEPTH = 25;

interface Args {
  readonly leagueId: string;
  readonly check: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const check = argv.includes('--check');
  const positional = argv.filter((arg) => !arg.startsWith('--'));

  const leagueId = positional[0] ?? process.env['SLEEPER_LEAGUE_ID'] ?? '';
  if (leagueId === '') {
    throw new Error(
      'No league ID. Pass one as an argument or set SLEEPER_LEAGUE_ID in .env.local.',
    );
  }
  if (!/^\d+$/.test(leagueId)) {
    throw new Error(`League ID "${leagueId}" is not numeric.`);
  }

  return { leagueId, check };
}

/** Follow `previous_league_id` to collect every season's league ID, newest first. */
async function discoverChain(source: SleeperSource, startLeagueId: string): Promise<string[]> {
  const chain: string[] = [];
  const visited = new Set<string>();
  let currentId: string | null = startLeagueId;

  while (currentId !== null) {
    if (visited.has(currentId)) {
      throw new Error(`previous_league_id chain revisits ${currentId} — it forms a cycle.`);
    }
    if (chain.length >= MAX_CHAIN_DEPTH) {
      throw new Error(`previous_league_id chain exceeded ${String(MAX_CHAIN_DEPTH)} seasons.`);
    }
    visited.add(currentId);

    const result = await source.fetch({ kind: 'league', leagueId: currentId });
    if (result.kind !== 'ok') {
      throw new Error(
        `Could not read league ${currentId}: ` +
          (result.kind === 'error' ? result.message : 'the response was empty'),
      );
    }

    const league = decodeLeague(result.payload);
    chain.push(currentId);
    console.log(
      `  ${String(league.value.season)}  ${currentId}  ${league.value.name} (${league.value.status})`,
    );
    currentId = league.value.previousLeagueId;
  }

  return chain;
}

function writeFixture(root: string, key: string, payload: unknown): { sha256: string; bytes: number } {
  const file = fixtureFilePath(root, key);
  mkdirSync(path.dirname(file), { recursive: true });
  const contents = stableStringify(payload);
  writeFileSync(file, contents, 'utf8');
  return { sha256: hashBytes(contents), bytes: Buffer.byteLength(contents, 'utf8') };
}

/**
 * Every player ID this league has actually touched.
 *
 * Drawn from current rosters and from every recorded week's matchups, so a
 * player who was rostered for one week in 2024 still resolves to a name.
 */
function collectPlayerIds(root: string, leagueIds: readonly string[]): Set<string> {
  const ids = new Set<string>();

  const readFixture = (endpoint: SleeperEndpoint): unknown => {
    try {
      return JSON.parse(readFileSync(fixtureFilePath(root, endpointKey(endpoint)), 'utf8'));
    } catch {
      return null;
    }
  };

  for (const leagueId of leagueIds) {
    const rosters = readFixture({ kind: 'rosters', leagueId });
    if (rosters !== null) {
      for (const roster of decodeRosters(rosters).value) {
        for (const id of roster.players) ids.add(id);
        for (const id of roster.starters) ids.add(id);
      }
    }

    for (let week = 1; week <= 18; week++) {
      const matchups = readFixture({ kind: 'matchups', leagueId, week });
      if (matchups === null) continue;
      for (const entry of decodeMatchups(matchups).value) {
        for (const id of entry.players) ids.add(id);
        for (const id of entry.starters) ids.add(id);
        for (const id of Object.keys(entry.playerPoints)) ids.add(id);
      }
    }
  }

  // Sleeper uses "0" as an empty starter slot.
  ids.delete('0');
  return ids;
}

async function recordPlayerProjection(
  root: string,
  leagueIds: readonly string[],
): Promise<PlayerProjectionSummary> {
  const wanted = collectPlayerIds(root, leagueIds);
  console.log(`\nProjecting players (${String(wanted.size)} referenced by this league)…`);

  // Fetched directly rather than through the transport: this is the one
  // endpoint whose fixture is deliberately not its live payload, so routing it
  // through the source abstraction would imply a symmetry that is not there.
  const response = await fetch(`${SLEEPER_API_BASE}/players/nfl`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Could not fetch the player catalog: HTTP ${String(response.status)}`);
  }

  const catalog = (await response.json()) as Record<string, Record<string, unknown>>;
  const sourceCount = Object.keys(catalog).length;

  const projected: Record<string, ProjectedPlayer> = {};
  const missing: string[] = [];

  for (const playerId of [...wanted].sort()) {
    const record = catalog[playerId];
    if (record === undefined) {
      missing.push(playerId);
      continue;
    }

    const readString = (key: string): string | null => {
      const value = record[key];
      return typeof value === 'string' && value !== '' ? value : null;
    };

    // Team defenses carry no `full_name`; fall back to the name parts, and
    // finally to the ID itself, which for a defense is the team code.
    const composed = [readString('first_name'), readString('last_name')]
      .filter((part): part is string => part !== null)
      .join(' ');
    const fullName = readString('full_name') ?? (composed === '' ? playerId : composed);

    projected[playerId] = {
      playerId,
      fullName,
      position: readString('position'),
      team: readString('team'),
    };
  }

  if (missing.length > 0) {
    console.log(
      `  ${String(missing.length)} referenced player(s) are absent from the catalog ` +
        `(retired or removed upstream): ${missing.slice(0, 5).join(', ')}` +
        (missing.length > 5 ? '…' : ''),
    );
  }

  const written = writeFixture(root, PLAYER_PROJECTION_FILE, projected);
  console.log(
    `  ${String(Object.keys(projected).length)} of ${String(sourceCount)} players kept ` +
      `(${String(Math.round(written.bytes / 1024))} KB).`,
  );

  return {
    file: `${PLAYER_PROJECTION_FILE}.json`,
    sha256: written.sha256,
    playerCount: Object.keys(projected).length,
    sourceCount,
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const source = createLiveSource();

  console.log(`Recording Sleeper fixtures from ${SLEEPER_API_BASE}\n`);
  console.log('Chain:');
  const leagueIds = await discoverChain(source, args.leagueId);

  const root = FIXTURE_ROOT;
  const previousManifest = args.check ? readExistingManifest(root) : null;

  // A full rewrite, so an endpoint that disappears upstream does not linger as
  // a stale fixture that tests keep passing against.
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });

  const entries: FixtureManifestEntry[] = [];
  let okCount = 0;
  let emptyCount = 0;

  const record = async (endpoint: SleeperEndpoint): Promise<void> => {
    const key = endpointKey(endpoint);
    const result = await source.fetch(endpoint);

    if (result.kind === 'error') {
      throw new Error(`Recording aborted: ${result.message}`);
    }

    if (result.kind === 'empty') {
      entries.push({ key, endpoint, result: 'empty', status: result.status });
      emptyCount++;
      return;
    }

    const written = writeFixture(root, key, result.payload);
    entries.push({
      key,
      endpoint,
      result: 'ok',
      status: result.status,
      sha256: written.sha256,
      bytes: written.bytes,
    });
    okCount++;
  };

  console.log('\nRecording endpoints…');
  await record({ kind: 'state' });
  for (const leagueId of leagueIds) {
    process.stdout.write(`  ${leagueId} `);
    for (const endpoint of seasonEndpoints(leagueId)) {
      await record(endpoint);
    }
    console.log('done');
  }

  const playerProjection = await recordPlayerProjection(root, leagueIds);

  entries.sort((a, b) => a.key.localeCompare(b.key));

  const manifest: FixtureManifest = {
    version: MANIFEST_VERSION,
    recordedAt: now().toISOString(),
    baseUrl: SLEEPER_API_BASE,
    leagueIds,
    entries,
    playerProjection,
  };

  writeFileSync(manifestPath(root), stableStringify(manifest), 'utf8');

  console.log(
    `\n${String(okCount)} payloads recorded, ${String(emptyCount)} endpoints empty, ` +
      `${String(leagueIds.length)} seasons.`,
  );

  if (args.check && previousManifest !== null) {
    const drift = compareManifests(previousManifest, manifest);
    if (drift.length > 0) {
      console.error('\nUpstream data has changed since the last recording:\n');
      for (const line of drift) console.error(`  ${line}`);
      process.exit(1);
    }
    console.log('No drift: recorded payloads are identical to the committed fixtures.');
  }
}

function readExistingManifest(root: string): FixtureManifest | null {
  try {
    return JSON.parse(readFileSync(manifestPath(root), 'utf8')) as FixtureManifest;
  } catch {
    return null;
  }
}

/**
 * Compare two recordings by payload hash.
 *
 * `recordedAt` is excluded deliberately — it changes on every run and is not
 * evidence of anything.
 */
function compareManifests(before: FixtureManifest, after: FixtureManifest): string[] {
  const drift: string[] = [];
  const beforeByKey = new Map(before.entries.map((entry) => [entry.key, entry]));
  const afterByKey = new Map(after.entries.map((entry) => [entry.key, entry]));

  for (const [key, entry] of afterByKey) {
    const previous = beforeByKey.get(key);
    if (previous === undefined) {
      drift.push(`added: ${key}`);
    } else if (previous.sha256 !== entry.sha256 || previous.result !== entry.result) {
      drift.push(`changed: ${key}`);
    }
  }
  for (const key of beforeByKey.keys()) {
    if (!afterByKey.has(key)) drift.push(`removed: ${key}`);
  }

  if (before.playerProjection?.sha256 !== after.playerProjection?.sha256) {
    drift.push('changed: player projection');
  }

  return drift;
}

main().catch((error: unknown) => {
  console.error(`\nFixture recording failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
