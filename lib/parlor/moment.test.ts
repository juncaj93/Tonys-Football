import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { clearClock, setFixedClock } from '@/lib/clock';
import { greetingFor } from '@/lib/content/greeting';
import { readCounterGreetings, seedCounterGreetings } from '@/lib/content/seed';
import { closePool, getDb } from '@/lib/db';
import { seasonMemberships, seasons, users } from '@/lib/db/schema';
import { resetDatabase } from '@/lib/db/test-helpers';
import { ensureRewardTable, grantBox, openBox, ownedBox } from '@/lib/counter/boxes';
import { clearRandomSource, setFixedRoll } from '@/lib/counter/rng';

import { BOX_WAITING, FIRST_WELCOME_BOX, MOMENT_TAGS, momentTags } from './moment';

/**
 * The tags that describe **now**, and the lines that depend on them.
 *
 * Commissioner ruling, 2026-07-30: Tony personally hands over the first box, and
 * *"selection must be based on authoritative server state — do not infer purchase
 * eligibility only from a displayed client balance."* So the tests that matter
 * are the ones that drive real state through the real services and then ask what
 * Tony would say.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

/*
 * Where a salvage would be paid, if one happened.
 *
 * `null` in these tests on purpose: none of them fills a whole tier, so no
 * opening below can reach `16 §8`'s conversion — and passing a season that is
 * never used would suggest otherwise. The salvage path has its own tests, which
 * build the collection that makes it reachable.
 */
const seasonId: string | null = null;


afterAll(async () => {
  if (hasDatabase) await closePool();
});

describe.skipIf(!hasDatabase)('what is true right now', () => {
  beforeEach(async () => {
    await resetDatabase(db!);
    await ensureRewardTable(db!);
    setFixedClock('2026-07-30T12:00:00Z');
  });

  async function manager(name = 'Nick') {
    const [season] = await db!.insert(seasons).values({ year: 2026 }).returning();
    const [row] = await db!.insert(users).values({ displayName: name }).returning();
    await db!
      .insert(seasonMemberships)
      .values({ seasonId: season!.id, userId: row!.id, rosterId: 1 });
    return row!;
  }

  it('says nothing when there is no box', async () => {
    const nick = await manager();
    expect(await momentTags(db!, nick.id)).toEqual(new Set());
  });

  it('is the first box when they have never opened anything', async () => {
    const nick = await manager();
    await grantBox(db!, { userId: nick.id, grantKey: 'welcome', source: 'seed' });

    expect(await momentTags(db!, nick.id)).toEqual(new Set([FIRST_WELCOME_BOX]));
  });

  it('stops being the first box the moment it is opened', async () => {
    const nick = await manager();
    await grantBox(db!, { userId: nick.id, grantKey: 'welcome', source: 'seed' });
    const box = await ownedBox(db!, nick.id);

    setFixedRoll(0);
    await openBox(db!, { userId: nick.id, boxId: box!.id, seasonId });
    clearRandomSource();

    // The negative state is the *absence* of the tag, not a tag of its own.
    // Tony simply stops having a box to hand over.
    expect(await momentTags(db!, nick.id)).toEqual(new Set());
  });

  it('is a waiting box for somebody who has opened one before', async () => {
    const nick = await manager();
    await grantBox(db!, { userId: nick.id, grantKey: 'welcome', source: 'seed' });
    const first = await ownedBox(db!, nick.id);
    setFixedRoll(0);
    await openBox(db!, { userId: nick.id, boxId: first!.id, seasonId });
    clearRandomSource();

    await grantBox(db!, { userId: nick.id, grantKey: 'second', source: 'purchase' });

    // Never both at once: the two describe different people.
    expect(await momentTags(db!, nick.id)).toEqual(new Set([BOX_WAITING]));
  });

  /**
   * The day-cache must not outlive the moment.
   *
   * The defect this pins was found by **walking the loop**, not by any test: a
   * new manager was greeted with "New season, new box — Tony does not charge for
   * the first one", opened the box, came back to the room, and was told it
   * again. `greetingFor` repeats the day's line rather than drawing a fresh one
   * every page load, which is right for a standing fact about a season and wrong
   * for a fact that was true thirty seconds ago.
   *
   * Driven end to end — a real grant, a real open, and the real greeting service
   * either side of it — because the bug lived precisely in the seam between two
   * things that were each correct on their own.
   */
  it('stops repeating the day’s welcome line once the box is opened', async () => {
    const nick = await manager();
    await seedCounterGreetings(db!, readCounterGreetings());
    await grantBox(db!, { userId: nick.id, grantKey: 'welcome', source: 'seed' });

    /*
     * A real-sized league, because the selector ranks by **audience**.
     *
     * With `leagueTags: []` every line has an audience of zero, the
     * smallest-audience bucket is "all of them", and an untagged fallback wins —
     * which is a property of the empty array, not of the product. Ten sets is
     * what the parlor page actually passes, and against it a `first_welcome_box`
     * line is true of nobody else while the untagged lines are true of ten.
     */
    const league = Array.from({ length: 10 }, () => new Set<string>());

    const greetWith = async (tags: Set<string>) =>
      greetingFor(db!, {
        userId: nick.id,
        displayName: 'Nick',
        tags,
        leagueTags: league,
        daysUntilKickoff: 42,
        random: () => 0,
      });

    const first = await greetWith(await momentTags(db!, nick.id));
    expect(first?.entryKey, 'should have drawn a welcome line').toMatch(/^A2[4-8]$/);

    const box = await ownedBox(db!, nick.id);
    setFixedRoll(0);
    await openBox(db!, { userId: nick.id, boxId: box!.id, seasonId });
    clearRandomSource();

    // Same Eastern day, so the cache would hand back the same entry — but the
    // tag that selected it is gone, and the sentence is now false.
    const second = await greetWith(await momentTags(db!, nick.id));

    expect(second?.entryKey).not.toBe(first?.entryKey);
    expect(second?.text ?? '').not.toMatch(/first one/i);
  });

  afterAll(() => {
    clearClock();
  });
});

describe('the lines that depend on a moment', () => {
  const greetings = readCounterGreetings();

  it('has enough welcome variants that nobody hears the same one twice', () => {
    const welcome = greetings.filter((entry) =>
      entry.requiredTags.includes(FIRST_WELCOME_BOX),
    );
    // The ruling asks for "enough approved variants that the same manager does
    // not hear the identical line every visit". Three is not enough with a
    // three-day cooldown; five is.
    expect(welcome.length).toBeGreaterThanOrEqual(5);
  });

  it('has a line for the returning manager too', () => {
    const waiting = greetings.filter((entry) => entry.requiredTags.includes(BOX_WAITING));
    expect(waiting.length).toBeGreaterThanOrEqual(3);
  });

  it('never asks for both moments at once', () => {
    for (const entry of greetings) {
      const held = MOMENT_TAGS.filter((tag) => entry.requiredTags.includes(tag));
      // They describe different people. A line requiring both is unreachable,
      // and an unreachable line is one somebody wrote and will never see.
      expect(held.length, entry.key).toBeLessThanOrEqual(1);
    }
  });

  it('says nothing about money, chance, urgency or a guaranteed pull', () => {
    /*
     * The ruling names five things these lines must not imply: a real-money
     * purchase, gambling, a limited-time paid offer, a guaranteed rarity, and
     * fake urgency. A regex is a blunt instrument and it is the right one here —
     * it cannot judge tone, but it can make the *vocabulary* of a store
     * impossible to add by accident later.
     */
    const banned =
      /\b(buy|purchase|\$|dollar|cash|sale|discount|deal|hurry|now only|limited|expires?|today only|odds|jackpot|guaranteed|lucky dip|gamble|bet)\b/i;

    for (const entry of greetings.filter((candidate) =>
      MOMENT_TAGS.some((tag) => candidate.requiredTags.includes(tag)),
    )) {
      expect(entry.templateText, entry.key).not.toMatch(banned);
    }
  });

  it('keeps Tony short, because the first thing anybody reads is not a paragraph', () => {
    for (const entry of greetings.filter((candidate) =>
      MOMENT_TAGS.some((tag) => candidate.requiredTags.includes(tag)),
    )) {
      // `12 §8`: short statements, one setup, one turn. Also the practical
      // limit — this renders in an order pad on a 360px phone.
      expect(entry.templateText.length, entry.key).toBeLessThanOrEqual(110);
    }
  });
});
