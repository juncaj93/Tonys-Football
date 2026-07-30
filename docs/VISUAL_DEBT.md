# Visual debt

**Standing commissioner ruling, 2026-07-30.** Minor, cosmetic, non-blocking polish issues are recorded here rather than lost. A defect too small to interrupt the current implementation is not too small to fix.

**This list should shrink over time, not grow forever.** An item that has sat here through three milestones is either not real or is not minor — decide which and either fix it or delete it with a reason.

Blocking defects do not belong here. They go to `VISUAL_ACCEPTANCE.md`'s gates, fail the build, and get fixed before the slice merges.

---

## How an item gets here

Visual QA finds something that is genuinely worth improving and genuinely not worth stopping for. Record it with:

- **where** — the route or component, and the width it shows at
- **what** — one sentence, specific enough to act on without re-finding it
- **why it waited** — so the next reader can judge whether that reason still holds
- **the screenshot**, when the run that found it is still in an artifact

---

## Open

| | Where | What | Why it waited |
|---|---|---|---|
| 1 | `/counter/collection`, empty state | Twenty-four unowned rows is roughly eight screens of scrolling for a manager who owns nothing. The shelf is correct — `18 §4` shows the whole catalog and set progress is a statement about the gap — but the *pacing* on day one is not reviewed. | The information is right; only the rhythm is in question, and changing it touches the ruling about showing the whole set. |
| 2 | Reveal plate, 360 | The collectible sits small and to the right of a plate that is now four lines tall. Legible, and not yet *composed* — the item should dominate more than its caption does. | Waiting on real collectible art. Judging focal weight against a placeholder carton means tuning to a shape that is about to change. |
| 3 | `/counter`, all widths | Three stacked cream panels read as a list of cards rather than as a counter. Less generic than it was, still not furniture. | The Collection and Showcase were the louder defects and shipped first. This is the next one down. |
| 4 | Tier rail, `/counter/collection` | `2/10` and the tier word are both display type at 10–13px. Legible and slightly cramped; the rail could breathe. | Cosmetic. The rail replaced two blocks and already bought a screen back. |
| 5 | Tony's dialogue | The order pad landed in #30 and reads as Tony's. The *timing* of its arrival and dismissal has never been reviewed against the reveal's timing — two transient things that must never compete (`MANDATE §6`). | Needs the reveal states, which only became photographable in #36. Now unblocked. |

## Closed

| | What | Closed by |
|---|---|---|
| — | `LEGENDARY` unreadable on cream — 2.24:1, on the plate at the centre of the milestone's biggest moment | #36, and now a build-failing gate |
| — | Common's rarity word at 3.42:1 on both grounds | #36 |
| — | Unowned collection spots reading as cards that failed to load | #35 |
| — | The Showcase wall as ten near-black rectangles | #35 |
| — | Set progress eating a third of the screen above the shelf | #35 |
| — | `ReturnPlate` labelled "back to the counter" while on `/counter` | #35 |
| — | The reveal ended at a label — no meaning, no set progress, no way to want another | #38 |
| — | The loop ended in a silent room: bare tray, no price on anything, nothing to do next | #38 |
