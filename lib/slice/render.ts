import { type Intensity } from '@/lib/stats/significance';
import { type StoryCandidate, type StoryDetail } from '@/lib/stats/stories';

import { draftVocabulary } from './draft-vocabulary';
import { margin, points, type FactPacket, type ScoreLine } from './packet';

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
 * A template per story kind, filled from the packet. That is what makes the
 * output checkable: the validator can insist every number and proper noun came
 * from the packet precisely because nothing here can invent one.
 *
 * ## The intensity comes from the policy, not from the prose
 *
 * `lib/stats/stories.ts` decides what a result meant and how much of a deal it
 * was. The renderer's job is to say the word that was chosen — never to reach for
 * a bigger one because the number looked large. `MANDATE §9`: the interface does
 * not derive a fantasy fact for itself, and *"how big a deal was this"* is a
 * fantasy fact.
 *
 * ## Variety without randomness
 *
 * The first version of this file had **one** sentence per tier, so every issue
 * read identically — four "Matt Lee handles…" headlines in eight weeks, and the
 * same closing line under all of them. A reader saw the machine on the second
 * issue.
 *
 * So each template is a small set of curated variants and the choice is a hash of
 * `season · week · story id`. That is stable — the same week renders the same way
 * forever, which is what a *published* issue has to do and what a screenshot test
 * needs — while consecutive weeks read differently because their seeds differ.
 * **`Math.random()` would be wrong twice over**: the room's injected-RNG rule
 * (`lib/counter/rng.ts`) and the fact that a paper cannot re-word itself on
 * reload.
 *
 * ## Numerical density is a rule, not a preference
 *
 * The old lead printed three numbers in twelve words and the third was derivable
 * from the first two. Now: the two scores lead, and the margin appears **only
 * where the margin is the story** — a blowout or a nail-biter. Everywhere else it
 * is left for the reader to do, which is what a reader of a sports page does.
 */

/** What a rendered issue is, before anybody has approved it. */
export interface Edition {
  readonly season: number;
  readonly week: number;
  /** `TUESDAY EDITION · SEASON 2025 · WEEK 14`. */
  readonly dateline: string;
  /** Drives the paper's furniture and Tony's column. */
  readonly character: EditionCharacter;
  readonly headline: string;
  /** One line under the headline. The score, usually. Null when the headline is whole. */
  readonly deck: string | null;
  /** The lead story. Two or three sentences. Empty on a quiet week. */
  readonly body: string;
  /** Smaller stories under the lead. Same three parts, smaller type. */
  readonly secondary: readonly {
    readonly headline: string;
    readonly deck: string | null;
    readonly body: string;
  }[];
  /** Every publishable game of the week, whether or not it was a story. */
  readonly scoreboard: readonly RenderedScore[];
  /** Tony, in his own voice, about the *issue* — never about a game. */
  readonly column: string;
  /** Set when there is nothing to print at all, in the shop's voice. */
  readonly nothingToPrint: string | null;
  /**
   * The draft-review special's own sections. **Undefined on every weekly issue.**
   *
   * An optional field rather than a discriminated union, and the reason is
   * `editionHash`: `canonical()` drops `undefined`, so every weekly issue
   * already published hashes to exactly what it hashed to before this field
   * existed. A required `kind` discriminator would have moved every one of them,
   * and a version's hash is what a commissioner's approval names.
   *
   * Presence *is* the discriminator, and `slice_issues.kind` records the same
   * fact in the database so a query never has to open the JSON to find out.
   */
  readonly preseason?: PreseasonSections;
}

/**
 * The preseason issue, as printed.
 *
 * Every string here was either curated in {@link PRESEASON} / `DRAFT_PHRASES` or
 * came out of a verified stored draft pick — except `take` and `concern`, which
 * are **Tony's editorial voice supplied by the commissioner** and are the only
 * free text this product prints. `lib/slice/preseason.ts` records what each is
 * checked against and why the two differ.
 */
export interface PreseasonSections {
  /** Tony's draft board: every manager, every grade, in one glance. */
  readonly board: readonly { readonly manager: string; readonly grade: string }[];
  /** Countable league-wide facts. Guarded — an unsupported one is absent. */
  readonly snapshot: readonly { readonly label: string; readonly value: string }[];
  readonly teams: readonly PreseasonTeamSection[];
  /** Verified history, used sparingly. Empty when there is none worth a line. */
  readonly history: readonly { readonly label: string; readonly value: string }[];
  /**
   * Week one's fixtures, when the schedule exists.
   *
   * No spread, no favourite, no projection — two names and the word between
   * them. Empty when the league has not drawn a schedule yet, which is the
   * ordinary state until the league drafts.
   */
  readonly weekOne: readonly { readonly left: string; readonly right: string }[];
}

export interface PreseasonTeamSection {
  readonly manager: string;
  readonly grade: string;
  /** `Picked fourth`. Null when no pick of theirs recorded a board position. */
  readonly slot: string | null;
  /** Tony's take. The commissioner's words, in Tony's voice, unaltered. */
  readonly take: string;
  /** The first few picks, as a board reads them. */
  readonly picks: readonly {
    readonly label: string;
    readonly player: string;
    readonly position: string | null;
  }[];
  /** How many of each position, over the whole draft. `RB 5 · WR 6 · …`. */
  readonly positions: string | null;
  /** Countable sentences about how they drafted. At most two, each guarded. */
  readonly shape: readonly string[];
  /** Tony's favourite of their picks. Null when he did not name one. */
  readonly bestPick: string | null;
  /** Tony's one concern. Null when he did not raise one. */
  readonly concern: string | null;
}

export interface RenderedScore {
  readonly key: string;
  readonly leftName: string;
  readonly leftPoints: string;
  readonly rightName: string;
  readonly rightPoints: string;
  /** The left side won. False on a tie, where neither did. */
  readonly leftWon: boolean;
  readonly tie: boolean;
}

/**
 * What kind of issue this is.
 *
 * Derived from what actually ran, never chosen. It decides Tony's column and how
 * loud the page is allowed to look — which makes *"strong-news versus weak-news
 * editions"* a property of the data rather than a styling decision somebody makes
 * per week.
 */
export type EditionCharacter =
  | 'title'
  | 'record'
  | 'loud'
  | 'ordinary'
  | 'quiet'
  /**
   * A week of the postseason that would otherwise have read as ordinary.
   *
   * **Commissioner ruling, 2026-08-12 (Ruling 12).** The week-16 simulation
   * printed *"An ordinary week, and Tony prints those the same as the other
   * kind"* over a semifinal decided by 0.42 points, because significance scoring
   * looked at the margins and found nothing loud. The margins were right and the
   * sentence was wrong: in December the smallness of a game is the story.
   *
   * The signal is **`packet.weekType`**, which is `fantasy_matchups.week_type`
   * as Sleeper stored it at import — deterministic, already in the packet, and
   * already on the dateline. Nothing new is persisted and nothing is inferred.
   *
   * It is **coarse on purpose**: regular-season issue versus playoff-period
   * issue, and nothing else. It does not know which round it is, who is
   * eliminated, who advanced, or what is at stake — `docs/OPEN_ITEMS.md` **E7**
   * records that `playoff_week_start` and a round count are not persisted, and
   * the ruling forbids both inferring them and storing them. The column below
   * says none of those words.
   */
  | 'postseason'
  | 'empty'
  /**
   * The draft-review special.
   *
   * Not derived from significance like the other six, because there is no game
   * to be significant — it is derived from *which pipeline ran*, which is a
   * stronger statement of the same kind: the paper knows what it is before it
   * knows how loud it is.
   */
  | 'preseason';

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
 * Headlines, per story kind, in variants.
 *
 * `{w}` winner · `{l}` loser · `{m}` the subject · `{o}` their opponent ·
 * `{n}` the story's own number · `{k}` the week. **No literal digits**, ever: a
 * digit inside a curated string is a number the packet never allowed, and the
 * validator would be right to refuse it.
 */
export const HEADLINES = {
  championship: ['{w} takes the title', 'The season ends with {w}', '{w} finishes it'],
  'record-margin': [
    'The widest gap in the book',
    'Nothing on record like it',
    '{w} sets the margin',
  ],
  'record-score': [
    '{m} sets the mark',
    'The biggest number in the book',
    'Nobody has scored like {m}',
  ],
  'blowout-obliterated': [
    '{w} leaves nothing of {l}',
    '{w} takes {l} apart',
    'It stopped being a game',
  ],
  'blowout-crushed': ['{w} crushes {l}', '{w} runs {l} over', '{l} never got going'],
  'nail-biter': ['{w} survives {l}', '{w} gets out alive', 'A hair in it'],
  tie: ['Nobody wins', 'Dead level', '{a} and {b} cannot be split'],
  'high-score': ['{m} hangs {n} on the league', '{m} goes off', 'Big afternoon for {m}'],
  'low-score': ['A quiet afternoon for {m}', '{m} never found it', 'Cold week for {m}'],
  /*
   * The title race, not the season.
   *
   * These read *"{l} is done for the year"*, *"{w} sends {l} home"* and *"End of
   * the road for {l}"* — three claims that the loser has stopped playing. In
   * this league's bracket that is **false**: Sleeper's six-team draw sends every
   * playoff loser into a placement game the following week, so a first-round
   * loser plays twice more and a semifinal loser plays again for third. The
   * candidate could not fire when they were written (see `lib/stats/stories.ts`),
   * so nothing untrue was ever printed; the moment it can fire, they would be.
   *
   * What the story actually establishes is narrower and is what these now say:
   * the winner reached the final and the loser cannot.
   */
  elimination: ['{l} will not be champion', '{w} goes on, {l} does not', 'No ring for {l} this year'],
  upset: ['{w} was not supposed to win that', '{w} turns one over', '{l} never saw {w} coming'],
  streak: ['{m} makes it {n} in a row', '{n} straight for {m}', '{m} will not lose'],
  'standings-up': ['{m} climbs', '{m} is on the move', '{m} goes up the table'],
  'standings-down': ['{m} slides', '{m} drops down the table', 'A costly week for {m}'],
  'monday-comeback': [
    '{w} was gone, and then was not',
    '{w} gets it back on Monday',
    '{l} had it, right up until they did not',
  ],
  quiet: ['A quiet week at the shop', 'Not a lot to report', 'Week {k}, and not much in it'],
} as const;

/**
 * The result sentence, per shape.
 *
 * Two numbers and two names. The margin is a separate sentence and only appears
 * where the margin is the point.
 */
export const RESULT = {
  streak: ['That is {n} in a row.', 'It is now {n} straight.'],
  streakNamed: ['That is {n} in a row for {m}.', '{m} has now won {n} straight.'],
  standings: ['From {a} to {b} in the table.', 'That is {a} to {b} in one afternoon.'],
  standingsNamed: [
    '{m} moved from {a} to {b} in the table.',
    'That is {m}, from {a} to {b}.',
  ],
  upset: [
    '{w} came in on {a} wins, {l} on {b}.',
    'That is {a} wins against {b}, the wrong way round.',
  ],
} as const;

/**
 * A number-free line of context, for the kinds whose deck already carries every
 * number they have.
 *
 * Each of these is **evidenced by construction** rather than asserted: a
 * `high-score` story is by definition the best score of its week, so *"the best
 * anybody managed"* is not a new claim. A line here that needed checking would
 * belong in the fact layer instead.
 */
export const FRAME = {
  /*
   * The championship's middle sentence.
   *
   * It was removed when `FRAME` and `KIND_COLOUR` both said *banner* — two
   * sentences making one point. The fix is a different point rather than no
   * point: the paper's biggest story should not be two lines long, and the title
   * game is the one story where the *season* is the context.
   */
  championship: [
    'A whole year of Sundays, settled in an afternoon.',
    'Everything since September was on the way to that game.',
  ],
  'record-margin': ['The widest anybody has been beaten by, in either season on file.'],
  'record-score': ['The biggest single afternoon anybody has had, in either season on file.'],
  'high-score': ['The best anybody managed that week.'],
  'low-score': ['The lowest anybody managed that week.'],
  tie: ['Level to the point, with nothing to separate them.'],
} as const;

/** The margin sentence, used only where the margin *is* the story. */
export const GAP = [
  'That is {g} between them.',
  '{g} in it at the end.',
  'A gap of {g}.',
] as const;

/** One sentence of meaning per tier, and nothing louder than the tier earned. */
export const COLOUR: Record<Intensity, readonly string[]> = {
  edged: [
    'Tony has seen closer. Not many.',
    'The kind of week that turns on one bad afternoon.',
    'Nobody in the shop breathed for the last hour.',
  ],
  beat: [
    'A win is a win, and Tony writes them all down the same.',
    'Ordinary, and there is no shame in ordinary.',
    'It counts the same in the table.',
  ],
  handled: [
    'Comfortable, and Tony would like that noted.',
    'Never really in doubt after the middle of the afternoon.',
    'Handled, in the way the word is meant.',
  ],
  crushed: [
    'Tony put the paper down for that one.',
    'The shop went quiet watching it.',
    'One of those afternoons that gets brought up in March.',
  ],
  obliterated: [
    'Tony has been running this shop a while and does not remember worse.',
    'There is no kind way to write that one up.',
    'The kind of result that follows somebody around.',
  ],
};

/** Meaning lines for the kinds that are not about a margin. */
export const KIND_COLOUR = {
  'monday-comeback': [
    'Tony had already written the other name down.',
    'The shop had that one settled by Sunday night. It was not.',
  ],
  championship: [
    'That is the season. Everything else was on the way here.',
    'The banner goes up, and it stays up.',
    'A whole year settled on one afternoon.',
  ],
  /*
   * These sit *after* a `FRAME` line, so they must not restate it.
   *
   * `record-score` used to read *"The biggest single afternoon anybody has had,
   * in either season on file. No number in the book is bigger."* — two sentences
   * making one claim. The frame states the fact; the colour is Tony's reaction to
   * it, which is the division of labour the whole file is built on.
   */
  'record-margin': [
    'Tony went back through the record and found nothing wider.',
    'The book behind the counter needed a new line.',
  ],
  'record-score': [
    'Tony checked the record twice before he set the type.',
    'The book behind the counter needed a new line.',
  ],
  'high-score': [
    'Very few afternoons in the book look like that one.',
    'Tony had the radio on for that one and forgot the oven.',
  ],
  'low-score': [
    'It happens, and it happens to everybody eventually.',
    'Some weeks nothing comes off the bench at all.',
  ],
  elimination: [
    'The bracket does not care how the season went before it.',
    /*
     * Was "One afternoon and the year is over." — the same false claim the
     * headlines carried. `bodyOf` does not reach this list for an elimination
     * today, and a line waiting to be wrong is still worth correcting.
     *
     * No apostrophe, and no contraction: every curated line in this file avoids
     * both, which is why the validator has never had to think about them.
     */
    'One afternoon, and the title goes to somebody else.',
  ],
  upset: [
    'The table said one thing and the afternoon said another.',
    'Records are earned on Sunday, not before it.',
  ],
  streak: [
    'Nobody in the shop wants to draw them at the moment.',
    'A run like that starts to feel like a habit.',
  ],
  'standings-move': [
    'The table looks different this morning.',
    'A week like that reorders the whole middle of the table.',
  ],
  tie: [
    'Tony has no idea where to file it.',
    'The board has no column for that.',
  ],
} as const;

/**
 * Tony's column, keyed to what kind of issue this is.
 *
 * Curated, and deliberately **factless** — no names, no numbers, nothing that
 * could be wrong. `CLAUDE.md` restricts generative AI to the Slice and requires
 * ordinary Tony dialogue to be curated; this is Tony being a columnist, not Tony
 * reporting, and the separation is what keeps him safe to print.
 */
export const COLUMN: Record<EditionCharacter, readonly string[]> = {
  title: [
    'Tony says he has cleaned that same table for nine months to get to this page.',
    'The shop stayed open late for this one. Tony is not sorry.',
  ],
  record: [
    'Tony keeps the book behind the counter and does not enjoy rewriting it.',
    'Something went in the record this week. Tony has opinions about that.',
  ],
  loud: [
    'Tony had to go and check a couple of these before he set the type.',
    'A loud week. The shop was busy and so was the printer.',
  ],
  ordinary: [
    'An ordinary week, and Tony prints those the same as the other kind.',
    'Nothing much to shout about, so Tony did not shout.',
  ],
  quiet: [
    'Quiet week. Tony would rather say that than pretend otherwise.',
    'Not much happened, and the paper is not going to invent any of it.',
  ],
  /*
   * The postseason column, and every word of it is chosen for what it does not
   * claim.
   *
   * No round, no semifinal, no championship, no elimination, no advancement, no
   * win-and-in — the deterministic layer cannot support one of them and the
   * ruling forbids inventing any. What it *can* say is that it is December and
   * the shop knows it, which is the whole gap this closes.
   */
  postseason: [
    'Tony does not print December the way he prints October. Nobody reads it that way either.',
    'This is the part of the year the shop stays open late for. Tony has said so all season.',
    'Small margins now. Tony has watched enough of these to stop calling any of them ordinary.',
  ],
  empty: [
    'Tony has nothing for you this week, and would rather say so.',
  ],
  /*
   * The preseason column. Tony sending the league into the year.
   *
   * Factless like every other column, and deliberately not triumphant: he has
   * graded ten drafts and none of them has played a down, which is a thing he
   * would say out loud.
   */
  preseason: [
    'Tony has been wrong about a draft before and expects to be again. The oven is on either way.',
    'Ten drafts, ten opinions, and not one of them worth a point until Sunday.',
  ],
} as const;

/**
 * The draft-review special's curated copy.
 *
 * Same rules as everything above it: **no literal digits**, no proper nouns
 * except Tony, no claim that could be wrong. A preseason paper is the easiest
 * place in this product to write something that reads well and asserts
 * something nobody checked, so the furniture asserts nothing at all and every
 * fact on the page arrives from the packet.
 *
 * `{s}` is the season, which is the one number the headline may carry — and it
 * is in the packet's allowed numbers like any other.
 */
export const PRESEASON = {
  headline: [
    'The board is full',
    'Ten drafts, and Tony has read them all',
    'Everybody has a team now',
  ],
  deck: [
    'Tony grades the lot before a down is played',
    'The drafting is done. The arguing starts here',
  ],
  body: [
    'Nobody has scored a point yet, which has never once stopped this shop having an opinion. ' +
      'Tony went through every board, wrote down what he thought, and is prepared to be held to it.',
    'The drafts are in and the season is not. Tony read every board twice, put a grade on each ' +
      'one, and will hear complaints at the counter like always.',
  ],
  /**
   * The dateline's second half. **Not** the flag's words.
   *
   * A weekly dateline says *when* — `Season 2025 · Week 14` — and the masthead
   * flag says *what kind of paper this is*. The first version had both say
   * `Draft Review`, so the sheet printed the same two words four rows apart,
   * which is the duplication `render.ts` already refuses in a story's frame and
   * its colour. This says when: after the draft, before the season.
   */
  dateline: 'Preseason',
  /** The masthead flag, so a special edition is recognisable before a word of it is read. */
  flag: 'Draft review',
  /** What the desk says when a review is still missing. Never printed to a reader. */
  incomplete: 'Tony has not finished reading the boards.',
} as const;

/**
 * The fixed prose that is not a headline, a colour line or a refusal.
 *
 * Extracted as constants for one reason: `houseWords()` builds the validator's
 * ordinary-word set by reading the curated strings, and a sentence written inline
 * inside a function is curated but **invisible** to it. That is not hypothetical
 * — `That is 50.5 between them.` was inline, and the validator duly reported
 * `That` as an unknown proper noun on every week of both seasons.
 *
 * The rule this encodes: **if the renderer can print it, `houseWords()` has to be
 * able to see it.**
 */
export const PHRASES = {
  datelineSeason: 'Season',
  datelineWeek: 'Week',
  datelinePlayoffs: 'Playoffs',
  emptyHeadline: 'Week',
  quietBody:
    'Results, no arguments, and nothing that needed a headline. The board is below.',
} as const;

/** Nothing to print, said as a fact about the rack rather than an error. */
export const REFUSALS = {
  'no-season': 'Nothing on file for that season yet.',
  'no-week': 'That week was never played.',
  'not-final': 'That week is still open. Tony does not print a result he might have to take back.',
  'nobody-publishable': 'Nothing on the rack this week.',
} as const;

/* -------------------------------------------------------------------------- */

/**
 * Pick a curated variant, deterministically.
 *
 * FNV-1a over the seed. Not cryptographic and not trying to be — it needs to be
 * stable across machines and versions of Node, which `Math.random()` is not and
 * which a hash written here is, forever.
 */
export function pick<T>(variants: readonly T[], seed: string): T {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return variants[hash % variants.length]!;
}

function fill(template: string, values: Readonly<Record<string, string>>): string {
  let out = template;
  for (const [token, value] of Object.entries(values)) {
    out = out.replaceAll(`{${token}}`, value);
  }
  return out;
}

/** The variant seed for one story. Stable per season, week and story. */
function seedFor(story: StoryCandidate, salt: string): string {
  return `${String(story.season)}:${String(story.week)}:${story.id}:${salt}`;
}

function headlineKey(detail: StoryDetail): keyof typeof HEADLINES {
  switch (detail.kind) {
    case 'blowout':
      return detail.intensity === 'obliterated' ? 'blowout-obliterated' : 'blowout-crushed';
    case 'standings-move':
      return detail.climbed ? 'standings-up' : 'standings-down';
    case 'championship':
    case 'record-margin':
    case 'record-score':
    case 'nail-biter':
    case 'tie':
    case 'high-score':
    case 'low-score':
    case 'elimination':
    case 'upset':
    case 'streak':
    case 'monday-comeback':
      return detail.kind;
  }
}

/** Everything a template may substitute, for one story. */
function tokensFor(detail: StoryDetail, week: number): Record<string, string> {
  const base: Record<string, string> = { k: String(week) };

  switch (detail.kind) {
    case 'championship':
    case 'blowout':
    case 'nail-biter':
    case 'elimination':
    case 'record-margin':
      return {
        ...base,
        w: detail.winner,
        l: detail.loser,
        pw: points(detail.winnerPoints),
        pl: points(detail.loserPoints),
        g: margin(detail.margin),
      };
    case 'tie':
      return { ...base, a: detail.a, b: detail.b, p: points(detail.points) };
    case 'record-score':
    case 'high-score':
    case 'low-score':
      return {
        ...base,
        m: detail.manager,
        o: detail.opponent,
        p: points(detail.points),
        n: points(detail.opponentPoints),
      };
    case 'upset':
      return {
        ...base,
        w: detail.winner,
        l: detail.loser,
        pw: points(detail.winnerPoints),
        pl: points(detail.loserPoints),
        a: String(detail.winnerWins),
        b: String(detail.loserWins),
      };
    case 'streak':
      return { ...base, m: detail.manager, n: String(detail.length) };
    case 'standings-move':
      return { ...base, m: detail.manager, a: String(detail.from), b: String(detail.to) };
    case 'monday-comeback':
      return {
        ...base,
        w: detail.winner,
        l: detail.loser,
        d: margin(detail.deficit),
        g: margin(detail.margin),
        s: margin(detail.swing),
      };
  }
}

/**
 * A headline that names the score, when the score is not already in the deck.
 *
 * `high-score` is the one kind whose headline wants the number — *"hangs 184.12
 * on the league"* is the story — so `{n}` there means the subject's own points
 * rather than the opponent's. Handled at the token level so the template stays
 * readable.
 */
function headlineTokens(detail: StoryDetail, week: number): Record<string, string> {
  const tokens = tokensFor(detail, week);
  if (detail.kind === 'high-score' || detail.kind === 'record-score') {
    return { ...tokens, n: points(detail.points) };
  }
  return tokens;
}

function headlineOf(story: StoryCandidate): string {
  const variants = HEADLINES[headlineKey(story.detail)];
  return fill(pick(variants, seedFor(story, 'headline')), headlineTokens(story.detail, story.week));
}

/** The one line under a headline: the numbers, so the body does not have to lead with them. */
function deckOf(story: StoryCandidate): string | null {
  const { detail } = story;
  switch (detail.kind) {
    case 'championship':
    case 'blowout':
    case 'nail-biter':
    case 'elimination':
    case 'record-margin':
    case 'upset':
      return `${detail.winner} ${points(detail.winnerPoints)} — ${detail.loser} ${points(detail.loserPoints)}`;
    case 'record-score':
    case 'high-score':
    case 'low-score':
      return `${detail.manager} ${points(detail.points)} — ${detail.opponent} ${points(detail.opponentPoints)}`;
    case 'tie':
      return `${detail.a} ${points(detail.points)} — ${detail.b} ${points(detail.points)}`;
    case 'monday-comeback':
      /*
       * The deficit, not the two final scores. Every other deck says how the
       * game ended; this story is about where it started, and the final scores
       * are already on the board below.
       */
      return `${detail.winner} was {d} behind before Monday`.replace(
        '{d}',
        margin(detail.deficit),
      );
    case 'streak':
    case 'standings-move':
      return null;
  }
}

/**
 * The body: a result sentence, sometimes a gap sentence, then one line of meaning.
 *
 * The gap sentence appears **only** for the two kinds where the margin is the
 * story. Everywhere else the two scores in the deck already say it, and repeating
 * the subtraction is the numerical density the commissioner asked to lose.
 */
function bodyOf(story: StoryCandidate, namedInHeadline: boolean): string {
  const { detail } = story;
  const tokens = tokensFor(detail, story.week);
  const sentences: string[] = [];

  /*
   * The deck already carries the scores, so the body does not repeat them.
   *
   * The old lead printed the two scores in the deck and then again in the first
   * sentence, then subtracted them into a third number — *"Brandon 183.94 — Joe
   * 95.60 / Brandon 183.94, Joe 95.60. That is 88.3 between them."* Three numbers
   * and two of them twice. A body sentence now earns its place only by carrying a
   * number the deck does not have: the margin, a record of wins, a streak length,
   * a table position.
   */
  switch (detail.kind) {
    case 'championship':
      sentences.push(fill(pick(GAP, seedFor(story, 'gap')), tokens));
      sentences.push(pick(FRAME.championship, seedFor(story, 'frame')));
      break;
    case 'blowout':
    case 'nail-biter':
    case 'elimination':
    case 'record-margin':
      sentences.push(fill(pick(GAP, seedFor(story, 'gap')), tokens));
      break;
    case 'record-score':
    case 'high-score':
    case 'low-score':
    case 'tie':
      sentences.push(pick(FRAME[detail.kind], seedFor(story, 'frame')));
      break;
    case 'upset':
      sentences.push(fill(pick(RESULT.upset, seedFor(story, 'result')), tokens));
      break;
    case 'streak':
      // The headline usually names them and gives the number. Repeating both in
      // the next sentence is the manager-name repetition the commissioner asked
      // to lose, so the body drops the name when the headline already had it.
      sentences.push(
        fill(
          pick(namedInHeadline ? RESULT.streak : RESULT.streakNamed, seedFor(story, 'result')),
          tokens,
        ),
      );
      break;
    case 'standings-move':
      sentences.push(
        fill(
          pick(
            namedInHeadline ? RESULT.standings : RESULT.standingsNamed,
            seedFor(story, 'result'),
          ),
          tokens,
        ),
      );
      break;
  }

  sentences.push(colourOf(story));
  return sentences.join(' ');
}

/** Does this headline already name the story's subject? */
function namesSubject(headline: string, detail: StoryDetail): boolean {
  const subject =
    detail.kind === 'streak' || detail.kind === 'standings-move'
      ? detail.manager
      : null;
  return subject !== null && headline.includes(subject);
}

/** Headline, deck and body for one story, with the name-repetition rule applied. */
function storyParts(story: StoryCandidate): {
  headline: string;
  deck: string | null;
  body: string;
} {
  const headline = headlineOf(story);
  return {
    headline,
    deck: deckOf(story),
    body: bodyOf(story, namesSubject(headline, story.detail)),
  };
}

/**
 * The meaning line.
 *
 * Margin-shaped stories take the tier's own words, so the loudest available
 * sentence is the one the classifier licensed. Everything else takes its kind's.
 */
function colourOf(story: StoryCandidate): string {
  const { detail } = story;
  if (detail.kind === 'blowout' || detail.kind === 'nail-biter') {
    return pick(COLOUR[detail.intensity], seedFor(story, 'colour'));
  }
  return pick(KIND_COLOUR[detail.kind], seedFor(story, 'colour'));
}

function characterOf(packet: FactPacket): EditionCharacter {
  if (packet.refusal !== null) return 'empty';
  if (packet.lead === null) return 'quiet';

  const stories = [packet.lead, ...packet.rest];
  if (stories.some((story) => story.kind === 'championship')) return 'title';
  if (stories.some((story) => story.kind === 'record-margin' || story.kind === 'record-score')) {
    return 'record';
  }
  if (packet.lead.significance >= 700) return 'loud';

  /*
   * The one place the playoff period changes the paper's voice.
   *
   * Applied **only** where the alternative is `ordinary`, which is exactly the
   * failure the ruling names: a postseason week whose margins score low enough
   * to be called an ordinary October Tuesday. `title`, `record` and `loud` are
   * already louder than ordinary and already right, so the signal is not allowed
   * to reach them — a coarse context signal must not overwrite a derived one.
   */
  return packet.weekType === 'playoff' ? 'postseason' : 'ordinary';
}

/**
 * The dateline: season, week, and whether it is a bracket week.
 *
 * It used to open with *"Tuesday edition"*, which put four words in front of the
 * only two facts on the line and wrapped it across two rows at 360 — *"SEASON
 * 2025 ·"* then *"PLAYOFFS, WEEK 17"*, broken mid-phrase. The masthead directly
 * above already says Tuesday, so the words were paying rent twice and buying a
 * wrap.
 */
function datelineOf(packet: FactPacket): string {
  const head = `${PHRASES.datelineSeason} ${String(packet.season)} · ${PHRASES.datelineWeek} ${String(packet.week)}`;
  return packet.weekType === 'playoff' ? `${head} · ${PHRASES.datelinePlayoffs}` : head;
}

function scoreboardOf(lines: readonly ScoreLine[]): readonly RenderedScore[] {
  return lines.map((line): RenderedScore => {
    if (line.tie && line.tieNames !== null && line.tiePoints !== null) {
      return {
        key: line.key,
        leftName: line.tieNames[0],
        leftPoints: points(line.tiePoints),
        rightName: line.tieNames[1],
        rightPoints: points(line.tiePoints),
        leftWon: false,
        tie: true,
      };
    }
    return {
      key: line.key,
      leftName: line.winnerName ?? '',
      leftPoints: points(line.winnerPoints ?? 0),
      rightName: line.loserName ?? '',
      rightPoints: points(line.loserPoints ?? 0),
      leftWon: true,
      tie: false,
    };
  });
}

export function renderEdition(packet: FactPacket): Edition {
  const character = characterOf(packet);
  const column = pick(COLUMN[character], `${String(packet.season)}:${String(packet.week)}:column`);

  if (packet.refusal !== null) {
    return {
      season: packet.season,
      week: packet.week,
      dateline: datelineOf(packet),
      character,
      headline: `${PHRASES.emptyHeadline} ${String(packet.week)}`,
      deck: null,
      body: '',
      secondary: [],
      scoreboard: [],
      column,
      nothingToPrint: REFUSALS[packet.refusal],
    };
  }

  const scoreboard = scoreboardOf(packet.scoreboard);

  if (packet.lead === null) {
    /*
     * A quiet edition.
     *
     * The commissioner's rule, applied rather than intended: *"a weak-news week
     * should publish fewer stories rather than exaggerate ordinary events."* The
     * scoreboard still prints — the week happened — and nothing is promoted to a
     * headline it did not earn.
     */
    return {
      season: packet.season,
      week: packet.week,
      dateline: datelineOf(packet),
      character,
      headline: fill(
        pick(HEADLINES.quiet, `${String(packet.season)}:${String(packet.week)}:quiet`),
        { k: String(packet.week) },
      ),
      deck: null,
      body: PHRASES.quietBody,
      secondary: [],
      scoreboard,
      column,
      nothingToPrint: null,
    };
  }

  const lead = storyParts(packet.lead);

  return {
    season: packet.season,
    week: packet.week,
    dateline: datelineOf(packet),
    character,
    headline: lead.headline,
    deck: lead.deck,
    body: lead.body,
    secondary: packet.rest.map(storyParts),
    scoreboard,
    column,
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
    ...Object.values(HEADLINES).flat(),
    ...Object.values(RESULT).flat(),
    ...Object.values(FRAME).flat(),
    ...GAP,
    ...Object.values(COLOUR).flat(),
    ...Object.values(KIND_COLOUR).flat(),
    ...Object.values(COLUMN).flat(),
    ...Object.values(VERB),
    ...Object.values(REFUSALS),
    ...Object.values(PHRASES),
    /*
     * The preseason issue's vocabulary, from both halves of it.
     *
     * `PRESEASON` is this file's own curated copy; `draftVocabulary()` is the
     * spelled numbers, position words and phrase templates the preseason
     * renderer assembles sentences from. Both are needed and neither is
     * sufficient — the rule is *if the renderer can print it, `houseWords()`
     * has to be able to see it*, and half the preseason page is phrased with
     * words that live in a different module.
     */
    ...Object.values(PRESEASON).flat(),
    draftVocabulary(),
  ].join(' ');

  const words = new Set<string>();
  for (const match of curated.matchAll(/\b[A-Z][a-z]+\b/g)) words.add(match[0]);
  return words;
}
