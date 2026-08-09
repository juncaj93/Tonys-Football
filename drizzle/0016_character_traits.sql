--
-- Character traits — six independent choices, replacing three bundled ones.
--
-- ## What was wrong with the shape this replaces
--
-- `0008` stored `body`, `face`, `hair` and `palette`. The problem was `palette`:
-- one integer that chose a **skin tone, a hair colour and a shirt colour at
-- once**. A manager could not take the deepest skin tone without also taking
-- black hair and a red shirt, and two managers who wanted that tone were
-- necessarily identical from the neck up.
--
-- It also contradicted `art/palette.json`, whose `skin` ramp carries its own
-- role note: *"Managers select a step; **it is not tied to any other palette
-- role**."* That was written before `0008` and `0008` did the opposite.
--
-- ## Additive, and reversible
--
-- Five columns are added. **Nothing is dropped and nothing is renamed.**
-- `body`, `face` and `palette` stay exactly where they are, keep their values,
-- and gain a DEFAULT so a writer that has stopped mentioning them still
-- satisfies their NOT NULL. Rolling back to the previous release therefore needs
-- no data work at all: the old columns still hold the old answer.
--
-- `hair` is **reused rather than replaced**. It meant a hairstyle index before
-- and it means a hairstyle index now, over the same six canonical slugs in the
-- same order, so every stored hairstyle survives untouched.
--
-- ## The backfill, and why it is written out rather than defaulted
--
-- A new column with a DEFAULT gives every existing row the same value, which
-- would silently repaint every manager who had already chosen a look. The four
-- old palettes map onto the new independent traits exactly — they were bundles
-- *of these colours* — so the mapping is stated, and it is the one the previous
-- release actually rendered:
--
--   palette 0 "Warm"  -> skin 1, hair colour 1 (dark brown), top colour 1 (blue)
--   palette 1 "Deep"  -> skin 3, hair colour 0 (black),      top colour 0 (red)
--   palette 2 "Fair"  -> skin 0, hair colour 5 (ginger),     top colour 3 (green)
--   palette 3 "Olive" -> skin 2, hair colour 0 (black),      top colour 7 (grape)
--
-- and `top` is `body`, which is not an approximation: the two old "bodies" were
-- the hoodie and the button-up, and they are tops 0 and 1 here.
--
-- **In practice this backfill runs over nothing.** Saving a character has been
-- impossible since #48 — `app/actions/character.ts` exported a non-function from
-- a `'use server'` file, so every save returned a server-side exception — so no
-- production row can exist that was not written by a seed. The mapping is
-- correct anyway, because "the table is empty" is a fact about today and a
-- migration is forever.
--

ALTER TABLE "character_configurations"
  ADD COLUMN IF NOT EXISTS "skin" integer,
  ADD COLUMN IF NOT EXISTS "hair_colour" integer,
  ADD COLUMN IF NOT EXISTS "facial_hair" integer,
  ADD COLUMN IF NOT EXISTS "top" integer,
  ADD COLUMN IF NOT EXISTS "top_colour" integer;--> statement-breakpoint

--
-- Carry the old bundles across before the columns are made NOT NULL.
--
UPDATE "character_configurations" SET
  "skin" = COALESCE("skin", CASE "palette"
    WHEN 0 THEN 1 WHEN 1 THEN 3 WHEN 2 THEN 0 WHEN 3 THEN 2 ELSE 1 END),
  "hair_colour" = COALESCE("hair_colour", CASE "palette"
    WHEN 0 THEN 1 WHEN 1 THEN 0 WHEN 2 THEN 5 WHEN 3 THEN 0 ELSE 1 END),
  "top_colour" = COALESCE("top_colour", CASE "palette"
    WHEN 0 THEN 1 WHEN 1 THEN 0 WHEN 2 THEN 3 WHEN 3 THEN 7 ELSE 1 END),
  -- The old system had no facial hair at all, so everybody arrives clean-shaven.
  "facial_hair" = COALESCE("facial_hair", 0),
  "top" = COALESCE("top", "body");--> statement-breakpoint

--
-- NOT NULL, **and defaulted** — which is about the deploy rather than the data.
--
-- `vercel-build` runs migrations during the build, and the previous deployment
-- keeps serving until the new one is promoted. So there is a window in which a
-- migrated database is answering to code that has never heard of these columns,
-- and the same window exists in reverse on a rollback. A writer from that code
-- omits all five, and without a default the insert fails a NOT NULL check.
--
-- **The product never reaches these defaults**: `saveCharacter` writes all six
-- traits every time, and a manager who has never saved has no row at all — they
-- get a character derived from their user id instead, which is what stops the
-- ten of them being identical. The default exists so a mixed-version window
-- degrades to a plain-looking character rather than to a 500.
--
ALTER TABLE "character_configurations"
  ALTER COLUMN "skin" SET NOT NULL,
  ALTER COLUMN "hair_colour" SET NOT NULL,
  ALTER COLUMN "facial_hair" SET NOT NULL,
  ALTER COLUMN "top" SET NOT NULL,
  ALTER COLUMN "top_colour" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "character_configurations"
  ALTER COLUMN "skin" SET DEFAULT 0,
  ALTER COLUMN "hair_colour" SET DEFAULT 0,
  ALTER COLUMN "facial_hair" SET DEFAULT 0,
  ALTER COLUMN "top" SET DEFAULT 0,
  ALTER COLUMN "top_colour" SET DEFAULT 0;--> statement-breakpoint

--
-- The three superseded columns get a default so nothing has to write them.
--
-- Kept rather than dropped: dropping is destructive, it is the one thing a
-- rollback cannot undo, and three integers cost nothing. They are unread from
-- this release onward, and `lib/db/schema.ts` says so beside them.
--
ALTER TABLE "character_configurations"
  ALTER COLUMN "body" SET DEFAULT 0,
  ALTER COLUMN "face" SET DEFAULT 0,
  ALTER COLUMN "palette" SET DEFAULT 0;--> statement-breakpoint

--
-- Non-negative, and nothing more.
--
-- The database's job here is to refuse nonsense, not to know how many hairstyles
-- exist this month. A CHECK naming a count would need a migration every time art
-- shipped, and a migration that runs on a deploy to add a hairstyle is a bad
-- trade. The catalog is the upper bound (`lib/character/catalog.ts`), an index
-- outside it falls back per trait rather than crashing, and the customiser is
-- where a manager is told.
--
ALTER TABLE "character_configurations"
  ADD CONSTRAINT "character_configurations_traits_non_negative"
  CHECK (
    "skin" >= 0 AND "hair_colour" >= 0 AND "facial_hair" >= 0
    AND "top" >= 0 AND "top_colour" >= 0
  );
