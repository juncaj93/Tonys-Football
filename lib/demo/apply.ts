import { and, asc, eq } from 'drizzle-orm';

import { type Database } from '@/lib/db';
import { lootBoxes } from '@/lib/db/schema';
import { RARITIES, type Rarity, catalog } from '@/lib/counter/catalog';
import { ensureRewardTable, grantBox, openBox, purchaseBox } from '@/lib/counter/boxes';
import { collectionFor } from '@/lib/counter/collection';
import { standardRewardTable } from '@/lib/counter/rewards';
import { clearRandomSource, setFixedRoll } from '@/lib/counter/rng';
import { setShowcase, showcaseChoices } from '@/lib/counter/showcase';
import { applyTokenDelta, economyFor, ensureEconomyConfig, wallet } from '@/lib/counter/tokens';

import { DemoRefused, assertDemoAllowed, assertDemoSeat } from './guard';
import { DEMO_PIN, type DemoSeat, ensureDemoSeat } from './seat';
import { BLOCKED_ON_M3, DEMO_STATES, type DemoState, demoState } from './states';

/**
 * Putting a demo state into the database, by driving the product.
 *
 * ## Nothing in this file writes a row the product would not write
 *
 * Every applier below composes `grantBox`, `purchaseBox`, `openBox`,
 * `applyTokenDelta` and `setShowcase` — the same functions a manager's tap
 * reaches. There is no `INSERT INTO collectibles` here and there must never be
 * one, because the whole value of a demo is that **it is evidence.** A demo that
 * hand-writes the state it is demonstrating proves the screenshot, not the
 * product.
 *
 * Two consequences that look like limitations and are not:
 *
 * - A balance is never *set*, only moved, because `season_memberships.token_balance`
 *   has exactly one write path. `broke` is reached by spending down through the
 *   ledger, which is also how a manager reaches it.
 * - An outcome is never *chosen*, only rolled, because `openBox` decides the item
 *   and records the roll. A specific rarity is produced by injecting the roll that
 *   resolves to it (`rollForSlug`) — the same arithmetic `resolveRoll` will do,
 *   run forwards instead of backwards. The recorded roll and table version still
 *   recompute the item exactly, so a demo pull is as auditable as a real one.
 *
 * ## Fixed seeds, and what "idempotent" buys
 *
 * Every key is derived from the seat's reserved Sleeper id, which carries the
 * state name and the generation. Re-applying a state is therefore a no-op
 * through the product's own unique constraints rather than through a check here.
 * See the note at the top of `seat.ts`.
 */

/** A state the catalog names but the product cannot produce yet. */
export class DemoBlocked extends Error {
  constructor(
    readonly stateKey: string,
    reason: string,
  ) {
    super(reason);
    this.name = 'DemoBlocked';
  }
}

export interface DemoOutcome {
  readonly state: DemoState;
  readonly seat: DemoSeat;
  /** Sign in here. The whole point of the CLI's output. */
  readonly doorPath: string;
  /** Then open this. */
  readonly viewPath: string;
  readonly pin: string;
  /** What was actually written. Printed by the CLI; asserted by the tests. */
  readonly evidence: Readonly<Record<string, string | number | boolean>>;
  /**
   * What the browser still has to do.
   *
   * Non-empty only for `client` states, whose condition — a reveal cut off
   * mid-animation, a request that fails in flight — exists in the page and not
   * in the database. The applier still sets up the precondition, so the harness
   * has something to interrupt.
   */
  readonly browserSteps: readonly string[];
}

/**
 * Apply one named state.
 *
 * Both guards run here, in this order, and neither is skippable: where it may
 * run, then what it may address.
 */
export async function applyDemoState(
  db: Database,
  key: string,
  env: Record<string, string | undefined>,
): Promise<DemoOutcome> {
  assertDemoAllowed(env);

  const state = demoState(key);
  if (BLOCKED_ON_M3.includes(state.key)) {
    throw new DemoBlocked(
      state.key,
      `"${state.key}" needs a character for a wearable to be equipped onto, which is M3. ` +
        'It stays in the catalog so its absence is visible rather than quietly missing.',
    );
  }

  const index = DEMO_STATES.findIndex((candidate) => candidate.key === state.key);
  const seat = await ensureDemoSeat(db, { stateKey: state.key, stateIndex: index });
  assertDemoSeat(seat.sleeperUserId);

  // The economy and the reward table have to be stored before anything spends or
  // opens: both services refuse to invent one, which is the correct strictness
  // and would otherwise make the first demo of a fresh database fail obscurely.
  await ensureEconomyConfig(db, seat.seasonId);
  await ensureRewardTable(db);

  const applier = APPLIERS[state.key];
  if (applier === undefined) {
    // Unreachable while the coverage test passes. Thrown rather than defaulted,
    // because a state that silently applied nothing would screenshot as a bug in
    // the feature.
    throw new DemoRefused(`no applier for demo state "${state.key}"`);
  }

  const applied = await applier(db, seat);

  return {
    state,
    seat,
    doorPath: `/door/${seat.userId}`,
    viewPath: state.route,
    pin: DEMO_PIN,
    evidence: applied.evidence,
    browserSteps: applied.browserSteps ?? [],
  };
}

interface Applied {
  readonly evidence: Readonly<Record<string, string | number | boolean>>;
  readonly browserSteps?: readonly string[];
}

type Applier = (db: Database, seat: DemoSeat) => Promise<Applied>;

/* -------------------------------------------------------------------------
 * Primitives — each one a call into the product, keyed off the seat
 * ---------------------------------------------------------------------- */

/** A key nothing else can collide with: the reserved seat id plus what this is. */
function key(seat: DemoSeat, what: string): string {
  return `${seat.sleeperUserId}:${what}`;
}

/** Open the season tab at the standard opening balance. */
async function openTab(db: Database, seat: DemoSeat): Promise<number> {
  const { values } = await economyFor(db, seat.seasonId);
  await applyTokenDelta(db, {
    userId: seat.userId,
    seasonId: seat.seasonId,
    amount: values.seasonStartTokens,
    reason: 'SEASON_START',
    description: `Tony opens a tab for the ${String(seat.seasonYear)} season.`,
    idempotencyKey: key(seat, 'tab'),
  });
  return values.seasonStartTokens;
}

/**
 * Spend the tab down to `target`.
 *
 * A single `COMMISSIONER_ADJUSTMENT` rather than a balance write, because there
 * is no balance write to make. Idempotent through the key, and a no-op when the
 * tab is already at or below the target — so re-applying `broke` after a
 * purchase does not silently claw tokens back.
 */
async function spendDownTo(db: Database, seat: DemoSeat, target: number): Promise<number> {
  const held = await wallet(db, { userId: seat.userId, seasonId: seat.seasonId });
  if (held === null) throw new DemoRefused('the demo seat has no wallet; ensureDemoSeat failed');
  if (held.balance <= target) return held.balance;

  await applyTokenDelta(db, {
    userId: seat.userId,
    seasonId: seat.seasonId,
    amount: target - held.balance,
    reason: 'COMMISSIONER_ADJUSTMENT',
    description: 'Tony settles the tab down to where the demo needs it.',
    idempotencyKey: key(seat, `spend-down-to-${String(target)}`),
  });

  return target;
}

/**
 * Put `count` boxes on the tray, granted once each, ever.
 *
 * Each box's grant key carries its index, so a box is addressable by *which* box
 * it is rather than by "the oldest unopened one". That distinction is what makes
 * the pull states re-runnable: see {@link pull}.
 */
async function grantBoxes(db: Database, seat: DemoSeat, count: number): Promise<number> {
  let granted = 0;
  for (let i = 0; i < count; i++) {
    const result = await grantBox(db, {
      userId: seat.userId,
      grantKey: boxKey(seat, i),
      source: 'demo',
    });
    if (result.granted) granted += 1;
  }
  return granted;
}

function boxKey(seat: DemoSeat, index: number): string {
  return key(seat, `box:${String(index)}`);
}

/** The demo's *n*th box, by its grant key. Null if it was never granted. */
async function boxAt(db: Database, seat: DemoSeat, index: number): Promise<string | null> {
  const rows = await db
    .select({ id: lootBoxes.id })
    .from(lootBoxes)
    .where(and(eq(lootBoxes.userId, seat.userId), eq(lootBoxes.grantKey, boxKey(seat, index))))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * The roll that resolves to a slug.
 *
 * The cumulative offset of the entry in the stored table — `resolveRoll` walks
 * the same order, so this is that walk run backwards. Deliberately the *first*
 * roll in the entry's band rather than a random one inside it, so a demo's
 * recorded roll is reproducible to the integer.
 */
export function rollForSlug(slug: string): number {
  const table = standardRewardTable();
  let cursor = 0;
  for (const entry of table.entries) {
    if (entry.slug === slug) return cursor;
    cursor += entry.weight;
  }
  throw new DemoRefused(`no reward-table entry for "${slug}"; the catalog does not hold it`);
}

/** Every tier, in escalation order. `collection-full` walks it. */
const RARITY_SPREAD: readonly Rarity[] = RARITIES;

/** The first catalog slug of a rarity, in the table's stable order. */
function firstOfRarity(rarity: Rarity): string {
  const found = catalog().find((item) => item.rarity === rarity);
  if (found === undefined) {
    throw new DemoRefused(`the catalog holds no ${rarity} item to demo`);
  }
  return found.slug;
}

/**
 * Grant the demo's *n*th box and open it, forcing the roll that yields `slug`.
 *
 * ## Why the box is addressed by index and not by "the oldest unopened one"
 *
 * Re-running a state has to land in the same place, and the first version of
 * this took whatever box happened to be unopened — so a second run found none
 * and failed. Naming the box makes the second run go through `openBox` on an
 * already-opened box, which returns the **recorded** reveal with
 * `replayed: true` and rolls nothing. The state is therefore idempotent through
 * the product's own guarantee rather than through a check here, which is the
 * point: if `box_openings.box_id UNIQUE` ever stopped working, these demos would
 * be the thing that noticed.
 *
 * The injected RNG is the same override point tests use — one place where
 * randomness enters the application, so a demo does not need a second one. It is
 * cleared in a `finally`, because leaking a fixed roll into a later call would
 * make a subsequent demo silently wrong rather than loudly broken.
 */
async function pull(
  db: Database,
  seat: DemoSeat,
  index: number,
  slug: string,
): Promise<{ slug: string; rarity: string; replayed: boolean; boxId: string }> {
  await grantBoxes(db, seat, index + 1);

  const boxId = await boxAt(db, seat, index);
  if (boxId === null) throw new DemoRefused(`the demo's box ${String(index)} was not granted`);

  setFixedRoll(rollForSlug(slug));
  try {
    const result = await openBox(db, { userId: seat.userId, boxId });
    if (result.status !== 'opened') {
      throw new DemoRefused(`opening the demo box returned ${result.status}`);
    }
    return { ...result.reveal, boxId };
  } finally {
    clearRandomSource();
  }
}

/** How many boxes this seat still holds unopened. */
async function unopenedCount(db: Database, seat: DemoSeat): Promise<number> {
  const rows = await db
    .select({ id: lootBoxes.id })
    .from(lootBoxes)
    .where(and(eq(lootBoxes.userId, seat.userId), eq(lootBoxes.state, 'UNOPENED')))
    .orderBy(asc(lootBoxes.grantedAt));
  return rows.length;
}

/* -------------------------------------------------------------------------
 * The appliers
 * ---------------------------------------------------------------------- */

/**
 * A pull of a named rarity: tab, one box, one forced roll.
 *
 * The box is granted rather than bought so the pull states do not all also
 * demonstrate a purchase — `purchase-ok` is its own state and conflating them
 * would make a failure in either look like a failure in both.
 */
function pullState(rarity: Rarity): Applier {
  return async (db, seat) => pullSlug(firstOfRarity(rarity))(db, seat);
}

function pullSlug(slug: string): Applier {
  return async (db, seat) => {
    await openTab(db, seat);
    const reveal = await pull(db, seat, 0, slug);
    return {
      evidence: {
        slug: reveal.slug,
        rarity: reveal.rarity,
        roll: rollForSlug(slug),
        rewardTable: standardRewardTable().version,
      },
    };
  };
}

const APPLIERS: Readonly<Record<string, Applier>> = {
  /* --- the tray ------------------------------------------------------- */

  'welcome-box': async (db, seat) => {
    await openTab(db, seat);
    await grantBoxes(db, seat, 1);
    return {
      evidence: { unopenedBoxes: await unopenedCount(db, seat), source: 'demo' },
    };
  },

  /**
   * An empty tray with money in the tab.
   *
   * No box is granted at all, rather than one being granted and removed. There
   * is nothing to undo because nothing was done — which is the shape every
   * "absence" state should have.
   */
  'no-box': async (db, seat) => {
    const opening = await openTab(db, seat);
    return { evidence: { unopenedBoxes: await unopenedCount(db, seat), balance: opening } };
  },

  'one-box': async (db, seat) => {
    await openTab(db, seat);
    await grantBoxes(db, seat, 1);
    return { evidence: { unopenedBoxes: await unopenedCount(db, seat) } };
  },

  'many-boxes': async (db, seat) => {
    await openTab(db, seat);
    await grantBoxes(db, seat, 3);
    return { evidence: { unopenedBoxes: await unopenedCount(db, seat) } };
  },

  /* --- the reveal ------------------------------------------------------ */

  'pull-common': pullState('common'),
  'pull-rare': pullState('rare'),
  'pull-epic': pullState('epic'),
  'pull-legendary': pullState('legendary'),

  /*
   * The commissioner names this collectible `collectible_can_whipped_cream`.
   * The canonical slug is `collectible_reddiwip` and its registry `alt` — which
   * is the name shown under it — is "Can of whipped cream". Same object, and the
   * registry is the source of truth for the slug (`ASSET_PIPELINE.md`), so the
   * demo points at the real one rather than minting a second name for it.
   */
  'pull-whipped-cream': pullSlug('collectible_reddiwip'),

  /**
   * The same item twice.
   *
   * Two boxes, both forced to one slug, so the second reveal is a genuine
   * duplicate rather than a duplicate flag set by hand. `collectionFor` counts
   * copies, so the evidence records the count it actually produced.
   */
  'pull-duplicate': async (db, seat) => {
    await openTab(db, seat);
    const slug = firstOfRarity('common');

    const first = await pull(db, seat, 0, slug);
    const second = await pull(db, seat, 1, slug);

    const collection = await collectionFor(db, seat.userId);
    const entry = collection.entries.find((candidate) => candidate.slug === slug);

    return {
      evidence: {
        slug,
        firstRarity: first.rarity,
        secondRarity: second.rarity,
        count: entry?.count ?? 0,
        distinct: collection.distinct,
      },
    };
  },

  /**
   * A reveal cut off, and the same reveal returned to.
   *
   * Both are conditions of the page rather than of the database, so the applier
   * leaves a box on the tray and hands the interruption to the browser. Listing
   * them as states with a precondition — rather than omitting them — is what
   * keeps "twenty states covered" from meaning eighteen.
   */
  'reveal-interrupted': async (db, seat) => {
    await openTab(db, seat);
    await grantBoxes(db, seat, 1);
    return {
      evidence: { unopenedBoxes: await unopenedCount(db, seat) },
      browserSteps: [
        'tap the box on the tray',
        'navigate away or reload before the reveal settles',
      ],
    };
  },

  'reveal-resumed': async (db, seat) => {
    await openTab(db, seat);
    await grantBoxes(db, seat, 1);
    return {
      evidence: { unopenedBoxes: await unopenedCount(db, seat) },
      browserSteps: [
        'tap the box on the tray and reload mid-animation',
        'return to the parlor — the box is opened and the item is on the shelf',
      ],
    };
  },

  /**
   * A box opened, then opened again.
   *
   * Driven end to end here rather than left to the browser, because the claim
   * being demonstrated is a *server* one: the second call returns the first
   * roll instead of rolling again. The evidence records both, so a demo that
   * ever produced two different items would fail visibly rather than look fine.
   */
  'reveal-replayed': async (db, seat) => {
    await openTab(db, seat);
    const first = await pull(db, seat, 0, firstOfRarity('rare'));

    const again = await openBox(db, { userId: seat.userId, boxId: first.boxId });
    if (again.status !== 'opened') {
      throw new DemoRefused(`re-opening the demo box returned ${again.status}`);
    }

    return {
      evidence: {
        boxId: first.boxId,
        firstSlug: first.slug,
        replaySlug: again.reveal.slug,
        replayed: again.reveal.replayed,
        sameItem: again.reveal.slug === first.slug,
      },
    };
  },

  /* --- the shelf ------------------------------------------------------- */

  'collection-empty': async (db, seat) => {
    const opening = await openTab(db, seat);
    const collection = await collectionFor(db, seat.userId);
    return {
      evidence: { distinct: collection.distinct, total: collection.total, balance: opening },
    };
  },

  /**
   * A shelf with a spread across every rarity.
   *
   * Eight pulls, forced to the first item of each tier twice over, so the page
   * shows owned and unowned side by side and every rarity treatment appears. Not
   * a full set on purpose: `03 §12` makes set progress a statement about the
   * gap, and a complete shelf has nothing to say about it.
   */
  'collection-full': async (db, seat) => {
    await openTab(db, seat);

    // Two of every tier, in catalog order. Eight distinct items out of
    // twenty-four: enough that every rarity treatment appears on the shelf and
    // owned sits next to unowned, and not so many that set progress — which
    // `03 §12` makes a statement about the *gap* — has nothing left to say.
    const spread = RARITY_SPREAD.flatMap((rarity) =>
      catalog()
        .filter((item) => item.rarity === rarity)
        .slice(0, 2)
        .map((item) => item.slug),
    );

    for (const [index, slug] of spread.entries()) {
      await pull(db, seat, index, slug);
    }

    const collection = await collectionFor(db, seat.userId);
    return {
      evidence: {
        distinct: collection.distinct,
        total: collection.total,
        copies: collection.copies,
        tiers: RARITY_SPREAD.length,
      },
    };
  },

  'showcased': async (db, seat) => {
    await openTab(db, seat);
    const reveal = await pull(db, seat, 0, firstOfRarity('epic'));

    const choices = await showcaseChoices(db, seat.userId);
    const choice = choices.find((candidate) => candidate.slug === reveal.slug);
    if (choice === undefined) {
      throw new DemoRefused('the pulled collectible did not appear among the showcase choices');
    }

    const result = await setShowcase(db, {
      userId: seat.userId,
      collectibleId: choice.collectibleId,
    });
    if (result.status !== 'set') {
      throw new DemoRefused(`the showcase refused the demo item: ${result.status}`);
    }

    return { evidence: { slug: reveal.slug, rarity: reveal.rarity, showcased: true } };
  },

  /* --- the counter ----------------------------------------------------- */

  /**
   * Not enough on the tab to buy.
   *
   * Spent down through the ledger to one token under the price, so the refusal
   * the demo shows is the database's `CHECK (token_balance >= 0)` rather than a
   * client comparison — the Buy button is never disabled on a read balance.
   */
  broke: async (db, seat) => {
    await openTab(db, seat);
    const { values } = await economyFor(db, seat.seasonId);
    const balance = await spendDownTo(db, seat, values.standardBoxPriceTokens - 1);
    return { evidence: { balance, price: values.standardBoxPriceTokens } };
  },

  /**
   * A pull, with an empty tab underneath it.
   *
   * The state that proves the reveal plate makes **no offer** when the offer
   * could not be taken. `MANDATE §8` lists "zero tokens" among the scenarios,
   * and until this existed the absent case could only be reasoned about — every
   * reveal screenshot ever taken was of somebody who could afford another box.
   *
   * Spent down *before* the pull so the plate reads the empty tab, not a
   * balance that was true a moment earlier.
   */
  'pull-while-broke': async (db, seat) => {
    await openTab(db, seat);
    const { values } = await economyFor(db, seat.seasonId);
    const balance = await spendDownTo(db, seat, values.standardBoxPriceTokens - 1);
    const reveal = await pull(db, seat, 0, firstOfRarity('common'));

    return {
      evidence: {
        slug: reveal.slug,
        balance,
        price: values.standardBoxPriceTokens,
        canAffordAnother: balance >= values.standardBoxPriceTokens,
      },
    };
  },

  'purchase-ok': async (db, seat) => {
    await openTab(db, seat);
    const result = await purchaseBox(db, {
      userId: seat.userId,
      seasonId: seat.seasonId,
      idempotencyKey: key(seat, 'purchase'),
    });
    if (result.status !== 'bought') {
      throw new DemoRefused(`the demo purchase was refused: ${result.status}`);
    }
    const held = await wallet(db, { userId: seat.userId, seasonId: seat.seasonId });
    return {
      evidence: {
        spent: result.spent,
        balance: held?.balance ?? 0,
        unopenedBoxes: await unopenedCount(db, seat),
      },
    };
  },

  /**
   * A purchase the database refused.
   *
   * The tab is spent down first and then a real purchase is attempted, so what
   * the demo shows is the actual refusal path and its actual message — not a
   * mocked one. `purchaseBox` debits before it creates the box, so a refused
   * purchase leaves nothing behind, and the evidence proves that too.
   */
  'purchase-refused': async (db, seat) => {
    await openTab(db, seat);
    const { values } = await economyFor(db, seat.seasonId);
    await spendDownTo(db, seat, values.standardBoxPriceTokens - 1);

    const result = await purchaseBox(db, {
      userId: seat.userId,
      seasonId: seat.seasonId,
      idempotencyKey: key(seat, 'purchase-refused'),
    });
    if (result.status !== 'insufficient_tokens') {
      throw new DemoRefused(`the demo expected a refusal and got ${result.status}`);
    }

    return {
      evidence: {
        refused: true,
        price: result.price,
        balance: result.balance,
        boxesCreated: await unopenedCount(db, seat),
      },
    };
  },

  /**
   * A request that fails in flight, and the retry.
   *
   * Purely a browser condition — the server never sees the first attempt — so
   * the applier only puts a buyable tab in place and names what the harness has
   * to do to it.
   */
  'network-retry': async (db, seat) => {
    const opening = await openTab(db, seat);
    return {
      evidence: { balance: opening },
      browserSteps: [
        'route the buy request to failure (Playwright: page.route → abort)',
        'tap Buy, see the failure, restore the route and tap again',
        'the tab moves exactly once — the ledger key is the same purchase',
      ],
    };
  },
};

/** Every state the appliers cover. The coverage test compares this to the catalog. */
export const APPLIED_STATES: readonly string[] = Object.keys(APPLIERS);
