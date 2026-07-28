import { and, eq, gte } from 'drizzle-orm';

import { now } from '@/lib/clock';
import { type Database } from '@/lib/db';
import { contentEntries, contentUsageLog } from '@/lib/db/schema';

import { selectContent, type SelectableEntry } from './select';
import type { Expression } from './parse';

/**
 * The Counter Greeting.
 *
 * `17 §3` makes this M1's acceptance criterion rather than a nice-to-have:
 * within ten seconds of opening the site on a phone, Tony greets you by name
 * and says **one verified thing about you**, with an expression that matches.
 *
 * Everything here runs through the approved content system — no new tables, no
 * AI, every line curated and every fact derived from the imported chain.
 */

export const GREETING_SURFACE = 'parlor_greeting';

/**
 * Days before the same manager may see the same line again.
 *
 * `17 §3`'s secondary criterion is that the same manager gets three different
 * lines on three consecutive days, so this has to be at least three. It is not
 * higher because several managers have only one or two distinguishing lines,
 * and pushing them onto the untagged fallback for a week would trade a true,
 * personal line for a generic one.
 */
export const GREETING_COOLDOWN_DAYS = 3;

/** How far back usage is loaded. Anything older cannot affect a cooldown. */
const USAGE_LOOKBACK_DAYS = 30;

export interface GreetingEntry extends SelectableEntry {
  readonly expression: Expression | null;
}

export interface Greeting {
  readonly entryKey: string;
  readonly text: string;
  readonly expression: Expression;
  /** Asset slug for Tony's sprite. Resolved through the registry, never a path. */
  readonly tonySlug: string;
}

export interface GreetingRequest {
  readonly userId: string;
  readonly displayName: string;
  readonly tags: ReadonlySet<string>;
  /**
   * Every current manager's tags, this viewer's included.
   *
   * Used to work out how many people a line is true of, so the most pointed
   * true thing wins over the most general one. Without it the champion and the
   * manager who missed January both draw "two seasons on that wall", and the
   * whole point of the greeting is gone.
   */
  readonly leagueTags: readonly ReadonlySet<string>[];
  /** Null when the season has already started — A15 is then skipped, not fudged. */
  readonly daysUntilKickoff: number | null;
  readonly random?: () => number;
}

export function tonySlugFor(expression: Expression): string {
  return `character_tony_${expression}`;
}

/**
 * Choose, render, and log one greeting.
 *
 * Returns null when nothing is eligible. "No content" is always a valid
 * outcome (`16 §10`) and the parlor renders it — Tony is simply at the counter
 * without a line, which is better than a line that is wrong.
 */
export async function greetingFor(
  db: Database,
  request: GreetingRequest,
): Promise<Greeting | null> {
  const at = now();

  const candidates = await db
    .select({
      id: contentEntries.id,
      key: contentEntries.key,
      requiredTags: contentEntries.requiredTags,
      excludedTags: contentEntries.excludedTags,
      templateText: contentEntries.templateText,
      weight: contentEntries.weight,
      cooldownDays: contentEntries.cooldownDays,
      maxUsesPerSeason: contentEntries.maxUsesPerSeason,
      sensitivity: contentEntries.sensitivity,
      expression: contentEntries.expression,
    })
    .from(contentEntries)
    .where(
      and(
        eq(contentEntries.surface, GREETING_SURFACE),
        eq(contentEntries.kind, 'tony_line'),
        eq(contentEntries.active, true),
      ),
    );

  if (candidates.length === 0) return null;

  const usage = await db
    .select({ entryId: contentUsageLog.entryId, usedAt: contentUsageLog.usedAt })
    .from(contentUsageLog)
    .where(
      and(
        eq(contentUsageLog.userId, request.userId),
        eq(contentUsageLog.surface, GREETING_SURFACE),
        gte(
          contentUsageLog.usedAt,
          new Date(at.getTime() - USAGE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
        ),
      ),
    );

  const selection = selectContent<GreetingEntry>({
    candidates,
    tags: request.tags,
    variables: {
      name: request.displayName,
      days: request.daysUntilKickoff === null ? null : String(request.daysUntilKickoff),
    },
    usage,
    now: at,
    audienceSize: (entry) =>
      request.leagueTags.filter((held) => entry.requiredTags.every((tag) => held.has(tag)))
        .length,
    ...(request.random !== undefined ? { random: request.random } : {}),
  });

  if (selection === null) return null;

  // Logged before it is returned: the cooldown that stops a manager seeing the
  // same line twice only works if every showing is recorded (`05 §4.2`).
  await db.insert(contentUsageLog).values({
    entryId: selection.entry.id,
    userId: request.userId,
    surface: GREETING_SURFACE,
    usedAt: at,
  });

  const expression = selection.entry.expression ?? 'neutral';

  return {
    entryKey: selection.entry.key,
    text: selection.text,
    expression,
    tonySlug: tonySlugFor(expression),
  };
}
