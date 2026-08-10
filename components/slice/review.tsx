import Link from 'next/link';

import {
  Ledger,
  LedgerRow,
  MetadataStrip,
  MountedSheet,
  PrintedRule,
  SectionHeading,
  WarningBlock,
} from '@/components/scene/text-surface';
import { TAP_TARGET } from '@/components/shell';
import { stamp } from '@/lib/design/moment';
import { TYPE } from '@/lib/design/type';
import type { PreseasonPacket } from '@/lib/slice/preseason';
import { type ReviewDetail, type ReviewEvent } from '@/lib/slice/publication';

/**
 * The commissioner's proof sheet.
 *
 * ## Why this is a desk and not a dashboard
 *
 * The review screen is the one place in the product where a person makes a
 * decision the whole league then reads as true. Everything on it is either the
 * **paper as it will print** or the **evidence for or against printing it** —
 * there is no third category, and anything that would be a third category is a
 * reason to leave it off.
 *
 * So it reads as the desk out the back: sheets mounted on the wall, printed
 * rules rather than cards, and the actions as a stamp rather than as a button
 * bar. `08 §22` lists fourteen things the screen should show, and thirteen of
 * them are facts about one draft; grouping them into cards would make the screen
 * look like a settings page and would bury the one question being asked.
 *
 * ## The order is the reading order
 *
 * The verdict first, because it is the only thing that can make the rest moot.
 * Then the paper. Then what the paper was built from. Then the decision. Then
 * the record. A commissioner who reads top to bottom has read the case before
 * they are asked to rule on it.
 *
 * ## What the refresh changed, and what it did not
 *
 * Not one fact, one route, one action or one guarantee. What changed is that the
 * screen now answers its six questions by **geometry** rather than by paragraph:
 *
 *   1. *What state is this in* — a stamp at the top of the sheet, at stamp size.
 *   2. *Can it be approved or printed* — a warning block with a drawn glyph,
 *      which is a shape you read before you read a word.
 *   3. *Why was it refused* — the validator's own sentence, at body size, not
 *      two pixels under it.
 *   4. *What must happen next* — the same block, under the same glyph.
 *   5. *What exact values failed* — a **bordered ledger**: keys down the left,
 *      the offending values right-aligned down the right, a rule between
 *      findings. It was a bulleted list of run-together clauses in three mixed
 *      sizes, where the value — the only reason to read it — was the least
 *      distinguishable thing on the row.
 *   6. *What it would look like printed* — under a dark plaque, so the label
 *      cannot land on the room's own artwork the way a cream one did at 360.
 */

const STATUS_WORD: Record<ReviewDetail['status'], string> = {
  draft: 'Drafted',
  needs_review: 'Waiting on you',
  approved: 'Approved',
  published: 'On the rack',
  rejected: 'Refused',
  superseded: 'Replaced',
};

/**
 * Whole phrases, not verbs with an object bolted on afterwards.
 *
 * The first version was `{word} it`, which printed **"put up for review it"** —
 * the kind of defect that is invisible in a template and unmissable on the page.
 * A phrase that reads as a sentence is written as one.
 */
const ACTION_PHRASE: Record<ReviewEvent['action'], string> = {
  generated: 'drafted it',
  submitted: 'put it up for review',
  approved: 'approved it',
  rejected: 'refused it',
  published: 'printed it',
  superseded: 'replaced it',
};

/** Who acted, when a job did rather than a person. */
const THE_PRESS = 'Tony’s press';

/**
 * The status stamp.
 *
 * A stamp pressed onto the sheet, not a pill floating above it: square, two
 * pixels of border, the ink of the state it names. The three inks are the three
 * things a state can mean — stopped, printed, in hand — and nothing else takes a
 * colour, because a screen where every badge is coloured has no coloured badge.
 */
export function StatusStamp({ status }: { status: ReviewDetail['status'] }) {
  const tones = {
    rejected: 'border-red-mid bg-red-dark text-paper-white',
    published: 'border-blue-mid bg-blue-deep text-blue-neon',
    quiet: 'border-ink-900/50 bg-paper-white/70 text-ink-900',
  } as const;
  const tone =
    status === 'published' ? tones.published : status === 'rejected' ? tones.rejected : tones.quiet;

  return (
    <span
      data-review-stamp={status}
      className={`pixel-edge inline-flex items-center border-2 px-3 py-1.5 ${TYPE.stamp} ${tone}`}
    >
      {STATUS_WORD[status]}
    </span>
  );
}

/** A printed rule. The layout of a sheet of paper, not a border. */
export function Rule() {
  return <PrintedRule />;
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <SectionHeading ink="text-ink-500">{children}</SectionHeading>
    </div>
  );
}

/**
 * The deterministic validator's answer, at the top of the sheet.
 *
 * `08 §27`: *"validation failure: block publication until corrected."* The block
 * is in the database — an unpublishable version cannot reach `approved` — so this
 * panel's job is not to enforce anything. It is to say **why**, in the
 * validator's own words, so a refusal is actionable rather than mysterious.
 *
 * A passing verdict gets one line. A failing one gets every violation, because
 * the second violation is the one that would otherwise be found after the first
 * is fixed and the draft is regenerated.
 *
 * The violations are a ledger and not a list, and the reason is the shape of the
 * data rather than a preference: every violation is a **kind and an exact
 * value** — `unknown-number 154.42`, `banned-term odds` — and a kind beside its
 * value in running text is the one arrangement in which neither is scannable.
 */
export function VerdictPanel({ detail }: { detail: ReviewDetail }) {
  const violations = detail.verdict.violations;

  if (detail.publishable) {
    return (
      <WarningBlock tone="go" title="The check passed" data-review-verdict="passed">
        Every number and every name in this issue came out of the fact packet below. No banned
        term, no invented quotation.
      </WarningBlock>
    );
  }

  return (
    <div data-review-verdict="refused">
      <WarningBlock tone="stop" title="Blocked by the check">
        It cannot be approved or printed. Fix what it found, then draft the week again — the
        refused copy stays on the record beside whatever replaces it.
      </WarningBlock>

      <div className="mt-3">
        <MetadataStrip ink="text-ink-500">
          {violations.length === 1 ? '1 finding' : `${String(violations.length)} findings`}
        </MetadataStrip>
      </div>

      <div className="mt-1.5">
        <Ledger data-review-findings={String(violations.length)}>
          {violations.map((violation, index) => (
            <LedgerRow
              key={`${violation.kind}-${String(index)}`}
              data-review-finding={violation.kind}
              label={violation.kind.replace(/-/g, ' ')}
              value={violation.value}
            >
              {'why' in violation ? violation.why : undefined}
            </LedgerRow>
          ))}
        </Ledger>
      </div>
    </div>
  );
}

/**
 * What the prose was built from — `08 §22`'s candidates, scores and fact packet.
 *
 * The significance numbers are shown as they are, unrounded and unranked by this
 * component. `MANDATE §9`: the interface never derives a fantasy fact, and
 * *"which of these was the bigger deal"* is a fantasy fact the scorer already
 * answered. The screen's job is to make that answer arguable, not to re-make it.
 */
export function PacketPanel({ detail }: { detail: ReviewDetail }) {
  /*
   * Two packets, two panels.
   *
   * A preseason issue has no candidates, no significance scores and no
   * suppressions — there was no game to score — so the weekly panel would
   * render four empty sections and one useful one. What a commissioner needs to
   * see about a draft review is different in kind: which draft it read, how many
   * grades are in, and what Tony wrote that the draft does not contain.
   */
  if ('kind' in detail.packet) {
    /*
     * Narrowed by the discriminant itself rather than by a helper, and that is a
     * boundary decision: a runtime import from `lib/slice/preseason` would pull
     * the fact layer — and through it the database — into a display component's
     * import graph, which `presentation.test.tsx` refuses. A weekly `FactPacket`
     * has no `kind` at all, so `in` is the whole test.
     */
    return <PreseasonPacketPanel packet={detail.packet} />;
  }

  const packet = detail.packet;
  const candidates = [
    ...(packet.lead === null ? [] : [{ ...packet.lead, role: 'Lead' as const }]),
    ...packet.rest.map((story) => ({ ...story, role: 'Also ran' as const })),
  ];

  return (
    <div>
      <SectionHeading ink="text-ink-500">What it was built from</SectionHeading>

      {candidates.length === 0 ? (
        <p className={`mt-2 ${TYPE.body} text-ink-700`}>
          Nothing in this week cleared the floor. The paper says so rather than promoting an
          ordinary result — which is the behaviour to check, not a fault to fix.
        </p>
      ) : (
        <div className="mt-2">
          <Ledger>
            {candidates.map((story) => (
              <LedgerRow
                key={story.id}
                label={`${story.role} · ${story.kind.replace(/_/g, ' ')}`}
                value={story.significance}
              >
                {story.evidence.join(' · ')}
              </LedgerRow>
            ))}
          </Ledger>
        </div>
      )}

      {packet.demoted.length > 0 && (
        <>
          <SectionLabel>Moved down the order</SectionLabel>
          <div className="mt-1.5">
            <Ledger>
              {packet.demoted.map((entry) => (
                <LedgerRow
                  key={entry.id}
                  label={entry.kind.replace(/_/g, ' ')}
                  value={<>&minus;{entry.penalty}</>}
                >
                  {entry.detail}
                </LedgerRow>
              ))}
            </Ledger>
          </div>
        </>
      )}

      {packet.suppressed.length > 0 && (
        <>
          <SectionLabel>Left out, and why</SectionLabel>
          <div className="mt-1.5">
            {/*
              * Named, because the reason alone repeats itself.
              *
              * Two stories suppressed by the same rule produce the **same
              * sentence** — the detail says what beat them, not what lost — so the
              * panel printed one line twice, four words apart. That is
              * `VISUAL_ACCEPTANCE §4`'s *"the same thing rendered twice in one
              * panel"*, and the fix is the missing half of the fact rather than a
              * layout change.
              */}
            <Ledger>
              {packet.suppressed.map((entry) => (
                <LedgerRow key={entry.id} label={entry.kind.replace(/_/g, ' ')}>
                  {entry.detail}
                </LedgerRow>
              ))}
            </Ledger>
          </div>
        </>
      )}

      <SectionLabel>Facts this issue may use</SectionLabel>
      <div className="mt-1.5">
        <Ledger>
          <LedgerRow label="Numbers">
            <span className="tabular-nums">
              {packet.allowedNumbers.length === 0 ? 'none' : packet.allowedNumbers.join(' · ')}
            </span>
          </LedgerRow>
          <LedgerRow label="Names">
            {packet.allowedNames.length === 0 ? 'none' : packet.allowedNames.join(' · ')}
          </LedgerRow>
        </Ledger>
      </div>
    </div>
  );
}

/**
 * What a draft review was built from.
 *
 * The counterpart of the weekly panel above, and deliberately not a subset of
 * it: the questions are different. *"Has Tony finished"* replaces *"what led"*,
 * and the one thing this screen has that no other does is the **advisories** —
 * the numbers and names inside Tony's own takes that the draft does not
 * contain.
 *
 * Advisories do not block publication and the panel says so in as many words.
 * They exist because Tony's take is the only free text this product prints: it
 * is his opinion and he is the author, so the checker reports rather than
 * refuses (`lib/slice/preseason.ts`). A reviewer who sees *"Bijan"* listed under
 * a manager who did not draft him has been handed exactly the thing worth a
 * second look.
 */
function PreseasonPacketPanel({ packet }: { packet: PreseasonPacket }) {
  const advisories = packet.advisories ?? [];

  return (
    <div data-review-preseason-packet="">
      <SectionHeading ink="text-ink-500">What it was built from</SectionHeading>

      <div className="mt-2">
        <Ledger>
          <LedgerRow label="Draft" value={packet.draft?.sleeperDraftId ?? 'none'} />
          <LedgerRow label="Picks" value={packet.draft?.totalPicks ?? 0} />
          <LedgerRow
            label="Reviewed"
            value={`${String(packet.reviewed)} of ${String(packet.total)}`}
          />
        </Ledger>
      </div>

      {packet.outstanding.length > 0 && (
        <>
          <SectionLabel>Still waiting on Tony</SectionLabel>
          <div className="mt-1.5">
            <Ledger>
              <LedgerRow kind="name" label={packet.outstanding.join(' · ')} />
            </Ledger>
          </div>
        </>
      )}

      {advisories.length > 0 && (
        <>
          <SectionLabel>In Tony’s takes, not in the draft</SectionLabel>
          <p className={`mt-1.5 ${TYPE.body} text-ink-700`}>
            Worth a look, and not a reason to hold the paper. A take is Tony’s opinion, so its
            words are his rather than the draft’s.
          </p>
          <div className="mt-1.5">
            <Ledger>
              {advisories.map((advisory, index) => (
                <LedgerRow
                  key={`${advisory.manager}-${advisory.violation.value}-${String(index)}`}
                  label={advisory.manager}
                  value={advisory.violation.value}
                />
              ))}
            </Ledger>
          </div>
        </>
      )}

      <SectionLabel>Facts this issue may use</SectionLabel>
      <div className="mt-1.5">
        <Ledger>
          <LedgerRow label="Numbers">
            <span className="tabular-nums">
              {packet.allowedNumbers.length === 0 ? 'none' : packet.allowedNumbers.join(' · ')}
            </span>
          </LedgerRow>
          <LedgerRow label="Names">
            {packet.allowedNames.length === 0 ? 'none' : packet.allowedNames.join(' · ')}
          </LedgerRow>
        </Ledger>
      </div>
    </div>
  );
}

/**
 * Everything that has happened to this version, oldest first.
 *
 * `08 §22`: *"all edits and approvals must be audit logged."* Append-only in the
 * database, so this list cannot be tidied — which is the point of showing it on
 * the same screen as the decision it records.
 *
 * ## It shows *when*, and it did not used to
 *
 * Visual debt 11: the record showed the order of decisions and who made them,
 * and *"when was this approved"* is a real question about an audit trail whose
 * answer was sitting in `slice_reviews.occurred_at` and never reaching the
 * screen. Order is not a time — it says one thing followed another, not whether
 * that was a minute later or a month.
 *
 * The stamp is **under** the sentence, not inside it. A reviewer reads the
 * record for *what happened*; the timestamp is what they come back for when
 * something is disputed, and putting it in the flow of the sentence would make
 * every row longer to read for a fact most readings do not need. It is
 * `TYPE.metadata` for the same reason — the smallest role, tabular, so a column
 * of stamps lines up down the page.
 */
export function HistoryPanel({ history }: { history: readonly ReviewEvent[] }) {
  return (
    <div>
      <SectionHeading ink="text-ink-500">The record</SectionHeading>
      <ul className="mt-2 space-y-2">
        {history.map((event, index) => (
          <li key={`${event.action}-${String(index)}`} className={`${TYPE.bodyCompact} text-ink-700`}>
            {/*
              * A character, never an entity.
              *
              * `&rsquo;` inside a JSX expression is a string, not markup, so the
              * record printed the literal `Tony&rsquo;s press` to the one screen
              * whose job is to be believed.
              */}
            <span className="text-ink-900">{event.actorName ?? THE_PRESS}</span>{' '}
            {ACTION_PHRASE[event.action]}
            {event.note !== null && (
              <span className={`mt-0.5 block ${TYPE.body} text-ink-500`}>
                &ldquo;{event.note}&rdquo;
              </span>
            )}
            <span className={`mt-0.5 block ${TYPE.metadata} text-ink-500`}>
              {stamp(event.occurredAt)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A row in the queue.
 *
 * The headline is the identifier a person actually recognises, so it leads;
 * season and week are the filing detail and sit under it. A row that led with
 * `2025 · W14` would be a database listing.
 */
export function QueueRow({
  href,
  headline,
  season,
  week,
  kind = 'weekly',
  version,
  status,
  publishable,
}: {
  href: string;
  headline: string;
  season: number;
  week: number;
  /**
   * Weekly recap, or the draft-review special.
   *
   * The special has no week — it is week zero, a slot rather than a number
   * (`0018`) — so the filing line names it instead. `Week 0` in a queue is the
   * shape of the record leaking onto the screen that lists it.
   */
  kind?: ReviewDetail['kind'];
  version: number;
  status: ReviewDetail['status'];
  publishable: boolean;
}) {
  return (
    <li>
      <a
        href={href}
        data-review-row={status}
        data-review-refused={publishable ? undefined : ''}
        className={`pixel-edge flex ${TAP_TARGET} w-full flex-col justify-center border-2 border-ink-900/25 bg-paper-white/45 px-3 py-2.5 active:translate-y-px`}
      >
        <span className={`${TYPE.bodyCompact} text-ink-900`}>{headline}</span>
        <MetadataStrip className="mt-1">
          Season {season} &middot; {kind === 'preseason' ? 'Draft review' : `Week ${String(week)}`}{' '}
          &middot; Draft {version}
        </MetadataStrip>
        {(!publishable || status === 'draft') && (
          <span className={`mt-1 ${TYPE.eyebrow} ${publishable ? 'text-ink-500' : 'text-red-dark'}`}>
            {publishable ? 'Not yet up for review' : 'Refused by the check'}
          </span>
        )}
      </a>
    </li>
  );
}

/** A section of the queue with its own heading, or nothing at all when empty. */
export function QueueSection({
  slug,
  title,
  empty,
  children,
  count,
}: {
  slug: string;
  title: string;
  empty: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6" data-review-section={slug} data-review-count={String(count)}>
      <PrintedRule />
      <div className="mt-2">
        <SectionHeading ink="text-ink-500">{title}</SectionHeading>
      </div>
      {count === 0 ? (
        <p className={`mt-1.5 ${TYPE.body} text-ink-700`}>{empty}</p>
      ) : (
        <ul className="mt-2.5 space-y-2">{children}</ul>
      )}
    </section>
  );
}

/**
 * The stamp a commissioner presses.
 *
 * A form button rather than a link, because every one of these writes. Sized to
 * the room's 48px convention rather than to AA's 24, since a mis-tap here
 * publishes or refuses a week of league history.
 */
export function StampButton({
  children,
  tone,
  disabled = false,
}: {
  children: React.ReactNode;
  tone: 'go' | 'stop' | 'quiet';
  disabled?: boolean;
}) {
  const tones = {
    go: 'border-blue-mid bg-blue-deep text-blue-neon',
    stop: 'border-red-mid bg-red-dark text-paper-white',
    quiet: 'border-wood-dark bg-[#1c1113] text-paper-mid',
  } as const;

  return (
    <button
      type="submit"
      disabled={disabled}
      className={`pixel-edge flex min-h-[48px] w-full items-center justify-center border-2 px-3 ${TYPE.action} active:translate-y-px disabled:opacity-40 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

/**
 * A sheet on the desk.
 *
 * `MountedSheet` rather than a bare `PixelPanel`: the desk's sheets are the same
 * object as the paper they are judging, and before this they were a cream
 * rectangle sitting straight on the dimmed parlor while the newspaper beside
 * them was another cream rectangle sitting straight on the dimmed parlor. Two
 * different things that looked like one thing.
 */
export function DeskPanel({
  children,
  className = '',
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <MountedSheet className={`px-4 pt-4 pb-5 ${className}`} {...rest}>
      {children}
    </MountedSheet>
  );
}

/**
 * A field on a form, with its label above it.
 *
 * The four note fields on this screen were four hand-assembled label/input
 * pairs, and they had drifted: two at 12px, one at 17px, one at 18px, three
 * different top margins. A commissioner typing a refusal reason should not be
 * able to tell which form they are in from the size of the label.
 */
export function DeskField({
  label,
  name,
  required = false,
  maxLength = 160,
  numeric = null,
}: {
  label: string;
  name: string;
  required?: boolean;
  maxLength?: number;
  /** A week number rather than a note: `{ min, max, value }`. */
  numeric?: { readonly min: number; readonly max: number; readonly value: string } | null;
}) {
  return (
    <label className="block">
      <span className={`${TYPE.eyebrow} text-ink-500`}>{label}</span>
      <input
        {...(numeric === null
          ? { type: 'text', maxLength }
          : { type: 'number', min: numeric.min, max: numeric.max, defaultValue: numeric.value })}
        name={name}
        required={required}
        className={`mt-1.5 min-h-[44px] w-full border-2 border-ink-900/35 bg-paper-white/70 px-2.5 ${TYPE.body} text-ink-900 ${numeric === null ? '' : 'tabular-nums'}`}
      />
    </label>
  );
}

/**
 * The way back, at the foot of a desk screen.
 *
 * A dark plate rather than another sheet — it is a way out of the room, and
 * `18 §3`'s grammar is that a way out looks like a door and not like paper.
 */
export function DeskExit({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`pixel-edge flex min-h-[48px] w-full items-center justify-center border-2 border-wood-dark bg-[#1c1113] ${TYPE.action} text-paper-mid active:translate-y-px`}
    >
      {children}
    </Link>
  );
}
