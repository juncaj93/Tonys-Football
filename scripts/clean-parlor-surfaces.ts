/**
 * Two corrections to `zone_parlor_shell`, kept for provenance.
 *
 *   npx tsx scripts/clean-parlor-surfaces.ts
 *
 * **This is not a pipeline stage and must not become one.** It is the second
 * one-time correction on this asset and it follows `shift-tonight-board.ts`
 * exactly: `art:process` turns a generated painting into a palette-closed
 * sprite, every asset stays a pure function of its source file, and the price of
 * that property is that reprocessing the shell reverts both corrections.
 * `clean-parlor-surfaces.test.ts` is what stops a reverted asset from shipping.
 *
 * ## Why the source could not be fixed instead
 *
 * `art/incoming/zone_parlor_shell.png` is a 941 × 1672 painting. Both defects
 * are **created by the downscale and the palette snap**, not present in it:
 *
 *   - The board's face is a smooth amber gradient in the painting. Quantized to
 *     three amber values it becomes a dithered vignette — the *"AI-painted and
 *     then quantized"* appearance the art direction names, directly behind the
 *     board's text.
 *   - `SHELL_AUDIT_zone_parlor_shell.md` recorded the second one itself, and
 *     accepted it: *"the alcove backsplash reads brown where the source is dark
 *     maroon: the palette has nothing between `red-dark #8C1F22` and near-black,
 *     so dark reds land on wood."* The painting's shading detail lands as
 *     scattered near-black singles across a brown checker, which is the
 *     *"burnt, scratchy"* wall the commissioner saw behind Tony.
 *
 * Repainting the source and reprocessing would not fix either: the same
 * downscale and the same 32 colours produce the same output. The correction has
 * to happen after quantization, on the 320 × 569 grid.
 *
 * ## Two mechanisms, because they are two different defects
 *
 * `docs/HOMEPAGE_CLEANLINESS_BOUNDARY.md §6` asks for the *correct* mechanism
 * per surface and for the choice to be recorded. So:
 *
 * | surface | mechanism | why |
 * |---|---|---|
 * | The Tonight board's face | **deterministic replacement** | it is a flat writing surface with nothing in it to preserve. §6 names it as the example. |
 * | The back wall and the alcove | **palette-preserving despeckle** | there *is* something to preserve — tile, frames, shelves — so the noise is removed and the structure is not redrawn. |
 * | The ceiling | **nothing** | see `EXCLUDED_CEILING`. |
 *
 * Neither mechanism can introduce a colour. The replacement paints two palette
 * values; the despeckle only ever assigns a colour already dominant among a
 * pixel's own neighbours.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

export const SHELL_PATH = 'public/assets/zone/zone_parlor_shell.png';

/* ------------------------------------------------------------ the board -- */

/** `#RRGGBB`, uppercase. */
export function hexAt(pixels: Buffer, width: number, x: number, y: number): string {
  const i = (y * width + x) * 4;
  return `#${[pixels[i], pixels[i + 1], pixels[i + 2]]
    .map((v) => (v ?? 0).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();
}

function paint(pixels: Buffer, width: number, x: number, y: number, hex: string): void {
  const i = (y * width + x) * 4;
  pixels[i] = Number.parseInt(hex.slice(1, 3), 16);
  pixels[i + 1] = Number.parseInt(hex.slice(3, 5), 16);
  pixels[i + 2] = Number.parseInt(hex.slice(5, 7), 16);
  pixels[i + 3] = 255;
}

/**
 * The board's face — the cream field **inside** the painted frame, inclusive.
 *
 * `TONIGHT_CREAM` in `lib/parlor/objects.ts` is `61, 83, 119, 88`, which is this
 * plus the one-unit inner line the frame casts on each side. That line is part
 * of the frame and is not repainted; the two measurements agree and are meant
 * to. `objects.ts` records what reading a zoomed screenshot instead of the file
 * cost the last time this rectangle was got wrong.
 */
interface Rect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

// Deliberately not `as const`: the literal types narrow the loop variables below
// to `84` and `62`, and TypeScript then reports comparing them to `169` and
// `178` as an impossible comparison.
const FACE: Rect = { left: 62, right: 178, top: 84, bottom: 169 };

/** Warm near-white, and one step down for the frame's shadow on the face. */
const FIELD = '#F5EDDC'; // paper-white
const SHADOW = '#E0D2B8'; // paper-mid

/** What the quantizer made of the painted gradient. Nothing else may be there. */
const PAINTED = new Set(['#F2A94B', '#F2C94C', '#FFD98A']);
const CLEANED = new Set([FIELD, SHADOW]);

/**
 * The frame ring, one unit outside the face, at a row and a column well inside
 * the board. This is the integrity check: the rectangle above says *where* to
 * paint, and this says the thing found there is actually the Tonight board.
 */
const RING = [
  { x: FACE.left - 1, y: 128, hex: '#A9713F' },
  { x: FACE.right + 1, y: 128, hex: '#A9713F' },
  { x: 120, y: FACE.top - 1, hex: '#4A2E1C' },
  { x: 120, y: FACE.bottom + 1, hex: '#C99A63' },
] as const;

export type FaceAction = 'painted' | 'already-clean';

/**
 * Repaint the board's face as a calm cream writing surface.
 *
 * Flat `paper-white`, with a two-unit `paper-mid` shadow along the top and left
 * inner edges and a one-unit line along the bottom and right. That is the whole
 * design: the frame stays hand-painted, the face stops competing with the words
 * on it, and the variation left is the light falling from the pendant above
 * rather than dithering left over from a gradient.
 *
 * Throws rather than guesses if the face is neither state — at that point the
 * file is not what this transform was written against, and painting it anyway
 * would put a cream rectangle somewhere in the room.
 */
export function cleanBoardFace(pixels: Buffer, width: number): FaceAction {
  for (const { x, y, hex } of RING) {
    if (hexAt(pixels, width, x, y) !== hex) {
      throw new Error(
        `zone_parlor_shell: expected the Tonight board's frame colour ${hex} at ` +
          `${String(x)},${String(y)} and found ${hexAt(pixels, width, x, y)}. ` +
          `Refusing to repaint — see scripts/clean-parlor-surfaces.ts.`,
      );
    }
  }

  const found = new Set<string>();
  for (let y = FACE.top; y <= FACE.bottom; y++) {
    for (let x = FACE.left; x <= FACE.right; x++) found.add(hexAt(pixels, width, x, y));
  }

  if ([...found].every((hex) => CLEANED.has(hex))) return 'already-clean';

  const strays = [...found].filter((hex) => !PAINTED.has(hex));
  if (strays.length > 0) {
    throw new Error(
      `zone_parlor_shell: the board's face holds ${strays.join(', ')}, which is neither the ` +
        `painted amber (${[...PAINTED].join(', ')}) nor the cleaned cream ` +
        `(${[...CLEANED].join(', ')}). Refusing to repaint — see scripts/clean-parlor-surfaces.ts.`,
    );
  }

  for (let y = FACE.top; y <= FACE.bottom; y++) {
    for (let x = FACE.left; x <= FACE.right; x++) {
      const shaded =
        y <= FACE.top + 1 ||
        x <= FACE.left + 1 ||
        y === FACE.bottom ||
        x === FACE.right;
      paint(pixels, width, x, y, shaded ? SHADOW : FIELD);
    }
  }

  return 'painted';
}

/* -------------------------------------------------- the alcove behind him -- */

/**
 * The oven alcove's tiled backsplash — the surface directly behind Tony.
 *
 * `TONY` stands at `64, 177` and the counter cuts him at row 292, so his visible
 * band from the shoulders up sits against this rectangle and nothing else. It is
 * the *"wall or niche directly behind Tony"* the direction names.
 */
const BACKSPLASH: Rect = { left: 66, right: 145, top: 189, bottom: 226 };

/** The lit tile, and the same tile in the recess it is actually in. */
const LIT_TILE = '#7A4A2A'; // wood-mid
const SHADED_TILE = '#5E3A25';

/**
 * Everything the alcove is made of. Anything else there means the rectangle has
 * moved or the asset has been redrawn, and either way this must not paint.
 */
const ALCOVE_TONES = new Set(['#4A2E1C', '#5E3A25', '#7A4A2A', '#1A1214', '#2E2226', '#8C1F22']);

export type AlcoveAction = 'shaded' | 'already-shaded';

/**
 * Put the alcove back in shadow.
 *
 * ## The defect is a value, not a texture
 *
 * After the despeckle the backsplash is legible tile rather than scorch, and it
 * is still the wrong *brightness*: a red-brown checker at `wood-mid`, at very
 * nearly the value of Tony's own hair and jersey shadows, filling the rectangle
 * his head occupies. `18` asks for readable silhouettes and the direction asks
 * for *"fewer clusters competing with his silhouette"* — and a background at the
 * subject's own value is the one arrangement in which no amount of cleaning
 * helps.
 *
 * One substitution: the lit tile becomes the shaded one. The checker survives,
 * one step quieter, and the alcove reads as the recess it is — which is also
 * what it should have looked like all along, with a lit figure standing in front
 * of it and the pendant above him.
 *
 * Nothing else in the rectangle is touched, so the grout, the shelf and the
 * frame keep their drawing.
 */
export function shadeAlcove(pixels: Buffer, width: number): AlcoveAction {
  const found = new Set<string>();
  for (let y = BACKSPLASH.top; y <= BACKSPLASH.bottom; y++) {
    for (let x = BACKSPLASH.left; x <= BACKSPLASH.right; x++) {
      found.add(hexAt(pixels, width, x, y));
    }
  }

  const strays = [...found].filter((hex) => !ALCOVE_TONES.has(hex));
  if (strays.length > 0) {
    throw new Error(
      `zone_parlor_shell: the alcove behind Tony holds ${strays.join(', ')}, which is not one ` +
        `of its tones (${[...ALCOVE_TONES].join(', ')}). Refusing to shade — ` +
        `see scripts/clean-parlor-surfaces.ts.`,
    );
  }

  if (!found.has(LIT_TILE)) return 'already-shaded';

  for (let y = BACKSPLASH.top; y <= BACKSPLASH.bottom; y++) {
    for (let x = BACKSPLASH.left; x <= BACKSPLASH.right; x++) {
      if (hexAt(pixels, width, x, y) === LIT_TILE) paint(pixels, width, x, y, SHADED_TILE);
    }
  }

  return 'shaded';
}

/* --------------------------------------------------------- the despeckle -- */

/** A rectangle of the room, inclusive, and how hard to clean it. */
interface Surface {
  readonly name: string;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/**
 * The two surfaces the commissioner named, measured on the shifted shell.
 *
 * `back-wall` is the lit wall the board hangs on, from the panel on its left to
 * the doorway on its right. `alcove` is the oven niche **directly behind Tony**
 * — `TONY` stands at `64, 177` and is cut at row 292, so his visible band sits
 * against this rectangle and nothing else.
 */
const SURFACES: readonly Surface[] = [
  { name: 'back-wall', x0: 30, y0: 55, x1: 205, y1: 185 },
  { name: 'alcove', x0: 58, y0: 183, x1: 154, y1: 252 },
];

/**
 * The ceiling is deliberately **not** on that list.
 *
 * It was, for one run. The ceiling carries the tile grid as **one-unit diagonal
 * lines**, drawn dashed — and a dashed diagonal is exactly what a lone-pixel
 * filter cannot tell from noise, because a good many of its pixels genuinely
 * have no neighbour of their own colour. The pass dashed the grid further,
 * trading a defect the direction names for one it names twice: *"random scratch
 * overlays"* becoming broken structure.
 *
 * The wall and the alcove have no such feature: their structure is frames,
 * shelves and tile, all of it orthogonal and continuous, so every pixel of it
 * has a neighbour of its own colour and the same filter leaves it standing.
 *
 * Recorded rather than silently omitted, because *"the ceiling still looks
 * scorched"* is a fair observation and this is the answer to it: the surface
 * needs a different mechanism — a targeted regeneration — not this one.
 */
const EXCLUDED_CEILING = { x0: 0, y0: 0, x1: 319, y1: 62 } as const;

/**
 * How lonely a pixel has to be before it is noise: **completely**.
 *
 * None of its eight neighbours shares its colour, and at least three of them
 * agree on a different one. Every pixel of every real feature — a tile edge, a
 * shelf, a frame — has at least one neighbour of its own colour, so none of them
 * can be touched at any threshold of the second number.
 *
 * ## It was `at most one`, and that eroded the room
 *
 * The first rule allowed one same-coloured neighbour, on the reasoning that it
 * would then also catch two-pixel scratches. It does — and it also catches **the
 * end of every one-unit line**, which has exactly one neighbour of its own
 * colour. Run to a fixed point it ate the wall's thin lines from both ends, one
 * unit per pass, and never converged: the diagnostic showed a front marching
 * inward (`199,56 → 196,57 → 195,57 → 194,57`) for as many passes as it was
 * given. A filter that does not terminate on this image is a filter that would
 * have dissolved it.
 *
 * So: strictly lone pixels. It removes less, it cannot erode anything, and it
 * settles in three passes.
 */
const MAX_SAME = 0;
const MIN_MODAL = 3;

/** Eight passes is far past where this converges — three; it is a runaway guard. */
const MAX_PASSES = 8;

function packed(pixels: Buffer, i: number): number {
  return ((pixels[i] ?? 0) << 16) | ((pixels[i + 1] ?? 0) << 8) | (pixels[i + 2] ?? 0);
}

/** One pass. Reads from a snapshot so a pixel never sees this pass's own work. */
function despeckleOnce(pixels: Buffer, width: number, surface: Surface): number {
  const before = Buffer.from(pixels);
  let changed = 0;

  for (let y = surface.y0; y <= surface.y1; y++) {
    for (let x = surface.x0; x <= surface.x1; x++) {
      const i = (y * width + x) * 4;
      const self = packed(before, i);

      const others = new Map<number, number>();
      let same = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const neighbour = packed(before, ((y + dy) * width + (x + dx)) * 4);
          if (neighbour === self) same++;
          else others.set(neighbour, (others.get(neighbour) ?? 0) + 1);
        }
      }

      if (same > MAX_SAME) continue;

      // Sorted by colour before the max, so a tie resolves the same way on every
      // machine. `Map` iteration order is insertion order, which is the scan
      // order, which is not a property anybody should be relying on.
      let winner = -1;
      let count = 0;
      for (const [colour, n] of [...others].sort((a, b) => a[0] - b[0])) {
        if (n > count) {
          count = n;
          winner = colour;
        }
      }
      if (count < MIN_MODAL || winner < 0) continue;

      pixels[i] = (winner >> 16) & 0xff;
      pixels[i + 1] = (winner >> 8) & 0xff;
      pixels[i + 2] = winner & 0xff;
      changed++;
    }
  }

  return changed;
}

/**
 * Clean one surface until nothing more is lonely.
 *
 * Running to a fixed point is what makes this **idempotent**, and idempotence is
 * what `shift-tonight-board.ts` had to buy with a measurement. A second run of
 * this script finds no lone pixels and changes nothing, so re-applying the
 * correction after a reprocess is safe by construction rather than by a check
 * somebody has to keep correct.
 */
export function despeckle(pixels: Buffer, width: number, surface: Surface): number {
  let total = 0;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const changed = despeckleOnce(pixels, width, surface);
    total += changed;
    if (changed === 0) return total;
  }
  throw new Error(
    `zone_parlor_shell: ${surface.name} did not settle in ${String(MAX_PASSES)} passes. ` +
      `Refusing to write — see scripts/clean-parlor-surfaces.ts.`,
  );
}

/**
 * All three corrections, in place, on a raw RGBA buffer.
 *
 * The despeckle runs **last**, on purpose: shading the alcove merges two tones,
 * which can leave a tile that used to have neighbours standing on its own, and
 * the order means those are cleaned in the same run rather than waiting for a
 * second one that would then not be a no-op.
 */
export function cleanSurfaces(
  pixels: Buffer,
  width: number,
): {
  readonly face: FaceAction;
  readonly alcove: AlcoveAction;
  readonly despeckled: Record<string, number>;
} {
  const face = cleanBoardFace(pixels, width);
  const alcove = shadeAlcove(pixels, width);
  const despeckled: Record<string, number> = {};
  for (const surface of SURFACES) despeckled[surface.name] = despeckle(pixels, width, surface);
  return { face, alcove, despeckled };
}

export { BACKSPLASH, EXCLUDED_CEILING, FACE, FIELD, LIT_TILE, SHADED_TILE, SHADOW, SURFACES };

async function main(): Promise<void> {
  const file = path.join(process.cwd(), SHELL_PATH);
  if (!existsSync(file)) throw new Error(`${SHELL_PATH} does not exist — run art:process first.`);

  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = Buffer.from(data);
  const before = Buffer.from(pixels);
  const { face, alcove, despeckled } = cleanSurfaces(pixels, info.width);

  if (pixels.equals(before)) {
    console.log(`${SHELL_PATH}\n  already clean — nothing to do.`);
    return;
  }

  await sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9, palette: true })
    .toFile(file);

  const counts = Object.entries(despeckled)
    .map(([name, n]) => `${name} ${String(n)}`)
    .join(', ');
  console.log(
    `${SHELL_PATH}\n  board face: ${face}\n  alcove: ${alcove}\n  despeckled: ${counts}`,
  );
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(`\nFailed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
