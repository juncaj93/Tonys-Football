'use server';

import { requireUser } from '@/lib/auth/current-user';
import { type CharacterConfiguration } from '@/lib/character/composite';
import { BASE_TRAITS, isWearableSlot, type WearableSlot } from '@/lib/character/layers';
import { saveCharacter } from '@/lib/character/service';
import { getDb } from '@/lib/db';

/**
 * Saving a character.
 *
 * One action, because the customiser has one Save button. Everything the screen
 * is showing goes up together and lands in one transaction, so a manager who is
 * told "saved" has had all of it saved — see `saveCharacter`.
 *
 * ## Nothing but `async function` may be exported from this file
 *
 * Not a style rule — a **crash**. Next.js compiles a `'use server'` module with
 * an injected `ensureServerEntryExports([...everything exported])`, which throws
 * `A "use server" file can only export async functions, found object.` the first
 * time the module is evaluated on the server. Evaluation happens when an action
 * is *invoked*, not when the page renders, so the route loads perfectly and then
 * every Save returns a 500 with digest `…@E352`.
 *
 * That shipped. `export const CUSTOMISER_SLOTS = WEARABLE_SLOTS` sat here from
 * #48 with **no consumer anywhere**, and it broke every character save in
 * production for as long as it existed. `next build` does not catch it — the
 * check is deliberately runtime-only — and neither `npm run test` nor
 * `npm run visual:qa` invoked the action, so all three gates were green.
 *
 * `app/actions/use-server-exports.test.ts` is the gate now, over every
 * `'use server'` file in the product. `type` and `interface` exports are fine:
 * they are erased before any of this happens.
 *
 * ## Nothing arriving from the browser is trusted
 *
 * The client sends six trait indices and a collectible id per slot. Every one of
 * those is checked server-side against what exists and what this manager owns,
 * and the **slot is derived from the item** rather than taken from the request —
 * a browser that asks to wear a jersey on its head is refused, not corrected.
 * Underneath that, the database refuses the same things again through the
 * ownership trigger and the one-per-slot index.
 *
 * The parsing here is not validation; it is refusing to pass nonsense into a
 * service that would then have to have an opinion about it.
 */

export type SaveCharacterResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

export interface SaveCharacterInput {
  readonly skin: number;
  readonly hair: number;
  readonly hairColour: number;
  readonly facialHair: number;
  readonly top: number;
  readonly topColour: number;
  /** Collectible id per slot. A slot absent from this is emptied. */
  readonly equipment: Record<string, string | null>;
}

function readIndex(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

export async function saveCharacterAction(input: SaveCharacterInput): Promise<SaveCharacterResult> {
  const { user } = await requireUser();

  const source = input as unknown as Record<string, unknown>;
  const traits: Record<string, number> = {};
  for (const trait of BASE_TRAITS) {
    const index = readIndex(source[trait]);
    if (index === null) return { ok: false, reason: 'That is not a character Tony can draw.' };
    traits[trait] = index;
  }
  const configuration = traits as unknown as CharacterConfiguration;

  const equipment: Partial<Record<WearableSlot, string>> = {};
  for (const [slot, collectibleId] of Object.entries(input.equipment)) {
    if (collectibleId === null || collectibleId === '') continue;
    // A slot name the system does not have is dropped rather than refused: it
    // cannot equip anything, so there is nothing to be wrong about.
    if (!isWearableSlot(slot)) continue;
    if (typeof collectibleId !== 'string') continue;
    equipment[slot] = collectibleId;
  }

  const result = await saveCharacter(getDb(), user.id, configuration, equipment);

  if (!result.ok) {
    /*
     * The refusal is mapped to a sentence rather than passed through. The
     * service's `detail` names slugs and slot machinery — useful in a log,
     * meaningless across a counter.
     */
    const said: Record<string, string> = {
      invalid: 'That is not a character Tony can draw.',
      'not-owned': 'That one is not in your collection.',
      'not-wearable': 'That is not something anybody can wear.',
      'wrong-slot': 'That does not go there.',
    };
    return { ok: false, reason: said[result.refusal] ?? 'Tony could not save that.' };
  }

  return { ok: true };
}
