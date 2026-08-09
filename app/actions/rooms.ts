'use server';

import { requireUser } from '@/lib/auth/current-user';
import { getDb } from '@/lib/db';
import { SLOTS, type Slot } from '@/lib/rooms/objects';
import { clearSlot, place, setTheme } from '@/lib/rooms/service';

/**
 * Changing your own room.
 *
 * ## Every action here is about the caller's own room, and cannot be about
 * anybody else's
 *
 * There is no `userId` parameter on any of them. `requireUser()` supplies it,
 * the service is told which manager is asking, and the database refuses a
 * placement whose collectible is not that manager's
 * (`room_placements_must_be_owned`). Three layers, and the one that matters is
 * the third — the other two turn a mistake into a refusal, and the trigger is
 * what makes a dishonest request impossible.
 *
 * Visiting is a **read**, so it has no action at all: `/rooms/[userId]` renders
 * somebody else's room and offers nothing that writes.
 *
 * ## The slot is validated here, not trusted
 *
 * A slot arrives from the browser as a string. Postgres would refuse an unknown
 * enum value, but it would refuse it as a 500 — so the boundary that owns the
 * vocabulary checks it and answers `false`, which is what every other rejected
 * request on this surface looks like.
 *
 * ## Nothing here touches tokens
 *
 * Placement is free and there is no sink. `00 §8` lists what tokens buy — boxes,
 * casino games, the final auction, commissioner-enabled sinks — and decorating a
 * room is not among them; making it one would be an economy change, and `16 §8`
 * puts those behind the simulation. So there is no ledger call in this file, on
 * purpose, and a future one would be a decision rather than a wiring job.
 */

export interface RoomActionResult {
  readonly ok: boolean;
}

function isSlot(value: string): value is Slot {
  return (SLOTS as readonly string[]).includes(value);
}

/**
 * Put an owned collectible in one of the four places.
 *
 * ## One transaction, because a move is one intention
 *
 * `place()` clears the target slot, clears wherever the item already was, and
 * writes — three statements enforcing two unique constraints. Outside a
 * transaction there is a window in which the room has an empty bench and a mug
 * nowhere, and a failure in the middle leaves it there permanently. The
 * transaction belongs here rather than in the service because *this* is where a
 * manager's tap becomes one thing that either happened or did not.
 */
export async function placeInSlotAction(
  slot: string,
  collectibleId: string,
): Promise<RoomActionResult> {
  const { user } = await requireUser();
  if (!isSlot(slot)) return { ok: false };

  const db = getDb();
  const result = await db.transaction((tx) =>
    place(tx, { userId: user.id, slot, collectibleId }),
  );

  return { ok: result.status === 'placed' };
}

/** Take whatever is in a place back out. Succeeds on an already-empty slot. */
export async function clearSlotAction(slot: string): Promise<RoomActionResult> {
  const { user } = await requireUser();
  if (!isSlot(slot)) return { ok: false };

  await clearSlot(getDb(), { userId: user.id, slot });
  return { ok: true };
}

/** Change what the room is made of. Refuses a theme this product does not have. */
export async function setThemeAction(theme: string): Promise<RoomActionResult> {
  const { user } = await requireUser();
  const result = await setTheme(getDb(), { userId: user.id, theme });
  return { ok: result.status === 'set' };
}
