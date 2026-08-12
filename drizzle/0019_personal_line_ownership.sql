-- Tony's Line became personal on 2026-08-12, and ownership became a real
-- authorization boundary rather than a display condition.
--
-- A week now authors up to ten `TONYS_LINE` rows — one per manager, each with
-- its own number and its own `eligible_user_ids` of exactly one. `placeEntry`
-- already refuses a manager who is not in that snapshot, and a service check is
-- the wrong place for this to be the *only* answer: the commissioner's ruling
-- says another manager must not be able to take a side on somebody else's team
-- total, and this table can be written by anything holding a connection.
--
-- So the rule lives where the Showcase's does (`0006`). A foreign key can say
-- *"that stake exists"* and cannot say *"that stake is yours"*; that needs a
-- trigger, and this is the same shape.
--
-- ## It is deliberately about eligibility, not about the kind
--
-- The rule is *"you may only enter a stake you were offered"*, which is true of
-- every kind and always was — a bounty and a chalkboard simply carry the whole
-- league in the snapshot, so nothing about them changes. Writing it as "a
-- TONYS_LINE row must have one eligible user" would encode today's product shape
-- into the database and break the day a league-wide market is offered again.
--
-- ## Nothing about the economy moves
--
-- No token amount, no multiplier, no reward table, no ledger path. This refuses
-- a row; it does not price one.

CREATE FUNCTION reject_ineligible_stake_entry() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM weekly_stakes s
    WHERE s.id = NEW.stake_id
      AND NEW.user_id = ANY (s.eligible_user_ids)
  ) THEN
    RAISE EXCEPTION
      'user % was not offered stake %, so no side may be taken on it',
      NEW.user_id, NEW.stake_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER stake_entries_only_the_offered_may_enter
  BEFORE INSERT OR UPDATE ON "stake_entries"
  FOR EACH ROW EXECUTE FUNCTION reject_ineligible_stake_entry();
