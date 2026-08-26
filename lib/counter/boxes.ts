import { and, asc, count, eq, like, sql } from 'drizzle-orm';

import { now } from '@/lib/clock';
import { grantWearable } from '@/lib/character/service';
import { wearableUnlockedBy } from '@/lib/character/unlocks';
import { type Database, type Queryable } from '@/lib/db';
import { boxOpenings, collectibles, lootBoxes, rewardTables } from '@/lib/db/schema';

import { catalogItem, type Rarity } from './catalog';
import { selectAward, standardRewardTable } from './rewards';
import { rollBelow } from './rng';
import { applyTokenDelta, economyFor, salvageValue, wallet } from './tokens';

/**
 * Owning a box, and opening it.
 *
 * `18 §4.3` is the whole contract for this file: **purchase and opening are
 * server-authoritative, transactional, auditable, and idempotent. The client
 * never decides a reward.** Nothing in `components/` or `app/` may resolve an
 * item; they call in here and render what comes back.
 *
 * Purchase spends tokens, and every token movement goes through
 * `apply_token_delta` (`16 §5.4`). **No function here writes a balance** — the
 * database refuses it, so this file could not do so even by mistake.
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
  /**
   * Tokens paid instead of the item, or null when the item was kept.
   *
   * Non-null means the manager already owned every item in the rolled tier, so
   * `16 §8` converted the spare. `slug` is still what came out of the box — they
   * are being shown the thing they got a second copy of, because that is what
   * happened, and a plate that named nothing would make salvage read as the box
   * having been empty.
   */
  readonly salvageTokens: number | null;
  /** A separate wardrobe bonus earned by this lore pull, if the item has one. */
  readonly unlockedWearable: { readonly slug: string; readonly name: string } | null;
}

export type OpenResult =
  | { readonly status: 'opened'; readonly reveal: Reveal }
  /** No such box, or it is not this manager's. The two are deliberately one answer. */
  | { readonly status: 'not_found' }
  /**
   * The box rolled a spare and there is nowhere to pay the salvage into.
   *
   * A closed season, or a manager holding no seat in the open one. **The box is
   * left unopened**, which is the only non-destructive answer: the alternatives
   * are handing over a duplicate the rules do not allow, or opening the box and
   * paying nothing — and the ruling's own words are that a duplicate reveal must
   * never silently disappear. Nothing is lost; the box is still on the tray when
   * they hold a wallet again.
   */
  | { readonly status: 'salvage_unavailable' };

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
  // `Queryable` rather than `Database`: this is a single insert with no
  // transaction of its own, so a caller already inside one — the seasonal
  // grants, a future migration script — can pass its handle rather than
  // escaping to the pool and losing the enclosing transaction's atomicity.
  db: Queryable,
  input: { userId: string; grantKey: string; source: string },
): Promise<{ granted: boolean; boxId: string }> {
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

  const boxId =
    written[0]?.id ??
    (
      await db
        .select({ id: lootBoxes.id })
        .from(lootBoxes)
        .where(and(eq(lootBoxes.userId, input.userId), eq(lootBoxes.grantKey, input.grantKey)))
        .limit(1)
    )[0]?.id;

  if (boxId === undefined) throw new Error('the granted box was not recorded');
  return { granted: written.length > 0, boxId };
}

/**
 * A route-level ownership check for the dedicated reveal room. It intentionally
 * accepts an already-opened box: returning to the reveal after a refresh shows
 * the recorded pull rather than silently replacing it with a new roll.
 */
export async function boxBelongsToUser(db: Database, userId: string, boxId: string): Promise<boolean> {
  const row = await db
    .select({ id: lootBoxes.id })
    .from(lootBoxes)
    .where(and(eq(lootBoxes.id, boxId), eq(lootBoxes.userId, userId)))
    .limit(1);
  return row.length > 0;
}

/**
 * Buy a box with tokens.
 *
 * ## One transaction, and the money moves first
 *
 * The debit and the box are written together, so there is no state where a
 * manager has paid and has nothing, or has a box and has paid nothing. The debit
 * goes first on purpose: `apply_token_delta` is what enforces the balance, so if
 * they cannot afford it the `CHECK (token_balance >= 0)` fails and the box is
 * never created. **Nothing here reads a balance and decides** — a read-then-check
 * is a race, and two purchases arriving together would both pass it.
 *
 * ## Idempotent through the ledger's key
 *
 * The purchase's identity *is* the ledger key. A retry replays the delta (a
 * no-op) and then finds the box already granted under the derived `grant_key`, so
 * a double-tapped Buy button spends once and yields one box. Both halves are
 * unique constraints rather than checks, so a race loses at the database.
 *
 * The caller supplies the key. `18 §4` puts purchase on `/counter`; the action
 * there derives a key from the manager, the season and the request, so a retried
 * form submission is the same purchase and a *deliberate* second purchase is a
 * different one.
 */
export async function purchaseBox(
  db: Database,
  input: {
    userId: string;
    seasonId: string;
    /** Names this purchase. A replay is a no-op; see the note above. */
    idempotencyKey: string;
  },
): Promise<
  | { readonly status: 'bought'; readonly boxId: string; readonly spent: number }
  /** The balance would have gone negative. The database refused it. */
  | { readonly status: 'insufficient_tokens'; readonly price: number; readonly balance: number }
> {
  const { values } = await economyFor(db, input.seasonId);
  const price = values.standardBoxPriceTokens;

  try {
    return await db.transaction(async (tx) => {
      await applyTokenDelta(tx, {
        userId: input.userId,
        seasonId: input.seasonId,
        amount: -price,
        reason: 'BOX_PURCHASE',
        // `03 §5` requires human-readable text. Curated, not generated.
        description: 'One standard pizza box, off the counter.',
        idempotencyKey: input.idempotencyKey,
      });

      const granted = await tx
        .insert(lootBoxes)
        .values({
          userId: input.userId,
          kind: 'standard',
          state: 'UNOPENED',
          source: 'purchase',
          // Derived from the ledger key, so the box and the debit share one
          // identity and a retry cannot produce a second box.
          grantKey: `purchase:${input.idempotencyKey}`,
          grantedAt: now(),
        })
        .onConflictDoNothing({ target: lootBoxes.grantKey })
        .returning({ id: lootBoxes.id });

      const boxId =
        granted[0]?.id ??
        (
          await tx
            .select({ id: lootBoxes.id })
            .from(lootBoxes)
            .where(eq(lootBoxes.grantKey, `purchase:${input.idempotencyKey}`))
            .limit(1)
        )[0]?.id;

      if (boxId === undefined) throw new Error('the purchased box was not recorded');

      return { status: 'bought' as const, boxId, spent: price };
    });
  } catch (error: unknown) {
    // The one expected failure: the balance check refused the debit. Every other
    // error is a real fault and must keep propagating.
    if (isBalanceViolation(error)) {
      const current = await wallet(db, { userId: input.userId, seasonId: input.seasonId });
      return {
        status: 'insufficient_tokens',
        price,
        balance: current?.balance ?? 0,
      };
    }
    throw error;
  }
}

/**
 * Was this the balance constraint refusing an overdraft?
 *
 * Matched on the **constraint name**, not the message. A message match would also
 * swallow an unrelated check violation and report it to a manager as "you cannot
 * afford this", which is a lie that looks like a feature.
 */
function isBalanceViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth++) {
    if (typeof current !== 'object' || current === null) return false;
    const candidate = current as { code?: string; constraint?: string; cause?: unknown };
    if (
      candidate.code === '23514' &&
      candidate.constraint === 'season_memberships_token_balance_non_negative'
    ) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
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
    db
      .select({ n: count() })
      .from(collectibles)
      .where(and(eq(collectibles.userId, userId), like(collectibles.slug, 'collectible_%'))),
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
 *
 * ## `16 §8`'s duplicate rule, and the fourth lock it needed
 *
 * The roll names a **tier**; `selectAward` then hands over an unowned item in
 * that tier, or — when the manager owns all of them — converts the spare to
 * tokens. That reads the manager's collection, and a read-then-write is a race:
 * two boxes opened at the same instant by one manager would both see the same
 * unowned set and both pick the same item, and the three locks above are all
 * scoped to a *box* so neither would notice the other.
 *
 * So a fourth engages first: a **transaction-scoped advisory lock on the
 * manager**, taken before the box is even read. It serializes one manager's
 * openings against each other and nobody else's. Two managers opening
 * simultaneously never wait; one manager double-tapping two different boxes
 * resolves the second against the first's result, which is the whole point.
 *
 * It is taken *before* the row lock, always, so the two are acquired in one
 * order everywhere and cannot deadlock against each other.
 *
 * There is no `UNIQUE (user_id, slug)` underneath it, and
 * `drizzle/0014_duplicate_salvage.sql` records why: every database that opened a
 * box before that migration legitimately holds duplicates from the rule that was
 * live then, and `collectibles_undeletable` makes clearing them impossible on
 * purpose.
 */
export async function openBox(
  db: Database,
  input: {
    userId: string;
    boxId: string;
    /**
     * Where a salvage payment goes. `null` when no season is open.
     *
     * Required rather than resolved in here, for the reason every dated or
     * seasonal input in this project is injected: the caller already knows which
     * season is live, and a service that looks it up itself is a service a test
     * cannot put in October.
     */
    seasonId: string | null;
  },
): Promise<OpenResult> {
  return db.transaction(async (tx) => {
    /*
     * The manager's turnstile. See the note above.
     *
     * `pg_advisory_xact_lock` releases at commit or rollback with no unlock call
     * to forget, which is the property that matters in a function with several
     * early returns.
     */
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`collectible:${input.userId}`})::bigint)`,
    );

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
          salvageTokens: boxOpenings.salvageTokens,
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
          // Read back rather than recomputed. A replay must show what happened,
          // not what would happen if it happened now — and what a spare was
          // worth is a property of the prices that were live at the time.
          salvageTokens: opening.salvageTokens,
          unlockedWearable:
            opening.salvageTokens === null
              ? (() => {
                  const item = wearableUnlockedBy(opening.slug);
                  return item === null ? null : { slug: item.slug, name: item.name };
                })()
              : null,
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
    const openedAt = now();

    /*
     * What this manager already has, read under the advisory lock above.
     *
     * Distinct slugs rather than rows: `selectAward` asks "is this owned", and a
     * database that still holds pre-`0014` duplicates would otherwise answer the
     * question twice for the same item.
     */
    const held = await tx
      .selectDistinct({ slug: collectibles.slug })
      .from(collectibles)
      .where(
        and(
          eq(collectibles.userId, input.userId),
          like(collectibles.slug, 'collectible_%'),
        ),
      );

    const award = selectAward(table, roll, new Set(held.map((row) => row.slug)));

    /*
     * A spare, and the tab it is paid onto.
     *
     * Resolved before anything is written, because a salvage that cannot be paid
     * must leave the box **unopened** rather than opened for nothing. Returning
     * here commits an empty transaction — the box row lock is released and the
     * box is exactly as it was.
     */
    let salvage: { tokens: number; transactionId: string } | null = null;

    if (award.kind === 'salvage') {
      if (input.seasonId === null) return { status: 'salvage_unavailable' };

      const seat = await wallet(tx, { userId: input.userId, seasonId: input.seasonId });
      if (seat === null) return { status: 'salvage_unavailable' };

      const { values } = await economyFor(tx, input.seasonId);
      const tokens = salvageValue(values, award.rarity);

      /*
       * The key names the **box**, which is the natural occasion here: a box
       * salvages once, so a retry that reaches this line — and it can, because
       * the whole transaction may be retried — replays the same delta rather
       * than paying twice. The amount is deliberately not in the key, so a
       * mid-season reprice raises instead of quietly paying a second time at a
       * second price.
       */
      const transactionId = await applyTokenDelta(tx, {
        userId: input.userId,
        seasonId: input.seasonId,
        amount: tokens,
        reason: 'DUPLICATE_SALVAGE',
        // `03 §5` requires human-readable text. Curated, not generated.
        description: 'Tony takes the spare off your hands.',
        idempotencyKey: `salvage:${box.id}`,
        sourceRef: box.id,
      });

      salvage = { tokens, transactionId };
    }

    const openedRows = await tx
      .insert(boxOpenings)
      .values({
        boxId: box.id,
        userId: input.userId,
        collectibleSlug: award.slug,
        rarity: award.rarity,
        rewardTableVersion: table.version,
        roll,
        outcome: award.kind === 'salvage' ? 'SALVAGE' : 'ITEM',
        salvageTokens: salvage?.tokens ?? null,
        tokenTransactionId: salvage?.transactionId ?? null,
        openedAt,
      })
      .returning({ id: boxOpenings.id });

    const opening = openedRows[0];
    if (opening === undefined) throw new Error('the opening was not recorded');

    if (award.kind === 'item') {
      await tx.insert(collectibles).values({
        userId: input.userId,
        slug: award.slug,
        rarity: award.rarity,
        acquiredAt: openedAt,
        sourceOpeningId: opening.id,
      });
      const unlocked = wearableUnlockedBy(award.slug);
      if (unlocked !== null) await grantWearable(tx, input.userId, unlocked.slug, openedAt);
    }

    await tx
      .update(lootBoxes)
      .set({ state: 'OPENED', openedAt })
      .where(eq(lootBoxes.id, box.id));

    return {
      status: 'opened',
      reveal: {
        slug: award.slug,
        name: catalogItem(award.slug).name,
        rarity: award.rarity,
        replayed: false,
        salvageTokens: salvage?.tokens ?? null,
        unlockedWearable:
          award.kind === 'item'
            ? (() => {
                const item = wearableUnlockedBy(award.slug);
                return item === null ? null : { slug: item.slug, name: item.name };
              })()
            : null,
      },
    };
  });
}
