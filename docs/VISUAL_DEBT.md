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
| 1 | `/counter/collection`, empty state | Roughly two screens of scroll for a manager who owns nothing. Now photographed (`demo-collection-empty`) and the pacing is defensible — the earlier note's "eight screens" was an estimate, not a measurement. Left open only as a question of *rhythm*, not of legibility. | The information is right and now readable; changing the length touches `18 §4`'s ruling that the whole catalog is shown. |
| 2 | Reveal plate, all widths | The collectible is 46 units against a plate that is now six or seven rows tall. It is on the plate's axis and standing on it, so it no longer reads as accidental — but the *caption still outweighs the thing it captions*. | Waiting on real collectible art. All 24 items are `art_status: placeholder`, so tuning focal weight now means tuning to a tagged parcel that is about to be replaced by 24 different silhouettes. |
| 3 | Tony's dialogue | The order pad landed in #30 and reads as Tony's. The *timing* of its arrival and dismissal has never been reviewed against the reveal's timing — two transient things that must never compete (`MANDATE §6`). | Needs the reveal states, which only became photographable in #36. Now unblocked. |
| 4 | `/back-hall`, all widths | *"Don't worry about it."* — the whole reveal of the Underground — is set at **9px** in `amber-mid/70` on cream, and the destination body copy at **15px**. Both are under the 16–18px floor (`MANDATE §6`), and the nine-pixel line is close to unreadable at real size. A line nobody can read is not atmospheric; it is absent. | Nothing blocks it. Small enough to fold into any slice that touches this route, and recorded rather than done because it would have interrupted Batch B. `docs/BACK_HALL_BOUNDARY.md §7.2`. |
| 5 | `/back-hall`, all widths | The Back Hall is three stacked `PixelPanel`s with headings — *"a menu card"* almost exactly as `18 §5` forbids. The spec's shape is one compact pixel-art scene with two environmental choices. | **Blocked on art.** `zone_back_hall_shell` and its four overlays are placeholders, and building the scene against placeholders means building it twice. The panels are the correct interim; recorded so the interim is not mistaken for the design. `docs/BACK_HALL_BOUNDARY.md §7.1`. |

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
| — | The collectible stood on the right-hand quarter of its own nameplate — the tray's centre is 43 units right of the room's, and only a screenshot showed it | #40, and now pinned in `objects.test.ts` |
| — | The offer was `ANOTHER — 50` beside a link: a price next to a button, which is a store | #40 — Tony says it |
| — | The tier rail stacked a 10px word and a 13px count two pixels apart in a 52px cell — four readable controls reading as one dense block | #42 — 56px, `gap-1`, count at 14px; no type shrank |
| — | Tony repeating "first one's free" to a manager who had just opened it — the per-day greeting cache outliving the moment that selected the line | #41 — the repeat re-checks its tags |
| — | Twenty-four unowned shelf names at 14px / 55% cream written straight onto the parlor art — legible over the booths, close to invisible over the counter's checker. The first screen of the shelf for anybody who owns nothing | #40 — 15px at 80% with a hard one-pixel outline, no card |
| — | `/counter` as three identical stacked cream cards — one of them repeating the sentence three lines above it | #40 — one panel for the one thing you can act on; the rest is printed on the counter |
| — | Nine `reveal-*` states photographed a calm room and the run reported **passed**; the rarity-contrast gate was measuring nothing | #40 — the server was missing `DEMO_FIXTURES`, and `checkRevealPresent` now fails an empty reveal |
