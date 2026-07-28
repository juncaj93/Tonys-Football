/**
 * Imports the league chain into the database.
 *
 *   npm run sleeper:import              # from recorded fixtures (default)
 *   npm run sleeper:import -- --live    # from the live Sleeper API
 *
 * Fixtures are the default deliberately. `16 §12` makes recorded fixtures the
 * intended development path, and an import that reads from disk is repeatable,
 * offline, and identical for everyone.
 *
 * Running this twice is the point: the second run should report zero records
 * changed. That is the `16 §13` P1 gate — "10 managers map; re-sync is a
 * no-op" — reduced to something you can see in a terminal.
 */
import { desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { closePool, getDb } from '@/lib/db';
import { seasonMemberships, seasons, users } from '@/lib/db/schema';
import { traverseChain } from '@/lib/sleeper/chain';
import { createFixtureSource } from '@/lib/sleeper/fixtures';
import { persistChain } from '@/lib/sleeper/persist';
import { createLiveSource, type SleeperSource } from '@/lib/sleeper/transport';

const DEFAULT_LEAGUE_ID = '1385016656425668608';

function parseArgs(): { leagueId: string; live: boolean } {
  const argv = process.argv.slice(2);
  const live = argv.includes('--live');
  const positional = argv.filter((arg) => !arg.startsWith('-'));

  return {
    leagueId: positional[0] ?? process.env['SLEEPER_LEAGUE_ID'] ?? DEFAULT_LEAGUE_ID,
    live,
  };
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

async function main(): Promise<void> {
  const { leagueId, live } = parseArgs();

  if (process.env['DATABASE_URL'] === undefined || process.env['DATABASE_URL'] === '') {
    console.error(
      'DATABASE_URL is not set.\n' +
        'Start local Postgres with `npm run db:up`, apply migrations with `npm run db:migrate`,\n' +
        'then export it, e.g.\n' +
        '  export DATABASE_URL=postgres://tonys:local_dev_only@localhost:5432/tonys_dev',
    );
    process.exit(1);
  }

  const source: SleeperSource = live ? createLiveSource() : createFixtureSource();
  console.log(`Reading from ${source.label}\n`);

  const chain = await traverseChain(source, leagueId, { includeWeeks: false });

  if (chain.errors.length > 0) {
    console.error('Chain traversal reported errors:');
    for (const error of chain.errors) console.error(`  ${error}`);
    if (chain.seasons.length === 0) process.exit(1);
    console.error('');
  }

  const db = getDb();

  try {
    const summary = await persistChain(db, chain, { sourceLabel: source.label });

    console.log('Seasons');
    console.log(`  ${pad('YEAR', 6)}${pad('LEAGUE', 21)}${pad('NEW', 5)}${pad('SEATS+', 8)}SEATS=`);
    for (const season of summary.seasons) {
      console.log(
        `  ${pad(String(season.year), 6)}${pad(season.leagueId, 21)}` +
          `${pad(season.seasonCreated ? 'yes' : 'no', 5)}` +
          `${pad(String(season.membershipsCreated), 8)}${String(season.membershipsUnchanged)}`,
      );
    }

    console.log('\nManagers');
    const coOwners = alias(users, 'co_owners');

    const rows = await db
      .select({
        year: seasons.year,
        rosterId: seasonMemberships.rosterId,
        userId: users.id,
        manager: users.displayName,
        coOwner: coOwners.displayName,
        finalRank: seasonMemberships.finalRank,
        metadata: seasonMemberships.sleeperMetadata,
      })
      .from(seasonMemberships)
      .innerJoin(seasons, eq(seasonMemberships.seasonId, seasons.id))
      .innerJoin(users, eq(seasonMemberships.userId, users.id))
      .leftJoin(coOwners, eq(seasonMemberships.coOwnerUserId, coOwners.id))
      .orderBy(desc(seasons.year), seasonMemberships.rosterId);

    console.log(
      `  ${pad('YEAR', 6)}${pad('SLOT', 6)}${pad('MANAGER', 20)}${pad('CO-OWNER', 14)}` +
        `${pad('RANK', 6)}NICKNAMES`,
    );
    for (const row of rows) {
      const nicknames = Object.keys(row.metadata?.playerNicknames ?? {}).length;
      console.log(
        `  ${pad(String(row.year), 6)}${pad(String(row.rosterId), 6)}` +
          `${pad(row.manager, 20)}${pad(row.coOwner ?? '—', 14)}` +
          `${pad(row.finalRank === null ? '—' : String(row.finalRank), 6)}${String(nicknames)}`,
      );
    }

    console.log('\nChampions');
    for (const season of summary.seasons) {
      const champion =
        season.championUserId === null
          ? 'not yet decided'
          : (rows.find((row) => row.userId === season.championUserId)?.manager ??
            season.championUserId);
      console.log(`  ${String(season.year)}  ${champion}`);
    }

    console.log(
      `\n${String(summary.usersCreated)} people created · ` +
        `${String(summary.recordsChanged)} records changed · ` +
        `${String(summary.recordsSkipped)} skipped · status ${summary.status}`,
    );

    if (summary.warnings.length > 0) {
      console.log('\nWarnings');
      for (const warning of summary.warnings) console.log(`  ${warning}`);
    }

    if (summary.recordsChanged === 0) {
      console.log('\nNothing changed — this import was a no-op, as a re-sync should be.');
    }
  } finally {
    await closePool();
  }
}

main().catch((error: unknown) => {
  console.error(`\nImport failed: ${error instanceof Error ? error.message : String(error)}`);
  void closePool().finally(() => {
    process.exit(1);
  });
});
