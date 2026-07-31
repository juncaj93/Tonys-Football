import { type FactPacket } from './packet';
import { houseWords, type Edition } from './render';

/**
 * The deterministic validator — the gate every renderer passes through.
 *
 * `16 §9`, verbatim: *"Validation is deterministic. Every number and proper noun
 * must match an allowed value in the fact packet. Banned-term scan: kicker
 * references, invented quotation marks, win-probability language, unreleased
 * features. **An LLM is never the sole validator.**"*
 *
 * ## It validates the *output*, and knows nothing about how it was made
 *
 * That is the point. The template renderer and a future language model produce
 * the same shape and are checked by the same rules, so the safety property does
 * not depend on which one ran. A validator that trusted the deterministic
 * renderer because it is deterministic would have to be rewritten the day the
 * second renderer arrives — and rewritten under pressure, with generated prose
 * already in front of somebody.
 *
 * ## Why "every number" is checkable at all
 *
 * Because the packet declares its allowed values as data (`lib/slice/packet.ts`).
 * This module never asks *is that true* — it asks *was that permitted*, which is
 * a set membership test and cannot itself be wrong about football.
 */

export type Violation =
  /** A number in the prose that the packet did not allow. */
  | { readonly kind: 'unknown-number'; readonly value: string }
  /** A capitalised word that is not an allowed name and not ordinary prose. */
  | { readonly kind: 'unknown-name'; readonly value: string }
  /** A term the Slice may never use. */
  | { readonly kind: 'banned-term'; readonly value: string; readonly why: string }
  /** A quotation mark. Tony is never quoted by a renderer. */
  | { readonly kind: 'invented-quote'; readonly value: string };

export interface Verdict {
  readonly publishable: boolean;
  readonly violations: readonly Violation[];
}

/**
 * Terms the Slice may never print, and why each one is here.
 *
 * Every entry is a rule from `16` made mechanical, not a taste preference.
 */
const BANNED: readonly { readonly pattern: RegExp; readonly why: string }[] = [
  {
    pattern: /\bkickers?\b|\bfield goals?\b|\bextra points?\b|\bPAT\b/i,
    why: 'the league has no kickers (`CLAUDE.md`), so a kicker reference is always false',
  },
  {
    pattern: /\bwin probability\b|\bchance(?:s)? of winning\b|\bodds\b|\bprojected to\b|\bexpected wins?\b/i,
    why: 'win-probability language implies a model the product does not have',
  },
  {
    pattern: /\bcasino\b|\broulette\b|\bblackjack\b|\bslots?\b|\bbasement\b|\bauction\b|\bvending machine\b/i,
    why: 'an unreleased feature named in print is a promise the shop cannot keep',
  },
  {
    pattern: /\blikely\b|\bshould win\b|\bfavou?rite to\b|\bon pace for\b/i,
    why: 'a prediction dressed as a fact; the chalkboard is where predictions live',
  },
];

/**
 * Numbers as written: `154.42`, `42`, `2025`. Not the ones inside a word.
 *
 * The trailing lookahead rejects **word characters only**, deliberately. It was
 * `(?![\w.])`, which also rejected a following period — and a period is what
 * follows a number at the end of a sentence. `Nick beat Matt Lee, 154.42 to
 * 103.92.` therefore matched `154.42` and **skipped `103.92` entirely**, so the
 * validator's central rule was silently not checking the last number in most
 * sentences. It passed every test that happened to put a number mid-clause.
 *
 * The lookbehind keeps its `.` because `103.92` must not also be scanned as a
 * bare `92` once the full token has been consumed.
 */
const NUMBER = /(?<![\w.])\d+(?:\.\d+)?(?!\w)/g;

/**
 * Capitalised words that are ordinary English rather than somebody's name.
 *
 * **Derived from the curated templates**, not hand-listed — `houseWords()` reads
 * the strings `render.ts` can actually emit. A hand-list goes stale the first
 * time a template gains a word, and it goes stale silently: the validator starts
 * refusing the product's own default renderer.
 *
 * `Tony` is added separately because he is a person the Slice may name without
 * the packet allowing him — he is the paper's voice, not one of its subjects.
 */
const NOT_A_MANAGER: ReadonlySet<string> = new Set([...houseWords(), 'Tony', 'Tonys']);

const CAPITALISED = /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\b/g;

function scan(text: string, packet: FactPacket, into: Violation[]): void {
  if (text === '') return;

  for (const match of text.matchAll(NUMBER)) {
    const value = match[0];
    if (!packet.allowedNumbers.includes(value)) {
      into.push({ kind: 'unknown-number', value });
    }
  }

  /*
   * Two-word names first, then single words, so "Matt Lee" is matched whole and
   * neither half is reported as an unknown name. `CAPITALISED` already prefers
   * the longer form; this checks the pieces of an allowed name are not then
   * re-reported when the regex splits them at a line boundary.
   */
  const nameParts = new Set(packet.allowedNames.flatMap((name) => name.split(' ')));

  for (const match of text.matchAll(CAPITALISED)) {
    const value = match[0];
    if (packet.allowedNames.includes(value)) continue;
    if (NOT_A_MANAGER.has(value)) continue;
    if (nameParts.has(value)) continue;
    into.push({ kind: 'unknown-name', value });
  }

  for (const { pattern, why } of BANNED) {
    const found = pattern.exec(text);
    if (found !== null) into.push({ kind: 'banned-term', value: found[0], why });
  }

  /*
   * No quotation marks, of any kind.
   *
   * `16 §9` bans *"invented quotation marks"*, and the honest reading is the
   * strict one: the Slice has no interviews and nobody in this league said
   * anything on the record. A quoted sentence is fabricated testimony even when
   * every number around it is right — and it is the single most convincing thing
   * a language model will offer to add.
   */
  for (const match of text.matchAll(/["“”]/g)) {
    into.push({ kind: 'invented-quote', value: match[0] });
  }
}

/**
 * Check a rendered edition against the packet it claims to be about.
 *
 * An edition with nothing to print is publishable: the refusal lines are house
 * copy, contain no facts, and saying *"nothing happened that week worth the
 * ink"* is the shop telling the truth.
 */
/**
 * Every piece of prose an issue puts in front of a reader.
 *
 * Enumerated in one place so *"the validator checks the whole page"* is a fact
 * about this list rather than about whoever last edited `validateEdition`. A
 * field added to `Edition` and forgotten here would be unchecked prose on a
 * published surface — which is the shape of every validation failure this
 * project has shipped, in every subsystem, without exception.
 *
 * The scoreboard is included. Two numbers off a stored row assert nothing on
 * their own, but a name beside them does: a results table naming somebody who may
 * not be published is exactly the leak the boundary exists to stop, and it is the
 * surface nobody thinks to check.
 */
function prose(edition: Edition): readonly string[] {
  return [
    edition.dateline,
    edition.headline,
    edition.deck ?? '',
    edition.body,
    edition.column,
    ...edition.secondary.flatMap((story) => [story.headline, story.deck ?? '', story.body]),
    ...edition.scoreboard.flatMap((row) => [
      row.leftName,
      row.leftPoints,
      row.rightName,
      row.rightPoints,
    ]),
  ];
}

export function validateEdition(edition: Edition, packet: FactPacket): Verdict {
  const violations: Violation[] = [];

  if (edition.nothingToPrint !== null) {
    // Still scanned for banned terms and quotes — house copy is copy — but the
    // week's numbers are not in play because there are none. The dateline and
    // the column are scanned too: both print on an empty rack.
    for (const text of [edition.nothingToPrint, edition.dateline, edition.column]) {
      for (const { pattern, why } of BANNED) {
        const found = pattern.exec(text);
        if (found !== null) violations.push({ kind: 'banned-term', value: found[0], why });
      }
      for (const match of text.matchAll(/["“”]/g)) {
        violations.push({ kind: 'invented-quote', value: match[0] });
      }
    }
    return { publishable: violations.length === 0, violations };
  }

  for (const text of prose(edition)) scan(text, packet, violations);

  return { publishable: violations.length === 0, violations };
}
