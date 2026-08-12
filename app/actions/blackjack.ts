'use server';

import { requireUser } from '@/lib/auth/current-user';
import { act, deal, openHand, type HandView } from '@/lib/casino/blackjack';
import { openSeason } from '@/lib/counter/tokens';
import { getDb } from '@/lib/db';
import { featureFlags } from '@/lib/flags';

/**
 * The table, from the browser's side.
 *
 * ## The client sends a decision and receives a state
 *
 * It never sends a card, a total, a deck position, an outcome or a payout, and
 * there is no parameter here that could carry one. `09 §12` and `18 §4.3`: the
 * client never decides. What it *does* send — the revision it was looking at,
 * and a name for this attempt — is the opposite of authority: it is the client
 * telling the server what it believes, so the server can refuse it if it is
 * wrong.
 *
 * ## The flags are checked here, not only on the page
 *
 * A server action is a public endpoint. It is reachable by anybody who can guess
 * its id whether or not any page renders a button that calls it, so a shut table
 * that only hid its UI would still deal hands. Both flags are required and in
 * production both are `false`.
 *
 * ## Keys are namespaced server-side
 *
 * `casino:blackjack:<userId>:<token>`, built here from the session's own user
 * id. A raw client token could be crafted to collide with another manager's hand
 * or with a real ledger row; the ledger's replay guard would raise rather than
 * pay out, so nothing could be stolen — but the request would fail confusingly
 * instead of being impossible. The same argument `buyBoxAction` makes.
 */

/** What the browser is allowed to know. Deliberately `HandView`, which withholds the deck. */
export type TableResponse =
  | { readonly ok: true; readonly hand: HandView; readonly replayed?: boolean }
  | { readonly ok: true; readonly hand: null }
  | {
      readonly ok: false;
      readonly reason: string;
      /** On a stale or settled refusal, what the hand actually is now. */
      readonly hand?: HandView;
    };

const TOKEN = /^[0-9a-f-]{36}$/i;

/** The hand a manager walks back to. The whole of resume, and it is a plain read. */
export async function openHandAction(): Promise<TableResponse> {
  const { user } = await requireUser();

  const flags = featureFlags();
  if (!flags.underground || !flags.blackjackTable) return { ok: false, reason: 'unavailable' };

  const hand = await openHand(getDb(), user.id);
  return hand === null ? { ok: true, hand: null } : { ok: true, hand };
}

export async function dealAction(clientToken: string, wager: number): Promise<TableResponse> {
  const { user } = await requireUser();

  const flags = featureFlags();
  if (!flags.underground || !flags.blackjackTable) return { ok: false, reason: 'unavailable' };

  if (!TOKEN.test(clientToken)) return { ok: false, reason: 'unavailable' };
  if (!Number.isSafeInteger(wager) || wager <= 0) return { ok: false, reason: 'unavailable' };

  const db = getDb();
  // Resolved here rather than in the service, like every seasonal input in this
  // project. `null` is a real answer: the books are shut everywhere.
  const season = await openSeason(db);

  const result = await deal(db, {
    userId: user.id,
    seasonId: season?.id ?? null,
    handKey: `casino:blackjack:${user.id}:${clientToken}`,
    wager,
  });

  if (result.status === 'refused') return { ok: false, reason: result.reason };
  return { ok: true, hand: result.hand, replayed: result.replayed };
}

export async function actAction(
  handId: string,
  action: 'hit' | 'stand',
  expectedRevision: number,
  clientToken: string,
): Promise<TableResponse> {
  const { user } = await requireUser();

  const flags = featureFlags();
  if (!flags.underground || !flags.blackjackTable) return { ok: false, reason: 'unavailable' };

  if (!TOKEN.test(handId) || !TOKEN.test(clientToken)) return { ok: false, reason: 'unavailable' };
  if (action !== 'hit' && action !== 'stand') return { ok: false, reason: 'unavailable' };
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    return { ok: false, reason: 'unavailable' };
  }

  const result = await act(getDb(), {
    userId: user.id,
    handId,
    action,
    expectedRevision,
    actionKey: `casino:blackjack:${user.id}:${clientToken}`,
  });

  if (result.status === 'refused') {
    return result.hand === undefined
      ? { ok: false, reason: result.reason }
      : { ok: false, reason: result.reason, hand: result.hand };
  }
  return { ok: true, hand: result.hand, replayed: result.replayed };
}
