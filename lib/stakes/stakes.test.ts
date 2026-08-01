import { describe, expect, it } from 'vitest';

import { PROVISIONAL_ECONOMY } from '@/lib/counter/tokens';
import { weekFinality } from '@/lib/stats/finality';

import {
  BOUNTY_ROLL_WEEKS,
  authorBounty,
  authorChalkboard,
  authorTonysLine,
  authorVersion,
  authorWeek,
} from './author';
import { CLAIMS, ENTRY_VERDICTS, EVIDENCE, VERDICTS, WAITING, fill, houseTemplates } from './copy';
import { MIN_BASIS_TEAM_WEEKS, lowerMedian, type StakeBasis, type WeekResult } from './facts';
import {
  CHALKBOARD_VARIANTS,
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
import { renderStake } from './render';
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
    standings: [],
    eligibleUserIds: ['u1', 'u2'],
    ...overrides,
  };
}

function table(rows: { name: string; rosterId: number; wins: number; rank: number }[]) {
  return rows.map((row) => ({
    rosterId: row.rosterId,
    managerId: `u${String(row.rosterId)}`,
    displayName: row.name,
    wins: row.wins,
    losses: 5 - row.wins,
    ties: 0,
    pointsForCents: cents(500 + row.wins),
    rank: row.rank,
  }));
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
    gameKeys: ['2026-w05-m1'],
  };
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

describe('authoring Tony’s Line', () => {
  it('sets the line at the season median and pays exactly double', () => {
    const authored = authorTonysLine(basis(), PROVISIONAL_ECONOMY);
    if (typeof authored === 'string') throw new Error(authored);

    expect(authored.kind).toBe('TONYS_LINE');
    expect(authored.factRefs.values['line']).toBe('118.44');
    expect(authored.stakeTokens).toBe(PROVISIONAL_ECONOMY.weeklyLineStakeTokens);
    // `16 §9` fixes the payout at 2x, and `weekly_stakes_line_pays_double`
    // enforces it in the database. Asserted here too so a change is loud twice.
    expect(authored.rewardTokens).toBe(PROVISIONAL_ECONOMY.weeklyLineStakeTokens * 2);
    expect(authored.expiresAfterWeek).toBeNull();
  });

  it('names nobody', () => {
    // A market is about every manager's own team. A name in it would make it
    // about one of them.
    const authored = authorTonysLine(basis(), PROVISIONAL_ECONOMY);
    if (typeof authored === 'string') throw new Error(authored);
    expect(authored.allowedNames).toEqual([]);
  });

  it('refuses a basis too thin to be a season median', () => {
    // One week is not a season median — it is one week, and calling it a median
    // would make the market's central claim false in the weeks a manager is most
    // likely to look at it.
    expect(authorTonysLine(basis({ medianTeamScoreCents: null }), PROVISIONAL_ECONOMY)).toBe(
      'thin-basis',
    );
  });

  it('refuses when nobody is eligible', () => {
    expect(authorTonysLine(basis({ eligibleUserIds: [] }), PROVISIONAL_ECONOMY)).toBe(
      'nobody-eligible',
    );
  });

  it('only reads weeks before its own', () => {
    // The whole reason a line is a claim about the future rather than a
    // restatement of the past.
    const authored = authorTonysLine(basis(), PROVISIONAL_ECONOMY);
    if (typeof authored === 'string') throw new Error(authored);
    for (const basisWeek of authored.factRefs.basisWeeks) {
      expect(basisWeek).toBeLessThan(authored.week);
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
  it('prefers the loudest claim it can make', () => {
    const authored = authorChalkboard(basis(), PROVISIONAL_ECONOMY);
    if (typeof authored === 'string') throw new Error(authored);
    expect(authored.variant).toBe(VARIANTS.nobodyClearsRecord);
    expect(authored.stakeTokens).toBeNull();
    expect(authored.rewardTokens).toBeNull();
  });

  it('does not say the same kind of thing two weeks running', () => {
    const authored = authorChalkboard(
      basis({
        standings: table([
          { name: 'Nick', rosterId: 1, wins: 4, rank: 1 },
          { name: 'Ryan', rosterId: 2, wins: 1, rank: 2 },
        ]),
      }),
      PROVISIONAL_ECONOMY,
      VARIANTS.nobodyClearsRecord,
    );
    if (typeof authored === 'string') throw new Error(authored);
    expect(authored.variant).toBe(VARIANTS.leaderHolds);
  });

  it('reorders, and never silences', () => {
    /*
     * The Slice made this mistake once: novelty subtracted before the floors, and
     * a week printed *"a quiet week at the shop"* above a fifty-one-point win. If
     * the repeat is the only variant that can be built, it is built.
     */
    const authored = authorChalkboard(
      basis({ standings: [] }),
      PROVISIONAL_ECONOMY,
      VARIANTS.nobodyClearsRecord,
    );
    if (typeof authored === 'string') throw new Error(authored);
    expect(authored.variant).toBe(VARIANTS.nobodyClearsRecord);
  });

  it('will not name a leader who is level with somebody', () => {
    /*
     * `standingsThrough` reports ties as the same rank precisely so a claim can
     * tell "moved" from "was always level". A prediction about "the leader" when
     * two managers are level is a prediction about whichever one the sort put
     * first — a claim about the database rather than about the season.
     */
    const level = authorChalkboard(
      basis({
        bestTeamScoreCents: null,
        standings: table([
          { name: 'Nick', rosterId: 1, wins: 4, rank: 1 },
          { name: 'Ryan', rosterId: 2, wins: 4, rank: 1 },
          { name: 'Joe', rosterId: 3, wins: 1, rank: 3 },
        ]),
      }),
      PROVISIONAL_ECONOMY,
    );
    if (typeof level === 'string') throw new Error(level);
    // The top is shared, so it falls through to the bottom club, which is not.
    expect(level.variant).toBe(VARIANTS.bottomClubLoses);
    expect(level.allowedNames).toEqual(['Joe']);
  });

  it('refuses everything on a week with no season behind it', () => {
    expect(
      authorChalkboard(
        basis({ bestTeamScoreCents: null, standings: [] }),
        PROVISIONAL_ECONOMY,
      ),
    ).toBe('no-clear-subject');
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
    // A build log that only records successes cannot answer the question a quiet
    // chalkboard raises.
    const report = authorWeek({
      basis: basis({ medianTeamScoreCents: null }),
      economy: PROVISIONAL_ECONOMY,
      lineOpen: true,
      bountyRolling: false,
    });
    expect(report.refused).toContainEqual({ variant: VARIANTS.seasonMedian, why: 'thin-basis' });
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

const lineRefs = refs({ line: '118.44' });
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
  it('settles, and says how the field split', () => {
    const result = resolveStake({
      variant: VARIANTS.seasonMedian,
      factRefs: lineRefs,
      week: week([
        { name: 'Nick', rosterId: 1, points: 130, won: true },
        { name: 'Ryan', rosterId: 2, points: 100, won: false },
      ]),
    });
    if (!result.settled) throw new Error(result.why);
    expect(result.outcome).toBe('settled');
    expect(result.evidence.values['over']).toBe('1');
    expect(result.evidence.values['under']).toBe('1');
    expect(result.evidence.statement).toContain('118.44');
  });

  it('pushes only when the whole field lands on the number', () => {
    const result = resolveStake({
      variant: VARIANTS.seasonMedian,
      factRefs: lineRefs,
      week: week([
        { name: 'Nick', rosterId: 1, points: 118.44, won: null },
        { name: 'Ryan', rosterId: 2, points: 118.44, won: null },
      ]),
    });
    if (!result.settled) throw new Error(result.why);
    expect(result.outcome).toBe('push');
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
    allowedNumbers: ['10', '118.44', '2026', '20', '5'],
    allowedNames: [],
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
            line: '118.44',
            over: '3',
            under: '5',
          })!,
          gameKeys: [],
          values: { line: '118.44', over: '3', under: '5' },
        },
        resolvedAt: new Date('2026-01-06T00:00:00Z'),
      },
      presentation: 'resolved',
    });
    expect(copy?.verdict).toBe(VERDICTS['TONYS_LINE:settled']);
    expect(copy?.evidence).toContain('3 cleared it');
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

describe('every variant has a resolver', () => {
  it('resolves, or refuses with a reason, for all of them', () => {
    /*
     * Exhaustiveness at runtime as well as at compile time. `resolveStake`'s
     * switch is total over `Variant`, and a variant added to the union without a
     * case would fail to compile — but a variant added as a plain string would
     * not, and would fall out of the switch as `undefined`.
     */
    const played = week([{ name: 'Nick', rosterId: 1, points: 130, won: true }]);
    const byVariant: Record<Variant, FactRefs> = {
      [VARIANTS.seasonMedian]: lineRefs,
      [VARIANTS.weekScore]: bountyRefs,
      [VARIANTS.nobodyClearsRecord]: recordRefs,
      [VARIANTS.leaderHolds]: leaderRefs,
      [VARIANTS.bottomClubLoses]: leaderRefs,
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
