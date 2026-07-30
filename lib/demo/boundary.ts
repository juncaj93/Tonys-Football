import { notLike, or, isNull, type SQL } from 'drizzle-orm';

import { users } from '@/lib/db/schema';

import { DEMO_PREFIX } from './guard';

/**
 * Keeping demo seats out of claims the product makes about the league.
 *
 * `MANDATE §8` asks for the demo system to stay distinct at the storage, the
 * service **and the UI** boundaries. The first two were built with the appliers.
 * This is the third, and it exists because the second visual-QA run after the
 * fixtures landed put **"5 of 14 managers have picked up their keys"** on the
 * Tonight board — a false statement about a ten-person league, produced by four
 * demo seats being counted as people in it.
 *
 * ## Which surfaces this applies to, and which it deliberately does not
 *
 * The rule is not "hide demo seats everywhere". It is **a demo seat is never
 * part of a claim about the league**:
 *
 * - **Applies** to counts, rosters, walls and standings — anything that asserts
 *   who the league *is*. A demo manager in there is a lie in the product's own
 *   voice.
 * - **Does not apply** to the door. A seat nobody can sign in as is not a demo,
 *   and the door is not a claim about the league — it is a list of ways in. In
 *   production the list is identical either way, because a demo seat cannot
 *   exist there (`guard.ts`).
 *
 * ## Why a shared predicate rather than a filter at each site
 *
 * There are four surfaces today and there will be more. A filter written out at
 * each one is a rule that holds until somebody adds the fifth surface and does
 * not know the rule exists — which is exactly how the keys line got it wrong,
 * because it was written before demo seats could exist at all.
 */

/**
 * True for a seat that belongs to a real manager.
 *
 * `sleeper_user_id` is nullable — a historical manager imported from an old
 * season may never have claimed — so the null case is explicitly a *real*
 * manager rather than being swallowed by the `NOT LIKE`, which in SQL yields
 * null for a null input and would quietly drop them.
 */
export function notADemoSeat(): SQL {
  const predicate = or(
    isNull(users.sleeperUserId),
    notLike(users.sleeperUserId, `${DEMO_PREFIX}%`),
  );
  if (predicate === undefined) throw new Error('the demo-seat predicate built to nothing');
  return predicate;
}
