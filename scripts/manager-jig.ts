import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

import {
  ARM,
  AXIS,
  CANVAS,
  EAR,
  FACE,
  HAND,
  HEAD,
  LEG,
  NECK,
  SHOE,
  TORSO,
} from '../lib/character/art/geometry';
import { BODY_HEAD_SLUG, STYLE_TRAITS } from '../lib/character/catalog';
import {
  DEFAULT_CONFIGURATION,
  composeCharacter,
  compositeRuns,
  type ColourRun,
} from '../lib/character/composite';
import { BUILD_REGISTRATION, paintedKeys } from '../lib/character/mask';
import { HOUSE } from '../lib/character/palette';

/**
 * The skin tone the reference palette is written in — `SKIN_TONES[1]`, "Tone 2".
 *
 * The head is drawn in it so the plate and the swatches agree: a painter matching
 * `#D9A173` on the jig's face is matching the same key the trousers and the shirt
 * are keyed against.
 */
const REFERENCE_SKIN = 1;

/** The one painted build, whose neck the head has to join. */
const TSHIRT_INDEX = STYLE_TRAITS.top.findIndex((option) => option.name === 'T-shirt');

/**
 * The manager registration jig — `npm run art:jig`.
 *
 * ## One coordinate authority, and this is not it
 *
 * **Every number below is imported from `lib/character/art/geometry.ts`.** Nothing
 * here is typed in twice. That is the whole design constraint: a jig with its own
 * copy of the shoulder line is a second opinion about where the shoulder is, and
 * the day the two disagree the art is drawn to the wrong one and looks *almost*
 * right — which is the expensive kind of wrong, because nothing fails.
 * `manager-jig.test.ts` re-reads the emitted JSON and asserts it against the same
 * module.
 *
 * ## Three files, for three different readers
 *
 * | File | Reader |
 * |---|---|
 * | `manager_registration_jig.png` | the machine — `112 × 168`, exact, one pixel per room unit |
 * | `manager_registration_jig@6x.png` | **a person, in an image-generation session** — the same lines, labelled, with the palette swatches |
 * | `manager_registration_jig.json` | the validator and the brief, so all three agree by construction |
 *
 * The 6× plate is the one that matters in practice. `art/ASSET_PIPELINE.md §9`
 * says a layer that misses its anchor is regenerated and *the renderer is never
 * adjusted to compensate*, and the repository's one chronic art failure is
 * framing — `scripts/prepare-incoming.ts` exists because *"across three rounds of
 * candidates not one arrived correctly cropped."* A picture to paint over is the
 * mechanical answer to that.
 */

const OUT = path.join(process.cwd(), 'art', 'jigs');

/** A landmark, in the units the room and the sprite share. */
interface Landmark {
  readonly key: string;
  readonly label: string;
  /** `binding` — another layer depends on it. `advisory` — the pose may move it. */
  readonly kind: 'binding' | 'advisory';
  readonly row?: number;
  readonly column?: number;
  readonly box?: readonly [number, number, number, number];
  readonly note: string;
}

/**
 * What the art has to hit, and what it is free to move.
 *
 * **The advisory half is the point of the redesign.** Commissioner ruling R2,
 * 2026-08-11: a build may author its own pose, so the arms, hands, legs and
 * stance are *not* constraints. The old sprite hit every one of these exactly and
 * that is precisely why it reads as an interchangeable mannequin. What stays
 * binding is only what another layer genuinely depends on.
 */
function landmarks(): readonly Landmark[] {
  return [
    {
      key: 'canvas',
      label: 'Canvas',
      kind: 'binding',
      box: [0, 0, CANVAS.width, CANVAS.height],
      note: `${String(CANVAS.width)} x ${String(CANVAS.height)}, one pixel per room unit`,
    },
    {
      key: 'axis',
      label: 'Centreline',
      kind: 'advisory',
      column: AXIS,
      note: 'the figure need not be symmetric about it — asymmetry is encouraged',
    },
    {
      key: 'head_clear',
      label: 'Head clearance',
      kind: 'binding',
      row: BUILD_REGISTRATION.headClearBelow,
      note: 'a build paints nothing above this row; the head plate owns it',
    },
    {
      key: 'skull',
      label: 'Skull',
      kind: 'binding',
      box: [HEAD.left, HEAD.top, HEAD.right - HEAD.left, HEAD.bottom - HEAD.top],
      note: 'drawn on the head plate, shown so a collar can be judged against it',
    },
    {
      key: 'eye_line',
      label: 'Eye line',
      kind: 'binding',
      row: FACE.eyeY,
      note: 'head plate; hats and hair register to it',
    },
    {
      key: 'neck',
      label: 'Neck',
      kind: 'binding',
      box: [NECK.left, NECK.top, NECK.width, NECK.bottom - NECK.top],
      note: 'the collar must close across these columns at the row below',
    },
    {
      key: 'neck_closed',
      label: 'Collar closes',
      kind: 'binding',
      row: BUILD_REGISTRATION.neckClosedAtRow,
      note: 'opaque across the neck columns here, or the join shows the room',
    },
    {
      key: 'shoulder_band',
      label: 'Shoulders start',
      kind: 'binding',
      row: BUILD_REGISTRATION.shoulderBand.from,
      note: `the topmost painted row must fall in ${String(BUILD_REGISTRATION.shoulderBand.from)}-${String(BUILD_REGISTRATION.shoulderBand.to)}`,
    },
    {
      key: 'shoulders',
      label: 'Shoulder line',
      kind: 'advisory',
      row: TORSO.top,
      note: 'where the drawn figure put them; a build may shape its own',
    },
    {
      key: 'torso',
      label: 'Torso (old)',
      kind: 'advisory',
      box: [TORSO.left, TORSO.top, TORSO.right - TORSO.left, TORSO.bottom - TORSO.top],
      note: 'the slab the redesign exists to replace — do not copy it',
    },
    {
      key: 'wrist',
      label: 'Wrist (old)',
      kind: 'advisory',
      row: ARM.bottom,
      note: 'a sleeve stopped here; a posed arm need not',
    },
    {
      key: 'hands',
      label: 'Hands (old)',
      kind: 'advisory',
      row: HAND.cy,
      note: 'hand-slot wearables are deferred, so nothing depends on this yet',
    },
    {
      key: 'knees',
      label: 'Knee',
      kind: 'advisory',
      row: Math.round((LEG.top + LEG.bottom) / 2),
      note: 'midpoint of the drawn leg',
    },
    {
      key: 'ankle',
      label: 'Ankle',
      kind: 'advisory',
      row: SHOE.top,
      note: 'where the boot began',
    },
    {
      key: 'contact',
      label: 'Contact row',
      kind: 'binding',
      row: BUILD_REGISTRATION.contactRow,
      note: 'the soles sit ON this row; the room draws its shadow to it',
    },
  ];
}

const GUIDE = Object.freeze({
  binding: '#E060B0',
  advisory: '#5C9BD1',
  canvas: '#4A3B3F',
});

/** The exact `112 x 168` plate: guide lines and nothing else. */
async function machinePlate(marks: readonly Landmark[]): Promise<Buffer> {
  const { width, height } = CANVAS;
  const rgba = Buffer.alloc(width * height * 4, 0);

  const put = (x: number, y: number, hex: string): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    rgba[i] = parseInt(hex.slice(1, 3), 16);
    rgba[i + 1] = parseInt(hex.slice(3, 5), 16);
    rgba[i + 2] = parseInt(hex.slice(5, 7), 16);
    rgba[i + 3] = 255;
  };

  for (let x = 0; x < width; x++) {
    put(x, 0, GUIDE.canvas);
    put(x, height - 1, GUIDE.canvas);
  }
  for (let y = 0; y < height; y++) {
    put(0, y, GUIDE.canvas);
    put(width - 1, y, GUIDE.canvas);
  }

  for (const mark of marks) {
    const hex = mark.kind === 'binding' ? GUIDE.binding : GUIDE.advisory;
    // Dashed, so a guide can never be mistaken for a line of the drawing.
    if (mark.row !== undefined) {
      for (let x = 0; x < width; x += 2) put(x, mark.row, hex);
    }
    if (mark.column !== undefined) {
      for (let y = 0; y < height; y += 2) put(mark.column, y, hex);
    }
    if (mark.box !== undefined && mark.key !== 'canvas') {
      const [bx, by, bw, bh] = mark.box;
      for (let x = bx; x < bx + bw; x += 2) {
        put(x, by, hex);
        put(x, by + bh - 1, hex);
      }
      for (let y = by; y < by + bh; y += 2) {
        put(bx, y, hex);
        put(bx + bw - 1, y, hex);
      }
    }
  }

  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/**
 * The head plate as pixels, at the reference skin tone.
 *
 * **Drawn on the readable jig, and the body deliberately is not.** The head is
 * the half a build must register against — a collar has to close under *that*
 * jaw — so it is shown as artwork rather than as a rectangle. Everything below
 * the neck is left empty on purpose: it is the half being replaced, and a ghost
 * of the slab this work exists to escape is an invitation to redraw it.
 */
function headPlate(): readonly ColourRun[] {
  /*
   * The layer list is replaced rather than filtered. `composeCharacter` only ever
   * emits the head plate when the chosen top is painted, and none is — so
   * filtering for it returns nothing and the jig comes out with a blank face,
   * which is what the first version of this did.
   */
  const composite = composeCharacter({ ...DEFAULT_CONFIGURATION, skin: REFERENCE_SKIN });
  return compositeRuns({
    ...composite,
    layers: [
      { layer: 'base-body', slug: BODY_HEAD_SLUG, paint: { kind: 'skin', index: REFERENCE_SKIN } },
    ],
  });
}

/**
 * The plate that is actually painted on — `672 × 1008`, and nothing else.
 *
 * **Separate from the annotated one, and the test is why.** The readable plate
 * carries a gutter of labels and a footer of swatches, so a file painted over it
 * comes back at some size that is not a whole multiple of `112 × 168` and the
 * conversion step refuses it — after the painting is done. This one is exactly
 * six times the canvas, so what comes back drops straight into `npm run art:mask`.
 */
async function paintOverPlate(marks: readonly Landmark[]): Promise<Buffer> {
  const scale = 6;
  const width = CANVAS.width * scale;
  const height = CANVAS.height * scale;
  const head = headPlate();
  const neck = marks.find((mark) => mark.key === 'neck')!.box!;

  const line = (mark: Landmark): string => {
    if (mark.row === undefined) return '';
    const colour = mark.kind === 'binding' ? GUIDE.binding : GUIDE.advisory;
    const y = mark.row * scale;
    return (
      `<line x1="0" y1="${String(y)}" x2="${String(width)}" y2="${String(y)}" stroke="${colour}" ` +
      `stroke-width="${mark.kind === 'binding' ? '2' : '1'}" stroke-dasharray="8 10" ` +
      `opacity="${mark.kind === 'binding' ? '0.9' : '0.45'}" />`
    );
  };

  const reserved = BUILD_REGISTRATION.headClearBelow * scale;

  /*
   * The reserved band is **filled**, not merely outlined, and that is the whole
   * fix for round 1.
   *
   * That figure was excellent and was framed as a standalone portrait filling the
   * canvas — because a headless body has no natural framing cue, so "leave the top
   * third empty" was competing with every instinct an image model has. An area
   * that *looks* occupied is not competed with. The hatch says the space is taken.
   */
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}">
    <defs>
      <pattern id="reserved" width="16" height="16" patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)">
        <rect width="16" height="16" fill="#241B20" />
        <rect width="8" height="16" fill="#31252B" />
      </pattern>
    </defs>
    <rect width="${String(width)}" height="${String(height)}" fill="#2E2226" />
    <rect x="0" y="0" width="${String(width)}" height="${String(reserved)}" fill="url(#reserved)" />
    <text x="${String(width / 2)}" y="34" text-anchor="middle"
      font-family="monospace" font-size="22" fill="#E060B0">RESERVED — THE HEAD GOES HERE</text>
    <text x="${String(width / 2)}" y="60" text-anchor="middle"
      font-family="monospace" font-size="17" fill="#E060B0">PAINT NOTHING IN THIS HATCHED BAND</text>
    <text x="${String(width / 2)}" y="${String(reserved + 34)}" text-anchor="middle"
      font-family="monospace" font-size="17" fill="#E060B0">↓ SHOULDERS START JUST BELOW HERE ↓</text>
    <g shape-rendering="crispEdges">
      ${head
        .map(
          (run) =>
            `<rect x="${String(run.x * scale)}" y="${String(run.y * scale)}" ` +
            `width="${String(run.w * scale)}" height="${String(run.h * scale)}" fill="${run.value}" />`,
        )
        .join('')}
    </g>
    <line x1="${String(AXIS * scale)}" y1="0" x2="${String(AXIS * scale)}" y2="${String(height)}"
      stroke="${GUIDE.advisory}" stroke-width="1" stroke-dasharray="4 12" opacity="0.4" />
    <rect x="${String(neck[0] * scale)}" y="${String(neck[1] * scale)}"
      width="${String(neck[2] * scale)}" height="${String(neck[3] * scale)}"
      fill="none" stroke="${GUIDE.binding}" stroke-width="2" stroke-dasharray="4 4" opacity="0.9" />
    ${marks.map(line).join('\n')}
    <rect x="0" y="${String(height - scale)}" width="${String(width)}" height="${String(scale)}"
      fill="#E060B0" opacity="0.9" />
    <text x="${String(width / 2)}" y="${String(height - scale - 10)}" text-anchor="middle"
      font-family="monospace" font-size="18" fill="#E060B0">SOLES SIT ON THIS ROW</text>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}


/**
 * One sheet a generation session can work from without the architecture explained.
 *
 * **Tony, the palette and the rules in a single image.** The alternative is four
 * uploads and a paragraph, and the failure mode of four uploads is that three of
 * them are skimmed. The old manager sprite is deliberately **not** on it: a
 * negative reference is a picture, and a picture in the context window is
 * something a model draws from whether or not it is labelled "not this".
 */
async function referenceSheet(): Promise<Buffer> {
  const scale = 3;
  const tonyW = 88 * scale;
  const tonyH = 240 * scale;
  const width = 1180;
  const height = tonyH + 120;

  const tony = await sharp(path.join(process.cwd(), 'public', 'assets', 'character', 'character_tony_neutral.png'))
    .resize(tonyW, tonyH, { kernel: 'nearest' })
    .png()
    .toBuffer();

  const keys = paintedKeys();
  const swatch = (index: number): string => {
    const key = keys[index]!;
    const column = Math.floor(index / 9);
    const x = tonyW + 60 + column * 300;
    const y = 150 + (index % 9) * 26;
    return (
      `<rect x="${String(x)}" y="${String(y)}" width="18" height="18" fill="${key.hex}" stroke="#7A6A6E" />` +
      `<text x="${String(x + 26)}" y="${String(y + 14)}" font-family="monospace" font-size="13" ` +
      `fill="${key.pending === true ? '#FFD98A' : '#F5EDDC'}">${key.hex}  ${key.name}` +
      `${key.pending === true ? ' *' : ''}</text>`
    );
  };

  const rule = (at: number, text: string): string =>
    `<text x="${String(tonyW + 60)}" y="${String(height - 190 + at * 22)}" font-family="monospace" ` +
    `font-size="14" fill="#B5A8A9">${text}</text>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}">
    <rect width="${String(width)}" height="${String(height)}" fill="#1A1214" />
    <text x="24" y="34" font-family="monospace" font-size="20" fill="#FFD98A">TONY — THE QUALITY BENCHMARK</text>
    <text x="24" y="58" font-family="monospace" font-size="13" fill="#B5A8A9">Match his construction. Do not copy his identity, apron, moustache or jersey.</text>
    <text x="${String(tonyW + 60)}" y="120" font-family="monospace" font-size="18" fill="#FFD98A">PAINT WITH THESE ${String(keys.length)} COLOURS ONLY</text>
    ${keys.map((_, index) => swatch(index)).join('\n')}
    <text x="${String(tonyW + 60)}" y="${String(150 + 9 * 26 + 18)}" font-family="monospace" font-size="12" fill="#FFD98A">* a tone the game cannot paint yet — paint it anyway, it is recorded</text>
    ${rule(0, 'PAINT ON THE SUPPLIED PLATE. Do not reframe, re-centre or crop it.')}
    ${rule(1, 'Paint ONLY where the plate is empty. Hatching is not yours to touch.')}
    ${rule(2, 'Transparent background. No black field, no glow, no vignette.')}
    ${rule(3, 'A THICK dark outline, fully closed, around everything you paint.')}
    ${rule(4, 'Flat blocks of the colours above. No gradients, no in-between tones.')}
    ${rule(5, 'One light source, upper left, across the whole figure.')}
    ${rule(6, 'Deliver at any size at the plate’s 2:3 aspect — 672x1008 or 1024x1536.')}
  </svg>`;

  return sharp(Buffer.from(svg))
    .composite([{ input: tony, left: 24, top: 76 }])
    .png()
    .toBuffer();
}


/**
 * The plate the head prototype is painted on.
 *
 * **It shows the accepted painted body at full strength**, and that is the whole
 * design. Commissioner ruling, 2026-08-11: the new head must have *"a neck that
 * visually belongs to the accepted painted body"*. Asking for that in prose and
 * then handing over an empty rectangle is asking somebody to match a thing they
 * cannot see. Painting the head directly onto the body makes the match the
 * default rather than an instruction.
 *
 * Everything below the neck is therefore **already painted and must be left
 * alone** — the delivered file is cropped to the head plate's own rows at ingest,
 * so nothing repainted down there would survive anyway.
 */
async function headPlateCanvas(marks: readonly Landmark[]): Promise<Buffer> {
  const scale = 6;
  const width = CANVAS.width * scale;
  const height = CANVAS.height * scale;

  // The accepted build, without the head — which is the thing being replaced.
  const body = composeCharacter({ ...DEFAULT_CONFIGURATION, top: TSHIRT_INDEX, skin: REFERENCE_SKIN });
  const runs = compositeRuns({
    ...body,
    layers: body.layers.filter((layer) => layer.layer === 'base-top'),
  });

  const box = (
    x: number, y: number, w: number, h: number, colour: string, dash = '4 4',
  ): string =>
    `<rect x="${String(x * scale)}" y="${String(y * scale)}" width="${String(w * scale)}" ` +
    `height="${String(h * scale)}" fill="none" stroke="${colour}" stroke-width="2" ` +
    `stroke-dasharray="${dash}" />`;

  const row = (y: number, label: string, colour: string = GUIDE.binding): string =>
    `<line x1="0" y1="${String(y * scale)}" x2="${String(width)}" y2="${String(y * scale)}" ` +
    `stroke="${colour}" stroke-width="2" stroke-dasharray="10 8" opacity="0.85" />` +
    `<text x="8" y="${String(y * scale - 6)}" font-family="monospace" font-size="15" ` +
    `fill="${colour}">${label}</text>`;

  void marks;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}">
    <defs>
      <pattern id="body" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="16" height="16" fill="#241B20" />
        <rect width="8" height="16" fill="#31252B" />
      </pattern>
    </defs>
    <rect width="${String(width)}" height="${String(height)}" fill="#2E2226" />

    <g shape-rendering="crispEdges">
      ${runs
        .map(
          (run) =>
            `<rect x="${String(run.x * scale)}" y="${String(run.y * scale)}" ` +
            `width="${String(run.w * scale)}" height="${String(run.h * scale)}" fill="${run.value}" />`,
        )
        .join('')}
    </g>
    <rect x="0" y="${String(BUILD_REGISTRATION.shoulderBand.from * scale)}" width="${String(width)}"
      height="${String(height - BUILD_REGISTRATION.shoulderBand.from * scale)}" fill="url(#body)" opacity="0.55" />
    <text x="${String(width / 2)}" y="${String(height - 26)}" text-anchor="middle"
      font-family="monospace" font-size="19" fill="#FFD98A">ACCEPTED BODY — DO NOT REPAINT</text>

    ${box(HEAD.left, HEAD.top, HEAD.right - HEAD.left, HEAD.bottom - HEAD.top, GUIDE.binding)}
    ${box(FACE.eyeLeft, FACE.eyeY, FACE.eyeWidth, FACE.eyeHeight, GUIDE.binding, '2 2')}
    ${box(FACE.eyeRight, FACE.eyeY, FACE.eyeWidth, FACE.eyeHeight, GUIDE.binding, '2 2')}
    ${box(EAR.leftCx - EAR.rx, EAR.cy - EAR.ry, EAR.rx * 2, EAR.ry * 2, GUIDE.advisory, '2 2')}
    ${box(EAR.rightCx - EAR.rx, EAR.cy - EAR.ry, EAR.rx * 2, EAR.ry * 2, GUIDE.advisory, '2 2')}
    ${box(NECK.left, NECK.top, NECK.width, NECK.bottom - NECK.top, GUIDE.binding)}
    ${box(HEAD.left, HEAD.top, HEAD.right - HEAD.left, 10, GUIDE.binding, '1 3')}

    ${row(HEAD.top, `skull top ${String(HEAD.top)} — hair is drawn to this envelope`)}
    ${row(FACE.browY, `brow ${String(FACE.browY)}`)}
    ${row(FACE.eyeY, `EYE LINE ${String(FACE.eyeY)} — fixed`)}
    ${row(FACE.noseY, `nose tip ${String(FACE.noseY)}`)}
    ${row(FACE.mouthY, `MOUTH ${String(FACE.mouthY)} — beards are drawn to this`)}
    ${row(HEAD.bottom, `jaw ${String(HEAD.bottom)}`)}
    ${row(NECK.bottom - 1, `collar meets here ${String(NECK.bottom - 1)}`, GUIDE.advisory)}

    <text x="8" y="20" font-family="monospace" font-size="17" fill="#FFD98A">PAINT THE HEAD, EARS, FACE AND NECK ONLY</text>
    <text x="8" y="40" font-family="monospace" font-size="13" fill="#B5A8A9">bald · clean-shaven · no hat · no accessories</text>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** The labelled plate a person takes into an image-generation session. */
async function readablePlate(marks: readonly Landmark[]): Promise<Buffer> {
  const scale = 6;
  const gutter = 320;
  const footer = 190;
  const plateWidth = CANVAS.width * scale;
  const plateHeight = CANVAS.height * scale;
  const width = plateWidth + gutter;
  const height = plateHeight + footer;

  const swatches = paintedKeys();

  const guide = (mark: Landmark): string => {
    const colour = mark.kind === 'binding' ? GUIDE.binding : GUIDE.advisory;
    if (mark.row === undefined) return '';
    const y = mark.row * scale;
    return (
      `<line x1="0" y1="${String(y)}" x2="${String(plateWidth)}" y2="${String(y)}" ` +
      `stroke="${colour}" stroke-width="2" stroke-dasharray="8 8" opacity="0.85" />` +
      `<text x="${String(plateWidth + 10)}" y="${String(y + 5)}" font-family="monospace" ` +
      `font-size="15" fill="${colour}">${mark.label} · row ${String(mark.row)}</text>`
    );
  };

  const neck = marks.find((mark) => mark.key === 'neck')!.box!;
  const head = headPlate();

  const swatch = (index: number): string => {
    const key = swatches[index]!;
    const column = Math.floor(index / 5);
    const x = 20 + column * 330;
    const y = plateHeight + 46 + (index % 5) * 26;
    return (
      `<rect x="${String(x)}" y="${String(y)}" width="18" height="18" fill="${key.hex}" ` +
      `stroke="#7A6A6E" />` +
      `<text x="${String(x + 26)}" y="${String(y + 14)}" font-family="monospace" font-size="14" ` +
      `fill="#F5EDDC">${key.hex}  ${key.name}</text>`
    );
  };

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}">
    <rect width="${String(width)}" height="${String(height)}" fill="#1A1214" />
    <rect x="0" y="0" width="${String(plateWidth)}" height="${String(plateHeight)}" fill="#2E2226" />

    <g shape-rendering="crispEdges">
      ${head
        .map(
          (run) =>
            `<rect x="${String(run.x * scale)}" y="${String(run.y * scale)}" ` +
            `width="${String(run.w * scale)}" height="${String(run.h * scale)}" fill="${run.value}" />`,
        )
        .join('')}
    </g>

    <line x1="${String(AXIS * scale)}" y1="0" x2="${String(AXIS * scale)}" y2="${String(plateHeight)}"
      stroke="${GUIDE.advisory}" stroke-width="1" stroke-dasharray="4 10" opacity="0.7" />
    <rect x="${String(neck[0] * scale)}" y="${String(neck[1] * scale)}"
      width="${String(neck[2] * scale)}" height="${String(neck[3] * scale)}"
      fill="none" stroke="${GUIDE.binding}" stroke-width="2" stroke-dasharray="4 4" />
    ${marks.map(guide).join('\n')}

    <text x="${String(plateWidth + 10)}" y="20" font-family="monospace" font-size="16"
      fill="#FFD98A">MANAGER BUILD JIG · ${String(CANVAS.width)} x ${String(CANVAS.height)}</text>
    <text x="${String(plateWidth + 10)}" y="42" font-family="monospace" font-size="13"
      fill="${GUIDE.binding}">PINK = binding. Hit it exactly.</text>
    <text x="${String(plateWidth + 10)}" y="60" font-family="monospace" font-size="13"
      fill="${GUIDE.advisory}">BLUE = advisory. Move it — pose freely.</text>
    <text x="${String(plateWidth + 10)}" y="86" font-family="monospace" font-size="13"
      fill="#B5A8A9">The head is drawn because you must</text>
    <text x="${String(plateWidth + 10)}" y="104" font-family="monospace" font-size="13"
      fill="#B5A8A9">register to it. Paint the figure BELOW</text>
    <text x="${String(plateWidth + 10)}" y="122" font-family="monospace" font-size="13"
      fill="#B5A8A9">the neck only. Nothing above row</text>
    <text x="${String(plateWidth + 10)}" y="140" font-family="monospace" font-size="13"
      fill="#B5A8A9">${String(BUILD_REGISTRATION.headClearBelow)}. Soles ON row ${String(BUILD_REGISTRATION.contactRow)}.</text>

    <text x="20" y="${String(plateHeight + 28)}" font-family="monospace" font-size="15"
      fill="#FFD98A">PAINT WITH THESE FOURTEEN COLOURS AND NO OTHERS</text>
    ${swatches.map((_, index) => swatch(index)).join('\n')}
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function main(): Promise<void> {
  const marks = landmarks();
  mkdirSync(OUT, { recursive: true });

  writeFileSync(
    path.join(OUT, 'manager_registration_jig.png'),
    await machinePlate(marks),
  );
  writeFileSync(
    path.join(OUT, 'manager_registration_jig@6x.png'),
    await readablePlate(marks),
  );
  writeFileSync(
    path.join(OUT, 'manager_paintover_672x1008.png'),
    await paintOverPlate(marks),
  );
  writeFileSync(path.join(OUT, 'manager_reference_sheet.png'), await referenceSheet());
  writeFileSync(path.join(OUT, 'manager_head_paintover_672x1008.png'), await headPlateCanvas(marks));
  writeFileSync(
    path.join(OUT, 'manager_registration_jig.json'),
    `${JSON.stringify(
      {
        $comment:
          'GENERATED by `npm run art:jig` from lib/character/art/geometry.ts. Do not edit — edit the geometry.',
        canvas: CANVAS,
        axis: AXIS,
        registration: BUILD_REGISTRATION,
        landmarks: marks,
        palette: paintedKeys().map((key) => ({
          index: key.index,
          channel: key.channel,
          step: key.step,
          name: key.name,
          hex: key.hex,
          pending: key.pending === true,
        })),
        outline: HOUSE['ink-900'],
      },
      null,
      2,
    )}\n`,
  );

  console.log(`Wrote six files to art/jigs/ — ${String(marks.length)} landmarks.`);
}

main().catch((error: unknown) => {
  console.error(`\nJig failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
