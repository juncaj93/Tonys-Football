import { BODY_BELOW } from './art/body';
import { CANVAS } from './art/geometry';
import { TRANSPARENT_KEY } from './mask';
import { rasterise, shade } from './sprite';

/**
 * A mechanically valid build mask, built in memory — **test-only, never artwork.**
 *
 * The commissioner's prototype authorisation allows an unmistakably temporary
 * diagnostic fixture to prove decoding and composition, and forbids one being
 * presented as visual evidence or committed as the T-shirt. This is that fixture:
 * the *drawn* below-neck figure re-expressed as role keys, with a garment band
 * written across the chest so both channels are exercised.
 *
 * It lives outside `*.test.ts` because two test files need it and importing one
 * test file from another runs its suites twice. **No product module imports it**,
 * and it renders nothing anybody sees.
 */

/** Which key a drawn tone becomes. Skin for the body's own material, fixed keys as-is. */
function keyForTone(tone: string | null): number {
  if (tone === null) return TRANSPARENT_KEY;
  if (tone === 'outline' || tone === 'ink') return 1;
  const byName: Readonly<Record<string, number>> = {
    light: 5,
    base: 6,
    shade: 7,
    'fixed:denim@light': 8,
    'fixed:denim@base': 9,
    'fixed:denim@shade': 9,
    'fixed:leather@light': 10,
    'fixed:leather@base': 11,
    'fixed:leather@shade': 12,
    'fixed:sole@light': 13,
    'fixed:sole@base': 14,
    'fixed:sole@shade': 14,
    'fixed:white@light': 5,
    'fixed:white@base': 5,
    'fixed:white@shade': 6,
  };
  return byName[tone] ?? 6;
}

/**
 * A mechanically valid build mask, from the drawn figure below the neck.
 *
 * Two deliberate touch-ups, both of which a painter does by hand and a shape
 * rasteriser has no reason to: every pixel on the silhouette is forced to
 * outline, and a garment band is written across the chest so the fixture
 * exercises **both** channels rather than only skin.
 */
export function fixtureBuildMask(): readonly number[] {
  const grid = shade(rasterise(BODY_BELOW, CANVAS.width, CANVAS.height));
  const keys: number[] = [];
  for (let y = 0; y < CANVAS.height; y++) {
    for (let x = 0; x < CANVAS.width; x++) keys.push(keyForTone(grid[y]?.[x] ?? null));
  }

  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= CANVAS.width || y >= CANVAS.height
      ? TRANSPARENT_KEY
      : keys[y * CANVAS.width + x]!;

  // A garment over the torso, so the fixture carries a second channel.
  for (let y = 62; y < 112; y++) {
    for (let x = 32; x < 80; x++) {
      if (at(x, y) !== TRANSPARENT_KEY) keys[y * CANVAS.width + x] = y % 7 === 0 ? 2 : 3;
    }
  }

  // Enclose the silhouette. `ART_SPEC §4` — and the validator refuses without it.
  const enclosed = [...keys];
  for (let y = 0; y < CANVAS.height; y++) {
    for (let x = 0; x < CANVAS.width; x++) {
      if (at(x, y) === TRANSPARENT_KEY) continue;
      const exposed =
        (x > 0 && at(x - 1, y) === TRANSPARENT_KEY) ||
        (x < CANVAS.width - 1 && at(x + 1, y) === TRANSPARENT_KEY) ||
        (y > 0 && at(x, y - 1) === TRANSPARENT_KEY) ||
        (y < CANVAS.height - 1 && at(x, y + 1) === TRANSPARENT_KEY);
      if (exposed) enclosed[y * CANVAS.width + x] = 1;
    }
  }
  return enclosed;
}
