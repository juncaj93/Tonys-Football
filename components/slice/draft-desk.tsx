import Link from 'next/link';

import {
  Ledger,
  LedgerRow,
  MetadataStrip,
  PrintedRule,
  SectionHeading,
} from '@/components/scene/text-surface';
import { TAP_TARGET } from '@/components/shell';
import { TYPE } from '@/lib/design/type';
import { TONY_GRADES, type TonyGrade } from '@/lib/slice/draft-vocabulary';

/**
 * The desk where Tony's draft grades get written.
 *
 * ## The workload rule is the design
 *
 * Ten drafts, from a phone, without it becoming a chore. Everything here follows
 * from that:
 *
 * - **One manager per screen.** A ten-team form is a spreadsheet, and a
 *   spreadsheet on a phone is a scroll with a keyboard in front of it.
 * - **The grade is thirteen taps, not typing.** It is the one required field
 *   with a closed domain, so it should cost a thumb and not a keyboard — and a
 *   radio grid cannot produce `B+ ` with a trailing space or `b+` in lower case.
 * - **Save and next is the primary action.** The workflow is ten in a row; the
 *   button that continues it is the button under the thumb.
 * - **Progress is visible from the board and from every screen.** *"3 of 10"* is
 *   the only number that answers *"how much is left"*, and it is the reason to
 *   open the page at all.
 *
 * ## It stays in Tony's world without pretending
 *
 * The labels say *Tony's grade* and *Write Tony's take*, because that is what is
 * being written — Alex is ghost-writing Tony, and the paper will print it as
 * Tony's. What the desk does **not** do is pretend Alex is not there: the
 * screen is the private editor, so it is allowed to say *save* and *next* like
 * any tool. The pretence is only ever in print.
 */

/**
 * Thirteen grades, as a grid of taps.
 *
 * A radio group rather than a `<select>`: a native picker on iOS is a wheel that
 * hides twelve of the thirteen values behind a scroll, and the whole point of a
 * closed domain is that a person can see it. Four columns puts every grade on
 * one screen at 360 with no horizontal scroll.
 *
 * `TAP_TARGET` because a mis-tap here changes what the league reads.
 */
export function GradePicker({
  name = 'grade',
  value,
}: {
  name?: string;
  value: TonyGrade | null;
}) {
  return (
    <fieldset data-grade-picker="">
      <legend className={`${TYPE.eyebrow} text-ink-500`}>Tony’s grade</legend>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {TONY_GRADES.map((grade) => (
          <label
            key={grade}
            className={`pixel-edge flex ${TAP_TARGET} cursor-pointer items-center justify-center border-2 ${TYPE.action} ${
              /*
               * The selected grade is the paper's red on cream, which is how a
               * grade prints. Everything else is quiet ink on the sheet — so the
               * grid reads as one chosen value rather than as thirteen buttons.
               */
              value === grade
                ? 'border-red-mid bg-red-dark text-paper-white'
                : 'border-ink-900/30 bg-paper-white/45 text-ink-700'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={grade}
              defaultChecked={value === grade}
              required
              className="sr-only"
            />
            {grade}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * A multi-line field with a hard length, for Tony's take and his concern.
 *
 * `maxLength` on the element **and** a CHECK in the database, because the two
 * answer different questions: the element stops a thumb, the CHECK stops a
 * caller. The count under the box is the honest half of a limit — a field that
 * silently stops accepting characters reads as a broken keyboard.
 *
 * Three rows rather than one line: a take is a sentence or two, and a
 * single-line input on a phone shows about six words of it.
 */
export function DeskTextArea({
  label,
  name,
  value,
  maxLength,
  required = false,
  hint = null,
}: {
  label: string;
  name: string;
  value: string | null;
  maxLength: number;
  required?: boolean;
  hint?: string | null;
}) {
  return (
    <label className="block">
      <span className={`${TYPE.eyebrow} text-ink-500`}>{label}</span>
      <textarea
        name={name}
        rows={3}
        maxLength={maxLength}
        required={required}
        defaultValue={value ?? ''}
        /*
         * `TYPE.body` is 17px, which is what keeps iOS from zooming the page on
         * focus. Every field on this desk is at or above the 16px threshold, and
         * `checkTypeFloor` measures the computed size rather than trusting it.
         */
        className={`mt-1.5 w-full border-2 border-ink-900/35 bg-paper-white/70 px-2.5 py-2 ${TYPE.body} text-ink-900`}
      />
      <span className={`mt-1 block ${TYPE.metadata} text-ink-500`}>
        {hint === null ? `Up to ${String(maxLength)} characters` : hint}
      </span>
    </label>
  );
}

/**
 * The best-pick picker: **one of this manager's own picks**, or nothing.
 *
 * A `<select>` rather than a text field, and that is the guarantee rather than
 * the convenience: Tony cannot praise a player this manager did not draft
 * because the only values are the ones they did. The database says the same
 * thing with a trigger, so a caller that built its own form is refused too.
 *
 * *No pick* is a real option and it is the default. A manager whose draft had no
 * single highlight should not force one to be invented.
 */
export function BestPickPicker({
  name = 'bestPickId',
  picks,
  value,
}: {
  name?: string;
  picks: readonly { readonly id: string; readonly label: string }[];
  value: string | null;
}) {
  return (
    <label className="block">
      <span className={`${TYPE.eyebrow} text-ink-500`}>Tony’s pick of the bunch</span>
      <select
        name={name}
        defaultValue={value ?? ''}
        className={`mt-1.5 min-h-[44px] w-full border-2 border-ink-900/35 bg-paper-white/70 px-2.5 ${TYPE.body} text-ink-900`}
      >
        <option value="">No pick named</option>
        {picks.map((pick) => (
          <option key={pick.id} value={pick.id}>
            {pick.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * How much is left, as one line.
 *
 * The reason to open this page. It is a **count**, not prose, because the
 * question is arithmetic and a sentence would take longer to read than the
 * answer deserves. Named in the DOM so a gate can pin it — a progress line that
 * says the wrong number is worse than no progress line.
 */
export function ReviewProgressStrip({
  reviewed,
  total,
}: {
  reviewed: number;
  total: number;
}) {
  return (
    <MetadataStrip
      className="mt-2.5"
      ink="text-ink-900"
      data-draft-progress={`${String(reviewed)}/${String(total)}`}
    >
      Tony’s draft board — {reviewed} of {total} reviewed
    </MetadataStrip>
  );
}

/**
 * One manager's row on the board.
 *
 * The grade sits where a value sits in every other ledger in this product, and a
 * manager Tony has not reached shows an em dash rather than a blank — a blank
 * reads as a rendering fault and a dash reads as *not yet*.
 */
export function BoardRow({
  href,
  displayName,
  grade,
  take,
}: {
  href: string;
  displayName: string;
  grade: TonyGrade | null;
  take: string | null;
}) {
  return (
    <li>
      <Link
        href={href}
        data-draft-row={grade === null ? 'todo' : 'done'}
        className={`pixel-edge flex ${TAP_TARGET} w-full flex-col justify-center border-2 border-ink-900/25 bg-paper-white/45 px-3 py-2.5 active:translate-y-px`}
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className={`${TYPE.bodyCompact} text-ink-900`}>{displayName}</span>
          <span
            className={`${TYPE.ledgerValue} ${grade === null ? 'text-ink-500' : 'text-red-dark'}`}
          >
            {grade ?? '—'}
          </span>
        </span>
        {take !== null && (
          /*
           * One line of the take, clamped.
           *
           * Enough to recognise which one this is when coming back to fix it,
           * and not enough to turn the board into ten paragraphs. `line-clamp-1`
           * rather than a substring, so the truncation happens at the width the
           * reader actually has.
           */
          <span className={`mt-1 line-clamp-1 ${TYPE.metadata} text-ink-500`}>{take}</span>
        )}
      </Link>
    </li>
  );
}

/** A manager's draft, as the editor needs to see it while writing about it. */
export function DraftSnapshot({
  slot,
  picks,
  positions,
}: {
  slot: number | null;
  picks: readonly { readonly label: string; readonly playerName: string; readonly position: string | null }[];
  positions: string | null;
}) {
  return (
    <div data-draft-snapshot="">
      <PrintedRule />
      <div className="mt-2">
        <SectionHeading ink="text-ink-500">What they did</SectionHeading>
      </div>

      <div className="mt-2">
        <Ledger>
          {slot !== null && <LedgerRow label="Draft slot" value={slot} />}
          {picks.map((pick) => (
            <LedgerRow
              key={pick.label}
              kind="name"
              label={
                <>
                  <span className="text-ink-900">{pick.playerName}</span>
                  {pick.position !== null && (
                    <span className="text-ink-500"> {pick.position}</span>
                  )}
                </>
              }
              value={pick.label}
            />
          ))}
          {/*
            * Under the label rather than beside it, for the reason
            * `components/slice/preseason.tsx` records: a ledger value does not
            * wrap, and this is a list of five counts rather than one number.
            */}
          {positions !== null && <LedgerRow label="Taken">{positions}</LedgerRow>}
        </Ledger>
      </div>
    </div>
  );
}
