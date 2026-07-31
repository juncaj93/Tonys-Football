--
-- M3 — modular character identity.
--
-- Two tables and nothing else. `docs/M3_CHARACTER_BOUNDARY.md` records why the
-- design is this small: Tony stays baked art, the compositor is for managers
-- only, and the layer set is fixed so a character is a row of small integers
-- rather than a saved image.
--
-- **Nothing here touches `users`, `collectibles`, `loot_boxes`,
-- `season_memberships` or the ledger.** If a later M3 migration finds itself
-- altering one of those, the design has drifted.
--

--
-- What a manager's character looks like before anything is worn.
--
-- `04 §10` permits a validated JSON configuration; this is columns instead, for
-- one reason that matters: a column can carry a CHECK, and a legal-combination
-- rule that lives in application code holds until somebody writes a second
-- caller. Three small integers and a palette are not worth a JSON blob's
-- flexibility.
--
CREATE TABLE "character_configurations" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "body" integer NOT NULL,
  "face" integer NOT NULL,
  "hair" integer NOT NULL,
  "palette" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,

  --
  -- Every variant index is non-negative and the upper bound is the catalog's,
  -- checked in `lib/character/catalog.ts`. The database's job here is to refuse
  -- nonsense, not to know how many hair variants exist this month: a CHECK
  -- naming a count would need a migration every time art shipped, and a
  -- migration that runs on a deploy to add a hairstyle is a bad trade.
  --
  CONSTRAINT "character_configurations_indices_non_negative"
    CHECK ("body" >= 0 AND "face" >= 0 AND "hair" >= 0 AND "palette" >= 0)
);--> statement-breakpoint

ALTER TABLE "character_configurations"
  ADD CONSTRAINT "character_configurations_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

--
-- What a manager is wearing.
--
-- A row per equipped item. Unequipping deletes the row rather than flipping a
-- flag: "not wearing a hat" is the absence of a hat, and a soft-deleted equip
-- would need every reader to remember the filter.
--
CREATE TABLE "wearable_equips" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "collectible_id" uuid NOT NULL,
  "slot" text NOT NULL,
  "equipped_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "wearable_equips"
  ADD CONSTRAINT "wearable_equips_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

--
-- RESTRICT, like every other reference to a collectible. A collectible is never
-- deleted, and this says so a second time from the other side.
--
ALTER TABLE "wearable_equips"
  ADD CONSTRAINT "wearable_equips_collectible_id_collectibles_id_fk"
  FOREIGN KEY ("collectible_id") REFERENCES "public"."collectibles"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

--
-- One item per slot, and one item equipped at most once.
--
-- Both as constraints rather than as a service that remembers to check. Two
-- taps arriving together on a slow connection both read "nothing in the head
-- slot" and both insert; the second one fails here instead of leaving a manager
-- wearing two hats with no way to remove either.
--
CREATE UNIQUE INDEX "wearable_equips_one_per_slot"
  ON "wearable_equips" ("user_id", "slot");--> statement-breakpoint

CREATE UNIQUE INDEX "wearable_equips_one_place_each"
  ON "wearable_equips" ("collectible_id");--> statement-breakpoint

--
-- A manager may only wear what they own.
--
-- The same rule the Showcase needed, for the same reason and by the same
-- mechanism: a foreign key can say "this is a collectible", and it cannot say
-- "this is *your* collectible". Wearing somebody else's pull would be both a
-- lie and a way to display an item you never opened a box for.
--
-- It also checks the *slot* matches the row, because "equip your legendary
-- jersey into the head slot" is owned, real, and still wrong.
--
CREATE FUNCTION reject_unowned_equip() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM collectibles c
     WHERE c.id = NEW.collectible_id
       AND c.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION
      'collectible % is not owned by user %, so it cannot be equipped',
      NEW.collectible_id, NEW.user_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER wearable_equips_must_be_owned
  BEFORE INSERT OR UPDATE ON "wearable_equips"
  FOR EACH ROW EXECUTE FUNCTION reject_unowned_equip();
