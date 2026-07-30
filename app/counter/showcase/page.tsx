import Link from 'next/link';

import { ShowcasePicker, type PickerChoice } from '@/components/counter/showcase-picker';
import { PanelHeading, PixelPanel, ReturnPlate, SignPlate } from '@/components/scene/panel';
import { RoomBehind } from '@/components/scene/room-behind';
import { Page } from '@/components/shell';
import { AssetView } from '@/lib/assets/placeholder';
import { resolveAsset } from '@/lib/assets/registry';
import { requireUser } from '@/lib/auth/current-user';
import { leagueShowcase, showcaseChoices, showcaseFor } from '@/lib/counter/showcase';
import { getDb } from '@/lib/db';

/**
 * `/counter/showcase` — one item each, and everybody can see everybody's.
 *
 * `18 §4`: *"The one item shown to the league. **No levels, prestige, or clout.**"*
 * `16 §5.3`: it is a column, not a feature. `16` also defers manager basements to
 * v1.1 and says **the Showcase carries the social weight at launch** — so this is
 * the whole of the social layer for now, and it is deliberately small: ten
 * managers, one shelf each, no score anywhere on the page.
 *
 * ## The wall shows the whole league, gaps included
 *
 * A manager who has chosen nothing appears with an empty spot rather than being
 * left out. Omitting them would make "has not picked" indistinguishable from "is
 * not in this league", and the empty spots are half of what makes the wall worth
 * looking at — somebody will notice theirs is bare.
 *
 * Retired managers stay on the wall too. `16 §5.1` retires rather than deletes so
 * that history survives, and what somebody was showing when they left is part of it.
 *
 * ## Your own pick comes first
 *
 * The thing you came to do is at the top; the league is underneath. That ordering
 * is also why the picker is here rather than on `/counter/collection` — the shelf
 * is for looking at what you have, and bolting a "show this" control onto all
 * twenty-four spots would put two dozen extra targets on a page whose job is to be
 * read.
 */

export const dynamic = 'force-dynamic';

export default async function ShowcasePage() {
  const { user } = await requireUser();
  const db = getDb();

  const [mine, choices, league] = await Promise.all([
    showcaseFor(db, user.id),
    showcaseChoices(db, user.id),
    leagueShowcase(db),
  ]);

  const pickerChoices: readonly PickerChoice[] = choices.map((choice) => ({
    collectibleId: choice.collectibleId,
    name: choice.name,
    rarity: choice.rarity,
    // Resolved server-side, so the registry stays out of the client bundle.
    asset: resolveAsset(choice.slug),
  }));

  const others = league.filter((entry) => entry.userId !== user.id);
  const showing = others.filter((entry) => entry.item !== null).length;

  return (
    <>
      <RoomBehind />

      <Page>
        <div className="mx-auto w-full max-w-[420px] px-4 pt-6 pb-10">
          <SignPlate>The showcase</SignPlate>

          <p className="mt-4 text-[17px] leading-[1.5] text-paper-mid/80">
            One thing each, out where everyone can see it.
          </p>

          <PixelPanel className="mt-5 px-4 py-4">
            <PanelHeading>{mine === null ? 'You have nothing out' : 'Yours'}</PanelHeading>

            {mine !== null && (
              <div className="mt-2 flex items-center gap-3">
                <span aria-hidden="true" className="block h-14 w-14 shrink-0">
                  <AssetView resolution={resolveAsset(mine.slug)} compact placeholder="collectible" />
                </span>
                <span>
                  <span className="block text-[17px] leading-[1.3] text-ink-900">{mine.name}</span>
                  <span
                    className={`rarity-word rarity-${mine.rarity} block font-display text-[9px] tracking-[0.12em] uppercase`}
                  >
                    {mine.rarity}
                  </span>
                </span>
              </div>
            )}

            {/*
              * The picker needs its own label.
              *
              * Without one, a manager holding a single collectible sees that item
              * twice in one panel — once as "what the league sees" and once as the
              * only thing to choose from — and it reads as a duplicate render rather
              * than as a summary above a control.
              */}
            {pickerChoices.length > 0 && (
              <p className="mt-4 font-display text-[10px] tracking-[0.12em] text-ink-700/75 uppercase">
                {mine === null ? 'Pick one' : 'Change it, or tap to take it back'}
              </p>
            )}

            <ShowcasePicker choices={pickerChoices} chosenId={mine?.collectibleId ?? null} />
          </PixelPanel>

          <PixelPanel className="mt-4 px-4 py-4">
            <PanelHeading>The league</PanelHeading>
            <p className="mt-1.5 text-[17px] leading-[1.5] text-ink-700">
              {showing === 0
                ? 'Nobody else has put anything out yet.'
                : `${String(showing)} of ${String(others.length)} have something out.`}
            </p>

            {/*
              * The wall, as a ledger rather than as ten dark cards.
              *
              * Each manager was a near-black rectangle on a cream panel with a
              * grey dash in it where an item would be. At actual size those read
              * as **rows that failed to load** — the same defect the collection's
              * unowned spots had, and the commissioner's "generic dashboard
              * cards" note covers both.
              *
              * The fix is the same one: nothing is drawn where nothing is out.
              * A manager showing something gets their item on the shelf; a
              * manager showing nothing gets their name and a quiet line, on the
              * paper the rest of the panel is already made of. **Everyone stays
              * listed** — omitting them would make "has not picked" look like "is
              * not in this league" (`lib/counter/showcase.ts`).
              */}
            <ul className="mt-3">
              {others.map((entry) => (
                <li
                  key={entry.userId}
                  className="flex items-center gap-3 border-t-2 border-ink-700/15 py-2.5 first:border-t-0"
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-11 w-11 shrink-0 items-center justify-center ${
                      entry.item === null ? '' : 'pixel-inset border-2 border-wood-dark bg-paper-white'
                    }`}
                  >
                    {entry.item === null ? (
                      /*
                       * An empty display slot: the shelf edge and nothing on it.
                       * A framed box here would be a frame around an absence,
                       * which is what made the old row look broken.
                       */
                      <span className="h-[3px] w-6 bg-ink-700/30" />
                    ) : (
                      <span className="block h-10 w-10">
                        <AssetView resolution={resolveAsset(entry.item.slug)} compact placeholder="collectible" />
                      </span>
                    )}
                  </span>

                  <span className="min-w-0">
                    <span className="block font-display text-[11px] tracking-wide text-ink-900 uppercase">
                      {entry.displayName}
                    </span>
                    {entry.item === null ? (
                      <span className="block text-[15px] leading-[1.3] text-ink-700/60">
                        Nothing out
                      </span>
                    ) : (
                      <>
                        <span className="block text-[15px] leading-[1.3] text-ink-900">
                          {entry.item.name}
                        </span>
                        {/*
                          * 10px rather than 8. Rarity is a value people read, and
                          * `PRODUCT_DELIVERY_MANDATE.md §6` rules out putting a
                          * value that matters in decorative type.
                          */}
                        <span
                          className={`rarity-word rarity-${entry.item.rarity} block font-display text-[10px] tracking-[0.12em] uppercase`}
                        >
                          {entry.item.rarity}
                        </span>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </PixelPanel>

          <div className="mt-8 flex items-center justify-between gap-4">
            <Link
              href="/counter/collection"
              className="flex min-h-[44px] items-center font-display text-[11px] tracking-wide text-paper-mid/85 uppercase underline decoration-paper-mid/30 underline-offset-4 active:translate-y-px"
            >
              Your shelves
            </Link>
            <ReturnPlate />
          </div>
        </div>
      </Page>
    </>
  );
}
