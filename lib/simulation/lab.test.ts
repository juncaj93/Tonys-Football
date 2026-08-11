import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closePool, getDb } from '@/lib/db';
import { resetDatabase } from '@/lib/db/test-helpers';

import { runSimulation, type SimulationRecord } from './lab';
import { renderSimulationReport } from './report';
import { SIMULATION_KEYS, SIMULATION_SCENARIOS } from './scenarios';

/**
 * The simulation lab's gate.
 *
 * ## What it asserts, and what it deliberately does not
 *
 * It asserts the **properties of the lab**: that each scenario reaches the
 * paper it is supposed to reach, through the real cron, with a real approval;
 * that the isolation holds; that the refusals the report is built to show are
 * genuinely present; and that the report is generated from the same record the
 * assertions read.
 *
 * It does **not** assert the prose. A test that pinned a headline would fail
 * every time somebody improved a curated template, which teaches the next
 * session to edit the test — and the character of a week is already pinned
 * where it belongs, in `lib/slice/editions.test.ts` for the demo editions and
 * in the two rehearsals for the lifecycle. What is pinned here is the *kind* of
 * story that led, which is a property of the selector and moves only when the
 * calibration does.
 *
 * ## One run per scenario, shared across the assertions
 *
 * A sixteen-week scenario plays sixteen Tuesdays through the real job. Running
 * that once per `it` would be minutes of the same work, so each scenario is
 * played once in `beforeAll` and every assertion reads the record. The three
 * scenarios each reset the database first, so nothing one leaves behind can
 * reach another.
 */

const hasDatabase = (process.env['DATABASE_URL'] ?? '') !== '';

if (!hasDatabase && process.env['CI'] === 'true') {
  throw new Error('DATABASE_URL is required in CI: the simulation lab is a database test.');
}

describe.skipIf(!hasDatabase)('the Tuesday Slice simulation lab', () => {
  const records = new Map<string, SimulationRecord>();

  beforeAll(async () => {
    const db = getDb();
    for (const key of SIMULATION_KEYS) {
      await resetDatabase(db);
      records.set(key, await runSimulation(db, key));
    }
  }, 600_000);

  afterAll(async () => {
    await closePool();
  });

  const recordFor = (key: string): SimulationRecord => {
    const found = records.get(key);
    if (found === undefined) throw new Error(`the ${key} scenario did not run`);
    return found;
  };

  /* --- the three papers ------------------------------------------------- */

  it('the preseason Tuesday prints the draft review, because there is no week to recap', () => {
    const record = recordFor('preseason');
    const featured = record.tuesdays.at(-1)!.report;

    expect(featured.issueKind).toBe('preseason');
    expect(featured.draft?.outcome).toBe('created');

    // Week zero — a slot, never a printed number.
    expect(record.desk?.week).toBe(0);
    expect(record.desk?.kind).toBe('preseason');
    expect(record.desk?.edition.preseason).toBeDefined();
    expect(record.desk?.edition.preseason?.board).toHaveLength(10);
  });

  it('week 8 prints a weekly paper about week 8', () => {
    const record = recordFor('week-8');
    const featured = record.tuesdays.at(-1)!.report;

    expect(featured.issueKind).toBe('weekly');
    expect(featured.week).toBe(8);
    expect(featured.finalized).toBe(true);
    expect(record.desk?.week).toBe(8);
    expect(record.desk?.edition.preseason).toBeUndefined();
  });

  it('week 16 prints a weekly paper about the semifinal', () => {
    const record = recordFor('week-16');
    const featured = record.tuesdays.at(-1)!.report;

    expect(featured.issueKind).toBe('weekly');
    expect(featured.week).toBe(16);
    expect(record.desk?.week).toBe(16);
  });

  /* --- the derivation is the product's ---------------------------------- */

  it('every issue is one the deterministic validator passed', () => {
    for (const key of SIMULATION_KEYS) {
      const record = recordFor(key);
      expect(record.desk?.publishable, key).toBe(true);
      expect(record.desk?.verdict.violations, key).toEqual([]);
    }
  });

  it('the featured week leads with the story the selector chose, not one the lab picked', () => {
    /*
     * The *kind*, not the words. This is what catches a calibration change that
     * quietly turned the midseason demo into an ordinary week — the exact
     * property `lib/slice/editions.test.ts` pins for the demo editions, applied
     * to a paper the cron produced.
     */
    const week8 = recordFor('week-8').desk?.packet;
    const week16 = recordFor('week-16').desk?.packet;

    expect(week8 !== undefined && 'lead' in week8 ? week8.lead?.kind : null).toBe('blowout');
    expect(week16 !== undefined && 'lead' in week16 ? week16.lead?.kind : null).toBe('nail-biter');
  });

  it('the midseason league really is the one the scenario describes', () => {
    /*
     * The premise names four conditions. If the scoreboard is ever edited so one
     * of them stops holding, this is what says so — otherwise the report would
     * go on describing a league the fixture no longer contains.
     */
    const record = recordFor('week-8');
    const going = new Map(
      record.standingsBefore.map((row) => [row.displayName, row] as const),
    );

    const mattyB = going.get('Matty B')!;
    const mattLee = going.get('Matt Lee')!;
    expect(mattyB.wins).toBe(mattLee.wins);
    expect(mattyB.pointsForCents - mattLee.pointsForCents).toBe(60);

    const alex = going.get('Alex')!;
    expect(alex.wins).toBe(2);
    expect(
      Math.max(...record.standingsBefore.map((row) => row.pointsForCents)),
    ).toBe(alex.pointsForCents);
  });

  /* --- the refusals ----------------------------------------------------- */

  it("the elimination story cannot be told on the semifinal Tuesday, and can a week later", () => {
    const look = recordFor('week-16').retrospective;
    expect(look).not.toBeNull();

    expect(look!.kindsOnTheDay).not.toContain('elimination');
    expect(look!.kindsAfterwards).toContain('elimination');

    /*
     * And the paper that printed did not move. A version's content is immutable
     * by trigger, so a fact recorded later produces a **new** version rather
     * than editing one somebody approved.
     */
    expect(look!.publishedHeadlineAfterwards).toBe(recordFor('week-16').desk?.edition.headline);
  });

  it("Tony's Line is shut in all three, because nothing here opens a flag", () => {
    for (const key of SIMULATION_KEYS) {
      const kinds = recordFor(key).after.stakes.map((stake) => stake.kind);
      expect(kinds, key).not.toContain('TONYS_LINE');
    }
  });

  it('the preseason issue prints no draft judgement the software derived', () => {
    const packet = recordFor('preseason').desk?.packet;
    expect(packet !== undefined && 'kind' in packet && packet.kind === 'preseason').toBe(true);

    /*
     * Scoped to what the **renderer** built, which is the boundary that matters.
     * `take` and `concern` are the commissioner's own words in Tony's voice —
     * `docs/PRESEASON_SLICE_BOUNDARY.md §5` says so explicitly, and forbidding a
     * vocabulary there would forbid Tony an opinion. (It is not unchecked: the
     * banned-term half of the validator still applies to both, and every issue
     * here passed it.)
     *
     * The words below each need a comparison source this product does not have.
     * A model that produced one would be the interface deriving a fantasy
     * judgement for itself, which is the permanent decision this pins.
     */
    const sections = recordFor('preseason').desk!.edition.preseason!;
    const derived = [
      ...sections.board.map((row) => `${row.grade} ${row.manager}`),
      ...sections.snapshot.map((row) => `${row.label} ${row.value}`),
      ...sections.history.map((row) => `${row.label} ${row.value}`),
      ...sections.teams.flatMap((team) => [team.slot ?? '', team.positions ?? '', ...team.shape]),
    ]
      .join(' ')
      .toLowerCase();

    for (const banned of ['adp', 'reach', 'steal', 'sleeper', 'bust', 'project', 'value', 'winner of the draft']) {
      expect(derived, banned).not.toMatch(new RegExp(`\\b${banned}`));
    }
  });

  /* --- the approval boundary -------------------------------------------- */

  it('the cron leaves the paper waiting, and a named person moves it', () => {
    for (const key of SIMULATION_KEYS) {
      const publication = recordFor(key).publication;
      expect(publication, key).not.toBeNull();

      // What the cron left behind, before anybody stamped it.
      expect(publication!.statusBeforeApproval, key).toBe('needs_review');
      expect(publication!.statusAfterPublication, key).toBe('published');

      const actions = recordFor(key).desk!.history.map((event) => event.action);
      expect(actions, key).toContain('approved');
      expect(actions, key).toContain('published');

      const approval = recordFor(key).desk!.history.find((event) => event.action === 'approved');
      expect(approval?.actorName, key).toBe('Alex');
    }
  });

  it('exactly one issue is published per scenario, and it is the featured week', () => {
    /*
     * **Not one version.** Week 8 played eight Tuesdays and each of them drafted
     * a paper, which is the correct behaviour — `16 §4.3`'s chain ends in a
     * draft every week. What is one is the number a *person* stamped.
     */
    for (const key of SIMULATION_KEYS) {
      const record = recordFor(key);
      const published = record.after.versions.filter((version) => version.status === 'published');

      expect(published.length, key).toBe(1);
      expect(published[0]?.publishable, key).toBe(true);
      expect(published[0]?.week, key).toBe(SIMULATION_SCENARIOS[key].featured ?? 0);

      // Every other version is still sitting on the desk, unstamped.
      for (const version of record.after.versions) {
        if (version.status === 'published') continue;
        expect(version.status, `${key} week ${String(version.week)}`).toBe('needs_review');
      }
    }
  });

  /* --- isolation --------------------------------------------------------- */

  it('the archived seasons are untouched by every scenario', () => {
    for (const key of SIMULATION_KEYS) {
      const record = recordFor(key);
      // Everything the lab plays is 2026. `observe()` is scoped to the scripted
      // year, so a 2024 or 2025 game appearing here would mean the script wrote
      // into a finalized season — which the database refuses anyway.
      expect(record.after.season?.year, key).toBe(2026);
      expect(record.after.season?.finalized, key).toBe(false);
    }
  });

  it('no simulated draft can be mistaken for a real one', async () => {
    /*
     * The draft the preseason scenario stores is the recorded 2025 board
     * re-seated, and it is stored under a `demo:`-prefixed id — so a database
     * holding one says so in the row rather than in a comment.
     */
    const { draftFacts } = await import('@/lib/slice/draft-facts');
    const db = getDb();
    await resetDatabase(db);
    await runSimulation(db, 'preseason');

    const facts = await draftFacts(db, 2026);
    expect(facts.facts?.sleeperDraftId.startsWith('demo:')).toBe(true);
  }, 300_000);

  it('every balance reconciles to its own ledger rows', () => {
    for (const key of SIMULATION_KEYS) {
      const record = recordFor(key);
      for (const seat of record.after.seats) {
        const sum = record.after.ledger
          .filter((row) => row.manager === seat.manager)
          .reduce((total, row) => total + row.amount, 0);
        expect(sum, `${key} · ${seat.manager}`).toBe(seat.balance);
      }
    }
  });

  /* --- the report -------------------------------------------------------- */

  it('the report is written from the same record the assertions read', () => {
    for (const key of SIMULATION_KEYS) {
      const record = recordFor(key);
      const report = renderSimulationReport(record);

      expect(report, key).toContain(SIMULATION_SCENARIOS[key].title);
      // The paper itself is on the page, not a description of it.
      expect(report, key).toContain(record.desk!.edition.headline);
      expect(report, key).toContain('## 4. What Tony refused to say');
      expect(report, key).toContain('approved by');
    }
  });

  it('the catalog and the appliers agree', () => {
    expect([...records.keys()].sort()).toEqual([...SIMULATION_KEYS].sort());
    for (const key of SIMULATION_KEYS) {
      expect(SIMULATION_SCENARIOS[key].key).toBe(key);
    }
  });
});
