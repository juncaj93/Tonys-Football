/**
 * What a weekly stake is, as types.
 *
 * `16 §9`: *"Weekly stakes (one table, type discriminator)"* covering Tony's
 * Line, bounties and the chalkboard prediction. They are one system because they
 * are one object — **a claim made in advance from verified facts, checked later
 * against finalized ones** — and what differs is only who makes the claim and
 * what is riding on it.
 *
 * ## Nothing in this module knows any football
 *
 * Everything here is shape. The numbers come from `lib/stats/` through
 * `facts.ts`, the decisions come from `author.ts` and `resolve.ts`, and the words
 * come from curated templates checked by the Slice's own validator. Keeping the
 * types free of arithmetic is what makes *"do not independently infer matchup
 * participants, scores, margins, standings, favourites, records, streaks or
 * finalized outcomes"* checkable by reading one file per concern.
 */

/** The three approved families. Stored as the row's discriminator. */
export const STAKE_KINDS = ['TONYS_LINE', 'BOUNTY', 'CHALKBOARD'] as const;
export type StakeKind = (typeof STAKE_KINDS)[number];

/** Stored status. `open` is the only state a stake is authored into. */
export type StakeStatus = 'open' | 'resolved' | 'expired' | 'void';

/**
 * What a resolution decided.
 *
 * Per kind, and the database enforces the mapping rather than trusting a caller:
 * a chalkboard prediction is `hit` or `missed`, a bounty is `hit` or
 * `unclaimed`, and a market is `settled` or `push`.
 *
 * `settled` is not a hedge. A market's stake-level outcome is not a verdict —
 * the field splits, and the verdict is per entry.
 */
export type StakeOutcome = 'hit' | 'missed' | 'push' | 'unclaimed' | 'settled';

/** One manager's verdict on a market. */
export type EntryOutcome = 'won' | 'lost' | 'push';

/** The two sides of a line. Checked in the database, not only here. */
export const SIDES = ['over', 'under'] as const;
export type Side = (typeof SIDES)[number];

/**
 * Every variant this product authors, and the kind each belongs to.
 *
 * Stored on the row, so a historical stake keeps meaning what it meant after the
 * authoring rules change. Adding one is a deliberate act: `stakes.test.ts`
 * asserts the whole set, and `resolve.ts` will not compile with a variant it has
 * no resolver for.
 */
export const VARIANTS = {
  /**
   * The line is the **season median team-week score to date**.
   *
   * `16 §9` fixes this: *"line set at a season median or rolling average
   * (structurally ~50/50, needs no projection data)"*. The median is the whole
   * reason the market needs no model — roughly half of all team-weeks land
   * above a median by construction, so nothing has to guess what anybody will
   * score.
   */
  seasonMedian: 'season-median',

  /**
   * Beat the best single week anybody has posted this season.
   *
   * Machine-checkable against one stored number, chosen at authoring time and
   * frozen there — which is `16 §9`'s *"machine-checkable condition and resolver
   * chosen at authoring time"* exactly.
   */
  weekScore: 'week-score',

  /** Tony says nobody clears the season's best score this week. */
  nobodyClearsRecord: 'nobody-clears-record',
  /** Tony says whoever is top of the table wins this week. */
  leaderHolds: 'leader-holds',
  /** Tony says whoever is bottom of the table loses this week. */
  bottomClubLoses: 'bottom-club-loses',
} as const;

export type Variant = (typeof VARIANTS)[keyof typeof VARIANTS];

export const CHALKBOARD_VARIANTS: readonly Variant[] = [
  VARIANTS.nobodyClearsRecord,
  VARIANTS.leaderHolds,
  VARIANTS.bottomClubLoses,
];

export function kindOfVariant(variant: Variant): StakeKind {
  if (variant === VARIANTS.seasonMedian) return 'TONYS_LINE';
  if (variant === VARIANTS.weekScore) return 'BOUNTY';
  return 'CHALKBOARD';
}

/**
 * The verified facts a stake was built from, stored as data.
 *
 * The same discipline the fact packet applies to prose, applied to a settlement:
 * a claim that cannot be recomputed from stored references is not auditable,
 * whatever it says about itself. `basisWeeks` and `gameKeys` are the provenance;
 * `values` is what came out, already written the way a reader sees it.
 */
export interface FactRefs {
  /** The weeks read to build this stake. Always strictly before its own week. */
  readonly basisWeeks: readonly number[];
  /** The publishable games behind those weeks, by `WeekGame.key`. */
  readonly gameKeys: readonly string[];
  /** Named numbers, written. `{ line: "118.44", games: "27" }`. */
  readonly values: Readonly<Record<string, string>>;
}

/**
 * Why a resolution went the way it did, as recomputable data.
 *
 * Deliberately not prose alone: prose cannot be recomputed against.
 *
 *   - `statementKey` — which curated sentence in `copy.ts` explained it
 *   - `statement` — that sentence, filled, **frozen at settlement**. It is what
 *     the manager was actually shown, and an audit trail that regenerated it
 *     from today's templates would quietly restate history in a new voice
 *   - `gameKeys` · `values` — what a manager would check it with
 */
export interface Evidence {
  readonly statementKey: string;
  readonly statement: string;
  readonly gameKeys: readonly string[];
  readonly values: Readonly<Record<string, string>>;
}

/** A stake as stored, plus its resolution when it has one. */
export interface Stake {
  readonly id: string;
  readonly seasonId: string;
  readonly season: number;
  readonly week: number;
  readonly kind: StakeKind;
  readonly stakeKey: string;
  readonly status: StakeStatus;
  readonly variant: Variant;
  readonly eligibleUserIds: readonly string[];
  readonly factRefs: FactRefs;
  readonly allowedNumbers: readonly string[];
  readonly allowedNames: readonly string[];
  readonly authorVersion: string;
  readonly stakeTokens: number | null;
  readonly rewardTokens: number | null;
  readonly expiresAfterWeek: number | null;
  readonly settlementKey: string;
  readonly voidReason: string | null;
}

export interface Resolution {
  readonly outcome: StakeOutcome;
  readonly resolvedWeek: number;
  readonly claimedByUserId: string | null;
  readonly evidence: Evidence;
  readonly resolvedAt: Date;
}

export interface Entry {
  readonly id: string;
  readonly userId: string;
  readonly side: Side;
  readonly stakedTokens: number;
  readonly outcome: EntryOutcome | null;
  readonly payoutTokens: number | null;
}

/**
 * What a manager is actually looking at — derived, never stored.
 *
 * Stored status answers *"what happened to this stake"*. A surface has to answer
 * a different question — *"why is there nothing to tell me yet"* — and the two
 * honest reasons are not the same thing:
 *
 *   - `awaiting-week` — the week has not been played. Nothing is wrong.
 *   - `awaiting-final` — the games exist and the books are open, so **it cannot
 *     settle yet**. This is the state the prompt calls *"unresolved because the
 *     week is incomplete"*, and it is the one a product is most tempted to
 *     render as a result. It is not one.
 *
 * Collapsing them into `open` would make the surface either lie or say nothing.
 */
export type Presentation =
  /** Nothing has been played. Nothing is wrong. */
  | 'awaiting-week'
  /** The games exist and this has not settled. `16 §12`'s books are still open. */
  | 'awaiting-final'
  /**
   * A bounty nobody has claimed, with weeks left to run.
   *
   * Its own state rather than `awaiting-final`, because it is not waiting for
   * anything — the week settled, and the answer was *no*. Telling a manager
   * *"still being counted"* about a week that finished would be false in the
   * quietest possible way, and it is the sentence they would read most often:
   * `16 §9` has a bounty rolling until claimed, so most weeks of its life end
   * here.
   */
  | 'rolling'
  | 'resolved'
  | 'expired'
  | 'void';

/**
 * Every stake key this product mints, derived rather than chosen.
 *
 * Deterministic, so re-running the authoring pass is a no-op instead of a second
 * stake — the same property the seeded welcome box has, and for the same reason:
 * an author that ran twice must not double the product.
 */
export function stakeKeyFor(input: {
  readonly season: number;
  readonly week: number;
  readonly variant: Variant;
}): string {
  return `${String(input.season)}-w${String(input.week).padStart(2, '0')}-${input.variant}`;
}

/**
 * The ledger key prefix every payout from a stake is namespaced under.
 *
 * Stored on the row rather than recomputed at settlement, so a replay reaches the
 * same ledger rows even if this derivation later changes. `apply_token_delta`'s
 * `UNIQUE(idempotency_key)` does the rest.
 */
export function settlementKeyFor(stakeKey: string): string {
  return `stake:${stakeKey}`;
}

/** The ledger key for one manager's payout on one stake. Replay-safe by shape. */
export function payoutKeyFor(settlementKey: string, userId: string): string {
  return `${settlementKey}:payout:${userId}`;
}

/** The ledger key for one manager's stake being placed. */
export function placementKeyFor(settlementKey: string, userId: string): string {
  return `${settlementKey}:placed:${userId}`;
}
