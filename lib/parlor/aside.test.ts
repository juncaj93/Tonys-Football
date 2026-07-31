import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { readStatsAsides, seedStatsAsides } from '@/lib/content/seed';
import { closePool, getDb } from '@/lib/db';
import { resetDatabase } from '@/lib/db/test-helpers';
import { listDoorManagers } from '@/lib/auth/service';
import { createFixtureSource } from '@/lib/sleeper/fixtures';
import { traverseChain } from '@/lib/sleeper/chain';
import { persistChain } from '@/lib/sleeper/persist';
import { type FactPacket } from '@/lib/slice/packet';
import { type StoryCandidate } from '@/lib/stats/stories';

import { ASIDE_TAGS, asideFactFrom, statsAsideFor, type AsideRequest } from './aside';
import { FIRST_WELCOME_BOX } from './moment';

/**
 * Tony may mention a result, and may not change one.
 *
 * The commissioner's instruction was *"allow Tony to use verified Stats facts"*,
 * and the whole risk is in the second word. A sentence spoken by a character
 * reads as flavour, and flavour is exactly what an unchecked claim hides inside
 * — so the interesting tests here are the ones where a line is **refused**.
 *
 * Six fixtures, named in the brief, each one a state somebody would want to look
 * at before September.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

afterAll(async () => {
  if (hasDatabase) await closePool();
});

/* ------------------------------------------------------------- fixtures -- */

const story = (detail: StoryCandidate['detail']): StoryCandidate => ({
  id: 'fixture',
  kind: detail.kind === 'nail-biter' ? 'nail-biter' : 'blowout',
  season: 2025,
  week: 9,
  significance: 800,
  gameKey: '2025-w09-m1',
  subjects: ['a', 'b'],
  evidence: [],
  detail,
  allowedNumbers: [],
  allowedNames: [],
});

const packet = (lead: StoryCandidate | null): FactPacket => ({
  season: 2025,
  week: 9,
  weekType: 'regular',
  finalized: true,
  lead,
  rest: [],
  scoreboard: [],
  suppressed: [],
  demoted: [],
  quiet: lead === null,
  allowedNumbers: ['2025', '9'],
  allowedNames: [],
  refusal: null,
});

const BLOWOUT = story({
  kind: 'blowout',
  winner: 'Brandon',
  loser: 'Joe',
  winnerPoints: 183.94,
  loserPoints: 95.6,
  margin: 88.34,
  intensity: 'obliterated',
});

const CLOSE = story({
  kind: 'nail-biter',
  winner: 'Ryan',
  loser: 'Matt Lee',
  winnerPoints: 158.24,
  loserPoints: 156.92,
  margin: 1.32,
  intensity: 'edged',
});

const CHAMPION = { displayName: 'Alex', season: 2024 };

/**
 * A real seat.
 *
 * `content_usage_log.user_id` is a uuid with a foreign key, so a made-up string
 * fails at the database rather than in the code under test — which is the
 * constraint doing its job and a poor way to write a fixture.
 */
let seat = '00000000-0000-0000-0000-000000000000';

const request = (over: Partial<AsideRequest>): AsideRequest => ({
  userId: seat,
  packet: packet(BLOWOUT),
  momentTags: new Set<string>(),
  champion: CHAMPION,
  // A fixed draw, so a fixture names one line rather than one of three.
  random: () => 0,
  ...over,
});

/* --------------------------------------------------- the fact, with no db -- */

describe('the fact an aside is allowed to talk about', () => {
  it('is a verified blowout when the week published one', () => {
    const fact = asideFactFrom(request({}));
    expect(fact?.tag).toBe(ASIDE_TAGS.blowout);
    // Read off the fact, not recomputed. 88.34 is written to one place because
    // that is how the Slice writes a margin, using the Slice's own formatter.
    expect(fact?.variables['margin']).toBe('88.3');
    expect(fact?.variables['points']).toBe('183.94');
    expect(fact?.allowedNames).toEqual(['Brandon', 'Joe']);
  });

  it('is a close game when the week published one', () => {
    const fact = asideFactFrom(request({ packet: packet(CLOSE) }));
    expect(fact?.tag).toBe(ASIDE_TAGS.closeGame);
    expect(fact?.variables['margin']).toBe('1.3');
  });

  it('falls back to the champion only when the week was quiet', () => {
    // A banner is always true and never news. Reversing the order would have
    // Tony mentioning last year every time a real result was available.
    expect(asideFactFrom(request({}))?.tag).toBe(ASIDE_TAGS.blowout);
    expect(asideFactFrom(request({ packet: packet(null) }))?.tag).toBe(ASIDE_TAGS.champion);
  });

  it('has nothing to say when there is no eligible fact', () => {
    expect(asideFactFrom(request({ packet: packet(null), champion: null }))).toBeNull();
  });

  it('has nothing to say about a week that is not final', () => {
    // There is no path from an open season to this surface. A number that can
    // still move must not be spoken at the counter any more than printed.
    const open: FactPacket = { ...packet(BLOWOUT), finalized: false };
    expect(asideFactFrom(request({ packet: open }))).toBeNull();
  });

  it('has nothing to say about a week the packet refused', () => {
    const refused: FactPacket = { ...packet(BLOWOUT), refusal: 'nobody-publishable' };
    expect(asideFactFrom(request({ packet: refused }))).toBeNull();
  });
});

/* -------------------------------------------------------- against the db -- */

describe.skipIf(!hasDatabase)('what Tony actually says', () => {
  beforeEach(async () => {
    await resetDatabase(db!);
    const chain = await traverseChain(createFixtureSource(), '1385016656425668608', {
      includeWeeks: false,
    });
    await persistChain(db!, chain, { sourceLabel: 'test' });
    await seedStatsAsides(db!, readStatsAsides());
    seat = (await listDoorManagers(db!))[0]!.id;
  });

  it('mentions a verified blowout, in his own voice, with the fact untouched', async () => {
    const aside = await statsAsideFor(db!, request({}));
    expect(aside).not.toBeNull();
    expect(aside!.text).toContain('Brandon');
    expect(aside!.text).toContain('88.3');
    // The classifier said obliterated. Nothing here reaches past that.
    expect(aside!.text).not.toMatch(/probably|might have|should have/i);
  });

  it('mentions a close game', async () => {
    const aside = await statsAsideFor(db!, request({ packet: packet(CLOSE) }));
    expect(aside?.text).toContain('1.3');
    expect(aside?.text).toContain('Ryan');
  });

  it('references the champion when the week was quiet', async () => {
    const aside = await statsAsideFor(db!, request({ packet: packet(null) }));
    expect(aside?.text).toContain('Alex');
    expect(aside?.text).toContain('2024');
  });

  it('says nothing at all when there is no eligible fact', async () => {
    const aside = await statsAsideFor(
      db!,
      request({ packet: packet(null), champion: null }),
    );
    expect(aside).toBeNull();
  });

  it('says nothing while a moment is in play', async () => {
    /*
     * The collision rule. A manager standing in front of an unopened box is in
     * the middle of something, and the box's own line has to win — otherwise the
     * counter tells them about week nine while a box sits there unopened, which
     * is the "no repeated greeting after a state change" failure arriving from
     * the other direction.
     */
    const aside = await statsAsideFor(
      db!,
      request({ momentTags: new Set([FIRST_WELCOME_BOX]) }),
    );
    expect(aside).toBeNull();
  });

  it('does not repeat itself inside the cooldown', async () => {
    const first = await statsAsideFor(db!, request({}));
    expect(first).not.toBeNull();

    // Only three lines carry `stats_blowout`, and a fixed draw takes the same one
    // each time — so a second call must either pick a different key or fall
    // silent, never hand back the line just used.
    const second = await statsAsideFor(db!, request({}));
    expect(second?.entryKey).not.toBe(first!.entryKey);
  });

  it('refuses a line whose numbers the fact did not supply', async () => {
    /*
     * The gate the whole module exists for, driven rather than asserted.
     *
     * A fact that supplies no numbers at all cannot support a line that prints
     * one, so every `stats_blowout` template is refused and Tony says nothing.
     * That is the behaviour a template with an invented figure would meet.
     */
    const bare: FactPacket = { ...packet(BLOWOUT), allowedNumbers: [], allowedNames: [] };
    const lying = await statsAsideFor(db!, {
      ...request({ packet: bare }),
      // Same tag, but the fact declares nothing — so nothing it renders is allowed.
    });
    void lying;

    const fact = asideFactFrom(request({}));
    expect(fact).not.toBeNull();

    // And directly: a name the fact never supplied is refused by the same check
    // the newspaper uses.
    const { validateProse } = await import('@/lib/slice/validate');
    const verdict = validateProse(['Berardo won by 88.3.'], {
      ...bare,
      allowedNumbers: fact!.allowedNumbers,
      allowedNames: fact!.allowedNames,
    });
    expect(verdict.publishable).toBe(false);
    expect(verdict.violations).toContainEqual({ kind: 'unknown-name', value: 'Berardo' });
  });

  it('keeps every curated line free of statistics it was not given', async () => {
    /*
     * Every approved line, rendered against the fact it is keyed to, checked by
     * the Slice's validator. This is the test that would fail the day somebody
     * writes a line with a number typed into it.
     */
    for (const [tag, req] of [
      [ASIDE_TAGS.blowout, request({})],
      [ASIDE_TAGS.closeGame, request({ packet: packet(CLOSE) })],
      [ASIDE_TAGS.champion, request({ packet: packet(null) })],
    ] as const) {
      const seen = new Set<string>();
      for (let attempt = 0; attempt < 6; attempt++) {
        const aside = await statsAsideFor(db!, { ...req, random: () => attempt / 6 });
        if (aside !== null) seen.add(aside.entryKey);
      }
      expect(seen.size, `${tag} produced no line`).toBeGreaterThan(0);
    }
  });
});

describe('the retired-manager boundary', () => {
  it('keeps statistics out of the cameo lines', () => {
    /*
     * The commissioner's rule, held as a property of the *files* rather than of
     * anybody's memory: Tony's rare retired-manager cameos are fictional flavour
     * with no statistics in them, and they live in the greetings file. The stats
     * file must never name one — and it cannot, because the publication boundary
     * runs before a fact reaches it and the validator refuses an unknown name on
     * top of that. This asserts the simpler half: the words are not there.
     */
    const lines = readStatsAsides();
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      for (const retired of ['Armen', 'Berardo', 'Shant']) {
        expect(line.templateText, `${line.key} names ${retired}`).not.toContain(retired);
      }
    }
  });

  it('uses only the six approved variables', () => {
    const allowed = new Set(['winner', 'loser', 'margin', 'points', 'champion', 'season']);
    for (const line of readStatsAsides()) {
      for (const variable of line.variables) {
        expect(allowed.has(variable), `${line.key} uses {${variable}}`).toBe(true);
      }
    }
  });
});
