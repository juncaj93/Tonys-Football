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

  it('says when, in the league zone, with the offset named', () => {
    /*
     * Visual debt 11. The record showed *who* and *in what order* and the answer
     * to *"when was this approved"* sat unread in `slice_reviews.occurred_at`.
     *
     * Asserted on the rendered page rather than on `stamp()` — `lib/design/
     * moment.test.ts` already pins the format, and what this adds is that the
     * value actually reaches the markup. A formatter nothing calls is not a
     * feature.
     */
    const markup = renderToStaticMarkup(
      <HistoryPanel history={[{ action: 'approved', actorName: 'Alex', note: null, occurredAt: at }]} />,
    );

    // Noon UTC on 1 August is 8:00 AM in Michigan, in daylight time.
    expect(markup).toContain('1 Aug 2026, 8:00 AM EDT');
  });

  it('stamps every row, so no decision in the record is undated', () => {
    const actions: ReviewEvent['action'][] = ['generated', 'submitted', 'approved'];
    const markup = renderToStaticMarkup(<HistoryPanel history={history(...actions)} />);

    // One stamp per row. A record that dates some of its entries is worse than
    // one that dates none, because the gaps look like facts.
    const stamps = markup.match(/1 Aug 2026, 8:00 AM EDT/g) ?? [];
    expect(stamps).toHaveLength(actions.length);
  });
});
