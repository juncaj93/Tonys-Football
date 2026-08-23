-- Underground casino — commissioner-authorized 2026-08-23.
--
-- Fictional seasonal tokens only. The round is a durable record first, then a
-- game surface: retried requests resolve to the same row, money moves only via
-- apply_token_delta, and a finished result cannot be rewritten after somebody
-- has seen it.

CREATE TYPE "public"."casino_game" AS ENUM ('BLACKJACK', 'SLOTS');--> statement-breakpoint
CREATE TYPE "public"."casino_round_status" AS ENUM ('OPEN', 'SETTLED');--> statement-breakpoint

CREATE TABLE "casino_rounds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "season_id" uuid NOT NULL,
  "game" "casino_game" NOT NULL,
  "status" "casino_round_status" NOT NULL DEFAULT 'OPEN',
  "wager" integer NOT NULL,
  -- The dealt hands/reels and server-generated draw sequence. It is an audit
  -- record, not browser state: a reload can always recover the same round.
  "state" jsonb NOT NULL,
  "payout" integer,
  -- Named by the caller before the first token movement. Replaying the initial
  -- request finds this natural event rather than charging a second time.
  "request_key" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "resolved_at" timestamp with time zone,
  CONSTRAINT "casino_rounds_request_key_unique" UNIQUE("request_key"),
  CONSTRAINT "casino_rounds_wager_positive" CHECK ("wager" > 0),
  CONSTRAINT "casino_rounds_payout_nonnegative" CHECK ("payout" IS NULL OR "payout" >= 0),
  CONSTRAINT "casino_rounds_terminal_shape" CHECK (
    ("status" = 'OPEN' AND "payout" IS NULL AND "resolved_at" IS NULL)
    OR
    ("status" = 'SETTLED' AND "payout" IS NOT NULL AND "resolved_at" IS NOT NULL)
  )
);--> statement-breakpoint

ALTER TABLE "casino_rounds" ADD CONSTRAINT "casino_rounds_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "casino_rounds" ADD CONSTRAINT "casino_rounds_season_id_seasons_id_fk"
  FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;--> statement-breakpoint

CREATE INDEX "casino_rounds_user_season_created_idx"
  ON "casino_rounds" ("user_id", "season_id", "created_at" DESC);--> statement-breakpoint

-- An open blackjack hand may advance from one recorded state to the next. A
-- settled round is financial history and is append-only, including its reveal.
CREATE FUNCTION reject_casino_round_rewrite() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'SETTLED' THEN
    RAISE EXCEPTION 'casino round % is settled and immutable', OLD.id USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'casino rounds are audit records and cannot be deleted' USING ERRCODE = '23514';
  END IF;

  IF NEW.user_id <> OLD.user_id OR NEW.season_id <> OLD.season_id OR NEW.game <> OLD.game
     OR NEW.wager <> OLD.wager OR NEW.request_key <> OLD.request_key THEN
    RAISE EXCEPTION 'casino round identity is immutable' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER casino_rounds_append_only_after_settlement
  BEFORE UPDATE OR DELETE ON "casino_rounds"
  FOR EACH ROW EXECUTE FUNCTION reject_casino_round_rewrite();--> statement-breakpoint

ALTER TYPE "public"."token_reason" ADD VALUE IF NOT EXISTS 'CASINO_WAGER';--> statement-breakpoint
ALTER TYPE "public"."token_reason" ADD VALUE IF NOT EXISTS 'CASINO_PAYOUT';
