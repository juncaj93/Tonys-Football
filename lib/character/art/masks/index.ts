import { type EncodedMask } from '../../mask';

import { AVATAR_BODY_STARTER_04 } from './avatar_body_starter_04';

/**
 * Painted build masks, by the slug they take over.
 *
 * ## Empty is the shipped state, and it is not a stub
 *
 * **No painted artwork exists yet.** The prototype (commissioner ruling,
 * 2026-08-11) authorises exactly one build — the T-shirt — and the art comes back
 * from a separate image-generation session. Until a mask is registered here, this
 * map is empty and **every manager renders through the drawn path, pixel for
 * pixel as before**, which is what makes landing the infrastructure ahead of the
 * art a safe thing to do rather than a leap.
 *
 * ## Adding one is a generated file plus a line here
 *
 * `npm run art:mask -- <file.png> <slug>` validates the delivered PNG and writes
 * `<slug>.ts` beside this file. Import it and add it to the map. Removing the
 * line reverts that build to the drawn sprite with nothing else to undo — which
 * is the property the whole per-layer swap contract exists for
 * (`art/ASSET_PIPELINE.md §1`).
 *
 * ## Why the mask ships as a module and not as a file read at runtime
 *
 * `composeCharacter` is pure and synchronous and runs **in the browser**, inside
 * the customiser's local preview, so that a manager tapping a colour sees the
 * identical function the server will run rather than an approximation of it
 * (`components/character/customiser.tsx`). A mask loaded from disk would exist on
 * one side of that and not the other, and the preview would quietly stop being
 * the truth.
 */
export const BUILD_MASKS: Readonly<Record<string, EncodedMask>> = Object.freeze({
  /**
   * The T-shirt, round 3, 2026-08-11. **The prototype, and the only painted build.**
   *
   * Passed with `--fit` — rescaled `0.952×` and moved 6 rows down, a normalisation
   * of placement only, reported in full at ingest. Unfitted it misses the shoulder
   * band by six rows and fails nothing else.
   *
   * The five other tops are still drawn, and a manager wearing one cannot tell any
   * of this happened. Deleting this line reverts the T-shirt to the drawn sprite
   * with nothing else to undo.
   */
  [AVATAR_BODY_STARTER_04.slug]: AVATAR_BODY_STARTER_04,
});

export function buildMask(slug: string): EncodedMask | null {
  return BUILD_MASKS[slug] ?? null;
}

/** Is this top painted? Decides whether the figure below the neck is drawn or painted. */
export function hasBuildMask(slug: string): boolean {
  return slug in BUILD_MASKS;
}
