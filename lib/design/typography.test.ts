import { readFileSync } from 'node:fs';
import path from 'node:path';

import { globSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { TYPE, TYPE_FLOOR_PX, TYPE_SIZES } from './type';

/**
 * Nothing outside the type case chooses a font size.
 *
 * ## The defect this exists to stop
 *
 * Not a bug — a drift. Every arbitrary `text-[Npx]` in this product was a
 * reasonable local decision: this label is a bit long, that panel is a bit
 * tight, so shave a pixel. Two hundred and sixteen of those produced **sixteen
 * distinct font sizes**, seven call sites at 8 and 9 pixels, and thirty-one files
 * with text under 16px — in a product whose standing commissioner ruling is that *readability
 * wins* and that type is judged at real iPhone size (`VISUAL_ACCEPTANCE §7`).
 *
 * Each one of those was fixed at least once. `LEGENDARY` on cream was fixed and
 * came back on a surface no screenshot could reach; the Back Hall's 9px reveal
 * line was fixed in #48 and five more 9px sites survived it. Fixing instances is
 * how a class of defect becomes permanent: the instances are found by looking,
 * and looking does not scale.
 *
 * So the rule is structural. `lib/design/type.ts` owns the sizes; a component
 * names a role. A component that wants a size that is not a role has found
 * either a missing role or a layout problem it was about to solve with the type,
 * and `VISUAL_ACCEPTANCE §4` is explicit about which of those is allowed:
 * *"size the container to the type, never the type to the container."*
 *
 * ## Why it is a unit test rather than a lint rule
 *
 * Same reasoning as `colour-tokens.test.ts`: it is static, so it costs
 * milliseconds on every `npm run check` and needs no browser, no database and no
 * build. An ESLint rule would need a plugin package to hold it, and the thing
 * being checked is a string in a `className`, which ESLint sees as a string.
 *
 * ## What it deliberately does not check
 *
 * Icon, sprite and box dimensions. `h-[3px]`, `min-h-[48px]`, `w-[44px]` and the
 * room's own container-query units are geometry, not typography, and a rule
 * broad enough to catch them would be switched off within a milestone.
 */

const ROOT = process.cwd();

/** The file that is allowed to name a size, and the tests that read it. */
const THE_TYPE_CASE = ['lib/design/type.ts', 'lib/design/typography.test.ts'];

/**
 * The documented exceptions.
 *
 * Each one needs a reason that is about **the drawing**, not about convenience.
 * A surface that is part of the art sizes its text in the art's own units,
 * because a fixed pixel size on an element inside a scaled room would grow and
 * shrink relative to everything painted around it — which is the one case where
 * a whole-pixel type size is the *wrong* answer.
 *
 * This list is expected to stay this short. Adding to it is a decision somebody
 * has to write down here, next to the others, which is the whole mechanism.
 */
const ENVIRONMENTAL: readonly { readonly file: string; readonly why: string }[] = [
  {
    file: 'components/scene/banner-rail.tsx',
    why:
      'A season year painted on a pennant hanging in the room. It is sized in ' +
      'container-query height units derived from ROOM.height, so it scales with ' +
      'the artwork it is drawn on rather than with the browser. A fixed px size ' +
      'here would make the year grow relative to the pennant at every width.',
  },
];

const EXEMPT = new Set([...THE_TYPE_CASE, ...ENVIRONMENTAL.map((entry) => entry.file)]);

interface Offence {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

/**
 * The patterns that set type outside a role.
 *
 * `leading-` is here with the sizes because a line height is half of a type
 * decision: 17px at 1.2 and 17px at 1.5 are different roles wearing the same
 * size, and the product had eleven distinct arbitrary leadings.
 */
const FORBIDDEN: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: 'an arbitrary pixel font size', pattern: /\btext-\[\d+px\]/g },
  { name: 'a fluid or fractional font size', pattern: /\btext-\[(?:clamp|calc|[\d.]*\.\d)[^\]]*\]/g },
  { name: 'an arbitrary line height', pattern: /\bleading-\[[^\]]+\]/g },
  { name: 'an inline fontSize', pattern: /\bfontSize\s*:/g },
  { name: 'an inline lineHeight', pattern: /\blineHeight\s*:/g },
];

function sourceFiles(): string[] {
  return globSync('{app,components,lib,scripts}/**/*.{ts,tsx,mts}', { cwd: ROOT });
}

/**
 * A line that is entirely prose.
 *
 * The rule is about what a component *renders*, and this repository documents
 * the sizes it moved away from — `"the name was text-[14px] on the shelf art"` —
 * inside the comment that explains why. Flagging those would push the next
 * person to delete the history rather than the size, which is the opposite of
 * what this file is for.
 *
 * Deliberately conservative: only a line whose **first** non-space characters
 * open or continue a comment is skipped. A `className` with a trailing `//` note
 * still gets scanned, because that line renders.
 */
function isProse(line: string): boolean {
  const trimmed = line.trimStart();
  return (
    trimmed.startsWith('*') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('{/*')
  );
}

function offences(): Offence[] {
  const found: Offence[] = [];

  for (const relative of sourceFiles()) {
    if (EXEMPT.has(relative)) continue;
    const source = readFileSync(path.join(ROOT, relative), 'utf8');
    const lines = source.split('\n');

    for (const rule of FORBIDDEN) {
      for (const [index, line] of lines.entries()) {
        if (isProse(line)) continue;
        rule.pattern.lastIndex = 0;
        if (!rule.pattern.test(line)) continue;
        found.push({ file: relative, line: index + 1, text: `${rule.name}: ${line.trim()}` });
      }
    }
  }

  return found;
}

describe('the type case', () => {
  it('reads the source tree it is meant to police', () => {
    // A guard on the guard. A glob that matched nothing would make every
    // assertion below pass while checking not one line of the product.
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(60);
    expect(files).toContain('components/slice/newspaper.tsx');
    expect(files).toContain('app/admin/slice/[versionId]/page.tsx');
  });

  it('is the only place in the product that names a font size', () => {
    const found = offences();

    expect(
      found.map((offence) => `${offence.file}:${String(offence.line)} — ${offence.text}`),
      'Type is set from a role in `lib/design/type.ts`, never from a size at the ' +
        'call site. Name the job the words are doing and use TYPE.<role>; if no ' +
        'role fits, add one there rather than a size here. Environmental art that ' +
        'genuinely scales with the drawing goes in ENVIRONMENTAL above, with a ' +
        'reason about the drawing.',
    ).toEqual([]);
  });

  it('keeps the exception list short and reasoned', () => {
    // One is the number today, and it was two until the taped-up placeholder
    // sign turned out not to need it: its type is fixed px like everything
    // else's, so it was migrating rather than excepting that it wanted. This is
    // not a cap — it is a tripwire, so growing the list is a deliberate edit to
    // this line rather than a quiet append somebody notices a year later.
    expect(ENVIRONMENTAL.length).toBeLessThanOrEqual(2);
    for (const entry of ENVIRONMENTAL) {
      expect(entry.why.length, `${entry.file} needs a reason about the drawing`).toBeGreaterThan(80);
    }
  });
});

describe('bold', () => {
  /**
   * Only one of the two faces ships a bold, so only one may ask for one.
   *
   * `app/layout.tsx` installs Silkscreen at 400 **and 700**, and VT323 at 400
   * only. Ask a browser for `font-weight: 700` on VT323 and it does not fail —
   * it **synthesises** the weight by smearing the glyphs, which on a pixel face
   * is the blurry type the whole art direction is written against, arriving
   * from the renderer rather than from the artwork.
   *
   * The rule is therefore not "do not use bold" — it is that a weight must name
   * the face it is asking for. That also solves the half a static test could
   * not otherwise see: a `font-bold` span inheriting its face from three levels
   * up looks identical in the source whether the ancestor is Silkscreen or
   * VT323. Naming `font-display` on the same element makes it true rather than
   * assumed. The receipt's own header row was the instance.
   */
  it('asks for a weight only where the face has one', () => {
    const breaches: string[] = [];

    for (const relative of sourceFiles()) {
      if (relative.endsWith('typography.test.ts')) continue;
      const source = readFileSync(path.join(ROOT, relative), 'utf8');
      for (const [index, line] of source.split('\n').entries()) {
        if (isProse(line)) continue;
        if (!/\bfont-(bold|semibold|medium|extrabold|black)\b/.test(line)) continue;
        if (line.includes('font-display')) continue;
        // `font-board` loads real 500 and 700 files, so a weight on it is drawn
        // rather than synthesised — the next case pins it to those two.
        if (line.includes('font-board')) continue;
        breaches.push(`${relative}:${String(index + 1)} ${line.trim()}`);
      }
    }

    expect(
      breaches,
      'A font weight was requested without naming `font-display` or `font-board`. ' +
        'Those are the only faces this product loads extra weights for; on VT323 ' +
        'the browser fakes it and smears a pixel font. Name the face, or carry ' +
        'the emphasis with ink instead.',
    ).toEqual([]);
  });

  it('asks the board face for only the two weights that are loaded', () => {
    /*
     * The rule above lets `font-board` carry a weight because the files exist.
     * That is only true of **500 and 700** — `app/layout.tsx` imports those two
     * and no others, deliberately, so the board ships two files instead of nine.
     *
     * `font-semibold` (600) or `font-black` (900) would look right in a browser
     * that has them and be synthesised everywhere else, which is the same defect
     * the VT323 rule exists to prevent, arriving through the new face.
     */
    const layout = readFileSync(path.join(ROOT, 'app', 'layout.tsx'), 'utf8');
    const loaded = [...layout.matchAll(/big-shoulders-display\/(\d+)/g)].map((m) => m[1]);
    expect(loaded.sort()).toEqual(['500', '700']);

    const allowed = new Set(['font-medium', 'font-bold']);
    for (const [name, role] of Object.entries(TYPE)) {
      if (!role.includes('font-board')) continue;
      for (const weight of role.match(/\bfont-(bold|semibold|medium|extrabold|black)\b/g) ?? []) {
        expect(allowed.has(weight), `${name} asks for ${weight}, which is not loaded`).toBe(true);
      }
    }
  });
});

describe('the size vocabulary', () => {
  const sizes = Object.values(TYPE).flatMap((role) =>
    [...role.matchAll(/text-\[(\d+)px\]/g)].map((match) => Number(match[1])),
  );

  it('draws every role from the declared vocabulary', () => {
    const declared = new Set<number>(TYPE_SIZES);
    const stray = [...new Set(sizes)].filter((size) => !declared.has(size)).sort((a, b) => a - b);

    expect(
      stray,
      'A role introduced a size that is not in TYPE_SIZES. Either it belongs in ' +
        'the vocabulary — which is a decision worth making on purpose — or the ' +
        'role should use one that is already there.',
    ).toEqual([]);
  });

  it('uses every size it declares', () => {
    const used = new Set(sizes);
    const unused = TYPE_SIZES.filter((size) => !used.has(size));

    // A vocabulary with dead entries is a vocabulary nobody is really keeping.
    expect(unused, 'TYPE_SIZES declares a size no role uses').toEqual([]);
  });

  it('holds the reduction: seven sizes, where there were sixteen', () => {
    /*
     * **This number moved once, from six to seven, and the movement is the
     * point rather than a relaxation.**
     *
     * The guard worked exactly as its own comment says it should: the Tonight
     * board's headline needed a size that was not on the list, so somebody had
     * to come here and decide whether the vocabulary should grow. It did, at 35,
     * for one role on one surface, chosen by browser measurement against the
     * board's real 120.4px field rather than by eye — the table is in
     * `TYPE_SIZES`.
     *
     * Seven is still an assertion, not a ceiling being lifted. An eighth is the
     * same conversation again, which is the whole mechanism.
     */
    expect(TYPE_SIZES.length).toBe(7);
    expect(new Set(sizes).size).toBe(7);
  });

  it('keeps the new display size to the one surface it was added for', () => {
    /*
     * 35 was authorised for the board headline specifically. If a second role
     * reaches for it, the vocabulary has quietly grown a general "very large"
     * size — which is how sixteen sizes happened the first time.
     */
    const at35 = Object.entries(TYPE).filter(([, role]) => role.includes('text-[35px]'));
    expect(at35.map(([name]) => name)).toEqual(['boardHero']);
  });

  it('sets the board’s two roles in the board face, and nothing else in it', () => {
    /*
     * `font-board` is a third typeface admitted for one printed object inside
     * the room. Every other surface is pixel art or set in the pixel faces, and
     * a display face leaking outwards would undo that distinction quietly.
     */
    const board = Object.entries(TYPE).filter(([, role]) => role.includes('font-board'));
    expect(board.map(([name]) => name).sort()).toEqual(['boardDetail', 'boardHero']);
  });

  it('sets nothing below the floor', () => {
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(TYPE_FLOOR_PX);
    expect(TYPE_FLOOR_PX).toBe(13);
  });

  it('sets every size on a whole pixel', () => {
    // Both faces are pixel faces. A fractional size resamples the glyph grid and
    // the type goes soft — the same defect the art pipeline exists to avoid.
    for (const role of Object.values(TYPE)) {
      expect(role).not.toMatch(/text-\[[\d.]*\.\d/);
      expect(role).not.toMatch(/clamp\(|calc\(|vw\b|vh\b/);
    }
  });
});

describe('the roles themselves', () => {
  it('names a face for every role', () => {
    // `font-board` joined the list for the Tonight board — a printed sign inside
    // the room, and the one surface allowed a face that is not pixel art.
    for (const [name, role] of Object.entries(TYPE)) {
      expect(role, `${name} must name its face`).toMatch(/\bfont-(display|sans|mono|board)\b/);
    }
  });

  it('names a size for every role', () => {
    for (const [name, role] of Object.entries(TYPE)) {
      expect(role, `${name} must name its size`).toMatch(/\btext-\[\d+px\]/);
    }
  });

  it('names a line height for every role', () => {
    for (const [name, role] of Object.entries(TYPE)) {
      expect(role, `${name} must name its leading`).toMatch(/\bleading-\[[\d.]+\]/);
    }
  });

  it('carries no colour', () => {
    // Colour is the surface's decision — this room has a cream ground and a dark
    // one, and the same role is `ink-700` on one and `paper-mid` on the other.
    for (const [name, role] of Object.entries(TYPE)) {
      expect(role, `${name} must not fix a colour`).not.toMatch(/\btext-(ink|paper|wood|red|amber|blue)-/);
    }
  });

  it('carries no layout', () => {
    for (const [name, role] of Object.entries(TYPE)) {
      expect(role, `${name} must not carry spacing`).not.toMatch(/\b(m|p)[trblxy]?-/);
      expect(role, `${name} must not carry width`).not.toMatch(/\b(w|h|max-w|min-w)-/);
    }
  });

  it('sets every display role in caps, and no body role', () => {
    // The two faces do different jobs. Silkscreen is signage — painted, short,
    // uppercase. VT323 carries sentences, and a paragraph in caps is a sign
    // somebody mistook for prose.
    for (const [name, role] of Object.entries(TYPE)) {
      if (name === 'machine') continue; // a hash has no case to set
      if (role.includes('font-display') && !/score|ledgerValue/i.test(name)) {
        expect(role, `${name} is signage and should be uppercase`).toContain('uppercase');
      }
      if (role.includes('font-sans')) {
        expect(role, `${name} carries sentences and must not be uppercase`).not.toContain('uppercase');
      }
    }
  });
});
