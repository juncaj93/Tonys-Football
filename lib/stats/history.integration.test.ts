import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { closePool, getDb } from '@/lib/db';
import { resetDatabase } from '@/lib/db/test-helpers';
import { activeManagerIds } from '@/lib/league/membership';
import { traverseChain } from '@/lib/sleeper/chain';
import { createFixtureSource } from '@/lib/sleeper/fixtures';
import { persistChain } from '@/lib/sleeper/persist';

import { loadTrackedEra, type TrackedEra } from './era';
import {
  allSeries,
  championshipMeetings,
  headToHead,
  publishableHistory,
  recordBook,
  seasonStreaks,
} from './history';
import { playEveryoneRecord } from './luck';
import { findOverclaims } from './scope';

/**
 * The historical layer against the two seasons this league actually played.
 *
 * Every number below is **pinned to the recorded fixtures**, cross-checked
 * against `docs/DATA_AUDIT.md §5`, which computed the same figures
 * independently and by a different route. A test that recomputed what the code
 * computes would prove the code agrees with itself; these say what 2024 and 2025
 * were.
 *
 * The one that matters most is the disputed-game trap. `docs/DATA_AUDIT.md §15`:
 * *"2024's closest regular-season game (0.56) is one of the disputed two, so
 * 'closest game ever' must not publish a winner from the snapshot."* That is a
 * live trap for exactly this module — a closest-game record is a `min` over
 * margins and the smallest margin in the archive is the one nobody can vouch
 * for. It is asserted twice below, positively and negatively.
 */

const LEAGUE_2026 = '1385016656425668608';

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (process.env['CI'] === 'true' && !hasDatabase) {
  throw new Error('DATABASE_URL must be set in CI so integration tests actually run.');
}

const db = hasDatabase ? getDb() : null;

afterAll(async () => {
  if (hasDatabase) await closePool();
});

describe.skipIf(!hasDatabase)('the recorded era', () => {
  let era: TrackedEra;

  beforeEach(async () => {
    await resetDatabase(db!);
    const chain = await traverseChain(createFixtureSource(), LEAGUE_2026, { includeWeeks: true });
    await persistChain(db!, chain, { sourceLabel: 'test', finalizeYears: [2024, 2025] });
    era = await loadTrackedEra(db!);
  });

  const named = (id: string): string => era.managers.get(id)?.displayName ?? id;

  /* --- what the era holds ---------------------------------------------- */

  it('holds both finalized seasons and every game in them', () => {
    expect(era.seasons).toEqual([2024, 2025]);
    expect(era.games).toHaveLength(162);
    // Ten seats a season, and roster 4 changed hands: 10 + Berardo + Shant would
    // be 12 if Berardo had not been the one replaced. Eleven distinct people.
    expect(era.managers.size).toBe(11);
  });

  it('excludes the unplayed season entirely — no future data reaches a record', () => {
    // 2026 exists, is not finalized, and has no games. The guard that matters is
    // structural: `loadTrackedEra` selects on `finalized_at`, so a 2026 that
    // *did* have games still could not enter a historical population.
    expect(era.seasons).not.toContain(2026);
    expect(era.games.every((game) => game.season <= 2025)).toBe(true);
    for (const record of recordBook(era)) {
      expect(record.scope.seasons).toEqual([2024, 2025]);
      expect(record.scope.finalizedOnly).toBe(true);
    }
  });

  it('marks exactly the two disputed 2024 games and nothing in 2025', () => {
    const disputed = era.games.filter((game) => game.disputed);
    expect(disputed.map((game) => game.key).sort()).toEqual(['2024-w13-m2', '2024-w14-m4']);
    expect(era.games.filter((game) => game.countable)).toHaveLength(160);
    expect(disputed.every((game) => game.uncountableBecause === 'disputed')).toBe(true);
  });

  it('separates bracket games from consolation games in the same playoff week', () => {
    const stages = new Set(era.games.map((game) => game.stage));
    expect(stages).toEqual(new Set(['regular', 'bracket', 'consolation']));
    // Regular season is weeks 1–14 in both seasons: 70 games each.
    expect(era.games.filter((game) => game.stage === 'regular')).toHaveLength(140);
  });

  it('reads both champions and both runners-up from the bracket', () => {
    expect(named(era.champions.get(2024)!)).toBe('Alex');
    expect(named(era.champions.get(2025)!)).toBe('Matty B');
    expect(named(era.runnersUp.get(2024)!)).toBe('Nathan');
    expect(named(era.runnersUp.get(2025)!)).toBe('Ryan');
  });

  it('is deterministic — two loads are deep-equal', async () => {
    expect(await loadTrackedEra(db!)).toEqual(era);
  });

  /* --- the record book -------------------------------------------------- */

  it('finds the regular-season records `docs/DATA_AUDIT.md §5` computed independently', () => {
    const book = recordBook(era);
    const of = (kind: string) => book.find((record) => record.kind === kind);

    // 2024 week 9, the league high of that season; 2025's best was 182.52.
    expect(of('highest-team-week')?.value).toBe(183.94);
    expect(of('highest-team-week')?.holders[0]?.displayName).toBe('Brandon');
    expect(of('highest-team-week')?.holders[0]?.gameKey).toBe('2024-w09-m3');
    expect(of('highest-team-week')?.runnerUpValue).toBe(182.52);

    // 2025 week 1. Never 26.50 or 37.80 — those are week-18 phantom scores and
    // are not stored at all (`docs/DATA_AUDIT.md` C2).
    expect(of('lowest-team-week')?.value).toBe(62.74);
    expect(of('lowest-team-week')?.holders[0]?.displayName).toBe('Joe');

    expect(of('widest-margin')?.value).toBe(88.34);
    expect(of('closest-game')?.value).toBe(0.18);
  });

  it('never lets the disputed 0.56 game become the closest-game record', () => {
    const closest = recordBook(era).find((record) => record.kind === 'closest-game')!;

    // The trap, stated positively and negatively. 0.56 (2024 wk 13) and 0.72
    // (2024 wk 14) are the two smallest margins in the archive and neither can
    // carry a claim.
    expect(closest.value).toBe(0.18);
    expect(closest.value).not.toBe(0.56);
    expect(closest.holders[0]?.gameKey).toBe('2025-w01-m1');
    expect(closest.sourceGameKeys).not.toContain('2024-w13-m2');
    expect(closest.support).toBe('partial');
    expect(closest.evidence.join(' ')).toContain('disputed');
  });

  it('answers the bracket as a separate, labelled population', () => {
    const bracket = recordBook(era, { stages: ['bracket'] });
    const high = bracket.find((record) => record.kind === 'highest-team-week');

    // 188.02 is a playoff score and must not appear in the regular-season book.
    expect(high?.value).toBe(188.02);
    expect(high?.stages).toEqual(['bracket']);
    expect(recordBook(era).every((record) => record.value !== 188.02)).toBe(true);
  });

  it('scopes every record to the recorded era and never further', () => {
    for (const record of [...recordBook(era), ...recordBook(era, { stages: ['bracket'] })]) {
      expect(record.scope.label).toBe('since 2024');
      expect(record.scope.firstSeason).toBe(2024);
      expect(findOverclaims(record.evidence.join(' '))).toEqual([]);
    }
  });

  /* --- finals ----------------------------------------------------------- */

  it('finds both finals and nothing else', () => {
    const finals = championshipMeetings(era);
    expect(finals).toHaveLength(2);

    expect(finals[0]?.season).toBe(2024);
    expect(named(finals[0]!.championManagerId)).toBe('Alex');
    expect(named(finals[0]!.runnerUpManagerId)).toBe('Nathan');
    expect(finals[0]?.championPoints).toBe(160.68);
    expect(finals[0]?.runnerUpPoints).toBe(157.92);

    expect(finals[1]?.season).toBe(2025);
    expect(named(finals[1]!.championManagerId)).toBe('Matty B');
    expect(named(finals[1]!.runnerUpManagerId)).toBe('Ryan');
  });

  it('sets previousChampionshipMeeting on exactly the two pairs that have met in one', () => {
    const withMeeting = allSeries(era)
      .filter((series) => series.previousChampionshipMeeting)
      .map((series) => [named(series.managerId), named(series.opponentId)].sort().join(' v '))
      .sort();

    expect(withMeeting).toEqual(['Alex v Nathan', 'Matty B v Ryan']);
  });

  it('exposes the meeting as a measurement and never as a relationship', () => {
    const series = allSeries(era).find((entry) => entry.previousChampionshipMeeting)!;
    const text = [...series.evidence, JSON.stringify(series.championshipMeetings)]
      .join(' ')
      .toLowerCase();

    // `07 §7.4` — the engine cannot invent a rivalry because two teams played.
    for (const word of ['revenge', 'rivalry', 'grudge', 'nemesis']) {
      expect(text).not.toContain(word);
    }
  });

  /* --- series ----------------------------------------------------------- */

  it('derives the series between two managers across both seasons', () => {
    const cheese = [...era.managers.values()].find((manager) => manager.displayName === 'Cheese')!;
    const ryan = [...era.managers.values()].find((manager) => manager.displayName === 'Ryan')!;

    const series = headToHead(era, { managerId: cheese.id, opponentId: ryan.id })!;
    expect(series.meetings).toBe(6);
    expect(series.wins).toBe(0);
    expect(series.losses).toBe(6);
    expect(series.regularMeetings).toBe(5);
    expect(series.bracketMeetings).toBe(1);
    expect(series.support).toBe('verified');
    expect(series.scope.label).toBe('since 2024');
  });

  it('produces one series per pair that has met, and no pair twice', () => {
    const series = allSeries(era);
    expect(series).toHaveLength(54);
    expect(new Set(series.map((entry) => entry.id)).size).toBe(54);
    expect(series.every((entry) => entry.meetings > 0)).toBe(true);
  });

  it('never merges the three people who have held roster 4', () => {
    // `16 §5.1`'s hardest case, and the reason this whole module is keyed on
    // manager ids. Berardo held roster 4 in 2024, Shant in 2025, Zack in 2026.
    const berardo = [...era.managers.values()].find((m) => m.displayName === 'Berardo');
    const shant = [...era.managers.values()].find((m) => m.displayName === 'Shant');

    expect(berardo?.seasons).toEqual([2024]);
    expect(shant?.seasons).toEqual([2025]);
    expect(berardo?.id).not.toBe(shant?.id);
    // And nobody has a series against "roster 4" spanning both seasons.
    expect(headToHead(era, { managerId: berardo!.id, opponentId: shant!.id })).toBeNull();
  });

  /* --- streaks ---------------------------------------------------------- */

  it('finds the longest run of the era, inside one season', () => {
    const streaks = seasonStreaks(era);
    const best = streaks[0]!;

    expect(best.length).toBe(8);
    expect(best.displayName).toBe('Ryan');
    expect(best.season).toBe(2025);
    expect(best.scope.kind).toBe('season');
    // No streak may span seasons — `docs/DATA_AUDIT.md §15`.
    expect(streaks.every((streak) => streak.scope.seasons.length === 1)).toBe(true);
  });

  /* --- play-everyone ---------------------------------------------------- */

  it('drops the two disputed weeks whole from the 2024 measurement', () => {
    const record = playEveryoneRecord(era, { season: 2024 })!;

    expect(record.excludedWeeks).toEqual([13, 14]);
    expect(record.includedWeeks).toHaveLength(12);
    expect(record.support).toBe('partial');
    // Every manager measured over the same twelve weeks — the property the
    // whole-week exclusion exists to preserve.
    expect(new Set(record.lines.map((line) => line.weeksCounted))).toEqual(new Set([12]));
    expect(record.lines).toHaveLength(10);
  });

  it('measures 2025 in full, because 2025 has no dispute', () => {
    const record = playEveryoneRecord(era, { season: 2025 })!;
    expect(record.excludedWeeks).toEqual([]);
    expect(record.support).toBe('verified');
    expect(new Set(record.lines.map((line) => line.weeksCounted))).toEqual(new Set([14]));

    // Ryan went 11-3 and outscored more of the league than anybody: the two
    // measurements agree in 2025, which is the uninteresting case and the one
    // that proves the arithmetic.
    const ryan = record.lines.find((line) => line.displayName === 'Ryan')!;
    expect(ryan.actualWins).toBe(11);
    expect(ryan.playEveryoneWins).toBe(92);
    expect(ryan.playEveryoneWins + ryan.playEveryoneLosses + ryan.playEveryoneTies).toBe(126);
  });

  it('never claims the all-play games were played', () => {
    const record = playEveryoneRecord(era, { season: 2025 })!;
    expect(record.disclaimer).toContain('never a league result');
    expect(findOverclaims(record.evidence.join(' '))).toEqual([]);
  });

  /* --- the publication boundary ----------------------------------------- */

  it('keeps retired managers in the record and out of what may be published', async () => {
    const publishable = await activeManagerIds(db!);
    const retired = [...era.managers.values()].filter(
      (manager) => !publishable.has(manager.id),
    );

    // Berardo and Shant are in the era because they played. Armen is a co-owner
    // with no membership, so he was never in it.
    expect(retired.map((manager) => manager.displayName).sort()).toEqual(['Berardo', 'Shant']);

    const all = allSeries(era);
    const open = publishableHistory(all, publishable);

    expect(open.length).toBeLessThan(all.length);
    for (const series of open) {
      for (const id of series.managerIds) expect(publishable.has(id)).toBe(true);
    }
    // And the record itself is untouched by having asked.
    expect(allSeries(era)).toHaveLength(all.length);
  });
});
