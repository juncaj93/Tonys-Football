/**
 * Measure candidate designs for Tony's Line and Tony's Call. **Investigation only.**
 *
 *   npm run line-lab
 *
 * ## What this is, and what it is not
 *
 * It is a **measuring instrument for a product decision that has not been
 * made.** It computes what several candidate formulas *would have produced*
 * across seasons this league really played, plus the simulated 2026, and prints
 * the comparison for a commissioner to choose from.
 *
 * It is **not** product code. Nothing in `app/` or `lib/` imports it, it writes
 * nothing to any table, and it changes no behaviour: the shipped
 * `authorTonysLine` and `authorChalkboard` are untouched and still author
 * exactly what they authored before. If a candidate below is ever approved,
 * *that* is when `lib/stakes/` changes — and this file's job is finished.
 *
 * ## Where the numbers come from
 *
 * Three seasons, and the distinction matters when reading the output:
 *
 * | Season | What it is |
 * |---|---|
 * | 2024, 2025 | **Real.** The league's own finalized games, imported from Sleeper. The best available evidence for how a line would feel |
 * | 2026 | **Simulated.** The week-16 scenario played through the real crons by `lib/simulation/` |
 *
 * The 2026 regular season is generated from a fixed per-roster strength, so its
 * scores vary less than a real league's. Every conclusion below is therefore
 * drawn from **2024 and 2025**, and 2026 is used only for the worked examples
 * the commissioner asked to see.
 *
 * ## The one rule it obeys
 *
 * Every candidate uses **only stored, finalized fantasy facts** — team scores
 * from `fantasy_matchups` and nothing else. No projection, no ADP, no external
 * ranking, no player-level data, no AI. A candidate that needed any of those
 * would not be a candidate.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { closePool, getDb, type Database } from '@/lib/db';
import { resetDatabase } from '@/lib/db/reset';
import { runSimulation } from '@/lib/simulation/lab';
import { seasonWeeks } from '@/lib/stats/week';

const OUT = path.join('docs', 'evidence', 'line-and-call');

/** Real seasons first: the recommendation is drawn from these. */
const REAL = [2024, 2025] as const;
const SIMULATED = 2026;

/* -------------------------------------------------------------------------
 * The observations — one team-week, in cents
 * ---------------------------------------------------------------------- */

interface TeamWeek {
  readonly season: number;
  readonly week: number;
  readonly manager: string;
  readonly cents: number;
}

interface Game {
  readonly season: number;
  readonly week: number;
  readonly a: string;
  readonly b: string;
  readonly aCents: number;
  readonly bCents: number;
}

async function readSeason(
  db: Database,
  year: number,
): Promise<{ readonly teamWeeks: TeamWeek[]; readonly games: Game[] }> {
  const season = await seasonWeeks(db, year);
  const teamWeeks: TeamWeek[] = [];
  const games: Game[] = [];

  for (const row of season.rows) {
    /*
     * A disputed game is one where the official record and the weekly snapshot
     * disagree (`16 §12`). It is excluded for the same reason the record book
     * excludes it: a line calibrated on a number nobody can vouch for is a line
     * nobody can vouch for.
     */
    if (row.disputed) continue;

    const a = season.roster.get(row.rosterAId)?.displayName;
    const b = season.roster.get(row.rosterBId)?.displayName;
    if (a === undefined || b === undefined) continue;

    teamWeeks.push({ season: year, week: row.week, manager: a, cents: row.pointsACents });
    teamWeeks.push({ season: year, week: row.week, manager: b, cents: row.pointsBCents });
    games.push({
      season: year,
      week: row.week,
      a,
      b,
      aCents: row.pointsACents,
      bCents: row.pointsBCents,
    });
  }

  return { teamWeeks, games };
}

/* -------------------------------------------------------------------------
 * The candidate lines
 * ---------------------------------------------------------------------- */

const pts = (cents: number): number => cents / 100;
const fmt = (cents: number): string => pts(cents).toFixed(2);

function median(ascending: readonly number[]): number | null {
  if (ascending.length === 0) return null;
  const mid = Math.floor((ascending.length - 1) / 2);
  return ascending.length % 2 === 1
    ? (ascending[mid] ?? null)
    : Math.round(((ascending[mid] ?? 0) + (ascending[mid + 1] ?? 0)) / 2);
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

/**
 * The half-point hook, in cents.
 *
 * A line on a whole point can be landed on exactly, and a push is a wager with
 * no answer. Every candidate ends on `.x5` so the settlement is always strictly
 * over or strictly under — the same reason a real board hangs numbers on a half.
 */
function hook(cents: number): number {
  return Math.floor(cents / 100) * 100 + 50;
}

interface Candidate {
  readonly key: string;
  readonly title: string;
  /** One line a commissioner can hold in their head. */
  readonly rule: string;
  /** Weeks of that manager's own history required before a line is offered. */
  readonly minWeeks: number;
  /**
   * `own` is that manager's prior team-weeks, ascending. `league` is every
   * manager's prior team-weeks in the same season. Both exclude the week being
   * priced, always.
   */
  readonly line: (own: readonly number[], league: readonly number[]) => number | null;
}

const CANDIDATES: readonly Candidate[] = [
  {
    key: 'A-own-median',
    title: 'A · Your own median',
    rule: "The middle score of everything that manager has posted this season, on the half.",
    minWeeks: 4,
    line: (own) => {
      const value = median([...own].sort((x, y) => x - y));
      return value === null ? null : hook(value);
    },
  },
  {
    key: 'B-recent-blend',
    title: 'B · Season mean blended with the last three',
    rule: 'Three-fifths of the season average, two-fifths of the last three weeks.',
    minWeeks: 4,
    line: (own) => {
      const season = mean(own);
      const recent = mean(own.slice(-3));
      if (season === null || recent === null) return null;
      return hook(Math.round(0.6 * season + 0.4 * recent));
    },
  },
  {
    key: 'C-shrunk-median',
    title: 'C · Your own median, pulled toward the league early on',
    rule:
      'That manager’s median, blended with the league’s median at a weight that ' +
      'fades as their own sample grows (n / (n + 4)).',
    minWeeks: 3,
    line: (own, league) => {
      const mine = median([...own].sort((x, y) => x - y));
      const theirs = median([...league].sort((x, y) => x - y));
      if (mine === null || theirs === null) return null;
      const weight = own.length / (own.length + 4);
      return hook(Math.round(weight * mine + (1 - weight) * theirs));
    },
  },
];

/* -------------------------------------------------------------------------
 * Scoring the candidates
 * ---------------------------------------------------------------------- */

interface Priced {
  readonly season: number;
  readonly week: number;
  readonly manager: string;
  readonly lineCents: number;
  readonly actualCents: number;
  readonly over: boolean;
}

function priceSeason(candidate: Candidate, teamWeeks: readonly TeamWeek[]): Priced[] {
  const weeks = [...new Set(teamWeeks.map((row) => row.week))].sort((a, b) => a - b);
  const out: Priced[] = [];

  for (const week of weeks) {
    const priorAll = teamWeeks.filter((row) => row.week < week);
    if (priorAll.length === 0) continue;

    for (const row of teamWeeks.filter((entry) => entry.week === week)) {
      const own = priorAll
        .filter((entry) => entry.manager === row.manager)
        .map((entry) => entry.cents);
      if (own.length < candidate.minWeeks) continue;

      const line = candidate.line(
        own,
        priorAll.map((entry) => entry.cents),
      );
      if (line === null) continue;

      out.push({
        season: row.season,
        week,
        manager: row.manager,
        lineCents: line,
        actualCents: row.cents,
        over: row.cents > line,
      });
    }
  }

  return out;
}

interface Verdict {
  readonly candidate: Candidate;
  readonly priced: number;
  readonly overPct: number;
  readonly within5: number;
  readonly within10: number;
  readonly within15: number;
  /** Mean absolute week-to-week movement of one manager's line, in points. */
  readonly movement: number;
  /** Mean gap between the highest and lowest line in a week, in points. */
  readonly spread: number;
  /** First week a line could be offered. */
  readonly firstWeek: number;
  /**
   * The worst manager-level over-rate imbalance.
   *
   * The question the commissioner asked as *"do strong or weak managers get
   * systematically favourable lines"*. A personalized line should sit near half
   * for **everybody**; a formula that runs at 20% overs for one manager all
   * season is quietly telling that manager which side to take.
   */
  readonly worstManager: { readonly manager: string; readonly overPct: number; readonly n: number };
}

function judge(candidate: Candidate, priced: readonly Priced[]): Verdict {
  const n = priced.length;
  const near = (limit: number): number =>
    (priced.filter((row) => Math.abs(row.actualCents - row.lineCents) <= limit * 100).length / n) *
    100;

  const byManager = new Map<string, Priced[]>();
  for (const row of priced) {
    byManager.set(row.manager, [...(byManager.get(row.manager) ?? []), row]);
  }

  let movementTotal = 0;
  let movementCount = 0;
  for (const rows of byManager.values()) {
    const ordered = [...rows].sort((a, b) => a.season - b.season || a.week - b.week);
    for (let index = 1; index < ordered.length; index++) {
      if (ordered[index]!.season !== ordered[index - 1]!.season) continue;
      movementTotal += Math.abs(ordered[index]!.lineCents - ordered[index - 1]!.lineCents);
      movementCount++;
    }
  }

  const byWeek = new Map<string, number[]>();
  for (const row of priced) {
    const key = `${String(row.season)}-${String(row.week)}`;
    byWeek.set(key, [...(byWeek.get(key) ?? []), row.lineCents]);
  }
  const spreads = [...byWeek.values()]
    .filter((lines) => lines.length > 1)
    .map((lines) => Math.max(...lines) - Math.min(...lines));

  let worst = { manager: '—', overPct: 50, n: 0 };
  for (const [manager, rows] of byManager) {
    if (rows.length < 8) continue;
    const overPct = (rows.filter((row) => row.over).length / rows.length) * 100;
    if (Math.abs(overPct - 50) > Math.abs(worst.overPct - 50)) {
      worst = { manager, overPct, n: rows.length };
    }
  }

  return {
    candidate,
    priced: n,
    overPct: (priced.filter((row) => row.over).length / n) * 100,
    within5: near(5),
    within10: near(10),
    within15: near(15),
    movement: movementCount === 0 ? 0 : pts(movementTotal / movementCount),
    spread: spreads.length === 0 ? 0 : pts(mean(spreads) ?? 0),
    firstWeek: Math.min(...priced.map((row) => row.week)),
    worstManager: worst,
  };
}

/* -------------------------------------------------------------------------
 * The league props
 * ---------------------------------------------------------------------- */

interface Prop {
  readonly key: string;
  readonly title: string;
  /** What a manager reads on the board. `{n}` is the threshold. */
  readonly asks: string;
  /** The exact deterministic rule, in one sentence. */
  readonly rule: string;
  /**
   * The knob, swept to find the setting that makes the question uncertain.
   *
   * A percentile for the score-shaped props, a flat number of points for the
   * margin-shaped ones. Sweeping it against real seasons is how *"can history
   * calibrate the threshold"* gets an answer rather than an opinion.
   */
  readonly params: readonly number[];
  /** Threshold from prior finalized team-weeks and prior weekly totals. */
  readonly threshold: (
    priorTeamWeeks: readonly number[],
    param: number,
    priorWeeklyTotals: readonly number[],
  ) => number | null;
  /** Did it happen, given the week's games? */
  readonly settle: (weekGames: readonly Game[], threshold: number | null) => boolean;
  /** True when the week's own games are enough — no prior history needed. */
  readonly worksWeekOne: boolean;
}

/** The value at a percentile of an ascending sample, in cents. */
function percentile(ascending: readonly number[], fraction: number): number | null {
  if (ascending.length === 0) return null;
  const index = Math.min(ascending.length - 1, Math.max(0, Math.round(fraction * (ascending.length - 1))));
  return ascending[index] ?? null;
}

const scoresOf = (games: readonly Game[]): number[] => games.flatMap((g) => [g.aCents, g.bCents]);

const PROPS: readonly Prop[] = [
  {
    key: 'anybody-breaks',
    title: 'Anybody break the number?',
    asks: 'Does anybody put up {n} this week?',
    rule: 'True when at least one team score in the week is strictly above the number.',
    /* The number is a percentile of every team-week played so far. */
    params: [0.9, 0.94, 0.96, 0.97, 0.98, 0.985, 0.99],
    threshold: (prior, param) => percentile([...prior].sort((a, b) => a - b), param),
    settle: (games, threshold) =>
      threshold !== null && scoresOf(games).some((cents) => cents > threshold),
    worksWeekOne: false,
  },
  {
    key: 'photo-finish',
    title: 'A game inside the number',
    asks: 'Does any game finish inside {n} points?',
    rule: 'True when at least one game in the week has a margin at or below the number.',
    /* Points, flat. No history needed, so it can run in week one. */
    params: [3, 4, 5, 6, 7, 8],
    threshold: (_prior, param) => Math.round(param * 100),
    settle: (games, threshold) =>
      threshold !== null && games.some((g) => Math.abs(g.aCents - g.bCents) <= threshold),
    worksWeekOne: true,
  },
  {
    key: 'four-over',
    title: 'Four teams over the number',
    asks: 'Do four teams clear {n}?',
    rule: 'True when at least four team scores in the week are strictly above the number.',
    params: [0.5, 0.55, 0.6, 0.65, 0.7, 0.75],
    threshold: (prior, param) => percentile([...prior].sort((a, b) => a - b), param),
    settle: (games, threshold) =>
      threshold !== null && scoresOf(games).filter((cents) => cents > threshold).length >= 4,
    worksWeekOne: false,
  },
  {
    key: 'league-total',
    title: 'The league total',
    asks: 'Does the whole league combine for more than {n}?',
    rule: 'True when the sum of every team score in the week is strictly above the number.',
    /*
     * Calibrated against the distribution of prior **weekly totals**, not of
     * individual scores. A percentile of one is not a percentile of the other,
     * and the first version of this used the wrong one.
     */
    params: [0.35, 0.4, 0.45, 0.5, 0.55, 0.6],
    threshold: (prior, param, weeklyTotals) =>
      percentile([...weeklyTotals].sort((a, b) => a - b), param),
    settle: (games, threshold) =>
      threshold !== null && scoresOf(games).reduce((sum, cents) => sum + cents, 0) > threshold,
    worksWeekOne: false,
  },
  {
    key: 'everybody-clears',
    title: 'Everybody clears the floor',
    asks: 'Does everybody stay above {n}?',
    rule: 'True when the lowest team score in the week is strictly above the number.',
    params: [0.02, 0.04, 0.06, 0.08, 0.1, 0.12],
    threshold: (prior, param) => percentile([...prior].sort((a, b) => a - b), param),
    settle: (games, threshold) =>
      threshold !== null && Math.min(...scoresOf(games)) > threshold,
    worksWeekOne: false,
  },
  {
    key: 'a-hiding',
    title: 'Somebody takes a hiding',
    asks: 'Does anybody win by more than {n}?',
    rule: 'True when at least one game in the week has a margin strictly above the number.',
    /* Points, flat — margins are not team-weeks and must not borrow their scale. */
    params: [35, 40, 45, 50, 55, 60],
    threshold: (_prior, param) => Math.round(param * 100),
    settle: (games, threshold) =>
      threshold !== null && games.some((g) => Math.abs(g.aCents - g.bCents) > threshold),
    worksWeekOne: true,
  },
];

interface PropWeek {
  readonly season: number;
  readonly week: number;
  readonly thresholdCents: number | null;
  readonly happened: boolean;
}

function weeklyTotalsBefore(teamWeeks: readonly TeamWeek[], week: number): number[] {
  const byWeek = new Map<number, number>();
  for (const row of teamWeeks) {
    if (row.week >= week) continue;
    byWeek.set(row.week, (byWeek.get(row.week) ?? 0) + row.cents);
  }
  return [...byWeek.values()];
}

function runProp(
  prop: Prop,
  teamWeeks: readonly TeamWeek[],
  games: readonly Game[],
  param: number,
): PropWeek[] {
  const weeks = [...new Set(games.map((g) => g.week))].sort((a, b) => a - b);
  const out: PropWeek[] = [];

  for (const week of weeks) {
    const prior = teamWeeks.filter((row) => row.week < week).map((row) => row.cents);
    if (!prop.worksWeekOne && prior.length < 20) continue;

    const threshold = prop.threshold(prior, param, weeklyTotalsBefore(teamWeeks, week));
    if (threshold === null) continue;

    const weekGames = games.filter((g) => g.week === week);
    if (weekGames.length === 0) continue;

    out.push({
      season: weekGames[0]?.season ?? 0,
      week,
      thresholdCents: threshold,
      happened: prop.settle(weekGames, threshold),
    });
  }

  return out;
}

/* -------------------------------------------------------------------------
 * Report
 * ---------------------------------------------------------------------- */

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [
    `| ${header.join(' | ')} |`,
    `|${header.map(() => '---').join('|')}|`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'] ?? '';
  if (url === '') throw new Error('DATABASE_URL must be set.');
  if (/neon\.tech|vercel|supabase|amazonaws|\.cloud/.test(url)) {
    throw new Error(`REFUSED: DATABASE_URL looks hosted (${url}).`);
  }

  const db = getDb();
  await resetDatabase(db);

  // The simulated 2026, played through the real crons. Also seeds 2024/2025.
  await runSimulation(db, 'week-16', { retrospective: false });

  const seasons = new Map<number, { teamWeeks: TeamWeek[]; games: Game[] }>();
  for (const year of [...REAL, SIMULATED]) {
    seasons.set(year, await readSeason(db, year));
  }

  const realTeamWeeks = REAL.flatMap((year) => seasons.get(year)?.teamWeeks ?? []);
  const realPriced = new Map<string, Priced[]>();

  for (const candidate of CANDIDATES) {
    const priced = REAL.flatMap((year) =>
      priceSeason(candidate, seasons.get(year)?.teamWeeks ?? []),
    );
    realPriced.set(candidate.key, priced);
  }

  const out: string[] = [
    '<!--',
    '  GENERATED by `npm run line-lab`. Do not edit by hand.',
    '  INVESTIGATION ONLY — no product behaviour depends on this file.',
    '-->',
    '',
    '# Tony’s Line and Tony’s Call — what the candidates would have done',
    '',
    'Measured over the league’s **real** 2024 and 2025 seasons, and the simulated',
    '2026 played through the real crons. Every candidate uses only stored finalized',
    'team scores: no projection, no ADP, no external ranking, no player data, no AI.',
    '',
    `Real team-weeks available: **${String(realTeamWeeks.length)}** across ${String(REAL.length)} seasons.`,
    '',
    '---',
    '',
    '## 1. The three line candidates, over 2024 and 2025',
    '',
    table(
      ['Candidate', 'Priced', 'Over %', 'Within 5', 'Within 10', 'Within 15', 'Week-to-week move', 'Spread', 'From week', 'Worst manager'],
      CANDIDATES.map((candidate) => {
        const verdict = judge(candidate, realPriced.get(candidate.key) ?? []);
        return [
          candidate.title,
          String(verdict.priced),
          `${verdict.overPct.toFixed(1)}%`,
          `${verdict.within5.toFixed(0)}%`,
          `${verdict.within10.toFixed(0)}%`,
          `${verdict.within15.toFixed(0)}%`,
          `${verdict.movement.toFixed(1)}`,
          `${verdict.spread.toFixed(1)}`,
          String(verdict.firstWeek),
          `${verdict.worstManager.manager} ${verdict.worstManager.overPct.toFixed(0)}% (n=${String(verdict.worstManager.n)})`,
        ];
      }),
    ),
    '',
    '**How to read it.** *Over %* near 50 means neither side is the obvious bet.',
    '*Within 5/10/15* is how often the line landed close to the real score — higher is',
    'a line that felt like it was about that manager. *Week-to-week move* is how far one',
    'manager’s line travels between weeks; low is stable. *Spread* is the gap between the',
    'league’s highest and lowest line in a week — this is the personalisation, and a',
    'number near zero would mean everybody got the same line. *Worst manager* is the most',
    'lopsided single manager, which is the check on nobody being quietly handed a side.',
    '',
  ];

  /* --- per-candidate detail: early weeks ---------------------------------- */

  out.push('### Early-season behaviour', '');
  for (const candidate of CANDIDATES) {
    const priced = realPriced.get(candidate.key) ?? [];
    const early = priced.filter((row) => row.week <= 6);
    const late = priced.filter((row) => row.week > 6);
    const rate = (rows: readonly Priced[]): string =>
      rows.length === 0 ? '—' : `${((rows.filter((r) => r.over).length / rows.length) * 100).toFixed(0)}%`;
    const near = (rows: readonly Priced[]): string =>
      rows.length === 0
        ? '—'
        : `${((rows.filter((r) => Math.abs(r.actualCents - r.lineCents) <= 1000).length / rows.length) * 100).toFixed(0)}%`;

    out.push(
      `- **${candidate.title}** — weeks ≤6: ${rate(early)} over, ${near(early)} within 10 ` +
        `(n=${String(early.length)}); weeks >6: ${rate(late)} over, ${near(late)} within 10 ` +
        `(n=${String(late.length)}).`,
    );
  }
  out.push('');

  /* --- worked examples ---------------------------------------------------- */

  /*
   * The worked examples come from **2025, a season this league really played**.
   *
   * The simulated 2026 was the obvious place to put them and it turned out to be
   * the wrong one, which is worth recording rather than quietly working around:
   * `WEEK_16_SCRIPT` generates its regular season from a fixed per-roster
   * strength plus a small deterministic wobble, so every manager's scores move
   * **together**. Priced against it, week 4 is ten Overs, week 8 is nine Unders
   * and week 16 is ten Overs — not because any candidate is good or bad, but
   * because the fixture has no independent week-to-week variance to price. It
   * was built to produce a clean bracket, and it does that well.
   *
   * A real season is the honest test, and 2025 also has the property the
   * commissioner asked for: an early eligible week, a week 8, and a playoff-period
   * week whose underlying fact is legitimate.
   */
  const exampleSeason = 2025;
  const example = seasons.get(exampleSeason);
  const exampleWeeks = [6, 8, 15];

  out.push(
    '---',
    '',
    `## 2. What each candidate would have printed — real ${String(exampleSeason)}`,
    '',
    'Real managers, real scores, real weeks. The line uses only weeks **before** the',
    'one being priced, every time.',
    '',
  );

  for (const week of exampleWeeks) {
    const rowsFor = new Map<string, Map<string, Priced>>();
    for (const candidate of CANDIDATES) {
      const priced = priceSeason(candidate, example?.teamWeeks ?? []).filter((r) => r.week === week);
      rowsFor.set(candidate.key, new Map(priced.map((r) => [r.manager, r])));
    }

    const managers = [
      ...new Set((example?.teamWeeks ?? []).filter((r) => r.week === week).map((r) => r.manager)),
    ].sort();

    out.push(`### Week ${String(week)}`, '');

    if (managers.length === 0) {
      out.push('_No games stored for this week._', '');
      continue;
    }

    out.push(
      table(
        ['Manager', 'Actual', ...CANDIDATES.map((c) => c.key.split('-')[0] ?? c.key)],
        managers.map((manager) => {
          const actual = (example?.teamWeeks ?? []).find(
            (r) => r.week === week && r.manager === manager,
          );
          return [
            manager,
            actual === undefined ? '—' : fmt(actual.cents),
            ...CANDIDATES.map((candidate) => {
              const row = rowsFor.get(candidate.key)?.get(manager);
              return row === undefined
                ? '—'
                : `${fmt(row.lineCents)} ${row.over ? '**OVER**' : 'under'}`;
            }),
          ];
        }),
      ),
      '',
    );
  }

  /* The synthetic season, kept as the record of why it is not the evidence. */
  const sim = seasons.get(SIMULATED);
  const simWeek8 = CANDIDATES.map((candidate) => {
    const priced = priceSeason(candidate, sim?.teamWeeks ?? []).filter((r) => r.week === 8);
    const overs = priced.filter((r) => r.over).length;
    return `${candidate.key}: ${String(overs)}/${String(priced.length)} over`;
  });

  out.push(
    '### Why the simulated 2026 is not the evidence here',
    '',
    '`WEEK_16_SCRIPT` builds its regular season from a fixed per-roster strength and',
    'a small deterministic wobble, so every manager moves together and a line priced',
    'against it is nearly always on the same side for everybody. Week 8 of the',
    `simulated season: ${simWeek8.join(' · ')}. That is a property of a fixture built`,
    'to produce a clean bracket, not a finding about any candidate — and it is why',
    'every number in this report comes from 2024 and 2025.',
    '',
  );

  /* --- props -------------------------------------------------------------- */

  out.push(
    '---',
    '',
    '## 3. The league props — calibrated against 2024 and 2025',
    '',
    'Each family has one knob. It is **swept** across real seasons and the setting',
    'whose YES rate lands nearest half is reported, which is what *"can history',
    'calibrate the threshold"* means in practice. A family whose best setting is',
    'still far from half is a family that cannot be made uncertain, and is rejected.',
    '',
  );

  interface Calibrated {
    readonly prop: Prop;
    readonly param: number;
    readonly yesPct: number;
    readonly weeks: number;
    readonly runs: readonly PropWeek[];
  }

  const calibrated: Calibrated[] = [];

  for (const prop of PROPS) {
    let best: Calibrated | null = null;

    for (const param of prop.params) {
      const runs = REAL.flatMap((year) => {
        const season = seasons.get(year);
        return season === undefined ? [] : runProp(prop, season.teamWeeks, season.games, param);
      });
      if (runs.length === 0) continue;

      const yesPct = (runs.filter((r) => r.happened).length / runs.length) * 100;
      if (best === null || Math.abs(yesPct - 50) < Math.abs(best.yesPct - 50)) {
        best = { prop, param, yesPct, weeks: runs.length, runs };
      }
    }

    if (best !== null) calibrated.push(best);
  }

  out.push(
    table(
      ['Proposition', 'Best setting', 'YES rate', 'Weeks', 'Runs in week 1?'],
      calibrated.map((entry) => [
        `**${entry.prop.title}** — ${entry.prop.asks}`,
        entry.prop.key === 'photo-finish' || entry.prop.key === 'a-hiding'
          ? `${String(entry.param)} points`
          : `${(entry.param * 100).toFixed(1)}th percentile`,
        `${entry.yesPct.toFixed(0)}%`,
        String(entry.weeks),
        entry.prop.worksWeekOne ? 'yes' : 'no',
      ]),
    ),
    '',
    '### Every setting, so the sweep is visible rather than asserted',
    '',
  );

  for (const prop of PROPS) {
    const cells = prop.params.map((param) => {
      const runs = REAL.flatMap((year) => {
        const season = seasons.get(year);
        return season === undefined ? [] : runProp(prop, season.teamWeeks, season.games, param);
      });
      const yes = runs.length === 0 ? 0 : (runs.filter((r) => r.happened).length / runs.length) * 100;
      return `${String(param)} → ${yes.toFixed(0)}%`;
    });
    out.push(`- **${prop.title}**: ${cells.join(' · ')}`);
  }
  out.push('');

  out.push(
    '### Week by week, at the calibrated setting',
    '',
    'What the board would have said, and what happened. The number moves because it',
    'is recomputed from everything played up to that week.',
    '',
  );

  for (const year of REAL) {
    const season = seasons.get(year);
    if (season === undefined) continue;
    const weeks = [...new Set(season.games.map((g) => g.week))].sort((a, b) => a - b);

    out.push(`**${String(year)}**`, '');
    out.push(
      table(
        ['Week', ...calibrated.map((c) => c.prop.key)],
        weeks.map((week) => [
          String(week),
          ...calibrated.map((entry) => {
            const run = entry.runs.find((r) => r.season === year && r.week === week);
            if (run === undefined) return '—';
            const number = run.thresholdCents === null ? '' : fmt(run.thresholdCents);
            return `${number} ${run.happened ? '**YES**' : 'no'}`;
          }),
        ]),
      ),
      '',
    );
  }

  /* --- Tony's side ------------------------------------------------------- */

  out.push(
    '---',
    '',
    "## 4. Tony's side — two deterministic rules, and what his record would be",
    '',
    'A proposition with no call from Tony is a poll. A call needs a rule, the rule',
    'has to be deterministic, and the resulting record has to be **honest** — a rule',
    'that wins 80% of the time means the threshold is wrong, and one that wins 20%',
    'means Tony is a running joke rather than a landlord.',
    '',
    '| Rule | What Tony does | Record |',
    '|---|---|---|',
  );

  for (const entry of calibrated) {
    const ordered = [...entry.runs].sort((a, b) => a.season - b.season || a.week - b.week);

    /* Rule 1: Tony always says yes. */
    const alwaysYes = ordered.filter((r) => r.happened).length;

    /*
     * Rule 2: Tony calls the correction — he takes whichever answer has come up
     * **less often in the last four resolved weeks** of the same season, and says
     * yes when they are level. Deterministic, reads as a reason rather than a
     * coin, and gives him a record worth printing.
     */
    let correction = 0;
    let corrected = 0;
    for (let index = 0; index < ordered.length; index++) {
      const row = ordered[index]!;
      const recent = ordered
        .slice(0, index)
        .filter((r) => r.season === row.season)
        .slice(-4);
      if (recent.length < 4) continue;
      const yes = recent.filter((r) => r.happened).length;
      const says = yes <= recent.length - yes;
      corrected++;
      if (says === row.happened) correction++;
    }

    out.push(
      `| **${entry.prop.title}** | always yes | ${((alwaysYes / ordered.length) * 100).toFixed(0)}% ` +
        `(${String(alwaysYes)}/${String(ordered.length)}) |`,
      `| | calls the correction | ${corrected === 0 ? '—' : `${((correction / corrected) * 100).toFixed(0)}% (${String(correction)}/${String(corrected)})`} |`,
    );
  }
  out.push('');

  mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, 'report.md');
  writeFileSync(file, `${out.join('\n')}\n`, 'utf8');
  console.log(`Wrote ${file}`);

  await closePool();
}

void main();
