/**
 * Asset registry types.
 *
 * Application code references assets by SLUG and never by file path
 * (`art/ASSET_PIPELINE.md §1`). Swapping a placeholder for final art is a
 * registry change, never a code change — which is what lets art and
 * engineering proceed independently.
 */

export const ASSET_FAMILIES = [
  'character',
  'avatar',
  'zone',
  'collectible',
  'surface',
  'frame',
  'ui',
] as const;

export type AssetFamily = (typeof ASSET_FAMILIES)[number];

export const ASSET_STATUSES = [
  'placeholder',
  'generated',
  'approved',
  'retired',
] as const;

export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const ASSET_BATCHES = ['B0', 'B1', 'B2', 'B3', 'B4', 'B5+'] as const;

export type AssetBatch = (typeof ASSET_BATCHES)[number];

/** `[x, y, width, height]` — where runtime text may be rendered. */
export type SafeArea = readonly [number, number, number, number];

/**
 * An authored layer whose visible colour comes from the manager configuration.
 *
 * The asset still has a normal default `path`, so every existing consumer can
 * render it. CharacterView alone substitutes `{index}` with the active paint
 * index. Keeping the variant contract in the registry means future art batches
 * do not need to teach the compositor a new filename convention.
 */
export interface AssetVariantSet {
  readonly paint: 'skin' | 'hair' | 'top';
  readonly pathTemplate: string;
}

export interface AssetRecord {
  readonly slug: string;
  readonly family: AssetFamily;
  /** Logical pixel dimensions, e.g. `"32x48"`. */
  readonly canvas: string;
  readonly batch: AssetBatch;
  readonly artStatus: AssetStatus;
  readonly alt: string;
  /** Inventory group the record came from, e.g. `"_testSet_B0"`. */
  readonly group: string;
  /** Resolved file path once art exists; `null` while placeholder. */
  readonly path: string | null;
  readonly variants?: AssetVariantSet;

  readonly rarity?: string;
  /**
   * Where the art sits in its slot.
   *
   * `bottom-center` for anything standing on a surface, which is every
   * collectible: a taller replacement then grows *upward* rather than sinking
   * through the tray. Part of the art-slot contract in
   * `docs/art/ART_PRODUCTION_BACKLOG.md`, asserted by `art-slots.test.ts`.
   */
  readonly anchor?: string;
  readonly slot?: string;
  readonly safeArea?: SafeArea;
  readonly suppresses?: readonly string[];
  readonly priority?: boolean;
  readonly interactive?: boolean;
  readonly systemLayer?: boolean;
}

/**
 * The outcome of resolving a slug.
 *
 * `placeholder` is a first-class success, not a failure. Most of the catalog
 * resolves this way for the whole of Phase 0, and every screen is expected to
 * render correctly in that state.
 */
export type AssetResolution =
  | { readonly kind: 'art'; readonly slug: string; readonly record: AssetRecord; readonly path: string }
  | { readonly kind: 'placeholder'; readonly slug: string; readonly record: AssetRecord; readonly label: string }
  | { readonly kind: 'missing'; readonly slug: string };

export interface AssetRegistry {
  /** Resolve a slug to art, a placeholder, or missing. Never throws. */
  resolve(slug: string): AssetResolution;
  /** Look up a record without resolving. */
  get(slug: string): AssetRecord | undefined;
  has(slug: string): boolean;
  all(): readonly AssetRecord[];
  byFamily(family: AssetFamily): readonly AssetRecord[];
  byBatch(batch: AssetBatch): readonly AssetRecord[];
  byStatus(status: AssetStatus): readonly AssetRecord[];
  readonly size: number;
  /** Zone canvas dimensions pending the B0 phone composite test. */
  readonly provisional: { readonly zoneCanvas: string; readonly settlesAt: string } | null;
}
