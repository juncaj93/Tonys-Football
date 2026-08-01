import Link from 'next/link';

import { TYPE } from '@/lib/design/type';

/**
 * The page shell.
 *
 * Every measurement here is a phone measurement. `16 §4.2` and the handoff both
 * make iPhone Safari the primary platform, so:
 *
 *   - tap targets are at least 44px, always
 *   - the page uses `dvh`, not `vh`, so Safari's collapsing toolbar cannot
 *     crop the last row
 *   - `env(safe-area-inset-*)` keeps content clear of the notch and the home
 *     indicator
 *   - nothing depends on hover; every affordance is visible at rest
 *
 * ## There is no tab bar
 *
 * There was one, briefly — Parlor · Slice · Collection · Rooms, screwed along
 * the bottom of the shop. It was removed on purpose. A restaurant with a
 * navigation bar bolted across it is an application with a restaurant painted
 * behind it, and the whole point of `16 §7.1`'s six zones is that the *room* is
 * the interface: you reach the Slice through the poster frame by the window and
 * your collection through the case on the counter.
 *
 * What replaces the guarantee the tab bar provided — that nothing depends on
 * spotting an object — is threefold: every hotspot is a labelled control in the
 * tab order, the room introduces them once on arrival, and a small control in
 * the utility bar brings them back on request. `lib/parlor/hotspots.test.ts`
 * asserts that every screen the shop has is reachable from something in it.
 */

/** The minimum comfortable tap target. Used as a class, never as a guess. */
export const TAP_TARGET = 'min-h-[44px] min-w-[44px]';

export function Page({
  children,
  oneScreen = false,
}: {
  children: React.ReactNode;
  /**
   * The parlor. Exactly one viewport tall, nothing underneath, no scroll.
   *
   * `100dvh` rather than `100vh`: Safari's toolbar collapses as you scroll and
   * `vh` is measured against the *expanded* viewport, so a `100vh` room is
   * always a little taller than the screen and the bottom of it — the counter,
   * the dialogue — sits under the browser chrome until you scroll, which is
   * the exact thing this layout exists to avoid.
   */
  oneScreen?: boolean;
}) {
  if (oneScreen) {
    /*
     * **No top inset here, deliberately.** Every other page pads itself clear of
     * the notch, because a sheet of paper should not slide under the clock. The
     * parlor is not a sheet of paper — it is a room, and a room should reach the
     * top of the window.
     *
     * Padding it cost roughly 103 px on the phone: about 59 of safe area plus a
     * 44 px bar, all of it `ink-900`. On a 664 px screen that is **one sixth of
     * the display painted black above the shop**, and the commissioner read it
     * exactly as it looks — *"the large black region above the room makes the
     * experience feel letterboxed and disconnected."*
     *
     * So the room starts at row zero and the safe area is handled by the things
     * that sit *over* it: the utility bar carries the inset as its own padding,
     * and a short scrim keeps the status bar legible against the ceiling. Same
     * clearance, none of the void, and the reclaimed height goes to the room —
     * which is the one thing on this screen worth looking at.
     */
    return (
      <div className="relative mx-auto flex h-dvh w-full max-w-3xl flex-col overflow-hidden">
        {children}
      </div>
    );
  }

  return (
    <div
      className="relative mx-auto flex min-h-dvh w-full max-w-3xl flex-col"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)',
      }}
    >
      {children}
    </div>
  );
}

/**
 * The way back into the shop.
 *
 * Every interior — the rack, the case, the back rooms, your paperwork — is a
 * room you walked into from the counter, so the way out is the door you came
 * through rather than a tab. One control, top left, where a back button lives.
 *
 * Labelled **out front** rather than "the counter", for the same reason
 * `ReturnPlate` is: `/counter` is a real route titled *Tony's counter*, so a
 * back link to `/` that names the counter points at the page you are on.
 */
export function BackToTheCounter({ children = 'Back out front' }: { children?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex ${TAP_TARGET} -ml-2 items-center gap-2 px-2 ${TYPE.eyebrow} text-ink-100/75 transition-colors active:text-amber-mid`}
    >
      <span aria-hidden="true">&larr;</span>
      {children}
    </Link>
  );
}
