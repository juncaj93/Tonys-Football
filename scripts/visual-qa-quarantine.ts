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

export const QUARANTINE: readonly QuarantineEntry[] = [
  {
    debt: 12,
    why: 'the intermittent production #418 structure mismatch — six states, five routes, no reproduction',
    shape: /Minified React error #418\b[\s\S]*args\[\]=HTML/,
  },
];

/** The entry that tolerates this message, if any. */
export function quarantineFor(text: string): QuarantineEntry | undefined {
  return QUARANTINE.find((entry) => entry.shape.test(text));
}
