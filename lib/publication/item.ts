/**
 * What the commissioner is being asked about, whatever it is.
 *
 * ## The gap this closes
 *
 * `16 §9` makes commissioner approval mandatory before editorial content reaches
 * the league, and the Slice's chain (`lib/slice/publication.ts`) implements it
 * completely — for the Slice. What did not exist was **one place to look**:
 * `/admin/slice` is the Slice's own desk, and the day a second editorial surface
 * exists, *"is there anything waiting on me"* becomes a question with two
 * answers in two places. That is how an approval gate gets forgotten rather than
 * bypassed.
 *
 * ## This is a shape, not a framework
 *
 * There is exactly **one** publication kind today. So this file defines the
 * smallest thing a queue needs to list an item and route to its preview, and it
 * defines **no lifecycle of its own** — the readiness values below are a
 * *projection* of the Slice's existing statuses, not a second state machine
 * running beside them. A generalized status column, a generic decision table or
 * a per-kind plugin loader would all be platform engineering for a population of
 * one, and `MANDATE` is explicit about one polished slice over many unfinished
 * ones.
 *
 * The test of whether this earns its place is `kinds.ts`: adding a kind is
 * writing one object literal. If a future kind cannot be expressed as one, the
 * right move is to widen this shape then — with the second kind in front of us —
 * rather than to guess at it now.
 */

/**
 * Where an item sits, from the commissioner's point of view rather than the
 * database's.
 *
 * Five values, and each one answers *"what, if anything, do I do about this"*:
 *
 * - `ready` — it can be approved and printed right now. The only band that is a
 *   completable decision.
 * - `approved` — stamped, not printed. Reachable when the press is held, or when
 *   an Approve & Publish was interrupted after the stamp.
 * - `blocked` — a decision is wanted and cannot be made yet. The deterministic
 *   check refused the copy, and no stamp can override a check.
 * - `incomplete` — drafted and not yet put up for review. Nothing is wanted from
 *   the commissioner; it is here so that a draft cannot go missing.
 * - `published` — done. History, not a task.
 *
 * Deliberately **not** a rename of the Slice's statuses. `rejected` and
 * `superseded` are decisions that were *made*, so they are not queue bands at
 * all — `kinds.ts` files them under what was recently decided.
 */
export type Readiness = 'ready' | 'approved' | 'blocked' | 'incomplete' | 'published';

/** One thing waiting on the commissioner, or recently decided by them. */
export interface ReviewItem {
  /** Which publication kind this is. `kinds.ts` is the closed list. */
  readonly kind: PublicationKindKey;
  /** Stable within its kind. What an action posts. */
  readonly id: string;
  /** What the item *says* — the headline, not a row label. */
  readonly title: string;
  /** Which issue/week/season this is about. `Season 2025 · Week 11`. */
  readonly subject: string;
  readonly readiness: Readiness;
  /**
   * Why it cannot be approved, in the room's words. Null unless `blocked`.
   *
   * A sentence rather than a code, because it is printed. A blocked item that
   * could not say why would be a disabled button with no reason beside it,
   * which is the defect `/admin/slice/[versionId]` already fixed once.
   */
  readonly blockedReason: string | null;
  /**
   * Did the deterministic check pass over every number and proper noun.
   *
   * `MANDATE §9` makes Stats the authority on what a result meant, and the
   * point of surfacing this is that Alex does **not** re-check scores against
   * Sleeper by hand. It is the shipping validator's verdict, carried forward —
   * never a claim this layer computes.
   */
  readonly factsVerified: boolean;
  /**
   * The digest of the bytes being shown.
   *
   * What an approval *names*. Posted back with the decision so the server can
   * refuse to publish something other than the thing that was read.
   */
  readonly digest: string;
  /** When the item last moved. Sorts within a band; never rendered as urgency. */
  readonly updatedAt: Date;
  /** Where the preview lives — the real reader-facing rendering. */
  readonly href: string;
}

/** The closed list of publication kinds. One today, by design. */
export type PublicationKindKey = 'slice';

/**
 * The order the queue is read in.
 *
 * Deterministic and boring, which is the requirement: no countdowns, no
 * "urgent", nothing that changes because time passed. A thing you can act on
 * outranks a thing you cannot, and within a band the most recent work is on top
 * because that is the week everybody is talking about.
 *
 * `published` is last and the queue caps it — history is reachable from the same
 * screen, and it does not compete with the thing that needs doing.
 */
const BAND: Readonly<Record<Readiness, number>> = {
  ready: 0,
  approved: 1,
  blocked: 2,
  incomplete: 3,
  published: 4,
};

export function byPriority(a: ReviewItem, b: ReviewItem): number {
  if (BAND[a.readiness] !== BAND[b.readiness]) return BAND[a.readiness] - BAND[b.readiness];
  if (a.updatedAt.getTime() !== b.updatedAt.getTime()) {
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  }
  /*
   * A total order, not a stable-sort assumption.
   *
   * Two items can share an instant — the clock is injected, and the demo
   * appliers drive several drafts inside one run — and a queue whose order
   * depended on the order rows came back in would photograph differently at
   * three widths under one state name. That failure has shipped here before.
   */
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Is this item something the commissioner still has to do? */
export function isOutstanding(item: ReviewItem): boolean {
  return item.readiness !== 'published';
}
