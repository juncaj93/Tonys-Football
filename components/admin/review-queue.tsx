import Link from 'next/link';

import { MetadataStrip, PrintedRule, SectionHeading } from '@/components/scene/text-surface';
import { TAP_TARGET } from '@/components/shell';
import { TYPE } from '@/lib/design/type';
import { PUBLICATION_KINDS } from '@/lib/publication/kinds';
import { type ReviewItem } from '@/lib/publication/item';

/**
 * *"What needs my approval?"* — the whole screen, in one card each.
 *
 * ## The row's action is to open it, and that is the design
 *
 * There is no Approve stamp on a queue row, deliberately. A row shows a headline
 * and a status; approving from it would mean approving something on the strength
 * of its title, and `/admin/slice/[versionId]` already put its own actions
 * *below* the paper for exactly that reason — *"a button bar at the top would
 * make approving without reading the default gesture."* Putting one on the list
 * would be the same mistake one screen earlier. The row's job is to make the
 * decision findable; the decision is made where the paper is.
 *
 * ## No urgency that time invented
 *
 * No countdowns, no "overdue", no red because a Tuesday went by. The bands are
 * *can I act on this* and the ordering inside a band is recency — both facts
 * about the item rather than about the clock. A queue that shouts gets ignored,
 * and this one is read by one person about once a week.
 */

/**
 * What each band says on the row, and how loudly.
 *
 * Ink is spent on exactly two states — the one that needs a decision and the one
 * that cannot have one — which is the same rule `StatusStamp` follows on the
 * review screen. A list where every row is coloured has no coloured row.
 */
const BAND: Record<
  ReviewItem['readiness'],
  { readonly word: string; readonly ink: string; readonly border: string }
> = {
  ready: { word: 'Ready for review', ink: 'text-ink-900', border: 'border-blue-mid' },
  approved: { word: 'Approved · not printed', ink: 'text-ink-900', border: 'border-ink-900/25' },
  blocked: { word: 'Not ready', ink: 'text-red-dark', border: 'border-red-mid' },
  incomplete: { word: 'Drafted · not up for review', ink: 'text-ink-500', border: 'border-ink-900/25' },
  published: { word: 'On the rack', ink: 'text-ink-500', border: 'border-ink-900/25' },
};

export function ReviewCard({ item }: { item: ReviewItem }) {
  const band = BAND[item.readiness];

  return (
    <li>
      <Link
        href={item.href}
        data-review-item={item.readiness}
        data-review-kind={item.kind}
        className={`pixel-edge flex ${TAP_TARGET} w-full flex-col justify-center border-2 ${band.border} bg-paper-white/45 px-3 py-2.5 active:translate-y-px`}
      >
        {/*
          * The type of publication leads.
          *
          * With one kind it reads as a label; with two it is the only thing that
          * tells a Slice from whatever the second one is, and a queue that only
          * became legible after the second kind shipped would be a queue nobody
          * trusted in between.
          */}
        <span className={`${TYPE.eyebrow} text-ink-500`}>
          {PUBLICATION_KINDS[item.kind].label}
        </span>

        <span className={`mt-1 ${TYPE.bodyCompact} text-ink-900`}>{item.title}</span>

        <MetadataStrip className="mt-1">{item.subject}</MetadataStrip>

        <span className={`mt-1.5 ${TYPE.eyebrow} ${band.ink}`}>{band.word}</span>

        {/*
          * *"Do I have to check the scores myself?"* — answered on the row.
          *
          * The deterministic check's verdict, carried from the kind rather than
          * computed here. It is printed on a ready item because that is the row
          * a stamp is about to be pressed on; a blocked row says why instead, and
          * saying both would be saying the same thing twice.
          */}
        {item.readiness === 'ready' && item.factsVerified && (
          <span className={`mt-1 ${TYPE.eyebrow} text-ink-500`}>Facts verified</span>
        )}

        {item.blockedReason !== null && (
          <span className={`mt-1 ${TYPE.body} text-ink-700`}>{item.blockedReason}</span>
        )}
      </Link>
    </li>
  );
}

/**
 * The queue.
 *
 * One section, not five. The bands are already the sort order, so splitting them
 * into headed sections would put four headings on a screen that usually carries
 * one item — and the press desk's own history is the record of what that costs:
 * three desk states photographed byte-identically because what told them apart
 * was below four headings.
 */
export function ReviewQueue({
  outstanding,
  published,
  pending,
}: {
  outstanding: readonly ReviewItem[];
  published: readonly ReviewItem[];
  pending: number;
}) {
  return (
    <section data-review-queue-pending={String(pending)} data-review-queue-size={String(outstanding.length)}>
      <SectionHeading ink="text-ink-500">Waiting on you</SectionHeading>

      {outstanding.length === 0 ? (
        /*
          * The empty desk, and it is the state a commissioner meets today — the
          * 2026 season has no games, so nothing has been drafted. It gets a
          * sentence that says *why* there is nothing rather than the word
          * "None", because "None" on a governance screen reads equally well as
          * "nothing is waiting" and "this screen is broken".
          */
        <p className={`mt-1.5 ${TYPE.body} text-ink-700`}>
          Nothing needs your stamp. When Tony drafts a paper it lands here, and nothing reaches the
          rack until you read it.
        </p>
      ) : (
        <ul className="mt-2.5 space-y-2">
          {outstanding.map((item) => (
            <ReviewCard key={`${item.kind}:${item.id}`} item={item} />
          ))}
        </ul>
      )}

      {published.length > 0 && (
        <div className="mt-5">
          <PrintedRule />
          <div className="mt-2">
            <SectionHeading ink="text-ink-500">Recently printed</SectionHeading>
          </div>
          <ul className="mt-2.5 space-y-2">
            {published.map((item) => (
              <ReviewCard key={`${item.kind}:${item.id}`} item={item} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
