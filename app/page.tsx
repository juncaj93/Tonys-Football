import Link from 'next/link';

import { Arriving } from '@/components/scene/arrival';
import { RoomStage } from '@/components/scene/room-stage';
import { BannerRail } from '@/components/scene/banner-rail';
import { CounterTray } from '@/components/scene/counter-tray';
import { RoomDisplay, RoomDoor } from '@/components/scene/room-object';
import { TonyToy } from '@/components/scene/tony-toy';
import { Page } from '@/components/shell';
import { TonyAtTheCounter } from '@/components/tony';
import { TYPE } from '@/lib/design/type';
import { AssetView } from '@/lib/assets/placeholder';
import { resolveAsset } from '@/lib/assets/registry';
import { requireUser } from '@/lib/auth/current-user';
import { listDoorManagers } from '@/lib/auth/service';
import { greetingFor } from '@/lib/content/greeting';
import { statsAsideFor } from '@/lib/parlor/aside';
import { latestPacket, mostRecentChampion } from '@/lib/slice/edition';
import { ownedBox } from '@/lib/counter/boxes';
import { showcaseFor } from '@/lib/counter/showcase';
import { openSeason, wallet } from '@/lib/counter/tokens';
import { getDb } from '@/lib/db';
import { championBanners } from '@/lib/parlor/champions';
import {
  COUNTER_EDGE,
  ROOM,
  PREDICTION_SLATE,
  TONIGHT_CREAM,
  TONIGHT_FIELD,
  TONY,
  place,
  roomObject,
} from '@/lib/parlor/objects';
import { seasonClock } from '@/lib/parlor/season';
import { momentTags } from '@/lib/parlor/moment';
import { boardFace, tonightBoard } from '@/lib/parlor/tonight';
import { previewReveal } from '@/lib/demo/preview';
import { featureFlags } from '@/lib/flags';
import { exteriorLight } from '@/lib/world/light';
import { BoardPanel, ChalkSlate } from '@/components/scene/chalkboard';
import { chalkboardFor } from '@/lib/stakes/chalkboard';
import { previewBoard } from '@/lib/stakes/boards';
import {
  currentMatchupLine,
  featuredCurrentMatchup,
  featuredMatchup,
  matchupLine,
} from '@/lib/stats/board';
import { currentWeekOf } from '@/lib/stats/week';
import { currentSeasonYear } from '@/lib/league/membership';
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

/**
 * The board's face during the season.
 *
 * Two reads and one preference, kept out of the page body because the ordering
 * *is* the rule: the current season's featured matchup first, and the archived
 * fact only as the thing that is allowed to be there when no season is being
 * announced. In season the second is always null — `matchupLine` refuses a fact
 * from another season — so it is kept in the chain as the guard rather than as a
 * fallback anybody expects to fire.
 */
async function inSeasonFace(
  db: ReturnType<typeof getDb>,
  boardYear: number | null,
  featured: Awaited<ReturnType<typeof featuredMatchup>>,
) {
  const week = await currentWeekOf(db, boardYear ?? 0);
  const current =
    boardYear === null
      ? null
      : currentMatchupLine(await featuredCurrentMatchup(db, { season: boardYear, week }));

  return boardFace({
    daysUntilKickoff: null,
    week,
    matchup: current ?? matchupLine(featured, { season: boardYear }),
  });
}

export default async function ParlorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await requireUser();
  const db = getDb();
  const clock = seasonClock();

  const [tags, managers, tonight, banners, box, season, featured, boardYear] = await Promise.all([
    loadTags(db),
    listDoorManagers(db),
    tonightBoard(db),
    championBanners(db),
    ownedBox(db, user.id),
    openSeason(db),
    // A Stats fact, or null. The board renders it or renders nothing — it never
    // derives one (`PRODUCT_DELIVERY_MANDATE.md §9`).
    featuredMatchup(db),
    /*
     * The season the board is about — the newest on record, not the open one.
     *
     * They differ in January: `openSeason` goes null the moment the books shut,
     * while the room still has to name a season. Reading the newest keeps the
     * face answerable in every state.
     */
    currentSeasonYear(db),
  ]);

  // Null when this manager holds no seat this season — a co-owner, or somebody not
  // seated yet. A zero would make "no tab" and "spent everything" look the same.
  const purse =
    season === null ? null : await wallet(db, { userId: user.id, seasonId: season.id });

  // What the league can see of them, so the room reflects the Showcase choice.
  const shown = await showcaseFor(db, user.id);

  /*
   * `?preview_reveal=legendary&preview_stage=first` — review only, and null
   * everywhere it matters.
   *
   * The reveal's rarity treatment is otherwise unphotographable on purpose: the
   * roll happens inside `openBox` and no harness can choose it. The same is true
   * of *where in the loop* the pull happened, which is what decides the plate's
   * last two lines. `MANDATE §8` names preview-only query parameters as a
   * sanctioned demo mechanism; the two guards in `lib/demo/guard.ts` are
   * evaluated here, on the server, so this cannot be turned on from a URL bar in
   * production.
   */
  const query = await searchParams;
  const preview = previewReveal(query['preview_reveal'], process.env, query['preview_stage']);

  /*
   * What is written on the small sign.
   *
   * `18 §3.4` gives it two things and only two: the weekly prediction, and
   * Tony's Line once its flag is open. The flag is read **here, on the server**
   * — `?open=tonysLine` is resolved behind the demo system's own two guards and
   * is inert in production, exactly as the Back Hall's is — because a market
   * gate a browser could flip is not a gate.
   *
   * Today this is the quiet board, and that is correct rather than unfinished:
   * the 2026 season has no games, so nothing has been authored, so there is
   * nothing to write up.
   */
  const previewed = await previewBoard(db, query['board'], process.env);
  const board =
    previewed?.board ??
    (await chalkboardFor(db, {
      userId: user.id,
      flags: featureFlags(process.env, query['open']),
    }));

  /*
   * Standing tags plus what is true right now.
   *
   * `loadTags` answers "what is true of this person across seasons". A box
   * sitting shut on the counter is a different kind of fact — it is true this
   * second and false the moment they tap it — so it is derived per request from
   * server state (`lib/parlor/moment.ts`), never from anything the client said.
   *
   * They are merged into the *viewer's* set only. `leagueTags` below stays
   * history, which is what makes a moment line the most pointed thing Tony can
   * say: nobody else in the room is being handed their first box at this
   * instant, so its audience is zero and the existing smallest-audience rule
   * picks it over every standing line.
   */
  const moment = await momentTags(db, user.id);
  const standing = tags.get(user.id) ?? new Set<string>();

  const greeting = await greetingFor(db, {
    userId: user.id,
    displayName: user.displayName,
    tags: new Set([...standing, ...moment]),
    leagueTags: managers.map((manager) => tags.get(manager.id) ?? new Set<string>()),
    daysUntilKickoff: clock.daysUntilKickoff,
  });

  /*
   * Occasionally, Tony mentions a result instead.
   *
   * The greeting is the default and stays the default — `17 §3`'s acceptance
   * criterion is *one verified thing about you*, and a counter that opened with
   * league trivia every day would have quietly stopped meeting it. The aside has
   * a fortnight-long cooldown, refuses outright while a moment is in play, and
   * refuses again if the Slice's validator will not pass the sentence
   * (`lib/parlor/aside.ts`). Null is the usual answer.
   */
  const aside = await statsAsideFor(db, {
    userId: user.id,
    packet: await latestPacket(db),
    momentTags: moment,
    champion: await mostRecentChampion(db),
  });

  const spoken = aside ?? greeting;
  const line = spoken?.text ?? `Tony nods at ${user.displayName} and goes back to the oven.`;
  /*
   * The board's face: a hero and at most one short fact, in the two states it
   * actually has.
   *
   * In the offseason the detail is the countdown — a verified clock value. Once
   * the season is under way it is the matchup, and that matchup arrives as a
   * **typed Stats fact** (`lib/stats/facts.ts`) rather than as anything this
   * component worked out. Two names and nothing else: the intensity and the
   * margin travel with the fact to surfaces that have room to state them, and a
   * loaded word on the largest object in the room without its evidence is the
   * thing `PRODUCT_DELIVERY_MANDATE.md §9` forbids. Null stays null — an absent
   * fact leaves the detail empty rather than inventing prose.
   *
   * This used to be one call that omitted `week`, and `boardFace` defaulted a
   * missing week to `WEEK ONE` — so from the opening Sunday to January the
   * largest object in the room would have said week one, every week. It is
   * invisible in week one, where the wrong answer and the right one are the same
   * string; the midseason rehearsal is what made it visible
   * (`docs/WEEK8_REHEARSAL.md`). `BoardFaceInput` is now two shapes so a caller
   * that does not know the week cannot compile, which is the half of the fix
   * that survives the next person editing this file.
   *
   * `currentWeekOf` counts forward from **closed** weeks. Nothing here infers an
   * NFL schedule, because the product does not have one.
   *
   * The matchup is filtered by the season the hero names. `featuredMatchup`
   * returns the strongest fact from the most recent *archived* season, and two
   * bare names under `WEEK 9` are a claim about week 9 — true fact, false claim.
   * `matchupLine` is where that boundary lives; null here is ordinary, and the
   * panel behind the board still carries the whole fact with its season on it.
   */
  const face =
    clock.daysUntilKickoff !== null
      ? boardFace({ daysUntilKickoff: clock.daysUntilKickoff })
      : await inSeasonFace(db, boardYear, featured);
  const shell = resolveAsset('zone_parlor_shell');
  const light = exteriorLight();

  return (
    <Page oneScreen>
      {/*
        * Two providers, two different jobs, and neither renders an element.
        *
        * `Arriving` owns the room's **timeline** — the entrance, the reveal, and
        * whether Tony is mid-sentence. `RoomStage` owns its **transient
        * surfaces** — which one panel is up, and the rule that only one ever is
        * (`MANDATE §6`). Keeping them apart is what stops either becoming the
        * room's junk drawer: a schedule and an arbiter answer different
        * questions, and a component usually wants exactly one of them.
        *
        * Neither emits DOM, so the served HTML and the hydrated tree are the
        * same tree with or without them.
        */}
      <Arriving>
        <RoomStage>
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
            className={`pointer-events-auto flex h-11 min-w-[44px] items-center justify-end truncate px-3 ${TYPE.eyebrow} whitespace-nowrap text-paper-white/90`}
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
            className={`world-light world-light--${light} relative w-full max-w-[430px] self-start`}
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

            <ParlorWindows />
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
                mood={spoken?.expression ?? 'neutral'}
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
              // The stationary thing Tony is measured against.
              //
              // `visual-qa.mts`'s steadiness gate samples the *distance* from
              // Tony to this layer every animation frame rather than his
              // viewport position, so a page that scrolls a pixel does not read
              // as a sprite that moved. The invariant it protects is exactly
              // this pair: **nothing may move Tony relative to the counter that
              // cuts him.**
              data-room-layer="counter-front"
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
              previewReveal={preview}
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
              *
              * ## The painted outline is gone, with the ground that needed it
              *
              * Both lines wore `board-paint` — one hard pixel of `amber-glow` on
              * all four sides — because the board's face was a **dithered amber
              * vignette** and dark-red letters kept landing half on `#FFD98A` and
              * half on `#F2A94B`. That vignette was quantization damage: the
              * shared 32 had three amber values to spend on a smooth gradient.
              * The `zone` family palette carries the painting's own cream, so
              * the face is an even light ground again — mean luma 197 of 255
              * with a 5th percentile of 186, pinned by
              * `scripts/shell-surfaces.test.ts` — and the outline has nothing
              * left to do. Keeping it would put a pale halo around dark text on
              * near-white, which is the *"noisy background competing with
              * text"* the direction bans, arriving from the fix rather than
              * from the art.
              *
              * `red-dark` on the face's dominant cream measures 5.60:1 and on
              * its darker end 4.88:1; `wood-dark` measures 7.70:1 and 6.71:1.
              * All four clear AA, and the *worst* of them is what
              * `scripts/shell-surfaces.test.ts` asserts — because the face is a
              * gradient now, so an average would not be the question. Neither
              * ink needs help.
              */}
            {/*
              * The paper, drawn rather than photographed.
              *
              * The board's face is baked into `zone_parlor_shell`, and what was
              * baked is the defect: an amber, mottled ground with a dark
              * vignette pulled in from every edge — commissioner, 2026-08-08,
              * *"burnt / distressed-looking perimeter"*. It is amber rather than
              * cream because the shell was quantized against a palette that had
              * three creams and spent 27.3% of the room on lamp glow; the
              * `zone`-family palette fixed the walls but the board kept the
              * vignette, which is painted into the source art rather than
              * introduced by the pipeline.
              *
              * **So this covers it instead of repainting the shell.** Repainting
              * would mean editing an approved asset to fix one rectangle inside
              * it, and every other object on that sheet is correct. An opaque
              * cream rectangle over `TONIGHT_CREAM` — the *measured* extent of
              * the paper, where the cream stops and the painted frame begins —
              * replaces exactly the surface that is wrong and touches nothing
              * else. The warm wooden frame around it is baked, untouched, and
              * wanted.
              *
              * `inset-shadow` rather than a border: the paper should sit *in*
              * the frame with a hairline of shade where they meet, which is what
              * a mounted board does. A border would draw a second frame line
              * beside the painted one, which is the nested-frame look the
              * direction bans.
              */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bg-paper-white shadow-[inset_0_0_0_1px_rgba(74,46,28,0.28)]"
              style={place(TONIGHT_CREAM)}
            >
              {/*
                * The one red rule that runs all the way round.
                *
                * A printed sign has a keyline; it is what separates *paper with
                * words on it* from *a printed thing*. One, though — the old
                * board carried a painted outline **and** a frame line **and** a
                * vignette, and the direction bans nested frames precisely
                * because at 130px wide they stop reading as separate lines and
                * start reading as a dirty edge.
                *
                * Inset 3px rather than a unit count: it wants to be a hairline
                * at every width, and a unit-derived inset would scale with the
                * board and stop being one. `border` gives a true rectangle with
                * a gap of cream outside it, which an inset box-shadow cannot.
                */}
              <div className="absolute inset-[3px] border border-red-dark/50" />
            </div>

            {/*
              * The words, and one red rule.
              *
              * Three things and no fourth: a headline, a separator, a fact. The
              * direction is explicit that nothing else earns a place here — no
              * ornament, no plaque, no season label — and the board has been the
              * room's most over-decorated object twice already.
              *
              * The red rule is `border-t` on the detail rather than its own
              * element, so it cannot exist when there is nothing under it. A
              * separator floating above empty paper is the tell of a board that
              * was designed with the offseason string in it and never seen in
              * any other state.
              *
              * `justify-center` with the rule between them keeps the composition
              * optically centred whether the detail is present or not, which is
              * the difference between an idle board and an unloaded one.
              */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute flex flex-col items-center justify-center overflow-hidden text-center"
              style={place(TONIGHT_FIELD)}
            >
              <p className={`${TYPE.boardHero} text-red-dark`}>{face.hero}</p>
              {face.detail !== null && (
                <p
                  className={`mt-[7px] w-full border-t border-red-dark/65 pt-[6px] ${TYPE.boardDetail} text-wood-dark`}
                >
                  {face.detail}
                </p>
              )}
            </div>

            {/*
              * The prediction sign's slate.
              *
              * Trigger-only, so no sentence is printed here — the slate is 37
              * units wide and `objects.ts` measured that a prediction does not
              * fit on it at any size worth reading. What it carries is the
              * board's **state**, drawn as chalk marks rather than as text:
              * wiped when there is nothing, written when there is, struck
              * through once the answer is in.
              *
              * That is the difference between an object that looks quiet and
              * one that looks unloaded, which is why the wiped treatment was
              * introduced — and it is now the honest version of it, because the
              * board can actually have something on it.
              *
              * It brightens; it never glows. `18 §3`: only Doors glow.
              */}
            <div className="absolute" style={place(PREDICTION_SLATE)}>
              <ChalkSlate board={board} />
            </div>

            {/* Displays. */}
            <RoomDisplay spec={roomObject('tonight')} title="Tonight at Tony's">
              {tonight.length === 0 ? (
                <p className={`pb-1 ${TYPE.body} text-ink-700`}>Nothing on the board.</p>
              ) : (
                <ul className="space-y-3 pb-1">
                  {tonight.map((entry) => (
                    <li key={entry.key} className={`flex gap-2.5 ${TYPE.body}`}>
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
              <BoardPanel board={board} />
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
              <p className={`${TYPE.bodyLead} text-ink-700`}>{user.displayName}</p>
              {purse !== null && (
                <p className={`mt-2 ${TYPE.bodyCompact} text-ink-700`}>
                  {String(purse.balance)} Tony Tokens on your tab this season.
                </p>
              )}
              {/*
                * No seat this season — a co-owner, or somebody who played a
                * previous year and is not in this one.
                *
                * The balance line simply vanished before, which reads as a
                * component that failed rather than as a fact about them.
                * `VISUAL_ACCEPTANCE.md §4`: everything empty in this room has to
                * be *visibly* empty on purpose. And the second sentence is the
                * one that matters — `CLAUDE.md` keeps collectibles permanent
                * while tokens reset, so their shelf is untouched and the receipt
                * should say so rather than leaving them to wonder.
                */}
              {purse === null && (
                <p className={`mt-2 ${TYPE.bodyCompact} text-ink-700`}>
                  No tab this season. What you collected is still on your shelf.
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
                <p className={`mt-2 ${TYPE.bodyCompact} text-ink-700`}>
                  {shown.name} is out in the showcase.
                </p>
              )}
              {shown === null && (
                <p className={`mt-2 ${TYPE.bodyCompact} text-ink-700/85`}>
                  Nothing of yours is out in the showcase.
                </p>
              )}
              <p className="pb-3" />
            </RoomDisplay>

            {/* The Toy. */}
            <TonyToy spec={roomObject('tony')} greeting={line} />
          </div>
        </main>
        </RoomStage>
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
        className="ambient-tick ambient-tick--quiet absolute rounded-full"
        style={{
          ...place([53, 12, 19, 11]),
          background: 'radial-gradient(closest-side, rgba(255,217,138,0.55), transparent)',
        }}
      />

      {/* Its twin on the right, steady. */}
      <span
        className="ambient-tick ambient-tick--warm absolute rounded-full"
        style={{
          ...place([178, 12, 17, 11]),
          background: 'radial-gradient(closest-side, rgba(255,217,138,0.4), transparent)',
        }}
      />

      {/* The pendant lamp hanging over the booths. */}
      <span
        className="ambient-tick ambient-tick--pendant absolute rounded-full"
        style={{
          ...place([270, 147, 18, 18]),
          background: 'radial-gradient(closest-side, rgba(255,217,138,0.42), transparent)',
        }}
      />
    </div>
  );
}

/** The two painted booth windows: glass changes, never the room behind it. */
function ParlorWindows() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[4]">
      <span className="world-window parlor-window" style={place([264, 148, 16, 59])}>
        <span className="world-star world-star--a" />
        <span className="world-star world-star--b" />
      </span>
      <span className="world-window parlor-window" style={place([300, 148, 16, 59])}>
        <span className="world-star world-star--c" />
        <span className="world-star world-star--d" />
      </span>
    </div>
  );
}
