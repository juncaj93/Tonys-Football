import Link from 'next/link';

import { Arriving, ShowInteractables } from '@/components/scene/arrival';
import { RoomDisplay, RoomDoor } from '@/components/scene/room-object';
import { TonyToy } from '@/components/scene/tony-toy';
import { Page } from '@/components/shell';
import { TonyAtTheCounter } from '@/components/tony';
import { AssetView } from '@/lib/assets/placeholder';
import { resolveAsset } from '@/lib/assets/registry';
import { requireUser } from '@/lib/auth/current-user';
import { listDoorManagers } from '@/lib/auth/service';
import { greetingFor } from '@/lib/content/greeting';
import { getDb } from '@/lib/db';
import { COUNTER_EDGE, ROOM, TONY, roomObject } from '@/lib/parlor/objects';
import { seasonClock } from '@/lib/parlor/season';
import { tonightBoard } from '@/lib/parlor/tonight';
import { loadTags } from '@/lib/tags/repository';

/**
 * Tony's Pizza Parlor.
 *
 * You are standing at the counter, and that is the whole page. The room fills
 * the viewport, Tony is behind it, and **the shop is the navigation** — there is
 * no tab bar, because a restaurant with a tab bar screwed along the bottom of it
 * is an app with a themed background. You get to your collection by looking in
 * the case on the counter. Nothing here scrolls; what you pick up opens over the
 * room and scrolls on its own.
 *
 * ## The room is three layers
 *
 *   1. `zone_front_counter` — the ceiling, the wall, the back bar, the counter
 *   2. Tony
 *   3. `zone_counter_front` — the front of the counter and the floor
 *
 * The two tiles are one drawing cut at the counter's near edge, so they
 * reassemble it with no seam. Tony is drawn *between* them, which is what puts
 * him in the shop rather than on top of a picture of one — and what lets him
 * step up from behind the counter when you arrive.
 *
 * ## The measurements
 *
 * ## What is interactive, and why
 *
 * `lib/parlor/objects.ts` is the map, and the rule is the ruling's: an object
 * is interactive because it has an understandable purpose, not because it is
 * painted well. Doors go somewhere and are the only kind that advertise;
 * Displays are read in place; Toys answer; scenery is scenery and is not in the
 * markup at all. Every shape is a polygon traced on the art, which is both the
 * outline that glows and the region that takes the tap.
 */

// The greeting is chosen per manager and logged on the first visit of each day,
// so this page is never static and never cached.
export const dynamic = 'force-dynamic';

export default async function ParlorPage() {
  const { user } = await requireUser();
  const db = getDb();
  const clock = seasonClock();

  const [tags, managers, tonight] = await Promise.all([
    loadTags(db),
    listDoorManagers(db),
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
    <Page oneScreen>
      <Arriving>
        {/*
          * The utility bar. Deliberately the smallest thing on the screen: the
          * day, the way to ask what is interactive, and who you are. Every part
          * of it is `nowrap` — a bar that reflows to two lines is a bar that has
          * stolen a slice of the room, and the room is the point.
          */}
        <header className="flex h-11 shrink-0 items-center justify-between gap-1 overflow-hidden bg-ink-900 pr-1 pl-3">
          <span className="shrink-0 font-display text-[9px] whitespace-nowrap text-ink-100/55 uppercase">
            {clock.daysUntilKickoff === null
              ? 'Week one'
              : `${String(clock.daysUntilKickoff)} days out`}
          </span>
          <div className="flex min-w-0 items-center">
            <ShowInteractables />
            <Link
              href="/profile"
              className="flex h-11 min-w-[44px] items-center justify-end truncate px-3 font-display text-[9px] whitespace-nowrap text-paper-mid/75"
            >
              {user.displayName}
            </Link>
          </div>
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
            style={{ aspectRatio: `${String(ROOM.width)} / ${String(ROOM.height)}` }}
          >
            {/* 1. Everything behind the counter. */}
            <AssetView resolution={resolveAsset('zone_front_counter')} />

            {/* The shop's small signs of life, over the rear layer only. */}
            <AmbientLife />

            {/* 2. Tony, standing in the room. */}
            <div
              className="tony-mark absolute z-10"
              style={{
                left: `${((TONY.x / ROOM.width) * 100).toFixed(3)}%`,
                top: `${((TONY.y / ROOM.height) * 100).toFixed(3)}%`,
                width: `${((TONY.width / ROOM.width) * 100).toFixed(3)}%`,
                height: `${((TONY.height / ROOM.height) * 100).toFixed(3)}%`,
              }}
            >
              <TonyAtTheCounter
                slug={greeting?.tonySlug ?? 'character_tony_neutral'}
                mood={greeting?.expression ?? 'neutral'}
              />
            </div>

            {/* 3. The counter front and the floor, drawn over him. */}
            <div
              className="absolute inset-x-0 z-20"
              style={{ top: `${((COUNTER_EDGE / ROOM.height) * 100).toFixed(3)}%` }}
            >
              <AssetView resolution={resolveAsset('zone_counter_front')} />
            </div>

            {/* ---- What is interactive, and why ------------------------- */}

            {/*
              * The display case: the one available Door the artwork contains.
              * Doors are the only kind that advertise, so this is the only
              * thing in the room carrying a persistent outline.
              */}
            <RoomDoor spec={roomObject('collection')} />

            {/*
              * The blank board on the wall. A Display: read in place, no route,
              * no highlight.
              */}
            <RoomDisplay spec={roomObject('tonight')} title="Tonight at Tony's">
              {tonight.length === 0 ? (
                <p className="pb-3 text-[19px] text-ink-500">Nothing on the board.</p>
              ) : (
                <ul className="space-y-3.5 pb-3">
                  {tonight.map((entry) => (
                    <li key={entry.key} className="flex gap-3 text-[19px] leading-[1.45]">
                      <span aria-hidden="true" className="pt-0.5 text-red-dark">
                        —
                      </span>
                      <span>{entry.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </RoomDisplay>

            {/*
              * Tony. A Toy: he answers and leads nowhere, so no outline. His
              * line and its box live in the component with him.
              */}
            <TonyToy spec={roomObject('tony')} greeting={line} />

          </div>

        </main>
      </Arriving>
    </Page>
  );
}

/** A rectangle on the drawing, as the percentages the browser wants. */
function at(x: number, y: number, width: number, height: number) {
  return {
    left: `${((x / ROOM.width) * 100).toFixed(3)}%`,
    top: `${((y / ROOM.height) * 100).toFixed(3)}%`,
    width: `${((width / ROOM.width) * 100).toFixed(3)}%`,
    height: `${((height / ROOM.height) * 100).toFixed(3)}%`,
  };
}

/**
 * Three small signs that the shop is running.
 *
 * Not decoration for its own sake and not new objects — each one is a light
 * that already exists in the drawing, given something to do. They are placed
 * over the rear layer so the counter front still occludes anything that reaches
 * below it, and they are opacity only, so they cost a composite and nothing
 * else. `prefers-reduced-motion` removes all three.
 */
function AmbientLife() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[5]">
      {/* The soda fountain's four lit buttons. */}
      <span
        className="anim-fountain absolute rounded-[1px]"
        style={{
          ...at(36, 231, 30, 9),
          background:
            'linear-gradient(90deg, rgba(216,244,255,0.5), rgba(255,217,138,0.45), rgba(255,138,120,0.45))',
          mixBlendMode: 'screen',
        }}
      />

      {/* A highlight travelling across the warmer's glass. */}
      <span className="absolute overflow-hidden" style={at(186, 241, 68, 24)}>
        <span
          className="anim-sheen absolute inset-y-0 w-1/3 -skew-x-12"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
          }}
        />
      </span>

      {/* One ceiling light that has never warmed up properly. */}
      <span
        className="anim-flicker absolute rounded-full"
        style={{
          ...at(196, 20, 26, 12),
          background: 'radial-gradient(closest-side, rgba(255,217,138,0.75), transparent)',
        }}
      />
    </div>
  );
}
