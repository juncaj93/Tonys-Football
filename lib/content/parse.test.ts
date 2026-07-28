import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ContentParseError, parseCounterGreetings } from './parse';

/**
 * The markdown file is the source of truth for the lines, so the parser is
 * tested against the committed file rather than a fixture. If the commissioner
 * edits `content/counter-greetings.md` into a shape the parser cannot read,
 * that should fail here — in CI, with a line number — and not silently drop a
 * greeting in production.
 */

const MARKDOWN = readFileSync(
  path.join(process.cwd(), 'content', 'counter-greetings.md'),
  'utf8',
);

const entries = parseCounterGreetings(MARKDOWN);
const byKey = new Map(entries.map((entry) => [entry.key, entry]));

describe('the committed Counter Greetings', () => {
  it('reads every Group A line', () => {
    expect(entries).toHaveLength(21);
    expect(entries.map((entry) => entry.key)).toEqual(
      Array.from({ length: 21 }, (_, index) => `A${String(index + 1)}`),
    );
  });

  /**
   * Group B draws on character canon rather than imported data, needs
   * commissioner sign-off, and depends on a Sleeper-username mapping that is
   * still unresolved for four accounts — so a Group B line could land a joke on
   * the wrong person. The parser stops at the heading.
   */
  it('stops dead at Group B', () => {
    expect(entries.some((entry) => entry.key.startsWith('B'))).toBe(false);
    // The file really does contain Group B, so this is a boundary being held
    // rather than an absence being observed.
    expect(MARKDOWN).toContain('# Group B');
    expect(MARKDOWN).toContain('**B1**');
  });

  it('reads the conditions off a multi-tag line', () => {
    expect(byKey.get('A1')).toMatchObject({
      requiredTags: ['champion_2025', 'title_at_500_or_worse'],
      expression: 'unimpressed',
    });
    expect(byKey.get('A1')?.templateText).toContain('Seven and seven');
  });

  it('leaves the untagged fallbacks untagged', () => {
    for (const key of ['A13', 'A14', 'A15', 'A16']) {
      expect(byKey.get(key)?.requiredTags, key).toEqual([]);
    }
  });

  /**
   * A15's middle field is `{days}` — the variable the line needs, not a tag it
   * requires. Read as a tag it would require somebody to hold a tag literally
   * called "{days}", nobody would, and the line would silently never appear.
   */
  it('does not mistake a variable marker for a tag', () => {
    expect(byKey.get('A15')?.requiredTags).toEqual([]);
    expect(byKey.get('A15')?.variables).toEqual(['name', 'days']);
  });

  it('finds the variables each line actually uses', () => {
    expect(byKey.get('A1')?.variables).toEqual(['name']);
    // A17 is the one line addressed to nobody by name.
    expect(byKey.get('A17')?.variables).toEqual([]);
  });

  it('gives every line one of Tony’s three expressions', () => {
    for (const entry of entries) {
      expect(['neutral', 'pleased', 'unimpressed'], entry.key).toContain(entry.expression);
    }
  });

  /**
   * `12 §10` keeps profanity out of onboarding contexts, and the greeting is
   * the first thing a manager ever sees.
   */
  it('keeps the first screen clean', () => {
    const banned = /\b(fuck|shit|bastard|asshole)\b/i;
    for (const entry of entries) {
      expect(banned.test(entry.templateText), entry.key).toBe(false);
    }
  });

  it('keeps every line short enough to read at a glance', () => {
    for (const entry of entries) {
      expect(entry.templateText.length, `${entry.key} is long`).toBeLessThan(180);
    }
  });
});

describe('malformed content fails loudly', () => {
  const wrap = (body: string): string => `# Group A\n\n${body}\n`;

  it('rejects an entry with no line', () => {
    expect(() => parseCounterGreetings(wrap('**A1** · *neutral*\n\n**A2** · *neutral*\n\n> Hi.')))
      .toThrow(ContentParseError);
  });

  it('rejects an unknown expression', () => {
    expect(() => parseCounterGreetings(wrap('**A1** · *delighted*\n\n> Hi.'))).toThrow(
      /expected one of/,
    );
  });

  it('rejects an unknown variable rather than rendering a gap', () => {
    // `05 §2.3`: a line whose variables cannot be resolved is skipped, never
    // rendered with a hole in it. An unknown variable could never resolve.
    expect(() => parseCounterGreetings(wrap('**A1** · *neutral*\n\n> Hi {nickname}.'))).toThrow(
      /unknown variable/,
    );
  });

  it('rejects a duplicate key', () => {
    expect(() =>
      parseCounterGreetings(wrap('**A1** · *neutral*\n\n> One.\n\n**A1** · *neutral*\n\n> Two.')),
    ).toThrow(/duplicate/);
  });

  it('rejects an unreadable condition', () => {
    expect(() => parseCounterGreetings(wrap('**A1** · champion_2025 · *neutral*\n\n> Hi.')))
      .toThrow(/unreadable condition/);
  });

  it('says where the problem is', () => {
    try {
      parseCounterGreetings(wrap('**A1** · *delighted*\n\n> Hi.'));
      expect.unreachable('should have thrown');
    } catch (error: unknown) {
      expect((error as Error).message).toMatch(/counter-greetings\.md:3/);
    }
  });

  it('refuses a file with no Group A section at all', () => {
    expect(() => parseCounterGreetings('# Something else\n')).toThrow(/no "# Group A"/);
  });
});
