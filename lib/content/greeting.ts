import { and, eq, gte } from 'drizzle-orm';

import { now } from '@/lib/clock';
import { rollBelow } from '@/lib/counter/rng';
import { type Database } from '@/lib/db';
import { contentEntries, contentUsageLog } from '@/lib/db/schema';
import { easternDayKey, easternDaysBetween } from '@/lib/parlor/season';

import { seededDraw } from './draw';
import { renderTemplate, selectContent, type SelectableEntry } from './select';
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
 * ## Once a day, not once a page load
 *
 * The parlor is the home screen, so a manager opens it many times a day. If
 * every open drew and logged a fresh line, a manager with four eligible lines
 * would be out of things to hear by lunchtime and Tony would fall silent on his
 * own front counter — which is the acceptance criterion in `17 §3` failing.
 *
 * So a greeting is per **day**, counted on the same Eastern calendar the rest
 * of the parlor counts on: the first visit of the day draws and logs, and every
 * visit after it is handed back the same line. That is also just true to the
 * fiction. Tony greets you when you walk in. He does not start again every time
 * you look up.
 *
 * ## Running dry
 *
 * "No content" is a valid outcome everywhere in the engine (`16 §10`), and it
 * stays one here for the case that matters: a line whose facts cannot be
 * rendered is never shown. But a manager with two distinguishing lines and a
 * three-day cooldown would otherwise get silence on the third day, and silence
 * on the first screen reads as breakage rather than as restraint. So if every
 * true line is merely *recently seen*, the cooldown is relaxed and the draw is
 * repeated. A true line heard on Tuesday beats no line on Friday.
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

  const variables = {
    name: request.displayName,
    days: request.daysUntilKickoff === null ? null : String(request.daysUntilKickoff),
  };

  /*
   * Already greeted today? Say the same thing again, and log nothing.
   *
   * **Unless it has stopped being true.** Two ways that can happen, and the
   * second one only started existing when moment tags did:
   *
   *   - the line no longer *renders* — a variable has emptied, a fact has gone
   *     stale. Caught by `renderTemplate` returning null.
   *   - the line is no longer *eligible* — the manager no longer holds a tag it
   *     requires. A standing tag like `champion_2025` does not change during a
   *     day, so this never mattered. A **moment** tag changes the instant they
   *     tap something (`lib/parlor/moment.ts`).
   *
   * The second was a real defect, found by walking the loop rather than by any
   * test: Tony greeted a new manager with *"New season, new box. Tony does not
   * charge for the first one"*, they opened the box, came back to the room, and
   * he said it again — about a box that no longer existed. The day-cache was
   * repeating a sentence whose whole premise had been consumed thirty seconds
   * earlier, which is the same class of failure as *"last year"* that this file
   * already refuses elsewhere: a still-grammatical line that has quietly started
   * lying.
   *
   * So the repeat is re-checked against the tags held **now**. Falling through
   * draws a fresh line, which is the correct behaviour — the moment is over and
   * the standing lines take back over.
   */
  const today = alreadyShownToday(candidates, usage, at);
  if (today !== null && stillTrue(today, request.tags)) {
    const text = renderTemplate(today.templateText, variables);
    if (text !== null) return asGreeting(today, text);
  }

  /*
   * Seeded on the manager and the day, not on `Math.random`.
   *
   * The day-cache above already means "one line per manager per day" once a
   * showing has been written down. This makes it true *before* the write, which
   * is what a render needs: the same request rendered twice — the server's HTML
   * and whatever the browser builds from it — has to produce the same sentence,
   * or React reports a hydration mismatch on the first screen of the product.
   *
   * The second pass below shares the seed deliberately. It is the same draw with
   * the history discarded, not a second attempt at a different answer.
   */
  const random = request.random ?? seededDraw(request.userId, GREETING_SURFACE, easternDayKey(at));

  const draw = (records: readonly { entryId: string; usedAt: Date }[]) =>
    selectContent<GreetingEntry>({
      candidates,
      tags: request.tags,
      variables,
      usage: records,
      now: at,
      audienceSize: (entry) =>
        request.leagueTags.filter((held) => entry.requiredTags.every((tag) => held.has(tag)))
          .length,
      random,
    });

  // Second pass with no history: the only thing an empty first pass can mean is
  // that every true line is on cooldown, because the untagged lines are true of
  // everyone (`content/counter-greetings.md`).
  const selection = draw(usage) ?? draw([]);

  if (selection === null) return null;

  // Logged before it is returned: the cooldown that stops a manager seeing the
  // same line twice only works if every showing is recorded (`05 §4.2`).
  await db.insert(contentUsageLog).values({
    entryId: selection.entry.id,
    userId: request.userId,
    surface: GREETING_SURFACE,
    usedAt: at,
  });

  return asGreeting(selection.entry, selection.text);
}

/**
 * Whether a line the manager was already given is still one they could be given.
 *
 * The same two conditions `selectContent` applies, and only those two — this is
 * deliberately not the whole pipeline. Cooldowns and season caps are about *not
 * repeating*, and repeating is exactly what the caller is trying to do.
 */
function stillTrue(entry: GreetingEntry, tags: ReadonlySet<string>): boolean {
  return (
    entry.requiredTags.every((tag) => tags.has(tag)) &&
    !entry.excludedTags.some((tag) => tags.has(tag))
  );
}

function asGreeting(entry: GreetingEntry, text: string): Greeting {
  const expression = entry.expression ?? 'neutral';

  return {
    entryKey: entry.key,
    text,
    expression,
    tonySlug: tonySlugFor(expression),
  };
}

/**
 * The line this manager was already given today, if there was one.
 *
 * "Today" is the Eastern calendar day, the same one `daysUntilKickoff` counts
 * on — so the greeting turns over at midnight in Michigan rather than at
 * whatever hour the server happens to think it is.
 */
function alreadyShownToday(
  candidates: readonly GreetingEntry[],
  usage: readonly { entryId: string; usedAt: Date }[],
  at: Date,
): GreetingEntry | null {
  let latest: { entryId: string; usedAt: Date } | null = null;

  for (const use of usage) {
    if (easternDaysBetween(use.usedAt, at) !== 0) continue;
    if (latest === null || use.usedAt > latest.usedAt) latest = use;
  }

  if (latest === null) return null;

  const entryId = latest.entryId;
  return candidates.find((entry) => entry.id === entryId) ?? null;
}

/**
 * Another true thing, on demand.
 *
 * Tapping Tony is a **Toy** interaction: he answers, and answering must not
 * spend the day's greeting. So this runs the same eligibility pipeline over the
 * same verified tags with **no usage history and no logging** — every line that
 * is true of this manager is eligible, and nothing about the draw is recorded.
 *
 * The result is a line that is as true as the greeting and has no bearing on
 * it. Returns null when the manager has no eligible line at all, which the
 * parlor renders as Tony simply not having anything to add.
 */
export async function anotherLineFor(
  db: Database,
  request: GreetingRequest,
): Promise<string | null> {
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

  const selection = selectContent<GreetingEntry>({
    candidates,
    tags: request.tags,
    variables: {
      name: request.displayName,
      days: request.daysUntilKickoff === null ? null : String(request.daysUntilKickoff),
    },
    // No history, and nothing written back. This draw is not the day's line.
    usage: [],
    now: now(),
    audienceSize: (entry) =>
      request.leagueTags.filter((held) => entry.requiredTags.every((tag) => held.has(tag))).length,
    /*
     * The one content draw that must **not** be seeded on the day.
     *
     * Poking Tony is a request for something else, so two pokes a minute apart
     * have to differ — a per-day seed would make him repeat himself forever.
     * This is also the one draw that is safe to vary: it runs in a server action
     * the manager triggered, never in the render of a page, so there is no
     * server HTML for it to disagree with.
     *
     * `rollBelow` rather than `Math.random` because it is the project's one
     * injected source of randomness, which keeps this replayable and keeps the
     * rule "randomness only via `lib/counter/rng.ts`" true of the whole codebase.
     */
    random: request.random ?? (() => rollBelow(1_000_000) / 1_000_000),
  });

  return selection?.text ?? null;
}
