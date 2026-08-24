import { describe, expect, it } from 'vitest';

import { exteriorLight } from './light';

describe('the light outside Tony’s', () => {
  it('uses Michigan wall time, including daylight-saving time', () => {
    // 08:00 EDT, 14:00 EDT, 19:00 EDT and 02:00 EST respectively.
    expect(exteriorLight(new Date('2026-08-01T12:00:00Z'))).toBe('morning');
    expect(exteriorLight(new Date('2026-08-01T18:00:00Z'))).toBe('day');
    expect(exteriorLight(new Date('2026-08-01T23:00:00Z'))).toBe('dusk');
    expect(exteriorLight(new Date('2026-01-15T07:00:00Z'))).toBe('night');
  });
});
