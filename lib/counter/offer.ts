import { and, eq, gte } from 'drizzle-orm';

import { now } from '@/lib/clock';
import { seededDraw } from '@/lib/content/draw';
import { selectContent, type SelectableEntry } from '@/lib/content/select';
import { type Database } from '@/lib/db';
import { contentEntries, contentUsageLog } from '@/lib/db/schema';
import { easternDayKey } from '@/lib/parlor/season';

import { economyFor, openSeason, wallet } from './tokens';

/**
 * Tony offering another box, at the moment the last one is still on the plate.
 *
 * ## Why this is a content surface and not a price label
 *
 * The reveal plate used to end with `ANOTHER — 50`: a price beside a link, which
 * is what a shop looks like. The commissioner's ruling of 2026-07-30 is explicit
 * about the feeling that is wanted instead — *"the experience should feel like
 * Tony is handing something across the counter, not like the application
 * generated inventory"* — so the offer is a **sentence spoken by a person**, and
 * the price is inside it.
 *
 * That is not decoration. It changes what the moment is: a manager who has just
 * opened a box is being talked to by the man who gave it to them, rather than
 * being shown a second SKU.
 *
 * ## Eligibility is server state, top to bottom
 *
 * *"Selection must be based on authoritative server state. Do not infer purchase
 * eligibility only from a displayed client balance."* Every condition below is a
 * read from the database on the request that opens the box:
 *
 *   1. a season is **open** — `apply_token_delta` refuses a finalized season, so
 *      an offer against a closed one is an offer that cannot be taken
 *   2. the manager holds a **seat** in it — no seat, no tab
 *   3. an **economy config** is stored — the price is a stored, versioned value
 *   4. their **balance covers it**
 *
 * Any of those false and this returns null. The plate then says nothing at all
 * about another box — no greyed-out price, no "not enough tokens", no smaller
 * version of the offer. The ruling names each of those three separately: do not
 * advertise an unavailable purchase, do not shame the manager, do not display a
 * disabled sales pitch.
 *
 * ## Chosen once, on the server, and it stays chosen
 *
 * The line is picked here and travels back inside the reveal payload, so it is
 * fixed for the lifetime of that reveal. React can remount the plate as often as
 * it likes and Tony will not change his mind mid-sentence — which is the
 * repetition rule from the same ruling, satisfied by *where* the draw happens
 * rather than by a memo in the component.
 */

export const BOX_OFFER_SURFACE = 'counter_box_offer';

/**
 * Days before the same manager hears the same offer again.
 *
 * One, not three. An offer is only ever spoken at the end of a reveal, so a
 * manager who opens four boxes in an evening should hear four different
 * sentences — a three-day cooldown would exhaust the generic bucket by the
 * second one. And unlike the greeting there is no untagged floor to fall to:
 * every line here requires `can_afford_another`, because an offer that does not
 * assume they can afford it is not an offer.
 *
 * Running dry is handled the way `greetingFor` handles it — the draw is repeated
 * with the history discarded — so the offer is never lost merely because Tony
 * has said everything recently.
 */
export const BOX_OFFER_COOLDOWN_DAYS = 1;

/** How far back usage is loaded. Anything older cannot affect a cooldown. */
const USAGE_LOOKBACK_DAYS = 14;

/** Every line requires it: there is no offer to make without it. */
export const CAN_AFFORD_ANOTHER = 'can_afford_another';
/** The collectible just revealed is the first they have ever owned. */
export const FIRST_PULL = 'first_pull';
/** They now hold every item in the catalog. Another box is a spare, and Tony says so. */
export const SHELF_COMPLETE = 'shelf_complete';

export const OFFER_TAGS: readonly string[] = [CAN_AFFORD_ANOTHER, FIRST_PULL, SHELF_COMPLETE];

export interface BoxOffer {
  /** The stored price, so the plate and the sentence cannot disagree. */
  readonly price: number;
  /** What Tony says. Already rendered — the client substitutes nothing. */
  readonly line: string;
  /** Which entry it was, for the usage log and for tests. */
  readonly entryKey: string;
}

export interface OfferRequest {
  readonly userId: string;
  /** Distinct items held **after** this pull. */
  readonly distinct: number;
  /** The catalog's size. */
  readonly total: number;
  readonly random?: () => number;
}

export async function offerAnotherBox(
  db: Database,
  request: OfferRequest,
): Promise<BoxOffer | null> {
  const season = await openSeason(db);
  if (season === null) return null;

  const held = await wallet(db, { userId: request.userId, seasonId: season.id });
  if (held === null) return null;

  let price: number;
  try {
    const { values } = await economyFor(db, season.id);
    price = values.standardBoxPriceTokens;
  } catch {
    // No stored economy is a seeding failure, not something to tell a manager
    // about mid-reveal. The plate simply makes no offer.
    return null;
  }

  if (held.balance < price) return null;

  const tags = new Set<string>([CAN_AFFORD_ANOTHER]);
  if (request.distinct === 1) tags.add(FIRST_PULL);
  if (request.distinct >= request.total) tags.add(SHELF_COMPLETE);

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
    })
    .from(contentEntries)
    .where(
      and(
        eq(contentEntries.surface, BOX_OFFER_SURFACE),
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
        eq(contentUsageLog.surface, BOX_OFFER_SURFACE),
        gte(
          contentUsageLog.usedAt,
          new Date(at.getTime() - USAGE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
        ),
      ),
    );

  const variables = { price: String(price) };

  /*
   * Seeded, like every other content surface, rather than `Math.random`.
   *
   * The offer is chosen on the server and travels back inside the reveal
   * payload, so it was never the hydration hazard the greeting was. It is
   * seeded anyway: one unrecorded source of randomness in the codebase is a
   * place for the next one to hide, and the shelf count is in the seed so two
   * different pulls on the same evening are two different draws.
   *
   * Variety across a run of boxes comes from the one-day cooldown, which is
   * what `BOX_OFFER_COOLDOWN_DAYS` is for, and is unaffected by this.
   */
  const random =
    request.random ??
    seededDraw(request.userId, BOX_OFFER_SURFACE, easternDayKey(at), String(request.distinct));

  const draw = (records: readonly { entryId: string; usedAt: Date }[]) =>
    selectContent<SelectableEntry>({
      candidates,
      tags,
      variables,
      usage: records,
      now: at,
      /*
       * No `audienceSize` here, deliberately.
       *
       * On the greeting surface the audience is "how many managers in the league
       * this line is true of" — the thing that makes Tony's line pointed rather
       * than generic. There is no such population at a reveal: the only person in
       * this moment is the one who just opened the box.
       *
       * So the selector falls back to its own default, which ranks by **number of
       * required tags**, and that is exactly right here: `can_afford_another +
       * first_pull` (two conditions) beats the bare offer, so somebody's very
       * first pull is answered with "first one was free" rather than with the
       * line everybody gets.
       */
      random,
    });

  // Second pass with no history. Every line requires `can_afford_another`, so an
  // empty first pass can only mean Tony has said all of them recently — and a
  // repeated sentence beats a silently withdrawn offer.
  const selection = draw(usage) ?? draw([]);
  if (selection === null) return null;

  await db.insert(contentUsageLog).values({
    entryId: selection.entry.id,
    userId: request.userId,
    surface: BOX_OFFER_SURFACE,
    usedAt: at,
  });

  return { price, line: selection.text, entryKey: selection.entry.key };
}
