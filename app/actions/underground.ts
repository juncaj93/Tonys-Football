'use server';

import { requireUser } from '@/lib/auth/current-user';
import { openSeason } from '@/lib/counter/tokens';
import { getDb } from '@/lib/db';
import { playBlackjack, playSlots, startBlackjack, type CasinoView } from '@/lib/underground/service';

export type UndergroundResponse =
  | { readonly ok: true; readonly round: CasinoView }
  | { readonly ok: false; readonly reason: 'unavailable' | 'insufficient' | 'invalid' };

function validToken(value: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(value);
}

export async function spinSlotsAction(wager: number, requestToken: string): Promise<UndergroundResponse> {
  const { user } = await requireUser();
  if (!validToken(requestToken)) return { ok: false, reason: 'invalid' };
  const db = getDb();
  const season = await openSeason(db);
  if (season === null) return { ok: false, reason: 'unavailable' };
  return playSlots(db, { userId: user.id, seasonId: season.id, wager, requestKey: `slots:${user.id}:${requestToken}` });
}

export async function dealBlackjackAction(wager: number, requestToken: string): Promise<UndergroundResponse> {
  const { user } = await requireUser();
  if (!validToken(requestToken)) return { ok: false, reason: 'invalid' };
  const db = getDb();
  const season = await openSeason(db);
  if (season === null) return { ok: false, reason: 'unavailable' };
  return startBlackjack(db, { userId: user.id, seasonId: season.id, wager, requestKey: `blackjack:${user.id}:${requestToken}` });
}

export async function blackjackAction(roundId: string, action: 'HIT' | 'STAND'): Promise<UndergroundResponse> {
  const { user } = await requireUser();
  if (!validToken(roundId) || (action !== 'HIT' && action !== 'STAND')) {
    return { ok: false, reason: 'invalid' };
  }
  return playBlackjack(getDb(), { userId: user.id, roundId, action });
}
