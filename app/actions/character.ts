'use server';

import { requireUser } from '@/lib/auth/current-user';
import { type CharacterConfiguration } from '@/lib/character/composite';
import { WEARABLE_SLOTS, isWearableSlot, type WearableSlot } from '@/lib/character/layers';
import { saveCharacter } from '@/lib/character/service';
import { getDb } from '@/lib/db';

/**
 * Saving a character.
 *
 * One action, because the customiser has one Save button. Everything the screen
 * is showing goes up together and lands in one transaction, so a manager who is
 * told "saved" has had all of it saved — see `saveCharacter`.
 *
 * ## Nothing arriving from the browser is trusted
 *
 * The client sends variant indices, a palette index and a collectible id per
 * slot. Every one of those is checked server-side against what exists and what
 * this manager owns, and the **slot is derived from the item** rather than taken
 * from the request — a browser that asks to wear a jersey on its head is
 * refused, not corrected. Underneath that, the database refuses the same things
 * again through the ownership trigger and the one-per-slot index.
 *
 * The parsing here is not validation; it is refusing to pass nonsense into a
 * service that would then have to have an opinion about it.
 */

export type SaveCharacterResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

function readIndex(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

export async function saveCharacterAction(input: {
  body: number;
  hair: number;
  palette: number;
  /** Collectible id per slot. A slot absent from this is emptied. */
  equipment: Record<string, string | null>;
}): Promise<SaveCharacterResult> {
  const { user } = await requireUser();

  const body = readIndex(input.body);
  const hair = readIndex(input.hair);
  const palette = readIndex(input.palette);
  if (body === null || hair === null || palette === null) {
    return { ok: false, reason: 'That is not a character Tony can draw.' };
  }
  const configuration: CharacterConfiguration = { body, hair, palette };

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

/** The slots the customiser renders, in the order it renders them. */
export const CUSTOMISER_SLOTS = WEARABLE_SLOTS;
