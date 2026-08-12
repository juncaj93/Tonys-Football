import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readManagerNames, seedManagerNames } from '@/lib/content/managers';
import { closePool, getDb } from '@/lib/db';
import { resetDatabase } from '@/lib/db/test-helpers';
import { assertDemoAllowed, DemoRefused } from '@/lib/demo/guard';
import { traverseChain } from '@/lib/sleeper/chain';
import { createFixtureSource } from '@/lib/sleeper/fixtures';
import { persistChain } from '@/lib/sleeper/persist';

import {
  BOARD_DESCRIPTIONS,
  BOARD_STATES,
  allBoards,
  previewBoard,
  resolveBoard,
  type BoardPreview,
  type BoardStateKey,
} from './boards';

/**
 * Every named board state, resolved against the real league.
 *
 * ## What this file is for, and what it deliberately is not for
 *
 * It pins the **character** of each state — that `chalkboard-missed` really
 * resolves `missed`, that `line-won` really pays, that `bounty-expired` really
 * expires — so a calibration change that quietly turns a state into its opposite
 * fails the build rather than the review. The Slice's editions needed exactly
 * this check and it found two states pointing at weeks that no longer produced
 * what their names claimed.
 *
 * It does **not** pin prose. A copy edit must not break a test; a change in what
 * the pipeline decides must.
 *
 * ## Two states caught by writing it
 *
 * The first draft had `chalkboard-missed` on a week where the record **stood** —
 * the state resolved `hit` under a name saying the opposite — and `line-won` and
 * `line-lost` were swapped, because the first team in stored order came in under
 * a line the state assumed it had cleared. Both were found by reading what the
 * pipeline actually produced for every week of both finalized seasons rather
 * than by choosing a week that sounded right.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so board fixtures resolve against real data.');
}

const db = hasDatabase ? getDb() : null;

/**
 * The recorded league, imported once for the whole file.
 *
 * `beforeAll` rather than `beforeEach`: nothing here writes, so there is no state
 * to reset between tests, and importing two seasons of matchups per test would
 * cost more than the rest of the suite. The board fixtures are a **rendering**
 * demo — that is the property the design turns on, and it is asserted directly
 * further down.
 *
 * Imported rather than assumed present, because `npm run test` truncates the
 * league tables and this file may run after any of the twenty that do.
 */
const LEAGUE_2026 = '1385016656425668608';

async function importLeague(): Promise<void> {
  await resetDatabase(db!);
  const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, { includeWeeks: true });
  await persistChain(db!, chain, { sourceLabel: 'test', finalizeYears: [2024, 2025] });
  await seedManagerNames(db!, readManagerNames());
}

/** Everything on a board, whichever surface it belongs to. */
function items(preview: BoardPreview) {
  return [preview.board.prediction, preview.board.market, preview.bounty].filter(
    (item) => item !== null,
  );
}

describe('the board catalog', () => {
  it('describes every state it declares', () => {
    for (const key of BOARD_STATES) {
      expect(BOARD_DESCRIPTIONS[key], key).toBeTruthy();
    }
    expect(Object.keys(BOARD_DESCRIPTIONS).sort()).toEqual([...BOARD_STATES].sort());
  });

  it('names every state exactly once', () => {
    expect(new Set(BOARD_STATES).size).toBe(BOARD_STATES.length);
  });
});

describe.skipIf(!hasDatabase)('every board state resolves', () => {
  beforeAll(importLeague);

  it('builds all of them without throwing', async () => {
    /*
     * A key declared and not implemented **throws** rather than rendering the
     * quiet slate, because the quiet slate photographs cleanly and passes. That
     * false green has happened three times in this repository — nine reveal
     * states, a slice edition, and a visual-QA state with no case — so the fourth
     * is a build failure.
     */
    const built = await allBoards(db!);
    expect(built).toHaveLength(BOARD_STATES.length);
  });

  it('shows something on every state but the two that are meant to be empty', async () => {
    for (const key of BOARD_STATES) {
      const preview = await resolveBoard(db!, key);
      const shown = items(preview).length;
      const quiet = key === 'quiet' || key === 'thin-basis';
      expect(shown > 0, `${key} shows ${String(shown)}`).toBe(!quiet);
    }
  });

  it('renders every claim, verdict and evidence line the validator will pass', async () => {
    // `renderStake` returns null when the Slice's validator refuses, and a null
    // becomes a missing item rather than a visible error — so "it rendered" is
    // itself the assertion that the prose passed the gate.
    for (const key of BOARD_STATES) {
      for (const item of items(await resolveBoard(db!, key))) {
        expect(item!.copy.line, key).toBeTruthy();
        if (item!.presentation === 'resolved' || item!.presentation === 'expired') {
          expect(item!.copy.verdict, `${key} verdict`).toBeTruthy();
          expect(item!.copy.evidence, `${key} evidence`).toBeTruthy();
        }
      }
    }
  });
});

describe.skipIf(!hasDatabase)('each state is what its name says', () => {
  beforeAll(importLeague);

  const expected: Readonly<
    Partial<Record<BoardStateKey, { where: 'prediction' | 'market' | 'bounty'; is: string }>>
  > = {
    'chalkboard-open': { where: 'prediction', is: 'awaiting-week' },
    'chalkboard-hit': { where: 'prediction', is: 'resolved' },
    'chalkboard-missed': { where: 'prediction', is: 'resolved' },
    'chalkboard-cold': { where: 'prediction', is: 'resolved' },
    'chalkboard-count': { where: 'prediction', is: 'resolved' },
    'line-pending': { where: 'market', is: 'awaiting-week' },
    'line-incomplete': { where: 'market', is: 'awaiting-final' },
    'line-won': { where: 'market', is: 'resolved' },
    'line-lost': { where: 'market', is: 'resolved' },
    'line-push': { where: 'market', is: 'resolved' },
    'bounty-open': { where: 'bounty', is: 'awaiting-week' },
    'bounty-missed': { where: 'bounty', is: 'rolling' },
    'bounty-claimed': { where: 'bounty', is: 'resolved' },
    'bounty-expired': { where: 'bounty', is: 'expired' },
  };

  it('presents the way the state name claims', async () => {
    for (const [key, want] of Object.entries(expected)) {
      const preview = await resolveBoard(db!, key as BoardStateKey);
      const item =
        want.where === 'bounty'
          ? preview.bounty
          : want.where === 'market'
            ? preview.board.market
            : preview.board.prediction;
      expect(item, `${key} has no ${want.where}`).not.toBeNull();
      expect(item!.presentation, key).toBe(want.is);
    }
  });

  it('shows the two chalkboard verdicts as opposites', async () => {
    const hit = (await resolveBoard(db!, 'chalkboard-hit')).board.prediction;
    const missed = (await resolveBoard(db!, 'chalkboard-missed')).board.prediction;
    expect(hit!.copy.verdict).not.toBe(missed!.copy.verdict);
  });

  it('shows a won pick and a lost pick on the same line and the same manager', async () => {
    /*
     * `line-won` and `line-lost` differ in exactly one field — the side taken —
     * so a reviewer comparing the two screenshots is comparing the thing that
     * differs. The first draft had them the wrong way round.
     */
    const won = (await resolveBoard(db!, 'line-won')).board.market;
    const lost = (await resolveBoard(db!, 'line-lost')).board.market;

    expect(won!.copy.line).toBe(lost!.copy.line);
    expect(won!.entry?.side).not.toBe(lost!.entry?.side);
    expect(won!.entry?.verdict).toBe('You had it. Paid.');
    expect(lost!.entry?.verdict).toBe('You did not have it.');
  });

  it('hands a stake back when the manager never had a week', async () => {
    /*
     * The only push a personal line can produce. An exact landing is impossible
     * — every line is hung on the half point — so the reachable push is a manager
     * charged for a market they were never given a chance to win.
     */
    const push = (await resolveBoard(db!, 'line-push')).board.market;
    expect(push!.entry?.verdict).toBe('Nothing to settle. Your stake came back.');
  });

  it('shows the same stake open and settled, so the pair is a real comparison', async () => {
    /*
     * `chalkboard-open` and `chalkboard-missed` are 2025 week 9 before and after
     * it was played. A reviewer comparing the two screenshots is comparing
     * exactly the thing that changed, which is what a state pair is for — the
     * line's `won`/`lost` pair was built on the same argument.
     */
    const open = (await resolveBoard(db!, 'chalkboard-open')).board.prediction;
    const settled = (await resolveBoard(db!, 'chalkboard-missed')).board.prediction;
    expect(open!.stakeKey).toBe(settled!.stakeKey);
    expect(open!.copy.verdict).toBeNull();
    expect(settled!.copy.verdict).toBeTruthy();
  });

  it('has a question in week one that needs no history behind it', async () => {
    /*
     * Ruling 7's two history-free families, photographed. Week one can price
     * neither percentile, so the rotation walks past both and still puts
     * something on the board.
     */
    const cold = (await resolveBoard(db!, 'chalkboard-cold')).board.prediction;
    expect(cold).not.toBeNull();
    expect(cold!.week).toBe(1);
    expect(cold!.stakeKey).toContain('photo-finish');
  });

  it('derives how many teams the counting question asks for', async () => {
    // Four, because this league fields eight publishable teams a week. Nothing
    // in the copy or the fixture says four; it comes out of the basis.
    const count = (await resolveBoard(db!, 'chalkboard-count')).board.prediction;
    expect(count!.copy.line).toMatch(/^4 teams over /);
  });

  it('never puts a wager control on the chalkboard', async () => {
    /*
     * Ruling 6: the Chalkboard is watch-only. `canPick` is what renders
     * `PickSide`, and a chalkboard row must never carry one — on any state.
     */
    for (const key of BOARD_STATES) {
      const prediction = (await resolveBoard(db!, key)).board.prediction;
      if (prediction === null) continue;
      expect(prediction.canPick, key).toBe(false);
      expect(prediction.stakeTokens, key).toBeNull();
      expect(prediction.entry, key).toBeNull();
    }
  });

  it('offers both sides only while the week is unplayed', async () => {
    expect((await resolveBoard(db!, 'line-pending')).board.market?.canPick).toBe(true);
    // A manager cannot take a side on a week they have already watched.
    expect((await resolveBoard(db!, 'line-won')).board.market?.canPick).toBe(false);
    expect((await resolveBoard(db!, 'line-incomplete')).board.market?.canPick).toBe(false);
  });
});

describe.skipIf(!hasDatabase)('the publication boundary, visibly', () => {
  beforeAll(importLeague);

  it('targets a number the league can actually see', async () => {
    /*
     * The state exists because the boundary does something a manager could
     * notice. 2025 week 4 contains a **182.52** — the biggest number in that
     * season — and the bounty authored for week 5 targets **172.28** instead,
     * because the 182.52 was posted in a game against somebody who is not in this
     * league and `publishableWeek` drops the whole game before any maximum is
     * taken.
     *
     * A bounty naming the 182.52 would be asking the league to beat a number that
     * is on no board they can see.
     */
    const bounty = (await resolveBoard(db!, 'retired-excluded')).bounty;
    expect(bounty).not.toBeNull();
    expect(bounty!.copy.line).toContain('172.28');
    expect(bounty!.copy.line).not.toContain('182.52');
  });
});

describe.skipIf(!hasDatabase)('the demo guard', () => {
  beforeAll(importLeague);

  afterAll(async () => {
    if (hasDatabase) await closePool();
  });

  it('refuses in production, and returns null rather than leaking that it exists', async () => {
    expect(await previewBoard(db!, 'line-won', { VERCEL_ENV: 'production', DEMO_FIXTURES: '1' })).toBeNull();
    expect(await previewBoard(db!, 'line-won', {})).toBeNull();
    expect(await previewBoard(db!, 'line-won', { DEMO_FIXTURES: '1' })).not.toBeNull();
  });

  it('ignores a key it does not recognise', async () => {
    // A stale value in a URL should render the ordinary board, not an error.
    expect(await previewBoard(db!, 'not-a-state', { DEMO_FIXTURES: '1' })).toBeNull();
    expect(await previewBoard(db!, '', { DEMO_FIXTURES: '1' })).toBeNull();
    expect(await previewBoard(db!, undefined, { DEMO_FIXTURES: '1' })).toBeNull();
  });

  it('is the same guard the rest of the demo system uses', () => {
    // Not a second implementation. A guard written twice is a guard that will
    // disagree with itself.
    expect(() => {
      assertDemoAllowed({ VERCEL_ENV: 'production' });
    }).toThrow(DemoRefused);
  });

  it('writes nothing', async () => {
    /*
     * The strongest property of this design, and it is asserted rather than
     * claimed: rendering every state cannot reach `weekly_stakes`, because
     * nothing in `boards.ts` inserts. Checked by reading the module for a write
     * rather than by counting rows, so it holds even for a state nobody thought
     * to run.
     */
    const source = readFileSync(path.join(process.cwd(), 'lib', 'stakes', 'boards.ts'), 'utf8');
    expect(source).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
  });
});

describe('the visual driver and the board agree', () => {
  const DRIVER = readFileSync(path.join(process.cwd(), 'scripts', 'visual-qa.mts'), 'utf8');

  /**
   * Every `board-*` entry in the driver's `ALL_STATES` list.
   *
   * The reasoning is `lib/slice/driver-coverage.test.ts`'s and
   * `lib/backhall/driver-coverage.test.ts`'s, written a fourth time rather than
   * generalised for the reason the second one gives: the catalogs are read out of
   * the driver by different patterns and a shared helper would have to know all
   * of them.
   *
   * **Never photographed is the quiet failure.** It fails no gate, appears in no
   * report, and the first person to notice is whoever eventually looks for a
   * screenshot nobody ever took.
   */
  function driverStates(): readonly string[] {
    const list = /const ALL_STATES: readonly StateName\[\] = \[([\s\S]*?)\n\];/.exec(DRIVER);
    if (list === null) throw new Error('could not find ALL_STATES in scripts/visual-qa.mts');
    return [...list[1]!.matchAll(/'(board-[a-z-]+)'/g)].map((match) => match[1]!);
  }

  it('photographs every declared board state', () => {
    expect([...driverStates()].sort()).toEqual([...BOARD_STATES].map((key) => `board-${key}`).sort());
  });

  it('declares a case for each of them', () => {
    // A state in `ALL_STATES` with no `case` photographs whatever page was
    // already open. `reach()` throws for that at runtime; this catches it before
    // a nine-minute workflow does.
    for (const state of driverStates()) {
      expect(DRIVER, `no case for ${state}`).toContain(`case '${state}'`);
    }
  });

  it('checks the board came from the server rather than from the URL', () => {
    /*
     * `?board=` is resolved by the **server**, which needs `DEMO_FIXTURES=1`. A
     * server without it answers every state with the ordinary quiet slate, and a
     * driver that only navigated would file that under a name claiming otherwise
     * and pass. That has happened once already, to nine reveal states, and cost a
     * milestone's worth of false green.
     */
    expect(DRIVER).toContain('BOARD_EXPECTATIONS');
    expect(DRIVER).toContain('await checkBoard(page, width, state)');
  });

  it('has an expectation for every state it declares', () => {
    for (const state of driverStates()) {
      expect(DRIVER, `${state} has no expectation in BOARD_EXPECTATIONS`).toMatch(
        new RegExp(`'${state}':\\s*\\{`),
      );
    }
  });
});
