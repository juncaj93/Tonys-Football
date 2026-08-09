import { and, eq } from 'drizzle-orm';

import { assetRegistry } from '@/lib/assets/registry';
import { type Database } from '@/lib/db';
import { characterConfigurations, collectibles, wearableEquips } from '@/lib/db/schema';

import { WEARABLES, optionName, wearable } from './catalog';
import {
  composeCharacter,
  defaultCharacterFor,
  validateCharacter,
  type CharacterConfiguration,
  type Composite,
  type ConfigurationProblem,
  type Equipment,
} from './composite';
import { WEARABLE_SLOTS, isWearableSlot, type WearableSlot } from './layers';

/** One sentence a manager can act on, from every problem rather than the first. */
function describeProblems(problems: readonly ConfigurationProblem[]): string {
  return problems
    .map((problem) =>
      problem.kind === 'unknown-option'
        ? `${problem.trait} ${String(problem.index)} does not exist`
        : problem.kind === 'unknown-wearable'
          ? `${problem.slug} is not a wearable`
          : `${problem.slug} does not belong in the ${problem.slot} slot`,
    )
    .join('; ');
}

/**
 * Reading and changing a manager's character — server-authoritative.
 *
 * Every rule this module appears to enforce is **also** a constraint or a trigger
 * (`drizzle/0008_character_identity.sql`, `drizzle/0016_character_traits.sql`).
 * That duplication is deliberate and it is the same discipline the token ledger
 * and the Showcase use: the check here produces a sentence a manager can act on,
 * and the check in the database is what actually holds when a second caller
 * exists — a bulk migration, a commissioner fixing something by hand, or a retry
 * arriving twice.
 *
 * **Never soften a database refusal into a success.** A caller that caught the
 * unique-violation and returned "already equipped" would be papering over the one
 * signal proving the constraint works.
 */

export interface CharacterState {
  readonly configuration: CharacterConfiguration;
  readonly equipment: Equipment;
  readonly composite: Composite;
  /**
   * Has this manager ever saved?
   *
   * The customiser needs it to tell *"this is you"* from *"this is who Tony has
   * you down as"*, and it is the one thing a defaulted read cannot be asked to
   * infer once the default stops being all-zeroes.
   */
  readonly chosen: boolean;
}

export type ChangeRefusal =
  /** The configuration names an option that does not exist. */
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
 * A manager who has never opened the customiser has no row, and gets a character
 * derived from their user id — **without one being written**. Writing a default
 * on read would turn every page view into an insert and would make *"has this
 * manager ever chosen anything?"* unanswerable, which is the question the first
 * run needs.
 *
 * ## Every failure mode here ends in a character rather than an exception
 *
 * A row that predates a column, an index whose option was retired, an equipped
 * item that no longer exists: all of them compose. `composeCharacter` repairs per
 * trait and repairs nothing in the database, so a value that stops resolving
 * because a deploy is half rolled out comes back on its own.
 */
export async function characterFor(db: Database, userId: string): Promise<CharacterState> {
  const [row] = await db
    .select({
      skin: characterConfigurations.skin,
      hair: characterConfigurations.hair,
      hairColour: characterConfigurations.hairColour,
      facialHair: characterConfigurations.facialHair,
      top: characterConfigurations.top,
      topColour: characterConfigurations.topColour,
    })
    .from(characterConfigurations)
    .where(eq(characterConfigurations.userId, userId))
    .limit(1);

  const configuration: CharacterConfiguration = row ?? defaultCharacterFor(userId);

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
    chosen: row !== undefined,
  };
}

/**
 * What a manager owns that can be worn, with the slot each one goes in.
 *
 * It reads `collectibles` — the same table the Collection and the Showcase read
 * — because a wearable **is** something you own, and giving equipment its own
 * inventory table would have been a second copy of ownership that could disagree
 * with the first.
 */
export interface OwnedWearable {
  readonly collectibleId: string;
  readonly slug: string;
  readonly name: string;
  readonly slot: WearableSlot;
  readonly equipped: boolean;
}

export async function ownedWearables(
  db: Database,
  userId: string,
): Promise<readonly OwnedWearable[]> {
  const rows = await db
    .select({ id: collectibles.id, slug: collectibles.slug })
    .from(collectibles)
    .where(eq(collectibles.userId, userId));

  const worn = await db
    .select({ collectibleId: wearableEquips.collectibleId })
    .from(wearableEquips)
    .where(eq(wearableEquips.userId, userId));
  const equipped = new Set(worn.map((row) => row.collectibleId));

  const out: OwnedWearable[] = [];
  for (const row of rows) {
    // A collectible that is not a wearable is simply not an option here. The
    // ruling is that they are separate systems, so this is a filter rather than
    // a refusal — nothing is wrong with owning a neon sign.
    const item = wearable(row.slug);
    if (item === null) continue;
    out.push({
      collectibleId: row.id,
      slug: row.slug,
      name: item.name,
      slot: item.slot,
      equipped: equipped.has(row.id),
    });
  }

  // Slot order, then the catalog's order inside a slot, so the customiser's list
  // is stable between loads rather than following whatever the planner returned.
  const slotRank = (slot: WearableSlot) => WEARABLE_SLOTS.indexOf(slot);
  const slugRank = (slug: string) => WEARABLES.findIndex((item) => item.slug === slug);
  return out.sort(
    (a, b) => slotRank(a.slot) - slotRank(b.slot) || slugRank(a.slug) - slugRank(b.slug),
  );
}

/**
 * Give a manager a wearable.
 *
 * **The contract a future award system uses**, written now so that system does
 * not have to reach into `collectibles` and reinvent the rules. Nothing in the
 * product calls it on a schedule: `16` approves no wearable source, the pizza box
 * awards `collectible_*` only (commissioner ruling, 2026-07-31), and inventing
 * one here would be absorbing scope from a milestone that has not been written.
 *
 * **Idempotent by natural key.** `collectibles_one_wearable_each` makes a second
 * grant of the same item to the same manager a no-op rather than a second row.
 */
export async function grantWearable(
  db: Database,
  userId: string,
  slug: string,
  acquiredAt: Date,
): Promise<{ readonly ok: boolean; readonly detail?: string }> {
  const item = wearable(slug);
  if (item === null) {
    return { ok: false, detail: `${slug} is not a wearable` };
  }

  await db
    .insert(collectibles)
    .values({
      userId,
      slug,
      // Every wearable's rarity is the registry's, exactly as a collectible's is.
      rarity: (assetRegistry.get(slug)?.rarity ?? 'common') as
        | 'common'
        | 'rare'
        | 'epic'
        | 'legendary',
      acquiredAt,
      // Not from a box. The column is nullable for precisely this — "later
      // sources (weekly rewards, rings) are not box openings" (`schema.ts`).
      sourceOpeningId: null,
    })
    .onConflictDoNothing();

  return { ok: true };
}

/**
 * Save a chosen appearance **and** what is worn, together, in one transaction.
 *
 * ## Why this exists rather than the customiser calling several actions
 *
 * A screen with one Save button must not be several writes that can half-happen.
 * A manager who changes their hair and their hat and sees "saved" has been told
 * both landed; a failure between the two would leave them wearing a hat they did
 * not choose over hair they did, with no way to tell which half took.
 *
 * `equipment` is **complete, not a patch**: a slot absent from it is emptied.
 * That is what makes "take it off" need no separate call and no separate button —
 * the customiser sends the state it is showing, and the state it is showing is
 * what gets stored.
 */
export async function saveCharacter(
  db: Database,
  userId: string,
  configuration: CharacterConfiguration,
  equipment: Partial<Record<WearableSlot, string>>,
): Promise<ChangeResult> {
  const owned = await ownedWearables(db, userId);
  const byId = new Map(owned.map((item) => [item.collectibleId, item]));

  const resolved: Record<string, string> = {};
  for (const [slot, collectibleId] of Object.entries(equipment)) {
    if (collectibleId === undefined) continue;

    const item = byId.get(collectibleId);
    if (item === undefined) {
      return {
        ok: false,
        refusal: 'not-owned',
        detail: 'that collectible is not in this manager’s collection',
      };
    }
    // The slot is **derived from the item**, and a caller naming a different one
    // is refused rather than corrected — a request to put a jersey on somebody's
    // head is a bug in the caller, and silently fixing it hides the bug.
    if (item.slot !== slot) {
      return {
        ok: false,
        refusal: 'wrong-slot',
        detail: `${item.slug} does not belong in the ${slot} slot`,
      };
    }
    resolved[item.slot] = item.slug;
  }

  /*
   * A save is validated **strictly**, and that is the one place in this system
   * that does not fall back.
   *
   * Reading repairs, because a manager looking at a page should see a character.
   * Writing refuses, because storing a repaired value would silently discard a
   * choice the client believed it was making — and the client is the only thing
   * that could have sent an index the catalog does not have.
   */
  const problems = validateCharacter(configuration, resolved);
  if (problems.length > 0) {
    return { ok: false, refusal: 'invalid', detail: describeProblems(problems) };
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(characterConfigurations)
      .values({ userId, ...configuration })
      .onConflictDoUpdate({
        target: characterConfigurations.userId,
        set: { ...configuration, updatedAt: new Date(0) },
      });

    /*
     * `updatedAt` above is a placeholder the database overwrites — `timestamps`
     * defaults it. It is passed so the column is in the SET list at all; drizzle
     * will not update a column it was not given, and a row whose `updated_at`
     * never moved is a row nobody can tell was edited.
     *
     * Replace the whole equipped set. Delete-then-insert rather than a diff: the
     * diff would be a second model of what is worn, and the two would disagree
     * the first time a slot was emptied and refilled in one save.
     */
    await tx.delete(wearableEquips).where(eq(wearableEquips.userId, userId));
    for (const [slot, collectibleId] of Object.entries(equipment)) {
      if (collectibleId === undefined) continue;
      await tx.insert(wearableEquips).values({
        userId,
        collectibleId,
        slot: byId.get(collectibleId)?.slot ?? (slot as WearableSlot),
      });
    }
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

/** A manager's character in one line, for a list. */
export function shortDescription(configuration: CharacterConfiguration): string {
  const hair = optionName('hair', configuration.hair) ?? 'hair';
  const top = optionName('top', configuration.top) ?? 'top';
  return `${hair}, ${top.toLowerCase()}`;
}
