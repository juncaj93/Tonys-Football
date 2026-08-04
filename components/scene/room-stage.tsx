'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * What is up in the room, and the rule that only one thing ever is.
 *
 * ## The defect this exists for
 *
 * `MANDATE §6` forbids two transient surfaces competing, and the parlor had
 * **five of them with five private owners and no arbitration**:
 *
 * | surface | owner | its state |
 * |---|---|---|
 * | the Tonight board, the sign, the receipt | `RoomDisplay` | `open` |
 * | the champion panel | `BannerRail` | `openSlot` |
 * | Tony's order pad | `TonyToy` | `dismissed` |
 * | the shut door's line | `ShutDoor` | `saying` |
 * | the reveal plate | `CounterTray` | `phase` |
 *
 * None of them could see any of the others, and three separate entries in
 * `docs/VISUAL_DEBT.md` are that one fact seen from three angles:
 *
 *   - **debt 4** — the board's panel and Tony's pad can be up together, because
 *     nothing arbitrates
 *   - **debt 3** — the pad's timing was never reviewed against the reveal's,
 *     because nothing owns both
 *   - **debt 10** — the affordance vocabulary was replaced (`18 §9.4`) and the
 *     old CSS was orphaned, because nothing owns *"show me what I can touch"*
 *
 * So this is the owner. It holds one identifier and arbitrates.
 *
 * ## It owns presentation, and nothing else
 *
 * No data, no routing, no permissions, no ownership, no statistics, no
 * navigation. A surface says *"I am up"* and *"I am down"*; what it contains and
 * where its links go stay entirely with the component that has that knowledge.
 * That separation is what lets the room's art and layout be redesigned later
 * without any of the domain code moving.
 *
 * ## Blocking, and why the reveal is not just another panel
 *
 * A panel is something you opened and can replace by opening another. **The
 * collectible reveal is not** — it is a recorded, once-only moment that plays at
 * the tray, and a manager who taps the receipt halfway through it must not be
 * able to make it disappear. So a surface may present itself as *blocking*, and
 * while one is up `present` refuses. The tap does nothing, which is the correct
 * answer for a room that is busy; the alternative is a panel drawn over the
 * biggest moment in the product.
 *
 * ## It renders no DOM
 *
 * Deliberately. The room's object map, its hit regions and its z-order are all
 * measured against the shell's own coordinate space, and a wrapper element in
 * the middle of that is a hazard for no benefit. The provider is a context and
 * nothing else, so the served HTML and the hydrated tree are identical whether
 * or not it is mounted.
 */

/** Which surface is up. A room object's id, or a partition of one. */
export type StageSurface = string;

export interface RoomStage {
  /** The one surface that is up, or `null` for a room at rest. */
  readonly showing: StageSurface | null;
  /** True when the surface that is up refuses to be replaced. */
  readonly blocked: boolean;
  /** Put this surface up, taking down whatever was. Refused while blocked. */
  readonly present: (surface: StageSurface, options?: { blocking?: boolean }) => void;
  /** Take this surface down, if it is the one that is up. */
  readonly dismiss: (surface: StageSurface) => void;
  /** Is this the surface that is up? */
  readonly isShowing: (surface: StageSurface) => boolean;
}

/**
 * The resting room.
 *
 * A component outside a `RoomStage` gets a stage where nothing is up and
 * presenting does nothing, rather than throwing. That is deliberate: these
 * components are also rendered by tests and by screens that are not rooms, and
 * a presentation primitive should not be the reason a page fails to render.
 */
const RESTING: RoomStage = {
  showing: null,
  blocked: false,
  present: () => undefined,
  dismiss: () => undefined,
  isShowing: () => false,
};

const StageContext = createContext<RoomStage>(RESTING);

export function useRoomStage(): RoomStage {
  return useContext(StageContext);
}

/** What is up, and whether it refuses to be replaced. */
export interface Up {
  readonly surface: StageSurface | null;
  readonly blocking: boolean;
}

export const NOTHING: Up = { surface: null, blocking: false };

/**
 * The whole rule, as two pure functions.
 *
 * Exported so `room-stage.test.tsx` can drive the transitions themselves rather
 * than asserting on the provider's source text. A rule this small is worth
 * having as a value: *"only one thing is ever up"* is one line here, and it
 * cannot be true in the provider and false in the test.
 */
export function afterPresent(current: Up, surface: StageSurface, blocking: boolean): Up {
  // A blocking surface holds the room until it lets go. Presenting *itself*
  // again is allowed, so a component whose effect re-fires does not deadlock.
  if (current.blocking && current.surface !== surface) return current;
  /*
   * **Presenting what is already up returns the same object.**
   *
   * The line above anticipated an effect re-firing; returning a fresh object
   * guaranteed it re-fires *forever*. `RoomStage`'s context value is memoised on
   * `up`, so a new `Up` is a new `stage`, and `CounterTray`'s effect lists
   * `stage` in its dependencies and calls `present` in its body. New object →
   * new context → effect runs → new object: **"Maximum update depth exceeded"**,
   * on the homepage, for the whole time a box is open.
   *
   * It was invisible for two reasons. The production build does not print that
   * message, and `next dev` — which does, and which also double-invokes effects
   * under Strict Mode — was believed to be un-sweepable by the visual driver.
   * It is not; the driver reproduces this deterministically at all three widths
   * on `tray-reveal`.
   *
   * Identity is the contract here, not merely an optimisation. Any state derived
   * from `Up` and consumed through a dependency array has to be able to say
   * "nothing changed", and the only way to say that is to return `current`.
   */
  if (current.surface === surface && current.blocking === blocking) return current;
  return { surface, blocking };
}

export function afterDismiss(current: Up, surface: StageSurface): Up {
  // Only the surface that is actually up may take itself down. A late dismissal
  // from one that has already been replaced must not clear its replacement.
  return current.surface === surface ? NOTHING : current;
}

export function RoomStage({ children }: { children: React.ReactNode }) {
  /*
   * Nothing up, on the server and on the client's first render, so the served
   * HTML and the hydrated tree agree by construction. Nothing here reads the
   * clock, storage or the viewport during render.
   *
   * One state object rather than two, so `present` can decide from the value it
   * is updating rather than from a ref that might disagree with what rendered.
   */
  const [up, setUp] = useState<Up>(NOTHING);

  const present = useCallback((surface: StageSurface, options?: { blocking?: boolean }): void => {
    setUp((current) => afterPresent(current, surface, options?.blocking === true));
  }, []);

  const dismiss = useCallback((surface: StageSurface): void => {
    setUp((current) => afterDismiss(current, surface));
  }, []);

  /*
   * The room's ambient surfaces yield to whatever is up.
   *
   * `data-parlor-focus` on `body` predates this provider — `CounterTray` set it
   * directly so Tony's order pad would fade while a box was opening, with the
   * comment that *"the fix is not to teach each one about the others but to give
   * the room a single focus they defer to"* and that a provider "would be a
   * larger change than the defect". That provider is now this file, so the
   * attribute has **one writer** instead of a component reaching past its own
   * subtree into `document.body`.
   *
   * It stays an attribute rather than becoming a prop because what yields, and
   * how, is a decision for `globals.css` — the room's material — and a future
   * ambient surface can start yielding without any component learning about it.
   */
  useEffect(() => {
    if (up.surface === null) delete document.body.dataset['parlorFocus'];
    else document.body.dataset['parlorFocus'] = up.surface;
    return () => {
      delete document.body.dataset['parlorFocus'];
    };
  }, [up.surface]);

  const value = useMemo<RoomStage>(
    () => ({
      showing: up.surface,
      blocked: up.blocking,
      present,
      dismiss,
      isShowing: (surface) => up.surface === surface,
    }),
    [up, present, dismiss],
  );

  return <StageContext.Provider value={value}>{children}</StageContext.Provider>;
}
