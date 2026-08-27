import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

const [, , mode, source, outDir, profile = 'default'] = process.argv;
if (!mode || !source || !outDir) {
  throw new Error('Usage: build-manager-variants.mjs <hair|top|face> SOURCE OUT_DIR');
}

const palettes = {
  hair: [
    [[74, 59, 63], [46, 34, 38], [26, 18, 20]],
    [[122, 74, 42], [74, 46, 28], [46, 34, 38]],
    [[169, 113, 63], [122, 74, 42], [74, 46, 28]],
    [[201, 154, 99], [169, 113, 63], [122, 74, 28]],
    [[255, 217, 138], [242, 169, 75], [201, 122, 34]],
    [[242, 169, 75], [201, 122, 34], [140, 31, 34]],
    [[191, 174, 142], [181, 168, 169], [122, 106, 110]],
    [[245, 237, 220], [224, 210, 184], [181, 168, 169]],
  ],
  top: [
    [[228, 83, 74], [196, 43, 43], [140, 31, 34]],
    [[92, 155, 209], [44, 90, 140], [20, 35, 61]],
    [[127, 212, 240], [92, 155, 209], [44, 90, 140]],
    [[30, 74, 50], [30, 74, 50], [20, 35, 61]],
    [[245, 237, 220], [224, 210, 184], [191, 174, 142]],
    [[74, 59, 63], [46, 34, 38], [26, 18, 20]],
    [[255, 217, 138], [242, 169, 75], [201, 122, 34]],
    [[59, 32, 80], [59, 32, 80], [26, 18, 20]],
  ],
};

if (mode !== 'hair' && mode !== 'top' && mode !== 'face') {
  throw new Error(`Unknown mode ${mode}`);
}

// Every source is a portrait render. Normalize it to the exact in-game sprite
// canvas *before* choosing a mask: all profile bounds below are game-pixel
// coordinates, not coordinates in an arbitrary ImageGen export.
const { data, info } = await sharp(source)
  .resize({ width: 112, height: 168, fit: 'fill', kernel: sharp.kernel.nearest })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const isSkin = (r, g, b) => r > g * 1.12 && g > b * 1.15 && r > 70;
// Image sources use a deliberately loud magenta plate. It must never become
// a garment fill when the source is converted into an alpha layer.
const isChromaPlate = (r, g, b) => r > 135 && b > 105 && g < 125 && b > g * 1.35;
const inBounds = (x, y) => {
  if (mode === 'hair') {
    // Hair is deliberately not "every dark pixel in the head box": that would
    // copy brows, eye outlines and shoulder seams into a hair layer. Each style
    // owns only the small region where its silhouette actually lives.
    const crown = x >= 31 && x <= 81 && y >= 7 && y <= (profile === 'curly' ? 29 : 24);
    const side = (profile === 'long' || profile === 'ponytail') && y >= 22 && y <= 52 && (x <= 38 || x >= 75);
    return crown || side;
  }
  if (mode === 'face') {
    if (profile === 'moustache') return y >= 31 && y <= 38 && x >= 43 && x <= 70;
    if (profile === 'goatee') return y >= 31 && y <= 46 && x >= 41 && x <= 71;
    if (profile === 'beard') return y >= 28 && y <= 49 && x >= 36 && x <= 76;
    return y >= 32 && y <= 45 && x >= 39 && x <= 74;
  }
  if (mode === 'top') {
    // Keep tops as a believable garment over the shared body: a central torso
    // plus the actual sleeve band. Forearms and hands always come from the
    // body raster, so generated source shadows can never turn them into flat
    // colored slabs or leave a dark vertical seam beside them.
    const torso = x >= 33 && x <= 79 && y >= 42 && y <= 95;
    const leftSleeve = x >= 20 && x <= 34 && y >= 46 && y <= 68;
    const rightSleeve = x >= 78 && x <= 93 && y >= 46 && y <= 68;
    return torso || leftSleeve || rightSleeve;
  }
  return y >= 36 && y <= 102 && x >= 15 && x <= 96;
};
const isGarment = (r, g, b, x, y) => {
  if (!inBounds(x, y) || isChromaPlate(r, g, b)) return false;
  // A warm red flannel happens to satisfy a broad orange-skin heuristic. In a
  // top source, only the face/neck and the outer forearms are truly skin; the
  // center of the shirt must keep its rich red and dark plaid pixels.
  const topSkin = mode === 'top' && isSkin(r, g, b) && y < 43;
  if ((mode !== 'top' && isSkin(r, g, b)) || topSkin) return false;
  if (mode === 'hair' || mode === 'face') {
    return r + g + b < 330 && !(r > 145 && g > 125 && b > 100);
  }
  if (y >= 88 && b > r * 1.06 && b > g * 1.02) return false;
  return true;
};

await mkdir(outDir, { recursive: true });
const variants = mode === 'face' ? palettes.hair : palettes[mode];
for (let variant = 0; variant < variants.length; variant++) {
  const out = Buffer.alloc(data.length);
  const mask = new Uint8Array(info.width * info.height);
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (!data[i + 3]) continue;
      const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
      if (!isGarment(r, g, b, x, y)) continue;
      mask[y * info.width + x] = 1;
      const lum = (r + g + b) / 3;
      // The 112px downscale intentionally preserves the garment's deep, cozy
      // source values. Its cloth lives in a much tighter luminance band than a
      // face or room shell, so use a material-local ramp rather than flattening
      // the whole hoodie into the darkest selected dye.
      const tone = mode === 'top' ? lum > 50 ? 0 : lum > 34 ? 1 : 2 : lum > 140 ? 0 : lum > 72 ? 1 : 2;
      const [rr, gg, bb] = variants[variant][tone];
      const preserveJerseyTrim =
        mode === 'top' && profile === 'jersey' && r > 185 && g > 185 && b > 170 && (x < 42 || x > 70);
      out[i] = rr; out[i + 1] = gg; out[i + 2] = bb; out[i + 3] = 255;
      if (preserveJerseyTrim) {
        out[i] = 245; out[i + 1] = 237; out[i + 2] = 220;
      }
    }
  }
  // The source layers are painted on top of the same white starter shirt. At
  // 112px, isolated one-pixel garment gaps make that shirt read as a broken
  // checkerboard through an otherwise solid hoodie. Close only those interior
  // pinholes; the one-pixel perimeter stays transparent so the base's outline
  // remains the silhouette rather than becoming a coloured halo.
  if (mode === 'top') {
    for (let y = 37; y < 101; y++) {
      for (let x = 16; x < 96; x++) {
        const p = y * info.width + x;
        if (mask[p]) continue;
        const neighbours = [p - 1, p + 1, p - info.width, p + info.width];
        if (neighbours.every((neighbour) => mask[neighbour])) {
          const i = p * info.channels;
          const [, gg, bb] = variants[variant][1];
          const [rr] = variants[variant][1];
          out[i] = rr; out[i + 1] = gg; out[i + 2] = bb; out[i + 3] = 255;
        }
      }
    }
  }
  await sharp(out, { raw: info }).png({ palette: true, compressionLevel: 9 }).toFile(path.join(outDir, `${String(variant)}.png`));
}
