import { createHash } from 'node:crypto';

import { type EconomyValues } from '@/lib/counter/tokens';

import {
  clearedRecently,
  leagueScores,
  personalLineCents,
  writePoints,
  type StakeBasis,
} from './facts';
import {
  VARIANTS,
  kindOfVariant,
  settlementKeyFor,
  stakeKeyFor,
  type FactRefs,
  type StakeKind,
  type Variant,
} from './model';
import { LIBRARY } from './propositions';

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
  /** Set on a stake that belongs to one seat. See `stakeKeyFor`. */
  readonly rosterId?: number;
  /**
   * Who may enter, when it is not the whole eligible league.
   *
   * A personal line passes `[theirs]`, and that array **is** the authorization
   * boundary — `placeEntry` checks it and a database trigger checks it again.
   */
  readonly eligibleUserIds?: readonly string[];
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
    ...(input.rosterId === undefined ? {} : { rosterId: input.rosterId }),
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
    eligibleUserIds: input.eligibleUserIds ?? input.basis.eligibleUserIds,
    stakeTokens: input.stakeTokens,
    rewardTokens: input.rewardTokens,
    expiresAfterWeek: input.expiresAfterWeek,
    authorVersion: input.version,
  };
}

/**
 * Tony's Line — one per manager, or none.
 *
 * ## It became personal on 2026-08-12, and that is the whole change
 *
 * It used to be **one league-wide number**: the season's lower median team-week,
 * offered to everybody, each betting it about their own team. The simulation lab
 * put that on a phone and the commissioner named the problem — a number about the
 * league is not a line about *you*, and a strong manager takes the Over every
 * week while a weak one takes the Under. `docs/evidence/line-and-call/report.md`
 * measured three replacements against the real 2024 and 2025 seasons; this is
 * the approved one.
 *
 * ```
 *   weight = n / (n + 4)                    n = that manager's own team-weeks
 *   line   = weight · (their median)  +  (1 - weight) · (the league's median)
 *   line   hung on the half-point
 * ```
 *
 * Measured over 320 real team-weeks: **50.0% overs**, the smallest week-to-week
 * movement of the three candidates, and a 26.8-point spread between the league's
 * highest and lowest line. The shrinkage is what makes a three-game sample safe
 * to price at all — see `MIN_OWN_TEAM_WEEKS`.
 *
 * ## Up to ten stakes, and each belongs to exactly one manager
 *
 * `eligibleUserIds` is `[theirs]` rather than the league, which is not a display
 * decision: `placeEntry` refuses `not_eligible` against that stored snapshot, and
 * `stake_entries_only_the_owner_may_enter` refuses it again in the database. A
 * manager cannot take a side on somebody else's team total.
 *
 * **No new stake kind.** These are `TONYS_LINE` rows with a per-roster key, so
 * settlement, the payout multiple, the token path and every idempotency
 * guarantee are the approved ones, untouched.
 */
export function authorTonysLines(
  basis: StakeBasis,
  economy: EconomyValues,
): { readonly authored: readonly AuthoredStake[]; readonly refusal: AuthorRefusal | null } {
  if (basis.eligibleUserIds.length === 0) {
    return { authored: [], refusal: 'nobody-eligible' };
  }

  const league = leagueScores(basis);
  const authored: AuthoredStake[] = [];

  /*
   * Ordered by roster id, so a week's ten stakes are written in the same order
   * every run. `standings` is the only place the basis carries the seat and the
   * name together, and it is already filtered to eligible managers.
   */
  const seats = [...basis.standings]
    .filter((row) => row.managerId !== null && row.displayName !== null)
    .sort((a, b) => a.rosterId - b.rosterId);

  for (const seat of seats) {
    const userId = seat.managerId!;
    const own = basis.scoresByUser.get(userId) ?? [];

    const lineCents = personalLineCents({ own, league });
    if (lineCents === null) continue;

    const line = writePoints(lineCents);

    authored.push(
      draft({
        basis,
        variant: VARIANTS.seasonMedian,
        rosterId: seat.rosterId,
        eligibleUserIds: [userId],
        factRefs: refs(basis, {
          line,
          subject: seat.displayName!,
          rosterId: String(seat.rosterId),
          ownTeamWeeks: String(own.length),
          teamWeeks: String(basis.teamWeeks),
          throughWeek: String(basis.basisWeeks.at(-1) ?? 0),
          /*
           * The explainer's two counts, frozen with the terms.
           *
           * Computed here rather than at render time on purpose: the number a
           * manager took a side on and the sentence explaining it have to agree
           * forever, and `weekly_stakes_terms_immutable` is what makes that
           * true. Recomputing at render would let a later week quietly restate
           * the context of a bet already placed.
           */
          ...cleared({ own, lineCents }),
        }),
        /*
         * The line, the stake and the payout — plus the two counts the
         * explainer prints. Every one of them is a stored fact or a stored
         * economy value, and the Slice's own validator refuses a sentence that
         * reaches for anything else.
         */
        allowedNumbers: [
          line,
          String(economy.weeklyLineStakeTokens),
          String(economy.weeklyLineStakeTokens * 2),
          String(basis.season),
          String(basis.week),
          ...clearedNumbers({ own, lineCents }),
        ],
        /*
         * A personal line names exactly one manager: the one it belongs to. The
         * league-wide version named nobody, which was right when it was about
         * everybody.
         */
        allowedNames: [seat.displayName!],
        stakeTokens: economy.weeklyLineStakeTokens,
        rewardTokens: economy.weeklyLineStakeTokens * 2,
        expiresAfterWeek: null,
        version: authorVersion(economy),
      }),
    );
  }

  /*
   * Nobody had enough of their own history yet. Reported as `thin-basis` — the
   * same word the league-wide version used for the same condition — so the
   * Tuesday job's log reads the way it always did.
   */
  if (authored.length === 0) return { authored: [], refusal: 'thin-basis' };
  return { authored, refusal: null };
}

/**
 * The explainer's counts as fact refs, or nothing.
 *
 * Absent rather than zeroed when there is no window to speak of — the ruling is
 * that a shorter truthful window is used and the sentence is **omitted** when
 * even that is unavailable, never padded to six.
 */
function cleared(input: {
  readonly own: readonly number[];
  readonly lineCents: number;
}): Record<string, string> {
  const counts = clearedRecently({
    recentFirstToLast: input.own,
    lineCents: input.lineCents,
  });
  return counts === null
    ? {}
    : { cleared: String(counts.cleared), clearedOf: String(counts.of) };
}

/** The two counts the explainer prints, as strings the validator can allow. */
function clearedNumbers(input: {
  readonly own: readonly number[];
  readonly lineCents: number;
}): readonly string[] {
  return Object.values(cleared(input));
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
 * The week's chalkboard proposition, or nothing.
 *
 * **Rebuilt on the commissioner's ruling of 2026-08-12 (Rulings 5–9).** It used
 * to try three claims in a fixed priority order, the loudest first, and the
 * loudest was *"nobody touches the record"* — a call the season best makes
 * almost certainly correct, asking the same question the weekly-high reward, the
 * weekly-high Slice story and the bounty all already answer. Those three
 * variants are retired; `propositions.ts` is the library that replaced them.
 *
 * ## A rotation, and it is still explainable
 *
 * The library is an ordered list and the week chooses where in it to start:
 * `(week - 1) % length`. Deterministic, reproducible, and *"why did Tony say
 * that"* has an answer shorter than a hash — **it is that week's turn**. The old
 * header argued against a seeded pick for exactly this reason and the argument
 * survives; what changed is that four comparable families make priority
 * arbitrary where three unequal ones made it meaningful.
 *
 * From the starting point it walks the list and takes the first family that can
 * be calibrated honestly. Weeks one and two have no history, so the two flat-margin
 * families are the only ones that build — which is why Ruling 7 asks for them.
 *
 * ## He still does not repeat himself, and it still never silences him
 *
 * `lastVariant` is moved to the back rather than removed. If the repeat is the
 * only family that can be built, it is built. That correction was made once
 * already, in the Slice, after novelty printed *"a quiet week"* above a
 * fifty-one-point win.
 */
export function authorChalkboard(
  basis: StakeBasis,
  economy: EconomyValues,
  lastVariant: Variant | null = null,
): AuthoredStake | AuthorRefusal {
  if (basis.eligibleUserIds.length === 0) return 'nobody-eligible';

  const propBasis = {
    leagueScores: leagueScores(basis),
    basisWeeks: basis.basisWeeks.length,
  };

  const start = ((basis.week - 1) % LIBRARY.length + LIBRARY.length) % LIBRARY.length;
  const rotated = [...LIBRARY.slice(start), ...LIBRARY.slice(0, start)];
  const ordered = [
    ...rotated.filter((proposition) => proposition.variant !== lastVariant),
    ...rotated.filter((proposition) => proposition.variant === lastVariant),
  ];

  for (const proposition of ordered) {
    const calibration = proposition.calibrate(propBasis);
    if (calibration === null) continue;

    return draft({
      basis,
      variant: proposition.variant,
      factRefs: refs(basis, {
        ...calibration.values,
        throughWeek: String(basis.basisWeeks.at(-1) ?? 0),
      }),
      allowedNumbers: [...calibration.numbers, String(basis.season), String(basis.week)],
      /*
       * A proposition names nobody at authoring time, because it is about the
       * league rather than about a manager. Whoever turns up in the *evidence*
       * — the manager who broke the number, the two ends of a photo finish — is
       * admitted from the resolution's own stored values, which is the same
       * discipline the bounty's claimant goes through.
       */
      allowedNames: [],
      stakeTokens: null,
      rewardTokens: null,
      expiresAfterWeek: null,
      version: authorVersion(economy),
    });
  }

  /*
   * Nothing could be calibrated, which before week three means exactly one
   * thing: the two history-free families are the only ones that build and both
   * of them always do. So this is reachable only from a library with no
   * history-free family left in it.
   */
  return 'thin-basis';
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
    /*
     * Up to ten, one per manager. A week that can price nobody reports the same
     * single refusal the league-wide version reported, so the Tuesday job's log
     * reads unchanged.
     */
    const lines = authorTonysLines(input.basis, input.economy);
    if (lines.refusal !== null) refused.push({ variant: VARIANTS.seasonMedian, why: lines.refusal });
    for (const line of lines.authored) authored.push(line);
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
