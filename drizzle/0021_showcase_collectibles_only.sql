-- The Showcase is for the 24-item pizza-box collection, not the Wardrobe.
--
-- 0020 grants `wear_*` ownership rows beside matching lore pulls. They are
-- real permanent property, but are equipment rather than shelf collectibles;
-- allowing one onto the league Showcase made the renderer call the box catalog
-- with a wearable slug. Repair any impossible legacy pick, then extend the
-- ownership trigger so every future caller gets the same boundary.

UPDATE "users"
SET "showcase_collectible_id" = NULL
WHERE "showcase_collectible_id" IN (
  SELECT "id" FROM "collectibles" WHERE "slug" LIKE 'wear_%'
);--> statement-breakpoint

CREATE OR REPLACE FUNCTION reject_unowned_showcase() RETURNS trigger AS $$
BEGIN
  IF NEW.showcase_collectible_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM collectibles c
        WHERE c.id = NEW.showcase_collectible_id
          AND c.user_id = NEW.id
          AND c.slug LIKE 'collectible_%'
     ) THEN
    RAISE EXCEPTION
      'collectible % is not an owned pizza-box collectible for user %, so it cannot be showcased',
      NEW.showcase_collectible_id, NEW.id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
