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
import { DRAFT_SYNC_REFUSALS, syncSeasonDraft } from '@/lib/sleeper/persist-draft';
import { createLiveSource, type SleeperSource } from '@/lib/sleeper/transport';

const DEFAULT_LEAGUE_ID = '1385016656425668608';

function parseArgs(): { leagueId: string; live: boolean; finalizeYears: readonly number[] } {
  const argv = process.argv.slice(2);
  const live = argv.includes('--live');

  // `--finalize 2024,2025` freezes those seasons' official records. Explicit
  // by design: Sleeper's `complete` status arrives before stat corrections
  // stop, so it is not a signal to close the books on.
  const flagIndex = argv.indexOf('--finalize');
  const finalizeValue = flagIndex === -1 ? '' : (argv[flagIndex + 1] ?? '');
  const finalizeYears = finalizeValue
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((year) => Number.isInteger(year) && year > 2000);

  // The flag's value is not a league ID, so it must not fall through to the
  // positional argument — that reads "2024,2025" as a league to import.
  const positional = argv.filter(
    (arg, index) => !arg.startsWith('-') && index !== flagIndex + 1,
  );

  return {
    leagueId: positional[0] ?? process.env['SLEEPER_LEAGUE_ID'] ?? DEFAULT_LEAGUE_ID,
    live,
    finalizeYears,
  };
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

async function main(): Promise<void> {
  const { leagueId, live, finalizeYears } = parseArgs();

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

  // Weeks are needed to reconcile the finalized standings against the weekly
  // scoring snapshot. They are read and compared, not persisted — the weekly
  // tables are Phase B.
  const chain = await traverseChain(source, leagueId, { includeWeeks: true });

  if (chain.errors.length > 0) {
    console.error('Chain traversal reported errors:');
    for (const error of chain.errors) console.error(`  ${error}`);
    if (chain.seasons.length === 0) process.exit(1);
    console.error('');
  }

  const db = getDb();

  try {
    const summary = await persistChain(db, chain, { sourceLabel: source.label, finalizeYears });

    console.log('Seasons');
    console.log(
      `  ${pad('YEAR', 6)}${pad('LEAGUE', 21)}${pad('NEW', 5)}${pad('SEATS+', 8)}` +
        `${pad('SEATS~', 8)}${pad('SEATS=', 8)}FROZEN`,
    );
    for (const season of summary.seasons) {
      console.log(
        `  ${pad(String(season.year), 6)}${pad(season.leagueId, 21)}` +
          `${pad(season.seasonCreated ? 'yes' : 'no', 5)}` +
          `${pad(String(season.membershipsCreated), 8)}` +
          `${pad(String(season.membershipsUpdated), 8)}` +
          `${pad(String(season.membershipsUnchanged), 8)}` +
          `${season.finalized ? 'yes' : '—'}`,
      );
    }

    // The draft, per season. After the memberships, because a pick resolves to
    // a manager through one.
    console.log('\nDrafts');
    for (const season of chain.seasons) {
      const draft = await syncSeasonDraft(db, {
        source,
        seasonYear: season.year,
        leagueId: season.leagueId,
      });
      console.log(
        `  ${pad(String(season.year), 6)}` +
          (draft.refusal === null
            ? `${pad(String(draft.picksStored), 6)}picks · ${draft.outcome ?? 'unchanged'}`
            : DRAFT_SYNC_REFUSALS[draft.refusal]),
      );
      for (const warning of draft.warnings) console.warn(`         ${warning}`);
    }

    // The reconciliation is commissioner-facing diagnostics. Ordinary manager
    // surfaces never show it — they show the finalized record and nothing else.
    console.log('\nFinalized standings vs weekly scoring snapshot');
    for (const season of [...chain.seasons].sort((a, b) => a.year - b.year)) {
      const check = season.reconciliation;
      if (check === null) {
        console.log(`  ${String(season.year)}  no weekly data imported`);
        continue;
      }
      const captured = check.capturedAt === null ? 'unknown' : check.capturedAt.toISOString();
      console.log(
        `  ${String(season.year)}  ` +
          (check.isClean
            ? 'clean'
            : `${String(check.recordConflicts.length)} record · ` +
              `${String(check.pointsConflicts.length)} points · ` +
              `${String(check.disputedGames.length)} disputed game(s)`) +
          `   snapshot captured ${captured}`,
      );
      for (const game of check.disputedGames) {
        console.log(
          `      week ${String(game.week)}: roster ${String(game.finalizedWinnerRosterId ?? 0)} ` +
            `is the official winner; current scoring says roster ` +
            `${String(game.snapshotWinnerRosterId ?? 0)}`,
        );
      }
    }

    console.log('\nManagers');
    const coOwners = alias(users, 'co_owners');

    const rows = await db
      .select({
        year: seasons.year,
        rosterId: seasonMemberships.rosterId,
        userId: users.id,
        manager: users.displayName,
        sleeperUsername: users.sleeperUsername,
        retired: users.isRetired,
        coOwner: coOwners.displayName,
        teamName: seasonMemberships.teamName,
        wins: seasonMemberships.wins,
        losses: seasonMemberships.losses,
        ties: seasonMemberships.ties,
        pointsFor: seasonMemberships.pointsFor,
        finalRank: seasonMemberships.finalRank,
      })
      .from(seasonMemberships)
      .innerJoin(seasons, eq(seasonMemberships.seasonId, seasons.id))
      .innerJoin(users, eq(seasonMemberships.userId, users.id))
      .leftJoin(coOwners, eq(seasonMemberships.coOwnerUserId, coOwners.id))
      .orderBy(desc(seasons.year), seasonMemberships.rosterId);

    console.log(
      `  ${pad('YEAR', 6)}${pad('SLOT', 6)}${pad('MANAGER', 12)}${pad('SLEEPER', 16)}` +
        `${pad('TEAM THAT SEASON', 28)}${pad('CO-OWNER', 10)}${pad('RECORD', 9)}` +
        `${pad('PF', 10)}RANK`,
    );
    for (const row of rows) {
      console.log(
        `  ${pad(String(row.year), 6)}${pad(String(row.rosterId), 6)}` +
          `${pad(row.manager + (row.retired ? '*' : ''), 12)}` +
          `${pad(row.sleeperUsername ?? '—', 16)}` +
          `${pad(row.teamName ?? '—', 28)}${pad(row.coOwner ?? '—', 10)}` +
          `${pad(`${String(row.wins)}-${String(row.losses)}-${String(row.ties)}`, 9)}` +
          `${pad(row.pointsFor.toFixed(2), 10)}` +
          `${row.finalRank === null ? '—' : String(row.finalRank)}`,
      );
    }
    console.log('  * retired — history preserved in full');

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
