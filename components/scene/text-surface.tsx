import { INK, TYPE, type TypeRole } from '@/lib/design/type';

/**
 * The printed surfaces.
 *
 * `components/scene/panel.tsx` holds the house *materials* — a panel, a plate, a
 * sign. This file holds the things made of paper: a sheet mounted on the wall, a
 * masthead, a printed rule, a stamp, a warning, a ledger. They are separate
 * because they answer a different question. A `PixelPanel` decides what a
 * surface is made of; these decide **how words sit on it**.
 *
 * ## Why not one card component
 *
 * Because the two surfaces this file serves are different objects in the world
 * and should stay different. The Slice is a newspaper: one sheet, printed rules,
 * nothing boxed off from anything else. The press desk is a proof sheet on a
 * clipboard: bordered ledgers, stamps, a plaque naming what is under it. Folding
 * both into a generic card would produce the *"functional web application wearing
 * pixel art"* the polish standard names, and it is the specific failure the
 * newspaper's own header warns about.
 *
 * What they share is **typography and spacing rhythm**, which is exactly what
 * these primitives carry: every one of them sets its type from a role in
 * `lib/design/type.ts` and nothing here names a font size.
 *
 * ## The material rule
 *
 * The frame may be rich; the reading field must be calm. Aging lives at the
 * edges — the mount, the corners, the rules — and never under body copy or a
 * score. A textured centre field is what made the homepage read as burnt, and
 * the same mistake on a page of prose is worse, because prose is what people are
 * actually trying to do with it.
 */

/* ========================================================================== *
 * The mount
 * ========================================================================== */

/**
 * A sheet of paper mounted on the wall.
 *
 * A dark outer frame, a few pixels of shadow gap, then the cream sheet — so the
 * paper reads as **an object in the room** rather than as a light rectangle the
 * page happens to be. The old Slice was a bare `PixelPanel` floating on the
 * dimmed parlor, which at 360 put cream directly against the counter's
 * red-and-white checker with nothing between them.
 *
 * The corner brackets are the mounting. Four hard 2px angles in the frame's own
 * wood, drawn *over* the gap so they read as holding the sheet down. They are
 * decoration with a job: without them the frame is a border, and a border around
 * a page is a card.
 */
export function MountedSheet({
  children,
  className = '',
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      /*
       * `#191012` is one value step below the house `#1c1113`, and that is the
       * whole reason it is a second near-black rather than a reuse.
       *
       * The mount sits **behind** paper, and the plates that sit **on** the room
       * — `ReturnPlate`, `DeskExit`, a board-tone `PixelPanel` — are `#1c1113`.
       * One of those lands directly under the sheet on every desk screen, so at
       * the same value the frame and the plate under it merge into one dark
       * shape and the sheet stops reading as mounted on anything.
       */
      className="pixel-edge relative border-2 border-wood-dark bg-[#191012] p-[5px]"
      {...rest}
    >
      {/*
        * The four corners, over the mount rather than inside the paper.
        *
        * `aria-hidden` because they are the frame. A screen reader announcing
        * four empty corners before the masthead is the accessibility equivalent
        * of the visual noise this file exists to remove.
        */}
      <Bracket className="top-0 left-0 border-t-2 border-l-2" />
      <Bracket className="top-0 right-0 border-t-2 border-r-2" />
      <Bracket className="bottom-0 left-0 border-b-2 border-l-2" />
      <Bracket className="bottom-0 right-0 border-b-2 border-r-2" />

      <div className={`on-paper relative bg-paper-mid text-ink-900 ${className}`}>{children}</div>
    </div>
  );
}

function Bracket({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute h-[9px] w-[9px] border-wood-light ${className}`}
    />
  );
}

/* ========================================================================== *
 * Furniture
 * ========================================================================== */

/**
 * A printed rule. The only separator a sheet of paper has.
 *
 * Three weights, and the weight is the hierarchy: `hair` divides rows inside one
 * list, `rule` divides sections, `heavy` closes a masthead or opens a colophon.
 * A border on a box would divide the same things and would turn the page into a
 * stack of cards, which is the thing the Slice is written against.
 */
export function PrintedRule({ weight = 'rule' }: { weight?: 'hair' | 'rule' | 'heavy' }) {
  const weights = {
    hair: 'h-px bg-ink-900/25',
    rule: 'h-[2px] bg-ink-900/30',
    heavy: 'h-[3px] bg-red-dark',
  } as const;
  return <div aria-hidden="true" className={`w-full ${weights[weight]}`} />;
}

/**
 * A section label, sitting directly under its rule.
 *
 * The newspaper convention, and the one piece of furniture a reader actually
 * navigates by. It takes an accent ink on paper — the section labels are the
 * paper's own red — and the surface passes it in, because the same role is
 * `ink-500` on the desk where red would mean *refused*.
 */
export function SectionHeading({
  children,
  ink = 'text-red-dark',
}: {
  children: React.ReactNode;
  /** Defaults to the paper's own red. `INK.paper.quiet` on the desk. */
  ink?: string;
}) {
  return <h2 className={`${TYPE.sectionHeading} ${ink}`}>{children}</h2>;
}

/**
 * A metadata strip: a dateline, a draft identifier, a colophon.
 *
 * Tabular figures, because these lines are mostly numbers that stack — two
 * drafts of the same week should have their version numbers in the same column.
 */
export function MetadataStrip({
  children,
  className = '',
  ink = INK.paper.quiet,
  role = 'metadata',
}: {
  children: React.ReactNode;
  className?: string;
  ink?: string;
  /**
   * `metadata` unless the strip is a machine string.
   *
   * Typed as a `TypeRole`, so a surface can only ask for a role that exists —
   * the same guarantee `colour-tokens.test.ts` had to be written to get for
   * colours, which Tailwind gives silently and wrongly.
   */
  role?: Extract<TypeRole, 'metadata' | 'machine' | 'eyebrow'>;
}) {
  return <p className={`${TYPE[role]} ${ink} ${className}`}>{children}</p>;
}

/**
 * A dark plaque naming what is underneath it.
 *
 * `As it will print` used to be a cream `SignPlate`, and at 360 the words landed
 * across the counter's checker. A plaque carries its own ground and is dark, so
 * it separates from the paper below it in the one direction the paper cannot go.
 */
export function Plaque({
  children,
  tone = 'wood',
}: {
  children: React.ReactNode;
  tone?: 'wood' | 'stop';
}) {
  /*
   * `#2a1a12` is varnished wood rather than enamel — warmer and lighter than the
   * mount behind it, so a plaque naming the sheet below it does not read as a
   * hole cut in the frame.
   */
  const tones = {
    wood: 'border-wood-light bg-[#2a1a12] text-paper-mid',
    stop: 'border-red-mid bg-red-dark text-paper-white',
  } as const;
  return (
    <span
      className={`pixel-edge inline-flex items-center border-2 px-3 py-1.5 ${TYPE.stamp} ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/* ========================================================================== *
 * The masthead
 * ========================================================================== */

/**
 * The paper's nameplate, as printed lines.
 *
 * One constant, because the rack, the empty rack and the commissioner's preview
 * all print the same masthead and three copies of a title is how two of them end
 * up saying something slightly different.
 */
export const SLICE_MASTHEAD = ['Tony\u2019s', 'Tuesday Slice'] as const;

/**
 * The paper's own nameplate.
 *
 * Heavy rule, name, hairline, dateline, heavy rule — which is what a masthead
 * is, and the reason it cannot be a `<h1>` with a border: the rules above and
 * below are what stop a display-face string at the top of a panel from reading
 * as a page title.
 *
 * **The name is broken into deliberate lines by the caller.** `TONY’S TUESDAY
 * SLICE` at 26px Silkscreen is 361px, wider than the text column of every width
 * this product supports — and at 22px it is 306px, which fits at 390 and does
 * not at 360. So the nameplate was one line or two depending on the handset,
 * broken wherever the browser picked. Choosing the break is what makes it a
 * nameplate rather than a wrapped string, and it is the caller's choice because
 * only the caller knows the words.
 */
export function PressMasthead({
  title,
  dateline,
  stamp = null,
  flag = null,
}: {
  /** The nameplate, one entry per printed line. */
  title: readonly string[];
  dateline: string;
  /** A stamp somebody pressed onto an old copy — `Last one Tony printed`. */
  stamp?: string | null;
  /** What kind of week this is, when it is not an ordinary one. */
  flag?: string | null;
}) {
  return (
    <header>
      <PrintedRule weight="heavy" />
      <h1 className={`mt-2.5 text-center ${TYPE.masthead} text-red-dark`}>
        {title.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </h1>
      <div aria-hidden="true" className="mt-2 h-px bg-ink-900/35" />

      {/*
        * The dateline alone. The price is not here — they shared this row once,
        * the row wrapped at 390, and `FREE WITH ANY SLICE` landed under the date
        * reading as a third clause of it. A masthead answers two questions:
        * which paper, which week.
        */}
      <MetadataStrip className="mt-1.5 text-center">{dateline}</MetadataStrip>

      {/*
        * The flag: playoffs, the championship. It is a property of the *week*
        * rather than of the story, so it belongs in the masthead beside the date
        * and not in the headline, where it would eat the words that say what
        * happened.
        */}
      {flag !== null && (
        <p className="mt-2 text-center">
          <span
            className={`inline-block border-2 border-red-dark bg-red-dark px-2.5 py-[3px] ${TYPE.eyebrow} text-paper-white`}
          >
            {flag}
          </span>
        </p>
      )}

      <div aria-hidden="true" className="mt-2.5">
        <PrintedRule weight="heavy" />
      </div>

      {stamp !== null && (
        <p className={`mt-2.5 text-center ${TYPE.eyebrow} text-wood-mid`}>{stamp}</p>
      )}
    </header>
  );
}

/* ========================================================================== *
 * Scores
 * ========================================================================== */

/**
 * The score line under a headline.
 *
 * Its own rules above and below, because it is the one line a reader scans for
 * and prose either side of it would swallow it. Tabular figures so two decks
 * stacked in a list line up on the decimal.
 *
 * It formats nothing. `MANDATE §9`: the interface never derives a fantasy fact,
 * and *rounding a score* derives one — which is why the string arrives already
 * validated against the fact packet.
 */
export function ScoreDeck({ children }: { children: React.ReactNode }) {
  return (
    <p
      className={`mt-2.5 border-y-2 border-ink-900/25 py-1.5 ${TYPE.scoreDeck} text-ink-900`}
      data-slice-deck=""
    >
      {children}
    </p>
  );
}

/* ========================================================================== *
 * Warnings
 * ========================================================================== */

/**
 * The warning glyph, drawn rather than typed.
 *
 * A `!` in the body face at a large size is a character in a paragraph; this is
 * an **object**. It is two filled rectangles on whole pixels inside a bordered
 * square — no rotation, because a rotated square resamples its own edges, and no
 * icon font, because the product has two faces and neither is one.
 *
 * The shape is the pixel-art convention: a tall bar, a gap, a square dot.
 */
export function WarningGlyph({ tone = 'stop' }: { tone?: 'stop' | 'go' }) {
  const tones = {
    stop: 'border-red-mid bg-red-dark',
    go: 'border-blue-mid bg-blue-deep',
  } as const;
  const mark = tone === 'stop' ? 'bg-paper-white' : 'bg-blue-neon';

  return (
    <span
      aria-hidden="true"
      className={`pixel-edge relative inline-block h-[30px] w-[30px] shrink-0 border-2 ${tones[tone]}`}
    >
      <span className={`absolute top-[4px] left-[11px] h-[12px] w-[4px] ${mark}`} />
      <span className={`absolute top-[19px] left-[11px] h-[4px] w-[4px] ${mark}`} />
    </span>
  );
}

/**
 * A block that says something is stopped, and why.
 *
 * Glyph, title, then the sentence about what happens next — in that order,
 * because the first question is *what state is this in* and the second is *what
 * do I do*. The left bar is the paper convention for a standing note; the
 * ground is tinted a half-step so the block separates from the sheet without
 * becoming a card sitting on it.
 */
export function WarningBlock({
  tone = 'stop',
  title,
  children,
  ...rest
}: {
  tone?: 'stop' | 'go' | 'quiet';
  title: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const tones = {
    stop: { edge: 'border-red-dark', wash: 'bg-red-dark/8', ink: 'text-red-dark' },
    go: { edge: 'border-blue-mid', wash: 'bg-blue-mid/8', ink: 'text-blue-deep' },
    quiet: { edge: 'border-ink-900/40', wash: 'bg-ink-900/5', ink: 'text-ink-900' },
  } as const;
  const skin = tones[tone];

  return (
    <div className={`border-l-[5px] ${skin.edge} ${skin.wash} py-2.5 pr-3 pl-3`} {...rest}>
      <div className="flex items-start gap-2.5">
        {tone !== 'quiet' && <WarningGlyph tone={tone === 'stop' ? 'stop' : 'go'} />}
        <div className="min-w-0 flex-1">
          <p className={`${TYPE.warningTitle} ${skin.ink}`}>{title}</p>
          <div className={`mt-1.5 ${TYPE.warningBody} ${INK.paper.body}`}>{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== *
 * Ledgers
 * ========================================================================== */

/**
 * A bordered ledger: what failed, and the exact value that failed it.
 *
 * The validator's findings used to be a bulleted list with the kind, the value
 * and the reason run together in one line of mixed sizes, so *"what exactly did
 * it object to"* — the only reason to read the list — had to be parsed out of a
 * sentence. A ledger answers it by geometry: keys down the left, values down the
 * right, right-aligned so the numbers stack, and a rule between findings so two
 * of them are visibly two.
 */
export function Ledger({
  children,
  ...rest
}: { children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="border-2 border-ink-900/30 bg-paper-white/45" {...rest}>
      {children}
    </div>
  );
}

/**
 * One line of a ledger.
 *
 * The value is right-aligned and never wraps — a number that breaks across two
 * lines stops being a number.
 *
 * ## Two columns, not a flex row that wraps
 *
 * The first version was `flex flex-wrap justify-between`, which drops the value
 * onto its own line when the pair no longer fits. On the Slice's board that
 * produced *one* stacked row in four — `Brandon over Cheese` is nineteen
 * characters and every other matchup that week was shorter — so a reader saw
 * three rows of one shape and a fourth of another, which reads as a defect
 * rather than as a decision. Broken spacing is broken spacing whether or not
 * the mechanism was deliberate (`VISUAL_ACCEPTANCE §4`).
 *
 * A grid keeps the two columns for every row: the value column takes exactly
 * what it needs, and a long label **wraps inside its own cell** rather than
 * pushing the number off the line. That is also the right priority when a
 * *violation's* value is the long one — the value is the reason the row exists.
 */
export function LedgerRow({
  label,
  value = null,
  kind = 'key',
  children,
  ...rest
}: {
  label: React.ReactNode;
  /** The exact thing that failed, or the score. Right-aligned, tabular, unwrapped. */
  value?: React.ReactNode;
  /**
   * What the left column holds.
   *
   * `key` is a machine word — a violation kind, a token name — so it is set as
   * signage. `name` is a person or a matchup, which is prose and must not be
   * uppercased: a league where somebody is called `MATTY B` on the results board
   * and `Matty B` everywhere else has two names for one manager.
   */
  kind?: 'key' | 'name';
  /** The sentence underneath, when the row needs one. */
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const label_ =
    kind === 'key'
      ? `${TYPE.ledgerLabel} ${INK.paper.quiet}`
      : `min-w-0 ${TYPE.bodyCompact} ${INK.paper.strong}`;

  return (
    <div className="border-b-2 border-ink-900/20 px-3 py-2.5 last:border-b-0" {...rest}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3">
        <span className={label_}>{label}</span>
        {value !== null && (
          <span
            className={`text-right whitespace-nowrap ${TYPE.ledgerValue} ${INK.paper.strong}`}
          >
            {value}
          </span>
        )}
      </div>
      {children !== undefined && (
        <p className={`mt-1 ${TYPE.ledgerNote} ${INK.paper.body}`}>{children}</p>
      )}
    </div>
  );
}
