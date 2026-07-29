import Link from 'next/link';

import { ReceiptSlip } from '@/components/receipt';
import type { Placement } from '@/components/scene/room-object';
import { RoomObject, Ticks } from '@/components/scene/room-object';
import { BottomNav, Page } from '@/components/shell';
import { TonyAtTheCounter } from '@/components/tony';
import { AssetView } from '@/lib/assets/placeholder';
import { resolveAsset } from '@/lib/assets/registry';
import { requireUser } from '@/lib/auth/current-user';
import { listDoorManagers } from '@/lib/auth/service';
import { greetingFor } from '@/lib/content/greeting';
import { getDb } from '@/lib/db';
import { receiptFor } from '@/lib/parlor/receipt';
import { seasonClock } from '@/lib/parlor/season';
import { tonightBoard } from '@/lib/parlor/tonight';
import { loadTags } from '@/lib/tags/repository';

/**
 * Tony's Pizza Parlor — one screen.
 *
 * You are standing at the counter, and that is the whole page. The room fills
 * the viewport, Tony is behind the counter, and the things you can do are
 * **objects in the shop** rather than sections stacked underneath it. Nothing
 * scrolls here. Tapping an object opens it over the room, and what it opens
 * scrolls on its own.
 *
 * ## The room is three layers
 *
 *   1. `zone_front_counter` — the ceiling, the wall, the back bar, the counter
 *   2. Tony
 *   3. `zone_counter_front` — the front of the counter and the floor
 *
 * The two tiles are one drawing cut at the counter's near edge and put back
 * together, so they reassemble the room with no seam and no stretch. Tony is
 * drawn *between* them, which is what puts him in the shop rather than on top
 * of a picture of one.
 *
 * ## The measurements
 *
 * Everything is placed in percentages of the room, never in pixels, so the
 * scene holds together at any width and nothing drifts off its mark. The
 * numbers were read off the art itself — the stacked canvas is 320 x 569, and
 * `pct()` below converts a rectangle measured in those units into the
 * percentages the browser wants. Nothing here is a guess.
 *
 * The room is sized by **width**, which is what keeps the wall branding, the
 * soda fountain, the warmer and the booths intact; when the viewport is short
 * the excess crops off the *bottom*, taking floor, which is the one part of
 * the room that carries nothing.
 */

// The greeting is chosen per manager and logged on every visit, so this page is
// never static and never cached.
export const dynamic = 'force-dynamic';

/** The stacked room, in the units the art was drawn in. */
const ROOM = { w: 320, h: 569 } as const;

/** A rectangle measured on the art, turned into CSS percentages. */
function pct(x: number, y: number, w: number, h: number): Placement {
  return {
    left: `${((x / ROOM.w) * 100).toFixed(2)}%`,
    top: `${((y / ROOM.h) * 100).toFixed(2)}%`,
    width: `${((w / ROOM.w) * 100).toFixed(2)}%`,
    height: `${((h / ROOM.h) * 100).toFixed(2)}%`,
  };
}

/**
 * Where Tony stands.
 *
 * Read off the drawing: the counter's near edge is y=291, the soda fountain
 * ends at x=118 and the warmer begins at x=183, so the clear lane behind the
 * counter is the middle of the room. He is 240 tall — the asset's own height,
 * so at phone width it renders close to one image pixel per CSS pixel — and
 * the counter takes him at the waist, leaving the apron tie showing.
 */
const TONY = { x: 95, y: 179, w: 72, h: 197 } as const;

/** The counter's near edge: where the foreground layer starts. */
const COUNTER_EDGE = 291;

/**
 * Grow a hotspot until a thumb can hit it.
 *
 * Hotspots are anchored to real objects, and a picture frame on a wall is
 * smaller than a fingertip. Where that happens the *tap area* grows around the
 * object; the object itself is never drawn bigger to suit the interface.
 *
 * The floor is measured against a 320px-wide room — the narrowest phone still
 * in circulation — so the guarantee holds at the bottom of the range and every
 * larger screen simply gets more than the minimum.
 */
const NARROWEST_ROOM = 320;
const MIN_TAP = 46;

function atLeast(rect: Placement): Placement {
  const roomHeight = (NARROWEST_ROOM * ROOM.h) / ROOM.w;

  const grow = (value: string, extent: string, axisPx: number): [string, string] => {
    const sizePx = (parseFloat(extent) / 100) * axisPx;
    if (sizePx >= MIN_TAP) return [value, extent];

    const marginPct = ((MIN_TAP - sizePx) / 2 / axisPx) * 100;
    return [
      `${(parseFloat(value) - marginPct).toFixed(2)}%`,
      `${(parseFloat(extent) + marginPct * 2).toFixed(2)}%`,
    ];
  };

  const [left, width] = grow(rect.left, rect.width, NARROWEST_ROOM);
  const [top, height] = grow(rect.top, rect.height, roomHeight);

  return { left, top, width, height };
}

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

  const line = greeting?.text ?? `Tony nods at ${user.displayName} and goes back to the oven.`;

  return (
    <>
      <Page oneScreen>
        {/* ---- The utility bar. Identity and the date, and nothing else. ---- */}
        <header className="flex h-11 shrink-0 items-center justify-between gap-3 bg-ink-900 px-3">
          <span className="font-mono text-[10px] tracking-[0.14em] text-ink-100/60 uppercase">
            {clock.daysUntilKickoff === null
              ? 'Week one'
              : `${String(clock.daysUntilKickoff)} days to week one`}
          </span>
          <Link
            href="/profile"
            className="-mr-3 flex h-11 min-w-[44px] items-center justify-end px-3 font-mono text-[11px] text-paper-mid/75"
          >
            {user.displayName}
          </Link>
        </header>

        {/* ---- The parlor ------------------------------------------------- */}
        <main
          className="relative flex min-h-0 flex-1 justify-center overflow-hidden"
          // The floor's own colour, so a viewport taller than the room reads as
          // more floor rather than as a letterbox.
          style={{ backgroundColor: '#3b2050' }}
        >
          <div
            className="relative w-full max-w-[430px] self-start"
            style={{ aspectRatio: `${String(ROOM.w)} / ${String(ROOM.h)}` }}
          >
            {/* 1. Everything behind the counter. */}
            <AssetView resolution={resolveAsset('zone_front_counter')} />

            {/* 2. Tony, standing in the room. */}
            <div className="absolute z-10" style={pct(TONY.x, TONY.y, TONY.w, TONY.h)}>
              <TonyAtTheCounter
                slug={greeting?.tonySlug ?? 'character_tony_neutral'}
                mood={greeting?.expression ?? 'neutral'}
              />
            </div>

            {/* 3. The counter front and the floor, drawn over him. */}
            <div className="absolute inset-x-0 z-20" style={{ top: `${((COUNTER_EDGE / ROOM.h) * 100).toFixed(2)}%` }}>
              <AssetView resolution={resolveAsset('zone_counter_front')} />
            </div>

            {/* ---- Things in the room you can pick up -------------------- */}

            {/* Tony himself. He greets you, and hands over your slip. */}
            <RoomObject
              label="Talk to Tony"
              title="Tony"
              placement={atLeast(pct(TONY.x, TONY.y, TONY.w, COUNTER_EDGE - TONY.y))}
            >
              <p className="text-[17px] leading-snug">{line}</p>
              <div className="mt-4 border-t border-dashed border-ink-300 pt-4 pb-4">
                <ReceiptSlip receipt={receipt} name={user.displayName} />
              </div>
            </RoomObject>

            {/* The empty frame screwed to the wall on the left. */}
            <RoomObject
              label="Read the notice on the wall"
              title="Tonight at Tony's"
              placement={atLeast(pct(34, 105, 21, 47))}
            >
              {tonight.length === 0 ? (
                <p className="pb-4 text-[15px] text-ink-500">Nothing on the board.</p>
              ) : (
                <ul className="space-y-2.5 pb-4">
                  {tonight.map((entry) => (
                    <li key={entry.key} className="flex gap-2.5 text-[15px] leading-snug">
                      <span aria-hidden="true" className="text-red-dark">
                        —
                      </span>
                      <span>{entry.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </RoomObject>

            {/* The lit case on the counter. It is a display case, so it is the collection. */}
            <RoomLinkArea
              href="/collection"
              label="Look in the display case"
              placement={atLeast(pct(185, 240, 70, 40))}
            />

            {/* The poster frame by the window, where the paper goes up on a Tuesday. */}
            <RoomLinkArea
              href="/slice"
              label="Check the poster frame"
              placement={atLeast(pct(244, 117, 16, 43))}
            />

            {/* The booths at the back, and the rooms beyond them. */}
            <RoomLinkArea
              href="/rooms"
              label="Go through to the back"
              placement={atLeast(pct(272, 200, 48, 68))}
            />
          </div>

          {/*
            * What Tony is saying, pinned to the bottom of the screen rather than
            * to the room — so it survives whatever the room's floor does on a
            * short phone, and stays clear of the home indicator.
            */}
          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-40">
            <p className="rounded-[3px] border border-wood-dark/70 bg-ink-900/90 px-3.5 py-2.5 text-[15px] leading-snug text-paper-white shadow-[0_6px_18px_rgba(0,0,0,0.55)]">
              <span className="mr-2 font-mono text-[10px] tracking-[0.18em] text-amber-mid/80 uppercase">
                Tony
              </span>
              {line}
            </p>
          </div>
        </main>
      </Page>

      <BottomNav current="/" />
    </>
  );
}

/** A part of the room that leads somewhere, rather than opening in place. */
function RoomLinkArea({
  href,
  label,
  placement,
}: {
  href: string;
  label: string;
  placement: Placement;
}) {
  return (
    <Link href={href} aria-label={label} className="group absolute z-30" style={placement}>
      <Ticks />
    </Link>
  );
}
