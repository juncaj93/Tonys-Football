import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { clearClock, setFixedClock } from '@/lib/clock';
import { readManagerNames, seedManagerNames } from '@/lib/content/managers';
import { closePool, getDb } from '@/lib/db';
import {
  draftPicks,
  fantasyMatchups,
  seasonDrafts,
  seasons,
  sliceDraftReviews,
  sliceIssues,
  weekFinalizations,
} from '@/lib/db/schema';
import { PG_ERROR, expectPgError, expectPgMessage, resetDatabase } from '@/lib/db/test-helpers';
import { activeLeagueManagers } from '@/lib/league/membership';
import { demoDraftSource } from '@/lib/demo/draft-fixture';
import { traverseChain } from '@/lib/sleeper/chain';
import { createFixtureSource } from '@/lib/sleeper/fixtures';
import { persistChain } from '@/lib/sleeper/persist';
import { syncSeasonDraft } from '@/lib/sleeper/persist-draft';

import { draftFacts } from './draft-facts';
import {
  approveVersion,
  generateDraft,
  generatePreseasonDraft,
  latestPublishedIssue,
  publishVersion,
  reviewDetail,
  reviewQueue,
} from './publication';
import { assemblePreseason, preseasonEligibility, preseasonPacket } from './preseason';
import {
  DraftReviewRefused,
  GRADES,
  TAKE_MAX,
  draftReviewProgress,
  saveDraftReview,
} from './preseason-reviews';
import { managerDesk } from './preseason-desk';

/**
 * The draft-review special, against a real Postgres.
 *
 * ## What can only be tested here
 *
 * Three of the four guarantees this feature rests on are **database rules**, and
 * a rule that lives in a service is a rule true of the callers somebody
 * remembered:
 *
 *   - a completed draft's picks are immutable;
 *   - Tony may only name a pick the manager he is reviewing actually made;
 *   - a preseason issue and a weekly one share `slice_issues` without colliding,
 *     and neither can claim the other's week.
 *
 * Every one of them is asserted by asking the database for the wrong thing and
 * requiring it to refuse.
 *
 * ## And the fourth is an *absence*
 *
 * The software never grades a draft. That cannot be asserted by calling
 * something — there is nothing to call — so it is asserted the only way an
 * absence can be: an issue with a grade missing does not exist, and the packet
 * says why.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

const LEAGUE_2026 = '1385016656425668608';
const SEASON = 2026;
const AT = new Date('2026-09-01T13:00:00Z');

afterAll(async () => {
  clearClock();
  if (hasDatabase) await closePool();
});

/** The state a fresh production database is in: three seasons, 2026 unplayed. */
async function importHistory(): Promise<void> {
  const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, { includeWeeks: true });
  await persistChain(db!, chain, { sourceLabel: 'fixtures', finalizeYears: [2024, 2025] });
  await seedManagerNames(db!, readManagerNames());
}

/**
 * A completed 2026 draft, through the real import path.
 *
 * The same fixture the demo uses — 2025's 160 recorded picks, re-seated — served
 * as a Sleeper payload so the decoder and the persister are the shipping ones.
 * A test that inserted rows directly would be testing its own INSERT.
 */
async function seatDraft(): Promise<number> {
  const managers = [...(await activeLeagueManagers(db!))].sort((a, b) => a.rosterId - b.rosterId);
  const report = await syncSeasonDraft(db!, {
    source: demoDraftSource(managers.map((manager) => manager.rosterId)),
    seasonYear: SEASON,
    leagueId: LEAGUE_2026,
  });
  expect(report.refusal).toBeNull();
  return report.picksStored;
}

/** Write a review for the first `count` managers, in board order. */
async function gradeEverybody(count = Number.MAX_SAFE_INTEGER): Promise<number> {
  const managers = await activeLeagueManagers(db!);
  const commissioner = managers[0]!;

  let written = 0;
  for (const manager of managers) {
    if (written >= count) break;
    await saveDraftReview(db!, {
      seasonYear: SEASON,
      userId: manager.id,
      grade: 'B+',
      take: 'Solid all the way down and nothing that made Tony put the paper down.',
      actorUserId: commissioner.id,
    });
    written++;
  }
  return written;
}

describe.skipIf(!hasDatabase)('the preseason draft review', () => {
  beforeEach(async () => {
    setFixedClock(AT);
    await resetDatabase(db!);
    await importHistory();
  });

  describe('eligibility — product state, never the calendar', () => {
    it('refuses before the league has drafted', async () => {
      const eligibility = await preseasonEligibility(db!, SEASON);
      expect(eligibility.eligible).toBe(false);
      expect(eligibility.refusal).toBe('no-draft');
    });

    it('is eligible once a completed draft is on record', async () => {
      await seatDraft();
      const eligibility = await preseasonEligibility(db!, SEASON);
      expect(eligibility).toEqual({ eligible: true, refusal: null });
    });

    it('refuses a draft Sleeper says is still running', async () => {
      await seatDraft();
      /*
       * The status is the only mutable field on the row, so this is the state a
       * live draft really produces rather than an arrangement of one.
       */
      await db!
        .update(seasonDrafts)
        .set({ status: 'drafting' })
        .where(eq(seasonDrafts.sleeperDraftId, 'demo:2026-draft-review'));

      const eligibility = await preseasonEligibility(db!, SEASON);
      expect(eligibility.refusal).toBe('draft-incomplete');
    });

    it('refuses once a week has been closed — the weekly paper owns Tuesdays now', async () => {
      await seatDraft();
      expect((await preseasonEligibility(db!, SEASON)).eligible).toBe(true);

      const [season] = await db!
        .select({ id: seasons.id })
        .from(seasons)
        .where(eq(seasons.year, SEASON));

      await db!
        .insert(weekFinalizations)
        .values({ seasonId: season!.id, week: 1, games: 5, finalizedAt: AT });

      const eligibility = await preseasonEligibility(db!, SEASON);
      expect(eligibility.eligible).toBe(false);
      expect(eligibility.refusal).toBe('season-underway');
    });

    it('refuses once a result is stored, even before the week is closed', async () => {
      /*
       * The Sunday-to-Tuesday window: week one has been played and not yet
       * finalized. It is the one state where a calendar rule would still say
       * *"preseason"*, and it is exactly where the preseason mode must not
       * reappear.
       */
      await seatDraft();
      const [season] = await db!
        .select({ id: seasons.id })
        .from(seasons)
        .where(eq(seasons.year, SEASON));

      await db!.insert(fantasyMatchups).values({
        seasonId: season!.id,
        week: 1,
        weekType: 'regular',
        sleeperMatchupId: 1,
        rosterAId: 1,
        rosterBId: 2,
        pointsACents: 12_044,
        pointsBCents: 10_310,
        winnerRosterId: 1,
        marginCents: 1734,
        capturedAt: AT,
        createdAt: AT,
        updatedAt: AT,
      });

      expect((await preseasonEligibility(db!, SEASON)).refusal).toBe('season-underway');
    });

    it('refuses a finalized season outright', async () => {
      const eligibility = await preseasonEligibility(db!, 2025);
      expect(eligibility.refusal).toBe('season-closed');
    });
  });

  describe('the draft, as Sleeper recorded it', () => {
    it('stores every pick once, however many times it is synced', async () => {
      const first = await seatDraft();
      const second = await seatDraft();

      expect(first).toBe(160);
      expect(second).toBe(160);

      const rows = await db!.select({ id: draftPicks.id }).from(draftPicks);
      expect(rows).toHaveLength(160);
    });

    it('refuses to rewrite a pick — a completed draft does not change', async () => {
      await seatDraft();
      const [pick] = await db!.select({ id: draftPicks.id }).from(draftPicks).limit(1);

      await expectPgError(
        db!
          .update(draftPicks)
          .set({ playerName: 'Somebody Else' })
          .where(eq(draftPicks.id, pick!.id)),
        { code: PG_ERROR.checkViolation },
      );
    });

    it('never records a kicker — this league has none', async () => {
      await seatDraft();
      const [draft] = await db!.select({ id: seasonDrafts.id }).from(seasonDrafts).limit(1);

      await expectPgError(
        db!.insert(draftPicks).values({
          draftId: draft!.id,
          pickNo: 999,
          round: 17,
          playerName: 'A Kicker',
          position: 'K',
          createdAt: AT,
        }),
        { code: PG_ERROR.checkViolation },
      );
    });

    it('names only active managers, and every one of them', async () => {
      await seatDraft();
      const { facts } = await draftFacts(db!, SEASON);
      const active = await activeLeagueManagers(db!);

      expect(facts).not.toBeNull();
      expect(facts!.managers.map((manager) => manager.displayName).sort()).toEqual(
        active.map((manager) => manager.displayName).sort(),
      );
    });

    it('states nothing it did not count', async () => {
      await seatDraft();
      const { facts } = await draftFacts(db!, SEASON);

      for (const manager of facts!.managers) {
        /*
         * Every derived number is recomputable from the picks on the same
         * object. That is the whole claim of the fact layer: it counts, and it
         * does not know anything a reader could not check.
         */
        const counted = manager.picks.filter(
          (pick) => pick.position === manager.earlyLoad?.position && pick.round <= 5,
        ).length;
        if (manager.earlyLoad !== null) expect(counted).toBe(manager.earlyLoad.count);

        const firstQb = manager.picks.find((pick) => pick.position === 'QB');
        expect(manager.quarterbackRound).toBe(firstQb?.round ?? null);
      }
    });
  });

  describe("Tony's grades — editorial, and the software never supplies one", () => {
    it('counts what is written and names who is missing', async () => {
      await seatDraft();
      await gradeEverybody(4);

      const progress = await draftReviewProgress(db!, SEASON);
      expect(progress.reviewed).toBe(4);
      expect(progress.total).toBe(10);
      expect(progress.outstanding).toHaveLength(6);
      expect(progress.complete).toBe(false);
    });

    it('lists every active manager and nobody else', async () => {
      const progress = await draftReviewProgress(db!, SEASON);
      const active = await activeLeagueManagers(db!);

      expect(progress.rows.map((row) => row.displayName)).toEqual(
        active.map((manager) => manager.displayName),
      );
      /*
       * The retired-manager ruling, on this surface. Armen, Shant and Berardo
       * hold no live seat, so they cannot be graded, cannot be reviewed and
       * cannot appear — and the boundary is `activeLeagueManagers`, not a filter
       * written here.
       */
      for (const name of ['Armen', 'Shant', 'Berardo']) {
        expect(progress.rows.map((row) => row.displayName)).not.toContain(name);
      }
    });

    it('holds exactly one review per manager, however many times it is written', async () => {
      await seatDraft();
      const [manager] = await activeLeagueManagers(db!);

      for (const grade of ['C', 'B', 'A-'] as const) {
        await saveDraftReview(db!, {
          seasonYear: SEASON,
          userId: manager!.id,
          grade,
          take: `Tony has changed his mind, and this is version ${grade}.`,
          actorUserId: manager!.id,
        });
      }

      const rows = await db!.select({ id: sliceDraftReviews.id }).from(sliceDraftReviews);
      expect(rows).toHaveLength(1);

      const progress = await draftReviewProgress(db!, SEASON);
      expect(progress.rows.find((row) => row.userId === manager!.id)?.grade).toBe('A-');
    });

    it('survives the editor being closed and reopened', async () => {
      await seatDraft();
      const [manager] = await activeLeagueManagers(db!);

      await saveDraftReview(db!, {
        seasonYear: SEASON,
        userId: manager!.id,
        grade: 'B-',
        take: 'Written on the bus, and Tony stands by it.',
        actorUserId: manager!.id,
      });

      /*
       * A second session is a second read. Nothing is staged and there is no
       * final submit, so *"resume later"* is the ordinary path rather than a
       * feature.
       */
      const desk = await managerDesk(db!, { season: SEASON, userId: manager!.id });
      expect(desk?.review.grade).toBe('B-');
      expect(desk?.review.take).toBe('Written on the bus, and Tony stands by it.');
    });

    it('refuses a grade outside the domain, at the database', async () => {
      await seatDraft();
      const [manager] = await activeLeagueManagers(db!);
      const [season] = await db!
        .select({ id: seasons.id })
        .from(seasons)
        .where(eq(seasons.year, SEASON));

      await expect(
        db!.execute(
          `insert into slice_draft_reviews (season_id, user_id, grade, take, created_at, updated_at)
           values ('${season!.id}', '${manager!.id}', 'A++', 'nope', now(), now())`,
        ),
      ).rejects.toThrow();
    });

    it('accepts every grade in the domain, and there are thirteen', async () => {
      await seatDraft();
      const [manager] = await activeLeagueManagers(db!);

      expect(GRADES).toHaveLength(13);
      for (const grade of GRADES) {
        await saveDraftReview(db!, {
          seasonYear: SEASON,
          userId: manager!.id,
          grade,
          take: 'Tony is working through the whole alphabet today.',
          actorUserId: manager!.id,
        });
      }
    });

    it('requires a take, and bounds it', async () => {
      await seatDraft();
      const [manager] = await activeLeagueManagers(db!);

      await expect(
        saveDraftReview(db!, {
          seasonYear: SEASON,
          userId: manager!.id,
          grade: 'B',
          take: '   ',
          actorUserId: manager!.id,
        }),
      ).rejects.toBeInstanceOf(DraftReviewRefused);

      await expect(
        saveDraftReview(db!, {
          seasonYear: SEASON,
          userId: manager!.id,
          grade: 'B',
          take: 'x'.repeat(TAKE_MAX + 1),
          actorUserId: manager!.id,
        }),
      ).rejects.toBeInstanceOf(DraftReviewRefused);
    });

    it('refuses a take that breaks a product rule, whoever is typing', async () => {
      await seatDraft();
      const [manager] = await activeLeagueManagers(db!);

      /*
       * `16 §9`'s banned terms are about the **product**, not about the
       * renderer. The league has no kickers whoever is at the keyboard, and a
       * win-probability sentence implies a model that does not exist.
       */
      for (const take of [
        'Nobody in this league drafts a kicker and Tony respects that.',
        'Tony puts their odds at about even.',
        'Tony will be settling this one in the basement.',
      ]) {
        await expect(
          saveDraftReview(db!, {
            seasonYear: SEASON,
            userId: manager!.id,
            grade: 'B',
            take,
            actorUserId: manager!.id,
          }),
        ).rejects.toBeInstanceOf(DraftReviewRefused);
      }
    });

    it('leaves the optional fields optional', async () => {
      await seatDraft();
      const [manager] = await activeLeagueManagers(db!);

      await saveDraftReview(db!, {
        seasonYear: SEASON,
        userId: manager!.id,
        grade: 'B',
        take: 'Nothing else to say about it, and Tony is not going to invent something.',
        actorUserId: manager!.id,
      });

      const desk = await managerDesk(db!, { season: SEASON, userId: manager!.id });
      expect(desk?.review.bestPickId).toBeNull();
      expect(desk?.review.concern).toBeNull();
    });
  });

  describe("Tony's best pick — a real pick, of theirs", () => {
    it('accepts one of their own picks', async () => {
      await seatDraft();
      const { facts } = await draftFacts(db!, SEASON);
      const manager = facts!.managers[0]!;

      await saveDraftReview(db!, {
        seasonYear: SEASON,
        userId: manager.userId,
        grade: 'A',
        take: 'Tony would have taken that one himself.',
        bestPickId: manager.picks[0]!.id,
        actorUserId: manager.userId,
      });

      const desk = await managerDesk(db!, { season: SEASON, userId: manager.userId });
      expect(desk?.review.bestPickId).toBe(manager.picks[0]!.id);
    });

    it('refuses a pick another manager made — at the database, not in a service', async () => {
      await seatDraft();
      const { facts } = await draftFacts(db!, SEASON);
      const [first, second] = facts!.managers;

      /*
       * The message is the **trigger's**, reached through the driver error's
       * cause. Drizzle wraps a failed query, so asserting on the thrown
       * message would assert that drizzle wraps things.
       */
      await expectPgMessage(
        saveDraftReview(db!, {
          seasonYear: SEASON,
          userId: first!.userId,
          grade: 'A',
          take: 'Tony liked one of these a great deal.',
          /* Somebody else's pick. It exists, so a foreign key would allow it. */
          bestPickId: second!.picks[0]!.id,
          actorUserId: first!.userId,
        }),
        /only name a pick that manager made/,
      );
    });

    it('offers only their own picks to choose from', async () => {
      await seatDraft();
      const { facts } = await draftFacts(db!, SEASON);
      const manager = facts!.managers[0]!;

      const desk = await managerDesk(db!, { season: SEASON, userId: manager.userId });
      const offered = new Set(desk!.pickable.map((pick) => pick.id));
      const theirs = new Set(manager.picks.map((pick) => pick.id));

      expect(offered).toEqual(theirs);
    });
  });

  describe('the issue itself', () => {
    it('does not exist until every active manager has been graded', async () => {
      await seatDraft();
      await gradeEverybody(9);

      const assembled = await assemblePreseason(db!, { season: SEASON });
      expect(assembled.edition).toBeNull();
      expect(assembled.packet.refusal).toBe('reviews-incomplete');
      expect(assembled.packet.outstanding).toHaveLength(1);

      const refused = await generatePreseasonDraft(db!, { season: SEASON, submit: true });
      expect(refused.outcome).toBe('refused');
      expect(refused.versionId).toBeNull();
    });

    it('renders once the tenth grade lands', async () => {
      await seatDraft();
      await gradeEverybody();

      const assembled = await assemblePreseason(db!, { season: SEASON });
      expect(assembled.packet.refusal).toBeNull();
      expect(assembled.edition).not.toBeNull();
      expect(assembled.verdict.publishable).toBe(true);

      const sections = assembled.edition!.preseason!;
      expect(sections.board).toHaveLength(10);
      expect(sections.teams).toHaveLength(10);
      for (const team of sections.teams) {
        expect(team.take.length).toBeGreaterThan(0);
        expect(team.grade).toBe('B+');
      }
    });

    it('states only facts the draft contains', async () => {
      await seatDraft();
      await gradeEverybody();

      const packet = await preseasonPacket(db!, { season: SEASON });
      const { facts } = await draftFacts(db!, SEASON);

      const realNames = new Set(
        facts!.managers.flatMap((manager) => [
          manager.displayName,
          ...manager.picks.map((pick) => pick.playerName),
        ]),
      );

      /*
       * Every whole name the packet allows came from a manager or from a stored
       * pick. The fragments are the pieces of those names — `Ja`, `Marr`,
       * `Chase` — and are checked by being *pieces of* something real rather
       * than by being on a list.
       */
      for (const name of packet.allowedNames) {
        if (realNames.has(name)) continue;
        const isFragment = [...realNames].some((real) =>
          real.split(/[^A-Za-z]+/).includes(name),
        );
        expect(isFragment, `${name} is neither a stored name nor a piece of one`).toBe(true);
      }
    });

    it('prints no odds, no projection and no kicker — the validator says so', async () => {
      await seatDraft();
      await gradeEverybody();

      const assembled = await assemblePreseason(db!, { season: SEASON });
      expect(assembled.verdict.violations).toEqual([]);
    });

    it('works with no AI key set, because there is no AI in it', async () => {
      /*
       * `16 §9` requires the Slice to publish correctly with the key unset, and
       * the draft review has no generative path at all: every sentence is either
       * a curated template or a stored fact, and the two editorial fields are
       * typed by a person. Asserted by producing the whole issue with the
       * variable explicitly absent.
       */
      const key = process.env['ANTHROPIC_API_KEY'];
      delete process.env['ANTHROPIC_API_KEY'];
      try {
        await seatDraft();
        await gradeEverybody();
        const assembled = await assemblePreseason(db!, { season: SEASON });
        expect(assembled.edition).not.toBeNull();
        expect(assembled.verdict.publishable).toBe(true);
      } finally {
        if (key !== undefined) process.env['ANTHROPIC_API_KEY'] = key;
      }
    });
  });

  describe('publication — the same chain, with no exemption', () => {
    it('lands on the desk and stops', async () => {
      await seatDraft();
      await gradeEverybody();

      const drafted = await generatePreseasonDraft(db!, { season: SEASON, submit: true });
      expect(drafted.outcome).toBe('created');

      const queue = await reviewQueue(db!);
      expect(queue.map((issue) => issue.kind)).toContain('preseason');

      /* Nothing is on the rack until somebody stamps it. */
      expect(await latestPublishedIssue(db!)).toBeNull();
    });

    it('cannot be published without a recorded approval naming a person', async () => {
      await seatDraft();
      await gradeEverybody();
      const drafted = await generatePreseasonDraft(db!, { season: SEASON, submit: true });

      const [manager] = await activeLeagueManagers(db!);
      await expect(
        publishVersion(db!, { versionId: drafted.versionId!, actorUserId: manager!.id }),
      ).rejects.toThrow();
    });

    it('publishes once, however many times it is asked', async () => {
      await seatDraft();
      await gradeEverybody();
      const [manager] = await activeLeagueManagers(db!);

      const drafted = await generatePreseasonDraft(db!, { season: SEASON, submit: true });
      await approveVersion(db!, { versionId: drafted.versionId!, actorUserId: manager!.id });

      await publishVersion(db!, { versionId: drafted.versionId!, actorUserId: manager!.id });
      await publishVersion(db!, { versionId: drafted.versionId!, actorUserId: manager!.id });

      const published = await latestPublishedIssue(db!);
      expect(published?.week).toBe(0);
      expect(published?.edition.preseason?.teams).toHaveLength(10);
    });

    it('is idempotent to draft — the same grades produce the same bytes', async () => {
      await seatDraft();
      await gradeEverybody();

      const first = await generatePreseasonDraft(db!, { season: SEASON, submit: true });
      const second = await generatePreseasonDraft(db!, { season: SEASON, submit: true });

      expect(second.outcome).toBe('noop');
      expect(second.versionId).toBe(first.versionId);
    });

    it('writes a new version when a grade changes, and leaves the old one', async () => {
      await seatDraft();
      await gradeEverybody();
      const first = await generatePreseasonDraft(db!, { season: SEASON, submit: true });

      const [manager] = await activeLeagueManagers(db!);
      await saveDraftReview(db!, {
        seasonYear: SEASON,
        userId: manager!.id,
        grade: 'F',
        take: 'Tony slept on it and feels differently this morning.',
        actorUserId: manager!.id,
      });

      const second = await generatePreseasonDraft(db!, { season: SEASON, submit: true });
      expect(second.outcome).toBe('created');
      expect(second.versionId).not.toBe(first.versionId);

      /* The first draft is still there, unaltered. `08 §23`. */
      const before = await reviewDetail(db!, first.versionId!);
      expect(before?.edition.preseason?.board.some((row) => row.grade === 'F')).toBe(false);
    });

    it('does not disturb a weekly issue — they share a table and never a slot', async () => {
      await seatDraft();
      await gradeEverybody();

      await generatePreseasonDraft(db!, { season: SEASON, submit: true });
      /*
       * A weekly draft for a finalized season, which is the ordinary path. Both
       * exist, both are listed, and neither is the other.
       */
      const weekly = await generateDraft(db!, { season: 2025, week: 5, submit: true });
      expect(weekly.outcome).toBe('created');

      const queue = await reviewQueue(db!);
      const kinds = queue.map((issue) => `${issue.kind}:${String(issue.week)}`);
      expect(kinds).toContain('preseason:0');
      expect(kinds).toContain('weekly:5');
    });

    it('refuses a weekly issue in the preseason slot, and the reverse', async () => {
      const [season] = await db!
        .select({ id: seasons.id })
        .from(seasons)
        .where(eq(seasons.year, SEASON));

      await expectPgError(
        db!.insert(sliceIssues).values({
          seasonId: season!.id,
          week: 0,
          kind: 'weekly',
          createdAt: AT,
          updatedAt: AT,
        }),
        { code: PG_ERROR.checkViolation },
      );

      await expectPgError(
        db!.insert(sliceIssues).values({
          seasonId: season!.id,
          week: 3,
          kind: 'preseason',
          createdAt: AT,
          updatedAt: AT,
        }),
        { code: PG_ERROR.checkViolation },
      );
    });
  });
});
