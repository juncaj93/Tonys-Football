import { HISTORICAL_OVERCLAIMS } from '@/lib/stats/scope';

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
  /*
   * Historical overclaims.
   *
   * `docs/DATA_AUDIT.md §15` listed `all-time`, `ever`, `in league history` and
   * `franchise record` as banned, and recorded them as **documented, not
   * built** — this validator did not exist on 2026-07-29, so the four terms
   * were written down and left to whoever remembered them.
   *
   * They are the subtlest failure the paper can produce. Every other banned
   * term names something the product does not have; these name something it
   * *nearly* has. The chain terminates at 2024 (`16 §12`) and the league is
   * older, so "the highest score ever" is produced by exactly the same correct
   * query as "the highest score since 2024" — the number is right, the
   * evidence is right, and the sentence is false. Nothing but the wording can
   * catch it, so the wording is checked.
   *
   * `lib/stats/scope.ts` owns the list and the approved alternatives, because
   * the module that derives a scoped fact is the one that should say how far it
   * reaches.
   */
  ...HISTORICAL_OVERCLAIMS,
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

/**
 * The two sets a piece of prose is checked against.
 *
 * Structural rather than `FactPacket`, because the preseason issue's packet is a
 * different shape carrying the same two lists (`lib/slice/preseason.ts`). The
 * validator has never needed to know what kind of packet it was handed — it asks
 * *"was that permitted"*, and permission is these two arrays.
 */
export interface AllowedValues {
  readonly allowedNumbers: readonly string[];
  readonly allowedNames: readonly string[];
}

function scan(
  text: string,
  packet: AllowedValues,
  into: Violation[],
  ordinary: ReadonlySet<string> = NOT_A_MANAGER,
): void {
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

  /** One capitalised word: allowed outright, a piece of an allowed name, or house copy. */
  const permitted = (word: string): boolean =>
    packet.allowedNames.includes(word) || nameParts.has(word) || ordinary.has(word);

  for (const match of text.matchAll(CAPITALISED)) {
    const value = match[0];
    if (permitted(value)) continue;

    /*
     * A two-word match whose halves are each permitted.
     *
     * `CAPITALISED` greedily pairs adjacent capitalised words, and real names
     * are not two clean words: `Ja'Marr Chase` scans as `Ja`, then the pair
     * `Marr Chase`; `Amon-Ra St. Brown` scans as `Amon`, `Ra St`, `Brown`. Every
     * one of those pieces is in the packet — they came out of a stored draft
     * pick — and the *pair* is an artefact of how the scanner walks the string
     * rather than a claim anybody made. The draft board refused itself as six
     * invented names until this existed.
     *
     * It is the right rule rather than a workaround: the question this module
     * asks is *"was that permitted"*, and a pair of separately permitted words
     * is permitted. It admits nothing new — a pair containing one unknown word
     * is still refused, which is every case that matters, including a retired
     * manager sharing a first name with a current one.
     */
    if (value.split(/\s+/).every(permitted)) continue;

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
 * The half of the scan that applies to prose nobody derived: banned terms and
 * quotation marks.
 *
 * Extracted because three callers need exactly this and no more — an empty
 * rack's house copy, and the two pieces of **editorial** text a commissioner
 * writes in Tony's voice (his take and his concern on a draft review).
 *
 * ## Why a human-authored sentence is checked at all
 *
 * The number-and-name half of the scan asks *"did a renderer invent this"*, and
 * for a sentence a person typed the answer is *"a person wrote it, and they are
 * the author"* — checking it against a packet would refuse Tony's own opinions.
 *
 * This half asks something different and still applies: **`16 §9`'s banned
 * terms are product rules, not renderer rules.** The league has no kickers
 * whoever is typing; win-probability language implies a model that does not
 * exist whoever is typing; and naming an unreleased feature in print is a
 * promise the shop cannot keep whoever is typing. A quotation mark is fabricated
 * testimony for the same reason it is when a model writes one — nobody in this
 * league said anything on the record.
 */
export function scanEditorialCopy(text: string): readonly Violation[] {
  const violations: Violation[] = [];

  for (const { pattern, why } of BANNED) {
    const found = pattern.exec(text);
    if (found !== null) violations.push({ kind: 'banned-term', value: found[0], why });
  }
  for (const match of text.matchAll(/["“”]/g)) {
    violations.push({ kind: 'invented-quote', value: match[0] });
  }

  return violations;
}

/** {@link scanEditorialCopy}, as a verdict. What the editor checks before it stores. */
export function validateEditorialCopy(texts: readonly string[]): Verdict {
  const violations = texts.flatMap((text) => scanEditorialCopy(text));
  return { publishable: violations.length === 0, violations };
}

/**
 * Check derived prose against what a packet allowed. The whole scan.
 *
 * Public so the preseason renderer can check the sentences **it** built without
 * routing them through `validateEdition`, whose `prose()` enumerates a weekly
 * issue's fields.
 */
export function scanDerivedProse(
  texts: readonly string[],
  allowed: AllowedValues,
): readonly Violation[] {
  const violations: Violation[] = [];
  for (const text of texts) scan(text, allowed, violations);
  return violations;
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

/**
 * Check any prose against a packet — not only a newspaper.
 *
 * `MANDATE §9` applies to every surface, not to the one that happens to look
 * like journalism. When Tony mentions a result at the counter he is making the
 * same class of claim the Slice makes, so he goes through the same gate: a line
 * that changed a name, a score, a margin or a tier is refused and he says
 * nothing about football instead.
 *
 * Sharing the validator rather than writing a second one is the point. A second
 * one would drift, and it would drift on the quieter surface — the one nobody
 * re-reads — which is where an unchecked claim does its damage.
 */
export function validateProse(
  texts: readonly string[],
  packet: FactPacket,
  /**
   * The curated source the prose was rendered from, when there is one.
   *
   * A template contains `{winner}`, not `Brandon` — a proper noun can only enter
   * a rendered line through **substitution**, so every capitalised word already
   * present in the template is curated prose by construction. Deriving the
   * ordinary-word set from it is the same rule `houseWords()` applies to the
   * Slice's own tables (*if the renderer can print it, the checker has to be able
   * to see it*), extended to a surface whose curated strings live in a Markdown
   * file rather than in a TypeScript constant.
   *
   * Without this, `He is not going to pretend that was a game` is refused because
   * `He` is a capitalised word the Slice's headlines never use — which is the
   * validator being right about its own vocabulary and wrong about this one.
   */
  templates: readonly string[] = [],
): Verdict {
  const ordinary = new Set(NOT_A_MANAGER);
  for (const template of templates) {
    for (const match of template.matchAll(/\b[A-Z][a-z]+\b/g)) ordinary.add(match[0]);
  }

  const violations: Violation[] = [];
  for (const text of texts) scan(text, packet, violations, ordinary);
  return { publishable: violations.length === 0, violations };
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
