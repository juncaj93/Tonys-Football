import { describe, expect, it } from 'vitest';

import { hallEncounterLine } from './encounter-dialogue';

describe('hallEncounterLine', () => {
  const player = { displayName: 'Alex', teamName: 'Commissioner Special' };

  it('makes a current Sleeper receipt concrete with the league-facing team names', () => {
    const line = hallEncounterLine({
      visitor: { displayName: 'Nick', teamName: 'Bapple U' },
      player,
      receipt: { week: 4, visitorPointsCents: 12345, playerPointsCents: 11900 },
      beat: 0,
      isNight: false,
    });

    expect(line).toContain('Week 4');
    expect(line).toContain('Bapple U put up 123.45');
    expect(line).toContain('Commissioner Special had 119.00');
    expect(line).toContain('documentation');
  });

  it('rotates only approved canon beats for an active manager', () => {
    const first = hallEncounterLine({
      visitor: { displayName: 'Nathan', teamName: null },
      player,
      receipt: null,
      beat: 0,
      isNight: false,
    });
    const second = hallEncounterLine({
      visitor: { displayName: 'Nathan', teamName: null },
      player,
      receipt: null,
      beat: 1,
      isNight: false,
    });

    expect(first).toContain('Legendary');
    expect(second).toContain('collectible machine');
    expect(second).not.toBe(first);
  });

  it('keeps unfamiliar future managers neutral instead of inventing a persona', () => {
    const line = hallEncounterLine({
      visitor: { displayName: 'Future Manager', teamName: null },
      player,
      receipt: null,
      beat: 0,
      isNight: true,
    });

    expect(line).toContain('warm light');
    expect(line).not.toContain('Future Manager is');
  });
});
