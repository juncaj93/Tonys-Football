import {
  Ledger,
  LedgerRow,
  MetadataStrip,
  MountedSheet,
  PressMasthead,
  PrintedRule,
  ScoreDeck,
  SectionHeading,
  SLICE_MASTHEAD,
} from '@/components/scene/text-surface';
import { TYPE } from '@/lib/design/type';
import { type Edition } from '@/lib/slice/render';

/**
 * One issue of the Slice, printed.
 *
 * ## Why this is a sheet of paper and not a stack of panels
 *
 * The first version was a `SignPlate`, a `PixelPanel` and a bullet list, which is
 * the shape of every other interior screen in the shop. It printed the right
 * words and it read as a settings page. A newspaper is *one surface* — masthead,
 * rules, columns, a board of results, all on the same sheet — and the single
 * strongest signal that you are holding one is that nothing is boxed off from
 * anything else.
 *
 * So: one paper sheet, and every section separated by a **printed rule** rather
 * than by a border or a card. The rules are the layout.
 *
 * ## The sheet is mounted now, and that is the visual change
 *
 * It used to be a bare cream panel floating on the dimmed parlor — at 360 the
 * paper's own edge sat directly against the counter's red-and-white checker with
 * nothing between them, so the sheet read as a light rectangle the page happened
 * to have rather than as a thing on the wall. `MountedSheet` puts a dark frame
 * and four corner brackets around it.
 *
 * All of the material lives in that frame. **The reading field is flat cream and
 * stays flat cream** — no texture, no vignette, no dither under a paragraph or a
 * score. That is the same ruling the homepage slice applied to the Tonight
 * board, for the same reason, and it matters more here because this surface is
 * read rather than glanced at.
 *
 * ## Hierarchy, from roles rather than from sizes
 *
 * Every line on this page names a role in `lib/design/type.ts`. There is no
 * font size in this file, which is what stops the paper drifting a pixel at a
 * time — it did, from ten distinct sizes on one sheet.
 *
 * ## Every number on this page came out of the packet
 *
 * The component does no arithmetic and no formatting of its own — scores arrive
 * as strings already validated against the fact packet. `MANDATE §9`: the
 * interface never derives a fantasy fact for itself, and *rounding a score* is
 * deriving one. That is why `RenderedScore` carries `leftPoints: string`.
 *
 * The two maps below are the only thing this file decides, and neither is a
 * fact: they are **presentation maps over an enum the renderer already
 * computed**, in the same shape as `STATUS_WORD` on the press desk.
 */

/**
 * How loud the front page is allowed to be.
 *
 * **Strong news versus weak news, as type rather than as intention.** A quiet
 * edition used to be set at the same size a championship gets, so the two most
 * different issues the paper can print looked identical from across the room —
 * and the whole point of `EditionCharacter` is that the *data* decides, not
 * somebody's judgement on the week.
 *
 * Three steps, not six. A separate size per character would be a decision to make
 * every week and the paper would drift.
 */
const HEADLINE_ROLE: Record<Edition['character'], string> = {
  title: TYPE.headlineLoud,
  record: TYPE.headlineLoud,
  loud: TYPE.headlineLoud,
  ordinary: TYPE.headline,
  quiet: TYPE.headlineQuiet,
  empty: TYPE.headlineQuiet,
};

/**
 * The masthead flag: what kind of week this is, when it is not an ordinary one.
 *
 * `18` and `16 §38` both want a championship issue to be recognisable as one
 * before a word of it is read, and it was not: the title week and a Tuesday in
 * October printed the same nameplate, and the only difference was the size of
 * the headline underneath.
 *
 * It reads `character`, which the **renderer** derived from the packet — this
 * component does not decide what kind of week it was, it prints the answer.
 * Playoff weeks are already carried by the dateline the renderer built
 * (`datelineOf`), so nothing here parses a fact string to find out.
 */
const MASTHEAD_FLAG: Record<Edition['character'], string | null> = {
  title: 'The championship',
  record: 'For the record',
  loud: null,
  ordinary: null,
  quiet: null,
  empty: null,
};

export function Newspaper({ issue, stamp = null }: { issue: Edition; stamp?: string | null }) {
  return (
    <MountedSheet className="px-4 pt-3.5 pb-4" data-slice-paper="">
      <PressMasthead
        title={SLICE_MASTHEAD}
        dateline={issue.dateline}
        stamp={stamp}
        flag={MASTHEAD_FLAG[issue.character]}
      />

      {issue.nothingToPrint === null ? (
        <>
          <article className="mt-4" data-slice-lede="">
            <h1 className={`${HEADLINE_ROLE[issue.character]} text-ink-900`}>{issue.headline}</h1>

            {/*
              * The score, under the headline, with its own rules above and below.
              * It is the one line a reader scans for, so prose either side of it
              * would swallow it.
              */}
            {issue.deck !== null && <ScoreDeck>{issue.deck}</ScoreDeck>}

            <p className={`mt-3 ${TYPE.bodyLead} text-ink-700`}>{issue.body}</p>
          </article>

          {issue.secondary.length > 0 && (
            <Section label="Also this week" weight="heavy">
              <div className="mt-2.5 space-y-4">
                {issue.secondary.map((story) => (
                  <article key={story.headline}>
                    <h2 className={`${TYPE.headlineQuiet} text-ink-900`}>{story.headline}</h2>
                    {/*
                      * The deck sits under its headline and below it in weight.
                      * Both were 17px display at first, so a secondary story had
                      * a score line as loud as the words above it and no
                      * hierarchy at all — visible only once three of them
                      * stacked on a championship issue.
                      */}
                    {story.deck !== null && (
                      <p className={`mt-1.5 ${TYPE.metadata} text-ink-500`}>{story.deck}</p>
                    )}
                    <p className={`mt-1.5 ${TYPE.body} text-ink-700`}>{story.body}</p>
                  </article>
                ))}
              </div>
            </Section>
          )}

          {issue.scoreboard.length > 0 && (
            <Section
              label="The board"
              data-slice-board=""
              /*
               * Closes the lead only when nothing came between. An issue with no
               * secondary story goes straight from the lede to the board, and the
               * board is then the first thing after it.
               */
              weight={issue.secondary.length === 0 ? 'heavy' : 'rule'}
            >
              {/*
                * Every game of the week, whether or not it was a story.
                *
                * This is the part that makes it a newspaper rather than a feed:
                * the old Slice reported the two games the fact layer had an
                * opinion about and silently dropped the other three, so three of
                * ten managers never appeared in their own week.
                *
                * A `Ledger`, because that is what a results board is — a key on
                * the left, a number on the right, one rule between rows. It used
                * to be a bare list whose scores were set two pixels smaller than
                * the names beside them, so the column a reader is actually
                * scanning was the quietest thing in it.
                */}
              <div className="mt-2.5">
                <Ledger>
                  {issue.scoreboard.map((row) => (
                    <LedgerRow
                      key={row.key}
                      kind="name"
                      data-slice-score=""
                      label={
                        <>
                          <span className={row.leftWon ? 'text-ink-900' : 'text-ink-700'}>
                            {row.leftName}
                          </span>
                          {/*
                            * `over` is a claim about who won, so a drawn game
                            * cannot use it. It did: `leftWon` is false on a tie
                            * and the board printed *"A over B"* for a game
                            * neither side won. `RenderedScore` has carried
                            * `tie` since it was written.
                            */}
                          <span className="text-ink-500">{row.tie ? ' ties ' : ' over '}</span>
                          <span className="text-ink-700">{row.rightName}</span>
                        </>
                      }
                      value={
                        <>
                          {/*
                            * The winner's score is the display face's **real**
                            * 700, not a synthetic one. VT323 ships at 400 only,
                            * so bolding a name would have the browser smear the
                            * glyphs — which on a pixel face is the blurry type
                            * the whole art direction is written against. Which
                            * side won is carried by the word between the names;
                            * this is reinforcement.
                            */}
                          <span className={row.leftWon ? 'font-display font-bold' : ''}>{row.leftPoints}</span>
                          {/*
                            * The separator gets room on both sides.
                            *
                            * `131.84–123.38` set tight reads as one nine-figure
                            * number at a glance, which is the opposite of what a
                            * results board is for — the reader is comparing two
                            * quantities and the first thing they need is to see
                            * that there *are* two.
                            *
                            * Margin rather than spaces in the string: the value
                            * is `whitespace-nowrap`, so two space characters
                            * would widen the unbreakable column by two full
                            * glyphs of a wide pixel face and push the names on a
                            * 360 screen. 3px a side buys the separation for a
                            * fifth of the cost.
                            */}
                          <span className="mx-[3px] text-ink-500">&ndash;</span>
                          <span className={!row.leftWon && !row.tie ? 'font-display font-bold' : ''}>
                            {row.rightPoints}
                          </span>
                        </>
                      }
                    />
                  ))}
                </Ledger>
              </div>
            </Section>
          )}
        </>
      ) : (
        <p className={`mt-4 ${TYPE.bodyLead} text-ink-700`}>{issue.nothingToPrint}</p>
      )}

      <Section label="From behind the counter">
        {/*
          * Tony's column takes the **dialogue** role, not body.
          *
          * It is the one paragraph on the sheet that is somebody talking rather
          * than the paper reporting, and it was set at body size in italics —
          * which on a page of body-size prose makes it a footnote. `16 §9` is
          * specific that the column is Tony *in his own voice*, and a voice on
          * this page should be the second-largest thing a reader meets.
          */}
        <p className={`mt-2 ${TYPE.dialogue} text-ink-700 italic`}>{issue.column}</p>
      </Section>

      {/*
        * How the paper was made, printed on the paper.
        *
        * `MANDATE §9`–`§10` require a fantasy fact to carry its provenance. One
        * line at the bottom where a colophon goes, because it is a fact about the
        * paper and not an apology for it — and it was three lines of small caps
        * plus a fourth for the price, four rows of furniture under a sheet whose
        * lead story is two sentences long.
        *
        * The provenance clause drops on an empty rack, where *"every number
        * checked"* would sit under a page with no numbers on it — true and
        * incoherent.
        */}
      <div className="mt-5">
        <PrintedRule weight="heavy" />
      </div>
      <MetadataStrip className="mt-2">
        {issue.nothingToPrint === null
          ? 'Set from the league’s own records · free with any slice'
          : 'Free with any slice'}
      </MetadataStrip>
    </MountedSheet>
  );
}

/**
 * A section of the sheet: a rule, a label under it, then the section.
 *
 * The three of them travel together on every section of the paper, and they were
 * being assembled by hand each time — which is how one of them ended up with
 * `mt-5` and the next with `mt-4` for no reason anybody could state.
 */
function Section({
  label,
  children,
  /**
   * `heavy` on the **first** section only, to close the lead.
   *
   * Every section used the same rule, so a reader met four equal chunks and had
   * to work out from the words which one was the story. A newspaper answers that
   * with furniture: the lead runs under the masthead and a heavier rule says it
   * is over. `PrintedRule`'s own contract already reserves `heavy` for exactly
   * this — *"closes a masthead or opens a colophon"* — and this is the third
   * place on the sheet where something closes.
   */
  weight = 'rule',
  ...rest
}: {
  label: string;
  children: React.ReactNode;
  weight?: 'rule' | 'heavy';
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className="mt-6" {...rest}>
      <PrintedRule weight={weight} />
      <div className="mt-2">
        <SectionHeading>{label}</SectionHeading>
      </div>
      {children}
    </section>
  );
}
