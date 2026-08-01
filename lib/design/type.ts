/**
 * The type case.
 *
 * Every piece of text in this product is set from one of the roles below. A
 * component names the *job* the words are doing — a section heading, a ledger
 * value, a warning title — and the role decides the face, the size, the leading,
 * the tracking and the casing. Nothing outside this file chooses a font size.
 *
 * ## Why a role system rather than a scale
 *
 * A scale (`sm`, `base`, `lg`) is a set of sizes with no opinion about what they
 * are for, so every new surface re-decides. That is how this product ended up
 * with **sixteen distinct font sizes across two hundred and sixteen call
 * sites**, seven of them at 8 or 9 pixels, on a phone, in a product whose rule
 * is that readability wins (`VISUAL_ACCEPTANCE §7`). Nobody chose that; it
 * accumulated, one plausible local decision at a time.
 *
 * A role cannot accumulate the same way. There is one section heading in this
 * product and it is this one. Changing how a section heading reads is a change
 * to one line here, and it lands everywhere at once — which is the property the
 * old code did not have, and the reason a "raise the small type" pass had to be
 * done three times and was still not finished.
 *
 * ## Six sizes, and why the two faces do not share them
 *
 * `13 · 15 · 17 · 19 · 22 · 26`, down from sixteen.
 *
 * The two faces are not interchangeable at a given size, and the numbers below
 * are measured in the browser at the shipped weights rather than estimated:
 *
 * | px | Silkscreen cap | Silkscreen advance | VT323 cap | VT323 advance |
 * |---|---|---|---|---|
 * | 13 | 8 | 8.94 | 7 | 5.20 |
 * | 15 | 10 | 10.31 | 8 | 6.00 |
 * | 17 | 11 | 11.69 | 10 | 6.80 |
 * | 19 | 12 | 13.06 | 11 | 7.60 |
 * | 22 | 14 | 15.13 | 13 | 8.80 |
 * | 26 | 16 | 17.88 | 15 | 10.40 |
 *
 * Two things follow, and both shape the roles.
 *
 * **Silkscreen reads a size larger.** Its capitals at 15px are exactly as tall
 * as VT323's at 17px, so a 15px section heading and a 17px paragraph are the
 * same apparent size — which is why the display roles sit lower on the number
 * line than the body roles and still mean the same thing to a reader.
 *
 * **Silkscreen is half again as wide per character.** 10.31px against 6.00px at
 * the same nominal size, so a display role is only ever short: a badge, a key, a
 * heading. A sentence in the display face runs out of a 360px phone in about
 * twenty-six characters, which is how the press desk ended up with a 12px
 * metadata line nobody could read — the size was chosen to make the *string* fit
 * rather than to make the words legible.
 *
 * That is also why **nothing here is fractional and nothing here is fluid.** No
 * `clamp()`, no `rem` scaling, no viewport units. Both faces are pixel faces:
 * a size that lands between two device pixels resamples the glyph grid and the
 * type goes soft, which is the same defect the art pipeline spends its whole
 * existence avoiding (`docs/HOMEPAGE_CLEANLINESS_BOUNDARY.md`). Sizes are whole
 * pixels, chosen per role, and a role that genuinely needs to change at a
 * narrower width says so with a `max-[…]` step to another whole pixel size.
 *
 * ## What a role does not decide
 *
 * **Colour.** This room has two grounds — cream paper and dark enamel — and the
 * same role is `ink-700` on one and `paper-mid` on the other. Baking a colour
 * into the role would either be wrong on half the surfaces or would need a
 * variant per ground, which is a second axis of the same accumulation problem.
 * `INK` below names the default relationship for each ground so a surface picks
 * from a short list rather than inventing one, and `VISUAL_ACCEPTANCE §4`'s
 * "text the same colour as the surface under it" stays a reviewer gate.
 *
 * **Layout.** Margins, widths and gaps belong to the surface. A role that
 * carried `mt-2` would be a component.
 */

/**
 * The whole size vocabulary, as numbers, so a test can assert the count.
 *
 * Exported for `lib/design/type.test.ts`, which fails the build if a role
 * introduces a seventh size. That is the guard that keeps this from drifting
 * back — the roles can be renamed and re-purposed freely, but the moment one of
 * them needs a size that is not on this list, somebody has to decide whether the
 * vocabulary really should grow.
 */
export const TYPE_SIZES = [13, 15, 17, 19, 22, 26] as const;

/**
 * The floor, in pixels, for any text this product renders.
 *
 * 13 is not a compromise on `MANDATE §6`'s 16–18px body rule: that rule is about
 * **body copy**, which is set in VT323 at 17 and 19 here and never below. 13 is a
 * Silkscreen size — 8px capitals, twenty-four device pixels on the phone this
 * product is designed for — and the three roles that use it print a badge, a
 * ledger key or a dateline. Nothing sets a sentence at 13.
 *
 * `scripts/visual-qa.mts` measures the **computed** size of every rendered text
 * node against this number, which is the half of the rule a static scan cannot
 * reach: an inherited size, a size set by a stylesheet, or a size that only
 * appears in one state.
 */
export const TYPE_FLOOR_PX = 13;

/**
 * The roles.
 *
 * Ordered by the shape of a page — the loudest thing first, the furniture last —
 * rather than alphabetically, because the order is itself the hierarchy and a
 * new role has to be placed in it.
 */
export const TYPE = {
  /* --- The loud end ------------------------------------------------------ */

  /**
   * A newspaper's nameplate. The one thing on the page allowed to be this big.
   *
   * It is set in **two deliberate lines** rather than one, and that is a
   * measurement rather than a flourish: `TONY’S TUESDAY SLICE` is twenty
   * characters, which at 26px Silkscreen is 361px — wider than the text column
   * of any phone this product supports, and wider than it at 22px too (306px
   * against a 290px column at 360). It has therefore *always* wrapped, at some
   * arbitrary point the browser chose, and the fix is not to shrink the
   * letterforms until the browser stops. `TONY’S` over `TUESDAY SLICE` is 107px
   * over 232px, fits every width, and is what a nameplate does anyway.
   */
  masthead: 'font-display text-[26px] leading-[1.06] tracking-[0.02em] uppercase',

  /**
   * The lead headline, at full volume — a championship, a record, a blowout.
   *
   * The three headline roles are one decision made by the *data*
   * (`Edition['character']`), not three sizes somebody picks per week. A quiet
   * edition set at the same size as a title week is the paper losing the ability
   * to say anything by being loud about everything.
   */
  headlineLoud: 'font-display text-[26px] leading-[1.12] break-words uppercase',

  /** The lead headline on an ordinary week. */
  headline: 'font-display text-[22px] leading-[1.18] break-words uppercase',

  /** The lead headline when the week gave the paper very little. */
  headlineQuiet: 'font-display text-[19px] leading-[1.25] break-words uppercase',

  /** A secondary story's headline, or a heading inside a section. */
  subhead: 'font-display text-[17px] leading-[1.25] uppercase',

  /* --- Signage ----------------------------------------------------------- */

  /**
   * A surface naming itself: `PanelHeading`, a door's title, a room's sign.
   *
   * Letterspaced and uppercase because it is painted signage rather than a web
   * heading — the distinction `components/scene/panel.tsx` was built to keep.
   */
  sign: 'font-display text-[17px] leading-[1.35] tracking-[0.03em] uppercase',

  /**
   * A section label under a printed rule.
   *
   * Was 10px on the first Slice, and 12px on the press desk. Furniture is what a
   * reader navigates by, and unreadable furniture is worse than none.
   */
  sectionHeading: 'font-display text-[15px] leading-[1.45] tracking-[0.1em] uppercase',

  /**
   * The smallest identifier the product has: a badge, a plate, a ledger key.
   *
   * One or two words, always uppercase, never a sentence. Every 8, 9, 10 and
   * 11px call site in the product resolved here.
   */
  eyebrow: 'font-display text-[13px] leading-[1.5] tracking-[0.08em] uppercase',

  /** A status stamp pressed onto paper. Wider tracking than an eyebrow, and larger. */
  stamp: 'font-display text-[15px] leading-[1.4] tracking-[0.12em] uppercase',

  /** A button, a form action, a way out. */
  action: 'font-display text-[15px] leading-[1.5] tracking-[0.06em] uppercase',

  /* --- Reading ----------------------------------------------------------- */

  /** The paragraph under a headline, and anything a manager is meant to read first. */
  bodyLead: 'font-sans text-[19px] leading-[1.45]',

  /** Body copy. The single most-used role in the product. */
  body: 'font-sans text-[17px] leading-[1.5]',

  /** Body copy inside a list or a dense panel, where 1.5 leading opens the block up too far. */
  bodyCompact: 'font-sans text-[17px] leading-[1.4]',

  /** Tony, and anybody else who speaks. Set larger than body: it is a voice, not a notice. */
  dialogue: 'font-sans text-[19px] leading-[1.45]',

  /* --- Numbers and records ----------------------------------------------- */

  /**
   * A score line under a headline — the deck.
   *
   * Display face with tabular figures, because it is scanned rather than read
   * and the digits have to sit in columns when two decks stack.
   */
  scoreDeck: 'font-display text-[19px] leading-[1.35] tabular-nums',

  /** A score inside a board row, where the names carry the width. */
  score: 'font-display text-[17px] leading-[1.4] tabular-nums',

  /** The left column of a ledger: what the number is. */
  ledgerLabel: 'font-display text-[13px] leading-[1.45] tracking-[0.08em] uppercase',

  /** The right column of a ledger: the number itself. Aligned right by the surface. */
  ledgerValue: 'font-display text-[17px] leading-[1.4] tabular-nums',

  /** The sentence under a ledger row that explains it. */
  ledgerNote: 'font-sans text-[17px] leading-[1.45]',

  /* --- Warnings ---------------------------------------------------------- */

  /**
   * The title of a block that stops something from happening.
   *
   * Bigger than a section heading on purpose. *"Blocked by the check"* is the
   * answer to the only question the screen is being opened to ask, and it was
   * set four pixels smaller than the body copy underneath it.
   */
  warningTitle: 'font-display text-[17px] leading-[1.35] tracking-[0.04em] uppercase',

  /** What to do about it. */
  warningBody: 'font-sans text-[17px] leading-[1.5]',

  /* --- Furniture --------------------------------------------------------- */

  /** A dateline, a draft identifier, a colophon. Tabular so identifiers align. */
  metadata: 'font-display text-[13px] leading-[1.5] tracking-[0.04em] uppercase tabular-nums',

  /** A hash, a slug, a machine string. Breaks anywhere, because it has to. */
  machine: 'font-display text-[13px] leading-[1.5] tracking-[0.02em] break-all',
} as const;

/** A role's name. Exported so a surface can take one as a prop. */
export type TypeRole = keyof typeof TYPE;

/**
 * The default ink for each role's home ground.
 *
 * Two grounds, named for what they are made of rather than for light and dark,
 * because that is how the room talks about them.
 *
 * This is a **default relationship**, not an enforcement. A surface may reach
 * past it — the newspaper's section labels are `red-dark`, the warning title is
 * `red-dark` — and those are deliberate accents on top of a known baseline
 * rather than a colour picked from nothing.
 */
export const INK = {
  /** On cream: `paper-mid`, `paper-white`, any `PixelPanel tone="paper"`. */
  paper: {
    strong: 'text-ink-900',
    body: 'text-ink-700',
    quiet: 'text-ink-500',
  },
  /** On the dark room: `board`, `wood`, the parlor itself. */
  enamel: {
    strong: 'text-paper-white',
    body: 'text-paper-mid',
    quiet: 'text-ink-100',
  },
} as const;
