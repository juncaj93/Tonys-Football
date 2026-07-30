--
-- The collectible economy: owning a box, opening it, keeping what came out.
--
-- Entirely additive. Nothing existing is altered, so this migration is safe to
-- apply to a database serving live traffic.
--
-- Four tables and one idea: an opening is a historical fact, so every row that
-- records one is written once and never touched again. The triggers at the
-- bottom are what make that true rather than merely intended.
--
CREATE TYPE "public"."collectible_rarity" AS ENUM('common', 'rare', 'epic', 'legendary');--> statement-breakpoint
CREATE TYPE "public"."loot_box_kind" AS ENUM('standard');--> statement-breakpoint
CREATE TYPE "public"."loot_box_state" AS ENUM('UNOPENED', 'OPENED');--> statement-breakpoint
CREATE TABLE "box_openings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"box_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"collectible_slug" text NOT NULL,
	"rarity" "collectible_rarity" NOT NULL,
	"reward_table_version" text NOT NULL,
	"roll" integer NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	CONSTRAINT "box_openings_box_id_unique" UNIQUE("box_id")
);
--> statement-breakpoint
CREATE TABLE "collectibles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"rarity" "collectible_rarity" NOT NULL,
	"acquired_at" timestamp with time zone NOT NULL,
	"source_opening_id" uuid,
	CONSTRAINT "collectibles_source_opening_id_unique" UNIQUE("source_opening_id")
);
--> statement-breakpoint
CREATE TABLE "loot_boxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "loot_box_kind" DEFAULT 'standard' NOT NULL,
	"state" "loot_box_state" DEFAULT 'UNOPENED' NOT NULL,
	"source" text NOT NULL,
	"grant_key" text,
	"granted_at" timestamp with time zone NOT NULL,
	"opened_at" timestamp with time zone,
	CONSTRAINT "loot_boxes_grant_key_unique" UNIQUE("grant_key"),
	CONSTRAINT "loot_boxes_opened_at_matches_state" CHECK (("loot_boxes"."state" = 'OPENED') = ("loot_boxes"."opened_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "reward_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"kind" "loot_box_kind" NOT NULL,
	"entries" jsonb NOT NULL,
	"provisional" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_tables_version_unique" UNIQUE("version")
);
--> statement-breakpoint
ALTER TABLE "box_openings" ADD CONSTRAINT "box_openings_box_id_loot_boxes_id_fk" FOREIGN KEY ("box_id") REFERENCES "public"."loot_boxes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "box_openings" ADD CONSTRAINT "box_openings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "box_openings" ADD CONSTRAINT "box_openings_reward_table_version_reward_tables_version_fk" FOREIGN KEY ("reward_table_version") REFERENCES "public"."reward_tables"("version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectibles" ADD CONSTRAINT "collectibles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectibles" ADD CONSTRAINT "collectibles_source_opening_id_box_openings_id_fk" FOREIGN KEY ("source_opening_id") REFERENCES "public"."box_openings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loot_boxes" ADD CONSTRAINT "loot_boxes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "box_openings_user_idx" ON "box_openings" USING btree ("user_id","opened_at");--> statement-breakpoint
CREATE INDEX "collectibles_user_idx" ON "collectibles" USING btree ("user_id","acquired_at");--> statement-breakpoint
CREATE INDEX "loot_boxes_user_state_idx" ON "loot_boxes" USING btree ("user_id","state");--> statement-breakpoint

--
-- The audit trail is append-only, and the database is what enforces it.
--
-- `18 §4.3` requires openings to be auditable. An audit trail that any code
-- path can UPDATE is not one: the useful question a year from now is "what did
-- this person actually pull, and out of what table", and both halves of that
-- answer have to be the originals.
--
-- This follows the same reasoning as the finalized-season guards in
-- `0003_phase_a_correctness.sql`, for the same reason: application discipline is
-- exactly what fails at 5am on a Tuesday eighteen months from now. Any script,
-- any migration, any hand-run statement has to go through this.
--
-- Scope, deliberately:
--
--   * `reward_tables` — version, kind and entries are frozen. `provisional` is
--     NOT, because clearing it is how the P3 simulation signs a table off
--     (`16 §8`), and that is a legitimate later act on an existing row.
--   * `box_openings` — frozen entirely. Nothing about a completed roll is
--     annotation; every column is result.
--   * `collectibles` — identity is frozen (who owns it, what it is, where it
--     came from). Columns added later for the Showcase are not covered, which is
--     intentional: equipping a collectible is a state change, not a rewrite of
--     what you pulled.
--
-- Row-level triggers, so `TRUNCATE` does not fire them and the test harness can
-- still reset between files. That is the same trade `0003` documents: TRUNCATE
-- needs table ownership, which no application role holds, while UPDATE and
-- DELETE are what real code could plausibly issue.
--
CREATE FUNCTION reject_reward_table_rewrite() RETURNS trigger AS $$
BEGIN
  IF (NEW.version, NEW.kind, NEW.entries)
     IS DISTINCT FROM
     (OLD.version, OLD.kind, OLD.entries) THEN
    RAISE EXCEPTION
      'reward table % is immutable; store a new version instead of editing this one',
      OLD.version
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER reward_tables_immutable
  BEFORE UPDATE ON "reward_tables"
  FOR EACH ROW EXECUTE FUNCTION reject_reward_table_rewrite();--> statement-breakpoint

CREATE FUNCTION reject_reward_table_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'reward table % cannot be deleted; openings reference the table they rolled against',
    OLD.version
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER reward_tables_undeletable
  BEFORE DELETE ON "reward_tables"
  FOR EACH ROW EXECUTE FUNCTION reject_reward_table_delete();--> statement-breakpoint

CREATE FUNCTION reject_opening_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'box opening % is an append-only record and cannot be modified or deleted',
    OLD.id
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER box_openings_append_only
  BEFORE UPDATE OR DELETE ON "box_openings"
  FOR EACH ROW EXECUTE FUNCTION reject_opening_change();--> statement-breakpoint

--
-- A collectible's identity is permanent. `16 §5.1`: collectibles persist across
-- seasons and hang off the person, so reassigning one to a different `user_id`
-- is the exact failure the identity model exists to prevent — a replacement
-- manager inheriting the previous occupant's shelf.
--
CREATE FUNCTION reject_collectible_identity_change() RETURNS trigger AS $$
BEGIN
  IF (NEW.user_id, NEW.slug, NEW.rarity, NEW.source_opening_id, NEW.acquired_at)
     IS DISTINCT FROM
     (OLD.user_id, OLD.slug, OLD.rarity, OLD.source_opening_id, OLD.acquired_at) THEN
    RAISE EXCEPTION
      'collectible % is permanent; its owner, item, rarity and origin cannot change',
      OLD.id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER collectibles_identity_immutable
  BEFORE UPDATE ON "collectibles"
  FOR EACH ROW EXECUTE FUNCTION reject_collectible_identity_change();--> statement-breakpoint

CREATE FUNCTION reject_collectible_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'collectible % cannot be deleted; collectibles persist across seasons',
    OLD.id
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER collectibles_undeletable
  BEFORE DELETE ON "collectibles"
  FOR EACH ROW EXECUTE FUNCTION reject_collectible_delete();