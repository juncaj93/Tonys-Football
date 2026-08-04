'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';

import { TYPE } from '@/lib/design/type';

/**
 * Walking in.
 *
 * `17 §3` describes what should happen in the first second: the room is there,
 * Tony is at the counter, and he says one true thing. This orchestrates the
 * order of those three, and nothing else.
 *
 * ## The sequence
 *
 * ```
 *   0ms   the room, complete and still. Tony is below the counter line.
 *   80ms  he steps up into place — one movement, ~520ms, no bounce
 *   700ms he settles: a single small shift of weight
 *   900ms his line appears
 *  1300ms the objects you can touch take a warm edge and breathe twice
 *  4600ms the room goes quiet
 * ```
 *
 * The room paints first on purpose. A restaurant that assembles itself while
 * you watch is a loading screen with a theme; a restaurant that is already
 * there when the door opens is a place.
 *
 * ## What is animated, and what merely looks animated
 *
 * The server renders the **finished** state — Tony present, line readable,
 * every control in the tab order. This component adds a class afterwards, and
 * the class is what moves things. So:
 *
 *   - nothing is ever hidden behind an animation that might not run
 *   - `prefers-reduced-motion` gets a genuine absence rather than a
 *     zero-duration animation of something that started invisible
 *   - it plays once per session. `02 §12` bans repeated onboarding, and seeing
 *     Tony walk up every time you navigate back is exactly that.
 *
 * It has one cost, and it is the reason `ENTRANCE_STALE_AFTER_MS` exists: the
 * finished state is on screen *before* the animation is attached, so an
 * entrance that starts late does not introduce Tony — it takes a man who is
 * already standing there and drops him. See that constant for the measurement.
 *
 * The reveal is deliberately separate from the entrance in the reduced-motion
 * case: somebody who has asked for less movement still needs to know which
 * parts of the room are things, so they get the warm edges without the breath.
 */

const ENTRANCE_MS = 900;
const REVEAL_AT_MS = 1600;
const REVEAL_FOR_MS = 3300;
const PLAYED_KEY = 'tonys:arrived';

/**
 * How long the finished room may already have been on screen and still be
 * allowed an entrance.
 *
 * ## The defect this exists for
 *
 * The server renders the **finished** state — that is the rule at the top of
 * this file and it is a good one: Tony is at the counter in the HTML, so a
 * browser that never runs the script shows a complete room. The entrance is
 * then added afterwards, by a class, from a `useEffect`.
 *
 * Which means the entrance is anchored to **hydration**, and the picture it
 * animates away from is already on the glass. `tony-steps-up` opens on
 * `translate3d(0, 26%, 0)` with `animation-fill-mode: both`, so the backwards
 * fill applies during the animation's own 80ms delay: the instant `.arriving`
 * lands, Tony snaps down a quarter of his height — behind the counter front,
 * which is drawn over him — and then walks back up.
 *
 * On a fast machine hydration follows paint by about 150ms and nobody sees it.
 * Under an 8x CPU throttle, measured: the room paints complete at 331ms and at
 * 642ms **he drops 62.42px**, taking three seconds to climb back. A phone on a
 * real network is the throttled case, not the fast one.
 *
 * That is *"Tony's bottom half clips, seconds after the homepage settles"* —
 * and it is the only movement in this room that puts his bottom half behind the
 * counter. It is not the glow: the glow-off ramp was measured frame by frame at
 * all three widths and is pixel-clean, including its endpoints.
 *
 * ## Why a threshold rather than a repair to the animation
 *
 * Nothing is wrong with the entrance. It is wrong to *start* one on a room the
 * manager has already been looking at — at that point a quarter-height jump is
 * not a man stepping up, it is the page faulting. `02 §12` already bans
 * repeated onboarding and this file already refuses to replay within a session;
 * this is the same refusal against a different clock.
 *
 * 250ms is chosen against the drop rather than against a feel: below it the
 * room is still visibly arriving and the movement reads as part of that, and
 * above it the eye has settled on a finished picture. It is deliberately
 * generous — every measured local hydration lands at 118-178ms, so the entrance
 * still plays everywhere it should, and only a genuinely late one is skipped.
 */
const ENTRANCE_STALE_AFTER_MS = 250;

/**
 * How long the finished room has already been on the manager's screen.
 *
 * `first-contentful-paint` rather than `performance.now()`, because the two
 * answer different questions. Time since *navigation* includes the network, so
 * a slow connection would look like a stale room even though the picture only
 * just appeared. Time since *paint* is the thing being protected: how long has
 * this person been looking at a complete parlor.
 *
 * A browser that reports no paint entry has not painted anything worth
 * preserving, so the entrance plays — that is the safe direction, and it keeps
 * the entrance on browsers without the Paint Timing API.
 */
function roomOnScreenForMs(): number {
  const painted = performance
    .getEntriesByType('paint')
    .find((entry) => entry.name === 'first-contentful-paint');
  return painted === undefined ? 0 : performance.now() - painted.startTime;
}

interface Arrival {
  /**
   * This is the first view of the parlor this session.
   *
   * Latches true and stays true, unlike `entering`, which is a window that
   * closes. Anything scheduled *from* the arrival has to hang off this one —
   * a `useEffect` keyed to `entering` is torn down the moment the entrance
   * ends, which silently cancelled Tony's typing before it began.
   */
  readonly arrived: boolean;
  /** Tony is stepping up. Drives his transform and his line's delay. */
  readonly entering: boolean;
  /** The interactive objects are showing their edges. */
  readonly revealed: boolean;
  /** Show them again, on request. */
  readonly reveal: () => void;
  /** Tony is mid-sentence. Drives the small motion that says who is talking. */
  readonly speaking: boolean;
  readonly setSpeaking: (value: boolean) => void;
}

const ArrivalContext = createContext<Arrival>({
  arrived: false,
  entering: false,
  revealed: false,
  reveal: () => undefined,
  speaking: false,
  setSpeaking: () => undefined,
});

export function useArrival(): Arrival {
  return useContext(ArrivalContext);
}

export function Arriving({ children }: { children: React.ReactNode }) {
  const [arrived, setArrived] = useState(false);
  const [entering, setEntering] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = (): void => {
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];
  };

  const reveal = (): void => {
    setRevealed(true);
    timers.current.push(
      setTimeout(() => {
        setRevealed(false);
      }, REVEAL_FOR_MS),
    );
  };

  useEffect(() => {
    let alreadyBeenHere = false;
    try {
      alreadyBeenHere = window.sessionStorage.getItem(PLAYED_KEY) === '1';
    } catch {
      // Private browsing can refuse storage. Replaying the entrance is a far
      // better failure than throwing on the first screen.
    }
    if (alreadyBeenHere) return;

    try {
      window.sessionStorage.setItem(PLAYED_KEY, '1');
    } catch {
      // As above.
    }

    setArrived(true);

    /*
     * Somebody who has asked for less movement, or somebody whose room has been
     * standing there long enough that a jump would read as a fault, get the same
     * thing: the reveal without the entrance. They arrive at it for different
     * reasons and the correct behaviour is identical, so it is one branch.
     *
     * `arrived` is set above either way — the greeting still types, because that
     * is Tony answering rather than the room assembling itself.
     */
    const still =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      roomOnScreenForMs() > ENTRANCE_STALE_AFTER_MS;

    if (still) {
      // No entrance at all. The edges still appear, because knowing what you
      // can touch is information, not decoration.
      setRevealed(true);
      timers.current.push(
        setTimeout(() => {
          setRevealed(false);
        }, REVEAL_FOR_MS),
      );
      return clear;
    }

    setEntering(true);
    timers.current.push(
      setTimeout(() => {
        setEntering(false);
      }, ENTRANCE_MS + 200),
      setTimeout(() => {
        setRevealed(true);
      }, REVEAL_AT_MS),
      setTimeout(() => {
        setRevealed(false);
      }, REVEAL_AT_MS + REVEAL_FOR_MS),
    );

    return clear;
  }, []);

  return (
    <ArrivalContext.Provider
      value={{ arrived, entering, revealed, reveal, speaking, setSpeaking }}
    >
      {/*
        * One class on one wrapper drives the whole sequence. The alternative —
        * every animated part checking a hook — would make each of them a client
        * component, which would drag the greeting, the receipt and the board
        * across the boundary with them for no benefit.
        */}
      <div
        className={`contents ${entering ? 'arriving' : ''} ${revealed ? 'showing-taps' : ''} ${
          speaking ? 'speaking' : ''
        }`}
      >
        {children}
      </div>
    </ArrivalContext.Provider>
  );
}

/**
 * "Where can I tap?", answered on request.
 *
 * Small, quiet, and by the counter rather than floating over the room. It is a
 * genuine affordance rather than a debug switch: a room that hides its verbs is
 * only charming until somebody cannot find the way out.
 */
export function ShowInteractables() {
  const { reveal } = useArrival();

  return (
    <button
      type="button"
      onClick={reveal}
      className={`flex h-11 min-w-[44px] shrink-0 items-center justify-center px-2 ${TYPE.eyebrow} whitespace-nowrap text-ink-100/45 transition-colors active:text-amber-mid`}
    >
      look around
    </button>
  );
}
