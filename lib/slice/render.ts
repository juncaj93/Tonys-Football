import { type Intensity } from '@/lib/stats/significance';

import { margin, points, type FactPacket, type SliceStory } from './packet';

/**
 * The deterministic renderer — the one that always works.
 *
 * `16 §9`: *"the site ships working with the API key unset."* That is not a
 * fallback mode, it is the **default** renderer; the optional LLM one is a
 * second opinion the commissioner may prefer per story. So this is written to be
 * publishable on its own, not to be a placeholder somebody is embarrassed by.
 *
 * ## Every sentence is assembled, never generated
 *
 * A template per intensity, filled from the packet. That is what makes the
 * output checkable: the validator can insist every number and proper noun came
 * from the packet precisely because nothing here can invent one.
 *
 * ## The intensity comes from the policy, not from the prose
 *
 * `PROVISIONAL_TIERS` classifies a margin against an absolute floor *and* a
 * league-relative percentile (`lib/stats/significance.ts`). The renderer's job
 * is to say the word the classifier chose — never to reach for a bigger one
 * because the number looked large. `MANDATE §9`: the interface does not derive a
 * fantasy fact for itself, and "how big a deal was this" is a fantasy fact.
 *
 * Two guards on that, both from the commissioner's brief:
 *
 *   - **Weekly rank alone never justifies dramatic language.** The templates key
 *     off `intensity`, which requires two independent reasons above `beat`.
 *   - **Prefer fewer strong stories.** `lead()` takes one, and the rest of the
 *     week is a list of results in plain language rather than five paragraphs
 *     competing to be the headline.
 */

/** What a rendered issue is, before anybody has approved it. */
export interface Edition {
  readonly season: number;
  readonly week: number;
  readonly headline: string;
  /** The lead story, two or three sentences. Empty when the week refuses. */
  readonly lead: string;
  /** Every other publishable game, one flat line each. */
  readonly alsoRan: readonly string[];
  /** Set when there is nothing to print, in the shop's voice. */
  readonly nothingToPrint: string | null;
}

/**
 * The verb for each tier, and nothing louder than the tier earned.
 *
 * The classifier's own words. A renderer that mapped `handled` to "destroyed"
 * would be re-deciding significance in prose, which is the whole thing the
 * typed-fact layer exists to prevent.
 */
export const VERB: Record<Intensity, string> = {
  edged: 'edged',
  beat: 'beat',
  handled: 'handled',
  crushed: 'crushed',
  obliterated: 'obliterated',
};

/**
 * The headline, per tier.
 *
 * Short, factual, and escalating only as far as the classification does. `{w}`
 * and `{l}` are the two managers; nothing else is substituted, so a headline
 * cannot contain a number the packet did not allow.
 */
export const HEADLINE: Record<Intensity, string> = {
  edged: '{w} gets out of week {k} alive',
  beat: '{w} takes week {k}',
  handled: '{w} handles {l}',
  crushed: '{w} crushes {l}',
  obliterated: '{w} leaves nothing of {l}',
};

/** One sentence of context per tier, added after the result. */
export const COLOUR: Record<Intensity, string> = {
  edged: 'Tony has seen closer. Not many.',
  beat: 'A win is a win, and Tony writes them all down the same.',
  handled: 'Comfortable, and Tony would like that noted.',
  crushed: 'Tony put the paper down for that one.',
  obliterated: 'Tony has been running this shop a while and does not remember worse.',
};

/**
 * The fixed prose that is not a headline, a colour line or a refusal.
 *
 * Extracted as constants for one reason: `houseWords()` below builds the
 * validator's ordinary-word set by reading the curated strings, and a sentence
 * written inline inside a function is curated but **invisible** to it. That is
 * not hypothetical — `That is 50.5 between them.` was inline, and the validator
 * duly reported `That` as an unknown proper noun on every week of both seasons.
 *
 * The rule this encodes: **if the renderer can print it, `houseWords()` has to
 * be able to see it.**
 */
export const PHRASES = {
  gap: 'That is {m} between them.',
  emptyHeadline: 'Week {k}',
} as const;

function fill(template: string, story: SliceStory, week: number): string {
  return template
    .replaceAll('{w}', story.fact.winnerDisplayName)
    .replaceAll('{l}', story.fact.loserDisplayName)
    .replaceAll('{k}', String(week));
}

/**
 * The lead story.
 *
 * Result, then margin, then one line of colour. The margin is written to one
 * decimal place because that is how it is spoken; the scores keep both places
 * because a score is a measurement. Both forms are in the packet's allowed set.
 */
function lead(story: SliceStory): string {
  const { fact } = story;

  const result =
    `${fact.winnerDisplayName} ${VERB[fact.intensity]} ${fact.loserDisplayName}, ` +
    `${points(fact.winnerPoints)} to ${points(fact.loserPoints)}.`;

  const gap = PHRASES.gap.replace('{m}', margin(fact.margin));

  return `${result} ${gap} ${COLOUR[fact.intensity]}`;
}

/** One flat line per remaining game. No adjectives — the lead has those. */
function alsoRan(story: SliceStory): string {
  const { fact } = story;
  return (
    `${fact.winnerDisplayName} ${points(fact.winnerPoints)}, ` +
    `${fact.loserDisplayName} ${points(fact.loserPoints)}.`
  );
}

/** Nothing to print, said as a fact about the rack rather than an error. */
export const REFUSALS = {
  'no-season': 'Nothing on file for that season yet.',
  'no-story': 'Nothing happened that week worth the ink.',
  'nobody-publishable': 'Nothing on the rack this week.',
} as const;

export function renderEdition(packet: FactPacket): Edition {
  if (packet.refusal !== null || packet.stories.length === 0) {
    return {
      season: packet.season,
      week: packet.week,
      headline: PHRASES.emptyHeadline.replace('{k}', String(packet.week)),
      lead: '',
      alsoRan: [],
      nothingToPrint: REFUSALS[packet.refusal ?? 'no-story'],
    };
  }

  const [top, ...rest] = packet.stories;

  return {
    season: packet.season,
    week: packet.week,
    headline: fill(HEADLINE[top!.fact.intensity], top!, packet.week),
    lead: lead(top!),
    alsoRan: rest.map(alsoRan),
    nothingToPrint: null,
  };
}

/**
 * Every word the curated templates above can put on a page.
 *
 * The validator needs to tell *"Not many."* — which is house copy — from
 * *"Berardo"* — which is a manager who may not be published. Both are
 * capitalised words absent from the packet, and sentence position proves nothing
 * because "Tony has seen closer" also starts with a name.
 *
 * So the ordinary-word set is **derived from the templates**, not hand-listed.
 * A hand-list goes stale the first time somebody adds a template with a new word
 * in it, and it goes stale silently — the validator starts refusing the
 * product's own default renderer, which is the failure this project has already
 * shipped twice under other names.
 *
 * A word that is in neither the packet nor this set is a word nobody curated and
 * nobody verified. That is exactly what a language model's invented name looks
 * like, and it is exactly what should be refused.
 */
export function houseWords(): ReadonlySet<string> {
  const curated = [
    ...Object.values(HEADLINE),
    ...Object.values(COLOUR),
    ...Object.values(VERB),
    ...Object.values(REFUSALS),
    ...Object.values(PHRASES),
  ].join(' ');

  const words = new Set<string>();
  for (const match of curated.matchAll(/\b[A-Z][a-z]+\b/g)) words.add(match[0]);
  return words;
}
