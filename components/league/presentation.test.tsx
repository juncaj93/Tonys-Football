import { readFileSync } from 'node:fs';
import path from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { type TimelineSeason } from '@/lib/league/timeline';

import { SeasonRecord } from './season-record';

/**
 * The wall is presentation, and presentation decides nothing.
 *
 * The same boundary `components/slice/presentation.test.tsx` polices, applied to
 * the Timeline for the same reason: the risk in a page that shows fantasy
 * results is not that it breaks — that is loud — but that it quietly starts
 * computing on the way to displaying. A `.toFixed()` here, a "which of these was
 * bigger" in a sort there, and `MANDATE §9`'s rule that Stats is the sole
 * authority on what a result meant is gone with no test failing.
 */

const PRESENTATION = ['components/league/season-record.tsx'];

/** Modules a display component may not reach into. */
const FACT_LAYER = ['@/lib/stats', '@/lib/db', '@/lib/slice/render', '@/lib/slice/select'];

function season(over: Partial<TimelineSeason> = {}): TimelineSeason {
  return {
    year: 2025,
    champion: 'Matty B',
    current: false,
    finalized: true,
    facts: [
      {
        id: '2025-w16-largest-margin',
        kind: 'largest-margin',
        week: '16',
        winner: 'Brandon',
        loser: 'Matt Lee',
        winnerPoints: '165.36',
        loserPoints: '89.80',
      },
    ],
    moreFacts: 32,
    quietBecause: null,
    ...over,
  };
}

describe('a season on the wall', () => {
  it('prints the scores it was handed, unchanged', () => {
    const html = renderToStaticMarkup(<SeasonRecord season={season()} />);
    expect(html).toContain('165.36');
    // The trailing zero survives. A component that re-formatted would print 89.8.
    expect(html).toContain('89.80');
  });

  it('says how many it is not showing', () => {
    /*
     * The cap, said out loud. A reader cannot tell a short list from a trimmed
     * one, and two of thirty-three shown silently is a claim that the season had
     * two things worth recording.
     */
    expect(renderToStaticMarkup(<SeasonRecord season={season()} />)).toContain('32 more');
  });

  it('says nothing about a cap when there is none', () => {
    const html = renderToStaticMarkup(<SeasonRecord season={season({ moreFacts: 0 })} />);
    expect(html).not.toContain('more on record');
  });

  it('explains a season with nothing on it rather than rendering a blank', () => {
    const html = renderToStaticMarkup(
      <SeasonRecord
        season={season({
          champion: null,
          current: true,
          finalized: false,
          facts: [],
          moreFacts: 0,
          quietBecause: 'Still being played. Nothing on the record yet.',
        })}
      />,
    );
    expect(html).toContain('Still being played');
    expect(html).toContain('In progress');
  });

  it('anchors on the year, so a banner can link straight to it', () => {
    // `banner-rail.tsx` links `/timeline#2025`. If this id changes the link
    // silently stops landing anywhere and nothing else notices.
    expect(renderToStaticMarkup(<SeasonRecord season={season()} />)).toContain('id="2025"');
  });
});

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
      for (const match of source.matchAll(/from\s+'([^']+)'/g)) {
        const spec = match[1] ?? '';
        if (FACT_LAYER.some((banned) => spec === banned || spec.startsWith(`${banned}/`))) {
          breaches.push(`${relative} imports ${spec}`);
        }
      }
    }
    expect(
      breaches,
      'A display component reached into the fact layer. It receives typed display ' +
        'data from the derivation that already computed it (`MANDATE §9`).',
    ).toEqual([]);
  });

  it('does no arithmetic on a fact, and no formatting either', () => {
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
