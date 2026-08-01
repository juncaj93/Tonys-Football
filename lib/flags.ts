/**
 * What is open, and what is still shut.
 *
 * ## Nobody earns a hallway
 *
 * The obvious implementation of a locked door is a per-manager unlock, and it is
 * wrong here in a specific way: a per-manager unlock **is** progression, and
 * `16` removes achievements, levels, clout and prestige from this product
 * entirely. `18 §6` says it from the other direction — when a locked door opens
 * it opens *"for everyone at once, as an announced event"*.
 *
 * So a flag is a **deploy-time fact**. Every manager on a given deploy sees the
 * same shop. There is no row, no grant, no audit trail and nothing to migrate,
 * because there is nothing per-person to record.
 *
 * ## Read on the server, never in the browser
 *
 * `16`'s architecture invariant is that no database client runs in the browser,
 * and the same reasoning applies to the flags: a destination that is shut is
 * shut because the feature behind it does not exist, and a client that can flip
 * that bit can navigate to a route with nothing behind it.
 *
 * ## `roulette` is reserved and must never be implemented
 *
 * `16` requires the key to exist and the feature never to be built. That is not
 * a contradiction — it is the scaffolding a decision needs to stay made. A
 * reserved key with a test asserting it is permanently false is a place for the
 * ruling to live where somebody adding a game will actually read it.
 */

/**
 * Every destination this product can open or shut.
 *
 * Adding one is a deliberate act: `flags.test.ts` asserts the whole set, so a
 * new key has to be declared here *and* justified there.
 */
export type FeatureKey = 'rooms' | 'underground' | 'roulette';

export const FEATURE_KEYS: readonly FeatureKey[] = ['rooms', 'underground', 'roulette'];

/**
 * The v1 shop.
 *
 * Both destinations behind the Back Hall are shut, which is the state a real
 * manager meets today and therefore the one that gets the design attention.
 * `roulette` is shut permanently.
 */
const V1: Readonly<Record<FeatureKey, boolean>> = {
  // Basements are deferred to P6 / v1.1 (`16`).
  rooms: false,
  // The casino is P10 and is not in v1 (`16`).
  underground: false,
  // Never. `16`: "Roulette is never built. A reserved feature-flag key is the
  // entire required scaffolding."
  roulette: false,
};

export type FeatureFlags = Readonly<Record<FeatureKey, boolean>>;

/**
 * What is open on this deploy.
 *
 * `env` is a parameter rather than a direct `process.env` read for the same
 * reason the clock and the RNG are injected: a state that cannot be constructed
 * in a test is a state that gets shipped without being looked at, and the Back
 * Hall has three of them — both shut, one open, both open — of which real
 * managers will only ever see the first for the next year.
 *
 * The override is **preview-only** and refuses to do anything in production,
 * exactly as the demo guard does. A flag that could be flipped from a URL or an
 * environment variable in production would make "the casino is not in v1" a
 * configuration detail rather than a decision.
 */
export function featureFlags(
  /* A plain record, the way `assertDemoAllowed` takes it: a guard nobody can
   * construct in a test is a comment. */
  env: Record<string, string | undefined> = process.env,
  /**
   * `?open=rooms,underground` — review only, and inert everywhere it matters.
   *
   * The three Back Hall states — both shut, one open, both open — are otherwise
   * unphotographable in a single run: the flags are a property of the deploy, and
   * the driver cannot restart the server between states. `MANDATE §8` names
   * preview-only query parameters as a sanctioned demo mechanism, and this is
   * resolved **on the server**, behind the same two guards the demo system uses,
   * so it cannot be turned on from a URL bar in production.
   *
   * This is the state a real manager will not see for a year and which has to
   * look right when they do. Photographing it now is the entire point.
   */
  open?: string | string[] | undefined,
): FeatureFlags {
  if (env['VERCEL_ENV'] === 'production') return V1;
  if (env['DEMO_FIXTURES'] !== '1') return V1;

  const requested = [env['OPEN_FEATURES'] ?? '', ...(Array.isArray(open) ? open : [open ?? ''])]
    .join(',')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');

  const flags: Record<FeatureKey, boolean> = { ...V1 };

  for (const key of requested) {
    // `roulette` is deliberately unreachable, even here. It is not a feature
    // waiting for a switch; it is a decision with a key attached.
    if (key === 'rooms' || key === 'underground') flags[key] = true;
  }

  return flags;
}
