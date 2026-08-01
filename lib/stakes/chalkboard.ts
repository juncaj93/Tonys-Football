import { and, desc, eq, inArray } from 'drizzle-orm';

import { type Queryable } from '@/lib/db';
import { seasons, stakeEntries, stakeResolutions, weeklyStakes } from '@/lib/db/schema';
import { type FeatureFlags } from '@/lib/flags';

import { WAITING } from './copy';
import { buildWeekResult, stakeSeason } from './facts';
import {
  type Entry,
  type Evidence,
  type FactRefs,
  type Presentation,
  type Side,
  type Stake,
  type StakeStatus,
  type Variant,
} from './model';
import { renderEntry, renderStake, type ChalkCopy } from './render';
import { presentationOf } from './service';

/**
 * What is on the small sign beside Tony.
 *
 * ## The sign carries exactly two things, and that is `18 §3.4`
 *
 * > *"V1: Tony's weekly prediction only. Later, behind the approved feature flag
 * > — Tony's Line."*
 *
 * So: the chalkboard prediction, always; the market, when the flag is open. **A
 * bounty is not here.** `16 §38` puts *"any open bounty"* in the Slice alongside
 * the paper's stories, and adding a third thing to a 37-unit sign would be
 * absorbing another surface's scope into the homepage, which `18 §3` fixes at
 * eight objects for a reason.
 *
 * ## Which week the board is showing, derived rather than assumed
 *
 * **The newest week that has a stake in it.** Not "the current week" — this
 * product has no trustworthy clock-to-week mapping (`KICKOFF_2026` is a
 * constant precisely because Sleeper exposes no reliable preseason start), and
 * inventing one would put a guess in front of a settlement.
 *
 * The consequence today is the correct one: the 2026 season has no games, so
 * nothing has been authored, so the board is **quiet**. That is the state a real
 * manager meets right now, and it is the state that gets the design attention.
 *
 * ## Nothing here decides anything
 *
 * It reads rows. The outcome was written to `stake_resolutions` by the server,
 * the prose was checked by the Slice's validator, and this assembles them for a
 * component. A surface that could compute a verdict is a surface that can
 * disagree with the ledger.
 */

/** One thing on the board, ready to render. */
export interface BoardItem {
  readonly stakeKey: string;
  readonly stakeId: string;
  readonly kind: Stake['kind'];
  readonly season: number;
  readonly week: number;
  readonly presentation: Presentation;
  readonly copy: ChalkCopy;
  /** What the board says while there is no answer. Null once there is one. */
  readonly waiting: string | null;
  /** The signed-in manager's own pick, when the market has one. */
  readonly entry: {
    readonly side: Side;
    readonly stakedTokens: number;
    readonly verdict: string | null;
  } | null;
  /** May this manager still take a side? Markets only. */
  readonly canPick: boolean;
  /** The stake per pick, for the control's label. Markets only. */
  readonly stakeTokens: number | null;
}

/** Everything the sign shows, in the order it shows it. */
export interface Chalkboard {
  /** The prediction. Null when Tony has not called anything. */
  readonly prediction: BoardItem | null;
  /** The market. Null when the flag is shut, or nothing was authored. */
  readonly market: BoardItem | null;
  /** True when there is nothing at all — the wiped-slate state. */
  readonly quiet: boolean;
}

export const EMPTY_CHALKBOARD: Chalkboard = { prediction: null, market: null, quiet: true };

interface Row {
  id: string;
  seasonId: string;
  year: number;
  week: number;
  kind: 'TONYS_LINE' | 'BOUNTY' | 'CHALKBOARD';
  stakeKey: string;
  status: StakeStatus;
  variant: string;
  eligibleUserIds: string[];
  factRefs: unknown;
  allowedNumbers: string[];
  allowedNames: string[];
  authorVersion: string;
  stakeTokens: number | null;
  rewardTokens: number | null;
  expiresAfterWeek: number | null;
  settlementKey: string;
  voidReason: string | null;
}

function toStake(row: Row): Stake {
  return {
    id: row.id,
    seasonId: row.seasonId,
    season: row.year,
    week: row.week,
    kind: row.kind,
    stakeKey: row.stakeKey,
    status: row.status,
    variant: row.variant as Variant,
    eligibleUserIds: row.eligibleUserIds,
    factRefs: row.factRefs as FactRefs,
    allowedNumbers: row.allowedNumbers,
    allowedNames: row.allowedNames,
    authorVersion: row.authorVersion,
    stakeTokens: row.stakeTokens,
    rewardTokens: row.rewardTokens,
    expiresAfterWeek: row.expiresAfterWeek,
    settlementKey: row.settlementKey,
    voidReason: row.voidReason,
  };
}

/**
 * The board for one manager.
 *
 * Returns {@link EMPTY_CHALKBOARD} — the quiet state — for every reason there
 * might be nothing: no stakes authored, none for the sign's two kinds, or a line
 * the validator refused. Refusals are not distinguished on purpose. A manager
 * does not need to know *why* Tony has not written anything up, and a surface
 * that explained itself would be a surface that had something to say after all.
 */
export async function chalkboardFor(
  db: Queryable,
  input: { readonly userId: string | null; readonly flags: FeatureFlags },
): Promise<Chalkboard> {
  const newest = await db
    .select({ year: seasons.year, week: weeklyStakes.week })
    .from(weeklyStakes)
    .innerJoin(seasons, eq(seasons.id, weeklyStakes.seasonId))
    .where(inArray(weeklyStakes.kind, ['CHALKBOARD', 'TONYS_LINE']))
    .orderBy(desc(seasons.year), desc(weeklyStakes.week))
    .limit(1);

  const at = newest[0];
  if (at === undefined) return EMPTY_CHALKBOARD;

  const rows = await db
    .select({
      id: weeklyStakes.id,
      seasonId: weeklyStakes.seasonId,
      year: seasons.year,
      week: weeklyStakes.week,
      kind: weeklyStakes.kind,
      stakeKey: weeklyStakes.stakeKey,
      status: weeklyStakes.status,
      variant: weeklyStakes.variant,
      eligibleUserIds: weeklyStakes.eligibleUserIds,
      factRefs: weeklyStakes.factRefs,
      allowedNumbers: weeklyStakes.allowedNumbers,
      allowedNames: weeklyStakes.allowedNames,
      authorVersion: weeklyStakes.authorVersion,
      stakeTokens: weeklyStakes.stakeTokens,
      rewardTokens: weeklyStakes.rewardTokens,
      expiresAfterWeek: weeklyStakes.expiresAfterWeek,
      settlementKey: weeklyStakes.settlementKey,
      voidReason: weeklyStakes.voidReason,
    })
    .from(weeklyStakes)
    .innerJoin(seasons, eq(seasons.id, weeklyStakes.seasonId))
    .where(
      and(
        eq(seasons.year, at.year),
        eq(weeklyStakes.week, at.week),
        inArray(weeklyStakes.kind, ['CHALKBOARD', 'TONYS_LINE']),
      ),
    );

  if (rows.length === 0) return EMPTY_CHALKBOARD;

  const stakes = rows.map((row) => toStake(row as Row));
  const ids = stakes.map((stake) => stake.id);

  const resolutionRows = await db
    .select({
      stakeId: stakeResolutions.stakeId,
      outcome: stakeResolutions.outcome,
      resolvedWeek: stakeResolutions.resolvedWeek,
      claimedByUserId: stakeResolutions.claimedByUserId,
      evidence: stakeResolutions.evidence,
      resolvedAt: stakeResolutions.resolvedAt,
    })
    .from(stakeResolutions)
    .where(inArray(stakeResolutions.stakeId, ids));

  const resolutions = new Map(
    resolutionRows.map((row) => [
      row.stakeId,
      {
        outcome: row.outcome,
        resolvedWeek: row.resolvedWeek,
        claimedByUserId: row.claimedByUserId,
        evidence: row.evidence as unknown as Evidence,
        resolvedAt: row.resolvedAt,
      },
    ]),
  );

  const entryRows =
    input.userId === null
      ? []
      : await db
          .select({
            id: stakeEntries.id,
            stakeId: stakeEntries.stakeId,
            userId: stakeEntries.userId,
            side: stakeEntries.side,
            stakedTokens: stakeEntries.stakedTokens,
            outcome: stakeEntries.outcome,
            payoutTokens: stakeEntries.payoutTokens,
          })
          .from(stakeEntries)
          .where(and(inArray(stakeEntries.stakeId, ids), eq(stakeEntries.userId, input.userId)));

  const entries = new Map<string, Entry>(
    entryRows.map((row) => [
      row.stakeId,
      {
        id: row.id,
        userId: row.userId,
        side: row.side as Side,
        stakedTokens: row.stakedTokens,
        outcome: row.outcome,
        payoutTokens: row.payoutTokens,
      },
    ]),
  );

  const season = await stakeSeason(db, at.year);
  const week = season.found
    ? buildWeekResult({ ...season, season: at.year, week: at.week })
    : null;

  const build = (stake: Stake): BoardItem | null => {
    const resolution = resolutions.get(stake.id) ?? null;
    const presentation = presentationOf(stake, week);
    const copy = renderStake({ stake, resolution, presentation });
    if (copy === null) return null;

    const entry = entries.get(stake.id) ?? null;

    return {
      stakeKey: stake.stakeKey,
      stakeId: stake.id,
      kind: stake.kind,
      season: stake.season,
      week: stake.week,
      presentation,
      copy,
      waiting: WAITING[presentation],
      entry:
        entry === null
          ? null
          : {
              side: entry.side,
              stakedTokens: entry.stakedTokens,
              verdict: renderEntry(entry),
            },
      /*
       * A market closes the moment the week produces a result.
       *
       * `18 §3.4` says the line *"closes before kickoff"*, and this product has
       * no kickoff timestamp it can trust. So the closing condition is the one
       * thing certainly true after kickoff and certainly false before it: **a
       * score exists.** Nobody takes a side on a week they have watched.
       */
      canPick:
        stake.kind === 'TONYS_LINE' &&
        stake.status === 'open' &&
        entry === null &&
        input.userId !== null &&
        stake.eligibleUserIds.includes(input.userId) &&
        (week === null || week.teams.length === 0),
      stakeTokens: stake.stakeTokens,
    };
  };

  const prediction = stakes.filter((stake) => stake.kind === 'CHALKBOARD').map(build).find(Boolean);

  /*
   * The market appears only when the flag is open.
   *
   * Checked here rather than in the component, because a flag read in the
   * browser is a flag a browser can flip — and this one gates a token market.
   */
  const market = input.flags.tonysLine
    ? stakes.filter((stake) => stake.kind === 'TONYS_LINE').map(build).find(Boolean)
    : undefined;

  return {
    prediction: prediction ?? null,
    market: market ?? null,
    quiet: (prediction ?? null) === null && (market ?? null) === null,
  };
}

/** The open bounty, for the Slice. `16 §38` puts it on the paper, not on the sign. */
export async function openBountyFor(
  db: Queryable,
  season: number,
): Promise<BoardItem | null> {
  const found = await stakeSeason(db, season);
  if (!found.found || found.seasonId === null) return null;

  const rows = await db
    .select({
      id: weeklyStakes.id,
      seasonId: weeklyStakes.seasonId,
      year: seasons.year,
      week: weeklyStakes.week,
      kind: weeklyStakes.kind,
      stakeKey: weeklyStakes.stakeKey,
      status: weeklyStakes.status,
      variant: weeklyStakes.variant,
      eligibleUserIds: weeklyStakes.eligibleUserIds,
      factRefs: weeklyStakes.factRefs,
      allowedNumbers: weeklyStakes.allowedNumbers,
      allowedNames: weeklyStakes.allowedNames,
      authorVersion: weeklyStakes.authorVersion,
      stakeTokens: weeklyStakes.stakeTokens,
      rewardTokens: weeklyStakes.rewardTokens,
      expiresAfterWeek: weeklyStakes.expiresAfterWeek,
      settlementKey: weeklyStakes.settlementKey,
      voidReason: weeklyStakes.voidReason,
    })
    .from(weeklyStakes)
    .innerJoin(seasons, eq(seasons.id, weeklyStakes.seasonId))
    .where(and(eq(weeklyStakes.seasonId, found.seasonId), eq(weeklyStakes.kind, 'BOUNTY')))
    .orderBy(desc(weeklyStakes.week))
    .limit(1);

  const row = rows[0];
  if (row === undefined) return null;

  const stake = toStake(row as Row);

  const resolutionRows = await db
    .select({
      outcome: stakeResolutions.outcome,
      resolvedWeek: stakeResolutions.resolvedWeek,
      claimedByUserId: stakeResolutions.claimedByUserId,
      evidence: stakeResolutions.evidence,
      resolvedAt: stakeResolutions.resolvedAt,
    })
    .from(stakeResolutions)
    .where(eq(stakeResolutions.stakeId, stake.id))
    .limit(1);

  const stored = resolutionRows[0];
  const resolution =
    stored === undefined
      ? null
      : {
          outcome: stored.outcome,
          resolvedWeek: stored.resolvedWeek,
          claimedByUserId: stored.claimedByUserId,
          evidence: stored.evidence as unknown as Evidence,
          resolvedAt: stored.resolvedAt,
        };

  const week = buildWeekResult({ ...found, season, week: stake.week });
  const presentation = presentationOf(stake, week);
  const copy = renderStake({ stake, resolution, presentation });
  if (copy === null) return null;

  return {
    stakeKey: stake.stakeKey,
    stakeId: stake.id,
    kind: stake.kind,
    season: stake.season,
    week: stake.week,
    presentation,
    copy,
    waiting: WAITING[presentation],
    entry: null,
    canPick: false,
    stakeTokens: null,
  };
}
