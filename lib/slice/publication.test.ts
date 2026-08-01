import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { clearClock, setFixedClock } from '@/lib/clock';
import { readManagerNames, seedManagerNames } from '@/lib/content/managers';
import { closePool, getDb } from '@/lib/db';
import {
  sliceIssueVersions,
  sliceIssues,
  slicePublicationHolds,
  sliceReviews,
  users,
} from '@/lib/db/schema';
import { PG_ERROR, expectPgError, expectPgMessage, resetDatabase } from '@/lib/db/test-helpers';
import { traverseChain } from '@/lib/sleeper/chain';
import { createFixtureSource } from '@/lib/sleeper/fixtures';
import { persistChain } from '@/lib/sleeper/persist';

import { latestEdition } from './edition';
import {
  approveVersion,
  editionHash,
  generateDraft,
  latestPublishedIssue,
  publicationHold,
  publishVersion,
  rackIssue,
  rejectVersion,
  reviewDetail,
  reviewQueue,
  setPublicationHold,
  submitForReview,
} from './publication';

/**
 * The commissioner review chain, against a real Postgres.
 *
 * **Nothing here can be tested against a mock**, which is the point: `16 §9`
 * makes approval mandatory, and a rule that is mandatory in a service is
 * mandatory for the callers somebody remembered. Every guarantee below is
 * asserted by asking the database for the wrong thing and requiring it to refuse.
 *
 * The list the chain owes (the ten steps the direction names):
 *
 *   1. draft generation                  → `generateDraft`
 *   2. stable draft identity             → one issue per (season, week), forever
 *   3. review queue                      → `reviewQueue`
 *   4. commissioner-visible preview      → `reviewDetail` carries the stored edition
 *   5. approve                           → and only with a named person
 *   6. reject or revise                  → terminal, with a reason, and a new version
 *   7. publication state                 → one published version per issue
 *   8. idempotent retry                  → by content hash, and on publish
 *   9. audit history                     → append-only
 *  10. prevention of unapproved publication → **the trigger, not the service**
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

/** The chain's head. The fixtures walk back to 2024 from here. */
const LEAGUE_2026 = '1385016656425668608';

/**
 * A finalized week that renders and validates.
 *
 * Picked by asking the pipeline rather than by guessing: `slice.test.ts` already
 * asserts every week of both finalized seasons publishes cleanly, so any scored
 * week does — but naming one and having it silently stop being publishable would
 * make every test in this file pass for the wrong reason. `publishableWeek()`
 * below finds one and fails loudly if there is none.
 */
let WEEK = 0;
const SEASON = 2025;

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

/** Walk the chain to published, and hand back the version that got there. */
async function publishOne(actorUserId: string): Promise<string> {
  const draft = await generateDraft(db!, { season: SEASON, week: WEEK, submit: true });
  expect(draft.outcome).toBe('created');
  await approveVersion(db!, { versionId: draft.versionId!, actorUserId });
  await publishVersion(db!, { versionId: draft.versionId!, actorUserId });
  return draft.versionId!;
}

describe.skipIf(!hasDatabase)('the Slice review chain', () => {
  beforeEach(async () => {
    await resetDatabase(db!);
    setFixedClock('2026-08-01T12:00:00Z');
    await importLeague();

    if (WEEK === 0) {
      for (let week = 1; week <= 17; week++) {
        const attempt = await generateDraft(db!, { season: SEASON, week });
        if (attempt.outcome === 'created' && attempt.publishable) {
          WEEK = week;
          break;
        }
      }
      if (WEEK === 0) {
        throw new Error('no publishable week in the fixture — the pipeline, not this file');
      }
      // Found by drafting, so start the real tests from an empty chain.
      await resetDatabase(db!);
      await importLeague();
    }
  });

  afterAll(() => {
    clearClock();
  });

  /* ---------------------------------------------------------------------- */
  /* 1–4 · drafting, identity, the queue, and what the screen sees           */
  /* ---------------------------------------------------------------------- */

  it('drafts a week, and the queue is what is waiting on the commissioner', async () => {
    const result = await generateDraft(db!, { season: SEASON, week: WEEK, submit: true });

    expect(result.outcome).toBe('created');
    expect(result.publishable).toBe(true);
    expect(result.version).toBe(1);

    const queue = await reviewQueue(db!);
    expect(queue).toHaveLength(1);
    expect(queue[0]!.season).toBe(SEASON);
    expect(queue[0]!.week).toBe(WEEK);
    expect(queue[0]!.status).toBe('needs_review');
    expect(queue[0]!.headline.length).toBeGreaterThan(0);
  });

  it('shows the screen the stored edition and the packet it was built from', async () => {
    const result = await generateDraft(db!, { season: SEASON, week: WEEK, submit: true });
    const detail = await reviewDetail(db!, result.versionId!);

    expect(detail).not.toBeNull();
    /*
     * The preview is the stored issue, not a re-render (`08 §28`) — and the
     * digest recomputes from it.
     *
     * This assertion is the reason `editionHash` is canonical. `content` is
     * `jsonb`, which is a parsed structure rather than a byte store, so Postgres
     * re-emits the keys in its own order and `JSON.stringify` of the returned
     * object hashed to something else entirely. The digest is what an approval
     * names; a digest that only matches before a round trip cannot be checked.
     */
    expect(editionHash(detail!.edition)).toBe(detail!.contentHash);
    expect(detail!.packet.season).toBe(SEASON);
    expect(detail!.packet.allowedNumbers.length).toBeGreaterThan(0);
    expect(detail!.verdict.publishable).toBe(true);
    // Drafted and submitted, both recorded.
    expect(detail!.history.map((event) => event.action)).toEqual(['generated', 'submitted']);
  });

  it('is idempotent: drafting the same unchanged week twice appends nothing', async () => {
    const first = await generateDraft(db!, { season: SEASON, week: WEEK, submit: true });
    const second = await generateDraft(db!, { season: SEASON, week: WEEK, submit: true });

    expect(second.outcome).toBe('noop');
    expect(second.versionId).toBe(first.versionId);

    const [versions] = await db!
      .select({ count: sql<number>`count(*)::int` })
      .from(sliceIssueVersions);
    expect(versions!.count).toBe(1);
  });

  it('keeps one issue per week however many times it is drafted — the stable identity', async () => {
    await generateDraft(db!, { season: SEASON, week: WEEK });
    await generateDraft(db!, { season: SEASON, week: WEEK });

    const [issues] = await db!.select({ count: sql<number>`count(*)::int` }).from(sliceIssues);
    expect(issues!.count).toBe(1);
  });

  it('writes nothing at all when the week has nothing that may be printed', async () => {
    // 2026 is open and has no games: the packet refuses outright.
    const result = await generateDraft(db!, { season: 2026, week: 1 });

    expect(result.outcome).toBe('refused');
    expect(result.refusal).not.toBeNull();
    expect(result.versionId).toBeNull();

    const [issues] = await db!.select({ count: sql<number>`count(*)::int` }).from(sliceIssues);
    expect(issues!.count).toBe(0);
  });

  /* ---------------------------------------------------------------------- */
  /* 5–7 · approve, reject, publish                                          */
  /* ---------------------------------------------------------------------- */

  it('walks draft → review → approve → publish, and the rack serves the published copy', async () => {
    const actor = await commissioner();
    const versionId = await publishOne(actor);

    const [version] = await db!
      .select({ status: sliceIssueVersions.status })
      .from(sliceIssueVersions)
      .where(eq(sliceIssueVersions.id, versionId));
    expect(version!.status).toBe('published');

    const published = await latestPublishedIssue(db!);
    expect(published).not.toBeNull();
    expect(published!.week).toBe(WEEK);

    const rack = await rackIssue(db!, { openSeasonYear: 2026 });
    expect(rack!.approved).toBe(true);
    expect(rack!.edition.week).toBe(WEEK);
    // Last season's paper, so it says so on the sheet.
    expect(rack!.stamp).toBe('Last one Tony printed');
  });

  it('falls back to the historical rendering only while nothing has been published', async () => {
    const before = await rackIssue(db!, { openSeasonYear: 2026 });
    expect(before!.approved).toBe(false);
    expect(before!.edition).toEqual(await latestEdition(db!));

    const actor = await commissioner();
    await publishOne(actor);

    const after = await rackIssue(db!, { openSeasonYear: 2026 });
    expect(after!.approved).toBe(true);
  });

  it('refuses a rejection with no reason, at the database', async () => {
    const actor = await commissioner();
    const draft = await generateDraft(db!, { season: SEASON, week: WEEK, submit: true });

    await expect(
      rejectVersion(db!, { versionId: draft.versionId!, actorUserId: actor, note: '   ' }),
    ).rejects.toThrow(/reason/i);

    await expectPgError(
      db!.insert(sliceReviews).values({
        issueId: draft.issueId!,
        versionId: draft.versionId!,
        action: 'rejected',
        actorUserId: actor,
        note: null,
        occurredAt: new Date('2026-08-01T12:00:00Z'),
      }),
      { code: PG_ERROR.checkViolation, constraint: 'slice_reviews_rejection_needs_a_reason' },
    );
  });

  it('keeps a rejected draft rejected — and a later job does not quietly resurrect it', async () => {
    const actor = await commissioner();
    const draft = await generateDraft(db!, { season: SEASON, week: WEEK, submit: true });

    await rejectVersion(db!, {
      versionId: draft.versionId!,
      actorUserId: actor,
      note: 'the lead is the wrong game',
    });

    const again = await generateDraft(db!, { season: SEASON, week: WEEK, submit: true });
    expect(again.outcome).toBe('noop');

    const [version] = await db!
      .select({ status: sliceIssueVersions.status })
      .from(sliceIssueVersions)
      .where(eq(sliceIssueVersions.id, draft.versionId!));
    expect(version!.status).toBe('rejected');

    expect(await reviewQueue(db!)).toHaveLength(0);
  });

  it('publishes once: a retried publish reads the state back rather than publishing twice', async () => {
    const actor = await commissioner();
    const versionId = await publishOne(actor);

    await publishVersion(db!, { versionId, actorUserId: actor });

    const rows = await db!
      .select({ action: sliceReviews.action })
      .from(sliceReviews)
      .where(eq(sliceReviews.versionId, versionId));

    expect(rows.filter((row) => row.action === 'published')).toHaveLength(1);
  });

  it('supersedes the previous copy when a correction is published, and keeps both', async () => {
    const actor = await commissioner();
    const first = await publishOne(actor);

    /*
     * A correction. The renderer is deterministic, so a genuinely different
     * rendering of the same week cannot be produced by asking twice — this
     * writes the second version directly, which is exactly what a corrected
     * packet would produce and keeps the assertion about *publication* rather
     * than about the renderer.
     */
    const [issue] = await db!
      .select({ id: sliceIssues.id })
      .from(sliceIssues)
      .limit(1);

    const detail = await reviewDetail(db!, first);
    const corrected = { ...detail!.edition, headline: 'A CORRECTED HEADLINE' };

    const [second] = await db!
      .insert(sliceIssueVersions)
      .values({
        issueId: issue!.id,
        version: 2,
        status: 'needs_review',
        content: corrected as unknown as Record<string, unknown>,
        contentHash: editionHash(corrected),
        verdict: { publishable: true, violations: [] },
        publishable: true,
        packet: detail!.packet as unknown as Record<string, unknown>,
        createdAt: new Date('2026-08-01T12:00:00Z'),
      })
      .returning({ id: sliceIssueVersions.id });

    await approveVersion(db!, { versionId: second!.id, actorUserId: actor });
    await publishVersion(db!, { versionId: second!.id, actorUserId: actor });

    const rows = await db!
      .select({ id: sliceIssueVersions.id, status: sliceIssueVersions.status })
      .from(sliceIssueVersions);

    expect(rows.find((row) => row.id === first)!.status).toBe('superseded');
    expect(rows.find((row) => row.id === second!.id)!.status).toBe('published');

    const published = await latestPublishedIssue(db!);
    expect(published!.edition.headline).toBe('A CORRECTED HEADLINE');
  });

  /* ---------------------------------------------------------------------- */
  /* 10 · prevention of unapproved publication — the guarantees              */
  /* ---------------------------------------------------------------------- */

  it('refuses to publish a version with no recorded commissioner approval', async () => {
    const draft = await generateDraft(db!, { season: SEASON, week: WEEK, submit: true });

    // Straight to `approved` without a review row — the transition itself is
    // legal, so this is the *second*, independent condition doing the work.
    await db!
      .update(sliceIssueVersions)
      .set({ status: 'approved' })
      .where(eq(sliceIssueVersions.id, draft.versionId!));

    await expectPgMessage(
      db!
        .update(sliceIssueVersions)
        .set({ status: 'published' })
        .where(eq(sliceIssueVersions.id, draft.versionId!)),
      /no recorded commissioner approval/,
    );
  });

  it('refuses an approval row with nobody named on it', async () => {
    const draft = await generateDraft(db!, { season: SEASON, week: WEEK, submit: true });

    await expectPgError(
      db!.insert(sliceReviews).values({
        issueId: draft.issueId!,
        versionId: draft.versionId!,
        action: 'approved',
        actorUserId: null,
        note: null,
        occurredAt: new Date('2026-08-01T12:00:00Z'),
      }),
      { code: PG_ERROR.checkViolation, constraint: 'slice_reviews_decisions_are_attributed' },
    );
  });

  it('refuses to jump a version straight from draft to published', async () => {
    const draft = await generateDraft(db!, { season: SEASON, week: WEEK });

    await expectPgMessage(
      db!
        .update(sliceIssueVersions)
        .set({ status: 'published' })
        .where(eq(sliceIssueVersions.id, draft.versionId!)),
      /cannot go from draft to published/,
    );
  });

  it('refuses to approve a version the validator refused', async () => {
    const draft = await generateDraft(db!, { season: SEASON, week: WEEK, submit: true });
    const detail = await reviewDetail(db!, draft.versionId!);

    const [refusedVersion] = await db!
      .insert(sliceIssueVersions)
      .values({
        issueId: draft.issueId!,
        version: 2,
        status: 'needs_review',
        content: { ...detail!.edition, headline: 'A CLAIM NOBODY CHECKED' } as unknown as Record<
          string,
          unknown
        >,
        contentHash: 'deadbeefdeadbeef',
        verdict: { publishable: false, violations: [{ kind: 'unknown-number', value: '999.99' }] },
        publishable: false,
        packet: detail!.packet as unknown as Record<string, unknown>,
        createdAt: new Date('2026-08-01T12:00:00Z'),
      })
      .returning({ id: sliceIssueVersions.id });

    await expectPgError(
      db!
        .update(sliceIssueVersions)
        .set({ status: 'approved' })
        .where(eq(sliceIssueVersions.id, refusedVersion!.id)),
      { code: PG_ERROR.checkViolation, constraint: 'slice_versions_unpublishable_stays_out' },
    );
  });

  it('refuses to edit the prose a commissioner approved', async () => {
    const draft = await generateDraft(db!, { season: SEASON, week: WEEK, submit: true });

    await expectPgMessage(
      db!
        .update(sliceIssueVersions)
        .set({ content: { headline: 'SOMETHING ELSE ENTIRELY' } })
        .where(eq(sliceIssueVersions.id, draft.versionId!)),
      /immutable once written/,
    );
  });

  it('refuses to delete a version, or to edit the record of a decision', async () => {
    const actor = await commissioner();
    const versionId = await publishOne(actor);

    await expectPgMessage(
      db!.delete(sliceIssueVersions).where(eq(sliceIssueVersions.id, versionId)),
      /never deleted/,
    );

    await expectPgMessage(
      db!.update(sliceReviews).set({ note: 'on reflection' }).where(eq(sliceReviews.versionId, versionId)),
      /append-only/,
    );

    await expectPgMessage(
      db!.delete(sliceReviews).where(eq(sliceReviews.versionId, versionId)),
      /append-only/,
    );
  });

  it('refuses to point an issue at a version that is not published', async () => {
    const draft = await generateDraft(db!, { season: SEASON, week: WEEK, submit: true });

    await expectPgMessage(
      db!
        .update(sliceIssues)
        .set({
          publishedVersionId: draft.versionId!,
          publishedAt: new Date('2026-08-01T12:00:00Z'),
        })
        .where(eq(sliceIssues.id, draft.issueId!)),
      /must name a published version/,
    );
  });

  /* ---------------------------------------------------------------------- */
  /* The manual hold (`16 §9`, permanent)                                    */
  /* ---------------------------------------------------------------------- */

  it('stops publication while the hold is on, and lets it through when released', async () => {
    const actor = await commissioner();
    const draft = await generateDraft(db!, { season: SEASON, week: WEEK, submit: true });
    await approveVersion(db!, { versionId: draft.versionId!, actorUserId: actor });

    await setPublicationHold(db!, { held: true, actorUserId: actor, reason: 'scores still moving' });

    const held = await publicationHold(db!);
    expect(held.held).toBe(true);
    expect(held.reason).toBe('scores still moving');

    await expectPgMessage(
      publishVersion(db!, { versionId: draft.versionId!, actorUserId: actor }),
      /on hold/,
    );

    await setPublicationHold(db!, { held: false, actorUserId: actor });
    expect((await publicationHold(db!)).held).toBe(false);

    await publishVersion(db!, { versionId: draft.versionId!, actorUserId: actor });
    expect(await latestPublishedIssue(db!)).not.toBeNull();
  });

  it('records both directions of the hold rather than flipping a flag', async () => {
    const actor = await commissioner();
    await setPublicationHold(db!, { held: true, actorUserId: actor, reason: 'a stat correction' });
    await setPublicationHold(db!, { held: false, actorUserId: actor });

    const rows = await db!.select({ held: slicePublicationHolds.held }).from(slicePublicationHolds);
    expect(rows).toHaveLength(2);

    await expectPgMessage(
      db!.delete(slicePublicationHolds).where(eq(slicePublicationHolds.held, true)),
      /append-only/,
    );
  });

  /* ---------------------------------------------------------------------- */
  /* The chain, walked twice concurrently                                    */
  /* ---------------------------------------------------------------------- */

  it('produces one version when ten drafts of the same week race', async () => {
    await Promise.all(
      Array.from({ length: 10 }, () => generateDraft(db!, { season: SEASON, week: WEEK })),
    );

    const [issues] = await db!
      .select({ count: sql<number>`count(*)::int` })
      .from(sliceIssues);
    const [versions] = await db!
      .select({ count: sql<number>`count(*)::int` })
      .from(sliceIssueVersions);

    expect(issues!.count).toBe(1);
    expect(versions!.count).toBe(1);
  });

  it('produces one publication when ten publishes of the same version race', async () => {
    const actor = await commissioner();
    const draft = await generateDraft(db!, { season: SEASON, week: WEEK, submit: true });
    await approveVersion(db!, { versionId: draft.versionId!, actorUserId: actor });

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        publishVersion(db!, { versionId: draft.versionId!, actorUserId: actor }),
      ),
    );
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);

    const rows = await db!
      .select({ action: sliceReviews.action })
      .from(sliceReviews)
      .where(eq(sliceReviews.versionId, draft.versionId!));

    expect(rows.filter((row) => row.action === 'published')).toHaveLength(1);
  });

  it('submits a draft that was generated without one', async () => {
    const actor = await commissioner();
    const draft = await generateDraft(db!, { season: SEASON, week: WEEK });
    expect(await reviewQueue(db!)).toHaveLength(1);

    await submitForReview(db!, { versionId: draft.versionId!, actorUserId: actor });

    const detail = await reviewDetail(db!, draft.versionId!);
    expect(detail!.status).toBe('needs_review');
    expect(detail!.history.map((event) => event.action)).toEqual(['generated', 'submitted']);
  });
});
