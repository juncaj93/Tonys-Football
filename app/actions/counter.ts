'use server';

import { resolveAsset } from '@/lib/assets/registry';
import { type AssetResolution } from '@/lib/assets/types';
import { requireUser } from '@/lib/auth/current-user';
import { grantBox, openBox, purchaseBox } from '@/lib/counter/boxes';
import { type Rarity } from '@/lib/counter/catalog';
import { collectionFor } from '@/lib/counter/collection';
import { offerAnotherBox, type BoxOffer } from '@/lib/counter/offer';
import { setShowcase } from '@/lib/counter/showcase';
import { openSeason } from '@/lib/counter/tokens';
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

  /**
   * Tokens paid instead of the item, or null when the item was kept.
   *
   * `16 §8`: a roll landing in a tier the manager has completed has no unowned
   * item to hand over, so the spare converts. `slug`, `name` and `asset` still
   * describe what came out of the box — the plate shows the object and says what
   * happened to it, because "your box contained nothing" would be false.
   */
  readonly salvageTokens: number | null;
  /** Separate wardrobe bonus attached to a lore pull, never a second box roll. */
  readonly unlockedWearable: { readonly slug: string; readonly name: string } | null;

  /*
   * What the pull *means*, which is not the same as what it is.
   *
   * The plate said `COMMON / Squeeze bottle` and stopped — a label, not a
   * meaning. A new player finished the loop knowing the name of an object and
   * nothing about whether it mattered, how much of the set they had, or that it
   * was theirs permanently. These three fields are what turn a label into an
   * event, and they are computed on the server because the client is not allowed
   * to count anybody's collection.
   */

  /** Distinct items held after this pull. */
  readonly distinct: number;
  /** The catalog's size — the denominator that makes `distinct` mean something. */
  readonly total: number;
  /**
   * Tony offering another box, or null.
   *
   * **Null is every unavailable case at once** — no open season, no seat, no
   * stored economy, not enough on the tab — because the plate says the same
   * thing to all of them: nothing. Commissioner ruling, 2026-07-30: do not
   * advertise an unavailable purchase, do not shame the manager, do not display
   * a disabled sales pitch.
   *
   * It carries a **sentence**, not a price beside a button. `lib/counter/offer.ts`
   * argues the point at length; the short version is that this is Tony handing
   * something across a counter rather than the application listing a second SKU.
   *
   * Chosen on the server, so it is fixed for this reveal — remounting the plate
   * cannot reroll what he said.
   */
  readonly offer: BoxOffer | null;
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

export type BuyBoxResponse =
  | { readonly ok: true; readonly spent: number; readonly boxId: string }
  /** Not enough tokens. The only failure worth explaining, because it is actionable. */
  | { readonly ok: false; readonly reason: 'insufficient'; readonly price: number; readonly balance: number }
  /** No open season, no seat, or a malformed request. Nothing was charged. */
  | { readonly ok: false; readonly reason: 'unavailable' };

/**
 * Buying a box at the counter.
 *
 * ## The idempotency key is namespaced server-side, and that is a security property
 *
 * The client supplies a random token per attempt, so a double-tapped Buy button
 * sends the same one and spends once, while a deliberate second purchase sends a
 * new one. But the key that reaches the ledger is
 * `purchase:<userId>:<clientToken>` — built **here**, from the session's own user
 * id.
 *
 * If the client's token were used raw, a manager could send
 * `season-start:<season>:<someone>` and collide with a real ledger key. The
 * replay guard inside `apply_token_delta` would raise rather than silently no-op,
 * so nothing could actually be stolen — but the request would fail confusingly
 * instead of being impossible. Namespacing makes the whole class unreachable.
 *
 * The token is also format-checked, so it cannot be used to smuggle structure
 * into the key.
 */
export async function buyBoxAction(clientToken: string): Promise<BuyBoxResponse> {
  const { user } = await requireUser();

  if (!/^[0-9a-f-]{36}$/i.test(clientToken)) return { ok: false, reason: 'unavailable' };

  const db = getDb();
  const season = await openSeason(db);
  // No open season means the books are closed everywhere — `apply_token_delta`
  // refuses a finalized season outright, so this is the honest answer rather than
  // letting the database raise.
  if (season === null) return { ok: false, reason: 'unavailable' };

  const result = await purchaseBox(db, {
    userId: user.id,
    seasonId: season.id,
    idempotencyKey: `purchase:${user.id}:${clientToken}`,
  });

  if (result.status === 'insufficient_tokens') {
    return {
      ok: false,
      reason: 'insufficient',
      price: result.price,
      balance: result.balance,
    };
  }

  return { ok: true, spent: result.spent, boxId: result.boxId };
}

/**
 * An administrator-only box supply while the clubhouse is being demonstrated.
 *
 * Unlike a production purchase this writes **no token movement at all**: it
 * grants an ordinary unopened box with an explicit `practice:` source and a
 * request-scoped natural key. That makes a double tap idempotent, makes each
 * deliberate tap a new box, and leaves a clean, removable boundary for the
 * launch reset. A manager can never obtain this path by choosing a client-side
 * "practice" value; the authorization is the session's `isAdmin` flag.
 */
export async function claimPracticeBoxAction(clientToken: string): Promise<BuyBoxResponse> {
  const { user } = await requireUser();
  if (!user.isAdmin || !/^[0-9a-f-]{36}$/i.test(clientToken)) {
    return { ok: false, reason: 'unavailable' };
  }

  const granted = await grantBox(getDb(), {
    userId: user.id,
    grantKey: `practice:${user.id}:${clientToken}`,
    source: 'practice',
  });

  return { ok: true, spent: 0, boxId: granted.boxId };
}

export async function openBoxAction(boxId: string): Promise<OpenBoxResponse> {
  const { user } = await requireUser();

  // A malformed id reaches the database as a cast error otherwise, which is a
  // 500 for what is really just a bad request.
  if (!/^[0-9a-f-]{36}$/i.test(boxId)) return { ok: false };

  const db = getDb();

  /*
   * The season a salvage would be paid into.
   *
   * Resolved here rather than inside `openBox`, for the reason every seasonal
   * input in this project is injected. `null` is a real answer — the books are
   * shut everywhere — and `openBox` answers `salvage_unavailable` and leaves the
   * box alone rather than opening it for nothing.
   */
  const season = await openSeason(db);

  const result = await openBox(db, {
    userId: user.id,
    boxId,
    seasonId: season?.id ?? null,
  });
  if (result.status !== 'opened') return { ok: false };

  const { reveal } = result;

  /*
   * Read *after* the open, so the count includes what they just pulled.
   *
   * Cheap, and not allowed on the client: a collection count is a fact about
   * somebody's property, and a price the client picked would be a price the
   * client could change.
   */
  const collection = await collectionFor(db, user.id);

  /*
   * And then Tony, who has been watching all this from two feet away.
   *
   * The offer is drawn here rather than in the component for two reasons the
   * ruling states directly: eligibility must come from authoritative server
   * state, and the line must not reroll when React remounts the plate. Both are
   * satisfied by the draw happening once, on this request, and travelling back
   * as text.
   *
   * It reads `distinct`, so "first one was free" is only ever said to somebody
   * for whom it is true.
   *
   * ## Not on a replay
   *
   * *"A second look is not a moment"* — the component skips the anticipation
   * beat for exactly this case, and an offer **is** a moment. A duplicate tap
   * that lost the race, or a refresh that re-resolved the same open box, is a
   * manager looking at their collectible again; Tony does not re-pitch, and a
   * draw is not spent. Without this, every retry would burn a variant off the
   * cooldown for a sentence nobody asked to hear twice.
   */
  const offer = reveal.replayed
    ? null
    : await offerAnotherBox(db, {
        userId: user.id,
        distinct: collection.distinct,
        total: collection.total,
      });

  return {
    ok: true,
    reveal: {
      slug: reveal.slug,
      name: reveal.name,
      rarity: reveal.rarity,
      asset: resolveAsset(reveal.slug),
      replayed: reveal.replayed,
      salvageTokens: reveal.salvageTokens,
      unlockedWearable: reveal.unlockedWearable,
      distinct: collection.distinct,
      total: collection.total,
      offer,
    },
  };
}

/**
 * Choosing what the league sees.
 *
 * `null` clears it. Ownership is verified in the service **and** by a trigger on
 * `users`, so a request naming somebody else's collectible is refused twice — the
 * service so it reads as a polite no, the trigger so no future caller can skip it.
 *
 * One failure shape, as elsewhere: not-yours and no-such-thing are the same answer,
 * so probing collectible ids teaches nothing.
 */
export async function setShowcaseAction(
  collectibleId: string | null,
): Promise<{ readonly ok: boolean }> {
  const { user } = await requireUser();

  if (collectibleId !== null && !/^[0-9a-f-]{36}$/i.test(collectibleId)) {
    return { ok: false };
  }

  const result = await setShowcase(getDb(), { userId: user.id, collectibleId });
  return { ok: result.status !== 'not_yours' };
}
