import { AXIS, FACE, HEAD, NECK, TORSO } from './art/geometry';
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
 * It is **not** a generic art framework. One vocabulary, twenty-three entries,
 * covering exactly what a build, a head and a hairstyle contain — three plates, and
 * a key names which of them it may appear on.
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
 *    pixels an artist was least careful about. Asserted at ≥ 20 **per plate** in
 *    `mask.test.ts`, and at ≥ 100 between hair and skin, which are not merely
 *    snapped apart but partitioned (see {@link extractHairChannel}).
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
  /**
   * The manager's hair. Recoloured per `hairColour` — a hairstyle **and** a beard,
   * because facial hair deliberately takes the head hair's colour rather than a
   * control of its own (`composite.ts`).
   */
  | 'hair'
  /** Not the manager's to choose: trousers, boot uppers, soles. */
  | 'fixed';

/**
 * Which kind of layer a delivered file is.
 *
 * **The snap only ever offers the keys of one plate**, so a plate is not a label —
 * it is the candidate set. A head contains no boots; a hairstyle contains no skin,
 * no shirt and no eyes.
 */
export type MaskPlate = 'build' | 'head' | 'hair';

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
  /**
   * Which plates this key can legally appear on.
   *
   * **The snap is only allowed to answer with a key the layer could contain**, and
   * that is not a nicety. Our skin ramp and our leather ramp are neighbours in
   * colour space — `skin-2 #D9A173` and `wood-pale #C99A63` are 45 apart, closer
   * than a delivery's own drift — so a face painted with ordinary mid-brown
   * shadows put **25% of a head onto boot keys**, which rendered as wood-coloured
   * blotches across the cheeks. Nothing was wrong with the art.
   *
   * A head plate contains skin, eyes and outline. It contains no boots, no
   * trousers and no shirt, so offering those as answers can only ever be wrong.
   * Restricting the candidates removes impossible answers rather than accepting
   * bad ones, which is why it cannot hide a malformed asset.
   *
   * **It is also what makes separability a per-plate question**, which is how
   * `mask.test.ts` asks it. Two keys that no plate offers together cannot be
   * confused however close they are, so measuring them is a check of a claim
   * nothing depends on — and it would refuse a correct vocabulary for a collision
   * that cannot occur. What catches a file submitted as the wrong *kind* is
   * registration, not colour; see {@link HAIR_REGISTRATION}.
   */
  readonly on: readonly MaskPlate[];
}

const BUILD_ONLY = ['build'] as const;
const HEAD_AND_HAIR = ['head', 'hair'] as const;
const HAIR_ONLY = ['hair'] as const;
const EVERY_PLATE = ['build', 'head', 'hair'] as const;

const house = (colour: HouseColour): string => HOUSE[colour];

/**
 * The vocabulary. **Twenty-three entries, and the order is the encoding.**
 *
 * A stored mask names these by index, so a row that moved would silently repaint
 * every delivered asset — the same rule, for the same reason, as
 * `lib/character/catalog.ts`'s. **Never reorder; only append.**
 */
export const MASK_KEYS: readonly MaskKey[] = Object.freeze([
  { index: 0, channel: 'none', step: 'none', name: 'Transparent', hex: house('ink-900'), tone: null, on: EVERY_PLATE },
  { index: 1, channel: 'none', step: 'outline', name: 'Outline', hex: house('ink-900'), tone: 'outline', on: EVERY_PLATE },

  /*
   * The garment, five steps. `light2` and `shade2` are the two the palette cannot
   * paint yet; both collapse inward, so a five-tone painting renders in three and
   * loses no recorded information.
   */
  { index: 2, channel: 'garment', step: 'light2', name: 'Shirt highlight', hex: '#F58A80', tone: 'light', pending: true, on: BUILD_ONLY },
  { index: 3, channel: 'garment', step: 'light', name: 'Shirt light', hex: house('red-light'), tone: 'light', on: BUILD_ONLY },
  { index: 4, channel: 'garment', step: 'base', name: 'Shirt base', hex: house('red-mid'), tone: 'base', on: BUILD_ONLY },
  { index: 5, channel: 'garment', step: 'shade', name: 'Shirt shade', hex: house('red-dark'), tone: 'shade', on: BUILD_ONLY },
  { index: 6, channel: 'garment', step: 'shade2', name: 'Shirt deep shadow', hex: '#5A1216', tone: 'shade', pending: true, on: BUILD_ONLY },

  /*
   * Skin, three steps — which is what Tony's own arms and hands use.
   *
   * **On the hair plate too, as context rather than as content.** A hairstyle is
   * delivered drawn *on a head*, because that is the only way a generator can be
   * told where to put it; the skin keys are what the head under it is painted in,
   * and `extractHairChannel` discards every pixel of them. See {@link MaskPlate}.
   */
  { index: 7, channel: 'skin', step: 'light', name: 'Skin light', hex: house('skin-1'), tone: 'skin:light', on: EVERY_PLATE },
  { index: 8, channel: 'skin', step: 'base', name: 'Skin base', hex: house('skin-2'), tone: 'skin:base', on: EVERY_PLATE },
  { index: 9, channel: 'skin', step: 'shade', name: 'Skin shade', hex: house('skin-3'), tone: 'skin:shade', on: EVERY_PLATE },

  /*
   * Trousers. `light2` is the one genuinely missing colour rather than a nicety:
   * the denim ramp tops out at `blue-mid`, so the shipped trousers are much darker
   * than any real pair of jeans — the single most visible mismatch between the
   * approved concept and what this palette can paint.
   */
  { index: 10, channel: 'fixed', step: 'light2', name: 'Trouser highlight', hex: '#4A7FB8', tone: 'fixed:denim@light', pending: true, on: BUILD_ONLY },
  { index: 11, channel: 'fixed', step: 'light', name: 'Trouser light', hex: house('blue-mid'), tone: 'fixed:denim@light', on: BUILD_ONLY },
  { index: 12, channel: 'fixed', step: 'base', name: 'Trouser base', hex: house('blue-deep'), tone: 'fixed:denim@base', on: BUILD_ONLY },

  { index: 13, channel: 'fixed', step: 'light', name: 'Boot light', hex: house('wood-pale'), tone: 'fixed:leather@light', on: BUILD_ONLY },
  { index: 14, channel: 'fixed', step: 'base', name: 'Boot base', hex: house('wood-mid'), tone: 'fixed:leather@base', on: BUILD_ONLY },
  { index: 15, channel: 'fixed', step: 'shade', name: 'Boot shade', hex: house('wood-dark'), tone: 'fixed:leather@shade', on: BUILD_ONLY },

  { index: 16, channel: 'fixed', step: 'light', name: 'Sole light', hex: house('ink-500'), tone: 'fixed:sole@light', on: BUILD_ONLY },
  { index: 17, channel: 'fixed', step: 'base', name: 'Sole base', hex: house('ink-700'), tone: 'fixed:sole@base', on: BUILD_ONLY },

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
  { index: 18, channel: 'skin', step: 'light2', name: 'Skin highlight', hex: house('amber-glow'), tone: 'skin:light', pending: true, on: EVERY_PLATE },
  { index: 19, channel: 'fixed', step: 'base', name: 'Eye white', hex: house('paper-white'), tone: 'fixed:white@base', on: HEAD_AND_HAIR },

  /*
   * Appended 2026-08-12 for the hair plate — six hairstyles and four facial-hair
   * pieces, which are the ten layers the head was registered so carefully for.
   *
   * **Three steps, and the number is the ramp's rather than a choice.** Every one
   * of `HAIR_COLOURS`' eight ramps is exactly three deep, so a fourth key would
   * have nothing to decode to on any of them — the garment's and the skin's
   * `pending` highlights collapse onto a step the ramp *has*, and there is no such
   * step here. It is also what the reference art actually uses: sampled over the
   * hair mass of the delivered contact sheet, 90% of it falls into two tone
   * families around `rgb(126,73,37)` and `rgb(84,48,24)`, with the outline as the
   * third. Recorded in `docs/art/MANAGER_HAIR_BRIEF.md`.
   *
   * ## Green, and it is the one place separability beat plausibility outright
   *
   * The module note above ranks the two and this is the key that tests the
   * ranking. The obvious choice was the `Brown` ramp — `wood-light`/`wood-mid`/
   * `wood-dark`, `HAIR_COLOURS[2]` — so that a painter is drawing a brown-haired
   * manager and at `hairColour: 2` the render is the file. **It would not
   * survive the extraction step.** Hair arrives painted on a head, and the mask
   * is the *hair*: the pixels are separated by which key they snapped to, so
   * brown hair against brown skin is exactly the collision that put 25% of round
   * 2's head onto boot keys (`MaskKey.on`). Skin and hair browns are neighbours;
   * the face would have come out as hair.
   *
   * A green ramp is nowhere near skin, ink, wood, paper or amber. It looks absurd
   * on a head and that is the point — it is an **encoding**, the ingest's own
   * preview immediately shows the hair in real brown, and a mask PNG never reaches
   * `public/`.
   *
   * **The shade step is deliberately not `green-deep`.** The house green would
   * have made two of the three keys real palette colours, which was tempting and
   * wrong: at `#1E4A32` it sits 64 from `ink-900`, and a hair pixel that snaps to
   * the outline key is not recoloured, it is **deleted** — `extractHairChannel`
   * discards the delivered ink wholesale. The darkest pixels of a dark hairstyle
   * are exactly where that would happen, and it would come back as holes in the
   * hair rather than as anything a validator names. `#2A7D45` is 119 from ink and
   * still 43 from the base step.
   *
   * **A tone here is plain**, not channelled. A hair layer's paint is
   * `{ kind: 'hair' }` and carries one material, so `light`/`base`/`shade` resolve
   * against `hairColours()` with no prefix to strip — the `skin:` case exists only
   * because a *build* carries two of the manager's choices at once.
   */
  { index: 20, channel: 'hair', step: 'light', name: 'Hair light', hex: house('green-neon'), tone: 'light', on: HAIR_ONLY },
  { index: 21, channel: 'hair', step: 'base', name: 'Hair base', hex: '#35A05C', tone: 'base', on: HAIR_ONLY },
  { index: 22, channel: 'hair', step: 'shade', name: 'Hair shade', hex: '#2A7D45', tone: 'shade', on: HAIR_ONLY },
]);

/** The transparent key. Index 0, and the only one with no tone. */
export const TRANSPARENT_KEY = 0;

/** Every key that may appear as an opaque pixel, optionally on one plate. */
export function paintedKeys(plate?: MaskPlate): readonly MaskKey[] {
  return MASK_KEYS.filter(
    (key) => key.index !== TRANSPARENT_KEY && (plate === undefined || key.on.includes(plate)),
  );
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
  /**
   * Which kind of layer this was snapped and validated as.
   *
   * Recorded rather than inferred. `composeCharacter` asks whether a *top* has a
   * painted **build** in order to decide whether the drawn body stands down, and
   * "there is a mask under this slug" stopped being the same question the moment a
   * second kind of plate existed.
   */
  readonly plate: MaskPlate;
  readonly width: number;
  readonly height: number;
  readonly rle: string;
}

/** Run-length encode a grid of key indices. Row-major, canvas-wide. */
export function encodeMask(slug: string, plate: MaskPlate, keys: readonly number[]): EncodedMask {
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

  return { slug, plate, width, height, rle: runs.join(',') };
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
    const entry = MASK_KEYS[key];
    if (entry === undefined) throw new Error(`${mask.slug}: unknown key ${String(key)}`);
    /*
     * A key a plate cannot contain is a module that was hand-edited, or one
     * snapped under the wrong plate before this field existed. Both would render
     * — as boot-coloured hair, or as a shirt on a face — so this throws rather
     * than warns. Masks are generated; there is no legitimate way to get here.
     */
    if (!entry.on.includes(mask.plate)) {
      throw new Error(`${mask.slug}: key ${String(key)} (${entry.name}) is not legal on a ${mask.plate} plate`);
    }
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

/** Read a key grid as a function, transparent outside the canvas. */
function reader(keys: readonly number[]): {
  at: (x: number, y: number) => number;
  opaque: (x: number, y: number) => boolean;
} {
  const { width, height } = MASK_CANVAS;
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= width || y >= height ? TRANSPARENT_KEY : keys[y * width + x]!;
  return { at, opaque: (x, y) => at(x, y) !== TRANSPARENT_KEY };
}

/**
 * Every edge against empty space is outline — `ART_SPEC §4`, on all three plates.
 *
 * Written out three times before the hair plate made it four, which is three
 * chances for the plates to disagree about the one rule that makes a figure hold
 * up against a dark basement wall. Checked against **transparency only**, never
 * against the canvas edge: a build's soles sit on row 167 with nothing below them.
 */
function unoutlinedEdge(keys: readonly number[], budget: number, what: string): readonly MaskProblem[] {
  const { width, height } = MASK_CANVAS;
  const { at, opaque } = reader(keys);

  let bare = 0;
  let first = '';
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
        if (first === '') first = `(${String(x)}, ${String(y)})`;
      }
    }
  }

  if (bare <= budget) return [];
  return [
    {
      severity: 'fail',
      message:
        `${String(bare)} pixels sit on the ${what}'s edge without an outline, first at ${first}` +
        (budget > 0 ? `, over the ${String(budget)} a conversion leaves. Draw the outline thicker.` : '. ' +
          'A silhouette that is not enclosed dissolves into the basement wall.'),
    },
  ];
}

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

  // Every edge against empty space is outline. A build carries **no budget** —
  // unlike the head and the hair plate, its silhouette has always converted
  // cleanly, and the two that needed one earned it on a delivery.
  problems.push(...unoutlinedEdge(keys, 0, 'figure'));

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

/* --------------------------------------------------------- the head -- */

/**
 * Where a delivered head has to land.
 *
 * **Longer than a build's list, and that asymmetry is the point.** A build's
 * registration exists so *its own* silhouette sits in the room; a head's exists
 * so **ten other layers** land on it — six hairstyles drawn to the skull's curve,
 * four facial-hair pieces drawn to the mouth and jaw, three hats to the brow. A
 * head that misses is not a head slightly out of place, it is ten assets wrong.
 *
 * Which is also why a head is **not offered placement normalisation**. Fitting a
 * bounding box aligns the envelope and says nothing about where the eyes are
 * inside it, and the eyes are what everything else is measured from.
 */
export const HEAD_REGISTRATION = Object.freeze({
  /** The topmost row of the skull. Hair is painted to the curve starting here. */
  top: HEAD.top,
  /** The last row the head plate owns. The collar closes over it. */
  bottom: NECK.bottom - 1,
  /** The jaw, where the skull ends and the neck begins. */
  jaw: HEAD.bottom,
  /**
   * The eye line, and how far off it a delivery may be.
   *
   * **Three, and the number is now evidence rather than a guess.** It was two,
   * chosen before any head existed. Two deliveries in a row landed on row 40 — a
   * drawn head's eyes sit 46% down its skull and a painted one put them at 57%,
   * because the cranium above them is taller — so the question became whether
   * three rows actually costs anything.
   *
   * It was answered by rendering: the painted head under **all six hairstyles and
   * all four facial-hair layers**, in `docs/evidence/manager-head-prototype/`. The
   * hair sits correctly, because hair registers to the skull and the skull is
   * fitted exactly. The beards sit up to three rows high, which is visible if you
   * are looking for it and is not what anybody would call broken — and it resolves
   * on its own when facial hair is repainted to this head.
   *
   * **A fourth row is not available**, and that is the honest bound rather than a
   * round number: no uniform scale can land the eye line and the jaw *and* the
   * skull top at once when the proportions differ, so widening this further stops
   * being a tolerance and becomes an unmeasured claim.
   */
  eyeRow: FACE.eyeY,
  eyeTolerance: 3,
  /** The skull's columns, and how much wider or narrower a delivery may be. */
  skull: Object.freeze({ left: HEAD.left, right: HEAD.right }),
  widthTolerance: 3,
  neckColumns: Object.freeze({ from: NECK.left, to: NECK.left + NECK.width - 1 }),
});

/** The key a painted eye white must land on, for the eye line to be measurable. */
const EYE_WHITE_KEY = 19;

/**
 * Check a head plate.
 *
 * The eye line is measured from the **eye-white key** rather than guessed from
 * dark pixels: a lash line, a pupil, a nostril and a mouth are all ink, and the
 * only unambiguous eye in a role mask is its white.
 */
export function validateHeadPlate(
  keys: readonly number[],
  /** What the build draws over the head, when the caller knows. */
  covered?: (x: number, y: number) => boolean,
): readonly MaskProblem[] {
  const { width, height } = MASK_CANVAS;
  const problems: MaskProblem[] = [];
  const fail = (message: string): number => problems.push({ severity: 'fail', message });

  if (keys.length !== width * height) {
    return [{ severity: 'fail', message: `mask is ${String(keys.length)} cells, not ${String(width * height)}` }];
  }

  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= width || y >= height ? TRANSPARENT_KEY : keys[y * width + x]!;
  const opaque = (x: number, y: number): boolean => at(x, y) !== TRANSPARENT_KEY;

  let top: number = height;
  let bottom = -1;
  let painted = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!opaque(x, y)) continue;
      painted++;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (painted === 0) return [{ severity: 'fail', message: 'the head plate is empty' }];

  if (top !== HEAD_REGISTRATION.top) {
    fail(
      `the skull starts on row ${String(top)}, not ${String(HEAD_REGISTRATION.top)}. Six ` +
        'hairstyles are painted to the curve that starts there.',
    );
  }

  /*
   * **A neck may run past the collar row, and this rule used to say it could not.**
   *
   * The head plate is `base-body` and the build is `base-top`, so the shirt is
   * drawn *over* the neck: rows below the collar are covered, and a neck that
   * continues into them is hidden rather than wrong. What matters is that it
   * **reaches** the collar, and that anything past it stays inside the neck's own
   * columns — outside them it would emerge from behind the shirt.
   */
  if (bottom > HEAD_REGISTRATION.bottom) {
    /*
     * **Judged against what the build actually covers**, when the caller can say.
     * The first version guessed with the neck's columns and refused one pixel of a
     * correct delivery — a pixel the shirt was drawn straight over. A guess about
     * coverage is exactly the thing the composite can answer for itself.
     */
    let strayed = 0;
    let firstStray = '';
    for (let y = HEAD_REGISTRATION.bottom + 1; y <= bottom; y++) {
      for (let x = 0; x < width; x++) {
        if (!opaque(x, y)) continue;
        const hidden =
          covered === undefined
            ? x >= HEAD_REGISTRATION.neckColumns.from - 1 && x <= HEAD_REGISTRATION.neckColumns.to + 1
            : covered(x, y);
        if (hidden) continue;
        strayed++;
        if (firstStray === '') firstStray = `(${String(x)}, ${String(y)})`;
      }
    }
    if (strayed > 0) {
      fail(
        `${String(strayed)} pixels are painted below the collar row ` +
          `${String(HEAD_REGISTRATION.bottom)} where nothing covers them, first at ${firstStray}. ` +
          'The shirt hides the neck down there; it does not hide a shoulder.',
      );
    }
  }

  if (bottom < HEAD_REGISTRATION.bottom) {
    fail(
      `the neck stops at row ${String(bottom)} and has to reach ` +
        `${String(HEAD_REGISTRATION.bottom)}, where the collar meets it. ` +
        `${String(HEAD_REGISTRATION.bottom - bottom)} rows of room would show through the join.`,
    );
  }

  // The eye line, from the eye whites.
  let eyeTop = -1;
  let eyeWhites = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (at(x, y) !== EYE_WHITE_KEY) continue;
      eyeWhites++;
      if (eyeTop === -1) eyeTop = y;
    }
  }
  if (eyeWhites === 0) {
    fail(
      'no pixel is painted in the eye-white key, so the eye line cannot be measured. The eyes ' +
        'are what every other layer is positioned from.',
    );
  } else if (Math.abs(eyeTop - HEAD_REGISTRATION.eyeRow) > HEAD_REGISTRATION.eyeTolerance) {
    fail(
      `the eyes begin on row ${String(eyeTop)}, ${String(Math.abs(eyeTop - HEAD_REGISTRATION.eyeRow))} ` +
        `rows off the eye line at ${String(HEAD_REGISTRATION.eyeRow)}. Hats clear the brow two rows ` +
        'above it and every hairstyle is drawn around it.',
    );
  }

  // The skull's width, measured at the eye line where it is widest.
  let left: number = width;
  let right = -1;
  for (let x = 0; x < width; x++) {
    if (opaque(x, HEAD_REGISTRATION.eyeRow)) {
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  const wanted = HEAD_REGISTRATION.skull.right - HEAD_REGISTRATION.skull.left;
  if (right >= 0 && Math.abs(right - left + 1 - wanted) > HEAD_REGISTRATION.widthTolerance) {
    fail(
      `the skull is ${String(right - left + 1)} columns across at the eye line, against ` +
        `${String(wanted)}. Long hair and the ponytail hang just outside ` +
        `${String(HEAD_REGISTRATION.skull.left)}–${String(HEAD_REGISTRATION.skull.right)}.`,
    );
  }

  // The neck has to be there for the collar to close over.
  const open: number[] = [];
  for (let x = HEAD_REGISTRATION.neckColumns.from; x <= HEAD_REGISTRATION.neckColumns.to; x++) {
    if (!opaque(x, HEAD_REGISTRATION.bottom)) open.push(x);
  }
  if (open.length > 0) {
    fail(`the neck is missing at row ${String(HEAD_REGISTRATION.bottom)}, columns ${open.join(', ')}.`);
  }

  /*
   * **A small budget, and the build deliberately has none.**
   *
   * Where a curve meets the canvas at a shallow angle, the majority vote that
   * turns 1024 source pixels into 112 drops the outline on a pixel or two — always
   * at the crown, where the skull is flattest. Round 1 carried 24 of them and
   * round 2 carried 6, which is the difference a thicker stroke made rather than
   * noise. Eight is under a twentieth of a head's outline and above what a
   * correctly drawn delivery leaves.
   */
  problems.push(...unoutlinedEdge(keys, OUTLINE_BUDGET, 'head'));

  void AXIS;
  return problems;
}

/** How many unoutlined edge pixels the downscale may leave on a head. */
export const OUTLINE_BUDGET = 8;

/* ----------------------------------------------------- hair and beards -- */

/**
 * Where a hairstyle has to land, and where a beard has to land.
 *
 * **Two registrations, one plate.** They share a colour vocabulary — facial hair
 * takes the head hair's colour by design, so there is one `hair` channel — and
 * they share nothing else: a hairstyle is measured from the crown and a beard
 * from the mouth. Checking a beard against a hairstyle's band would pass a
 * moustache drawn on the forehead.
 *
 * **Every bound below is the drawn set's own measured extent, widened.** The six
 * drawn hairstyles span rows 11–77 and the four beards rows 39–56, layer by layer
 * in `docs/art/MANAGER_HAIR_BRIEF.md §5`. A band tighter than the styles
 * the product already ships would refuse a correct repaint of a style that exists,
 * which is the mistake `HEAD_REGISTRATION.eyeTolerance` cost two rounds to find.
 *
 * ## The eye rule is the one that earns its place
 *
 * Nothing on this plate may paint over an eye. All ten drawn layers clear both eye
 * rectangles **exactly** — zero pixels, measured, not one of them nearly — because
 * a hairstyle that covers an eye is not a fringe, it is a layer drawn at the wrong
 * offset, and the head's whole registration exists so that cannot happen quietly.
 *
 * ## What catches a file submitted as the wrong kind
 *
 * Separability is a **per-plate** question ({@link MaskKey.on}), so colour distance
 * says nothing about whether a file is the kind of thing it was submitted as.
 * **Registration does, and overwhelmingly.** A build read as hair runs from the
 * shoulders to row 167 and fails the floor, the crown band and the skull overlap
 * at once; a hairstyle read as a build fails the contact row and the shoulder
 * band. Neither is a near miss, and `hair.test.ts` asserts both rather than
 * reasoning about them.
 */
export const HAIR_REGISTRATION = Object.freeze({
  /**
   * Where the topmost painted row may fall.
   *
   * Above the skull, because a curly style rises off it — the drawn one starts at
   * row 11, thirteen above `HEAD.top`. Below it too, because a receding style
   * starts at 28.
   */
  crown: Object.freeze({ from: HEAD.top - 15, to: HEAD.top + 6 }),
  /**
   * The lowest row hair may reach. Long hair and a ponytail fall past the collar
   * onto the shoulders; the drawn Long style ends at 77. Hair does not reach a
   * waistband.
   */
  floor: TORSO.top + 24,
  /** How much of the skull box a style must actually cover, in pixels. */
  minimumOnSkull: 60,
  /** Coverage bounds. A blank plate and a full-canvas wash both fail everything else. */
  coverage: Object.freeze({ minimum: 60, maximum: 2400 }),
});

/** Where facial hair has to land. Measured from the mouth, not from the crown. */
export const FACIAL_HAIR_REGISTRATION = Object.freeze({
  /** Nothing above this row: a beard that reaches the brow is a beard drawn as hair. */
  top: FACE.browY + 2,
  /** A beard may fall onto the neck. It may not reach the collar the shirt closes at. */
  floor: NECK.bottom - 1,
  /**
   * The box a beard must actually occupy, around the mouth.
   *
   * **A box rather than a band of rows, and the first version was rows.** Rows
   * alone are satisfied by a pair of sideburns at the temples, which sit at
   * exactly the mouth's height and frame nothing — the case is in `hair.test.ts`
   * and it passed until the columns were added. Sixteen columns centred on the
   * axis is the moustache's own span; the four drawn pieces put 44, 50, 70 and
   * 122 pixels inside it, so 24 is generous to a repaint and unreachable by
   * anything that is not on the mouth.
   */
  mouthBox: Object.freeze({
    from: FACE.mouthY - 4,
    to: FACE.mouthY + 4,
    left: AXIS - 8,
    right: AXIS + 7,
  }),
  minimumInMouthBand: 24,
  /** A beard stays on the face. The drawn set spans columns 43–68; the skull is 43–68. */
  columns: Object.freeze({ from: HEAD.left - 3, to: HEAD.right + 3 }),
  coverage: Object.freeze({ minimum: 24, maximum: 900 }),
});

/**
 * Take the hair out of a delivery that also contains the head it was drawn on.
 *
 * ## Why the delivery contains a head at all
 *
 * A build has a contact row and a shoulder band; a head has a skull, a jaw and an
 * eye line. **A hairstyle alone on a transparent canvas has no landmark of any
 * kind** — there is nothing in a drawing of hair that says where the head it
 * belongs to was. Two rounds of head deliveries established that placement is the
 * thing a generator is worst at, so a contract that depends on it being right is a
 * contract that fails. Drawn *on a head*, the head is the landmark: the same
 * skull fit the head plate uses lands the whole delivery, and the hair comes with
 * it.
 *
 * ## The separation is by key, which is why the hair keys are green
 *
 * Every pixel has already been snapped to exactly one role. Keeping the `hair`
 * channel and dropping everything else is a **partition of the delivered pixels**,
 * not an estimate of one — no threshold, no tolerance, nothing that could keep
 * half a cheek. It is only sound because no skin colour is anywhere near the hair
 * keys, which is the whole reason those keys are not brown.
 *
 * ## The outline goes to whichever object it belongs to
 *
 * The delivered ink is the one genuinely ambiguous colour: the jaw's outline and
 * the fringe's are the same key, so the channel partition cannot place it. The
 * criterion that can is **adjacency** — an ink pixel touching hair is the hair's
 * own edge, because the hair is the layer on top, and an ink pixel touching no
 * hair at all is the head's.
 *
 * **The first version simply threw all of it away** and re-derived a silhouette
 * from what was left. That is one line shorter and it **erodes every hairstyle by
 * a pixel all round** — measured on the Long style, 974 delivered pixels came back
 * as 705 — which on a 112-wide canvas closes up a parting and deletes a lock of
 * hair two pixels wide outright.
 *
 * What is still derived is the *enclosure*: after the partition, any kept pixel on
 * the result's own silhouette is forced to outline, so `ART_SPEC §4` holds by
 * construction rather than by asking the artist. A kept ink pixel that ends up in
 * the interior is not a mistake — `compositeRuns` draws a non-silhouette outline in
 * the layer's own shade, so it reads as a dark line in the hair, which is what it
 * was drawn as.
 *
 * ## The one thing that cannot be recovered, and why it fails loudly
 *
 * A mark drawn **entirely in ink**, containing no hair-keyed pixel anywhere in it,
 * is indistinguishable from the head's own outline and is dropped. Measured across
 * the ten drawn layers re-expressed as a delivery, the round trip lands within
 * `+6 / −4` pixels on eight of them and loses 14 of Stubble's 100 — because the
 * shape rasteriser marks a one-pixel-thick mark as *all* outline, so there is
 * nothing left to be adjacent to.
 *
 * The brief therefore asks for ink as a **stroke around a painted mass**, never as
 * the mass, and a delivery that ignores it does not degrade quietly: it extracts to
 * almost nothing and fails the coverage floor in {@link validateHairMask} by name.
 *
 * The check in {@link validateHairMask} is left in place even though this makes it
 * pass by construction. It is no longer testing the artist; it is testing this
 * function.
 */
export function extractHairChannel(keys: readonly number[]): readonly number[] {
  const { width, height } = MASK_CANVAS;
  const OUTLINE_KEY = 1;

  const isHair = (x: number, y: number): boolean =>
    x >= 0 &&
    y >= 0 &&
    x < width &&
    y < height &&
    MASK_KEYS[keys[y * width + x]!]?.channel === 'hair';

  const kept = Array.from({ length: width * height }, () => TRANSPARENT_KEY);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * width + x;
      if (isHair(x, y)) {
        kept[at] = keys[at]!;
        continue;
      }
      if (keys[at] !== OUTLINE_KEY) continue;
      // Ink touching hair is the hair's edge; ink touching none of it is the head's.
      for (let dy = -1; dy <= 1 && kept[at] === TRANSPARENT_KEY; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (isHair(x + dx, y + dy)) {
            kept[at] = OUTLINE_KEY;
            break;
          }
        }
      }
    }
  }

  const solid = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && kept[y * width + x] !== TRANSPARENT_KEY;

  const out = [...kept];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!solid(x, y)) continue;
      if (!solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1)) {
        out[y * width + x] = OUTLINE_KEY;
      }
    }
  }
  return out;
}

/** Both eye rectangles, which nothing on the hair plate may paint into. */
function eyeCells(): readonly (readonly [number, number])[] {
  const cells: [number, number][] = [];
  for (const left of [FACE.eyeLeft, FACE.eyeRight]) {
    for (let y = FACE.eyeY; y < FACE.eyeY + FACE.eyeHeight; y++) {
      for (let x = left; x < left + FACE.eyeWidth; x++) cells.push([x, y]);
    }
  }
  return cells;
}

/** What both hair validators check: the eyes, the outline, and something drawn. */
function hairPlateProblems(
  keys: readonly number[],
  what: string,
): { readonly problems: MaskProblem[]; readonly painted: number; readonly top: number; readonly bottom: number; readonly left: number; readonly right: number } {
  const { width, height } = MASK_CANVAS;
  const { opaque } = reader(keys);
  const problems: MaskProblem[] = [];

  let painted = 0;
  let top: number = height;
  let bottom = -1;
  let left: number = width;
  let right = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!opaque(x, y)) continue;
      painted++;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }

  if (painted > 0) {
    const overEyes = eyeCells().filter(([x, y]) => opaque(x, y));
    if (overEyes.length > 0) {
      const [x, y] = overEyes[0]!;
      problems.push({
        severity: 'fail',
        message:
          `${String(overEyes.length)} pixels are painted over an eye, first at (${String(x)}, ${String(y)}). ` +
          `The eyes are at rows ${String(FACE.eyeY)}–${String(FACE.eyeY + FACE.eyeHeight - 1)}, columns ` +
          `${String(FACE.eyeLeft)}–${String(FACE.eyeLeft + FACE.eyeWidth - 1)} and ` +
          `${String(FACE.eyeRight)}–${String(FACE.eyeRight + FACE.eyeWidth - 1)}. Every one of the ten ` +
          'layers this replaces clears them completely; a fringe stops at the brow.',
      });
    }
    problems.push(...unoutlinedEdge(keys, OUTLINE_BUDGET, what));
  }

  return { problems, painted, top, bottom, left, right };
}

/**
 * Check a hairstyle.
 *
 * Deliberately silent about **shape**: length, parting, volume, whether it covers
 * an ear and whether it hangs on the left are the drawing's business, exactly as
 * commissioner ruling R2 left a build's pose alone. What is checked is only what
 * another layer or the head beneath depends on.
 */
export function validateHairMask(keys: readonly number[]): readonly MaskProblem[] {
  const { width, height } = MASK_CANVAS;
  if (keys.length !== width * height) {
    return [{ severity: 'fail', message: `mask is ${String(keys.length)} cells, not ${String(width * height)}` }];
  }

  const { problems, painted, top, bottom } = hairPlateProblems(keys, 'hairstyle');
  if (painted === 0) return [{ severity: 'fail', message: 'the hairstyle is empty' }];
  const fail = (message: string): number => problems.push({ severity: 'fail', message });

  const { crown } = HAIR_REGISTRATION;
  if (top < crown.from || top > crown.to) {
    fail(
      `the hairstyle begins on row ${String(top)}, outside the crown band ${String(crown.from)}–` +
        `${String(crown.to)}. The skull's top is row ${String(HEAD.top)}: a style may rise off it, ` +
        'the way the curly one does, and it may start below it the way a receding one does — but a ' +
        'layer outside this band is drawn at the wrong offset rather than styled differently.',
    );
  }

  if (bottom > HAIR_REGISTRATION.floor) {
    fail(
      `the hairstyle reaches row ${String(bottom)}, below the floor at ${String(HAIR_REGISTRATION.floor)}. ` +
        'Long hair and a ponytail fall onto the shoulders; neither reaches a waistband.',
    );
  }

  const { opaque } = reader(keys);
  let onSkull = 0;
  for (let y = HEAD.top; y <= HEAD.bottom; y++) {
    for (let x = HEAD.left; x <= HEAD.right; x++) if (opaque(x, y)) onSkull++;
  }
  if (onSkull < HAIR_REGISTRATION.minimumOnSkull) {
    fail(
      `only ${String(onSkull)} pixels sit on the skull, against ${String(HAIR_REGISTRATION.minimumOnSkull)}. ` +
        'A hairstyle that floats beside the head is a hairstyle drawn to the wrong centre — the skull ' +
        `is columns ${String(HEAD.left)}–${String(HEAD.right)}, rows ${String(HEAD.top)}–${String(HEAD.bottom)}.`,
    );
  }

  const { minimum, maximum } = HAIR_REGISTRATION.coverage;
  if (painted < minimum) fail(`only ${String(painted)} pixels are painted; the smallest drawn style is 112`);
  if (painted > maximum) {
    fail(
      `${String(painted)} pixels are painted, over ${String(maximum)}. This is a whole figure, a ` +
        'background, or a hairstyle drawn at the wrong scale.',
    );
  }

  return problems;
}

/**
 * Check a facial-hair piece.
 *
 * The mouth band is the check that distinguishes a beard from a hairstyle, and it
 * is why this is a separate function rather than a parameter: every one of the four
 * drawn pieces puts at least 50 pixels across the mouth, and nothing that does not
 * is facial hair.
 */
export function validateFacialHairMask(keys: readonly number[]): readonly MaskProblem[] {
  const { width, height } = MASK_CANVAS;
  if (keys.length !== width * height) {
    return [{ severity: 'fail', message: `mask is ${String(keys.length)} cells, not ${String(width * height)}` }];
  }

  const { problems, painted, top, bottom, left, right } = hairPlateProblems(keys, 'beard');
  if (painted === 0) return [{ severity: 'fail', message: 'the facial hair is empty' }];
  const fail = (message: string): number => problems.push({ severity: 'fail', message });

  const reg = FACIAL_HAIR_REGISTRATION;

  if (top < reg.top) {
    fail(
      `the facial hair begins on row ${String(top)}, above ${String(reg.top)}. A beard starts below the ` +
        `brow at row ${String(FACE.browY)} — a layer that reaches it is a hairstyle submitted as facial hair.`,
    );
  }

  if (bottom > reg.floor) {
    fail(
      `the facial hair reaches row ${String(bottom)}, below ${String(reg.floor)}. A long beard falls onto ` +
        'the neck; the collar closes over the neck and would cut it off.',
    );
  }

  if (left < reg.columns.from || right > reg.columns.to) {
    fail(
      `the facial hair spans columns ${String(left)}–${String(right)}, outside ` +
        `${String(reg.columns.from)}–${String(reg.columns.to)}. It stays on the face.`,
    );
  }

  const { opaque } = reader(keys);
  let inBand = 0;
  for (let y = reg.mouthBox.from; y <= reg.mouthBox.to; y++) {
    for (let x = reg.mouthBox.left; x <= reg.mouthBox.right; x++) if (opaque(x, y)) inBand++;
  }
  if (inBand < reg.minimumInMouthBand) {
    fail(
      `only ${String(inBand)} pixels fall across the mouth, rows ${String(reg.mouthBox.from)}–` +
        `${String(reg.mouthBox.to)} and columns ${String(reg.mouthBox.left)}–${String(reg.mouthBox.right)}, ` +
        `against ${String(reg.minimumInMouthBand)}. Facial hair frames the mouth: a layer that does not ` +
        'is a hairstyle, sideburns nobody asked for, or a piece drawn too high.',
    );
  }

  if (painted < reg.coverage.minimum) fail(`only ${String(painted)} pixels are painted`);
  if (painted > reg.coverage.maximum) {
    fail(
      `${String(painted)} pixels are painted, over ${String(reg.coverage.maximum)}. The largest drawn ` +
        'piece is a full beard at 326.',
    );
  }

  return problems;
}
