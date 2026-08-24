import { AssetView } from '@/lib/assets/placeholder';
import { resolveAsset } from '@/lib/assets/registry';
import { place, type RoomObjectSpec } from '@/lib/parlor/objects';
import { CEILING, HORIZON, MANAGER_ROOM, roomObject } from '@/lib/rooms/objects';
import { themeSpec, type Theme, type ThemeSpec } from '@/lib/rooms/themes';
import { exteriorLight } from '@/lib/world/light';

/**
 * A manager's basement.
 *
 * ## The shell is an asset, and this file is what stands in for it
 *
 * **Commissioner direction, 2026-08-09.** The first version of this room was
 * flat rectangles and nothing else, and it read as *"flat walls, simplistic
 * stairs, crude rectangles, under-detailed props, weak atmosphere."* The
 * correction is not a better set of rectangles — it is that **the room is a
 * painted shell**, exactly as the parlor is, and rectangles are what is drawn
 * while that shell does not exist yet.
 *
 * So this file has two halves and only one of them ever renders:
 *
 *   - `zone_room_shell_<theme>` has art → **draw it and nothing else.**
 *   - it does not → draw the geometry below, which follows the approved
 *     reference's *composition* at a placeholder's fidelity.
 *
 * That resolution is **per theme**, so three shells can land in any order and
 * none is gated on another. `docs/art/BATCH_E_BASEMENT_HANDOFF.md` is the brief,
 * and it is written to the same numbers `lib/rooms/objects.ts` fixes — the art
 * is drawn to the geometry rather than measured off it afterwards.
 *
 * ## What the placeholder is for, and what it is not
 *
 * It exists so the room's *composition* can be reviewed, and so every hit region,
 * gate and state is real before any art arrives. It is deliberately flat: hard
 * edges, palette colours, no rendering. `MANDATE`'s slot rules forbid *"polished
 * temporary art that may accidentally become canonical"* as firmly as they forbid
 * a broken-image box, and this must never be mistaken for the answer.
 *
 * It draws from the same rectangles the hit regions use, so what a manager sees
 * and what a tap lands on cannot drift.
 */
export function ManagerRoomScene({ theme }: { theme: Theme }) {
  const shell = resolveAsset(themeSpec(theme).shell);
  const light = exteriorLight();

  if (shell.kind === 'art') {
    return (
      <div
        aria-hidden="true"
        data-room-theme={theme}
        data-room-shell="art"
        className={`world-light world-light--${light} absolute inset-0 overflow-hidden`}
      >
        <AssetView resolution={shell} />
        <RoomWindow />
        {theme === 'rec_room' && <RecRoomFirelight />}
      </div>
    );
  }

  return <DrawnBasement theme={theme} />;
}

/** A small high basement window, lit from the same Michigan clock as the parlor. */
function RoomWindow() {
  return (
    <span
      aria-hidden="true"
      className="world-window room-window pointer-events-none absolute z-[5]"
      style={{ left: '57.5%', top: '17.22%', width: '11.875%', height: '4.57%' }}
    >
      <span className="world-star world-star--a" />
      <span className="world-star world-star--d" />
    </span>
  );
}

/**
 * A little living fire in the rec room.
 *
 * The fireplace is painted into the rebuilt room shell; it belongs to the wall,
 * tile, rug and mantle rather than floating above them as a second illustration.
 * These two tiny cells merely animate its already-painted fire. It remains
 * scenery, not a room object: no panel, prize, score or affordance.
 *
 * The cells sit within the baked firebox, not the empty frame, shelf, desk or
 * rug where collectible layers live. A two-frame rhythm adds life without
 * making the architecture wobble.
 */
function RecRoomFirelight() {
  return (
    <div
      aria-hidden="true"
      data-room-firelight="rec-room"
      className="pointer-events-none absolute z-10"
      style={{ left: '46.9%', top: '48.4%', width: '10.6%', height: '8.2%' }}
    >
      <span className="hearth-ember absolute left-[37%] top-[38%] h-[32%] w-[25%] bg-amber-glow" />
      <span className="hearth-spark absolute left-[58%] top-[16%] h-[15%] w-[13%] bg-amber-mid" />
    </div>
  );
}

/**
 * The seven treads, bottom first.
 *
 * A staircase is not a stack of blocks; it is a series of **lit edges over dark
 * risers**, and what the eye reads is the alternation. The first version drew
 * solid treads in one colour separated by a four-unit line and read as a stack
 * of crates — the same defect the hall's own stairwell hit from the other
 * direction.
 */
const STEPS: readonly { y: number; width: number }[] = [
  { y: 300, width: 70 },
  { y: 268, width: 65 },
  { y: 236, width: 60 },
  { y: 204, width: 55 },
  { y: 172, width: 50 },
  { y: 140, width: 45 },
  { y: 108, width: 40 },
];

/** The stairwell's inner left edge — the stairs rect inset by its own frame. */
const STEP_X = 54;

/**
 * One woven border on the rug — four thin spans rather than a CSS border.
 *
 * A `border` is set in pixels and would stay the same width while the room
 * scales with the viewport, so the rug's border would be twice as heavy
 * relative to the pattern at 360 as at 430. Four spans placed in room units
 * scale with everything else.
 */
function RugRing({
  spec,
  rect,
  faint = false,
}: {
  spec: ThemeSpec;
  rect: RoomObjectSpec['rect'];
  faint?: boolean;
}) {
  const [x, y, width, height] = rect;
  const weight = faint ? 2 : 3;
  const tone = faint ? `${spec.rugEdge} opacity-50` : spec.rugEdge;

  return (
    <>
      <span className={`absolute ${tone}`} style={place([x, y, width, weight])} />
      <span className={`absolute ${tone}`} style={place([x, y + height - weight, width, weight])} />
      <span className={`absolute ${tone}`} style={place([x, y, weight, height])} />
      <span className={`absolute ${tone}`} style={place([x + width - weight, y, weight, height])} />
    </>
  );
}

function DrawnBasement({ theme }: { theme: Theme }) {
  const spec = themeSpec(theme);
  const stairs = roomObject('stairs').rect;
  const frame = roomObject('wall').rect;
  const rail = roomObject('rings').rect;
  const board = roomObject('corridor').rect;
  const desk = roomObject('bench').rect;

  const pct = (value: number, of: number): string => `${((value / of) * 100).toFixed(3)}%`;
  /** A room-unit length as a percentage of the room's height. Used by gradients. */
  const rows = (units: number): number => (units / MANAGER_ROOM.height) * 100;
  const cols = (units: number): number => (units / MANAGER_ROOM.width) * 100;

  return (
    <div
      aria-hidden="true"
      /*
       * What the room is made of, and which half of this file drew it.
       *
       * `checkRoom` in `scripts/visual-qa.mts` reads both. The theme, because a
       * theme state that navigated and photographed the wrong walls would look
       * entirely plausible. The shell, because *"the painted room is live"* and
       * *"the placeholder is standing in"* are two different pictures and a
       * screenshot cannot tell them apart on its own.
       */
      data-room-theme={theme}
      data-room-shell="drawn"
      className="absolute inset-0 overflow-hidden"
    >
      {/* ---- The shell: ceiling, block wall, floor ----------------------- */}
      <div
        className={`absolute inset-x-0 top-0 ${spec.wainscot}`}
        style={{ height: pct(CEILING, MANAGER_ROOM.height) }}
      />
      {/*
        * Joists across the ceiling.
        *
        * One element rather than a dozen spans: a repeating gradient in
        * percentages scales with the room, where a pixel-valued one would drift
        * against the artwork on every different phone.
        */}
      <div
        className="absolute inset-x-0 top-0"
        style={{
          height: pct(CEILING, MANAGER_ROOM.height),
          background: `repeating-linear-gradient(to right, transparent 0 ${cols(30).toFixed(3)}%, rgba(0,0,0,0.30) ${cols(30).toFixed(3)}% ${cols(38).toFixed(3)}%)`,
        }}
      />

      <div
        className={`absolute inset-x-0 ${spec.wall}`}
        style={{
          top: pct(CEILING, MANAGER_ROOM.height),
          height: pct(HORIZON - CEILING, MANAGER_ROOM.height),
        }}
      />
      {/*
        * Courses and joints — the block wall the reference is built from, in two
        * elements. A flat field of colour is the single loudest thing saying
        * *"programmer art"* on a wall this large.
        */}
      <div
        className="absolute inset-x-0"
        style={{
          top: pct(CEILING, MANAGER_ROOM.height),
          height: pct(HORIZON - CEILING, MANAGER_ROOM.height),
          background:
            `repeating-linear-gradient(to bottom, transparent 0 ${rows(14).toFixed(3)}%, rgba(0,0,0,0.22) ${rows(14).toFixed(3)}% ${rows(16).toFixed(3)}%),` +
            `repeating-linear-gradient(to right, transparent 0 ${cols(30).toFixed(3)}%, rgba(0,0,0,0.14) ${cols(30).toFixed(3)}% ${cols(32).toFixed(3)}%)`,
        }}
      />

      <div
        className={`absolute inset-x-0 bottom-0 ${spec.floor}`}
        style={{ height: pct(MANAGER_ROOM.height - HORIZON, MANAGER_ROOM.height) }}
      />
      {/* The skirting where the wall meets the floor. */}
      <span className={`absolute ${spec.rail}`} style={place([0, HORIZON - 5, 320, 5])} />

      {/* ---- Pipes along the ceiling and down the left wall -------------- */}
      <span className="absolute bg-ink-500/70" style={place([0, 20, 320, 6])} />
      <span className="absolute bg-ink-500/55" style={place([0, 34, 320, 4])} />
      <span className="absolute bg-ink-500/60" style={place([282, 26, 6, 44])} />

      {/* ---- The window, high on the back wall --------------------------- */}
      {/* Where the delivered shell puts it: centred, just above the rod. */}
      <span className="absolute bg-ink-700" style={place([184, 98, 38, 26])} />
      <span className="absolute bg-blue-mid/50" style={place([187, 101, 32, 20])} />
      <span className="absolute bg-ink-700" style={place([202, 101, 2, 20])} />

      {/* ---- The one hanging lamp ---------------------------------------- */}
      {/*
        * A basement has one light and it is above you. Its colour is the biggest
        * single difference between the three themes — the cold store's is blue,
        * and that changes the room more than the tiling does.
        */}
      <span className="absolute bg-ink-500" style={place([211, 0, 3, 76])} />
      <span className={`absolute ${spec.fitting}`} style={place([196, 76, 34, 12])} />
      <span
        className="absolute rounded-full"
        style={{
          ...place([164, 82, 98, 66]),
          background: `radial-gradient(closest-side, ${spec.glow}, transparent)`,
        }}
      />

      {/* ---- The pennant rail -------------------------------------------- */}
      {/* A rod with two brackets. What hangs from it is drawn by the page. */}
      <span className="absolute bg-ink-300" style={place([rail[0], rail[1] + 22, rail[2], 4])} />
      <span className="absolute bg-ink-300" style={place([rail[0], rail[1] + 18, 4, 12])} />
      <span
        className="absolute bg-ink-300"
        style={place([rail[0] + rail[2] - 4, rail[1] + 18, 4, 12])}
      />

      {/* ---- The framed board on the back wall --------------------------- */}
      {/*
        * The room's largest display surface, and the most guessable "something
        * goes here" an object can be. It replaces a four-unit nail.
        */}
      <span className={`absolute ${spec.timberDark}`} style={place(frame)} />
      <span
        className={`absolute ${spec.timber}`}
        style={place([frame[0] + 3, frame[1] + 3, frame[2] - 6, frame[3] - 6])}
      />
      <span
        className="absolute bg-paper-dark"
        style={place([frame[0] + 8, frame[1] + 8, frame[2] - 16, frame[3] - 16])}
      />

      {/* ---- The shelf under it ------------------------------------------ */}
      {/* One plank on two brackets, spanning both shelf slots. */}
      <span className={`absolute ${spec.timber}`} style={place([134, 262, 114, 6])} />
      <span className="absolute bg-ink-900/55" style={place([142, 268, 6, 12])} />
      <span className="absolute bg-ink-900/55" style={place([234, 268, 6, 12])} />

      {/* ---- The cork noticeboard, right wall ---------------------------- */}
      {/*
        * `14 §5` makes basements social destinations without explaining how ten
        * of them fit under one pizzeria. A board with everybody pinned to it
        * answers that better than a second door: a noticeboard *is* a list, in
        * world, so taking a name off it needs no fiction.
        */}
      <span className={`absolute ${spec.timberDark}`} style={place(board)} />
      <span
        className="absolute bg-wood-light/70"
        style={place([board[0] + 4, board[1] + 4, board[2] - 8, board[3] - 8])}
      />
      {/* Notes pinned to it. Scenery — the names are in the panel. */}
      <span className="absolute bg-paper-mid" style={place([286, 126, 14, 18])} />
      <span className="absolute bg-paper-dark" style={place([303, 130, 12, 16])} />
      <span className="absolute bg-paper-mid" style={place([288, 152, 16, 14])} />
      <span className="absolute bg-paper-dark" style={place([304, 156, 12, 20])} />
      <span className="absolute bg-paper-mid" style={place([286, 182, 18, 16])} />
      <span className="absolute bg-paper-dark" style={place([302, 186, 14, 14])} />

      {/* ---- The desk ----------------------------------------------------- */}
      {/*
        * The one surface in the room at working height, which is why the thing
        * put there reads as chosen rather than stored. Its legs are drawn as
        * shadow: in the storeroom `theme.timberDark` and `theme.wainscot` are the
        * same tone, so a leg drawn in it was invisible against the wall behind.
        */}
      {/*
        * Top, apron, then legs — **mass, not a ledge.** The desktop sits at
        * `y 338`, two units above the horizon, so a top drawn on its own read as
        * a shelf stuck to the back wall rather than a desk standing in front of
        * it. In the painted shell this is a foreground object with real depth;
        * the stand-in gets that with a body under the top.
        */}
      <span className={`absolute ${spec.timber}`} style={place([desk[0] - 6, 338, desk[2] + 12, 8])} />
      <span className={`absolute ${spec.timberDark}`} style={place([desk[0] - 2, 346, desk[2] + 4, 18])} />
      <span className="absolute bg-ink-100/40" style={place([desk[0] + 22, 353, 14, 3])} />
      <span className="absolute bg-ink-900/55" style={place([desk[0] + 2, 364, 10, 66])} />
      <span className="absolute bg-ink-900/55" style={place([desk[0] + desk[2] - 12, 364, 10, 66])} />

      {/* ---- The staircase ------------------------------------------------ */}
      {/*
        * The room's largest feature, in its own framed opening, rising to a lit
        * doorway. The reference makes it that big and it is also the honest
        * scale — it is how you got in, and a narrow ladder against the wall was
        * the clearest single symptom of "simplistic stairs".
        */}
      <span className={`absolute ${spec.timberDark}`} style={place(stairs)} />
      <span
        className="absolute bg-ink-900"
        style={place([stairs[0] + 6, stairs[1] + 6, stairs[2] - 12, stairs[3] - 6])}
      />
      {/* Light from the hall, at the head of the flight. */}
      <span className="absolute bg-amber-glow/35" style={place([STEP_X, 98, 44, 34])} />

      {STEPS.map(({ y, width }, index) => (
        <span key={y}>
          {/* The nosing: the lit front edge of the tread. */}
          <span
            className={`absolute ${spec.timber}`}
            style={{ ...place([STEP_X, y, width, 8]), opacity: 1 - index * 0.07 }}
          />
          {/* The riser under it, in shadow. Three times the nosing's height. */}
          <span className="absolute bg-ink-900/70" style={place([STEP_X, y + 8, width, 24])} />
          {/* The banister post at the open edge of that step. */}
          <span
            className={`absolute ${spec.rail}`}
            style={{ ...place([STEP_X + width - 6, y - 22, 5, 24]), opacity: 1 - index * 0.07 }}
          />
        </span>
      ))}
      {/* The handrail, stepping down the open side with the flight. */}
      {STEPS.map(({ y, width }) => (
        <span
          key={`rail-${String(y)}`}
          className={`absolute ${spec.rail}`}
          style={place([STEP_X + width - 14, y - 24, 14, 5])}
        />
      ))}

      {/* ---- The floor ---------------------------------------------------- */}
      {/*
        * Two seams across the concrete. A single flat colour under the horizon
        * reads as a void rather than as ground somebody is standing on — the
        * same trick the hall uses, and the reason the first version had them.
        */}
      <span className="absolute bg-ink-900/25" style={place([0, 424, 320, 3])} />
      <span className="absolute bg-ink-900/18" style={place([0, 500, 320, 3])} />

      {/*
        * The rug, because the reference has one and because it is what tells a
        * manager where they are standing. It is also the room's safe standing
        * zone: the figure is centred on it.
        *
        * **Two woven rings and a weave, not a red rectangle.** The first version
        * was three nested filled spans and read as a bright slab — the single
        * loudest thing in the room and the one surface with no detail at all. A
        * rug is a border, a field and a pattern; the pattern is a repeating
        * gradient in percentages so it scales with the room rather than
        * drifting against it on a wider phone.
        */}
      <span className={`absolute ${spec.rug}`} style={place([96, 356, 180, 176])} />
      <span
        className="absolute"
        style={{
          ...place([96, 356, 180, 176]),
          background:
            `repeating-linear-gradient(to bottom, transparent 0 ${rows(5).toFixed(3)}%, rgba(0,0,0,0.16) ${rows(5).toFixed(3)}% ${rows(6).toFixed(3)}%),` +
            `repeating-linear-gradient(to right, transparent 0 ${cols(5).toFixed(3)}%, rgba(255,255,255,0.05) ${cols(5).toFixed(3)}% ${cols(6).toFixed(3)}%)`,
        }}
      />
      <RugRing spec={spec} rect={[102, 362, 168, 164]} />
      <RugRing spec={spec} rect={[118, 378, 136, 132]} faint />
      {/* The fringe, at both ends, so it reads as laid down rather than painted on. */}
      <span className="absolute bg-paper-dark/45" style={place([96, 352, 180, 4])} />
      <span className="absolute bg-paper-dark/45" style={place([96, 532, 180, 4])} />

      {/* Flattened boxes and a crate, left of the rug. */}
      <span className={`absolute ${spec.timberDark}`} style={place([4, 356, 68, 22])} />
      <span className={`absolute ${spec.timber} opacity-70`} style={place([8, 364, 60, 8])} />
      <span className="absolute bg-ink-700" style={place([6, 396, 66, 58])} />
      <span className="absolute bg-ink-500/60" style={place([10, 400, 58, 4])} />
      <span className="absolute bg-ink-500/40" style={place([10, 422, 58, 4])} />

      {/* A stack of boxes in the near right corner. */}
      <span className={`absolute ${spec.timberDark}`} style={place([282, 452, 38, 20])} />
      <span className={`absolute ${spec.timber} opacity-70`} style={place([286, 472, 34, 18])} />
    </div>
  );
}
