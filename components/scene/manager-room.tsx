import { place } from '@/lib/parlor/objects';
import { HORIZON, MANAGER_ROOM, roomObject } from '@/lib/rooms/objects';
import { themeSpec, type Theme } from '@/lib/rooms/themes';

/**
 * A manager's basement, drawn.
 *
 * ## Why this is geometry rather than a placeholder image
 *
 * The commissioner's ruling of 2026-07-31 — *"do not block all Back Hall
 * development on final art… use deliberate in-world placeholder architecture"* —
 * and `components/scene/back-hall.tsx` is the worked precedent. **No room art
 * exists for this feature and none is requested by it**: there is no
 * `zone_room_shell_*` slug in `art/assets.inventory.json`, and there was none
 * before this change either.
 *
 * So this is **flat rectangles in palette colours**, the same vocabulary the
 * hall and the pizza box are built from. It is meant to read as *a basement
 * whose fittings are simple*, never as finished art — `MANDATE`'s slot rules
 * forbid *"polished temporary art that may accidentally become canonical"* as
 * firmly as they forbid a broken-image box. No gradients except the one the
 * light needs, no rendering, no detail that could be mistaken for a decision
 * about what a basement looks like.
 *
 * ## It draws from the same numbers the hit regions use
 *
 * Every object is positioned with `place()` on the rectangle in
 * `lib/rooms/objects.ts`. There is no second copy of the layout, so what a
 * manager sees and what a tap lands on cannot drift.
 *
 * ## Three themes, one geometry
 *
 * The furniture does not move between themes — the shelf is the shelf, the bench
 * is the bench, and a manager who changes the room finds their things where they
 * left them. What changes is what the room is *made of* (`lib/rooms/themes.ts`),
 * which is the honest version of a theme and the one that costs no coordinates.
 */
/**
 * The six treads, bottom first.
 *
 * Each one is 36 units above the last and eight units narrower, so the flight
 * both climbs and recedes. Six is what fits between the floor and the head of
 * the stairwell at a rise a person could actually walk; five looked like a
 * loading ramp and seven put a tread under the ceiling pipe.
 */
const STEPS: readonly { y: number; width: number }[] = [
  { y: 356, width: 78 },
  { y: 320, width: 70 },
  { y: 284, width: 62 },
  { y: 248, width: 54 },
  { y: 212, width: 46 },
  { y: 176, width: 38 },
];

export function ManagerRoomScene({ theme }: { theme: Theme }) {
  const spec = themeSpec(theme);
  const stairs = roomObject('stairs').rect;
  const corridor = roomObject('corridor').rect;

  /** The dado — where the lower wall stops. Two thirds of the way to the floor. */
  const DADO = 268;

  const pct = (value: number, of: number): string => `${((value / of) * 100).toFixed(3)}%`;

  return (
    <div
      aria-hidden="true"
      /*
       * What the room is actually made of, declared in the DOM.
       *
       * `checkRoom` in `scripts/visual-qa.mts` reads it, because a theme state
       * that navigated and photographed the wrong walls would look entirely
       * plausible — the same false green the nine `reveal-*` states shipped, and
       * the reason every named state in this product asserts its own identity
       * against the rendered page rather than against the URL.
       */
      data-room-theme={theme}
      className="absolute inset-0 overflow-hidden"
    >
      {/* ---- The shell: ceiling, wall, wainscot, floor ------------------- */}
      <div
        className={`absolute inset-x-0 top-0 ${spec.wall}`}
        style={{ height: pct(DADO, MANAGER_ROOM.height) }}
      />
      <div
        className={`absolute inset-x-0 ${spec.wainscot}`}
        style={{
          top: pct(DADO, MANAGER_ROOM.height),
          height: pct(HORIZON - DADO, MANAGER_ROOM.height),
        }}
      />
      {/* The rail where the two materials meet, and the skirting at the floor. */}
      <span className={`absolute ${spec.rail}`} style={place([0, DADO - 4, 320, 4])} />
      <span className={`absolute ${spec.rail}`} style={place([0, HORIZON - 4, 320, 4])} />

      <div
        className={`absolute inset-x-0 bottom-0 ${spec.floor}`}
        style={{ height: pct(MANAGER_ROOM.height - HORIZON, MANAGER_ROOM.height) }}
      />
      {/*
        * Two seams across the floor.
        *
        * The same trick the hall uses: a single flat colour under the horizon
        * reads as a void rather than as ground somebody is standing on. Two is
        * enough to say *floor* and few enough that it stays a placeholder.
        */}
      <span className={`absolute ${spec.seam}`} style={place([0, 448, 320, 2])} />
      <span className={`absolute ${spec.seam}`} style={place([0, 512, 320, 2])} />

      {/* ---- The one light ---------------------------------------------- */}
      {/*
        * A basement has one light and it is above you. It is what makes the
        * corners dark, and its colour is the biggest single difference between
        * the three themes — the cold store's is blue, and that changes the room
        * more than the tiling does.
        */}
      <span className="absolute bg-ink-500" style={place([158, 0, 3, 30])} />
      <span className={`absolute ${spec.fitting}`} style={place([148, 30, 24, 8])} />
      <span
        className="absolute rounded-full"
        style={{
          ...place([104, 32, 112, 68]),
          background: `radial-gradient(closest-side, ${spec.glow}, transparent)`,
        }}
      />

      {/* ---- Scenery ----------------------------------------------------- */}
      {/*
        * `18 §3.6` — most of a room is scenery, permanently. None of this is in
        * the object map, because nobody could guess where a pipe goes.
        *
        * A pipe along the ceiling and a stack of trade boxes in the near corner.
        * The boxes are on the **right of the floor**, under the bench and clear
        * of every hit region, which is the corner the layout leaves empty.
        */}
      <span className="absolute bg-ink-500/70" style={place([0, 12, 320, 5])} />
      <span className="absolute bg-ink-500/50" style={place([88, 17, 6, 14])} />

      <span className={`absolute ${spec.timberDark}`} style={place([252, 470, 60, 14])} />
      <span className={`absolute ${spec.timber} opacity-70`} style={place([258, 484, 56, 12])} />
      <span className={`absolute ${spec.timberDark}`} style={place([248, 496, 66, 13])} />

      {/* ---- The stairs back up ------------------------------------------ */}
      {/*
        * A flight climbing away from the viewer, out of the top of the frame.
        *
        * These are the far side of the Back Hall's opening in the floor, seen
        * from the bottom. The metaphor has to survive being drawn twice, and the
        * first attempt did not: solid treads in one colour, separated by a
        * four-unit line, read as **a stack of crates**. That is the same defect
        * the hall's own stairwell hit from the other direction — *"an ink-900
        * hole on an ink-900 floor with three tread bars floating in it"* — and
        * the fix is the same in kind. A staircase is not a series of blocks; it
        * is a series of **lit edges over dark risers**, and what the eye reads is
        * the alternation.
        *
        * So: a dark stairwell, six bright nosings receding and narrowing, each
        * with two thirds of its own height of shadow underneath, and light at
        * the top where the hall is. Nothing about it is a block of timber.
        */}
      <span className="absolute bg-ink-900" style={place(stairs)} />
      {/*
        * Light from the hall, at the head of the flight.
        *
        * One patch rather than two: the second sat exactly where the topmost
        * tread paints over it, so it cost a draw and showed nothing.
        */}
      <span className="absolute bg-amber-glow/35" style={place([8, 132, 46, 44])} />

      {STEPS.map(({ y, width }, index) => (
        <span key={y}>
          {/* The nosing: the lit front edge of the tread. */}
          <span
            className={`absolute ${spec.timber}`}
            style={{ ...place([8, y, width, 9]), opacity: 1 - index * 0.09 }}
          />
          {/* The riser under it, in shadow. Three times the nosing's height. */}
          <span
            className="absolute bg-ink-900/70"
            style={place([8, y + 9, width, 27])}
          />
          {/* The banister post at the open edge of that step. */}
          <span
            className={`absolute ${spec.rail}`}
            style={{ ...place([8 + width - 6, y - 24, 5, 26]), opacity: 1 - index * 0.09 }}
          />
        </span>
      ))}

      {/* The handrail, stepping down the open side with the flight. */}
      {STEPS.map(({ y, width }) => (
        <span
          key={`rail-${String(y)}`}
          className={`absolute ${spec.rail}`}
          style={place([8 + width - 14, y - 26, 14, 5])}
        />
      ))}

      {/* ---- The championship rail --------------------------------------- */}
      {/*
        * A steel rail with hooks on it, high on the wall.
        *
        * Drawn whether or not anything hangs from it — eight of ten managers
        * have won nothing, and a rail that appeared the day you won would take
        * the meaning out of the day you won. The rings themselves are drawn by
        * the page, from verified titles.
        */}
      <span className="absolute bg-ink-300" style={place([100, 60, 140, 4])} />
      <span className="absolute bg-ink-300" style={place([102, 56, 4, 10])} />
      <span className="absolute bg-ink-300" style={place([234, 56, 4, 10])} />

      {/* ---- The shelf ---------------------------------------------------- */}
      {/*
        * One plank on two brackets, spanning both shelf slots.
        *
        * The brackets are **shadow, not timber**. In the storeroom
        * `theme.timberDark` and `theme.wainscot` are the same tone, so a bracket
        * drawn in it was invisible against the wall behind — and the same was
        * true of the bench's legs. Anything that is the *underside* of a piece
        * of furniture is drawn as shadow, which reads on all three themes
        * because it is darker than every one of them by construction.
        */}
      <span className={`absolute ${spec.timber}`} style={place([96, 198, 128, 6])} />
      <span className="absolute bg-ink-900/55" style={place([104, 204, 6, 12])} />
      <span className="absolute bg-ink-900/55" style={place([210, 204, 6, 12])} />

      {/* ---- The nail in the wall ---------------------------------------- */}
      {/*
        * One nail with a shadow under it, so an empty wall slot still says
        * *something goes here* at arm's length. Four units of grey on its own
        * was a speck.
        */}
      <span className="absolute bg-ink-100" style={place([124, 232, 6, 5])} />
      <span className="absolute bg-ink-900/45" style={place([124, 237, 6, 3])} />

      {/* ---- The workbench ------------------------------------------------ */}
      {/*
        * A top and two legs, against the back wall under the corridor door's
        * left edge. It is the special display slot from `04 §10` — the one
        * surface in the room at standing height, which is why the thing put
        * there reads as chosen rather than stored.
        */}
      <span className={`absolute ${spec.timber}`} style={place([186, 336, 58, 8])} />
      <span className="absolute bg-ink-900/55" style={place([190, 344, 6, 48])} />
      <span className="absolute bg-ink-900/55" style={place([234, 344, 6, 48])} />

      {/* ---- The door to the corridor ------------------------------------- */}
      {/*
        * A plain door in the back wall, on the right. Nothing on it says whose
        * rooms are through it — the corridor is where the names are, and the
        * door is a door.
        *
        * The strip of light under it is what makes it read as *somewhere else*
        * rather than as a painted rectangle, and it is the same device the hall's
        * return door uses.
        */}
      <span className={`absolute ${spec.timberDark}`} style={place(corridor)} />
      <span className={`absolute ${spec.timber}`} style={place([252, 164, 54, 100])} />
      <span className={`absolute ${spec.timber}`} style={place([252, 272, 54, 112])} />
      <span className="absolute rounded-full bg-ink-100" style={place([256, 282, 6, 6])} />
      <span className="absolute bg-amber-glow/45" style={place([248, 386, 62, 4])} />
    </div>
  );
}
