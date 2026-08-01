--
-- The commissioner review chain — what has to exist before a Slice can be published.
--
-- `16 §9`, verbatim: *"Commissioner approval mandatory in season one. The manual
-- hold switch is permanent."* `16 §4.3`'s Tuesday chain ends **`draft Slice →
-- notify commissioner`**, and until this migration there was nowhere for that
-- notification to land: no review queue, no approval state, no publication
-- record. `lib/slice/edition.ts` said so in its own header.
--
-- That gap is the reason the Tuesday job stayed off. A cron whose last step has
-- nowhere to go would either publish an issue nobody approved or drop the draft
-- on the floor.
--
-- ## Identity, versions, and why the status lives on the version
--
-- `08 §23` requires an immutable version snapshot at publication and says
-- corrections *"create a new version with a visible correction note"* rather than
-- rewriting league history. So the thing that moves through `draft →
-- needs_review → approved → published` is a **version**, and the **issue** is the
-- stable identity that versions belong to — one row per (season, week), forever.
--
-- Putting the status on the issue instead would make a published issue with a
-- correction draft ambiguous: published and in review at the same time. Two
-- states on one row is how a publication gate gets bypassed by accident.
--
-- ## What is enforced here rather than in a service
--
-- The discipline `0004`, `0005`, `0006` and `0010` set, for the same reason: a
-- rule in a service is true of the callers somebody remembered. The one that
-- matters most is the last:
--
--   - **A version's content is immutable.** Only its status and decision fields
--     may change. An approval that could be applied to different prose than the
--     one that was read is not an approval.
--   - **Regeneration is idempotent by natural key.** `UNIQUE(issue_id,
--     content_hash)` — the deterministic renderer produces identical bytes from
--     an identical packet, so re-running the Tuesday job appends nothing.
--   - **A version the validator refused can never be approved or published.**
--     `08 §27`: *"Validation failure: block publication until corrected."*
--   - **A version can only be published from `approved`**, and only when an
--     `approved` review row naming a real person exists for that exact version.
--     `08 §29`: *"commissioner approval is mandatory in season one."*
--   - **One published version per issue**, and the issue's pointer must agree
--     with it.
--   - **The manual hold blocks publication outright**, at the database, for
--     every caller. `16 §9` makes it permanent, and a permanent switch that
--     lives in a service is a switch one code path can forget.
--   - **Review history is append-only.** `08 §22`: *"all edits and approvals
--     must be audit logged."*
--

--
-- Where a version is in the chain.
--
--   - `draft`        — rendered, not yet put in front of anybody
--   - `needs_review` — awaiting the commissioner. This is the queue
--   - `approved`     — cleared, not yet on the rack
--   - `published`    — on the rack. Terminal except for being superseded
--   - `rejected`     — refused, with a note. **Terminal for this version**;
--                      revision means a new version, so the prose that was
--                      rejected survives beside the prose that replaced it
--   - `superseded`   — was published, and a correction replaced it. The row
--                      stays: `08 §23` forbids silently rewriting history
--
CREATE TYPE "public"."slice_version_status" AS ENUM(
  'draft', 'needs_review', 'approved', 'published', 'rejected', 'superseded'
);--> statement-breakpoint

--
-- Which renderer produced the prose.
--
-- `16 §9` gives the template renderer as the default and the LLM as an optional
-- per-story second opinion. `template` is the only value anything writes today —
-- there is no API key and `AUTONOMY.md §4` makes that a standing decision — and
-- the column exists so a published version records what wrote it rather than
-- leaving it to be inferred from the deploy date.
--
CREATE TYPE "public"."slice_renderer" AS ENUM('template', 'llm');--> statement-breakpoint

--
-- What happened to a version, in the order it happened.
--
-- `generated` and `superseded` can be the system's; everything else names a
-- person, enforced by CHECK below.
--
CREATE TYPE "public"."slice_review_action" AS ENUM(
  'generated', 'submitted', 'approved', 'rejected', 'published', 'superseded'
);--> statement-breakpoint

--
-- One week's issue. The identity, not the content.
--
CREATE TABLE "slice_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"week" integer NOT NULL,
	--
	-- Which version is on the rack. Null until something is published, which is
	-- the state every issue starts in and most issues spend their life in.
	--
	"published_version_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	--
	-- The stable draft identity `16 §4.3`'s job needs: running Tuesday twice finds
	-- the same issue rather than starting a second one.
	--
	CONSTRAINT "slice_issues_one_per_week" UNIQUE("season_id","week"),
	CONSTRAINT "slice_issues_week_positive" CHECK ("slice_issues"."week" > 0),
	--
	-- Published-ness is one fact, so it cannot be half-recorded.
	--
	CONSTRAINT "slice_issues_publication_complete" CHECK (
	  ("slice_issues"."published_version_id" IS NULL) = ("slice_issues"."published_at" IS NULL)
	)
);--> statement-breakpoint

ALTER TABLE "slice_issues" ADD CONSTRAINT "slice_issues_season_id_seasons_id_fk"
	FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

--
-- One rendering of one issue. Append-only content, mutable status.
--
CREATE TABLE "slice_issue_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	--
	-- 1, 2, 3 … within the issue. What a correction note refers to.
	--
	"version" integer NOT NULL,
	"status" "public"."slice_version_status" NOT NULL DEFAULT 'draft',
	"renderer" "public"."slice_renderer" NOT NULL DEFAULT 'template',
	--
	-- The rendered `Edition`, exactly as the rack will serve it. Stored rather
	-- than re-derived: `08 §28` — *"the published issue is stored content, not
	-- live-generated content"* — and a stat correction in March must not silently
	-- reword an issue printed in October.
	--
	"content" jsonb NOT NULL,
	--
	-- A digest of `content`. The idempotency key for regeneration, and the thing a
	-- reviewer's approval is actually against.
	--
	"content_hash" text NOT NULL,
	--
	-- The deterministic validator's verdict (`lib/slice/validate.ts`), stored with
	-- the version it judged. A verdict recomputed at read time is a verdict about
	-- today's code rather than about what was approved.
	--
	"verdict" jsonb NOT NULL,
	"publishable" boolean NOT NULL,
	--
	-- What the prose was built from: candidates and their significance scores,
	-- suppressions and their reasons, the allowed numbers and names. `08 §22`
	-- requires the review screen to show all of it, and it has to be the packet
	-- *this* version was rendered from rather than a fresh one.
	--
	"packet" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	--
	-- When the version last moved through the chain. Null while it is a draft
	-- nobody has acted on.
	--
	"decided_at" timestamp with time zone,
	CONSTRAINT "slice_versions_numbered" UNIQUE("issue_id","version"),
	--
	-- Regeneration idempotency, as a database guarantee rather than a check in a
	-- service. The renderer is deterministic, so an unchanged week re-renders to
	-- the same bytes and the insert is a no-op the caller reads back.
	--
	CONSTRAINT "slice_versions_content_once" UNIQUE("issue_id","content_hash"),
	CONSTRAINT "slice_versions_version_positive" CHECK ("slice_issue_versions"."version" > 0),
	--
	-- A refused version can be a draft and can be rejected. It can never be
	-- anything else. `08 §27`, at the table.
	--
	CONSTRAINT "slice_versions_unpublishable_stays_out" CHECK (
	  "slice_issue_versions"."publishable"
	  OR "slice_issue_versions"."status" IN ('draft', 'needs_review', 'rejected')
	)
);--> statement-breakpoint

ALTER TABLE "slice_issue_versions" ADD CONSTRAINT "slice_versions_issue_id_fk"
	FOREIGN KEY ("issue_id") REFERENCES "public"."slice_issues"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "slice_issues" ADD CONSTRAINT "slice_issues_published_version_id_fk"
	FOREIGN KEY ("published_version_id") REFERENCES "public"."slice_issue_versions"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

--
-- One published version per issue, ever. A partial unique index rather than a
-- trigger, because "at most one row like this" is exactly what an index says.
--
CREATE UNIQUE INDEX "slice_versions_one_published" ON "slice_issue_versions" ("issue_id")
  WHERE "status" = 'published';--> statement-breakpoint

CREATE INDEX "slice_versions_queue_idx" ON "slice_issue_versions" ("status","created_at");--> statement-breakpoint

--
-- The audit history. Append-only, one row per thing that happened.
--
CREATE TABLE "slice_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	--
	-- The order things happened in.
	--
	-- Not `occurred_at`: that comes from the injected clock, and a test clock —
	-- or two decisions inside one transaction — stamps several rows with the same
	-- instant. The first version of this table ordered by the timestamp and
	-- printed *"put up for review"* above *"drafted"* on the review screen.
	--
	"seq" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
	"issue_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"action" "public"."slice_review_action" NOT NULL,
	--
	-- Null only for the actions a job can take on its own. Every decision names a
	-- person — see the CHECK.
	--
	"actor_user_id" uuid,
	--
	-- Required on a rejection: a refusal without a reason is not reviewable, and
	-- the next version is authored against it.
	--
	"note" text,
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "slice_reviews_seq_unique" UNIQUE("seq"),
	--
	-- **A version is generated once, submitted once, approved once, rejected
	-- once, published once, superseded once.** Every action in the enum is
	-- terminal for the version it names — `rejected` and `published` because the
	-- transition table says so, the rest because the chain only passes through
	-- each state on the way somewhere else.
	--
	-- This is what makes publication idempotent **under concurrency**, and it was
	-- added because a test asked for it: ten simultaneous publishes of one
	-- approved version produced *five* publication rows. The service's
	-- already-published check is a read, and under READ COMMITTED four other
	-- transactions had read `approved` before the first committed. The status
	-- update then re-read a row that was already `published`, found NEW.status =
	-- OLD.status, and returned without complaint.
	--
	-- The same shape as `stake_resolutions.stake_id UNIQUE`: a natural key on the
	-- thing that must happen once, rather than a check the winner performs.
	--
	CONSTRAINT "slice_reviews_one_per_action" UNIQUE("version_id","action"),
	CONSTRAINT "slice_reviews_decisions_are_attributed" CHECK (
	  "slice_reviews"."action" IN ('generated', 'submitted', 'superseded')
	  OR "slice_reviews"."actor_user_id" IS NOT NULL
	),
	CONSTRAINT "slice_reviews_rejection_needs_a_reason" CHECK (
	  "slice_reviews"."action" <> 'rejected'
	  OR ("slice_reviews"."note" IS NOT NULL AND length(btrim("slice_reviews"."note")) > 0)
	)
);--> statement-breakpoint

ALTER TABLE "slice_reviews" ADD CONSTRAINT "slice_reviews_issue_id_fk"
	FOREIGN KEY ("issue_id") REFERENCES "public"."slice_issues"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "slice_reviews" ADD CONSTRAINT "slice_reviews_version_id_fk"
	FOREIGN KEY ("version_id") REFERENCES "public"."slice_issue_versions"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "slice_reviews" ADD CONSTRAINT "slice_reviews_actor_user_id_fk"
	FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "slice_reviews_version_idx" ON "slice_reviews" ("version_id","seq");--> statement-breakpoint

--
-- The manual hold switch (`16 §9`, permanent).
--
-- Append-only, so "who stopped publication and why" is answerable a year later.
-- The current state is the highest `seq`; an identity column rather than a
-- timestamp comparison, because two rows written in the same millisecond must
-- still have an order.
--
CREATE TABLE "slice_publication_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
	"held" boolean NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"reason" text,
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "slice_holds_seq_unique" UNIQUE("seq")
);--> statement-breakpoint

ALTER TABLE "slice_publication_holds" ADD CONSTRAINT "slice_holds_actor_user_id_fk"
	FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

--
-- ---------------------------------------------------------------------------
-- The guarantees
-- ---------------------------------------------------------------------------
--

--
-- A version's content, its packet, its verdict and its place in the numbering
-- cannot be edited. Status and `decided_at` can.
--
-- This is what makes an approval mean something: the bytes a commissioner read
-- are the bytes that publish.
--
CREATE FUNCTION reject_slice_version_content_edit() RETURNS trigger AS $$
BEGIN
  IF NEW.issue_id IS DISTINCT FROM OLD.issue_id
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.content::text IS DISTINCT FROM OLD.content::text
     OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
     OR NEW.packet::text IS DISTINCT FROM OLD.packet::text
     OR NEW.verdict::text IS DISTINCT FROM OLD.verdict::text
     OR NEW.publishable IS DISTINCT FROM OLD.publishable
     OR NEW.renderer IS DISTINCT FROM OLD.renderer
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION
      'a slice version is immutable once written; revise by generating a new version'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER slice_versions_content_immutable
  BEFORE UPDATE ON "slice_issue_versions"
  FOR EACH ROW EXECUTE FUNCTION reject_slice_version_content_edit();--> statement-breakpoint

--
-- Only the transitions the chain actually has.
--
-- Written as an explicit table of pairs rather than as a set of guards, because
-- the interesting question about a publication gate is *"what else can reach
-- published"*, and that is only answerable if every legal move is in one place.
--
CREATE FUNCTION enforce_slice_version_transition() RETURNS trigger AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
       (OLD.status = 'draft'        AND NEW.status = 'needs_review')
    OR (OLD.status = 'draft'        AND NEW.status = 'rejected')
    OR (OLD.status = 'needs_review' AND NEW.status = 'approved')
    OR (OLD.status = 'needs_review' AND NEW.status = 'rejected')
    OR (OLD.status = 'approved'     AND NEW.status = 'published')
    OR (OLD.status = 'approved'     AND NEW.status = 'rejected')
    OR (OLD.status = 'published'    AND NEW.status = 'superseded')
  ) THEN
    RAISE EXCEPTION
      'a slice version cannot go from % to %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  --
  -- The gate. `08 §29`: commissioner approval is mandatory, so publication
  -- requires an `approved` review row naming a person, for *this exact version*.
  --
  -- Reaching `published` already requires passing through `approved` above; this
  -- is the second, independent condition — that a human decision was recorded
  -- rather than a status column set. A service that skipped the review row would
  -- be a service that published without a reviewer.
  --
  IF NEW.status = 'published' THEN
    IF NOT EXISTS (
      SELECT 1 FROM slice_reviews r
      WHERE r.version_id = NEW.id
        AND r.action = 'approved'
        AND r.actor_user_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION
        'refusing to publish a slice version with no recorded commissioner approval'
        USING ERRCODE = '23514';
    END IF;

    --
    -- The manual hold. `16 §9` makes it permanent, so it is checked here rather
    -- than by whichever caller remembers.
    --
    IF EXISTS (
      SELECT 1 FROM slice_publication_holds h
      WHERE h.held
        AND h.seq = (SELECT max(seq) FROM slice_publication_holds)
    ) THEN
      RAISE EXCEPTION
        'slice publication is on hold; release the hold before publishing'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER slice_versions_legal_transitions
  BEFORE UPDATE ON "slice_issue_versions"
  FOR EACH ROW EXECUTE FUNCTION enforce_slice_version_transition();--> statement-breakpoint

CREATE FUNCTION reject_slice_version_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'slice versions are never deleted; a replaced version is superseded'
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER slice_versions_undeletable
  BEFORE DELETE ON "slice_issue_versions"
  FOR EACH ROW EXECUTE FUNCTION reject_slice_version_delete();--> statement-breakpoint

--
-- The issue's pointer has to agree with the version it points at.
--
-- `DEFERRABLE INITIALLY DEFERRED` would be the other way to do this; a
-- constraint trigger checked at statement time is enough because publication is
-- one transaction that sets the version's status first and the pointer second.
--
CREATE FUNCTION enforce_slice_issue_pointer() RETURNS trigger AS $$
BEGIN
  IF NEW.published_version_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM slice_issue_versions v
      WHERE v.id = NEW.published_version_id
        AND v.issue_id = NEW.id
        AND v.status = 'published'
    ) THEN
      RAISE EXCEPTION
        'slice_issues.published_version_id must name a published version of this issue'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER slice_issues_pointer_agrees
  BEFORE INSERT OR UPDATE ON "slice_issues"
  FOR EACH ROW EXECUTE FUNCTION enforce_slice_issue_pointer();--> statement-breakpoint

CREATE FUNCTION reject_slice_review_rewrite() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'slice_reviews is append-only; an approval cannot be edited or removed'
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER slice_reviews_append_only
  BEFORE UPDATE OR DELETE ON "slice_reviews"
  FOR EACH ROW EXECUTE FUNCTION reject_slice_review_rewrite();--> statement-breakpoint

CREATE FUNCTION reject_slice_hold_rewrite() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'slice_publication_holds is append-only; flip the switch with a new row'
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER slice_holds_append_only
  BEFORE UPDATE OR DELETE ON "slice_publication_holds"
  FOR EACH ROW EXECUTE FUNCTION reject_slice_hold_rewrite();
