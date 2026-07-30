import { describe, expect, it } from 'vitest';

import { renderTemplate, selectContent, type SelectableEntry } from './select';

const NOW = new Date('2026-07-28T12:00:00Z');

function entry(partial: Partial<SelectableEntry> & { id: string }): SelectableEntry {
  return {
    key: partial.id,
    requiredTags: [],
    excludedTags: [],
    templateText: `line ${partial.id}`,
    weight: 100,
    cooldownDays: 3,
    maxUsesPerSeason: null,
    sensitivity: 'ordinary',
    ...partial,
  };
}

const base = {
  variables: { name: 'Alex' },
  usage: [],
  now: NOW,
  random: () => 0,
} as const;

describe('eligibility', () => {
  it('keeps a line whose tags the viewer holds', () => {
    const chosen = selectContent({
      ...base,
      candidates: [entry({ id: 'champ', requiredTags: ['champion_2025'] })],
      tags: new Set(['champion_2025']),
    });
    expect(chosen?.entry.id).toBe('champ');
  });

  it('drops a line whose tags the viewer does not hold', () => {
    const chosen = selectContent({
      ...base,
      candidates: [entry({ id: 'champ', requiredTags: ['champion_2025'] })],
      tags: new Set(['never_champion']),
    });
    expect(chosen).toBeNull();
  });

  it('requires every tag, not any of them', () => {
    const chosen = selectContent({
      ...base,
      candidates: [entry({ id: 'both', requiredTags: ['champion_2025', 'title_at_500_or_worse'] })],
      tags: new Set(['champion_2025']),
    });
    expect(chosen).toBeNull();
  });

  it('honours exclusions', () => {
    const chosen = selectContent({
      ...base,
      candidates: [entry({ id: 'x', excludedTags: ['newest_manager'] })],
      tags: new Set(['newest_manager']),
    });
    expect(chosen).toBeNull();
  });

  it('keeps restricted content off a surface that has not allowed it', () => {
    // `16 §10`: restricted content is surface-gated, never in an auth flow,
    // never on a shareable URL, never in an LLM prompt.
    const candidates = [entry({ id: 'r', sensitivity: 'restricted' })];
    expect(selectContent({ ...base, candidates, tags: new Set() })).toBeNull();
    expect(
      selectContent({ ...base, candidates, tags: new Set(), allowRestricted: true })?.entry.id,
    ).toBe('r');
  });
});

describe('variables', () => {
  it('substitutes what it has', () => {
    expect(renderTemplate('Morning, {name}.', { name: 'Alex' })).toBe('Morning, Alex.');
  });

  /** `05 §2.3`: skipped, never rendered with a gap. */
  it('refuses to render a line it cannot fill', () => {
    expect(renderTemplate('{days} days.', { days: null })).toBeNull();
    expect(renderTemplate('{days} days.', {})).toBeNull();
    expect(renderTemplate('{days} days.', { days: '' })).toBeNull();
  });

  it('drops such a line from selection entirely', () => {
    const chosen = selectContent({
      ...base,
      variables: { name: 'Alex', days: null },
      candidates: [entry({ id: 'countdown', templateText: '{days} days until it matters.' })],
      tags: new Set(),
    });
    expect(chosen).toBeNull();
  });
});

describe('cooldown', () => {
  it('holds a line back for its cooldown', () => {
    const yesterday = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
    const chosen = selectContent({
      ...base,
      candidates: [entry({ id: 'a', cooldownDays: 3 })],
      tags: new Set(),
      usage: [{ entryId: 'a', usedAt: yesterday }],
    });
    expect(chosen).toBeNull();
  });

  it('lets it back once the cooldown has passed', () => {
    const fourDaysAgo = new Date(NOW.getTime() - 4 * 24 * 60 * 60 * 1000);
    const chosen = selectContent({
      ...base,
      candidates: [entry({ id: 'a', cooldownDays: 3 })],
      tags: new Set(),
      usage: [{ entryId: 'a', usedAt: fourDaysAgo }],
    });
    expect(chosen?.entry.id).toBe('a');
  });

  it('measures from the most recent use, not the first', () => {
    const chosen = selectContent({
      ...base,
      candidates: [entry({ id: 'a', cooldownDays: 3 })],
      tags: new Set(),
      usage: [
        { entryId: 'a', usedAt: new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000) },
        { entryId: 'a', usedAt: new Date(NOW.getTime() - 60 * 60 * 1000) },
      ],
    });
    expect(chosen).toBeNull();
  });

  it('respects a seasonal cap', () => {
    const chosen = selectContent({
      ...base,
      candidates: [entry({ id: 'a', maxUsesPerSeason: 2 })],
      tags: new Set(),
      seasonUses: new Map([['a', 2]]),
    });
    expect(chosen).toBeNull();
  });
});

describe('distinctiveness', () => {
  /**
   * The bug this exists to prevent: ranking by tag count makes A20 — two tags,
   * true of eight of ten managers — beat A9, one tag, true of exactly one
   * person. Five managers then see the same greeting and `17 §3`'s acceptance
   * criterion fails while every individual line is still true.
   */
  it('prefers the line true of fewer people, not the one with more tags', () => {
    const generic = entry({ id: 'A20', requiredTags: ['never_champion', 'two_plus_seasons'] });
    const pointed = entry({ id: 'A9', requiredTags: ['most_points_against_2025'] });

    const audience = new Map([
      ['A20', 8],
      ['A9', 1],
    ]);

    const chosen = selectContent({
      ...base,
      candidates: [generic, pointed],
      tags: new Set(['never_champion', 'two_plus_seasons', 'most_points_against_2025']),
      audienceSize: (candidate) => audience.get(candidate.id) ?? 10,
    });

    expect(chosen?.entry.id).toBe('A9');
  });

  it('falls back to the untagged line only when nothing else is eligible', () => {
    const fallback = entry({ id: 'A13' });
    const pointed = entry({ id: 'A10', requiredTags: ['fewest_points_2025'] });

    const withTag = selectContent({
      ...base,
      candidates: [fallback, pointed],
      tags: new Set(['fewest_points_2025']),
      audienceSize: (candidate) => (candidate.id === 'A13' ? 10 : 1),
    });
    expect(withTag?.entry.id).toBe('A10');

    const withoutTag = selectContent({
      ...base,
      candidates: [fallback, pointed],
      tags: new Set(),
      audienceSize: (candidate) => (candidate.id === 'A13' ? 10 : 1),
    });
    expect(withoutTag?.entry.id).toBe('A13');
  });

  it('uses tag count as a rough stand-in when no audience is supplied', () => {
    const chosen = selectContent({
      ...base,
      candidates: [entry({ id: 'broad' }), entry({ id: 'narrow', requiredTags: ['a'] })],
      tags: new Set(['a']),
    });
    expect(chosen?.entry.id).toBe('narrow');
  });
});

describe('weighting', () => {
  it('picks within the bucket in proportion to weight', () => {
    const candidates = [entry({ id: 'heavy', weight: 90 }), entry({ id: 'light', weight: 10 })];

    const pick = (roll: number): string | undefined =>
      selectContent({ ...base, candidates, tags: new Set(), random: () => roll })?.entry.id;

    expect(pick(0)).toBe('heavy');
    expect(pick(0.5)).toBe('heavy');
    expect(pick(0.95)).toBe('light');
  });

  it('treats an all-zero bucket as no content rather than a free pass', () => {
    const chosen = selectContent({
      ...base,
      candidates: [entry({ id: 'off', weight: 0 })],
      tags: new Set(),
    });
    expect(chosen).toBeNull();
  });
});

describe('no content is a valid outcome', () => {
  it('returns null rather than reaching for something weaker', () => {
    expect(selectContent({ ...base, candidates: [], tags: new Set() })).toBeNull();
  });
});
