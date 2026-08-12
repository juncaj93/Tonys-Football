import { createHash } from 'node:crypto';

import { desc, eq } from 'drizzle-orm';

import { type Queryable } from '@/lib/db';
import { casinoTables } from '@/lib/db/schema';

import { CANDIDATE_E } from './candidates';
import { SYMBOLS, analyse, auditPaytable, type Paytable, type Symbol } from './slots-model';

/**
 * The shipped slot machine, and how a roll becomes an outcome.
 *
 * Everything here is a **pure function of the paytable** except the two database
 * calls at the bottom. Nothing reads the clock and nothing generates randomness
 * — the caller supplies the rolls. That is what makes a spin auditable: given
 * the stored rolls and the stored table version, anybody can recompute the
 * outcome and check the server was telling the truth. Exactly the property
 * `lib/counter/rewards.ts` gives a box opening.
 *
 * ## The numbers are the commissioner's, and they are provisional
 *
 * `SHIPPED_TABLE` is **Candidate E**, approved 2026-08-11 at an exact 92.09%
 * return. `docs/CASINO_BOUNDARY.md §11` is the derivation and
 * `docs/evidence/casino/slots-redesign.md` the measurement. They ship
 * `provisional = true` like every other economy value in this product, and a
 * re-tune writes a **new version** rather than editing this one.
 *
 * Do not adjust them to make something feel better. That is what the simulation
 * is for, and the last time a value in this product was tuned by feel the
 * commissioner had to move it back.
 */

/** Candidate E — the approved machine. */
export const SHIPPED_TABLE: Paytable = CANDIDATE_E;

/**
 * The roll space for one reel.
 *
 * The strip's weights sum to this, and `rollBelow` is called with it directly —
 * so a roll is an integer in `[0, 100)` and the recorded value means the same
 * thing forever. Derived rather than written down, so a strip that no longer
 * sums to a round number cannot silently break the resolver.
 */
export function reelSpan(table: Pick<Paytable, 'strip'> = SHIPPED_TABLE): number {
  return SYMBOLS.reduce((sum, symbol) => sum + table.strip[symbol], 0);
}

/**
 * Resolve one reel's roll to a symbol.
 *
 * A plain cumulative walk in `SYMBOLS` order. The order is fixed and exported,
 * which is what lets a recorded roll land on the same symbol on every machine,
 * forever — the argument `resolveRoll` makes about the catalog's sort order.
 */
export function symbolFor(roll: number, table: Pick<Paytable, 'strip'> = SHIPPED_TABLE): Symbol {
  const span = reelSpan(table);
  if (!Number.isInteger(roll) || roll < 0 || roll >= span) {
    throw new RangeError(`roll ${String(roll)} is outside [0, ${String(span)})`);
  }

  let cursor = 0;
  for (const symbol of SYMBOLS) {
    cursor += table.strip[symbol];
    if (roll < cursor) return symbol;
  }

  // Unreachable while the walk and `reelSpan` read the same strip.
  throw new Error('the reel strip disagreed with its own span');
}

export interface Outcome {
  readonly symbols: readonly [Symbol, Symbol, Symbol];
  /** Multiple of the stake. Zero is an ordinary outcome, not an absence. */
  readonly multiplier: number;
  /** What a manager is told happened. Curated, never generated (`16 §10`). */
  readonly line: 'three' | 'pair' | 'nothing';
}

/**
 * What three symbols pay.
 *
 * Three of a kind, or *exactly* two — which are disjoint and jointly the whole
 * paying space, so anything else is nothing. There is no third shape and there
 * must not be one without a new ruling: every figure in the approved analysis is
 * a closed-form sum over these two.
 */
export function resolve(
  symbols: readonly [Symbol, Symbol, Symbol],
  table: Pick<Paytable, 'pair' | 'triple'> = SHIPPED_TABLE,
): Outcome {
  const [a, b, c] = symbols;

  if (a === b && b === c) {
    return { symbols, multiplier: table.triple[a], line: 'three' };
  }

  // Exactly two. At most one symbol can appear twice when not all three match.
  const paired = a === b ? a : a === c ? a : b === c ? b : null;
  if (paired !== null) {
    return { symbols, multiplier: table.pair[paired], line: 'pair' };
  }

  return { symbols, multiplier: 0, line: 'nothing' };
}

/** Content hash of the shipped configuration. Two environments seeding it agree. */
export function tableVersion(table: Omit<Paytable, 'id' | 'summary'> = SHIPPED_TABLE): string {
  const canonical = [
    `game:slots`,
    `cap:${String(table.capTokens)}`,
    `wagers:${table.wagers.join(',')}`,
    ...SYMBOLS.map(
      (s) =>
        `${s}:${String(table.strip[s])}:${String(table.pair[s])}:${String(table.triple[s])}`,
    ),
  ].join('|');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

/**
 * The stored form. Everything needed to recompute a recorded spin, and nothing else.
 *
 * Deliberately not the whole `Paytable` object: `id` and `summary` are prose
 * about the candidate, and prose in a versioned configuration is prose that ends
 * up in a content hash and moves it.
 */
export interface StoredTable {
  readonly strip: Readonly<Record<Symbol, number>>;
  readonly pair: Readonly<Record<Symbol, number>>;
  readonly triple: Readonly<Record<Symbol, number>>;
  readonly wagers: readonly number[];
  readonly capTokens: number;
}

function storedForm(table: Paytable): StoredTable {
  return {
    strip: table.strip,
    pair: table.pair,
    triple: table.triple,
    wagers: table.wagers,
    capTokens: table.capTokens,
  };
}

/**
 * Store the shipped paytable if it is not already stored.
 *
 * Append-only: an existing version is never rewritten, because spins point at it
 * and rewriting it would retroactively change what they paid. New numbers are a
 * new version, which the content hash gives for free.
 *
 * **It refuses to store an incoherent table.** `auditPaytable` is the same check
 * the analysis ran, so a paytable that would put a common symbol above a rare
 * one, or breach the per-spin ceiling, cannot reach a database at all. A
 * configuration is the one place where being loud beats being tolerant: the
 * alternative is a machine that is wrong in a way only a player notices.
 */
export async function ensureCasinoTable(
  db: Queryable,
  table: Paytable = SHIPPED_TABLE,
): Promise<{ version: string }> {
  const problems = auditPaytable(table);
  if (problems.length > 0) {
    throw new Error(
      `the slots paytable is incoherent and will not be stored:\n  - ${problems.join('\n  - ')}`,
    );
  }

  const version = tableVersion(table);

  await db
    .insert(casinoTables)
    .values({ version, game: 'slots', config: storedForm(table), provisional: true })
    .onConflictDoNothing({ target: casinoTables.version });

  return { version };
}

/**
 * The paytable in force, read from the database.
 *
 * Reads the newest stored version rather than the constant, so a re-tune takes
 * effect by being seeded — not by a deploy. Falls back to nothing: a database
 * with no stored table is a seeding failure and should be loud rather than
 * silently running the machine on hardcoded values, which is
 * `economyFor`'s argument applied to the same class of value.
 */
export async function casinoTableFor(
  db: Queryable,
): Promise<{ version: string; table: StoredTable }> {
  const rows = await db
    .select({ version: casinoTables.version, config: casinoTables.config })
    .from(casinoTables)
    .where(eq(casinoTables.game, 'slots'))
    .orderBy(desc(casinoTables.createdAt))
    .limit(1);

  const row = rows[0];
  if (row === undefined) {
    throw new Error(
      'no slots paytable is stored; run npm run db:seed before the machine can take a spin',
    );
  }

  const config = row.config as Partial<StoredTable>;
  const complete =
    config.strip !== undefined &&
    config.pair !== undefined &&
    config.triple !== undefined &&
    Array.isArray(config.wagers) &&
    typeof config.capTokens === 'number' &&
    SYMBOLS.every(
      (s) =>
        typeof config.strip?.[s] === 'number' &&
        typeof config.pair?.[s] === 'number' &&
        typeof config.triple?.[s] === 'number',
    );

  /*
   * A stored row missing a key is a seeding failure and must be as loud as a
   * missing row. `economyFor` learned this the expensive way — a `jsonb` cast
   * with no evidence behind it served an incomplete row for as long as it took
   * somebody to read "undefined off your tab" on the market's own price line.
   */
  if (!complete) {
    throw new Error(
      `slots paytable ${row.version} is stored but incomplete. Run npm run db:seed.`,
    );
  }

  return { version: row.version, table: config as StoredTable };
}

/** The return rate of the shipped machine, for anywhere that needs to state it. */
export function shippedReturnRate(): number {
  return analyse(SHIPPED_TABLE).rtp;
}
