import { eq } from 'drizzle-orm';

import { type Queryable } from '@/lib/db';
import { seasonDrafts, seasons } from '@/lib/db/schema';

import { draftFacts, type ManagerDraftFacts } from './draft-facts';
import {
  draftReviewProgress,
  pickableFor,
  type DraftReviewRecord,
  type ReviewProgress,
} from './preseason-reviews';
import { preseasonEligibility, type PreseasonRefusal } from './preseason';

/**
 * The read model behind Tony's draft board.
 *
 * ## Why the desk has its own module
 *
 * The screens need three things the publication pipeline does not: **who is
 * next**, **what this manager actually did**, and **why the button is not there
 * yet**. None of those belongs in `preseason.ts`, whose job is to turn facts
 * into a paper — a packet builder that also knew about the order of a form is a
 * packet builder with a screen inside it.
 *
 * The rule is the same one `lib/slice/publication.ts` follows: the screen gets
 * the parts, and nothing derives a fact of its own.
 */

/** The season's Sleeper league id, or null when it has none. */
export async function seasonLeagueId(db: Queryable, seasonYear: number): Promise<string | null> {
  const [row] = await db
    .select({ leagueId: seasons.sleeperLeagueId })
    .from(seasons)
    .where(eq(seasons.year, seasonYear))
    .limit(1);

  const leagueId = row?.leagueId ?? null;
  return leagueId === '' ? null : leagueId;
}

/** What the board shows, in one read. */
export interface DraftBoard {
  readonly season: number;
  readonly progress: ReviewProgress;
  /**
   * Sleeper's own word for where the draft is — `pre_draft`, `drafting`,
   * `complete` — or null when nothing has ever been read.
   *
   * The difference between *"the draft has not started"* and *"we have never
   * looked"* is the whole reason a commissioner opens this page in August, and a
   * board that showed both as an empty list would answer neither.
   */
  readonly draftStatus: string | null;
  readonly picksStored: number;
  /** When the last pick landed. The draft's real end. */
  readonly completedAt: Date | null;
  /** Is the league in the state a draft review is for? */
  readonly eligible: boolean;
  readonly refusal: PreseasonRefusal | null;
}

export async function draftBoard(db: Queryable, seasonYear: number): Promise<DraftBoard> {
  const [season] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.year, seasonYear))
    .limit(1);

  const [draft] =
    season === undefined
      ? []
      : await db
          .select({ status: seasonDrafts.status, completedAt: seasonDrafts.completedAt })
          .from(seasonDrafts)
          .where(eq(seasonDrafts.seasonId, season.id))
          .limit(1);

  const eligibility = await preseasonEligibility(db, seasonYear);
  const facts = await draftFacts(db, seasonYear);

  return {
    season: seasonYear,
    progress: await draftReviewProgress(db, seasonYear),
    draftStatus: draft?.status ?? null,
    picksStored: facts.facts?.totalPicks ?? 0,
    completedAt: draft?.completedAt ?? null,
    eligible: eligibility.eligible,
    refusal: eligibility.refusal,
  };
}

/** One manager's screen: what they did, what Tony has said, and where next. */
export interface ManagerDesk {
  readonly season: number;
  readonly review: DraftReviewRecord;
  /** Their draft, from stored picks. Null when the draft holds nothing for them. */
  readonly facts: ManagerDraftFacts | null;
  /** Every pick of theirs, for the best-pick picker. */
  readonly pickable: readonly { readonly id: string; readonly label: string }[];
  /** The next manager Tony still owes, or the next in board order. Null at the end. */
  readonly nextUserId: string | null;
  readonly previousUserId: string | null;
  readonly position: number;
  readonly total: number;
}

/**
 * Everything one editor screen needs.
 *
 * ## `next` prefers somebody Tony has not reached
 *
 * The board's order is stable and alphabetical, and *"save and next"* on a first
 * pass should walk it in order. But on a **second** pass — coming back to fix one
 * grade — the next unreviewed manager is what a commissioner wants, not the
 * person who happens to be alphabetically after the one they just corrected.
 *
 * So: the next manager in board order who still owes a review, wrapping to the
 * start; and when everybody is done, the next in plain order. That makes ten
 * saves reach ten people whichever order they were started in, and the last save
 * of a complete pass lands back on the board rather than on an eleventh screen
 * that does not exist.
 */
export async function managerDesk(
  db: Queryable,
  input: { readonly season: number; readonly userId: string },
): Promise<ManagerDesk | null> {
  const progress = await draftReviewProgress(db, input.season);
  const index = progress.rows.findIndex((row) => row.userId === input.userId);
  if (index === -1) return null;

  const review = progress.rows[index]!;
  const facts = await draftFacts(db, input.season);
  const theirs =
    facts.facts?.managers.find((manager) => manager.userId === input.userId) ?? null;

  const pickable =
    theirs === null
      ? []
      : await pickableFor(db, { seasonYear: input.season, rosterId: theirs.rosterId });

  return {
    season: input.season,
    review,
    facts: theirs,
    pickable,
    nextUserId: nextAfter(progress, index),
    previousUserId: progress.rows[index - 1]?.userId ?? null,
    position: index + 1,
    total: progress.rows.length,
  };
}

function nextAfter(progress: ReviewProgress, index: number): string | null {
  const { rows } = progress;

  /*
   * The next unreviewed manager, wrapping past the end of the list.
   *
   * `index + 1` through `index + rows.length - 1` visits everybody exactly once
   * and never returns the manager being edited — which matters, because they are
   * about to stop being unreviewed and *"next"* pointing at the screen you are
   * already on is a dead end.
   */
  for (let step = 1; step < rows.length; step++) {
    const candidate = rows[(index + step) % rows.length]!;
    if (candidate.grade === null || candidate.take === null) return candidate.userId;
  }

  /* Everybody is done. Walk in order, and fall off the end onto the board. */
  return rows[index + 1]?.userId ?? null;
}
