/**
 * Reading Tony's lines out of the markdown files that hold them.
 *
 * The markdown file is the source of truth for the lines, not a description of
 * them. `17 §11` puts "reviewing and extending the Counter Greeting lines" on
 * the commissioner's track, running in parallel with engineering — so the
 * commissioner edits prose in a file they can read, reruns the seed, and the
 * new lines are live. Copying the lines into a TypeScript array would make
 * that a code change and quietly turn the markdown into stale documentation.
 *
 * The parser is **strict**. A malformed entry throws with the line number
 * rather than being skipped, because a silently dropped line is one the
 * commissioner wrote, believes is live, and never sees.
 *
 * ## One syntax, several files
 *
 * Every surface that has Tony saying something authors it the same way —
 * `**key** · conditions · *expression*` over a `> quoted line`. What differs
 * between surfaces is only *which section of which file* is readable and *which
 * variables* a line there may use, so those three facts are a `LineSyntax`
 * value and the parser itself is written once.
 *
 * This is the same argument `16 §10` makes about the storage layer: one content
 * engine, one eligibility pipeline, no parallel dialogue system. A second parser
 * for the box offer would be exactly the parallel system that rule forbids, and
 * the second surface would inevitably drift from the first — different escaping,
 * different error handling, a variable check on one side and not the other.
 *
 * ## Group A only, in the greetings file
 *
 * Group B draws on character canon rather than imported data and needs
 * commissioner sign-off (`content/counter-greetings.md`), and four Sleeper
 * accounts are not yet confidently mapped to the people in `11` — so a Group B
 * line could land on the wrong person and simply be wrong about them. The
 * parser stops at the Group B heading. That is a hard boundary, not a default.
 */

export const GROUP_A_HEADING = '# Group A';
export const GROUP_B_HEADING = '# Group B';

export const EXPRESSIONS = ['neutral', 'pleased', 'unimpressed'] as const;
export type Expression = (typeof EXPRESSIONS)[number];

/**
 * Where a surface's lines live, and what they are allowed to say.
 *
 * `variables` is a **whitelist, and the reason it is per-surface**: a greeting
 * knows the manager's name and the days to kickoff; the box offer knows the
 * price and nothing else. Sharing one global list would let a greeting reference
 * `{price}` — which renders as an empty string on the parlor page, so the line
 * would not fail, it would simply come out wrong.
 */
export interface LineSyntax {
  /** Named in every error, so a message locates itself without a stack trace. */
  readonly file: string;
  /** The heading the readable section begins at. */
  readonly startsAt: string;
  /** The heading that ends it, or null to read to the end of the file. */
  readonly endsAt: string | null;
  /** The only variables a line on this surface may use. */
  readonly variables: readonly string[];
}

export const COUNTER_GREETINGS: LineSyntax = {
  file: 'content/counter-greetings.md',
  startsAt: GROUP_A_HEADING,
  endsAt: GROUP_B_HEADING,
  variables: ['name', 'days'],
};

/**
 * What Tony says when a box has just been opened and another is affordable.
 *
 * Approved by the commissioner on 2026-07-30 as one of the two pizza-box
 * dialogue groups, so the whole file is readable and there is no held-back
 * second half to stop at.
 */
export const BOX_OFFERS: LineSyntax = {
  file: 'content/box-offer.md',
  startsAt: '# Approved',
  endsAt: null,
  variables: ['price'],
};

/**
 * What Tony says at the counter about a result the fact layer verified.
 *
 * Approved by the commissioner on 2026-07-31: *"Allow Tony to use verified Stats
 * facts for occasional contextual dialogue."* The whole file is readable — there
 * is no held-back second half — and every variable below is substituted from a
 * `MatchupFact`-derived value and then checked by the Slice's own validator
 * (`lib/parlor/aside.ts`).
 */
export const STATS_ASIDES: LineSyntax = {
  file: 'content/counter-stats.md',
  startsAt: '# Approved',
  endsAt: null,
  variables: ['winner', 'loser', 'margin', 'points', 'champion', 'season'],
};

export interface ParsedLine {
  /** The authoring key, e.g. `A1`. Unique across every surface. */
  readonly key: string;
  readonly requiredTags: readonly string[];
  readonly expression: Expression;
  readonly templateText: string;
  /** Variables the text actually uses. */
  readonly variables: readonly string[];
}

export class ContentParseError extends Error {
  constructor(file: string, line: number, message: string) {
    super(`${file}:${String(line)} — ${message}`);
    this.name = 'ContentParseError';
  }
}

/**
 * `**A1** · `tag` + `tag` · *unimpressed*`
 *
 * The middle field is optional, and may hold either the tags a line requires
 * or — for A15 — the variable it depends on. Both are written in backticks, so
 * the two are told apart by shape: `{days}` is a variable, everything else is
 * a tag.
 */
const ENTRY = /^\*\*([A-Z]+\d+)\*\*\s*·\s*(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const VARIABLE_IN_TEXT = /\{([a-z_]+)\}/g;

export function parseLines(markdown: string, syntax: LineSyntax): readonly ParsedLine[] {
  const lines = markdown.split('\n');

  const start = lines.findIndex((line) => line.startsWith(syntax.startsAt));
  if (start === -1) {
    throw new ContentParseError(syntax.file, 1, `no "${syntax.startsAt}" heading found.`);
  }

  const stop = syntax.endsAt;
  const after =
    stop === null
      ? -1
      : lines.findIndex((line, index) => index > start && line.startsWith(stop));
  const end = after === -1 ? lines.length : after;

  const entries: ParsedLine[] = [];
  const seen = new Set<string>();

  for (let index = start; index < end; index++) {
    const match = ENTRY.exec(lines[index] ?? '');
    if (match === null) continue;

    const lineNumber = index + 1;
    const key = match[1]!;
    const rest = match[2] ?? '';

    if (seen.has(key)) {
      throw new ContentParseError(syntax.file, lineNumber, `duplicate entry key "${key}".`);
    }
    seen.add(key);

    const { requiredTags, expression } = parseFields(rest, syntax, lineNumber, key);
    const templateText = readQuote(lines, index, end, syntax, lineNumber, key);
    const variables = readVariables(templateText, syntax, lineNumber, key);

    entries.push({ key, requiredTags, expression, templateText, variables });
  }

  if (entries.length === 0) {
    throw new ContentParseError(
      syntax.file,
      start + 1,
      `the "${syntax.startsAt}" section contains no entries.`,
    );
  }

  return entries;
}

export function parseCounterGreetings(markdown: string): readonly ParsedLine[] {
  return parseLines(markdown, COUNTER_GREETINGS);
}

export function parseStatsAsides(markdown: string): readonly ParsedLine[] {
  return parseLines(markdown, STATS_ASIDES);
}

export function parseBoxOffers(markdown: string): readonly ParsedLine[] {
  return parseLines(markdown, BOX_OFFERS);
}

function parseFields(
  rest: string,
  syntax: LineSyntax,
  lineNumber: number,
  key: string,
): { requiredTags: readonly string[]; expression: Expression } {
  const fields = rest
    .split('·')
    .map((field) => field.trim())
    .filter((field) => field !== '');

  const expressionField = fields.at(-1) ?? '';
  const expressionMatch = /^\*([a-z]+)\*$/.exec(expressionField);

  if (expressionMatch === null) {
    throw new ContentParseError(
      syntax.file,
      lineNumber,
      `${key} does not end with an expression like *neutral*.`,
    );
  }

  const expression = expressionMatch[1] as Expression;
  if (!(EXPRESSIONS as readonly string[]).includes(expression)) {
    throw new ContentParseError(
      syntax.file,
      lineNumber,
      `${key} has expression "${expression}"; expected one of ${EXPRESSIONS.join(', ')}.`,
    );
  }

  const requiredTags: string[] = [];

  for (const field of fields.slice(0, -1)) {
    for (const token of field.split('+').map((part) => part.trim())) {
      const tagMatch = /^`([^`]+)`$/.exec(token);
      if (tagMatch === null) {
        throw new ContentParseError(
          syntax.file,
          lineNumber,
          `${key} has an unreadable condition "${token}"; expected a backticked tag.`,
        );
      }

      const value = tagMatch[1]!;

      // `{days}` documents the variable the line needs, not a tag it requires.
      // Treating it as a tag would make A15 permanently ineligible — nobody
      // holds a tag called "{days}" — and the line would silently vanish.
      if (value.startsWith('{')) continue;

      requiredTags.push(value);
    }
  }

  return { requiredTags, expression };
}

function readQuote(
  lines: readonly string[],
  entryIndex: number,
  end: number,
  syntax: LineSyntax,
  lineNumber: number,
  key: string,
): string {
  for (let index = entryIndex + 1; index < end; index++) {
    const line = lines[index] ?? '';

    // The next entry starts before any quote did: this one has no line.
    if (ENTRY.test(line)) break;

    const quote = QUOTE.exec(line);
    if (quote === null) continue;

    const text = (quote[1] ?? '').trim();
    if (text === '') break;
    return text;
  }

  throw new ContentParseError(
    syntax.file,
    lineNumber,
    `${key} has no line. Expected a "> ..." quote below it.`,
  );
}

function readVariables(
  templateText: string,
  syntax: LineSyntax,
  lineNumber: number,
  key: string,
): readonly string[] {
  const found = [...templateText.matchAll(VARIABLE_IN_TEXT)].map((match) => match[1]!);

  for (const variable of found) {
    if (!syntax.variables.includes(variable)) {
      throw new ContentParseError(
        syntax.file,
        lineNumber,
        `${key} uses unknown variable {${variable}}. ` +
          `Known on this surface: ${syntax.variables.join(', ')}.`,
      );
    }
  }

  return [...new Set(found)];
}
