/**
 * The midseason rehearsal — eight Tuesdays of 2026, played and measured.
 *
 * ## What this is for
 *
 * `lib/slice/midseason-week8.test.ts` is the gate; this is the **instrument**.
 * It plays the same eight weeks and prints what the league looks like at each
 * step — the table, the ledger, the boxes, the board, the paper, and how long
 * each Tuesday took. A test can assert that a number is right; only a run like
 * this can answer *"is the whole thing still coherent, and is it getting
 * slower"*, which is the question a midseason rehearsal exists to ask.
 *
 * Numbers printed here are the ones `docs/WEEK8_REHEARSAL.md` records. Re-run it
 * whenever the lifecycle changes:
 *
 *     export DATABASE_URL=postgres://tonys@127.0.0.1:5432/tonys_dev
 *     npx tsx scripts/week8-rehearsal.ts
 *
 * It is destructive — it truncates every application table — and refuses to run
 * against anything that looks hosted, for the reason `scripts/dev-db.sh` does.
 */

import { and, eq, sql } from 'drizzle-orm';

import { nowMs } from '@/lib/clock';

import { collectionFor } from '@/lib/counter/collection';
import { openBox } from '@/lib/counter/boxes';
import { wallet } from '@/lib/counter/tokens';
import { closePool, getDb, type Database } from '@/lib/db';
import {
  boxOpenings,
  collectibles,
  fantasyMatchups,
  lootBoxes,
  seasonMemberships,
  seasons,
  sliceIssueVersions,
  tokenTransactions,
  weekFinalizations,
  weeklyRewards,
  weeklyStakes,
} from '@/lib/db/schema';
import { resetDatabase } from '@/lib/db/reset';
import { activeLeagueManagers } from '@/lib/league/membership';
import {
  MIDSEASON_SEASON,
  REHEARSAL_WEEK,
  midseasonRecords,
} from '@/lib/sleeper/midseason-2026';
import { importHistory, playWeek } from '@/lib/sleeper/midseason-season';
import { stakeSeason } from '@/lib/stakes/facts';
import { standingsThrough, winStreak } from '@/lib/stats/standings';

function refuseRemote(): void {
  const url = process.env['DATABASE_URL'] ?? '';
  if (url === '') throw new Error('DATABASE_URL is not set.');
  if (/neon\.tech|vercel|supabase|amazonaws|\.cloud/.test(url)) {
    throw new Error(`REFUSED: DATABASE_URL looks hosted (${url}). This truncates every table.`);
  }
}

function heading(text: string): void {
  console.log(`\n${'='.repeat(72)}\n${text}\n${'='.repeat(72)}`);
}

const points = (cents: number): string => (cents / 100).toFixed(2);

async function printTable(db: Database, throughWeek: number): Promise<void> {
  const season = await stakeSeason(db, MIDSEASON_SEASON);
  const table = standingsThrough({
    rows: season.rows,
    throughWeek,
    roster: season.roster,
  });

  console.log(
    ['  #', 'manager'.padEnd(9), 'W-L', 'points for', 'streak'].join('  '),
  );
  for (const row of table) {
    const streak = winStreak({ rows: season.rows, rosterId: row.rosterId, throughWeek });
    console.log(
      [
        String(row.rank).padStart(3),
        (row.displayName ?? '—').padEnd(9),
        `${String(row.wins)}-${String(row.losses)}`.padEnd(3),
        points(row.pointsForCents).padStart(10),
        streak > 0 ? `won ${String(streak)}` : '',
      ].join('  '),
    );
  }
}

async function printWallets(db: Database, label: string): Promise<void> {
  const [season] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.year, MIDSEASON_SEASON));
  const managers = await activeLeagueManagers(db);

  console.log(`\n${label}`);
  for (const manager of managers) {
    const held = await wallet(db, { userId: manager.id, seasonId: season!.id });
    const collection = await collectionFor(db, manager.id);
    const boxes = await db
      .select({ state: lootBoxes.state })
      .from(lootBoxes)
      .where(eq(lootBoxes.userId, manager.id));
    console.log(
      `  ${manager.displayName.padEnd(9)} ${String(held?.balance ?? 0).padStart(5)} tokens` +
        `  ${String(collection.distinct).padStart(2)}/${String(collection.total)} collectibles` +
        `  boxes: ${String(boxes.filter((b) => b.state === 'UNOPENED').length)} unopened,` +
        ` ${String(boxes.filter((b) => b.state === 'OPENED').length)} opened`,
    );
  }
}

async function counts(db: Database): Promise<Record<string, number>> {
  const [matchups] = await db.select({ n: sql<number>`count(*)::int` }).from(fantasyMatchups);
  const [finals] = await db.select({ n: sql<number>`count(*)::int` }).from(weekFinalizations);
  const [rewards] = await db.select({ n: sql<number>`count(*)::int` }).from(weeklyRewards);
  const [ledger] = await db.select({ n: sql<number>`count(*)::int` }).from(tokenTransactions);
  const [stakes] = await db.select({ n: sql<number>`count(*)::int` }).from(weeklyStakes);
  const [boxes] = await db.select({ n: sql<number>`count(*)::int` }).from(lootBoxes);
  const [openings] = await db.select({ n: sql<number>`count(*)::int` }).from(boxOpenings);
  const [items] = await db.select({ n: sql<number>`count(*)::int` }).from(collectibles);
  const [versions] = await db.select({ n: sql<number>`count(*)::int` }).from(sliceIssueVersions);
  return {
    matchups: matchups?.n ?? 0,
    weekFinalizations: finals?.n ?? 0,
    weeklyRewards: rewards?.n ?? 0,
    tokenTransactions: ledger?.n ?? 0,
    weeklyStakes: stakes?.n ?? 0,
    lootBoxes: boxes?.n ?? 0,
    boxOpenings: openings?.n ?? 0,
    collectibles: items?.n ?? 0,
    sliceVersions: versions?.n ?? 0,
  };
}

/**
 * Open every unopened box the league holds.
 *
 * Not decoration. `03 §4`'s rewards accumulate a balance; only an *opening*
 * exercises the collectible side — the rarity roll, the unowned-item choice, the
 * duplicate salvage payment, and the four locks that make a box open once. A
 * rehearsal that left every box shut would report a midseason economy nobody had
 * spent anything in.
 */
async function openEverything(db: Database): Promise<{ opened: number; salvaged: number }> {
  const [season] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.year, MIDSEASON_SEASON));

  let opened = 0;
  let salvaged = 0;
  for (const manager of await activeLeagueManagers(db)) {
    const boxes = await db
      .select({ id: lootBoxes.id })
      .from(lootBoxes)
      .where(and(eq(lootBoxes.userId, manager.id), eq(lootBoxes.state, 'UNOPENED')));
    for (const box of boxes) {
      const result = await openBox(db, {
        userId: manager.id,
        boxId: box.id,
        seasonId: season?.id ?? null,
      });
      if (result.status === 'opened') {
        opened += 1;
        if (result.reveal.salvageTokens !== null) salvaged += 1;
      }
    }
  }
  return { opened, salvaged };
}

async function main(): Promise<void> {
  refuseRemote();
  const db = getDb();

  heading('SETUP — the recorded league, then seven Tuesdays');
  await resetDatabase(db);

  const importStarted = nowMs();
  await importHistory(db);
  console.log(`  history imported in ${String(nowMs() - importStarted)}ms`);

  const timings: { week: number; ms: number; games: number; paid: number; authored: number }[] = [];

  for (let week = 1; week < REHEARSAL_WEEK; week += 1) {
    const started = nowMs();
    const report = await playWeek(db, week);
    const ms = nowMs() - started;
    timings.push({
      week,
      ms,
      games: report.games,
      paid: report.rewards?.paid.length ?? 0,
      authored: report.authored,
    });
    console.log(
      `  week ${String(week).padStart(2)}  ${String(ms).padStart(6)}ms` +
        `  games ${String(report.games)}` +
        `  closed ${String(report.finalized)}` +
        `  paid ${String(report.rewards?.paid.length ?? 0)} (${String(report.rewards?.tokens ?? 0)} tokens)` +
        `  boxes ${String(report.grants?.granted ?? 0)}` +
        `  authored ${String(report.authored)}` +
        `  draft ${report.draft?.outcome ?? '—'}` +
        (report.failed.length > 0 ? `  FAILED ${JSON.stringify(report.failed)}` : ''),
    );
  }

  heading(`STARTING WEEK ${String(REHEARSAL_WEEK)} STATE`);
  console.log('\nStandings through week 7 (product-derived):');
  await printTable(db, REHEARSAL_WEEK - 1);
  console.log('\nFixture-authored records through week 7, for comparison:');
  for (const record of midseasonRecords(REHEARSAL_WEEK - 1)) {
    console.log(
      `  roster ${String(record.rosterId).padStart(2)}  ${String(record.wins)}-${String(record.losses)}` +
        `  ${points(record.pointsForCents).padStart(10)}`,
    );
  }

  const openedBefore = await openEverything(db);
  console.log(
    `\nBoxes opened before week 8: ${String(openedBefore.opened)} (${String(openedBefore.salvaged)} salvaged as duplicates)`,
  );
  await printWallets(db, 'Wallets and shelves entering week 8:');

  const before = await counts(db);
  console.log('\nRow counts entering week 8:', JSON.stringify(before));

  const basis = await stakeSeason(db, MIDSEASON_SEASON);
  const openBoard = await db
    .select({
      week: weeklyStakes.week,
      kind: weeklyStakes.kind,
      variant: weeklyStakes.variant,
      status: weeklyStakes.status,
      numbers: weeklyStakes.allowedNumbers,
    })
    .from(weeklyStakes)
    .orderBy(weeklyStakes.week);
  console.log('\nThe board entering week 8:');
  for (const stake of openBoard) {
    console.log(
      `  wk ${String(stake.week).padStart(2)}  ${stake.kind.padEnd(10)} ${stake.variant.padEnd(22)}` +
        ` ${stake.status.padEnd(9)} ${JSON.stringify(stake.numbers)}`,
    );
  }
  console.log(
    `  weeks stored: ${String(new Set(basis.rows.map((r) => r.week)).size)},` +
      ` weeks closed: ${String(basis.weekFinalizedAt.size)}`,
  );

  heading(`WEEK ${String(REHEARSAL_WEEK)} — the lifecycle`);
  const week8Started = nowMs();
  const week8 = await playWeek(db, REHEARSAL_WEEK);
  const week8Ms = nowMs() - week8Started;
  timings.push({
    week: REHEARSAL_WEEK,
    ms: week8Ms,
    games: week8.games,
    paid: week8.rewards?.paid.length ?? 0,
    authored: week8.authored,
  });

  console.log(`  elapsed          ${String(week8Ms)}ms`);
  console.log(`  week resolved    ${String(week8.week)}`);
  console.log(`  sync             ${JSON.stringify(week8.sync?.summary ?? week8.sync?.refusal)}`);
  console.log(`  finalized        ${String(week8.finalized)} (${String(week8.games)} games)`);
  console.log(`  settled          ${JSON.stringify(week8.settled)}`);
  console.log(
    `  rewards          ${String(week8.rewards?.paid.length ?? 0)} paid,` +
      ` ${String(week8.rewards?.tokens ?? 0)} tokens,` +
      ` ${String(week8.rewards?.alreadyPaid ?? 0)} already paid`,
  );
  console.log(
    `  grants           ${String(week8.grants?.granted ?? 0)} granted,` +
      ` ${String(week8.grants?.alreadyGranted ?? 0)} already held,` +
      ` milestones ${JSON.stringify(week8.grants?.milestones ?? [])}`,
  );
  console.log(`  authored         ${String(week8.authored)} for week 9`);
  console.log(`  draft            ${JSON.stringify(week8.draft)}`);
  console.log(`  skipped          ${JSON.stringify(week8.skipped, null, 2)}`);
  console.log(`  failed           ${JSON.stringify(week8.failed)}`);

  heading('AFTER WEEK 8');
  console.log('\nStandings through week 8:');
  await printTable(db, REHEARSAL_WEEK);
  await printWallets(db, '\nWallets and shelves after week 8:');
  const after = await counts(db);
  console.log('\nRow counts after week 8:', JSON.stringify(after));

  heading('REPLAY — the same Tuesday, twice');
  const replayStarted = nowMs();
  const replay = await playWeek(db, REHEARSAL_WEEK);
  const replayMs = nowMs() - replayStarted;
  const afterReplay = await counts(db);
  console.log(`  elapsed          ${String(replayMs)}ms`);
  console.log(`  finalized again  ${String(replay.finalized)}`);
  console.log(`  paid again       ${String(replay.rewards?.paid.length ?? 0)}`);
  console.log(`  draft            ${String(replay.draft?.outcome ?? '—')}`);
  console.log('  row counts       ', JSON.stringify(afterReplay));
  const drift = Object.entries(after).filter(([key, value]) => afterReplay[key] !== value);
  console.log(
    drift.length === 0
      ? '  NOTHING MOVED on replay.'
      : `  DRIFT: ${JSON.stringify(drift)} → ${JSON.stringify(afterReplay)}`,
  );

  heading('TIMINGS');
  for (const row of timings) {
    console.log(
      `  week ${String(row.week).padStart(2)}  ${String(row.ms).padStart(6)}ms` +
        `  games ${String(row.games)}  paid ${String(row.paid)}  authored ${String(row.authored)}`,
    );
  }
  const first = timings[0]?.ms ?? 0;
  const last = timings.at(-1)?.ms ?? 0;
  console.log(
    `  week 1 ${String(first)}ms → week ${String(REHEARSAL_WEEK)} ${String(last)}ms` +
      `  (${first === 0 ? '—' : `${(last / first).toFixed(2)}×`})`,
  );
  console.log(`  replay of week ${String(REHEARSAL_WEEK)}: ${String(replayMs)}ms`);

  heading('SEATS — permanent identity across the accumulated season');
  const seats = await db
    .select({
      year: seasons.year,
      roster: seasonMemberships.rosterId,
      wins: seasonMemberships.wins,
      losses: seasonMemberships.losses,
      rank: seasonMemberships.finalRank,
    })
    .from(seasonMemberships)
    .innerJoin(seasons, eq(seasons.id, seasonMemberships.seasonId))
    .orderBy(seasons.year, seasonMemberships.rosterId);
  for (const year of [2024, 2025, 2026]) {
    const rows = seats.filter((s) => s.year === year);
    console.log(
      `  ${String(year)}: ${rows
        .map((r) => `r${String(r.roster)} ${String(r.wins)}-${String(r.losses)}`)
        .join('  ')}`,
    );
  }

  await closePool();
}

main().catch(async (error: unknown) => {
  console.error(error);
  await closePool();
  process.exitCode = 1;
});
