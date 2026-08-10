import 'server-only';

import { type Database, type Queryable } from '@/lib/db';

import { byPriority, isOutstanding, type PublicationKindKey, type ReviewItem } from './item';
import { PUBLICATION_KINDS, type DecisionOutcome } from './kinds';

/**
 * The one place the commissioner looks.
 *
 * `16 §9` requires a person to approve editorial publication. It does not say
 * where that happens, and until this existed the answer was *"on the Slice's own
 * desk"* — correct while the Slice is the only editorial surface, and a hole the
 * moment it is not. A gate nobody can find the door to is a gate that gets
 * routed around.
 *
 * ## It computes nothing about the items
 *
 * Every field on a `ReviewItem` comes from the kind that owns it — including
 * `factsVerified`, which is the shipping validator's verdict carried forward
 * rather than a judgement made here. This file merges lists and sorts them. A
 * queue that could decide whether facts checked out would be a second authority
 * on the same question, which is the failure `MANDATE §10` names.
 */

export interface CommissionerQueue {
  /** Waiting on the commissioner, in the order they should be dealt with. */
  readonly outstanding: readonly ReviewItem[];
  /** Recently published, newest first. History, kept off the top. */
  readonly published: readonly ReviewItem[];
  /** How many things actually need a decision — the badge's number. */
  readonly pending: number;
}

/**
 * Everything every kind is waiting on, merged and ordered.
 *
 * Kinds are listed concurrently and merged by `byPriority`, so the ordering is a
 * property of the queue rather than of whichever kind happened to answer first.
 * With one kind that distinction is invisible; it is the thing that stops the
 * second kind from silently sorting itself to the top.
 */
export async function commissionerQueue(db: Queryable): Promise<CommissionerQueue> {
  const lists = await Promise.all(
    Object.values(PUBLICATION_KINDS).map(async (kind) => kind.list(db)),
  );

  const all = lists.flat().sort(byPriority);
  const outstanding = all.filter(isOutstanding);

  return {
    outstanding,
    published: all.filter((item) => item.readiness === 'published'),
    pending: countPending(outstanding),
  };
}

/**
 * How many of these actually need the commissioner — the badge's number.
 *
 * `incomplete` does not count. The badge answers *"is there anything for me"*,
 * and a draft that has not been put up for review is not for anybody yet: the
 * Tuesday job submits what it drafts, so the only way to make one is to ask for
 * a draft by hand and stop. Counting it would put a permanent 1 beside the
 * office door for a state nobody can act on, which is how a badge stops being
 * read.
 *
 * Exported so the review preview counts by the same rule rather than by a second
 * copy of it — a filtered queue whose count disagreed with its own list would be
 * a screenshot that contradicts itself.
 */
export function countPending(items: readonly ReviewItem[]): number {
  return items.filter(
    (item) =>
      item.readiness === 'ready' ||
      item.readiness === 'approved' ||
      item.readiness === 'blocked',
  ).length;
}

/**
 * How many decisions are waiting — the number beside the office door.
 *
 * Its own function because the badge is rendered on pages that have no other
 * reason to load a queue, and *"count"* must not drift from *"what the queue
 * shows"*: it is the same call, projected.
 */
export async function pendingDecisions(db: Queryable): Promise<number> {
  const queue = await commissionerQueue(db);
  return queue.pending;
}

/**
 * Approve one item and, unless something stops it, publish it.
 *
 * ## One tap, two operations, and both halves are deliberate
 *
 * The **product** is one gesture. This is a ten-person private league; a
 * separate "now schedule it" stage buys nothing, and every extra tap between
 * reading the paper and printing it is a tap on which the paper is approved but
 * not on the rack.
 *
 * The **backend** keeps the two apart, because one of them has a permanent
 * switch across it: `16 §9`'s manual hold stops publication and not approval. A
 * collapsed operation would have to either refuse the whole tap while the press
 * is stopped — losing a decision the commissioner is entitled to make — or
 * pretend the hold does not exist. So the composite completes what it may,
 * reports what it may not, and finishes the job when tapped again.
 *
 * That also makes it **resumable rather than atomic**, which is the right shape
 * here: the halves are already individually idempotent and individually audited,
 * and a crash between them leaves a real approval on the record and an item in
 * the `approved` band saying exactly what is left to do. An atomic version would
 * roll the approval back and lose the fact that a person read the paper.
 *
 * Authority is **not** checked here. It is checked in the server action, from
 * the session, and `actorUserId` is what that check produced — never a field.
 */
export async function decide(
  db: Database,
  input: {
    readonly kind: PublicationKindKey;
    readonly id: string;
    readonly actorUserId: string;
    readonly digest: string;
  },
): Promise<DecisionOutcome> {
  const kind = PUBLICATION_KINDS[input.kind];
  return kind.decide(db, { id: input.id, actorUserId: input.actorUserId, digest: input.digest });
}

/** Is this a kind the registry knows? The guard a posted field has to pass. */
export function isPublicationKind(value: unknown): value is PublicationKindKey {
  return typeof value === 'string' && Object.hasOwn(PUBLICATION_KINDS, value);
}
