'use client';

import { useMemo, useState } from 'react';

import { PlaceholderSign } from '@/lib/assets/placeholder';
import { ASSET_FAMILIES, type AssetFamily, type AssetRecord } from '@/lib/assets/types';

type FamilyFilter = AssetFamily | 'all';

const FAMILY_LABELS: Record<FamilyFilter, string> = {
  all: 'All',
  character: 'Character',
  avatar: 'Avatar',
  zone: 'Zone',
  collectible: 'Collectible',
  surface: 'Surface',
  frame: 'Frame',
  ui: 'UI',
};

const STATUS_STYLES: Record<string, string> = {
  placeholder: 'bg-ink-500/50 text-ink-100',
  generated: 'bg-blue-mid/40 text-blue-neon',
  approved: 'bg-green-deep/60 text-green-neon',
  retired: 'bg-ink-700 text-ink-500',
};

export function AssetExplorer({ records }: { records: readonly AssetRecord[] }) {
  const [family, setFamily] = useState<FamilyFilter>('all');
  const [query, setQuery] = useState('');

  const counts = useMemo(() => {
    const map = new Map<FamilyFilter, number>([['all', records.length]]);
    for (const f of ASSET_FAMILIES) {
      map.set(f, records.filter((r) => r.family === f).length);
    }
    return map;
  }, [records]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records.filter((r) => {
      if (family !== 'all' && r.family !== family) return false;
      if (needle === '') return true;
      return (
        r.slug.toLowerCase().includes(needle) || r.alt.toLowerCase().includes(needle)
      );
    });
  }, [records, family, query]);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header
        className="px-4 pb-4"
        style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}
      >
        <p className="font-mono text-xs tracking-[0.2em] text-amber-mid uppercase">
          Dev · Asset inventory
        </p>
        <h1 className="mt-2 text-2xl font-bold text-paper-white">
          {records.length} slugs
        </h1>
        <p className="mt-1 text-sm text-ink-100">
          Every one resolving through the registry. Grows into{' '}
          <span className="font-mono text-xs">/admin/assets</span>.
        </p>

        <label className="mt-4 block">
          <span className="sr-only">Search slugs and descriptions</span>
          <input
            type="search"
            inputMode="search"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Search slugs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-12 w-full rounded-sm border border-ink-500 bg-ink-700 px-4 text-paper-white placeholder:text-ink-300 focus:border-amber-mid focus:outline-none"
          />
        </label>
      </header>

      {/* Results. Bottom padding clears the sticky filter bar. */}
      <ul className="space-y-2 px-4 pb-40">
        {visible.map((record) => (
          <li
            key={record.slug}
            className="rounded-sm border border-ink-500 bg-ink-700/40 p-3"
          >
            <div className="flex items-start gap-3">
              <PlaceholderSign
                label={record.alt}
                className="w-28 shrink-0 sm:w-36"
              />

              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs break-all text-paper-white">
                  {record.slug}
                </p>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Tag>{record.family}</Tag>
                  <Tag>{record.canvas}</Tag>
                  <Tag>{record.batch}</Tag>
                  {record.rarity !== undefined && <Tag>{record.rarity}</Tag>}
                  {record.slot !== undefined && <Tag>slot: {record.slot}</Tag>}
                  <span
                    className={`rounded-sm px-1.5 py-0.5 font-mono text-[10px] ${
                      STATUS_STYLES[record.artStatus] ?? 'bg-ink-500 text-ink-100'
                    }`}
                  >
                    {record.artStatus}
                  </span>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-ink-100">{record.alt}</p>
              </div>
            </div>
          </li>
        ))}

        {visible.length === 0 && (
          <li className="rounded-sm border border-dashed border-ink-500 p-8 text-center text-sm text-ink-100">
            No slugs match that filter.
          </li>
        )}
      </ul>

      {/*
        Filters live at the BOTTOM. On a phone this is the thumb zone; putting
        the primary control at the top would make it a stretch one-handed.
      */}
      <nav
        className="fixed inset-x-0 bottom-0 border-t border-ink-500 bg-ink-900/95 backdrop-blur"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        aria-label="Filter by family"
      >
        <div className="mx-auto max-w-3xl">
          <p className="px-4 pt-3 pb-2 text-xs text-ink-300">
            Showing {visible.length} of {records.length}
          </p>
          <div className="flex gap-2 overflow-x-auto px-4 pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none]">
            {(['all', ...ASSET_FAMILIES] as FamilyFilter[]).map((f) => {
              const active = family === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFamily(f)}
                  aria-pressed={active}
                  className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-medium whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-amber-mid text-ink-900'
                      : 'bg-ink-700 text-ink-100 active:bg-ink-500'
                  }`}
                >
                  {FAMILY_LABELS[f]}
                  <span className={active ? 'ml-1.5 opacity-70' : 'ml-1.5 text-ink-300'}>
                    {counts.get(f) ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-sm bg-ink-900/60 px-1.5 py-0.5 font-mono text-[10px] text-ink-100">
      {children}
    </span>
  );
}
