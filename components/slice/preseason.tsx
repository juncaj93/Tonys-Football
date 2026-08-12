import {
  Ledger,
  LedgerRow,
  PrintedRule,
  SectionHeading,
} from '@/components/scene/text-surface';
import { TYPE } from '@/lib/design/type';
import { DRAFT_PHRASES } from '@/lib/slice/draft-vocabulary';
import { type PreseasonSections, type PreseasonTeamSection } from '@/lib/slice/render';

/**
 * The draft-review special, printed.
 *
 * ## It is the same sheet of paper
 *
 * `Newspaper` still owns the mount, the masthead, Tony's column and the
 * colophon; this file is the middle of the page. That is deliberate down to the
 * file boundary: a special edition that rebuilt the sheet would drift from the
 * weekly one a pixel at a time, and the whole point of a *special edition* is
 * that a reader recognises it as the same paper.
 *
 * ## Ten sections is a long page, and the rhythm is the design
 *
 * The board first, so the whole league is answered in one glance before a word
 * is read — a reader who only wants to know what Tony gave them is done in two
 * seconds. Then the league snapshot, four lines at most. Then the ten teams,
 * each one built the same way so the eye learns the shape once and skims after
 * that: **grade and name on one line**, the draft slot beside them, Tony's take
 * as the only prose, then the facts as a ledger.
 *
 * The grade is the anchor. It is display type at the largest size on the page
 * after the headline, in the paper's own red, and it is on the **left** where a
 * scanning eye lands — so scrolling ten sections reads as a column of grades
 * with detail hanging off them rather than as ten paragraphs to be read in
 * order.
 *
 * ## Nothing here decides anything
 *
 * Every string arrives already built and already validated
 * (`lib/slice/preseason.ts`). This file does no arithmetic, formats no number
 * and chooses no word — `MANDATE §9`, and the same contract
 * `components/slice/presentation.test.tsx` pins for the weekly display
 * components.
 */
export function PreseasonBody({ sections }: { sections: PreseasonSections }) {
  return (
    <>
      {/*
        * Tony's draft board.
        *
        * A `Ledger`, because that is exactly what it is: a name on the left and
        * one value on the right, ten times. It is the single most-looked-at
        * thing in the issue and it sits directly under the lede, above every
        * team section, so nobody has to scroll to find their own grade.
        */}
      <PreseasonSection label="Tony’s draft board" weight="heavy" data-preseason-board="">
        <div className="mt-2.5">
          <Ledger>
            {sections.teams.map((team) => (
              <TeamReview key={team.manager} team={team} />
            ))}
          </Ledger>
        </div>
        {/*
          * Sentence case, not the metadata role.
          *
          * `TYPE.metadata` is uppercase signage, which is right for a label and
          * wrong for a sentence: set in caps it read as another section heading
          * competing with the one above it, and `WRITE-UP` broke across two
          * lines at every width because the hyphen is the only break opportunity
          * in it. This is a caption, so it takes the caption's voice.
          */}
        <p className={`mt-2 ${TYPE.bodyCompact} text-ink-500`}>
          {DRAFT_PHRASES.expandHint}
        </p>
      </PreseasonSection>

      {sections.snapshot.length > 0 && (
        <PreseasonSection label="From the draft room" data-preseason-snapshot="">
          {/*
            * The fact goes **under** the label, not beside it.
            *
            * Two reasons, and the second is the one that matters. A ledger value
            * is `whitespace-nowrap`, so `Ja'Marr Chase — Matt Lee` squeezed
            * `First off the board` to nothing and printed straight through it.
            * And a ledger value is set in the **display** face, which is
            * all-caps by design — correct for a score, wrong for a person, and
            * `LedgerRow`'s own contract says why: a league where somebody is
            * `MATT LEE` on one surface and `Matt Lee` on every other has two
            * names for one manager.
            */}
          <div className="mt-2.5">
            <Ledger>
              {sections.snapshot.map((row) => (
                <LedgerRow key={row.label} label={row.label}>
                  {row.value}
                </LedgerRow>
              ))}
            </Ledger>
          </div>
        </PreseasonSection>
      )}

      {/*
        * **There is no separate "Team by team" section.** Commissioner ruling,
        * 2026-08-11: streamline the issue and let each owner open their own.
        *
        * It used to print the board — ten names and ten grades — and then ten
        * full sections underneath it, which is the same ten managers twice and
        * is most of why the issue measured **8,024 px at 390, about nine and a
        * half phone screens** (`docs/SLICE_SIMULATION_LAB.md §7`). The board is
        * now the only list, and a row opens into the detail that used to be the
        * second pass.
        *
        * `sections.board` and `sections.teams` are the **same ten managers** —
        * `renderPreseason` builds both from `packet.teams` — so nothing is lost
        * by rendering the richer one. Both stay in `Edition`, untouched, for the
        * same reason the weekly scoreboard does: this is a decision about what
        * the paper prints, not about what it knows.
        */}

      {sections.history.length > 0 && (
        <PreseasonSection label="For the record" data-preseason-history="">
          <div className="mt-2.5">
            <Ledger>
              {sections.history.map((row) => (
                /* Prose under the label, for the reason the snapshot gives. */
                <LedgerRow key={row.label} label={row.label}>
                  {row.value}
                </LedgerRow>
              ))}
            </Ledger>
          </div>
        </PreseasonSection>
      )}

      {sections.weekOne.length > 0 && (
        <PreseasonSection label={DRAFT_PHRASES.weekOneLabel} data-preseason-week-one="">
          {/*
            * Two names and the word between them.
            *
            * No spread, no favourite, no projection — `16 §9` bans the language
            * and this product has no model behind it anyway. A schedule is a
            * fact; everything a preview usually adds to one is not.
            */}
          <div className="mt-2.5">
            <Ledger>
              {sections.weekOne.map((game) => (
                <LedgerRow
                  key={`${game.left}-${game.right}`}
                  kind="name"
                  label={
                    <>
                      <span className="text-ink-900">{game.left}</span>
                      <span className="text-ink-500"> {DRAFT_PHRASES.versus} </span>
                      <span className="text-ink-900">{game.right}</span>
                    </>
                  }
                />
              ))}
            </Ledger>
          </div>
        </PreseasonSection>
      )}
    </>
  );
}

/**
 * One manager's row on the board, and their whole review inside it.
 *
 * ## Why `<details>` and not a route
 *
 * A page per manager would be ten routes reading a **published snapshot** — and
 * the moment a grade is corrected after publication, the route and the printed
 * issue disagree while claiming to be the same paper. Keeping it inside the
 * issue means there is one document, and it is the one the commissioner
 * approved. The browser's own disclosure needs no JavaScript, is in the DOM
 * whether open or shut (so the gates still count ten takes), is keyboard
 * operable, and is announced as expandable without any ARIA of ours.
 *
 * ## It has to read as a paper, not a widget
 *
 * So the summary is a **ledger row** — name left, grade right, the same rule
 * between rows the board always had — and the marker is a printed `+` / `−` in
 * the quiet ink rather than a disclosure triangle. `list-none` on both the
 * element and the WebKit pseudo-element, because Safari draws its own marker
 * from a *different* selector and leaving one of the two produces a triangle on
 * iOS and nothing anywhere else.
 */
function TeamReview({ team }: { team: PreseasonTeamSection }) {
  return (
    <details
      data-preseason-team={team.manager}
      data-preseason-grade={team.grade}
      className="group border-b-2 border-ink-900/20 last:border-b-0"
    >
      <summary
        className="grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-2.5 px-3 py-2.5 [&::-webkit-details-marker]:hidden"
      >
        {/*
          * The marker is type, and it is `aria-hidden` because the element
          * already announces its own expanded state. A screen reader that read
          * "plus" here would be reading the furniture.
          */}
        <span aria-hidden="true" className={`${TYPE.ledgerLabel} text-ink-500`}>
          <span className="group-open:hidden">+</span>
          <span className="hidden group-open:inline">&minus;</span>
        </span>
        {/*
          * `break-words` as well as `min-w-0`, and the pair is the fix rather
          * than either half.
          *
          * `min-w-0` lets the box shrink; nothing in it breaks a **word**. A
          * display name is whatever somebody typed into Sleeper, so it can be
          * one unbroken run of characters longer than any phone is wide. Found
          * by the sparse fixture the day it grew a name longer than the
          * chalkboard's longest: 22px of horizontal scroll at 375 and 38px at
          * 360, which is the one thing this product's layout rule has no
          * exceptions to.
          */}
        {/*
          * A `<span>`, and the element is load-bearing rather than a style
          * choice.
          *
          * `<summary>`'s content model is **phrasing content, _or_ one element
          * of heading content** — not a heading *among* phrasing siblings. This
          * was an `<h3>` between the marker span and the grade span, which is
          * invalid nesting, and an invalid nesting is one the parser is free to
          * restructure. That is a React `#418` structural hydration mismatch by
          * construction, and the visual sweep measured it: a baseline run of
          * `main` in the same container logged **1** quarantined `#418` and
          * passed, while two runs of this branch logged **3** and **5** and
          * failed.
          *
          * The heading was inherited from the standalone team section this row
          * replaced, where it really was a section heading. In a ledger row it
          * is not one, so nothing about the document outline is lost.
          */}
        <span className={`min-w-0 break-words ${TYPE.bodyCompact} text-ink-900`}>{team.manager}</span>
        <span className={`text-right whitespace-nowrap ${TYPE.ledgerValue} font-display font-bold text-red-dark`}>
          {team.grade}
        </span>
      </summary>

      <div className="px-3 pb-3.5">
        {team.slot !== null && (
          <p className={`${TYPE.metadata} text-ink-500`}>{team.slot}</p>
        )}

        {/*
          * Tony's take: the only prose in the section, and it takes the dialogue
          * role rather than body.
          *
          * It is somebody talking, and on a page whose other ninety per cent is
          * ledgers and labels a voice should be the largest thing in its section
          * after the grade. The same decision the weekly issue makes for Tony's
          * column, for the same reason.
          */}
        <p className={`mt-2 ${TYPE.dialogue} text-ink-700`} data-preseason-take="">
          {team.take}
        </p>

        {(team.picks.length > 0 || team.shape.length > 0 || team.positions !== null) && (
          <div className="mt-3">
            <Ledger>
              {team.picks.map((pick) => (
                <LedgerRow
                  key={pick.label}
                  kind="name"
                  label={
                    <>
                      <span className="text-ink-900">{pick.player}</span>
                      {pick.position !== null && (
                        <span className="text-ink-500"> {pick.position}</span>
                      )}
                    </>
                  }
                  value={pick.label}
                />
              ))}

              {team.positions !== null && (
                /*
                 * The counts go **under** the label, not beside it.
                 *
                 * A `LedgerRow` value is `whitespace-nowrap` — a number that
                 * breaks across two lines stops being a number — and this is not
                 * one number, it is a list of five. As a value it squeezed the
                 * label to nothing and then printed straight through it at 390.
                 * The note slot wraps, which is what a list needs.
                 */
                <LedgerRow label="Taken">{team.positions}</LedgerRow>
              )}
            </Ledger>
          </div>
        )}

        {team.shape.length > 0 && (
          <p className={`mt-2 ${TYPE.body} text-ink-700`} data-preseason-shape="">
            {team.shape.join(' ')}
          </p>
        )}

        {(team.bestPick !== null || team.concern !== null) && (
          <div className="mt-3 space-y-2">
            {team.bestPick !== null && (
              <Aside label={DRAFT_PHRASES.bestPickLabel} tone="good">
                {team.bestPick}
              </Aside>
            )}
            {team.concern !== null && (
              <Aside label={DRAFT_PHRASES.concernLabel} tone="doubt">
                {team.concern}
              </Aside>
            )}
          </div>
        )}
      </div>
    </details>
  );
}

/**
 * A short aside with its own label — Tony's pick, Tony's concern.
 *
 * A **left rule** rather than a box, because the sheet's whole grammar is rules
 * and a bordered card in the middle of a newspaper column reads as a widget. The
 * two tones differ only in the rule's ink, which is enough to tell them apart
 * while scrolling and not enough to make either one shout.
 *
 * Both are optional in the data and absent when unsupplied — a manager whose
 * draft had no single highlight does not get an invented one.
 */
function Aside({
  label,
  tone,
  children,
}: {
  label: string;
  tone: 'good' | 'doubt';
  children: React.ReactNode;
}) {
  const rule = tone === 'good' ? 'border-red-dark' : 'border-ink-900/40';
  return (
    <div className={`border-l-4 pl-3 ${rule}`} data-preseason-aside={tone}>
      <p className={`${TYPE.eyebrow} text-ink-500`}>{label}</p>
      <p className={`mt-0.5 ${TYPE.body} text-ink-700`}>{children}</p>
    </div>
  );
}

/**
 * A section of the sheet: a rule, a label under it, then the section.
 *
 * The same three-part furniture `Newspaper` uses, and deliberately a copy of its
 * shape rather than an import of its private helper — the two files print the
 * same paper and the day one of them needs a different rhythm it should be able
 * to have one without the other changing underneath it.
 */
function PreseasonSection({
  label,
  children,
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
