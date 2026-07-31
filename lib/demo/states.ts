/**
 * The loot states a demo has to be able to show, as data.
 *
 * `MANDATE §8`: *"a feature is not demo-ready if showing its states needs
 * hand-edited SQL."* Every state below is reachable by naming it, and each one
 * records **how it is reached** — because the honest half of this catalog is
 * which states are produced by driving the real system and which have to be
 * arranged.
 *
 * ## Three ways a state gets made, and the difference matters
 *
 * - `driven` — reached by calling the same server code a manager's tap calls.
 *   Buying a box in a demo is `purchaseBox`, so a demo that works proves the
 *   product works.
 * - `arranged` — the seat is put into a starting position first (tokens set,
 *   boxes granted) and then driven. Still no hand-written SQL, but the setup is
 *   not something a manager could do.
 * - `client` — cannot be produced from the server at all, because it is a
 *   condition of the browser: a reveal interrupted mid-animation, a request
 *   that fails in flight. These are listed so their absence is visible rather
 *   than quietly missing, and they are driven from the visual-QA harness.
 *
 * A catalog that silently omitted the client-only states would report twenty
 * covered when the four hardest were not.
 */

/** How a state is produced. See the note above. */
export type Reach = 'driven' | 'arranged' | 'client';

export interface DemoState {
  /** What you type. Stable — screenshots and issues refer to these. */
  readonly key: string;
  /** One line, in the room's language rather than the schema's. */
  readonly shows: string;
  readonly reach: Reach;
  /** Where a demo of this lands. */
  readonly route:
    | '/'
    | '/counter'
    | '/counter/collection'
    | '/counter/showcase'
    | '/profile/character';
}

/**
 * The twenty states, in the commissioner's order.
 *
 * Kept in one array rather than split by area, so "are they all here" is a
 * length check and not a reading exercise.
 */
export const DEMO_STATES: readonly DemoState[] = [
  { key: 'welcome-box', shows: 'a first welcome box, unopened', reach: 'driven', route: '/' },
  { key: 'no-box', shows: 'an empty tray with tokens to spend', reach: 'arranged', route: '/' },
  { key: 'one-box', shows: 'one unopened standard box', reach: 'arranged', route: '/' },
  { key: 'many-boxes', shows: 'several unopened boxes', reach: 'arranged', route: '/' },
  {
    key: 'box-waiting',
    shows: 'a returning manager with another box shut',
    reach: 'arranged',
    route: '/',
  },

  { key: 'pull-common', shows: 'a common pull on the tray', reach: 'arranged', route: '/' },
  { key: 'pull-rare', shows: 'a rare pull on the tray', reach: 'arranged', route: '/' },
  { key: 'pull-epic', shows: 'an epic pull on the tray', reach: 'arranged', route: '/' },
  { key: 'pull-legendary', shows: 'the top rarity on the tray', reach: 'arranged', route: '/' },
  {
    key: 'pull-whipped-cream',
    shows: 'the whipped-cream can, the named art reference',
    reach: 'arranged',
    route: '/',
  },
  { key: 'pull-duplicate', shows: 'a second copy of something owned', reach: 'arranged', route: '/' },

  {
    key: 'reveal-interrupted',
    shows: 'a reveal cut off mid-animation',
    reach: 'client',
    route: '/',
  },
  { key: 'reveal-resumed', shows: 'that same reveal, returned to', reach: 'client', route: '/' },
  {
    key: 'reveal-replayed',
    shows: 'a box already opened, opened again',
    reach: 'driven',
    route: '/',
  },

  {
    key: 'collection-empty',
    shows: 'nothing owned, all 24 spots named',
    reach: 'arranged',
    route: '/counter/collection',
  },
  {
    key: 'collection-full',
    shows: 'a well-populated shelf',
    reach: 'arranged',
    route: '/counter/collection',
  },
  {
    key: 'equipped-wearable',
    shows: 'a wearable owned and equipped',
    reach: 'arranged',
    route: '/profile/character',
  },
  {
    key: 'character-empty',
    shows: 'the customiser for a manager who owns nothing to wear',
    reach: 'arranged',
    route: '/profile/character',
  },
  {
    key: 'character-dressed',
    shows: 'every slot filled, and options in each one to change to',
    reach: 'arranged',
    route: '/profile/character',
  },
  {
    key: 'showcased',
    shows: 'one thing out where the league can see it',
    reach: 'driven',
    route: '/counter/showcase',
  },

  { key: 'broke', shows: 'not enough tokens to buy', reach: 'arranged', route: '/counter' },
  {
    key: 'pull-while-broke',
    shows: 'a pull with nothing left to buy another with',
    reach: 'arranged',
    route: '/',
  },
  { key: 'purchase-ok', shows: 'a successful purchase', reach: 'driven', route: '/counter' },
  { key: 'purchase-refused', shows: 'a purchase the database refused', reach: 'driven', route: '/counter' },
  { key: 'network-retry', shows: 'a failed request, retried', reach: 'client', route: '/counter' },
] as const;

export function demoState(key: string): DemoState {
  const found = DEMO_STATES.find((s) => s.key === key);
  if (found === undefined) {
    throw new Error(
      `no demo state named "${key}". Known: ${DEMO_STATES.map((s) => s.key).join(', ')}`,
    );
  }
  return found;
}

/**
 * The states that need a wearable or a character to exist.
 *
 * **Empty since M3's surface landed.** `equipped-wearable` was the single entry:
 * the commissioner listed it, and it could not be produced until a character
 * existed for a wearable to attach to. Naming it kept it in the catalog — and
 * honest — instead of quietly absent, and it now applies like any other state.
 *
 * The list stays rather than being deleted. It is the mechanism for *"a state
 * that cannot be produced yet is honest; a state quietly absent is not"*, and
 * the next milestone that declares a state ahead of its feature needs it.
 * `apply.test.ts` asserts it is empty, so a state parked here is a deliberate
 * edit rather than a leftover.
 */
export const BLOCKED_ON_M3: readonly string[] = [];
