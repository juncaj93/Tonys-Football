import Link from 'next/link';

import { PanelHeading, PixelPanel, ReturnPlate, SignPlate } from '@/components/scene/panel';
import { RoomBehind } from '@/components/scene/room-behind';
import { Page } from '@/components/shell';
import { requireUser } from '@/lib/auth/current-user';

/**
 * The staff hallway behind the dining room.
 *
 * **One compact screen, two environmental choices, and a door back.** Not a
 * menu card and not a grid — `18 §5` is explicit that this is a place you walk
 * into, and a card grid would make it a submenu with wallpaper.
 *
 * ## Why this room exists at all
 *
 * Rooms and Underground are **two taps** from the parlor, which is the one
 * approved exception to one-tap depth, and it is worth being clear about what
 * buys the exception. Two things do. The artwork has exactly **one** real rear
 * doorway, so a second homepage door would have to be invented. And a curtained,
 * unmarked door is *odd* in a public dining room and exactly right in a staff
 * hallway — the Back Hall makes the Underground's reveal better rather than
 * merely making it fit.
 *
 * In V1 both destinations are locked. They are **visible and tappable anyway**,
 * because a manager should know the downstairs exists before it opens, and
 * because a locked door that answers in-world is a world, while a hidden one is
 * just an absent feature.
 */

export const dynamic = 'force-dynamic';

export default async function BackHallPage() {
  await requireUser();

  return (
    <>
      <RoomBehind />

      <Page>
        <div className="mx-auto w-full max-w-[420px] px-4 pt-6 pb-10">
          <SignPlate>Back hall</SignPlate>

          <p className="mt-4 text-[17px] leading-[1.5] text-paper-mid/80">
            Crates against one wall, a mop bucket, and the hum of the walk-in. Two doors.
          </p>

          <div className="mt-6 space-y-4">
            {/*
              * The cellar stairs. Named for what is down there rather than for
              * the furniture — "Rooms" is where managers keep their things.
              */}
            <Link href="/rooms" className="block outline-none">
              <PixelPanel className="px-4 py-4 active:translate-y-px">
                <PanelHeading>Down the stairs</PanelHeading>
                <p className="mt-1.5 text-[17px] leading-[1.45] text-ink-700">
                  A light is on at the bottom and somebody has been moving boxes.
                </p>
                {/*
                  * A **closed door with a line**, never a disabled control
                  * (`BACK_HALL_BOUNDARY §2`). It was set at 9px in `amber-mid/70`
                  * on cream — under the 16–18px floor (`MANDATE §6`) and around
                  * 1.6:1 against the surface it sits on. A line nobody can read
                  * is not atmospheric; it is absent, and this one is the entire
                  * statement that the downstairs exists.
                  */}
                <p className="mt-2.5 font-display text-[12px] text-ink-500 uppercase">
                  Chained — later
                </p>
              </PixelPanel>
            </Link>

            {/*
              * The Underground. **Never labelled `CASINO` on first discovery**
              * (`18 §5`) — the whole point is that you find out what it is by
              * being let in, not by reading a sign on the way past.
              */}
            {/*
              * **Not a `Link`.** It was one, to `/underground`, which does not
              * exist — so Next prefetched it on hover and every visit to this
              * page logged a 404. Nothing rendered wrong, nothing failed a test,
              * and the console error was the only evidence.
              *
              * A locked destination is *supposed* to be a dead end that answers
              * in-world (`18 §6`): "Tappable, but answers in-world — not a
              * route, not a modal, not a coming-soon badge." A link to a route
              * that has not been built is none of those things; it is a broken
              * link wearing the costume of a locked door. The plate is inert
              * until the Underground opens, and the line on it is the answer.
              */}
            <PixelPanel className="px-4 py-4">
              <PanelHeading>The curtained door</PanelHeading>
              <p className="mt-1.5 text-[17px] leading-[1.45] text-ink-700">
                Heavy curtain, no handle you can see, no sign on it.
              </p>
              {/*
                * **The whole reveal of the Underground**, and it shipped at 9px
                * in `amber-mid/70` on cream — the single least readable thing in
                * the product, carrying the one line `18 §5` fixes verbatim.
                *
                * It is somebody answering a question, so it is set like speech
                * rather than like a status label: full body size, `ink-900`, and
                * the quotation marks kept because the joke is that a person said
                * it. (The Slice's ban on quotation marks is about *fabricated
                * testimony* in generated prose — this is fixed curated copy from
                * the navigation map, on a surface with no renderer.)
                */}
              <p className="mt-2.5 text-[17px] leading-[1.45] text-ink-900">
                &ldquo;Don&rsquo;t worry about it.&rdquo;
              </p>
            </PixelPanel>
          </div>

          {/* The way back is a door in the world, not the browser's back button. */}
          <div className="mt-8">
            <ReturnPlate />
          </div>
        </div>
      </Page>
    </>
  );
}
