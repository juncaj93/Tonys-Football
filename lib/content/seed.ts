import { readFileSync } from 'node:fs';
import path from 'node:path';

import { and, eq, notInArray, sql } from 'drizzle-orm';

import { now } from '@/lib/clock';
import { type Database } from '@/lib/db';
import { contentEntries } from '@/lib/db/schema';

import { BOX_OFFER_COOLDOWN_DAYS, BOX_OFFER_SURFACE } from '@/lib/counter/offer';
import { ASIDE_COOLDOWN_DAYS, ASIDE_SURFACE } from '@/lib/parlor/aside';

import { TONY_CONVERSATION_COOLDOWN_DAYS, TONY_CONVERSATION_SURFACE } from './conversation';
import { GREETING_COOLDOWN_DAYS, GREETING_SURFACE } from './greeting';
import {
  parseBoxOffers,
  parseCounterGreetings,
  parseStatsAsides,
  parseTonyConversations,
  type ParsedLine,
} from './parse';

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
export const BOX_OFFERS_PATH = path.join('content', 'box-offer.md');
export const STATS_ASIDES_PATH = path.join('content', 'counter-stats.md');
export const TONY_CONVERSATIONS_PATH = path.join('content', 'tony-conversations.md');

export interface SeedSummary {
  readonly inserted: number;
  readonly updated: number;
  readonly deactivated: number;
  readonly keys: readonly string[];
}

export function readCounterGreetings(root = process.cwd()): readonly ParsedLine[] {
  return parseCounterGreetings(readFileSync(path.join(root, COUNTER_GREETINGS_PATH), 'utf8'));
}

export function readBoxOffers(root = process.cwd()): readonly ParsedLine[] {
  return parseBoxOffers(readFileSync(path.join(root, BOX_OFFERS_PATH), 'utf8'));
}

export function readStatsAsides(root = process.cwd()): readonly ParsedLine[] {
  return parseStatsAsides(readFileSync(path.join(root, STATS_ASIDES_PATH), 'utf8'));
}

export function readTonyConversations(root = process.cwd()): readonly ParsedLine[] {
  return parseTonyConversations(readFileSync(path.join(root, TONY_CONVERSATIONS_PATH), 'utf8'));
}

export async function seedCounterGreetings(
  db: Database,
  entries: readonly ParsedLine[],
): Promise<SeedSummary> {
  return seedSurface(db, entries, {
    surface: GREETING_SURFACE,
    path: COUNTER_GREETINGS_PATH,
    cooldownDays: GREETING_COOLDOWN_DAYS,
  });
}

/**
 * Tony's other end of the loop.
 *
 * A separate call rather than a second branch inside the greeting seeder,
 * because the two files are edited independently and the deactivation sweep is
 * **scoped to one surface**: seeding the greetings must not retire the offers
 * merely because they are not in that file.
 */
export async function seedBoxOffers(
  db: Database,
  entries: readonly ParsedLine[],
): Promise<SeedSummary> {
  return seedSurface(db, entries, {
    surface: BOX_OFFER_SURFACE,
    path: BOX_OFFERS_PATH,
    cooldownDays: BOX_OFFER_COOLDOWN_DAYS,
  });
}

/**
 * Tony mentioning a result.
 *
 * Its own call for the same reason the offers have one: the deactivation sweep
 * is scoped to a single surface, so seeding one file must never retire another's
 * lines merely because they are not in it.
 */
export async function seedStatsAsides(
  db: Database,
  entries: readonly ParsedLine[],
): Promise<SeedSummary> {
  return seedSurface(db, entries, {
    surface: ASIDE_SURFACE,
    path: STATS_ASIDES_PATH,
    cooldownDays: ASIDE_COOLDOWN_DAYS,
  });
}

/** Lines for returning to Tony: one deck with a long no-repeat window. */
export async function seedTonyConversations(
  db: Database,
  entries: readonly ParsedLine[],
): Promise<SeedSummary> {
  return seedSurface(db, entries, {
    surface: TONY_CONVERSATION_SURFACE,
    path: TONY_CONVERSATIONS_PATH,
    cooldownDays: TONY_CONVERSATION_COOLDOWN_DAYS,
  });
}

async function seedSurface(
  db: Database,
  entries: readonly ParsedLine[],
  surface: { surface: string; path: string; cooldownDays: number },
): Promise<SeedSummary> {
  const at = now();

  const existing = await db
    .select({ key: contentEntries.key })
    .from(contentEntries)
    .where(eq(contentEntries.surface, surface.surface));

  const existingKeys = new Set(existing.map((row) => row.key));
  const keys = entries.map((entry) => entry.key);

  for (const entry of entries) {
    await db
      .insert(contentEntries)
      .values({
        key: entry.key,
        kind: 'tony_line',
        surface: surface.surface,
        requiredTags: [...entry.requiredTags],
        excludedTags: [],
        templateText: entry.templateText,
        expression: entry.expression,
        weight: 100,
        cooldownDays: surface.cooldownDays,
        maxUsesPerSeason: null,
        // Nothing approved so far is restricted. The gate exists from the first
        // line rather than being retrofitted around content already live.
        sensitivity: 'ordinary',
        // `A` is "approved by the commissioner", which is what the guard below
        // checks. It is not "the section headed Group A" — the box offers live
        // in their own file and are approved in their own ruling.
        approvalGroup: 'A',
        active: true,
        sourceRef: `${surface.path}#${entry.key}`,
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
              eq(contentEntries.surface, surface.surface),
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
 * Guard against unapproved content reaching production.
 *
 * `A` means **approved by the commissioner**, on any surface. Group B in the
 * greetings file is the unapproved set: it draws on character canon rather than
 * imported data and, until four Sleeper accounts are confidently mapped, could
 * land a joke on the wrong person. This is asserted rather than assumed because
 * the failure is invisible — a Group B row would simply start appearing with
 * nothing to signal that it should not have.
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
