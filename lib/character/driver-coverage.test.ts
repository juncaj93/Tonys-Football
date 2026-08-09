import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CHARACTER_PREVIEWS, CHARACTER_PREVIEW_DESCRIPTIONS, resolveCharacterPreview } from './previews';

/**
 * The visual driver photographs every declared character preview, and nothing it
 * cannot reach.
 *
 * The reasoning is `lib/slice/driver-coverage.test.ts`'s, and it is copied here
 * rather than generalised because the two catalogs are read out of the driver by
 * different patterns and a shared helper would have to know both.
 *
 * `scripts/visual-qa.mts` imports nothing from `lib/` on purpose — it drives a
 * built server over HTTP so it stays an outside observer — which means it cannot
 * know what `CHARACTER_PREVIEWS` says. **Never photographed is the quiet
 * failure**: it fails no gate, appears in no report, and the first person to
 * notice is whoever eventually looks for a screenshot nobody ever took. This
 * repository has shipped that shape three times.
 */

const DRIVER = readFileSync(path.join(process.cwd(), 'scripts', 'visual-qa.mts'), 'utf8');

/** Every `character-*` entry in the driver's `ALL_STATES` list. */
function driverCharacterStates(): readonly string[] {
  const list = /const ALL_STATES: readonly StateName\[\] = \[([\s\S]*?)\n\];/.exec(DRIVER);
  if (list === null) throw new Error('could not find ALL_STATES in scripts/visual-qa.mts');
  return [...list[1]!.matchAll(/'character-([a-z-]+)'/g)].map((match) => match[1]!);
}

/**
 * The manager-backed states are demo seats, not preview fixtures.
 *
 * `empty`, `dressed` and `equipped` are states of a *wardrobe*; `editing` and
 * `saved` are states of a *session* — a category open with an unsaved change,
 * and a save that has come back from the server. None of them is a composite, so
 * none of them can be a `?character=` fixture: a fixture faking a save would be
 * photographing a mock of the exact thing that was broken in production.
 */
const MANAGER_BACKED = ['empty', 'dressed', 'equipped', 'editing', 'saved'];

describe('the visual driver and the character preview catalog agree', () => {
  it('photographs every declared preview', () => {
    const photographed = driverCharacterStates().filter((key) => !MANAGER_BACKED.includes(key));
    expect([...photographed].sort()).toEqual([...CHARACTER_PREVIEWS].sort());
  });

  it('declares a case for each of them', () => {
    // A state in `ALL_STATES` with no `case` photographs whatever page was
    // already open. `reach()` throws for that at runtime; this catches it before
    // a nine-minute workflow does.
    for (const key of driverCharacterStates()) {
      expect(DRIVER, `no case for character-${key}`).toContain(`case 'character-${key}'`);
    }
  });

  it('waits on the preview marker rather than on a timeout', () => {
    /*
     * The false green that has now happened three times: `?character=` is
     * resolved by the **server**, which needs `DEMO_FIXTURES=1`. A server without
     * it answers with the ordinary customiser, and a driver that waited on a
     * timeout would photograph that and file it as `390-character-tallest.png`.
     *
     * Waiting on the preview's own marker makes the missing wiring a failure
     * instead of a passing screenshot of the wrong page.
     */
    expect(DRIVER).toContain('data-character-preview="${key}"');
  });
});

describe('every declared preview resolves', () => {
  it('builds each one rather than falling back to a default character', () => {
    for (const key of CHARACTER_PREVIEWS) {
      const preview = resolveCharacterPreview(key);
      expect(preview.key).toBe(key);
      expect(preview.composite.layers.length).toBeGreaterThan(0);
    }
  });

  it('describes each one', () => {
    for (const key of CHARACTER_PREVIEWS) {
      expect(CHARACTER_PREVIEW_DESCRIPTIONS[key].length).toBeGreaterThan(20);
    }
  });

  it('draws a different character for every preview', () => {
    /*
     * Two fixtures resolving to the same composite means one of them is
     * photographing a case nobody chose — the same defect as a state with no
     * `case`, arrived at through a copy-paste rather than through an omission.
     */
    const keys = CHARACTER_PREVIEWS.map((key) =>
      resolveCharacterPreview(key)
        .composite.layers.map((layer) => `${layer.layer}:${layer.slug}`)
        .join('|'),
    );
    expect(new Set(keys).size).toBe(CHARACTER_PREVIEWS.length);
  });
});
