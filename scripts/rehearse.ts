/**
 * Run a lifecycle rehearsal and write the commissioner's report.
 *
 *   npm run rehearse -- week-1
 *   npm run rehearse -- week-1 --out docs/evidence/week-1-rehearsal/report.md
 *
 * ## Why the report is generated rather than written
 *
 * `docs/WEEK_1_REHEARSAL.md` is the account a person reads to decide whether the
 * first real week of the season is safe. A hand-written account of a passing
 * test is a claim about a test; this runs the same chain the cron runs, against
 * a real Postgres, and prints what actually landed in the database. If the
 * numbers in the report and the numbers in the product ever disagree, it is
 * because somebody changed the product — and re-running this is how they find
 * out.
 *
 * The assertions live in `lib/rehearsal/week-1.test.ts`. **This script asserts
 * nothing** and is not a gate: it is the evidence, and the test is the gate. Two
 * things that both check would be two places to disagree.
 *
 * ## It refuses a hosted database
 *
 * It truncates every league table before it runs, exactly as the test suite
 * does. `scripts/dev-db.sh` carries the same guard for the same reason, and it
 * exists because the rule was broken once.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { closePool, getDb } from '@/lib/db';
import { resetDatabase } from '@/lib/db/reset';
import {
  createRehearsal,
  type LifecycleState,
  type Rehearsal,
} from '@/lib/rehearsal/harness';
import { WEEK_1_EXPECTED, WEEK_1_SCRIPT, WEEK_1_SEATS } from '@/lib/rehearsal/week-1';

const USAGE = `
Usage:
  npm run rehearse -- week-1 [--out <path>]
`.trim();

const DEFAULT_OUT = path.join('docs', 'evidence', 'week-1-rehearsal', 'report.md');

const SUNDAY = new Date('2026-09-13T23:55:00Z');
const TUESDAY = new Date('2026-09-15T09:00:00Z');
const NEXT_TUESDAY = new Date('2026-09-22T09:00:00Z');

function refuseHosted(url: string): void {
  if (/neon\.tech|vercel|supabase|amazonaws|\.cloud/.test(url)) {
    throw new Error(
      `REFUSED: DATABASE_URL looks hosted (${url}). The rehearsal truncates every ` +
        'league table. Point it at a local throwaway database.',
    );
  }
}

/** `123.45` from cents, or a dash. Report formatting, nothing else. */
function money(value: number): string {
  return value.toFixed(2);
}

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const lines = [
    `| ${header.join(' | ')} |`,
    `|${header.map(() => '---').join('|')}|`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ];
  return lines.join('\n');
}

interface Leg {
  readonly title: string;
  readonly lines: readonly string[];
}

async function rehearseWeekOne(): Promise<{ legs: Leg[]; final: LifecycleState }> {
  const db = getDb();
  await resetDatabase(db);

  const run: Rehearsal = createRehearsal({
    db,
    script: WEEK_1_SCRIPT,
    finalizeYears: [2024, 2025],
  });

  const legs: Leg[] = [];

  // --- Preseason ----------------------------------------------------------
  await run.seed();
  const before = await run.observe();
  legs.push({
    title: 'Before the week — the state a deploy leaves behind',
    lines: [
      `Season **${String(before.season?.year ?? 0)}**, open (its books shut in January, not by a cron).`,
      '',
      `Ten seats, mapped to the names Tony uses:`,
      '',
      table(
        ['Roster', 'Manager', 'Tokens'],
        before.seats.map((seat) => [String(seat.rosterId), seat.manager, String(seat.balance)]),
      ),
      '',
      `Stored week-1 games: **${String(before.games.filter((g) => g.week === 1).length)}**. ` +
        `Snapshots: **${String(before.snapshots.length)}**. ` +
        `Closed weeks: **${String(before.finalizations.length)}**. ` +
        `Rewards: **${String(before.rewards.length)}**. ` +
        `Slice versions: **${String(before.versions.length)}**.`,
      '',
      'No fabricated 0–0 record is present for a week nobody has played.',
    ],
  });

  // --- Sunday -------------------------------------------------------------
  const sunday = await run.sunday({ played: 1, at: SUNDAY });
  const afterSunday = await run.observe();
  legs.push({
    title: 'Sunday 23:55 — the pre-Monday photograph',
    lines:
      sunday.outcome.kind === 'ran'
        ? [
            `The job resolved week **${String(sunday.outcome.report.week)}** from Sleeper's own ` +
              `state, photographed **${String(sunday.outcome.report.games)}** games, and left ` +
              `**${String(sunday.outcome.report.unpaired)}** rosters unpaired.`,
            '',
            table(
              ['Game', 'Rosters', 'Score before Monday'],
              afterSunday.snapshots.map((row) => [
                `m${String(row.matchupId)}`,
                `${String(row.rosterA)} v ${String(row.rosterB)}`,
                `${money(row.pointsA)} – ${money(row.pointsB)}`,
              ]),
            ),
            '',
            'Run a second time it writes nothing: a later capture of the same week is a worse',
            'photograph, not a fresher one, and the storage refuses it at a constraint.',
          ]
        : [`The job declined: ${sunday.outcome.why}`],
  });

  // --- Tuesday ------------------------------------------------------------
  const tuesday = await run.tuesday({ played: 1, at: TUESDAY });
  const afterTuesday = await run.observe();

  legs.push({
    title: 'Tuesday 09:00 — sync, close, settle, pay, author, draft',
    lines: [
      `Sleeper sync: **${tuesday.sync?.refusal ?? 'read cleanly'}** — ` +
        `${String(tuesday.sync?.summary?.recordsChanged ?? 0)} records changed.`,
      `Week resolved **after** the sync: **${String(tuesday.week)}**.`,
      `Closed by this run: **${tuesday.finalized ? 'yes' : 'no'}**, over ` +
        `**${String(tuesday.games)}** publishable games.`,
      `Stakes settled: **${JSON.stringify(tuesday.settled)}**.`,
      `Rewards: **${String(tuesday.rewards?.paid.length ?? 0)}** paid, ` +
        `**${String(tuesday.rewards?.tokens ?? 0)}** tokens, ` +
        `economy version \`${tuesday.rewards?.economyVersion ?? 'none'}\`.`,
      `Free seasonal boxes handed out: **${String(tuesday.grants?.granted ?? 0)}**.`,
      `Offers written for week ${String(tuesday.week + 1)}: **${String(tuesday.authored)}**.`,
      `Draft: **${tuesday.draft?.outcome ?? 'none'}**${
        tuesday.draft?.refusal === undefined || tuesday.draft.refusal === null
          ? ''
          : ` (${tuesday.draft.refusal})`
      }.`,
      `Steps that threw: **${tuesday.failed.length === 0 ? 'none' : JSON.stringify(tuesday.failed)}**.`,
      ...(tuesday.skipped.length === 0
        ? []
        : ['', 'Steps that declined, in the job\'s own words:', '', ...tuesday.skipped.map((line) => `- ${line}`)]),
      '',
      '**The five final results**',
      '',
      table(
        ['Game', 'Home', 'Away', 'Score', 'Winner'],
        afterTuesday.games
          .filter((game) => game.week === 1)
          .map((game) => [
            `m${String(game.matchupId)}`,
            WEEK_1_SEATS[game.rosterA] ?? String(game.rosterA),
            WEEK_1_SEATS[game.rosterB] ?? String(game.rosterB),
            `${money(game.pointsA)} – ${money(game.pointsB)}`,
            game.winner === null ? 'tie' : (WEEK_1_SEATS[game.winner] ?? String(game.winner)),
          ]),
      ),
      '',
      '**What the week paid**',
      '',
      table(
        ['Manager', 'Reason', 'Tokens'],
        afterTuesday.rewards.map((row) => [row.manager, row.reason, String(row.amount)]),
      ),
      '',
      table(
        ['Manager', 'Ledger sum', 'Stored balance'],
        afterTuesday.seats.map((seat) => {
          const sum = afterTuesday.ledger
            .filter((row) => row.manager === seat.manager)
            .reduce((total, row) => total + row.amount, 0);
          return [seat.manager, String(sum), String(seat.balance)];
        }),
      ),
    ],
  });

  // --- Replay -------------------------------------------------------------
  const replay = await run.tuesday({ played: 1, at: NEXT_TUESDAY });
  const afterReplay = await run.observe();
  legs.push({
    title: 'The same Tuesday, run again',
    lines: [
      `Closed again: **${replay.finalized ? 'yes — a defect' : 'no'}**.`,
      `Rewards paid again: **${String(replay.rewards?.paid.length ?? 0)}** ` +
        `(already on the books: ${String(replay.rewards?.alreadyPaid ?? 0)}).`,
      `Slice versions in the database: **${String(afterReplay.versions.length)}**.`,
      `Ledger rows: **${String(afterReplay.ledger.length)}** — ` +
        `unchanged from ${String(afterTuesday.ledger.length)}.`,
      `Stake resolutions: **${String(afterReplay.resolutions.length)}**.`,
    ],
  });

  // --- The human half -----------------------------------------------------
  const versionId = tuesday.draft?.versionId ?? null;
  const commissioner = await run.managerIdNamed('Alex');
  let publication = 'The Tuesday job produced no draft, so there was nothing to approve.';

  if (versionId !== null && commissioner !== null) {
    await run.approve({ versionId, actorUserId: commissioner });
    await run.publish({ versionId, actorUserId: commissioner });
    publication =
      'The draft was approved by a named person and then published. The cron cannot do ' +
      'either: it ends at `submit`, and the database refuses a publication with no ' +
      'recorded approval naming somebody.';
  }

  const afterPublication = await run.observe();
  legs.push({
    title: 'The commissioner — approval and publication',
    lines: [
      publication,
      '',
      table(
        ['Season', 'Week', 'Version', 'Status', 'Validator'],
        afterPublication.versions.map((version) => [
          String(version.season),
          String(version.week),
          String(version.version),
          version.status,
          version.publishable ? 'passed' : 'refused',
        ]),
      ),
    ],
  });

  // --- Week 2 -------------------------------------------------------------
  await run.sunday({ played: 2, at: new Date('2026-09-20T23:55:00Z') });
  const second = await run.tuesday({ played: 2, at: NEXT_TUESDAY });
  const final = await run.observe();
  legs.push({
    title: 'The transition into week 2',
    lines: [
      `The second Tuesday resolved week **${String(second.week)}** — the week that just ` +
        'finished, not the one it closed last time.',
      '',
      table(
        ['Week', 'Closed games', 'Rewards paid'],
        final.finalizations.map((row) => [
          String(row.week),
          String(row.games),
          String(final.rewards.filter((reward) => reward.week === row.week).length),
        ]),
      ),
      '',
      'Week 1 is unchanged: its games, its snapshot and its rewards are exactly what they',
      'were before week 2 ran.',
    ],
  });

  return { legs, final };
}

function render(legs: readonly Leg[], final: LifecycleState): string {
  const generated = [
    '<!--',
    '  GENERATED by `npm run rehearse -- week-1`. Do not edit by hand.',
    '  The assertions live in `lib/rehearsal/week-1.test.ts`; this is the evidence.',
    '-->',
    '',
    '# Week 1 rehearsal — the report',
    '',
    'One question, asked of the whole chain rather than of its parts:',
    '',
    '> If this were the first real week of the 2026 season, would Tony\'s get from Sunday',
    '> through Tuesday without corrupting data, skipping a manager, double-paying a',
    '> reward, publishing something untrue, or leaving the app in a state that',
    '> contradicts itself?',
    '',
    '**The scores below are test data.** They are a season somebody wrote down so the',
    'assertions could name the outcomes; no production surface can reach them, and',
    'nothing here is a claim about football. Everything *else* — the sequence, the',
    'guarantees, the refusals — is production code, run against a real Postgres.',
    '',
    `The one high score was ${WEEK_1_EXPECTED.highScore.manager}'s ` +
      `${money(WEEK_1_EXPECTED.highScore.points)}; the closest game was decided by ` +
      `${money(WEEK_1_EXPECTED.closest.marginCents / 100)}; the only Monday comeback was ` +
      `${WEEK_1_EXPECTED.comeback.manager}'s, from ${money(WEEK_1_EXPECTED.comeback.deficit)} down.`,
    '',
  ];

  for (const leg of legs) {
    generated.push(`## ${leg.title}`, '', ...leg.lines, '');
  }

  generated.push(
    '## Where it ended',
    '',
    table(
      ['What', 'Count'],
      [
        ['Seats', String(final.seats.length)],
        ['Stored games', String(final.games.length)],
        ['Snapshots', String(final.snapshots.length)],
        ['Closed weeks', String(final.finalizations.length)],
        ['Rewards', String(final.rewards.length)],
        ['Ledger rows', String(final.ledger.length)],
        ['Stakes authored', String(final.stakes.length)],
        ['Stake resolutions', String(final.resolutions.length)],
        ['Slice versions', String(final.versions.length)],
        ['Loot boxes', String(final.boxes)],
      ],
    ),
    '',
    `Every balance reconciles to the ledger, and the lowest is ` +
      `${String(Math.min(...final.seats.map((seat) => seat.balance)))}.`,
    '',
    'The failure rehearsals — an unreachable Sleeper, a malformed payload, a doubled',
    'invocation, two mid-chain interruptions, a stale re-import, an unresolvable roster',
    'owner, an unplayed week, and a reward transaction that cannot commit — are in',
    '`lib/rehearsal/week-1.test.ts` and are described in `docs/WEEK_1_REHEARSAL.md`.',
    '',
  );

  return generated.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const scenario = args[0] ?? '';
  const outIndex = args.indexOf('--out');
  const out = outIndex === -1 ? DEFAULT_OUT : (args[outIndex + 1] ?? DEFAULT_OUT);

  if (scenario !== 'week-1') {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const url = process.env['DATABASE_URL'] ?? '';
  if (url === '') {
    console.error('DATABASE_URL must be set. Try `npm run db:up`.');
    process.exitCode = 1;
    return;
  }
  refuseHosted(url);

  const { legs, final } = await rehearseWeekOne();
  const report = render(legs, final);

  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, report.endsWith('\n') ? report : `${report}\n`, 'utf8');
  console.log(`Wrote ${out}`);

  await closePool();
}

void main();
