import { and, asc, desc, eq, isNotNull, like, sql } from 'drizzle-orm';

import { DEFAULT_CONFIGURATION } from '@/lib/character/composite';
import { characterFor, grantWearable, ownedWearables, saveCharacter } from '@/lib/character/service';
import { now } from '@/lib/clock';
import { type Database } from '@/lib/db';
import {
  fantasyMatchups,
  lootBoxes,
  seasonMemberships,
  seasons,
  tokenTransactions,
} from '@/lib/db/schema';
import { RARITIES, type Rarity, catalog } from '@/lib/counter/catalog';
import { ensureRewardTable, grantBox, openBox, purchaseBox } from '@/lib/counter/boxes';
import { grantChampionshipRings, ringsFor } from '@/lib/counter/rings';
import { collectionFor } from '@/lib/counter/collection';
import { standardRewardTable } from '@/lib/counter/rewards';
import { clearRandomSource, setFixedRoll } from '@/lib/counter/rng';
import { setShowcase, showcaseChoices } from '@/lib/counter/showcase';
import { applyTokenDelta, economyFor, ensureEconomyConfig, wallet } from '@/lib/counter/tokens';
import { assembleIssue } from '@/lib/slice/edition';
import {
  approveVersion,
  generateDraft,
  publishVersion,
  recordVersion,
  reviewDetail,
  setPublicationHold,
} from '@/lib/slice/publication';
import { type Edition } from '@/lib/slice/render';
import { validateEdition } from '@/lib/slice/validate';

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
  /**
   * Which states are blocked. Defaults to the real list and is a parameter only
   * so the refusal itself stays testable now that the list is empty — a
   * mechanism exercised solely through whichever state happens to be blocked
   * today stops being exercised at all the moment the last one ships.
   */
  blocked: readonly string[] = BLOCKED_ON_M3,
): Promise<DemoOutcome> {
  assertDemoAllowed(env);

  const state = demoState(key);
  if (blocked.includes(state.key)) {
    throw new DemoBlocked(
      state.key,
      `"${state.key}" needs a character for a wearable to be equipped onto, which is M3. ` +
        'It stays in the catalog so its absence is visible rather than quietly missing.',
    );
  }

  const index = DEMO_STATES.findIndex((candidate) => candidate.key === state.key);
  const seat = await ensureDemoSeat(db, {
    stateKey: state.key,
    stateIndex: index,
    commissioner: state.commissioner === true,
  });
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
 * Top the tab up to `target`, if it is short.
 *
 * The mirror of {@link spendDownTo}, and it exists because a demo state that
 * promises *"tokens to spend"* has to keep that promise at whatever the box
 * costs. `openTab` grants the season's opening balance **once, ever**, so a seat
 * that has already bought something is never refilled — which was invisible
 * while a 250-token opening bought five 50-token boxes, and broke the moment the
 * commissioner's ruling moved the box to 200 and the same balance bought one.
 *
 * A `COMMISSIONER_ADJUSTMENT` rather than a balance write, for the reason
 * `spendDownTo` gives: there is no balance write to make.
 *
 * **The key counts the top-ups**, and getting there took two wrong answers worth
 * recording. Keying on the *target* raises the second time the seat needs a
 * different sum to reach it, because `apply_token_delta` refuses a key already
 * recorded with a different delta. Keying on the *amount* then silently no-ops
 * when the same sum is needed twice — which is exactly what happens when three
 * screen widths each buy a box from one seat.
 *
 * Two legitimate top-ups of the same size are two events, so the key says which
 * one it is. A genuine re-apply never reaches the key at all: it short-circuits
 * on `held.balance >= target` above.
 */
async function topUpTo(db: Database, seat: DemoSeat, target: number): Promise<number> {
  const held = await wallet(db, { userId: seat.userId, seasonId: seat.seasonId });
  if (held === null) throw new DemoRefused('the demo seat has no wallet; ensureDemoSeat failed');
  if (held.balance >= target) return held.balance;

  const [prior] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tokenTransactions)
    .where(
      and(
        eq(tokenTransactions.seasonMembershipId, held.membershipId),
        like(tokenTransactions.idempotencyKey, `${key(seat, 'top-up')}%`),
      ),
    );

  await applyTokenDelta(db, {
    userId: seat.userId,
    seasonId: seat.seasonId,
    amount: target - held.balance,
    reason: 'COMMISSIONER_ADJUSTMENT',
    description: 'Tony puts enough on the tab for the demo to buy something.',
    idempotencyKey: key(seat, `top-up-${String(prior?.n ?? 0)}`),
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

/** Every catalog slug of a rarity, in the table's stable order. */
function allOfRarity(rarity: Rarity): readonly string[] {
  const found = catalog().filter((item) => item.rarity === rarity).map((item) => item.slug);
  if (found.length === 0) {
    throw new DemoRefused(`the catalog holds no ${rarity} item to demo`);
  }
  return found;
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
): Promise<{
  slug: string;
  rarity: string;
  replayed: boolean;
  salvageTokens: number | null;
  boxId: string;
}> {
  await grantBoxes(db, seat, index + 1);

  const boxId = await boxAt(db, seat, index);
  if (boxId === null) throw new DemoRefused(`the demo's box ${String(index)} was not granted`);

  setFixedRoll(rollForSlug(slug));
  try {
    const result = await openBox(db, {
      userId: seat.userId,
      boxId,
      seasonId: seat.seasonId,
    });
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
/**
 * Seat this manager as the champion of one or more finalized seasons.
 *
 * League state, not collectible state — the ring itself is granted afterwards by
 * the real path. The years are far outside the imported league so a demo can
 * never be mistaken for, or collide with, a season that actually happened.
 */
async function crownIn(db: Database, userId: string, years: readonly number[]): Promise<void> {
  for (const year of years) {
    const [season] = await db
      .insert(seasons)
      .values({
        year,
        status: 'ARCHIVED',
        isHistorical: true,
        finalizedAt: new Date(`${String(year)}-01-05T00:00:00Z`),
      })
      .onConflictDoNothing({ target: seasons.year })
      .returning({ id: seasons.id });

    const id =
      season?.id ??
      (await db.select({ id: seasons.id }).from(seasons).where(eq(seasons.year, year)))[0]?.id;
    if (id === undefined) continue;

    await db
      .insert(seasonMemberships)
      .values({ seasonId: id, userId, rosterId: 1, finalRank: 1 })
      .onConflictDoNothing();
  }
}

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
    /*
     * *"An empty tray with **tokens to spend**"* — so the tab has to be able to
     * buy a box, whatever a box costs. The opening balance alone was enough
     * while boxes were 50 and is exactly one box at 200, and a seat that has
     * already spent is never refilled by `openTab`, which grants once ever.
     */
    await openTab(db, seat);
    const { values } = await economyFor(db, seat.seasonId);
    const balance = await topUpTo(db, seat, values.standardBoxPriceTokens);
    return { evidence: { unopenedBoxes: await unopenedCount(db, seat), balance } };
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

  /**
   * Somebody who has opened one before, with another waiting.
   *
   * The second of the two moments Tony speaks to (`lib/parlor/moment.ts`). It is
   * not `one-box` with extra steps: a manager holding a box and *no*
   * collectibles is being handed their first, and Tony says something different
   * to each. Both had to be reachable or only one of the two approved line
   * groups could ever be reviewed.
   */
  'box-waiting': async (db, seat) => {
    await openTab(db, seat);
    await pull(db, seat, 0, firstOfRarity('common'));
    await grantBoxes(db, seat, 2);

    return {
      evidence: {
        unopenedBoxes: await unopenedCount(db, seat),
        collected: (await collectionFor(db, seat.userId)).distinct,
      },
    };
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
   * A spare, and what Tony gives you for it.
   *
   * ## The old version of this state is now unreachable, which is the point
   *
   * It used to open two boxes forced to the same slug and photograph the second
   * copy. `16 §8` — implemented in `0014` — redirects a roll that lands on
   * something owned to an unowned item in the same tier, so there is no longer
   * any sequence of boxes that produces two of one thing. Keeping the old
   * applier would have meant a demo asserting a rule the product had stopped
   * following, and it would have kept passing: the second pull simply returns a
   * different common.
   *
   * So the state moved to the outcome that replaced it. Every legendary is
   * pulled first — the smallest tier, so this costs three boxes rather than
   * eleven — and the next legendary roll has nowhere to go and converts.
   *
   * The salvage is **rolled, never set**: the applier forces the roll and reads
   * back what the server decided, exactly as every other reveal state does.
   */
  'pull-duplicate': async (db, seat) => {
    await openTab(db, seat);
    const tier = allOfRarity('legendary');

    for (const [index, slug] of tier.entries()) {
      await pull(db, seat, index, slug);
    }

    const spare = await pull(db, seat, tier.length, tier[0] ?? '');

    const collection = await collectionFor(db, seat.userId);

    return {
      evidence: {
        slug: spare.slug,
        rarity: spare.rarity,
        // Zero would be a lie about a salvage and is impossible for one —
        // `box_openings_salvage_is_positive` refuses it — so it reads as "this
        // state did not salvage" without needing a second field to say so.
        salvageTokens: spare.salvageTokens ?? 0,
        tierSize: tier.length,
        distinct: collection.distinct,
        balance: (await wallet(db, { userId: seat.userId, seasonId: seat.seasonId }))?.balance ?? 0,
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

    const again = await openBox(db, {
      userId: seat.userId,
      boxId: first.boxId,
      seasonId: seat.seasonId,
    });
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

  /* --- championship rings ----------------------------------------------
   *
   * These stage a **league fact** — a finalized season this seat finished first
   * in — and then call the real `grantChampionshipRings`. Nothing here inserts a
   * collectible, which is this file's standing rule and which matters more here
   * than anywhere else: a demo that minted rings directly would photograph a
   * shelf the grant path can never actually produce.
   */

  'rings-none': async (db, seat) => {
    await openTab(db, seat);
    const held = await ringsFor(db, seat.userId);
    return { evidence: { rings: held.length } };
  },

  'rings-one': async (db, seat) => {
    await openTab(db, seat);
    await crownIn(db, seat.userId, [2019]);
    await grantChampionshipRings(db);
    const held = await ringsFor(db, seat.userId);
    return { evidence: { rings: held.length, years: held.map((r) => r.year).join(',') } };
  },

  'rings-many': async (db, seat) => {
    await openTab(db, seat);
    await crownIn(db, seat.userId, [2017, 2018]);
    await grantChampionshipRings(db);
    const held = await ringsFor(db, seat.userId);
    return { evidence: { rings: held.length, years: held.map((r) => r.year).join(',') } };
  },

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

  /* --- who you are ---------------------------------------------------- */

  /**
   * The customiser with an empty wardrobe.
   *
   * The state **every real manager is in today**, which is why it is the one
   * worth photographing most: nothing awards a wearable yet, so what a manager
   * actually meets is four slots that say "nothing for this yet" above a build,
   * a hairstyle and a colouring they can change. If that screen does not stand up
   * on its own, the feature does not ship well no matter how good the full
   * wardrobe looks.
   */
  'character-empty': async (db, seat) => {
    const state = await characterFor(db, seat.userId);
    return {
      evidence: {
        owned: (await ownedWearables(db, seat.userId)).length,
        layers: state.composite.layers.length,
      },
    };
  },

  /**
   * A wearable owned and equipped — the state that has been in this catalog,
   * declared and refused, since M2.
   *
   * One item, in one slot, deliberately: it is the *equipping* that was blocked,
   * and a screenshot of a manager wearing everything proves that no better than
   * a screenshot of a manager wearing a hat.
   */
  'equipped-wearable': async (db, seat) => {
    await grantWearable(db, seat.userId, 'wear_head_pizza_visor', now());
    const owned = await ownedWearables(db, seat.userId);
    const visor = owned.find((item) => item.slug === 'wear_head_pizza_visor');
    if (visor === undefined) throw new DemoRefused('the visor was granted and is not owned');

    const result = await saveCharacter(db, seat.userId, DEFAULT_CONFIGURATION, {
      head: visor.collectibleId,
    });
    if (!result.ok) throw new DemoRefused(`equipping refused: ${result.detail}`);

    return {
      evidence: {
        wearing: Object.values(result.state.equipment).join(', '),
        layers: result.state.composite.layers.length,
      },
    };
  },

  /**
   * Every slot filled, with something else in each slot to change to.
   *
   * Two items per slot rather than one, because the interesting question a
   * screenshot of this answers is not *"can a slot be filled"* — the state above
   * covers that — but whether a row of choices with one of them selected reads
   * correctly at 360px. One item per slot could not show that.
   */
  'character-dressed': async (db, seat) => {
    const wanted = [
      'wear_head_beanie_winter',
      'wear_head_paper_hat',
      'wear_face_shades',
      'wear_face_mustache_fake',
      'wear_body_apron_tony',
      'wear_body_jersey_blank',
      'wear_hand_pizza_peel',
      'wear_hand_slice',
    ];
    for (const slug of wanted) await grantWearable(db, seat.userId, slug, now());

    const owned = await ownedWearables(db, seat.userId);
    const pick = (slug: string): string => {
      const found = owned.find((item) => item.slug === slug);
      if (found === undefined) throw new DemoRefused(`${slug} was granted and is not owned`);
      return found.collectibleId;
    };

    const result = await saveCharacter(
      db,
      seat.userId,
      { body: 1, hair: 5, palette: 2 },
      {
        head: pick('wear_head_beanie_winter'),
        face: pick('wear_face_shades'),
        body: pick('wear_body_apron_tony'),
        hand: pick('wear_hand_pizza_peel'),
      },
    );
    if (!result.ok) throw new DemoRefused(`dressing refused: ${result.detail}`);

    return {
      evidence: {
        owned: owned.length,
        wearing: Object.keys(result.state.equipment).length,
        layers: result.state.composite.layers.length,
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
  /* --- the press desk -------------------------------------------------- */

  /**
   * The desk with nothing on it.
   *
   * Nothing is written, for the reason `no-box` gives: there is nothing to undo
   * because nothing was done. It is also **what a commissioner meets today** —
   * the 2026 season has no games, so the queue is genuinely empty — which makes
   * it the state that most deserves the design attention.
   */
  'review-empty': async (db, seat) => {
    await releaseHold(db, seat);
    return { evidence: { queue: 0 } };
  },

  'review-waiting': async (db, seat) => {
    await releaseHold(db, seat);
    const draft = await draftWeek(db, REVIEW_SLOTS['review-waiting']!);
    return { evidence: { ...draft, seat: seat.sleeperUserId } };
  },

  /**
   * A draft the deterministic validator refused.
   *
   * The only state here that is not simply *"call the service"*, and the reason
   * is a property of the product rather than a shortcut: the renderer and the
   * validator **agree on every week of both finalized seasons** — that is what
   * `slice.test.ts` asserts — so asking the pipeline for a refused draft is
   * asking it for a defect.
   *
   * So the prose is doctored and the **real** `validateEdition` is run over it.
   * The violations on the screen are computed by the shipping validator, not
   * written by this file, and `recordVersion` writes the row rather than an
   * INSERT the product would never issue. What is a fixture is the bad sentence;
   * what is real is everything that then happens to it.
   */
  'review-refused': async (db, seat) => {
    await releaseHold(db, seat);
    const { season, week } = await reviewWeek(db, REVIEW_SLOTS['review-refused']!);
    const assembled = await assembleIssue(db, { season, week });
    if (assembled.edition === null) {
      throw new DemoRefused(`season ${String(season)} week ${String(week)} has nothing to render`);
    }

    // A score nobody posted, in the deck a reader scans first. `unknown-number`
    // is the violation the validator exists for, and it is the one a live LLM
    // rendering would produce.
    const doctored: Edition = {
      ...assembled.edition,
      deck: 'Somebody 213.77, Somebody Else 96.10',
    };

    const verdict = validateEdition(doctored, assembled.packet);
    if (verdict.publishable) {
      throw new DemoRefused(
        'the doctored issue passed validation — the demo would photograph a clean draft ' +
          'under a name claiming otherwise. Fix the fixture, not the assertion.',
      );
    }

    const recorded = await recordVersion(db, {
      season,
      week,
      edition: doctored,
      packet: assembled.packet,
      verdict,
      actorUserId: null,
      submit: true,
    });

    return {
      evidence: {
        season,
        week,
        violations: verdict.violations.length,
        publishable: recorded.publishable,
      },
    };
  },

  'review-approved': async (db, seat) => {
    await releaseHold(db, seat);
    const draft = await draftWeek(db, REVIEW_SLOTS['review-approved']!);
    await advanceTo(db, draft.versionId, seat.userId, 'approved');
    return { evidence: { ...draft, status: 'approved' } };
  },

  'review-published': async (db, seat) => {
    await releaseHold(db, seat);
    const draft = await draftWeek(db, REVIEW_SLOTS['review-published']!);
    await advanceTo(db, draft.versionId, seat.userId, 'published');
    return { evidence: { ...draft, status: 'published' } };
  },

  /**
   * The press stopped (`16 §9`, the permanent manual hold).
   *
   * An approved issue *and* the hold, because the hold's meaning is only visible
   * when there is something it is stopping. A held desk with an empty queue would
   * photograph as a desk with an empty queue.
   */
  'review-held': async (db, seat) => {
    const draft = await draftWeek(db, REVIEW_SLOTS['review-held']!);
    await advanceTo(db, draft.versionId, seat.userId, 'approved');
    await setPublicationHold(db, {
      held: true,
      actorUserId: seat.userId,
      reason: 'a scoring correction is still landing',
    });
    return { evidence: { ...draft, held: true } };
  },
};

/**
 * Which week each press-desk state drafts.
 *
 * The number is a **position**, not a week: the 0th, 1st, 2nd … most recent
 * publishable week of the most recent finalized season. Hard-coding `2025 week
 * 11` would work today and be wrong the first January the league rolls over, and
 * the demo would fail with `no-season` on a screen whose whole purpose is to
 * demonstrate that publication is governed.
 *
 * Distinct positions so two press-desk demos never contend for one issue —
 * `slice_issues` is unique on `(season, week)`, so they would otherwise fight
 * over one row and each re-apply would flip its status.
 */
const REVIEW_SLOTS: Readonly<Record<string, number>> = {
  'review-waiting': 0,
  'review-refused': 1,
  'review-approved': 2,
  'review-published': 3,
  'review-held': 4,
};

/**
 * The nth most recent publishable week of the most recent finalized season.
 *
 * Asked of the pipeline rather than assumed. A week can legitimately refuse —
 * every game in it might name somebody who is no longer a product participant —
 * so *"week 15"* is not a synonym for *"a week with an issue in it"*, and a demo
 * that assumed it was would photograph an empty queue under a name claiming a
 * draft was waiting.
 *
 * Nothing about the season is modified. A `slice_issues` row is a new record
 * *about* a week, which is why this does not cross `MANDATE §8`'s line on
 * finalized history — and guard 1 means none of it can happen in production.
 */
async function reviewWeek(db: Database, slot: number): Promise<{ season: number; week: number }> {
  const [latest] = await db
    .select({
      year: seasons.year,
      week: sql<number>`max(${fantasyMatchups.week})`.as('week'),
    })
    .from(fantasyMatchups)
    .innerJoin(seasons, eq(seasons.id, fantasyMatchups.seasonId))
    .where(isNotNull(seasons.finalizedAt))
    .groupBy(seasons.year)
    .orderBy(desc(seasons.year))
    .limit(1);

  if (latest === undefined) {
    throw new DemoRefused(
      'no finalized season has any results, so there is no week the press desk could draft. ' +
        'Import the recorded league first (npm run sleeper:import).',
    );
  }

  let found = 0;
  for (let week = Number(latest.week); week >= 1; week--) {
    const assembled = await assembleIssue(db, { season: latest.year, week });
    if (assembled.edition === null) continue;
    if (found === slot) return { season: latest.year, week };
    found += 1;
  }

  throw new DemoRefused(
    `season ${String(latest.year)} has fewer than ${String(slot + 1)} weeks that can be drafted at all. ` +
      'A press-desk demo with no draft in it would photograph an empty queue under a name claiming otherwise.',
  );
}

/**
 * Put the press back into the state this demo needs it in.
 *
 * The hold is **league-wide and it persists**, so `review-held` leaves it on for
 * everything applied afterwards — including the next width's pass over the same
 * states, because the visual driver loops widths on the outside. Without this,
 * `review-approved` photographs a stopped press at 375 and 360 and the three
 * screenshots of one state disagree.
 *
 * A no-op when the press is already running (`setPublicationHold` compares
 * before it writes), so it costs nothing and appends no history.
 */
async function releaseHold(db: Database, seat: DemoSeat): Promise<void> {
  await setPublicationHold(db, { held: false, actorUserId: seat.userId });
}

/**
 * Walk a drafted version forward to where the state needs it — and no further.
 *
 * Written as *"what is missing"* rather than *"do these steps"* because a demo
 * state is applied twice by the reproducibility test and by anybody re-running
 * the CLI. `approveVersion` on an already-published version is not a repeat of a
 * decision, it is an illegal move, and the transition trigger refuses it — which
 * is the trigger being right and the applier being lazy.
 *
 * Each step is still the real service call, so what is being demonstrated is the
 * product's own chain.
 */
async function advanceTo(
  db: Database,
  versionId: string,
  actorUserId: string,
  target: 'approved' | 'published',
): Promise<void> {
  const before = await reviewDetail(db, versionId);
  if (before === null) throw new DemoRefused(`the demo drafted version ${versionId} and lost it`);

  if (before.status === 'needs_review') {
    await approveVersion(db, {
      versionId,
      actorUserId,
      note: 'reads straight, and the board is complete',
    });
  }

  if (target === 'published') {
    const after = await reviewDetail(db, versionId);
    if (after?.status === 'approved') {
      await publishVersion(db, { versionId, actorUserId });
    }
  }
}

/** Draft one week through the real service, and insist it actually produced one. */
async function draftWeek(
  db: Database,
  slot: number,
): Promise<{ season: number; week: number; versionId: string; issueId: string }> {
  const { season, week } = await reviewWeek(db, slot);
  const result = await generateDraft(db, { season, week, submit: true });

  if (result.versionId === null || result.issueId === null) {
    throw new DemoRefused(
      `season ${String(season)} week ${String(week)} refused to draft (${String(result.refusal)}).`,
    );
  }

  return { season, week, versionId: result.versionId, issueId: result.issueId };
}

/** Every state the appliers cover. The coverage test compares this to the catalog. */
export const APPLIED_STATES: readonly string[] = Object.keys(APPLIERS);
