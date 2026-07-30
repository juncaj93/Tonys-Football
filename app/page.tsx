import Link from 'next/link';

import { Arriving } from '@/components/scene/arrival';
import { BannerRail } from '@/components/scene/banner-rail';
import { CounterTray } from '@/components/scene/counter-tray';
import { RoomDisplay, RoomDoor } from '@/components/scene/room-object';
import { TonyToy } from '@/components/scene/tony-toy';
import { Page } from '@/components/shell';
import { TonyAtTheCounter } from '@/components/tony';
import { AssetView } from '@/lib/assets/placeholder';
import { resolveAsset } from '@/lib/assets/registry';
import { requireUser } from '@/lib/auth/current-user';
import { listDoorManagers } from '@/lib/auth/service';
import { greetingFor } from '@/lib/content/greeting';
import { ownedBox } from '@/lib/counter/boxes';
import { showcaseFor } from '@/lib/counter/showcase';
import { openSeason, wallet } from '@/lib/counter/tokens';
import { getDb } from '@/lib/db';
import { championBanners } from '@/lib/parlor/champions';
import {
  COUNTER_EDGE,
  ROOM,
  PREDICTION_SLATE,
  TONIGHT_FIELD,
  TONY,
  place,
  roomObject,
} from '@/lib/parlor/objects';
import { seasonClock } from '@/lib/parlor/season';
import { boardFace, tonightBoard } from '@/lib/parlor/tonight';
import { featuredMatchup, matchupLine } from '@/lib/stats/board';
import { loadTags } from '@/lib/tags/repository';

/**
 * Tony's Pizza Parlor.
 *
 * You are standing at the counter, and that is the whole page. The room fills
 * the viewport, Tony is in it, and **the shop is the navigation** — there is no
 * tab bar, because a restaurant with a tab bar screwed along the bottom is an
 * app with a themed background. Nothing here scrolls; what you pick up opens
 * over the room and scrolls on its own.
 *
 * ## The room is one image, cut once
 *
 * `zone_parlor_shell` is a single 320 × 569 drawing. Rows **0–291** are drawn
 * behind Tony and rows **292–568** over him, which is what puts him *in* the
 * shop rather than on a picture of one — and what lets the counter, the tray
 * and the receipt sit in front of his waist.
 *
 * It used to be two assets. That was withdrawn: two independently generated
 * images that must stay pixel-aligned across every regeneration is a defect
 * class, and one drawing cut at a measured line has no seam to drift.
 *
 * ## What is interactive, and why
 *
 * `lib/parlor/objects.ts` is the map: **3 Doors, 4 Displays, 1 Toy.** An object
 * is interactive because a manager can guess where it goes before tapping it,
 * not because it is painted well. Booths, posters and the oven are scenery and
 * are not in the markup at all.
 *
 * **Only Doors glow, and only when they have something to say.** The board, the
 * sign, the receipt, the empty tray and the doorway are baked into the shell, so
 * they have no alpha to derive a glow from — which is correct rather than a
 * limitation: Displays never glow by rule.
 *
 * The tray is the one that changed. When a manager owns an unopened box there is
 * a **box overlay** on the tray, and an overlay has its own alpha — so the tray
 * Door glows, for the first time, because it finally has something to say. The
 * doorway still does not, because nothing beyond it is open yet.
 *
 * The box is a **state of the tray**, not a ninth object. Tapping it opens it
 * where it sits (`18 §4.1`); tapping an empty tray still goes to `/counter`.
 */

// The greeting is chosen per manager and logged on the first visit of each day,
// so this page is never static and never cached.
export const dynamic = 'force-dynamic';

/** The fraction of the room that sits behind Tony. */
const CUT = COUNTER_EDGE / ROOM.height;

export default async function ParlorPage() {
  const { user } = await requireUser();
  const db = getDb();
  const clock = seasonClock();

  const [tags, managers, tonight, banners, box, season, featured] = await Promise.all([
    loadTags(db),
    listDoorManagers(db),
    tonightBoard(db),
    championBanners(db),
    ownedBox(db, user.id),
    openSeason(db),
    // A Stats fact, or null. The board renders it or renders nothing — it never
    // derives one (`PRODUCT_DELIVERY_MANDATE.md §9`).
    featuredMatchup(db),
  ]);

  // Null when this manager holds no seat this season — a co-owner, or somebody not
  // seated yet. A zero would make "no tab" and "spent everything" look the same.
  const purse =
    season === null ? null : await wallet(db, { userId: user.id, seasonId: season.id });

  // What the league can see of them, so the room reflects the Showcase choice.
  const shown = await showcaseFor(db, user.id);

  const greeting = await greetingFor(db, {
    userId: user.id,
    displayName: user.displayName,
    tags: tags.get(user.id) ?? new Set<string>(),
    leagueTags: managers.map((manager) => tags.get(manager.id) ?? new Set<string>()),
    daysUntilKickoff: clock.daysUntilKickoff,
  });

  const line = greeting?.text ?? `Tony nods at ${user.displayName} and goes back to the oven.`;
  /*
   * The board's face: a hero and at most one short fact.
   *
   * In the offseason the detail is the countdown — a verified clock value. Once
   * the season is under way it is the matchup, and that matchup arrives as a
   * **typed Stats fact** (`lib/stats/facts.ts`) rather than as anything this
   * component worked out. Two names and nothing else: the intensity and the
   * margin travel with the fact to surfaces that have room to state them, and a
   * loaded word on the largest object in the room without its evidence is the
   * thing `PRODUCT_DELIVERY_MANDATE.md §9` forbids.
   *
   * Null stays null. An absent fact leaves the detail empty rather than
   * inventing prose.
   */
  const face = boardFace({
    daysUntilKickoff: clock.daysUntilKickoff,
    matchup: matchupLine(featured),
  });
  const shell = resolveAsset('zone_parlor_shell');

  return (
    <Page oneScreen>
      <Arriving>
        {/*
          * The utility bar. Deliberately the smallest thing on the screen:
          * **who you are, and nothing else.** The "what's open?" control that
          * used to live here is gone — `18 §7` makes that assist optional and
          * off by default rather than persistent chrome, and it was also where
          * the visible rectangles around room objects came from.
          *
          * The countdown that sat on the left is gone too. Once the board
          * started saying `WEEK ONE / 42 days out` in 20px type, the bar was
          * printing the same fact a second time in 9px, a few hundred pixels
          * above it — the "same thing rendered twice" reviewer gate, and the
          * chrome losing the comparison badly. The room says when it is; the
          * Tonight panel behind the board still carries it in prose, which is
          * where a screen reader gets it.
          */}
        {/*
          * Over the room, not above it.
          *
          * The bar carries the safe-area inset itself now that `Page` has
          * stopped padding the whole screen, and a short scrim under it keeps
          * the iOS clock and battery legible where they cross the ceiling.
          * `pointer-events-none` on the strip with the link opting back in, so
          * the top of the room stays tappable everywhere the name is not.
          */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-40 h-24 bg-gradient-to-b from-ink-900/85 via-ink-900/45 to-transparent"
        />
        <header
          className="pointer-events-none absolute inset-x-0 top-0 z-40 flex h-11 items-center justify-end gap-1 pr-1 pl-3"
          style={{ marginTop: 'env(safe-area-inset-top)' }}
        >
          <Link
            href="/profile"
            className="pointer-events-auto flex h-11 min-w-[44px] items-center justify-end truncate px-3 font-display text-[13px] tracking-[0.08em] whitespace-nowrap text-paper-white/90 uppercase"
          >
            {user.displayName}
          </Link>
        </header>

        {/* ---- The parlor ------------------------------------------------- */}
        <main
          className="relative flex min-h-0 flex-1 justify-center overflow-hidden"
          // The carpet's own colour, measured off the bottom of the shell, so a
          // viewport taller than the room reads as more floor rather than as a
          // letterbox. This was `#3b2050` — `violet-deep`, the exact colour the
          // Euclidean quantizer fix drove to 0% in the art. The page had been
          // hardcoding the old bug's output.
          style={{ backgroundColor: '#4A2E1C' }}
        >
          <div
            className="relative w-full max-w-[430px] self-start"
            style={{ aspectRatio: `${String(ROOM.width)} / ${String(ROOM.height)}` }}
          >
            {/* 1. The room behind Tony — the shell's rows 0-291. */}
            <div
              className="absolute inset-x-0 top-0 overflow-hidden"
              style={{ height: `${(CUT * 100).toFixed(3)}%` }}
            >
              <AssetView resolution={shell} />
            </div>

            {/* The newspaper rack, standing in the left alcove. */}
            <div className="absolute z-[6]" style={place([10, 224, 38, 38])}>
              <AssetView resolution={resolveAsset('object_newspaper_rack')} />
            </div>

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

            {/*
              * 3. The counter and the floor, drawn over him.
              *
              * The same image, pulled up by the cut so its lower half lands
              * exactly where it was painted. One drawing, so there is no seam
              * to misalign.
              */}
            <div
              className="absolute inset-x-0 bottom-0 z-20 overflow-hidden"
              style={{ height: `${((1 - CUT) * 100).toFixed(3)}%` }}
            >
              <div
                className="absolute inset-x-0 top-0"
                style={{ transform: `translateY(-${(CUT * 100).toFixed(3)}%)` }}
              >
                <AssetView resolution={shell} />
              </div>
            </div>

            {/* ---- The eight -------------------------------------------- */}

            {/* Doors. */}
            <RoomDoor spec={roomObject('slice')} />

            {/*
              * The tray.
              *
              * Still one Door and still the same hit region. What changes is
              * what a tap does: with nothing on the tray it goes to `/counter`
              * to browse, and with a box on it **the box opens here, in place**
              * (`18 §4.1`). Routing to `/counter` first would put a navigation
              * step inside the most exciting moment in the product, which is
              * the exact failure the ruling names.
              *
              * The box is a *state of the tray*, not a ninth object — the
              * homepage stays 3 Doors · 4 Displays · 1 Toy.
              */}
            <CounterTray
              spec={roomObject('counter')}
              ownedBoxId={box?.id ?? null}
              boxAsset={resolveAsset('object_box_owned')}
            />

            <RoomDoor spec={roomObject('back-hall')} />

            {/*
              * The board's own face.
              *
              * **A hero and one short fact, centred.** Commissioner ruling,
              * 2026-07-30: the board was not clear — too small, too many words,
              * and colliding with the painted frame. It had been carrying a state
              * line *plus a full sentence* at 8px and 9px, duplicating badly what
              * the panel behind it already says in full.
              *
              * So: `WEEK ONE` at 20px in the board's own red, one short line under
              * it, and nothing else. `TONIGHT_FIELD` is now inset six units inside
              * the cream so neither line touches the frame.
              *
              * `aria-hidden` because the button beneath carries the label and the
              * panel carries the prose; a screen reader should not hear the
              * headline twice on the way to the same place.
              */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute flex flex-col items-center justify-center overflow-hidden text-center"
              style={place(TONIGHT_FIELD)}
            >
              <p className="board-paint font-display text-[21px] leading-[1.1] tracking-[0.02em] text-red-dark uppercase">
                {face.hero}
              </p>
              {face.detail !== null && (
                <p className="board-paint mt-1.5 text-[16px] leading-[1.25] text-wood-dark">
                  {face.detail}
                </p>
              )}
            </div>

            {/*
              * The prediction sign's slate, wiped.
              *
              * Trigger-only, so there is no prediction printed here — but baked
              * dark and rendering nothing it was the only object in the room
              * that read as *unloaded* rather than as quiet. Everything else
              * that is empty here is visibly empty on purpose.
              *
              * Two faint chalk strokes: the residue of something erased. No
              * invented prediction, no fake data, no label — just a board that
              * has been used and is currently clean.
              */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute flex flex-col justify-center gap-[8%] overflow-hidden px-[14%]"
              style={place(PREDICTION_SLATE)}
            >
              <span className="h-[2px] w-full bg-paper-white/12" />
              <span className="h-[2px] w-[62%] bg-paper-white/10" />
            </div>

            {/* Displays. */}
            <RoomDisplay spec={roomObject('tonight')} title="Tonight at Tony's">
              {tonight.length === 0 ? (
                <p className="pb-1 text-[17px] leading-[1.5] text-ink-700">Nothing on the board.</p>
              ) : (
                <ul className="space-y-3 pb-1">
                  {tonight.map((entry) => (
                    <li key={entry.key} className="flex gap-2.5 text-[17px] leading-[1.5]">
                      <span aria-hidden="true" className="pt-0.5 text-red-dark">
                        —
                      </span>
                      <span>{entry.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </RoomDisplay>

            <BannerRail banners={banners} />

            <RoomDisplay spec={roomObject('prediction')} title="Tony's prediction">
              <p className="pb-1 text-[17px] leading-[1.5] text-ink-700">
                Tony hasn&rsquo;t called this one yet. He writes it up on Tuesday, with the
                paper.
              </p>
            </RoomDisplay>

            {/*
              * The receipt: the manager's own record.
              *
              * The token balance belongs here rather than in the utility bar. The
              * homepage has exactly eight interactive objects (`18 §3`) and a
              * balance readout bolted to the chrome is the first step toward the
              * dashboard `16 §1` names as the failure mode — while "what have I
              * got" is precisely what a receipt answers.
              */}
            <RoomDisplay spec={roomObject('receipt')} title="Your record">
              <p className="text-[19px] leading-[1.45] text-ink-700">{user.displayName}</p>
              {purse !== null && (
                <p className="mt-2 text-[17px] leading-[1.45] text-ink-700">
                  {String(purse.balance)} Tony Tokens on your tab this season.
                </p>
              )}
              {/*
                * What the league can see of you.
                *
                * Milestone item 10 — returning to the parlor reflects the result.
                * The tray already does that for a box; this does it for the choice
                * made at the Showcase, and it belongs on the receipt because the
                * receipt is the manager's own record of themselves.
                */}
              {shown !== null && (
                <p className="mt-2 text-[17px] leading-[1.45] text-ink-700">
                  {shown.name} is out in the showcase.
                </p>
              )}
              {shown === null && (
                <p className="mt-2 text-[17px] leading-[1.45] text-ink-700/85">
                  Nothing of yours is out in the showcase.
                </p>
              )}
              <p className="pb-3" />
            </RoomDisplay>

            {/* The Toy. */}
            <TonyToy spec={roomObject('tony')} greeting={line} />
          </div>
        </main>
      </Arriving>
    </Page>
  );
}

/**
 * Three small signs that the shop is running.
 *
 * Each one is **a light that already exists in the drawing**, given something
 * to do — not decoration invented on top of the art.
 *
 * These were **re-measured against `zone_parlor_shell`**, not carried over. The
 * previous coordinates were read off the old two-tile room, and on this shell
 * they landed on a wooden pillar, a patch of shadow, and bare ceiling between
 * fixtures. Nothing would have errored and no test would have failed — a
 * cyan-white gradient bar would simply have glowed on a pillar until somebody
 * noticed. The positions below are the measured extents of the brightest pixels
 * in the image: the ceiling fixtures at `y 16`, and the pendant lamp over the
 * booths at `(278, 155)`.
 *
 * Opacity only, so they cost a composite and nothing else, and
 * `prefers-reduced-motion` removes all three.
 */
function AmbientLife() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[5]">
      {/* The ceiling fixture on the left, which has never warmed up properly. */}
      <span
        className="anim-flicker absolute rounded-full"
        style={{
          ...place([53, 12, 19, 11]),
          background: 'radial-gradient(closest-side, rgba(255,217,138,0.55), transparent)',
        }}
      />

      {/* Its twin on the right, steady. */}
      <span
        className="anim-fountain absolute rounded-full"
        style={{
          ...place([178, 12, 17, 11]),
          background: 'radial-gradient(closest-side, rgba(255,217,138,0.4), transparent)',
        }}
      />

      {/* The pendant lamp hanging over the booths. */}
      <span
        className="anim-sheen absolute rounded-full"
        style={{
          ...place([270, 147, 18, 18]),
          background: 'radial-gradient(closest-side, rgba(255,217,138,0.42), transparent)',
        }}
      />
    </div>
  );
}
