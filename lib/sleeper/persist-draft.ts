import { eq } from 'drizzle-orm';

import { now } from '@/lib/clock';
import { type Database } from '@/lib/db';
import { draftPicks, seasonDrafts, seasons } from '@/lib/db/schema';

import { importDraft, type DraftRefusal, type ImportedDraft } from './draft';
import { type SleeperSource } from './transport';

/**
 * Store one season's draft.
 *
 * ## Why this writes and never rewrites
 *
 * A completed draft is the most settled fact this product handles — more settled
 * than a week's scores, which stat corrections keep moving for days. So the
 * write is an **insert of what is missing**, and `draft_picks_immutable`
 * (`0018`) makes that a database guarantee rather than a habit of this file.
 *
 * A second sync therefore reports `unchanged` and touches nothing, which is what
 * lets the Tuesday job call it every week for the whole season without cost.
 *
 * ## The status is stored even when the draft is not
 *
 * `pre_draft` and `drafting` produce a `season_drafts` row with no picks. That
 * is deliberate: *"Sleeper says the draft has not started"* is the answer the
 * draft board needs to give a commissioner in August, and it is a different
 * answer from *"nothing has ever been read"*. The status column is the only
 * mutable field on the row, because it is the only one that legitimately moves.
 */

export type DraftPersistOutcome =
  /** The draft and its picks were written by this call. */
  | 'stored'
  /** Everything was already there. */
  | 'unchanged'
  /** The status moved (`drafting` → `complete`, say) and the picks arrived. */
  | 'updated'
  /** The season is not in the database. */
  | 'no-season';

export interface DraftPersistReport {
  readonly outcome: DraftPersistOutcome;
  readonly draftId: string | null;
  readonly status: string;
  readonly picksStored: number;
  readonly picksAdded: number;
  readonly warnings: readonly string[];
}

/** Sleeper's status words, narrowed to the enum. Anything else is `unknown`, loudly. */
function statusOf(raw: string): 'pre_draft' | 'drafting' | 'complete' | 'unknown' {
  switch (raw) {
    case 'pre_draft':
    case 'drafting':
    case 'complete':
      return raw;
    default:
      return 'unknown';
  }
}

export async function persistDraft(
  db: Database,
  input: {
    readonly seasonYear: number;
    readonly imported: ImportedDraft;
  },
): Promise<DraftPersistReport> {
  const warnings: string[] = [];
  const at = now();
  const { draft, picks } = input.imported;

  const [season] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.year, input.seasonYear))
    .limit(1);

  if (season === undefined) {
    return {
      outcome: 'no-season',
      draftId: null,
      status: draft.status,
      picksStored: 0,
      picksAdded: 0,
      warnings,
    };
  }

  const status = statusOf(draft.status);
  if (status === 'unknown') {
    warnings.push(
      `Sleeper reported an unrecognised draft status "${draft.status}"; it was stored as unknown ` +
        `and the draft will not be treated as complete.`,
    );
  }

  /*
   * The draft's real end is the last pick, not the scheduled start.
   *
   * `start_time` is when the room opened. A ten-team, sixteen-round draft runs
   * for hours after that, and *"the draft finished on Saturday"* is a claim
   * about when it ended.
   */
  const completedAt =
    status === 'complete' && draft.lastPickedMs !== null ? new Date(draft.lastPickedMs) : null;

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: seasonDrafts.id,
        sleeperDraftId: seasonDrafts.sleeperDraftId,
        status: seasonDrafts.status,
      })
      .from(seasonDrafts)
      .where(eq(seasonDrafts.seasonId, season.id))
      .limit(1);

    let draftRowId: string;
    let statusMoved = false;

    if (existing === undefined) {
      const [created] = await tx
        .insert(seasonDrafts)
        .values({
          seasonId: season.id,
          sleeperDraftId: draft.draftId,
          status,
          type: draft.type,
          rounds: draft.rounds,
          completedAt,
          capturedAt: input.imported.capturedAt,
          createdAt: at,
          updatedAt: at,
        })
        .returning({ id: seasonDrafts.id });

      if (created === undefined) throw new Error('the season draft was not written');
      draftRowId = created.id;
      statusMoved = true;
    } else {
      draftRowId = existing.id;

      if (existing.sleeperDraftId !== draft.draftId) {
        /*
         * A different draft for a season that already has one.
         *
         * Reported rather than adopted. A league that redrafts produces this,
         * and so does a misconfigured `SLEEPER_LEAGUE_ID` — the two look
         * identical from here, and quietly replacing a stored draft with
         * somebody else's is the worse of the two outcomes by a long way.
         */
        warnings.push(
          `${String(input.seasonYear)} already holds draft ${existing.sleeperDraftId}; Sleeper ` +
            `returned ${draft.draftId}. Nothing was replaced — check SLEEPER_LEAGUE_ID.`,
        );
        return {
          outcome: 'unchanged' as const,
          draftId: existing.sleeperDraftId,
          status: existing.status,
          picksStored: await pickCount(tx, draftRowId),
          picksAdded: 0,
          warnings,
        };
      }

      if (existing.status !== status) {
        await tx
          .update(seasonDrafts)
          .set({
            status,
            completedAt,
            capturedAt: input.imported.capturedAt,
            rounds: draft.rounds,
            updatedAt: at,
          })
          .where(eq(seasonDrafts.id, draftRowId));
        statusMoved = true;
      }
    }

    /*
     * Insert what is missing. `ON CONFLICT DO NOTHING` on `(draft_id, pick_no)`
     * is the whole idempotency mechanism, and it is the same shape every other
     * append-only table in this product uses. Nothing is updated, because
     * `draft_picks_immutable` would refuse it.
     */
    let picksAdded = 0;
    if (picks.length > 0) {
      const written = await tx
        .insert(draftPicks)
        .values(
          picks.map((pick) => ({
            draftId: draftRowId,
            pickNo: pick.pickNo,
            round: pick.round,
            draftSlot: pick.draftSlot,
            rosterId: pick.rosterId,
            sleeperPlayerId: pick.playerId,
            playerName: pick.playerName,
            position: pick.position,
            nflTeam: pick.nflTeam,
            isKeeper: pick.isKeeper,
            createdAt: at,
          })),
        )
        .onConflictDoNothing({ target: [draftPicks.draftId, draftPicks.pickNo] })
        .returning({ id: draftPicks.id });

      picksAdded = written.length;
    }

    const picksStored = await pickCount(tx, draftRowId);

    const outcome: DraftPersistOutcome =
      existing === undefined
        ? 'stored'
        : picksAdded > 0 || statusMoved
          ? 'updated'
          : 'unchanged';

    return {
      outcome,
      draftId: draft.draftId,
      status,
      picksStored,
      picksAdded,
      warnings,
    };
  });
}

/**
 * Read one season's draft from Sleeper and store it. The whole step.
 *
 * The operation the historical import, the seed, the Tuesday job and the
 * commissioner's *"pull the draft"* button all call, so there is exactly one
 * description of what *"sync the draft"* means. Two requests, and every one of
 * the four callers gets the same idempotency.
 *
 * A refusal is returned rather than thrown. Every one of them is an ordinary
 * state of the world in August — the league has not drafted, the draft is
 * running right now, Sleeper is having a moment — and none of them should cost a
 * Tuesday its paper.
 */
export async function syncSeasonDraft(
  db: Database,
  input: {
    readonly source: SleeperSource;
    readonly seasonYear: number;
    readonly leagueId: string;
  },
): Promise<DraftSyncReport> {
  const imported = await importDraft(input.source, input.leagueId);

  if (imported.draft === null) {
    return {
      seasonYear: input.seasonYear,
      outcome: null,
      refusal: imported.refusal ?? 'no-draft',
      status: imported.status,
      picksStored: 0,
      picksAdded: 0,
      warnings: imported.warnings,
    };
  }

  const stored = await persistDraft(db, {
    seasonYear: input.seasonYear,
    imported: imported.draft,
  });

  return {
    seasonYear: input.seasonYear,
    outcome: stored.outcome,
    refusal: stored.outcome === 'no-season' ? 'no-season' : null,
    status: stored.status,
    picksStored: stored.picksStored,
    picksAdded: stored.picksAdded,
    warnings: [...imported.warnings, ...stored.warnings],
  };
}

/** Why a draft sync did nothing, in the vocabulary the desk prints. */
export type DraftSyncRefusal = DraftRefusal | 'no-season';

export interface DraftSyncReport {
  readonly seasonYear: number;
  /** What the write did. Null when nothing was written. */
  readonly outcome: DraftPersistOutcome | null;
  readonly refusal: DraftSyncRefusal | null;
  /** Sleeper's own word for where the draft is, when it said one. */
  readonly status: string | null;
  readonly picksStored: number;
  readonly picksAdded: number;
  readonly warnings: readonly string[];
}

/** One sentence per refusal, for a commissioner reading a report at 8am. */
export const DRAFT_SYNC_REFUSALS: Record<DraftSyncRefusal, string> = {
  'no-draft': 'Sleeper has no draft for this league yet.',
  'not-complete': 'The draft has not finished, so nothing was stored.',
  'no-picks': 'The draft is marked complete and Sleeper returned no picks.',
  unreachable: 'Sleeper could not be read, so the draft did not come in. It will retry.',
  'no-season': 'That season has not been imported, so there was nothing to store the draft against.',
};

async function pickCount(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  draftRowId: string,
): Promise<number> {
  const rows = await tx
    .select({ id: draftPicks.id })
    .from(draftPicks)
    .where(eq(draftPicks.draftId, draftRowId));
  return rows.length;
}
