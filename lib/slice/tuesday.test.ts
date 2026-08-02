import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { readManagerNames, seedManagerNames } from '@/lib/content/managers';
import { ensureEconomyConfig } from '@/lib/counter/tokens';
import { closePool, getDb } from '@/lib/db';
import { seasons, sliceIssueVersions, weekFinalizations } from '@/lib/db/schema';
import { resetDatabase } from '@/lib/db/test-helpers';
import { traverseChain } from '@/lib/sleeper/chain';
import { createFixtureSource } from '@/lib/sleeper/fixtures';
import { persistChain } from '@/lib/sleeper/persist';

import { runTuesday } from './tuesday';

/**
 * The Tuesday job, against a real Postgres.
 *
 * The job itself owns no state and adds no guarantee of its own — every step it
 * calls is separately tested. What is untested until this file exists is the
 * **sequence**, and a sequence has failure modes its parts do not:
 *
 *   1. **A retried Tuesday must be a read.** A cron is retried — on a non-2xx,
 *      on an overlapping deploy, or because a commissioner pressed *"print a
 *      draft"* while it was mid-flight. If running it twice on one week wrote
 *      twice, the first live Tuesday would double-settle a payout.
 *   2. **A step that declines must not stop the chain.** A week with no
 *      publishable game cannot be closed, and a Tuesday that gave up there would
 *      never settle the bounty whose window ran out three weeks ago.
 *   3. **It must not publish.** `16 §9` makes approval mandatory in season one.
 *      The draft lands on the desk and stops, and the test asserts the *status*
 *      rather than trusting that nobody passed a flag.
 *
 * Against a real database rather than a mock, for the same reason the review
 * chain is: the idempotency being asserted lives in unique constraints and
 * triggers, and a mock would assert that the service remembered to be careful.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

const LEAGUE_2026 = '1385016656425668608';
const SEASON = 2025;
const AT = new Date('2026-08-02T09:00:00Z');

afterAll(async () => {
  if (hasDatabase) await closePool();
});

async function importLeague(): Promise<void> {
  const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, { includeWeeks: true });
  await persistChain(db!, chain, { sourceLabel: 'test', finalizeYears: [2024, 2025] });
  await seedManagerNames(db!, readManagerNames());

  /*
   * The economy, because `npm run db:seed` writes it on every deploy and the job
   * runs *after* that. Leaving it out was how the failure path below got found:
   * `authorStakesForWeek` throws without a stored config, deliberately, and the
   * first version of this job let that throw cost the league its paper too.
   */
  for (const season of await db!.select({ id: seasons.id }).from(seasons)) {
    await ensureEconomyConfig(db!, season.id);
  }
}

/**
 * A week the pipeline will actually close and draft.
 *
 * Found rather than named. `slice.test.ts` already asserts every scored week of
 * a finalized season publishes, so any of them works — and hardcoding one that
 * silently stopped being publishable would make every assertion below pass for
 * the wrong reason.
 */
async function playableWeek(): Promise<number> {
  for (let week = 1; week <= 18; week += 1) {
    const report = await runTuesday(db!, { season: SEASON, week, at: AT });
    if (report.games > 0 && report.draft?.outcome === 'created') return week;
  }
  throw new Error('no week of the finalized season could be closed and drafted');
}

describe.skipIf(!hasDatabase)('the Tuesday job', () => {
  beforeEach(async () => {
    await resetDatabase(db!);
    await importLeague();
  });

  it('closes the week, drafts it, and leaves it on the desk', async () => {
    const week = await playableWeek();
    await resetDatabase(db!);
    await importLeague();

    const report = await runTuesday(db!, { season: SEASON, week, at: AT });

    expect(report.finalized).toBe(true);
    expect(report.games).toBeGreaterThan(0);
    expect(report.draft?.outcome).toBe('created');
    expect(report.failed).toEqual([]);

    const [row] = await db!
      .select({ status: sliceIssueVersions.status })
      .from(sliceIssueVersions)
      .where(eq(sliceIssueVersions.id, report.draft!.versionId!));

    // Submitted, never approved and never published. `16 §9` is a gate, not a
    // preference, and a cron that could publish is that gate with a timer on it.
    expect(row?.status).toBe('needs_review');
  });

  it('is a read the second time it runs', async () => {
    const week = await playableWeek();
    await resetDatabase(db!);
    await importLeague();

    const first = await runTuesday(db!, { season: SEASON, week, at: AT });
    const second = await runTuesday(db!, { season: SEASON, week, at: AT });

    // The week is closed by the first run and already closed for the second.
    expect(first.finalized).toBe(true);
    expect(second.finalized).toBe(false);

    // And the draft is the same draft, read back — not a second version of the
    // same week sitting in the queue waiting for a decision nobody can make.
    expect(second.draft?.outcome).not.toBe('created');
    expect(second.draft?.versionId).toBe(first.draft?.versionId);

    const closures = await db!
      .select({ week: weekFinalizations.week })
      .from(weekFinalizations);
    expect(closures.filter((c) => c.week === week)).toHaveLength(1);

    const versions = await db!.select({ id: sliceIssueVersions.id }).from(sliceIssueVersions);
    expect(versions).toHaveLength(1);
  });

  it('carries on when a step declines, and says which one', async () => {
    /*
     * Week 18 of the fixtures holds no publishable game, so `finalizeWeek`
     * refuses it. The chain must still run: settlement and authoring are about
     * the *season*, not about this week, and a Tuesday that stopped here would
     * strand every open stake for as long as one week stayed open.
     */
    const report = await runTuesday(db!, { season: SEASON, week: 18, at: AT });

    expect(report.games).toBe(0);
    expect(report.finalized).toBe(false);
    expect(report.skipped.join(' ')).toContain('no publishable game');
    // It reached the end rather than throwing or returning early.
    expect(report.draft).toBeDefined();
  });

  it('still prints the paper when a step throws, and names the step that did', async () => {
    /*
     * **The finding this job was built around.**
     *
     * `authorStakesForWeek` throws on a season with no stored economy config —
     * deliberately, because silently falling back to hardcoded prices is worse
     * than stopping. The first version of this job simply awaited each step in
     * order, so that throw also cost the league **its paper**: drafting comes
     * after authoring, and a mis-seeded economy would have produced an empty
     * press desk on a Tuesday with nothing on it to explain why.
     *
     * The four steps write to four different tables and nothing about one
     * failing makes the next one wrong. So the throw is recorded against the
     * step that threw, the chain finishes, and the route still answers 500 so
     * the platform retries — which is safe because every step is idempotent.
     */
    const week = await playableWeek();
    await resetDatabase(db!);
    // Deliberately *not* seeding the economy: this is the mis-seeded deploy.
    const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, { includeWeeks: true });
    await persistChain(db!, chain, { sourceLabel: 'test', finalizeYears: [2024, 2025] });
    await seedManagerNames(db!, readManagerNames());

    const report = await runTuesday(db!, { season: SEASON, week, at: AT });

    expect(report.failed.map((f) => f.step)).toEqual(['author']);
    expect(report.failed[0]?.why).toContain('economy');

    // The week still closed and the paper still reached the desk.
    expect(report.finalized).toBe(true);
    expect(report.draft?.outcome).toBe('created');
  });

  it('does nothing at all to a season that does not exist', async () => {
    const report = await runTuesday(db!, { season: 1999, week: 4, at: AT });

    expect(report.finalized).toBe(false);
    expect(report.games).toBe(0);
    expect(report.authored).toBe(0);
    expect(report.draft?.outcome).toBe('refused');

    const closures = await db!.select({ id: weekFinalizations.id }).from(weekFinalizations);
    expect(closures).toHaveLength(0);
  });

  it('never closes a week of a season the books are shut on by writing to another', async () => {
    // A guard on the fixture rather than on the product: both seasons are
    // finalized here, so a report claiming to have closed a week of 2024 while
    // asked for 2025 would mean `finalizeWeek` resolved the wrong season.
    const week = await playableWeek();
    await resetDatabase(db!);
    await importLeague();

    await runTuesday(db!, { season: SEASON, week, at: AT });

    const rows = await db!
      .select({ seasonId: weekFinalizations.seasonId, week: weekFinalizations.week })
      .from(weekFinalizations);
    const [target] = await db!
      .select({ id: seasons.id })
      .from(seasons)
      .where(eq(seasons.year, SEASON));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.seasonId).toBe(target?.id);
  });
});
