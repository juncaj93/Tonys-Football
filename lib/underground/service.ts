import { and, eq, sql } from 'drizzle-orm';

import { now } from '@/lib/clock';
import { applyTokenDelta } from '@/lib/counter/tokens';
import { type Database } from '@/lib/db';
import { casinoRounds } from '@/lib/db/schema';

import {
  blackjackPayout,
  cardLabel,
  dealBlackjack,
  handValue,
  hit,
  isBlackjack,
  settleBlackjack,
  slotMultiplier,
  spinSlots,
  rouletteMultiplier,
  spinRoulette,
  type BlackjackOutcome,
  type BlackjackState,
  type RouletteBet,
  type RouletteState,
  type SlotsState,
} from './game';
import { UNDERGROUND_WAGERS, type CasinoView, type UndergroundWager } from './model';

export { UNDERGROUND_WAGERS } from './model';
export type { CasinoView } from './model';

function isWager(value: number): value is UndergroundWager {
  return (UNDERGROUND_WAGERS as readonly number[]).includes(value);
}

function isBalanceViolation(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const postgres = error as { code?: unknown; constraint?: unknown; message?: unknown };
    if (
      postgres.code === '23514' &&
      postgres.constraint === 'season_memberships_token_balance_non_negative'
    ) {
      return true;
    }
    if (typeof postgres.message === 'string' && postgres.message.includes('token_balance')) return true;
  }
  return String(error).includes('insufficient token balance');
}

function blackjackView(
  row: { id: string; wager: number; status: 'OPEN' | 'SETTLED'; payout: number | null; state: unknown },
): CasinoView {
  const state = row.state as BlackjackState & { outcome?: BlackjackOutcome };
  const settled = row.status === 'SETTLED';
  const dealer = settled ? state.dealer : state.dealer.slice(0, 1);
  return {
    id: row.id,
    game: 'BLACKJACK',
    wager: row.wager,
    settled,
    payout: row.payout,
    player: state.player.map(cardLabel),
    playerValue: handValue(state.player),
    dealer: dealer.map(cardLabel),
    dealerValue: settled ? handValue(state.dealer) : null,
    outcome: settled ? state.outcome ?? null : null,
  };
}

function slotsView(row: { id: string; wager: number; payout: number | null; state: unknown }): CasinoView {
  const state = row.state as SlotsState;
  return {
    id: row.id,
    game: 'SLOTS',
    wager: row.wager,
    settled: true,
    payout: row.payout ?? 0,
    reels: state.reels,
  };
}

function rouletteView(row: { id: string; wager: number; payout: number | null; state: unknown }): CasinoView {
  const state = row.state as RouletteState;
  return {
    id: row.id,
    game: 'ROULETTE',
    wager: row.wager,
    settled: true,
    payout: row.payout ?? 0,
    pocket: state.pocket,
    color: state.color,
    bet: state.bet,
  };
}

async function settle(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  input: {
    readonly id: string;
    readonly userId: string;
    readonly seasonId: string;
    readonly state: BlackjackState;
    readonly wager: number;
    readonly outcome: BlackjackOutcome;
  },
): Promise<CasinoView> {
  const payout = blackjackPayout(input.wager, input.outcome);
  const resolvedState = { ...input.state, outcome: input.outcome };
  const [row] = await tx
    .update(casinoRounds)
    .set({ status: 'SETTLED', state: resolvedState, payout, resolvedAt: now() })
    .where(eq(casinoRounds.id, input.id))
    .returning();
  if (row === undefined) throw new Error('casino round disappeared during settlement');

  if (payout > 0) {
    await applyTokenDelta(tx, {
      userId: input.userId,
      seasonId: input.seasonId,
      amount: payout,
      reason: 'CASINO_PAYOUT',
      description: input.outcome === 'PUSH' ? 'Blackjack push — stake returned' : 'Blackjack payout',
      idempotencyKey: `casino:payout:${input.id}`,
      sourceRef: input.id,
    });
  }
  return blackjackView(row);
}

/** Start a fully resolved three-reel slot round. */
export async function playSlots(
  db: Database,
  input: { readonly userId: string; readonly seasonId: string; readonly wager: number; readonly requestKey: string },
): Promise<{ readonly ok: true; readonly round: CasinoView } | { readonly ok: false; readonly reason: 'invalid' | 'insufficient' }> {
  if (!isWager(input.wager)) return { ok: false, reason: 'invalid' };

  try {
    return await db.transaction(async (tx) => {
      const replay = await tx
        .select()
        .from(casinoRounds)
        .where(and(eq(casinoRounds.requestKey, input.requestKey), eq(casinoRounds.userId, input.userId)))
        .limit(1);
      if (replay[0] !== undefined) return { ok: true as const, round: slotsView(replay[0]) };

      const state = spinSlots();
      const payout = input.wager * slotMultiplier(state);
      const [round] = await tx
        .insert(casinoRounds)
        .values({
          userId: input.userId,
          seasonId: input.seasonId,
          game: 'SLOTS',
          status: 'OPEN',
          wager: input.wager,
          state,
          requestKey: input.requestKey,
          createdAt: now(),
        })
        .returning();
      if (round === undefined) throw new Error('casino round was not created');

      await applyTokenDelta(tx, {
        userId: input.userId,
        seasonId: input.seasonId,
        amount: -input.wager,
        reason: 'CASINO_WAGER',
        description: 'Slots wager',
        idempotencyKey: `casino:wager:${round.id}`,
        sourceRef: round.id,
      });

      const [settled] = await tx
        .update(casinoRounds)
        .set({ status: 'SETTLED', payout, resolvedAt: now() })
        .where(eq(casinoRounds.id, round.id))
        .returning();
      if (settled === undefined) throw new Error('slots round was not settled');

      if (payout > 0) {
        await applyTokenDelta(tx, {
          userId: input.userId,
          seasonId: input.seasonId,
          amount: payout,
          reason: 'CASINO_PAYOUT',
          description: 'Slots payout',
          idempotencyKey: `casino:payout:${round.id}`,
          sourceRef: round.id,
        });
      }
      return { ok: true as const, round: slotsView(settled) };
    });
  } catch (error) {
    if (isBalanceViolation(error)) return { ok: false, reason: 'insufficient' };
    throw error;
  }
}

/** Spin one fully resolved, single-zero roulette round. */
export async function playRoulette(
  db: Database,
  input: {
    readonly userId: string;
    readonly seasonId: string;
    readonly wager: number;
    readonly bet: RouletteBet;
    readonly requestKey: string;
  },
): Promise<{ readonly ok: true; readonly round: CasinoView } | { readonly ok: false; readonly reason: 'invalid' | 'insufficient' }> {
  if (!isWager(input.wager)) return { ok: false, reason: 'invalid' };

  try {
    return await db.transaction(async (tx) => {
      const replay = await tx
        .select()
        .from(casinoRounds)
        .where(and(eq(casinoRounds.requestKey, input.requestKey), eq(casinoRounds.userId, input.userId)))
        .limit(1);
      if (replay[0] !== undefined) return { ok: true as const, round: rouletteView(replay[0]) };

      const state = spinRoulette(input.bet);
      const payout = input.wager * rouletteMultiplier(state);
      const [round] = await tx
        .insert(casinoRounds)
        .values({
          userId: input.userId,
          seasonId: input.seasonId,
          game: 'ROULETTE',
          status: 'OPEN',
          wager: input.wager,
          state,
          requestKey: input.requestKey,
          createdAt: now(),
        })
        .returning();
      if (round === undefined) throw new Error('roulette round was not created');

      await applyTokenDelta(tx, {
        userId: input.userId,
        seasonId: input.seasonId,
        amount: -input.wager,
        reason: 'CASINO_WAGER',
        description: 'Roulette wager',
        idempotencyKey: `casino:wager:${round.id}`,
        sourceRef: round.id,
      });

      const [settled] = await tx
        .update(casinoRounds)
        .set({ status: 'SETTLED', payout, resolvedAt: now() })
        .where(eq(casinoRounds.id, round.id))
        .returning();
      if (settled === undefined) throw new Error('roulette round was not settled');

      if (payout > 0) {
        await applyTokenDelta(tx, {
          userId: input.userId,
          seasonId: input.seasonId,
          amount: payout,
          reason: 'CASINO_PAYOUT',
          description: state.bet.kind === 'NUMBER' ? 'Roulette straight-up payout' : 'Roulette colour payout',
          idempotencyKey: `casino:payout:${round.id}`,
          sourceRef: round.id,
        });
      }
      return { ok: true as const, round: rouletteView(settled) };
    });
  } catch (error) {
    if (isBalanceViolation(error)) return { ok: false, reason: 'insufficient' };
    if (String(error).includes('invalid roulette bet')) return { ok: false, reason: 'invalid' };
    throw error;
  }
}

/** Deal a blackjack hand. A natural resolves immediately; otherwise it persists open. */
export async function startBlackjack(
  db: Database,
  input: { readonly userId: string; readonly seasonId: string; readonly wager: number; readonly requestKey: string },
): Promise<{ readonly ok: true; readonly round: CasinoView } | { readonly ok: false; readonly reason: 'invalid' | 'insufficient' }> {
  if (!isWager(input.wager)) return { ok: false, reason: 'invalid' };

  try {
    return await db.transaction(async (tx) => {
      const replay = await tx
        .select()
        .from(casinoRounds)
        .where(and(eq(casinoRounds.requestKey, input.requestKey), eq(casinoRounds.userId, input.userId)))
        .limit(1);
      if (replay[0] !== undefined) return { ok: true as const, round: blackjackView(replay[0]) };

      const state = dealBlackjack();
      const [round] = await tx
        .insert(casinoRounds)
        .values({
          userId: input.userId,
          seasonId: input.seasonId,
          game: 'BLACKJACK',
          status: 'OPEN',
          wager: input.wager,
          state,
          requestKey: input.requestKey,
          createdAt: now(),
        })
        .returning();
      if (round === undefined) throw new Error('casino round was not created');

      await applyTokenDelta(tx, {
        userId: input.userId,
        seasonId: input.seasonId,
        amount: -input.wager,
        reason: 'CASINO_WAGER',
        description: 'Blackjack wager',
        idempotencyKey: `casino:wager:${round.id}`,
        sourceRef: round.id,
      });

      const playerNatural = isBlackjack(state.player);
      const dealerNatural = isBlackjack(state.dealer);
      if (!playerNatural && !dealerNatural) return { ok: true as const, round: blackjackView(round) };
      const outcome: BlackjackOutcome = playerNatural && dealerNatural ? 'PUSH' : playerNatural ? 'BLACKJACK' : 'LOSS';
      return { ok: true as const, round: await settle(tx, { ...round, userId: input.userId, seasonId: input.seasonId, state, outcome }) };
    });
  } catch (error) {
    if (isBalanceViolation(error)) return { ok: false, reason: 'insufficient' };
    throw error;
  }
}

/** Hit or stand an already-dealt hand. There is no client deck and no re-roll. */
export async function playBlackjack(
  db: Database,
  input: { readonly userId: string; readonly roundId: string; readonly action: 'HIT' | 'STAND' },
): Promise<{ readonly ok: true; readonly round: CasinoView } | { readonly ok: false; readonly reason: 'unavailable' }> {
  return db.transaction(async (tx) => {
    /*
     * A hand is a sequence, not an idempotent one-shot like a slot spin. Lock
     * before reading the deck: two fast HIT taps must serialize rather than both
     * drawing the same next card from an identical snapshot.
     */
    const locked = await tx.execute<{
      id: string;
      user_id: string;
      season_id: string;
      game: 'BLACKJACK' | 'SLOTS' | 'ROULETTE';
      status: 'OPEN' | 'SETTLED';
      wager: number;
      state: unknown;
      payout: number | null;
    }>(sql`
      select id, user_id, season_id, game, status, wager, state, payout
      from casino_rounds
      where id = ${input.roundId}::uuid and user_id = ${input.userId}::uuid
      for update
    `);
    const round = (locked as unknown as { rows: readonly {
      id: string;
      user_id: string;
      season_id: string;
      game: 'BLACKJACK' | 'SLOTS' | 'ROULETTE';
      status: 'OPEN' | 'SETTLED';
      wager: number;
      state: unknown;
      payout: number | null;
    }[] }).rows[0];
    if (round === undefined || round.game !== 'BLACKJACK') return { ok: false, reason: 'unavailable' };
    const lockedRound = {
      id: round.id,
      userId: round.user_id,
      seasonId: round.season_id,
      game: round.game,
      status: round.status,
      wager: round.wager,
      state: round.state,
      payout: round.payout,
    };
    if (lockedRound.status === 'SETTLED') return { ok: true, round: blackjackView(lockedRound) };

    const state = lockedRound.state as BlackjackState;
    const afterHit = input.action === 'HIT' ? hit(state) : state;
    if (input.action === 'HIT' && handValue(afterHit.player) < 22) {
      const [saved] = await tx
        .update(casinoRounds)
        .set({ state: afterHit })
        .where(eq(casinoRounds.id, lockedRound.id))
        .returning();
      if (saved === undefined) throw new Error('blackjack hand was not saved');
      return { ok: true, round: blackjackView(saved) };
    }

    const settled = settleBlackjack(afterHit);
    return {
      ok: true,
      round: await settle(tx, {
        id: lockedRound.id,
        userId: input.userId,
        seasonId: lockedRound.seasonId,
        wager: lockedRound.wager,
        state: settled.state,
        outcome: settled.outcome,
      }),
    };
  });
}
