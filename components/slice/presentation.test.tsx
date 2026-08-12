import { readFileSync } from 'node:fs';
import path from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { type Edition } from '@/lib/slice/render';

import { Newspaper } from './newspaper';

/**
 * The paper is presentation, and presentation decides nothing.
 *
 * ## What this file is for
 *
 * The text-surface refresh rebuilt how the Slice and the press desk *look*. The
 * standing risk in that kind of change is not that it breaks a route — a route
 * breaking is loud — but that a component quietly starts computing something on
 * its way to displaying it. A margin here, a rounded score there, a "which of
 * these was bigger" in a sort call, and `MANDATE §9`'s rule that Stats is the
 * sole authority on what a result meant is gone without one test failing.
 *
 * So these assertions are about the **boundary** rather than about the pixels:
 * the display components take typed display data and print it, and the next
 * visual redesign can replace every one of them without touching a fact.
 *
 * Rendered to static markup rather than asserted against the constant tables,
 * because both defect classes below are invisible in a table and visible on the
 * page.
 */

/* ------------------------------------------------------------------ fixtures */

function edition(over: Partial<Edition> = {}): Edition {
  return {
    season: 2025,
    week: 14,
    dateline: 'Season 2025 · Week 14',
    character: 'ordinary',
    headline: 'Cheese handles Nathan',
    deck: 'Cheese 154.42, Nathan 118.06',
    body: 'Cheese put up 154.42 and Nathan answered with 118.06.',
    secondary: [],
    scoreboard: [],
    column: 'Slow Tuesday. The oven is still warm.',
    nothingToPrint: null,
    ...over,
  };
}

const SCORE = {
  key: 'g1',
  leftName: 'Cheese',
  leftPoints: '154.42',
  rightName: 'Nathan',
  rightPoints: '118.06',
  leftWon: true,
  tie: false,
} as const;

/* -------------------------------------------------------------------- board */

describe('the board is not printed', () => {
  /*
   * **Commissioner ruling, 2026-08-11: the paper stops printing the scoreboard.**
   * `08 §1` — not *"a box-score summary"*; `08 §29` — *"no fixed section is
   * forced."*
   *
   * These assertions replace four that tested how the board rendered, and the
   * replacement is deliberate rather than a deletion. Two of the four could not
   * survive a section that no longer exists. The other two would have gone on
   * **passing vacuously**: the fixture's own deck and body carry `154.42`, so
   * `expect(markup).toContain('154.42')` stayed green with the board gone and
   * tested nothing at all. That is the false-green shape this repository has
   * paid for twice, and it is why the numbers below appear nowhere else in the
   * fixture.
   *
   * The tie guarantee those tests protected has moved rather than gone —
   * `lib/slice/slice.test.ts` pins it on `renderEdition`, which is where the
   * data is made and where it still matters for whoever prints a board next.
   */
  const UNIQUE = {
    key: 'g-unique',
    leftName: 'Zebediah',
    leftPoints: '199.91',
    rightName: 'Quintus',
    rightPoints: '101.19',
    leftWon: true,
    tie: false,
  } as const;

  it('prints no score from the scoreboard, and no name only the scoreboard knows', () => {
    const markup = renderToStaticMarkup(
      <Newspaper issue={edition({ scoreboard: [UNIQUE] })} />,
    );

    expect(markup).not.toContain('199.91');
    expect(markup).not.toContain('101.19');
    expect(markup).not.toContain('Zebediah');
    expect(markup).not.toContain('Quintus');
    expect(markup).not.toContain('The board');
  });

  it('renders the same paper whether or not a scoreboard was supplied', () => {
    /*
     * The strongest form of *"it is not printed"*: the markup is byte-identical
     * with a full board and with none. A stray separator, heading or empty rule
     * left behind by the removal fails here and nowhere else.
     */
    const withBoard = renderToStaticMarkup(
      <Newspaper issue={edition({ scoreboard: [UNIQUE, SCORE] })} />,
    );
    const without = renderToStaticMarkup(<Newspaper issue={edition({ scoreboard: [] })} />);

    expect(withBoard).toBe(without);
  });

  it('still carries the scoreboard in the edition, because the record is not the page', () => {
    /*
     * `Edition.scoreboard` is untouched by the ruling — it stays in the packet,
     * in the published snapshot and in `editionHash`, so no version's hash
     * moved. This asserts the distinction the ruling rests on: the paper stopped
     * *printing* the week's results, not *knowing* them.
     */
    expect(edition({ scoreboard: [UNIQUE] }).scoreboard).toEqual([UNIQUE]);
  });
});

/* ----------------------------------------------------------------- masthead */

describe('the masthead', () => {
  it('flags a championship issue without deciding it was one', () => {
    const title = renderToStaticMarkup(<Newspaper issue={edition({ character: 'title' })} />);
    const plain = renderToStaticMarkup(<Newspaper issue={edition({ character: 'ordinary' })} />);

    expect(title).toContain('The championship');
    expect(plain).not.toContain('The championship');
  });

  it('prints the dateline the renderer built, verbatim', () => {
    // Including the playoff clause, which `datelineOf` appends. Parsing it back
    // apart in a component would be the interface re-deriving a fact.
    const markup = renderToStaticMarkup(
      <Newspaper issue={edition({ dateline: 'Season 2025 · Week 15 · Playoffs' })} />,
    );
    expect(markup).toContain('Season 2025 · Week 15 · Playoffs');
  });

  it('breaks the nameplate where it was told to, on every issue', () => {
    const markup = renderToStaticMarkup(<Newspaper issue={edition()} />);
    // Two spans, not one string the browser wrapped wherever it liked.
    expect(markup).toContain('Tony');
    expect(markup).toContain('Tuesday Slice');
  });
});

/* ------------------------------------------------------------ quiet editions */

describe('a week with nothing to print', () => {
  it('says so, and prints no board and no provenance clause', () => {
    const markup = renderToStaticMarkup(
      <Newspaper
        issue={edition({
          nothingToPrint: 'The books are still open on this one.',
          scoreboard: [SCORE],
          deck: null,
        })}
      />,
    );

    expect(markup).toContain('The books are still open on this one.');
    expect(markup).not.toContain('154.42');
    // "every number checked" under a page with no numbers on it is true and
    // incoherent, so the provenance clause drops.
    expect(markup).not.toContain('own records');
    expect(markup).toContain('Free with any slice');
  });
});

/* ------------------------------------------------------- the boundary itself */

/**
 * The presentation layer may not import the fact layer.
 *
 * This is the assertion that outlives every visual redesign. A component that
 * cannot reach `lib/stats` or the Slice's selection, packet and validation
 * modules cannot re-derive a fantasy fact however it is rewritten — and the
 * failure mode being guarded against is somebody reaching for `deriveStories`
 * "just to sort the board", which reads as harmless and moves the authority.
 */
const PRESENTATION = [
  'components/slice/newspaper.tsx',
  'components/slice/review.tsx',
  'components/slice/stakes-band.tsx',
  'components/slice/preseason.tsx',
  'components/slice/draft-desk.tsx',
  'components/scene/text-surface.tsx',
];

const FACT_LAYER = [
  '@/lib/stats',
  '@/lib/slice/select',
  '@/lib/slice/packet',
  '@/lib/slice/validate',
  '@/lib/slice/edition',
  /*
   * The draft review's own fact layer.
   *
   * `preseason.ts` assembles and validates, `draft-facts.ts` counts, and
   * `preseason-reviews.ts` reads and writes the editorial rows — all three reach
   * the database. A component may name their **types**, which is how the
   * boundary is stated, and may not call into them.
   *
   * `draft-vocabulary.ts` is deliberately absent: it is a leaf with no imports
   * holding the words and the grade domain, and it exists precisely so a screen
   * can know what a grade can be without importing a schema.
   */
  '@/lib/slice/preseason',
  '@/lib/slice/preseason-reviews',
  '@/lib/slice/preseason-desk',
  '@/lib/slice/draft-facts',
  '@/lib/db',
];

describe('the presentation boundary', () => {
  it('reads the files it is meant to police', () => {
    for (const relative of PRESENTATION) {
      expect(readFileSync(path.join(process.cwd(), relative), 'utf8').length).toBeGreaterThan(200);
    }
  });

  it('imports nothing from the fact layer', () => {
    const breaches: string[] = [];

    for (const relative of PRESENTATION) {
      const source = readFileSync(path.join(process.cwd(), relative), 'utf8');
      for (const match of source.matchAll(/(import\s+type\s+)?[^\n]*?from\s+'([^']+)'/g)) {
        /*
         * A type-only import is erased at build time and carries nothing into
         * the bundle. It is also how the boundary is **stated** — a component
         * takes a `PreseasonPacket` and prints it — so refusing one would refuse
         * the very thing being asserted. `import type` is skipped; a value
         * import of the same module is not.
         */
        if (match[1] !== undefined) continue;
        const spec = match[2] ?? '';
        if (FACT_LAYER.some((banned) => spec === banned || spec.startsWith(`${banned}/`))) {
          breaches.push(`${relative} imports ${spec}`);
        }
      }
    }

    expect(
      breaches,
      'A display component reached into the fact layer. Visual components receive ' +
        'typed display data from the services that already computed it; they do not ' +
        'compute scores, margins, standings, significance, validation outcomes, ' +
        'publishability or approval state (`MANDATE §9`).',
    ).toEqual([]);
  });

  it('does no arithmetic on a fact', () => {
    /*
     * Type-only imports of a shape are fine and necessary — `type Edition` is
     * how the boundary is *stated*. What is not fine is a component doing sums.
     * Scoped to arithmetic between identifiers so that a `.length` comparison or
     * an index stays legal.
     */
    const breaches: string[] = [];
    for (const relative of PRESENTATION) {
      const source = readFileSync(path.join(process.cwd(), relative), 'utf8');
      for (const [index, line] of source.split('\n').entries()) {
        const trimmed = line.trimStart();
        if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
          continue;
        }
        if (/\b(?:points|score|margin|total|balance)\w*\s*[-+*/]\s*\w/i.test(line)) {
          breaches.push(`${relative}:${String(index + 1)} ${line.trim()}`);
        }
        if (/\btoFixed\(|Math\.(round|abs|max|min)\(/.test(line)) {
          breaches.push(`${relative}:${String(index + 1)} ${line.trim()}`);
        }
      }
    }

    expect(breaches, 'a display component is computing rather than printing').toEqual([]);
  });
});
