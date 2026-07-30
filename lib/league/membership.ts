import { and, asc, desc, eq, type SQL } from 'drizzle-orm';

import { type Queryable } from '@/lib/db';
import { seasonMemberships, seasons, users } from '@/lib/db/schema';
import { notADemoSeat } from '@/lib/demo/boundary';

/**
 * Who is in this league — the single place the product is allowed to ask.
 *
 * **Commissioner ruling, 2026-07-30, absolute.** Armen, Shant and Berardo are
 * retired. They *never* appear in the current product as managers, members,
 * owners, opponents, selectable people or browsable identities — not labelled
 * "retired", not disabled, not behind an alumni page, not explained away with
 * text. From the navigable product's point of view they do not exist. The only
 * permitted use of their names is a rare cameo inside Tony's casual dialogue,
 * and that is the complete exception.
 *
 * ## This reverses a ruling I made earlier the same day
 *
 * PR #34 widened the door to the whole permanent record, on the reasoning that
 * `CLAUDE.md` separates permanent manager identity from seasonal roster identity
 * and that a person who owns collectibles is in the league. That reasoning was
 * mine and the commissioner has overruled it. **Permanent identity is a storage
 * concept, not a membership concept.** It keeps a row joinable and an audit
 * trail intact; it confers nothing visible.
 *
 * The correction is recorded rather than quietly applied — `docs/CHECKPOINT.md`
 * and the ruling index both said the opposite this morning, and a contradiction
 * left in the record comes back.
 *
 * ## Membership derives from an active seat, never from the existence of a row
 *
 * None of these makes anybody visible: a `users` row · an old season membership
 * · a welcome box · a token transaction · a collectible · a historical matchup ·
 * a seed entry · a cached object. Only `season_memberships.is_active` in the
 * current season does.
 *
 * ## One boundary, not scattered exclusions
 *
 * The ruling is explicit that this must not be solved with `name !== 'Armen'`
 * sprinkled through components. So there is one predicate, {@link activeSeat},
 * and one selector, {@link activeLeagueManagers}, and
 * `membership.test.ts` asserts the roster they produce is exactly the ten
 * approved names. A surface that forgets to use them fails that test the moment
 * it lists anybody.
 */

/**
 * The 2026 league, as approved.
 *
 * **Not the mechanism** — the mechanism is the seat. This is the assertion, and
 * it exists so that a seeding change, a stray membership row or a future import
 * cannot quietly alter who the product thinks plays here without a test going
 * red. Never filter on it.
 */
export const APPROVED_2026_ROSTER: readonly string[] = [
  'Alex',
  'Brandon',
  'Cheese',
  'Joe',
  'Matt Lee',
  'Matty B',
  'Nathan',
  'Nick',
  'Ryan',
  'Zack',
];

/**
 * Names Tony may say, and nothing more.
 *
 * A retired manager is **a name Tony remembers, not a product entity.** A cameo
 * carries no link, no avatar, no record, no collectible, no score, no account;
 * it never claims they currently play, and it never enters a Slice story,
 * standing, record, receipt or statistical summary.
 *
 * Listed here so the content pipeline can tell a permitted cameo from an
 * accidental reference to a live manager — see `content-cameo.test.ts`. It is
 * deliberately *not* a query filter: nothing selects rows by this list.
 */
export const CAMEO_ONLY_NAMES: readonly string[] = ['Armen', 'Shant', 'Berardo'];

export interface ActiveManager {
  readonly id: string;
  readonly displayName: string;
  /** Their seat this season. Seasonal, and meaningless across seasons. */
  readonly rosterId: number;
  /** Has set a PIN. */
  readonly claimed: boolean;
}

/**
 * The condition every current-league query must carry.
 *
 * Written as a predicate rather than a whole query because the surfaces need
 * different columns — the door wants roster ids, the Showcase wants collectibles
 * — and duplicating the *join* is fine while duplicating the *rule* is not.
 *
 * Callers must join `season_memberships` → `seasons` → `users` themselves and
 * pass the current year. Demo seats are excluded here too: they hold real
 * current-season seats so QA can sign in as them, and they are not people this
 * league has.
 */
export function activeSeat(year: number): SQL {
  const predicate = and(seatIsLive(year), notADemoSeat());
  if (predicate === undefined) throw new Error('the active-seat predicate built to nothing');
  return predicate;
}

/**
 * A live current-season seat, **demo seats included**.
 *
 * The one place this is right is the **door**, and the distinction is worth
 * stating because it looks like a hole and is not.
 *
 * `/door` is an *authentication* surface — a list of ways in — rather than a
 * claim about who the league is. A demo seat holds a real current-season seat
 * precisely so preview QA can sign in as it and photograph a state; a seat
 * nobody can sign in as is not a demo. And a demo seat **cannot exist in
 * production** (`lib/demo/guard.ts` refuses to create one there), so in the only
 * environment a manager ever sees, this and {@link activeSeat} return the same
 * ten people.
 *
 * Everything that makes a *claim* — the Showcase wall, standings, counts,
 * leaderboards, opponent pickers, published facts — uses {@link activeSeat}.
 * Nothing else may use this.
 *
 * The commissioner's retired-manager ruling is unaffected either way: Armen,
 * Shant and Berardo hold no live 2026 seat, so neither predicate reaches them.
 */
export function signInEligibleSeat(year: number): SQL {
  return seatIsLive(year);
}

function seatIsLive(year: number): SQL {
  const predicate = and(eq(seasons.year, year), eq(seasonMemberships.isActive, true));
  if (predicate === undefined) throw new Error('the live-seat predicate built to nothing');
  return predicate;
}

/** The newest season on record — the one whose seats are current. */
export async function currentSeasonYear(db: Queryable): Promise<number | null> {
  const [row] = await db
    .select({ year: seasons.year })
    .from(seasons)
    .orderBy(desc(seasons.year))
    .limit(1);
  return row?.year ?? null;
}

/**
 * Everyone in the league right now, in a stable order.
 *
 * The one answer. Every directory, selector, standings table, leaderboard,
 * opponent picker, filter and comparison reads this or a query carrying
 * {@link activeSeat} — never `SELECT * FROM users`.
 */
export async function activeLeagueManagers(db: Queryable): Promise<readonly ActiveManager[]> {
  return seatedManagers(db, activeSeat);
}

/**
 * Everyone who may sign in — the league, plus demo seats outside production.
 *
 * The door's list, and nothing else's. See {@link signInEligibleSeat}.
 */
export async function signInEligibleManagers(db: Queryable): Promise<readonly ActiveManager[]> {
  return seatedManagers(db, signInEligibleSeat);
}

async function seatedManagers(
  db: Queryable,
  predicate: (year: number) => SQL,
): Promise<readonly ActiveManager[]> {
  const year = await currentSeasonYear(db);
  if (year === null) return [];

  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      rosterId: seasonMemberships.rosterId,
      pinUpdatedAt: users.pinUpdatedAt,
    })
    .from(seasonMemberships)
    .innerJoin(seasons, eq(seasonMemberships.seasonId, seasons.id))
    .innerJoin(users, eq(seasonMemberships.userId, users.id))
    .where(predicate(year))
    .orderBy(asc(users.displayName));

  return rows.map((row) => ({
    id: row.id,
    displayName: row.displayName,
    rosterId: row.rosterId,
    claimed: row.pinUpdatedAt !== null,
  }));
}

/**
 * Is this person in the league right now?
 *
 * For the publication boundary in `lib/stats/` — a *fact* about a 2024 game may
 * name a retired manager, because it happened, but a **published** claim on a
 * current surface may not. The fact layer keeps the record; this decides whether
 * it is allowed to be spoken.
 */
export async function activeManagerIds(db: Queryable): Promise<ReadonlySet<string>> {
  return new Set((await activeLeagueManagers(db)).map((manager) => manager.id));
}
