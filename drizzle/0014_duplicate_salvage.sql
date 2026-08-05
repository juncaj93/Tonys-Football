--
-- Duplicate salvage — `16 §8`'s duplicate rule, made real.
--
-- ## What changed, and what did not
--
-- `16 §8` has always said what a box does: **roll rarity → pick an unowned item
-- in that tier → if that tier is exhausted, salvage tokens.** What shipped in M2
-- did the first half and skipped the second: it rolled an entry and handed over
-- whatever the entry named, so a manager who already owned the parmesan shaker
-- got a second parmesan shaker. The commissioner's 2026-08-04 economy ruling
-- closes the gap and sets the values (`03 §12`: *"a configurable salvage value
-- based on item rarity"*, and explicitly **not** a flat half-price refund).
--
-- **The odds are untouched.** The roll still resolves against the same reward
-- table, the same recorded integer, the same version. Only what happens *after*
-- the tier is known has changed, and that is the whole of the ruling's §1: do not
-- solve excess legendary volume by making individual boxes less exciting.
--
-- ## Three columns, and every one of them is an answer somebody will ask for
--
--   `outcome`               was this kept or converted
--   `salvage_tokens`        what it converted to, in the units the ledger uses
--   `token_transaction_id`  which ledger row actually paid it
--
-- The third is the one that matters. *"A duplicate reveal must never silently
-- disappear"* is the ruling's own wording, and a salvage row with no payment
-- attached to it is precisely that failure — so it is not left to the service to
-- remember: the CHECK below makes a `SALVAGE` row without a transaction
-- physically unwritable.
--
-- ## What is deliberately NOT here
--
-- **No `rolled_slug`.** Under the new policy the rolled entry and the awarded
-- item can differ, and it is tempting to store both. It would be a fact stored
-- twice: `resolve_roll(table@version, roll)` is a pure function of two columns
-- that are already on the row, so the rolled entry is recomputable exactly. A
-- second copy of a derivable fact is a copy that can drift.
--
-- **No `UNIQUE (user_id, slug)` on `collectibles`.** Under this policy a manager
-- can never acquire a second copy, so the constraint looks free — and it is not.
-- Every database that has run a box since M2 legitimately holds duplicates, and
-- they are somebody's real property acquired under the rule that was live at the
-- time. Retrofitting the index would either fail the deploy or require deleting
-- rows from a manager's shelf, and `collectibles_undeletable` exists to make that
-- second option impossible on purpose. The guarantee is instead a **transaction
-- lock per manager** in `openBox` (see its comment) plus the trigger below, and
-- the honest cost is recorded here rather than in a comment nobody finds.
--

CREATE TYPE "box_opening_outcome" AS ENUM ('ITEM', 'SALVAGE');--> statement-breakpoint

--
-- `DEFAULT 'ITEM'` is not a convenience: every opening that already exists
-- produced an item, because salvage did not exist. The default states that fact
-- rather than backfilling it with an UPDATE — which `box_openings_append_only`
-- would refuse anyway, and rightly.
--
ALTER TABLE "box_openings"
  ADD COLUMN "outcome" "box_opening_outcome" NOT NULL DEFAULT 'ITEM';--> statement-breakpoint

ALTER TABLE "box_openings" ADD COLUMN "salvage_tokens" integer;--> statement-breakpoint

ALTER TABLE "box_openings"
  ADD COLUMN "token_transaction_id" uuid
  REFERENCES "token_transactions"("id") ON DELETE RESTRICT;--> statement-breakpoint

ALTER TABLE "box_openings"
  ADD CONSTRAINT "box_openings_salvage_pays_tokens"
  CHECK (("outcome" = 'SALVAGE') = ("salvage_tokens" IS NOT NULL));--> statement-breakpoint

ALTER TABLE "box_openings"
  ADD CONSTRAINT "box_openings_salvage_is_positive"
  CHECK ("salvage_tokens" IS NULL OR "salvage_tokens" > 0);--> statement-breakpoint

--
-- The payment is not optional, and it is not the service's job to remember.
--
ALTER TABLE "box_openings"
  ADD CONSTRAINT "box_openings_salvage_is_paid"
  CHECK (("outcome" = 'SALVAGE') = ("token_transaction_id" IS NOT NULL));--> statement-breakpoint

--
-- A converted spare is not owned.
--
-- The opposite half of *"never award twice"*: `collectibles.source_opening_id
-- UNIQUE` already stops one opening minting two items, and this stops a
-- **salvaged** opening minting one at all. Without it a future caller could pay
-- the tokens and write the collectible, and the manager would have been given the
-- item and its salvage value for the same box.
--
CREATE FUNCTION reject_collectible_from_salvage() RETURNS trigger AS $$
DECLARE
  opening_outcome box_opening_outcome;
BEGIN
  IF NEW.source_opening_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT outcome INTO opening_outcome
  FROM box_openings WHERE id = NEW.source_opening_id;

  IF opening_outcome = 'SALVAGE' THEN
    RAISE EXCEPTION
      'opening % was salvaged for tokens and cannot also produce a collectible',
      NEW.source_opening_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER collectibles_never_from_salvage
  BEFORE INSERT ON "collectibles"
  FOR EACH ROW EXECUTE FUNCTION reject_collectible_from_salvage();--> statement-breakpoint

CREATE INDEX "box_openings_outcome_idx" ON "box_openings" ("outcome", "opened_at");--> statement-breakpoint

--
-- The ledger's new reason, last — the same placement `0010` used for the two
-- stake reasons, because a value added to an enum may not be *used* in the
-- transaction that adds it, and putting it at the end keeps that true however
-- the file later grows.
--
-- Its own reason rather than a reused `COMMISSIONER_ADJUSTMENT`: a statement is
-- a thing managers read, and an automatic conversion printed as "adjustment"
-- would be indistinguishable from the commissioner correcting something by
-- hand — the one line on a statement that ought to be rare and conspicuous.
--
ALTER TYPE "public"."token_reason" ADD VALUE IF NOT EXISTS 'DUPLICATE_SALVAGE';
