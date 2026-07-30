--
-- Weekly matchups — the record a fantasy fact is derived from.
--
-- `16 §5.2` names this table and `PRODUCT_DELIVERY_MANDATE.md §10` says why it
-- has to exist before any narrative copy: every publishable claim about a game
-- must be recomputable from a stored row, not from a query somebody ran once.
--
-- ## Points are stored in cents
--
-- A margin of 50.51 has to be exactly 50.51, forever, on every machine. Sleeper
-- sends `154.42` as a float, and 154.42 - 103.91 in IEEE 754 is
-- 50.510000000000005 — which would be published as a fact. `reconcile.ts`
-- already works in cents for the same reason and exports `toCents`/`fromCents`;
-- this table stores what that function produces.
--
-- ## What identifies a row
--
-- `(season_id, week, sleeper_matchup_id)`. Sleeper's matchup id is stable
-- within a week and is what makes a re-import idempotent — the alternative,
-- keying on the roster pair, breaks the moment two rosters meet twice in a
-- season, which the playoffs make possible.
--
-- Only *paired* rows land here. An unpaired roster has points and no game
-- (`ImportedWeek.unpairedRosterIds` — normal once the playoffs start, and true
-- of all ten rosters in week 18), and a table of games is the wrong place to
-- record a non-game. Those stay in the import's own report.
--
-- ## `disputed` is a stored fact, not a derived one
--
-- `16 §12`: 2024's finalized standings and its weekly points disagree for four
-- rosters, because NFL stat corrections kept landing after the season closed.
-- `reconcile.ts` reports the disagreement and **never resolves it**. A game
-- inside that disagreement is marked here at import time, so a fact derived
-- months later cannot silently publish a winner the official record contradicts
-- — it suppresses instead, with the reason.
--

CREATE TABLE "fantasy_matchups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"week" integer NOT NULL,
	"week_type" text NOT NULL,
	"sleeper_matchup_id" integer NOT NULL,
	"roster_a_id" integer NOT NULL,
	"roster_b_id" integer NOT NULL,
	"points_a_cents" integer NOT NULL,
	"points_b_cents" integer NOT NULL,
	"winner_roster_id" integer,
	"margin_cents" integer NOT NULL,
	"captured_at" timestamp with time zone,
	"disputed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fantasy_matchups_season_week_matchup_unique" UNIQUE("season_id","week","sleeper_matchup_id"),
	CONSTRAINT "fantasy_matchups_margin_matches_points" CHECK ("fantasy_matchups"."margin_cents" = abs("fantasy_matchups"."points_a_cents" - "fantasy_matchups"."points_b_cents")),
	CONSTRAINT "fantasy_matchups_distinct_rosters" CHECK ("fantasy_matchups"."roster_a_id" <> "fantasy_matchups"."roster_b_id"),
	CONSTRAINT "fantasy_matchups_winner_played" CHECK ("fantasy_matchups"."winner_roster_id" is null
        or "fantasy_matchups"."winner_roster_id" = "fantasy_matchups"."roster_a_id"
        or "fantasy_matchups"."winner_roster_id" = "fantasy_matchups"."roster_b_id")
);
--> statement-breakpoint
CREATE TABLE "significance_policies" (
	"version" text PRIMARY KEY NOT NULL,
	"tiers" jsonb NOT NULL,
	"provisional" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fantasy_matchups" ADD CONSTRAINT "fantasy_matchups_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fantasy_matchups_season_week_idx" ON "fantasy_matchups" USING btree ("season_id","week");--> statement-breakpoint

--
-- A finalized season's games are immutable.
--
-- Same reasoning as `season_memberships` in `0003`: application discipline is
-- exactly what fails at 5am eighteen months from now, so the rule lives where
-- every code path has to go through it. What it protects is the result — the
-- rosters, the points, the winner, the margin. What it deliberately does not
-- protect is `disputed`, `captured_at` and the timestamps: those are annotation
-- about our knowledge of the game, not the game, and a commissioner who
-- re-reconciles a season must be able to record what they found.
--
CREATE FUNCTION reject_finalized_matchup_change() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM seasons s
    WHERE s.id = OLD.season_id AND s.finalized_at IS NOT NULL
  ) AND (
    NEW.week,            NEW.sleeper_matchup_id,
    NEW.roster_a_id,     NEW.roster_b_id,
    NEW.points_a_cents,  NEW.points_b_cents,
    NEW.winner_roster_id, NEW.margin_cents
  ) IS DISTINCT FROM (
    OLD.week,            OLD.sleeper_matchup_id,
    OLD.roster_a_id,     OLD.roster_b_id,
    OLD.points_a_cents,  OLD.points_b_cents,
    OLD.winner_roster_id, OLD.margin_cents
  ) THEN
    RAISE EXCEPTION
      'fantasy_matchups row % belongs to a finalized season; its result is immutable',
      OLD.id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER fantasy_matchups_finalized_immutable
  BEFORE UPDATE ON "fantasy_matchups"
  FOR EACH ROW EXECUTE FUNCTION reject_finalized_matchup_change();--> statement-breakpoint

--
-- And cannot be deleted. Delete-and-reinsert is the obvious way around an
-- update guard.
--
CREATE FUNCTION reject_finalized_matchup_delete() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM seasons s
    WHERE s.id = OLD.season_id AND s.finalized_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'fantasy_matchups row % belongs to a finalized season and cannot be deleted',
      OLD.id
      USING ERRCODE = '23514';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER fantasy_matchups_finalized_undeletable
  BEFORE DELETE ON "fantasy_matchups"
  FOR EACH ROW EXECUTE FUNCTION reject_finalized_matchup_delete();--> statement-breakpoint

--
-- Significance policies are append-only. A stored version is never rewritten,
-- because facts point at it: a recalibration is a new version, not an edit.
--
CREATE FUNCTION reject_significance_policy_rewrite() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'significance_policies is append-only; a recalibration is a new version, not an edit to %',
    OLD.version
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER significance_policies_append_only
  BEFORE UPDATE OR DELETE ON "significance_policies"
  FOR EACH ROW EXECUTE FUNCTION reject_significance_policy_rewrite();
