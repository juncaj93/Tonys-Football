import { and, asc, count, eq } from 'drizzle-orm';

import { now } from '@/lib/clock';
import { type Database } from '@/lib/db';
import { boxOpenings, collectibles, lootBoxes, rewardTables } from '@/lib/db/schema';

import { catalogItem, type Rarity } from './catalog';
import { standardRewardTable } from './rewards';
import { resolveRoll } from './rewards';
import { rollBelow } from './rng';

/**
 * Owning a box, and opening it.
 *
 * `18 §4.3` is the whole contract for this file: **purchase and opening are
 * server-authoritative, transactional, auditable, and idempotent. The client
 * never decides a reward.** Nothing in `components/` or `app/` may resolve an
 * item; they call in here and render what comes back.
 *
 * Purchase is deliberately absent. Boxes arrive from the seed in this slice; the
 * token path goes through `apply_token_delta` and is the next slice's work
 * (`16 §5.4`). No function here writes a balance.
 */

/** What the tray needs to know. */
export interface OwnedBox {
  readonly id: string;
  readonly kind: 'standard';
}

export interface Reveal {
  readonly slug: string;
  readonly name: string;
  readonly rarity: Rarity;
  /**
   * This box had already been opened, and this is the record of that opening.
   *
   * Not an error. A refresh mid-reveal and a second tap both land here, and both
   * must show the same collectible rather than rolling again.
   */
  readonly replayed: boolean;
}

export type OpenResult =
  | { readonly status: 'opened'; readonly reveal: Reveal }
  /** No such box, or it is not this manager's. The two are deliberately one answer. */
  | { readonly status: 'not_found' };

/**
 * Grant a box, idempotently.
 *
 * `grantKey` is the whole mechanism: the seed derives a stable key per manager,
 * so running the seed on every deploy hands out nothing after the first time —
 * **including after the box has been opened**, which is the case that matters. A
 * re-grant of an opened box would be a reroll dressed up as a deployment.
 *
 * Returns whether a row was actually written, so the seed can report honestly
 * instead of claiming work it did not do.
 */
export async function grantBox(
  db: Database,
  input: { userId: string; grantKey: string; source: string },
): Promise<{ granted: boolean }> {
  const written = await db
    .insert(lootBoxes)
    .values({
      userId: input.userId,
      kind: 'standard',
      state: 'UNOPENED',
      source: input.source,
      grantKey: input.grantKey,
      grantedAt: now(),
    })
    .onConflictDoNothing({ target: lootBoxes.grantKey })
    .returning({ id: lootBoxes.id });

  return { granted: written.length > 0 };
}

/**
 * The box on the tray, if there is one.
 *
 * Oldest first. A manager holding two unopened boxes opens the one they have had
 * longest, which is the only ordering that cannot surprise anybody — and it
 * matches `18 §4`'s landing priority, where an owned unopened box outranks
 * everything else the counter could show.
 */
export async function ownedBox(db: Database, userId: string): Promise<OwnedBox | null> {
  const rows = await db
    .select({ id: lootBoxes.id, kind: lootBoxes.kind })
    .from(lootBoxes)
    .where(and(eq(lootBoxes.userId, userId), eq(lootBoxes.state, 'UNOPENED')))
    .orderBy(asc(lootBoxes.grantedAt), asc(lootBoxes.id))
    .limit(1);

  const row = rows[0];
  return row === undefined ? null : { id: row.id, kind: row.kind };
}

/** What the counter says about this manager, without inventing anything. */
export async function counterState(
  db: Database,
  userId: string,
): Promise<{ unopenedBoxes: number; collectiblesOwned: number }> {
  const [boxes, owned] = await Promise.all([
    db
      .select({ n: count() })
      .from(lootBoxes)
      .where(and(eq(lootBoxes.userId, userId), eq(lootBoxes.state, 'UNOPENED'))),
    db.select({ n: count() }).from(collectibles).where(eq(collectibles.userId, userId)),
  ]);

  return {
    unopenedBoxes: Number(boxes[0]?.n ?? 0),
    collectiblesOwned: Number(owned[0]?.n ?? 0),
  };
}

/**
 * Store a reward table version if it is not already stored.
 *
 * Append-only: an existing version is never rewritten, because openings point at
 * it and rewriting it would retroactively change what they rolled against. A new
 * set of weights is a new version, which is what the content hash gives for
 * free.
 */
export async function ensureRewardTable(db: Database): Promise<{ version: string }> {
  const table = standardRewardTable();

  await db
    .insert(rewardTables)
    .values({
      version: table.version,
      kind: 'standard',
      entries: table.entries.map((entry) => ({ ...entry })),
      provisional: table.provisional,
    })
    .onConflictDoNothing({ target: rewardTables.version });

  return { version: table.version };
}

/**
 * Open a box.
 *
 * ## Exactly once, and the database is what guarantees it
 *
 * Three mechanisms, in the order they engage:
 *
 *   1. **`SELECT ... FOR UPDATE`** on the box. Two concurrent taps serialize
 *      here: the second waits for the first to commit, then reads the box as
 *      `OPENED` and returns the *existing* opening. This is the path a double
 *      tap actually takes, and it is not an error path.
 *   2. **`box_openings.box_id UNIQUE`.** The backstop. If the row lock is ever
 *      bypassed — a different code path, a hand-run statement, a future
 *      refactor that forgets the lock — the insert fails rather than minting a
 *      second collectible.
 *   3. **`collectibles.source_opening_id UNIQUE`.** One opening can produce one
 *      collectible, so a retry that lands between the two inserts cannot
 *      duplicate the item either.
 *
 * All of it inside one transaction, so a failure anywhere leaves the box
 * unopened rather than half-opened.
 *
 * ## The roll happens here, on the server, and is recorded
 *
 * The client sends a box id and nothing else. The roll, the table version and
 * the resolved item are all decided in this function and written down together,
 * which is what makes the outcome reproducible by anybody holding the row.
 */
export async function openBox(
  db: Database,
  input: { userId: string; boxId: string },
): Promise<OpenResult> {
  return db.transaction(async (tx) => {
    const locked = await tx
      .select({ id: lootBoxes.id, kind: lootBoxes.kind, state: lootBoxes.state })
      .from(lootBoxes)
      .where(and(eq(lootBoxes.id, input.boxId), eq(lootBoxes.userId, input.userId)))
      .for('update');

    const box = locked[0];
    // Not found and not-yours are one answer on purpose: a manager probing box
    // ids should not learn which ones exist.
    if (box === undefined) return { status: 'not_found' };

    if (box.state === 'OPENED') {
      const existing = await tx
        .select({
          slug: boxOpenings.collectibleSlug,
          rarity: boxOpenings.rarity,
        })
        .from(boxOpenings)
        .where(eq(boxOpenings.boxId, box.id))
        .limit(1);

      const opening = existing[0];
      if (opening === undefined) {
        // An opened box with no opening row cannot happen inside one
        // transaction, and if it ever does it is corruption rather than a state
        // to paper over with a fresh roll.
        throw new Error(`box ${box.id} is OPENED but has no opening record`);
      }

      return {
        status: 'opened',
        reveal: {
          slug: opening.slug,
          name: catalogItem(opening.slug).name,
          rarity: opening.rarity,
          replayed: true,
        },
      };
    }

    const table = standardRewardTable();

    // The stored table is the authority for what a version *means*, so refuse to
    // open against a version this database has never recorded. Writing it here
    // instead would let the first opening of a deploy define the economy
    // silently, which is precisely what `18 §4.3`'s "stored reward table" rules
    // out. The seed stores it; see `ensureRewardTable`.
    const stored = await tx
      .select({ version: rewardTables.version })
      .from(rewardTables)
      .where(eq(rewardTables.version, table.version))
      .limit(1);

    if (stored[0] === undefined) {
      throw new Error(
        `reward table ${table.version} is not stored; run npm run db:seed before opening boxes`,
      );
    }

    const roll = rollBelow(table.totalWeight);
    const entry = resolveRoll(table, roll);
    const openedAt = now();

    const openedRows = await tx
      .insert(boxOpenings)
      .values({
        boxId: box.id,
        userId: input.userId,
        collectibleSlug: entry.slug,
        rarity: entry.rarity,
        rewardTableVersion: table.version,
        roll,
        openedAt,
      })
      .returning({ id: boxOpenings.id });

    const opening = openedRows[0];
    if (opening === undefined) throw new Error('the opening was not recorded');

    await tx.insert(collectibles).values({
      userId: input.userId,
      slug: entry.slug,
      rarity: entry.rarity,
      acquiredAt: openedAt,
      sourceOpeningId: opening.id,
    });

    await tx
      .update(lootBoxes)
      .set({ state: 'OPENED', openedAt })
      .where(eq(lootBoxes.id, box.id));

    return {
      status: 'opened',
      reveal: {
        slug: entry.slug,
        name: catalogItem(entry.slug).name,
        rarity: entry.rarity,
        replayed: false,
      },
    };
  });
}
