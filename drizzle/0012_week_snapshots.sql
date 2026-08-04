-- The pre-Monday score snapshot — `16 §4.3`'s first cron, and the only way the
-- Monday-comeback stories `07 §8` requires can be truthful.
--
-- The unique constraint below is the *correctness* mechanism rather than a
-- dedupe: the first capture of a week is the one that counts, permanently. A
-- retry an hour later would photograph a state that already includes Monday
-- scoring, so an upsert would silently turn every comeback claim of that week
-- into a false statement. See `docs/SUNDAY_SNAPSHOT_BOUNDARY.md`.

CREATE TABLE "week_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "season_id" uuid NOT NULL,
  "week" integer NOT NULL,
  "sleeper_matchup_id" integer NOT NULL,
  "roster_a_id" integer NOT NULL,
  "roster_b_id" integer NOT NULL,
  "points_a_cents" integer NOT NULL,
  "points_b_cents" integer NOT NULL,
  "captured_at" timestamp with time zone NOT NULL,
  "source" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "week_snapshots_season_week_matchup_unique"
    UNIQUE("season_id","week","sleeper_matchup_id"),
  CONSTRAINT "week_snapshots_week_positive" CHECK ("week_snapshots"."week" > 0),
  CONSTRAINT "week_snapshots_points_sane"
    CHECK ("week_snapshots"."points_a_cents" >= -10000
       AND "week_snapshots"."points_b_cents" >= -10000),
  CONSTRAINT "week_snapshots_rosters_differ"
    CHECK ("week_snapshots"."roster_a_id" <> "week_snapshots"."roster_b_id")
);--> statement-breakpoint

ALTER TABLE "week_snapshots" ADD CONSTRAINT "week_snapshots_season_id_seasons_id_fk"
  FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "week_snapshots_season_week_idx"
  ON "week_snapshots" USING btree ("season_id","week");--> statement-breakpoint

-- Append-only, and this one matters more than the others in this schema.
--
-- Every append-only table here protects an audit trail. This protects a *fact*:
-- the score before Monday is unrecoverable once Monday has happened, so a row
-- that can be edited is a row that can quietly become a lie about a moment
-- nobody can go back and check.
CREATE FUNCTION reject_week_snapshot_rewrite() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'week_snapshots is append-only; the score before Monday cannot be recaptured'
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER week_snapshots_append_only
  BEFORE UPDATE OR DELETE ON "week_snapshots"
  FOR EACH ROW EXECUTE FUNCTION reject_week_snapshot_rewrite();
