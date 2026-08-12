import { and, desc, eq, sql } from 'drizzle-orm';

import { now } from '@/lib/clock';
import { applyTokenDelta } from '@/lib/counter/tokens';
import { type Database, type Queryable } from '@/lib/db';
import { hasConstraint, isBalanceViolation } from '@/lib/db/errors';
import { blackjackActions, blackjackHands } from '@/lib/db/schema';

import { blackjackRulesFor, payoutFor, type BlackjackRules } from './blackjack-rules';
import { isNaturalHand, totalOf, type Card } from './cards';
import { shuffledDeck } from './shuffle';

/**
 * The blackjack table.
 *
 * ## A hand is durable server state, and everything follows from that
 *
 * Slots settles inside one request. A hand does not — it spans a deal, some
 * hits, a stand, the dealer's draw and a settlement, across as many requests as
 * the player takes and as many devices as they open. So **the row is the game**,
 * and there is deliberately no session, no cache and no temporary state beside
 * it. A refresh, a killed browser, a second tab and a second device all resume
 * the same row because there is nothing else to resume.
 *
 * ## Four defences, and each answers a different failure
 *
 *   1. **`blackjack_hands_one_open_per_user`**, a partial unique index. Two
 *      deals racing both write, and one loses at the database. A service check
 *      would let both through.
 *   2. **`SELECT ... FOR UPDATE`** on the hand. Two actions from two tabs
 *      serialize here rather than interleaving mid-transition.
 *   3. **`revision`**, monotonic and trigger-enforced. Tab A hits; Tab B's stand
 *      still names the revision the player was looking at, and is refused rather
 *      than silently applied to a hand they never saw. This is the case
 *      *"one open hand"* alone does not cover.
 *   4. **`blackjack_actions.action_key`**, unique. A committed action whose
 *      response was lost resolves to the committed result on retry instead of
 *      drawing a second card — checked **before** the revision, because a retry
 *      necessarily carries a stale one.
 *
 * The order of 4 and 3 is the whole difference between "a retry is safe" and "a
 * retry looks like a stale tab".
 *
 * ## Nothing here writes a balance
 *
 * `16 §5.4`. The wager and the payout are two `apply_token_delta` calls with
 * derived keys, and R13's separation is forced as well as ruled: a push returns
 * exactly the wager, and a net representation of that would be a zero delta,
 * which the ledger refuses outright.
 */

export type Outcome = 'player_natural' | 'dealer_natural' | 'push' | 'win' | 'loss' | 'bust';

/** What a manager may see of a hand. **Never the undealt deck.** */
export interface HandView {
  readonly id: string;
  readonly wager: number;
  readonly revision: number;
  readonly playerCards: readonly Card[];
  /**
   * The dealer's cards.
   *
   * While the hand is open this is the up-card **only** — the hole card is dealt
   * and stored but not shown, exactly as at a real table. Once settled it is
   * everything, because the hand is over and the record is the record.
   */
  readonly dealerCards: readonly Card[];
  readonly playerTotal: number;
  readonly playerSoft: boolean;
  /** Null while the hole card is still down. */
  readonly dealerTotal: number | null;
  readonly status: 'OPEN' | 'SETTLED';
  readonly outcome: Outcome | null;
  readonly payout: number | null;
  readonly settledBy: 'player' | 'season_close' | null;
}

export type DealResult =
  | { readonly status: 'dealt'; readonly hand: HandView; readonly replayed: boolean }
  | {
      readonly status: 'refused';
      readonly reason: 'wager_not_offered' | 'insufficient_tokens' | 'hand_in_progress' | 'closed';
    };

export type ActResult =
  | { readonly status: 'ok'; readonly hand: HandView; readonly replayed: boolean }
  | {
      readonly status: 'refused';
      readonly reason: 'not_found' | 'already_settled' | 'stale';
      /** On `stale` and `already_settled`, what the hand actually is now. */
      readonly hand?: HandView;
    };

/* ------------------------------------------------------------------ views -- */

interface HandRow {
  id: string;
  wagerTokens: number;
  revision: number;
  playerCards: number[];
  dealerCards: number[];
  status: 'OPEN' | 'SETTLED';
  outcome: Outcome | null;
  payoutTokens: number | null;
  settledBy: 'player' | 'season_close' | null;
}

/**
 * Turn a row into what the player is allowed to know.
 *
 * **The hole card is withheld while the hand is open**, and so is every undealt
 * card. `04 §11`: the client receives only what it needs to animate an outcome
 * the server has already committed. A view that returned the deck would let a
 * player read the future off a network tab, and no amount of UI would fix it.
 */
function view(row: HandRow): HandView {
  const open = row.status === 'OPEN';
  const dealerShown = open ? row.dealerCards.slice(0, 1) : row.dealerCards;
  const player = totalOf(row.playerCards);

  return {
    id: row.id,
    wager: row.wagerTokens,
    revision: row.revision,
    playerCards: row.playerCards,
    dealerCards: dealerShown,
    playerTotal: player.total,
    playerSoft: player.soft,
    dealerTotal: open ? null : totalOf(row.dealerCards).total,
    status: row.status,
    outcome: row.outcome,
    payout: row.payoutTokens,
    settledBy: row.settledBy,
  };
}

const HAND_COLUMNS = {
  id: blackjackHands.id,
  wagerTokens: blackjackHands.wagerTokens,
  revision: blackjackHands.revision,
  playerCards: blackjackHands.playerCards,
  dealerCards: blackjackHands.dealerCards,
  status: blackjackHands.status,
  outcome: blackjackHands.outcome,
  payoutTokens: blackjackHands.payoutTokens,
  settledBy: blackjackHands.settledBy,
  deck: blackjackHands.deck,
  deckPosition: blackjackHands.deckPosition,
  seasonId: blackjackHands.seasonId,
  userId: blackjackHands.userId,
} as const;

/* -------------------------------------------------------------- the rules -- */

/**
 * Run the dealer.
 *
 * **Stands on all 17**, hard or soft — the approved rule, and the reason there
 * is no soft-seventeen branch here. Pure: it takes the cards and the deck and
 * returns what the dealer finished with.
 */
export function runDealer(
  dealer: readonly Card[],
  deck: readonly Card[],
  from: number,
  rules: BlackjackRules,
): { cards: Card[]; position: number } {
  const cards = [...dealer];
  let position = from;

  while (totalOf(cards).total < rules.dealerStandsOn) {
    const card = deck[position];
    if (card === undefined) throw new Error('the dealer ran out of deck');
    cards.push(card);
    position += 1;
  }

  return { cards, position };
}

/**
 * Compare a standing player against a finished dealer.
 *
 * Naturals are decided at the deal and never reach here, which is why this
 * function has no case for one.
 */
export function compare(playerTotal: number, dealerTotal: number): Outcome {
  if (dealerTotal > 21) return 'win';
  if (playerTotal > dealerTotal) return 'win';
  if (playerTotal === dealerTotal) return 'push';
  return 'loss';
}

/* ------------------------------------------------------------------- deal -- */

export async function deal(
  db: Database,
  input: {
    readonly userId: string;
    /** Resolved by the caller. `null` means the books are shut everywhere. */
    readonly seasonId: string | null;
    readonly handKey: string;
    readonly wager: number;
  },
): Promise<DealResult> {
  if (input.seasonId === null) return { status: 'refused', reason: 'closed' };
  const seasonId = input.seasonId;

  const { version, rules } = await blackjackRulesFor(db);

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`casino:${input.userId}`})::bigint)`,
      );

      // A replayed deal returns the hand it already dealt, never a second one.
      const existing = await tx
        .select(HAND_COLUMNS)
        .from(blackjackHands)
        .where(
          and(eq(blackjackHands.handKey, input.handKey), eq(blackjackHands.userId, input.userId)),
        )
        .limit(1);

      const already = existing[0];
      if (already !== undefined) {
        return { status: 'dealt' as const, hand: view(already), replayed: true };
      }

      /*
       * Checked against the **stored** rules rather than a constant, so a
       * re-tuned ladder takes effect by being seeded. A client sending anything
       * else is not a manager with a preference; it is a crafted request.
       */
      if (!rules.wagers.includes(input.wager)) {
        return { status: 'refused' as const, reason: 'wager_not_offered' as const };
      }

      /*
       * The debit goes first, as everywhere else in this product: the balance is
       * enforced by `apply_token_delta`, so an unaffordable wager creates no
       * hand at all. Nothing here reads a balance and decides.
       */
      const wagerTxId = await applyTokenDelta(tx, {
        userId: input.userId,
        seasonId,
        amount: -input.wager,
        reason: 'CASINO_WAGER',
        // `03 §5` requires human-readable text. Curated, not generated.
        description: 'A hand at the table downstairs.',
        idempotencyKey: `casino:blackjack:wager:${input.handKey}`,
      });

      const deck = shuffledDeck();
      // Player, dealer up, player, dealer hole — the order a table deals in.
      const playerCards: Card[] = [deck[0] as Card, deck[2] as Card];
      const dealerCards: Card[] = [deck[1] as Card, deck[3] as Card];
      const at = now();

      const playerNatural = isNaturalHand(playerCards);
      const dealerNatural = isNaturalHand(dealerCards);

      /*
       * Naturals settle at the deal and never become an open hand.
       *
       * That is a rule of the game and it is also what makes the abandonment
       * ruling coherent: a natural cannot be left open to be force-settled
       * later, because it was never open.
       */
      let outcome: Outcome | null = null;
      if (playerNatural && dealerNatural) outcome = 'push';
      else if (playerNatural) outcome = 'player_natural';
      else if (dealerNatural) outcome = 'dealer_natural';

      let payoutTxId: string | null = null;
      let payout: number | null = null;

      if (outcome !== null) {
        payout = payoutFor(outcome, input.wager, rules);
        if (payout > 0) {
          payoutTxId = await applyTokenDelta(tx, {
            userId: input.userId,
            seasonId,
            amount: payout,
            reason: 'CASINO_PAYOUT',
            description: descriptionFor(outcome),
            // The **hand** is the occasion. A hand settles once, so this needs no
            // caller-supplied key — the argument `stake_resolutions` makes.
            idempotencyKey: `casino:blackjack:payout:${input.handKey}`,
          });
        }
      }

      const written = await tx
        .insert(blackjackHands)
        .values({
          userId: input.userId,
          seasonId,
          handKey: input.handKey,
          wagerTokens: input.wager,
          tableVersion: version,
          deck,
          deckPosition: 4,
          playerCards,
          dealerCards,
          revision: 0,
          status: outcome === null ? 'OPEN' : 'SETTLED',
          outcome,
          settledBy: outcome === null ? null : 'player',
          payoutTokens: payout,
          wagerTxId,
          payoutTxId,
          createdAt: at,
          updatedAt: at,
          settledAt: outcome === null ? null : at,
        })
        .returning(HAND_COLUMNS);

      const row = written[0];
      if (row === undefined) throw new Error('the hand was not recorded');

      return { status: 'dealt' as const, hand: view(row), replayed: false };
    });
  } catch (error: unknown) {
    if (isBalanceViolation(error)) {
      return { status: 'refused', reason: 'insufficient_tokens' };
    }
    /*
     * The partial unique index refusing a second open hand. Reached when two
     * deals with *different* keys race — the one that loses is not an error to
     * surface, it is a manager who already has a hand going.
     */
    if (hasConstraint(error, '23505', 'blackjack_hands_one_open_per_user')) {
      return { status: 'refused', reason: 'hand_in_progress' };
    }
    throw error;
  }
}

/* -------------------------------------------------------------- the turn -- */

export async function act(
  db: Database,
  input: {
    readonly userId: string;
    readonly handId: string;
    readonly action: 'hit' | 'stand';
    /** The revision the player was looking at. */
    readonly expectedRevision: number;
    /** Names this attempt. A retry of it resolves to the committed result. */
    readonly actionKey: string;
  },
): Promise<ActResult> {
  const { rules } = await blackjackRulesFor(db);

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`casino:${input.userId}`})::bigint)`,
    );

    const locked = await tx
      .select(HAND_COLUMNS)
      .from(blackjackHands)
      .where(and(eq(blackjackHands.id, input.handId), eq(blackjackHands.userId, input.userId)))
      .for('update');

    const hand = locked[0];
    // Not found and not-yours are one answer: probing hand ids teaches nothing.
    if (hand === undefined) return { status: 'refused' as const, reason: 'not_found' as const };

    /*
     * **The idempotency check comes before the revision check**, and the order
     * is the whole point.
     *
     * A committed action whose response was lost is retried by the client with
     * the revision it still believes in — which is now stale by exactly one. If
     * the revision were checked first, every lost response would surface as a
     * confusing "somebody else moved" instead of the committed result. So a key
     * this hand has already seen resolves to the current state, whatever the
     * revision says.
     */
    const replayed = await tx
      .select({ id: blackjackActions.id })
      .from(blackjackActions)
      .where(
        and(
          eq(blackjackActions.actionKey, input.actionKey),
          eq(blackjackActions.handId, hand.id),
        ),
      )
      .limit(1);

    if (replayed[0] !== undefined) {
      return { status: 'ok' as const, hand: view(hand), replayed: true };
    }

    if (hand.status === 'SETTLED') {
      return {
        status: 'refused' as const,
        reason: 'already_settled' as const,
        hand: view(hand),
      };
    }

    /*
     * The stale tab. Tab A hit and the revision moved; Tab B is still looking at
     * the hand before that card. Its action is refused and the current hand comes
     * back with it, so the tab can show what actually happened rather than
     * quietly applying a decision to a state the player never saw.
     */
    if (hand.revision !== input.expectedRevision) {
      return { status: 'refused' as const, reason: 'stale' as const, hand: view(hand) };
    }

    const at = now();
    let playerCards = [...hand.playerCards];
    let dealerCards = [...hand.dealerCards];
    let position = hand.deckPosition;
    let drawn: Card | null = null;
    let outcome: Outcome | null = null;

    if (input.action === 'hit') {
      const card = hand.deck[position];
      if (card === undefined) throw new Error('the deck ran out mid-hand');
      drawn = card;
      playerCards = [...playerCards, card];
      position += 1;

      // Twenty-two and over ends it where the player stands. The dealer, who
      // has already won, does not draw.
      if (totalOf(playerCards).total > 21) outcome = 'bust';
    } else {
      const dealer = runDealer(dealerCards, hand.deck, position, rules);
      dealerCards = dealer.cards;
      position = dealer.position;
      outcome = compare(totalOf(playerCards).total, totalOf(dealerCards).total);
    }

    const settlement = await settle(tx, {
      handId: hand.id,
      userId: hand.userId,
      seasonId: hand.seasonId,
      wager: hand.wagerTokens,
      outcome,
      rules,
      settledBy: 'player',
    });

    const updated = await tx
      .update(blackjackHands)
      .set({
        playerCards,
        dealerCards,
        deckPosition: position,
        revision: hand.revision + 1,
        updatedAt: at,
        ...(outcome === null
          ? {}
          : {
              status: 'SETTLED' as const,
              outcome,
              settledBy: 'player' as const,
              payoutTokens: settlement.payout,
              payoutTxId: settlement.payoutTxId,
              settledAt: at,
            }),
      })
      .where(eq(blackjackHands.id, hand.id))
      .returning(HAND_COLUMNS);

    await tx.insert(blackjackActions).values({
      handId: hand.id,
      actionKey: input.actionKey,
      action: input.action,
      appliedAtRevision: hand.revision,
      card: drawn,
      createdAt: at,
    });

    const row = updated[0];
    if (row === undefined) throw new Error('the hand did not update');

    return { status: 'ok' as const, hand: view(row), replayed: false };
  });
}

/**
 * Pay a settled hand, or pay nothing.
 *
 * Split out because the deal, the turn and season close all need it and all
 * three must derive the same key: the **hand id**, because a hand settles once
 * and therefore has a natural key. A caller-supplied one would let a retry pay
 * twice under two names.
 */
async function settle(
  tx: Queryable,
  input: {
    readonly handId: string;
    readonly userId: string;
    readonly seasonId: string;
    readonly wager: number;
    readonly outcome: Outcome | null;
    readonly rules: BlackjackRules;
    readonly settledBy: 'player' | 'season_close';
  },
): Promise<{ payout: number | null; payoutTxId: string | null }> {
  if (input.outcome === null) return { payout: null, payoutTxId: null };

  const payout = payoutFor(input.outcome, input.wager, input.rules);
  if (payout === 0) return { payout: 0, payoutTxId: null };

  const payoutTxId = await applyTokenDelta(tx, {
    userId: input.userId,
    seasonId: input.seasonId,
    amount: payout,
    reason: 'CASINO_PAYOUT',
    description: descriptionFor(input.outcome),
    idempotencyKey: `casino:blackjack:payout:${input.handId}`,
    sourceRef: input.handId,
  });

  return { payout, payoutTxId };
}

/** Curated, never generated (`16 §10`). One line per way a hand can pay. */
function descriptionFor(outcome: Outcome): string {
  switch (outcome) {
    case 'player_natural':
      return 'Blackjack at the table downstairs.';
    case 'win':
      return 'A winning hand downstairs.';
    case 'push':
      return 'A push downstairs — the wager comes back.';
    case 'dealer_natural':
    case 'loss':
    case 'bust':
      return 'The table downstairs keeps it.';
  }
}

/* ------------------------------------------------------------ resume/read -- */

/** The hand a manager walks back to, or nothing. **This is the resume state.** */
export async function openHand(db: Queryable, userId: string): Promise<HandView | null> {
  const rows = await db
    .select(HAND_COLUMNS)
    .from(blackjackHands)
    .where(and(eq(blackjackHands.userId, userId), eq(blackjackHands.status, 'OPEN')))
    .limit(1);

  const row = rows[0];
  return row === undefined ? null : view(row);
}

/**
 * A manager's own recent hands.
 *
 * **Theirs only.** R10 makes casino history private in v1, and there is
 * deliberately no function in this module that reads anybody else's.
 */
export async function recentHands(
  db: Queryable,
  userId: string,
  limit = 5,
): Promise<readonly { outcome: Outcome; wager: number; payout: number; at: Date }[]> {
  const rows = await db
    .select({
      outcome: blackjackHands.outcome,
      wager: blackjackHands.wagerTokens,
      payout: blackjackHands.payoutTokens,
      at: blackjackHands.settledAt,
    })
    .from(blackjackHands)
    .where(and(eq(blackjackHands.userId, userId), eq(blackjackHands.status, 'SETTLED')))
    .orderBy(desc(blackjackHands.settledAt))
    .limit(limit);

  return rows.flatMap((row) =>
    row.outcome === null || row.payout === null || row.at === null
      ? []
      : [{ outcome: row.outcome, wager: row.wager, payout: row.payout, at: row.at }],
  );
}

/* ----------------------------------------------------------- season close -- */

/**
 * Stand every open hand and settle it, because the books are about to shut.
 *
 * **Commissioner ruling, 2026-08-12.** An abandoned hand is *not* refunded —
 * that would be a free option: deal, look at sixteen, walk away, and eventually
 * get the wager back. Instead the player is stood on whatever they were holding
 * and the dealer runs normally. Deterministic, and it gives the abandoning
 * player exactly the hand they already had.
 *
 * **It must run inside the closing transaction, before `finalized_at` is set.**
 * `apply_token_delta` refuses a finalized season, so a payout written after the
 * close would be impossible and the hand would be stranded open forever — with
 * `blackjack_hands_one_open_per_user` then jamming that seat permanently. The
 * caller in `finalizeSeason` holds both.
 *
 * Neither a bust nor a natural can be here: both settle the moment they happen.
 */
export async function settleOpenHandsAtSeasonClose(
  tx: Queryable,
  seasonId: string,
): Promise<number> {
  /*
   * The hands come first, and the rules are only read if there are any.
   *
   * `blackjackRulesFor` throws on a database that has never seeded the casino —
   * deliberately, because a table that dealt against unstored rules would be
   * unauditable. But **every** season close calls this, including on databases
   * where the Underground has never existed: the historical import closes 2024
   * and 2025, and the rehearsal harnesses close their own seasons. Reading the
   * rules unconditionally made closing a season depend on the casino being
   * seeded, which is a coupling nothing asked for.
   *
   * Found by the suite rather than by reading: nine tests across
   * `persist.test.ts` and `week-16.test.ts` went red the moment this was wired
   * in. A season with no open hands needs no rules, and now does not ask for
   * any.
   */
  const open = await tx
    .select(HAND_COLUMNS)
    .from(blackjackHands)
    .where(and(eq(blackjackHands.seasonId, seasonId), eq(blackjackHands.status, 'OPEN')))
    .for('update');

  if (open.length === 0) return 0;

  const { rules } = await blackjackRulesFor(tx);
  const at = now();
  let settled = 0;

  for (const hand of open) {
    const dealer = runDealer(hand.dealerCards, hand.deck, hand.deckPosition, rules);
    const outcome = compare(totalOf(hand.playerCards).total, totalOf(dealer.cards).total);

    const settlement = await settle(tx, {
      handId: hand.id,
      userId: hand.userId,
      seasonId,
      wager: hand.wagerTokens,
      outcome,
      rules,
      settledBy: 'season_close',
    });

    await tx
      .update(blackjackHands)
      .set({
        dealerCards: dealer.cards,
        deckPosition: dealer.position,
        revision: hand.revision + 1,
        status: 'SETTLED',
        outcome,
        settledBy: 'season_close',
        payoutTokens: settlement.payout,
        payoutTxId: settlement.payoutTxId,
        settledAt: at,
        updatedAt: at,
      })
      .where(eq(blackjackHands.id, hand.id));

    settled += 1;
  }

  return settled;
}
