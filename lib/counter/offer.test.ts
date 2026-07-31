import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { clearClock, now, setFixedClock } from '@/lib/clock';
import { readBoxOffers, seedBoxOffers } from '@/lib/content/seed';
import { closePool, getDb } from '@/lib/db';
import { contentUsageLog, seasonMemberships, seasons, users } from '@/lib/db/schema';
import { resetDatabase } from '@/lib/db/test-helpers';
import { applyTokenDelta, ensureEconomyConfig, PROVISIONAL_ECONOMY } from '@/lib/counter/tokens';

import {
  BOX_OFFER_SURFACE,
  CAN_AFFORD_ANOTHER,
  FIRST_PULL,
  OFFER_TAGS,
  SHELF_COMPLETE,
  offerAnotherBox,
} from './offer';
import { CATALOG_SIZE } from './catalog';

/**
 * Tony offering another box.
 *
 * The commissioner's ruling puts two things beyond negotiation, and both are
 * tested by *driving real state* rather than by reading the source:
 *
 *   1. **Eligibility is authoritative server state.** So every "no offer" case
 *      below is reached by making the database say no — a closed season, a
 *      manager with no seat, a tab that is one token short — never by passing a
 *      flag.
 *   2. **Do not advertise an unavailable purchase.** The absence of an offer is
 *      the assertion. There is no "disabled" shape to check for, because there
 *      must not be one.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

const PRICE = PROVISIONAL_ECONOMY.standardBoxPriceTokens;

afterAll(async () => {
  if (hasDatabase) await closePool();
});

describe.skipIf(!hasDatabase)('what Tony offers, and when he says nothing', () => {
  beforeEach(async () => {
    await resetDatabase(db!);
    await seedBoxOffers(db!, readBoxOffers());
    setFixedClock('2026-07-30T12:00:00Z');
  });

  afterAll(() => {
    clearClock();
  });

  /** A seated manager with `balance` tokens on the tab. */
  async function seated(balance: number, options: { finalized?: boolean } = {}) {
    const [season] = await db!.insert(seasons).values({ year: 2026 }).returning();
    await ensureEconomyConfig(db!, season!.id);

    const [row] = await db!.insert(users).values({ displayName: 'Nick' }).returning();
    await db!
      .insert(seasonMemberships)
      .values({ seasonId: season!.id, userId: row!.id, rosterId: 1 });

    if (balance > 0) {
      await applyTokenDelta(db!, {
        userId: row!.id,
        seasonId: season!.id,
        amount: balance,
        reason: 'SEASON_START',
        description: 'Opening the tab.',
        idempotencyKey: `test:open:${row!.id}`,
      });
    }

    if (options.finalized === true) {
      await db!.update(seasons).set({ finalizedAt: now() }).where(eq(seasons.id, season!.id));
    }

    return { user: row!, seasonId: season!.id };
  }

  it('offers another box, in a sentence, to somebody who can afford one', async () => {
    const { user } = await seated(PRICE);

    const offer = await offerAnotherBox(db!, { userId: user.id, distinct: 7, total: CATALOG_SIZE });

    expect(offer).not.toBeNull();
    expect(offer?.price).toBe(PRICE);
    // The price is *spoken*, not printed beside a button — the whole point of
    // routing this through the content engine.
    expect(offer?.line).toContain(String(PRICE));
    expect(offer?.line.length).toBeGreaterThan(10);
  });

  it('says nothing at all when the tab is one token short', async () => {
    const { user } = await seated(PRICE - 1);

    // Not a smaller offer, not a greyed-out one, not "you need 1 more token".
    // Nothing.
    expect(
      await offerAnotherBox(db!, { userId: user.id, distinct: 7, total: CATALOG_SIZE }),
    ).toBeNull();
  });

  it('says nothing to somebody with no seat this season', async () => {
    const [season] = await db!.insert(seasons).values({ year: 2026 }).returning();
    await ensureEconomyConfig(db!, season!.id);
    const [row] = await db!.insert(users).values({ displayName: 'Armen' }).returning();

    expect(
      await offerAnotherBox(db!, { userId: row!.id, distinct: 7, total: CATALOG_SIZE }),
    ).toBeNull();
  });

  it('says nothing when there is no open season to buy in', async () => {
    const { user } = await seated(PRICE * 4, { finalized: true });

    // `apply_token_delta` refuses a finalized season outright, so an offer here
    // would be one the manager could not take.
    expect(
      await offerAnotherBox(db!, { userId: user.id, distinct: 7, total: CATALOG_SIZE }),
    ).toBeNull();
  });

  it('says nothing when no economy has been seeded', async () => {
    const [season] = await db!.insert(seasons).values({ year: 2026 }).returning();
    const [row] = await db!.insert(users).values({ displayName: 'Nick' }).returning();
    await db!
      .insert(seasonMemberships)
      .values({ seasonId: season!.id, userId: row!.id, rosterId: 1, tokenBalance: 0 });

    // A missing economy config is a seeding failure. It must not surface as an
    // error in the middle of somebody's reveal.
    expect(
      await offerAnotherBox(db!, { userId: row!.id, distinct: 7, total: CATALOG_SIZE }),
    ).toBeNull();
  });

  it('tells the first-ever pull that the first one was free', async () => {
    const { user } = await seated(PRICE);

    const offer = await offerAnotherBox(db!, { userId: user.id, distinct: 1, total: CATALOG_SIZE });

    // Two conditions beat one, so the first-pull pair wins the draw outright.
    expect(['O1', 'O2']).toContain(offer?.entryKey);
  });

  it('acknowledges a complete shelf rather than selling into it', async () => {
    const { user } = await seated(PRICE);

    const offer = await offerAnotherBox(db!, {
      userId: user.id,
      distinct: CATALOG_SIZE,
      total: CATALOG_SIZE,
    });

    expect(offer?.entryKey).toBe('O7');
  });

  it('does not repeat itself while it has anything else to say', async () => {
    const { user } = await seated(PRICE * 10);

    const first = await offerAnotherBox(db!, {
      userId: user.id,
      distinct: 7,
      total: CATALOG_SIZE,
    });
    const second = await offerAnotherBox(db!, {
      userId: user.id,
      distinct: 7,
      total: CATALOG_SIZE,
    });

    expect(first?.entryKey).not.toBe(second?.entryKey);
  });

  it('keeps offering after it has said everything, rather than going quiet', async () => {
    const { user } = await seated(PRICE * 20);

    // Four generic lines, drawn six times. Past the fourth the cooldown has
    // nothing left to give, and a withdrawn *offer* would be a functional
    // regression — the manager could no longer reach the counter from the plate.
    const drawn: (string | undefined)[] = [];
    for (let i = 0; i < 6; i++) {
      const offer = await offerAnotherBox(db!, {
        userId: user.id,
        distinct: 7,
        total: CATALOG_SIZE,
      });
      expect(offer, `draw ${String(i + 1)}`).not.toBeNull();
      drawn.push(offer?.entryKey);
    }

    expect(new Set(drawn.slice(0, 4)).size).toBe(4);
  });

  /**
   * A replay is not a moment, and an offer is one.
   *
   * `openBoxAction` refuses to draw when `reveal.replayed` — the ruling names
   * "duplicate/retried completion" as a state to handle rather than a state to
   * ignore, and the handling is silence. This asserts the *cost* of getting it
   * wrong, which is what makes it worth a test: a draw is logged, so a manager
   * whose tap raced itself would burn variants off their own cooldown for a
   * sentence they were shown twice.
   */
  it('spends a variant every time it speaks, which is why a replay must not', async () => {
    const { user } = await seated(PRICE * 4);

    await offerAnotherBox(db!, { userId: user.id, distinct: 7, total: CATALOG_SIZE });
    await offerAnotherBox(db!, { userId: user.id, distinct: 7, total: CATALOG_SIZE });

    const logged = await db!.select({ id: contentUsageLog.entryId }).from(contentUsageLog);
    expect(logged).toHaveLength(2);
  });

  it('records every line it uses, because the cooldown is only as good as the log', async () => {
    const { user } = await seated(PRICE);
    await offerAnotherBox(db!, { userId: user.id, distinct: 7, total: CATALOG_SIZE });

    const logged = await db!
      .select({ surface: contentUsageLog.surface })
      .from(contentUsageLog);

    expect(logged).toHaveLength(1);
    expect(logged[0]?.surface).toBe(BOX_OFFER_SURFACE);
  });

  it('makes no offer at all when nothing is seeded', async () => {
    await resetDatabase(db!);
    const { user } = await seated(PRICE);

    // "No content" is a valid outcome everywhere in the engine (`16 §10`), and
    // an empty surface must not throw in the middle of a reveal.
    expect(
      await offerAnotherBox(db!, { userId: user.id, distinct: 7, total: CATALOG_SIZE }),
    ).toBeNull();
  });
});

describe('the approved offer lines', () => {
  const offers = readBoxOffers();

  it('never makes an offer that does not assume it can be taken', () => {
    for (const entry of offers) {
      expect(entry.requiredTags, entry.key).toContain(CAN_AFFORD_ANOTHER);
    }
  });

  it('uses only conditions the service actually derives', () => {
    for (const entry of offers) {
      for (const tag of entry.requiredTags) {
        expect(OFFER_TAGS, `${entry.key} requires an underivable tag`).toContain(tag);
      }
    }
  });

  it('always names the price, because it is a variable and not a word', () => {
    for (const entry of offers) {
      // A line without `{price}` renders fine and is silently wrong the day the
      // P3 simulation moves the number.
      expect(entry.templateText, entry.key).toContain('{price}');
    }
  });

  it('has enough variants that the same offer is not made twice in a row', () => {
    const generic = offers.filter((entry) => entry.requiredTags.length === 1);
    expect(generic.length).toBeGreaterThanOrEqual(3);
    expect(offers.filter((entry) => entry.requiredTags.includes(FIRST_PULL)).length)
      .toBeGreaterThanOrEqual(2);
    expect(offers.filter((entry) => entry.requiredTags.includes(SHELF_COMPLETE)).length)
      .toBeGreaterThanOrEqual(1);
  });

  it('says nothing about money, chance, urgency or a guaranteed pull', () => {
    /*
     * The same five prohibitions as the welcome lines, and the same blunt
     * instrument. It cannot judge tone; it can make the vocabulary of a store
     * impossible to add here by accident.
     */
    const banned =
      /\b(buy|purchase|\$|dollar|cash|sale|discount|deal|hurry|now only|limited|expires?|today only|odds|jackpot|guaranteed|lucky dip|gamble|bet)\b/i;

    for (const entry of offers) {
      expect(entry.templateText, entry.key).not.toMatch(banned);
    }
  });

  it('keeps Tony short, because this sits under a collectible on a phone', () => {
    for (const entry of offers) {
      // The plate is 168 of 320 room units — about 190px at 360. Two lines of
      // 15px type is the budget, and no more.
      expect(entry.templateText.length, entry.key).toBeLessThanOrEqual(70);
    }
  });
});
