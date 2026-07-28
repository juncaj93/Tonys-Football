/**
 * The application clock.
 *
 * This is the ONLY place in the project permitted to read wall-clock time.
 * `no-restricted-syntax` in `eslint.config.mjs` bans `new Date()` and
 * `Date.now()` everywhere else.
 *
 * Two approved requirements depend on this:
 *
 *   - The time machine (`09 §7`) lets an admin simulate preseason, an active
 *     week, Tuesday publication, playoffs, spend-down, and the offseason.
 *     `09 §7` explicitly requires "an injected application clock" rather than
 *     "direct system-time calls scattered across business logic".
 *
 *   - The synthetic season replay (`16 §14`) drives a full fake 17-week season
 *     through the clock and asserts economy totals, story counts, and weekly
 *     shop changes. It cannot exist without a single override point.
 *
 * The override is deliberately process-global and deliberately simple. It is
 * for tests and for the sandbox environment. Production never sets it.
 */

/** Returns the same instant, in a form callers can freely mutate. */
export type ClockSource = () => Date;

let override: ClockSource | null = null;

/**
 * Current time.
 *
 * Always returns a fresh `Date`, so a caller mutating the result cannot
 * corrupt a frozen clock shared with other callers.
 */
export function now(): Date {
  if (override !== null) {
    return new Date(override().getTime());
  }
  // eslint-disable-next-line no-restricted-syntax -- the one sanctioned read
  return new Date();
}

/** Milliseconds since the epoch. Replaces `Date.now()`. */
export function nowMs(): number {
  return now().getTime();
}

/**
 * Pin the clock to a fixed instant.
 *
 * Tests and the sandbox only. Always pair with `clearClock()` in teardown.
 */
export function setFixedClock(instant: Date | string | number): void {
  const fixed = new Date(instant);
  if (Number.isNaN(fixed.getTime())) {
    throw new TypeError(`setFixedClock received an invalid instant: ${String(instant)}`);
  }
  override = () => fixed;
}

/** Drive the clock from a custom source, e.g. an advancing season replay. */
export function setClockSource(source: ClockSource): void {
  override = source;
}

/** Restore real time. */
export function clearClock(): void {
  override = null;
}

/** Whether the clock is currently overridden. Surfaced in sandbox UI. */
export function isClockOverridden(): boolean {
  return override !== null;
}
