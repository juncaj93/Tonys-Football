/**
 * Known-defect quarantine for the visual gate.
 *
 * ## Why this exists, and why it is not a mute
 *
 * Visual debt 12 is an intermittent React `#418` that has appeared under **six
 * different state names across five routes and three widths**, never twice in
 * the same place, at a rate of roughly **one per two hundred captures**. A full
 * sweep is 261 captures, so the gate had better-than-even odds of failing *any*
 * pull request for a reason that had nothing to do with it — twice in a row on
 * PR #59, on `/admin/slice` and then `/back-hall`, neither of which that branch
 * touched.
 *
 * A gate that fails a coin flip regardless of the change is not protecting
 * anything. It is training everybody to bypass the visual gate, and bypassing
 * the visual gate is exactly how the four regressions named in the header of
 * `.github/workflows/visual-qa.yml` shipped.
 *
 * ## The ceiling is what keeps it a gate
 *
 * A quarantined message is **recorded, counted and printed**, and the run still
 * fails if more than `QUARANTINE_CEILING` of them appear. That number is the
 * whole design:
 *
 * > A newly introduced structural mismatch is **deterministic**. It fires on
 * > every capture of the state it affects — at minimum three times, once per
 * > width — so it clears a ceiling of two on its first appearance.
 *
 * The background rate does not. Across five sweeps of one build the observed
 * counts were 2, 1, 1, 1, 1.
 *
 * ## And the shape is narrow on purpose
 *
 * Only the **minified** `#418` with `args[]=HTML` is quarantined. Everything
 * else hydration-shaped still fails on sight:
 *
 * - `args[]=text` is a *content* mismatch, a different defect;
 * - `#419`–`#425` are different errors;
 * - a **dev build's** message names the element it choked on, and that is the
 *   one sighting this defect has never had. It must be as loud as possible.
 *
 * ## It is meant to be deleted
 *
 * `visual-qa-quarantine.test.ts` asserts the table holds exactly one entry. A
 * second known-flaky check is not a thing to accumulate quietly; it is a signal
 * that the gate has stopped being trusted, and it should force a conversation
 * rather than an append.
 */

export interface QuarantineEntry {
  /** The visual-debt number in `docs/VISUAL_DEBT.md`. */
  readonly debt: number;
  /** What is being tolerated, in one line, for whoever reads the run output. */
  readonly why: string;
  /** Deliberately narrow — see the header. */
  readonly shape: RegExp;
}

/**
 * More than this many quarantined messages in one run is a failure.
 *
 * Two, because a deterministic mismatch produces at least three (one per
 * supported width) and the observed background is one or two.
 */
export const QUARANTINE_CEILING = 2;

/**
 * **One entry, for visual debt 16, armed on commissioner approval 2026-08-06.**
 *
 * The one entry this table previously held was visual debt 12, and it turned out
 * not to be a product defect at all: the driver's own screenshot was writing
 * `caret-color: transparent` into the page while React hydrated it. The camera
 * was the defect (`docs/VISUAL_DEBT.md` 12, `scripts/visual-qa-capture.ts`), the
 * entry was deleted, and the table sat empty.
 *
 * **Debt 16 is the residual that survived that fix**, and it is a different
 * thing: rarer, still unexplained, and for its first two days apparently
 * hosted-only — a claim 2026-08-08 retired, see below. What earned it this row is that on PR
 * #69 it failed the gate twice, once on `/timeline` and once on `/` during
 * `banner-completed`, and **that pull request changed no file that renders `/`**.
 * That is the header's own test of a gate that has stopped protecting anything:
 * a failure with nothing to do with the change under review.
 *
 * What is known, and it is deliberately little:
 *
 * - **Hosted:** 4 sightings across roughly 2,100 captures, never twice in the
 *   same place.
 * - **Local, unthrottled:** was 0 in ~2,400 captures over seven sweeps, and
 *   **that is no longer true.** A 279-capture local production sweep on
 *   2026-08-08 produced one, which is the first local sighting this defect has
 *   ever had. *"Reproduced only on hosted runners"* was the load-bearing claim
 *   in the entry below and it is now retired: the environment is not the
 *   variable. The rate is unchanged in order of magnitude, so nothing here is
 *   reopened — but a false reason in a guard's justification is worse than a
 *   thin one.
 * - **Local, 8× CPU throttle against the same production build the runner
 *   uses:** 0 in 180 captures, every response asserted 200. So *slowness alone
 *   does not cause it* — which is the obvious explanation, now eliminated. The
 *   local sighting above was **unthrottled**, which is consistent with that.
 * - The production bundle names no element, and the census is taken after
 *   React's recovery, so only a **dev build** can say where. That sighting has
 *   never been had, which is why the dev message must never be tolerated.
 *
 * This row is meant to be deleted, and deleting it is the point of `docs/`
 * VISUAL_DEBT.md`'s entry 16 staying open.
 */
export const QUARANTINE: readonly QuarantineEntry[] = [
  {
    debt: 16,
    why:
      'Visual debt 16: an intermittent, unexplained React #418 structural mismatch. ' +
      'Hosted, and since 2026-08-08 local too: 1 in a 279-capture production sweep. ' +
      'Counted and printed, never muted — more than the ceiling still fails the run.',
    /*
     * Narrow on purpose, and every clause is load-bearing:
     *
     * - `Minified` — a dev build's message names the element it choked on, and
     *   that is the one sighting this defect has never had. It must stay loud.
     * - `#418` — `#419`–`#425` are different errors.
     * - `args[]=HTML` — `args[]=text` is a *content* mismatch, a different
     *   defect. The tree changed, or the sentence did; not both.
     */
    shape: /Minified React error #418\b[\s\S]*args\[\]=HTML/,
  },
];

/** The entry that tolerates this message, if any. */
export function quarantineFor(text: string): QuarantineEntry | undefined {
  return QUARANTINE.find((entry) => entry.shape.test(text));
}
