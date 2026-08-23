import { wearable } from './catalog';

/**
 * Lore pulls that earn a matching wardrobe bonus.
 *
 * Pizza boxes still roll only the canonical 24 `collectible_*` entries. This
 * map is a second, idempotent ownership grant after a successful pull, approved
 * by the commissioner on 2026-08-23 so the wardrobe has a real progression
 * route instead of an empty gallery.
 */
export const COLLECTIBLE_WEARABLE_UNLOCKS: Readonly<Record<string, string>> = Object.freeze({
  collectible_bapple_tree: 'wear_head_pizza_visor',
  collectible_burn_barrel: 'wear_head_beanie_winter',
  collectible_cookie_tote: 'wear_head_paper_hat',
  collectible_checkered_cloth: 'wear_body_apron_tony',
  collectible_signed_jersey_legend: 'wear_body_jersey_blank',
  collectible_portable_sauna: 'wear_body_tracksuit',
  collectible_neon_tony_sign: 'wear_body_delivery_uniform',
  collectible_freddy_bowl: 'wear_face_shades',
  collectible_reddiwip: 'wear_face_mustache_fake',
  collectible_pizza_cutter: 'wear_hand_pizza_peel',
  collectible_pizza_pusher: 'wear_hand_slice',
  collectible_arcade_cabinet: 'wear_hand_trophy_mini',
});

export function wearableUnlockedBy(collectibleSlug: string) {
  const slug = COLLECTIBLE_WEARABLE_UNLOCKS[collectibleSlug];
  return slug === undefined ? null : wearable(slug);
}
