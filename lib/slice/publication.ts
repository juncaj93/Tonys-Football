import { createHash } from 'node:crypto';

import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { now } from '@/lib/clock';
import { type Database, type Queryable } from '@/lib/db';
import { DemoRefused, assertDemoAllowed } from '@/lib/demo/guard';
import {
  fantasyMatchups,
  seasons,
  sliceIssueVersions,
  sliceIssues,
  slicePublicationHolds,
  sliceReviews,
  users,
} from '@/lib/db/schema';

import { assembleIssue, latestEdition } from './edition';
import { type FactPacket } from './packet';
import { type Edition } from './render';
import { type Verdict } from './validate';

/**
 * The commissioner review chain — how a rendered week becomes a published one.
 *
 * ## The gap this closes
 *
 * `16 §4.3`'s Tuesday chain ends **`draft Slice → notify commissioner`** and
 * `16 §9` makes approval mandatory in season one, with a permanent manual hold
 * switch. Until this file existed there was no queue for the notification to
 * land in, no approval state, and no record of what had been published — so the
 * Tuesday job could not be turned on without either publishing an issue nobody
 * approved or dropping the draft on the floor. That was a **governance** gap
 * rather than a functional one: every operation the job needs already existed
 * and was idempotent.
 *
 * ## The chain
 *
 * ```
 * generateDraft ──► submitForReview ──► approve ──► publish ──► [the rack]
 *      │                                   │
 *      └── refused by the validator        └── reject (with a reason)
 *          → visible, unapprovable             → a new version, not an edit
 * ```
 *
 * ## Three things this deliberately does not do
 *
 * **There is no prose editing.** `08 §22` lists an edit control; `16 §9` requires
 * every number and proper noun in an issue to match the fact packet, checked
 * deterministically. A free-text edit box would let a commissioner write a
 * sentence that no validator had passed, on the one surface where the league
 * takes the text as true. The controls are approve, reject and regenerate, which
 * is a *stronger* guarantee than the one `08` asked for. Recorded as a
 * deliberate deviation rather than an omission.
 *
 * **There is no candidate override.** `MANDATE §9` makes Stats the sole
 * authority on what a result meant and how much of a deal it was. A control that
 * let the review screen promote a story the scorer ranked fourth would put that
 * authority in the reviewer's hands. The screen *shows* the scores and the
 * suppression reasons — which is what makes the selection arguable — and changing
 * one means changing the policy, not the issue.
 *
 * **Regeneration cannot change the facts.** `08 §22` requires regeneration to
 * lock the fact packet. Here it is locked by construction: the renderer is
 * deterministic, so regenerating an unchanged week produces identical bytes and
 * `UNIQUE(issue_id, content_hash)` turns the second insert into a no-op the
 * caller reads back. Regeneration only ever produces something new when the
 * underlying facts moved — which is precisely when a new version is correct.
 */

/** What a draft attempt did. `noop` is the idempotent retry. */
export type DraftOutcome = 'created' | 'noop' | 'refused';

export interface DraftResult {
  readonly outcome: DraftOutcome;
  /** Null only when the packet refused — there was no issue to record. */
  readonly issueId: string | null;
  readonly versionId: string | null;
  readonly version: number | null;
  readonly publishable: boolean;
  /** Set on `refused`: the packet's own reason, in its own words. */
  readonly refusal: string | null;
}

/** One issue as the queue lists it. */
export interface QueuedIssue {
  readonly issueId: string;
  readonly season: number;
  readonly week: number;
  readonly versionId: string;
  readonly version: number;
  readonly status: (typeof sliceIssueVersions.$inferSelect)['status'];
  readonly publishable: boolean;
  readonly headline: string;
  readonly createdAt: Date;
  readonly publishedVersionId: string | null;
}

/** Everything the review screen shows about one version (`08 §22`). */
export interface ReviewDetail {
  readonly issueId: string;
  readonly season: number;
  readonly week: number;
  readonly versionId: string;
  readonly version: number;
  readonly status: (typeof sliceIssueVersions.$inferSelect)['status'];
  readonly renderer: (typeof sliceIssueVersions.$inferSelect)['renderer'];
  readonly contentHash: string;
  readonly publishable: boolean;
  readonly edition: Edition;
  readonly verdict: Verdict;
  readonly packet: FactPacket;
  readonly createdAt: Date;
  readonly history: readonly ReviewEvent[];
  /** Other versions of the same issue, newest first. What a correction replaced. */
  readonly siblings: readonly {
    readonly versionId: string;
    readonly version: number;
    readonly status: (typeof sliceIssueVersions.$inferSelect)['status'];
  }[];
}

export interface ReviewEvent {
  readonly action: (typeof sliceReviews.$inferSelect)['action'];
  readonly actorName: string | null;
  readonly note: string | null;
  readonly occurredAt: Date;
}

/**
 * A JSON encoding that does not depend on key order.
 *
 * Objects are emitted with their keys sorted; arrays keep their order, because
 * an array's order is meaning (the scoreboard is a running order, not a set).
 *
 * ## Why this is not `JSON.stringify`
 *
 * It was, and a test caught it. `content` is stored as **`jsonb`**, which is a
 * parsed structure rather than a byte store — Postgres re-emits object keys in
 * its own order — so hashing the version that came back out of the database gave
 * a different digest from the one written in. The digest is what a commissioner's
 * approval is *against*, so "recompute it from what is served and check" has to
 * be an operation that works. A hash that only matches before a round trip is a
 * hash nobody can verify.
 */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`);

  return `{${entries.join(',')}}`;
}

/**
 * The digest a version is identified and deduplicated by.
 *
 * Over the rendered edition only — not the packet. Two renders of a week whose
 * *evidence* changed but whose *prose* did not are the same issue as far as a
 * reader is concerned, and appending a version nobody could tell apart from the
 * last one would make the queue grow on every Tuesday retry.
 *
 * Truncated to 16 hex characters, like `rewards.ts` and `tokens.ts`: 64 bits is
 * far more than a per-issue dedupe needs, and a short digest is legible in an
 * audit row and on the review screen, where it is the thing an approval names.
 */
export function editionHash(edition: Edition): string {
  return createHash('sha256').update(canonical(edition)).digest('hex').slice(0, 16);
}

/**
 * Render one week and record it as a draft, or find the draft already there.
 *
 * The operation `16 §4.3`'s Tuesday job calls. Idempotent twice over: the issue
 * is found by `(season, week)` and the version by content hash, both unique
 * constraints, so a retried Tuesday appends nothing.
 *
 * `actorUserId` is null when a job generated it and set when a commissioner asked
 * for a fresh look. Either way the draft is the same draft — who asked is audit
 * history, not an input to the renderer.
 */
export async function generateDraft(
  db: Database,
  input: {
    readonly season: number;
    readonly week: number;
    readonly actorUserId?: string | null;
    /** Put it straight in front of the commissioner. What the Tuesday job does. */
    readonly submit?: boolean;
  },
): Promise<DraftResult> {
  const assembled = await assembleIssue(db, { season: input.season, week: input.week });

  if (assembled.edition === null) {
    /*
     * `08 §27`, incomplete data: *"hold publication and show admin status."*
     *
     * Nothing is written. A packet refusal means the week holds nothing that may
     * be spoken about at all — not a bad draft, an absent one — and recording an
     * empty version would put a row in the queue that no decision can be made
     * about.
     */
    return {
      outcome: 'refused',
      issueId: null,
      versionId: null,
      version: null,
      publishable: false,
      refusal: assembled.packet.refusal,
    };
  }

  return recordVersion(db, {
    season: input.season,
    week: input.week,
    edition: assembled.edition,
    packet: assembled.packet,
    verdict: assembled.verdict,
    actorUserId: input.actorUserId ?? null,
    submit: input.submit ?? false,
  });
}

/**
 * Write one rendering into the chain, or find the one already there.
 *
 * Extracted from `generateDraft` so that **everything which creates a version
 * creates it the same way** — the numbering, the hash, the audit row and the
 * optional submit are one piece of code rather than one per caller.
 *
 * The second caller is the demo system, which needs a version the validator
 * *refused* in order to photograph the review screen's error state. That state
 * cannot be produced by asking the pipeline nicely — the renderer and the
 * validator agree on every week of both finalized seasons, which is the property
 * `slice.test.ts` asserts — so the demo doctors the prose and then runs the
 * **real** `validateEdition` over it. The violations it shows are computed, not
 * asserted, and the row is written by this function rather than by an INSERT the
 * product would never issue.
 */
export async function recordVersion(
  db: Database,
  input: {
    readonly season: number;
    readonly week: number;
    readonly edition: Edition;
    readonly packet: FactPacket;
    readonly verdict: Verdict;
    readonly actorUserId: string | null;
    readonly submit: boolean;
  },
): Promise<DraftResult> {
  const assembled = { edition: input.edition, packet: input.packet, verdict: input.verdict };
  const edition = assembled.edition;
  const hash = editionHash(edition);
  const at = now();

  return db.transaction(async (tx) => {
    const [season] = await tx
      .select({ id: seasons.id })
      .from(seasons)
      .where(eq(seasons.year, input.season))
      .limit(1);

    if (season === undefined) {
      throw new Error(`no season ${String(input.season)} to draft an issue for`);
    }

    const issueId = await ensureIssue(tx, {
      seasonId: season.id,
      week: input.week,
      at,
    });

    const [existing] = await tx
      .select({
        id: sliceIssueVersions.id,
        version: sliceIssueVersions.version,
        status: sliceIssueVersions.status,
        publishable: sliceIssueVersions.publishable,
      })
      .from(sliceIssueVersions)
      .where(
        and(eq(sliceIssueVersions.issueId, issueId), eq(sliceIssueVersions.contentHash, hash)),
      )
      .limit(1);

    if (existing !== undefined) {
      /*
       * The idempotent retry. The version is read back rather than re-created,
       * and — importantly — its status is left alone: a draft the commissioner
       * has already rejected does not quietly return to the queue because a job
       * ran again.
       */
      return {
        outcome: 'noop' as const,
        issueId,
        versionId: existing.id,
        version: existing.version,
        publishable: existing.publishable,
        refusal: null,
      };
    }

    const [{ next } = { next: 1 }] = await tx
      .select({ next: sql<number>`coalesce(max(${sliceIssueVersions.version}), 0) + 1` })
      .from(sliceIssueVersions)
      .where(eq(sliceIssueVersions.issueId, issueId));

    const [written] = await tx
      .insert(sliceIssueVersions)
      .values({
        issueId,
        version: Number(next),
        status: 'draft',
        renderer: 'template',
        content: edition as unknown as Record<string, unknown>,
        contentHash: hash,
        verdict: assembled.verdict as unknown as Record<string, unknown>,
        publishable: assembled.verdict.publishable,
        packet: assembled.packet as unknown as Record<string, unknown>,
        createdAt: at,
      })
      .returning({ id: sliceIssueVersions.id, version: sliceIssueVersions.version });

    if (written === undefined) throw new Error('the slice version was not written');

    await tx.insert(sliceReviews).values({
      issueId,
      versionId: written.id,
      action: 'generated',
      actorUserId: input.actorUserId,
      note: null,
      occurredAt: at,
    });

    if (input.submit) {
      await tx
        .update(sliceIssueVersions)
        .set({ status: 'needs_review', decidedAt: at })
        .where(eq(sliceIssueVersions.id, written.id));

      await tx.insert(sliceReviews).values({
        issueId,
        versionId: written.id,
        action: 'submitted',
        actorUserId: input.actorUserId,
        note: null,
        occurredAt: at,
      });
    }

    return {
      outcome: 'created' as const,
      issueId,
      versionId: written.id,
      version: written.version,
      publishable: assembled.verdict.publishable,
      refusal: null,
    };
  });
}

/**
 * Find or create the issue for one week.
 *
 * Written as select-then-insert-then-select rather than an upsert because
 * `slice_issues` carries a trigger on INSERT and an `ON CONFLICT DO NOTHING`
 * would leave the caller without an id. The final select is the concurrency
 * case: two Tuesdays racing, one loses the unique constraint and reads the
 * winner's row.
 */
async function ensureIssue(
  tx: Queryable,
  input: { readonly seasonId: string; readonly week: number; readonly at: Date },
): Promise<string> {
  const [found] = await tx
    .select({ id: sliceIssues.id })
    .from(sliceIssues)
    .where(and(eq(sliceIssues.seasonId, input.seasonId), eq(sliceIssues.week, input.week)))
    .limit(1);

  if (found !== undefined) return found.id;

  const [created] = await tx
    .insert(sliceIssues)
    .values({
      seasonId: input.seasonId,
      week: input.week,
      createdAt: input.at,
      updatedAt: input.at,
    })
    .onConflictDoNothing()
    .returning({ id: sliceIssues.id });

  if (created !== undefined) return created.id;

  const [raced] = await tx
    .select({ id: sliceIssues.id })
    .from(sliceIssues)
    .where(and(eq(sliceIssues.seasonId, input.seasonId), eq(sliceIssues.week, input.week)))
    .limit(1);

  if (raced === undefined) throw new Error('the slice issue was neither created nor found');
  return raced.id;
}

/**
 * What the commissioner is being asked about.
 *
 * Deliberately not *"every issue"*. The queue is a list of decisions waiting to
 * be made, and an issue that has been published is not a decision — it is
 * history, reachable from the same screen but not competing with the thing that
 * needs doing.
 */
export async function reviewQueue(db: Queryable): Promise<readonly QueuedIssue[]> {
  return listIssues(db, ['draft', 'needs_review']);
}

/** Approved and waiting to go on the rack. One tap away from published. */
export async function approvedQueue(db: Queryable): Promise<readonly QueuedIssue[]> {
  return listIssues(db, ['approved']);
}

/** What has been published, newest first. The archive, and the audit trail's spine. */
export async function publishedIssues(db: Queryable): Promise<readonly QueuedIssue[]> {
  return listIssues(db, ['published']);
}

/** Refused versions, most recent first. Kept visible: a rejection is a decision. */
export async function rejectedVersions(db: Queryable): Promise<readonly QueuedIssue[]> {
  return listIssues(db, ['rejected']);
}

async function listIssues(
  db: Queryable,
  statuses: readonly (typeof sliceIssueVersions.$inferSelect)['status'][],
): Promise<readonly QueuedIssue[]> {
  const rows = await db
    .select({
      issueId: sliceIssues.id,
      season: seasons.year,
      week: sliceIssues.week,
      versionId: sliceIssueVersions.id,
      version: sliceIssueVersions.version,
      status: sliceIssueVersions.status,
      publishable: sliceIssueVersions.publishable,
      content: sliceIssueVersions.content,
      createdAt: sliceIssueVersions.createdAt,
      publishedVersionId: sliceIssues.publishedVersionId,
    })
    .from(sliceIssueVersions)
    .innerJoin(sliceIssues, eq(sliceIssues.id, sliceIssueVersions.issueId))
    .innerJoin(seasons, eq(seasons.id, sliceIssues.seasonId))
    .where(inArray(sliceIssueVersions.status, [...statuses]))
    .orderBy(desc(seasons.year), desc(sliceIssues.week), desc(sliceIssueVersions.version));

  return rows.map((row) => ({
    issueId: row.issueId,
    season: row.season,
    week: row.week,
    versionId: row.versionId,
    version: row.version,
    status: row.status,
    publishable: row.publishable,
    headline: headlineOf(row.content),
    createdAt: row.createdAt,
    publishedVersionId: row.publishedVersionId,
  }));
}

/**
 * The stored edition's headline, for a list row.
 *
 * Read out of the stored JSON rather than re-rendered. The queue must show what
 * the version *says*, and a re-render would show what today's renderer would say
 * about the same week — which is the thing storage exists to prevent.
 */
function headlineOf(content: Record<string, unknown>): string {
  const headline = content['headline'];
  return typeof headline === 'string' ? headline : '(no headline)';
}

/** One version, with everything `08 §22` requires the screen to show. */
export async function reviewDetail(
  db: Queryable,
  versionId: string,
): Promise<ReviewDetail | null> {
  const [row] = await db
    .select({
      issueId: sliceIssues.id,
      season: seasons.year,
      week: sliceIssues.week,
      versionId: sliceIssueVersions.id,
      version: sliceIssueVersions.version,
      status: sliceIssueVersions.status,
      renderer: sliceIssueVersions.renderer,
      contentHash: sliceIssueVersions.contentHash,
      publishable: sliceIssueVersions.publishable,
      content: sliceIssueVersions.content,
      verdict: sliceIssueVersions.verdict,
      packet: sliceIssueVersions.packet,
      createdAt: sliceIssueVersions.createdAt,
    })
    .from(sliceIssueVersions)
    .innerJoin(sliceIssues, eq(sliceIssues.id, sliceIssueVersions.issueId))
    .innerJoin(seasons, eq(seasons.id, sliceIssues.seasonId))
    .where(eq(sliceIssueVersions.id, versionId))
    .limit(1);

  if (row === undefined) return null;

  const history = await db
    .select({
      action: sliceReviews.action,
      actorName: users.displayName,
      note: sliceReviews.note,
      occurredAt: sliceReviews.occurredAt,
    })
    .from(sliceReviews)
    .leftJoin(users, eq(users.id, sliceReviews.actorUserId))
    /*
     * By `seq`, not by `occurredAt`.
     *
     * The clock is injected and two decisions can land inside one transaction,
     * so several rows share an instant — and ordering by the timestamp printed
     * *"put up for review"* above *"drafted"*, which is a record of events in the
     * wrong order on the screen whose job is to be the record.
     */
    .where(eq(sliceReviews.versionId, versionId))
    .orderBy(sliceReviews.seq);

  const siblings = await db
    .select({
      versionId: sliceIssueVersions.id,
      version: sliceIssueVersions.version,
      status: sliceIssueVersions.status,
    })
    .from(sliceIssueVersions)
    .where(eq(sliceIssueVersions.issueId, row.issueId))
    .orderBy(desc(sliceIssueVersions.version));

  return {
    issueId: row.issueId,
    season: row.season,
    week: row.week,
    versionId: row.versionId,
    version: row.version,
    status: row.status,
    renderer: row.renderer,
    contentHash: row.contentHash,
    publishable: row.publishable,
    edition: row.content as unknown as Edition,
    verdict: row.verdict as unknown as Verdict,
    packet: row.packet as unknown as FactPacket,
    createdAt: row.createdAt,
    history,
    siblings,
  };
}

export class PublicationRefused extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'PublicationRefused';
  }
}

/** Put a draft in front of the commissioner. */
export async function submitForReview(
  db: Database,
  input: { readonly versionId: string; readonly actorUserId?: string | null },
): Promise<void> {
  await move(db, {
    versionId: input.versionId,
    to: 'needs_review',
    action: 'submitted',
    actorUserId: input.actorUserId ?? null,
    note: null,
  });
}

/**
 * Approve a version.
 *
 * The decision `08 §29` makes mandatory. It names a person — the CHECK in `0011`
 * refuses an approval row with no actor — and the trigger that publishes reads
 * *this row*, not the status column, so a service that skipped it could not
 * publish.
 */
export async function approveVersion(
  db: Database,
  input: { readonly versionId: string; readonly actorUserId: string; readonly note?: string | null },
): Promise<void> {
  await move(db, {
    versionId: input.versionId,
    to: 'approved',
    action: 'approved',
    actorUserId: input.actorUserId,
    note: input.note ?? null,
  });
}

/**
 * Reject a version, with a reason.
 *
 * Terminal for that version. Revising means generating a new one, so the prose
 * that was refused survives beside the prose that replaced it — `08 §23` on not
 * silently rewriting history, applied to drafts as well as to published issues.
 */
export async function rejectVersion(
  db: Database,
  input: { readonly versionId: string; readonly actorUserId: string; readonly note: string },
): Promise<void> {
  if (input.note.trim() === '') {
    throw new PublicationRefused('a rejection needs a reason the next version can be written against');
  }

  await move(db, {
    versionId: input.versionId,
    to: 'rejected',
    action: 'rejected',
    actorUserId: input.actorUserId,
    note: input.note,
  });
}

/**
 * Publish an approved version.
 *
 * One transaction doing four things that must all hold together: the previous
 * published version is superseded, this one becomes published, the issue's
 * pointer moves, and the audit row is written. Any of them alone is a half-published
 * issue.
 *
 * Three refusals are the database's rather than this function's, and that is the
 * point — a caller that forgot one of them would still be refused:
 *
 *   - not approved, or approved with no named person → the transition trigger
 *   - the manual hold is on → the transition trigger (`16 §9`)
 *   - the validator refused this version → `slice_versions_unpublishable_stays_out`
 */
export async function publishVersion(
  db: Database,
  input: { readonly versionId: string; readonly actorUserId: string },
): Promise<{ readonly issueId: string; readonly supersededVersionId: string | null }> {
  const at = now();

  return db.transaction(async (tx) => {
    const [version] = await tx
      .select({
        id: sliceIssueVersions.id,
        issueId: sliceIssueVersions.issueId,
        status: sliceIssueVersions.status,
      })
      .from(sliceIssueVersions)
      .where(eq(sliceIssueVersions.id, input.versionId))
      .limit(1);

    if (version === undefined) throw new PublicationRefused('no such slice version');

    if (version.status === 'published') {
      /*
       * The idempotent retry. A publish that ran, committed, and then lost its
       * response is answered by reading the state back rather than by a second
       * publication — the same shape as `openBox` finding its box already open.
       */
      return { issueId: version.issueId, supersededVersionId: null };
    }

    const [previous] = await tx
      .select({ id: sliceIssueVersions.id })
      .from(sliceIssueVersions)
      .where(
        and(
          eq(sliceIssueVersions.issueId, version.issueId),
          eq(sliceIssueVersions.status, 'published'),
        ),
      )
      .limit(1);

    if (previous !== undefined) {
      /*
       * Clear the pointer first. `slice_versions_one_published` is a unique
       * index, so the old version has to leave `published` before the new one
       * arrives, and `slice_issues_pointer_agrees` refuses a pointer at a
       * version that is no longer published.
       */
      await tx
        .update(sliceIssues)
        .set({ publishedVersionId: null, publishedAt: null, updatedAt: at })
        .where(eq(sliceIssues.id, version.issueId));

      await tx
        .update(sliceIssueVersions)
        .set({ status: 'superseded', decidedAt: at })
        .where(eq(sliceIssueVersions.id, previous.id));

      await tx.insert(sliceReviews).values({
        issueId: version.issueId,
        versionId: previous.id,
        action: 'superseded',
        actorUserId: input.actorUserId,
        note: `replaced by a corrected version`,
        occurredAt: at,
      });
    }

    await tx
      .update(sliceIssueVersions)
      .set({ status: 'published', decidedAt: at })
      .where(eq(sliceIssueVersions.id, input.versionId));

    await tx
      .update(sliceIssues)
      .set({ publishedVersionId: input.versionId, publishedAt: at, updatedAt: at })
      .where(eq(sliceIssues.id, version.issueId));

    await tx.insert(sliceReviews).values({
      issueId: version.issueId,
      versionId: input.versionId,
      action: 'published',
      actorUserId: input.actorUserId,
      note: null,
      occurredAt: at,
    });

    return {
      issueId: version.issueId,
      supersededVersionId: previous?.id ?? null,
    };
  });
}

/** Move one version's status and record why, in one transaction. */
async function move(
  db: Database,
  input: {
    readonly versionId: string;
    readonly to: (typeof sliceIssueVersions.$inferSelect)['status'];
    readonly action: (typeof sliceReviews.$inferSelect)['action'];
    readonly actorUserId: string | null;
    readonly note: string | null;
  },
): Promise<void> {
  const at = now();

  await db.transaction(async (tx) => {
    const [version] = await tx
      .select({
        id: sliceIssueVersions.id,
        issueId: sliceIssueVersions.issueId,
        status: sliceIssueVersions.status,
      })
      .from(sliceIssueVersions)
      .where(eq(sliceIssueVersions.id, input.versionId))
      .limit(1);

    if (version === undefined) throw new PublicationRefused('no such slice version');

    /*
     * Already there — say so and write nothing.
     *
     * A commissioner double-tapping Approve is not making a second decision, and
     * `slice_reviews_one_per_action` would refuse the duplicate row anyway. This
     * turns that refusal into the no-op it should be for the *same* decision,
     * while a genuinely wrong move (approving something already published) still
     * reaches the transition trigger and is refused there.
     */
    if (version.status === input.to) return;

    await tx
      .update(sliceIssueVersions)
      .set({ status: input.to, decidedAt: at })
      .where(eq(sliceIssueVersions.id, input.versionId));

    await tx.insert(sliceReviews).values({
      issueId: version.issueId,
      versionId: input.versionId,
      action: input.action,
      actorUserId: input.actorUserId,
      note: input.note,
      occurredAt: at,
    });
  });
}

/**
 * The desk with nothing on it — `?desk=empty`.
 *
 * ## Why this one state is a preview rather than a demo seat
 *
 * Every other press-desk state is produced by driving the real chain on a
 * reserved seat, which is stronger evidence and is what `apply.ts` does. An
 * *empty* queue cannot work that way, and the reason is structural: an issue
 * belongs to the **league**, not to a seat. Once any other press-desk demo has
 * drafted something, the desk is not empty for anybody — and the visual driver
 * loops widths on the outside, so the second and third passes would photograph a
 * populated desk, file it under `review-empty`, and pass.
 *
 * That is the exact shape of false green the nine `reveal-*` states cost a
 * milestone to. So the empty desk is what it actually is — **a rendering** — and
 * `MANDATE §8` sanctions a preview-only query parameter for precisely this.
 *
 * It writes nothing, and it is refused outright in production.
 */
export function emptyDeskPreview(
  raw: string | string[] | undefined,
  env: Record<string, string | undefined>,
): boolean {
  if (raw !== 'empty') return false;

  try {
    assertDemoAllowed(env);
  } catch (error: unknown) {
    if (error instanceof DemoRefused) return false;
    throw error;
  }

  return true;
}

/**
 * The week a hand-drafted issue defaults to.
 *
 * The most recent week the season has results for, because that is the week
 * `16 §4.3`'s Tuesday job would be drafting. One in a season that has not started
 * — which is the honest answer today, and it is a *default*, not a constraint:
 * the field is editable and `generateDraft` refuses a week with nothing in it on
 * its own terms.
 *
 * Read from `fantasy_matchups` rather than from the clock, because a clock says
 * what day it is and this question is *"what has been played"*.
 */
export async function suggestedDraftWeek(
  db: Queryable,
  seasonYear: number,
): Promise<number> {
  const [row] = await db
    .select({ week: sql<number | null>`max(${fantasyMatchups.week})` })
    .from(fantasyMatchups)
    .innerJoin(seasons, eq(seasons.id, fantasyMatchups.seasonId))
    .where(eq(seasons.year, seasonYear));

  const week = row?.week;
  return week === null || week === undefined ? 1 : Number(week);
}

// ---------------------------------------------------------------------------
// The manual hold (`16 §9`, permanent)
// ---------------------------------------------------------------------------

export interface HoldState {
  readonly held: boolean;
  readonly reason: string | null;
  readonly actorName: string | null;
  readonly since: Date | null;
}

/** Is publication stopped, and who stopped it. Never inferred — always the latest row. */
export async function publicationHold(db: Queryable): Promise<HoldState> {
  const [latest] = await db
    .select({
      held: slicePublicationHolds.held,
      reason: slicePublicationHolds.reason,
      actorName: users.displayName,
      occurredAt: slicePublicationHolds.occurredAt,
    })
    .from(slicePublicationHolds)
    .leftJoin(users, eq(users.id, slicePublicationHolds.actorUserId))
    .orderBy(desc(slicePublicationHolds.seq))
    .limit(1);

  if (latest === undefined) {
    return { held: false, reason: null, actorName: null, since: null };
  }

  return {
    held: latest.held,
    reason: latest.reason,
    actorName: latest.actorName,
    since: latest.occurredAt,
  };
}

/**
 * Flip the hold.
 *
 * Append-only: engaging and releasing are both new rows, so a year later the
 * question *"was publication stopped that week, and who stopped it"* has an
 * answer. A boolean column would only ever answer *"is it stopped now"*.
 */
export async function setPublicationHold(
  db: Database,
  input: { readonly held: boolean; readonly actorUserId: string; readonly reason?: string | null },
): Promise<void> {
  /*
   * The record is of *changes*. Stopping a press that is already stopped is not
   * an event, and appending a row for it would make the history grow every time
   * somebody re-confirmed a state rather than every time one changed.
   */
  const current = await publicationHold(db);
  if (current.held === input.held) return;

  await db.insert(slicePublicationHolds).values({
    held: input.held,
    actorUserId: input.actorUserId,
    reason: input.reason ?? null,
    occurredAt: now(),
  });
}

// ---------------------------------------------------------------------------
// What the rack serves
// ---------------------------------------------------------------------------

export interface RackIssue {
  readonly edition: Edition;
  /** Set when the paper on the rack is not this season's. Printed on the sheet. */
  readonly stamp: string | null;
  /** True when it came through the approval chain rather than the historical fallback. */
  readonly approved: boolean;
}

/**
 * The most recently published issue, or null.
 *
 * **The rack's authority.** Served from `content` rather than re-rendered:
 * `08 §28` — the published issue is stored content — so a stat correction landing
 * in March cannot silently reword an issue printed in October. Correcting one is
 * a new version through the same chain, which leaves both on the record.
 */
export async function latestPublishedIssue(db: Queryable): Promise<{
  readonly edition: Edition;
  readonly season: number;
  readonly week: number;
} | null> {
  const [row] = await db
    .select({
      content: sliceIssueVersions.content,
      season: seasons.year,
      week: sliceIssues.week,
    })
    .from(sliceIssues)
    .innerJoin(sliceIssueVersions, eq(sliceIssueVersions.id, sliceIssues.publishedVersionId))
    .innerJoin(seasons, eq(seasons.id, sliceIssues.seasonId))
    .orderBy(desc(sliceIssues.publishedAt))
    .limit(1);

  if (row === undefined) return null;

  return { edition: row.content as unknown as Edition, season: row.season, week: row.week };
}

/**
 * What is actually on the rack, and where it came from.
 *
 * Two sources, in this order, and the order is the product rule:
 *
 * 1. **The most recently published issue.** Once the chain has approved
 *    anything, that is the paper — nothing else may reach the rack.
 * 2. **The historical rendering** (`latestEdition`), for the one state
 *    publication cannot answer: the shop before the first issue has ever been
 *    approved. A finished season, rendered by the same pipeline, stamped as last
 *    season's.
 *
 * The fallback is not a hole in `16 §9`'s gate. The gate is about **live weekly
 * publication**; this is a season that closed in January, and the moment a live
 * issue is approved it stops being reachable. Making it the *second* source
 * rather than the only one is what turns approval into the authority.
 */
export async function rackIssue(
  db: Queryable,
  input: { readonly openSeasonYear: number | null },
): Promise<RackIssue | null> {
  const published = await latestPublishedIssue(db);

  if (published !== null) {
    const current =
      input.openSeasonYear !== null && published.season === input.openSeasonYear;
    return {
      edition: published.edition,
      stamp: current ? null : 'Last one Tony printed',
      approved: true,
    };
  }

  const historical = await latestEdition(db);
  if (historical === null) return null;

  return { edition: historical, stamp: 'Last one Tony printed', approved: false };
}
