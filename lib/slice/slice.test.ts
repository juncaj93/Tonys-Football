import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { closePool, getDb } from '@/lib/db';
import { readManagerNames, seedManagerNames } from '@/lib/content/managers';
import { resetDatabase } from '@/lib/db/test-helpers';
import { activeLeagueManagers } from '@/lib/league/membership';
import { traverseChain } from '@/lib/sleeper/chain';
import { createFixtureSource } from '@/lib/sleeper/fixtures';
import { persistChain } from '@/lib/sleeper/persist';

import { factPacket, margin, points, type FactPacket } from './packet';
import { renderEdition } from './render';
import { validateEdition } from './validate';

/**
 * The Slice, end to end, against the real imported seasons.
 *
 * Two properties matter and they are different:
 *
 *   1. **The pipeline publishes with no API key.** `16 §9` makes the
 *      deterministic renderer the default rather than a fallback, so the test
 *      that matters is that a real historical week produces a real issue with
 *      nothing configured.
 *   2. **The validator can refuse.** A gate that has only ever been shown
 *      passing is not evidence of anything — every rule below is driven with
 *      prose written to break it.
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

/** A packet built by hand, so the validator can be tested without a database. */
const HAND: FactPacket = {
  season: 2025,
  week: 3,
  finalized: true,
  stories: [],
  allowedNumbers: ['154.42', '103.91', '50.5', '50.51', '2025', '3'],
  allowedNames: ['Nick', 'Matt Lee'],
  refusal: null,
};

const edition = (over: Partial<Parameters<typeof validateEdition>[0]>) =>
  validateEdition(
    {
      season: 2025,
      week: 3,
      headline: 'Nick takes week 3',
      lead: 'Nick beat Matt Lee, 154.42 to 103.91. That is 50.5 between them.',
      alsoRan: [],
      nothingToPrint: null,
      ...over,
    },
    HAND,
  );

describe('the deterministic validator', () => {
  it('passes prose built only from the packet', () => {
    expect(edition({}).publishable).toBe(true);
  });

  it('refuses a number the packet never allowed', () => {
    // The single most dangerous failure: a plausible score nobody scored.
    const verdict = edition({ lead: 'Nick beat Matt Lee, 154.42 to 103.92.' });
    expect(verdict.publishable).toBe(false);
    expect(verdict.violations).toContainEqual({ kind: 'unknown-number', value: '103.92' });
  });

  it('checks the number at the end of a sentence, which it once did not', () => {
    /*
     * A regression, and a bad one. The number pattern's trailing lookahead
     * rejected a following period, so a number ending a sentence matched
     * nothing — the validator's central rule was dead for the last number in
     * most sentences and every test still passed, because they all happened to
     * put the wrong number mid-clause.
     */
    const verdict = edition({ lead: 'Nick and Matt Lee, and the gap was 999.99.' });
    expect(verdict.violations).toContainEqual({ kind: 'unknown-number', value: '999.99' });
  });

  it('refuses a name the packet never allowed', () => {
    const verdict = edition({ lead: 'Nick beat Berardo, 154.42 to 103.91.' });
    expect(verdict.publishable).toBe(false);
    expect(verdict.violations).toContainEqual({ kind: 'unknown-name', value: 'Berardo' });
  });

  it('does not report the halves of a two-word name', () => {
    expect(edition({ lead: 'Matt Lee lost.' }).violations).toEqual([]);
  });

  it('refuses a kicker, which this league does not have', () => {
    const verdict = edition({ lead: 'Nick won it on a field goal.' });
    expect(verdict.violations.map((v) => v.kind)).toContain('banned-term');
  });

  it('refuses win-probability language, which implies a model that does not exist', () => {
    for (const line of [
      'Nick had a 90 percent win probability.',
      'Matt Lee was projected to win.',
      'Nick is on pace for a title.',
    ]) {
      expect(edition({ lead: line }).publishable, line).toBe(false);
    }
  });

  it('refuses an unreleased feature named in print', () => {
    // A promise the shop cannot keep. The casino is P10 and the basement v1.1.
    expect(edition({ lead: 'Nick took it to the casino.' }).publishable).toBe(false);
    expect(edition({ lead: 'Matt Lee went back to the basement.' }).publishable).toBe(false);
  });

  it('refuses a quotation mark of any kind', () => {
    // Nobody in this league said anything on the record. A quoted sentence is
    // fabricated testimony even when every number around it is correct.
    for (const quote of ['"', '“', '”']) {
      const verdict = edition({ lead: `Nick said ${quote}good game${quote}.` });
      expect(verdict.violations.some((v) => v.kind === 'invented-quote'), quote).toBe(true);
    }
  });

  it('still scans house copy when there is nothing to print', () => {
    const verdict = edition({
      nothingToPrint: 'Nothing on the rack. Try the casino.',
      lead: '',
      headline: '',
    });
    expect(verdict.publishable).toBe(false);
  });

  it('publishes an honest empty week', () => {
    const verdict = edition({
      nothingToPrint: 'Nothing happened that week worth the ink.',
      lead: '',
      headline: '',
    });
    expect(verdict.publishable).toBe(true);
  });
});

describe('writing numbers', () => {
  it('writes points to two places and margins to one', () => {
    // A score is a measurement; a margin is spoken. Both forms are allowed by
    // the packet precisely because both appear in real prose.
    //
    // **These take points, not cents.** They divided by 100 once too often and
    // the Slice printed a real matchup as "1.84 to 1.10". Nothing failed: the
    // allowed-number list and the prose came from this same function, so they
    // agreed while both were wrong.
    expect(points(154.42)).toBe('154.42');
    expect(margin(50.51)).toBe('50.5');
  });
});

describe.skipIf(!hasDatabase)('a real week, from the imported seasons', () => {
  /*
   * Imported here rather than relied on from `npm run db:seed`.
   *
   * Every integration file in this suite truncates, so a test that reads the
   * seeded history is a test whose result depends on file order — it passed
   * alone and reported `no-season` in a full run. Importing the recorded chain
   * is what `lib/stats/facts.test.ts` does and it is the same fixture, so these
   * two agree by construction rather than by luck.
   *
   * `seedManagerNames` matters as much as the chain: the publication boundary
   * filters on canonical display names, and without it every manager is a
   * Sleeper handle and every week refuses.
   */
  beforeEach(async () => {
    await resetDatabase(db!);
    const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, {
      includeWeeks: true,
    });
    await persistChain(db!, chain, { sourceLabel: 'test', finalizeYears: [2024, 2025] });
    await seedManagerNames(db!, readManagerNames());
  });

  it('publishes an issue with no API key configured', async () => {
    // The property `16 §9` is built around: the deterministic renderer is the
    // default, so this is the whole pipeline running with nothing set.
    expect(process.env['ANTHROPIC_API_KEY'] ?? '').toBe('');

    const packet = await factPacket(db!, { season: 2025, week: 3 });
    expect(packet.refusal, 'week 3 of 2025 should have games').toBeNull();
    expect(packet.stories.length).toBeGreaterThan(0);

    /*
     * The units check, and the reason it exists.
     *
     * A shared formatter made the packet and the renderer agree with each other
     * while both were two decimal places out, so every structural test passed
     * and the page printed "1.84 to 1.10". A range assertion is the one check
     * that symmetry cannot satisfy: it compares against football rather than
     * against the other half of the same code.
     */
    for (const { fact } of packet.stories) {
      expect(fact.winnerPoints, 'a fantasy score is tens to low hundreds').toBeGreaterThan(30);
      expect(fact.winnerPoints).toBeLessThan(300);
      expect(fact.loserPoints).toBeGreaterThan(10);
    }
    expect(packet.allowedNumbers.some((n) => Number(n) > 30 && Number(n) < 300)).toBe(true);

    const issue = renderEdition(packet);
    expect(issue.nothingToPrint).toBeNull();
    expect(issue.headline.length).toBeGreaterThan(8);
    expect(issue.lead).toContain('.');

    const verdict = validateEdition(issue, packet);
    expect(
      verdict.violations,
      `the deterministic renderer produced prose its own validator refused: ${JSON.stringify(verdict.violations)}`,
    ).toEqual([]);
  });

  it('renders every week of both finalized seasons without a single violation', async () => {
    /*
     * The real test of "deterministic". A renderer that passes on one hand-picked
     * week proves nothing; this runs the templates over every game the league has
     * ever played and asserts the validator never has to refuse its own default
     * renderer.
     */
    let published = 0;
    let refused = 0;

    for (const season of [2024, 2025]) {
      for (let week = 1; week <= 18; week++) {
        const packet = await factPacket(db!, { season, week });
        const issue = renderEdition(packet);
        const verdict = validateEdition(issue, packet);

        expect(
          verdict.violations,
          `${String(season)} week ${String(week)}: ${JSON.stringify(verdict.violations)}`,
        ).toEqual([]);

        if (issue.nothingToPrint === null) published++;
        else refused++;
      }
    }

    // Both seasons are complete, so most weeks print. The exact split is not
    // pinned — a week can legitimately refuse when every game in it names
    // somebody who is no longer a product participant.
    expect(published).toBeGreaterThan(20);
    expect(published + refused).toBe(36);
  });

  it('never publishes a story naming somebody who is no longer in the league', async () => {
    /*
     * The publication boundary, checked at the far end rather than trusted at the
     * near one. Ryan beating Berardo by 140.72 is the largest margin on record and
     * it stays in the fact layer; it must never reach a printed page.
     */
    const active = new Set((await activeLeagueManagers(db!)).map((m) => m.displayName));

    for (const season of [2024, 2025]) {
      for (let week = 1; week <= 18; week++) {
        const packet = await factPacket(db!, { season, week });
        for (const name of packet.allowedNames) {
          expect(active.has(name), `${name} reached a Slice packet for ${String(season)}`).toBe(
            true,
          );
        }
      }
    }
  });

  it('refuses a season it has never heard of, rather than inventing one', async () => {
    const packet = await factPacket(db!, { season: 1998, week: 1 });
    expect(packet.refusal).toBe('no-season');
    expect(renderEdition(packet).nothingToPrint).not.toBeNull();
  });
});

/**
 * The published page, checked against the raw Sleeper JSON.
 *
 * `MANDATE §10` and the commissioner's ruling of 2026-07-30: a narrative layer
 * may not both calculate and approve its own claims. `lib/stats` has
 * `independent-verification.test.ts` for that at the fact level; this is the
 * same discipline one layer up, because the Slice adds its own arithmetic —
 * selection, formatting, and a decimal conversion that has already been wrong
 * once.
 *
 * Reads the fixture with `JSON.parse` and recomputes by hand. Calls nothing in
 * `lib/stats`, nothing in `lib/sleeper`, and none of the packet's helpers.
 */
describe.skipIf(!hasDatabase)('the printed page, verified against raw Sleeper JSON', () => {
  beforeEach(async () => {
    await resetDatabase(db!);
    const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, {
      includeWeeks: true,
    });
    await persistChain(db!, chain, { sourceLabel: 'test', finalizeYears: [2024, 2025] });
    await seedManagerNames(db!, readManagerNames());
  });

  it('prints the scores the source file holds, to the digit', async () => {
    const LEAGUE_2025 = '1240008879295713280';
    const root = path.join(process.cwd(), 'fixtures', 'sleeper', 'league', LEAGUE_2025);

    const read = <T,>(file: string): T =>
      JSON.parse(readFileSync(path.join(root, file), 'utf8')) as T;

    const raw = read<{ matchup_id: number | null; roster_id: number; points: number }[]>(
      path.join('matchups', '17.json'),
    );
    const rosters = read<{ roster_id: number; owner_id: string | null }[]>('rosters.json');
    const users = read<{ user_id: string; display_name: string }[]>('users.json');

    const ownerOf = new Map(rosters.map((r) => [r.roster_id, r.owner_id]));
    const handleOf = new Map(users.map((u) => [u.user_id, u.display_name]));

    // Pair by matchup id, by hand. A null id is a bye, which is not a game.
    const pairs = new Map<number, { handle: string; points: number }[]>();
    for (const row of raw) {
      if (row.matchup_id === null) continue;
      const side = {
        handle: handleOf.get(ownerOf.get(row.roster_id) ?? '') ?? '?',
        points: row.points,
      };
      pairs.set(row.matchup_id, [...(pairs.get(row.matchup_id) ?? []), side]);
    }

    const games = [...pairs.values()].filter((sides) => sides.length === 2);
    expect(games, '2025 week 17 should hold two games').toHaveLength(2);

    // The biggest gap, computed here and nowhere else.
    let widest = { winner: '', loser: '', high: 0, low: 0, gap: -1 };
    for (const [a, b] of games as [
      { handle: string; points: number },
      { handle: string; points: number },
    ][]) {
      const gap = Math.abs(a.points - b.points);
      if (gap <= widest.gap) continue;
      const [high, low] = a.points >= b.points ? [a, b] : [b, a];
      widest = { winner: high.handle, loser: low.handle, high: high.points, low: low.points, gap };
    }

    const packet = await factPacket(db!, { season: 2025, week: 17 });
    const issue = renderEdition(packet);

    // The handle-to-name mapping is a league decision (`content/manager-mappings.json`),
    // so the check is on the *numbers* — which the pipeline must not alter — and
    // on the names being present, not on the pipeline's own translation of them.
    expect(issue.lead).toContain(widest.high.toFixed(2));
    expect(issue.lead).toContain(widest.low.toFixed(2));
    expect(issue.lead).toContain(widest.gap.toFixed(1));

    // And the decimal point is where football puts it.
    expect(widest.high).toBeGreaterThan(30);
    expect(widest.high).toBeLessThan(300);
  });
});
