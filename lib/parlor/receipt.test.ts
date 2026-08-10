import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { closePool, getDb } from '@/lib/db';
import { seasonMemberships, seasons } from '@/lib/db/schema';
import { resetDatabase } from '@/lib/db/reset';
import { activeLeagueManagers } from '@/lib/league/membership';
import { MIDSEASON_SEASON, midseasonRecords } from '@/lib/sleeper/midseason-2026';
import { importHistory, playWeek } from '@/lib/sleeper/midseason-season';

import { describeStanding, receiptFor } from './receipt';

/**
 * Which season the receipt prints — the commissioner's ruling of 2026-08-10.
 *
 * > Show the current season once the current season has finalized game data.
 *
 * The old rule was *always the most recent archived season*, justified because
 * a preseason row of zeroes reads as a result. That reason is preseason-scoped
 * and nothing re-evaluated it, so the midseason rehearsal found every manager's
 * receipt still showing 2025 in week 8 of a 7–1 season
 * (`docs/WEEK8_REHEARSAL.md §5.2`).
 *
 * The four states the ruling names are the four blocks below. They are driven by
 * the shared lifecycle seeding (`importHistory`) and the same `runTuesday` the
 * cron calls, so what they assert is the behaviour a real Tuesday produces
 * rather than the behaviour a hand-written row would.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

afterAll(async () => {
  if (hasDatabase) await closePool();
});

/** Seed a deploy, then play `through` Tuesdays. `0` is the preseason. */
async function season(through: number): Promise<void> {
  await resetDatabase(db!);
  await importHistory(db!);
  for (let week = 1; week <= through; week += 1) await playWeek(db!, week);
}

async function managerNamed(name: string): Promise<string> {
  const found = (await activeLeagueManagers(db!)).find((m) => m.displayName === name);
  if (found === undefined) throw new Error(`no seated manager called ${name}`);
  return found.id;
}

describe.skipIf(!hasDatabase)('which season the receipt prints', () => {
  describe('preseason — nothing has been finalized', () => {
    it('prints the most recent archived season', async () => {
      await season(0);

      const champion = await receiptFor(db!, await managerNamed('Matty B'));
      const runnerUp = await receiptFor(db!, await managerNamed('Ryan'));

      for (const receipt of [champion, runnerUp]) {
        expect(receipt).not.toBeNull();
        expect(receipt!.year).toBe(2025);
        expect(receipt!.inProgress).toBe(false);
        expect(receipt!.throughWeek).toBeNull();
      }

      // The official finalized placements, not the regular-season table: Matty B
      // took the 2025 title at 7–7 and Ryan finished 11–3 and lost the final.
      expect(champion!.finish).toBe('Champion');
      expect(champion!.record).toBe('7–7');
      expect(runnerUp!.finish).toBe('Runner-up');
    }, 120_000);

    it('prints nothing at all for a manager with no finished season', async () => {
      /*
       * Zack holds roster 4 in 2026 and did not play in 2024 or 2025 — roster
       * ids are seasonal (`16 §5.1`) and that seat belonged to two other people.
       * "No record on file" is the truth; a row of zeroes would be a result.
       */
      await season(0);

      expect(await receiptFor(db!, await managerNamed('Zack'))).toBeNull();
    }, 120_000);
  });

  describe('after week 1 is finalized', () => {
    it('switches to the current season on the first closed week', async () => {
      /*
       * The exact boundary the ruling draws. One finalized week is "finalized
       * game data", so the receipt moves — it does not wait for some threshold
       * of weeks that nobody specified.
       */
      await season(1);

      const receipt = await receiptFor(db!, await managerNamed('Ryan'));

      expect(receipt).not.toBeNull();
      expect(receipt!.year).toBe(MIDSEASON_SEASON);
      expect(receipt!.inProgress).toBe(true);
      expect(receipt!.throughWeek).toBe(1);
      // Ryan lost week 1 of the rehearsal season.
      expect(receipt!.record).toBe('0–1');
      expect(receipt!.finish).toBe(describeStanding(receipt!.finalRank ?? 10, 1));
    }, 120_000);

    it('gives a manager with no archived season a receipt for the first time', async () => {
      // Zack had "No record on file" in the preseason block above. One finalized
      // week is the first thing this product has ever been able to tell him.
      await season(1);

      const receipt = await receiptFor(db!, await managerNamed('Zack'));

      expect(receipt).not.toBeNull();
      expect(receipt!.year).toBe(MIDSEASON_SEASON);
      expect(receipt!.record).toBe('1–0');
    }, 120_000);
  });

  describe('midseason', () => {
    it('prints this season through the last closed week, to the cent', async () => {
      await season(8);

      const expected = new Map(midseasonRecords(8).map((row) => [row.rosterId, row]));

      for (const manager of await activeLeagueManagers(db!)) {
        const receipt = await receiptFor(db!, manager.id);
        expect(receipt, manager.displayName).not.toBeNull();

        const want = expected.get(receipt!.rosterId)!;
        expect({
          year: receipt!.year,
          inProgress: receipt!.inProgress,
          throughWeek: receipt!.throughWeek,
          record: receipt!.record,
          pointsForCents: Math.round(receipt!.pointsFor * 100),
        }).toEqual({
          year: MIDSEASON_SEASON,
          inProgress: true,
          throughWeek: 8,
          record: `${String(want.wins)}–${String(want.losses)}`,
          pointsForCents: want.pointsForCents,
        });
      }
    }, 120_000);

    it('claims a standing and never a finish', async () => {
      /*
       * A season in progress has a table position. It does not have a placement,
       * and `16 §12` forbids inferring one — so `finalRank` is null by rule and
       * the headline says which week it is true through.
       */
      await season(8);

      const receipt = await receiptFor(db!, await managerNamed('Matty B'));

      expect(receipt!.finalRank).toBeNull();
      expect(receipt!.madePlayoffs).toBe(false);
      expect(receipt!.finish).toBe('1st through week 8');
      for (const word of ['Champion', 'Runner-up', 'place', 'playoffs']) {
        expect(receipt!.finish).not.toContain(word);
      }
    }, 120_000);

    it('counts only weeks that were actually closed', async () => {
      /*
       * *"Do not infer unfinished results."* Week 9's games are synced by the
       * week-8 Tuesday's read-ahead only if they were played; here the season is
       * played to 8 and the receipt must be about 8 — not about whatever
       * `season_memberships` holds, which mirrors Sleeper's running standings and
       * is the number this deliberately does not read.
       */
      await season(8);

      const id = await managerNamed('Alex');
      const receipt = await receiptFor(db!, id);
      const [official] = await db!
        .select({ wins: seasonMemberships.wins, pointsFor: seasonMemberships.pointsFor })
        .from(seasonMemberships)
        .innerJoin(seasons, eq(seasons.id, seasonMemberships.seasonId))
        .where(and(eq(seasons.year, MIDSEASON_SEASON), eq(seasonMemberships.userId, id)));

      expect(receipt!.throughWeek).toBe(8);
      // They agree here, and the agreement is the point: the recomputation from
      // closed weeks lands on the official figure when every played week is
      // closed. Where they could differ, the closed-week answer is the one
      // printed.
      expect(receipt!.record).toBe(`2–6`);
      expect(official!.wins).toBe(2);
    }, 120_000);
  });

  describe('no contamination from the archive', () => {
    it('never blends a finished season into a live one', async () => {
      /*
       * Ryan went 11–3 in 2025 and lost the final; he is 1–7 in 2026. A receipt
       * that blended the two, or that fell back per-field, would be visible here
       * as a record neither season played.
       */
      await season(8);

      const receipt = await receiptFor(db!, await managerNamed('Ryan'));

      expect(receipt!.year).toBe(MIDSEASON_SEASON);
      expect(receipt!.record).toBe('1–7');
      expect(receipt!.finish).not.toBe('Champion');

      const [archived] = await db!
        .select({ wins: seasonMemberships.wins, pointsFor: seasonMemberships.pointsFor })
        .from(seasonMemberships)
        .innerJoin(seasons, eq(seasons.id, seasonMemberships.seasonId))
        .where(eq(seasons.year, 2025));
      // The archived row is untouched, and none of its points reached the slip.
      expect(archived!.wins).toBeGreaterThan(0);
      expect(receipt!.pointsFor).toBeLessThan(archived!.pointsFor);
    }, 120_000);

    it('reads only 2026 games, not 2024 or 2025 ones', async () => {
      /*
       * The strongest available statement: the sum of points on the slip equals
       * the sum of the current season's own closed games and nothing else. 2024
       * and 2025 hold 162 games between them in this database.
       */
      await season(8);

      const expected = new Map(midseasonRecords(8).map((row) => [row.rosterId, row]));
      for (const manager of await activeLeagueManagers(db!)) {
        const receipt = await receiptFor(db!, manager.id);
        expect(Math.round(receipt!.pointsFor * 100)).toBe(
          expected.get(receipt!.rosterId)!.pointsForCents,
        );
        // Eight games each — every closed week counted once, no archived week
        // counted at all.
        const [wins, losses] = receipt!.record.split('–').map(Number);
        expect((wins ?? 0) + (losses ?? 0)).toBe(8);
      }
    }, 120_000);

    it('goes back to the archive if the current season has closed nothing', async () => {
      // The rule is a switch rather than a ratchet: a database reseeded to the
      // preseason prints 2025 again, from the same code path.
      await season(0);
      expect((await receiptFor(db!, await managerNamed('Ryan')))!.year).toBe(2025);
    }, 120_000);
  });
});
