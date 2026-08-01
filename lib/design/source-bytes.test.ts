import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * No source file is binary to git.
 *
 * ## The defect this is written against
 *
 * `lib/content/draw.ts` shipped with a **NUL byte** where a separator string was
 * meant to be: `parts.join('\0')`. It worked. Typecheck passed, lint passed, 947
 * tests passed, the production build passed, and 59 visual states passed.
 *
 * What it broke was **review**. Git's binary heuristic is "does the first
 * blob-sized chunk contain a NUL", so the file's diff read
 *
 * ```
 * lib/content/draw.ts | Bin 0 -> 3225 bytes
 * ```
 *
 * — no lines, no context, nothing a reviewer could read. A file nobody can
 * review is a file that ships unreviewed, and the thing hiding in this one
 * happened to be harmless. The next one would not have to be.
 *
 * It was caught by reading the diff before opening the pull request, which is
 * the only step in the whole pipeline that could have caught it. This test is
 * that step, made automatic.
 *
 * ## Why bytes rather than a linter rule
 *
 * ESLint parses; it does not object to a control character inside a string
 * literal, and it never sees a file it cannot parse. The property being asserted
 * is about the file on disk, so it is checked on the file on disk.
 */

const ROOT = process.cwd();

/** Directories with no reviewable source in them. */
const SKIP = new Set(['node_modules', '.next', '.git', 'coverage', 'out', 'public', 'art', 'fixtures']);

/** Everything a human is expected to read in a diff. */
const REVIEWABLE = /\.(ts|tsx|mts|js|mjs|cjs|css|md|json|sql|yml|yaml)$/;

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') && entry !== '.github') continue;
    if (SKIP.has(entry)) continue;

    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, found);
    else if (REVIEWABLE.test(entry)) found.push(full);
  }
  return found;
}

describe('source files stay reviewable', () => {
  const files = sourceFiles(ROOT);

  it('finds the source tree at all', () => {
    // A traversal that quietly matched nothing would make every assertion below
    // vacuously true — the shape of false green this repository has shipped
    // three times in the visual driver.
    expect(files.length).toBeGreaterThan(100);
  });

  it('contains no NUL byte anywhere', () => {
    const binary = files.filter((file) => readFileSync(file).includes(0));

    expect(binary.map((file) => path.relative(ROOT, file))).toEqual([]);
  });

  it('contains no other control character that would confuse a diff', () => {
    /*
     * Tab, newline and carriage return are ordinary. Everything else below 0x20
     * is a control character that no source file in this repository has a reason
     * to carry, and several of them render as nothing at all in an editor —
     * which is the same "you cannot see it, so you cannot review it" problem the
     * NUL had, one step less severe.
     */
    const offenders: string[] = [];

    for (const file of files) {
      const bytes = readFileSync(file);
      for (const byte of bytes) {
        if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) {
          offenders.push(`${path.relative(ROOT, file)} contains 0x${byte.toString(16)}`);
          break;
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
