import inventoryJson from '@/art/assets.inventory.json';

import {
  ASSET_BATCHES,
  ASSET_FAMILIES,
  ASSET_STATUSES,
  type AssetBatch,
  type AssetFamily,
  type AssetRecord,
  type AssetRegistry,
  type AssetResolution,
  type AssetStatus,
  type SafeArea,
} from './types';

/**
 * Builds the asset registry from `art/assets.inventory.json`.
 *
 * The inventory is grouped by batch for human readability, and group objects
 * carry `$comment` keys. Both are flattened away here so callers see a flat
 * slug lookup.
 *
 * Parsing is deliberately strict: a malformed inventory should fail loudly at
 * startup rather than resolve to a silently wrong asset at render time.
 */

const FAMILIES = new Set<string>(ASSET_FAMILIES);
const STATUSES = new Set<string>(ASSET_STATUSES);
const BATCHES = new Set<string>(ASSET_BATCHES);

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
}

function readOptionalBoolean(source: Record<string, unknown>, key: string): boolean | undefined {
  const value = source[key];
  return typeof value === 'boolean' ? value : undefined;
}

function readSafeArea(source: Record<string, unknown>): SafeArea | undefined {
  const value = source['safeArea'];
  if (!Array.isArray(value) || value.length !== 4) return undefined;
  if (!value.every((n): n is number => typeof n === 'number')) return undefined;
  return [value[0], value[1], value[2], value[3]] as SafeArea;
}

function readSuppresses(source: Record<string, unknown>): readonly string[] | undefined {
  const value = source['suppresses'];
  if (!Array.isArray(value)) return undefined;
  if (!value.every((s): s is string => typeof s === 'string')) return undefined;
  return value;
}

function parseRecord(slug: string, group: string, raw: unknown): AssetRecord {
  if (!isRecordObject(raw)) {
    throw new Error(`Asset "${slug}" in group "${group}" is not an object.`);
  }

  const family = raw['family'];
  if (typeof family !== 'string' || !FAMILIES.has(family)) {
    throw new Error(`Asset "${slug}" has an unknown family: ${String(family)}`);
  }

  const artStatus = raw['art_status'];
  if (typeof artStatus !== 'string' || !STATUSES.has(artStatus)) {
    throw new Error(`Asset "${slug}" has an unknown art_status: ${String(artStatus)}`);
  }

  const batch = raw['batch'];
  if (typeof batch !== 'string' || !BATCHES.has(batch)) {
    throw new Error(`Asset "${slug}" has an unknown batch: ${String(batch)}`);
  }

  const canvas = raw['canvas'];
  if (typeof canvas !== 'string') {
    throw new Error(`Asset "${slug}" is missing a canvas.`);
  }

  const alt = raw['alt'];
  if (typeof alt !== 'string' || alt.trim() === '') {
    // Accessibility is not optional (`art/ASSET_PIPELINE.md §3`).
    throw new Error(`Asset "${slug}" is missing alt text.`);
  }

  const pathValue = raw['path'];
  const path = typeof pathValue === 'string' && pathValue !== '' ? pathValue : null;

  const rarity = readOptionalString(raw, 'rarity');
  const anchor = readOptionalString(raw, 'anchor');
  const slot = readOptionalString(raw, 'slot');
  const safeArea = readSafeArea(raw);
  const suppresses = readSuppresses(raw);
  const priority = readOptionalBoolean(raw, 'priority');
  const interactive = readOptionalBoolean(raw, 'interactive');
  const systemLayer = readOptionalBoolean(raw, 'systemLayer');

  return {
    slug,
    family: family as AssetFamily,
    canvas,
    batch: batch as AssetBatch,
    artStatus: artStatus as AssetStatus,
    alt,
    group,
    path,
    ...(rarity !== undefined ? { rarity } : {}),
    ...(anchor !== undefined ? { anchor } : {}),
    ...(slot !== undefined ? { slot } : {}),
    ...(safeArea !== undefined ? { safeArea } : {}),
    ...(suppresses !== undefined ? { suppresses } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(interactive !== undefined ? { interactive } : {}),
    ...(systemLayer !== undefined ? { systemLayer } : {}),
  };
}

export function buildRegistry(raw: unknown): AssetRegistry {
  if (!isRecordObject(raw)) {
    throw new Error('Asset inventory is not an object.');
  }

  const groups = raw['assets'];
  if (!isRecordObject(groups)) {
    throw new Error('Asset inventory is missing an "assets" object.');
  }

  const records = new Map<string, AssetRecord>();

  for (const [groupName, groupValue] of Object.entries(groups)) {
    if (!isRecordObject(groupValue)) {
      throw new Error(`Asset group "${groupName}" is not an object.`);
    }

    for (const [slug, recordValue] of Object.entries(groupValue)) {
      // Documentation keys, not assets.
      if (slug.startsWith('$')) continue;

      if (records.has(slug)) {
        throw new Error(`Duplicate asset slug: "${slug}"`);
      }

      records.set(slug, parseRecord(slug, groupName, recordValue));
    }
  }

  const ordered = Object.freeze([...records.values()]);

  let provisional: AssetRegistry['provisional'] = null;
  const provisionalRaw = raw['provisional'];
  if (isRecordObject(provisionalRaw)) {
    const zoneCanvas = readOptionalString(provisionalRaw, 'zoneCanvas');
    const settlesAt = readOptionalString(provisionalRaw, 'settlesAt');
    if (zoneCanvas !== undefined && settlesAt !== undefined) {
      provisional = { zoneCanvas, settlesAt };
    }
  }

  return {
    resolve(slug: string): AssetResolution {
      const record = records.get(slug);
      if (record === undefined) {
        return { kind: 'missing', slug };
      }
      if (record.artStatus === 'placeholder' || record.path === null) {
        return { kind: 'placeholder', slug, record, label: record.alt };
      }
      return { kind: 'art', slug, record, path: record.path };
    },
    get: (slug) => records.get(slug),
    has: (slug) => records.has(slug),
    all: () => ordered,
    byFamily: (family) => ordered.filter((r) => r.family === family),
    byBatch: (batch) => ordered.filter((r) => r.batch === batch),
    byStatus: (status) => ordered.filter((r) => r.artStatus === status),
    size: records.size,
    provisional,
  };
}

/** The live registry, built from the committed inventory. */
export const assetRegistry: AssetRegistry = buildRegistry(inventoryJson);

/** Convenience wrapper over {@link assetRegistry}. */
export function resolveAsset(slug: string): AssetResolution {
  return assetRegistry.resolve(slug);
}
