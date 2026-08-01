import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { type ReviewEvent } from '@/lib/slice/publication';

import { HistoryPanel } from './review';

/**
 * The record, as prose.
 *
 * Both assertions below are for defects that **shipped into a screenshot** and
 * that no other test in this repository could have caught, because they are
 * about the rendered sentence rather than about the data behind it:
 *
 *   1. `&rsquo;` inside a JSX *expression* is a string, not markup, so the audit
 *      trail printed the literal `Tony&rsquo;s press` — an HTML entity, as text,
 *      on the one screen whose whole job is to be believed.
 *   2. The phrases were verbs with ` it` appended, which reads correctly for
 *      *"drafted it"* and produces **"put up for review it"** for the one action
 *      whose verb already has an object.
 *
 * Rendered to static markup rather than asserted against the constant tables,
 * because both defects are invisible in the table and visible on the page.
 */

const at = new Date('2026-08-01T12:00:00Z');

function history(...actions: ReviewEvent['action'][]): readonly ReviewEvent[] {
  return actions.map((action) => ({ action, actorName: null, note: null, occurredAt: at }));
}

describe('the review record', () => {
  it('never prints an HTML entity as text', () => {
    const markup = renderToStaticMarkup(<HistoryPanel history={history('generated')} />);

    // `&amp;` is how a *literal* ampersand comes back out of static markup, so
    // its presence means an entity survived into the text of the page.
    expect(markup).not.toContain('&amp;');
    expect(markup).toContain('Tony');
  });

  it('reads as a sentence for every action', () => {
    const markup = renderToStaticMarkup(
      <HistoryPanel
        history={history('generated', 'submitted', 'approved', 'rejected', 'published', 'superseded')}
      />,
    );

    expect(markup).toContain('put it up for review');
    expect(markup).not.toContain('review it');
    for (const phrase of ['drafted it', 'approved it', 'refused it', 'printed it', 'replaced it']) {
      expect(markup, phrase).toContain(phrase);
    }
  });

  it('names whoever made the decision, when one did', () => {
    const markup = renderToStaticMarkup(
      <HistoryPanel history={[{ action: 'approved', actorName: 'Alex', note: 'reads straight', occurredAt: at }]} />,
    );

    expect(markup).toContain('Alex');
    expect(markup).toContain('reads straight');
  });
});
