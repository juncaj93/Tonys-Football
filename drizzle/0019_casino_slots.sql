--
-- The Underground, part one: the slot machine.
--
-- Commissioner rulings of 2026-08-11 (`docs/CASINO_BOUNDARY.md`). Entirely
-- additive — nothing existing is altered, so this is safe to apply to a database
-- serving live traffic. **The Underground is shut**; this migration gives the
-- machine somewhere to record what it did, and `lib/flags.ts` decides whether
-- anybody can reach it.
--
-- ## Nothing here writes a balance
--
-- `16 §5.4`: all token movement goes through `apply_token_delta`, and no feature
-- gets its own balance-writing path. A spin therefore stores the **ledger row
-- ids** it caused and nothing about money beyond them. R13's accounting — the
-- wager and the payout as two distinct audited movements — falls out of that
-- rather than being arranged here: they are two rows in `token_transactions`
-- and this table points at both.
--
-- ## Why a spin is one row and not a session
--
-- A spin has no turn, no decision and no state between requests: stake,
-- resolve, settle, done, inside one transaction. `04 §11` recommends a shared
-- `casino_rounds` record covering every game, and that is **not** followed —
-- blackjack (W2) has a resumable position and an ordered action sequence, so one
-- table serving both would be half-null in every row and would need a
-- discriminator to know which half to trust. Two small tables, no spine.
--

--
-- Which game a stored configuration belongs to.
--
-- `slots` only, today. Blackjack's rules are fixed by ruling rather than
-- configured, and if W2 needs a stored version it adds the value then — an enum
-- value for a game that does not exist is a branch nothing can take.
--
CREATE TYPE "public"."casino_game" AS ENUM('slots');--> statement-breakpoint

--
-- The paytable, versioned by content hash and append-only.
--
-- Exactly the shape `reward_tables` uses (`0004`) and for exactly its reason: a
-- recorded outcome is only interpretable against the numbers that were live when
-- it happened, so a re-tune writes a **new version** and every spin already
-- recorded keeps pointing at the table it actually rolled against.
--
-- `provisional` stays true until the commissioner signs the numbers off, the
-- same signal the economy configs and reward tables carry.
--
CREATE TABLE "casino_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"game" "casino_game" NOT NULL,
	"config" jsonb NOT NULL,
	"provisional" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "casino_tables_version_unique" UNIQUE("version")
);--> statement-breakpoint

CREATE FUNCTION reject_casino_table_rewrite() RETURNS trigger AS $$
BEGIN
  IF (NEW.version, NEW.game, NEW.config)
     IS DISTINCT FROM
     (OLD.version, OLD.game, OLD.config) THEN
    RAISE EXCEPTION
      'casino table % is immutable; store a new version instead of editing this one',
      OLD.version
      USING ERRCODE = '23514';
  END IF;

  -- Clearing `provisional` is the one legitimate later act: it is how a set of
  -- numbers gets signed off, exactly as in `economy_configs`.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER casino_tables_immutable
  BEFORE UPDATE ON "casino_tables"
  FOR EACH ROW EXECUTE FUNCTION reject_casino_table_rewrite();--> statement-breakpoint

CREATE FUNCTION reject_casino_table_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'casino table % is referenced by recorded spins and cannot be deleted', OLD.version
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER casino_tables_undeletable
  BEFORE DELETE ON "casino_tables"
  FOR EACH ROW EXECUTE FUNCTION reject_casino_table_delete();--> statement-breakpoint

--
-- One spin. Written once, never touched again.
--
CREATE TABLE "slot_spins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,

	"user_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,

	--
	-- The caller's name for this spin, and the whole idempotency mechanism.
	--
	-- A spin is an **event**, not a thing — "spin again" may legitimately happen
	-- twice and nothing about the row can tell a retry from a second genuine
	-- spin. So it takes a caller-supplied key, exactly as `apply_token_delta`
	-- does and for the identical reason (ruling index, 2026-07-30). Opening a box
	-- needed no such key because a box opens once and has a natural one; this is
	-- the other half of that same distinction.
	--
	-- The key reaching this column is namespaced server-side under the session's
	-- user id, so a client cannot craft one that collides with another manager's.
	--
	"spin_key" text NOT NULL,

	"stake_tokens" integer NOT NULL,

	--
	-- Which paytable decided this. Not a copy of the numbers — the version, so a
	-- re-tune cannot retroactively change what a recorded spin paid.
	--
	"table_version" text NOT NULL,

	--
	-- The three raw rolls, and the three symbols they resolved to.
	--
	-- Both, deliberately. The rolls are what makes the outcome **recomputable**:
	-- given these integers and the stored table version, anybody can rederive the
	-- symbols and the payout and check the server was telling the truth — the
	-- property `box_openings.roll` exists for. The symbols are stored beside them
	-- so reading a spin's history needs no resolver at all.
	--
	"rolls" integer[] NOT NULL,
	"symbols" text[] NOT NULL,

	--
	-- What came back, in tokens. Zero is an ordinary outcome, not an absence.
	--
	"payout_tokens" integer NOT NULL,

	--
	-- The two ledger rows. R13's distinct movements, joined rather than summarised.
	--
	-- `wager_tx_id` is NOT NULL, which is what makes a spin that nobody paid for
	-- physically unwritable — the same shape as `box_openings_salvage_is_paid`.
	--
	"wager_tx_id" uuid NOT NULL,
	"payout_tx_id" uuid,

	"created_at" timestamp with time zone NOT NULL,

	CONSTRAINT "slot_spins_key_unique" UNIQUE("spin_key"),
	CONSTRAINT "slot_spins_stake_positive" CHECK ("slot_spins"."stake_tokens" > 0),
	CONSTRAINT "slot_spins_payout_non_negative" CHECK ("slot_spins"."payout_tokens" >= 0),
	--
	-- A paid spin has a ledger row and an unpaid one does not. Neither half can
	-- exist without the other, so a payout recorded on the spin but never written
	-- to the ledger — or vice versa — cannot be stored at all.
	--
	CONSTRAINT "slot_spins_payout_is_paid" CHECK (
		("slot_spins"."payout_tokens" > 0) = ("slot_spins"."payout_tx_id" IS NOT NULL)
	),
	--
	-- Three reels. A row with two or four is a resolver defect, and it should be
	-- refused at the boundary rather than rendered.
	--
	CONSTRAINT "slot_spins_three_reels" CHECK (
		array_length("slot_spins"."rolls", 1) = 3
		AND array_length("slot_spins"."symbols", 1) = 3
	)
);--> statement-breakpoint

ALTER TABLE "slot_spins" ADD CONSTRAINT "slot_spins_user_id_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_spins" ADD CONSTRAINT "slot_spins_season_id_seasons_id_fk"
	FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_spins" ADD CONSTRAINT "slot_spins_table_version_fk"
	FOREIGN KEY ("table_version") REFERENCES "public"."casino_tables"("version")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_spins" ADD CONSTRAINT "slot_spins_wager_tx_fk"
	FOREIGN KEY ("wager_tx_id") REFERENCES "public"."token_transactions"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_spins" ADD CONSTRAINT "slot_spins_payout_tx_fk"
	FOREIGN KEY ("payout_tx_id") REFERENCES "public"."token_transactions"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

--
-- Newest first, per manager. What a manager's own history reads, and what the
-- anti-spam interval checks — R9 is a correctness rule about double taps, and
-- the cheapest correct answer is the manager's own last row rather than an
-- in-memory limiter that a serverless function cannot keep.
--
CREATE INDEX "slot_spins_user_recent_idx" ON "slot_spins" ("user_id","created_at" DESC);--> statement-breakpoint

--
-- A spin is history.
--
-- The guard `box_openings`, the ledger, the reward tables and the stake
-- resolutions all carry. An editable spin would let a payout and its ledger row
-- disagree with nothing to detect it.
--
CREATE FUNCTION reject_slot_spin_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'slot_spins is append-only; spin % is recorded and cannot be modified or deleted',
    OLD.id
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER slot_spins_append_only
  BEFORE UPDATE OR DELETE ON "slot_spins"
  FOR EACH ROW EXECUTE FUNCTION reject_slot_spin_change();--> statement-breakpoint

--
-- Two more token reasons, for R13's two distinct movements.
--
-- `09 §11` names *casino bet* and *casino payout* as separate ledger reasons, so
-- this is specified rather than chosen. Adding the values is the whole change:
-- `apply_token_delta`, the balance trigger and the overdraft CHECK are all
-- untouched, and the casino gets no write path of its own.
--
-- A push in blackjack (W2) returns exactly the stake, and a net-only
-- representation of that would be a **zero delta** — which `apply_token_delta`
-- refuses outright. Two reasons is therefore forced by the ledger as well as
-- required by the ruling.
--
-- Last in the file, and referenced nowhere in it: Postgres will not let a new
-- enum value be used in the same transaction that adds it. `0010` and `0014`
-- have the same shape for the same reason.
--
ALTER TYPE "public"."token_reason" ADD VALUE IF NOT EXISTS 'CASINO_WAGER';--> statement-breakpoint
ALTER TYPE "public"."token_reason" ADD VALUE IF NOT EXISTS 'CASINO_PAYOUT';
