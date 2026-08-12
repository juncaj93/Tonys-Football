import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearClock, setFixedClock } from '@/lib/clock';
import { clearRandomSource, setRandomSource } from '@/lib/counter/rng';
import { applyTokenDelta } from '@/lib/counter/tokens';
import { closePool, getDb } from '@/lib/db';
import {
  blackjackActions,
  blackjackHands,
  seasonMemberships,
  seasons,
  tokenTransactions,
  users,
} from '@/lib/db/schema';
import { PG_ERROR, expectPgError, expectPgMessage, resetDatabase } from '@/lib/db/test-helpers';
import { finalizeSeason } from '@/lib/sleeper/persist';

import { act, deal, openHand, recentHands } from './blackjack';
import { ensureBlackjackRules } from './blackjack-rules';
import { CARDS_IN_DECK, type Card } from './cards';

/**
 * The blackjack table, against a real Postgres.
 *
 * Every property that could lose or duplicate a token is a **database**
 * guarantee — the one-open-hand index, the settle-once trigger, the monotonic
 * revision, the unique action key, the overdraft CHECK — so none of it can be
 * tested against a mock. These tests ask the database for things it must refuse.
 */

const db = getDb();
const AT = new Date('2026-10-06T18:00:00Z');

/* ---------------------------------------------------------- deck control -- */

/** `0`=A, `1`–`8`=2–9, `9`=10, `10`=J, `11`=Q, `12`=K. Suit is irrelevant to play. */
const card = (rank: number, suit = 0): Card => suit * 13 + rank;

const ACE = 0;
const TEN = 9;
const FIVE = 4;
const SIX = 5;
const SEVEN = 6;
const EIGHT = 7;
const TWO = 1;

/**
 * Stack the deck.
 *
 * `shuffledDeck` runs Fisher–Yates over `rollBelow`, so a fixed source cannot
 * put chosen cards on top. Instead the shuffle is inverted: the injected source
 * returns whatever swap index leaves `wanted` at positions 0..n-1. Simpler and
 * more honest — the product's shuffle is untouched and still the thing under
 * test.
 */
function stackDeck(wanted: readonly Card[]): void {
  // Build the deck the product will produce by running the same algorithm
  // backwards: choose swaps so the final array starts with `wanted`.
  const target: Card[] = [];
  const used = new Set<Card>();
  for (const c of wanted) {
    if (used.has(c)) throw new Error(`card ${String(c)} stacked twice`);
    used.add(c);
    target.push(c);
  }
  for (let c = 0; c < CARDS_IN_DECK; c += 1) if (!used.has(c)) target.push(c);

  // Fisher–Yates from the top down: at step i we need deck[i] === target[i].
  const working = Array.from({ length: CARDS_IN_DECK }, (_, i) => i);
  const swaps: number[] = [];
  for (let i = CARDS_IN_DECK - 1; i > 0; i -= 1) {
    const want = target[i] as Card;
    const j = working.indexOf(want);
    swaps.push(j);
    const a = working[i] as Card;
    working[i] = want;
    working[j] = a;
  }

  let step = 0;
  setRandomSource(() => swaps[step++] ?? 0);
}

/** Deal order is player, dealer-up, player, dealer-hole, then hits. */
const dealAs = (p1: Card, up: Card, p2: Card, hole: Card, ...rest: Card[]): void => {
  stackDeck([p1, up, p2, hole, ...rest]);
};

/* ------------------------------------------------------------- fixtures -- */

let seatCounter = 0;

async function seat(tokens: number): Promise<{ userId: string; seasonId: string }> {
  seatCounter += 1;
  const [user] = await db
    .insert(users)
    .values({ sleeperUserId: `bj-${String(seatCounter)}`, displayName: `Tester ${String(seatCounter)}` })
    .returning({ id: users.id });

  const existing = await db.select({ id: seasons.id }).from(seasons).where(eq(seasons.year, 2026));
  const season =
    existing[0] ??
    (await db.insert(seasons).values({ year: 2026 }).returning({ id: seasons.id }))[0];

  const userId = user?.id ?? '';
  const seasonId = season?.id ?? '';

  await db.insert(seasonMemberships).values({ userId, seasonId, rosterId: seatCounter });
  if (tokens > 0) {
    await applyTokenDelta(db, {
      userId,
      seasonId,
      amount: tokens,
      reason: 'SEASON_START',
      description: 'Opening balance.',
      idempotencyKey: `open:${userId}`,
    });
  }

  await ensureBlackjackRules(db);
  return { userId, seasonId };
}

const balanceOf = async (userId: string): Promise<number> => {
  const rows = await db
    .select({ balance: seasonMemberships.tokenBalance })
    .from(seasonMemberships)
    .where(eq(seasonMemberships.userId, userId));
  return rows[0]?.balance ?? 0;
};

const casinoLedger = async (userId: string) =>
  db
    .select({ amount: tokenTransactions.amount, reason: tokenTransactions.reasonCode })
    .from(tokenTransactions)
    .innerJoin(seasonMemberships, eq(tokenTransactions.seasonMembershipId, seasonMemberships.id))
    .where(
      sql`${seasonMemberships.userId} = ${userId} and ${tokenTransactions.reasonCode} in ('CASINO_WAGER','CASINO_PAYOUT')`,
    );

beforeEach(async () => {
  await resetDatabase(db);
  seatCounter = 0;
  setFixedClock(AT);
});

afterEach(() => {
  clearClock();
  clearRandomSource();
});

afterAll(async () => {
  await closePool();
});

/* =========================================================== the rules === */

describe('the rules', () => {
  it('pays a player natural 3:2 and settles it at the deal', async () => {
    const s = await seat(500);
    dealAs(card(ACE), card(SEVEN), card(TEN), card(EIGHT));

    const result = await deal(db, { ...s, handKey: 'k', wager: 40 });
    expect(result.status).toBe('dealt');
    if (result.status !== 'dealt') return;

    expect(result.hand.outcome).toBe('player_natural');
    expect(result.hand.status).toBe('SETTLED');
    // 40 back + 60 winnings.
    expect(result.hand.payout).toBe(100);
    expect(await balanceOf(s.userId)).toBe(560);
    // A natural is never an open hand, so it can never be force-settled later.
    expect(await openHand(db, s.userId)).toBeNull();
  });

  it('loses to a dealer natural', async () => {
    const s = await seat(500);
    dealAs(card(TEN), card(ACE), card(SEVEN), card(TEN, 1));

    const result = await deal(db, { ...s, handKey: 'k', wager: 40 });
    if (result.status !== 'dealt') throw new Error('not dealt');
    expect(result.hand.outcome).toBe('dealer_natural');
    expect(result.hand.payout).toBe(0);
    expect(await balanceOf(s.userId)).toBe(460);
  });

  it('pushes when both hold a natural', async () => {
    const s = await seat(500);
    dealAs(card(ACE), card(ACE, 1), card(TEN), card(TEN, 1));

    const result = await deal(db, { ...s, handKey: 'k', wager: 40 });
    if (result.status !== 'dealt') throw new Error('not dealt');
    expect(result.hand.outcome).toBe('push');
    expect(result.hand.payout).toBe(40);
    expect(await balanceOf(s.userId)).toBe(500);
  });

  it('draws a card on a hit and keeps the hand open', async () => {
    const s = await seat(500);
    dealAs(card(FIVE), card(TEN), card(SIX), card(SEVEN), card(TWO));

    const dealt = await deal(db, { ...s, handKey: 'k', wager: 20 });
    if (dealt.status !== 'dealt') throw new Error('not dealt');
    expect(dealt.hand.playerTotal).toBe(11);
    expect(dealt.hand.revision).toBe(0);

    const hit = await act(db, {
      userId: s.userId,
      handId: dealt.hand.id,
      action: 'hit',
      expectedRevision: 0,
      actionKey: 'a1',
    });
    if (hit.status !== 'ok') throw new Error('hit refused');
    expect(hit.hand.playerTotal).toBe(13);
    expect(hit.hand.status).toBe('OPEN');
    expect(hit.hand.revision).toBe(1);
    expect(hit.hand.playerCards).toHaveLength(3);
  });

  it('busts a player over twenty-one, and the dealer does not draw', async () => {
    const s = await seat(500);
    dealAs(card(TEN), card(SIX), card(SEVEN, 1), card(TEN, 2), card(TEN, 3));

    const dealt = await deal(db, { ...s, handKey: 'k', wager: 20 });
    if (dealt.status !== 'dealt') throw new Error('not dealt');
    expect(dealt.hand.playerTotal).toBe(17);

    const hit = await act(db, {
      userId: s.userId,
      handId: dealt.hand.id,
      action: 'hit',
      expectedRevision: 0,
      actionKey: 'a1',
    });
    if (hit.status !== 'ok') throw new Error('hit refused');
    expect(hit.hand.outcome).toBe('bust');
    expect(hit.hand.payout).toBe(0);
    // The dealer stood on 16 + hole; it never drew, because it had already won.
    expect(hit.hand.dealerCards).toHaveLength(2);
    expect(await balanceOf(s.userId)).toBe(480);
  });

  it('stands, runs the dealer to seventeen, and pays a win', async () => {
    const s = await seat(500);
    // Player 20. Dealer 6 + 6 = 12, draws a five to 17 and stands.
    dealAs(card(TEN), card(SIX), card(TEN, 1), card(SIX, 1), card(FIVE));

    const dealt = await deal(db, { ...s, handKey: 'k', wager: 40 });
    if (dealt.status !== 'dealt') throw new Error('not dealt');

    const stand = await act(db, {
      userId: s.userId,
      handId: dealt.hand.id,
      action: 'stand',
      expectedRevision: 0,
      actionKey: 'a1',
    });
    if (stand.status !== 'ok') throw new Error('stand refused');
    expect(stand.hand.dealerTotal).toBe(17);
    expect(stand.hand.outcome).toBe('win');
    expect(stand.hand.payout).toBe(80);
    expect(await balanceOf(s.userId)).toBe(540);
  });

  /**
   * The approved rule, and the one most likely to be "improved" later.
   * A soft seventeen is a seventeen: the dealer stands on ace-six.
   */
  it('stands the dealer on a soft seventeen', async () => {
    const s = await seat(500);
    // Dealer A + 6 = soft 17. Player 18 wins if the dealer really stands.
    dealAs(card(TEN), card(ACE), card(EIGHT), card(SIX), card(TEN, 3));

    const dealt = await deal(db, { ...s, handKey: 'k', wager: 20 });
    if (dealt.status !== 'dealt') throw new Error('not dealt');

    const stand = await act(db, {
      userId: s.userId,
      handId: dealt.hand.id,
      action: 'stand',
      expectedRevision: 0,
      actionKey: 'a1',
    });
    if (stand.status !== 'ok') throw new Error('stand refused');
    expect(stand.hand.dealerTotal).toBe(17);
    expect(stand.hand.dealerCards).toHaveLength(2);
    expect(stand.hand.outcome).toBe('win');
  });

  it('pushes on equal totals', async () => {
    const s = await seat(500);
    // Player 20, dealer 20.
    dealAs(card(TEN), card(TEN, 1), card(TEN, 2), card(TEN, 3));

    const dealt = await deal(db, { ...s, handKey: 'k', wager: 40 });
    if (dealt.status !== 'dealt') throw new Error('not dealt');

    const stand = await act(db, {
      userId: s.userId,
      handId: dealt.hand.id,
      action: 'stand',
      expectedRevision: 0,
      actionKey: 'a1',
    });
    if (stand.status !== 'ok') throw new Error('stand refused');
    expect(stand.hand.outcome).toBe('push');
    expect(stand.hand.payout).toBe(40);
    expect(await balanceOf(s.userId)).toBe(500);
  });

  it('loses to a better dealer hand, and pays nothing', async () => {
    const s = await seat(500);
    // Player 17, dealer 19.
    dealAs(card(TEN), card(TEN, 1), card(SEVEN), card(EIGHT, 1));

    const dealt = await deal(db, { ...s, handKey: 'k', wager: 40 });
    if (dealt.status !== 'dealt') throw new Error('not dealt');

    const stand = await act(db, {
      userId: s.userId,
      handId: dealt.hand.id,
      action: 'stand',
      expectedRevision: 0,
      actionKey: 'a1',
    });
    if (stand.status !== 'ok') throw new Error('stand refused');
    expect(stand.hand.outcome).toBe('loss');
    expect(stand.hand.payout).toBe(0);
    expect(await balanceOf(s.userId)).toBe(460);
  });

  it('wins when the dealer busts', async () => {
    const s = await seat(500);
    // Player 15 stands. Dealer 6 + 6 = 12, draws a ten and busts.
    dealAs(card(TEN), card(SIX), card(FIVE), card(SIX, 1), card(TEN, 2));

    const dealt = await deal(db, { ...s, handKey: 'k', wager: 20 });
    if (dealt.status !== 'dealt') throw new Error('not dealt');

    const stand = await act(db, {
      userId: s.userId,
      handId: dealt.hand.id,
      action: 'stand',
      expectedRevision: 0,
      actionKey: 'a1',
    });
    if (stand.status !== 'ok') throw new Error('stand refused');
    expect(stand.hand.dealerTotal).toBeGreaterThan(21);
    expect(stand.hand.outcome).toBe('win');
  });

  it('survives several hits in a row', async () => {
    const s = await seat(500);
    dealAs(card(TWO), card(TEN), card(TWO, 1), card(SEVEN), card(TWO, 2), card(TWO, 3), card(FIVE));

    const dealt = await deal(db, { ...s, handKey: 'k', wager: 20 });
    if (dealt.status !== 'dealt') throw new Error('not dealt');

    let revision = 0;
    for (const key of ['a1', 'a2', 'a3']) {
      const hit = await act(db, {
        userId: s.userId,
        handId: dealt.hand.id,
        action: 'hit',
        expectedRevision: revision,
        actionKey: key,
      });
      if (hit.status !== 'ok') throw new Error(`hit ${key} refused`);
      revision = hit.hand.revision;
    }

    const rows = await db.select().from(blackjackActions);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.appliedAtRevision).sort()).toEqual([0, 1, 2]);
  });
});

/* ======================================================== the money ====== */

describe('the money', () => {
  it('refuses a wager the tab cannot cover, and deals nothing', async () => {
    const s = await seat(10);
    dealAs(card(TEN), card(TEN, 1), card(TEN, 2), card(TEN, 3));

    const result = await deal(db, { ...s, handKey: 'k', wager: 20 });
    expect(result).toEqual({ status: 'refused', reason: 'insufficient_tokens' });
    expect(await balanceOf(s.userId)).toBe(10);
    expect(await db.select().from(blackjackHands)).toHaveLength(0);
  });

  it('accepts a wager that spends the tab exactly', async () => {
    const s = await seat(20);
    dealAs(card(TEN), card(TEN, 1), card(SEVEN), card(SEVEN, 1));

    const result = await deal(db, { ...s, handKey: 'k', wager: 20 });
    expect(result.status).toBe('dealt');
    expect(await balanceOf(s.userId)).toBe(0);
  });

  it('refuses a wager that is not one of the buttons', async () => {
    const s = await seat(500);
    const result = await deal(db, { ...s, handKey: 'k', wager: 30 });
    expect(result).toEqual({ status: 'refused', reason: 'wager_not_offered' });
    expect(await balanceOf(s.userId)).toBe(500);
  });

  it('writes the wager and the payout as two distinct ledger movements', async () => {
    const s = await seat(500);
    dealAs(card(TEN), card(TEN, 1), card(TEN, 2), card(TEN, 3));

    const dealt = await deal(db, { ...s, handKey: 'k', wager: 40 });
    if (dealt.status !== 'dealt') throw new Error('not dealt');
    await act(db, {
      userId: s.userId,
      handId: dealt.hand.id,
      action: 'stand',
      expectedRevision: 0,
      actionKey: 'a1',
    });

    // A push: net zero, and still two rows. A net representation would be a
    // zero delta, which `apply_token_delta` refuses outright.
    const ledger = await casinoLedger(s.userId);
    expect(ledger).toHaveLength(2);
    expect(ledger.find((r) => r.reason === 'CASINO_WAGER')?.amount).toBe(-40);
    expect(ledger.find((r) => r.reason === 'CASINO_PAYOUT')?.amount).toBe(40);
  });

  it('writes no payout row at all on a loss', async () => {
    const s = await seat(500);
    dealAs(card(TEN), card(TEN, 1), card(SEVEN), card(EIGHT, 1));

    const dealt = await deal(db, { ...s, handKey: 'k', wager: 40 });
    if (dealt.status !== 'dealt') throw new Error('not dealt');
    await act(db, {
      userId: s.userId,
      handId: dealt.hand.id,
      action: 'stand',
      expectedRevision: 0,
      actionKey: 'a1',
    });

    const ledger = await casinoLedger(s.userId);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.reason).toBe('CASINO_WAGER');
  });

  it('refuses to deal into a finalized season, because the ledger does', async () => {
    const s = await seat(500);
    await db.update(seasons).set({ finalizedAt: AT }).where(eq(seasons.id, s.seasonId));
    dealAs(card(TEN), card(TEN, 1), card(SEVEN), card(SEVEN, 1));

    await expectPgMessage(
      deal(db, { ...s, handKey: 'k', wager: 20 }),
      /is finalized; its token ledger is closed/,
    );
    expect(await db.select().from(blackjackHands)).toHaveLength(0);
  });
});

/* ============================================== persistence and resume === */

describe('persistence and resume', () => {
  it('returns the same open hand to any device that asks', async () => {
    const s = await seat(500);
    dealAs(card(FIVE), card(TEN), card(SIX), card(SEVEN));
    const dealt = await deal(db, { ...s, handKey: 'k', wager: 20 });
    if (dealt.status !== 'dealt') throw new Error('not dealt');

    // A refresh, a second tab and a second device are all this call.
    const resumed = await openHand(db, s.userId);
    expect(resumed?.id).toBe(dealt.hand.id);
    expect(resumed?.revision).toBe(0);
    expect(resumed?.playerCards).toEqual(dealt.hand.playerCards);
  });

  /**
   * The hole card is dealt at the deal and withheld until the hand is over. A
   * view that leaked it would let a player read the future off a network tab,
   * and no amount of UI would fix it.
   */
  it('never shows the hole card while the hand is open', async () => {
    const s = await seat(500);
    dealAs(card(FIVE), card(TEN), card(SIX), card(SEVEN));
    const dealt = await deal(db, { ...s, handKey: 'k', wager: 20 });
    if (dealt.status !== 'dealt') throw new Error('not dealt');

    expect(dealt.hand.dealerCards).toHaveLength(1);
    expect(dealt.hand.dealerTotal).toBeNull();

    await act(db, {
      userId: s.userId,
      handId: dealt.hand.id,
      action: 'stand',
      expectedRevision: 0,
      actionKey: 'a1',
    });

    const settled = await recentHands(db, s.userId);
    expect(settled).toHaveLength(1);
    const row = await db.select().from(blackjackHands);
    expect((row[0]?.dealerCards ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('refuses a second open hand for one manager', async () => {
    const s = await seat(500);
    dealAs(card(FIVE), card(TEN), card(SIX), card(SEVEN));
    await deal(db, { ...s, handKey: 'k1', wager: 20 });

    dealAs(card(FIVE, 1), card(TEN, 1), card(SIX, 1), card(SEVEN, 1));
    const second = await deal(db, { ...s, handKey: 'k2', wager: 20 });

    expect(second).toEqual({ status: 'refused', reason: 'hand_in_progress' });
    // The second wager was rolled back with the failed insert.
    expect(await balanceOf(s.userId)).toBe(480);
    expect(await db.select().from(blackjackHands)).toHaveLength(1);
  });

  it('lets a manager deal again once the previous hand is settled', async () => {
    const s = await seat(500);
    dealAs(card(TEN), card(TEN, 1), card(TEN, 2), card(TEN, 3));
    const first = await deal(db, { ...s, handKey: 'k1', wager: 20 });
    if (first.status !== 'dealt') throw new Error('not dealt');
    await act(db, {
      userId: s.userId,
      handId: first.hand.id,
      action: 'stand',
      expectedRevision: 0,
      actionKey: 'a1',
    });

    dealAs(card(FIVE), card(TEN, 1), card(SIX), card(SEVEN));
    const second = await deal(db, { ...s, handKey: 'k2', wager: 20 });
    expect(second.status).toBe('dealt');
  });
});

/* ===================================== concurrency and idempotency ======= */

describe('concurrency and idempotency', () => {
  it('replays a double-tapped deal instead of dealing twice', async () => {
    const s = await seat(500);
    dealAs(card(FIVE), card(TEN), card(SIX), card(SEVEN));

    const first = await deal(db, { ...s, handKey: 'same', wager: 20 });
    dealAs(card(TEN), card(TEN, 1), card(TEN, 2), card(TEN, 3));
    const second = await deal(db, { ...s, handKey: 'same', wager: 20 });

    if (first.status !== 'dealt' || second.status !== 'dealt') throw new Error('not dealt');
    expect(second.replayed).toBe(true);
    expect(second.hand.id).toBe(first.hand.id);
    expect(second.hand.playerCards).toEqual(first.hand.playerCards);
    expect(await balanceOf(s.userId)).toBe(480);
  });

  /**
   * The case "one open hand" alone does not cover, and the reason `action_key`
   * is checked **before** the revision: a committed action whose response was
   * lost is retried with a revision that is now stale by exactly one.
   */
  it('resolves a retried hit to the committed result rather than drawing again', async () => {
    const s = await seat(500);
    dealAs(card(FIVE), card(TEN), card(SIX), card(SEVEN), card(TWO), card(TEN, 3));

    const dealt = await deal(db, { ...s, handKey: 'k', wager: 20 });
    if (dealt.status !== 'dealt') throw new Error('not dealt');

    const hit = await act(db, {
      userId: s.userId,
      handId: dealt.hand.id,
      action: 'hit',
      expectedRevision: 0,
      actionKey: 'lost-response',
    });
    if (hit.status !== 'ok') throw new Error('hit refused');

    // The client never saw the response, so it retries with the old revision.
    const retry = await act(db, {
      userId: s.userId,
      handId: dealt.hand.id,
      action: 'hit',
      expectedRevision: 0,
      actionKey: 'lost-response',
    });

    if (retry.status !== 'ok') throw new Error('retry refused');
    expect(retry.replayed).toBe(true);
    expect(retry.hand.playerCards).toEqual(hit.hand.playerCards);
    expect(retry.hand.revision).toBe(hit.hand.revision);
    expect(await db.select().from(blackjackActions)).toHaveLength(1);
  });

  it('refuses a stale action from a tab that missed a card', async () => {
    const s = await seat(500);
    dealAs(card(FIVE), card(TEN), card(SIX), card(SEVEN), card(TWO));

    const dealt = await deal(db, { ...s, handKey: 'k', wager: 20 });
    if (dealt.status !== 'dealt') throw new Error('not dealt');

    // Tab A hits.
    await act(db, {
      userId: s.userId,
      handId: dealt.hand.id,
      action: 'hit',
      expectedRevision: 0,
      actionKey: 'tab-a',
    });

    // Tab B still thinks the hand is at revision 0 and stands.
    const stale = await act(db, {
      userId: s.userId,
      handId: dealt.hand.id,
      action: 'stand',
      expectedRevision: 0,
      actionKey: 'tab-b',
    });

    expect(stale.status).toBe('refused');
    if (stale.status !== 'refused') return;
    expect(stale.reason).toBe('stale');
    // The real hand comes back with the refusal, so the tab can catch up.
    expect(stale.hand?.revision).toBe(1);
    expect(stale.hand?.status).toBe('OPEN');
    // And the stale stand did not settle anything.
    expect(await db.select().from(blackjackActions)).toHaveLength(1);
  });

  it('lets only one of two racing actions advance the hand', async () => {
    const s = await seat(500);
    dealAs(card(FIVE), card(TEN), card(SIX), card(SEVEN), card(TWO), card(TEN, 3));

    const dealt = await deal(db, { ...s, handKey: 'k', wager: 20 });
    if (dealt.status !== 'dealt') throw new Error('not dealt');

    const [a, b] = await Promise.all([
      act(db, {
        userId: s.userId,
        handId: dealt.hand.id,
        action: 'hit',
        expectedRevision: 0,
        actionKey: 'race-a',
      }),
      act(db, {
        userId: s.userId,
        handId: dealt.hand.id,
        action: 'hit',
        expectedRevision: 0,
        actionKey: 'race-b',
      }),
    ]);

    const advanced = [a, b].filter((r) => r.status === 'ok' && !r.replayed);
    const refused = [a, b].filter((r) => r.status === 'refused');
    expect(advanced).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(await db.select().from(blackjackActions)).toHaveLength(1);
  });

  it('refuses any action after settlement, and pays nothing more', async () => {
    const s = await seat(500);
    dealAs(card(TEN), card(TEN, 1), card(TEN, 2), card(TEN, 3));

    const dealt = await deal(db, { ...s, handKey: 'k', wager: 40 });
    if (dealt.status !== 'dealt') throw new Error('not dealt');

    const stand = await act(db, {
      userId: s.userId,
      handId: dealt.hand.id,
      action: 'stand',
      expectedRevision: 0,
      actionKey: 'a1',
    });
    if (stand.status !== 'ok') throw new Error('stand refused');
    const after = await balanceOf(s.userId);

    for (const [key, revision] of [
      ['a2', 1],
      ['a3', 0],
    ] as const) {
      const late = await act(db, {
        userId: s.userId,
        handId: dealt.hand.id,
        action: 'hit',
        expectedRevision: revision,
        actionKey: key,
      });
      expect(late.status).toBe('refused');
      if (late.status === 'refused') expect(late.reason).toBe('already_settled');
    }

    expect(await balanceOf(s.userId)).toBe(after);
    expect(await casinoLedger(s.userId)).toHaveLength(2);
  });

  it('replays a retried stand on a settled hand without paying twice', async () => {
    const s = await seat(500);
    dealAs(card(TEN), card(TEN, 1), card(TEN, 2), card(TEN, 3));

    const dealt = await deal(db, { ...s, handKey: 'k', wager: 40 });
    if (dealt.status !== 'dealt') throw new Error('not dealt');

    const stand = await act(db, {
      userId: s.userId,
      handId: dealt.hand.id,
      action: 'stand',
      expectedRevision: 0,
      actionKey: 'the-stand',
    });
    if (stand.status !== 'ok') throw new Error('stand refused');

    const retry = await act(db, {
      userId: s.userId,
      handId: dealt.hand.id,
      action: 'stand',
      expectedRevision: 0,
      actionKey: 'the-stand',
    });

    if (retry.status !== 'ok') throw new Error('retry refused');
    expect(retry.replayed).toBe(true);
    expect(retry.hand.outcome).toBe('push');
    expect(await balanceOf(s.userId)).toBe(500);
    expect(await casinoLedger(s.userId)).toHaveLength(2);
  });
});

/* ============================================ what the database refuses == */

describe('what the database will not let anybody write', () => {
  it('refuses a second open hand at the index, not just in the service', async () => {
    const s = await seat(500);
    dealAs(card(FIVE), card(TEN), card(SIX), card(SEVEN));
    await deal(db, { ...s, handKey: 'k1', wager: 20 });
    const [row] = await db.select().from(blackjackHands);

    await expectPgError(
      db.insert(blackjackHands).values({
        userId: s.userId,
        seasonId: s.seasonId,
        handKey: 'hand-written-by-hand',
        wagerTokens: 20,
        tableVersion: row?.tableVersion ?? '',
        deck: row?.deck ?? [],
        deckPosition: 4,
        playerCards: [0, 1],
        dealerCards: [2, 3],
        wagerTxId: row?.wagerTxId ?? '',
        createdAt: AT,
        updatedAt: AT,
      }),
      { code: PG_ERROR.uniqueViolation, constraint: 'blackjack_hands_one_open_per_user' },
    );
  });

  it('refuses to change a settled hand at all', async () => {
    const s = await seat(500);
    dealAs(card(ACE), card(SEVEN), card(TEN), card(EIGHT));
    await deal(db, { ...s, handKey: 'k', wager: 40 });

    await expectPgMessage(
      db.update(blackjackHands).set({ payoutTokens: 9999, revision: 1 }),
      /settled hand is history/,
    );
    await expectPgMessage(db.delete(blackjackHands), /cannot be deleted/);
  });

  it('refuses a revision that skips or repeats', async () => {
    const s = await seat(500);
    dealAs(card(FIVE), card(TEN), card(SIX), card(SEVEN));
    const dealt = await deal(db, { ...s, handKey: 'k', wager: 20 });
    if (dealt.status !== 'dealt') throw new Error('not dealt');

    for (const revision of [0, 2, 7]) {
      await expectPgMessage(
        db
          .update(blackjackHands)
          .set({ revision })
          .where(eq(blackjackHands.id, dealt.hand.id)),
        /exactly one revision at a time/,
      );
    }
  });

  it('refuses to rewrite the deck or the wager of a dealt hand', async () => {
    const s = await seat(500);
    dealAs(card(FIVE), card(TEN), card(SIX), card(SEVEN));
    const dealt = await deal(db, { ...s, handKey: 'k', wager: 20 });
    if (dealt.status !== 'dealt') throw new Error('not dealt');

    await expectPgMessage(
      db
        .update(blackjackHands)
        .set({ wagerTokens: 80, revision: 1 })
        .where(eq(blackjackHands.id, dealt.hand.id)),
      /deck, wager and terms are immutable/,
    );
  });

  it('refuses a deck position that disagrees with the cards', async () => {
    const s = await seat(500);
    dealAs(card(FIVE), card(TEN), card(SIX), card(SEVEN));
    const dealt = await deal(db, { ...s, handKey: 'k', wager: 20 });
    if (dealt.status !== 'dealt') throw new Error('not dealt');

    await expectPgError(
      db
        .update(blackjackHands)
        .set({ deckPosition: 9, revision: 1 })
        .where(eq(blackjackHands.id, dealt.hand.id)),
      { code: PG_ERROR.checkViolation, constraint: 'blackjack_hands_position_matches_cards' },
    );
  });

  it('refuses a duplicate action key', async () => {
    const s = await seat(500);
    dealAs(card(FIVE), card(TEN), card(SIX), card(SEVEN), card(TWO));
    const dealt = await deal(db, { ...s, handKey: 'k', wager: 20 });
    if (dealt.status !== 'dealt') throw new Error('not dealt');
    await act(db, {
      userId: s.userId,
      handId: dealt.hand.id,
      action: 'hit',
      expectedRevision: 0,
      actionKey: 'once',
    });

    await expectPgError(
      db.insert(blackjackActions).values({
        handId: dealt.hand.id,
        actionKey: 'once',
        action: 'hit',
        appliedAtRevision: 5,
        card: 12,
        createdAt: AT,
      }),
      { code: PG_ERROR.uniqueViolation, constraint: 'blackjack_actions_key_unique' },
    );
  });

  it('refuses two actions applied at the same revision', async () => {
    const s = await seat(500);
    dealAs(card(FIVE), card(TEN), card(SIX), card(SEVEN), card(TWO));
    const dealt = await deal(db, { ...s, handKey: 'k', wager: 20 });
    if (dealt.status !== 'dealt') throw new Error('not dealt');
    await act(db, {
      userId: s.userId,
      handId: dealt.hand.id,
      action: 'hit',
      expectedRevision: 0,
      actionKey: 'once',
    });

    await expectPgError(
      db.insert(blackjackActions).values({
        handId: dealt.hand.id,
        actionKey: 'twice',
        action: 'hit',
        appliedAtRevision: 0,
        card: 12,
        createdAt: AT,
      }),
      { code: PG_ERROR.uniqueViolation, constraint: 'blackjack_actions_one_per_revision' },
    );
  });

  it('refuses a payout that no ledger row paid for', async () => {
    const s = await seat(500);
    dealAs(card(FIVE), card(TEN), card(SIX), card(SEVEN));
    await deal(db, { ...s, handKey: 'k', wager: 20 });
    const [row] = await db.select().from(blackjackHands);

    await expectPgError(
      db.insert(blackjackHands).values({
        userId: s.userId,
        seasonId: s.seasonId,
        handKey: 'unpaid',
        wagerTokens: 20,
        tableVersion: row?.tableVersion ?? '',
        deck: row?.deck ?? [],
        deckPosition: 4,
        playerCards: [0, 1],
        dealerCards: [2, 3],
        status: 'SETTLED',
        outcome: 'win',
        settledBy: 'player',
        // Claims a payout, names no ledger row.
        payoutTokens: 40,
        wagerTxId: row?.wagerTxId ?? '',
        createdAt: AT,
        updatedAt: AT,
        settledAt: AT,
      }),
      { code: PG_ERROR.checkViolation, constraint: 'blackjack_hands_payout_is_paid' },
    );
  });
});

/* ================================================== season close ========= */

describe('season close', () => {
  /**
   * The commissioner's ruling: an abandoned hand is **stood**, not refunded.
   * A refund would be a free option — deal, see sixteen, walk away, get the
   * wager back.
   */
  it('stands an abandoned hand on its current total and settles it', async () => {
    const s = await seat(500);
    // Player 16 and gone. Dealer 10 + 7 = 17 and stands, so the player loses.
    dealAs(card(TEN), card(TEN, 1), card(SIX), card(SEVEN, 1));
    const dealt = await deal(db, { ...s, handKey: 'k', wager: 40 });
    if (dealt.status !== 'dealt') throw new Error('not dealt');
    expect(dealt.hand.playerTotal).toBe(16);

    expect(await finalizeSeason(db, 2026)).toBe(true);

    const [row] = await db.select().from(blackjackHands);
    expect(row?.status).toBe('SETTLED');
    expect(row?.settledBy).toBe('season_close');
    expect(row?.outcome).toBe('loss');
    expect(row?.payoutTokens).toBe(0);
    // No refund: the wager stays gone.
    expect(await balanceOf(s.userId)).toBe(460);
    expect(await openHand(db, s.userId)).toBeNull();
  });

  it('pays an abandoned hand that was actually winning', async () => {
    const s = await seat(500);
    // Player 20 and gone. Dealer 10 + 7 = 17 and stands.
    dealAs(card(TEN), card(TEN, 1), card(TEN, 2), card(SEVEN, 1));
    const dealt = await deal(db, { ...s, handKey: 'k', wager: 40 });
    if (dealt.status !== 'dealt') throw new Error('not dealt');

    expect(await finalizeSeason(db, 2026)).toBe(true);

    const [row] = await db.select().from(blackjackHands);
    expect(row?.outcome).toBe('win');
    expect(row?.payoutTokens).toBe(80);
    expect(row?.settledBy).toBe('season_close');
    expect(await balanceOf(s.userId)).toBe(540);
  });

  it('settles a partially played hand on the total it had reached', async () => {
    const s = await seat(500);
    // 5 + 6 = 11, hit a ten → 21, then abandoned. Dealer 10 + 7 = 17.
    dealAs(card(FIVE), card(TEN), card(SIX), card(SEVEN, 1), card(TEN, 2));
    const dealt = await deal(db, { ...s, handKey: 'k', wager: 20 });
    if (dealt.status !== 'dealt') throw new Error('not dealt');
    const hit = await act(db, {
      userId: s.userId,
      handId: dealt.hand.id,
      action: 'hit',
      expectedRevision: 0,
      actionKey: 'a1',
    });
    if (hit.status !== 'ok') throw new Error('hit refused');
    expect(hit.hand.playerTotal).toBe(21);

    expect(await finalizeSeason(db, 2026)).toBe(true);

    const [row] = await db.select().from(blackjackHands);
    expect(row?.outcome).toBe('win');
    expect(row?.payoutTokens).toBe(40);
  });

  it('pushes an abandoned hand that ties the dealer', async () => {
    const s = await seat(500);
    dealAs(card(TEN), card(TEN, 1), card(SEVEN), card(SEVEN, 1));
    await deal(db, { ...s, handKey: 'k', wager: 40 });

    expect(await finalizeSeason(db, 2026)).toBe(true);

    const [row] = await db.select().from(blackjackHands);
    expect(row?.outcome).toBe('push');
    expect(row?.payoutTokens).toBe(40);
    expect(await balanceOf(s.userId)).toBe(500);
  });

  it('leaves no open hand anywhere after the books shut', async () => {
    const a = await seat(500);
    dealAs(card(TEN), card(TEN, 1), card(SIX), card(SEVEN, 1));
    await deal(db, { ...a, handKey: 'ka', wager: 20 });

    const b = await seat(500);
    dealAs(card(FIVE), card(TEN, 2), card(SIX, 2), card(SEVEN, 2));
    await deal(db, { ...b, handKey: 'kb', wager: 20 });

    expect(await finalizeSeason(db, 2026)).toBe(true);

    const open = await db
      .select({ id: blackjackHands.id })
      .from(blackjackHands)
      .where(eq(blackjackHands.status, 'OPEN'));
    expect(open).toHaveLength(0);
  });

  /**
   * The ordering that matters. `apply_token_delta` refuses a finalized season,
   * so a hand settled *after* the close could never be paid — and the one-open-
   * hand index would jam that seat forever. The close settles first, inside the
   * same transaction.
   */
  it('settles before the books shut, so a payout is still writable', async () => {
    const s = await seat(500);
    dealAs(card(TEN), card(TEN, 1), card(TEN, 2), card(SEVEN, 1));
    await deal(db, { ...s, handKey: 'k', wager: 40 });

    expect(await finalizeSeason(db, 2026)).toBe(true);

    // The payout landed, which is only possible if it preceded `finalized_at`.
    const ledger = await casinoLedger(s.userId);
    expect(ledger.find((r) => r.reason === 'CASINO_PAYOUT')?.amount).toBe(80);

    const [season] = await db.select({ at: seasons.finalizedAt }).from(seasons);
    expect(season?.at).not.toBeNull();
  });

  it('is safe to run twice', async () => {
    const s = await seat(500);
    dealAs(card(TEN), card(TEN, 1), card(TEN, 2), card(SEVEN, 1));
    await deal(db, { ...s, handKey: 'k', wager: 40 });

    expect(await finalizeSeason(db, 2026)).toBe(true);
    const after = await balanceOf(s.userId);
    expect(await finalizeSeason(db, 2026)).toBe(false);
    expect(await balanceOf(s.userId)).toBe(after);
    expect(await casinoLedger(s.userId)).toHaveLength(2);
  });

  /**
   * A hit racing the close. Both take `FOR UPDATE` on the hand, so one of two
   * things happens and neither strands or duplicates anything: the hit commits
   * first and the close sweeps the advanced hand, or the close commits first and
   * the hit finds the hand already settled.
   */
  it('never strands or double-pays a hand racing the close', async () => {
    const s = await seat(500);
    dealAs(card(FIVE), card(TEN), card(SIX), card(SEVEN, 1), card(TWO));
    const dealt = await deal(db, { ...s, handKey: 'k', wager: 20 });
    if (dealt.status !== 'dealt') throw new Error('not dealt');

    const [, closed] = await Promise.all([
      act(db, {
        userId: s.userId,
        handId: dealt.hand.id,
        action: 'hit',
        expectedRevision: 0,
        actionKey: 'racing',
      }).catch(() => null),
      finalizeSeason(db, 2026),
    ]);

    expect(closed).toBe(true);

    const [row] = await db.select().from(blackjackHands);
    expect(row?.status).toBe('SETTLED');

    // Exactly one wager and at most one payout, whichever way the race went.
    const ledger = await casinoLedger(s.userId);
    expect(ledger.filter((r) => r.reason === 'CASINO_WAGER')).toHaveLength(1);
    expect(ledger.filter((r) => r.reason === 'CASINO_PAYOUT').length).toBeLessThanOrEqual(1);
  });
});

/* ================================================== privacy and access === */

describe('privacy and access', () => {
  it('refuses an action on somebody else hand', async () => {
    const mine = await seat(500);
    const theirs = await seat(500);

    dealAs(card(FIVE), card(TEN), card(SIX), card(SEVEN));
    const dealt = await deal(db, { ...mine, handKey: 'k', wager: 20 });
    if (dealt.status !== 'dealt') throw new Error('not dealt');

    const stolen = await act(db, {
      userId: theirs.userId,
      handId: dealt.hand.id,
      action: 'hit',
      expectedRevision: 0,
      actionKey: 'thief',
    });

    // Not-found and not-yours are one answer: probing ids teaches nothing.
    expect(stolen).toEqual({ status: 'refused', reason: 'not_found' });
    expect(await balanceOf(theirs.userId)).toBe(500);
    expect(await db.select().from(blackjackActions)).toHaveLength(0);
  });

  it('shows a manager only their own history', async () => {
    const mine = await seat(500);
    const theirs = await seat(500);

    dealAs(card(ACE), card(SEVEN), card(TEN), card(EIGHT));
    await deal(db, { ...mine, handKey: 'k1', wager: 20 });
    dealAs(card(ACE, 1), card(SEVEN, 1), card(TEN, 1), card(EIGHT, 1));
    await deal(db, { ...theirs, handKey: 'k2', wager: 20 });

    expect(await db.select().from(blackjackHands)).toHaveLength(2);
    expect(await recentHands(db, mine.userId)).toHaveLength(1);
    expect(await recentHands(db, theirs.userId)).toHaveLength(1);
  });

  it('does not let one manager open hand block another manager deal', async () => {
    const a = await seat(500);
    dealAs(card(FIVE), card(TEN), card(SIX), card(SEVEN));
    await deal(db, { ...a, handKey: 'ka', wager: 20 });

    const b = await seat(500);
    dealAs(card(FIVE, 1), card(TEN, 1), card(SIX, 1), card(SEVEN, 1));
    const second = await deal(db, { ...b, handKey: 'kb', wager: 20 });
    expect(second.status).toBe('dealt');
  });
});
