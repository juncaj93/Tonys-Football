import { createHash } from 'node:crypto';

import { type EconomyValues } from '@/lib/counter/tokens';

import { writePoints, type StakeBasis } from './facts';
import {
  VARIANTS,
  kindOfVariant,
  settlementKeyFor,
  stakeKeyFor,
  type FactRefs,
  type StakeKind,
  type Variant,
} from './model';

/**
 * Authoring — turning what was known before a week into an offer.
 *
 * ## Deterministic, and that is a product property rather than a preference
 *
 * Nothing here draws, samples or picks at random. The same basis authors the same
 * stakes on every machine, which buys three things at once:
 *
 *   - **Re-running is a no-op.** `stake_key` is derived from the season, the week
 *     and the variant, and the column is UNIQUE. A second authoring pass writes
 *     nothing rather than offering the league a second market.
 *   - **A manager can check it.** The line is an order statistic of stored
 *     scores, so *"where did 118.44 come from"* has an answer that does not
 *     require trusting the server — the same property the recorded loot roll has.
 *   - **A demo is evidence.** A fixture runs this code, not a parallel copy.
 *
 * ## Every stake is gated, and no gate is softened
 *
 * A variant that cannot be built honestly is **not built**. There is no
 * fallback, no placeholder line, no "roughly". `16 §12`'s rule — where a fact is
 * unavailable it stays visibly unavailable — applies hardest to a surface that
 * asks somebody to commit tokens.
 *
 * The most common answer in this product's first weeks is therefore *"nothing to
 * author"*, and the chalkboard's quiet state is what that looks like.
 */

/**
 * The rules that produced a stake, as a content hash.
 *
 * Stored on the row for the reward table's reason: a stake authored in 2026 has
 * to stay interpretable in 2029, after the rules have moved. Bumping
 * `RULE_SET` is how a rules change becomes visible — the same values under new
 * rules produce a different version, so nothing silently re-reads as though it
 * were authored today.
 */
const RULE_SET = 'stakes-v1';

export function authorVersion(economy: EconomyValues): string {
  const canonical = [
    RULE_SET,
    ...Object.values(VARIANTS),
    `line:${String(economy.weeklyLineStakeTokens)}`,
    `bounty:${String(economy.bountyRewardTokens)}`,
  ].join('|');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

/**
 * How many weeks a bounty rolls before it expires.
 *
 * `16 §9` says a bounty rolls *"until claimed"* and does not say how far, so this
 * is the authoring parameter that decision leaves open. Four weeks, and the
 * reason is design rather than arithmetic: a bounty that can never expire has no
 * expired state, so nobody ever designs one — and `MANDATE §8` requires every
 * state of a feature to be showable. An unclaimable target sitting on the board
 * from October to January is furniture, not a bounty.
 *
 * Provisional with the rest of the economy until the P3 simulation.
 */
export const BOUNTY_ROLL_WEEKS = 4;

export interface AuthoredStake {
  readonly stakeKey: string;
  readonly settlementKey: string;
  readonly kind: StakeKind;
  readonly variant: Variant;
  readonly season: number;
  readonly week: number;
  readonly factRefs: FactRefs;
  readonly allowedNumbers: readonly string[];
  readonly allowedNames: readonly string[];
  readonly eligibleUserIds: readonly string[];
  readonly stakeTokens: number | null;
  readonly rewardTokens: number | null;
  readonly expiresAfterWeek: number | null;
  readonly authorVersion: string;
}

/** Why a variant produced nothing. Never rendered — this is a build log. */
export type AuthorRefusal =
  /** Not enough team-weeks for a season order statistic to mean anything. */
  | 'thin-basis'
  /** Nobody is eligible — every seat that week belongs to somebody retired. */
  | 'nobody-eligible'
  /** The table has no unique leader, or no unique bottom club. */
  | 'no-clear-subject'
  /** The chalkboard already used this variant last week. */
  | 'repeats-last-week';

export interface AuthorReport {
  readonly authored: readonly AuthoredStake[];
  readonly refused: readonly { readonly variant: Variant; readonly why: AuthorRefusal }[];
}

const refs = (
  basis: StakeBasis,
  values: Readonly<Record<string, string>>,
): FactRefs => ({
  basisWeeks: basis.basisWeeks,
  gameKeys: basis.gameKeys,
  values,
});

function draft(input: {
  readonly basis: StakeBasis;
  readonly variant: Variant;
  readonly factRefs: FactRefs;
  readonly allowedNumbers: readonly string[];
  readonly allowedNames: readonly string[];
  readonly stakeTokens: number | null;
  readonly rewardTokens: number | null;
  readonly expiresAfterWeek: number | null;
  readonly version: string;
}): AuthoredStake {
  const stakeKey = stakeKeyFor({
    season: input.basis.season,
    week: input.basis.week,
    variant: input.variant,
  });

  return {
    stakeKey,
    settlementKey: settlementKeyFor(stakeKey),
    kind: kindOfVariant(input.variant),
    variant: input.variant,
    season: input.basis.season,
    week: input.basis.week,
    factRefs: input.factRefs,
    /*
     * Sorted and de-duplicated, exactly as the fact packet does it.
     *
     * The validator's rule is set membership, so order is meaningless to it —
     * but a stored array that differs run to run makes two identical stakes look
     * different in a diff, and a diff nobody can read is a review nobody does.
     */
    allowedNumbers: [...new Set(input.allowedNumbers)].sort(),
    allowedNames: [...new Set(input.allowedNames)].sort(),
    eligibleUserIds: input.basis.eligibleUserIds,
    stakeTokens: input.stakeTokens,
    rewardTokens: input.rewardTokens,
    expiresAfterWeek: input.expiresAfterWeek,
    authorVersion: input.version,
  };
}

/**
 * Tony's Line for a week, or nothing.
 *
 * The line is the **lower median team-week score to date** and the question is
 * whether a manager's own team clears it. That is `16 §9`'s market: structurally
 * around even by construction, settled from finalized results, and using no
 * projection of any kind — which is what killed the prop-bet system it replaces
 * (`16 A.1`: *"needs reliable projections that `07 §3` itself calls
 * unreliable"*).
 *
 * The stake and the payout are the same for everybody and are not negotiable at
 * the row level: `weekly_stakes_line_pays_double` enforces `16 §9`'s fixed 2x in
 * the database, so no service can quietly change the multiplier.
 */
export function authorTonysLine(
  basis: StakeBasis,
  economy: EconomyValues,
): AuthoredStake | AuthorRefusal {
  if (basis.eligibleUserIds.length === 0) return 'nobody-eligible';
  if (basis.medianTeamScoreCents === null) return 'thin-basis';

  const line = writePoints(basis.medianTeamScoreCents);

  return draft({
    basis,
    variant: VARIANTS.seasonMedian,
    factRefs: refs(basis, {
      line,
      teamWeeks: String(basis.teamWeeks),
      throughWeek: String(basis.basisWeeks.at(-1) ?? 0),
    }),
    /*
     * The line, the stake and the payout — the three numbers a sentence about
     * this market may contain, and nothing else.
     *
     * The week and the season are added by the caller's packet, the way the
     * Slice's are. A renderer that reaches for anything else is refused by the
     * Slice's own validator rather than by a second implementation of it.
     */
    allowedNumbers: [
      line,
      String(economy.weeklyLineStakeTokens),
      String(economy.weeklyLineStakeTokens * 2),
      String(basis.season),
      String(basis.week),
    ],
    /* A market names nobody. It is about every manager's own team. */
    allowedNames: [],
    stakeTokens: economy.weeklyLineStakeTokens,
    rewardTokens: economy.weeklyLineStakeTokens * 2,
    expiresAfterWeek: null,
    version: authorVersion(economy),
  });
}

/**
 * A bounty, or nothing.
 *
 * *"Beat the best single week anybody has posted this season."* One stored
 * number, chosen at authoring and frozen there, checkable against any later
 * week's scores by a comparison — which is `16 §9`'s *"machine-checkable
 * condition and resolver chosen at authoring time"* with nothing left to
 * interpret.
 *
 * The target is a real score somebody posted, not a round number near one. A
 * rounded target would be a number this league has never seen, and the first
 * question anybody asks a bounty is *where did that come from*.
 */
export function authorBounty(
  basis: StakeBasis,
  economy: EconomyValues,
): AuthoredStake | AuthorRefusal {
  if (basis.eligibleUserIds.length === 0) return 'nobody-eligible';
  if (basis.bestTeamScoreCents === null || basis.bestTeamScoreBy === null) return 'thin-basis';

  const target = writePoints(basis.bestTeamScoreCents);

  return draft({
    basis,
    variant: VARIANTS.weekScore,
    factRefs: refs(basis, {
      target,
      holder: basis.bestTeamScoreBy,
      throughWeek: String(basis.basisWeeks.at(-1) ?? 0),
    }),
    allowedNumbers: [
      target,
      String(economy.bountyRewardTokens),
      String(basis.season),
      String(basis.week),
    ],
    /*
     * The record holder is nameable, because a bounty that says *"beat the best
     * anyone has done"* without saying whose it is has hidden the only part of
     * it that is personal. They are eligible by construction — the basis applied
     * the publication boundary before the maximum was taken.
     */
    allowedNames: [basis.bestTeamScoreBy],
    stakeTokens: null,
    rewardTokens: economy.bountyRewardTokens,
    expiresAfterWeek: basis.week + BOUNTY_ROLL_WEEKS - 1,
    version: authorVersion(economy),
  });
}

/**
 * The week's chalkboard prediction, or nothing.
 *
 * ## Priority, not randomness
 *
 * The variants are tried in a fixed order and the first that can be built
 * honestly wins. That is deliberate: a seeded pick would be reproducible and
 * still unexplainable, and *"why did Tony say that"* should have an answer
 * shorter than a hash. The order is loudest-claim-first — a record standing is a
 * bigger call than the table holding.
 *
 * ## One rule beyond priority: he does not repeat himself
 *
 * `lastVariant` is the previous week's chalkboard, and the same variant two weeks
 * running is skipped when another is available. The Slice's desk applies the
 * same discipline to headlines, for the same reason: a board that says the same
 * kind of thing every week stops being read.
 *
 * It **reorders, it never silences** — if the repeat is the only variant that can
 * be built, it is built. That correction was made once already, in the Slice,
 * after novelty printed *"a quiet week"* above a fifty-one-point win.
 */
export function authorChalkboard(
  basis: StakeBasis,
  economy: EconomyValues,
  lastVariant: Variant | null = null,
): AuthoredStake | AuthorRefusal {
  if (basis.eligibleUserIds.length === 0) return 'nobody-eligible';

  const attempts: { variant: Variant; build: () => AuthoredStake | AuthorRefusal }[] = [
    {
      variant: VARIANTS.nobodyClearsRecord,
      build: () => {
        if (basis.bestTeamScoreCents === null) return 'thin-basis';
        const record = writePoints(basis.bestTeamScoreCents);
        return draft({
          basis,
          variant: VARIANTS.nobodyClearsRecord,
          factRefs: refs(basis, { record, throughWeek: String(basis.basisWeeks.at(-1) ?? 0) }),
          allowedNumbers: [record, String(basis.season), String(basis.week)],
          allowedNames: [],
          stakeTokens: null,
          rewardTokens: null,
          expiresAfterWeek: null,
          version: authorVersion(economy),
        });
      },
    },
    {
      variant: VARIANTS.leaderHolds,
      build: () => {
        const leader = soleAt(basis, 'top');
        if (leader === null) return 'no-clear-subject';
        return draft({
          basis,
          variant: VARIANTS.leaderHolds,
          factRefs: refs(basis, {
            subject: leader.displayName,
            rosterId: String(leader.rosterId),
            wins: String(leader.wins),
            losses: String(leader.losses),
            throughWeek: String(basis.basisWeeks.at(-1) ?? 0),
          }),
          allowedNumbers: [
            String(leader.wins),
            String(leader.losses),
            String(basis.season),
            String(basis.week),
          ],
          allowedNames: [leader.displayName],
          stakeTokens: null,
          rewardTokens: null,
          expiresAfterWeek: null,
          version: authorVersion(economy),
        });
      },
    },
    {
      variant: VARIANTS.bottomClubLoses,
      build: () => {
        const bottom = soleAt(basis, 'bottom');
        if (bottom === null) return 'no-clear-subject';
        return draft({
          basis,
          variant: VARIANTS.bottomClubLoses,
          factRefs: refs(basis, {
            subject: bottom.displayName,
            rosterId: String(bottom.rosterId),
            wins: String(bottom.wins),
            losses: String(bottom.losses),
            throughWeek: String(basis.basisWeeks.at(-1) ?? 0),
          }),
          allowedNumbers: [
            String(bottom.wins),
            String(bottom.losses),
            String(basis.season),
            String(basis.week),
          ],
          allowedNames: [bottom.displayName],
          stakeTokens: null,
          rewardTokens: null,
          expiresAfterWeek: null,
          version: authorVersion(economy),
        });
      },
    },
  ];

  const ordered = [
    ...attempts.filter((attempt) => attempt.variant !== lastVariant),
    ...attempts.filter((attempt) => attempt.variant === lastVariant),
  ];

  let lastRefusal: AuthorRefusal = 'thin-basis';
  for (const attempt of ordered) {
    const built = attempt.build();
    if (typeof built !== 'string') return built;
    lastRefusal = built;
  }
  return lastRefusal;
}

/**
 * The manager alone at the top or the bottom of the table, if there is one.
 *
 * *Alone* is load-bearing. `standingsThrough` reports ties as the same rank
 * precisely so a claim can tell *"moved"* from *"was always level"*, and a
 * prediction about "the leader" when two managers are level is a prediction
 * about whichever one the sort happened to put first — a claim about the
 * database rather than about the season.
 */
function soleAt(
  basis: StakeBasis,
  end: 'top' | 'bottom',
): { displayName: string; rosterId: number; wins: number; losses: number } | null {
  const table = basis.standings;
  if (table.length < 2) return null;

  const target = end === 'top' ? table[0] : table.at(-1);
  if (target === undefined || target.displayName === null) return null;

  const shared = table.filter((row) => row.rank === target.rank).length;
  if (shared !== 1) return null;

  return {
    displayName: target.displayName,
    rosterId: target.rosterId,
    wins: target.wins,
    losses: target.losses,
  };
}

/**
 * Author everything a week has to offer.
 *
 * Returns what was built **and what was refused**, because a build log that only
 * records successes cannot answer the question a quiet chalkboard raises.
 */
export function authorWeek(input: {
  readonly basis: StakeBasis;
  readonly economy: EconomyValues;
  readonly lastChalkboardVariant?: Variant | null;
  /** Tony's Line is flagged (`18 §3.4`); an unflagged deploy authors no market. */
  readonly lineOpen: boolean;
  /** True when a bounty is already rolling. `16 §9` allows one at a time. */
  readonly bountyRolling: boolean;
}): AuthorReport {
  const authored: AuthoredStake[] = [];
  const refused: { variant: Variant; why: AuthorRefusal }[] = [];

  const take = (variant: Variant, built: AuthoredStake | AuthorRefusal): void => {
    if (typeof built === 'string') refused.push({ variant, why: built });
    else authored.push(built);
  };

  if (input.lineOpen) {
    take(VARIANTS.seasonMedian, authorTonysLine(input.basis, input.economy));
  }
  if (!input.bountyRolling) {
    take(VARIANTS.weekScore, authorBounty(input.basis, input.economy));
  }

  const chalkboard = authorChalkboard(
    input.basis,
    input.economy,
    input.lastChalkboardVariant ?? null,
  );
  if (typeof chalkboard === 'string') {
    /*
     * A refused chalkboard is reported against the variant it would have been.
     * `nobody-clears-record` is first in priority, so it is the honest label for
     * "the whole board refused" — and the reason travels with it.
     */
    refused.push({ variant: VARIANTS.nobodyClearsRecord, why: chalkboard });
  } else {
    authored.push(chalkboard);
  }

  return { authored, refused };
}
