import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { readManagerNames, seedManagerNames } from '@/lib/content/managers';
import { closePool, getDb } from '@/lib/db';
import { fantasyMatchups, seasons, weekFinalizations } from '@/lib/db/schema';
import { resetDatabase } from '@/lib/db/test-helpers';
import { activeLeagueManagers } from '@/lib/league/membership';
import { traverseChain } from '@/lib/sleeper/chain';
import { createFixtureSource } from '@/lib/sleeper/fixtures';
import { persistChain } from '@/lib/sleeper/persist';
import { LEAD_FLOOR, STORY_FLOOR, type StoryCandidate } from '@/lib/stats/stories';

import { latestEdition } from './edition';
import { SLICE_EDITIONS, allEditions, resolveEdition } from './editions';
import { factPacket, margin, points, type FactPacket } from './packet';
import { MATERIAL, MAX_STORIES, selectStories } from './select';
import {
  COLOUR,
  COLUMN,
  FRAME,
  GAP,
  HEADLINES,
  KIND_COLOUR,
  PHRASES,
  REFUSALS,
  RESULT,
  pick,
  renderEdition,
  type Edition,
} from './render';
import { validateEdition } from './validate';

/**
 * The Slice, end to end, against the real imported seasons.
 *
 * Three properties matter and they are different:
 *
 *   1. **The pipeline publishes with no API key.** `16 §9` makes the
 *      deterministic renderer the default rather than a fallback, so the test
 *      that matters is that every real historical week produces a real issue with
 *      nothing configured.
 *   2. **The validator can refuse.** A gate that has only ever been shown passing
 *      is not evidence of anything — every rule below is driven with prose
 *      written to break it.
 *   3. **The numbers are in the right units.** The Slice once printed a real
 *      matchup as *"1.84 to 1.10"* and every structural test passed, because the
 *      allowed-number list and the prose came from the same broken helper. Range
 *      assertions over a real week are the check that symmetry cannot satisfy;
 *      `independent-verification.test.ts` is the other half.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

/** The chain's head. The fixtures walk back to 2024 from here. */
const LEAGUE_2026 = '1385016656425668608';

afterAll(async () => {
  if (hasDatabase) await closePool();
});

/* -------------------------------------------------------------------------- */
/* The validator, with no database                                            */
/* -------------------------------------------------------------------------- */

/** A packet built by hand, so the validator can be tested without a database. */
const HAND: FactPacket = {
  season: 2025,
  week: 3,
  weekType: 'regular',
  finalized: true,
  lead: null,
  rest: [],
  scoreboard: [],
  suppressed: [],
  demoted: [],
  quiet: false,
  allowedNumbers: ['154.42', '103.91', '50.5', '50.51', '2025', '3'],
  allowedNames: ['Nick', 'Matt Lee'],
  refusal: null,
};

const blank: Edition = {
  season: 2025,
  week: 3,
  dateline: 'Season 2025 · Week 3',
  character: 'ordinary',
  headline: '',
  deck: null,
  body: '',
  secondary: [],
  scoreboard: [],
  column: 'An ordinary week, and Tony prints those the same as the other kind.',
  nothingToPrint: null,
};

const verdict = (over: Partial<Edition>) => validateEdition({ ...blank, ...over }, HAND);

describe('the validator refuses what `16 §9` says it must', () => {
  it('accepts prose whose every number and name came from the packet', () => {
    expect(
      verdict({ headline: 'Nick takes week 3', body: 'Nick 154.42, Matt Lee 103.91.' }).publishable,
    ).toBe(true);
  });

  it('refuses a number the packet never allowed', () => {
    const result = verdict({ body: 'Nick 154.42, Matt Lee 103.92.' });
    expect(result.publishable).toBe(false);
    expect(result.violations).toContainEqual({ kind: 'unknown-number', value: '103.92' });
  });

  it('refuses a name the packet never allowed — including a retired manager', () => {
    const result = verdict({ body: 'Berardo had a good week.' });
    expect(result.publishable).toBe(false);
    expect(result.violations).toContainEqual({ kind: 'unknown-name', value: 'Berardo' });
  });

  it('refuses a quotation mark of any kind', () => {
    for (const quote of ['"', '“', '”']) {
      expect(verdict({ body: `Tony said ${quote}nice.` }).publishable).toBe(false);
    }
  });

  it.each([
    ['a kicker reference', 'The kicker missed twice.'],
    ['win-probability language', 'Nick had the odds all afternoon.'],
    ['an unreleased feature', 'Straight to the casino after that.'],
    ['a prediction dressed as a fact', 'Nick should win the next one.'],
  ])('refuses %s', (_label, body) => {
    const result = verdict({ body });
    expect(result.publishable).toBe(false);
    expect(result.violations.some((v) => v.kind === 'banned-term')).toBe(true);
  });

  it('checks the scoreboard, not only the prose', () => {
    // The surface nobody thinks to check. A results table naming somebody who may
    // not be published is exactly the leak the boundary exists to stop.
    const result = verdict({
      scoreboard: [
        {
          key: 'k',
          leftName: 'Berardo',
          leftPoints: '154.42',
          rightName: 'Nick',
          rightPoints: '103.91',
          leftWon: true,
          tie: false,
        },
      ],
    });
    expect(result.publishable).toBe(false);
    expect(result.violations).toContainEqual({ kind: 'unknown-name', value: 'Berardo' });
  });

  it('checks a secondary story as closely as the lead', () => {
    const result = verdict({
      secondary: [{ headline: 'Berardo climbs', deck: null, body: 'From 4 to 1.' }],
    });
    expect(result.publishable).toBe(false);
  });

  it('still scans an empty rack for banned terms and quotes', () => {
    expect(
      validateEdition(
        { ...blank, nothingToPrint: 'Nothing on the rack. Try the casino.' },
        HAND,
      ).publishable,
    ).toBe(false);
  });
});

/**
 * Every string the renderer can print.
 *
 * Assembled from the exported tables rather than copied, so a new template joins
 * these checks automatically. A hand-written list here would go stale exactly the
 * way the validator's old hand-written word list did.
 */
const CURATED: readonly string[] = [
  ...Object.values(HEADLINES).flat(),
  ...Object.values(RESULT).flat(),
  ...Object.values(FRAME).flat(),
  ...GAP,
  ...Object.values(COLOUR).flat(),
  ...Object.values(KIND_COLOUR).flat(),
  ...Object.values(COLUMN).flat(),
  ...Object.values(REFUSALS),
  ...Object.values(PHRASES),
];

describe('the curated templates cannot smuggle anything past the validator', () => {
  it('contains no literal digit', () => {
    /*
     * A digit inside a curated string is a number the packet never allowed, and
     * the validator would be right to refuse it — on some future week, in
     * production, on a surface nobody was looking at. Substitution tokens are how
     * numbers get in.
     */
    const digits = /\d/;
    for (const line of CURATED) expect(line, line).not.toMatch(digits);
  });

  it('contains no quotation mark', () => {
    for (const line of CURATED) expect(line, line).not.toMatch(/["“”]/);
  });
});

describe('variant choice is stable and spread', () => {
  it('returns the same variant for the same seed, always', () => {
    const variants = ['a', 'b', 'c', 'd'];
    for (const seed of ['2025:3:x', '2024:17:championship', '']) {
      expect(pick(variants, seed)).toBe(pick(variants, seed));
    }
  });

  it('does not collapse to one variant across a season of seeds', () => {
    // The point of the hash is variety. A hash that returned index 0 for every
    // realistic seed would pass every other test in this file.
    const variants = ['a', 'b', 'c'];
    const seen = new Set<string>();
    for (let week = 1; week <= 18; week++) seen.add(pick(variants, `2025:${String(week)}:lead`));
    expect(seen.size).toBeGreaterThan(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Selection                                                                  */
/* -------------------------------------------------------------------------- */

const candidate = (over: Partial<StoryCandidate>): StoryCandidate => ({
  id: 'x',
  kind: 'blowout',
  season: 2025,
  week: 3,
  significance: 700,
  gameKey: null,
  subjects: ['a'],
  evidence: [],
  detail: {
    kind: 'blowout',
    winner: 'Nick',
    loser: 'Matt Lee',
    winnerPoints: 154.42,
    loserPoints: 103.91,
    margin: 50.51,
    intensity: 'crushed',
  },
  allowedNumbers: [],
  allowedNames: [],
  ...over,
});

describe('the desk', () => {
  it('runs the strongest story first', () => {
    const selection = selectStories([
      candidate({ id: 'weak', kind: 'streak', significance: 500 }),
      candidate({ id: 'strong', kind: 'blowout', significance: 800 }),
    ]);
    expect(selection.lead?.id).toBe('strong');
    expect(selection.rest.map((s) => s.id)).toEqual(['weak']);
  });

  it('never tells one result as two stories', () => {
    const selection = selectStories([
      candidate({ id: 'title', kind: 'championship', significance: 900, gameKey: 'g1' }),
      candidate({ id: 'blow', kind: 'blowout', significance: 780, gameKey: 'g1' }),
    ]);
    expect(selection.rest).toHaveLength(0);
    expect(selection.suppressed).toContainEqual(
      expect.objectContaining({ id: 'blow', reason: 'same-game' }),
    );
  });

  it('runs one story of each shape', () => {
    const selection = selectStories([
      candidate({ id: 'a', kind: 'blowout', significance: 800, subjects: ['p'] }),
      candidate({ id: 'b', kind: 'blowout', significance: 700, subjects: ['q'] }),
    ]);
    expect(selection.rest).toHaveLength(0);
    expect(selection.suppressed).toContainEqual(
      expect.objectContaining({ id: 'b', reason: 'same-kind' }),
    );
  });

  it('makes a manager who already carries the issue clear a higher bar', () => {
    const selection = selectStories([
      candidate({ id: 'first', kind: 'blowout', significance: 800, subjects: ['same'] }),
      candidate({ id: 'second', kind: 'streak', significance: 400, subjects: ['same'] }),
      candidate({ id: 'other', kind: 'low-score', significance: 400, subjects: ['else'] }),
    ]);
    expect(selection.rest.map((s) => s.id)).toEqual(['other']);
    expect(selection.suppressed).toContainEqual(
      expect.objectContaining({ id: 'second', reason: 'manager-repeat' }),
    );
  });

  it('runs quiet rather than promoting an ordinary result', () => {
    const selection = selectStories([
      candidate({ id: 'ordinary', kind: 'low-score', significance: LEAD_FLOOR - 1 }),
    ]);
    expect(selection.quiet).toBe(true);
    expect(selection.lead).toBeNull();
    expect(selection.suppressed).toContainEqual(
      expect.objectContaining({ reason: 'below-lead-floor' }),
    );
  });

  it('drops anything under the story floor outright', () => {
    const selection = selectStories([candidate({ significance: STORY_FLOOR - 1 })]);
    expect(selection.suppressed).toContainEqual(
      expect.objectContaining({ reason: 'below-floor' }),
    );
  });

  it('carries at most three stories, and says what it left out', () => {
    const kinds = ['blowout', 'nail-biter', 'streak', 'low-score'] as const;
    const selection = selectStories(
      kinds.map((kind, i) =>
        candidate({ id: kind, kind, significance: 800 - i, subjects: [`p${String(i)}`] }),
      ),
    );
    expect([selection.lead, ...selection.rest]).toHaveLength(MAX_STORIES);
    expect(selection.suppressed).toContainEqual(
      expect.objectContaining({ reason: 'edition-full' }),
    );
  });

  it('reorders for novelty and never silences a real story', () => {
    /*
     * The failure this pins: the discount used to be applied before the floors,
     * and 2024 week ten printed *"A quiet week at the shop"* above a board showing
     * a fifty-one-point win, because `blowout` had led week nine. A front page
     * that contradicts its own scoreboard is worse than a repeated headline.
     */
    const stale = selectStories(
      [candidate({ id: 'blow', kind: 'blowout', significance: LEAD_FLOOR + 10 })],
      { recentLeadKinds: ['blowout'] },
    );
    expect(stale.quiet).toBe(false);
    expect(stale.lead?.id).toBe('blow');
    expect(stale.demoted).toContainEqual(expect.objectContaining({ id: 'blow', penalty: 150 }));
  });

  it('never lets variety suppress a materially significant event', () => {
    /*
     * Commissioner ruling, 2026-07-31, and the three rules it overrides, driven
     * one at a time. A record is the news; a paper that dropped it because the
     * same manager already appeared, or because a blowout led last week, would be
     * wrong in the way that loses a reader rather than merely bores them.
     */
    const record = candidate({
      id: 'record',
      kind: 'record-margin',
      significance: MATERIAL + 10,
      subjects: ['same'],
    });

    // 1. Novelty cannot demote it below a weaker story.
    const stale = selectStories(
      [record, candidate({ id: 'fresh', kind: 'streak', significance: 500, subjects: ['other'] })],
      { recentLeadKinds: ['record-margin'] },
    );
    expect(stale.lead?.id).toBe('record');
    expect(stale.demoted).toEqual([]);

    // 2. Nor can a manager already carrying the issue.
    const repeat = selectStories([
      candidate({ id: 'first', kind: 'blowout', significance: 800, subjects: ['same'] }),
      record,
    ]);
    expect(repeat.rest.map((story) => story.id)).toContain('record');

    // 3. Nor can another story of the same kind.
    const sameKind = selectStories([
      candidate({ id: 'other-record', kind: 'record-margin', significance: 900, subjects: ['a'] }),
      { ...record, gameKey: 'different' },
    ]);
    expect([sameKind.lead, ...sameKind.rest].map((story) => story?.id)).toContain('record');
  });

  it('still tells one result as one story, however material', () => {
    // `same-game` is above the materiality line, because it is arithmetic rather
    // than a variety heuristic.
    const selection = selectStories([
      candidate({ id: 'title', kind: 'championship', significance: 900, gameKey: 'g1' }),
      candidate({ id: 'record', kind: 'record-margin', significance: 950, gameKey: 'g1' }),
    ]);
    expect(selection.rest).toHaveLength(0);
    expect(selection.suppressed).toContainEqual(
      expect.objectContaining({ reason: 'same-game' }),
    );
  });

  it('lets a fresh story of equal weight overtake a repeated one', () => {
    const selection = selectStories(
      [
        candidate({ id: 'repeat', kind: 'blowout', significance: 700, subjects: ['p'] }),
        candidate({ id: 'fresh', kind: 'nail-biter', significance: 650, subjects: ['q'] }),
      ],
      { recentLeadKinds: ['blowout'] },
    );
    expect(selection.lead?.id).toBe('fresh');
    expect(selection.rest.map((s) => s.id)).toEqual(['repeat']);
  });
});

/* -------------------------------------------------------------------------- */
/* The whole pipeline, against the imported seasons                           */
/* -------------------------------------------------------------------------- */

describe.skipIf(!hasDatabase)('the Slice, against the imported seasons', () => {
  beforeEach(async () => {
    await resetDatabase(db!);
    const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, { includeWeeks: true });
    await persistChain(db!, chain, { sourceLabel: 'test', finalizeYears: [2024, 2025] });
    await seedManagerNames(db!, readManagerNames());
  });

  /**
   * A live season's closed week prints.
   *
   * ## The defect this pins
   *
   * `factPacket` used to take its finality from `seasons.finalized_at` — *the
   * books closed in January* — so every week of an **open** season refused with
   * `not-final` and the weekly Slice could not draft at all until the season was
   * over. The first live Tuesday would have closed week one, paid every reward,
   * settled every stake, and then declined to print the paper.
   *
   * `lib/stats/finality.ts` was written for exactly this and says so in its own
   * header; only weekly stakes had adopted it. The fix is that a week is final
   * when `week_finalizations` holds it **or** the season closed — and the Tuesday
   * job writes that row four steps before it drafts.
   *
   * Asserted against 2026, which is the only open season on record and therefore
   * the only place the defect was visible.
   */
  it('prints a closed week of a season whose books are still open', async () => {
    const [season] = await db!
      .select({ id: seasons.id })
      .from(seasons)
      .where(eq(seasons.year, 2026));

    /* One real game, stored the way the in-season sync stores one. */
    await db!.insert(fantasyMatchups).values({
      seasonId: season!.id,
      week: 1,
      weekType: 'regular',
      sleeperMatchupId: 1,
      rosterAId: 1,
      rosterBId: 2,
      pointsACents: 14_412,
      pointsBCents: 9_806,
      winnerRosterId: 1,
      marginCents: 4606,
      capturedAt: new Date('2026-09-15T09:00:00Z'),
      createdAt: new Date('2026-09-15T09:00:00Z'),
      updatedAt: new Date('2026-09-15T09:00:00Z'),
    });

    /* Open books, unclosed week: nothing may be printed. */
    expect((await factPacket(db!, { season: 2026, week: 1 })).refusal).toBe('not-final');

    await db!.insert(weekFinalizations).values({
      seasonId: season!.id,
      week: 1,
      games: 1,
      finalizedAt: new Date('2026-09-15T13:00:00Z'),
    });

    const packet = await factPacket(db!, { season: 2026, week: 1 });
    expect(packet.refusal).toBeNull();
    expect(validateEdition(renderEdition(packet), packet).violations).toEqual([]);
  });

  it('publishes every week of both finalized seasons with no violations', async () => {
    let published = 0;
    for (const season of [2024, 2025]) {
      for (let week = 1; week <= 17; week++) {
        const packet = await factPacket(db!, { season, week });
        if (packet.refusal !== null) continue;
        const issue = renderEdition(packet);
        const result = validateEdition(issue, packet);
        expect(
          result.violations,
          `${String(season)} week ${String(week)}: ${JSON.stringify(result.violations)}`,
        ).toEqual([]);
        published++;
      }
    }
    // Both seasons, every scored week. A pipeline that refused everything would
    // also produce zero violations.
    expect(published).toBe(34);
  });

  it('prints scores in points, not in cents and not divided twice', async () => {
    /*
     * The units assertion, and the reason it is a *range* rather than a value.
     *
     * A pinned value read off the pipeline's own output would have recorded the
     * `1.84 to 1.10` bug rather than caught it. A range cannot: no fantasy week in
     * this league is decided 1.84 to 1.10, and none is decided 18412 to 10998.
     */
    for (const season of [2024, 2025]) {
      for (let week = 1; week <= 17; week++) {
        const packet = await factPacket(db!, { season, week });
        for (const line of packet.scoreboard) {
          for (const value of [line.winnerPoints, line.loserPoints, line.tiePoints]) {
            if (value === null) continue;
            expect(value, `${String(season)} w${String(week)}`).toBeGreaterThan(30);
            expect(value, `${String(season)} w${String(week)}`).toBeLessThan(300);
          }
        }
      }
    }
  });

  it('reports every publishable game of the week, not only the ones with a story', async () => {
    // The old renderer printed the two games the fact layer had an opinion about
    // and silently dropped the rest, so several managers never appeared in their
    // own week.
    const packet = await factPacket(db!, { season: 2025, week: 5 });
    expect(packet.scoreboard.length).toBeGreaterThanOrEqual(4);
    const named = new Set(
      packet.scoreboard.flatMap((line) => [line.winnerName, line.loserName]).filter(Boolean),
    );
    expect(named.size).toBe(packet.scoreboard.length * 2);
  });

  it('never names anybody who is not in this league', async () => {
    const roster = new Set((await activeLeagueManagers(db!)).map((m) => m.displayName));
    for (const season of [2024, 2025]) {
      for (let week = 1; week <= 17; week++) {
        const packet = await factPacket(db!, { season, week });
        for (const name of packet.allowedNames) {
          expect(roster.has(name), `${name} in ${String(season)} w${String(week)}`).toBe(true);
        }
      }
    }
  });

  it('gives a retired manager no chance to consume a story slot', async () => {
    /*
     * The defect this pins, exactly. 2024 week seven was decided by 2.82 points
     * between two managers who are both in the league — and the paper led with a
     * streak, because the week's *overall* closest game involved somebody
     * retired, the nail-biter candidate was built for that game, and it was then
     * dropped with nothing taking its place.
     *
     * The boundary is applied before derivation now (`publishableWeek`), so the
     * closest publishable game is the one considered.
     */
    const packet = await factPacket(db!, { season: 2024, week: 7 });
    expect(packet.lead?.kind).toBe('nail-biter');
  });

  it('withholds every result while a season is open', async () => {
    // 2026 is imported and not finalized. `not-final` rather than a soft version
    // of the story: a number that can still move must not be printed at all.
    const packet = await factPacket(db!, { season: 2026, week: 1 });
    expect(packet.refusal).not.toBeNull();
    expect(packet.lead).toBeNull();
    expect(packet.scoreboard).toEqual([]);
  });

  it('renders the same issue twice for the same week', async () => {
    // A published paper cannot re-word itself on reload. This is the property
    // `Math.random()` would break and a hash does not.
    const packet = await factPacket(db!, { season: 2024, week: 9 });
    expect(renderEdition(packet)).toEqual(renderEdition(packet));
  });

  it('puts a real issue on the rack in the offseason', async () => {
    const issue = await latestEdition(db!);
    expect(issue).not.toBeNull();
    expect(issue!.headline.length).toBeGreaterThan(0);
    expect(issue!.scoreboard.length).toBeGreaterThan(0);
  });

  it('finds the title game from the recorded placements', async () => {
    const packet = await factPacket(db!, { season: 2024, week: 17 });
    expect(packet.lead?.kind).toBe('championship');
    expect(renderEdition(packet).character).toBe('title');
  });
});

/* -------------------------------------------------------------------------- */
/* The demo editions                                                          */
/* -------------------------------------------------------------------------- */

describe.skipIf(!hasDatabase)('every declared edition is implemented', () => {
  beforeEach(async () => {
    await resetDatabase(db!);
    const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, { includeWeeks: true });
    await persistChain(db!, chain, { sourceLabel: 'test', finalizeYears: [2024, 2025] });
    await seedManagerNames(db!, readManagerNames());
  });

  it('renders all fifteen, and each one validates', async () => {
    const rendered = await allEditions(db!);
    expect(rendered).toHaveLength(SLICE_EDITIONS.length);
    for (const { key, preview } of rendered) {
      const issue = preview.issue;
      if (issue === null) continue;
      expect(issue.dateline, key).not.toBe('');
      expect(issue.column, key).not.toBe('');
    }
  });

  it('throws for a state that is declared and not implemented', async () => {
    await expect(
      // Deliberately outside the union: the runtime guard is the point, because a
      // missing arm renders an empty rack, photographs cleanly and passes.
      resolveEdition(db!, 'not-a-state' as never),
    ).rejects.toThrow(/declared but not implemented/);
  });

  it.each([
    ['blowout', 'blowout'],
    ['close-finish', 'nail-biter'],
    ['championship', 'championship'],
    ['record-score', 'record-score'],
    ['standings-shakeup', 'standings-move'],
    ['one-story', 'nail-biter'],
  ] as const)('%s leads with a %s story', async (key, kind) => {
    /*
     * Pins the *character* of each demo, not its prose.
     *
     * A calibration change that quietly turned the blowout demo into an ordinary
     * week would otherwise be found by a person looking at a screenshot, which is
     * the review this catalog exists to make unnecessary.
     */
    const preview = await resolveEdition(db!, key);
    expect(preview.mode, key).toBe('issue');
    if (preview.mode !== 'issue') return;
    expect(preview.issue.headline, key).not.toBe('');
    expect(preview.issue.character, key).not.toBe('empty');
    expect(preview.leadKind, key).toBe(kind);
  });

  it('shows a quiet issue with a full board when nothing cleared the bar', async () => {
    const preview = await resolveEdition(db!, 'no-stories');
    const issue = preview.issue;
    expect(issue?.character).toBe('quiet');
    expect(issue?.secondary).toEqual([]);
    expect(issue?.scoreboard.length).toBeGreaterThan(0);
  });

  it('prints no result at all while a week is open', async () => {
    const preview = await resolveEdition(db!, 'incomplete-week');
    const issue = preview.issue;
    expect(issue?.nothingToPrint).not.toBeNull();
    expect(issue?.scoreboard).toEqual([]);
    expect(issue?.deck).toBeNull();
  });

  it('shows an empty rack before the season starts', async () => {
    const preview = await resolveEdition(db!, 'preseason');
    expect(preview.mode).toBe('rack');
    expect(preview.issue).toBeNull();
  });

  it('renders identical bytes on a second call', async () => {
    for (const key of SLICE_EDITIONS) {
      const first = await resolveEdition(db!, key);
      const second = await resolveEdition(db!, key);
      expect(second, key).toEqual(first);
    }
  });
});

describe('the two number formats the packet allows', () => {
  it('writes a score to two places and a margin to one', () => {
    expect(points(154.4)).toBe('154.40');
    expect(margin(50.51)).toBe('50.5');
  });
});
