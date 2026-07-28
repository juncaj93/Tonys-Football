import { describe, expect, it } from 'vitest';

import { createFixtureSource } from './fixtures';
import { curateRosterMetadata, hasRosterMetadata } from './metadata';
import { decodeRosters } from './codec';

/**
 * What survives import from Sleeper's roster metadata, and what does not.
 *
 * Commissioner direction, 2026-07-28: keep league-authored text, discard
 * personal settings.
 */

describe('curateRosterMetadata', () => {
  it('keeps manager-written player nicknames', () => {
    const metadata = curateRosterMetadata({
      p_nick_4040: 'PooPoo Shit-Poopster',
      p_nick_8148: 'Matt are you nervous?',
    });

    expect(metadata.playerNicknames).toEqual({
      '4040': 'PooPoo Shit-Poopster',
      '8148': 'Matt are you nervous?',
    });
  });

  it('keeps record and streak as provenance', () => {
    const metadata = curateRosterMetadata({ record: 'WLLWLLLWWWWWWW', streak: '7W' });

    expect(metadata.record).toBe('WLLWLLLWWWWWWW');
    expect(metadata.streak).toBe('7W');
  });

  it('discards notification and contact settings', () => {
    const metadata = curateRosterMetadata({
      allow_pn_scoring: 'off',
      restrict_pn_scoring_starters_only: 'on',
      allow_sms: 'on',
      allow_pn_inactive_starters: 'on',
      p_nick_1: 'Keep me',
    });

    expect(metadata.playerNicknames).toEqual({ '1': 'Keep me' });
    expect(JSON.stringify(metadata)).not.toContain('allow_');
    expect(JSON.stringify(metadata)).not.toContain('_pn');
  });

  it('drops a cleared nickname rather than storing an empty quote', () => {
    const metadata = curateRosterMetadata({ p_nick_1: '', p_nick_2: '   ', p_nick_3: 'Real' });

    expect(metadata.playerNicknames).toEqual({ '3': 'Real' });
  });

  it('tolerates missing, null, and malformed metadata', () => {
    expect(curateRosterMetadata(undefined).playerNicknames).toEqual({});
    expect(curateRosterMetadata(null).record).toBeNull();
    expect(curateRosterMetadata([]).streak).toBeNull();
    expect(curateRosterMetadata('nonsense').playerNicknames).toEqual({});
  });

  it('ignores an unfamiliar key instead of failing', () => {
    const metadata = curateRosterMetadata({ some_future_sleeper_field: 'x', record: 'W' });
    expect(metadata.record).toBe('W');
  });
});

describe('hasRosterMetadata', () => {
  it('is false for an empty curation, so nothing empty is stored', () => {
    expect(hasRosterMetadata(curateRosterMetadata({ allow_pn: 'on' }))).toBe(false);
  });

  it('is true when anything was kept', () => {
    expect(hasRosterMetadata(curateRosterMetadata({ streak: '3W' }))).toBe(true);
  });
});

describe('against the recorded league', () => {
  it('carries nicknames through the roster decoder', async () => {
    const result = await createFixtureSource().fetch({
      kind: 'rosters',
      leagueId: '1240008879295713280',
    });
    if (result.kind !== 'ok') throw new Error('fixture missing');

    const { value } = decodeRosters(result.payload);
    const total = value.reduce(
      (sum, roster) => sum + Object.keys(roster.metadata.playerNicknames).length,
      0,
    );

    // 65 nickname keys, 3 of them blank.
    expect(total).toBe(62);
    // Every roster carries Sleeper's record string.
    expect(value.every((roster) => roster.metadata.record !== null)).toBe(true);
  });
});
