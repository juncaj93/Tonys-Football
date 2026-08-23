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
export type FeatureKey = 'rooms' | 'underground' | 'roulette' | 'tonysLine';

export const FEATURE_KEYS: readonly FeatureKey[] = [
  'rooms',
  'underground',
  'roulette',
  'tonysLine',
];

/**
 * The v1 shop.
 *
 * Both destinations behind the Back Hall are shut, which is the state a real
 * manager meets today and therefore the one that gets the design attention.
 * `roulette` is shut permanently.
 */
const V1: Readonly<Record<FeatureKey, boolean>> = {
  /*
   * **Open**, 2026-08-09.
   *
   * `16 §3` deferred basements to v1.1 / Phase 6 on the grounds that *"the
   * Showcase carries the social weight at launch"*. The commissioner reopened
   * the scope and asked for the smallest strong version that makes the space
   * meaningful; it is built (`docs/ROOMS_BOUNDARY.md`), so the door opens.
   *
   * `18 §6`: when a locked door opens it opens **for everyone at once**, which
   * is what a deploy-time flag does and why this is one line rather than a
   * migration. **Shutting it again is the same one line** — set this to `false`
   * and the hall draws the chain, the stairs stop being an anchor, and the
   * built room is simply unreachable. Nothing is lost and no data is touched,
   * which is the property that made opening it the right default rather than a
   * commitment.
   *
   * What `18 §6` also asks for is that the opening be *announced*. That is the
   * commissioner's, not a deploy's, and it is recorded as such.
   */
  rooms: true,
  // Commissioner reopened blackjack + slots on 2026-08-23. Roulette remains shut forever.
  underground: true,
  // Never. `16`: "Roulette is never built. A reserved feature-flag key is the
  // entire required scaffolding."
  roulette: false,
  /*
   * Tony's Line is a market, and there is no season to run one on.
   *
   * `18 §3.4` puts it behind a flag in so many words: *"V1: Tony's weekly
   * prediction only. Later, behind the approved feature flag — Tony's Line."*
   * `16 §9` puts it in v1 scope. Both are satisfied by a deploy-time flag: the
   * feature is built, gated, and turned on for everyone at once when the season
   * starts, which is exactly how `18 §6` says a shut destination opens.
   *
   * Shut is also the only honest state today. The line is a season median and
   * the 2026 season has no games — authoring one now would be the *"weekly
   * reward that fires on nothing"* the checkpoint warns against, with tokens
   * attached.
   *
   * Unlike `roulette`, this one **is** a feature waiting for a switch, so the
   * preview override can open it and the demo states photograph it open.
   */
  tonysLine: false,
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

  /*
   * `?open=none` — everything shut, which is the state a **revert** produces.
   *
   * The override could only ever add, which was right while `rooms` and
   * `underground` were both shut in V1: every state above the floor was
   * reachable and the floor was the default. Opening `rooms` (2026-08-09)
   * inverted that — the chained stairwell became the state no parameter could
   * produce, and it is precisely the state Alex gets by setting `rooms` back to
   * `false`.
   *
   * `BACK_HALL_BOUNDARY §5` already argues the general case from the other
   * direction: *"the state nobody will see for a year… has to look right when
   * they do."* A state nobody will see **unless something is reverted** has the
   * same claim, and it is the one where being wrong is least recoverable.
   *
   * A sentinel rather than an empty value, because an empty `?open=` is
   * indistinguishable from an absent one after trimming.
   */
  const flags: Record<FeatureKey, boolean> = requested.includes('none')
    ? { rooms: false, underground: false, roulette: false, tonysLine: false }
    : { ...V1 };

  for (const key of requested) {
    // `roulette` is deliberately unreachable, even here. It is not a feature
    // waiting for a switch; it is a decision with a key attached.
    if (key === 'rooms' || key === 'underground' || key === 'tonysLine') flags[key] = true;
  }

  return flags;
}
