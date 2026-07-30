'use server';

import { resolveAsset } from '@/lib/assets/registry';
import { type AssetResolution } from '@/lib/assets/types';
import { requireUser } from '@/lib/auth/current-user';
import { openBox } from '@/lib/counter/boxes';
import { type Rarity } from '@/lib/counter/catalog';
import { getDb } from '@/lib/db';

/**
 * Opening the box on the tray.
 *
 * ## The client sends a box id and receives a result
 *
 * That is the entire protocol, and it is the point. `18 §4.3`: **the client
 * never decides a reward.** No rarity is sent up, no weights are sent down, and
 * the browser has no way to influence which item comes out — it cannot even see
 * the reward table.
 *
 * The asset is resolved **here**, on the server, and the resolution travels back
 * as data. That keeps `art/assets.inventory.json` out of the client bundle and
 * keeps the one guarantee the pipeline makes intact: every reference is by slug
 * through the registry, and swapping a placeholder for final art stays a
 * registry row (`ASSET_PIPELINE.md`).
 *
 * ## Authorization is the same single layer as everything else
 *
 * `requireUser()` first, and the service is then told *which* manager is asking.
 * A box that is not yours is indistinguishable from a box that does not exist —
 * `openBox` returns one answer for both, so probing ids teaches nothing.
 */

export interface RevealPayload {
  readonly slug: string;
  readonly name: string;
  readonly rarity: Rarity;
  readonly asset: AssetResolution;
  /**
   * The box was already open, and this is what was in it.
   *
   * The client shows the reveal exactly as it would for a fresh pull — the
   * manager tapped a box and found out what was inside, which is true either
   * way. It skips the anticipation beat, because a second look is not a moment.
   */
  readonly replayed: boolean;
}

export type OpenBoxResponse =
  | { readonly ok: true; readonly reveal: RevealPayload }
  /**
   * Something was wrong with the request and the box is untouched.
   *
   * One shape, no codes: there is nothing a manager can usefully do differently,
   * and the room answers in-world rather than surfacing an error taxonomy.
   */
  | { readonly ok: false };

export async function openBoxAction(boxId: string): Promise<OpenBoxResponse> {
  const { user } = await requireUser();

  // A malformed id reaches the database as a cast error otherwise, which is a
  // 500 for what is really just a bad request.
  if (!/^[0-9a-f-]{36}$/i.test(boxId)) return { ok: false };

  const result = await openBox(getDb(), { userId: user.id, boxId });
  if (result.status !== 'opened') return { ok: false };

  const { reveal } = result;

  return {
    ok: true,
    reveal: {
      slug: reveal.slug,
      name: reveal.name,
      rarity: reveal.rarity,
      asset: resolveAsset(reveal.slug),
      replayed: reveal.replayed,
    },
  };
}
