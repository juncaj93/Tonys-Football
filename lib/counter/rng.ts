import { randomInt } from 'node:crypto';

/**
 * Server-side randomness, injected the same way the clock is.
 *
 * ## Why this is its own module
 *
 * `lib/clock.ts` exists because business logic that reads wall time directly
 * cannot be replayed. A reward roll has exactly the same problem: a test that
 * asserts "a legendary pull is recorded as legendary" cannot be written against
 * an unseeded source, and `16 §14`'s synthetic-season replay has to be able to
 * drive an economy deterministically for seventeen weeks.
 *
 * So there is one override point, it lives here, and no other module generates
 * randomness. The parallel with the clock is deliberate and the rules are the
 * same: tests and the sandbox may override it, production never does.
 *
 * ## `crypto.randomInt`, not `Math.random`
 *
 * Two reasons, and the second is the one that matters.
 *
 *   - `randomInt(max)` is uniform over `[0, max)`. The obvious
 *     `Math.floor(Math.random() * max)` is too, but the equally obvious
 *     `Math.random()` scaled and then reduced with `%` is not — modulo bias
 *     makes low values slightly likelier, which is a thumb on the scale of a
 *     rarity table.
 *   - This decides who gets a legendary in a league of ten friends who talk to
 *     each other. A predictable stream is not a security hole here in any
 *     serious sense, but "the server's rolls were guessable" is a sentence this
 *     product should never have to say.
 */

/** Returns an integer in `[0, exclusiveMax)`. */
export type RandomSource = (exclusiveMax: number) => number;

let override: RandomSource | null = null;

/**
 * A roll in `[0, exclusiveMax)`.
 *
 * The only randomness in the application. Callers persist the value they got,
 * so an outcome stays recomputable from the stored roll and the stored table.
 */
export function rollBelow(exclusiveMax: number): number {
  if (!Number.isInteger(exclusiveMax) || exclusiveMax < 1) {
    throw new RangeError(`rollBelow needs a positive integer, got ${String(exclusiveMax)}`);
  }

  if (override !== null) {
    const value = override(exclusiveMax);
    if (!Number.isInteger(value) || value < 0 || value >= exclusiveMax) {
      // A test handing back an out-of-range roll would otherwise surface as a
      // confusing failure deep inside the resolver.
      throw new RangeError(
        `the injected random source returned ${String(value)}, outside [0, ${String(exclusiveMax)})`,
      );
    }
    return value;
  }

  return randomInt(exclusiveMax);
}

/**
 * Force every roll to one value.
 *
 * Tests and the sandbox only. Always pair with `clearRandomSource()`.
 */
export function setFixedRoll(value: number): void {
  override = () => value;
}

/** Drive rolls from a custom source, e.g. a seeded sequence in a season replay. */
export function setRandomSource(source: RandomSource): void {
  override = source;
}

/** Restore real randomness. */
export function clearRandomSource(): void {
  override = null;
}
