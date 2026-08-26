/**
 * The early-dues thank-you — a one-off token gift, named in a curated roster.
 *
 * ## What it is
 *
 * Two managers paid their league dues before the commissioner asked twice, and
 * the commissioner wanted that noticed in the shop rather than in a group chat.
 * So it is a **thank-you**, and every word of that matters:
 *
 *   - It is **not a reward for playing**. Nothing about a roster, a score, a
 *     week or a finish enters this file. `03 §4`'s fantasy-performance sources
 *     are `lib/rewards/derive.ts` and this is deliberately not in them.
 *   - It is **not an achievement, a level, a streak or a login bonus** — all of
 *     which `16 §8` rules out. It is owed to a fact that happened off the
 *     platform entirely, recorded here because a database cannot observe it.
 *   - It is **not repeatable and not chaseable**. There is no behaviour a
 *     manager can perform to enter this list; entering it is a file edit with a
 *     commissioner's name on it.
 *
 * ## The roster is data in source, and it carries its season
 *
 * `content/manager-mappings.json` is the precedent: a fact the software cannot
 * derive is written down where a pull request can see it, with the source of the
 * decision attached. This roster is the same shape and lives here rather than in
 * `content/` for one reason — it is *money*, and the two places money is decided
 * in this repository (`PROVISIONAL_ECONOMY` and this) are both typed constants a
 * type error protects.
 *
 * **Each entry names a season**, and that is the load-bearing part. Dues are
 * paid per season, so "NateyDee paid early" is a fact about **2026** and about
 * nothing else. A roster keyed only by username would hand the same bonus out
 * again in 2027 the first time a 2027 season was seeded — a payment for
 * something nobody had done yet, which `MANDATE §9` rules out more firmly than
 * any balance question. Extending this to another season is an edit to this
 * array, reviewed, with a source line.
 *
 * ## Sleeper username, not display name and not user id
 *
 * The commissioner named the two managers by their **Sleeper handles**, which is
 * how they appear in the app the dues conversation happened in. `users`
 * separates the three identities on purpose (`11 §2`): `display_name` is a
 * league decision that can be re-approved, `sleeper_user_id` is the durable
 * external key, and `sleeper_username` is what Sleeper shows. Matching the handle
 * keeps this file readable against the message it came from; the join to a
 * durable id happens once, in the service.
 *
 * Matching is **case-insensitive**, because Sleeper handles are unique
 * case-insensitively and preserve the case they were registered with — so
 * `NateyDee` and `nateydee` are one account and must not be two answers here.
 */

/** One line of the roster. A commissioner-recorded fact the software cannot derive. */
export interface EarlyDuesEntry {
  /** The Sleeper handle, as the commissioner wrote it. Matched case-insensitively. */
  readonly sleeperUsername: string;
  /** The season the dues were for. A bonus is a fact about one season. */
  readonly seasonYear: number;
  /** Who decided, and on what. Required, exactly as `manager-mappings.json` requires it. */
  readonly source: string;
}

/**
 * Who paid early, and for which season.
 *
 * Adding a row is the whole mechanism for extending this. Do not add one without
 * a `source`, and do not reuse an entry across seasons by widening the match —
 * a second season is a second row.
 */
export const EARLY_DUES_ROSTER: readonly EarlyDuesEntry[] = [
  {
    sleeperUsername: 'NateyDee',
    seasonYear: 2026,
    source: 'Commissioner — 2026 dues paid before the first reminder',
  },
  {
    sleeperUsername: 'MattyB2317',
    seasonYear: 2026,
    source: 'Commissioner — 2026 dues paid before the first reminder',
  },
];

/**
 * The handles owed a thank-you for one season, lower-cased for matching.
 *
 * Returns a `Set` rather than an array because the only question anybody asks of
 * it is membership, and a `Set` makes "is this manager on the list" impossible to
 * write as a linear scan that quietly compares the wrong case.
 */
export function earlyDuesHandlesFor(seasonYear: number): ReadonlySet<string> {
  return new Set(
    EARLY_DUES_ROSTER.filter((entry) => entry.seasonYear === seasonYear).map((entry) =>
      entry.sleeperUsername.toLowerCase(),
    ),
  );
}

/**
 * Is this Sleeper handle owed the thank-you for this season?
 *
 * A null handle is **not** eligible and that is a real case rather than a
 * defensive one: `users.sleeper_username` is nullable because a manager exists
 * in this database before they claim a Sleeper account, and an unclaimed row can
 * never be one of two named people.
 */
export function isEarlyDuesEligible(input: {
  readonly sleeperUsername: string | null;
  readonly seasonYear: number;
}): boolean {
  if (input.sleeperUsername === null) return false;
  return earlyDuesHandlesFor(input.seasonYear).has(input.sleeperUsername.toLowerCase());
}

/**
 * What the thank-you is worth: **two boxes, at the price in force**.
 *
 * Derived rather than written down, and the derivation is the decision. A
 * literal `400` would be a third number in the economy for the P3 simulation to
 * argue with, and it would silently stop meaning "two boxes" the next time the
 * box price moves — which has already happened once, when the 2026-08-04 ruling
 * took the box from 50 to 200.
 *
 * It reads `standardBoxPriceTokens` from the **stored** `economy_configs` row
 * rather than from `PROVISIONAL_ECONOMY`, like every other priced operation in
 * the product, so the amount is interpretable against the version recorded
 * beside it. **This changes no economy value**: nothing here writes a price, and
 * the box costs exactly what it cost before.
 */
export function earlyDuesAmount(prices: {
  /*
   * `number`, not `EconomyValues['standardBoxPriceTokens']`.
   *
   * `PROVISIONAL_ECONOMY` is `as const`, so that type is the literal `200` — and
   * a function that only accepts today's price is a function that cannot be
   * asked what the thank-you was worth at yesterday's. The stored config is what
   * callers actually pass, and its values are numbers that have moved once
   * already.
   */
  readonly standardBoxPriceTokens: number;
}): number {
  return prices.standardBoxPriceTokens * 2;
}

/**
 * The name this gift is filed under, forever.
 *
 * The same rule the weekly reward key follows (`rewardIdempotencyKey`): it names
 * the **occasion** — this season, this manager — and never the run and never the
 * amount. A retried seed, two concurrent deploys and a hand-run backfill all
 * produce this string, and `token_transactions.idempotency_key UNIQUE` turns
 * every one after the first into a no-op.
 *
 * The **amount is excluded deliberately**. If the box price moves between two
 * runs, `apply_token_delta` finds the key already recording a different delta and
 * raises — which is correct, because a gift already given must not be quietly
 * re-priced. Including the amount would instead pay both, at two prices, and both
 * rows would look legitimate.
 *
 * Keyed on the **season id** rather than the year, because a database holds one
 * row per season and the id is what the ledger's other keys use.
 */
export function earlyDuesIdempotencyKey(input: {
  readonly seasonId: string;
  readonly userId: string;
}): string {
  return `early-dues:${input.seasonId}:${input.userId}`;
}

/**
 * What the statement says. Curated template, never generated.
 *
 * `03 §5` requires a human-readable description on every ledger row and
 * `MANDATE` limits generative text to the Slice, so this is a sentence with one
 * hole in it. It says *thank you* in the shop's voice rather than naming an enum
 * value, because this is the line a manager reads on a receipt and "EARLY_DUES_
 * BONUS" is a database identifier that leaked.
 */
export function earlyDuesDescription(seasonYear: number): string {
  return `Thanks for getting your ${String(seasonYear)} dues in early. Two boxes on the house.`;
}
