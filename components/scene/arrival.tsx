'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';

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
 * The reveal is deliberately separate from the entrance in the reduced-motion
 * case: somebody who has asked for less movement still needs to know which
 * parts of the room are things, so they get the warm edges without the breath.
 */

const ENTRANCE_MS = 900;
const REVEAL_AT_MS = 1600;
const REVEAL_FOR_MS = 3300;
const PLAYED_KEY = 'tonys:arrived';

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

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
      className="flex h-11 min-w-[44px] shrink-0 items-center justify-center px-2 font-display text-[9px] whitespace-nowrap text-ink-100/45 transition-colors active:text-amber-mid"
    >
      look around
    </button>
  );
}
