import { describe, expect, it } from 'vitest';

import { seededDraw } from './draw';
import { selectContent, type SelectableEntry } from './select';

/**
 * The seeded content draw.
 *
 * `selectContent` used to default to `Math.random`, which is two separate
 * problems wearing one line of code:
 *
 *   - it is a second source of randomness in a codebase whose standing rule is
 *     that there is exactly one, `lib/counter/rng.ts`
 *   - it ran **inside a server render**, so the same request rendered twice
 *     could produce two different sentences
 *
 * These tests hold the replacement to what it is for: same request, same
 * answer, forever, on any machine.
 */

function entry(id: string, weight: number): SelectableEntry {
  return {
    id,
    key: id,
    requiredTags: [],
    excludedTags: [],
    templateText: id,
    weight,
    cooldownDays: 0,
    maxUsesPerSeason: null,
    sensitivity: 'ordinary',
  };
}

describe('seededDraw', () => {
  it('gives the same sequence for the same seed', () => {
    const a = seededDraw('alex', 'parlor_greeting', '2026-07-31');
    const b = seededDraw('alex', 'parlor_greeting', '2026-07-31');

    const first = [a(), a(), a(), a(), a()];
    const second = [b(), b(), b(), b(), b()];

    expect(second).toEqual(first);
  });

  it('gives a different sequence for a different manager, surface or day', () => {
    const base = seededDraw('alex', 'parlor_greeting', '2026-07-31')();

    expect(seededDraw('ryan', 'parlor_greeting', '2026-07-31')()).not.toBe(base);
    expect(seededDraw('alex', 'parlor_stats_aside', '2026-07-31')()).not.toBe(base);
    expect(seededDraw('alex', 'parlor_greeting', '2026-08-01')()).not.toBe(base);
  });

  it('advances, so a caller that draws twice gets two values', () => {
    const draw = seededDraw('alex', 'counter_box_offer', '2026-07-31');

    expect(draw()).not.toBe(draw());
  });

  it('stays inside [0, 1)', () => {
    const draw = seededDraw('alex', 'parlor_greeting', '2026-07-31');

    for (let index = 0; index < 500; index += 1) {
      const value = draw();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  /*
   * Pinned values, not just self-consistency.
   *
   * A seeded draw whose only test is "it agrees with itself" would keep passing
   * through a change of hash or generator, and every manager's greeting would
   * silently move on the day it shipped. These are the numbers this
   * implementation produces; changing them is a decision, not a refactor.
   */
  it('is pinned to specific values, so the generator cannot drift unnoticed', () => {
    const draw = seededDraw('alex', 'parlor_greeting', '2026-07-31');

    expect([draw(), draw(), draw()].map((value) => value.toFixed(9))).toEqual([
      '0.194708572',
      '0.826031346',
      '0.567668821',
    ]);
  });

  /*
   * The property the parlor actually depends on.
   *
   * Not "the numbers match" but "the sentence matches": two renders of one
   * request must choose the same line, before anything has been written to the
   * usage log and with no cache between them.
   */
  it('makes two renders of the same request choose the same line', () => {
    const candidates = [entry('a', 10), entry('b', 10), entry('c', 10), entry('d', 10)];

    const render = () =>
      selectContent({
        candidates,
        tags: new Set<string>(),
        variables: {},
        usage: [],
        now: new Date('2026-07-31T18:00:00Z'),
        random: seededDraw('alex', 'parlor_greeting', '2026-07-31'),
      })?.entry.id;

    const first = render();
    expect(first).toBeDefined();
    for (let index = 0; index < 20; index += 1) expect(render()).toBe(first);
  });

  it('does not give every manager the same line', () => {
    const candidates = [entry('a', 10), entry('b', 10), entry('c', 10), entry('d', 10)];

    const chosen = new Set(
      ['alex', 'ryan', 'nathan', 'cheese', 'matty', 'sugg', 'zack', 'brandon'].map(
        (who) =>
          selectContent({
            candidates,
            tags: new Set<string>(),
            variables: {},
            usage: [],
            now: new Date('2026-07-31T18:00:00Z'),
            random: seededDraw(who, 'parlor_greeting', '2026-07-31'),
          })?.entry.id,
      ),
    );

    expect(chosen.size).toBeGreaterThan(1);
  });
});
