'use server';

import { requireUser } from '@/lib/auth/current-user';
import { spin, type SpinRefusal } from '@/lib/casino/slots';
import { openSeason } from '@/lib/counter/tokens';
import { getDb } from '@/lib/db';
import { featureFlags } from '@/lib/flags';

/**
 * Pulling the handle.
 *
 * ## The client sends a stake and a token, and receives what happened
 *
 * `18 §4.3` and `09 §12`: **the client never decides an outcome.** No symbols go
 * up, no paytable comes down, and the browser has no way to influence the reels
 * — it cannot even see the strip. The reels animate onto a result the server has
 * already committed to the database.
 *
 * ## The idempotency key is namespaced server-side, and that is a security property
 *
 * The client supplies a random token per attempt, so a double-tapped handle
 * sends the same one and wagers once, while a deliberate second pull sends a new
 * one. But the key that reaches the database is `casino:slots:<userId>:<token>`,
 * built **here**, from the session's own user id.
 *
 * If the client's token were used raw, a manager could send a key that collided
 * with another manager's spin or with a real ledger row. `apply_token_delta`'s
 * replay guard would raise rather than silently no-op, so nothing could actually
 * be stolen — but the request would fail confusingly instead of being
 * impossible. Namespacing makes the whole class unreachable. Exactly the
 * argument `buyBoxAction` makes, applied to money moving the other way.
 *
 * ## The flag is checked here as well as at the route
 *
 * A server action is a public endpoint. It is reachable by anybody who can guess
 * its id, whether or not a page renders a button that calls it — so a shut
 * machine that only hid its UI would still take wagers. Both flags are required,
 * and in production both are `false`.
 */

export type SpinResponse =
  | {
      readonly ok: true;
      readonly symbols: readonly string[];
      readonly stake: number;
      readonly payout: number;
      readonly line: 'three' | 'pair' | 'nothing';
      /** The same pull, looked at twice. The client skips the anticipation beat. */
      readonly replayed: boolean;
    }
  | { readonly ok: false; readonly reason: SpinRefusal | 'unavailable' };

export async function spinAction(clientToken: string, stake: number): Promise<SpinResponse> {
  const { user } = await requireUser();

  const flags = featureFlags();
  if (!flags.underground || !flags.slotMachine) return { ok: false, reason: 'unavailable' };

  // A malformed token reaches the database as part of a key otherwise, and a
  // non-integer stake reaches a CHECK as a cast error — both are bad requests
  // rather than faults.
  if (!/^[0-9a-f-]{36}$/i.test(clientToken)) return { ok: false, reason: 'unavailable' };
  if (!Number.isSafeInteger(stake) || stake <= 0) return { ok: false, reason: 'unavailable' };

  const db = getDb();

  /*
   * The season the wager is charged against.
   *
   * Resolved here rather than inside the service, for the reason every seasonal
   * input in this project is injected: the caller knows which season is live,
   * and a service that looks it up itself is a service a test cannot put in
   * October. `null` is a real answer — the books are shut everywhere.
   */
  const season = await openSeason(db);

  const result = await spin(db, {
    userId: user.id,
    seasonId: season?.id ?? null,
    spinKey: `casino:slots:${user.id}:${clientToken}`,
    stake,
  });

  if (result.status === 'refused') return { ok: false, reason: result.reason };

  return {
    ok: true,
    symbols: result.spin.symbols,
    stake: result.spin.stake,
    payout: result.spin.payout,
    line: result.spin.line,
    replayed: result.spin.replayed,
  };
}
