import { HEAD, NECK } from './art/geometry';
import { HOUSE, type HouseColour } from './palette';
import { type Tone, type ToneGrid } from './sprite';

/**
 * The role-mask contract — how painted manager artwork becomes tones.
 *
 * ## What a mask is, and what it deliberately is not
 *
 * A mask is a `112 × 168` PNG in which **every pixel names the job it does**, not
 * the colour it ends up. `#C42B2B` in a delivered file does not mean *this pixel
 * is red*; it means *this pixel is the base tone of the garment channel*, and a
 * manager who chose Deep blue sees `#2C5A8C` there. That indirection is the whole
 * reason painted art can arrive without deleting the colour system:
 * `docs/ROOMS_BOUNDARY.md §14.1` costs a naive PNG swap at **132 files**, because
 * a finished full-colour hairstyle is one hair colour and the other seven stop
 * existing.
 *
 * It is **not** a generic art framework. There is one vocabulary, it is fifteen
 * entries long, it covers exactly what a below-neck build contains, and it is
 * meant to be read in one sitting. A second channel or a fifth tone is a decision
 * with evidence behind it, not a slot somebody fills in.
 *
 * ## The key colours are real production colours, and that is the trick
 *
 * Every entry below is one of the locked 32 in `art/palette.json`, chosen as the
 * colours **one specific manager** actually renders in: skin Tone 2, a Sauce-red
 * top, denim trousers, leather boots. So the mask is simultaneously
 *
 * - a machine-readable role map, and
 * - a correct picture of a real manager,
 *
 * which means the image-generation session is asked to paint *a character*
 * rather than to paint an encoding, and the returned file can be looked at
 * directly. A generator asked to emit an abstract index map produces something
 * nobody can review; a generator asked to paint a red-shirted man in a fixed
 * fifteen-colour palette is being asked for ordinary pixel art.
 *
 * **Every pair of keys is distinguishable**, asserted in `mask.test.ts`, because
 * the conversion step snaps each incoming pixel to its nearest key and two keys
 * that sit close together would make that snap a coin toss.
 *
 * ## Two ramps deliberately stop at two steps
 *
 * `denim` and `sole` both take `ink-900` as their shade — the same colour as the
 * outline. A pixel painted there could not be told from the silhouette, and it
 * would render identically either way, so the vocabulary omits it rather than
 * carrying an entry that cannot be encoded. `leather` keeps all three because
 * `wood-dark` is its own colour.
 *
 * ## There is no `shade2` yet, and that is a ruling rather than an oversight
 *
 * The investigation recommended a fifth tone. **Commissioner ruling R4,
 * 2026-08-11: do not choose a palette extension speculatively — land the
 * prototype art first and measure what it actually needs**, the way `character`'s
 * sixteen colours were measured off Tony. So this vocabulary is exactly what the
 * locked 32 can express today, and the returned T-shirt is the evidence that
 * settles whether more is required.
 */

/** Which material a pixel belongs to. */
export type MaskChannel =
  /** The manager's chosen top. Recoloured per `topColour`. */
  | 'garment'
  /** The manager's skin. Recoloured per `skin` — hands, forearms, any bare neck. */
  | 'skin'
  /** Not the manager's to choose: trousers, boot uppers, soles. */
  | 'fixed';

export interface MaskKey {
  /** The index written into the encoded run list. Never reordered; append only. */
  readonly index: number;
  readonly channel: MaskChannel | 'none';
  /** What a painter is told this pixel is. */
  readonly name: string;
  /** The exact colour the delivered PNG must carry, from the locked 32. */
  readonly colour: HouseColour;
  /** The tone this decodes to, or `null` for transparent. */
  readonly tone: Tone | null;
}

/**
 * The vocabulary. **Fifteen entries, and the order is the encoding.**
 *
 * A stored mask module names these by index, so a row that moved would silently
 * repaint every delivered asset — the same rule, for the same reason, as
 * `lib/character/catalog.ts`'s.
 */
export const MASK_KEYS: readonly MaskKey[] = Object.freeze([
  { index: 0, channel: 'none', name: 'Transparent', colour: 'ink-900', tone: null },

  { index: 1, channel: 'none', name: 'Outline', colour: 'ink-900', tone: 'outline' },

  { index: 2, channel: 'garment', name: 'Garment light', colour: 'red-light', tone: 'light' },
  { index: 3, channel: 'garment', name: 'Garment base', colour: 'red-mid', tone: 'base' },
  { index: 4, channel: 'garment', name: 'Garment shade', colour: 'red-dark', tone: 'shade' },

  { index: 5, channel: 'skin', name: 'Skin light', colour: 'skin-1', tone: 'skin:light' },
  { index: 6, channel: 'skin', name: 'Skin base', colour: 'skin-2', tone: 'skin:base' },
  { index: 7, channel: 'skin', name: 'Skin shade', colour: 'skin-3', tone: 'skin:shade' },

  { index: 8, channel: 'fixed', name: 'Trouser light', colour: 'blue-mid', tone: 'fixed:denim@light' },
  { index: 9, channel: 'fixed', name: 'Trouser base', colour: 'blue-deep', tone: 'fixed:denim@base' },

  { index: 10, channel: 'fixed', name: 'Boot light', colour: 'wood-pale', tone: 'fixed:leather@light' },
  { index: 11, channel: 'fixed', name: 'Boot base', colour: 'wood-mid', tone: 'fixed:leather@base' },
  { index: 12, channel: 'fixed', name: 'Boot shade', colour: 'wood-dark', tone: 'fixed:leather@shade' },

  { index: 13, channel: 'fixed', name: 'Sole light', colour: 'ink-500', tone: 'fixed:sole@light' },
  { index: 14, channel: 'fixed', name: 'Sole base', colour: 'ink-700', tone: 'fixed:sole@base' },
]);

/** The transparent key. Index 0, and the only one with no tone. */
export const TRANSPARENT_KEY = 0;

/** Every key that may appear as an opaque pixel, with its exact hex. */
export function paintedKeys(): readonly (MaskKey & { readonly hex: string })[] {
  return MASK_KEYS.filter((key) => key.index !== TRANSPARENT_KEY).map((key) => ({
    ...key,
    hex: HOUSE[key.colour],
  }));
}

export const MASK_CANVAS = Object.freeze({ width: 112, height: 168 });

/**
 * A decoded mask, ready to be a layer.
 *
 * `rle` is the wire format the generated modules carry: `"<key>.<count>"`
 * entries, comma-separated, row-major across the whole canvas. Readable enough
 * to grep, small enough to ship to the browser — which it must be, because
 * `composeCharacter` runs unchanged in the customiser's local preview and a
 * mask that only existed on the server would make that preview a lie.
 */
export interface EncodedMask {
  readonly slug: string;
  readonly width: number;
  readonly height: number;
  readonly rle: string;
}

/** Run-length encode a grid of key indices. Row-major, canvas-wide. */
export function encodeMask(slug: string, keys: readonly number[]): EncodedMask {
  const { width, height } = MASK_CANVAS;
  if (keys.length !== width * height) {
    throw new Error(`a mask is ${String(width * height)} cells; got ${String(keys.length)}`);
  }

  const runs: string[] = [];
  let at = 0;
  while (at < keys.length) {
    const key = keys[at]!;
    let end = at;
    while (end + 1 < keys.length && keys[end + 1] === key) end++;
    runs.push(`${String(key)}.${String(end - at + 1)}`);
    at = end + 1;
  }

  return { slug, width, height, rle: runs.join(',') };
}

/** The key index at every cell. Throws on anything malformed — masks are generated. */
export function decodeKeys(mask: EncodedMask): readonly number[] {
  const cells: number[] = [];
  for (const run of mask.rle.split(',')) {
    const [rawKey, rawCount] = run.split('.');
    const key = Number(rawKey);
    const count = Number(rawCount);
    if (!Number.isInteger(key) || !Number.isInteger(count) || count < 1) {
      throw new Error(`${mask.slug}: malformed run "${run}"`);
    }
    if (MASK_KEYS[key] === undefined) throw new Error(`${mask.slug}: unknown key ${String(key)}`);
    for (let i = 0; i < count; i++) cells.push(key);
  }

  const expected = mask.width * mask.height;
  if (cells.length !== expected) {
    throw new Error(
      `${mask.slug}: decodes to ${String(cells.length)} cells, not ${String(expected)}`,
    );
  }
  return cells;
}

/**
 * A decoded mask as a tone grid — the same shape `shade()` returns for a drawn
 * layer, so everything downstream cannot tell the two apart.
 *
 * **The shading pass does not run on a mask, and that is the point.** A drawn
 * layer's light is derived from its own silhouette, which is why it can only ever
 * produce a lit rim and a shaded flank. A painted layer's light was decided by
 * whoever painted it, and re-deriving it would throw that away.
 */
export function maskToneGrid(mask: EncodedMask): ToneGrid {
  const cells = decodeKeys(mask);
  const grid: (Tone | null)[][] = [];
  for (let y = 0; y < mask.height; y++) {
    const row: (Tone | null)[] = [];
    for (let x = 0; x < mask.width; x++) row.push(MASK_KEYS[cells[y * mask.width + x]!]!.tone);
    grid.push(row);
  }
  return grid;
}

/* --------------------------------------------------------- validation -- */

export type MaskProblem = { readonly severity: 'fail' | 'warn'; readonly message: string };

/**
 * Where a delivered build has to agree with the rest of the figure.
 *
 * **Binding, and short.** `ART_SPEC §9`'s standing rule is that a layer which
 * does not land on its anchor is regenerated and *the renderer is never adjusted
 * to compensate*, so the list of things a build must hit is exactly the list of
 * things another layer depends on — and nothing else. The pose, the arms, the
 * hands, the stance and the garment silhouette are **deliberately unconstrained**
 * (commissioner ruling R2, 2026-08-11); constraining them is what produced the
 * interchangeable mannequin this work exists to escape.
 */
export const BUILD_REGISTRATION = Object.freeze({
  /** Nothing in a build may reach the head. The head plate owns everything above. */
  headClearBelow: HEAD.bottom,
  /** The collar must close over the neck, or the join shows the room through it. */
  neckColumns: Object.freeze({ from: NECK.left, to: NECK.left + NECK.width - 1 }),
  neckClosedAtRow: NECK.bottom - 1,
  /** Feet on the floor. The composite ends here and the room's shadow is drawn to it. */
  contactRow: MASK_CANVAS.height - 1,
});

/**
 * Check a grid of key indices against everything that can be checked mechanically.
 *
 * Colour legality, canvas and alpha are checked by the caller that read the file
 * (`scripts/manager-mask.ts`) because they are properties of the *file*; this
 * checks properties of the *drawing*, and is pure so the tests can build a bad
 * mask in memory rather than committing one.
 */
export function validateBuildMask(keys: readonly number[]): readonly MaskProblem[] {
  const { width, height } = MASK_CANVAS;
  const problems: MaskProblem[] = [];
  const fail = (message: string): number => problems.push({ severity: 'fail', message });
  const warn = (message: string): number => problems.push({ severity: 'warn', message });

  if (keys.length !== width * height) {
    return [{ severity: 'fail', message: `mask is ${String(keys.length)} cells, not ${String(width * height)}` }];
  }

  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= width || y >= height ? TRANSPARENT_KEY : keys[y * width + x]!;
  const opaque = (x: number, y: number): boolean => at(x, y) !== TRANSPARENT_KEY;

  let painted = 0;
  let lowest = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!opaque(x, y)) continue;
      painted++;
      lowest = y;
    }
  }

  if (painted === 0) return [{ severity: 'fail', message: 'the mask is empty' }];

  // Head clearance — the head plate owns every row above this and a build that
  // reaches into it draws a second skull over the first.
  for (let y = 0; y <= BUILD_REGISTRATION.headClearBelow; y++) {
    for (let x = 0; x < width; x++) {
      if (opaque(x, y)) {
        fail(
          `a build must leave rows 0–${String(BUILD_REGISTRATION.headClearBelow)} clear for the ` +
            `head plate; there is paint at (${String(x)}, ${String(y)})`,
        );
        y = BUILD_REGISTRATION.headClearBelow;
        break;
      }
    }
  }

  // Feet on the floor.
  if (lowest !== BUILD_REGISTRATION.contactRow) {
    fail(
      `the lowest painted row is ${String(lowest)}, not the contact row ` +
        `${String(BUILD_REGISTRATION.contactRow)}. A figure that stops short floats; one that is ` +
        'cropped has lost its soles.',
    );
  }

  // The collar closes over the neck.
  const { from, to } = BUILD_REGISTRATION.neckColumns;
  const open: number[] = [];
  for (let x = from; x <= to; x++) {
    if (!opaque(x, BUILD_REGISTRATION.neckClosedAtRow)) open.push(x);
  }
  if (open.length > 0) {
    fail(
      `the neck is open at row ${String(BUILD_REGISTRATION.neckClosedAtRow)}, columns ` +
        `${open.join(', ')}. The collar has to close over the neck the head plate draws, or the ` +
        'room shows through the join.',
    );
  }

  /*
   * Every edge against empty space is outline.
   *
   * `ART_SPEC §4` — characters carry a fully enclosed 1px `ink-900` outline — and
   * it is the one rule that makes a figure hold up against a dark basement wall.
   * Checked against **transparency only**, never against the canvas edge: the
   * soles sit on row 167 and have nothing below them to be outlined against.
   */
  let bare = 0;
  let firstBare = '';
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!opaque(x, y) || at(x, y) === 1) continue;
      const exposed =
        (x > 0 && !opaque(x - 1, y)) ||
        (x < width - 1 && !opaque(x + 1, y)) ||
        (y > 0 && !opaque(x, y - 1)) ||
        (y < height - 1 && !opaque(x, y + 1));
      if (exposed) {
        bare++;
        if (firstBare === '') firstBare = `(${String(x)}, ${String(y)})`;
      }
    }
  }
  if (bare > 0) {
    fail(
      `${String(bare)} pixels sit on the figure's edge without an outline, first at ${firstBare}. ` +
        'A silhouette that is not enclosed dissolves into the basement wall.',
    );
  }

  // Coverage. A blank plate and a full-canvas background both pass every other
  // check on this list.
  const share = painted / (width * height);
  if (share < 0.12) fail(`only ${(share * 100).toFixed(1)}% of the canvas is painted`);
  if (share > 0.55) fail(`${(share * 100).toFixed(1)}% of the canvas is painted — is there a background?`);

  for (let y = 0; y < height; y++) {
    if (opaque(0, y) || opaque(width - 1, y)) {
      warn('the figure touches the left or right edge of the canvas, which usually means a crop');
      break;
    }
  }

  return problems;
}
