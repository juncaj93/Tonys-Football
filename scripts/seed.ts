/**
 * Brings a database up to a servable state.
 *
 *   npm run db:seed
 *
 * Three idempotent steps, safe to run on every deploy and safe to run twice:
 *
 *   1. import the league chain from recorded fixtures
 *   2. seed the Counter Greetings from `content/counter-greetings.md`
 *   3. grant admin to the commissioner named in the environment
 *
 * Fixtures rather than the live API, deliberately (`16 §12`): the import is
 * then offline, repeatable, and identical in every environment, and a Sleeper
 * outage cannot take a deploy down with it.
 *
 * Nothing here is destructive. Re-running reports zero changes.
 */
import { eq } from 'drizzle-orm';

import { now } from '@/lib/clock';
import {
  assertOnlyApprovedGroups,
  readCounterGreetings,
  seedCounterGreetings,
} from '@/lib/content/seed';
import { closePool, getDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { traverseChain } from '@/lib/sleeper/chain';
import { createFixtureSource } from '@/lib/sleeper/fixtures';
import { persistChain } from '@/lib/sleeper/persist';

const DEFAULT_LEAGUE_ID = '1385016656425668608';

async function main(): Promise<void> {
  if ((process.env['DATABASE_URL'] ?? '') === '') {
    console.error('DATABASE_URL is not set. See .env.example.');
    process.exit(1);
  }

  const db = getDb();

  try {
    // --- 1. League history ------------------------------------------------
    const source = createFixtureSource();
    const leagueId = process.env['SLEEPER_LEAGUE_ID'] ?? DEFAULT_LEAGUE_ID;
    const chain = await traverseChain(source, leagueId, { includeWeeks: false });

    if (chain.seasons.length === 0) {
      console.error('The chain produced no seasons; nothing to import.');
      for (const error of chain.errors) console.error(`  ${error}`);
      process.exit(1);
    }

    const imported = await persistChain(db, chain, { sourceLabel: source.label });
    console.log(
      `History  ${String(imported.seasons.length)} seasons · ` +
        `${String(imported.recordsChanged)} records changed · status ${imported.status}`,
    );

    // --- 2. Content -------------------------------------------------------
    const parsed = readCounterGreetings();
    const seeded = await seedCounterGreetings(db, parsed);
    console.log(
      `Content  ${String(seeded.keys.length)} Counter Greetings · ` +
        `${String(seeded.inserted)} new · ${String(seeded.updated)} updated · ` +
        `${String(seeded.deactivated)} retired`,
    );

    await assertOnlyApprovedGroups(db);

    // --- 3. The commissioner ----------------------------------------------
    const commissioner = process.env['COMMISSIONER_SLEEPER_USER_ID'] ?? '';

    if (commissioner === '') {
      console.log('Admin    COMMISSIONER_SLEEPER_USER_ID is unset — nobody is an admin.');
    } else {
      const granted = await db
        .update(users)
        .set({ isAdmin: true, updatedAt: now() })
        .where(eq(users.sleeperUserId, commissioner))
        .returning({ name: users.displayName });

      const name = granted[0]?.name;
      if (name === undefined) {
        // Loud, but not fatal: a wrong ID should not take down a deploy, and
        // the safe outcome — nobody is an admin — is already in force.
        console.warn(
          `Admin    no manager has Sleeper ID ${commissioner}; no admin was granted.`,
        );
      } else {
        console.log(`Admin    ${name}`);
      }
    }
  } finally {
    await closePool();
  }
}

main().catch((error: unknown) => {
  console.error(`\nSeed failed: ${error instanceof Error ? error.message : String(error)}`);
  void closePool().finally(() => {
    process.exit(1);
  });
});
