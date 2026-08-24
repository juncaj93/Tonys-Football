import { and, eq, gte } from 'drizzle-orm';

import { now } from '@/lib/clock';
import { rollBelow } from '@/lib/counter/rng';
import { type Database } from '@/lib/db';
import { contentEntries, contentUsageLog } from '@/lib/db/schema';
import { type AsideFact } from '@/lib/parlor/aside';
import { type FactPacket } from '@/lib/slice/packet';
import { validateProse } from '@/lib/slice/validate';

import { selectContent, type SelectableEntry } from './select';
import { type Expression } from './parse';

/** What Tony says after a manager explicitly comes back to talk. */
export const TONY_CONVERSATION_SURFACE = 'parlor_tony_conversation';

/** A line stays out of rotation for a month whenever the deck has alternatives. */
export const TONY_CONVERSATION_COOLDOWN_DAYS = 30;

const USAGE_LOOKBACK_DAYS = 90;
const RECENT_NO_REPEAT = 8;

interface ConversationEntry extends SelectableEntry {
  readonly expression: Expression | null;
}

export interface TonyConversationRequest {
  readonly userId: string;
  readonly displayName: string;
  readonly tags: ReadonlySet<string>;
  readonly leagueTags: readonly ReadonlySet<string>[];
  readonly daysUntilKickoff: number | null;
  /** A published Sleeper-derived fact, or null when there is no safe fact to cite. */
  readonly fact: AsideFact | null;
  /** The packet that fact came from. Never used when `fact` is null. */
  readonly packet: FactPacket;
  readonly random?: () => number;
}

export interface TonyConversation {
  readonly entryKey: string;
  readonly text: string;
  readonly expression: Expression;
}

/**
 * A conversation deck, not a second greeting.
 *
 * A tap is a deliberate request for another sentence. We append every answer
 * to the content usage log, keep the most recent eight out absolutely, and
 * apply a 30-day cooldown while the deck has unused candidates. When a very
 * small personalized bucket runs dry, the cooldown relaxes *without* allowing
 * one of those eight immediate repeats. Tony can circle back weeks later; he
 * never becomes a button that emits the same three lines.
 */
export async function conversationFor(
  db: Database,
  request: TonyConversationRequest,
): Promise<TonyConversation | null> {
  const at = now();
  const contextTags = timeAndCalendarTags(at, request.daysUntilKickoff);
  if (request.fact !== null) contextTags.add(request.fact.tag);

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
        eq(contentEntries.surface, TONY_CONVERSATION_SURFACE),
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
        eq(contentUsageLog.surface, TONY_CONVERSATION_SURFACE),
        gte(
          contentUsageLog.usedAt,
          new Date(at.getTime() - USAGE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
        ),
      ),
    );

  const variables = {
    name: request.displayName,
    days: request.daysUntilKickoff === null ? null : String(request.daysUntilKickoff),
    winner: request.fact?.variables['winner'] ?? null,
    loser: request.fact?.variables['loser'] ?? null,
    margin: request.fact?.variables['margin'] ?? null,
    points: request.fact?.variables['points'] ?? null,
    champion: request.fact?.variables['champion'] ?? null,
    season: request.fact?.variables['season'] ?? null,
  };

  const recentIds = new Set(
    [...usage]
      .sort((left, right) => right.usedAt.getTime() - left.usedAt.getTime())
      .slice(0, RECENT_NO_REPEAT)
      .map((use) => use.entryId),
  );
  const nonRepeating = candidates.filter((entry) => !recentIds.has(entry.id));
  const held = new Set([...request.tags, ...contextTags]);
  const audienceTags = request.leagueTags.map(
    (tags) => new Set<string>([...tags, ...contextTags]),
  );
  const random = request.random ?? (() => rollBelow(1_000_000) / 1_000_000);

  const pick = (
    deck: readonly ConversationEntry[],
    history: readonly { entryId: string; usedAt: Date }[],
  ) =>
    selectContent<ConversationEntry>({
      candidates: deck,
      tags: held,
      variables,
      usage: history,
      now: at,
      audienceSize: (entry) =>
        audienceTags.filter((tags) => entry.requiredTags.every((tag) => tags.has(tag))).length,
      random,
    });

  // Prefer a genuinely fresh line. Only relax a cooldown after exhausting it.
  const selected = pick(nonRepeating, usage) ?? pick(nonRepeating, []) ?? pick(candidates, []);
  if (selected === null) return null;

  /*
   * The only dynamic football lines use a fact packet's own allowed values.
   * This is the same verifier that protects the Tuesday Slice: a line cannot
   * smuggle an unverified name, score, or margin into the parlor.
   */
  if (request.fact !== null && selected.entry.requiredTags.includes(request.fact.tag)) {
    const checked = validateProse(
      [selected.text],
      {
        ...request.packet,
        allowedNumbers: request.fact.allowedNumbers,
        allowedNames: request.fact.allowedNames,
      },
      [selected.entry.templateText],
    );
    if (!checked.publishable) return null;
  }

  await db.insert(contentUsageLog).values({
    entryId: selected.entry.id,
    userId: request.userId,
    surface: TONY_CONVERSATION_SURFACE,
    usedAt: at,
  });

  return {
    entryKey: selected.entry.key,
    text: selected.text,
    expression: selected.entry.expression ?? 'neutral',
  };
}

/** Context tags that are true for everyone in the parlor at this instant. */
export function timeAndCalendarTags(at: Date, daysUntilKickoff: number | null): Set<string> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  const hour = Number(read('hour'));
  const weekday = read('weekday').toLowerCase();
  const tags = new Set<string>();

  if (hour >= 5 && hour < 12) tags.add('time_morning');
  else if (hour >= 12 && hour < 17) tags.add('time_afternoon');
  else if (hour >= 17 && hour < 22) tags.add('time_evening');
  else tags.add('time_late');

  if (weekday === 'thursday') tags.add('nfl_thursday');
  if (weekday === 'sunday') tags.add('nfl_sunday');
  if (weekday === 'monday') tags.add('nfl_monday');
  if (weekday === 'tuesday') tags.add('nfl_tuesday');

  // The server action already read the authoritative season clock once. Using
  // that value here keeps one conversation coherent if midnight passes during
  // its database reads, and makes this pure helper straightforward to test.
  const phase =
    daysUntilKickoff === null ? 'in_season' : daysUntilKickoff > 7 ? 'offseason' : 'kickoff_week';
  tags.add(`season_${phase}`);
  if (daysUntilKickoff !== null && daysUntilKickoff <= 7) tags.add('kickoff_close');

  return tags;
}
