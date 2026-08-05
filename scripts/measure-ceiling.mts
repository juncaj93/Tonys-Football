/**
 * The ceiling's own composition, measured.
 *
 *   npx tsx scripts/measure-ceiling.mts
 *
 * `clearCeilingScorch` is written against a specific distribution of field and
 * scorch tones, and those move whenever the shell is requantized. This is how
 * they get re-derived from the file rather than read off a zoomed screenshot —
 * the mistake the original derivation records itself making, when a probe picked
 * by eye landed on `#5E3A25`.
 *
 * Prints. Writes nothing.
 */
import sharp from 'sharp';

const SHELL = 'public/assets/zone/zone_parlor_shell.png';
/** The same rectangle `clean-parlor-surfaces.ts` uses. */
const CEILING = { left: 0, right: 319, top: 0, bottom: 62 };

const { data, info } = await sharp(SHELL).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

const hexAt = (x: number, y: number): string => {
  const p = (y * info.width + x) * 4;
  return `#${[data[p]!, data[p + 1]!, data[p + 2]!]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
};

const tally = new Map<string, number>();
for (let y = CEILING.top; y <= CEILING.bottom; y += 1) {
  for (let x = CEILING.left; x <= CEILING.right; x += 1) {
    const h = hexAt(x, y);
    tally.set(h, (tally.get(h) ?? 0) + 1);
  }
}

const total = (CEILING.right - CEILING.left + 1) * (CEILING.bottom - CEILING.top + 1);
console.log(`\n  Ceiling rectangle: ${String(total)} pixels\n`);
for (const [h, n] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${h}  ${String(n).padStart(6)}  ${((n / total) * 100).toFixed(1)}%`);
}

const field = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]![0];
console.log(`\n  Dominant field: ${field}\n`);

const solid = (x: number, y: number): boolean => {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const px = x + dx;
      const py = y + dy;
      if (px < CEILING.left || px > CEILING.right || py < CEILING.top || py > CEILING.bottom) {
        return false;
      }
      if (hexAt(px, py) !== field) return false;
    }
  }
  return true;
};

/*
 * Spread across **both** axes, not clustered on one row.
 *
 * The first re-derivation returned four points that all sat on row 2, and four
 * probes on one row are satisfied by any uniformly-filled canvas — the check
 * stopped refusing a surface that is not this ceiling, which is what it is for.
 */
const bands: [number, number, number, number][] = [
  [4, 2, 90, 8],
  [95, 12, 180, 22],
  [185, 24, 260, 40],
  [265, 42, 315, 60],
];
console.log('  Solid 5x5 field centres, one per band:');
for (const [x0, y0, x1, y1] of bands) {
  let found = '    none';
  for (let y = y0; y <= y1 && found === '    none'; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (solid(x, y)) {
        found = `    { x: ${String(x)}, y: ${String(y)} },`;
        break;
      }
    }
  }
  console.log(found);
}
