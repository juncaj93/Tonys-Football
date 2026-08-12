--
-- The Underground, part two: the blackjack table.
--
-- Commissioner rulings of 2026-08-12 (`docs/CASINO_BOUNDARY.md §13`). Entirely
-- additive. **The Underground is still shut** — `lib/flags.ts` decides who can
-- reach this, and nobody can.
--
-- ## A hand is durable server state, and that is the whole design
--
-- Slots settles inside one request, so `slot_spins` is a record of something
-- that already finished. A hand does not: it spans a deal, some number of hits,
-- a stand, the dealer's draw and a settlement, across as many requests as the
-- player takes. So the row **is** the game, and every safety property this file
-- carries follows from that:
--
--   - a refresh, a second tab, a killed browser and a second device all resume
--     the same row, because there is nothing else to resume;
--   - a stale tab is caught by `revision`, not by the UI disabling a button;
--   - a retry is caught by `blackjack_actions.action_key`, not by hoping;
--   - a settled hand is immutable, so "an action after settlement" is not a
--     case the service has to remember to reject.
--
-- ## No refund for abandonment
--
-- A hand left open is **not** returned to the player. That would be a free
-- option: deal, look at 16, walk away, and eventually get the wager back. Season
-- close stands the player on whatever they have and runs the dealer normally
-- (`lib/casino/blackjack.ts`), which is deterministic and gives the abandoning
-- player exactly the hand they were already holding.
--

ALTER TYPE "public"."casino_game" ADD VALUE IF NOT EXISTS 'blackjack';--> statement-breakpoint

--
-- What a hand can be. Two states, and the second is terminal.
--
-- Everything a richer enum would carry — natural, bust, dealer-drew, who won —
-- is on the row as data, where it can be read, checked and audited. A state
-- machine with six names would be six places for the row and the name to
-- disagree.
--
CREATE TYPE "public"."blackjack_status" AS ENUM('OPEN', 'SETTLED');--> statement-breakpoint

--
-- How a hand ended.
--
--   - `player_natural` — a two-card twenty-one the dealer did not match. 3:2.
--   - `dealer_natural` — the dealer had it and the player did not.
--   - `push`          — equal totals, or both naturals. The wager comes back.
--   - `win` / `loss`  — decided by the dealer's draw.
--   - `bust`          — the player went over. Separated from `loss` because it
--                       is the player's own doing and the dealer never draws.
--
CREATE TYPE "public"."blackjack_outcome" AS ENUM(
  'player_natural', 'dealer_natural', 'push', 'win', 'loss', 'bust'
);--> statement-breakpoint

--
-- Who ended it. `season_close` is the forced resolution and must stay
-- distinguishable forever — "did a person play this hand out" is the first
-- question anybody asks about a settlement they disagree with.
--
CREATE TYPE "public"."blackjack_settled_by" AS ENUM('player', 'season_close');--> statement-breakpoint

CREATE TYPE "public"."blackjack_action" AS ENUM('hit', 'stand');--> statement-breakpoint

CREATE TABLE "blackjack_hands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,

	"user_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,

	--
	-- The caller's name for this deal. A deal is an event with no natural key,
	-- so it takes a client-supplied one, namespaced server-side under the
	-- session's user id. The same distinction `apply_token_delta` draws.
	--
	"hand_key" text NOT NULL,

	"wager_tokens" integer NOT NULL,

	--
	-- Which stored rules decided this hand. Not a copy of them — the version, so
	-- a later re-tune cannot retroactively change what a recorded hand meant.
	--
	"table_version" text NOT NULL,

	--
	-- The whole shuffled deck, in order, as card codes 0–51.
	--
	-- **Stored at the deal, immutable afterwards.** This is what makes a hand
	-- auditable rather than merely recorded: given the deck and the position,
	-- anybody can check that every card came off the top in order and that the
	-- server dealt itself nothing.
	--
	-- It is never sent to the client past `deck_position` — the undealt tail is
	-- the one piece of state that would let a player see the future.
	--
	"deck" integer[] NOT NULL,

	--
	-- How many cards have left the deck. Tied to the two hands by CHECK below,
	-- so an "impossible deck position" is unwritable rather than merely unlikely.
	--
	"deck_position" integer NOT NULL,

	"player_cards" integer[] NOT NULL,
	"dealer_cards" integer[] NOT NULL,

	--
	-- Monotonic, and the whole of the stale-tab defence.
	--
	-- Every action carries the revision the player was looking at. Tab A hits and
	-- the revision moves; Tab B's stand still names the old one and is refused
	-- rather than silently applied to a hand the player never saw. `18 §4.3`'s
	-- "the client never decides" covers *which state* as much as which card.
	--
	"revision" integer DEFAULT 0 NOT NULL,

	"status" "blackjack_status" DEFAULT 'OPEN' NOT NULL,

	"outcome" "blackjack_outcome",
	"settled_by" "blackjack_settled_by",
	"payout_tokens" integer,

	--
	-- R13's two distinct movements. `wager_tx_id` is NOT NULL, so a hand nobody
	-- paid for cannot be written at all.
	--
	"wager_tx_id" uuid NOT NULL,
	"payout_tx_id" uuid,

	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"settled_at" timestamp with time zone,

	CONSTRAINT "blackjack_hands_key_unique" UNIQUE("hand_key"),
	CONSTRAINT "blackjack_hands_wager_positive" CHECK ("blackjack_hands"."wager_tokens" > 0),
	--
	-- A full deck, dealt from the top, and the position agreeing with the cards
	-- actually held. Three ways to write an impossible hand, all refused.
	--
	CONSTRAINT "blackjack_hands_full_deck" CHECK (array_length("blackjack_hands"."deck", 1) = 52),
	CONSTRAINT "blackjack_hands_position_in_deck" CHECK (
		"blackjack_hands"."deck_position" >= 4 AND "blackjack_hands"."deck_position" <= 52
	),
	CONSTRAINT "blackjack_hands_position_matches_cards" CHECK (
		"blackjack_hands"."deck_position"
		= array_length("blackjack_hands"."player_cards", 1)
		+ array_length("blackjack_hands"."dealer_cards", 1)
	),
	CONSTRAINT "blackjack_hands_dealt_two" CHECK (
		array_length("blackjack_hands"."player_cards", 1) >= 2
		AND array_length("blackjack_hands"."dealer_cards", 1) >= 2
	),
	CONSTRAINT "blackjack_hands_revision_non_negative" CHECK ("blackjack_hands"."revision" >= 0),
	--
	-- Settled means all of it, or none of it. A half-written settlement is the
	-- shape a duplicate payout hides in — `stake_entries` learned this first.
	--
	CONSTRAINT "blackjack_hands_settlement_complete" CHECK (
		("blackjack_hands"."status" = 'OPEN'
			AND "blackjack_hands"."outcome" IS NULL
			AND "blackjack_hands"."settled_by" IS NULL
			AND "blackjack_hands"."payout_tokens" IS NULL
			AND "blackjack_hands"."settled_at" IS NULL)
		OR ("blackjack_hands"."status" = 'SETTLED'
			AND "blackjack_hands"."outcome" IS NOT NULL
			AND "blackjack_hands"."settled_by" IS NOT NULL
			AND "blackjack_hands"."payout_tokens" IS NOT NULL
			AND "blackjack_hands"."settled_at" IS NOT NULL)
	),
	CONSTRAINT "blackjack_hands_payout_non_negative" CHECK (
		"blackjack_hands"."payout_tokens" IS NULL OR "blackjack_hands"."payout_tokens" >= 0
	),
	--
	-- A paid hand names the ledger row that paid it, and an unpaid one names
	-- none. Neither half can exist without the other.
	--
	CONSTRAINT "blackjack_hands_payout_is_paid" CHECK (
		(coalesce("blackjack_hands"."payout_tokens", 0) > 0)
		= ("blackjack_hands"."payout_tx_id" IS NOT NULL)
	)
);--> statement-breakpoint

ALTER TABLE "blackjack_hands" ADD CONSTRAINT "blackjack_hands_user_id_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_hands" ADD CONSTRAINT "blackjack_hands_season_id_seasons_id_fk"
	FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_hands" ADD CONSTRAINT "blackjack_hands_table_version_fk"
	FOREIGN KEY ("table_version") REFERENCES "public"."casino_tables"("version")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_hands" ADD CONSTRAINT "blackjack_hands_wager_tx_fk"
	FOREIGN KEY ("wager_tx_id") REFERENCES "public"."token_transactions"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_hands" ADD CONSTRAINT "blackjack_hands_payout_tx_fk"
	FOREIGN KEY ("payout_tx_id") REFERENCES "public"."token_transactions"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

--
-- **One open hand per manager, ever.** The whole of the ruling, as one index.
--
-- A partial unique index rather than a service check, because a service check is
-- a race: two deals arriving together would both read "no open hand" and both
-- write one. This one loses at the database, which is where the project puts
-- every invariant it cannot afford to lose.
--
CREATE UNIQUE INDEX "blackjack_hands_one_open_per_user"
	ON "blackjack_hands" ("user_id") WHERE "status" = 'OPEN';--> statement-breakpoint

CREATE INDEX "blackjack_hands_user_recent_idx"
	ON "blackjack_hands" ("user_id", "created_at" DESC);--> statement-breakpoint

--
-- Season close needs to find every open hand in a season, and it is the only
-- query in the product that looks at hands by season rather than by manager.
--
CREATE INDEX "blackjack_hands_open_by_season_idx"
	ON "blackjack_hands" ("season_id") WHERE "status" = 'OPEN';--> statement-breakpoint

--
-- What may change while a hand is open, and what may never change at all.
--
-- The deal is history the moment it happens: the deck, the wager, the rules
-- version and the manager are fixed. The revision must advance by exactly one,
-- which is what makes it a *version* rather than a number somebody sets — a
-- caller that could write any revision could reproduce a stale client's view and
-- replay an action against it.
--
-- **A settled hand is frozen entirely.** That is what makes "no action after
-- settlement" and "no second settlement" invariants rather than intentions.
--
CREATE FUNCTION reject_blackjack_hand_change() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'SETTLED' THEN
    RAISE EXCEPTION
      'blackjack hand % is settled; a settled hand is history and cannot be changed',
      OLD.id
      USING ERRCODE = '23514';
  END IF;

  IF (NEW.id, NEW.user_id, NEW.season_id, NEW.hand_key, NEW.wager_tokens,
      NEW.table_version, NEW.deck, NEW.wager_tx_id, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.user_id, OLD.season_id, OLD.hand_key, OLD.wager_tokens,
      OLD.table_version, OLD.deck, OLD.wager_tx_id, OLD.created_at) THEN
    RAISE EXCEPTION
      'blackjack hand % was dealt; its deck, wager and terms are immutable', OLD.id
      USING ERRCODE = '23514';
  END IF;

  IF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION
      'blackjack hand % must advance exactly one revision at a time (% -> %)',
      OLD.id, OLD.revision, NEW.revision
      USING ERRCODE = '23514';
  END IF;

  -- Cards are only ever added, and only from the top of the deck.
  IF NEW.deck_position < OLD.deck_position THEN
    RAISE EXCEPTION
      'blackjack hand % cannot un-deal a card', OLD.id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER blackjack_hands_guard
  BEFORE UPDATE ON "blackjack_hands"
  FOR EACH ROW EXECUTE FUNCTION reject_blackjack_hand_change();--> statement-breakpoint

CREATE FUNCTION reject_blackjack_hand_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'blackjack hand % is part of the token audit trail and cannot be deleted', OLD.id
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER blackjack_hands_undeletable
  BEFORE DELETE ON "blackjack_hands"
  FOR EACH ROW EXECUTE FUNCTION reject_blackjack_hand_delete();--> statement-breakpoint

--
-- Every action a player took, in order. Append-only.
--
-- Two jobs, and the second is why it is a table rather than a column:
--
--   1. **Audit.** `08` and `09 §11` want an outcome anybody can reconstruct.
--      The deck plus the position says which cards moved; this says who asked.
--   2. **Idempotency, as a UNIQUE constraint.** A lost response followed by a
--      retry must resolve to the committed result rather than drawing a second
--      card. `action_key` is what a retry collides with — the backstop behind
--      the row lock, exactly as `box_openings.box_id UNIQUE` sits behind
--      `SELECT ... FOR UPDATE` in `openBox`.
--
CREATE TABLE "blackjack_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hand_id" uuid NOT NULL,

	--
	-- The caller's name for this action attempt. Namespaced server-side, so one
	-- manager cannot craft a key that collides with another's.
	--
	"action_key" text NOT NULL,

	"action" "blackjack_action" NOT NULL,

	--
	-- The revision this action was applied *to*. With the hand's own revision
	-- this makes the sequence reconstructible and gaps visible.
	--
	"applied_at_revision" integer NOT NULL,

	--
	-- The card this action drew, or null for a stand. Redundant with the deck and
	-- deliberately so: it is what lets a reader check the action log against the
	-- deck without replaying the whole hand.
	--
	"card" integer,

	"created_at" timestamp with time zone NOT NULL,

	CONSTRAINT "blackjack_actions_key_unique" UNIQUE("action_key"),
	CONSTRAINT "blackjack_actions_one_per_revision" UNIQUE("hand_id", "applied_at_revision"),
	CONSTRAINT "blackjack_actions_stand_draws_nothing" CHECK (
		("blackjack_actions"."action" = 'stand') = ("blackjack_actions"."card" IS NULL)
	)
);--> statement-breakpoint

ALTER TABLE "blackjack_actions" ADD CONSTRAINT "blackjack_actions_hand_id_fk"
	FOREIGN KEY ("hand_id") REFERENCES "public"."blackjack_hands"("id")
	ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "blackjack_actions_hand_idx" ON "blackjack_actions" ("hand_id", "applied_at_revision");--> statement-breakpoint

CREATE FUNCTION reject_blackjack_action_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'blackjack_actions is append-only; action % is history', OLD.id
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER blackjack_actions_append_only
  BEFORE UPDATE OR DELETE ON "blackjack_actions"
  FOR EACH ROW EXECUTE FUNCTION reject_blackjack_action_change();
