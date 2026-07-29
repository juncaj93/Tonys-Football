'use client';

import { useEffect, useState } from 'react';

import { useArrival } from '@/components/scene/arrival';

/**
 * Tony saying something.
 *
 * A line of text sitting in a box near a man is not obviously coming *out* of
 * him. So on arrival it is typed, at the speed of somebody talking, and he
 * shifts his weight a pixel at a time while it runs. Between them there is no
 * ambiguity about who is speaking — which is the entire point, and costs one
 * interval and one CSS keyframe.
 *
 * ## Only when he greets you
 *
 * Typing runs once, on the arrival that already plays once per session. Coming
 * back from the display case to watch a sentence reassemble itself would be an
 * animation between you and information you have already read.
 *
 * ## It never withholds the words
 *
 * The full line is rendered on the server, and it stays in the DOM the whole
 * time in a span the screen reader uses. What types is a decorative copy marked
 * `aria-hidden`, so assistive technology reads a finished sentence rather than
 * a stuttering one, and a browser that runs no JavaScript at all shows the line
 * complete. Under `prefers-reduced-motion` there is no typing.
 *
 * The pace is bounded rather than fixed: long lines type faster so that nobody
 * waits four seconds for a joke.
 */

/** When he starts, relative to the room appearing. Just after he settles. */
const STARTS_AT_MS = 1150;
const MS_PER_CHARACTER = 22;
const LONGEST_MS = 1700;

export function SpokenLine({
  children,
  retypeOnChange = false,
}: {
  children: string;
  /**
   * Type this line even though the arrival is over.
   *
   * The greeting types once, on arrival. A line Tony says *because you poked
   * him* has to type too — it is new information, and watching it appear is how
   * you know he answered — so the Toy passes this and remounts the component
   * with a `key`, which restarts the effect.
   */
  retypeOnChange?: boolean;
}) {
  const { arrived, setSpeaking } = useArrival();
  const [typed, setTyped] = useState<string | null>(null);

  useEffect(() => {
    if (!arrived && !retypeOnChange) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const step = Math.min(MS_PER_CHARACTER, LONGEST_MS / Math.max(children.length, 1));
    let index = 0;
    let ticker: ReturnType<typeof setInterval> | null = null;

    // A poked line answers immediately; the greeting waits for him to settle.
    const startsAt = retypeOnChange && !arrived ? 0 : STARTS_AT_MS;

    const begin = setTimeout(() => {
      setTyped('');
      setSpeaking(true);

      ticker = setInterval(() => {
        index += 1;
        setTyped(children.slice(0, index));

        if (index >= children.length) {
          if (ticker !== null) clearInterval(ticker);
          setSpeaking(false);
          setTyped(null);
        }
      }, step);
    }, startsAt);

    return () => {
      clearTimeout(begin);
      if (ticker !== null) clearInterval(ticker);
      setSpeaking(false);
      setTyped(null);
    };
  }, [arrived, children, retypeOnChange, setSpeaking]);

  // `typed === null` is the resting state: the finished line, exactly as the
  // server rendered it. Every path that is not actively typing lands here.
  if (typed === null) return <span>{children}</span>;

  return (
    <>
      <span className="sr-only">{children}</span>
      <span aria-hidden="true">
        {typed}
        <span className="caret" />
      </span>
    </>
  );
}
