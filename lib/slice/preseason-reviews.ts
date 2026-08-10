import { and, asc, eq } from 'drizzle-orm';

import { now } from '@/lib/clock';
import { type Database, type Queryable } from '@/lib/db';
import { draftPicks, seasonDrafts, seasons, sliceDraftReviews } from '@/lib/db/schema';
import { activeLeagueManagers } from '@/lib/league/membership';

import { TONY_GRADES, type TonyGrade } from './draft-vocabulary';
import { validateEditorialCopy, type Violation } from './validate';

/**
 * Tony's draft board — the grades and takes, and who still owes one.
 *
 * ## Whose opinion this is
 *
 * Tony's. The commissioner types it, and that is an implementation detail the
 * product never exposes: the paper prints **TONY'S GRADE** and **TONY'S TAKE**,
 * and nothing anywhere says a person supplied them. Alex is ghost-writing, and
 * `docs/PRESEASON_SLICE_BOUNDARY.md` records that this framing is a product
 * rule rather than a wording preference.
 *
 * ## Why the software does not grade
 *
 * A draft grade needs a comparison source — ADP, projections, a value model —
 * and this product has none of those, on purpose. Building one would mean the
 * interface deriving a fantasy judgement for itself, which `MANDATE §9` puts
 * beyond it, and it would mean the paper asserting *"B+"* as though it were the
 * kind of fact a score is. So the grade is an opinion, it is attributed, and a
 * person supplies it. That is a **deliberate product decision**, not a gap
 * waiting for a model.
 *
 * ## Two required fields, two optional ones
 *
 * The commissioner's workload rule: ten teams, from a phone, without it becoming
 * a chore. Grade and take are required because an issue with a blank grade is
 * not an issue; best pick and concern are optional because a manager whose draft
 * had no single highlight should not force one to be invented.
 */

/**
 * The thirteen grades, in board order.
 *
 * Re-exported from `draft-vocabulary.ts`, which is also what `tony_grade` in the
 * schema is built from — so the domain the editor offers and the domain the
 * database accepts are one list rather than two that agree today.
 */
export { TONY_GRADES as GRADES, type TonyGrade };

/**
 * How long a take may be.
 *
 * Measured rather than picked: 240 characters is five lines of `TYPE.body` at
 * 360px, which is the most one of ten sections can take before the page stops
 * being scannable. The database carries the same number as a CHECK — this
 * constant is what the editor counts down from, and the CHECK is what makes it
 * true for every caller.
 */
export const TAKE_MAX = 240;
export const CONCERN_MAX = 160;

export function isGrade(value: unknown): value is TonyGrade {
  return typeof value === 'string' && (TONY_GRADES as readonly string[]).includes(value);
}

/** One manager's row on the board — their draft review, or the absence of one. */
export interface DraftReviewRecord {
  readonly userId: string;
  readonly displayName: string;
  readonly grade: TonyGrade | null;
  readonly take: string | null;
  readonly bestPickId: string | null;
  readonly concern: string | null;
  readonly updatedAt: Date | null;
}

export interface ReviewProgress {
  /** Every active manager, in the order the board lists them. */
  readonly rows: readonly DraftReviewRecord[];
  readonly reviewed: number;
  readonly total: number;
  /** Whose review is still missing, by name. What the desk prints. */
  readonly outstanding: readonly string[];
  /** Every required field is present for every active manager. */
  readonly complete: boolean;
}

/**
 * The board: every active manager, with their review if there is one.
 *
 * Driven by the **manager list**, not by the review rows, and that ordering is
 * the whole point of the function. A query over `slice_draft_reviews` answers
 * *"what has been written"*; the board has to answer *"who is still owed"*, and
 * a manager with no row is exactly the one the answer is about.
 *
 * Retired managers never appear: `activeLeagueManagers` is the single boundary
 * (`lib/league/membership.ts`), and a review row left behind by somebody who has
 * since left the league is invisible here rather than filtered case by case.
 */
export async function draftReviewProgress(
  db: Queryable,
  seasonYear: number,
): Promise<ReviewProgress> {
  const [season] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.year, seasonYear))
    .limit(1);

  const managers = await activeLeagueManagers(db);

  const rows =
    season === undefined
      ? []
      : await db
          .select({
            userId: sliceDraftReviews.userId,
            grade: sliceDraftReviews.grade,
            take: sliceDraftReviews.take,
            bestPickId: sliceDraftReviews.bestPickId,
            concern: sliceDraftReviews.concern,
            updatedAt: sliceDraftReviews.updatedAt,
          })
          .from(sliceDraftReviews)
          .where(eq(sliceDraftReviews.seasonId, season.id));

  const byUser = new Map(rows.map((row) => [row.userId, row] as const));

  const board: DraftReviewRecord[] = managers.map((manager) => {
    const review = byUser.get(manager.id);
    return {
      userId: manager.id,
      displayName: manager.displayName,
      grade: review?.grade ?? null,
      take: review?.take ?? null,
      bestPickId: review?.bestPickId ?? null,
      concern: review?.concern ?? null,
      updatedAt: review?.updatedAt ?? null,
    };
  });

  const done = board.filter(isReviewed);

  return {
    rows: board,
    reviewed: done.length,
    total: board.length,
    outstanding: board.filter((row) => !isReviewed(row)).map((row) => row.displayName),
    /*
     * A league with no managers is **not** complete.
     *
     * `0 of 0` is arithmetically finished and editorially meaningless, and it is
     * reachable — a database seeded without memberships. Publishing an issue
     * that reviews nobody is worse than refusing one.
     */
    complete: board.length > 0 && done.length === board.length,
  };
}

function isReviewed(row: DraftReviewRecord): boolean {
  return row.grade !== null && row.take !== null && row.take.trim() !== '';
}

export class DraftReviewRefused extends Error {
  constructor(
    reason: string,
    readonly violations: readonly Violation[] = [],
  ) {
    super(reason);
    this.name = 'DraftReviewRefused';
  }
}

export interface DraftReviewInput {
  readonly seasonYear: number;
  readonly userId: string;
  readonly grade: TonyGrade;
  readonly take: string;
  /** Optional. Must be one of *this manager's* picks — the database checks, not this file. */
  readonly bestPickId?: string | null;
  readonly concern?: string | null;
  /** Who typed it. Recorded on the desk, never printed. */
  readonly actorUserId: string;
}

/**
 * Write one manager's review, or replace it.
 *
 * ## Why this is an upsert and not an append
 *
 * A grade is edited. That is the workflow: enter ten quickly, read the whole
 * paper, change the two that look wrong, approve. An append-only table would
 * make *"the current grade"* a query with an ordering in it, and the ordering
 * would be the thing that broke.
 *
 * The historical guarantee comes from somewhere stronger: publication snapshots
 * the rendered edition into `slice_issue_versions`, whose content is immutable
 * by trigger (`0011`). So editing a grade after publication changes the **next**
 * paper and cannot reach the one already printed. That is the same rule a stat
 * correction obeys, and it is why this table does not need to carry it.
 *
 * ## What is refused, and where
 *
 * The length and presence rules are CHECKs, so a caller that skipped this
 * function still cannot store a blank take. What is checked *here* and cannot be
 * a CHECK is `16 §9`'s banned-term scan: a take is human copy, so its numbers
 * and names are the author's business, but *"the league has no kickers"* is a
 * product rule that holds whoever is typing.
 */
export async function saveDraftReview(
  db: Database,
  input: DraftReviewInput,
): Promise<void> {
  const take = input.take.trim();
  const concern = input.concern?.trim() ?? '';

  if (take === '') {
    throw new DraftReviewRefused('Tony needs something to say about this draft.');
  }
  if (take.length > TAKE_MAX) {
    throw new DraftReviewRefused(
      `That take is ${String(take.length)} characters. Tony has room for ${String(TAKE_MAX)}.`,
    );
  }
  if (concern.length > CONCERN_MAX) {
    throw new DraftReviewRefused(
      `That concern is ${String(concern.length)} characters. Tony has room for ${String(CONCERN_MAX)}.`,
    );
  }

  const verdict = validateEditorialCopy([take, concern]);
  if (!verdict.publishable) {
    throw new DraftReviewRefused(
      'Tony cannot print that: ' +
        verdict.violations
          .map((violation) =>
            violation.kind === 'banned-term'
              ? `“${violation.value}” — ${violation.why}`
              : 'a quotation mark, and nobody in this league said anything on the record',
          )
          .join('; '),
      verdict.violations,
    );
  }

  const [season] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.year, input.seasonYear))
    .limit(1);

  if (season === undefined) {
    throw new DraftReviewRefused(`${String(input.seasonYear)} is not a season on record.`);
  }

  const at = now();

  await db
    .insert(sliceDraftReviews)
    .values({
      seasonId: season.id,
      userId: input.userId,
      grade: input.grade,
      take,
      bestPickId: input.bestPickId ?? null,
      concern: concern === '' ? null : concern,
      updatedBy: input.actorUserId,
      createdAt: at,
      updatedAt: at,
    })
    .onConflictDoUpdate({
      target: [sliceDraftReviews.seasonId, sliceDraftReviews.userId],
      set: {
        grade: input.grade,
        take,
        bestPickId: input.bestPickId ?? null,
        concern: concern === '' ? null : concern,
        updatedBy: input.actorUserId,
        updatedAt: at,
      },
    });
}

/**
 * Every pick this manager made, for the best-pick picker.
 *
 * A **list to choose from** rather than a text field, so *"Tony's best pick"*
 * can only ever name a player this manager really drafted. The database enforces
 * it too (`slice_draft_reviews_best_pick_is_theirs`), which is what makes the
 * guarantee survive a caller that builds its own form.
 */
export async function pickableFor(
  db: Queryable,
  input: { readonly seasonYear: number; readonly rosterId: number },
): Promise<readonly { id: string; label: string; playerName: string; round: number }[]> {
  const rows = await db
    .select({
      id: draftPicks.id,
      round: draftPicks.round,
      pickNo: draftPicks.pickNo,
      playerName: draftPicks.playerName,
      position: draftPicks.position,
    })
    .from(draftPicks)
    .innerJoin(seasonDrafts, eq(seasonDrafts.id, draftPicks.draftId))
    .innerJoin(seasons, eq(seasons.id, seasonDrafts.seasonId))
    .where(and(eq(seasons.year, input.seasonYear), eq(draftPicks.rosterId, input.rosterId)))
    .orderBy(asc(draftPicks.pickNo));

  return rows.map((row) => ({
    id: row.id,
    round: row.round,
    playerName: row.playerName,
    label:
      row.position === null
        ? `R${String(row.round)} · ${row.playerName}`
        : `R${String(row.round)} · ${row.playerName} (${row.position.toUpperCase()})`,
  }));
}
