import { and, eq, gte } from 'drizzle-orm';

import { now } from '@/lib/clock';
import { easternDayKey, easternDaysBetween } from '@/lib/parlor/season';
import { type Database } from '@/lib/db';
import { contentEntries, contentUsageLog } from '@/lib/db/schema';
import { seededDraw } from '@/lib/content/draw';
import { renderTemplate, selectContent, type SelectableEntry } from '@/lib/content/select';
import { type Expression } from '@/lib/content/parse';
import { margin as writeMargin, points as writePoints, type FactPacket } from '@/lib/slice/packet';
import { validateProse } from '@/lib/slice/validate';

/**
 * Tony mentioning a result, at the counter.
 *
 * **Commissioner instruction, 2026-07-31:** *"Allow Tony to use verified Stats
 * facts for occasional contextual dialogue."* The word doing the work is
 * **verified**, and this file is what makes it mean something.
 *
 * ## Four rules, and each is enforced rather than intended
 *
 * 1. **Only finalized facts.** The input is a `FactPacket`, which refuses an open
 *    season outright (`not-final`) and has already applied the publication
 *    boundary. There is no path from an unfinalized week to this surface.
 * 2. **No calculation here.** Every number is read off a published fact and
 *    written with the packet's **own** formatters. Not a rounding, not a
 *    subtraction, not a comparison. The one thing this file decides is *which of
 *    three conditions holds*, and it decides that by reading the story kind the
 *    fact layer already chose.
 * 3. **Nothing may change.** The rendered sentence goes through **the Slice's
 *    validator** against the same packet — a name, a score, a margin or a tier
 *    that is not in the packet's allowed sets is refused, and Tony says nothing
 *    about football. Sharing the validator is the point: a second one would
 *    drift, and it would drift on the quieter surface.
 * 4. **Never during a moment.** A manager standing in front of an unopened box is
 *    in the middle of something. The aside is skipped whenever a moment tag is
 *    held (`lib/parlor/moment.ts`), so it can never collide with the welcome box,
 *    the waiting box, or a reveal.
 *
 * ## Once a day, not once a render
 *
 * The first version drew a fresh line every time the room was rendered, and the
 * visual harness caught it as a **React hydration error** on a page that had
 * nothing to do with the counter: signing in redirects through the parlor, the
 * server rendered one line, something rendered again, and the two disagreed.
 *
 * That is the same failure the greeting solved with a per-day cache
 * (`lib/content/greeting.ts`), and it is a product requirement rather than a
 * rendering detail — *"stable dialogue during a page lifecycle"*. Tony does not
 * start a new sentence every time you look up.
 *
 * So: the first visit of the day draws and logs; every visit after it is handed
 * back the same line, and **nothing is written**. Unlike the greeting there is no
 * staleness re-check, because an aside's premise is a finalized week — it cannot
 * stop being true between two page loads the way *"there is a box on the
 * counter"* can.
 *
 * ## Occasional means occasional
 *
 * A long cooldown, and only one aside exists per fact — so a manager hears about
 * a given game once and then not again for a fortnight. The greeting is the
 * default and this is the exception; a counter that opened with league trivia
 * every day would have stopped being *"one verified thing about you"*, which is
 * `17 §3`'s acceptance criterion and worth more than this feature.
 *
 * ## Retired managers
 *
 * They cannot reach this surface at all: the packet filtered them before a story
 * was even derived, and the validator refuses an unknown name on top of that.
 * Tony's rare retired-manager cameos are **fictional flavour with no statistics
 * in them** and live in `content/counter-greetings.md`. That separation is why
 * both can exist.
 */

export const ASIDE_SURFACE = 'parlor_stats_aside';

/**
 * Days before the same manager may hear the same aside again.
 *
 * Two weeks, against the greeting's three days. The greeting has to fill every
 * day; this one has to stay a surprise, and a line about a single game heard
 * twice in a week reads as a loop rather than as a memory.
 */
export const ASIDE_COOLDOWN_DAYS = 14;

/** How far back usage is loaded. Anything older cannot affect a cooldown. */
const USAGE_LOOKBACK_DAYS = 60;

export const ASIDE_TAGS = {
  blowout: 'stats_blowout',
  closeGame: 'stats_close_game',
  champion: 'stats_champion',
} as const;

export interface StatsAside {
  readonly entryKey: string;
  readonly text: string;
  readonly expression: Expression;
}

/**
 * A published fact, in exactly the form a template may substitute.
 *
 * Deliberately a plain record of **strings**. A template cannot reach past it
 * into a fact object and read a field nobody vetted, and a renderer cannot do
 * arithmetic on a string it was handed.
 */
export interface AsideFact {
  readonly tag: string;
  readonly variables: Readonly<Record<string, string | null>>;
  /**
   * Exactly what a line about this fact may say, as data.
   *
   * The same pattern `StoryCandidate` uses and for the same reason: the checker
   * must not derive its own allowed values or it is marking its own homework
   * (`MANDATE §10`). These are the fact's *own* substituted values, so the
   * question the validator answers is the useful one — **did the template
   * introduce a name or a number the fact did not supply?**
   *
   * A champion aside needs this to exist at all: the champion is not a
   * participant in the week the packet describes, so validating it against the
   * week's allowed sets would refuse a perfectly true sentence.
   */
  readonly allowedNumbers: readonly string[];
  readonly allowedNames: readonly string[];
}

export interface AsideRequest {
  readonly userId: string;
  /** The packet the aside is about, and the packet it is validated against. */
  readonly packet: FactPacket;
  /** Moment tags held right now. Any of them and there is no aside. */
  readonly momentTags: ReadonlySet<string>;
  /** The most recent finalized season's champion, where there is one. */
  readonly champion: { readonly displayName: string; readonly season: number } | null;
  readonly random?: () => number;
}

/**
 * Turn a published packet into the one fact an aside may talk about.
 *
 * Reads the **lead story's kind** — the fact layer's own decision about what
 * mattered — and never re-decides it. A packet with no lead is a quiet week and
 * produces no aside, which is the same restraint the newspaper shows.
 */
export function asideFactFrom(request: AsideRequest): AsideFact | null {
  const { packet } = request;

  if (packet.refusal !== null || !packet.finalized) return null;

  const lead = packet.lead;
  if (lead !== null) {
    const { detail } = lead;

    if (
      detail.kind === 'blowout' ||
      detail.kind === 'record-margin' ||
      detail.kind === 'nail-biter'
    ) {
      const variables = {
        winner: detail.winner,
        loser: detail.loser,
        margin: writeMargin(detail.margin),
        points: writePoints(detail.winnerPoints),
      };
      return {
        tag: detail.kind === 'nail-biter' ? ASIDE_TAGS.closeGame : ASIDE_TAGS.blowout,
        variables,
        allowedNumbers: [variables.margin, variables.points],
        allowedNames: [detail.winner, detail.loser],
      };
    }
  }

  /*
   * The champion is the fallback, not a competitor.
   *
   * A banner is always true and never news, so it may only speak when the week
   * itself had nothing loud in it. Reversing that order would have Tony
   * mentioning last year every time a real result was available.
   */
  if (request.champion !== null) {
    return {
      tag: ASIDE_TAGS.champion,
      variables: {
        champion: request.champion.displayName,
        season: String(request.champion.season),
      },
      allowedNumbers: [String(request.champion.season)],
      allowedNames: [request.champion.displayName],
    };
  }

  return null;
}

/**
 * The packet a line about this fact is checked against.
 *
 * The week's packet with its allowed sets narrowed to the fact's own values.
 * Narrowed rather than replaced, so everything else the validator needs — the
 * banned-term scan, the quotation rule, the shape it expects — is the same object
 * the newspaper is checked with.
 */
function allowedFor(fact: AsideFact, packet: FactPacket): FactPacket {
  return {
    ...packet,
    allowedNumbers: [...fact.allowedNumbers].sort(),
    allowedNames: [...fact.allowedNames].sort(),
  };
}

interface AsideEntry extends SelectableEntry {
  readonly expression: Expression | null;
}

/** The aside this manager was last shown today, if there was one. */
function shownToday(
  candidates: readonly AsideEntry[],
  usage: readonly { entryId: string; usedAt: Date }[],
  at: Date,
): AsideEntry | null {
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
 * Choose, check and log one aside — or nothing, which is the usual answer.
 *
 * Null on every one of: a moment in play · a packet that refuses · a quiet week
 * with no champion on file · no line off cooldown · a rendered line the validator
 * will not pass. None of those is an error and none of them is softened.
 */
export async function statsAsideFor(
  db: Database,
  request: AsideRequest,
): Promise<StatsAside | null> {
  if (request.momentTags.size > 0) return null;

  const fact = asideFactFrom(request);
  if (fact === null) return null;

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
        eq(contentEntries.surface, ASIDE_SURFACE),
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
        eq(contentUsageLog.surface, ASIDE_SURFACE),
        gte(
          contentUsageLog.usedAt,
          new Date(at.getTime() - USAGE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
        ),
      ),
    );

  /*
   * Said something already today? Say the same thing, and write nothing.
   *
   * Counted on the same Eastern calendar the rest of the parlor counts on. A line
   * that no longer renders falls through to a fresh draw rather than showing a
   * half-substituted sentence.
   */
  const today = shownToday(candidates, usage, at);
  if (today !== null) {
    const repeated = renderTemplate(today.templateText, fact.variables);
    if (
      repeated !== null &&
      validateProse([repeated], allowedFor(fact, request.packet), [today.templateText])
        .publishable
    ) {
      return {
        entryKey: today.key,
        text: repeated,
        expression: today.expression ?? 'neutral',
      };
    }
  }

  const chosen = selectContent<AsideEntry>({
    candidates,
    tags: new Set([fact.tag]),
    variables: fact.variables,
    usage,
    now: at,
    // Every aside is about the league rather than about a person, so there is no
    // audience to narrow. A constant keeps the selector's smallest-audience rule
    // inert here instead of expressing it as a fact about nobody.
    audienceSize: () => 1,
    /*
     * Seeded on the manager and the day, for the reason the greeting is: this
     * runs inside the parlor's render, and a sentence that differs between the
     * server's HTML and the browser's rebuild of it is a hydration mismatch.
     *
     * This surface has already been the visible instance of that once — the
     * aside drew a fresh line on every render and the mismatch surfaced two
     * routes away, on a page with nothing to do with the counter. The day-cache
     * above fixed the repetition; the seed fixes the disagreement.
     */
    random: request.random ?? seededDraw(request.userId, ASIDE_SURFACE, easternDayKey(at)),
  });

  if (chosen === null) return null;

  const text = renderTemplate(chosen.entry.templateText, fact.variables);
  if (text === null) return null;

  /*
   * The gate the whole file exists for.
   *
   * Checked *after* rendering, against the packet, by the newspaper's validator.
   * A line whose numbers survived substitution but whose prose invented one —
   * or that names somebody the packet never allowed — is refused here, and
   * nothing is logged, so the manager simply gets their ordinary greeting.
   */
  if (
    !validateProse([text], allowedFor(fact, request.packet), [chosen.entry.templateText])
      .publishable
  ) {
    return null;
  }

  await db.insert(contentUsageLog).values({
    entryId: chosen.entry.id,
    userId: request.userId,
    surface: ASIDE_SURFACE,
    usedAt: at,
  });

  return {
    entryKey: chosen.entry.key,
    text,
    expression: chosen.entry.expression ?? 'neutral',
  };
}
