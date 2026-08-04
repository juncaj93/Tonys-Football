import { existsSync } from 'node:fs';

import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CAPTURE } from './visual-qa-capture';

/**
 * The camera does not touch the page.
 *
 * ## What this is protecting
 *
 * Visual debt 12 — an intermittent React hydration mismatch chased across two
 * milestones, six states, five routes and three widths, with no reproduction and
 * no cause in any application component — was **the driver photographing the
 * page while React was hydrating it**.
 *
 * Playwright's screenshot defaults to `caret: 'hide'`, and it hides the caret by
 * writing `caret-color: transparent !important` into the inline style of every
 * element and then removing it. React, mid-hydration, finds a `style` attribute
 * the server never sent.
 *
 * ## Why this test drives a real browser
 *
 * Because asserting `CAPTURE.caret === 'initial'` would be a test of a spelling.
 * The claim worth defending is *behavioural* — **taking a picture must not
 * mutate the DOM** — and the only thing that can answer it is the same browser
 * doing the same thing the driver does.
 *
 * The second case is deliberately the inverse: it asserts Playwright's **default
 * does** mutate. That is what makes this a regression test rather than a
 * tautology — it fails on the pre-fix behaviour, and it will start failing if a
 * future Playwright stops needing the option, which is the moment to delete it.
 */

/**
 * Resolve a browser the same way the driver does, so this runs wherever the
 * driver can run.
 *
 * `scripts/visual-qa.mts` uses `PLAYWRIGHT_CHROMIUM` when it points at a real
 * file and otherwise lets Playwright use its own install. A guard that demanded
 * the environment variable would have skipped this test in CI — where the
 * variable is unset and the browser is present — which is the one place a
 * regression test most needs to run.
 */
const PINNED = process.env['PLAYWRIGHT_CHROMIUM'] ?? '';
const EXECUTABLE = existsSync(PINNED) ? PINNED : chromium.executablePath();
const hasBrowser = EXECUTABLE !== '' && existsSync(EXECUTABLE);

let browser: Browser | null = null;

beforeAll(async () => {
  if (hasBrowser) browser = await chromium.launch({ executablePath: EXECUTABLE });
});

afterAll(async () => {
  await browser?.close();
});

/** Every inline-style change made to the input while `shoot` runs. */
async function mutationsDuring(
  shoot: (page: Awaited<ReturnType<NonNullable<typeof browser>['newPage']>>) => Promise<unknown>,
): Promise<string[]> {
  const page = await browser!.newPage();
  try {
    // Tall, so the capture takes long enough to overlap something — which is
    // exactly the race the real sweep loses about once in every 209 captures.
    await page.setContent('<div style="height:9000px"></div><input type="text" name="note" />');
    await page.evaluate(() => {
      const seen: (string | null)[] = [];
      (window as unknown as { __seen: (string | null)[] }).__seen = seen;
      const el = document.querySelector('input');
      if (el === null) throw new Error('the fixture lost its input');
      new MutationObserver(() => seen.push(el.getAttribute('style'))).observe(el, {
        attributes: true,
        attributeFilter: ['style'],
      });
    });

    await shoot(page);

    return await page.evaluate(
      () => (window as unknown as { __seen: string[] }).__seen,
    );
  } finally {
    await page.close();
  }
}

describe.skipIf(!hasBrowser)('the visual driver never edits the page it photographs', () => {
  it('makes no DOM change when capturing with the driver’s options', async () => {
    const seen = await mutationsDuring((page) => page.screenshot({ ...CAPTURE, fullPage: true }));
    expect(seen, `the camera wrote to the DOM: ${JSON.stringify(seen)}`).toEqual([]);
  });

  it('confirms the default would edit it — this is why the option is set', async () => {
    /*
     * The pre-fix behaviour, pinned. If this ever stops mutating, Playwright has
     * changed how it hides carets and `CAPTURE.caret` can be reconsidered — so a
     * failure here is a prompt to re-read the decision, not a bug.
     */
    const seen = await mutationsDuring((page) => page.screenshot({ fullPage: true }));
    expect(seen.some((style) => style?.includes('caret-color') === true)).toBe(true);
  });
});
