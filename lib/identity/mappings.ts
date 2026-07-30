/**
 * Canonical manager mappings.
 *
 * Sleeper knows people by handle. The league knows them by name. Those are
 * different facts about the same person and the data model keeps them apart:
 *
 *   - `users.sleeper_user_id`  the durable external identifier — never changes,
 *                              never displayed, the key everything maps through
 *   - `users.sleeper_username` provenance — what Sleeper calls them today
 *   - `users.display_name`     the canonical league name, the one Tony says
 *
 * The canonical name is a **league decision**, not a Sleeper fact, so it is
 * read from `content/manager-mappings.json` rather than seeded from the API.
 * That makes a rename a reviewable file edit instead of a hand-run UPDATE
 * nobody can account for later (Technical Lead ruling 2026-07-29 §8).
 *
 * An account with no mapping is **not** an error and is **not** guessed. It
 * keeps its Sleeper display name and is reported at import, so an unmapped
 * person stays visible rather than quietly becoming whatever the API said.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface ManagerMapping {
  readonly sleeperUserId: string;
  readonly sleeperUsername: string;
  /** The canonical league name. This is what `users.display_name` holds. */
  readonly displayName: string;
  readonly retired: boolean;
  /** Who approved this mapping. Required — an unsourced mapping is a guess. */
  readonly source: string;
}

export interface UnmappedAccount {
  readonly sleeperUserId: string;
  readonly sleeperUsername: string;
  readonly reason: string;
}

export interface ManagerMappingFile {
  readonly version: number;
  readonly approvedOn: string;
  readonly managers: readonly ManagerMapping[];
  readonly unmapped: readonly UnmappedAccount[];
}

export const MAPPING_VERSION = 1;
export const MAPPING_FILE = path.join(process.cwd(), 'content', 'manager-mappings.json');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse and validate the mapping file.
 *
 * Strict, unlike the Sleeper decoders. A tolerant reader is right for an API
 * we do not control; this file is ours, it is small, and a typo in it puts the
 * wrong name in Tony's mouth. Fail at import with a specific message instead.
 */
export function parseManagerMappings(raw: unknown): ManagerMappingFile {
  if (!isRecord(raw)) {
    throw new Error('manager-mappings.json must be an object.');
  }

  if (raw['version'] !== MAPPING_VERSION) {
    throw new Error(
      `manager-mappings.json is version ${String(raw['version'])}; ` +
        `this build expects ${String(MAPPING_VERSION)}.`,
    );
  }

  const managersRaw = raw['managers'];
  if (!Array.isArray(managersRaw)) {
    throw new Error('manager-mappings.json: `managers` must be an array.');
  }

  const managers: ManagerMapping[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  managersRaw.forEach((entry, index) => {
    const where = `manager-mappings.json: managers[${String(index)}]`;
    if (!isRecord(entry)) throw new Error(`${where} is not an object.`);

    const sleeperUserId = entry['sleeperUserId'];
    const sleeperUsername = entry['sleeperUsername'];
    const displayName = entry['displayName'];
    const source = entry['source'];

    if (typeof sleeperUserId !== 'string' || sleeperUserId === '') {
      throw new Error(`${where} has no sleeperUserId.`);
    }
    if (typeof sleeperUsername !== 'string' || sleeperUsername === '') {
      throw new Error(`${where} (${sleeperUserId}) has no sleeperUsername.`);
    }
    if (typeof displayName !== 'string' || displayName.trim() === '') {
      throw new Error(`${where} (${sleeperUsername}) has no displayName.`);
    }
    // An unsourced mapping is indistinguishable from a guess, and a guess puts
    // the wrong name on somebody's greeting.
    if (typeof source !== 'string' || source.trim() === '') {
      throw new Error(
        `${where} (${sleeperUsername}) has no source. Every mapping must record who approved it.`,
      );
    }
    if (seenIds.has(sleeperUserId)) {
      throw new Error(`${where}: sleeperUserId ${sleeperUserId} appears twice.`);
    }
    // Two people answering to one name is how a receipt ends up on the wrong
    // counter. `users.display_name` carries no uniqueness constraint, so this
    // is the only place it can be caught.
    if (seenNames.has(displayName)) {
      throw new Error(`${where}: displayName "${displayName}" is used by more than one account.`);
    }

    seenIds.add(sleeperUserId);
    seenNames.add(displayName);
    managers.push({
      sleeperUserId,
      sleeperUsername,
      displayName,
      retired: entry['retired'] === true,
      source,
    });
  });

  const unmappedRaw = Array.isArray(raw['unmapped']) ? raw['unmapped'] : [];
  const unmapped: UnmappedAccount[] = [];

  for (const entry of unmappedRaw) {
    if (!isRecord(entry)) continue;
    const sleeperUserId = entry['sleeperUserId'];
    const sleeperUsername = entry['sleeperUsername'];
    if (typeof sleeperUserId !== 'string' || typeof sleeperUsername !== 'string') continue;
    if (seenIds.has(sleeperUserId)) {
      throw new Error(
        `manager-mappings.json: ${sleeperUsername} (${sleeperUserId}) is listed as both ` +
          `mapped and unmapped.`,
      );
    }
    unmapped.push({
      sleeperUserId,
      sleeperUsername,
      reason: typeof entry['reason'] === 'string' ? entry['reason'] : '',
    });
  }

  return {
    version: MAPPING_VERSION,
    approvedOn: typeof raw['approvedOn'] === 'string' ? raw['approvedOn'] : '',
    managers,
    unmapped,
  };
}

export function loadManagerMappings(file: string = MAPPING_FILE): ManagerMappingFile {
  let contents: string;
  try {
    contents = readFileSync(file, 'utf8');
  } catch {
    throw new Error(`No manager mappings at ${file}.`);
  }
  return parseManagerMappings(JSON.parse(contents) as unknown);
}

/** Sleeper user ID → mapping, for the import to look up per person. */
export function mappingsBySleeperId(
  file: ManagerMappingFile,
): ReadonlyMap<string, ManagerMapping> {
  return new Map(file.managers.map((entry) => [entry.sleeperUserId, entry]));
}
