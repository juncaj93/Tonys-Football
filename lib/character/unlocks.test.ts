import { describe, expect, it } from 'vitest';

import { WEARABLES } from './catalog';
import { COLLECTIBLE_WEARABLE_UNLOCKS, wearableUnlockedBy } from './unlocks';

describe('lore wardrobe unlocks', () => {
  it('gives every launch wearable one, and only one, collectible route', () => {
    const earned = Object.values(COLLECTIBLE_WEARABLE_UNLOCKS);
    expect(new Set(earned).size).toBe(earned.length);
    expect([...earned].sort()).toEqual([...WEARABLES.map((item) => item.slug)].sort());
  });

  it('never treats an ordinary collectible as a wardrobe grant', () => {
    expect(wearableUnlockedBy('collectible_lava_lamp')).toBeNull();
    expect(wearableUnlockedBy('collectible_bapple_tree')?.name).toBe("Tony's Pizza visor");
  });
});
