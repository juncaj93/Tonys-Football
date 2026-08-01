--
-- Weekly stakes — one table, one type discriminator.
--
-- `16 §9`, verbatim: *"Weekly stakes (one table, type discriminator)"*, covering
-- the three approved families:
--
--   - **Tony's Line** — one market per week, the line set at a season median,
--     fixed stake, fixed 2x payout, settled from finalized results
--   - **Bounties** — a machine-checkable condition chosen at authoring time,
--     auto-settling, rolling over until claimed
--   - **Chalkboard prediction** — one deterministic prediction a week; the next
--     issue checks it and Tony gloats or eats it
--
-- Three families, one table, because they are the same object: a claim made in
-- advance from verified facts, checked later against finalized ones. Three
-- tables would give three settlement paths, three idempotency stories and three
-- places for a duplicate payout to hide.
--
-- ## What is enforced here rather than in a service
--
-- The same discipline `0004`, `0005` and `0006` set, for the same reason: a rule
-- in a service is true of the callers somebody remembered.
--
--   - **A stake resolves once, ever.** `stake_resolutions.stake_id` is UNIQUE,
--     which is the whole idempotency mechanism — the natural key `0004` used for
--     opening a box, not the caller-supplied key `0005` needed for a ledger
--     event. A retry reads the existing resolution back.
--   - **A resolved stake is immutable.** Its outcome, its evidence and the facts
--     it read cannot be edited or deleted, so a later Sleeper mutation cannot
--     rewrite what was settled.
--   - **An entry's pick is immutable, and its settlement is written once.** A
--     manager's side cannot change after the fact and a payout cannot be
--     recorded twice.
--   - **Only the outcomes a kind can actually have.** A chalkboard prediction
--     cannot resolve `unclaimed`; a bounty cannot resolve `push`. A CHECK, not a
--     convention.
--   - **A stake's reward is settled through `apply_token_delta` only.** Nothing
--     here writes a balance; the ledger's own idempotency key does that work.
--

--
-- Week-level finality — what the Tuesday job (`16 §4.3`) writes.
--
-- ## Why this table has to exist for stakes to work at all
--
-- Two rules were in force and they contradicted each other the moment a stake
-- tried to pay anybody:
--
--   1. **A stake settles only from finalized results.** Anything else moves
--      tokens on a number that can still change.
--   2. **`apply_token_delta` refuses a finalized season** (`03 §6` closes the
--      books).
--
-- With season-level finality as the only kind, a stake was settleable exactly
-- when it was unpayable. A database test found it — every payout raised — and
-- the resolution is not to relax either rule. It is that they are about
-- **different things**: a *week* is final on Tuesday, and a *season* closes in
-- January. `16 §4.3` already allows exactly the job that draws that line.
--
-- ## One row per week, written once, never rewritten
--
-- `UNIQUE(season_id, week)` makes finalizing idempotent by natural key, and the
-- append-only trigger means a week cannot be un-finalized. A settlement that
-- rested on a finality that could be withdrawn would be a settlement resting on
-- nothing.
--
CREATE TABLE "week_finalizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"week" integer NOT NULL,
	--
	-- How many publishable games the week held when it was closed. Recorded so a
	-- later disagreement about what was settled has a number to compare against,
	-- rather than a re-derivation from rows that may since have moved.
	--
	"games" integer NOT NULL,
	"finalized_at" timestamp with time zone NOT NULL,
	CONSTRAINT "week_finalizations_one_per_week" UNIQUE("season_id","week"),
	CONSTRAINT "week_finalizations_week_positive" CHECK ("week_finalizations"."week" > 0),
	CONSTRAINT "week_finalizations_games_positive" CHECK ("week_finalizations"."games" > 0)
);--> statement-breakpoint

ALTER TABLE "week_finalizations" ADD CONSTRAINT "week_finalizations_season_id_seasons_id_fk"
	FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

CREATE FUNCTION reject_week_finalization_rewrite() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'week_finalizations is append-only; week % of that season is closed', OLD.week
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER week_finalizations_append_only
  BEFORE UPDATE OR DELETE ON "week_finalizations"
  FOR EACH ROW EXECUTE FUNCTION reject_week_finalization_rewrite();--> statement-breakpoint

CREATE TYPE "public"."stake_kind" AS ENUM('TONYS_LINE', 'BOUNTY', 'CHALKBOARD');--> statement-breakpoint

--
-- `open` is the only state a stake is authored into. Everything else is terminal.
--
--   - `resolved` — settled from a finalized week. The evidence is on the
--     resolution row and a manager can recompute the outcome from it.
--   - `expired` — a bounty reached its last eligible week with nobody claiming
--     it. Terminal, and it still gets a resolution row: *"nobody did it"* is an
--     answer and the audit trail has to carry it.
--   - `void` — suppressed or cancelled, with a reason. The row survives, because
--     a stake that was shown to managers and then withdrawn is history rather
--     than a mistake to delete.
--
CREATE TYPE "public"."stake_status" AS ENUM('open', 'resolved', 'expired', 'void');--> statement-breakpoint

--
-- What a resolution decided. The mapping is per kind and is CHECKed below.
--
--   - `hit` / `missed`  — the chalkboard: Tony was right, or he was not
--   - `hit` / `unclaimed` — a bounty: somebody did it, or the window closed
--   - `settled` / `push` — Tony's Line: the reference number was published and
--     each entry paid from it, or the line landed exactly on the number and
--     every stake came back
--
-- `settled` exists because a market's stake-level outcome is not a verdict — the
-- field splits, and the verdict is per entry. Calling it `hit` would be a lie
-- told by an enum.
--
CREATE TYPE "public"."stake_outcome" AS ENUM('hit', 'missed', 'push', 'unclaimed', 'settled');--> statement-breakpoint

--
-- Who authored it. `system_author` is the deterministic authoring pass; a
-- commissioner-authored stake is a different provenance and must stay
-- distinguishable forever.
--
CREATE TYPE "public"."stake_source" AS ENUM('system_author', 'commissioner');--> statement-breakpoint

--
-- What a resolution read.
--
-- Two sources, and a stored resolution keeps saying which one it used:
--
--   - `finalized_week` — a `week_finalizations` row. The Tuesday job's answer,
--     and the one every live-season settlement will carry.
--   - `season_closed` — the season's own `finalized_at`. How a historical week
--     settles, and the only source available before the Tuesday job exists.
--
-- Keeping them apart matters because they were written by different things at
-- different times, and *"which of these did we trust"* is the first question
-- anybody asks about a settlement they disagree with.
--
CREATE TYPE "public"."stake_resolution_source" AS ENUM('finalized_week', 'season_closed');--> statement-breakpoint

CREATE TYPE "public"."stake_entry_outcome" AS ENUM('won', 'lost', 'push');--> statement-breakpoint

CREATE TABLE "weekly_stakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,

	"season_id" uuid NOT NULL,

	--
	-- The week this stake is *about*.
	--
	-- For Tony's Line and the chalkboard that is the week it settles against. For
	-- a bounty it is the week it opened, and `expires_after_week` says how far it
	-- rolls.
	--
	"week" integer NOT NULL,

	"kind" "stake_kind" NOT NULL,

	--
	-- The stable, human-readable identity — `2025-w07-tonys-line`.
	--
	-- Deterministic, so re-running the authoring pass is a no-op rather than a
	-- second stake. That is the same property the seeded welcome box has and for
	-- the same reason: an author that ran twice must not double the product.
	--
	"stake_key" text NOT NULL,

	"status" "stake_status" DEFAULT 'open' NOT NULL,

	--
	-- The variant within the kind — `season-median` for a line, `week-score` for
	-- a bounty, `nobody-clears-record` for a prediction.
	--
	-- Stored rather than derived because the authoring rules will change and a
	-- historical stake must keep meaning what it meant. Together with
	-- `author_version` this is what lets a 2026 stake be read correctly in 2029.
	--
	"variant" text NOT NULL,

	--
	-- Who was eligible, snapshotted at authoring.
	--
	-- A snapshot rather than a live query, because eligibility is a fact about
	-- the moment the stake was offered. A manager who leaves the league in
	-- November was still eligible in September, and recomputing it later would
	-- quietly rewrite who was invited.
	--
	"eligible_user_ids" uuid[] NOT NULL,

	--
	-- The verified facts this stake was built from, as data.
	--
	-- `{ basisWeeks, gameKeys, values }` — the weeks read, the game keys behind
	-- them, and the numbers that came out. The same discipline the fact packet
	-- applies to prose: a claim that cannot be recomputed from stored references
	-- is not auditable, whatever it says about itself.
	--
	"fact_refs" jsonb NOT NULL,

	--
	-- What a renderer may say about this stake, declared up front.
	--
	-- Exactly `FactPacket.allowedNumbers` / `allowedNames`, so the Slice's own
	-- validator checks a chalkboard line without a second implementation. A
	-- validator that derived its own allowed values would be marking its own
	-- homework (`MANDATE §10`).
	--
	"allowed_numbers" text[] NOT NULL,
	"allowed_names" text[] NOT NULL,

	"created_by" "stake_source" DEFAULT 'system_author' NOT NULL,

	--
	-- Content hash of the authoring rules that produced this row.
	--
	-- The reward table's property, applied here: a re-authoring under new rules
	-- is a new stake, and a historical one stays interpretable against the rules
	-- that made it.
	--
	"author_version" text NOT NULL,

	--
	-- The fixed stake and the reward, in tokens. Both nullable, because two of
	-- the three kinds have neither.
	--
	--   - Tony's Line: `stake_tokens` is debited on a pick, `reward_tokens` is
	--     what a winning pick is credited — `16 §9`'s fixed 2x payout, so the
	--     credit is twice the stake and the CHECK below says so.
	--   - Bounty: `reward_tokens` only. Nobody stakes anything on a bounty.
	--   - Chalkboard: neither. Tony's consequence is his reputation.
	--
	"stake_tokens" integer,
	"reward_tokens" integer,

	--
	-- The last week a bounty may still be claimed in. Null means it rolls until
	-- the season closes, which is `16 §9`'s *"rolling over until claimed"*.
	--
	"expires_after_week" integer,

	--
	-- The ledger key prefix every payout from this stake is namespaced under.
	--
	-- Derived from `stake_key` and stored, not recomputed: a replayed settlement
	-- must reach the same ledger rows even if the derivation changes.
	--
	"settlement_key" text NOT NULL,

	--
	-- Why it was withdrawn, when it was. Never overwritten by a later state.
	--
	"void_reason" text,
	"voided_at" timestamp with time zone,

	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,

	CONSTRAINT "weekly_stakes_key_unique" UNIQUE("stake_key"),
	CONSTRAINT "weekly_stakes_settlement_key_unique" UNIQUE("settlement_key"),
	CONSTRAINT "weekly_stakes_week_positive" CHECK ("weekly_stakes"."week" > 0),
	CONSTRAINT "weekly_stakes_expiry_after_open" CHECK (
		"weekly_stakes"."expires_after_week" is null
		or "weekly_stakes"."expires_after_week" >= "weekly_stakes"."week"
	),
	--
	-- Only a bounty rolls. A line or a prediction that carried an expiry would be
	-- describing a settlement rule it does not have.
	--
	CONSTRAINT "weekly_stakes_only_bounties_roll" CHECK (
		"weekly_stakes"."expires_after_week" is null
		or "weekly_stakes"."kind" = 'BOUNTY'
	),
	--
	-- Money belongs to the kinds that have it, and 2x is the payout `16 §9`
	-- fixes. Enforced here so a rebalance cannot quietly change the multiplier
	-- from a service.
	--
	CONSTRAINT "weekly_stakes_line_pays_double" CHECK (
		("weekly_stakes"."kind" = 'TONYS_LINE'
			and "weekly_stakes"."stake_tokens" > 0
			and "weekly_stakes"."reward_tokens" = "weekly_stakes"."stake_tokens" * 2)
		or ("weekly_stakes"."kind" = 'BOUNTY'
			and "weekly_stakes"."stake_tokens" is null
			and "weekly_stakes"."reward_tokens" > 0)
		or ("weekly_stakes"."kind" = 'CHALKBOARD'
			and "weekly_stakes"."stake_tokens" is null
			and "weekly_stakes"."reward_tokens" is null)
	),
	CONSTRAINT "weekly_stakes_void_has_reason" CHECK (
		("weekly_stakes"."status" = 'void')
			= ("weekly_stakes"."void_reason" is not null)
	)
);--> statement-breakpoint

ALTER TABLE "weekly_stakes" ADD CONSTRAINT "weekly_stakes_season_id_seasons_id_fk"
	FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "weekly_stakes_season_week_idx" ON "weekly_stakes" ("season_id","week");--> statement-breakpoint
CREATE INDEX "weekly_stakes_open_idx" ON "weekly_stakes" ("season_id","status");--> statement-breakpoint

--
-- A manager's pick. Tony's Line is the only kind that has them today.
--
-- One row per (stake, manager) — a market where you can take both sides is not a
-- market. The pick is immutable and the settlement columns are written exactly
-- once, both by trigger below.
--
CREATE TABLE "stake_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,

	"stake_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,

	--
	-- `over` or `under`. Text rather than an enum because the vocabulary is the
	-- variant's, not the table's: a later line variant may take sides that are
	-- not two halves of a number. `stake_entries_side_known` keeps today honest.
	--
	"side" text NOT NULL,

	--
	-- What was debited when the pick was made, recorded on the entry.
	--
	-- Not read back off the stake at settlement: the stake's `stake_tokens` is
	-- what the market charges *now*, and this is what this manager actually paid.
	-- They are the same today and they must not be assumed to be.
	--
	"staked_tokens" integer NOT NULL,

	"outcome" "stake_entry_outcome",
	"payout_tokens" integer,
	"settled_at" timestamp with time zone,

	"created_at" timestamp with time zone NOT NULL,

	CONSTRAINT "stake_entries_one_per_manager" UNIQUE("stake_id","user_id"),
	CONSTRAINT "stake_entries_side_known" CHECK ("stake_entries"."side" in ('over','under')),
	CONSTRAINT "stake_entries_stake_positive" CHECK ("stake_entries"."staked_tokens" > 0),
	--
	-- Settled means all three columns, or none of them. A half-written settlement
	-- is the shape a duplicate payout hides in.
	--
	CONSTRAINT "stake_entries_settlement_complete" CHECK (
		("stake_entries"."outcome" is null
			and "stake_entries"."payout_tokens" is null
			and "stake_entries"."settled_at" is null)
		or ("stake_entries"."outcome" is not null
			and "stake_entries"."payout_tokens" is not null
			and "stake_entries"."settled_at" is not null)
	),
	CONSTRAINT "stake_entries_payout_non_negative" CHECK (
		"stake_entries"."payout_tokens" is null or "stake_entries"."payout_tokens" >= 0
	)
);--> statement-breakpoint

ALTER TABLE "stake_entries" ADD CONSTRAINT "stake_entries_stake_id_weekly_stakes_id_fk"
	FOREIGN KEY ("stake_id") REFERENCES "public"."weekly_stakes"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stake_entries" ADD CONSTRAINT "stake_entries_user_id_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "stake_entries_stake_idx" ON "stake_entries" ("stake_id");--> statement-breakpoint

--
-- The resolution. **One per stake, forever.**
--
-- `stake_id` is UNIQUE and that single constraint is the idempotency mechanism —
-- the same argument `0004` makes for `box_openings.box_id`. A stake resolves
-- once; the operation therefore has a natural key and needs no caller-supplied
-- one. Two concurrent settlement attempts produce one resolution and one set of
-- payouts.
--
CREATE TABLE "stake_resolutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,

	"stake_id" uuid NOT NULL,

	"outcome" "stake_outcome" NOT NULL,

	"resolved_from" "stake_resolution_source" DEFAULT 'finalized_week' NOT NULL,

	--
	-- The week whose finalized results decided it. Not always the stake's own
	-- week: a bounty opened in week three and claimed in week nine resolves from
	-- week nine.
	--
	"resolved_week" integer NOT NULL,

	--
	-- Who satisfied a bounty. Null on every other kind and on an unclaimed one.
	--
	"claimed_by_user_id" uuid,

	--
	-- Why it resolved the way it did, as recomputable data.
	--
	-- `{ statement, gameKeys, values }` — a sentence in the shop's voice, the
	-- games it rests on, and the numbers. This is the audit history the product
	-- owes a manager who asks *"how did that settle"*, and it is deliberately not
	-- a rendered string alone: prose cannot be recomputed against.
	--
	"evidence" jsonb NOT NULL,

	"resolved_at" timestamp with time zone NOT NULL,

	CONSTRAINT "stake_resolutions_one_per_stake" UNIQUE("stake_id"),
	CONSTRAINT "stake_resolutions_week_positive" CHECK ("stake_resolutions"."resolved_week" > 0)
);--> statement-breakpoint

ALTER TABLE "stake_resolutions" ADD CONSTRAINT "stake_resolutions_stake_id_weekly_stakes_id_fk"
	FOREIGN KEY ("stake_id") REFERENCES "public"."weekly_stakes"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stake_resolutions" ADD CONSTRAINT "stake_resolutions_claimed_by_users_id_fk"
	FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."users"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

--
-- Which outcomes each kind may actually take.
--
-- A trigger rather than a CHECK because the kind lives on the other table, and a
-- rule that has to read a second row cannot be a column constraint. The
-- alternative — denormalising `kind` onto the resolution — would put a second
-- copy of the discriminator somewhere it could disagree.
--
CREATE FUNCTION stake_resolution_matches_kind() RETURNS trigger AS $$
DECLARE
  k stake_kind;
BEGIN
  SELECT kind INTO k FROM weekly_stakes WHERE id = NEW.stake_id;

  IF k = 'CHALKBOARD' AND NEW.outcome NOT IN ('hit', 'missed') THEN
    RAISE EXCEPTION
      'a chalkboard prediction is right or wrong, never %', NEW.outcome
      USING ERRCODE = '23514';
  END IF;

  IF k = 'BOUNTY' AND NEW.outcome NOT IN ('hit', 'unclaimed') THEN
    RAISE EXCEPTION
      'a bounty is claimed or it is not, never %', NEW.outcome
      USING ERRCODE = '23514';
  END IF;

  IF k = 'TONYS_LINE' AND NEW.outcome NOT IN ('settled', 'push') THEN
    RAISE EXCEPTION
      'a market settles or it pushes; the verdict is per entry, not %', NEW.outcome
      USING ERRCODE = '23514';
  END IF;

  -- Only a bounty has a claimant, and only a claimed one.
  IF NEW.claimed_by_user_id IS NOT NULL AND (k <> 'BOUNTY' OR NEW.outcome <> 'hit') THEN
    RAISE EXCEPTION
      'only a claimed bounty has a claimant'
      USING ERRCODE = '23514';
  END IF;

  IF k = 'BOUNTY' AND NEW.outcome = 'hit' AND NEW.claimed_by_user_id IS NULL THEN
    RAISE EXCEPTION
      'a claimed bounty names who claimed it'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER stake_resolutions_match_kind
  BEFORE INSERT ON "stake_resolutions"
  FOR EACH ROW EXECUTE FUNCTION stake_resolution_matches_kind();--> statement-breakpoint

--
-- A resolution is append-only.
--
-- The same guard the openings, the ledger, the reward tables and the significance
-- policies carry. *"Do not allow later Sleeper mutations to rewrite finalized
-- outcomes"* is only true if the row cannot be rewritten at all — a stat
-- correction landing in March must not change what a manager was paid in
-- October.
--
CREATE FUNCTION reject_stake_resolution_rewrite() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'stake_resolutions is append-only; stake % settled and its outcome is history',
    OLD.stake_id
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER stake_resolutions_append_only
  BEFORE UPDATE OR DELETE ON "stake_resolutions"
  FOR EACH ROW EXECUTE FUNCTION reject_stake_resolution_rewrite();--> statement-breakpoint

--
-- A resolved stake stops moving.
--
-- Status may advance out of `open`, and the void reason may be written on the way
-- to `void`. Nothing else changes once a resolution exists — not the line, not
-- the eligibility snapshot, not the facts it read.
--
CREATE FUNCTION reject_settled_stake_change() RETURNS trigger AS $$
BEGIN
  IF (
    NEW.kind, NEW.week, NEW.stake_key, NEW.variant, NEW.eligible_user_ids,
    NEW.fact_refs, NEW.allowed_numbers, NEW.allowed_names, NEW.author_version,
    NEW.stake_tokens, NEW.reward_tokens, NEW.expires_after_week, NEW.settlement_key,
    NEW.season_id, NEW.created_by
  ) IS DISTINCT FROM (
    OLD.kind, OLD.week, OLD.stake_key, OLD.variant, OLD.eligible_user_ids,
    OLD.fact_refs, OLD.allowed_numbers, OLD.allowed_names, OLD.author_version,
    OLD.stake_tokens, OLD.reward_tokens, OLD.expires_after_week, OLD.settlement_key,
    OLD.season_id, OLD.created_by
  ) THEN
    RAISE EXCEPTION
      'weekly_stakes row % is a published offer; its terms are immutable', OLD.id
      USING ERRCODE = '23514';
  END IF;

  IF OLD.status <> 'open' AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION
      'weekly_stakes row % is already %; a terminal stake does not change state',
      OLD.id, OLD.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER weekly_stakes_terms_immutable
  BEFORE UPDATE ON "weekly_stakes"
  FOR EACH ROW EXECUTE FUNCTION reject_settled_stake_change();--> statement-breakpoint

--
-- A stake that was offered is never deleted.
--
CREATE FUNCTION reject_stake_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'weekly_stakes row % was offered to the league; withdraw it with status void instead',
    OLD.id
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER weekly_stakes_undeletable
  BEFORE DELETE ON "weekly_stakes"
  FOR EACH ROW EXECUTE FUNCTION reject_stake_delete();--> statement-breakpoint

--
-- A pick is immutable, and it settles once.
--
-- The pick columns can never change: a manager who could switch sides after
-- kickoff is not making a prediction. The settlement columns can be written
-- exactly once — from null to a value — which is what makes a replayed
-- settlement a no-op at the row level as well as at the ledger's.
--
CREATE FUNCTION reject_stake_entry_change() RETURNS trigger AS $$
BEGIN
  IF (NEW.stake_id, NEW.user_id, NEW.side, NEW.staked_tokens, NEW.created_at)
     IS DISTINCT FROM
     (OLD.stake_id, OLD.user_id, OLD.side, OLD.staked_tokens, OLD.created_at) THEN
    RAISE EXCEPTION
      'stake_entries row % is a placed pick; it cannot be changed', OLD.id
      USING ERRCODE = '23514';
  END IF;

  IF OLD.settled_at IS NOT NULL THEN
    RAISE EXCEPTION
      'stake_entries row % is already settled; a payout is written once', OLD.id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER stake_entries_settle_once
  BEFORE UPDATE ON "stake_entries"
  FOR EACH ROW EXECUTE FUNCTION reject_stake_entry_change();--> statement-breakpoint

CREATE FUNCTION reject_stake_entry_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'stake_entries row % is a placed pick and part of the audit trail', OLD.id
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER stake_entries_undeletable
  BEFORE DELETE ON "stake_entries"
  FOR EACH ROW EXECUTE FUNCTION reject_stake_entry_delete();--> statement-breakpoint

--
-- Two more token reasons, for the two ways a stake moves money.
--
-- `apply_token_delta` takes a `token_reason`, so a stake payout that reused
-- `COMMISSIONER_ADJUSTMENT` would be indistinguishable from a manual correction
-- on a manager's own statement. Adding the values is the whole change: the
-- function, the balance trigger and the overdraft CHECK are untouched, and
-- settlement gets no write path of its own.
--
ALTER TYPE "public"."token_reason" ADD VALUE IF NOT EXISTS 'STAKE_PLACED';--> statement-breakpoint
ALTER TYPE "public"."token_reason" ADD VALUE IF NOT EXISTS 'STAKE_PAYOUT';
