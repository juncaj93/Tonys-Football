'use server';

import { requireUser } from '@/lib/auth/current-user';
import { getDb } from '@/lib/db';
import { placeEntry } from '@/lib/stakes/service';
import { SIDES, type Side } from '@/lib/stakes/model';

/**
 * Taking a side on Tony's Line.
 *
 * ## The client sends a side and receives a result
 *
 * That is the whole protocol. No line is sent up, no payout is sent down, and
 * nothing the browser says can change what a pick is worth: the stake, the
 * multiplier and the eligibility snapshot are all read from the stored row on
 * the server, and `weekly_stakes_line_pays_double` enforces the multiplier in the
 * database underneath that.
 *
 * `18 §4.3`'s rule for the loot box — *the client never decides a reward* — is
 * the same rule here, and it matters more: a box is a roll, and this is a claim
 * about a result that has not happened.
 *
 * ## No idempotency token, because a pick has a natural key
 *
 * `buy-box.tsx` mints one per attempt, and the reasoning there is that "add
 * tokens" is an event with no natural key — a manager may legitimately buy two
 * boxes. A pick is the opposite: `UNIQUE(stake_id, user_id)` means a manager has
 * exactly one on a given market, forever, so a double tap collapses by itself and
 * the ledger key is derived from the pair. Copying the token pattern here would
 * be ceremony around a constraint that already exists — the distinction `0004`
 * and `0005` were careful to keep.
 *
 * ## Authorization is the same single layer as everything else
 *
 * `requireUser()` first, and eligibility is then checked against the **stored
 * snapshot** rather than a live query. A manager not on that list gets the same
 * answer as one asking about a stake that does not exist.
 */

export type PickResult =
  | { readonly ok: true; readonly side: Side; readonly staked: number }
  | { readonly ok: false; readonly reason: 'closed' | 'not_eligible' | 'already' | 'broke' };

function isSide(value: string): value is Side {
  return (SIDES as readonly string[]).includes(value);
}

/**
 * A stake id is a UUID or it is not a stake.
 *
 * Checked **before** the database sees it, and this is a real refusal rather than
 * tidiness: `eq(weeklyStakes.id, 'preview:2025-w09-season-median')` raises
 * *invalid input syntax for type uuid* inside Postgres, which reaches the browser
 * as a 500 and a full-page `Application error`. Anything a client can send has to
 * come back as an answer, not as a crash.
 *
 * Found by building the demo state for the market's error affordance: a previewed
 * board carries a `preview:` id, tapping OVER on it took the whole page down, and
 * the screenshot of *"how does a refusal look"* was a server exception.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function pickSideAction(stakeId: string, side: string): Promise<PickResult> {
  const { user } = await requireUser();
  if (!isSide(side)) return { ok: false, reason: 'closed' };
  if (!UUID.test(stakeId)) return { ok: false, reason: 'closed' };

  const result = await placeEntry(getDb(), { stakeId, userId: user.id, side });

  switch (result.status) {
    case 'placed':
      return { ok: true, side: result.side, staked: result.staked };
    case 'already_placed':
      return { ok: false, reason: 'already' };
    case 'not_eligible':
      return { ok: false, reason: 'not_eligible' };
    case 'insufficient_tokens':
      return { ok: false, reason: 'broke' };
    case 'closed':
      return { ok: false, reason: 'closed' };
  }
}
