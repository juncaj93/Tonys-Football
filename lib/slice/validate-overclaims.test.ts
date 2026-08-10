import { describe, expect, it } from 'vitest';

import { HISTORICAL_OVERCLAIMS } from '@/lib/stats/scope';

import { type FactPacket } from './packet';
import { validateProse } from './validate';

/**
 * The four historical overclaims, at the gate every surface passes through.
 *
 * `docs/DATA_AUDIT.md §15` banned `all-time`, `ever`, `in league history` and
 * `franchise record` on 2026-07-29 and recorded them as *"documented, not
 * built"* — the validator did not exist yet, so the terms went into a Markdown
 * file and stayed there. This is the gate.
 *
 * It is a separate file from the Slice's own suite deliberately: the terms are
 * owned by `lib/stats/scope.ts`, and the module that derives a scoped fact is
 * the one that should decide how far it may claim to reach.
 *
 * ## Why the wording is the only thing that can catch this
 *
 * Every other banned term names something the product does not have — a kicker,
 * a win probability, a casino. These name something it *nearly* has. The chain
 * terminates at 2024 (`16 §12`) and the league is older, so both sentences below
 * come out of the same correct query over the same correct rows:
 *
 * > Brandon posted 183.94, the highest score **ever**.
 * > Brandon posted 183.94, the highest score **since 2024**.
 *
 * The number is right in both. Nothing downstream of the derivation can tell
 * them apart, which is why the check is on the sentence.
 */

/** A packet allowing the numbers and names the sentences below actually use. */
const PACKET: FactPacket = {
  season: 2024,
  week: 9,
  weekType: 'regular',
  finalized: true,
  lead: null,
  rest: [],
  scoreboard: [],
  suppressed: [],
  demoted: [],
  quiet: false,
  allowedNumbers: ['183.94', '2024', '9'],
  allowedNames: ['Brandon'],
  refusal: null,
};

describe('the historical-overclaim scan', () => {
  it('refuses each of the four terms in prose the packet otherwise allows', () => {
    for (const sentence of [
      'Brandon posted 183.94, the highest score all-time.',
      'Brandon posted 183.94, the highest score ever.',
      'Brandon posted 183.94, the highest score in league history.',
      'Brandon posted 183.94, a franchise record.',
    ]) {
      const verdict = validateProse([sentence], PACKET);
      expect(verdict.publishable, sentence).toBe(false);
      expect(verdict.violations.some((violation) => violation.kind === 'banned-term')).toBe(true);
    }
  });

  it('passes the identical claim once it is scoped', () => {
    const verdict = validateProse(['Brandon posted 183.94, the highest score since 2024.'], PACKET);
    expect(verdict.publishable).toBe(true);
  });

  it('explains why, so a reviewer is not left guessing', () => {
    const [violation] = validateProse(['the highest score ever'], PACKET).violations.filter(
      (entry) => entry.kind === 'banned-term',
    );
    expect(violation).toBeDefined();
    if (violation?.kind === 'banned-term') expect(violation.why).toContain('2024');
  });

  it('does not fire on ordinary prose containing a banned word as a fragment', () => {
    /*
     * `never`, `however` and `severe` all contain "ever". A scan without word
     * boundaries would refuse most of the paper.
     *
     * Asserted on the **banned-term** violations specifically rather than on
     * `publishable`, because the validator's other rules are in play here and
     * are not what this file is about — `However` at the start of a sentence is
     * an unknown capitalised name unless a template supplied it, which is
     * long-standing behaviour and correct.
     */
    const verdict = validateProse(
      ['Brandon never trailed. However close it looked, 183.94 held.'],
      PACKET,
    );
    expect(verdict.violations.filter((violation) => violation.kind === 'banned-term')).toEqual([]);

    // And with nothing else to trip over, it passes outright.
    expect(validateProse(['Brandon never trailed.'], PACKET).publishable).toBe(true);
  });

  it('reaches the validator from `lib/stats/scope.ts` rather than a second copy', () => {
    // If somebody re-lists the terms inside the validator, this suite goes on
    // passing while the two lists drift. The identity check is the only thing
    // that makes "one list" a property rather than an intention.
    expect(HISTORICAL_OVERCLAIMS).toHaveLength(4);
    for (const { pattern } of HISTORICAL_OVERCLAIMS) {
      const sentence = `Brandon ${pattern.source.replace(/\\b|\[- \]/g, ' ')}`;
      expect(validateProse([sentence], PACKET).publishable).toBe(false);
    }
  });
});
