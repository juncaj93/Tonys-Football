import { readFileSync } from 'node:fs';
import path from 'node:path';

import { eq } from 'drizzle-orm';

import { now } from '@/lib/clock';
import { type Database } from '@/lib/db';
import { users } from '@/lib/db/schema';

/**
 * Reading the roster out of `content/managers.md`.
 *
 * Same contract as the Counter Greetings: the markdown is the source of truth
 * rather than a description of it, so the commissioner edits a file they can
 * read and reruns the seed. Copying ten names into a TypeScript constant would
 * make renaming somebody a code change and quietly turn the markdown into stale
 * documentation.
 *
 * The parser is strict for the same reason the greeting parser is. A row that
 * does not parse throws with its line number rather than being skipped: a
 * silently dropped rename is a manager the commissioner believes has been
 * renamed, greeted all season by a username they stopped using in 2019.
 */

const FILE = 'content/managers.md';

/** Only the table under this heading is applied. */
const CURRENT_HEADING = '## The current ten';
/** Everything from here down is context, not instruction. */
const FORMER_HEADING = '## Former occupants';

export interface ManagerName {
  readonly sleeperUserId: string;
  /** For humans reading the file. Nothing matches on it — see the file. */
  readonly sleeperUsername: string;
  readonly name: string;
}

export class RosterParseError extends Error {
  constructor(line: number, message: string) {
    super(`${FILE}:${String(line)} — ${message}`);
    this.name = 'RosterParseError';
  }
}

const ROW = /^\|(.+)\|(.+)\|(.+)\|$/;
const SEPARATOR = /^\|[\s|:-]+\|$/;
const ID = /^\d+$/;

export function parseManagerNames(markdown: string): readonly ManagerName[] {
  const lines = markdown.split('\n');
  const entries: ManagerName[] = [];

  let inside = false;
  let sawHeading = false;

  for (const [index, raw] of lines.entries()) {
    const lineNumber = index + 1;
    const text = raw.trim();

    if (text === CURRENT_HEADING) {
      inside = true;
      sawHeading = true;
      continue;
    }
    if (text === FORMER_HEADING) {
      inside = false;
      continue;
    }
    if (!inside || text === '' || SEPARATOR.test(text)) continue;
    if (!text.startsWith('|')) continue;

    const match = ROW.exec(text);
    if (match === null) throw new RosterParseError(lineNumber, `not a table row: ${text}`);

    const [sleeperUserId, sleeperUsername, name] = match.slice(1).map((cell) => cell.trim());

    // The header row. Recognised rather than counted, so a reordered file or an
    // added column does not silently swallow the first manager.
    if (sleeperUserId === 'Sleeper ID') continue;

    if (sleeperUserId === undefined || !ID.test(sleeperUserId)) {
      throw new RosterParseError(lineNumber, `"${sleeperUserId ?? ''}" is not a Sleeper ID`);
    }
    if (name === undefined || name === '') {
      throw new RosterParseError(lineNumber, 'the name is empty');
    }
    if (sleeperUsername === undefined || sleeperUsername === '') {
      throw new RosterParseError(lineNumber, 'the Sleeper username is empty');
    }

    entries.push({ sleeperUserId, sleeperUsername, name });
  }

  if (!sawHeading) throw new RosterParseError(1, `"${CURRENT_HEADING}" is missing`);

  assertDistinct(entries);
  return entries;
}

/**
 * Two managers may not share a name, and one Sleeper account may not appear
 * twice.
 *
 * Both are refused rather than resolved. Tony says the name out loud and the
 * door lists it, so two people called the same thing is a worse outcome than a
 * failed seed — and a duplicated Sleeper ID means the file disagrees with
 * itself about who somebody is.
 */
function assertDistinct(entries: readonly ManagerName[]): void {
  const byId = new Map<string, string>();
  const byName = new Map<string, string>();

  for (const entry of entries) {
    const existingId = byId.get(entry.sleeperUserId);
    if (existingId !== undefined) {
      throw new RosterParseError(1, `Sleeper ID ${entry.sleeperUserId} is listed twice`);
    }
    byId.set(entry.sleeperUserId, entry.name);

    const clash = byName.get(entry.name.toLowerCase());
    if (clash !== undefined) {
      throw new RosterParseError(
        1,
        `two managers are both called "${entry.name}" (${clash} and ${entry.sleeperUsername})`,
      );
    }
    byName.set(entry.name.toLowerCase(), entry.sleeperUsername);
  }
}

export function readManagerNames(): readonly ManagerName[] {
  return parseManagerNames(readFileSync(path.join(process.cwd(), FILE), 'utf8'));
}

export interface RosterSeedResult {
  readonly renamed: readonly string[];
  /** Listed in the file but not in the database. Reported, never fatal. */
  readonly unmatched: readonly string[];
}

/**
 * Apply the names.
 *
 * Idempotent by construction: a row whose name is already correct is not
 * written, so a second run reports nothing. An ID in the file that matches
 * nobody is a warning rather than a failure — a deploy should not fall over
 * because somebody added a manager to the roster before their first import.
 */
export async function seedManagerNames(
  db: Database,
  entries: readonly ManagerName[],
): Promise<RosterSeedResult> {
  const renamed: string[] = [];
  const unmatched: string[] = [];

  for (const entry of entries) {
    const [existing] = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(eq(users.sleeperUserId, entry.sleeperUserId));

    if (existing === undefined) {
      unmatched.push(`${entry.sleeperUsername} (${entry.sleeperUserId})`);
      continue;
    }

    if (existing.displayName === entry.name) continue;

    await db
      .update(users)
      .set({ displayName: entry.name, updatedAt: now() })
      .where(eq(users.id, existing.id));

    renamed.push(`${existing.displayName} → ${entry.name}`);
  }

  return { renamed, unmatched };
}
