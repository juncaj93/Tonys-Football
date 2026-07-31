import { and, eq } from 'drizzle-orm';

import { type Database } from '@/lib/db';
import { characterConfigurations, collectibles, wearableEquips } from '@/lib/db/schema';

import { wearable } from './catalog';
import {
  DEFAULT_CONFIGURATION,
  composeCharacter,
  validateCharacter,
  type CharacterConfiguration,
  type Composite,
  type Equipment,
} from './composite';
import { isWearableSlot, type WearableSlot } from './layers';

/**
 * Reading and changing a manager's character — server-authoritative.
 *
 * Every rule this module appears to enforce is **also** a constraint or a trigger
 * (`drizzle/0008_character_identity.sql`). That duplication is deliberate and it
 * is the same discipline the token ledger and the Showcase use: the check here
 * produces a sentence a manager can act on, and the check in the database is what
 * actually holds when a second caller exists — a bulk migration, a commissioner
 * fixing something by hand, or a retry arriving twice.
 *
 * **Never soften a database refusal into a success.** A caller that caught the
 * unique-violation and returned "already equipped" would be papering over the one
 * signal proving the constraint works.
 */

export interface CharacterState {
  readonly configuration: CharacterConfiguration;
  readonly equipment: Equipment;
  readonly composite: Composite;
}

export type ChangeRefusal =
  /** The configuration names a variant, palette or slot that does not exist. */
  | 'invalid'
  /** The collectible is not a wearable at all. */
  | 'not-wearable'
  /** The slug is a wearable, for a different slot. */
  | 'wrong-slot'
  /** They do not own it. Also enforced by a trigger. */
  | 'not-owned';

export type ChangeResult =
  | { readonly ok: true; readonly state: CharacterState }
  | { readonly ok: false; readonly refusal: ChangeRefusal; readonly detail: string };

/**
 * Read a manager's character.
 *
 * A manager who has never opened the customiser has no row, and gets the default
 * — **without one being written**. Writing a default on read would turn every
 * page view into an insert and would make "has this manager ever chosen
 * anything?" unanswerable, which is the question a first-run experience needs.
 */
export async function characterFor(db: Database, userId: string): Promise<CharacterState> {
  const [row] = await db
    .select()
    .from(characterConfigurations)
    .where(eq(characterConfigurations.userId, userId))
    .limit(1);

  const configuration: CharacterConfiguration =
    row === undefined
      ? DEFAULT_CONFIGURATION
      : { body: row.body, hair: row.hair, palette: row.palette };

  const worn = await db
    .select({ slot: wearableEquips.slot, slug: collectibles.slug })
    .from(wearableEquips)
    .innerJoin(collectibles, eq(collectibles.id, wearableEquips.collectibleId))
    .where(eq(wearableEquips.userId, userId));

  const equipment: Record<string, string> = {};
  for (const item of worn) {
    if (isWearableSlot(item.slot)) equipment[item.slot] = item.slug;
  }

  return {
    configuration,
    equipment,
    composite: composeCharacter(configuration, equipment),
  };
}

/**
 * Save a base appearance.
 *
 * Upsert on the primary key, so saving twice is saving once — the same
 * idempotency property every other write in this product has, arrived at here
 * for free because a character has exactly one row.
 */
export async function saveConfiguration(
  db: Database,
  userId: string,
  configuration: CharacterConfiguration,
): Promise<ChangeResult> {
  const current = await characterFor(db, userId);
  const problems = validateCharacter(configuration, current.equipment);

  if (problems.length > 0) {
    return {
      ok: false,
      refusal: 'invalid',
      detail: problems
        .map((problem) =>
          problem.kind === 'unknown-variant'
            ? `${problem.layer} variant ${String(problem.index)} does not exist`
            : problem.kind === 'unknown-palette'
              ? `palette ${String(problem.index)} does not exist`
              : problem.kind === 'unknown-wearable'
                ? `${problem.slug} is not a wearable`
                : `${problem.slug} does not belong in the ${problem.slot} slot`,
        )
        .join('; '),
    };
  }

  await db
    .insert(characterConfigurations)
    // `face` is stored and always zero — the column exists so the row's shape
    // does not change if a base face layer is ever authored (`composite.ts`).
    .values({ userId, ...configuration, face: 0 })
    .onConflictDoUpdate({
      target: characterConfigurations.userId,
      set: { ...configuration, updatedAt: new Date(0) },
    });

  /*
   * `updatedAt` above is a placeholder the database overwrites — `timestamps`
   * defaults it. It is passed so the column is in the SET list at all; drizzle
   * will not update a column it was not given, and a row whose `updated_at` never
   * moved is a row nobody can tell was edited.
   */
  return { ok: true, state: await characterFor(db, userId) };
}

/**
 * Put an owned collectible into its slot.
 *
 * The slot is **derived from the item**, never passed in. A caller that supplied
 * it could put a jersey on somebody's head, and the check that caught it would be
 * a second copy of a fact the catalog already states.
 */
export async function equip(
  db: Database,
  userId: string,
  collectibleId: string,
): Promise<ChangeResult> {
  const [owned] = await db
    .select({ slug: collectibles.slug })
    .from(collectibles)
    .where(and(eq(collectibles.id, collectibleId), eq(collectibles.userId, userId)))
    .limit(1);

  if (owned === undefined) {
    return {
      ok: false,
      refusal: 'not-owned',
      detail: 'that collectible is not in this manager’s collection',
    };
  }

  const item = wearable(owned.slug);
  if (item === null) {
    return {
      ok: false,
      refusal: 'not-wearable',
      detail: `${owned.slug} is a collectible, not something anybody can wear`,
    };
  }

  /*
   * Replace whatever is in the slot, in one transaction.
   *
   * Delete-then-insert rather than an upsert, because the slot's unique index is
   * on `(user_id, slot)` and the *item* is what changes. Wrapped, so a failure
   * between the two never leaves a manager with an empty slot they did not choose
   * to empty.
   */
  await db.transaction(async (tx) => {
    await tx
      .delete(wearableEquips)
      .where(and(eq(wearableEquips.userId, userId), eq(wearableEquips.slot, item.slot)));
    await tx.insert(wearableEquips).values({ userId, collectibleId, slot: item.slot });
  });

  return { ok: true, state: await characterFor(db, userId) };
}

/** Empty a slot. Idempotent: emptying an empty slot is not an error. */
export async function unequip(
  db: Database,
  userId: string,
  slot: WearableSlot,
): Promise<ChangeResult> {
  await db
    .delete(wearableEquips)
    .where(and(eq(wearableEquips.userId, userId), eq(wearableEquips.slot, slot)));

  return { ok: true, state: await characterFor(db, userId) };
}
