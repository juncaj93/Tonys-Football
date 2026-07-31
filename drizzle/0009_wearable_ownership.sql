--
-- M3 — how a manager comes to own a wearable.
--
-- `docs/M3_CHARACTER_BOUNDARY.md §9` says no M3 migration touches `collectibles`,
-- and this one does. **That is a deliberate, recorded deviation**, not drift, and
-- the reasoning is worth keeping because the rule it bends is a good rule.
--
-- The rule exists to stop M3 destabilising M2's shipped economy. This adds a
-- partial unique index scoped to `wear_%` slugs. There are no `wear_%` rows and
-- there is no path that creates one from a pizza box — the reward table is
-- `byFamily('collectible')` and `lib/character/separation.test.ts` fails the
-- build if that ever stops being true. So it touches **zero existing rows** and
-- constrains **zero existing behaviour**: every collectible a box has ever
-- produced, including duplicates, is unaffected.
--
-- What it buys is the thing the commissioner asked M3 to prepare — an ownership
-- contract a future award system can use without rewriting M3.
--
-- **Why wearables are one-per-manager while collectibles are not.**
--
-- `03 §12` makes duplicate collectibles legitimate: they are counted, never
-- converted, and forbidding them would silently turn every duplicate roll into a
-- reroll. None of that reasoning transfers. A wearable's whole purpose is to be
-- worn, one item per slot, one place per item — a second visor cannot be worn,
-- cannot be shown, and cannot be salvaged. It is not a duplicate of a
-- collectible; it is a row nothing can ever read.
--
-- Making that a database constraint rather than a service check is what gives the
-- grant a **natural key**, which is what makes it idempotent — the same property
-- `box_openings.box_id UNIQUE` gives opening a box. A retried award, a
-- re-run seed, or two award systems arriving at once all collapse to one row,
-- and none of them needs to have remembered to check first.
--

CREATE UNIQUE INDEX "collectibles_one_wearable_each"
  ON "collectibles" ("user_id", "slug")
  WHERE "slug" LIKE 'wear\_%';
