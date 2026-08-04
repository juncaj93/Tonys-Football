import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The visual driver's in-page hydration reporter, checked from outside it.
 *
 * ## Why this is a test rather than trust
 *
 * `HYDRATION_REPORTER` is a **string** — a whole script, with an interpolated
 * regex, injected into every document by `addInitScript`. Nothing typechecks it
 * and nothing lints it. A syntax error in it fails **silently**: the page simply
 * never calls the binding, the sweep passes or fails exactly as before, and the
 * next sighting of visual debt 12 arrives with no evidence attached. The one
 * thing the reporter exists to prevent is the one thing its breakage looks like.
 *
 * So the string is parsed here, and its classifier is exercised against the
 * message this repository has actually seen five times.
 *
 * ## And the gate must not quietly become the diagnostic
 *
 * The reporter hooks the *page's* `console.error`. That never sees the errors
 * the **browser** emits — a failed request, a CSP refusal, a decode failure —
 * which is why `page.on('console')` and `page.on('pageerror')` remain the gate
 * and the reporter only enriches what they catch. Deleting either listener in
 * favour of the tidier in-page one would narrow the gate without changing a
 * single assertion, so the listeners are asserted present.
 */

const DRIVER = readFileSync(path.join(process.cwd(), 'scripts', 'visual-qa.mts'), 'utf8');

/** The classifier, lifted out of the driver rather than re-declared here. */
function hydrationShaped(): RegExp {
  const found = /const HYDRATION_SHAPED = (\/.*\/i);/.exec(DRIVER);
  if (found?.[1] === undefined) {
    throw new Error('could not find HYDRATION_SHAPED in scripts/visual-qa.mts');
  }
  const [, source] = found[1].match(/^\/(.*)\/i$/) ?? [];
  if (source === undefined) throw new Error(`HYDRATION_SHAPED is not a /…/i literal: ${found[1]}`);
  return new RegExp(source, 'i');
}

/** The injected script, with its one interpolation resolved. */
function reporterSource(): string {
  const opens = DRIVER.indexOf('const HYDRATION_REPORTER = `');
  if (opens === -1) throw new Error('could not find HYDRATION_REPORTER in scripts/visual-qa.mts');
  const body = DRIVER.slice(DRIVER.indexOf('`', opens) + 1);
  const closes = body.indexOf('`;');
  if (closes === -1) throw new Error('HYDRATION_REPORTER template literal is unterminated');
  return body.slice(0, closes).replace('${String(HYDRATION_SHAPED)}', String(hydrationShaped()));
}

describe('the in-page hydration reporter', () => {
  it('is syntactically valid JavaScript', () => {
    // `new Function` parses without executing, which is what is being checked:
    // the script's own body references `window` and `document` and cannot run
    // here. A syntax error throws at construction.
    expect(() => new Function(reporterSource())).not.toThrow();
  });

  it('reports the document it is in, not the one the harness is looking at', () => {
    // The whole point of moving attribution into the page. If this ever reads
    // anything but `location`, the reporter is guessing again.
    expect(reporterSource()).toContain('location.pathname');
  });

  it('never throws out of console.error', () => {
    // It wraps a function every page calls. An exception escaping it would turn
    // a diagnostic into an outage on the screen it is diagnosing.
    const source = reporterSource();
    expect(source).toContain('console.error = ');
    expect(source.match(/catch/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('calls the original console.error as well as reporting', () => {
    // Swallowing the message would blind `page.on('console')`, which is the gate.
    expect(reporterSource()).toContain('original(...args)');
  });

  describe('the classifier', () => {
    const shaped = hydrationShaped();

    it('matches the production message this defect has actually produced', () => {
      expect(
        shaped.test(
          'Minified React error #418; visit https://react.dev/errors/418?args[]=HTML&args[]= ' +
            'for the full message or use the non-minified dev environment for full errors ' +
            'and additional helpful warnings.',
        ),
      ).toBe(true);
    });

    it('matches the development message, which names the element', () => {
      expect(
        shaped.test("Hydration failed because the server rendered HTML didn't match the client."),
      ).toBe(true);
    });

    it('matches the neighbouring recoverable errors', () => {
      for (const code of ['#419', '#420', '#421', '#422', '#423', '#424', '#425']) {
        expect(shaped.test(`Minified React error ${code};`), code).toBe(true);
      }
    });

    it('ignores errors that are not about hydration', () => {
      for (const message of [
        'Failed to load resource: the server responded with a status of 404',
        'Refused to connect because it violates the Content Security Policy',
        'TypeError: Cannot read properties of null',
        'Minified React error #185;',
      ]) {
        expect(shaped.test(message), message).toBe(false);
      }
    });
  });

  describe('the gate it enriches', () => {
    it('still listens for console errors from the browser itself', () => {
      expect(DRIVER).toContain("page.on('console'");
      expect(DRIVER).toContain("page.on('pageerror'");
    });

    it('still fails on every console error, enriched or not', () => {
      // The `fail('console', …)` call must not have grown a condition that lets
      // an unattributed error through.
      const reporting = /for \(const e of errors\.slice\(0, 5\)\) \{([\s\S]*?)\n {6}\}/.exec(DRIVER);
      expect(reporting).not.toBeNull();
      expect(reporting?.[1]).toContain("fail('console'");
      expect(reporting?.[1]).not.toMatch(/\bcontinue\b|\bif \(seen === undefined\) (?!\?)/);
    });
  });
});
