import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SpokenText } from './spoken-line';

/**
 * The shape of Tony's line, asserted rather than intended.
 *
 * ## What this is guarding
 *
 * Visual debt 6: `npm run visual:qa` failed its console gate on React #418 — a
 * hydration mismatch — intermittently, at 390, on the parlor, on a pull request
 * containing no code. Two facts settle what it was:
 *
 *   - React's #418 carries an argument naming the *kind* of mismatch: `"text"`
 *     when a sentence differs between the server and the client, `"HTML"` when
 *     the element structure does. The failing run reported **`HTML`**.
 *   - `SpokenLine` was the only thing in the room that changed structure at all.
 *     Resting it was one `<span>`; typing it was two siblings with a caret
 *     nested inside the second. The swap ran on a timer, and on every parlor
 *     load after the first that timer was set to **zero**.
 *
 * A restructure is now impossible rather than unlikely: both states render the
 * same elements, and only the characters and one class name differ. This test
 * fails the build if that stops being true, which is the only way the guarantee
 * survives somebody tidying the resting branch back into a single span.
 */

/** Tag names and nesting, with every text node and attribute discarded. */
function skeleton(markup: string): string {
  return markup.replace(/<([a-z]+)[^>]*>/g, '<$1>').replace(/>[^<]*</g, '><');
}

describe('SpokenText', () => {
  const line = 'Tony nods at Alex and goes back to the oven.';

  it('renders the same element structure resting and mid-word', () => {
    const resting = skeleton(renderToStaticMarkup(<SpokenText line={line} typed={null} />));
    const typing = skeleton(renderToStaticMarkup(<SpokenText line={line} typed="Tony no" />));

    expect(typing).toBe(resting);
  });

  it('keeps the structure identical from the empty string to the full line', () => {
    const shapes = new Set(
      ['', 'T', 'Tony n', line.slice(0, -1), line].map((typed) =>
        skeleton(renderToStaticMarkup(<SpokenText line={line} typed={typed} />)),
      ),
    );

    expect(shapes.size).toBe(1);
  });

  it('shows the whole line at rest, so a browser running no JavaScript reads it', () => {
    const markup = renderToStaticMarkup(<SpokenText line={line} typed={null} />);

    // Twice: once for the screen reader, once visibly. Both are the full line.
    expect(markup.split(line)).toHaveLength(3);
  });

  it('carries the finished line for assistive technology while typing', () => {
    const markup = renderToStaticMarkup(<SpokenText line={line} typed="Tony no" />);

    expect(markup).toContain(`<span class="sr-only">${line}</span>`);
    expect(markup).toContain('aria-hidden="true"');
  });

  it('hides the caret at rest and blinks it while typing', () => {
    expect(renderToStaticMarkup(<SpokenText line={line} typed={null} />)).toContain(
      'class="caret-idle"',
    );
    expect(renderToStaticMarkup(<SpokenText line={line} typed="Tony" />)).toContain(
      'class="caret"',
    );
  });
});
