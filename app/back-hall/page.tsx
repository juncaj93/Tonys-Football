import { BackHallScene } from '@/components/scene/back-hall';
import { RoomDoor } from '@/components/scene/room-object';
import { ShutDoor } from '@/components/scene/shut-door';
import { Page } from '@/components/shell';
import { requireUser } from '@/lib/auth/current-user';
import { BACK_HALL, LOCKED_LINES, backHallObject, openTo } from '@/lib/backhall/objects';
import { featureFlags } from '@/lib/flags';

/**
 * The staff hallway behind the dining room.
 *
 * **One compact screen, two environmental choices, and a door back** — `18 §5`,
 * and it is a place you walk into rather than a page you read.
 *
 * ## What this replaces, and why the replacement is not a restyle
 *
 * It was three stacked `PixelPanel`s with headings: *"Down the stairs"*, *"The
 * curtained door"*, and a return plate underneath. Every one of those is a
 * control with a label, which is *"a menu card"* almost verbatim as `18 §5`
 * describes it when forbidding one, and *"generic web boxes"* as the preserved
 * M1 baseline forbids reintroducing.
 *
 * The distinction that matters is not how it looked. The room's whole grammar is
 * **objects you can guess the destination of before tapping** — that is the test
 * `18` sets for anything earning a route — and a panel titled with its own
 * destination has already given up on it. Stairs going down do not need a
 * heading saying they are stairs.
 *
 * So the hall is now built the way the parlor is: one portrait scene filling the
 * viewport, transparent hit regions over it in room units, nothing scrolling,
 * and the way out is a door in the wall.
 *
 * ## Why this room exists at all
 *
 * Rooms and the Underground are **two taps** from the parlor, the one approved
 * exception to one-tap depth, and it is worth being clear what buys it. The
 * artwork has exactly **one** real rear doorway, so a second homepage door would
 * have to be invented — and a curtained, unmarked door is *odd* in a public
 * dining room and exactly right in a staff hallway. The Back Hall makes the
 * Underground's reveal better rather than merely making it fit.
 *
 * ## Both destinations are shut, and that is the state that got the attention
 *
 * They are **visible and tappable anyway** (`18 §6`): a manager should know the
 * downstairs exists before it opens, and a shut door that answers in-world is a
 * world, while a hidden one is an absent feature. Whether a door is open is a
 * **deploy-time flag** — nobody earns a hallway, and a per-manager unlock would
 * be the progression `16` removes from this product.
 *
 * ## Nothing glows
 *
 * `18 §3`: a Door glows only when it has something to say, and only Doors ever
 * glow. Nothing beyond this hall is open, so nothing here announces itself — and
 * the `glow` gate in `npm run visual:qa` fails a room where anything does.
 */

export const dynamic = 'force-dynamic';

export default async function BackHallPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();

  /*
   * `?open=rooms,underground` — review only, resolved here on the server behind
   * the demo system's own two guards (`lib/flags.ts`). Both destinations are
   * shut for every real manager, and the state nobody will see for a year is the
   * one that has to look right when they do.
   */
  const query = await searchParams;
  const flags = featureFlags(process.env, query['open']);
  const stairs = backHallObject('stairs');
  const curtain = backHallObject('curtain');

  return (
    <Page oneScreen>
      <main
        className="relative flex min-h-0 flex-1 justify-center overflow-hidden"
        // The floor's own colour, so a viewport taller than the hall reads as
        // more corridor rather than as a letterbox. Same treatment as the parlor.
        style={{ backgroundColor: '#1a1214' }}
      >
        <div
          className="relative w-full max-w-[430px] self-start"
          style={{ aspectRatio: `${String(BACK_HALL.width)} / ${String(BACK_HALL.height)}` }}
        >
          <BackHallScene chained={!flags.rooms} />

          {/*
            * The stairs down to the rooms.
            *
            * Open, it is an ordinary Door. Shut, it is the same object with the
            * same markers and a line instead of a destination — so the object
            * map is identical in both states, and shipping the basement changes
            * one element rather than the room.
            */}
          {flags.rooms ? (
            <RoomDoor spec={openTo('stairs')} />
          ) : (
            <ShutDoor spec={stairs} line={LOCKED_LINES.stairs} />
          )}

          {/*
            * The curtained doorway.
            *
            * **`/underground` is not a route in v1, and this must not become a
            * `<Link>` to one.** It was one once: Next prefetched it on hover,
            * every visit to this page logged a 404, nothing rendered wrong, no
            * test failed, and the console gate was the only evidence.
            *
            * So `openTo` **throws** if the flag is turned on before the route
            * exists, rather than rendering a door onto nothing. That is the
            * repository's standing answer to a declared-and-unimplemented state.
            * It also means the *both open* state cannot be photographed yet —
            * recorded in `docs/BACK_HALL_BOUNDARY.md` as a demo the boundary
            * document asked for and the product cannot honestly produce, rather
            * than quietly dropped.
            */}
          {flags.underground ? (
            <RoomDoor spec={openTo('curtain')} />
          ) : (
            <ShutDoor spec={curtain} line={LOCKED_LINES.curtain} />
          )}

          {/* The way back is a door in the world, not the browser's back button. */}
          <RoomDoor spec={backHallObject('return')} />
        </div>
      </main>
    </Page>
  );
}
