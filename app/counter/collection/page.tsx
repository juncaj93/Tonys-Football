import Link from 'next/link';

import { ReturnPlate, SignPlate } from '@/components/scene/panel';
import { RoomBehind } from '@/components/scene/room-behind';
import { Page } from '@/components/shell';
import { AssetView } from '@/lib/assets/placeholder';
import { resolveAsset } from '@/lib/assets/registry';
import { requireUser } from '@/lib/auth/current-user';
import { RARITIES } from '@/lib/counter/catalog';
import { collectionFor, parseFilter, type CollectionEntry } from '@/lib/counter/collection';
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

          {/*
            * Set progress **is** the filter.
            *
            * These were two blocks: a cream panel of four `held / total` rows,
            * and below it five rarity plates in a 3 + 2 grid. Together they took
            * a third of a 390 before a single collectible appeared — and they
            * were saying the same four words to each other.
            *
            * Merging them costs nothing and buys the whole shelf a screen
            * earlier. The numbers now do work: a tier tells you how far along you
            * are *and* takes you to it. Still a URL and not client state, so a
            * filtered shelf stays shareable and survives a refresh.
            *
            * Four columns at 360 is 88 css px each, well over the AA floor, and
            * the row is a 44px hit target throughout.
            */}
          <nav aria-label="Filter by rarity" className="mt-4 grid grid-cols-4 gap-px border-2 border-wood-dark bg-wood-dark">
            {RARITIES.map((rarity) => {
              const tier = collection.byRarity[rarity];
              const active = filter === rarity;
              const complete = tier.held === tier.total;
              return (
                <Link
                  key={rarity}
                  href={active ? '/counter/collection' : `/counter/collection?rarity=${rarity}`}
                  aria-current={active ? 'page' : undefined}
                  /*
                    * `rarity-${rarity}` sits on the **cell**, not on the word.
                    *
                    * That class is what defines `--rarity`, and it was on the
                    * word span alone — so the stripe below, a sibling, resolved
                    * `var(--rarity)` to nothing and rendered transparent. It
                    * looked like a styling choice in the screenshot rather than a
                    * missing custom property, which is exactly the failure mode
                    * `colour-tokens.test.ts` exists for at the Tailwind level.
                    */
                  className={`rarity-${rarity} relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 px-1 py-2 active:translate-y-px ${
                    active ? 'bg-paper-mid' : 'bg-[#241618]'
                  }`}
                >
                  <span
                    className={`rarity-word rarity-${rarity} font-display text-[10px] tracking-[0.08em] uppercase`}
                  >
                    {rarity}
                  </span>
                  <span
                    className={`font-display text-[13px] ${
                      active
                        ? 'text-ink-900'
                        : complete
                          ? 'text-paper-white'
                          : 'text-paper-mid/85'
                    }`}
                  >
                    {String(tier.held)}/{String(tier.total)}
                  </span>
                  {/*
                    * A stripe of the tier's own colour along the bottom.
                    *
                    * Two jobs, and the second is the reason it is here. It makes
                    * the rail legible *as a control* — without it the merged rail
                    * looked exactly like the read-only panel it replaced, and
                    * nothing said it could be tapped. And it carries rarity a
                    * fourth way for anybody who cannot separate the tier colours
                    * in the word itself.
                    */}
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-[3px]"
                    style={{ backgroundColor: 'var(--rarity)', opacity: active ? 1 : 0.55 }}
                  />
                </Link>
              );
            })}
          </nav>

          {filter !== 'all' && (
            /*
             * The way back to everything. Present only while filtered, because a
             * permanent "all" tab in a four-tier rail is a fifth thing competing
             * for the same glance — and tapping the active tier already clears
             * it. This is the discoverable version of that.
             */
            <Link
              href="/counter/collection"
              className="mt-2 flex min-h-[44px] items-center font-display text-[11px] tracking-wide text-paper-mid/85 uppercase underline decoration-paper-mid/30 underline-offset-4 active:translate-y-px"
            >
              Show everything
            </Link>
          )}

          {/*
            * The shelf, in rows that sit on boards.
            *
            * It used to be a 24-cell grid of bordered cards, and the unowned
            * ones were dark cards with a grey dash in them. At actual size on a
            * dimmed room those read as **components that failed to load** —
            * `VISUAL_ACCEPTANCE.md §4` rejects exactly that, and the commissioner
            * named it as the "generic dashboard cards" defect.
            *
            * The fix is not more contrast. It is that **an empty spot should be
            * empty shelf.** Each row of three stands on a wooden board; a held
            * item is a labelled card standing on it, and an unowned one is a gap
            * with the item's name written on the board. A gap on a shelf reads as
            * something to fill, which is what set progress is *for*, and it
            * cannot read as a failure because there is nothing there to have
            * failed.
            *
            * Three across at every supported width. Four would put each cell
            * under 80 css px at 360, which is not enough for a sprite plus a
            * readable name — sizing the shelf to the type rather than the type
            * to the shelf.
            */}
          <div className="mt-5 space-y-1">
            {rows(shown).map((row, index) => (
              <div key={index}>
                {/*
                  * Row height follows what is standing on it.
                  *
                  * A fixed height was the first fix, for an uneven-pitch problem
                  * that was real — but it left a row of three unowned names
                  * floating under 120px of nothing, which is worse than uneven:
                  * it is *empty*, and the commissioner asked for density.
                  *
                  * A board with jars on it is taller than a bare board. That is
                  * true of shelves, so letting the row say which it is reads as
                  * furniture rather than as a layout bug — and the pitch is still
                  * even *within* each kind.
                  */}
                <ul
                  className={`grid grid-cols-3 items-end gap-2 ${
                    row.some((entry) => entry.count > 0) ? 'h-[8rem]' : 'h-[3.5rem]'
                  }`}
                >
                  {row.map((entry) => (
                    <ShelfSpot key={entry.slug} entry={entry} />
                  ))}
                  {/* Keeps the last row's board full width rather than ragged. */}
                  {Array.from({ length: 3 - row.length }, (_, gap) => (
                    <li key={`gap-${String(gap)}`} aria-hidden="true" className="h-full" />
                  ))}
                </ul>
                {/* The board itself. Everything above is standing on this. */}
                <div
                  aria-hidden="true"
                  className="surface-wood h-2 w-full border-x-2 border-b-2 border-wood-dark shadow-[0_3px_5px_rgba(0,0,0,0.55)]"
                />
              </div>
            ))}
          </div>

          {shown.length === 0 && (
            <p className="mt-5 text-[17px] leading-[1.5] text-paper-mid/80">
              Nothing in that tier yet.
            </p>
          )}

          {/*
            * One action, then two ways back.
            *
            * Three stacked full-width blocks is the shape of an ecommerce
            * checkout, and it was the last generic thing on the page. The
            * Showcase is the actual next thought once you can see what you own;
            * the other two are navigation and read as navigation.
            */}
          <div className="mt-8">
            <Link
              href="/counter/showcase"
              className="pixel-edge flex min-h-[48px] w-full items-center justify-center border-2 border-wood-dark bg-red-dark font-display text-[12px] text-paper-white uppercase active:translate-y-px"
            >
              Put one in the showcase
            </Link>

            <div className="mt-4 flex items-center justify-between gap-4">
              <Link
                href="/counter"
                className="flex min-h-[44px] items-center font-display text-[11px] tracking-wide text-paper-mid/85 uppercase underline decoration-paper-mid/30 underline-offset-4 active:translate-y-px"
              >
                The counter
              </Link>
              <ReturnPlate />
            </div>
          </div>

        </div>
      </Page>
    </>
  );
}

/**
 * Chunked into rows of three, so each row can stand on its own board.
 *
 * A plain grid cannot do this: the board has to be a sibling *under* each row,
 * and CSS grid gives no handle on "the end of a row" that survives a filter
 * changing how many cells there are.
 */
function rows(entries: readonly CollectionEntry[]): CollectionEntry[][] {
  const out: CollectionEntry[][] = [];
  for (let i = 0; i < entries.length; i += 3) out.push(entries.slice(i, i + 3));
  return out;
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
    /*
     * An unowned item is a **gap on the board**, not a dark card.
     *
     * The previous version was an opaque near-black cell with a grey dash in it,
     * arrived at by *raising the contrast* of an earlier translucent one. Both
     * were the same mistake: a filled rectangle where nothing is standing reads
     * as a thing that failed to render, however dark or light you make it.
     *
     * So there is no surface here at all — just the name, written on the board
     * the way a shopkeeper labels a space they mean to fill. It still shows the
     * name, because hiding it would make the shelf a mystery instead of a set,
     * and the catalog is not secret.
     */
    return (
      <li className="flex h-full flex-col justify-end px-0.5 pb-1.5 text-center">
        <span className="text-[14px] leading-[1.2] text-paper-mid/55">{entry.name}</span>
      </li>
    );
  }

  return (
    <li
      className={`rarity-frame rarity-${entry.rarity} pixel-edge relative flex h-full flex-col items-center gap-1 border-2 border-wood-dark bg-paper-mid px-1.5 pt-2 pb-1.5`}
    >
      <span aria-hidden="true" className="flex h-12 w-full items-center justify-center">
        <span className="block h-12 w-12">
          {/* `compact`: object scale, so the wall-sized placeholder is wrong here. */}
          <AssetView resolution={resolveAsset(entry.slug)} compact placeholder="collectible" />
        </span>
      </span>

      {/*
        * The name, at 14px rather than 11.
        *
        * It is the only thing on the card that says *what this is* while the art
        * is still a placeholder, and 11px is decorative type for a load-bearing
        * value — which `PRODUCT_DELIVERY_MANDATE.md §6` rules out directly.
        */}
      <span className="text-center text-[14px] leading-[1.2] text-ink-900">{entry.name}</span>

      <span
        className={`rarity-word rarity-${entry.rarity} font-display text-[10px] tracking-[0.1em] uppercase`}
      >
        {entry.rarity}
      </span>

      {/*
        * Duplicates. Counted, not converted — `03 §12` leaves salvage to P3.
        * Screen readers get the word; the mark is decoration.
        */}
      {entry.count > 1 && (
        <span className="absolute top-1 right-1 bg-ink-900 px-1 font-display text-[10px] text-paper-mid">
          <span aria-hidden="true">&times;{entry.count}</span>
          <span className="sr-only">{entry.count} copies</span>
        </span>
      )}
    </li>
  );
}
