import Link from 'next/link';

import { ReceiptSlip } from '@/components/receipt';
import {
  ArcadeCabinet,
  BackBar,
  Booths,
  ClosedFixture,
  Corkboard,
  Counter,
  EnamelSign,
  HangingSign,
  MenuBoard,
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

        {/* ---- The counter ---------------------------------------------- */}
        <Wall className="relative pb-0" wainscot={false}>
          <Pendant className="top-0 left-[18%] z-0" height="h-44" />

          <Counter
            behind={
              // A band of the room behind the counter. Tony stands on its
              // floor, so the counter top below crops him at the forearms.
              <div className="relative z-10 h-[9.5rem]">
                <BackBar />

                <div className="absolute bottom-0 left-2 sm:left-6">
                  <TonyAtTheCounter
                    slug={greeting?.tonySlug ?? 'character_tony_neutral'}
                    mood={greeting?.expression ?? 'neutral'}
                  />
                </div>

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
            }
            onTop={
              <div className="space-y-4">
                <SpeechPlate speaker="Tony" mood={greeting?.expression ?? 'neutral'}>
                  {greeting === null ? (
                    // "No content" is always a valid outcome (`16 §10`). Tony is
                    // at the counter and not saying anything, which is better
                    // than a line that is wrong.
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
                  * dialogue above it, because it is a docket somebody put down,
                  * not the headline of the screen.
                  */}
                <div
                  className="mx-auto w-full max-w-[15rem]"
                  style={{ transform: 'rotate(-1.4deg)' }}
                >
                  <ReceiptSlip receipt={receipt} name={user.displayName} />
                </div>
              </div>
            }
          />
        </Wall>

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
