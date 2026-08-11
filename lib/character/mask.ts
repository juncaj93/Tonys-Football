import { HEAD, NECK, TORSO } from './art/geometry';
import { HOUSE, type HouseColour } from './palette';
import { type Tone, type ToneGrid } from './sprite';

/**
 * The role-mask contract — how painted manager artwork becomes tones.
 *
 * ## What a mask is, and what it deliberately is not
 *
 * A mask is a `112 × 168` grid in which **every pixel names the job it does**, not
 * the colour it ends up. `#C42B2B` in a delivered file does not mean *this pixel
 * is red*; it means *this pixel is the base tone of the garment channel*, and a
 * manager who chose Deep blue sees `#2C5A8C` there. That indirection is the whole
 * reason painted art can arrive without deleting the colour system:
 * `docs/ROOMS_BOUNDARY.md §14.1` costs a naive PNG swap at **132 files**, because
 * a finished full-colour hairstyle is one hair colour and the other seven stop
 * existing.
 *
 * It is **not** a generic art framework. One vocabulary, eighteen entries, covering
 * exactly what a below-neck build contains.
 *
 * ## Revision 2, 2026-08-11 — the encoding colour is not the render colour
 *
 * The first version required every key to be a colour the product actually
 * renders, so the mask would double as a correct picture of a manager. That was a
 * good instinct and it **cost us tones we already had**: `denim` and `sole` both
 * take `ink-900` as their darkest step, which is also the outline colour, so
 * encoding them was impossible and two materials shipped a step shallower than
 * the renderer could paint them.
 *
 * A mask PNG is a **source file**. It lives in `art/incoming/`, it is converted to
 * a module, and it never reaches `public/` — so `art/palette.json`, which governs
 * *shipped assets*, does not govern it. The keys are therefore chosen for two
 * properties in this order:
 *
 * 1. **Separability** — the conversion snaps each incoming pixel to its nearest
 *    key, and two keys close together make that snap a coin toss on exactly the
 *    pixels an artist was least careful about. Asserted at ≥ 20 in `mask.test.ts`.
 * 2. **Plausibility** — a painter working in these colours is painting a
 *    recognisable red-shirted manager rather than an abstract index map, so they
 *    can judge their own work by looking at it.
 *
 * Where a real production colour satisfies both, it is used. Three do not exist
 * yet and are marked {@link MaskKey.pending}.
 *
 * ## Three keys are `pending`, and that is the palette question deferred rather than dodged
 *
 * Measured against the approved `character_tony_neutral`, per material region:
 *
 * | material | Tony | this vocabulary renders today | with the proposed extension |
 * |---|---|---|---|
 * | garment | 5 (apron) – 8 (jersey) | **3** | **5** |
 * | trousers | 4 | 2 + ink | 3 + ink |
 * | bare skin | 3 | **3** | 3 |
 * | boots | 4 | 3 + ink | 3 + ink |
 *
 * **Skin and boots are already right**, which is the useful half of that
 * measurement — the shortfall is the garment and the trousers, and it is
 * therefore small. `art_status` for the three pending keys is exactly that: the
 * art is authored *with* them, the mask *records* them, and the renderer collapses
 * them onto the nearest step it can paint until the commissioner rules on an
 * `avatar` palette extension (17 colours: 8 top ramps × 2, plus one denim step).
 *
 * **Nothing about that collapse is a loss of art.** The information is in the
 * encoded module; the day the extension lands, the `tone` on three rows below
 * changes and every delivered mask renders at full depth **with no regeneration**.
 * That is the whole reason to record more than we can currently paint.
 */

/** Which material a pixel belongs to. */
export type MaskChannel =
  /** The manager's chosen top. Recoloured per `topColour`. */
  | 'garment'
  /** The manager's skin. Recoloured per `skin` — hands, forearms, any bare neck. */
  | 'skin'
  /** Not the manager's to choose: trousers, boot uppers, soles. */
  | 'fixed';

/** The step of a material's ramp, lightest first. */
export type MaskStep = 'light2' | 'light' | 'base' | 'shade' | 'shade2';

export interface MaskKey {
  /** The index written into the encoded run list. Never reordered; append only. */
  readonly index: number;
  readonly channel: MaskChannel | 'none';
  readonly step: MaskStep | 'outline' | 'none';
  /** What a painter is told this pixel is. */
  readonly name: string;
  /** The exact colour the delivered file must carry. Source-file only. */
  readonly hex: string;
  /**
   * The tone this decodes to **today**, or `null` for transparent.
   *
   * A `pending` key decodes to the nearest step the palette can currently paint.
   * Changing that is a one-line edit per row on the day an extension is approved,
   * and it re-renders every mask already delivered.
   */
  readonly tone: Tone | null;
  /**
   * True where the palette has no colour for this step yet.
   *
   * The art is authored with it anyway — see the module note. A pending key is
   * **encoded faithfully and rendered approximately**, never the other way round.
   */
  readonly pending?: true;
}

const house = (colour: HouseColour): string => HOUSE[colour];

/**
 * The vocabulary. **Eighteen entries, and the order is the encoding.**
 *
 * A stored mask names these by index, so a row that moved would silently repaint
 * every delivered asset — the same rule, for the same reason, as
 * `lib/character/catalog.ts`'s. **Never reorder; only append.**
 */
export const MASK_KEYS: readonly MaskKey[] = Object.freeze([
  { index: 0, channel: 'none', step: 'none', name: 'Transparent', hex: house('ink-900'), tone: null },
  { index: 1, channel: 'none', step: 'outline', name: 'Outline', hex: house('ink-900'), tone: 'outline' },

  /*
   * The garment, five steps. `light2` and `shade2` are the two the palette cannot
   * paint yet; both collapse inward, so a five-tone painting renders in three and
   * loses no recorded information.
   */
  { index: 2, channel: 'garment', step: 'light2', name: 'Shirt highlight', hex: '#F58A80', tone: 'light', pending: true },
  { index: 3, channel: 'garment', step: 'light', name: 'Shirt light', hex: house('red-light'), tone: 'light' },
  { index: 4, channel: 'garment', step: 'base', name: 'Shirt base', hex: house('red-mid'), tone: 'base' },
  { index: 5, channel: 'garment', step: 'shade', name: 'Shirt shade', hex: house('red-dark'), tone: 'shade' },
  { index: 6, channel: 'garment', step: 'shade2', name: 'Shirt deep shadow', hex: '#5A1216', tone: 'shade', pending: true },

  // Skin, three steps — which is what Tony's own arms and hands use.
  { index: 7, channel: 'skin', step: 'light', name: 'Skin light', hex: house('skin-1'), tone: 'skin:light' },
  { index: 8, channel: 'skin', step: 'base', name: 'Skin base', hex: house('skin-2'), tone: 'skin:base' },
  { index: 9, channel: 'skin', step: 'shade', name: 'Skin shade', hex: house('skin-3'), tone: 'skin:shade' },

  /*
   * Trousers. `light2` is the one genuinely missing colour rather than a nicety:
   * the denim ramp tops out at `blue-mid`, so the shipped trousers are much darker
   * than any real pair of jeans — the single most visible mismatch between the
   * approved concept and what this palette can paint.
   */
  { index: 10, channel: 'fixed', step: 'light2', name: 'Trouser highlight', hex: '#4A7FB8', tone: 'fixed:denim@light', pending: true },
  { index: 11, channel: 'fixed', step: 'light', name: 'Trouser light', hex: house('blue-mid'), tone: 'fixed:denim@light' },
  { index: 12, channel: 'fixed', step: 'base', name: 'Trouser base', hex: house('blue-deep'), tone: 'fixed:denim@base' },

  { index: 13, channel: 'fixed', step: 'light', name: 'Boot light', hex: house('wood-pale'), tone: 'fixed:leather@light' },
  { index: 14, channel: 'fixed', step: 'base', name: 'Boot base', hex: house('wood-mid'), tone: 'fixed:leather@base' },
  { index: 15, channel: 'fixed', step: 'shade', name: 'Boot shade', hex: house('wood-dark'), tone: 'fixed:leather@shade' },

  { index: 16, channel: 'fixed', step: 'light', name: 'Sole light', hex: house('ink-500'), tone: 'fixed:sole@light' },
  { index: 17, channel: 'fixed', step: 'base', name: 'Sole base', hex: house('ink-700'), tone: 'fixed:sole@base' },

  /*
   * Appended 2026-08-11 for the head plate, which a build does not need and a
   * face cannot do without.
   *
   * **`Skin highlight` is pending, for the same reason and with the same
   * measurement as the garment's.** Tony's own hands and forearms use three skin
   * values, which is why the build's three were left alone — but his *face* uses
   * five. A brow, a cheekbone and the bridge of a nose are the surfaces a fourth
   * step exists for, and there are twenty-eight rows of skull to spend it on.
   *
   * **`Eye white` is not pending.** `FIXED.white` has been in the palette since
   * the drawn head was written; it simply never needed encoding, because no build
   * has eyes.
   */
  { index: 18, channel: 'skin', step: 'light2', name: 'Skin highlight', hex: house('amber-glow'), tone: 'skin:light', pending: true },
  { index: 19, channel: 'fixed', step: 'base', name: 'Eye white', hex: house('paper-white'), tone: 'fixed:white@base' },
]);

/** The transparent key. Index 0, and the only one with no tone. */
export const TRANSPARENT_KEY = 0;

/** Every key that may appear as an opaque pixel. */
export function paintedKeys(): readonly MaskKey[] {
  return MASK_KEYS.filter((key) => key.index !== TRANSPARENT_KEY);
}

/** The keys whose step the palette cannot paint yet. Evidence for the ruling. */
export function pendingKeys(): readonly MaskKey[] {
  return MASK_KEYS.filter((key) => key.pending === true);
}

export const MASK_CANVAS = Object.freeze({ width: 112, height: 168 });

/**
 * A decoded mask, ready to be a layer.
 *
 * `rle` is the wire format the generated modules carry: `"<key>.<count>"`
 * entries, comma-separated, row-major across the whole canvas. Readable enough to
 * grep, small enough to ship to the browser — which it must be, because
 * `composeCharacter` runs unchanged in the customiser's local preview and a mask
 * that only existed on the server would make that preview a lie.
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
 * **Binding, and short.** `ART_SPEC §9`'s standing rule is that a layer which does
 * not land on its anchor is regenerated and *the renderer is never adjusted to
 * compensate*, so this list is exactly what another layer depends on and nothing
 * else. The pose, the arms, the hands, the stance and the garment silhouette are
 * **deliberately unconstrained** (commissioner ruling R2, 2026-08-11);
 * constraining them is what produced the interchangeable mannequin.
 */
export const BUILD_REGISTRATION = Object.freeze({
  /** Nothing in a build may reach the head. The head plate owns everything above. */
  headClearBelow: HEAD.bottom,
  /** The collar must close over the neck, or the join shows the room through it. */
  neckColumns: Object.freeze({ from: NECK.left, to: NECK.left + NECK.width - 1 }),
  neckClosedAtRow: NECK.bottom - 1,
  /** Feet on the floor. The composite ends here and the room draws its shadow to it. */
  contactRow: MASK_CANVAS.height - 1,
  /**
   * Where the topmost painted row must fall.
   *
   * **Added in revision 2, and it is the check round 1 needed.** That figure was
   * beautifully drawn and framed as a standalone portrait — it filled the canvas
   * top to bottom instead of sitting in the third of it below the head. Every
   * other check would have caught it eventually, but none of them *named* the
   * problem, and a refusal that does not name the problem costs a whole
   * generation round to diagnose.
   */
  shoulderBand: Object.freeze({ from: HEAD.bottom + 1, to: TORSO.top + 6 }),
});

/**
 * Check a grid of key indices against everything that can be checked mechanically.
 *
 * Canvas, alpha and colour legality are the caller's — they are properties of the
 * *file*. This checks properties of the *drawing*, and is pure so the tests can
 * build a bad mask in memory rather than committing one.
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
  let highest: number = height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!opaque(x, y)) continue;
      painted++;
      lowest = y;
      highest = Math.min(highest, y);
    }
  }

  if (painted === 0) return [{ severity: 'fail', message: 'the mask is empty' }];

  // Head clearance — the head plate owns every row above this, and a build that
  // reaches into it draws a second skull over the first.
  if (highest <= BUILD_REGISTRATION.headClearBelow) {
    fail(
      `the topmost painted row is ${String(highest)}; a build must leave rows 0–` +
        `${String(BUILD_REGISTRATION.headClearBelow)} clear for the head plate. This is what a ` +
        'figure **drawn to fill the frame** looks like: a build is not a whole person, it is the ' +
        'part below the neck, and the top third of the canvas belongs to the head.',
    );
  } else if (
    highest < BUILD_REGISTRATION.shoulderBand.from ||
    highest > BUILD_REGISTRATION.shoulderBand.to
  ) {
    fail(
      `the figure begins at row ${String(highest)}, outside the shoulder band ` +
        `${String(BUILD_REGISTRATION.shoulderBand.from)}–${String(BUILD_REGISTRATION.shoulderBand.to)}. ` +
        'A build is not a whole figure: it is the part below the neck, and the top third of the ' +
        'canvas belongs to the head. A figure drawn to fill the frame lands here.',
    );
  }

  if (lowest !== BUILD_REGISTRATION.contactRow) {
    fail(
      `the lowest painted row is ${String(lowest)}, not the contact row ` +
        `${String(BUILD_REGISTRATION.contactRow)}. A figure that stops short floats; one that is ` +
        'cropped has lost its soles.',
    );
  }

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
  if (share > 0.55) {
    fail(
      `${(share * 100).toFixed(1)}% of the canvas is painted. A build occupies roughly a third — ` +
        'this is a background, a vignette, or a figure drawn at the wrong scale.',
    );
  }

  for (let y = 0; y < height; y++) {
    if (opaque(0, y) || opaque(width - 1, y)) {
      warn('the figure touches the left or right edge of the canvas, which usually means a crop');
      break;
    }
  }

  return problems;
}
