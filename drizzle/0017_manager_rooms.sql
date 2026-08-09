-- Manager rooms — the basement, reopened.
--
-- `16 §3` deferred basements to v1.1 / Phase 6 on the grounds that *"the
-- Showcase carries the social weight at launch"*. The commissioner reopened the
-- scope on 2026-08-09 and asked for the smallest strong version that makes the
-- space meaningful. This is its storage.
--
-- Everything below is additive. No existing table, column, constraint or index
-- is altered, and nothing already in the database changes shape — which is what
-- makes this reversible by dropping two tables and two types.
--
-- ## What `16`'s P6 row asks for, and where each half lives
--
--   3 themes           `rooms.theme`
--   curated slots      `room_placements`, keyed by an enum of four places
--   visiting           nothing here — a visit is a read, and reads need no schema
--   character in-room  nothing here — the character is `character_configurations`
--
-- The last two are the interesting ones. A visit is `SELECT`, and a manager's
-- character already exists and is already permanent, so neither buys a column.
-- A room that stored a copy of either would be storing a derived fact, which is
-- the thing `16 §4.1` spends a section forbidding.
--
-- ## Inventory ≠ placement
--
-- P6's exit criterion, and the reason `room_placements` is a table rather than
-- four nullable columns on `rooms`. Ownership lives in `collectibles` and is
-- append-only and undeletable; placement is a pointer at it and is freely
-- mutable. Taking a thing off a shelf deletes a row here and touches nothing
-- that records anything that happened.

CREATE TYPE "public"."room_theme" AS ENUM('storeroom', 'rec_room', 'cold_store');--> statement-breakpoint
CREATE TYPE "public"."room_slot" AS ENUM('shelf_left', 'shelf_right', 'wall', 'bench');--> statement-breakpoint

--
-- One room per manager, hung off the permanent identity.
--
-- `16 §5.1`: permanent things FK to `users.id`, seasonal things FK to
-- `season_memberships.id`. `14 §5` says basements persist across seasons and
-- `00 §7` lists basement themes and displayed items among the things preserved
-- permanently at season close. A manager who sits out 2027 still has their room.
--
-- `user_id` is UNIQUE because the room is created lazily on first visit. Two
-- tabs opening `/rooms` at the same moment is ordinary, and the second insert
-- has to lose rather than mint a second basement.
--
CREATE TABLE "rooms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "theme" "room_theme" DEFAULT 'storeroom' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "rooms_user_id_unique" UNIQUE("user_id")
);--> statement-breakpoint

ALTER TABLE "rooms"
  ADD CONSTRAINT "rooms_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "rooms_user_idx" ON "rooms" USING btree ("user_id");--> statement-breakpoint

--
-- What is in a slot.
--
-- CASCADE on `room_id` and RESTRICT on `collectible_id`, and the asymmetry is
-- deliberate. A room is furniture — if one were ever deleted its arrangement
-- goes with it and nothing is lost. A collectible is a record of something that
-- happened, and `collectibles_undeletable` already refuses to delete one; the
-- RESTRICT says it again from this side, so a room can never be the reason a
-- deletion is attempted.
--
CREATE TABLE "room_placements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "room_id" uuid NOT NULL,
  "slot" "room_slot" NOT NULL,
  "collectible_id" uuid NOT NULL,
  "placed_at" timestamp with time zone NOT NULL,
  CONSTRAINT "room_placements_one_per_slot" UNIQUE("room_id", "slot"),
  CONSTRAINT "room_placements_one_place_per_item" UNIQUE("room_id", "collectible_id")
);--> statement-breakpoint

ALTER TABLE "room_placements"
  ADD CONSTRAINT "room_placements_room_id_rooms_id_fk"
  FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "room_placements"
  ADD CONSTRAINT "room_placements_collectible_id_collectibles_id_fk"
  FOREIGN KEY ("collectible_id") REFERENCES "public"."collectibles"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "room_placements_room_idx" ON "room_placements" USING btree ("room_id");--> statement-breakpoint

--
-- You may only display what you own.
--
-- The foreign key can say *this is a collectible*. It cannot say *this is your
-- collectible*, and that gap is the entire authorization rule for a room the
-- rest of the league can walk into: a placement pointing at somebody else's
-- legendary would be a lie told on the one surface that exists to say what you
-- have.
--
-- Enforced here rather than only in `lib/rooms/service.ts`, for the reason every
-- other guard in this schema is: an invariant that lives in the application
-- holds until somebody writes a second caller. A server action, a commissioner
-- fixing something by hand, a future backfill and a test all pass through this.
--
-- Exactly the shape of `0006`'s `reject_unowned_showcase`, and deliberately so —
-- the two rules are the same rule about two surfaces, and a reviewer who has read
-- one has read both.
--
CREATE FUNCTION reject_unowned_placement() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM collectibles c
      JOIN rooms r ON r.id = NEW.room_id
     WHERE c.id = NEW.collectible_id
       AND c.user_id = r.user_id
  ) THEN
    RAISE EXCEPTION
      'collectible % is not owned by the manager whose room % is, so it cannot be displayed',
      NEW.collectible_id, NEW.room_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER room_placements_must_be_owned
  BEFORE INSERT OR UPDATE ON "room_placements"
  FOR EACH ROW EXECUTE FUNCTION reject_unowned_placement();
