import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { clearClock, setFixedClock } from '@/lib/clock';
import { readManagerNames, seedManagerNames } from '@/lib/content/managers';
import { closePool, getDb } from '@/lib/db';
import { sliceReviews, users } from '@/lib/db/schema';
import { resetDatabase } from '@/lib/db/test-helpers';
import { assembleIssue } from '@/lib/slice/edition';
import {
  PublicationRefused,
  approveVersion,
  generateDraft,
  publishVersion,
  recordVersion,
  reviewDetail,
  setPublicationHold,
  submitForReview,
} from '@/lib/slice/publication';
import { type Edition } from '@/lib/slice/render';
import { validateEdition } from '@/lib/slice/validate';
import { traverseChain } from '@/lib/sleeper/chain';
import { createFixtureSource } from '@/lib/sleeper/fixtures';
import { persistChain } from '@/lib/sleeper/persist';

import { PUBLICATION_KINDS } from './kinds';
import { commissionerQueue, decide, isPublicationKind, pendingDecisions } from './queue';

/**
 * The commissioner queue and the one gesture that publishes, against a real
 * Postgres.
 *
 * Every guarantee below is asked of the **service**, not of the screen, and the
 * ones that are the database's are asked by giving the service a state only the
 * database can refuse. A disabled button is not authorization (`09 §9`), so
 * nothing here presses one.
 *
 * The list this file owes:
 *
 *   1. readiness is re-derived at decision time, not read from the form
 *   2. a copy the check refused cannot be approved, however it is asked
 *   3. the copy that was read is the copy that prints — a stale digest is refused
 *   4. double-tap, refresh and retry publish exactly once
 *   5. the manual hold approves and stops, rather than half-failing silently
 *   6. an item drafted and not submitted is not counted as waiting
 *   7. the queue's order is a property of the queue, and it is total
 *   8. the registry is closed — a kind that is not in it cannot be decided
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

const LEAGUE_2026 = '1385016656425668608';
const SEASON = 2025;

/** Two publishable weeks, found by asking the pipeline rather than by naming one. */
let WEEKS: number[] = [];

afterAll(async () => {
  if (hasDatabase) await closePool();
});

async function importLeague(): Promise<void> {
  const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, { includeWeeks: true });
  await persistChain(db!, chain, { sourceLabel: 'test', finalizeYears: [2024, 2025] });
  await seedManagerNames(db!, readManagerNames());
}

/** The commissioner. A real row, because an approval names a real person. */
async function commissioner(): Promise<string> {
  const [row] = await db!
    .insert(users)
    .values({ displayName: 'Commissioner', sleeperUserId: 'commish-1', isAdmin: true })
    .returning({ id: users.id });
  return row!.id;
}

/** A draft waiting on a decision, and the digest the screen would have shown. */
async function waiting(week: number): Promise<{ id: string; digest: string }> {
  const draft = await generateDraft(db!, { season: SEASON, week, submit: true });
  expect(draft.versionId).not.toBeNull();
  const detail = await reviewDetail(db!, draft.versionId!);
  return { id: draft.versionId!, digest: detail!.contentHash };
}

/**
 * A draft the deterministic check genuinely refused.
 *
 * The first version of this file flipped `publishable` with an UPDATE, and the
 * **database refused it** — `reject_slice_version_content_edit` makes a version
 * immutable once written, `publishable` included. That is the schema being right
 * and the test being lazy: a verdict that could be edited after the fact is a
 * verdict an approval cannot rest on.
 *
 * So the state is reached the way the demo reaches it and the way a live LLM
 * rendering would produce it: put a score nobody posted into the deck, run the
 * **real** `validateEdition` over it, and record what comes back. The refusal on
 * the row is computed by the shipping validator, and this function insists the
 * validator actually refused — a doctored issue that passed would leave every
 * assertion below testing a publishable draft under a name claiming otherwise.
 */
async function refused(week: number): Promise<{ id: string; digest: string }> {
  const assembled = await assembleIssue(db!, { season: SEASON, week });
  expect(assembled.edition).not.toBeNull();

  const doctored: Edition = {
    ...assembled.edition!,
    deck: 'Somebody 213.77, Somebody Else 96.10',
  };

  const verdict = validateEdition(doctored, assembled.packet);
  expect(verdict.publishable).toBe(false);

  const recorded = await recordVersion(db!, {
    season: SEASON,
    week,
    edition: doctored,
    packet: assembled.packet,
    verdict,
    actorUserId: null,
    submit: true,
  });

  const detail = await reviewDetail(db!, recorded.versionId!);
  expect(detail!.publishable).toBe(false);
  return { id: recorded.versionId!, digest: detail!.contentHash };
}

describe.skipIf(!hasDatabase)('the commissioner queue', () => {
  beforeEach(async () => {
    await resetDatabase(db!);
    setFixedClock('2026-08-01T12:00:00Z');
    await importLeague();

    if (WEEKS.length === 0) {
      const found: number[] = [];
      for (let week = 1; week <= 17 && found.length < 2; week++) {
        const attempt = await generateDraft(db!, { season: SEASON, week });
        if (attempt.outcome === 'created' && attempt.publishable) found.push(week);
      }
      if (found.length < 2) {
        throw new Error('fewer than two publishable weeks in the fixture — the pipeline, not this file');
      }
      WEEKS = found;
      // Found by drafting, so start the real tests from an empty chain.
      await resetDatabase(db!);
      await importLeague();
    }
  });

  afterAll(() => {
    clearClock();
  });

  /* ---------------------------------------------------------------------- */
  /* The queue                                                              */
  /* ---------------------------------------------------------------------- */

  it('is empty, and says nothing is pending, before anything is drafted', async () => {
    const queue = await commissionerQueue(db!);

    expect(queue.outstanding).toEqual([]);
    expect(queue.published).toEqual([]);
    expect(queue.pending).toBe(0);
  });

  it('lists a submitted draft as ready, with the check’s verdict carried forward', async () => {
    const { id, digest } = await waiting(WEEKS[0]!);
    const queue = await commissionerQueue(db!);

    expect(queue.outstanding).toHaveLength(1);
    const item = queue.outstanding[0]!;
    expect(item.kind).toBe('slice');
    expect(item.id).toBe(id);
    expect(item.readiness).toBe('ready');
    expect(item.factsVerified).toBe(true);
    expect(item.blockedReason).toBeNull();
    expect(item.digest).toBe(digest);
    expect(item.title.length).toBeGreaterThan(0);
    expect(item.subject).toContain(String(SEASON));
    expect(item.href).toBe(`/admin/slice/${id}`);
    expect(queue.pending).toBe(1);
  });

  /**
   * A draft that was never put up for review is not waiting on anybody.
   *
   * It is *listed* so it cannot go missing, and it is **not counted**, because a
   * badge that shows a permanent 1 for a state nobody can act on is a badge that
   * stops being read. Both halves are the assertion.
   */
  it('lists an unsubmitted draft but does not count it as pending', async () => {
    await generateDraft(db!, { season: SEASON, week: WEEKS[0]!, submit: false });

    const queue = await commissionerQueue(db!);
    expect(queue.outstanding).toHaveLength(1);
    expect(queue.outstanding[0]!.readiness).toBe('incomplete');
    expect(queue.pending).toBe(0);
    expect(await pendingDecisions(db!)).toBe(0);
  });

  /**
   * Ready outranks approved outranks blocked, and recency breaks ties.
   *
   * Asserted on the *bands* rather than on ids, because the point of the order
   * is that a thing you can complete comes before a thing you cannot.
   */
  it('orders what you can act on above what you cannot, deterministically', async () => {
    const actor = await commissioner();

    const first = await waiting(WEEKS[0]!);
    setFixedClock('2026-08-01T12:05:00Z');
    const second = await waiting(WEEKS[1]!);
    await approveVersion(db!, { versionId: first.id, actorUserId: actor });

    const queue = await commissionerQueue(db!);
    expect(queue.outstanding.map((item) => item.readiness)).toEqual(['ready', 'approved']);
    expect(queue.outstanding[0]!.id).toBe(second.id);
    expect(queue.pending).toBe(2);

    // The same query twice gives the same order — nothing depends on row order.
    const again = await commissionerQueue(db!);
    expect(again.outstanding.map((item) => item.id)).toEqual(
      queue.outstanding.map((item) => item.id),
    );
  });

  it('moves a printed issue out of the outstanding list and into the record', async () => {
    const actor = await commissioner();
    const { id, digest } = await waiting(WEEKS[0]!);
    await decide(db!, { kind: 'slice', id, actorUserId: actor, digest });

    const queue = await commissionerQueue(db!);
    expect(queue.outstanding).toEqual([]);
    expect(queue.pending).toBe(0);
    expect(queue.published.map((item) => item.id)).toEqual([id]);
  });

  /* ---------------------------------------------------------------------- */
  /* Approve & publish                                                      */
  /* ---------------------------------------------------------------------- */

  it('approves and prints in one gesture, and records both decisions against a person', async () => {
    const actor = await commissioner();
    const { id, digest } = await waiting(WEEKS[0]!);

    const outcome = await decide(db!, { kind: 'slice', id, actorUserId: actor, digest });

    expect(outcome).toEqual({ approved: true, published: true, heldBack: null, idempotent: false });

    const detail = await reviewDetail(db!, id);
    expect(detail!.status).toBe('published');

    /*
     * The audit trail is `slice_reviews` — the existing append-only record, not
     * a second table. Both halves of the composite are on it, and both name the
     * commissioner: an approval with nobody on it is refused by `0011`'s CHECK,
     * and the publish trigger reads *that row* rather than the status column.
     */
    const history = detail!.history;
    expect(history.map((event) => event.action)).toEqual([
      'generated',
      'submitted',
      'approved',
      'published',
    ]);
    expect(history.filter((event) => event.action === 'approved')[0]!.actorName).toBe(
      'Commissioner',
    );
    expect(history.filter((event) => event.action === 'published')[0]!.actorName).toBe(
      'Commissioner',
    );
  });

  /**
   * The idempotency the assignment names, asked for in all three of its shapes.
   *
   * A double-tap, a refresh of the result, and a retried request are one thing
   * from the database's point of view — a second call with the same id — and the
   * requirement is that the second one moves nothing at all. Not "publishes the
   * same content again": **writes no row**.
   */
  it('publishes exactly once under a double tap, a refresh and a retry', async () => {
    const actor = await commissioner();
    const { id, digest } = await waiting(WEEKS[0]!);

    const first = await decide(db!, { kind: 'slice', id, actorUserId: actor, digest });
    const second = await decide(db!, { kind: 'slice', id, actorUserId: actor, digest });
    const third = await decide(db!, { kind: 'slice', id, actorUserId: actor, digest });

    expect(first.idempotent).toBe(false);
    expect(second).toEqual({ approved: true, published: true, heldBack: null, idempotent: true });
    expect(third).toEqual(second);

    const rows = await db!
      .select({ action: sliceReviews.action })
      .from(sliceReviews)
      .where(eq(sliceReviews.versionId, id));

    expect(rows.filter((row) => row.action === 'published')).toHaveLength(1);
    expect(rows.filter((row) => row.action === 'approved')).toHaveLength(1);
  });

  /**
   * Ten simultaneous taps.
   *
   * The service's already-published check is a *read*, and under READ COMMITTED
   * several transactions can pass it before the first commits — which is the
   * defect `publication.test.ts` found and fixed with a natural key. The
   * composite adds a second entry point to the same operation, so it is asked
   * the same question.
   */
  it('publishes once when ten taps land together', async () => {
    const actor = await commissioner();
    const { id, digest } = await waiting(WEEKS[0]!);

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, async () =>
        decide(db!, { kind: 'slice', id, actorUserId: actor, digest }),
      ),
    );

    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);

    const rows = await db!
      .select({ action: sliceReviews.action })
      .from(sliceReviews)
      .where(eq(sliceReviews.versionId, id));

    expect(rows.filter((row) => row.action === 'published')).toHaveLength(1);
  });

  /* ---------------------------------------------------------------------- */
  /* Readiness, staleness and the hold                                      */
  /* ---------------------------------------------------------------------- */

  /**
   * The copy that was read is the copy that prints.
   *
   * For the Slice a version's content is immutable at the database, so the
   * honest way to produce a stale digest is to hand the service one — which is
   * exactly what a stale tab, a replayed POST or a second publication kind with
   * editable content would do. The refusal has to come from the server, because
   * the client that composed the request is the thing being doubted.
   */
  it('refuses to print a copy other than the one that was read', async () => {
    const actor = await commissioner();
    const { id } = await waiting(WEEKS[0]!);

    await expect(
      decide(db!, { kind: 'slice', id, actorUserId: actor, digest: 'not-the-one-you-read' }),
    ).rejects.toBeInstanceOf(PublicationRefused);

    expect((await reviewDetail(db!, id))!.status).toBe('needs_review');
  });

  /**
   * A copy the deterministic check refused cannot be approved by asking harder.
   *
   * The screen locks the stamp; this arrives with the stamp never having
   * existed. `publishable` is flipped directly — the only way to reach the state
   * without doctoring prose, and the state is the thing under test.
   */
  it('refuses to approve a copy the check refused, however it is asked', async () => {
    const actor = await commissioner();
    const { id, digest } = await refused(WEEKS[0]!);

    await expect(
      decide(db!, { kind: 'slice', id, actorUserId: actor, digest }),
    ).rejects.toBeInstanceOf(PublicationRefused);

    expect((await reviewDetail(db!, id))!.status).toBe('needs_review');
  });

  it('shows a refused copy as blocked, with a reason, and does not count it as ready', async () => {
    await refused(WEEKS[0]!);
    const queue = await commissionerQueue(db!);
    expect(queue.outstanding[0]!.readiness).toBe('blocked');
    expect(queue.outstanding[0]!.factsVerified).toBe(false);
    expect(queue.outstanding[0]!.blockedReason).not.toBeNull();
    // Still pending — it is a decision that is wanted and cannot be completed.
    expect(queue.pending).toBe(1);
  });

  it('refuses to decide something that is not waiting on a decision', async () => {
    const actor = await commissioner();
    const draft = await generateDraft(db!, { season: SEASON, week: WEEKS[0]!, submit: false });
    const detail = await reviewDetail(db!, draft.versionId!);

    await expect(
      decide(db!, {
        kind: 'slice',
        id: draft.versionId!,
        actorUserId: actor,
        digest: detail!.contentHash,
      }),
    ).rejects.toBeInstanceOf(PublicationRefused);

    await submitForReview(db!, { versionId: draft.versionId!, actorUserId: actor });
    const now = await decide(db!, {
      kind: 'slice',
      id: draft.versionId!,
      actorUserId: actor,
      digest: detail!.contentHash,
    });
    expect(now.published).toBe(true);
  });

  it('refuses an id that names nothing', async () => {
    const actor = await commissioner();
    await expect(
      decide(db!, {
        kind: 'slice',
        id: '00000000-0000-0000-0000-000000000000',
        actorUserId: actor,
        digest: 'anything',
      }),
    ).rejects.toBeInstanceOf(PublicationRefused);
  });

  /**
   * The manual hold approves and stops.
   *
   * `16 §9` makes the hold permanent and it stops **publication**, not approval.
   * So the composite must complete the half it may — the commissioner really did
   * read the paper and really did stamp it — and report the half it may not,
   * rather than refusing the whole gesture or pretending it printed.
   */
  it('stamps but does not print while the press is stopped, and finishes when it runs', async () => {
    const actor = await commissioner();
    const { id, digest } = await waiting(WEEKS[0]!);
    await setPublicationHold(db!, {
      held: true,
      actorUserId: actor,
      reason: 'a scoring correction is still landing',
    });

    const held = await decide(db!, { kind: 'slice', id, actorUserId: actor, digest });
    expect(held.approved).toBe(true);
    expect(held.published).toBe(false);
    expect(held.heldBack).not.toBeNull();
    expect((await reviewDetail(db!, id))!.status).toBe('approved');

    const queue = await commissionerQueue(db!);
    expect(queue.outstanding[0]!.readiness).toBe('approved');
    expect(queue.outstanding[0]!.blockedReason).toContain('press is stopped');

    await setPublicationHold(db!, { held: false, actorUserId: actor });
    const printed = await decide(db!, { kind: 'slice', id, actorUserId: actor, digest });
    expect(printed.published).toBe(true);
    expect((await reviewDetail(db!, id))!.status).toBe('published');
  });

  /* ---------------------------------------------------------------------- */
  /* The registry                                                           */
  /* ---------------------------------------------------------------------- */

  it('is a closed registry — an unknown kind is not a kind', () => {
    expect(isPublicationKind('slice')).toBe(true);
    expect(isPublicationKind('announcement')).toBe(false);
    expect(isPublicationKind('')).toBe(false);
    expect(isPublicationKind(null)).toBe(false);
    /*
     * Object.hasOwn, not `in` — `'toString' in PUBLICATION_KINDS` is true, and a
     * posted `kind=toString` reaching a lookup would be an object-prototype
     * dereference standing in for a publication kind.
     */
    expect(isPublicationKind('toString')).toBe(false);
    expect(isPublicationKind('constructor')).toBe(false);
  });

  it('gives every registered kind a definition and a label', () => {
    for (const [key, kind] of Object.entries(PUBLICATION_KINDS)) {
      expect(kind.key).toBe(key);
      expect(kind.label.length).toBeGreaterThan(0);
      expect(typeof kind.list).toBe('function');
      expect(typeof kind.decide).toBe('function');
    }
  });

  /**
   * Approving is not printing, and the two-step still works.
   *
   * The composite is the promoted gesture and it did not replace the pair — the
   * hold is the reason they stay apart. A draft approved on its own is in the
   * `approved` band and one tap finishes it.
   */
  it('leaves the separate approve and publish operations intact', async () => {
    const actor = await commissioner();
    const { id, digest } = await waiting(WEEKS[0]!);

    await approveVersion(db!, { versionId: id, actorUserId: actor, note: 'reads straight' });
    expect((await commissionerQueue(db!)).outstanding[0]!.readiness).toBe('approved');

    await publishVersion(db!, { versionId: id, actorUserId: actor });
    expect((await reviewDetail(db!, id))!.status).toBe('published');

    // And the composite, arriving at an already-published version, is a no-op.
    const after = await decide(db!, { kind: 'slice', id, actorUserId: actor, digest });
    expect(after.idempotent).toBe(true);
  });
});
