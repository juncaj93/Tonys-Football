ALTER TABLE "season_memberships" ADD COLUMN "team_name" text;--> statement-breakpoint
ALTER TABLE "season_memberships" ADD COLUMN "wins" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "season_memberships" ADD COLUMN "losses" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "season_memberships" ADD COLUMN "ties" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "season_memberships" ADD COLUMN "points_for" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "season_memberships" ADD COLUMN "points_against" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "season_memberships" ADD COLUMN "made_playoffs" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "finalized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "snapshot_captured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sleeper_username" text;--> statement-breakpoint
--
-- Finalized seasons are immutable.
--
-- Once a season is explicitly finalized, its official historical record stops
-- being negotiable. The reason this is a trigger and not an `if` in the
-- importer is that application discipline is exactly what fails at 5am on a
-- Tuesday eighteen months from now: any code path, any script, any hand-run
-- UPDATE has to go through it.
--
-- What it protects is the set of fields that constitute the official record
-- plus the identity of the seat. What it deliberately does NOT protect is
-- `sleeper_metadata`, `is_active`, and the timestamps — those are annotation,
-- not result, and a commissioner may still correct them.
--
-- Un-finalizing is left possible on purpose: clearing `seasons.finalized_at`
-- is a deliberate, visible admin act, and the alternative is a season nobody
-- can ever repair.
--
CREATE FUNCTION reject_finalized_membership_change() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM seasons s
    WHERE s.id = OLD.season_id AND s.finalized_at IS NOT NULL
  ) AND (
    NEW.user_id,        NEW.roster_id,   NEW.co_owner_user_id,
    NEW.wins,           NEW.losses,      NEW.ties,
    NEW.points_for,     NEW.points_against,
    NEW.made_playoffs,  NEW.final_rank,  NEW.team_name
  ) IS DISTINCT FROM (
    OLD.user_id,        OLD.roster_id,   OLD.co_owner_user_id,
    OLD.wins,           OLD.losses,      OLD.ties,
    OLD.points_for,     OLD.points_against,
    OLD.made_playoffs,  OLD.final_rank,  OLD.team_name
  ) THEN
    RAISE EXCEPTION
      'season_memberships row % belongs to a finalized season; its official record is immutable',
      OLD.id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER season_memberships_finalized_immutable
  BEFORE UPDATE ON "season_memberships"
  FOR EACH ROW EXECUTE FUNCTION reject_finalized_membership_change();--> statement-breakpoint

--
-- A finalized season's membership rows cannot be deleted either. Deleting and
-- reinserting is the obvious way around an update guard, and it would take the
-- row's history with it.
--
CREATE FUNCTION reject_finalized_membership_delete() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM seasons s
    WHERE s.id = OLD.season_id AND s.finalized_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'season_memberships row % belongs to a finalized season and cannot be deleted',
      OLD.id
      USING ERRCODE = '23514';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER season_memberships_finalized_undeletable
  BEFORE DELETE ON "season_memberships"
  FOR EACH ROW EXECUTE FUNCTION reject_finalized_membership_delete();