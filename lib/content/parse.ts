/**
 * Reading the Counter Greetings out of `content/counter-greetings.md`.
 *
 * The markdown file is the source of truth for the lines, not a description of
 * them. `17 §11` puts "reviewing and extending the Counter Greeting lines" on
 * the commissioner's track, running in parallel with engineering — so the
 * commissioner edits prose in a file they can read, reruns the seed, and the
 * new lines are live. Copying the lines into a TypeScript array would make
 * that a code change and quietly turn the markdown into stale documentation.
 *
 * The parser is **strict**. A malformed entry throws with the line number
 * rather than being skipped, because a silently dropped greeting is a line the
 * commissioner wrote, believes is live, and never sees.
 *
 * ## Group A only
 *
 * Group B draws on character canon rather than imported data and needs
 * commissioner sign-off (`content/counter-greetings.md`), and four Sleeper
 * accounts are not yet confidently mapped to the people in `11` — so a Group B
 * line could land on the wrong person and simply be wrong about them. The
 * parser stops at the Group B heading. That is a hard boundary, not a default.
 */

export const GROUP_A_HEADING = '# Group A';
export const GROUP_B_HEADING = '# Group B';

/** The only variables a line may use (`content/counter-greetings.md`). */
export const KNOWN_VARIABLES = ['name', 'days'] as const;
export type KnownVariable = (typeof KNOWN_VARIABLES)[number];

export const EXPRESSIONS = ['neutral', 'pleased', 'unimpressed'] as const;
export type Expression = (typeof EXPRESSIONS)[number];

export interface ParsedGreeting {
  /** The authoring key, e.g. `A1`. */
  readonly key: string;
  readonly requiredTags: readonly string[];
  readonly expression: Expression;
  readonly templateText: string;
  /** Variables the text actually uses. */
  readonly variables: readonly KnownVariable[];
}

export class ContentParseError extends Error {
  constructor(line: number, message: string) {
    super(`content/counter-greetings.md:${String(line)} — ${message}`);
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
const ENTRY = /^\*\*([A-Z]\d+)\*\*\s*·\s*(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const VARIABLE_IN_TEXT = /\{([a-z_]+)\}/g;

export function parseCounterGreetings(markdown: string): readonly ParsedGreeting[] {
  const lines = markdown.split('\n');

  const start = lines.findIndex((line) => line.startsWith(GROUP_A_HEADING));
  if (start === -1) {
    throw new ContentParseError(1, `no "${GROUP_A_HEADING}" heading found.`);
  }

  const afterA = lines.findIndex(
    (line, index) => index > start && line.startsWith(GROUP_B_HEADING),
  );
  const end = afterA === -1 ? lines.length : afterA;

  const entries: ParsedGreeting[] = [];
  const seen = new Set<string>();

  for (let index = start; index < end; index++) {
    const match = ENTRY.exec(lines[index] ?? '');
    if (match === null) continue;

    const lineNumber = index + 1;
    const key = match[1]!;
    const rest = match[2] ?? '';

    if (seen.has(key)) {
      throw new ContentParseError(lineNumber, `duplicate entry key "${key}".`);
    }
    seen.add(key);

    const { requiredTags, expression } = parseFields(rest, lineNumber, key);
    const templateText = readQuote(lines, index, end, lineNumber, key);
    const variables = readVariables(templateText, lineNumber, key);

    entries.push({ key, requiredTags, expression, templateText, variables });
  }

  if (entries.length === 0) {
    throw new ContentParseError(start + 1, 'the Group A section contains no entries.');
  }

  return entries;
}

function parseFields(
  rest: string,
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
      lineNumber,
      `${key} does not end with an expression like *neutral*.`,
    );
  }

  const expression = expressionMatch[1] as Expression;
  if (!(EXPRESSIONS as readonly string[]).includes(expression)) {
    throw new ContentParseError(
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

  throw new ContentParseError(lineNumber, `${key} has no line. Expected a "> ..." quote below it.`);
}

function readVariables(
  templateText: string,
  lineNumber: number,
  key: string,
): readonly KnownVariable[] {
  const found = [...templateText.matchAll(VARIABLE_IN_TEXT)].map((match) => match[1]!);

  for (const variable of found) {
    if (!(KNOWN_VARIABLES as readonly string[]).includes(variable)) {
      throw new ContentParseError(
        lineNumber,
        `${key} uses unknown variable {${variable}}. Known: ${KNOWN_VARIABLES.join(', ')}.`,
      );
    }
  }

  return [...new Set(found)] as KnownVariable[];
}
