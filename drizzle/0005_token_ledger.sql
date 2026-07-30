CREATE TYPE "public"."token_reason" AS ENUM('SEASON_START', 'BOX_PURCHASE', 'MATCHUP_WIN', 'WEEKLY_HIGH_SCORE', 'SEASON_AWARD', 'COMMISSIONER_ADJUSTMENT');--> statement-breakpoint
CREATE TABLE "economy_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"version" text NOT NULL,
	"values" jsonb NOT NULL,
	"provisional" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "economy_configs_season_version_unique" UNIQUE("season_id","version")
);
--> statement-breakpoint
CREATE TABLE "token_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_membership_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"reason_code" "token_reason" NOT NULL,
	"description" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"source_ref" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "token_transactions_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "token_transactions_amount_non_zero" CHECK ("token_transactions"."amount" <> 0)
);
--> statement-breakpoint
ALTER TABLE "season_memberships" ADD COLUMN "token_balance" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "economy_configs" ADD CONSTRAINT "economy_configs_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_transactions" ADD CONSTRAINT "token_transactions_season_membership_id_season_memberships_id_fk" FOREIGN KEY ("season_membership_id") REFERENCES "public"."season_memberships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_transactions" ADD CONSTRAINT "token_transactions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "token_transactions_membership_idx" ON "token_transactions" USING btree ("season_membership_id","created_at");--> statement-breakpoint
ALTER TABLE "season_memberships" ADD CONSTRAINT "season_memberships_token_balance_non_negative" CHECK ("season_memberships"."token_balance" >= 0);--> statement-breakpoint

--
-- The balance is the ledger's shadow, and nothing else may cast it.
--
-- `16 §5.4`: "Balance is a column written ONLY by an AFTER-INSERT trigger, with
-- CHECK (balance >= 0) ... No feature gets its own balance-writing path."
--
-- The CHECK constraint on the column already makes overdraft impossible. These
-- two triggers make the *path* singular, which is the other half and the half
-- that application discipline cannot provide: without the guard, any service, any
-- migration, any hand-run UPDATE could set a balance to whatever it liked and the
-- ledger would silently stop being the truth.
--
-- The mechanism is a transaction-local flag. The ledger trigger raises it for
-- exactly the duration of its own UPDATE; the guard rejects any other change to
-- the column. `set_config(..., true)` is scoped to the transaction, so the flag
-- cannot leak into another session or outlive a rollback.
--
CREATE FUNCTION reject_direct_balance_write() RETURNS trigger AS $$
BEGIN
  IF NEW.token_balance IS DISTINCT FROM OLD.token_balance
     AND coalesce(current_setting('tonys.balance_write', true), 'off') <> 'on' THEN
    RAISE EXCEPTION
      'season_memberships.token_balance is written only by the token ledger; use apply_token_delta()'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER season_memberships_balance_guard
  BEFORE UPDATE ON "season_memberships"
  FOR EACH ROW EXECUTE FUNCTION reject_direct_balance_write();--> statement-breakpoint

CREATE FUNCTION apply_ledger_to_balance() RETURNS trigger AS $$
BEGIN
  PERFORM set_config('tonys.balance_write', 'on', true);

  UPDATE season_memberships
     SET token_balance = token_balance + NEW.amount
   WHERE id = NEW.season_membership_id;

  -- Lowered immediately, so the window in which the column is writable is one
  -- statement wide rather than the rest of the transaction.
  PERFORM set_config('tonys.balance_write', 'off', true);

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER token_transactions_apply_balance
  AFTER INSERT ON "token_transactions"
  FOR EACH ROW EXECUTE FUNCTION apply_ledger_to_balance();--> statement-breakpoint

--
-- The ledger is append-only. `CLAUDE.md`: "Token mutations must use an
-- append-only ledger."
--
-- An editable ledger row would let a balance and its history disagree with
-- nothing to detect it — the balance is applied once, at insert, so a later
-- UPDATE to `amount` changes the story without changing the money.
--
CREATE FUNCTION reject_ledger_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'token transaction % is append-only and cannot be modified or deleted',
    OLD.id
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER token_transactions_append_only
  BEFORE UPDATE OR DELETE ON "token_transactions"
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_change();--> statement-breakpoint

--
-- Economy configuration is immutable once stored, except for its sign-off flag.
--
-- Same reasoning as `reward_tables` in `0004`: a transaction is only
-- interpretable against the numbers that were live when it happened, so a
-- rebalance writes a new version rather than editing the old one. Clearing
-- `provisional` is the one legitimate later act — that is how the P3 simulation
-- signs a set of numbers off (`16 §8`).
--
CREATE FUNCTION reject_economy_config_rewrite() RETURNS trigger AS $$
BEGIN
  IF (NEW.season_id, NEW.version, NEW.values)
     IS DISTINCT FROM
     (OLD.season_id, OLD.version, OLD.values) THEN
    RAISE EXCEPTION
      'economy config % is immutable; store a new version instead of editing this one',
      OLD.version
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER economy_configs_immutable
  BEFORE UPDATE ON "economy_configs"
  FOR EACH ROW EXECUTE FUNCTION reject_economy_config_rewrite();--> statement-breakpoint

--
-- apply_token_delta — the one entry point for moving tokens.
--
-- `16 §5.4` specifies it by name and signature. It is a database function rather
-- than a TypeScript service for the same reason the balance guard is a trigger:
-- an invariant that lives in the application is an invariation until somebody
-- writes a second application. A cron job, a psql session and a server action all
-- reach the same code here.
--
-- `p_description` is not in `16`'s signature but `03 §5` requires every balance
-- change to carry human-readable text, and a required argument is the only way to
-- guarantee it exists. It is curated or templated by the caller, never generated
-- — `16 §10` limits generative text to the Slice.
--
-- ## Replay is a no-op, and a *reused* key is an error
--
-- `UNIQUE(idempotency_key)` makes a retry harmless. But a key reused for a
-- genuinely different delta is a bug, and silently returning the old row would
-- hide it — the caller would believe it moved tokens that never moved. So the
-- existing row is compared against what was asked for, and a disagreement raises.
--
CREATE FUNCTION apply_token_delta(
  p_user_id          uuid,
  p_season_id        uuid,
  p_amount           integer,
  p_reason_code      token_reason,
  p_description      text,
  p_idempotency_key  text,
  p_source_ref       text DEFAULT NULL,
  p_actor_id         uuid DEFAULT NULL,
  p_occurred_at      timestamptz DEFAULT now()
) RETURNS uuid AS $$
DECLARE
  v_membership uuid;
  v_finalized  timestamptz;
  v_id         uuid;
  v_existing   token_transactions;
BEGIN
  IF p_amount = 0 THEN
    RAISE EXCEPTION 'a token delta of zero is not a transaction' USING ERRCODE = '23514';
  END IF;

  SELECT sm.id, s.finalized_at
    INTO v_membership, v_finalized
    FROM season_memberships sm
    JOIN seasons s ON s.id = sm.season_id
   WHERE sm.user_id = p_user_id
     AND sm.season_id = p_season_id;

  IF v_membership IS NULL THEN
    RAISE EXCEPTION
      'user % holds no seat in season %, so they have no wallet there',
      p_user_id, p_season_id
      USING ERRCODE = '23503';
  END IF;

  -- A closed season's books are closed. `03 §6` freezes purchases and wagering at
  -- season close, and 2024/2025 are finalized in every environment — so this is
  -- reachable, not theoretical.
  IF v_finalized IS NOT NULL THEN
    RAISE EXCEPTION
      'season % is finalized; its token ledger is closed',
      p_season_id
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO token_transactions (
    season_membership_id, amount, reason_code, description,
    idempotency_key, source_ref, actor_user_id, created_at
  ) VALUES (
    v_membership, p_amount, p_reason_code, p_description,
    p_idempotency_key, p_source_ref, p_actor_id, p_occurred_at
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- Replayed. Prove it is the same delta before calling it a no-op.
  SELECT * INTO v_existing
    FROM token_transactions
   WHERE idempotency_key = p_idempotency_key;

  IF v_existing.season_membership_id <> v_membership
     OR v_existing.amount <> p_amount
     OR v_existing.reason_code <> p_reason_code THEN
    RAISE EXCEPTION
      'idempotency key % already records a different delta (% for membership %, not % for %)',
      p_idempotency_key, v_existing.amount, v_existing.season_membership_id,
      p_amount, v_membership
      USING ERRCODE = '23505';
  END IF;

  RETURN v_existing.id;
END;
$$ LANGUAGE plpgsql;
