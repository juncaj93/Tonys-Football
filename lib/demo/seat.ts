import { randomInt } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

import { and, desc, eq, like } from 'drizzle-orm';

import { hashPin } from '@/lib/auth/pin';
import { now } from '@/lib/clock';
import { type Database } from '@/lib/db';
import { seasonMemberships, users } from '@/lib/db/schema';
import { openSeason } from '@/lib/counter/tokens';

import { DEMO_PREFIX, DemoRefused, assertDemoSeat } from './guard';

/**
 * The reserved seats demo states are applied to.
 *
 * Guard 2 in `guard.ts` says a demo may only ever address a seat whose Sleeper
 * id carries {@link DEMO_PREFIX}. This file is what creates those seats, and it
 * is the only thing that does.
 *
 * ## One seat per state, and that is what makes re-running safe
 *
 * The obvious design is a single demo manager that each state reconfigures. It
 * is also the design that needs a destructive reset, because "put this seat into
 * the *broke* state" has to first undo whatever the last state did — and undoing
 * means deleting a ledger, which is precisely what the product must never
 * permit.
 *
 * So instead **every state gets its own seat**, and every key the state writes —
 * the grant key of each box, the idempotency key of each token delta, the
 * purchase key — is derived from the state's name and the seat's generation.
 * Applying a state is then idempotent for free, through the same unique
 * constraints that make the real product idempotent: `grantBox` finds its
 * `grant_key`, `apply_token_delta` finds its `idempotency_key`, `openBox` finds
 * its box already opened. Running `demo apply pull-legendary` five times leaves
 * the database in exactly the state one run produced.
 *
 * That is a stronger claim than "the reset works". A demo that is idempotent
 * *because the product is* is evidence about the product.
 *
 * ## Reset retires, it never deletes
 *
 * `token_transactions` refuses `DELETE` — a trigger, for everyone, with no
 * exception for demos. A demo able to erase its own financial history would be
 * no evidence at all that the real one cannot, so the trigger keeps no back
 * door and this file does not ask for one.
 *
 * {@link retireDemoSeats} therefore **retires** a generation rather than
 * removing it: the seats are deactivated and their ids are suffixed
 * {@link RETIRED_SUFFIX}, which takes them out of the door list and out of every
 * lookup here. The next apply mints generation *n+1*. The truly clean slate is a
 * fresh database (`npm run db:reset`), which is a one-command operation and the
 * documented path.
 */

/** Appended to a retired seat's Sleeper id. Still `demo:`-prefixed, so guard 2 holds. */
export const RETIRED_SUFFIX = ':retired';

/**
 * Where demo roster slots start.
 *
 * Real Sleeper rosters in this league are 1–10 and `season_memberships` is
 * unique on `(season, roster_id)`, so demo seats need a range no import will
 * ever reach. Each generation takes its own hundred, because a retired seat
 * keeps its roster id forever.
 */
export const DEMO_ROSTER_BASE = 900;

/**
 * The PIN a demo seat is claimed with, for this machine only.
 *
 * ## Why this is no longer a constant
 *
 * It was a fixed six-digit constant, committed, with a note explaining that a
 * fixed PIN is safe
 * because a demo seat cannot exist in production. The reasoning held — and it
 * rested entirely on `lib/demo/guard.ts` being correct. Publishing the source
 * turns that from an internal assumption into a public one: the PIN becomes
 * common knowledge, and the only thing between it and a real league is a guard.
 *
 * Defence in depth means not needing the guard to be perfect. So the value is
 * **generated per machine** and never committed.
 *
 * ## Why generated rather than required
 *
 * Requiring an environment variable would have been simpler and worse: the demo
 * tooling is how every visual state is reviewed, and a demo you must configure
 * before you can look at anything is a demo that stops being run — which is how
 * screens stop being looked at. `DEMO_PIN` may still be set explicitly when a
 * stable value is wanted; absent one, a random PIN is minted, cached in a
 * gitignored file beside the other local-only state, and printed by the CLI that
 * needs it.
 *
 * Tests pin it explicitly so they stay deterministic, and the value they use is
 * obviously synthetic.
 */
const DEMO_PIN_CACHE = '.demo-pin.local';

export function demoPin(): string {
  const configured = process.env['DEMO_PIN'];
  if (configured !== undefined && /^\d{6}$/.test(configured)) return configured;

  try {
    const cached = readFileSync(DEMO_PIN_CACHE, 'utf8').trim();
    if (/^\d{6}$/.test(cached)) return cached;
  } catch {
    // No cache yet on this machine. Mint one below.
  }

  /*
   * `randomInt` rather than `Math.random`: this is a credential, however local,
   * and there is no reason to mint it from a predictable source.
   */
  const minted = String(randomInt(0, 1_000_000)).padStart(6, '0');
  try {
    writeFileSync(DEMO_PIN_CACHE, `${minted}\n`, { mode: 0o600 });
  } catch {
    // A read-only checkout still gets a working demo; it just gets a new PIN
    // each run, which the CLI prints.
  }
  return minted;
}

export interface DemoSeat {
  readonly userId: string;
  readonly displayName: string;
  readonly seasonId: string;
  readonly seasonYear: number;
  readonly membershipId: string;
  readonly generation: number;
  /** `demo:g0:pull-rare`. Every key this state writes is derived from it. */
  readonly sleeperUserId: string;
}

/** `demo:g3:pull-rare` — the reserved id for one state in one generation. */
export function demoSleeperId(stateKey: string, generation: number): string {
  return `${DEMO_PREFIX}g${String(generation)}:${stateKey}`;
}

/**
 * The generation a fresh apply belongs to.
 *
 * The highest generation that still has a live seat, or one past the highest
 * ever retired, or 0 in a database that has never seen a demo. Reading it from
 * the seats themselves means there is no counter to keep in sync — and no way
 * for a dropped database and a stale counter to disagree.
 */
export async function currentGeneration(db: Database): Promise<number> {
  const rows = await db
    .select({ sleeperUserId: users.sleeperUserId })
    .from(users)
    .where(like(users.sleeperUserId, `${DEMO_PREFIX}%`));

  let live = -1;
  let retired = -1;
  for (const row of rows) {
    const id = row.sleeperUserId;
    if (id === null) continue;
    const generation = generationOf(id);
    if (generation === null) continue;
    if (id.endsWith(RETIRED_SUFFIX)) retired = Math.max(retired, generation);
    else live = Math.max(live, generation);
  }

  if (live >= 0) return live;
  return retired + 1;
}

/** `demo:g3:pull-rare` → 3. Null when the id is not one of ours. */
function generationOf(sleeperUserId: string): number | null {
  const match = /^demo:g(\d+):/.exec(sleeperUserId);
  const digits = match?.[1];
  if (digits === undefined) return null;
  return Number.parseInt(digits, 10);
}

/**
 * Find or create the reserved seat for one demo state.
 *
 * Idempotent, and deliberately not "create if missing" written twice: the seat,
 * the membership and the PIN are each looked up before they are written, so a
 * seat half-created by an interrupted run completes rather than conflicting.
 *
 * `stateIndex` fixes the roster slot, so the same state always lands in the same
 * slot within a generation and a screenshot's roster number is stable.
 */
export async function ensureDemoSeat(
  db: Database,
  input: { stateKey: string; stateIndex: number; commissioner?: boolean },
): Promise<DemoSeat> {
  const season = await openSeason(db);
  if (season === null) {
    throw new DemoRefused(
      'there is no open season, so there is no seat to demo into. Run npm run db:seed first.',
    );
  }

  const generation = await currentGeneration(db);
  const sleeperUserId = demoSleeperId(input.stateKey, generation);
  assertDemoSeat(sleeperUserId);

  const at = now();

  const existing = await db
    .select({ id: users.id, displayName: users.displayName, pinHash: users.pinHash })
    .from(users)
    .where(eq(users.sleeperUserId, sleeperUserId))
    .limit(1);

  let userId = existing[0]?.id;
  if (userId === undefined) {
    const inserted = await db
      .insert(users)
      .values({
        // Short, and obviously not a manager. It is what Tony prints on the
        // receipt, so it has to read as a name rather than as a fixture key —
        // the state's identity lives in the URL the CLI prints, not on screen.
        displayName: input.commissioner === true ? 'Demo commissioner' : 'Demo',
        sleeperUserId,
        sleeperUsername: sleeperUserId,
        isAdmin: input.commissioner === true,
        createdAt: at,
        updatedAt: at,
      })
      .returning({ id: users.id });
    userId = inserted[0]?.id;
    if (userId === undefined) throw new Error('the demo seat was not created');
  } else if (input.commissioner === true) {
    /*
     * Re-applying a press-desk state onto a seat that already exists.
     *
     * Guard 2 has already run above — this id carries {@link DEMO_PREFIX} — so
     * the flag can only ever land on a reserved fixture. `requireAdmin()`
     * answers `notFound()`, so a press-desk demo on an ordinary seat would
     * photograph a 404 and file it under the state's name.
     */
    await db.update(users).set({ isAdmin: true, updatedAt: at }).where(eq(users.id, userId));
  }

  // Claimed up front with the fixed PIN, so signing in as the seat needs nothing
  // but the URL. Written here rather than through `claimManager` because that
  // path is the *manager's* claim flow and carries rate limiting and an auth
  // context a CLI has no honest value for.
  if (existing[0]?.pinHash == null) {
    await db
      .update(users)
      .set({ pinHash: await hashPin(demoPin()), pinUpdatedAt: at, updatedAt: at })
      .where(eq(users.id, userId));
  }

  const seated = await db
    .select({ id: seasonMemberships.id })
    .from(seasonMemberships)
    .where(
      and(eq(seasonMemberships.userId, userId), eq(seasonMemberships.seasonId, season.id)),
    )
    .limit(1);

  let membershipId = seated[0]?.id;
  if (membershipId === undefined) {
    const inserted = await db
      .insert(seasonMemberships)
      .values({
        seasonId: season.id,
        userId,
        rosterId: DEMO_ROSTER_BASE + generation * 100 + input.stateIndex,
        createdAt: at,
        updatedAt: at,
      })
      .returning({ id: seasonMemberships.id });
    membershipId = inserted[0]?.id;
    if (membershipId === undefined) throw new Error('the demo seat was not seated');
  }

  return {
    userId,
    displayName: 'Demo',
    seasonId: season.id,
    seasonYear: season.year,
    membershipId,
    generation,
    sleeperUserId,
  };
}

/**
 * Retire the live generation of demo seats.
 *
 * Deactivates the memberships and suffixes the ids, so the seats leave the door
 * list and every lookup above, and the next apply opens a fresh generation.
 * Nothing is deleted — see the note at the top of this file.
 *
 * Returns how many seats were retired, so the CLI can report honestly rather
 * than printing "reset" over a no-op.
 */
export async function retireDemoSeats(db: Database): Promise<{ retired: number }> {
  const at = now();

  const live = await db
    .select({ id: users.id, sleeperUserId: users.sleeperUserId })
    .from(users)
    .where(like(users.sleeperUserId, `${DEMO_PREFIX}%`))
    .orderBy(desc(users.createdAt));

  let retired = 0;
  for (const row of live) {
    const id = row.sleeperUserId;
    if (id === null || id.endsWith(RETIRED_SUFFIX)) continue;

    // Guard 2, again, on the way out. A retire that could reach a real manager
    // would be a worse bug than an apply that could, because it is quieter.
    assertDemoSeat(id);

    await db
      .update(users)
      .set({ sleeperUserId: `${id}${RETIRED_SUFFIX}`, updatedAt: at })
      .where(eq(users.id, row.id));

    await db
      .update(seasonMemberships)
      .set({ isActive: false, updatedAt: at })
      .where(eq(seasonMemberships.userId, row.id));

    retired += 1;
  }

  return { retired };
}
