--
-- The preseason issue — draft facts, Tony's judgment, and the issue kind that
-- lets a special edition exist beside a weekly one.
--
-- ## What this is for
--
-- The first Tuesday Slice of 2026 falls **before** week one has been played, so
-- there is no result to recap. Forcing the weekly structure onto that Tuesday
-- produces an empty paper: `factPacket` refuses with `no-week`, the desk stays
-- empty, and the league's first ever issue is the one that never printed.
--
-- The commissioner's ruling is that the first issue is a **Draft Review and
-- Season Preview** special. Three things had to exist in the database for that
-- to be more than a template:
--
--   1. the draft, as Sleeper recorded it — objective, verifiable, never invented;
--   2. Tony's grade and take per manager — **editorial**, supplied by the
--      commissioner ghost-writing Tony, and deliberately not derivable;
--   3. a way for one season to hold a preseason issue *and* eighteen weekly
--      ones without them colliding on `slice_issues`.
--
-- ## The line this migration draws, and why it is two tables and not one
--
-- `draft_picks` is what Sleeper says. `slice_draft_reviews` is what Tony
-- thinks. They are separate tables because they have different authorities,
-- different mutability and different failure modes: a pick is immutable once the
-- draft is complete, and a grade is edited right up until the paper is approved.
--
-- Mixing them — a `grade` column on a season membership, say — would put an
-- opinion inside a table whose whole guarantee is that Sleeper owns it, which is
-- the mixing `CLAUDE.md` forbids in as many words: *"do not overwrite
-- Sleeper-derived facts with editorial data."*
--
-- ## What is enforced here rather than in a service
--
--   - **A draft belongs to exactly one season**, and its picks are numbered
--     once: `UNIQUE(draft_id, pick_no)`.
--   - **A pick is immutable once written.** A draft that has finished cannot
--     change, so a re-sync that rewrote a pick would be rewriting history to
--     match a payload — the failure `08 §23` names. Re-syncing is an insert of
--     what is missing, never an update of what is there.
--   - **Tony may only praise a pick that manager actually made.** A trigger,
--     not a foreign key, in exactly the shape `0006` uses for the Showcase: an
--     FK can say *"that pick exists"* and cannot say *"that pick is theirs"*.
--   - **A grade is one of thirteen values.** An enum, so `A+`, `B-` and `F` are
--     the domain and `"pretty good"` is not storable at all.
--   - **A take is required and bounded.** Required because an issue is not
--     publishable without one; bounded because ten unbounded takes is not a
--     newspaper page, it is ten essays.
--   - **One review per manager per season**, so *"7 of 10 reviewed"* is a count
--     rather than a deduplication.
--
-- ## `slice_issues` gains a kind, and the preseason issue is week 0
--
-- The smallest change that lets both editions live in one table. `week 0` is
-- *"before week one"* — a slot, never a printed number; the preseason dateline
-- says `Draft Review` and no surface renders the zero. Keeping the preseason
-- issue inside `slice_issues` means it inherits the whole approval chain from
-- `0011` unchanged: the same immutability, the same one-published-version index,
-- the same commissioner-approval trigger, the same manual hold.
--
-- `UNIQUE(season_id, week)` is **untouched** — weekly issues are week >= 1 and
-- the preseason issue is week 0, so the existing constraint already separates
-- them. That is why this migration adds a column and swaps one CHECK rather
-- than rebuilding an index.
--

--
-- Which kind of paper an issue is.
--
-- `weekly` is the default so every existing row keeps its meaning without a
-- backfill, and so a caller that forgets to say produces the ordinary thing
-- rather than a special edition.
--
CREATE TYPE "public"."slice_issue_kind" AS ENUM('weekly', 'preseason');--> statement-breakpoint

--
-- Where a draft is in its life. Sleeper's own vocabulary, not a translation.
--
-- Only `complete` is actionable: the preseason issue reviews a finished board,
-- and a draft that stopped at pick 90 is not one.
--
CREATE TYPE "public"."draft_status" AS ENUM('pre_draft', 'drafting', 'complete', 'unknown');--> statement-breakpoint

--
-- Tony's grade domain.
--
-- Thirteen values, the ordinary American report-card scale. An enum rather than
-- a CHECK on text because the editor renders the domain as thirteen buttons and
-- reading it out of the schema is how the screen and the database stay the same
-- thirteen.
--
-- There is no `A++`, no numeric score and no half-step. A wider domain would
-- make two adjacent grades indistinguishable to a reader, which is the whole
-- job of a grade.
--
CREATE TYPE "public"."tony_grade" AS ENUM(
  'A+', 'A', 'A-',
  'B+', 'B', 'B-',
  'C+', 'C', 'C-',
  'D+', 'D', 'D-',
  'F'
);--> statement-breakpoint

--
-- One season's draft, as Sleeper recorded it.
--
CREATE TABLE "season_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	--
	-- Sleeper's own id. Unique across the product, because a draft belongs to
	-- one league and a league to one season.
	--
	"sleeper_draft_id" text NOT NULL,
	"status" "public"."draft_status" NOT NULL,
	--
	-- `snake` · `linear` · `auction`. Recorded rather than assumed: the shape of
	-- a draft decides whether *"picked from the 7 spot"* means anything at all,
	-- and this league snakes.
	--
	"type" text NOT NULL,
	"rounds" integer,
	--
	-- When the last pick landed. The draft's real end, and the only date the
	-- paper prints about it.
	--
	"completed_at" timestamp with time zone,
	--
	-- When the payload was read. A draft is immutable once complete, so this is
	-- provenance rather than freshness — but a claim with no capture time is a
	-- claim the product cannot date (`MANDATE §9`).
	--
	"captured_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "season_drafts_one_per_season" UNIQUE("season_id"),
	CONSTRAINT "season_drafts_sleeper_id_unique" UNIQUE("sleeper_draft_id"),
	CONSTRAINT "season_drafts_rounds_positive" CHECK (
	  "season_drafts"."rounds" IS NULL OR "season_drafts"."rounds" > 0
	)
);--> statement-breakpoint

ALTER TABLE "season_drafts" ADD CONSTRAINT "season_drafts_season_id_fk"
	FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

--
-- One pick. Sleeper's, entirely.
--
CREATE TABLE "draft_picks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	--
	-- 1..N across the whole draft.
	--
	"pick_no" integer NOT NULL,
	"round" integer NOT NULL,
	--
	-- The board position that made it. Null only where Sleeper omitted it.
	--
	"draft_slot" integer,
	--
	-- The seat, not the person.
	--
	-- Every seat-shaped fact in this product resolves through the roster
	-- (`16 §4`), because permanent identity and a seasonal seat are separate and
	-- a manager can take over a roster. The review joins this to
	-- `season_memberships` to find out whose pick it was.
	--
	"roster_id" integer,
	--
	-- Sleeper's player id: `7564` for a person, `DEN` for a defense.
	--
	"sleeper_player_id" text,
	--
	-- As printed. It arrives inside the pick's own metadata, which is why this
	-- feature needs no join against the 14.6 MB player catalog.
	--
	"player_name" text NOT NULL,
	--
	-- `QB` · `RB` · `WR` · `TE` · `DEF`. Never `K`: this league has no kickers,
	-- and the CHECK says so rather than trusting that it stays true.
	--
	"position" text,
	"nfl_team" text,
	"is_keeper" boolean NOT NULL DEFAULT false,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "draft_picks_numbered_once" UNIQUE("draft_id","pick_no"),
	CONSTRAINT "draft_picks_pick_no_positive" CHECK ("draft_picks"."pick_no" > 0),
	CONSTRAINT "draft_picks_round_positive" CHECK ("draft_picks"."round" > 0),
	CONSTRAINT "draft_picks_named" CHECK (length(btrim("draft_picks"."player_name")) > 0),
	--
	-- The league has no kickers (`CLAUDE.md`, `00`, `16`). A kicker in the draft
	-- would mean the league's format changed under the product, and the paper
	-- would print a position it says does not exist. Refuse the row and let
	-- somebody look.
	--
	CONSTRAINT "draft_picks_no_kickers" CHECK (
	  "draft_picks"."position" IS NULL OR upper("draft_picks"."position") <> 'K'
	)
);--> statement-breakpoint

ALTER TABLE "draft_picks" ADD CONSTRAINT "draft_picks_draft_id_fk"
	FOREIGN KEY ("draft_id") REFERENCES "public"."season_drafts"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "draft_picks_roster_idx" ON "draft_picks" ("draft_id","roster_id","pick_no");--> statement-breakpoint

--
-- Tony's judgment of one manager's draft.
--
-- **The only editorial table in the product**, and the reason it is allowed to
-- exist is that the alternative is worse: a draft grade cannot be derived. This
-- product has no ADP, no projection, no consensus source and no roster-value
-- model, and `docs/PRESEASON_SLICE_BOUNDARY.md` records the commissioner's
-- decision that it never will. So the grade is an opinion, it is Tony's, and a
-- person supplies it.
--
-- It is mutable, unlike almost everything else here, and that is deliberate: a
-- grade is edited until the issue is approved. What makes that safe is that
-- publication **snapshots** the rendered edition into `slice_issue_versions`
-- (`0011`), whose content is immutable by trigger — so editing a grade after
-- publication changes the next paper and cannot touch the one already printed.
--
CREATE TABLE "slice_draft_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	--
	-- The manager being reviewed — the **person**, because a review is about a
	-- manager's draft and a manager is permanent.
	--
	"user_id" uuid NOT NULL,
	"grade" "public"."tony_grade" NOT NULL,
	--
	-- Tony's short take. Required: an issue is not publishable without one.
	--
	"take" text NOT NULL,
	--
	-- Optional. Tony's favourite pick of theirs — a **real pick**, referenced,
	-- so the paper cannot praise a player this manager never drafted.
	--
	"best_pick_id" uuid,
	--
	-- Optional. One concern, in Tony's words.
	--
	"concern" text,
	--
	-- Who wrote it. Alex ghost-writing Tony — an implementation fact, kept out
	-- of the paper entirely and visible only on the desk.
	--
	"updated_by" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "slice_draft_reviews_one_per_manager" UNIQUE("season_id","user_id"),
	--
	-- A take with nothing in it is not a take, and a take longer than this is
	-- not a slice of a newspaper. 240 is measured rather than picked: at
	-- `TYPE.body` it is five lines at 360px, which is the most one of ten
	-- sections can take before the page stops being scannable.
	--
	CONSTRAINT "slice_draft_reviews_take_present" CHECK (
	  length(btrim("slice_draft_reviews"."take")) > 0
	),
	CONSTRAINT "slice_draft_reviews_take_bounded" CHECK (
	  length("slice_draft_reviews"."take") <= 240
	),
	--
	-- Optional means absent, not blank. A concern stored as `''` would render as
	-- an empty heading with nothing under it.
	--
	CONSTRAINT "slice_draft_reviews_concern_present_if_set" CHECK (
	  "slice_draft_reviews"."concern" IS NULL
	  OR (length(btrim("slice_draft_reviews"."concern")) > 0
	      AND length("slice_draft_reviews"."concern") <= 160)
	)
);--> statement-breakpoint

ALTER TABLE "slice_draft_reviews" ADD CONSTRAINT "slice_draft_reviews_season_id_fk"
	FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "slice_draft_reviews" ADD CONSTRAINT "slice_draft_reviews_user_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "slice_draft_reviews" ADD CONSTRAINT "slice_draft_reviews_best_pick_id_fk"
	FOREIGN KEY ("best_pick_id") REFERENCES "public"."draft_picks"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "slice_draft_reviews" ADD CONSTRAINT "slice_draft_reviews_updated_by_fk"
	FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

--
-- ---------------------------------------------------------------------------
-- The guarantees
-- ---------------------------------------------------------------------------
--

--
-- A completed draft's picks are immutable.
--
-- A re-sync inserts what is missing and never rewrites what is there. If
-- Sleeper's payload disagreed with a stored pick, the honest response is that
-- somebody looks — not that the product silently adopts the newer answer and
-- loses the record of what it printed last week.
--
CREATE FUNCTION reject_draft_pick_rewrite() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'draft picks are immutable once recorded; a completed draft does not change'
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER draft_picks_immutable
  BEFORE UPDATE OR DELETE ON "draft_picks"
  FOR EACH ROW EXECUTE FUNCTION reject_draft_pick_rewrite();--> statement-breakpoint

--
-- Tony may only name a pick that this manager actually made.
--
-- A trigger rather than a foreign key, in exactly the shape `0006` uses for the
-- Showcase, and for exactly the same reason: an FK can say *"that pick exists"*
-- and cannot say *"that pick is theirs"*. Praising a player somebody else
-- drafted is the one falsehood this feature could produce that a reader would
-- believe, because it looks like every other sentence on the page.
--
-- The chain is pick → draft → season, and pick → roster → membership → the same
-- season. Both halves are checked: a pick from *last* season's draft is as wrong
-- as another manager's pick from this one.
--
CREATE FUNCTION enforce_draft_review_best_pick() RETURNS trigger AS $$
BEGIN
  IF NEW.best_pick_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM draft_picks p
    JOIN season_drafts d ON d.id = p.draft_id
    JOIN season_memberships m
      ON m.season_id = d.season_id
     AND m.roster_id = p.roster_id
    WHERE p.id = NEW.best_pick_id
      AND d.season_id = NEW.season_id
      AND m.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION
      'a draft review may only name a pick that manager made in that season''s draft'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER slice_draft_reviews_best_pick_is_theirs
  BEFORE INSERT OR UPDATE ON "slice_draft_reviews"
  FOR EACH ROW EXECUTE FUNCTION enforce_draft_review_best_pick();--> statement-breakpoint

--
-- ---------------------------------------------------------------------------
-- The issue kind
-- ---------------------------------------------------------------------------
--

ALTER TABLE "slice_issues"
  ADD COLUMN "kind" "public"."slice_issue_kind" NOT NULL DEFAULT 'weekly';--> statement-breakpoint

--
-- Week 0 is the preseason slot, and only the preseason may use it.
--
-- The old CHECK was `week > 0`. Relaxing it to `week >= 0` on its own would let
-- a weekly issue claim week zero, which is a week nobody played; the second
-- CHECK ties the zero to the kind in both directions, so `(preseason, week 3)`
-- and `(weekly, week 0)` are both unwritable.
--
ALTER TABLE "slice_issues" DROP CONSTRAINT "slice_issues_week_positive";--> statement-breakpoint

ALTER TABLE "slice_issues" ADD CONSTRAINT "slice_issues_week_not_negative"
  CHECK ("slice_issues"."week" >= 0);--> statement-breakpoint

ALTER TABLE "slice_issues" ADD CONSTRAINT "slice_issues_preseason_is_week_zero"
  CHECK (("slice_issues"."kind" = 'preseason') = ("slice_issues"."week" = 0));--> statement-breakpoint

--
-- An issue's kind cannot change.
--
-- A weekly issue that became a preseason one — or the reverse — would leave a
-- published version whose stored content no longer matches the kind it is
-- served as. There is no reason to move it and one very bad outcome if it moves,
-- so the database refuses.
--
CREATE FUNCTION reject_slice_issue_kind_change() RETURNS trigger AS $$
BEGIN
  IF NEW.kind IS DISTINCT FROM OLD.kind THEN
    RAISE EXCEPTION
      'a slice issue cannot change kind once created'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER slice_issues_kind_immutable
  BEFORE UPDATE ON "slice_issues"
  FOR EACH ROW EXECUTE FUNCTION reject_slice_issue_kind_change();
