ALTER TABLE "users" ADD COLUMN "showcase_collectible_id" uuid;--> statement-breakpoint

--
-- The foreign key, declared here rather than in `schema.ts`.
--
-- `collectibles.user_id` already references `users`, so declaring the reverse in
-- drizzle makes the two table types mutually recursive and TypeScript stops
-- inferring either of them (TS7022). Postgres has no problem with the cycle, so
-- the constraint is written directly. Drizzle leaves constraints it does not know
-- about alone, so a later `generate` will neither duplicate nor drop this.
--
-- RESTRICT: never let a shown item be deleted out from under the Showcase pointing
-- at it. Collectibles are undeletable anyway — this says so a second time, from the
-- other side.
--
ALTER TABLE "users"
  ADD CONSTRAINT "users_showcase_collectible_id_collectibles_id_fk"
  FOREIGN KEY ("showcase_collectible_id") REFERENCES "public"."collectibles"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

--
-- A manager may only show what they own.
--
-- The foreign key can say "this is a collectible". It cannot say "this is *your*
-- collectible", and that distinction is the whole authorization rule for the
-- Showcase — `18 §4` puts one item in front of the whole league, so pointing at
-- somebody else's would be both a lie and a way to display an item you never
-- pulled.
--
-- Enforced here rather than only in the service, for the same reason as every other
-- guard in this schema: an invariant in the application holds until somebody writes
-- a second caller. A commissioner fixing something by hand, a future bulk
-- migration, and a server action all pass through this.
--
CREATE FUNCTION reject_unowned_showcase() RETURNS trigger AS $$
BEGIN
  IF NEW.showcase_collectible_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM collectibles c
        WHERE c.id = NEW.showcase_collectible_id
          AND c.user_id = NEW.id
     ) THEN
    RAISE EXCEPTION
      'collectible % is not owned by user %, so it cannot be showcased',
      NEW.showcase_collectible_id, NEW.id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER users_showcase_must_be_owned
  BEFORE INSERT OR UPDATE ON "users"
  FOR EACH ROW EXECUTE FUNCTION reject_unowned_showcase();
