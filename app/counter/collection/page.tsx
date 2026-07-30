import Link from 'next/link';

import { PanelHeading, PixelPanel, ReturnPlate, SignPlate } from '@/components/scene/panel';
import { RoomBehind } from '@/components/scene/room-behind';
import { Page } from '@/components/shell';
import { AssetView } from '@/lib/assets/placeholder';
import { resolveAsset } from '@/lib/assets/registry';
import { requireUser } from '@/lib/auth/current-user';
import { RARITIES } from '@/lib/counter/catalog';
import {
  COLLECTION_FILTERS,
  collectionFor,
  parseFilter,
  type CollectionEntry,
} from '@/lib/counter/collection';
import { getDb } from '@/lib/db';

/**
 * `/counter/collection` — the shelf.
 *
 * `18 §4`: *"All owned collectibles, filters, rarity, set progress."* This is the
 * surface that closes the loop — before it existed a manager could pull something
 * and then never look at it again, which made the whole box a dead end.
 *
 * ## It shows what is missing, not only what is held
 *
 * **Set progress is a statement about the gap**, so the grid walks the full
 * 24-item catalog and draws the unowned ones as empty shelf spots. Nine owned
 * reads as *nine of twenty-four* at a glance rather than as nine things.
 *
 * The blanks are drawn as **deliberately** empty — opaque backing, a real border,
 * a named label — because `VISUAL_ACCEPTANCE.md §4` rejects a surface that looks
 * *unloaded* rather than quiet. The first attempt was translucent over an already
 * dimmed room and the spots read as ghosts, which is the same defect wearing
 * different clothes.
 *
 * ## Filters are links, not state
 *
 * A rarity filter is a URL (`?rarity=epic`). No client component, no hydration, no
 * state to get out of step with the page — and a filtered shelf is shareable and
 * survives a refresh. `parseFilter` treats anything unrecognised as "everything",
 * so a hand-edited query string cannot produce an error page.
 *
 * ## Duplicates are shown, never converted
 *
 * `03 §12` defers salvage until after simulation, so a second copy is a fact
 * ("×2") and not a pending transaction. Converting duplicates here would set a
 * salvage rate, which is P3's decision (`16 §8`).
 */

export const dynamic = 'force-dynamic';

export default async function CollectionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await requireUser();
  const params = await searchParams;
  const raw = params['rarity'];
  const filter = parseFilter(typeof raw === 'string' ? raw : undefined);

  const collection = await collectionFor(getDb(), user.id);
  const shown =
    filter === 'all'
      ? collection.entries
      : collection.entries.filter((entry) => entry.rarity === filter);

  return (
    <>
      <RoomBehind />

      <Page>
        <div className="mx-auto w-full max-w-[420px] px-4 pt-6 pb-10">
          <SignPlate>Your collection</SignPlate>

          <p className="mt-4 text-[17px] leading-[1.5] text-paper-mid/80">
            {collection.distinct === 0
              ? 'Empty shelves. Whatever you pull is yours permanently, across every season.'
              : `${String(collection.distinct)} of ${String(collection.total)} on the shelves.` +
                (collection.copies > collection.distinct
                  ? ` ${String(collection.copies)} pieces in all.`
                  : '')}
          </p>

          {/* Set progress, per tier. The rarest line is the one people read. */}
          <PixelPanel className="mt-5 px-4 py-3.5">
            <PanelHeading>Set progress</PanelHeading>
            <dl className="mt-2 space-y-1.5">
              {RARITIES.map((rarity) => {
                const tier = collection.byRarity[rarity];
                return (
                  <div key={rarity} className="flex items-baseline justify-between gap-3">
                    <dt
                      className={`rarity-word rarity-${rarity} font-display text-[11px] tracking-[0.1em] uppercase`}
                    >
                      {rarity}
                    </dt>
                    <dd className="text-[17px] leading-[1.4] text-ink-700">
                      {String(tier.held)} / {String(tier.total)}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </PixelPanel>

          {/*
            * The filters — small enamel plates, not a select: the shop has signs,
            * not form controls. 44px of hit height each.
            *
            * A **grid** rather than a wrap. Five plates cannot fit one row at 360
            * and stay readable, and a wrap left "LEGENDARY" orphaned on its own
            * line looking like overflow. 3 + 2 reads as deliberate.
            */}
          <nav aria-label="Filter by rarity" className="mt-5 grid grid-cols-3 gap-2">
            {COLLECTION_FILTERS.map((option) => {
              const active = option === filter;
              return (
                <Link
                  key={option}
                  href={option === 'all' ? '/counter/collection' : `/counter/collection?rarity=${option}`}
                  aria-current={active ? 'page' : undefined}
                  className={`pixel-edge flex min-h-[44px] items-center justify-center border-2 px-2 text-center font-display text-[11px] tracking-wide uppercase active:translate-y-px ${
                    active
                      ? 'border-wood-dark bg-paper-mid text-ink-900'
                      : 'border-wood-dark bg-[#1c1113] text-paper-mid/80'
                  }`}
                >
                  {option === 'all' ? 'Everything' : option}
                </Link>
              );
            })}
          </nav>

          {/*
            * The shelf.
            *
            * Three across at every supported width. Four would put each cell under
            * 80 css px at 360, which is not enough for a 32-unit sprite plus a
            * readable name — sizing the grid to the type rather than the type to
            * the grid.
            */}
          <ul className="mt-5 grid grid-cols-3 gap-2.5">
            {shown.map((entry) => (
              <ShelfSpot key={entry.slug} entry={entry} />
            ))}
          </ul>

          {shown.length === 0 && (
            <p className="mt-5 text-[17px] leading-[1.5] text-paper-mid/80">
              Nothing in that tier yet.
            </p>
          )}

          <div className="mt-8 space-y-3">
            <Link
              href="/counter"
              className="pixel-edge flex min-h-[48px] w-full items-center justify-center border-2 border-wood-dark bg-[#1c1113] font-display text-[12px] text-paper-mid uppercase active:translate-y-px"
            >
              Back to the counter
            </Link>
            <ReturnPlate />
          </div>
        </div>
      </Page>
    </>
  );
}

/**
 * One spot on the shelf — held or empty.
 *
 * Rarity is carried the same three ways it is at the reveal: **the word first**,
 * then frame geometry, then colour. A held spot is a cream surface with the tier's
 * accent; an empty one is an opaque dark spot with the shelf edge showing through,
 * which reads as *nothing is here yet* rather than as a component that failed.
 *
 * An unowned item still shows its **name**. Hiding it would make the shelf a
 * mystery rather than a set to complete, and the catalog is not secret — it is in
 * the asset registry and on the counter's own copy.
 */
function ShelfSpot({ entry }: { entry: CollectionEntry }) {
  const held = entry.count > 0;

  if (!held) {
    return (
      /*
       * An empty spot, and it has to look *empty on purpose*.
       *
       * The first version was `bg-ink-900/45` with the name at 40% opacity, over an
       * already-dimmed room. On screen the spots were ghosts and the names were
       * barely legible — which `VISUAL_ACCEPTANCE.md §4` rejects twice over, as a
       * surface that "looks unloaded rather than deliberately quiet" and as type
       * that is uncomfortable to read.
       *
       * Opaque backing, a real border, and a name at 70% now. A labelled gap on a
       * shelf reads as something to fill; a ghost reads as a bug.
       */
      <li className="flex flex-col items-center gap-1.5 border-2 border-wood-dark bg-[#170f10] px-1.5 pt-2.5 pb-2">
        <span aria-hidden="true" className="flex h-12 w-full items-center justify-center">
          {/* The shelf's own edge, showing through where nothing sits on it. */}
          <span className="h-[3px] w-7 bg-paper-mid/25" />
        </span>
        <span className="text-center text-[12px] leading-[1.25] text-paper-mid/70">
          {entry.name}
        </span>
      </li>
    );
  }

  return (
    <li
      className={`rarity-frame rarity-${entry.rarity} pixel-edge relative flex flex-col items-center gap-1.5 border-2 border-wood-dark bg-paper-mid px-1.5 pt-2.5 pb-2`}
    >
      <span aria-hidden="true" className="flex h-12 w-full items-center justify-center">
        <span className="block h-12 w-12">
          {/* `compact`: object scale, so the wall-sized placeholder is wrong here. */}
          <AssetView resolution={resolveAsset(entry.slug)} compact />
        </span>
      </span>

      <span className="text-center text-[11px] leading-[1.25] text-ink-900">{entry.name}</span>

      <span
        className={`rarity-word rarity-${entry.rarity} font-display text-[8px] tracking-[0.12em] uppercase`}
      >
        {entry.rarity}
      </span>

      {/*
        * Duplicates. Counted, not converted — `03 §12` leaves salvage to P3.
        * Screen readers get the word; the mark is decoration.
        */}
      {entry.count > 1 && (
        <span className="absolute top-1 right-1 bg-ink-900 px-1 font-display text-[9px] text-paper-mid">
          <span aria-hidden="true">&times;{entry.count}</span>
          <span className="sr-only">{entry.count} copies</span>
        </span>
      )}
    </li>
  );
}
