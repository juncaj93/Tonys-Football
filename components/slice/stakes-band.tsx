import { BoardEntry, sharedWaiting } from "@/components/scene/chalkboard";
import { MountedSheet, PrintedRule } from "@/components/scene/text-surface";
import { TYPE } from "@/lib/design/type";
import { type BoardItem, type Chalkboard } from "@/lib/stakes/chalkboard";

/**
 * The week's stakes, printed under the paper.
 *
 * `16 §38` puts all three here — *"the Slice ... plus this week's Tony's Line,
 * any open bounty, and Tony's chalkboard prediction"*. The parlor's small sign
 * carries the prediction and the market (`18 §3.4`); **the bounty has no other
 * surface**, which is why this is a band rather than a duplicate.
 *
 * ## It is not part of the newspaper, and the separation is load-bearing
 *
 * The `Edition` pipeline's guarantee is that everything inside it is finalized —
 * every number came off a closed season and through the validator against a
 * packet. A stake is a claim about something that **has not happened yet**, so
 * folding it into `Edition` would put an unsettled sentence inside the one
 * structure whose whole point is that it cannot contain one.
 *
 * So it is a separate band, printed below the sheet, with its own material and
 * its own rule. It still goes through the same validator — `renderStake` refuses
 * anything the Slice's own checker will not pass — which is the property that
 * mattered, without the structural conflation that would have got it for free.
 *
 * ## Nothing here when there is nothing
 *
 * A quiet board and no bounty renders **no band at all**, not an empty one. The
 * rack in July is a rack in July; a heading over a blank rectangle is the exact
 * *"component that failed to load"* look `VISUAL_ACCEPTANCE §4` rules out.
 */
export function StakesBand({
  board,
  bounty,
  marker,
}: {
  board: Chalkboard;
  bounty: BoardItem | null;
  /** Which named demo state produced this, when one did. The driver reads it. */
  marker?: string | undefined;
}) {
  const items = [board.prediction, board.market, bounty].filter(
    (item): item is BoardItem => item !== null,
  );

  if (items.length === 0) return null;

  const shared = sharedWaiting(items);

  return (
    <div className="mt-7" data-stakes-band={marker}>
      <MountedSheet className="px-4 pt-3.5 pb-4">
        <PrintedRule weight="heavy" />
        <h2 className={`mt-2.5 text-center ${TYPE.sectionHeading} text-red-dark`}>
          On the board this week
        </h2>
        <div className="mt-2.5">
          <PrintedRule weight="heavy" />
        </div>

        <div className="mt-4 space-y-4">
          {items.map((item, index) => (
            <div
              key={item.stakeKey}
              className={
                index === 0
                  ? ""
                  : "border-t-2 border-dotted border-ink-900/25 pt-4"
              }
            >
              <BoardEntry
                item={item}
                /* Tony's record belongs to Tony's call, not to the market or the bounty. */
                record={item.kind === 'CHALKBOARD' ? board.record : null}
                showWaiting={shared === null}
              />
            </div>
          ))}
          {/*
            * One note about the week, at the foot of the band.
            *
            * All three items are usually waiting for the same reason — the week
            * has not been played — and printing *"Nothing settled yet. Tuesday
            * tells."* three times down one panel reads as a component repeating
            * itself. `sharedWaiting` hoists it only when every open item agrees.
            */}
          {shared !== null && (
            <p className={`border-t border-ink-900/20 pt-3 ${TYPE.bodyCompact} text-ink-500`}>
              {shared}
            </p>
          )}
        </div>
      </MountedSheet>
    </div>
  );
}
