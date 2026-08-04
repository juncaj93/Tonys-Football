'use client';

import Link from 'next/link';
import { useRef } from 'react';

import { RoomPanel, type PanelMaterial } from '@/components/scene/room-panel';
import { useRoomStage } from '@/components/scene/room-stage';
import { place, type RoomObjectSpec } from '@/lib/parlor/objects';

/**
 * The things in the room, and how a tap reaches them.
 *
 * ## Nothing here is drawn
 *
 * An earlier version traced each object as an SVG polygon and painted a wash, a
 * contour and a bright edge along it. That is withdrawn (`18 §9.4`), and the
 * replacement is better for a reason worth keeping in view: **an authored
 * outline goes stale the moment the art is regenerated, silently, and nothing
 * fails.** A traced polygon is a second copy of the artwork's shape, maintained
 * by hand, with no mechanism that notices when the two disagree.
 *
 * So the glow is now `filter: drop-shadow()` applied to an **overlay's own
 * alpha channel** — it follows the silhouette because it *is* the silhouette,
 * and it updates itself when a placeholder is swapped for final art. That lives
 * with the overlay, on the page, not here.
 *
 * What is left here is the hit region, and hit regions are invisible. They can
 * be plain rectangles, padded out to a comfortable 44 units, because nobody
 * ever sees their edges. The rule "no visible rectangles around room objects"
 * is about the glow — and the glow no longer comes from this file.
 *
 * ## Which means most of the room never glows, correctly
 *
 * The board, the sign, the receipt, the tray and the doorway are baked into the
 * shell. They have no overlay, so no alpha, so nothing to glow — and in V1 that
 * is exactly right: Displays never glow by rule, and the two baked Doors have
 * nothing to announce yet. A Door glows only when it has something to say.
 */

/**
 * How the object map is counted at runtime.
 *
 * Every interactive object in the room carries `data-room-object` (its id) and
 * `data-room-kind`. `npm run visual:qa`'s `object-map` gate reads these and
 * asserts the rendered set against `ROOM_OBJECTS` — the whole map, not a count
 * of anchors.
 *
 * ## Why not just count `<a href>` like the gate used to
 *
 * Because one Door legitimately stops being an anchor. The tray is a Door, and
 * when a box is owned it **opens at the tray, in place** (`18 §4.1`) rather than
 * navigating — so it renders as a button. Counting anchors would have read that
 * as "a Door went missing", and the obvious way to make the gate pass again
 * would have been to route to `/counter` first, which is the exact defect the
 * ruling names.
 *
 * So the marker is the object's identity rather than its HTML tag. That is also
 * a stronger gate: it catches a Door quietly becoming a Display, an object
 * disappearing, and a ninth object appearing — none of which an anchor count
 * sees.
 *
 * ## Partitioned objects
 *
 * One object may be several targets. The banner rail is a single Display whose
 * row is divided into six real DOM buttons, because "which season is that one?"
 * is a question about a specific banner. Those buttons additionally carry
 * `data-room-partition`, which is how the gate knows six elements sharing one id
 * are one object rather than five duplicates.
 *
 * The distinction is the point: without it, the gate would either reject the rail
 * or have to stop checking for duplicates — and a genuinely duplicated object
 * doubles a tap target invisibly.
 */
export function roomObjectAttributes(
  spec: RoomObjectSpec,
  /** Index within a partitioned object, e.g. a banner slot. */
  partition?: number,
): Record<string, string> {
  return {
    'data-room-object': spec.id,
    'data-room-kind': spec.kind,
    ...(partition === undefined ? {} : { 'data-room-partition': String(partition) }),
  };
}

/**
 * A Door: it goes somewhere.
 *
 * The anchor *is* the hit region — positioned and sized in room units — rather
 * than a full-bleed element with a shape inside it. Keyboard focus lands on it
 * naturally and the focus ring follows the same rectangle.
 */
export function RoomDoor({ spec, children }: { spec: RoomObjectSpec; children?: React.ReactNode }) {
  if (spec.href === undefined) throw new Error(`${spec.id} is a Door with nowhere to go`);

  return (
    <Link
      href={spec.href}
      aria-label={`${spec.label} — ${spec.destination ?? ''}`.trim()}
      style={place(spec.rect)}
      className="room-shape absolute z-30 outline-none"
      {...roomObjectAttributes(spec)}
    >
      {children}
    </Link>
  );
}

/**
 * A Display: read in place, over the room. No route, no glow.
 *
 * ## Its open state belongs to the room, not to it
 *
 * This used to hold `useState(false)` and open its own panel, which is the
 * obvious implementation and is what let two transient surfaces be up at once —
 * `MANDATE §6`'s named failure, recorded as visual debt 4. A Display cannot see
 * Tony's order pad and the pad cannot see a Display, so neither can yield.
 *
 * `useRoomStage()` is the arbiter. Presenting takes down whatever was up, and
 * the pad reads the same value and steps aside. Nothing about *what a Display
 * contains* moved: the content is still whatever the caller passes, resolved on
 * the server, and this file still knows nothing about tokens, seasons or routes.
 *
 * The `key` for the stage is the object's own id, which is already unique across
 * the room because the object-map gate asserts it.
 */
export function RoomDisplay({
  spec,
  title,
  material,
  actions,
  children,
}: {
  spec: RoomObjectSpec;
  title: string;
  /** Which of the room's two surfaces this panel is made of. */
  material?: PanelMaterial;
  /** The foreground row: where this panel leads, if anywhere. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const stage = useRoomStage();
  const trigger = useRef<HTMLButtonElement>(null);
  const open = stage.isShowing(spec.id);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={spec.label}
        aria-haspopup="dialog"
        onClick={() => {
          stage.present(spec.id);
        }}
        style={place(spec.rect)}
        className="room-shape absolute z-30 outline-none"
        {...roomObjectAttributes(spec)}
      />

      {open && (
        <RoomPanel
          title={title}
          material={material}
          actions={actions}
          onClose={() => {
            stage.dismiss(spec.id);
            trigger.current?.focus();
          }}
        >
          {children}
        </RoomPanel>
      )}
    </>
  );
}

/** A Toy: it answers. No route, no glow, and it is not a way out of the room. */
export function RoomToy({ spec, onTap }: { spec: RoomObjectSpec; onTap: () => void }) {
  return (
    <button
      type="button"
      aria-label={spec.label}
      onClick={onTap}
      style={place(spec.rect)}
      className="room-shape absolute z-30 outline-none"
      {...roomObjectAttributes(spec)}
    />
  );
}
