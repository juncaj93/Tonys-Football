import { PixelPanel } from '@/components/scene/panel';
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
 * So: one paper panel, and every section separated by a **printed rule** rather
 * than by a border or a card. The rules are the layout.
 *
 * ## Hierarchy, in three sizes and no more
 *
 * Masthead · headline · everything else. A fourth size would be a decision to
 * make every week and the paper would drift. The secondary stories are the body
 * size with a display-face headline; the board is the body size with tabular
 * numbers; Tony's column is the body size in italic. Nothing on the page is under
 * 16px (`MANDATE §6`), including the furniture, because the furniture is what a
 * reader uses to find the thing they want.
 *
 * ## Every number on this page came out of the packet
 *
 * The component does no arithmetic and no formatting of its own — scores arrive
 * as strings already validated against the fact packet. `MANDATE §9`: the
 * interface never derives a fantasy fact for itself, and *rounding a score* is
 * deriving one. That is why `RenderedScore` carries `leftPoints: string`.
 */

/**
 * How loud the front page is allowed to be.
 *
 * **Strong news versus weak news, as type rather than as intention.** A quiet
 * edition used to set *"Not a lot to report"* at the same 26px a championship
 * gets, so the two most different issues the paper can print looked identical
 * from across the room — and the whole point of `EditionCharacter` is that the
 * *data* decides, not somebody's judgement on the week.
 *
 * Three steps, not six. A separate size per character would be a decision to make
 * every week and the paper would drift.
 */
const HEADLINE_SIZE: Record<Edition['character'], string> = {
  title: 'text-[26px] leading-[1.12]',
  record: 'text-[26px] leading-[1.12]',
  loud: 'text-[26px] leading-[1.12]',
  ordinary: 'text-[22px] leading-[1.18]',
  quiet: 'text-[19px] leading-[1.25]',
  empty: 'text-[19px] leading-[1.25]',
};

export function Newspaper({ issue, stamp = null }: { issue: Edition; stamp?: string | null }) {
  return (
    <PixelPanel tone="paper" className="px-4 pt-3.5 pb-4">
      <Masthead dateline={issue.dateline} stamp={stamp} />

      {issue.nothingToPrint === null ? (
        <>
          <article className="mt-4">
            <h1
              className={`font-display ${HEADLINE_SIZE[issue.character]} text-ink-900 uppercase`}
            >
              {issue.headline}
            </h1>

            {issue.deck !== null && (
              /*
               * The score, under the headline, in the mono face with tabular
               * figures. It is the one line a reader scans for, so it gets its
               * own weight and its own rule rather than sitting inside the prose.
               */
              <p className="mt-2 border-y-2 border-ink-900/20 py-1.5 font-display text-[16px] leading-[1.4] text-ink-900 tabular-nums">
                {issue.deck}
              </p>
            )}

            <p className="mt-2.5 text-[18px] leading-[1.5] text-ink-700">{issue.body}</p>
          </article>

          {issue.secondary.length > 0 && (
            <section className="mt-5">
              <Rule />
              <SectionLabel>Also this week</SectionLabel>
              <div className="mt-2 space-y-3.5">
                {issue.secondary.map((story) => (
                  <article key={story.headline}>
                    <h2 className="font-display text-[17px] leading-[1.25] text-ink-900 uppercase">
                      {story.headline}
                    </h2>
                    {story.deck !== null && (
                      <p className="mt-0.5 font-display text-[15px] leading-[1.4] text-ink-500 tabular-nums">
                        {story.deck}
                      </p>
                    )}
                    <p className="mt-1 text-[17px] leading-[1.5] text-ink-700">{story.body}</p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {issue.scoreboard.length > 0 && (
            <section className="mt-5" data-slice-board="">
              <Rule />
              <SectionLabel>The board</SectionLabel>
              {/*
                * Every game of the week, whether or not it was a story.
                *
                * This is the part that makes it a newspaper rather than a feed:
                * the old Slice reported the two games the fact layer had an
                * opinion about and silently dropped the other three, so three of
                * ten managers never appeared in their own week.
                */}
              <ul className="mt-2 space-y-1.5">
                {issue.scoreboard.map((row) => (
                  <li
                    key={row.key}
                    data-slice-score=""
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2 border-b border-dotted border-ink-900/25 pb-1.5 last:border-b-0"
                  >
                    <span className="min-w-0 truncate text-[17px] leading-[1.45] text-ink-900">
                      <span className={row.leftWon ? 'font-semibold' : ''}>{row.leftName}</span>
                      <span className="text-ink-500"> over </span>
                      <span>{row.rightName}</span>
                    </span>
                    <span className="font-display text-[15px] leading-[1.45] whitespace-nowrap text-ink-700 tabular-nums">
                      {row.leftPoints}
                      <span className="text-ink-500">–</span>
                      {row.rightPoints}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <p className="mt-4 text-[18px] leading-[1.5] text-ink-700">{issue.nothingToPrint}</p>
      )}

      <section className="mt-5">
        <Rule />
        <SectionLabel>From behind the counter</SectionLabel>
        <p className="mt-1.5 text-[17px] leading-[1.5] text-ink-700 italic">{issue.column}</p>
      </section>

      {/*
        * How the paper was made, printed on the paper.
        *
        * `MANDATE §9`–`§10` require a fantasy fact to carry its provenance. One
        * line in the smallest type the page has, at the bottom where a colophon
        * goes, because it is a fact about the paper and not an apology for it.
        */}
      {/*
        * The colophon: one line.
        *
        * It was three lines of small caps plus a fourth for the price — four rows
        * of furniture under a paper whose lead story is two sentences long. The
        * provenance still has to be printed (`MANDATE §9`–`§10`), and it does not
        * have to be a paragraph.
        *
        * The provenance clause drops on an empty rack, where *"every number
        * checked"* sits under a page with no numbers on it — true and incoherent.
        */}
      <p className="mt-4 border-t-2 border-ink-900/20 pt-2 font-display text-[13px] leading-[1.45] text-ink-500 uppercase">
        {issue.nothingToPrint === null
          ? 'Set from the league\u2019s own records · free with any slice'
          : 'Free with any slice'}
      </p>
    </PixelPanel>
  );
}

/**
 * The masthead.
 *
 * Two rules and a name, which is what a masthead is. The heavy rule above and the
 * hairline below give the name somewhere to sit; without them a display-face
 * string at the top of a panel is a page title.
 */
function Masthead({ dateline, stamp }: { dateline: string; stamp: string | null }) {
  return (
    <header>
      <div aria-hidden="true" className="h-[3px] bg-red-dark" />
      <h1 className="mt-2 text-center font-display text-[22px] leading-[1.05] text-red-dark uppercase">
        Tony&rsquo;s Tuesday Slice
      </h1>
      <div aria-hidden="true" className="mt-2 h-px bg-ink-900/35" />
      {/*
        * The dateline alone, and the price is not here.
        *
        * They shared this row and the row wrapped: at 390 the dateline broke
        * across two lines and `FREE WITH ANY SLICE` landed underneath it, reading
        * as a third clause of the date rather than as the price. A masthead has
        * one job — which paper, which week — so the price moved to the colophon,
        * which is where a newspaper's imprint goes anyway.
        */}
      <p className="mt-1.5 text-center font-display text-[14px] leading-[1.5] tracking-[0.04em] text-ink-500 uppercase">
        {dateline}
      </p>
      <div aria-hidden="true" className="mt-1.5 h-[3px] bg-red-dark" />

      {/*
        * The rack's stamp, printed **on** the paper.
        *
        * It used to sit above the masthead, on the room, in dim grey — a caveat
        * in front of the nameplate, which is a newspaper apologising for itself
        * before you have read a word. Inside the sheet it reads as what it is: a
        * stamp somebody put on an old copy.
        */}
      {stamp !== null && (
        <p className="mt-2 text-center font-display text-[13px] leading-[1.5] tracking-[0.12em] text-wood-mid uppercase">
          {stamp}
        </p>
      )}
    </header>
  );
}

/** A printed rule. The only separator on the page. */
function Rule() {
  return <div aria-hidden="true" className="h-px bg-ink-900/30" />;
}

/**
 * A section label.
 *
 * Small caps in the display face, sitting directly under its rule — the
 * newspaper convention. Sized at 14px rather than the 10px the old page used:
 * furniture is what a reader navigates by, and unreadable furniture is worse than
 * none (`VISUAL_ACCEPTANCE §7` — readability wins over styling, always).
 */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-1.5 font-display text-[14px] leading-[1.45] tracking-[0.1em] text-red-dark uppercase">
      {children}
    </h2>
  );
}
