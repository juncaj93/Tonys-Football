import { readFileSync } from 'node:fs';
import path from 'node:path';

import { and, eq, notInArray, sql } from 'drizzle-orm';

import { now } from '@/lib/clock';
import { type Database } from '@/lib/db';
import { contentEntries } from '@/lib/db/schema';

import { GREETING_COOLDOWN_DAYS, GREETING_SURFACE } from './greeting';
import { parseCounterGreetings, type ParsedGreeting } from './parse';

/**
 * Seeding the content engine from the authored markdown.
 *
 * Idempotent, and safe to run on every deploy: entries are upserted on their
 * key, so an edited line updates in place and keeps its usage history rather
 * than becoming a new row whose cooldown has never fired.
 *
 * A line removed from the file is **deactivated, never deleted.** The usage log
 * references it, and "which line did Tony use on the day he said that" is a
 * question worth being able to answer a year later.
 */

export const COUNTER_GREETINGS_PATH = path.join('content', 'counter-greetings.md');

export interface SeedSummary {
  readonly inserted: number;
  readonly updated: number;
  readonly deactivated: number;
  readonly keys: readonly string[];
}

export function readCounterGreetings(root = process.cwd()): readonly ParsedGreeting[] {
  return parseCounterGreetings(readFileSync(path.join(root, COUNTER_GREETINGS_PATH), 'utf8'));
}

export async function seedCounterGreetings(
  db: Database,
  entries: readonly ParsedGreeting[],
): Promise<SeedSummary> {
  const at = now();

  const existing = await db
    .select({ key: contentEntries.key })
    .from(contentEntries)
    .where(eq(contentEntries.surface, GREETING_SURFACE));

  const existingKeys = new Set(existing.map((row) => row.key));
  const keys = entries.map((entry) => entry.key);

  for (const entry of entries) {
    await db
      .insert(contentEntries)
      .values({
        key: entry.key,
        kind: 'tony_line',
        surface: GREETING_SURFACE,
        requiredTags: [...entry.requiredTags],
        excludedTags: [],
        templateText: entry.templateText,
        expression: entry.expression,
        weight: 100,
        cooldownDays: GREETING_COOLDOWN_DAYS,
        maxUsesPerSeason: null,
        // Nothing in Group A is restricted. The gate exists from the first line
        // rather than being retrofitted around content already live.
        sensitivity: 'ordinary',
        approvalGroup: 'A',
        active: true,
        sourceRef: `${COUNTER_GREETINGS_PATH}#${entry.key}`,
        updatedAt: at,
      })
      .onConflictDoUpdate({
        target: contentEntries.key,
        set: {
          requiredTags: [...entry.requiredTags],
          templateText: entry.templateText,
          expression: entry.expression,
          active: true,
          updatedAt: at,
        },
      });
  }

  const removed =
    keys.length === 0
      ? []
      : await db
          .update(contentEntries)
          .set({ active: false, updatedAt: at })
          .where(
            and(
              eq(contentEntries.surface, GREETING_SURFACE),
              notInArray(contentEntries.key, keys),
              eq(contentEntries.active, true),
            ),
          )
          .returning({ key: contentEntries.key });

  return {
    inserted: keys.filter((key) => !existingKeys.has(key)).length,
    updated: keys.filter((key) => existingKeys.has(key)).length,
    deactivated: removed.length,
    keys,
  };
}

/**
 * Guard against Group B reaching production.
 *
 * Group B is unapproved and, until four Sleeper accounts are confidently
 * mapped, could land a joke on the wrong person. This is asserted rather than
 * assumed because the failure is invisible: a Group B row would simply start
 * appearing in greetings with nothing to signal that it should not have.
 */
export async function assertOnlyApprovedGroups(db: Database): Promise<void> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contentEntries)
    .where(
      and(
        eq(contentEntries.active, true),
        notInArray(contentEntries.approvalGroup, ['A']),
      ),
    );

  if ((row?.count ?? 0) > 0) {
    throw new Error(
      `${String(row?.count ?? 0)} active content entries are outside approval group A. ` +
        `Group B needs commissioner sign-off before it can be seeded.`,
    );
  }
}

/** Entries currently live on a surface, for the seed script's output. */
export async function activeKeys(db: Database, surface: string): Promise<readonly string[]> {
  const rows = await db
    .select({ key: contentEntries.key })
    .from(contentEntries)
    .where(and(eq(contentEntries.surface, surface), eq(contentEntries.active, true)))
    .orderBy(contentEntries.key);

  return rows.map((row) => row.key);
}
