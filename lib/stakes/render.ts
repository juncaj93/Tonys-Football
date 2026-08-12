import { type FactPacket } from '@/lib/slice/packet';
import { validateProse } from '@/lib/slice/validate';

import {
  CLAIMS,
  ENTRY_VERDICTS,
  LINE_CONTEXT,
  VERDICTS,
  fill,
  houseTemplates,
} from './copy';
import { type Entry, type Presentation, type Resolution, type Stake } from './model';

/**
 * The words on the chalkboard.
 *
 * ## Curated, and checked by the newspaper's own validator
 *
 * `16 §10` limits generative text to the Slice. Everything a stake says is a
 * template from `copy.ts` with named values substituted in, and the rendered
 * sentence then goes through `lib/slice/validate.ts` against the stake's declared
 * allowed sets — the identical gate the Slice and Tony's stats aside pass.
 *
 * Sharing the validator rather than writing a second one is the point, and the
 * reasoning is `aside.ts`'s: a second one drifts, and it drifts on the quieter
 * surface. It also buys something specific here for free. The banned-term scan
 * already refuses `odds`, `win probability`, `likely`, `favourite to` and `on
 * pace for` — so *"do not pretend to be sportsbook odds"* is not a style note
 * anybody has to remember. **A line reaching for bookmaker language is refused by
 * a test that already exists.**
 *
 * ## A refused line is silence, never a softened one
 *
 * `renderStake` returns null rather than degrading. The chalkboard's quiet state
 * is designed and looks right, so falling back to it costs nothing — and a
 * half-checked claim about somebody's season costs a great deal.
 *
 * ## Where every number comes from
 *
 * The stake's `factRefs.values` and its resolution's `evidence.values`. Nothing
 * here computes, rounds, compares or formats a number: they arrive already
 * written the way `writePoints` writes them, and the validator refuses any digit
 * that did not.
 */

/** One rendered chalkboard, ready to put on the sign. */
export interface ChalkCopy {
  /** The claim, in Tony's voice. Always present. */
  readonly line: string;
  /** How it went, once it has. Null while it is still open. */
  readonly verdict: string | null;
  /** The recomputable sentence behind the verdict. Null while open. */
  readonly evidence: string | null;
  /**
   * One plain sentence of context, for a personal line.
   *
   * Null on every other stake and on a line with nothing to count. It is checked
   * by the same validator as the claim, against the same declared sets — the
   * counts were frozen into the stake's terms at authoring, so the sentence
   * cannot introduce a number the offer did not carry.
   */
  readonly context: string | null;
}

/**
 * The packet a chalkboard line is checked against.
 *
 * The stake's own declared sets, in the shape the validator expects. `aside.ts`
 * narrows a real packet; this builds one directly, because a stake is not about
 * one week's stories and there is no packet to narrow — the stake declared its
 * allowed values at authoring time, which is the same guarantee arrived at from
 * the other side.
 */
export function packetFor(stake: Stake, extraNumbers: readonly string[] = []): FactPacket {
  return {
    season: stake.season,
    week: stake.week,
    weekType: 'regular',
    finalized: true,
    lead: null,
    rest: [],
    scoreboard: [],
    suppressed: [],
    demoted: [],
    quiet: false,
    allowedNumbers: [...new Set([...stake.allowedNumbers, ...extraNumbers])].sort(),
    allowedNames: [...stake.allowedNames].sort(),
    refusal: null,
  };
}

/**
 * Render one stake, or nothing.
 *
 * Null on any of: an unknown variant, a fact the template needed and the stake
 * did not carry, or a rendered sentence the validator refuses. None of those is
 * softened and none is an error — the board goes quiet, which is a state this
 * product designed on purpose.
 */
export function renderStake(input: {
  readonly stake: Stake;
  readonly resolution: Resolution | null;
  readonly presentation: Presentation;
}): ChalkCopy | null {
  const { stake, resolution } = input;

  const template = CLAIMS[stake.variant];
  if (template === undefined) return null;

  const line = fill(template, stake.factRefs.values);
  if (line === null) return null;

  const verdict =
    resolution === null ? null : (VERDICTS[`${stake.kind}:${resolution.outcome}`] ?? null);

  /*
   * A settled stake with no verdict string is a defect, not a quiet board.
   *
   * The mapping is total against the outcomes the database will let a resolution
   * hold, and `stakes.test.ts` asserts it — so reaching here means a new outcome
   * shipped without copy. Refusing is right: the whole point of a resolved
   * chalkboard is that it says how it went.
   */
  if (resolution !== null && verdict === null) return null;

  const evidence = resolution?.evidence.statement ?? null;

  /*
   * The explainer, when the stake froze the counts to build it. `fill` returns
   * null on a missing substitution, which is the honest outcome for a line
   * authored before there was a window to speak of.
   */
  const context = fill(LINE_CONTEXT, stake.factRefs.values);

  /*
   * The evidence sentence carries numbers the *stake* never declared — the
   * winning score, how many cleared the line — because it is a claim about the
   * week rather than about the offer. They are admitted from the resolution's own
   * stored values, which is the discipline `AsideFact` applies: use the fact's own
   * values so the question stays the useful one, *did the prose introduce
   * something the fact did not supply?*
   *
   * Names are admitted the same way, and only those: a claimant or a
   * record-breaker in `values` was resolved out of a publishable week, so the
   * publication boundary has already passed over them.
   *
   * **Ids are not.** `claimantId` is a UUID the resolver stores so a payout can
   * point at a row rather than at a display string; it is machinery, not prose,
   * and admitting it would put a UUID on the list of things a renderer is
   * permitted to print.
   */
  const values = Object.entries(resolution?.evidence.values ?? {})
    .filter(([key]) => !key.endsWith('Id'))
    .map(([, value]) => value);
  const packet = {
    ...packetFor(
      stake,
      values.filter((value) => /\d/.test(value)),
    ),
    allowedNames: [
      ...new Set([...stake.allowedNames, ...values.filter((value) => !/\d/.test(value))]),
    ].sort(),
  };

  const texts = [line, verdict ?? '', evidence ?? '', context ?? ''].filter(
    (text) => text !== '',
  );

  /*
   * Checked against the **whole** curated vocabulary, not the templates this
   * sentence came from.
   *
   * Passing only its own source would let a rendered string vouch for its own
   * capitalised words — a layer marking its own homework. `houseWords()` applies
   * the same rule to the Slice's tables: if the renderer can print it, the
   * checker has to be able to see all of it.
   */
  if (!validateProse(texts, packet, houseTemplates()).publishable) return null;

  return { line, verdict, evidence, context };
}

/** What a manager's own pick says, once it has settled. Null while it is open. */
export function renderEntry(entry: Entry | null): string | null {
  if (entry === null || entry.outcome === null) return null;
  return ENTRY_VERDICTS[entry.outcome];
}
