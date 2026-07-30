import { and, asc, eq } from 'drizzle-orm';

import { type Queryable } from '@/lib/db';
import { collectibles } from '@/lib/db/schema';

import { RARITIES, catalog, type CatalogItem, type Rarity } from './catalog';

/**
 * What a manager owns.
 *
 * ## The catalog is the shape; ownership is the overlay
 *
 * A collection view built only from owned rows can show what you have and can
 * never show what you are missing — and `18 §4` asks for **set progress**, which
 * is a statement about the gap. So this walks the full 24-item catalog and marks
 * each entry with a count. Nine owned reads as *nine of twenty-four*, and the
 * fifteen blanks are the point rather than an absence of data.
 *
 * ## Duplicates are counted, never converted
 *
 * `03 §12` rules out automatic refunds and asks for salvage "after simulation" —
 * *"Claude should recommend the simplest balanced MVP option after simulation."*
 * So duplicates are **displayed and nothing more**. Converting them to tokens here
 * would set a salvage rate, which is exactly the reward-pacing decision `16 §8`
 * reserves for P3.
 *
 * A second copy is therefore an honest fact about a manager's shelf, not a
 * pending transaction.
 */

export interface CollectionEntry extends CatalogItem {
  /** How many the manager holds. Zero means not yet pulled. */
  readonly count: number;
  /** When the first one arrived. Null when unowned. */
  readonly firstAcquiredAt: Date | null;
}

export interface Collection {
  /** Every catalog item, in catalog order, owned or not. */
  readonly entries: readonly CollectionEntry[];
  /** Distinct items held. The numerator of set progress. */
  readonly distinct: number;
  /** The catalog's size. The denominator. */
  readonly total: number;
  /** Every copy, duplicates included — what the counter's summary counts. */
  readonly copies: number;
  /** Distinct held and total available, per tier. */
  readonly byRarity: Readonly<Record<Rarity, { held: number; total: number }>>;
}

export async function collectionFor(db: Queryable, userId: string): Promise<Collection> {
  const owned = await db
    .select({ slug: collectibles.slug, acquiredAt: collectibles.acquiredAt })
    .from(collectibles)
    .where(eq(collectibles.userId, userId))
    .orderBy(asc(collectibles.acquiredAt));

  // One pass to counts and first-acquired. `orderBy` above makes the first row
  // seen for a slug the earliest, so no comparison is needed here.
  const counts = new Map<string, { count: number; first: Date }>();
  for (const row of owned) {
    const existing = counts.get(row.slug);
    if (existing === undefined) {
      counts.set(row.slug, { count: 1, first: row.acquiredAt });
    } else {
      existing.count += 1;
    }
  }

  const entries: CollectionEntry[] = catalog().map((item) => {
    const held = counts.get(item.slug);
    return {
      ...item,
      count: held?.count ?? 0,
      firstAcquiredAt: held?.first ?? null,
    };
  });

  const byRarity = Object.fromEntries(
    RARITIES.map((rarity) => {
      const tier = entries.filter((entry) => entry.rarity === rarity);
      return [
        rarity,
        { held: tier.filter((entry) => entry.count > 0).length, total: tier.length },
      ];
    }),
  ) as Record<Rarity, { held: number; total: number }>;

  return {
    entries,
    distinct: entries.filter((entry) => entry.count > 0).length,
    total: entries.length,
    copies: owned.length,
    byRarity,
  };
}

/**
 * A slug the manager owns at least one of.
 *
 * Used to authorize showing an item — a manager must not be able to display
 * something they have never pulled. Kept here rather than in the surface so the
 * check is one query and one place.
 */
export async function owns(db: Queryable, userId: string, slug: string): Promise<boolean> {
  const rows = await db
    .select({ id: collectibles.id })
    .from(collectibles)
    .where(and(eq(collectibles.userId, userId), eq(collectibles.slug, slug)))
    .limit(1);

  return rows.length > 0;
}

/** Rarity filters the collection offers, plus the implicit "everything". */
export const COLLECTION_FILTERS = ['all', ...RARITIES] as const;

export type CollectionFilter = (typeof COLLECTION_FILTERS)[number];

/** Narrow a search param to a filter. Anything unrecognised means "everything". */
export function parseFilter(value: string | undefined): CollectionFilter {
  return (COLLECTION_FILTERS as readonly string[]).includes(value ?? '')
    ? (value as CollectionFilter)
    : 'all';
}
