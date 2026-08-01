import { PixelPanel, SignPlate } from '@/components/scene/panel';
import { TAP_TARGET } from '@/components/shell';
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
 * So it reads as the desk out the back: a paper panel, printed rules rather than
 * cards, and the actions as a stamp rather than as a button bar. `08 §22` lists
 * fourteen things the screen should show, and thirteen of them are facts about
 * one draft; grouping them into cards would make the screen look like a settings
 * page and would bury the one question being asked.
 *
 * ## The order is the reading order
 *
 * The verdict first, because it is the only thing that can make the rest moot.
 * Then the paper. Then what the paper was built from. Then the decision. Then
 * the record. A commissioner who reads top to bottom has read the case before
 * they are asked to rule on it.
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
const THE_PRESS = 'Tony\u2019s press';

export function StatusPlate({ status }: { status: ReviewDetail['status'] }) {
  const tone = status === 'published' ? 'blue' : status === 'rejected' ? 'red' : 'cream';
  return <SignPlate tone={tone}>{STATUS_WORD[status]}</SignPlate>;
}

/** A printed rule. The layout of a sheet of paper, not a border. */
export function Rule() {
  return <div aria-hidden="true" className="h-[2px] w-full bg-ink-900/20" />;
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-2 font-display text-[12px] leading-[1.5] tracking-[0.08em] text-ink-500 uppercase">
      {children}
    </h2>
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
 */
export function VerdictPanel({ detail }: { detail: ReviewDetail }) {
  const violations = detail.verdict.violations;

  if (detail.publishable) {
    return (
      <div className="border-l-[3px] border-ink-900/30 pl-3">
        <p className="font-display text-[13px] leading-[1.5] text-ink-900 uppercase">
          The check passed
        </p>
        <p className="mt-1 text-[17px] leading-[1.5] text-ink-700">
          Every number and every name in this issue came out of the fact packet below. No banned
          term, no invented quotation.
        </p>
      </div>
    );
  }

  return (
    <div className="border-l-[3px] border-red-dark pl-3">
      <p className="font-display text-[13px] leading-[1.5] text-red-dark uppercase">
        The check refused this issue
      </p>
      <p className="mt-1 text-[17px] leading-[1.5] text-ink-700">
        It cannot be approved or printed. Fix what it found, then draft the week again — the
        refused copy stays on the record beside whatever replaces it.
      </p>

      <ul className="mt-2.5 space-y-1.5">
        {violations.map((violation, index) => (
          <li key={`${violation.kind}-${String(index)}`} className="text-[17px] leading-[1.45] text-ink-900">
            <span className="font-display text-[13px] text-red-dark uppercase">
              {violation.kind.replace(/-/g, ' ')}
            </span>{' '}
            <span className="tabular-nums">{violation.value}</span>
            {'why' in violation && (
              <span className="block text-[16px] text-ink-500">{violation.why}</span>
            )}
          </li>
        ))}
      </ul>
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
  const packet = detail.packet;
  const candidates = [
    ...(packet.lead === null ? [] : [{ ...packet.lead, role: 'Lead' as const }]),
    ...packet.rest.map((story) => ({ ...story, role: 'Also ran' as const })),
  ];

  return (
    <div>
      <SectionLabel>What it was built from</SectionLabel>

      {candidates.length === 0 ? (
        <p className="mt-2 text-[17px] leading-[1.5] text-ink-700">
          Nothing in this week cleared the floor. The paper says so rather than promoting an
          ordinary result — which is the behaviour to check, not a fault to fix.
        </p>
      ) : (
        <ul className="mt-2 space-y-3">
          {candidates.map((story) => (
            <li key={story.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-display text-[13px] text-ink-900 uppercase">
                  {story.role} · {story.kind.replace(/_/g, ' ')}
                </span>
                <span className="shrink-0 font-display text-[13px] text-ink-500 tabular-nums">
                  {story.significance}
                </span>
              </div>
              <ul className="mt-1 space-y-0.5">
                {story.evidence.map((line) => (
                  <li key={line} className="text-[16px] leading-[1.45] text-ink-700">
                    {line}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {packet.demoted.length > 0 && (
        <>
          <SectionLabel>Moved down the order</SectionLabel>
          <ul className="mt-1.5 space-y-1">
            {packet.demoted.map((entry) => (
              <li key={entry.id} className="text-[16px] leading-[1.45] text-ink-700">
                <span className="font-display text-[13px] text-ink-500 uppercase">
                  {entry.kind.replace(/_/g, ' ')}
                </span>{' '}
                <span className="tabular-nums">&minus;{entry.penalty}</span> {entry.detail}
              </li>
            ))}
          </ul>
        </>
      )}

      {packet.suppressed.length > 0 && (
        <>
          <SectionLabel>Left out, and why</SectionLabel>
          <ul className="mt-1.5 space-y-1">
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
            {packet.suppressed.map((entry) => (
              <li key={entry.id} className="text-[16px] leading-[1.45] text-ink-700">
                <span className="font-display text-[13px] text-ink-500 uppercase">
                  {entry.kind.replace(/_/g, ' ')}
                </span>{' '}
                {entry.detail}
              </li>
            ))}
          </ul>
        </>
      )}

      <SectionLabel>Facts this issue may use</SectionLabel>
      <p className="mt-1.5 text-[16px] leading-[1.5] text-ink-700">
        <span className="font-display text-[13px] text-ink-500 uppercase">Numbers</span>{' '}
        <span className="tabular-nums">
          {packet.allowedNumbers.length === 0 ? 'none' : packet.allowedNumbers.join(' · ')}
        </span>
      </p>
      <p className="mt-1 text-[16px] leading-[1.5] text-ink-700">
        <span className="font-display text-[13px] text-ink-500 uppercase">Names</span>{' '}
        {packet.allowedNames.length === 0 ? 'none' : packet.allowedNames.join(' · ')}
      </p>
    </div>
  );
}

/**
 * Everything that has happened to this version, oldest first.
 *
 * `08 §22`: *"all edits and approvals must be audit logged."* Append-only in the
 * database, so this list cannot be tidied — which is the point of showing it on
 * the same screen as the decision it records.
 */
export function HistoryPanel({ history }: { history: readonly ReviewEvent[] }) {
  return (
    <div>
      <SectionLabel>The record</SectionLabel>
      <ul className="mt-1.5 space-y-1.5">
        {history.map((event, index) => (
          <li
            key={`${event.action}-${String(index)}`}
            className="text-[17px] leading-[1.45] text-ink-700"
          >
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
              <span className="block text-[16px] text-ink-500">&ldquo;{event.note}&rdquo;</span>
            )}
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
  version,
  status,
  publishable,
}: {
  href: string;
  headline: string;
  season: number;
  week: number;
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
        className={`pixel-edge flex ${TAP_TARGET} w-full flex-col justify-center border-2 border-ink-900/25 bg-paper-white/40 px-3 py-2.5 active:translate-y-px`}
      >
        <span className="text-[18px] leading-[1.35] text-ink-900">{headline}</span>
        <span className="mt-0.5 font-display text-[12px] leading-[1.5] text-ink-500 uppercase tabular-nums">
          Season {season} &middot; Week {week} &middot; Draft {version}
          {!publishable && <span className="text-red-dark"> &middot; refused by the check</span>}
          {status === 'draft' && <span> &middot; not yet up for review</span>}
        </span>
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
    <section className="mt-5" data-review-section={slug} data-review-count={String(count)}>
      <Rule />
      <SectionLabel>{title}</SectionLabel>
      {count === 0 ? (
        <p className="mt-1.5 text-[17px] leading-[1.5] text-ink-700">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-2">{children}</ul>
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
      className={`pixel-edge flex min-h-[48px] w-full items-center justify-center border-2 px-3 font-display text-[13px] leading-[1.5] uppercase active:translate-y-px disabled:opacity-40 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

/** A boxed sheet on the desk. The screen's one container idiom. */
export function DeskPanel({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <PixelPanel tone="paper" className={`px-4 pt-4 pb-5 ${className}`}>
      {children}
    </PixelPanel>
  );
}
