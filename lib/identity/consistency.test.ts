import { describe, expect, it } from 'vitest';

import { readManagerNames } from '@/lib/content/managers';

import { loadManagerMappings, mappingsBySleeperId } from './mappings';

/**
 * The two naming sources must not drift.
 *
 * After the Phase A reconciliation there are two files that can set
 * `users.display_name`:
 *
 *   - `content/managers.md` — merged with V1. Seeded by `scripts/seed.ts`,
 *     covers the ten current managers, and deliberately leaves former
 *     occupants under their Sleeper handles.
 *   - `content/manager-mappings.json` — Phase A. Applied by the importer,
 *     covers all thirteen accounts including the three retired people the
 *     Technical Lead's identity correction named, and carries the retirement
 *     flags and per-mapping provenance.
 *
 * They compose correctly today: the importer runs first, the seed then rewrites
 * only its own ten, and both hold the same name for each of those ten. Nothing
 * is broken. What is fragile is the *next* edit — renaming somebody in one file
 * and not the other would leave the winner decided by which step ran last.
 *
 * So this file is the guard rail rather than the fix. Consolidating to one
 * source is a small open decision (see the DECISION REQUEST on PR #10); until
 * it is made, a disagreement fails here instead of in front of a manager.
 */
describe('the two naming sources agree', () => {
  it('holds the same canonical name for every account both files list', () => {
    const json = mappingsBySleeperId(loadManagerMappings());
    const markdown = readManagerNames();

    const disagreements = markdown
      .map((entry) => ({
        sleeperUserId: entry.sleeperUserId,
        sleeperUsername: entry.sleeperUsername,
        markdownName: entry.name,
        jsonName: json.get(entry.sleeperUserId)?.displayName,
      }))
      .filter((row) => row.jsonName !== undefined && row.jsonName !== row.markdownName);

    expect(disagreements).toEqual([]);
  });

  it('covers every markdown manager in the JSON, so the importer names them too', () => {
    const json = mappingsBySleeperId(loadManagerMappings());
    const missing = readManagerNames()
      .filter((entry) => !json.has(entry.sleeperUserId))
      .map((entry) => entry.sleeperUsername);

    expect(missing).toEqual([]);
  });

  it('agrees that RonJonathan is Ryan, with no separate Ron in either file', () => {
    // The identity correction singled this out: one person, one name.
    const json = mappingsBySleeperId(loadManagerMappings());
    const markdown = readManagerNames();

    expect(json.get('705813167879553024')?.displayName).toBe('Ryan');
    expect(markdown.find((e) => e.sleeperUserId === '705813167879553024')?.name).toBe('Ryan');

    expect(markdown.some((e) => e.name === 'Ron')).toBe(false);
    expect([...json.values()].some((m) => m.displayName === 'Ron')).toBe(false);
  });

  it('names the three retired people only in the JSON, which is where the ruling landed', () => {
    // `content/managers.md` predates the identity correction and leaves these
    // three under their Sleeper handles. The JSON carries the ruled names, and
    // because the markdown does not list them the seed never overwrites it.
    const json = mappingsBySleeperId(loadManagerMappings());
    const markdownIds = new Set(readManagerNames().map((entry) => entry.sleeperUserId));

    for (const [sleeperUserId, name] of [
      ['690209715904417792', 'Berardo'],
      ['604375476017885184', 'Armen'],
      ['1251952575964524544', 'Shant'],
    ] as const) {
      expect(json.get(sleeperUserId)?.displayName).toBe(name);
      expect(json.get(sleeperUserId)?.retired).toBe(true);
      expect(markdownIds.has(sleeperUserId)).toBe(false);
    }
  });

  it('never lets two people share a name across the union of both files', () => {
    const names = [
      ...[...mappingsBySleeperId(loadManagerMappings()).values()].map((m) => m.displayName),
      ...readManagerNames().map((entry) => entry.name),
    ];

    const duplicated = [...new Set(names)].filter(
      (name) => names.filter((candidate) => candidate === name).length > 2,
    );

    // A name may appear twice — once per file, same person. Three times means
    // two different accounts answer to it.
    expect(duplicated).toEqual([]);
  });
});
