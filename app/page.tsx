import Link from 'next/link';

import { ReceiptSlip } from '@/components/receipt';
import {
  ArcadeCabinet,
  BackBar,
  Booths,
  ClosedFixture,
  Corkboard,
  EnamelSign,
  HangingSign,
  MenuBoard,
  SceneSurface,
  SpeechPlate,
  WallClock,
  WindowNeon,
} from '@/components/scene/fixtures';
import { Floor, ParlorAir, Pendant, Wall } from '@/components/scene/backdrop';
import { BottomNav, Page, TAP_TARGET } from '@/components/shell';
import { TonyAtTheCounter } from '@/components/tony';
import { requireUser } from '@/lib/auth/current-user';
import { listDoorManagers } from '@/lib/auth/service';
import { greetingFor } from '@/lib/content/greeting';
import { getDb } from '@/lib/db';
import { receiptFor } from '@/lib/parlor/receipt';
import { seasonClock } from '@/lib/parlor/season';
import { tonightBoard } from '@/lib/parlor/tonight';
import { loadTags } from '@/lib/tags/repository';

/**
 * Tony's Pizza Parlor.
 *
 * You are standing at the counter. The window is behind you to the right, the
 * neon reading backwards through the glass; two pendants light the counter and
 * the booths; the room falls away into the dark at the back where the doors
 * are.
 *
 * The six zones of `16 §7.1` are all here, but as **fixtures in a room** rather
 * than as sections of a page:
 *
 * | Zone            | What it is in the room                     |
 * |-----------------|--------------------------------------------|
 * | Front counter   | the counter, Tony behind it, your receipt on it |
 * | Tonight at Tony's | the corkboard on the wall, four pinned slips |
 * | Menu board      | the slate over the back bar                |
 * | Newspaper rack  | the wire rack by the door, empty           |
 * | Display case    | the lit glass case, shelves bare           |
 * | Wall            | the back of the room — booths, arcade, two doors |
 *
 * Nothing has a gap around it: the wall runs behind every fixture and the
 * lighting layer is fixed, so scrolling moves you through one place rather than
 * down a list of cards.
 *
 * The offseason is the designed state, not an absence (`17 §1`). The room is
 * empty because it is July: chairs are up on the tables, the case is dark, the
 * rack has no papers in it, and the sign in the window says so.
 */

// The greeting is chosen per manager and logged on every visit, so this page is
// never static and never cached.
export const dynamic = 'force-dynamic';

export default async function ParlorPage() {
  const { user } = await requireUser();
  const db = getDb();
  const clock = seasonClock();

  const [tags, managers, receipt, tonight] = await Promise.all([
    loadTags(db),
    listDoorManagers(db),
    receiptFor(db, user.id),
    tonightBoard(db),
  ]);

  const greeting = await greetingFor(db, {
    userId: user.id,
    displayName: user.displayName,
    tags: tags.get(user.id) ?? new Set<string>(),
    leagueTags: managers.map((manager) => tags.get(manager.id) ?? new Set<string>()),
    daysUntilKickoff: clock.daysUntilKickoff,
  });

  const countdown =
    clock.daysUntilKickoff === null
      ? 'Week one'
      : `${String(clock.daysUntilKickoff)} days to week one`;

  return (
    <>
      <ParlorAir />

      <Page>
        {/* ---- The window, and the street outside ------------------------ */}
        <header className="relative h-24 overflow-hidden border-b-2 border-wood-dark">
          <WindowNeon />
          <HangingSign top="Closed" bottom="back in september" />

          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 px-4 pb-2">
            <span className="font-mono text-[10px] tracking-[0.22em] text-blue-neon/80 uppercase">
              {clock.phase === 'offseason' ? 'Offseason' : 'Season'} · {countdown}
            </span>
            <Link
              href="/profile"
              className={`flex ${TAP_TARGET} items-center font-mono text-[11px] tracking-wide text-paper-mid underline decoration-dotted underline-offset-4`}
            >
              {user.displayName}
            </Link>
          </div>
        </header>

        {/* ---- The counter ----------------------------------------------
          *
          * Three layers, which is what puts Tony *in* the shop rather than on
          * top of a picture of one:
          *
          *   1. `zone_front_counter` — the back of the room
          *   2. Tony, standing behind the counter
          *   3. `zone_counter_front` — the counter, drawn over his waist
          *
          * Both tiles were cut from one generated room along the counter's top
          * edge, so they line up exactly and share a light direction by
          * construction (`scripts/prepare-b0.ts`).
          */}
        <section className="relative">
          <div className="relative">
            {/*
              * The children are the placeholder tier — what gets drawn only
              * while the registry has no art for this slug. With the B0 tile
              * registered they are not rendered, and the tile's own menu wall
              * carries what the CSS menu board used to say. The offseason line
              * itself has not been lost: it is in the header and on the
              * corkboard, where it is text rather than a picture of text.
              */}
            <SceneSurface slug="zone_front_counter" className="w-full">
              <div className="relative h-[9.5rem]">
                <BackBar />
                <div className="absolute right-2 bottom-14 w-36 sm:right-6 sm:w-44">
                  <MenuBoard
                    lines={
                      clock.daysUntilKickoff === null
                        ? ['Week one', 'is on']
                        : ['No specials', 'till September']
                    }
                  />
                </div>
              </div>
            </SceneSurface>

            {/*
              * Tony. Placed against the tile in percentages so he keeps his
              * footing at every width — he stands in the gap between the oven
              * and the pizza boxes, and hangs below the tile far enough for the
              * counter to take him at the waist.
              */}
            <div className="absolute bottom-[-10%] left-[16%] z-10 w-[26%] sm:w-[22%]">
              <TonyAtTheCounter
                slug={greeting?.tonySlug ?? 'character_tony_neutral'}
                mood={greeting?.expression ?? 'neutral'}
              />
            </div>
          </div>

          <SceneSurface slug="zone_counter_front" className="relative z-20 w-full">
            <div className="surface-counter h-5 w-full" />
          </SceneSurface>

          {/* The rest of the counter, running toward you. */}
          <div className="surface-wood relative z-20 border-b border-wood-dark px-4 pt-4 pb-6">
            <SpeechPlate speaker="Tony" mood={greeting?.expression ?? 'neutral'}>
              {greeting === null ? (
                // "No content" is always a valid outcome (`16 §10`). Tony is at
                // the counter and not saying anything, which is better than a
                // line that is wrong.
                <p className="text-[15px] leading-relaxed text-paper-mid/70 italic">
                  Tony nods at {user.displayName} and goes back to the oven.
                </p>
              ) : (
                <p className="text-[17px] leading-snug font-medium text-paper-white sm:text-lg">
                  {greeting.text}
                </p>
              )}
            </SpeechPlate>

            {/*
              * Lying on the counter where Tony left it — smaller than the
              * dialogue above it, because it is a docket somebody put down, not
              * the headline of the screen.
              */}
            <div
              className="mx-auto mt-4 w-full max-w-[15rem]"
              style={{ transform: 'rotate(-1.4deg)' }}
            >
              <ReceiptSlip receipt={receipt} name={user.displayName} />
            </div>
          </div>
        </section>

        {/* ---- The wall by the counter ----------------------------------- */}
        <Wall className="px-4 pt-6 pb-8">
          <WallClock className="absolute -top-1 right-4 z-10" />
          <Corkboard
            title="Tonight at Tony's"
            notes={tonight.map((line) => ({ key: line.key, text: line.text }))}
          />
        </Wall>

        {/* ---- By the door: the rack and the case ------------------------ */}
        <section className="relative px-4 pb-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <ClosedFixture
              slug="zone_newspaper_rack"
              href="/slice"
              label="The rack"
              note="Empty. The first Slice prints the Tuesday after week one."
              variant="rack"
            />
            <ClosedFixture
              slug="zone_display_case"
              href="/collection"
              label="The case"
              note="Glass is clean, shelves are bare. Nothing to collect yet."
              variant="case"
            />
          </div>
        </section>

        {/* ---- The back of the room -------------------------------------- */}
        <section className="relative">
          <Pendant className="top-0 right-[22%] z-0" height="h-28" />

          <div className="relative px-4 pt-10">
            <div className="mb-2 flex items-center justify-between">
              <EnamelSign tone="cream">The back</EnamelSign>
              <span className="font-mono text-[10px] tracking-[0.18em] text-ink-300 uppercase">
                nobody in tonight
              </span>
            </div>

            <div className="relative">
              <ArcadeCabinet className="absolute right-1 bottom-6 z-10" />
              <Booths />
            </div>
          </div>

          <Floor className="h-16" />

          <div className="relative -mt-4 grid gap-4 px-4 pb-10 sm:grid-cols-2">
            <ClosedFixture
              slug="dressing_door_basement"
              href="/rooms"
              label="Basement"
              note="Chained shut. Every manager gets a room down there eventually."
              variant="door"
            />
            <ClosedFixture
              slug="dressing_door_boarded"
              label="Back door"
              note="Boarded over. Tony says it has always been like that."
              variant="boarded"
            />
          </div>
        </section>
      </Page>

      <BottomNav current="/" />
    </>
  );
}
