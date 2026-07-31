import { BACK_HALL, backHallObject } from '@/lib/backhall/objects';
import { place } from '@/lib/parlor/objects';

/**
 * The back hall, drawn.
 *
 * ## Why this is geometry rather than a taped-up sign
 *
 * `zone_back_hall_shell` and its four overlays are placeholders, and the
 * previous reasoning — *"building the scene against placeholders means building
 * it twice"* — is why this route spent a milestone as three stacked panels. The
 * commissioner's ruling of 2026-07-31 ends that: *"do not block all Back Hall
 * development on final art… use deliberate in-world placeholder architecture."*
 *
 * M3 had already shown what that means. Its twenty character slugs are all
 * placeholders, and six of them composited to six identical taped-up signs —
 * *nothing changed when you changed your hair*. Replacing the sign with flat
 * rectangles at the right size made the surface reviewable a year before the art
 * exists. The same argument holds here, and more strongly: a hallway that is a
 * list of three cards cannot be reviewed as a hallway at all.
 *
 * So this is **flat rectangles in palette colours**, the precedent the pizza box
 * and the collectible set. It is meant to read as *a shop whose props are
 * simple*, never as finished art — `MANDATE`'s slot rules forbid *"polished
 * temporary art that may accidentally become canonical"* as firmly as they
 * forbid a broken-image box. No gradients, no rendering, no detail that could be
 * mistaken for a decision about what this hallway looks like.
 *
 * ## It draws from the same numbers the hit regions use
 *
 * Every object below is positioned with `place()` on the rectangle in
 * `lib/backhall/objects.ts`. There is no second copy of the layout, so the
 * thing a manager sees and the thing a tap lands on cannot drift — which is the
 * failure mode `objects.ts` describes for authored polygons, arrived at here for
 * a different reason.
 *
 * When real art lands, this file is deleted and the overlays become
 * `AssetView`s. Nothing else changes: the coordinates, the flags, the locked
 * lines and the gates are all outside it.
 */

/** Where the floor meets the back wall. */
const HORIZON = 380;
/** The dado rail, and the top of the wood panelling. */
const DADO = 250;

export function BackHallScene({ chained = true }: { chained?: boolean }) {
  const stairs = backHallObject('stairs').rect;
  const door = backHallObject('return').rect;
  const curtain = backHallObject('curtain').rect;

  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      {/* Wall above the dado, panelling below it. The shop's own two materials. */}
      <div
        className="absolute inset-x-0 top-0 bg-ink-700"
        style={{ height: `${((DADO / BACK_HALL.height) * 100).toFixed(3)}%` }}
      />
      <div
        className="absolute inset-x-0 bg-wood-dark"
        style={{
          top: `${((DADO / BACK_HALL.height) * 100).toFixed(3)}%`,
          height: `${(((HORIZON - DADO) / BACK_HALL.height) * 100).toFixed(3)}%`,
        }}
      />
      {/* The dado rail and the skirting. One hard line each, as every edge here is. */}
      <span className="absolute bg-wood-mid" style={place([0, 248, 320, 4])} />
      <span className="absolute bg-wood-mid" style={place([0, 372, 320, 4])} />

      {/*
        * The floor.
        *
        * Darker than the parlor's checkerboard and not checkered — this is the
        * side of the building nobody is meant to see, and the two rooms must not
        * read as the same room with the lights off. Three boards, so it is a
        * floor rather than a void.
        */}
      <div
        className="absolute inset-x-0 bottom-0 bg-ink-900"
        style={{ height: `${(((BACK_HALL.height - HORIZON) / BACK_HALL.height) * 100).toFixed(3)}%` }}
      />
      <span className="absolute bg-ink-700/60" style={place([0, 424, 320, 2])} />
      <span className="absolute bg-ink-700/45" style={place([0, 486, 320, 2])} />
      <span className="absolute bg-ink-700/30" style={place([0, 552, 320, 2])} />

      {/*
        * The one light, hung over the middle of the hall.
        *
        * A single fixture rather than the parlor's warm ceiling: it is what makes
        * the stairwell dark and the curtain darker, and it is the reason the
        * return door is the brightest thing here — the correct hierarchy for a
        * corridor whose two destinations are shut.
        */}
      <span className="absolute bg-ink-500" style={place([158, 0, 4, 26])} />
      <span className="absolute bg-wood-light" style={place([144, 26, 32, 8])} />
      <span
        className="absolute rounded-full"
        style={{
          ...place([116, 30, 88, 54]),
          background: 'radial-gradient(closest-side, rgba(255,217,138,0.42), transparent)',
        }}
      />

      {/* ---- What the hall is used for -------------------------------- */}
      {/*
        * Scenery, and named as such. `18` is explicit that most of a room is
        * scenery permanently: these say the hall is used for something, and none
        * of them is in the object map because nobody could guess where a crate
        * goes.
        *
        * **They were on the floor first, and the rail cut straight through
        * them.** A crate standing where the stairwell's handrail runs reads as a
        * box behind a fence, which is a worse sentence than the room was trying
        * to say. So the storage went onto the wall, above the stairs, where it is
        * the left wall's whole job and collides with nothing.
        */}
      <span className="absolute bg-wood-mid" style={place([8, 296, 104, 5])} />
      <span className="absolute border-2 border-ink-900 bg-wood-mid" style={place([14, 258, 44, 38])} />
      <span className="absolute bg-wood-light/55" style={place([20, 272, 32, 3])} />
      <span className="absolute border-2 border-ink-900 bg-wood-dark" style={place([62, 266, 40, 30])} />
      <span className="absolute bg-wood-light/35" style={place([68, 278, 28, 3])} />
      {/* A mop, leaning where somebody left it. */}
      <span className="absolute bg-wood-light/70" style={place([300, 254, 3, 118])} />
      <span className="absolute bg-ink-500" style={place([294, 250, 15, 18])} />
      {/*
        * Flattened boxes, stacked against the near wall on the right.
        *
        * The lower fifth of the frame was empty floor. A room whose bottom is
        * blank reads as a picture that ran out rather than as a corridor you are
        * standing in.
        */}
      <span className="absolute bg-wood-dark" style={place([206, 494, 96, 12])} />
      <span className="absolute bg-wood-mid/70" style={place([212, 506, 90, 10])} />
      <span className="absolute bg-wood-dark" style={place([204, 516, 98, 11])} />

      {/* ---- The return door, centre ----------------------------------- */}
      {/*
        * The way back, and the brightest thing in the hall. Drawn as a door in
        * the wall with light under it — the parlor is on the other side — so
        * leaving is the obvious act rather than a control you have to find.
        */}
      <span className="absolute border-2 border-wood-dark bg-wood-mid" style={place(door)} />
      <span className="absolute bg-wood-light" style={place([130, 132, 54, 108])} />
      <span className="absolute bg-wood-light" style={place([130, 250, 54, 120])} />
      <span className="absolute rounded-full bg-amber-mid" style={place([176, 258, 7, 7])} />
      {/* The strip of warm light under it. */}
      <span className="absolute bg-amber-glow/70" style={place([124, 374, 66, 4])} />

      {/* ---- The curtained doorway, right ------------------------------ */}
      {/*
        * Heavy curtain, no handle, **no sign**. `18 §5`: never labelled CASINO on
        * first discovery. Nothing drawn here says what is behind it, which is why
        * it is a curtain and not a door with a plaque.
        */}
      <span className="absolute bg-ink-900" style={place(curtain)} />
      <span className="absolute bg-ink-500" style={place([202, 104, 92, 6])} />
      {/* Four folds, alternating, so it reads as cloth rather than a red panel. */}
      <span className="absolute bg-red-dark" style={place([206, 110, 21, 262])} />
      <span className="absolute bg-red-dark/70" style={place([227, 110, 21, 262])} />
      <span className="absolute bg-red-dark" style={place([248, 110, 21, 262])} />
      <span className="absolute bg-red-dark/70" style={place([269, 110, 21, 262])} />
      {/* Where the two middle folds meet. Dark, not light: there is nothing on. */}
      <span className="absolute bg-ink-900/70" style={place([246, 112, 4, 258])} />
      {/* The hem, off the floor, so it hangs rather than being painted on. */}
      <span className="absolute bg-ink-900" style={place([206, 366, 84, 6])} />

      {/* ---- The stairs down ------------------------------------------- */}
      {/*
        * An opening in the near floor, with a rail along it and a landing lit
        * from below.
        *
        * **The first version of this was invisible** — an `ink-900` hole on an
        * `ink-900` floor, with three tread bars floating in it and nothing saying
        * they were treads. Stairs going down are the only navigation metaphor in
        * this product that needs no explaining, and that only works if they are
        * visibly *a hole in the floor you can see into*. So the opening has a lip,
        * the treads descend into it in falling light, and the bottom one catches
        * the landing.
        */}
      <span className="absolute bg-wood-mid" style={place([14, 386, 116, 6])} />
      <span className="absolute bg-ink-900" style={place(stairs)} />
      {/*
        * The cut edges of the opening.
        *
        * Without them the treads sat on the floor and the flight read as steps
        * going *up* a flat surface. Two lit edges either side say the floor has
        * been cut through, which is the whole difference between a staircase and
        * a stack of planks.
        */}
      <span className="absolute bg-wood-mid" style={place([14, 386, 6, 156])} />
      <span className="absolute bg-wood-dark" style={place([124, 386, 6, 156])} />
      {/* Four treads, receding and darkening, then the lit landing. */}
      <span className="absolute bg-wood-light" style={place([20, 400, 104, 12])} />
      <span className="absolute bg-wood-mid" style={place([26, 418, 92, 12])} />
      <span className="absolute bg-wood-dark" style={place([32, 436, 80, 12])} />
      <span className="absolute bg-ink-700" style={place([38, 454, 68, 12])} />
      <span className="absolute bg-amber-deep/55" style={place([44, 472, 56, 10])} />
      {/* The rail: two posts and a top run, along the near edge. */}
      <span className="absolute bg-wood-light" style={place([12, 344, 5, 52])} />
      <span className="absolute bg-wood-light" style={place([124, 344, 5, 52])} />
      <span className="absolute bg-wood-light" style={place([12, 344, 117, 5])} />
      {/*
        * The chain across the rail.
        *
        * It is the reason the stairs are shut, drawn rather than written —
        * `18 §6` wants a closed door, and a chain says "not yet" in a way a
        * disabled control cannot.
        *
        * **It is a state of the door, not part of the room**, and it was part of
        * the room for one round: the open state photographed a chained stairwell
        * you could walk down. Nothing failed; the picture simply contradicted the
        * page. Found by looking at the state nobody will see for a year, which is
        * the reason that state is photographed at all.
        */}
      {chained && <span className="absolute bg-ink-100/70" style={place([14, 362, 113, 3])} />}
    </div>
  );
}
