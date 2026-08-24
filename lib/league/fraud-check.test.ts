import { describe, expect, it } from 'vitest';

import { type PlayEveryoneRecord } from '@/lib/stats/luck';
import { scopeOf } from '@/lib/stats/scope';

import { fraudCheckFrom } from './fraud-check';

const record: PlayEveryoneRecord = {
  id: 'play-everyone:2026',
  type: 'play-everyone',
  season: 2026,
  lines: [
    {
      managerId: 'alex',
      displayName: 'Alex',
      actualWins: 5,
      actualLosses: 1,
      actualTies: 0,
      // 22 + 33 = 55: five ten-team weeks, nine comparisons each.
      playEveryoneWins: 22,
      playEveryoneLosses: 33,
      playEveryoneTies: 0,
      scheduleDelta: 2.6,
      pointsFor: 720,
      weeksCounted: 5,
    },
    {
      managerId: 'nathan',
      displayName: 'Nathan',
      actualWins: 3,
      actualLosses: 3,
      actualTies: 0,
      playEveryoneWins: 28,
      playEveryoneLosses: 26,
      playEveryoneTies: 0,
      scheduleDelta: 0.4,
      pointsFor: 710,
      weeksCounted: 6,
    },
  ],
  includedWeeks: [1, 2, 3, 4, 5],
  excludedWeeks: [],
  disclaimer: 'computed, not played',
  managerIds: ['alex', 'nathan'],
  sourceGameKeys: [],
  scope: scopeOf({ kind: 'season', seasons: [2026], observations: 25 }),
  support: 'verified',
  evidence: [],
};

describe('fraudCheckFrom', () => {
  it('makes the ten-team, nine-opponent all-play record readable without changing it', () => {
    const check = fraudCheckFrom(record);
    const alex = check.lines.find((line) => line.managerId === 'alex');

    expect(alex?.officialRecord).toBe('5-1');
    expect(alex?.allPlayRecord).toBe('22-33');
    expect(alex?.scheduleDelta).toBe('+2.60');
    expect(alex?.tonyStamp).toBe('FRAUD ALERT');
    expect(check.weeksCounted).toBe(5);
  });

  it('keeps the sticker as an editorial threshold, not an automatic label', () => {
    const check = fraudCheckFrom(record);
    expect(check.lines.find((line) => line.managerId === 'nathan')?.tonyStamp).toBeNull();
  });
});
