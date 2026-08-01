import { ENTRY_SIDE, fill } from "@/lib/stakes/copy";
import { type BoardItem, type Chalkboard } from "@/lib/stakes/chalkboard";

import { PickSide } from "@/components/counter/pick-side";

/**
 * The small sign beside Tony, and what opens out of it.
 *
 * ## The slate says one thing, and it says it without words
 *
 * The sign's usable slate is **37 × 59 room units** — about 45 × 72 CSS px on a
 * 390 phone. `objects.ts` measured it and ruled the object trigger-only: a
 * sentence does not fit there at any size worth reading, so the prediction lives
 * in the panel and the slate carries its *state*.
 *
 * That state is drawn the way a chalkboard in a pizza shop actually reads from
 * across a room — as marks, not as text:
 *
 * | | What is on the slate |
 * |---|---|
 * | **quiet** | two faint erased strokes. Residue. Nothing to say, said the way a used board says it |
 * | **written** | four chalk lines of uneven length under a heavier rule. Somebody has written something up |
 * | **settled** | the same writing, struck through — the way a board gets crossed off when the answer comes in |
 *
 * A manager cannot read the prediction from the room, and they were never meant
 * to. What they can tell at a glance is **whether there is anything to read**,
 * which is exactly what a Display's affordance is for — and it is the difference
 * between an object that looks quiet and one that looks unloaded, which is the
 * defect the wiped-slate treatment was introduced to fix.
 *
 * ## Only Doors glow
 *
 * `18 §3`, without exception. The written slate is **brighter chalk**, not a
 * glow: no drop-shadow, no pulse, no ring. It reads as a board somebody wrote on,
 * which is a change in the room rather than a signal from the interface.
 */

/** Two faint strokes. The residue of something erased. */
function QuietSlate() {
  return (
    <>
      <span className="h-[2px] w-full bg-paper-white/12" />
      <span className="h-[2px] w-[62%] bg-paper-white/10" />
    </>
  );
}

/**
 * Chalk writing, and a strike through it when the answer is in.
 *
 * Uneven line lengths on purpose. Four equal bars read as a loading skeleton —
 * the exact thing `VISUAL_ACCEPTANCE §4` says an empty or waiting surface must
 * never look like — and handwriting is never even.
 */
function WrittenSlate({ struck }: { struck: boolean }) {
  const stroke = struck ? "bg-paper-white/30" : "bg-paper-white/60";
  return (
    <>
      <span className={`h-[2px] w-[86%] ${stroke}`} />
      <span className={`h-[2px] w-[64%] ${stroke}`} />
      <span className={`h-[2px] w-[78%] ${stroke}`} />
      <span
        className={`h-[3px] w-[40%] ${struck ? "bg-amber-mid/35" : "bg-amber-mid/70"}`}
      />
      {struck && (
        <span className="pointer-events-none absolute inset-x-[8%] top-1/2 h-[2px] -rotate-[9deg] bg-paper-white/70" />
      )}
    </>
  );
}

/**
 * The slate itself, positioned by the caller.
 *
 * `aria-hidden`, like the board's painted face: the button beneath carries the
 * label and the panel carries the words, and a screen reader should not hear a
 * description of chalk marks on the way to the sentence they stand for.
 */
export function ChalkSlate({ board }: { board: Chalkboard }) {
  const item = board.prediction ?? board.market;
  const struck = item !== null && item.presentation === "resolved";

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex flex-col justify-center gap-[7%] overflow-hidden px-[14%]"
      data-chalk-state={board.quiet ? "quiet" : struck ? "settled" : "written"}
    >
      {board.quiet ? <QuietSlate /> : <WrittenSlate struck={struck} />}
    </div>
  );
}

/**
 * One thing on the board, inside the panel.
 *
 * ## Resolved and unresolved are different objects, not different colours
 *
 * A settled item leads with **the verdict** and carries the evidence under it; an
 * open one leads with the claim and says what it is waiting for. That is a change
 * of structure, so it survives at 360 and it survives being glanced at — the
 * requirement is *"resolved and unresolved states are visually distinct"*, and a
 * tint on the same layout is neither.
 *
 * ## Contrast
 *
 * Everything here is `ink` on `paper-mid`, which is the panel's own material.
 * Nothing is set on a light ground in a light colour — the failure this project
 * has now shipped four times, most recently as an entire section of headings in
 * `ink-900` on the dark room.
 */
/**
 * What each thing on the board is called.
 *
 * Three items can be on the board at once and two of them used to share an
 * eyebrow — the prediction and the bounty both read *"ON THE BOARD · WEEK 4"*,
 * which is a label that identifies the panel rather than the item in it. Found by
 * looking at the Slice's band with all three up, where it is unmissable and where
 * the top and bottom items were indistinguishable at a glance.
 *
 * Tony's own call and the league's open challenge are different offers made by
 * different people, and the eyebrow is the only place that says so.
 */
const KIND_LABELS: Readonly<Record<BoardItem["kind"], string>> = {
  CHALKBOARD: "Tony's call",
  TONYS_LINE: "Tony's Line",
  BOUNTY: "The bounty",
};

export function BoardEntry({
  item,
  /**
   * Whether this entry prints its own waiting line.
   *
   * False when the whole board is waiting for the same reason and the panel has
   * hoisted the sentence to a single footer. *"Nothing settled yet. Tuesday
   * tells."* printed twice in one small panel — under the prediction and again
   * under the market, four lines apart — reads as a component repeating itself
   * rather than as a shop saying one thing, and it was the loudest thing on the
   * screen when this was walked at 390.
   */
  showWaiting = true,
}: {
  item: BoardItem;
  showWaiting?: boolean;
}) {
  const settled =
    item.presentation === "resolved" || item.presentation === "expired";

  return (
    <div
      data-stake={item.stakeKey}
      data-stake-state={item.presentation}
      className="pb-1"
    >
      <p className="font-display text-[11px] leading-[1.4] tracking-[0.08em] text-ink-500 uppercase">
        {KIND_LABELS[item.kind]} · Week {String(item.week)}
      </p>

      {settled && item.copy.verdict !== null ? (
        <>
          <p className="mt-1.5 font-display text-[19px] leading-[1.25] text-red-dark">
            {item.copy.verdict}
          </p>
          <p className="mt-2 text-[17px] leading-[1.45] text-ink-700">
            {item.copy.line}
          </p>
          {item.copy.evidence !== null && (
            <p className="mt-2 border-t border-ink-100/60 pt-2 text-[15px] leading-[1.45] text-ink-500">
              {item.copy.evidence}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mt-1.5 text-[17px] leading-[1.5] text-ink-900">
            {item.copy.line}
          </p>
          {showWaiting && item.waiting !== null && (
            <p className="mt-2 text-[15px] leading-[1.45] text-ink-500">
              {item.waiting}
            </p>
          )}
        </>
      )}

      {item.entry !== null && (
        <p className="mt-2.5 text-[15px] leading-[1.45] text-ink-700">
          {/*
           * Their own pick, always shown once made — including after it settled.
           *
           * A market that forgets which side you took the moment it resolves has
           * taken away the only part of it that was yours.
           */}
          {fill(ENTRY_SIDE, { side: item.entry.side })}
          {item.entry.verdict === null ? "" : ` ${item.entry.verdict}`}
        </p>
      )}

      {item.canPick && item.stakeTokens !== null && (
        <PickSide stakeId={item.stakeId} stakeTokens={item.stakeTokens} />
      )}
    </div>
  );
}

/**
 * What the panel says when the board is wiped.
 *
 * The state a real manager meets today, and therefore the one that got the most
 * attention. It is **not** an error, a spinner or an apology: Tony has not
 * written anything up because there is nothing to write up, and the shop says so
 * in the shop's voice.
 *
 * It also invents nothing. `16 §12`: where a fact is unavailable it stays visibly
 * unavailable — and on a surface that would otherwise be asking somebody to
 * commit tokens, that rule is not negotiable.
 */
export function QuietBoard() {
  return (
    <p className="pb-1 text-[17px] leading-[1.5] text-ink-700">
      Tony hasn&rsquo;t called this one yet. He writes it up on Tuesday, with
      the paper.
    </p>
  );
}

/**
 * When every open item on the board is waiting for the same reason.
 *
 * The waiting sentence answers *"why is there no answer yet"*, and that is a
 * question about **the week**, not about each item on it — so when the answer is
 * the same for all of them it is said once, at the foot of the panel, where a
 * single note about the week belongs.
 *
 * Exported because the Slice's band has the same three items and the same
 * problem, and two implementations of one rule is how they end up disagreeing.
 */
export function sharedWaiting(items: readonly BoardItem[]): string | null {
  const open = items.filter(
    (item) =>
      item.presentation !== "resolved" && item.presentation !== "expired",
  );
  if (open.length < 2) return null;

  const lines = new Set(open.map((item) => item.waiting));
  const only = [...lines][0];
  return lines.size === 1 && only !== null && only !== undefined ? only : null;
}

/** The panel's body: everything on the board, or the quiet line. */
export function BoardPanel({ board }: { board: Chalkboard }) {
  if (board.quiet) return <QuietBoard />;

  const items = [board.prediction, board.market].filter(
    (item): item is BoardItem => item !== null,
  );
  const shared = sharedWaiting(items);

  return (
    <div className="space-y-4">
      {board.prediction !== null && (
        <BoardEntry item={board.prediction} showWaiting={shared === null} />
      )}
      {board.market !== null && (
        <div
          className={
            board.prediction === null
              ? ""
              : "border-t-2 border-dotted border-ink-100 pt-3.5"
          }
        >
          <BoardEntry item={board.market} showWaiting={shared === null} />
        </div>
      )}
      {shared !== null && (
        <p className="border-t border-ink-100/60 pt-2.5 text-[15px] leading-[1.45] text-ink-500">
          {shared}
        </p>
      )}
    </div>
  );
}
