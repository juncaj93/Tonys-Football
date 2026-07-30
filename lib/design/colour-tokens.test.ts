import { readFileSync } from 'node:fs';
import path from 'node:path';

import { globSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Every project colour a component asks for must actually exist.
 *
 * ## The defect this exists to stop
 *
 * Tailwind 4 builds utilities from `--color-*` custom properties. Ask for
 * `text-paper-light` when `--color-paper-light` was never defined and **nothing
 * fails**: no build error, no lint error, no console warning. The class simply
 * generates no rule, the element inherits whatever its ancestor had, and the
 * result is usually *close enough to look deliberate*.
 *
 * Four such sites had shipped:
 *
 *   - `text-paper-light` on the banner years — inherited cream from `<body>` and
 *     happened to look right on a red pennant
 *   - `text-paper-light` twice in `/timeline` — inherited ink from the cream
 *     panel and happened to look right
 *   - `text-amber-light` on the champion panel's link — inherited cream, among
 *     amber furniture, and looked like a deliberate choice nobody had made
 *
 * None of them was visibly broken, which is exactly why none of them was found.
 * They are worse than a visible bug: the stylesheet says one thing, the screen
 * shows another, and the next person to touch the file has no way to know which
 * was intended.
 *
 * ## Why this is a unit test and not a `visual:qa` gate
 *
 * It is static — it needs no browser, no database and no build — so it belongs
 * where it runs in two milliseconds on every `npm run check`, not in the
 * five-minute screenshot job. `visual:qa` catches what a *rendered* page gets
 * wrong; this catches a reference that was never valid in the first place.
 */

const ROOT = process.cwd();

/** Colour families this project defines. Tailwind's own palette is not our business. */
function definedTokens(): Set<string> {
  const css = readFileSync(path.join(ROOT, 'app', 'globals.css'), 'utf8');
  return new Set([...css.matchAll(/--color-([a-z0-9-]+)\s*:/g)].map((m) => m[1]!));
}

/**
 * Utility prefixes that resolve a colour.
 *
 * Deliberately explicit rather than a catch-all: `flex-1` and `text-[17px]` are
 * not colours, and a regex loose enough to match them would produce noise until
 * somebody switched the test off.
 */
const COLOUR_PREFIXES = [
  'text',
  'bg',
  'border',
  'decoration',
  'fill',
  'stroke',
  'ring',
  'outline',
  'divide',
  'accent',
  'caret',
  'from',
  'via',
  'to',
  'shadow',
] as const;

interface Usage {
  readonly token: string;
  readonly file: string;
}

function colourUsages(): Usage[] {
  const files = globSync('{app,components,lib}/**/*.{ts,tsx}', { cwd: ROOT });
  const pattern = new RegExp(
    `\\b(?:${COLOUR_PREFIXES.join('|')})-([a-z]+-[a-z0-9]+)(?:/\\d{1,3})?\\b`,
    'g',
  );

  const usages: Usage[] = [];
  for (const relative of files) {
    if (relative.endsWith('colour-tokens.test.ts')) continue;
    const source = readFileSync(path.join(ROOT, relative), 'utf8');
    for (const match of source.matchAll(pattern)) {
      usages.push({ token: match[1]!, file: relative });
    }
  }
  return usages;
}

describe('project colour tokens', () => {
  const defined = definedTokens();

  it('defines the palette families the room is built from', () => {
    // A guard on the guard: if this ever reads zero tokens, every assertion
    // below would pass vacuously.
    const families = new Set([...defined].map((token) => token.split('-')[0]));
    expect(families).toContain('ink');
    expect(families).toContain('paper');
    expect(families).toContain('wood');
    expect(families).toContain('rarity');
    expect(defined.size).toBeGreaterThan(20);
  });

  it('never references a project colour that does not exist', () => {
    const families = new Set([...defined].map((token) => token.split('-')[0]));

    const dead = colourUsages().filter((usage) => {
      if (defined.has(usage.token)) return false;
      // Only judge families this project owns. `bg-red-500` is Tailwind's and is
      // fine; `bg-red-neon` would be ours and would be a typo.
      return families.has(usage.token.split('-')[0]!);
    });

    // Reported with file names, because "a token is dead" is useless without
    // knowing which surface is silently inheriting.
    expect(
      dead.map((usage) => `${usage.token} in ${usage.file}`),
      'a Tailwind class references an undefined --color-* token, so it silently ' +
        'generates no rule and the element inherits instead. Define the token or ' +
        'use a real one.',
    ).toEqual([]);
  });
});
