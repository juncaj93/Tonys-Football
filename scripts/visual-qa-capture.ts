import { type PageScreenshotOptions } from 'playwright';

/**
 * How the driver photographs a page.
 *
 * ## Why this is a module rather than an object literal at the call site
 *
 * So a test can assert on it. `visual-qa.mts` runs its sweep on import, so
 * nothing can import it to check what it does — the same reason
 * `visual-qa-quarantine.ts` is separate.
 *
 * ## `caret: 'initial'` is the whole point
 *
 * Playwright's screenshot defaults to `caret: 'hide'`, and the way it hides a
 * text caret is to write `caret-color: transparent !important` into the
 * **inline style of every element**, take the picture, and put the style back.
 * Measured with a `MutationObserver` on a single `<input>`:
 *
 * ```
 * default (caret: 'hide')  -> ["caret-color: transparent !important;", ""]
 * caret: 'initial'         -> []
 * ```
 *
 * A screenshot that lands while React is hydrating therefore hands React a
 * `style` attribute the server never sent, and React reports a mismatch. **That
 * is visual debt 12**, and it was never a defect in this product — the sweep
 * that finally named the element named `<input name="note">` carrying
 * `style={{caret-color:"transparent"}}`, on a screen whose own code sets no
 * caret colour anywhere.
 *
 * It also answers the one thing about debt 12 that never fitted: **144 targeted
 * document loads could not reproduce what a sweep hit roughly every 209
 * captures.** Those probes loaded the pages. They did not photograph them, and
 * the camera was the cause.
 *
 * The cost is that a *focused* text field shows its caret in a capture. Nothing
 * this driver focuses is a text field, and a visible caret in a focused input is
 * the truth about that input in any case.
 */
export const CAPTURE: PageScreenshotOptions = {
  caret: 'initial',
};
