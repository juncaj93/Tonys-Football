import 'server-only';

import { type Database, type Queryable } from '@/lib/db';
import {
  PublicationRefused,
  approveVersion,
  approvedQueue,
  publicationHold,
  publishVersion,
  publishedIssues,
  reviewDetail,
  reviewQueue,
  type QueuedIssue,
} from '@/lib/slice/publication';

import { type PublicationKindKey, type Readiness, type ReviewItem } from './item';

/**
 * Every kind of thing that reaches the league as **authored editorial content**,
 * and how the commissioner's queue lists and decides one.
 *
 * ## The audit this file is the conclusion of
 *
 * `docs/PUBLICATION_APPROVAL_BOUNDARY.md` carries the full matrix. The short
 * version, because the *absences* are the load-bearing part:
 *
 * - **The Slice is the only editorial publication in the product.** It is here.
 * - **Everything Sleeper-derived is not editorial and is deliberately absent** —
 *   final scores, records, standings, week finalization, token settlements,
 *   weekly rewards, earned rings. `MANDATE §9` makes Stats the authority on what
 *   a result meant, and a commissioner stamp on a matchup result would be a
 *   person approving a fact. Routing those through a review state would be the
 *   *failure* this queue exists to prevent, not an extension of it.
 * - **Manager-authored surfaces are not commissioner publications** — the
 *   Showcase, a basement, a character. A manager putting their own ring in their
 *   own window is not Tony printing something.
 * - **The content engine is authored editorial and is reviewed in the
 *   repository**, not at runtime: `content_entries` is seeded from `content/*.md`
 *   by a deploy step, there is no runtime authoring surface anywhere, and the
 *   review is the pull request. Adding a runtime editor for it would create a
 *   publication path that needs a kind here — which is the trigger to come back
 *   to this file, and it is recorded in the boundary document as such.
 * - **Announcements, Season Story and basement spotlights do not exist.** All
 *   three are specified and unimplemented; a kind for a surface with no rows is
 *   a queue section that can only ever be empty.
 *
 * ## Why a registry at all, for a population of one
 *
 * Because the queue must be able to say *"nothing is waiting"* and be believed,
 * and the only way that sentence stays true is if adding a publication surface
 * means adding it **here** rather than remembering to. `kinds.test.ts` asserts
 * the list is closed and that every key has a definition; a new editorial
 * surface that forgets this file is a compile error rather than an invisible
 * hole in `16 §9`.
 */

/** What a decision achieved. Read back rather than assumed — see `decide`. */
export interface DecisionOutcome {
  /** An approval naming a person exists now. */
  readonly approved: boolean;
  /** It is on the rack now. */
  readonly published: boolean;
  /**
   * Why it was stamped but not printed, in the room's words. Null when printed.
   *
   * The one thing that produces this in practice is the manual hold (`16 §9`),
   * and the outcome is the correct one: the approval is a real decision and it
   * stands, the printing waits, and tapping again when the press runs finishes
   * the job.
   */
  readonly heldBack: string | null;
  /** Nothing moved, because it was already where the tap would have put it. */
  readonly idempotent: boolean;
}

export interface DecisionInput {
  readonly id: string;
  readonly actorUserId: string;
  /**
   * The digest the commissioner was shown.
   *
   * Not optional, and not read from the item at decision time — the whole point
   * is that it comes back from the page that was *read*, so the server can
   * refuse to print bytes other than those bytes.
   */
  readonly digest: string;
}

export interface PublicationKind {
  readonly key: PublicationKindKey;
  /** What Tony calls it. Printed as the item's type. */
  readonly label: string;
  /** Everything outstanding, plus what was recently decided. */
  list(db: Queryable): Promise<readonly ReviewItem[]>;
  /** Approve and, unless something stops it, publish. Server-authoritative. */
  decide(db: Database, input: DecisionInput): Promise<DecisionOutcome>;
}

/**
 * How many published issues the queue carries.
 *
 * History is reachable from the same screen and it is not a task, so it is
 * capped rather than paginated: the queue's job is *"what needs me"*, and the
 * Slice's own desk at `/admin/slice` already lists the full rack.
 */
const RECENT_PUBLISHED = 3;

const slice: PublicationKind = {
  key: 'slice',
  label: 'Tony’s Tuesday Slice',

  async list(db) {
    const [waiting, approved, published, hold] = await Promise.all([
      reviewQueue(db),
      approvedQueue(db),
      publishedIssues(db),
      publicationHold(db),
    ]);

    /*
     * The hold explains an *approved* item and nothing else.
     *
     * It is league-wide and it stops publication, not approval — so a draft
     * waiting to be read is still a draft waiting to be read while the press is
     * stopped, and saying otherwise on its row would be inventing a blocker.
     * What it genuinely explains is the item that has been stamped and is
     * sitting there unprinted, which without this reads as a job half done.
     */
    const heldReason =
      hold.held
        ? hold.reason === null
          ? 'The press is stopped.'
          : `The press is stopped — “${hold.reason}”`
        : null;

    const outstanding = waiting.map((issue) => {
      if (issue.status === 'draft') return toItem(issue, 'incomplete', null);
      if (issue.publishable) return toItem(issue, 'ready', null);
      return toItem(
        issue,
        'blocked',
        'The check refused this copy, so no stamp can print it.',
      );
    });

    return [
      ...outstanding,
      ...approved.map((issue) => toItem(issue, 'approved', heldReason)),
      ...published.slice(0, RECENT_PUBLISHED).map((issue) => toItem(issue, 'published', null)),
    ];
  },

  async decide(db, input) {
    /*
     * Everything below re-reads from the database. Nothing the form posted is
     * trusted except the two things only the form can supply — *which* item, and
     * *which copy of it the commissioner read*.
     */
    const detail = await reviewDetail(db, input.id);
    if (detail === null) throw new PublicationRefused('no such slice version');

    if (detail.status === 'published') {
      /*
       * The idempotent retry, and it is checked **before** the digest.
       *
       * A double-tap, a refresh of the redirect, or a retried request arrives
       * here with the same id and the same digest and must be a no-op — but so
       * must a second tap from a tab opened *after* the first one printed. The
       * state is the answer either way, and re-deriving it costs nothing.
       */
      return { approved: true, published: true, heldBack: null, idempotent: true };
    }

    /*
     * The copy that was read is the copy that prints.
     *
     * For the Slice this is belt as well as braces: a version's content is
     * immutable at the database (`0011`), so the bytes behind an id cannot move
     * under a commissioner who is reading them. It is here because it is the
     * **contract** — a kind whose content is editable would need exactly this
     * and would be a silent hazard without it — and because "immutable" is a
     * property somebody has to keep true, not one to take on trust from a
     * comment. `publication.test.ts` proves it refuses.
     */
    if (detail.contentHash !== input.digest) {
      throw new PublicationRefused(
        'the copy changed since you read it — open it again and read the new one',
      );
    }

    /*
     * Readiness, re-derived at decision time.
     *
     * The Approve stamp is disabled on the screen when the check refused the
     * copy; a disabled button is not authorization, and a client-crafted POST
     * arrives here with the button never having existed. The database refuses it
     * too (`slice_versions_unpublishable_stays_out`) — this is the sentence a
     * person can read, ahead of the constraint that is the guarantee.
     */
    if (!detail.publishable) {
      throw new PublicationRefused(
        'the deterministic check refused this copy, so it cannot be approved',
      );
    }

    if (detail.status !== 'needs_review' && detail.status !== 'approved') {
      throw new PublicationRefused(
        `a ${detail.status.replace(/_/g, ' ')} draft is not waiting on a decision`,
      );
    }

    if (detail.status === 'needs_review') {
      await approveVersion(db, { versionId: input.id, actorUserId: input.actorUserId });
    }

    /*
     * The hold, read after the stamp and before the press.
     *
     * `16 §9` makes it permanent and it stops **publication**. Approving during
     * a hold is a legitimate and useful thing to do — stamp it now, print it
     * when the correction has landed — so the composite completes the half it
     * may and reports the half it may not, rather than refusing the whole tap.
     *
     * The guarantee is still the transition trigger, not this read: a hold that
     * lands in the microseconds between here and the publish is refused by the
     * database, and that error is allowed to propagate rather than being
     * flattened into a success.
     */
    const hold = await publicationHold(db);
    if (hold.held) {
      return {
        approved: true,
        published: false,
        heldBack:
          hold.reason === null
            ? 'the press is stopped'
            : `the press is stopped — “${hold.reason}”`,
        idempotent: false,
      };
    }

    await publishVersion(db, { versionId: input.id, actorUserId: input.actorUserId });
    return { approved: true, published: true, heldBack: null, idempotent: false };
  },
};

function toItem(issue: QueuedIssue, readiness: Readiness, blockedReason: string | null): ReviewItem {
  return {
    kind: 'slice',
    id: issue.versionId,
    title: issue.headline,
    subject: `Season ${String(issue.season)} · Week ${String(issue.week)}`,
    readiness,
    blockedReason: readiness === 'blocked' || readiness === 'approved' ? blockedReason : null,
    factsVerified: issue.publishable,
    digest: issue.contentHash,
    updatedAt: issue.decidedAt ?? issue.createdAt,
    href: `/admin/slice/${issue.versionId}`,
  };
}

/**
 * The closed registry. A kind that is not in here is not in the queue.
 *
 * ## What is deliberately not listed, twice over
 *
 * Refused drafts have no band and no row. A refusal is a decision that **was
 * made**, so it is neither outstanding nor recently published — and it is
 * already listed, with its reason, on the Slice's own desk. Giving it a queue
 * row would mean either inventing a sixth band for a thing that needs nothing,
 * or filing it under one that lies about what happened to it.
 */
export const PUBLICATION_KINDS: Readonly<Record<PublicationKindKey, PublicationKind>> = {
  slice,
};
