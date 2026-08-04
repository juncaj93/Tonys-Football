--
-- Weekly token rewards — `03 §4`'s "fantasy performance is the primary source",
-- as the record of *why* a manager was paid.
--
-- ## Why a table at all, when the ledger is already idempotent
--
-- `token_transactions.idempotency_key UNIQUE` is genuinely sufficient to stop a
-- double payment, and this table does not repeat that job. It exists because the
-- ledger answers "what moved" and cannot answer three questions the commissioner
-- will ask the first time somebody disputes a Tuesday:
--
--   1. **Was week 5 rewarded?** The ledger can only be asked by parsing a text
--      key. Here it is an indexed `(season_id, week)` read.
--   2. **On what basis?** The ledger's `description` is prose for a receipt.
--      `03 §5` wants a *reason code*, and `MANDATE §9` forbids treating rendered
--      Tony prose as the fact. So the number that won — the score, the roster,
--      the game — is stored structurally beside the payment.
--   3. **Against which numbers?** `economy_configs` is versioned by content hash
--      precisely so a transaction stays interpretable, and that is only true if
--      the version in force is recorded at the point of award.
--
-- The unique constraint here is therefore a *second* lock on the same door, and
-- deliberately so: `weekly_rewards_once_per_manager_per_reason` states the rule
-- in the vocabulary of the domain ("one high-score award per week"), where the
-- ledger states it in the vocabulary of the key. If a future caller invents a
-- different key format, the ledger's lock silently stops protecting anything and
-- this one still holds.
--
-- ## What it deliberately does not have
--
-- No `updated_at`, no correction path, no soft delete. A reward is an event that
-- already moved money; changing it would leave the ledger describing a payment
-- that no longer matches its own justification. A mistake is corrected the way
-- `03 §5` says every mistake is corrected — a new `COMMISSIONER_ADJUSTMENT` row
-- in the ledger, which is visible, attributed, and reversible in the only sense
-- that matters.
--

--
-- Narrower than `token_reason` on purpose.
--
-- `token_reason` has to cover `SEASON_START`, `BOX_PURCHASE` and
-- `COMMISSIONER_ADJUSTMENT`, none of which is a weekly reward, and a column typed
-- against it would accept `BOX_PURCHASE` as a reward reason. Two reasons are
-- currently derivable from a finalized week and both are named in `03 §4`.
--
-- Adding a third is a migration plus a derivation, which is the correct amount of
-- friction: `MANDATE §9` and the standing scope rules mean a new reward category
-- is a product decision, not a row somebody can start writing.
--
CREATE TYPE "public"."weekly_reward_reason" AS ENUM('MATCHUP_WIN', 'WEEKLY_HIGH_SCORE');--> statement-breakpoint

CREATE TABLE "weekly_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"week" integer NOT NULL,
	"season_membership_id" uuid NOT NULL,
	"reason" "weekly_reward_reason" NOT NULL,
	"amount" integer NOT NULL,

	--
	-- The basis, structurally.
	--
	-- `roster_id` is the seat, kept alongside the membership because a roster is
	-- what Sleeper reported and a membership is who we decided that was — and
	-- `11 §2` keeps permanent identity separate from seasonal roster identity.
	-- Storing both means a later disagreement about the mapping is visible rather
	-- than lost behind whichever answer was current at award time.
	--
	"roster_id" integer NOT NULL,
	--
	-- The team's score for the week, in cents. On a high-score award this is the
	-- number that won it; on a matchup win it is what they scored winning. Stored
	-- either way so a row is self-describing without a join back to a matchup that
	-- may since have been corrected.
	--
	"points_cents" integer NOT NULL,
	--
	-- `2025-w14-m3` — `WeekGame.key`, the same identifier the Slice deduplicates
	-- stories by. Text rather than an FK because it names a *game as reported*,
	-- and `fantasy_matchups` rows are re-imported: an FK would make a
	-- re-import able to fail, or worse, silently repoint a settled award.
	--
	"game_key" text NOT NULL,

	--
	-- Which numbers were in force. `economy_configs.version` is a content hash, so
	-- this is enough to recompute the amount exactly.
	--
	"economy_version" text NOT NULL,

	--
	-- The payment this justifies. `NOT NULL` because a reward that did not move
	-- tokens is not a reward — it is a note, and this table is not for notes.
	--
	"token_transaction_id" uuid NOT NULL,
	"awarded_at" timestamp with time zone NOT NULL,

	--
	-- One award, per manager, per reason, per week.
	--
	-- The domain rule, stated in the domain's own words. See the header: this is
	-- deliberately redundant with the ledger's idempotency key rather than
	-- accidentally so.
	--
	CONSTRAINT "weekly_rewards_once_per_manager_per_reason"
		UNIQUE("season_id","week","season_membership_id","reason"),
	--
	-- One reward per payment, so a single ledger row cannot be cited as the
	-- justification for two awards.
	--
	CONSTRAINT "weekly_rewards_one_per_transaction" UNIQUE("token_transaction_id"),
	CONSTRAINT "weekly_rewards_week_positive" CHECK ("weekly_rewards"."week" > 0),
	--
	-- `apply_token_delta` already rejects a zero delta. This says the same thing
	-- about the justification, and additionally rejects a negative: a reward is
	-- never a deduction, and `16 A.1` rules that punishment is visibility rather
	-- than deprivation.
	--
	CONSTRAINT "weekly_rewards_amount_positive" CHECK ("weekly_rewards"."amount" > 0)
);--> statement-breakpoint

ALTER TABLE "weekly_rewards" ADD CONSTRAINT "weekly_rewards_season_id_seasons_id_fk"
	FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "weekly_rewards" ADD CONSTRAINT "weekly_rewards_season_membership_id_season_memberships_id_fk"
	FOREIGN KEY ("season_membership_id") REFERENCES "public"."season_memberships"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "weekly_rewards" ADD CONSTRAINT "weekly_rewards_token_transaction_id_token_transactions_id_fk"
	FOREIGN KEY ("token_transaction_id") REFERENCES "public"."token_transactions"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "weekly_rewards_season_week_idx"
	ON "weekly_rewards" USING btree ("season_id","week");--> statement-breakpoint

CREATE INDEX "weekly_rewards_membership_idx"
	ON "weekly_rewards" USING btree ("season_membership_id","awarded_at");--> statement-breakpoint

--
-- Append-only, like the ledger it points at.
--
-- The same trigger shape as `week_finalizations` and `week_snapshots`, for the
-- same reason: a row here is a justification for money that has already moved, so
-- there is no edit that leaves the pair coherent. `16 §5.1` forbids quiet history
-- rewriting and this is the mechanism rather than the intention.
--
CREATE FUNCTION reject_weekly_reward_rewrite() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'weekly_rewards is append-only; week % of that season is already paid', OLD.week
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER weekly_rewards_append_only
  BEFORE UPDATE OR DELETE ON "weekly_rewards"
  FOR EACH ROW EXECUTE FUNCTION reject_weekly_reward_rewrite();--> statement-breakpoint
