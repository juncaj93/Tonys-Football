/**
 * What a delivered art batch is supposed to contain.
 *
 * The executable form of `docs/art/BATCH_B_COLLECTIBLES_HANDOFF.md`. The handoff
 * is written to be pasted into an image-generation session; this is the same list
 * in a form `npm run art:batch` can check delivery against, and
 * `lib/assets/batches.test.ts` asserts the two never disagree.
 *
 * ## Why a list and not "whatever turned up"
 *
 * A batch arrives as a folder of PNGs, and the two ways that goes wrong are both
 * silent. **A missing sprite** leaves its item drawing the placeholder, which is a
 * legitimate state — so nothing looks broken and the gap is found weeks later by
 * somebody pulling that item. **A duplicate** — `collectible_reddiwip_01.png` and
 * `_02.png` — means somebody generated a second attempt, and picking one by sort
 * order is picking one at random.
 *
 * Naming the expectation up front turns both into a refusal with a filename in it.
 */

export interface ArtBatch {
  readonly key: string;
  /** What the batch is for, in one line. */
  readonly shows: string;
  /** The handoff document a generator works from. */
  readonly handoff: string;
  /** Registry slugs, in the order the handoff briefs them. */
  readonly slugs: readonly string[];
}

/**
 * Batch B — the eight collectibles that close M2.
 *
 * Eight rather than twenty-four is a **determination made from the
 * specification**, not a convenience: `art/ASSET_PIPELINE.md §5`,
 * `art/assets.inventory.json` and `art/prompts/collectible.md` all planned for a
 * 12-of-24 launch split before the question came up, and what M2 has to prove is
 * the *system* (`docs/CHECKPOINT.md`). These eight cover every rarity, both
 * silhouette extremes, the detail-budget ceiling, an emissive material, a frame
 * that must not read as a UI plate, and the tiny-object anchor case.
 *
 * The remaining four of the twelve owed at launch are Batch B2.
 */
export const BATCH_B: ArtBatch = {
  key: 'B',
  shows: 'the eight collectibles that close M2',
  handoff: 'docs/art/BATCH_B_COLLECTIBLES_HANDOFF.md',
  slugs: [
    'collectible_arcade_token',
    'collectible_coffee_mug',
    'collectible_singing_fish',
    'collectible_reddiwip',
    'collectible_arcade_cabinet',
    'collectible_neon_tony_sign',
    'collectible_signed_jersey_legend',
    'collectible_bapple_tree',
  ],
};

/**
 * Batch B2 — the four that take the launch commitment from eight to twelve.
 *
 * Specified now so that the moment Batch B is in hand there is a package ready
 * rather than a week of specification. Chosen to **expand coverage** rather than
 * repeat it: see `docs/art/BATCH_B2_COLLECTIBLES_HANDOFF.md` for what each one
 * adds that the first eight do not test.
 */
export const BATCH_B2: ArtBatch = {
  key: 'B2',
  shows: 'the four that take the launch commitment from eight to twelve',
  handoff: 'docs/art/BATCH_B2_COLLECTIBLES_HANDOFF.md',
  slugs: [
    'collectible_portable_sauna',
    'collectible_burn_barrel',
    'collectible_cookie_tote',
    'collectible_checkered_cloth',
  ],
};

export const ART_BATCHES: readonly ArtBatch[] = [BATCH_B, BATCH_B2];

export function artBatch(key: string): ArtBatch {
  const found = ART_BATCHES.find((batch) => batch.key.toLowerCase() === key.toLowerCase());
  if (found === undefined) {
    throw new Error(
      `no art batch named "${key}". Known: ${ART_BATCHES.map((batch) => batch.key).join(', ')}`,
    );
  }
  return found;
}
