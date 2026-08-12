import { describe, expect, it } from 'vitest';

import { PROVISIONAL_ECONOMY } from '@/lib/counter/tokens';
import { weekFinality } from '@/lib/stats/finality';

import {
  BOUNTY_ROLL_WEEKS,
  authorBounty,
  authorChalkboard,
  authorTonysLines,
  authorVersion,
  authorWeek,
} from './author';
import { CLAIMS, ENTRY_VERDICTS, EVIDENCE, VERDICTS, WAITING, fill, houseTemplates } from './copy';
import {
  MIN_BASIS_TEAM_WEEKS,
  leagueScores,
  lowerMedian,
  percentileOf,
  type GameResult,
  type StakeBasis,
  type WeekResult,
} from './facts';
import {
  CHALKBOARD_VARIANTS,
  RETIRED_CHALKBOARD_VARIANTS,
  STAKE_KINDS,
  VARIANTS,
  kindOfVariant,
  payoutKeyFor,
  placementKeyFor,
  settlementKeyFor,
  stakeKeyFor,
  type FactRefs,
  type Presentation,
  type Stake,
  type Variant,
} from './model';
import { LIBRARY, propositionFor, type Calibration } from './propositions';
import { packetFor, renderStake } from './render';
import { resolveStake, settleEntry } from './resolve';

/**
 * The weekly-stakes rules, in isolation.
 *
 * Everything here is pure — authoring, resolution, scoring a pick, and the words.
 * The database guarantees are in `settlement.test.ts` against a real Postgres,
 * and the named states are in `boards.test.ts`; keeping the three apart is what
 * lets this file assert the *rules* without any of them needing a season.
 */

/* -------------------------------------------------------------------------
 * Fixtures
 * ---------------------------------------------------------------------- */

/**
 * A fixed instant, for rows whose timestamp is not what is under test.
 *
 * `new Date()` is a lint error everywhere outside `lib/clock.ts` — the time
 * machine and the season replay depend on one injected clock — and a test is not
 * an exception. A literal is also the better fixture: a row stamped with the wall
 * clock makes an assertion about ordering depend on how fast the suite ran.
 */
const FIXED = new Date('2026-11-10T12:00:00Z');

const cents = (points: number): number => Math.round(points * 100);

/** One standings row, for the seats a personal line is authored against. */
function row(over: {
  readonly rosterId: number;
  readonly managerId: string | null;
  readonly displayName: string | null;
  readonly rank: number;
}): StakeBasis['standings'][number] {
  return {
    rosterId: over.rosterId,
    managerId: over.managerId,
    displayName: over.displayName,
    wins: 0,
    losses: 0,
    ties: 0,
    pointsForCents: 0,
    rank: over.rank,
  };
}

function basis(overrides: Partial<StakeBasis> = {}): StakeBasis {
  return {
    season: 2026,
    week: 5,
    basisWeeks: [1, 2, 3, 4],
    gameKeys: ['2026-w01-m1', '2026-w02-m1'],
    teamWeeks: 32,
    medianTeamScoreCents: cents(118.44),
    bestTeamScoreCents: cents(171.16),
    bestTeamScoreBy: 'Brandon',
    /*
     * Two seats, because a personal line is authored per seat. `u1` scores in
     * the 120s and `u2` in the 90s, which is what makes *"strong and weak
     * managers get different lines"* checkable against a fixture rather than
     * only against a season.
     */
    standings: [
      row({ rosterId: 1, managerId: 'u1', displayName: 'Alex', rank: 1 }),
      row({ rosterId: 2, managerId: 'u2', displayName: 'Nick', rank: 2 }),
    ],
    eligibleUserIds: ['u1', 'u2'],
    /*
     * Two managers with their own histories, so the personal line has something
     * to be personal about. `u1` scores in the 120s and `u2` in the 90s, which
     * is what makes *"strong and weak managers get different lines"* checkable
     * against this fixture rather than only against a season.
     */
    scoresByUser: new Map([
      ['u1', [cents(112), cents(118), cents(124), cents(131)]],
      ['u2', [cents(84), cents(91), cents(96), cents(103)]],
    ]),
    ...overrides,
  };
}

/**
 * A ten-seat basis, which is the size this league actually is.
 *
 * The two-seat `basis()` above is enough for the line — a personal line is about
 * one manager — and it is **not** enough for the chalkboard, whose counting
 * family derives *how many teams* from the field. Two seats make half the field
 * one team, which the library refuses on purpose.
 */
function wideBasis(overrides: Partial<StakeBasis> = {}): StakeBasis {
  const seats = Array.from({ length: 10 }, (_, index) => index + 1);
  return basis({
    teamWeeks: 40,
    standings: seats.map((rosterId) =>
      row({
        rosterId,
        managerId: `u${String(rosterId)}`,
        displayName: `M${String(rosterId)}`,
        rank: rosterId,
      }),
    ),
    eligibleUserIds: seats.map((rosterId) => `u${String(rosterId)}`),
    scoresByUser: new Map(
      seats.map((rosterId) => [
        `u${String(rosterId)}`,
        [80, 95, 110, 125].map((points) => cents(points + rosterId * 2)),
      ]),
    ),
    ...overrides,
  });
}

function week(
  teams: { name: string; rosterId: number; points: number; won: boolean | null }[],
  final = true,
): WeekResult {
  return {
    season: 2026,
    week: 5,
    finality: weekFinality({
      seasonFinalizedAt: null,
      // A week closed by the Tuesday job, which is how a live season settles.
      weekFinalizedAt: final ? new Date('2026-11-10T12:00:00Z') : null,
      hasGames: teams.length > 0,
    }),
    teams: teams.map((team) => ({
      rosterId: team.rosterId,
      managerId: `u${String(team.rosterId)}`,
      displayName: team.name,
      pointsCents: cents(team.points),
      won: team.won,
    })),
    /*
     * Consecutive pairs are one game, which is how these fixtures were always
     * written — the list reads `[winner, loser, winner, loser]`. The chalkboard
     * asks about pairings rather than scores, so the pairing has to be in the
     * fixture rather than inferred from a flat list at settlement time.
     */
    games: pairs(teams),
    gameKeys: ['2026-w05-m1'],
  };
}

function pairs(
  teams: { name: string; rosterId: number; points: number; won: boolean | null }[],
): GameResult[] {
  const out: GameResult[] = [];
  for (let index = 0; index + 1 < teams.length; index += 2) {
    const a = teams[index]!;
    const b = teams[index + 1]!;
    const tie = a.won === null && b.won === null;
    const winner = a.won === true ? a : b.won === true ? b : null;
    const loser = a.won === false ? a : b.won === false ? b : null;
    out.push({
      key: `2026-w05-m${String(index / 2 + 1)}`,
      marginCents: Math.abs(cents(a.points) - cents(b.points)),
      tie,
      winner: winner === null ? null : { rosterId: winner.rosterId, displayName: winner.name },
      loser: loser === null ? null : { rosterId: loser.rosterId, displayName: loser.name },
    });
  }
  return out;
}

/* -------------------------------------------------------------------------
 * The shape of the system
 * ---------------------------------------------------------------------- */

describe('one table, one discriminator', () => {
  it('declares exactly the three approved families', () => {
    // `16 §9` names three and only three. A fourth kind is a scope change, not a
    // refactor, and it has to fail here first.
    expect([...STAKE_KINDS].sort()).toEqual(['BOUNTY', 'CHALKBOARD', 'TONYS_LINE']);
  });

  it('maps every variant to exactly one kind', () => {
    for (const variant of Object.values(VARIANTS)) {
      expect(STAKE_KINDS).toContain(kindOfVariant(variant));
    }
    expect(kindOfVariant(VARIANTS.seasonMedian)).toBe('TONYS_LINE');
    expect(kindOfVariant(VARIANTS.weekScore)).toBe('BOUNTY');
    for (const variant of CHALKBOARD_VARIANTS) {
      expect(kindOfVariant(variant)).toBe('CHALKBOARD');
    }
  });

  it('derives a stable key from the season, the week and the variant', () => {
    // Deterministic, so re-authoring is a no-op against `weekly_stakes.stake_key`
    // rather than a second offer to the league.
    expect(stakeKeyFor({ season: 2026, week: 7, variant: VARIANTS.seasonMedian })).toBe(
      '2026-w07-season-median',
    );
    expect(stakeKeyFor({ season: 2026, week: 12, variant: VARIANTS.weekScore })).toBe(
      '2026-w12-week-score',
    );
  });

  it('namespaces every ledger key under the stake', () => {
    const settlement = settlementKeyFor('2026-w07-season-median');
    expect(placementKeyFor(settlement, 'u1')).toBe('stake:2026-w07-season-median:placed:u1');
    expect(payoutKeyFor(settlement, 'u1')).toBe('stake:2026-w07-season-median:payout:u1');
    // Two managers, two keys. A shared key would make the second payout a no-op.
    expect(payoutKeyFor(settlement, 'u1')).not.toBe(payoutKeyFor(settlement, 'u2'));
  });
});

/* -------------------------------------------------------------------------
 * The words
 * ---------------------------------------------------------------------- */

describe('the curated copy', () => {
  it('contains no digit anywhere', () => {
    /*
     * The Slice shipped the opposite once — a quiet week saying *"Five results"*
     * over a board showing four — because a count had been written into curated
     * prose. Every number a manager reads here arrives by substitution from a
     * stored fact, and this is what keeps that true.
     */
    for (const template of houseTemplates()) {
      expect(template, template).not.toMatch(/\d/);
    }
  });

  it('has a claim for every variant', () => {
    for (const variant of Object.values(VARIANTS)) {
      expect(CLAIMS[variant], variant).toBeTruthy();
    }
  });

  it('has a verdict for every outcome the database will allow', () => {
    /*
     * The same table `stake_resolution_matches_kind` enforces in `0010`. A
     * missing key is a silently blank board on the one screen where the answer is
     * the point, so the mapping is asserted rather than assumed total.
     */
    const allowed = [
      ['CHALKBOARD', 'hit'],
      ['CHALKBOARD', 'missed'],
      ['BOUNTY', 'hit'],
      ['BOUNTY', 'unclaimed'],
      ['TONYS_LINE', 'settled'],
      ['TONYS_LINE', 'push'],
    ];
    for (const [kind, outcome] of allowed) {
      expect(VERDICTS[`${String(kind)}:${String(outcome)}`], `${String(kind)}:${String(outcome)}`).toBeTruthy();
    }
    expect(Object.keys(VERDICTS)).toHaveLength(allowed.length);
  });

  it('has a line for every entry outcome and every waiting presentation', () => {
    for (const outcome of ['won', 'lost', 'push'] as const) {
      expect(ENTRY_VERDICTS[outcome]).toBeTruthy();
    }
    const waiting: Presentation[] = ['awaiting-week', 'awaiting-final', 'rolling'];
    for (const state of waiting) expect(WAITING[state], state).toBeTruthy();
    // A terminal state has a verdict instead; a waiting line there would be noise.
    for (const state of ['resolved', 'expired', 'void'] as const) {
      expect(WAITING[state]).toBeNull();
    }
  });

  it('refuses to fill a template when a value is missing', () => {
    // A chalkboard reading "Tony has the week at {line}" is worse than a blank
    // one, and it is exactly what a half-populated fact produces.
    expect(fill('Tony has the week at {line}.', { line: '118.44' })).toBe(
      'Tony has the week at 118.44.',
    );
    expect(fill('Tony has the week at {line}.', {})).toBeNull();
  });

  it('never reaches for sportsbook language', () => {
    /*
     * Enforced by the Slice's banned-term scan rather than by taste, and asserted
     * here so the vocabulary is checked even before a stake is rendered. `16 §9`
     * bans win-probability language outright and a market is exactly where it
     * would creep in.
     */
    for (const template of houseTemplates()) {
      expect(template, template).not.toMatch(
        /\bodds\b|\bwin probability\b|\blikely\b|\bfavou?rite to\b|\bon pace for\b|\bvig\b|\bjuice\b/i,
      );
    }
  });

  it('quotes nobody', () => {
    for (const template of houseTemplates()) {
      expect(template, template).not.toMatch(/["“”]/);
    }
  });
});

/* -------------------------------------------------------------------------
 * The basis
 * ---------------------------------------------------------------------- */

describe('the season median', () => {
  it('is an order statistic, never an average', () => {
    /*
     * The lower median **is** one of the season's scores, so the number a manager
     * is asked about is one somebody actually posted — and it is exact in integer
     * cents with no rounding question. An averaged median of an even count lands
     * between two real scores.
     */
    expect(lowerMedian([1, 2, 3, 4])).toBe(2);
    expect(lowerMedian([1, 2, 3])).toBe(2);
    expect(lowerMedian([5])).toBe(5);
    expect(lowerMedian([])).toBeNull();
  });
});

/* -------------------------------------------------------------------------
 * Authoring
 * ---------------------------------------------------------------------- */

describe('authoring Tony’s Line — personal, one per manager', () => {
  const lines = (over: Partial<StakeBasis> = {}) =>
    authorTonysLines(basis(over), PROVISIONAL_ECONOMY);

  it('authors one stake per seat, each belonging to that manager alone', () => {
    /*
     * The authorization boundary, at the layer that creates it. `placeEntry`
     * refuses anybody outside this snapshot and
     * `stake_entries_only_the_offered_may_enter` refuses them again in the
     * database — but both read *this* array, so a week that authored the whole
     * league into it would open every line to everybody.
     */
    const { authored } = lines();

    expect(authored).toHaveLength(2);
    expect(authored.map((stake) => stake.eligibleUserIds)).toEqual([['u1'], ['u2']]);
    expect(authored.every((stake) => stake.kind === 'TONYS_LINE')).toBe(true);
  });

  it('gives a strong manager a higher line than a weak one', () => {
    // The whole point of the 2026-08-12 ruling: a line that is about your team.
    const { authored } = lines();
    const [alex, nick] = authored;

    expect(Number(alex!.factRefs.values['line'])).toBeGreaterThan(
      Number(nick!.factRefs.values['line']),
    );
  });

  it('shrinks toward the league, so a thin sample cannot run away with the number', () => {
    /*
     * The approved formula, checked arithmetically rather than by eye.
     *
     * `u1`'s own median of 112/118/124/131 is 121.00 and the league median
     * across both managers' eight scores is (103 + 112) / 2 = 107.50. At n=4 the
     * weight is 4/8, so the line is 114.25 — hung on the half at 114.50, which
     * sits strictly between their own median and the league's. A formula that
     * ignored the shrinkage would print 121.50.
     */
    const { authored } = lines();
    const alex = authored[0]!;

    expect(alex.factRefs.values['line']).toBe('114.50');
  });

  it('always hangs the line on the half, so a push is impossible', () => {
    const { authored } = lines();
    for (const stake of authored) {
      expect(stake.factRefs.values['line'], stake.stakeKey).toMatch(/\.50$/);
    }
  });

  it('gives each stake its own key, so ten of them survive re-authoring', () => {
    /*
     * `stake_key` is UNIQUE and is what makes a second authoring pass a no-op.
     * A week-level key would have collapsed all ten personal lines into whichever
     * was written first — the defect this seat suffix exists to prevent.
     */
    const { authored } = lines();
    const keys = authored.map((stake) => stake.stakeKey);

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys[0]).toMatch(/-r1$/);
    expect(keys[1]).toMatch(/-r2$/);
  });

  it('is repeatable — the same basis authors byte-identical stakes', () => {
    expect(lines()).toEqual(lines());
  });

  it('names exactly the manager it belongs to, and nobody else', () => {
    const { authored } = lines();
    expect(authored[0]!.allowedNames).toEqual(['Alex']);
    expect(authored[1]!.allowedNames).toEqual(['Nick']);
  });

  it('carries the explainer’s counts in its frozen terms', () => {
    /*
     * Frozen at authoring rather than recomputed at render, so the number a
     * manager took a side on and the sentence explaining it can never drift
     * apart. `u1` cleared 114.50 in three of their four scores.
     */
    const alex = lines().authored[0]!;

    expect(alex.factRefs.values['cleared']).toBe('3');
    expect(alex.factRefs.values['clearedOf']).toBe('4');
    // And the counts are declared, so the sentence may print them.
    expect(alex.allowedNumbers).toContain('3');
    expect(alex.allowedNumbers).toContain('4');
  });

  it('uses a truthful shorter window rather than fabricating six games', () => {
    // The commissioner's rule: never pad to six. Four played is "of your last 4".
    expect(lines().authored[0]!.factRefs.values['clearedOf']).toBe('4');
  });

  it('pays exactly double, unchanged by the redesign', () => {
    // `16 §9` fixes the payout at 2x and `weekly_stakes_line_pays_double`
    // enforces it. The 2026-08-12 ruling changed what the line measures and
    // explicitly nothing about the wager.
    const alex = lines().authored[0]!;

    expect(alex.stakeTokens).toBe(PROVISIONAL_ECONOMY.weeklyLineStakeTokens);
    expect(alex.rewardTokens).toBe(PROVISIONAL_ECONOMY.weeklyLineStakeTokens * 2);
    expect(alex.expiresAfterWeek).toBeNull();
  });

  it('refuses a manager with too little of their own history', () => {
    /*
     * Three of their own team-weeks, which puts the first line in week 4. `u2`
     * has two here and is simply not priced; `u1` still is, because the floor is
     * per manager rather than per league.
     */
    const { authored } = lines({
      scoresByUser: new Map([
        ['u1', [cents(112), cents(118), cents(124), cents(131)]],
        ['u2', [cents(84), cents(91)]],
      ]),
    });

    expect(authored).toHaveLength(1);
    expect(authored[0]!.eligibleUserIds).toEqual(['u1']);
  });

  it('refuses everything when nobody has enough history', () => {
    const { authored, refusal } = lines({ scoresByUser: new Map() });

    expect(authored).toEqual([]);
    expect(refusal).toBe('thin-basis');
  });

  it('refuses when nobody is eligible', () => {
    expect(lines({ eligibleUserIds: [], standings: [] }).refusal).toBe('nobody-eligible');
  });

  it('only reads weeks before its own', () => {
    // The whole reason a line is a claim about the future rather than a
    // restatement of the past.
    for (const stake of lines().authored) {
      for (const basisWeek of stake.factRefs.basisWeeks) {
        expect(basisWeek).toBeLessThan(stake.week);
      }
    }
  });
});

describe('authoring a bounty', () => {
  it('targets a score somebody really posted, and names them', () => {
    const authored = authorBounty(basis(), PROVISIONAL_ECONOMY);
    if (typeof authored === 'string') throw new Error(authored);

    expect(authored.kind).toBe('BOUNTY');
    expect(authored.factRefs.values['target']).toBe('171.16');
    expect(authored.allowedNames).toEqual(['Brandon']);
    expect(authored.stakeTokens).toBeNull();
    expect(authored.rewardTokens).toBe(PROVISIONAL_ECONOMY.bountyRewardTokens);
  });

  it('rolls for a stated number of weeks and then expires', () => {
    const authored = authorBounty(basis({ week: 5 }), PROVISIONAL_ECONOMY);
    if (typeof authored === 'string') throw new Error(authored);
    expect(authored.expiresAfterWeek).toBe(5 + BOUNTY_ROLL_WEEKS - 1);
  });
});

describe('authoring the chalkboard', () => {
  it('is drawn from the approved library and nothing else', () => {
    /*
     * The three retired variants are still resolvable — a stored stake has to go
     * on meaning what it meant — and nothing may author one again.
     */
    const authored = authorChalkboard(basis(), PROVISIONAL_ECONOMY);
    if (typeof authored === 'string') throw new Error(authored);

    expect(CHALKBOARD_VARIANTS).toContain(authored.variant);
    expect(RETIRED_CHALKBOARD_VARIANTS).not.toContain(authored.variant);
    expect(authored.kind).toBe('CHALKBOARD');
  });

  it('is watch-only: no stake, no reward, nobody singled out', () => {
    /*
     * Ruling 6. The Chalkboard is the league watching Tony make one call, and a
     * second weekly token market would change the economy assumptions the P3
     * simulation was run against.
     */
    for (const week of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const authored = authorChalkboard(basis({ week }), PROVISIONAL_ECONOMY);
      if (typeof authored === 'string') throw new Error(authored);
      expect(authored.stakeTokens, `week ${String(week)}`).toBeNull();
      expect(authored.rewardTokens, `week ${String(week)}`).toBeNull();
      expect(authored.allowedNames, `week ${String(week)}`).toEqual([]);
    }
  });

  it('rotates, so the same question is not asked every week', () => {
    const asked = [3, 4, 5, 6, 7].map((week) => {
      const authored = authorChalkboard(wideBasis({ week }), PROVISIONAL_ECONOMY);
      if (typeof authored === 'string') throw new Error(authored);
      return authored.variant;
    });

    // Four families, five weeks: every family appears, and the cycle comes round.
    expect(new Set(asked).size).toBe(CHALKBOARD_VARIANTS.length);
    expect(asked[4]).toBe(asked[0]);
  });

  it('is the same question on the same week, every time it is asked', () => {
    const once = authorChalkboard(basis({ week: 6 }), PROVISIONAL_ECONOMY);
    const twice = authorChalkboard(basis({ week: 6 }), PROVISIONAL_ECONOMY);
    expect(once).toEqual(twice);
  });

  it('does not ask the same question two weeks running', () => {
    const first = authorChalkboard(basis({ week: 5 }), PROVISIONAL_ECONOMY);
    if (typeof first === 'string') throw new Error(first);

    const again = authorChalkboard(basis({ week: 5 }), PROVISIONAL_ECONOMY, first.variant);
    if (typeof again === 'string') throw new Error(again);
    expect(again.variant).not.toBe(first.variant);
  });

  it('reorders, and never silences', () => {
    /*
     * The Slice made this mistake once: novelty subtracted before the floors, and
     * a week printed *"a quiet week at the shop"* above a fifty-one-point win. In
     * week one only the two history-free families can be calibrated, so asking it
     * not to repeat one of them must still produce the other rather than silence.
     */
    const cold = basis({ week: 1, basisWeeks: [], scoresByUser: new Map() });
    const authored = authorChalkboard(cold, PROVISIONAL_ECONOMY, VARIANTS.photoFinish);
    if (typeof authored === 'string') throw new Error(authored);
    expect(authored.variant).toBe(VARIANTS.aHiding);

    const onlyOne = authorChalkboard(cold, PROVISIONAL_ECONOMY, VARIANTS.aHiding);
    if (typeof onlyOne === 'string') throw new Error(onlyOne);
    expect(onlyOne.variant).toBe(VARIANTS.photoFinish);
  });

  it('has something to say in week one, before any history exists', () => {
    /*
     * Ruling 7's *"preserve the two history-free proposition families"*. A board
     * that is blank for the first fortnight of the league's first real season is
     * a feature nobody meets.
     */
    for (const week of [1, 2]) {
      const authored = authorChalkboard(
        basis({ week, basisWeeks: [], teamWeeks: 0, scoresByUser: new Map() }),
        PROVISIONAL_ECONOMY,
      );
      if (typeof authored === 'string') throw new Error(authored);
      const proposition = propositionFor(authored.variant);
      expect(proposition?.needsHistory, `week ${String(week)}`).toBe(false);
    }
  });

  it('refuses when there is nobody to say it to', () => {
    expect(authorChalkboard(basis({ eligibleUserIds: [] }), PROVISIONAL_ECONOMY)).toBe(
      'nobody-eligible',
    );
  });
});

describe('the proposition library', () => {
  it('calibrates every family from stored scores alone', () => {
    const league = leagueScores(wideBasis());
    for (const proposition of LIBRARY) {
      const calibrated = proposition.calibrate({ leagueScores: league, basisWeeks: 4 });
      expect(calibrated, proposition.variant).not.toBeNull();
      expect(Object.keys(calibrated?.values ?? {}).length, proposition.variant).toBeGreaterThan(0);
      // Every printable number is declared, so the validator can see all of it.
      for (const written of calibrated?.numbers ?? []) {
        expect(Object.values(calibrated?.values ?? {}), proposition.variant).toContain(written);
      }
    }
  });

  it('refuses a calibrated threshold before there is a sample to calibrate from', () => {
    for (const proposition of LIBRARY.filter((entry) => entry.needsHistory)) {
      expect(
        proposition.calibrate({ leagueScores: [], basisWeeks: 0 }),
        proposition.variant,
      ).toBeNull();
      expect(
        proposition.calibrate({ leagueScores: [11_000, 12_000], basisWeeks: 1 }),
        proposition.variant,
      ).toBeNull();
    }
  });

  it('prices the settings that were calibrated against the real pipeline', () => {
    /*
     * The 96th percentile, the median, ten points and forty-five points — the
     * settings re-derived through `WeekResult` after the investigation's numbers
     * turned out to have been measured on ten-team weeks the product never sees.
     * Pinned against a sample whose order statistics are checkable by hand: a
     * hundred and one scores from 80.00 in steps of a point.
     */
    const sample = Array.from({ length: 101 }, (_, index) => 8_000 + index * 100);
    const basisOf = (variant: Variant): Calibration | null =>
      propositionFor(variant)?.calibrate({ leagueScores: sample, basisWeeks: 10 }) ?? null;

    expect(basisOf(VARIANTS.anybodyBreaks)?.values['line']).toBe('176.00'); // the 96th of 101
    expect(basisOf(VARIANTS.halfOver)?.values['line']).toBe('130.00'); // the 50th of 101
    expect(basisOf(VARIANTS.photoFinish)?.values['margin']).toBe('10.00');
    expect(basisOf(VARIANTS.aHiding)?.values['margin']).toBe('45.00');
  });

  it('asks for half the field, whatever size the field is', () => {
    /*
     * The defect the investigation shipped, guarded. *"Four teams over the
     * number"* is an even question in an eight-team week and an easy YES in a
     * ten-team one, because four of ten clearing a median is far likelier than
     * four of eight. The count follows the field, from the basis's own counts.
     */
    const askedOf = (seats: number): string | undefined =>
      propositionFor(VARIANTS.halfOver)?.calibrate({
        leagueScores: Array.from({ length: seats * 5 }, (_, index) => 8_000 + index * 100),
        basisWeeks: 5,
      })?.values['teams'];

    expect(askedOf(8)).toBe('4');
    expect(askedOf(10)).toBe('5');
    expect(askedOf(12)).toBe('6');
  });

  it('will not ask a question about a field too small to halve', () => {
    // Half of two seats is one, and *"one team over the median"* is not a call.
    expect(
      propositionFor(VARIANTS.halfOver)?.calibrate({
        leagueScores: [10_000, 11_000, 12_000, 13_000],
        basisWeeks: 2,
      }),
    ).toBeNull();
  });

  it('takes its number from the real sample rather than between two scores', () => {
    // Nearest-rank: the number Tony writes up is a score somebody really posted.
    const sample = [10_000, 11_000, 12_000, 13_000];
    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      expect(sample).toContain(percentileOf(sample, fraction));
    }
  });

  it('resolves every family from finalized matchups and nothing else', () => {
    /*
     * The dependency check the ruling asks for, made mechanical: a proposition
     * that needed a schedule, a projection or a player would have to reach for
     * something `WeekResult` does not carry, and `WeekResult` carries scores,
     * pairings, margins and finality.
     */
    const played = week([
      { name: 'Nick', rosterId: 1, points: 130, won: true },
      { name: 'Alex', rosterId: 2, points: 128, won: false },
      { name: 'Joe', rosterId: 3, points: 145, won: true },
      { name: 'Ryan', rosterId: 4, points: 80, won: false },
    ]);

    for (const proposition of LIBRARY) {
      const calibrated = proposition.calibrate({
        leagueScores: leagueScores(wideBasis()),
        basisWeeks: 4,
      });
      const settlement = proposition.settle(calibrated?.values ?? {}, played);
      expect(settlement, proposition.variant).not.toBeNull();
      expect(typeof settlement?.happened, proposition.variant).toBe('boolean');
      expect(EVIDENCE[settlement?.statementKey ?? ''], proposition.variant).toBeDefined();
    }
  });
});

describe('authoring a week', () => {
  it('authors no market while the flag is shut', () => {
    const report = authorWeek({
      basis: basis(),
      economy: PROVISIONAL_ECONOMY,
      lineOpen: false,
      bountyRolling: false,
    });
    expect(report.authored.some((stake) => stake.kind === 'TONYS_LINE')).toBe(false);
    expect(report.authored.some((stake) => stake.kind === 'BOUNTY')).toBe(true);
  });

  it('authors no second bounty while one is rolling', () => {
    const report = authorWeek({
      basis: basis(),
      economy: PROVISIONAL_ECONOMY,
      lineOpen: true,
      bountyRolling: true,
    });
    expect(report.authored.some((stake) => stake.kind === 'BOUNTY')).toBe(false);
  });

  it('records what it refused, and why', () => {
    /*
     * A build log that only records successes cannot answer the question a quiet
     * chalkboard raises.
     *
     * Week 2, and nobody has played `MIN_OWN_TEAM_WEEKS` yet — which is the
     * condition a personal line refuses on, and it is reported under the same
     * word the league-wide version used so the Tuesday log reads unchanged.
     */
    const report = authorWeek({
      basis: basis({
        week: 2,
        basisWeeks: [1],
        teamWeeks: 10,
        scoresByUser: new Map([
          ['u1', [cents(112)]],
          ['u2', [cents(84)]],
        ]),
      }),
      economy: PROVISIONAL_ECONOMY,
      lineOpen: true,
      bountyRolling: false,
    });
    expect(report.refused).toContainEqual({ variant: VARIANTS.seasonMedian, why: 'thin-basis' });
    expect(report.authored.some((stake) => stake.kind === 'TONYS_LINE')).toBe(false);
  });

  it('changes its version when the rules or the numbers change', () => {
    const before = authorVersion(PROVISIONAL_ECONOMY);
    const after = authorVersion({ ...PROVISIONAL_ECONOMY, weeklyLineStakeTokens: 25 as 10 });
    expect(after).not.toBe(before);
    // Stable for the same inputs, so re-authoring is a no-op rather than a churn.
    expect(authorVersion(PROVISIONAL_ECONOMY)).toBe(before);
  });
});

describe('the basis floor', () => {
  it('is stated rather than implied', () => {
    expect(MIN_BASIS_TEAM_WEEKS).toBeGreaterThanOrEqual(12);
  });
});

/* -------------------------------------------------------------------------
 * Resolution
 * ---------------------------------------------------------------------- */

const refs = (values: Record<string, string>): FactRefs => ({
  basisWeeks: [1, 2],
  gameKeys: [],
  values,
});

/*
 * A line's facts are the personal ones: whose team total it is, the number, and
 * the frozen window the explainer counts over. All four are written at authoring
 * and none is recomputed at render time.
 */
const lineRefs = refs({ line: '118.44', subject: 'Alex', cleared: '4', clearedOf: '6' });
const bountyRefs = refs({ target: '171.16' });
const recordRefs = refs({ record: '171.16' });
const leaderRefs = refs({ subject: 'Nick', rosterId: '1', wins: '4', losses: '1' });

describe('resolution refuses anything that is not final', () => {
  it('refuses an open season outright', () => {
    /*
     * The expensive question. A stake settled from a number that later moves has
     * moved tokens on a fact that stopped being true — and `16 §12` records four
     * rosters whose 2024 standings and weekly points disagree because stat
     * corrections kept landing after the season closed.
     */
    const result = resolveStake({
      variant: VARIANTS.seasonMedian,
      factRefs: lineRefs,
      week: week([{ name: 'Nick', rosterId: 1, points: 130, won: true }], false),
    });
    expect(result).toEqual({ settled: false, why: 'not-final' });
  });

  it('refuses a week nobody played', () => {
    const result = resolveStake({
      variant: VARIANTS.seasonMedian,
      factRefs: lineRefs,
      week: week([]),
    });
    expect(result.settled).toBe(false);
  });

  it('refuses facts its resolver cannot read', () => {
    const result = resolveStake({
      variant: VARIANTS.seasonMedian,
      factRefs: { basisWeeks: [], gameKeys: [], values: {} },
      week: week([{ name: 'Nick', rosterId: 1, points: 130, won: true }]),
    });
    expect(result).toEqual({ settled: false, why: 'incomplete-facts' });
  });
});

describe('resolving Tony’s Line', () => {
  /* The line's own manager. `lineRefs` is Alex's, on roster 1. */
  const alexRefs = refs({ ...lineRefs.values, rosterId: '1' });

  it('settles against the manager whose line it is, and nobody else', () => {
    const result = resolveStake({
      variant: VARIANTS.seasonMedian,
      factRefs: alexRefs,
      week: week([
        { name: 'Alex', rosterId: 1, points: 130, won: true },
        { name: 'Ryan', rosterId: 2, points: 100, won: false },
      ]),
    });
    if (!result.settled) throw new Error(result.why);
    expect(result.outcome).toBe('settled');
    expect(result.evidence.values['subject']).toBe('Alex');
    expect(result.evidence.values['scored']).toBe('130.00');
    expect(result.evidence.statement).toContain('118.44');
    /*
     * The league-wide split is gone, and its absence is the point. Nine other
     * managers being above somebody else's number says nothing about whether
     * this one cleared their own.
     */
    expect(result.evidence.values['over']).toBeUndefined();
    expect(result.evidence.values['under']).toBeUndefined();
  });

  it('pushes when the manager lands exactly on their number', () => {
    const result = resolveStake({
      variant: VARIANTS.seasonMedian,
      factRefs: alexRefs,
      week: week([
        { name: 'Alex', rosterId: 1, points: 118.44, won: null },
        { name: 'Ryan', rosterId: 2, points: 118.44, won: null },
      ]),
    });
    if (!result.settled) throw new Error(result.why);
    expect(result.outcome).toBe('push');
  });

  it('is unmoved by what everybody else did', () => {
    /*
     * The strongest available statement of *personal*: the subject's own score
     * is held constant and the rest of the league is inverted around it. The
     * old resolver counted the field, so this pair disagreed.
     */
    const settle = (others: number): ReturnType<typeof resolveStake> =>
      resolveStake({
        variant: VARIANTS.seasonMedian,
        factRefs: alexRefs,
        week: week([
          { name: 'Alex', rosterId: 1, points: 100, won: false },
          { name: 'Ryan', rosterId: 2, points: others, won: true },
        ]),
      });

    const low = settle(60);
    const high = settle(190);
    if (!low.settled || !high.settled) throw new Error('did not settle');
    expect(low.outcome).toBe(high.outcome);
    expect(low.evidence.statement).toBe(high.evidence.statement);
  });

  it('hands the stake back when the manager had no game', () => {
    /*
     * Settled as a push rather than refused. A prediction nobody paid for can sit
     * open; a market cannot, because the tokens are already spent and the week
     * will never produce an answer.
     */
    const result = resolveStake({
      variant: VARIANTS.seasonMedian,
      factRefs: alexRefs,
      week: week([
        { name: 'Nick', rosterId: 8, points: 130, won: true },
        { name: 'Ryan', rosterId: 9, points: 100, won: false },
      ]),
    });
    if (!result.settled) throw new Error(result.why);
    expect(result.outcome).toBe('push');
    expect(result.evidence.statementKey).toBe('line-no-game');
  });

  it('refuses a line whose terms do not say whose it is', () => {
    const result = resolveStake({
      variant: VARIANTS.seasonMedian,
      factRefs: refs({ line: '118.44' }),
      week: week([{ name: 'Alex', rosterId: 1, points: 130, won: true }]),
    });
    expect(result.settled).toBe(false);
  });
});

describe('resolving a bounty', () => {
  it('is claimed by the highest score past the target', () => {
    const result = resolveStake({
      variant: VARIANTS.weekScore,
      factRefs: bountyRefs,
      week: week([
        { name: 'Nick', rosterId: 1, points: 175, won: true },
        { name: 'Ryan', rosterId: 2, points: 180, won: true },
      ]),
      expiresAfterWeek: 9,
    });
    if (!result.settled) throw new Error(result.why);
    expect(result.outcome).toBe('hit');
    expect(result.evidence.values['claimant']).toBe('Ryan');
    expect(result.evidence.values['scored']).toBe('180.00');
  });

  it('breaks an exact tie by roster id rather than by query order', () => {
    // It has never happened in this league's recorded history, and the rule has
    // to exist anyway: the alternative is a claim decided by whatever came back
    // first.
    const result = resolveStake({
      variant: VARIANTS.weekScore,
      factRefs: bountyRefs,
      week: week([
        { name: 'Later', rosterId: 7, points: 180, won: true },
        { name: 'Earlier', rosterId: 2, points: 180, won: true },
      ]),
      expiresAfterWeek: 9,
    });
    if (!result.settled) throw new Error(result.why);
    expect(result.evidence.values['claimant']).toBe('Earlier');
  });

  it('rolls while the window is open, and expires when it closes', () => {
    const short = week([{ name: 'Nick', rosterId: 1, points: 120, won: true }]);

    expect(
      resolveStake({
        variant: VARIANTS.weekScore,
        factRefs: bountyRefs,
        week: short,
        expiresAfterWeek: 9,
      }),
    ).toEqual({ settled: false, why: 'still-rolling' });

    const closed = resolveStake({
      variant: VARIANTS.weekScore,
      factRefs: bountyRefs,
      week: short,
      expiresAfterWeek: 5,
    });
    if (!closed.settled) throw new Error(closed.why);
    expect(closed.outcome).toBe('unclaimed');
  });

  it('does not award a bounty for equalling the target', () => {
    // "Beat" is the word on the board. Equalling is not beating.
    expect(
      resolveStake({
        variant: VARIANTS.weekScore,
        factRefs: bountyRefs,
        week: week([{ name: 'Nick', rosterId: 1, points: 171.16, won: true }]),
        expiresAfterWeek: 9,
      }),
    ).toEqual({ settled: false, why: 'still-rolling' });
  });
});

describe('resolving a prediction', () => {
  it('stands when nobody clears the record', () => {
    const result = resolveStake({
      variant: VARIANTS.nobodyClearsRecord,
      factRefs: recordRefs,
      week: week([{ name: 'Nick', rosterId: 1, points: 140, won: true }]),
    });
    if (!result.settled) throw new Error(result.why);
    expect(result.outcome).toBe('hit');
  });

  it('falls when somebody does', () => {
    const result = resolveStake({
      variant: VARIANTS.nobodyClearsRecord,
      factRefs: recordRefs,
      week: week([{ name: 'Nick', rosterId: 1, points: 190, won: true }]),
    });
    if (!result.settled) throw new Error(result.why);
    expect(result.outcome).toBe('missed');
    expect(result.evidence.values['subject']).toBe('Nick');
  });

  it('counts a tie as a miss, both ways', () => {
    /*
     * Tony said somebody would win, or that somebody would lose. Neither
     * happened. Scoring a tie as a hit would be the resolver quietly widening the
     * claim after the fact, which is the one move a settlement layer must never
     * be able to make.
     */
    for (const variant of [VARIANTS.leaderHolds, VARIANTS.bottomClubLoses]) {
      const result = resolveStake({
        variant,
        factRefs: leaderRefs,
        week: week([{ name: 'Nick', rosterId: 1, points: 120, won: null }]),
      });
      if (!result.settled) throw new Error(result.why);
      expect(result.outcome, variant).toBe('missed');
      expect(result.evidence.values['result']).toBe('tied');
    }
  });

  it('stays open when its subject did not play a publishable game', () => {
    // A bye, or a week whose game was suppressed. Not a miss.
    expect(
      resolveStake({
        variant: VARIANTS.leaderHolds,
        factRefs: leaderRefs,
        week: week([{ name: 'Somebody', rosterId: 9, points: 120, won: true }]),
      }),
    ).toEqual({ settled: false, why: 'subject-did-not-play' });
  });
});

/* -------------------------------------------------------------------------
 * Scoring a pick
 * ---------------------------------------------------------------------- */

describe('scoring one manager’s pick', () => {
  const args = { stakedTokens: 10, rewardTokens: 20, lineCents: cents(118.44) };

  it('pays double for the right side', () => {
    expect(settleEntry({ ...args, side: 'over', team: { pointsCents: cents(130) } })).toEqual({
      outcome: 'won',
      payoutTokens: 20,
    });
    expect(settleEntry({ ...args, side: 'under', team: { pointsCents: cents(100) } })).toEqual({
      outcome: 'won',
      payoutTokens: 20,
    });
  });

  it('pays nothing for the wrong one', () => {
    expect(settleEntry({ ...args, side: 'under', team: { pointsCents: cents(130) } })).toEqual({
      outcome: 'lost',
      payoutTokens: 0,
    });
  });

  it('returns the stake on the number exactly', () => {
    /*
     * The line is a real score to the cent, so landing on it is possible — and
     * either verdict would be the house inventing a tiebreak for or against
     * itself.
     */
    expect(settleEntry({ ...args, side: 'over', team: { pointsCents: cents(118.44) } })).toEqual({
      outcome: 'push',
      payoutTokens: 10,
    });
  });

  it('returns the stake to a manager who had no game', () => {
    // They were charged for a market they were never given a chance to win.
    expect(settleEntry({ ...args, side: 'over', team: null })).toEqual({
      outcome: 'push',
      payoutTokens: 10,
    });
  });
});

/* -------------------------------------------------------------------------
 * Rendering
 * ---------------------------------------------------------------------- */

function stake(overrides: Partial<Stake> = {}): Stake {
  return {
    id: 's1',
    seasonId: 'season',
    season: 2026,
    week: 5,
    kind: 'TONYS_LINE',
    stakeKey: '2026-w05-season-median',
    status: 'open',
    variant: VARIANTS.seasonMedian,
    eligibleUserIds: ['u1'],
    factRefs: lineRefs,
    allowedNumbers: ['10', '118.44', '2026', '20', '4', '5', '6'],
    allowedNames: ['Alex'],
    authorVersion: 'v',
    stakeTokens: 10,
    rewardTokens: 20,
    expiresAfterWeek: null,
    settlementKey: 'stake:2026-w05-season-median',
    voidReason: null,
    ...overrides,
  };
}

describe('rendering a stake', () => {
  it('writes the claim from the stake’s own facts', () => {
    const copy = renderStake({ stake: stake(), resolution: null, presentation: 'awaiting-week' });
    expect(copy?.line).toContain('118.44');
    expect(copy?.verdict).toBeNull();
  });

  it('refuses a number the stake never declared', () => {
    /*
     * The gate the whole layer exists for, and it is the Slice's validator rather
     * than a second implementation of it. A renderer that reached past the stake's
     * declared set is refused, and the board goes quiet.
     */
    const copy = renderStake({
      stake: stake({ allowedNumbers: ['2026', '5'] }),
      resolution: null,
      presentation: 'awaiting-week',
    });
    expect(copy).toBeNull();
  });

  it('refuses a settled stake whose outcome has no verdict copy', () => {
    const copy = renderStake({
      stake: stake(),
      resolution: {
        // Not a legal outcome for this kind; the database would refuse it too.
        outcome: 'hit',
        resolvedWeek: 5,
        claimedByUserId: null,
        evidence: { statementKey: 'line-settled', statement: '', gameKeys: [], values: {} },
        resolvedAt: new Date('2026-01-06T00:00:00Z'),
      },
      presentation: 'resolved',
    });
    expect(copy).toBeNull();
  });

  it('carries the evidence, and admits only the values it declared', () => {
    const copy = renderStake({
      stake: stake(),
      resolution: {
        outcome: 'settled',
        resolvedWeek: 5,
        claimedByUserId: null,
        evidence: {
          statementKey: 'line-settled',
          statement: fill(EVIDENCE['line-settled'] ?? '', {
            subject: 'Alex',
            scored: '130.00',
            line: '118.44',
          })!,
          gameKeys: [],
          /*
           * `130.00` is a number the *stake* never declared — it is a fact about
           * the week rather than about the offer — and it is admitted from the
           * resolution's own stored values. That is the discipline the bounty's
           * claimant goes through, and it is what keeps the useful question
           * useful: *did the prose introduce something the fact did not supply?*
           */
          values: { subject: 'Alex', scored: '130.00', line: '118.44' },
        },
        resolvedAt: new Date('2026-01-06T00:00:00Z'),
      },
      presentation: 'resolved',
    });
    expect(copy?.verdict).toBe(VERDICTS['TONYS_LINE:settled']);
    expect(copy?.evidence).toContain('130.00');
  });
});

/* -------------------------------------------------------------------------
 * Finality
 * ---------------------------------------------------------------------- */

describe('week finality', () => {
  it('is never final until something closed it', () => {
    expect(
      weekFinality({ seasonFinalizedAt: null, weekFinalizedAt: null, hasGames: true }),
    ).toEqual({ final: false, reason: 'not-finalized', source: null });
  });

  it('is never final for a week nobody played', () => {
    expect(
      weekFinality({ seasonFinalizedAt: FIXED, weekFinalizedAt: null, hasGames: false }),
    ).toEqual({ final: false, reason: 'no-games', source: null });
  });

  it('is final for a played week of a closed season', () => {
    expect(
      weekFinality({ seasonFinalizedAt: FIXED, weekFinalizedAt: null, hasGames: true }),
    ).toEqual({ final: true, reason: null, source: 'season_closed' });
  });

  it('is final for a week the Tuesday job closed, while the season runs on', () => {
    /*
     * The case that makes the whole loop possible. `apply_token_delta` refuses a
     * finalized season, so a stake that could only settle after the season closed
     * could never pay anybody — settleable exactly when unpayable.
     */
    expect(
      weekFinality({ seasonFinalizedAt: null, weekFinalizedAt: FIXED, hasGames: true }),
    ).toEqual({ final: true, reason: null, source: 'finalized_week' });
  });

  it('prefers the week’s own closing over the season’s', () => {
    // The narrower and earlier claim. A stored resolution says which it used.
    expect(
      weekFinality({
        seasonFinalizedAt: FIXED,
        weekFinalizedAt: FIXED,
        hasGames: true,
      }).source,
    ).toBe('finalized_week');
  });
});

/* -------------------------------------------------------------------------
 * The variant set
 * ---------------------------------------------------------------------- */

describe('machinery never becomes prose', () => {
  it('keeps an id out of what a renderer is allowed to print', () => {
    /*
     * A bounty's resolution stores `claimantId` so the payout points at a row
     * rather than at a display string — one rename away from paying nobody
     * otherwise. That id is machinery. It must not join the allowed sets, or a
     * UUID becomes a thing the validator would let through.
     */
    const copy = renderStake({
      stake: stake({
        kind: 'BOUNTY',
        variant: VARIANTS.weekScore,
        // `holder` as well as `target`: the bounty's claim names who set it, and
        // a template that cannot fill refuses rather than printing a brace.
        factRefs: refs({ target: '171.16', holder: 'Brandon' }),
        allowedNumbers: ['100', '171.16', '2026', '5'],
        allowedNames: ['Brandon'],
        stakeTokens: null,
        rewardTokens: 100,
      }),
      resolution: {
        outcome: 'hit',
        resolvedWeek: 5,
        claimedByUserId: '7d2c1a3e-9f4b-4c8a-9e1d-2b3c4d5e6f70',
        evidence: {
          statementKey: 'bounty-claimed',
          statement: 'Nick put up 180.00 in week 5, past 171.16.',
          gameKeys: [],
          values: {
            target: '171.16',
            scored: '180.00',
            week: '5',
            claimant: 'Nick',
            claimantId: '7d2c1a3e-9f4b-4c8a-9e1d-2b3c4d5e6f70',
          },
        },
        resolvedAt: FIXED,
      },
      presentation: 'resolved',
    });

    expect(copy?.evidence).toContain('180.00');

    const packet = packetFor(stake(), []);
    expect(packet.allowedNumbers.join(' ')).not.toContain('7d2c1a3e');
    expect(packet.allowedNames.join(' ')).not.toContain('7d2c1a3e');
  });
});

describe('a stake id from a browser is answered, never crashed on', () => {
  it('recognises a real id and refuses anything else', () => {
    /*
     * `eq(weeklyStakes.id, 'preview:2025-w09-season-median')` raises *invalid
     * input syntax for type uuid* inside Postgres, which reaches the browser as a
     * 500 and a full-page `Application error`. Found by building the demo state
     * for the market's error affordance: tapping OVER on a previewed board took
     * the whole page down, so the screenshot of *"how does a refusal look"* was a
     * server exception.
     *
     * The pattern is asserted here rather than only in the action, because the
     * rule is *anything a client can send comes back as an answer*, and that is
     * worth stating where somebody adding a second id-taking action will read it.
     */
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    expect(UUID.test('7d2c1a3e-9f4b-4c8a-9e1d-2b3c4d5e6f70')).toBe(true);
    for (const bad of [
      'preview:2025-w09-season-median',
      '',
      'null',
      "'; drop table weekly_stakes; --",
      '7d2c1a3e-9f4b-4c8a-9e1d-2b3c4d5e6f7',
    ]) {
      expect(UUID.test(bad), bad).toBe(false);
    }
  });
});

describe('every variant has a resolver', () => {
  it('resolves, or refuses with a reason, for all of them', () => {
    /*
     * Exhaustiveness at runtime as well as at compile time. `resolveStake`'s
     * switch is total over `Variant`, and a variant added to the union without a
     * case would fail to compile — but a variant added as a plain string would
     * not, and would fall out of the switch as `undefined`.
     */
    const played = week([
      { name: 'Nick', rosterId: 1, points: 130, won: true },
      { name: 'Alex', rosterId: 2, points: 120, won: false },
    ]);
    const byVariant: Record<Variant, FactRefs> = {
      [VARIANTS.seasonMedian]: refs({ ...lineRefs.values, rosterId: '1', subject: 'Nick' }),
      [VARIANTS.weekScore]: bountyRefs,
      [VARIANTS.nobodyClearsRecord]: recordRefs,
      [VARIANTS.leaderHolds]: leaderRefs,
      [VARIANTS.bottomClubLoses]: leaderRefs,
      [VARIANTS.anybodyBreaks]: refs({ line: '140.00' }),
      [VARIANTS.photoFinish]: refs({ margin: '6.00' }),
      [VARIANTS.halfOver]: refs({ line: '110.00', teams: '1' }),
      [VARIANTS.aHiding]: refs({ margin: '50.00' }),
    };

    for (const variant of Object.values(VARIANTS)) {
      const result = resolveStake({
        variant,
        factRefs: byVariant[variant],
        week: played,
        expiresAfterWeek: 9,
      });
      expect(result, variant).toBeDefined();
      expect(typeof result.settled, variant).toBe('boolean');
    }
  });
});
