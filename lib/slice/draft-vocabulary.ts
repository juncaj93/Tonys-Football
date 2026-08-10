/**
 * The words a draft is described in.
 *
 * A leaf module with no imports, and that is the point: `lib/slice/render.ts`
 * builds the validator's ordinary-word set from the curated strings the product
 * can actually print (`houseWords()`), and the preseason issue prints sentences
 * assembled from these. A word the renderer can emit and the checker cannot see
 * is refused on the page as an unknown proper noun — which this project has
 * shipped twice under other names, and which the rule *"if the renderer can
 * print it, `houseWords()` has to be able to see it"* exists to stop.
 *
 * Positions live here rather than in the schema because they are **display**
 * facts: `WR` is what Sleeper stores and *"wide receivers"* is what a sentence
 * says.
 */

/**
 * Tony's grade domain — thirteen values, the ordinary report-card scale.
 *
 * **Declared here, in a module with no imports**, and read by both ends: the
 * `tony_grade` enum in `lib/db/schema.ts` is built from this array, and the
 * editor renders it as thirteen buttons. So *"the screen and the database offer
 * the same thirteen"* is true by construction rather than by two lists happening
 * to agree.
 *
 * It also keeps the grade domain out of the components' import graph. A screen
 * that reached into `lib/db` to find out what a grade can be would be a display
 * component importing the fact layer, which `components/slice/presentation.test.tsx`
 * exists to refuse.
 *
 * There is no numeric score and no half-step. A wider domain makes two adjacent
 * grades indistinguishable to a reader, which is the whole job of a grade.
 */
export const TONY_GRADES = [
  'A+',
  'A',
  'A-',
  'B+',
  'B',
  'B-',
  'C+',
  'C',
  'C-',
  'D+',
  'D',
  'D-',
  'F',
] as const satisfies readonly [string, ...string[]];

export type TonyGrade = (typeof TONY_GRADES)[number];

/** Display order for positions. Anything unrecognised sorts after, alphabetically. */
export const POSITION_ORDER: readonly string[] = ['QB', 'RB', 'WR', 'TE', 'DEF'];

/** `QB` → singular, plural. There is no `K`: this league has no kickers. */
export const POSITION_WORD: Readonly<Record<string, readonly [string, string]>> = {
  QB: ['quarterback', 'quarterbacks'],
  RB: ['running back', 'running backs'],
  WR: ['wide receiver', 'wide receivers'],
  TE: ['tight end', 'tight ends'],
  DEF: ['defense', 'defenses'],
};

/**
 * Numbers this paper spells out.
 *
 * To ten, which is the ordinary newspaper rule and also a validator
 * convenience: a spelled number is not a digit, so *"three wide receivers"*
 * carries nothing for the number scan to check. Anything above ten prints as
 * digits and is declared in the packet's allowed numbers like every other
 * number on the page.
 */
export const SPELLED: readonly string[] = [
  'no',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];

export function spell(count: number): string {
  return count >= 0 && count < SPELLED.length ? SPELLED[count]! : String(count);
}

export function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function positionWord(position: string, count: number): string {
  const pair = POSITION_WORD[position];
  if (pair === undefined) return position;
  return count === 1 ? pair[0] : pair[1];
}

/**
 * Every fixed phrase the preseason issue can print about a draft.
 *
 * Kept as one exported list so `houseWords()` can read it. `{n}` and `{p}` are
 * substituted with a spelled count and a position word, neither of which is a
 * proper noun and neither of which is a digit.
 */
export const DRAFT_PHRASES = {
  /** A manager's countable draft shape. Never an evaluation. */
  earlyLoad: '{n} {p} in the first {e} rounds.',
  quarterback: 'Quarterback in round {n}.',
  keepers: '{n} kept from last season.',

  /** Where they picked from. */
  slot: 'Picked {o}',

  /** League-wide observations. Label on the left, fact on the right. */
  firstPickLabel: 'First off the board',
  roundOneLabel: 'Round one',
  firstDefenseLabel: 'First defense',
  roundsLabel: 'Rounds',
  draftedLabel: 'Drafted',
  formatLabel: 'Format',

  /** Historical context. */
  defendingChampionLabel: 'Defending champion',

  /** The team sections. */
  takeLabel: 'Tony’s take',
  bestPickLabel: 'Tony’s pick of the bunch',
  concernLabel: 'What Tony is not sure about',
  picksLabel: 'The first few',
  gradeLabel: 'Tony’s grade',

  /** Week one. */
  weekOneLabel: 'Week one',
  versus: 'v',
} as const;

/** Ordinals, spelled, for the draft slot. `Picked fourth` rather than `Picked 4th`. */
export const ORDINALS: readonly string[] = [
  'nowhere',
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
  'eleventh',
  'twelfth',
];

export function ordinal(position: number): string {
  return position >= 0 && position < ORDINALS.length ? ORDINALS[position]! : `${String(position)}th`;
}

/**
 * Every word these constants can put on a page, for `houseWords()`.
 *
 * Joined rather than listed, so a phrase added above is covered without anybody
 * remembering to add its words here.
 */
export function draftVocabulary(): string {
  return [
    ...SPELLED,
    ...SPELLED.map(capitalise),
    ...ORDINALS,
    ...ORDINALS.map(capitalise),
    ...Object.values(POSITION_WORD).flat(),
    ...Object.values(POSITION_WORD)
      .flat()
      .map(capitalise),
    ...Object.values(DRAFT_PHRASES),
  ].join(' ');
}
