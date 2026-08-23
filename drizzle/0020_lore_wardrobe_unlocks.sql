-- Lore wardrobe unlocks — commissioner-authorized 2026-08-23.
--
-- A pizza box still records exactly one `collectible_*` reward. Selected
-- inside-joke pulls additionally earn a separate `wear_*` ownership row, so a
-- manager can actually grow their character without changing the fixed 24-item
-- reward table. The runtime service makes new grants; this migration gives the
-- same benefit to managers who pulled the lore item before that service shipped.
--
-- `collectibles_one_wearable_each` (0009) is the natural idempotency key. It
-- lets this be safely replayed without inventing a mutable entitlement table.

INSERT INTO "collectibles" ("user_id", "slug", "rarity", "acquired_at")
SELECT owned."user_id", unlock."wearable_slug", unlock."wearable_rarity"::"collectible_rarity", owned."acquired_at"
FROM "collectibles" AS owned
JOIN (
  VALUES
    ('collectible_bapple_tree', 'wear_head_pizza_visor', 'common'),
    ('collectible_burn_barrel', 'wear_head_beanie_winter', 'common'),
    ('collectible_cookie_tote', 'wear_head_paper_hat', 'rare'),
    ('collectible_checkered_cloth', 'wear_body_apron_tony', 'rare'),
    ('collectible_signed_jersey_legend', 'wear_body_jersey_blank', 'rare'),
    ('collectible_portable_sauna', 'wear_body_tracksuit', 'common'),
    ('collectible_neon_tony_sign', 'wear_body_delivery_uniform', 'epic'),
    ('collectible_freddy_bowl', 'wear_face_shades', 'common'),
    ('collectible_reddiwip', 'wear_face_mustache_fake', 'rare'),
    ('collectible_pizza_cutter', 'wear_hand_pizza_peel', 'rare'),
    ('collectible_pizza_pusher', 'wear_hand_slice', 'common'),
    ('collectible_arcade_cabinet', 'wear_hand_trophy_mini', 'epic')
) AS unlock("collectible_slug", "wearable_slug", "wearable_rarity")
  ON unlock."collectible_slug" = owned."slug"
ON CONFLICT DO NOTHING;
