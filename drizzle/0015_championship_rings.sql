-- Championship rings: season identity, and an idempotency key that is not a check.
--
-- `16 §58` puts rings in v1, `16 §368` grants historical ones to the two
-- verified champions, and the catalog has carried `item_championship_ring` as
-- "earned, never pulled" since M2 — excluded from the only acquisition path
-- there was, with nothing to earn it. This is the earning.
--
-- ## Two columns, two different jobs
--
-- `source_season_id` is the **fact**: which title this ring is. It is what the
-- Collection reads to print the year, and it is why a manager who wins twice
-- holds two rows rather than a boolean that is already true. A repeat
-- championship that collapsed into "owns a ring" would be the product forgetting
-- a thing that happened, which is the one thing this product is for.
--
-- `grant_key` is the **idempotency**, and it is deliberately the same mechanism
-- `loot_boxes.grant_key` already uses: UNIQUE across the table, naming the
-- occasion rather than the moment. `lib/counter/grants.ts` states the reason and
-- it holds here unchanged — there is no `SELECT ... WHERE already_granted`
-- anywhere in the ring path, because that check is a race with a comfortable
-- looking body. Two deploys overlapping a backfill both read "not yet"; the
-- unique index is what actually saves it.
--
-- Both are nullable. A collectible pulled from a box has neither, and its own
-- exactly-once guarantee is `source_opening_id UNIQUE`, which is untouched.

ALTER TABLE collectibles
  ADD COLUMN source_season_id uuid REFERENCES seasons (id) ON DELETE RESTRICT;

ALTER TABLE collectibles
  ADD COLUMN grant_key text;

-- The guarantee. Not a partial index on (user_id, source_season_id): the key
-- names the occasion, so it generalizes to any earned item without this table
-- having to know that seasons are the only thing anything is ever earned for.
ALTER TABLE collectibles
  ADD CONSTRAINT collectibles_grant_key_unique UNIQUE (grant_key);

-- A ring is a season's, and a season's ring is a champion's. Anything carrying a
-- season must carry the key that makes re-running the grant free, or the backfill
-- is one deploy away from minting a second 2025 ring.
ALTER TABLE collectibles
  ADD CONSTRAINT collectibles_season_needs_grant_key
  CHECK (source_season_id IS NULL OR grant_key IS NOT NULL);

CREATE INDEX collectibles_season_idx ON collectibles (source_season_id);
